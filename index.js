const klaw = require('klaw')
const through = require('through2')
const XXHash = require('xxhashjs')
const _ = require('lodash')
const bluebird = require('bluebird')
const fs = require('fs')
const process = require('process')
const stream = require('stream')


let scandir = '.'

if (process.argv[2]) {
    scandir = process.argv[2]
}
console.log(`Running in folder: ${scandir}`)

const hashFile = hasher => file =>
    new bluebird((resolve, reject) => {
        fs.createReadStream(file)
            .on('data', function (data) {
                hasher.update(data)
            })
            .on('end', () => {
                resolve({
                    file,
                    hash: hasher.digest().toString(16)
                })
            })
            .on('error', (err) => {
                reject(err)
            })
    })

const hashDir = dir => new bluebird((resolve, reject) => {
    fs.readdir(dir, (err, files) => {
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

const subdirs = klaw(scandir)
    .pipe(through.obj((item, enc, next) => {
        if (item.stats.isDirectory()) this.push(item)
        next()
    }))

bluebird.map(subdirs,
    hashDir,
    { concurrency: 4 })
    .then((digests) => {
        let duplicates = _(digests)
            .groupBy('hash')
            .pickBy(x => x.length > 1)
            .values()
            .value()
        _(duplicates).each(dups => {
            _(dups).each(f => {
                console.log(f.file)
            })
            console.log()
        })
        console.log(`found ${duplicates.length} cases of duplication`)
    }).catch((err) => {
        console.error(`Something went wrong: ${err}`)
    })