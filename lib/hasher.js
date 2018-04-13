const XXHash = require('xxhashjs')
const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs'))
const dir = require('./dir')

const hashFile = (path, stat) => new Promise((resolve, reject) => {
    if (stat.type && stat.type !== 'file' || !stat.isFile()) {
        reject(new Error(`Can't hash ${stat}`));
    }
    const hasher = new XXHash.h64(0xDEADBEEF)
    fs.createReadStream(path)
        .on('data', function (data) {
            hasher.update(data)
        })
        .on('end', () => {
            resolve({
                path,
                stat,
                hash: hasher.digest().toString(16)
            })
        })
        .on('error', (err) => {
            reject(err)
        })
})

const hashDirectory = ({
    directory,
    size
}) => {
    console.log(`Starting to hash ${size} bytes in ${directory}`)
    return dir.ls(directory).then(files => {
        let totalHashed = 0
        let fs = []
        files.forEach(({
            path,
            stat
        }) => {
            const hash = hashFile(path, stat)
            totalHashed += stat.size
            console.log(`${totalHashed} / ${size}`)
            fs.push(hash)
        })
        return fs
    })
}

module.exports = {
    hashDirectory,
    hashFile
}