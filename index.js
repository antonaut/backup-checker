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
    fs.statAsync(path)
    .then(stat => {
        return new Promise((resolve, reject) => {
            if (!stat.isFile()) {
                resolve(undefined);
            }
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
    })

const files = path => Promise.all(fs.readdirAsync(path).then(files => {
    let p = []
    files.forEach(element => {
        p.push(Promise.props({
            path: path + '/' + element,
            stat: fs.statAsync(element)
        }))
    });
    return p
})).then(objs => {
    return _(objs).remove(obj => obj.stat.isFile()).value()
})

const hashDir = ({
    dir,
    size
}) => {
    console.log(`Starting to hash ${size} bytes in ${dir}`)
    return files(dir).then(files => {
        const hasher = new XXHash.h64(0xDEADBEEF)
        let totalHashed = 0
        let fs = []
        files.forEach(({
            path,
            stat
        }) => {
            const hash = hasher.hash(path)
            totalHashed += stat.size
            console.log(`${totalHashed} / ${size}`)
            fs.push({
                path,
                stat,
                hash
            })
        })
        return fs
    })
}


let result = []
let totalHashed = 0

const dirTotal = dir => Promise.map(fs.readdirAsync(dir),
    (file) => new Promise((resolve, reject) => {
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

const run = () => {
    hashEmitter.on('dirsize', (dirSize) => {
        Promise.all(hashDirLimited(dirSize))
            .then(console.log.bind(console))
            .catch(err => {
                console.error(err)
            })
    });
}
run()

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