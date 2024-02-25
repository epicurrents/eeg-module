const path = require('path')
const TerserPlugin = require('terser-webpack-plugin')
require('dotenv').config()

const ASSET_PATH = process.env.ASSET_PATH || '/vendor/eeg-module/'

module.exports = {
    mode: 'production',
    entry: {
        'eeg-module': { import: path.join(__dirname, 'src', 'index.ts') },
    },
    module: {
        rules: [
        {
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: '/node_modules/',
        },
        ],
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin(),
        ],
        splitChunks: false,
    },
    output: {
        path: path.resolve(__dirname, 'umd'),
        publicPath: ASSET_PATH,
        library: 'EpiCEegMod',
        libraryTarget: 'umd',
    },
    resolve: {
        extensions: ['.ts', '.js', '.json'],
        alias: {
            '#root': path.resolve(__dirname, './'),
            '#config': path.resolve(__dirname, 'src', 'config'),
            '#runtime': path.resolve(__dirname, 'src', 'runtime'),
            '#types': path.resolve(__dirname, 'src', 'types'),
        },
        symlinks: false
    },
}