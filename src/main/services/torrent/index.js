import WebTorrent from 'webtorrent'
import { extname } from 'path'
import { readFileSync } from 'fs'
import { BrowserWindow, app } from 'electron'
import MatroskaSubtitles from 'matroska-subtitles'
import { finished } from 'stream'

import { localFiles } from '../../externals'
import { eventsList } from 'vendor'
import cleanTorrents from './format'
import { save, load } from './storage'
import { Logger } from '../../utils'

const logger = new Logger('Torrent')

const events = eventsList.torrent
const videoEvents = eventsList.video

// TODO Limit download speed, check https://github.com/webtorrent/webtorrent/issues/163

const peersMap = {}
let client = null
let infoIntervalID = null
let streamServer = null
let subtitleStream = null
let subIntervalId = null

function pauseTorrent (torrent, magnet) {
  // Only stops connection to new peers, must delete all existing peers now
  torrent.pause()

  // Removing all connected peers
  Object.keys(torrent._peers).forEach((peerId) => {
    if (!peersMap[magnet]) peersMap[magnet] = []

    peersMap[magnet].push(peerId)

    torrent.removePeer(peerId)
  })
}

app.on('quit', () => {
  client && save(client)
})

app.once('ready', () => load(init))

const isClientDestroyed = () => !client || (client && client.destroyed)

function init () {
  if (isClientDestroyed()) {
    client = new WebTorrent()
    logger.info('Instanciated torrent client.')

    // Setting up all listeners
    client.on('torrent', (torrent) => {
      logger.info(`${torrent.infoHash} is ready to be used.`)
    })

    client.on('error', (err) => {
      logger.error('Client encountered an error.', err)
    })

    // Sending client information to windows every second
    if (!infoIntervalID) {
      infoIntervalID = setInterval(() => {
        BrowserWindow.getAllWindows().forEach(
          (win) => win.webContents.send(events.info.success, info())
        )
      }, 1000)
    }
  } else {
    logger.info('Torrent client already instanciated.')
  }

  return client
}

function add (event, { magnet, path }) {
  if (isClientDestroyed()) {
    init()
  }

  client.add(magnet, { path }, (torrent) => {
    logger.info(`Added ${torrent.infoHash}.`)
    event.sender.send(events.add.success)
  })
}

function remove (event, magnet) {
  if (isClientDestroyed()) {
    event.sender.send(events.destroy.error)
    return
  }

  // If it comes from streaming, we have to close the streams
  streamServer && streamServer.close()
  subtitleStream = null
  subIntervalId && clearInterval(subIntervalId)
  subIntervalId = null

  // Be careful calling this one.
  magnet = (extname(magnet) === '.torrent' && readFileSync(magnet)) || magnet

  client.remove(magnet, (err) => {
    err
      ? logger.error(`Error while removing ${magnet}`, err)
      : logger.info(`Removed magnet to torrent: ${magnet}`)

    if (!client.torrents.length) {
      clearInterval(infoIntervalID)
      infoIntervalID = null

      client.destroy((err) => {
        err
          ? logger.error('Could not destroy client.', err)
          : logger.info('Successfully destroyed client.')
      })
    }
  })
}

function info (event) {
  if (isClientDestroyed()) {
    if (!event) return

    event.sender.send(events.info.success, null)
    return
  }

  const result = {
    client: {
      downloadSpeed: client.downloadSpeed,
      uploadSpeed: client.uploadSpeed,
      ratio: client.ratio,
      progress: client.progress,
      nbTorrents: client.torrents.length
    },
    torrents: cleanTorrents(client.torrents) || []
  }

  if (!event) return result
  event.sender.send(events.info.success, result)
}

function actOnTorrent (event, { magnet, action }) {
  // Running this implies that there is a client.
  const _torrent = client.get(magnet)

  switch (action) {
    case 'resume':
      // Reconnecting old torrent
      _torrent.resume()

      // Reconnecting peers
      if (peersMap[magnet]) {
        peersMap[magnet].forEach((peerId) => _torrent.addPeer(peerId))
      }

      break

    case 'pause':
      pauseTorrent(_torrent, magnet)

      break

    case 'destroy':
      pauseTorrent(_torrent, magnet)
      remove(event, magnet)

      break

    default:
      break
  }

  _torrent[action]()

  event.sender.send(events.act.success)
}

function play (event, { link: id, name }) {
  if (isClientDestroyed()) init()

  const isFile = !/^magnet/.test(id)
  const torrent = client.get(id)

  function createServers (torrent) {
    streamServer = torrent.createServer({
      hostname: 'localhost'
    })

    streamServer.listen()
    const address = streamServer.address()

    logger.info(`Created video server for ${id} at ${address.port}`)

    event.sender.send(events.play.success, { torrent: id, name: name || torrent.name, port: `${address.port}/0` })
  }

  if (!torrent) {
    const { config: { torrentClient: { streamingPath } } } = localFiles.getFile('config.json')
    client.add(isFile ? readFileSync(id) : id, { path: streamingPath }, createServers)
  } else {
    torrent.ready
      ? createServers(torrent)
      : torrent.once('ready', () => createServers(torrent))
  }
}

function streamSubs (event, id) {
  if (isClientDestroyed()) return

  const torrent = client.get(id)
  if (!torrent) return

  const parser = new MatroskaSubtitles()

  parser.once('tracks', (tracks) => {
    event.sender.send(videoEvents.tracks.success, tracks)
  })

  parser.on('subtitle', (subtitle, trackNumber) => {
    event.sender.send(videoEvents.subtitles.success, { subtitle, trackNumber })
  })

  subIntervalId && clearInterval(subIntervalId)

  const stream = () => {
    const _torrent = client.get(id)

    if (!_torrent || torrent.destroyed) return

    subtitleStream = _torrent.files[0].createReadStream()
    subtitleStream.pipe(parser)
  }

  const createStream = () => {
    stream()

    subIntervalId = setInterval(() => {
      if (subtitleStream) {
        finished(subtitleStream, (err) => {
          if (err) console.error(err)

          stream()
        })
      }
    }, 300)
  }

  torrent.ready
    ? createStream()
    : torrent.once('ready', () => createStream())
}

export default [
  { eventName: events.add.main, handler: add },
  { eventName: events.destroy.main, handler: remove },
  { eventName: events.act.main, handler: actOnTorrent },
  { eventName: events.info.main, handler: info },
  { eventName: events.play.main, handler: play },
  { eventName: events.subs.main, handler: streamSubs }
]
