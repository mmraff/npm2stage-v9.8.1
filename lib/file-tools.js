/*
  NOTE concerning needs of npm-two-stage install:
  Currently we only have flat directories to add;
  but nested directories in the future are conceivable.

  XXX: fs.readdir option withFileTypes added in node.js v10.10.0.
  When we update this for that, we won't need to use lstat
  BUT we will have non-trivial refactoring to do
*/
const Emitter = require('events')
const {
  copyFile, lstat, mkdir, readdir, rmdir, unlink
} = require('fs/promises')
const { COPYFILE_EXCL } = require('fs').constants
const path = require('path')

let emitter
module.exports.setEmitter = function(o) {
  if (o === undefined || o === null)
    throw new SyntaxError('No argument given')
  if (o instanceof Emitter) return emitter = o
  throw new TypeError('Given argument is not an Emitter')
}

// Copy everything in src into dest
// * assumes both src and dest are existing directories
// * recursive descent
function copyEntries(src, dest) {

  function nextEntry(offset, list, i) {
    if (i >= list.length) return Promise.resolve()
    const item = list[i]
    const srcItemPath = path.join(src, offset, item)
    return lstat(srcItemPath).then(srcStats => {
      const target = path.join(dest, offset, item)
      let p
      if (srcStats.isDirectory())
        p = readdir(srcItemPath).then(entries =>
          mkdir(target)
          .then(() => nextEntry(path.join(offset, item), entries, 0))
        )
      else {
        /* istanbul ignore else */
        if (srcStats.isFile())
          p = copyFile(srcItemPath, target, COPYFILE_EXCL)
        else {
          p = Promise.resolve()
          if (emitter)
            emitter.emit('msg',
              `Not a regular file or a directory, omitting ${srcItemPath}`
            )
        }
      }
      return p.then(() => nextEntry(offset, list, i+1))
    })
  }

  return readdir(src)
  .then(entries => nextEntry('', entries, 0))
}

function getEmptyArgError(name) {
  return new SyntaxError(`${name} argument must not be empty`)
}

// cp case: copy directory src into directory dest
module.exports.graft =
function graft(src, dest) {
  if (src === undefined || src === null || src === '')
    return Promise.reject(getEmptyArgError('Source'))
  if (dest === undefined || dest === null || dest === '')
    return Promise.reject(getEmptyArgError('Destination'))
  let newPath
  try { newPath = path.join(dest, path.basename(src)) }
  catch (err) { return Promise.reject(err) }
  let mkdirSucceeded = false
  return mkdir(newPath).then(() => {
    mkdirSucceeded = true
    return copyEntries(src, newPath)
  })
  .catch(err => {
    if (mkdirSucceeded)
      return prune(newPath).then(() => { throw err })
    throw err
  })
}

// rm case: all the items on list are expected to be regular files.
// if not absolute, assume each path is relative to current directory.
module.exports.removeFiles =
function removeFiles(list) {
  if (list === undefined || list === null)
    return Promise.reject(new SyntaxError('Path list must be given'))
  if (!(list instanceof Array))
    return Promise.reject(new TypeError('Path list must be an array'))
  for (let i = 0; i < list.length; ++i)
    if (typeof list[i] != 'string')
      return Promise.reject(new TypeError('Path list can only contain strings'))

  function nextFile(i) {
    if (i >= list.length) return Promise.resolve()
    return unlink(list[i])
    .catch(err => {
      if (err.code != 'ENOENT') throw err
      /* istanbul ignore next */
      if (emitter)
        emitter.emit('msg', `Could not find file ${list[i]} for removal`)
    })
    .then(() => nextFile(i+1))
  }
  return nextFile(0)
}

// rm case: the kind of each item on list must be discovered before removal
function removeEntries(offset, list, i) {
  if (i >= list.length) return Promise.resolve()
  const item = list[i]
  const itemPath = path.join(offset, item)
  return lstat(itemPath).then(stats => {
    const p = stats.isDirectory() ? prune(itemPath) : unlink(itemPath)
    return p.then(() => removeEntries(offset, list, i+1))
  })
}

// rm case: given item is expected to be a directory
function prune(dir) {
  if (dir === undefined || dir === null || dir === '')
    return Promise.reject(getEmptyArgError('Target directory'))
  return readdir(dir)
  .then(entries => removeEntries(dir, entries, 0))
  .then(() => rmdir(dir))
}
module.exports.prune = prune
