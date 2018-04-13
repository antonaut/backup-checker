const walker = require('walk')
const _ = require('lodash')
const Promise = require('bluebird')
const streamToPromise = require('stream-to-promise')
const fs = Promise.promisifyAll(require('fs'))
const process = require('process')
const stream = require('stream')
const ProgressBar = require('progress')

const dir = require('./lib/dir')
const {
    hashFile
} = require('./lib/hasher')

let scandir = '.'
let resultsFile = './results.txt'
const resultStream = fs.createWriteStream(resultsFile)
let skipZeroSize = true

if (process.argv[2]) {
    scandir = process.argv[2]
    if (scandir.endsWith('\\')) {
        scandir = scandir.substr(0, scandir.length - 1)
    }
}

let totalFiles = 0
let totalDecided = 0
let totalHashed = 0
let totalUniques = 0
let totalDuplicates = 0
let totalZeros = 0

// A what is a file that is reclassified 
// from being unique by size to being unique by hash
let totalWhats = 0

const getBarInterruptMessage = () => {
    return `H=${totalHashed}, U=${totalUniques}, D=${totalDuplicates}`
}

let bar = new ProgressBar('Processed (:current / :total) files, hashed :totalHashed files, found :totalDuplicates duplicates', {
    total: Math.max(totalFiles, 1),
    curr: Math.max(totalDecided, 1)
})
const redisplayBar = () => {
    curr = Math.max(Math.min(totalHashed + totalUniques + totalWhats + totalZeros, totalDecided))
    total = Math.max(totalDecided, curr)
    bar.curr = curr
    bar.total = total
    bar.render({
        totalHashed,
        totalDuplicates
    })
}
let barTimer = setInterval(redisplayBar, 200)

console.log(`Walking '${scandir}'. Hashing will start as soon as we are done walking.`)
console.log(`A report with the duplicates will be written to '${resultsFile}'.`)

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
    if (skipZeroSize && size === 0) {
        totalZeros++
        return
    }
    if (!old) {
        uniqueBySize[size] = path
        totalUniques++
        return
    }
    hashPromises.push(hashFileLimited(path, stat))
}

let main = new Promise((resolve, reject) => {
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
                //throw new Error(`Collision! ${what} and ${path} have same hash (${hash})`)
            } else {
                uniqueByHash[hash] = path
            }
            totalHashed++
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

Promise.resolve(main).then(() => {
    clearInterval(barTimer)
    redisplayBar()
    console.log('.\nDone.')
}).catch(err => {
    console.error(err)
})