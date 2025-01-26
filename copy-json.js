/**
 * Copy JSON configuration files to dist folder. Also copies the folder structure of the given
 * source directory if it contains JSON files.
 * NOTE: This script only copies new and rewrites existing files, it does not remove obsolete
 * files or folders from dist.
 */
const fs = require('fs')

const srcPath = './src/'
const trgPath = './dist/'

function copyConfig (path) {
    const wrkPath = srcPath + path
    console.debug(`Traversing source path ${path}.`)
    if (fs.existsSync(wrkPath) && fs.lstatSync(wrkPath).isDirectory()) {
        const rootPath = trgPath + path
        if (!fs.existsSync(rootPath)) {
            console.debug(`Creating root directory ${rootPath}.`)
            fs.mkdirSync(rootPath)
        }
        fs.readdirSync(wrkPath).forEach(item => {
            const curPath = path + "/" + item
            const fullPath = srcPath + curPath
            if (fs.lstatSync(fullPath).isDirectory()) {
                copyConfig(curPath)
            } else if (curPath.endsWith('.json')) {
                console.debug(`Copying file ${curPath}.`)
                fs.copyFileSync(fullPath, trgPath + curPath)
            }
        })
    }
}

console.info('Copying JSON configuration files.')
;[
    'config'
].forEach(path => {
    copyConfig(path)
})
console.info('Copy complete.')