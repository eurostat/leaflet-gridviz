const path = require('path')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')

module.exports = {
    entry: './src/main.js',
    mode: 'development',
    output: {
        filename: 'leaflet-gridviz.js',
        path: path.resolve(__dirname, 'build'),
    },
    plugins: [new CleanWebpackPlugin()],
    module: {},
    devServer: {
        static: './build',
        devMiddleware: {
            writeToDisk: true,
        },
    },
}
