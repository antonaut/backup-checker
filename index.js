const walker = require('walker')
const XXHash = require('xxhash')
const fs = require('fs')
const _ = require('lodash')


let result = []
let totalHashed = 0
let proms = [
    new Promise((res, rej) => {
        walker('.')
            .on('file', (file, stat) => {
                var hasher = new XXHash(0xCAFEBABE)
                result.push({ file, hasher })
                proms.push(new Promise((resolve, reject) => {
                    fs.createReadStream(file)
                        .on('data', function (data) {
                            hasher.update(data)
                        })
                        .on('end', () => {
                            resolve()
                        })
                        .on('error', (err) => {
                            reject(err)
                        })
                }))
            }).on('end', () => {
                res()
            }).on('error', (err) => {
                console.error(err)
                rej()
            })
    })]

Promise.all(proms).then(() => {
    let digests = _.map(result, ({ file, hasher }) => ({ file, hash: hasher.digest() }))
    let duplicates = _(digests).groupBy('hash').pickBy(x => x.length > 1).values().value()
    _(duplicates).each(dups => {
        _(dups).each(f => {
            console.log(f.file)
        })
        console.log()
    })
    console.log(`found ${duplicates.length} cases of duplication`)
})