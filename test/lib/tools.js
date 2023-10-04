const { access, copyFile, lstat, rename } = require('fs/promises')
const path = require('path')

// Because this module uses file-tools in support of testing, its exports
// should not be used until the test suite for file-tools is run.
const ft = require('../../lib/file-tools')
const {
  targetVersion: EXPECTED_NPM_VER,
  targets: TGTS,
  backupFlag: BAKFLAG,
  errorCodes: ERRS
} = require('../../lib/constants')

module.exports.copyFreshMockNpmDir = function(where) {
  const sourcePath = path.resolve(__dirname, '..', 'fixtures', 'mock-npm')
  return ft.graft(sourcePath, where)
  .then(() => {
    const startDir = process.cwd()
    process.chdir(where)
    return rename('mock-npm', 'npm')
    .then(() => process.chdir(startDir))
    .catch(err => {
      process.chdir(startDir)
      throw err
    })
  })
}

module.exports.verifyInstallation = function(where) {
  where = path.join(where, 'lib')

  function iterateBackupsAndOriginals(i) {
    if (i >= TGTS.CHANGED_FILES.length) return Promise.resolve()
    const bakItem = `${TGTS.CHANGED_FILES[i]}${BAKFLAG}.js`
    const origItem = `${TGTS.CHANGED_FILES[i]}.js`
    return lstat(path.join(where, bakItem)).then(st => {
      if (!st.isFile()) throw new Error(`Expected ${bakItem} to be a file`)
    })
    .then(() => lstat(path.join(where, origItem)))
    .then(st => {
      if (!st.isFile()) throw new Error(`Expected ${origItem} to be a file`)
    })
    .then(() => iterateBackupsAndOriginals(i+1))
  }

  function iterateAddedFiles(i) {
    if (i >= TGTS.ADDED_FILES.length) return Promise.resolve()
    const item = TGTS.ADDED_FILES[i] + '.js'
    return lstat(path.join(where, item)).then(st => {
      if (!st.isFile()) throw new Error(`Expected ${item} to be a file`)
    })
    .then(() => iterateAddedFiles(i+1))
  }

  function iterateAddedDirs(i) {
    if (i >= TGTS.ADDED_DIRS.length) return Promise.resolve()
    const item = TGTS.ADDED_DIRS[i]
    return lstat(path.join(where, item)).then(st => {
      if (!st.isDirectory()) throw new Error(`Expected ${item} to be a directory`)
    })
    .then(() => iterateAddedDirs(i+1))
  }
  // TODO: should we recurse into added dirs, just in case?

  return iterateBackupsAndOriginals(0)
  .then(() => iterateAddedFiles(0))
  .then(() => iterateAddedDirs(0))
}

module.exports.verifyNoInstallTraces = function(where) {
  where = path.join(where, 'lib')

  function iterateBackupsAndOriginals(i) {
    if (i >= TGTS.CHANGED_FILES.length) return Promise.resolve()
    const bakItem = `${TGTS.CHANGED_FILES[i]}${BAKFLAG}.js`
    const origItem = `${TGTS.CHANGED_FILES[i]}.js`
    return access(path.join(where, bakItem))
    .then(() => { throw new Error(`Leftover backup ${bakItem} found`) })
    .catch(err => { if (err.code != 'ENOENT') throw err })
    .then(() => lstat(path.join(where, origItem)))
    .then(st => {
      if (!st.isFile()) throw new Error(`Expected ${origItem} to be a file`)
    })
    .then(() => iterateBackupsAndOriginals(i+1))
  }

  function iterateAddedFiles(i) {
    if (i >= TGTS.ADDED_FILES.length) return Promise.resolve()
    const item = TGTS.ADDED_FILES[i] + '.js'
    return access(path.join(where, item))
    .then(() => { throw new Error(`Leftover file ${item} found`) })
    .catch(err => { if (err.code != 'ENOENT') throw err })
    .then(() => iterateAddedFiles(i+1))
  }

  function iterateAddedDirs(i) {
    if (i >= TGTS.ADDED_DIRS.length) return Promise.resolve()
    const item = TGTS.ADDED_DIRS[i]
    return access(path.join(where, item))
    .then(() => { throw new Error(`Leftover directory ${item} found`) })
    .catch(err => { if (err.code != 'ENOENT') throw err })
    .then(() => iterateAddedDirs(i+1))
  }
  // TODO: should we recurse into added dirs, just in case?

  return iterateBackupsAndOriginals(0)
  .then(() => iterateAddedFiles(0))
  .then(() => iterateAddedDirs(0))
}
