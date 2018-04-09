const walker = require('walk')
const through = require('through2')
const XXHash = require('xxhashjs')
const _ = require('lodash')
const Promise = require('bluebird')
const streamToPromise = require('stream-to-promise')
const fs = Promise.promisifyAll(require('fs'))
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

const hashDir = ({
    dir,
    size
}) => new Promise((resolve, reject) => {
    console.log(`Starting to hash ${size} bytes in ${dir}`)
    fs.readdir(dir, (err, files) => {
        const hasher = new XXHash.h64(0xDEADBEEF)
        if (err) {
            reject(err)
        }
        // todo map only over files 
        resolve(_(files)
            .map(file => dir + '/' + file)
            .map(hashFile(hasher)))
    })
})


let result = []
let totalHashed = 0


const files = dir => {
    return fs.readdirAsync(dir)
}

const dirTotal = dir => files(dir)
    .map((file) => new Promise((resolve, reject) => {
        fs.lstat(dir + '/' + file, (err, stats) => {
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

const EventEmitter = require('events');

class HashEmitter extends EventEmitter {}
const hashEmitter = new HashEmitter();
hashEmitter.on('dirsize', (dirSize) => {
    hashDirLimited(dirSize).then(console.log.bind(console))
});


const Bottleneck = require("bottleneck");
const limiter = new Bottleneck({
    maxConcurrent: 5,
});

let hashDirLimited = limiter.wrap(hashDir)

walker.walk(scandir)
    .on('directories', (root, stats, next) => {
        dirTotal(root).then(size => {
            hashEmitter.emit('dirsize', {
                dir: root,
                size
            })
        })
        next()
    })