/**
 * Copy JSON configuration files to dist folder.
 */
const fs = require('fs')

const srcPath = './src/'
const trgPath = './dist/'

function copyConfig (path) {
    const wrkPath = srcPath + path
    console.debug(`Traversing path ${path}.`)
    if (fs.existsSync(wrkPath) && fs.lstatSync(wrkPath).isDirectory()) {
        fs.readdirSync(wrkPath).forEach(item => {
            const curPath = path + "/" + item
            const fullPath = srcPath + curPath
            if (fs.lstatSync(fullPath).isDirectory()) {
                if (!fs.existsSync(trgPath + curPath)) {
                    console.debug(`Creating target directory ${trgPath + curPath}.`)
                    fs.mkdirSync(trgPath + curPath)
                }
                copyConfig(curPath)
            } else if (curPath.endsWith('.json')) {
                console.debug(`Copying target file ${trgPath + curPath}.`)
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