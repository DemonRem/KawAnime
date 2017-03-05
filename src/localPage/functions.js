/**
 * Created by Kylart on 04/03/2017.
 *
 * In this file, all the functions needed by the local page
 * are present. This is for cleaner code.
 *
 */

const self = this

// This will later be set with the config file
const downloadRep = 'Downloads'

const fs = require('fs')
const path = require('path')
const os = require('os')
const shell = require('electron').shell
const {dialog} = require('electron').remote

const mal = require('malapi').Anime

exports.DIR = path.join(os.userInfo().homedir, downloadRep)

exports.filterFiles = (files, filters) => {
  let filteredFiles = []

  for (let filter in filters)
  {
    files.forEach((file) => {
      if (path.extname(file) === filters[filter])
        filteredFiles.push(file)
    })
  }

  return filteredFiles
}

exports.byProperty = (prop) => {
  return function (a, b) {
    if (typeof a[prop] == "number")
    {
      return (a[prop] - b[prop])
    }
    return ((a[prop] < b[prop]) ? -1 : ((a[prop] > b[prop]) ? 1 : 0))
  }
}

// This function works only if the file is named this way:
// [FANSUB] <NAME> <-> <EP_NUMBER> <EXTENSION_NAME>
exports.searchAnime = (filename, object) => {
  let epNumber = 0
  const initFilename = filename

  filename = filename.split(' ')
  for (let i = 0; i < 3; ++i) i === 1 ? epNumber = filename.pop()
                                      : filename.pop()

  filename = filename.slice(1).join(' ')

  let result = {
    title: filename,
    episode: epNumber,
    filename: initFilename
  }

  mal.fromName(filename).then((anime) => {
    result.picture = anime.image
    result.synopsis = anime.synopsis.slice(0, 170) + '...'
    result.numberOfEpisodes = anime.episodes.replace('Unknown', 'NC')
    result.status = anime.status
    result.year = anime.aired.split(' ')[2]
    result.genres = anime.genres.join(', ')
    result.classification = anime.classification
    result.mark = anime.statistics.score.value

    object.files.push(result)
    object.files.sort(self.byProperty('title'))
  })
}

exports.findFiles = (object, dir) => {
  const allFiles = fs.readdirSync(dir)

  const filteredFiles = self.filterFiles(allFiles, ['.mkv', '.mp4'])

  filteredFiles.forEach((file) => {
    self.searchAnime(file, object)
  })
}

exports.playFile = (name) => {
  shell.openItem(path.join(self.DIR, name))
}

exports.delFile = (object, name) => {
  const namePath = path.join(self.DIR, name)

  fs.unlink(namePath, () => {
    console.log(`${name} was deleted.`)

    // Looking for that file in object.files
    for (let i = 0; i < object.files.length; ++i)
      if (object.files[i].filename === name) object.files.splice(i, 1)
  })
}

exports.changePathDialog = (object) => {
  // TODO: Find a way to catch TypeError on escape press of Dialog.
  dialog.showOpenDialog({properties: ['openDirectory']}, (dirPath) => {
    object.files = []
    object.currentDir = dirPath[0]
    self.findFiles(object, dirPath[0])
  })
}

// TODO: make an initial findFiles method