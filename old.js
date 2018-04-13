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