import Velocity from 'velocity-animate'
import { alignment, alignDir, percent } from './utils.js'

const re = {
  delimiter: /{.*?}/,
  newline: /\\N/g,
  bold: {
    start: {
      from: /\\b1/g,
      to: '<b>'
    },
    end: {
      from: /\\b0/g,
      to: '</b>'
    }
  },
  italic: {
    start: {
      from: /\\i1/g,
      to: '<i>'
    },
    end: {
      from: /\\i0/g,
      to: '</i>'
    }
  },
  underline: {
    start: {
      from: /\\u1/g,
      to: '<u>'
    },
    end: {
      from: /\\u0?/g,
      to: '</u>'
    }
  },
  strike: {
    start: {
      from: /\\s1/g,
      to: '<strike>'
    },
    end: {
      from: /\\s0/g,
      to: '</strike>'
    }
  },
  font: {
    name: /(\\fn.+(?=\\)|\\fn.+(?=}))/g,
    size: /\\fs\s?[0-9]{1,3}/g
  },
  color: /\\\d?c(&H[0-9A-Za-z]{2,6}&)?/,
  alignment: /\\an?\d{1,2}/g,
  fade: /\\fad\(\d*\.?\d+,\d*\.?\d+\)?/,
  pos: /\\pos\(\d*\.?\d+,\d*\.?\d+\)?/,
  rot: /\\fr(x|y|z)?\d{1,3}/,
  hardSpace: /\\h/g,
  notSupported: [
    /\\(x|y)?bord\d/g, // I don't get this
    /\\(x|y)?shad\d/g,
    /\\be\d/g, /\\blur\d/g,
    /\\fsc(x|y)\d/g, // Can be supported but oh well
    /\\fsp\d/g, // Letter spacing, i'm just lazy
    /\\fa(x|y)\d/g,
    /\\fe\d/,
    /\\(\da|alpha)&H(.*?)&/g, // Alpha
    /\\k(f|o)?\d{1,5}/ig, // Karaoke
    /\\q\d/g,
    /(\\r(.*?)(?=\(\)|\}|\\)|\\r(.*?)(?=}))/, // Could be handled but rarely used
    /\\move\((.*?)[)}\\]/g,
    /\\org\((.*?)[)}\\]/g,
    /\\t\((.*?)[)}\\]/g,
    /\\i?clip\((.*?)[)}\\]/g,
    /\\p\d(.*?)\\p\d/g,
    /\\pbo-?\d/g
  ]
}

// Need to clean up unsupported tags.
const clean = (string) => {
  re.notSupported.forEach((_re) => {
    string = string.replace(_re, '')
  })

  return string
}

const handleHardSpace = (string) => {
  return string.replace(re.hardSpace, '&nbsp;')
}
const handleNewline = (string) => {
  return string.replace(re.newline, '<br>')
}

const handleFontSize = (string, info) => {
  const fontType = re.font.size.test(string) && string.match(re.font.size)[0]

  if (fontType) {
    const { PlayResY: resY } = info
    const size = fontType.slice(3) / resY

    return size
  }

  return null
}

const handleColor = (string, cue) => {
  const colorTag = re.color.test(string) && string.match(re.color)[0]
  const { clientHeight } = document.getElementsByTagName('video')[0]
  let cssStyle = document.head.children[document.head.childElementCount - 1]

  if (colorTag) {
    const isPrimary = colorTag[1] === '1' || colorTag[1] === 'c'
    const color = colorTag.replace(/\\\d?c/g, '').slice(2, 8)
    const r = color.slice(4, 6)
    const g = color.slice(2, 4)
    const b = color.slice(0, 2)
    const hexColor = `#${r}${g}${b}`
    const className = color
    let type = 'p'

    if (isPrimary) {
      cssStyle.appendChild(document.createTextNode(`.${type}${className} { color: ${hexColor} !important; }`))
    } else {
      const _type = colorTag[1]

      if (_type === '2' || _type === '4') return null

      if (_type === '3') {
        const { thickness = 0.0075 } = cue.outline
        const color = `0 0 ${1.8 * thickness * clientHeight * 2}px ${hexColor}, `.repeat(8).slice(0, -2)
        type = 'ts'

        cssStyle.appendChild(document.createTextNode(`.${type}${className} { text-shadow: ${color} !important; }`))
      }
    }

    return `<span class="${type}${className}">`
  }

  return null
}

const handleFade = (string, cue) => {
  if (re.fade.test(string)) {
    const fadeTag = string.match(re.fade)[0]
    const result = {}

    // We can handle only appearing fade animation atm.
    // The time is in ms, we need it in seconds.
    const inDuration = +fadeTag.split(',')[0].replace('\\fad(', '')
    const outDuration = +fadeTag.split(',')[1].replace(')', '')

    // So if idea is to trigger a show property so that a Vue transition
    // can be instanciated. Velocity will help us make the fade effect.
    result.hasAnimation = true
    result.show = false

    // As the fade out effect has to be finished before the end of the cue,
    // we can simply remove its duration from the cue's end time.
    result.end = cue.end - outDuration / 1000

    result.beforeEnter = (el) => {
      el.style.opacity = 0
    }

    result.enter = (el, done) => {
      Velocity(el, { opacity: 1 }, { duration: inDuration, complete: done })
    }

    result.leave = (el, done) => {
      const complete = () => {
        done()

        // We need to re-hide the cue on leave so that the show can
        // still be triggered if the user rewinds the player.
        result.show = false
      }

      Velocity(el, { opacity: 0 }, { duration: outDuration, complete })
    }

    return result
  }

  return null
}

const handlePos = (string, style, info) => {
  const { PlayResX: resX, PlayResY: resY } = info
  const result = {}

  if (re.pos.test(string)) {
    const posTag = string.match(re.pos)[0]

    // This will serve as backup is no alignment tag is present.
    let alignment_ = +style.Alignment

    // If there is an alignement tag, it should matter.
    if (re.alignment.test(string)) {
      const alignTag = string.match(re.alignment)[0]

      const isNumpad = alignTag[2] === 'n'

      alignment_ = isNumpad
        ? +alignTag.replace('\\an', '')
        : alignment.ssaToNumpad[+alignTag.slice(2, 4)]
    }

    const xy = posTag.replace('\\pos(', '').replace(')', '').split(',')
    const x = Math.round((xy[0] / resX) * 100)
    const y = Math.round((xy[1] / resY) * 100)

    // Horizontal
    if (alignDir.middle.includes(alignment_)) result.align = -50

    result.horiz = alignDir.right.includes(alignment_)
      ? 'right'
      : 'left'

    result.position = x

    // Vertical
    if (alignDir.vCenter.includes(alignment_)) result.vAlign = 50

    result.vert = alignDir.top.includes(alignment_)
      ? 'top'
      : 'bottom'

    result.line = y

    return string
  }

  return null
}

const handleRotation = (string) => {
  if (re.rot.test(string)) {
    const result = {}
    const rotateTag = string.match(re.rot)[0]
    let axis = rotateTag.replace('\\fr', '').slice(0, 1)

    if (!isNaN(+axis)) {
      // According to the specs, if no axis is specified,
      // the fallback axis should be z.
      axis = 'z'
    }

    const degrees = rotateTag.replace(`\\fr${axis}`, '')

    result.rotate = ` rotate${axis.toUpperCase}(${-+degrees}deg)`

    return result
  }

  return null
}

const handleAlignment = (string, style, info) => {
  const alignmentTag = re.alignment.test(string) && string.match(re.alignment)[0] // Only the first tag matters

  if (alignmentTag) {
    const result = {}
    const isNumpad = alignmentTag[2] === 'n'

    const align = isNumpad
      ? +alignmentTag[3] // tag === '\an<number>, 1 <= number <= 9
      : alignment.ssaToNumpad[+alignmentTag.slice(2, 4)] // tag === '\a<number>, 1 <= number <= 11

    const { MarginR: mR, MarginL: mL, MarginV: mV } = style
    const { PlayResX: resX, PlayResY: resY } = info

    const left = percent(mL, resX)
    const right = percent(mR, resX)
    const vert = percent(mV, resY)

    // Horizontal
    if (alignDir.middle.includes(align)) {
      result.position = (left + 100 - right) / 2
      result.horiz = 'left'
      result.align = -50
      result.textAlign = 'center'
    } else {
      const isLeft = alignDir.left.includes(align)
      result.position = isLeft ? left : right
      result.horiz = isLeft ? 'left' : 'right'
      result.align = 0
      result.textAlign = result.horiz
    }

    // Vertical
    if (alignDir.vCenter.includes(align)) {
      result.vAlign = 50
      result.vert = 'bottom'
      result.line = 50
    } else {
      result.vAlign = 0
      result.line = vert
      result.vert = alignDir.top.includes(align) ? 'top' : 'bottom'
    }

    return result
  }

  return null
}

const getEnclosedTags = (string) => {
  const enclosedTags = []

  let missingLength = 0

  while (re.delimiter.test(string)) {
    const tags = string.match(re.delimiter)[0]
    const index = string.indexOf(tags)

    // We keep index but remove delimiters from tag
    enclosedTags.push({ tags, index: index + missingLength })

    // then we have to remove it from string
    string = string.slice(0, index) + string.slice(index + tags.length)
    missingLength += tags.length
  }

  return { enclosedTags, clearedString: string }
}

const handleEnclosedTags = (enclosedTags, cue, style, info) => {
  const cueStyle = {}
  let addedLength = 0

  return enclosedTags.map(({ tags, index }, k) => {
    // Removing unsupported tags
    let string = clean(tags)

    // Handling common tags
    const types = ['bold', 'italic', 'underline', 'strike']
    types.forEach((type) => {
      const _re = re[type]
      const isStart = string.match(_re.start.from)
      const isEnd = string.match(_re.end.from)

      if (!isStart && !isEnd) return

      let tag = isStart
        ? _re.start.to
        : _re.end.to

      index += addedLength
      cue.text = cue.text.slice(0, index) + tag + cue.text.slice(index)
      addedLength += tag.length - string.length
    })

    // Font
    Object.assign(cueStyle, handleFontSize(string, info))

    // Color
    const colorTag = handleColor(string, cue) || undefined

    // Animations
    Object.assign(cueStyle, handleFade(string, cue))

    // Position things
    Object.assign(cueStyle, handlePos(string, style, info))
    Object.assign(cueStyle, handleRotation(string))
    Object.assign(cueStyle, handleAlignment(string, style, info))

    return {
      colorTag,
      index,
      cueStyle
    }
  })
}

export default function (cue, style, info) {
  let string = handleHardSpace(cue.text)
  string = handleNewline(string)

  // Finding enclosed tags and keeping track of indexes
  const { enclosedTags, clearedString } = getEnclosedTags(string)
  string = cue.text = clearedString

  // Treating those tags
  const handledTags = handleEnclosedTags(enclosedTags, cue, style, info)

  handledTags
    .forEach(({ index, colorTag, cueStyle }, k) => {
      if (colorTag) {
        string = string.slice(0, index) + colorTag + string.slice(index)
        cue.text = string

        if (k !== handledTags.length - 1) {
          handledTags[k + 1].index += index + colorTag.length - (k + 1)
        }
      }

      cue = {
        ...cue,
        ...cueStyle
      }
    })

  return cue
}
