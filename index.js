const walker = require('walk')
const _ = require('lodash')
const Promise = require('bluebird')
const streamToPromise = require('stream-to-promise')
const fs = Promise.promisifyAll(require('fs'))
const process = require('process')
const stream = require('stream')
const EventEmitter = require('events')
const ProgressBar = require('progress')

const dir = require('./lib/dir')
const {
    hashFile
} = require('./lib/hasher')

let scandir = '.'
let resultsFile = './results.txt'
const resultStream = fs.createWriteStream(resultsFile)

if (process.argv[2]) {
    scandir = process.argv[2]
}

let totalFiles = 0
let totalDecided = 0
let totalHashed = 0
let totalUniques = 0
let totalDuplicates = 0

// A what is a file that is reclassified 
// from being unique by size to being unique by hash
let totalWhats = 0

const getBarInterruptMessage = () => {
    return `H=${totalHashed}, U=${totalUniques}, D=${totalDuplicates}`
}

let bar = new ProgressBar('processed (:current / :total) files, hashed :totalHashed files, found :totalDuplicates duplicates', {
    total: totalFiles,
    curr: totalDecided
})
const redisplayBar = () => {
    curr = Math.max(Math.min(totalHashed + totalUniques + totalWhats, totalDecided))
    total = Math.max(totalDecided, curr)
    bar.curr = curr
    bar.total = total
    bar.render({
        totalHashed,
        totalDuplicates
    })
}
console.log(`Walking in '${scandir}'. A progress bar will show as soon as we are done walking.`)

class HashEmitter extends EventEmitter {}
const eventEmitter = new HashEmitter();
eventEmitter.on('fileShouldBeHashed', ({
    path,
    stat
}) => {
    hashPromises.push(hashFileLimited(path, stat))
})

eventEmitter.on('fileHashed', () => {
    totalHashed++
    redisplayBar()
})

eventEmitter.on('fileHasUniqueSize', () => {
    totalUniques++
    redisplayBar()
})

eventEmitter.on('foundDuplicates', () => {
    bar.render({
        totalDuplicates
    })
})

const Bottleneck = require("bottleneck");
const limiter = new Bottleneck({
    maxConcurrent: 5,
})
const hashFileLimited = limiter.wrap(hashFile)

let hashPromises = []

let uniqueBySize = {}
let uniqueByHash = {}
let duplicates = {}

const decideUnique = ({
    path,
    stat
}) => {
    const size = stat.size
    const old = uniqueBySize[size]
    totalDecided++
    if (!old) {
        uniqueBySize[size] = path
        eventEmitter.emit('fileHasUniqueSize', {
            path
        })
        return
    }
    eventEmitter.emit('fileShouldBeHashed', {
        path,
        stat
    })
}

let p = new Promise((resolve, reject) => {
    const w = walker.walk(scandir)

    w.on('file', (root, stats, next) => {
        totalFiles++

        const path = root + '/' + stats.name
        decideUnique({
            path,
            stat: stats
        })
        next()
    })
    w.on('errors', (root, nodeStatsArray, next) => {
        reject({
            root,
            nodeStatsArray
        })
        next()
    })

    w.on('end', () => {
        resultStream.write(`Done walking in '${scandir}'. There are ${totalFiles} files in total.\n`)
        Promise.map(hashPromises, ({
                path,
                stat,
                hash
            }) => {
                const what = uniqueByHash[hash]
                if (what) {
                    let dups = duplicates[hash]
                    if (!dups) {
                        dups = [what]
                        totalWhats++
                        totalUniques--
                        totalDuplicates++
                    }
                    dups.push(path)
                    totalDuplicates++
                    duplicates[hash] = dups
                    eventEmitter.emit('foundDuplicates')
                    //throw new Error(`Collision! ${what} and ${path} have same hash (${hash})`)
                } else {
                    uniqueByHash[hash] = path
                }
                eventEmitter.emit('fileHashed', {
                    path,
                    stat
                })
            }).then(() => {
                resultStream.write(`Hashed ${totalHashed} files.\n`)
                resultStream.write(`There were ${totalUniques} files with unique size.\n`)
                resultStream.write(`Found ${totalDuplicates} duplicates:\n`)
                _(duplicates).values().each(dups => {
                    resultStream.write('\n')
                    _(dups).each(path => {
                        resultStream.write(`${path}\n`)
                    })
                })
                resolve()
            })
            .catch(err => {
                reject(err)
            })
    })
})

p.then(() => {
    console.log('\nDone.')
}).catch(err => {
    console.error(err)
})