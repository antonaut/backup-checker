const walker = require('walk')
const _ = require('lodash')
const Promise = require('bluebird')
const streamToPromise = require('stream-to-promise')
const fs = Promise.promisifyAll(require('fs'))
const process = require('process')
const stream = require('stream')
const EventEmitter = require('events')

const dir = require('./lib/dir')
const {
    hashDirectory
} = require('./lib/hasher')

let scandir = '.'

if (process.argv[2]) {
    scandir = process.argv[2]
}
console.log(`Running in folder: ${scandir}`)

let result = []
let totalHashed = 0

class HashEmitter extends EventEmitter {}
const hashEmitter = new HashEmitter();

const run = () => {
    hashEmitter.on('dirsize', (dirSize) => {
        Promise.all(hashDirLimited(dirSize))
            .map(Promise.props)
            .then(console.log.bind(console))
            .catch(err => {
                console.error(err)
            })
    })
}

run()

const Bottleneck = require("bottleneck");
const limiter = new Bottleneck({
    maxConcurrent: 5,
})

let hashDirLimited = limiter.wrap(hashDirectory)

walker.walk(scandir)
    .on('directories', (root, stats, next) => {
        dir.totalSize(root).then(size => {
            hashEmitter.emit('dirsize', {
                directory: root,
                size
            })
        })
        next()
    })