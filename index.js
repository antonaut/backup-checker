const klaw = require('klaw')
const through = require('through2')
const XXHash = require('xxhashjs')
const _ = require('lodash')
const Promise = require('bluebird')
const streamToPromise = require('stream-to-promise')
const fs = require('fs')
const process = require('process')
const stream = require('stream')


let scandir = '.'

if (process.argv[2]) {
    scandir = process.argv[2]
}
console.log(`Running in folder: ${scandir}`)

const hashFile = hasher => path =>
    new Promise((resolve, reject) => {
        console.log(`hashing file: ${path}`)
        fs.createReadStream(path)
            .on('data', function (data) {
                hasher.update(data)
            })
            .on('end', () => {
                resolve({
                    path,
                    hash: hasher.digest().toString(16)
                })
            })
            .on('error', (err) => {
                reject(err)
            })
    })

const hashDir = dir => new Promise((resolve, reject) => {
    console.log(`hashing dir: ${dir.path}`)
    fs.readdir(dir.path, (err, files) => {
        const hasher = new XXHash.h64(0xDEADBEEF)
        if (err) {
            reject(err)
        }
        resolve(_(files)
            .map(hashFile(hasher)))
    })
})


let result = []
let totalHashed = 0

const subdirs = Promise.resolve(streamToPromise(klaw(scandir)
    .pipe(through.obj(function (item, enc, next) {
        if (item.stats.isDirectory()) this.push(item)
        next()
    }))))

Promise.map(subdirs,
    hashDir,
    { concurrency: 4 })
    .then((digests) => {
        console.log(digests)
        let duplicates = _(digests)
            .groupBy('hash')
            .pickBy(x => x.length > 1)
            .values()
            .value()
        _(duplicates).each(dups => {
            _(dups).each(f => {
                console.log(f.path)
            })
            console.log()
        })
        console.log(`found ${duplicates.length} cases of duplication`)
    }).catch((err) => {
        console.error(`Something went wrong: ${err}`)
    })