const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs'))
const _ = require('lodash')

const totalSize = directory => Promise.map(fs.readdirAsync(directory),
    (file) => new Promise((resolve, reject) => {
        fs.lstat(directory + '/' + file, (err, stats) => {
            if (err) {
                reject(err)
            }
            resolve({
                path: file,
                stats: stats
            })
        })
    })).reduce((total, file) => {
    if (file.stats.isFile()) {
        total += file.stats.size
    }
    return total
}, 0)

const ls = directoryPath => Promise.all(fs.readdirAsync(directoryPath).then(files => {
    let p = []
    files.forEach(file => {
        path = directoryPath + '/' + file
        p.push(Promise.props({
            path,
            stat: fs.statAsync(path)
        }))
    });
    return p
})).then(objs => {
    return _(objs).filter(obj => obj.stat.isFile()).value()
})

module.exports = {
    ls,
    totalSize
}