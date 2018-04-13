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
let totalDelegated = 0
let totalHashed = 0
let totalUniques = 0
let totalDuplicates = 0

// A what is a file that is reclassified 
// from being unique by size to being unique by hash
let totalWhats = 0

const getBarInterruptMessage = () => {
    return `H=${totalHashed}, U=${totalUniques}, D=${totalDuplicates}`
}

let bar = undefined
console.log(`Walking in '${scandir}'. A progress bar will show as soon as we are done walking.`)

class HashEmitter extends EventEmitter {}
const eventEmitter = new HashEmitter();
eventEmitter.on('shouldHash', ({
    path,
    stat
}) => {
    totalHashed++
    hashPromises.push(hashFileLimited(path, stat))
})

eventEmitter.on('uniqueSize', () => {
    totalUniques++
    if (bar) {
        bar.interrupt(getBarInterruptMessage())
        bar.render()
    }
})

eventEmitter.on('foundDuplicates', () => {
    if (bar) {
        bar.interrupt(getBarInterruptMessage())
        bar.render()
    }
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

const shouldHash = ({
    path,
    stat
}) => {
    const size = stat.size
    const old = uniqueBySize[size]
    totalDelegated++
    if (bar) {
        bar.tick()
    }
    if (!old) {
        uniqueBySize[size] = path
        eventEmitter.emit('uniqueSize')
        return
    }
    eventEmitter.emit('shouldHash', {
        path,
        stat
    })
}

const w = walker.walk(scandir)

w.on('file', (root, stats, next) => {
    totalFiles++
    const path = root + '/' + stats.name
    shouldHash({
        path,
        stat: stats
    })
    next()
})


w.on('end', () => {
    bar = new ProgressBar('[:bar] :current / :total', {
        total: totalFiles,
        curr: totalDelegated
    })
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
        eventEmitter.emit('hashDone', {
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
    })
})