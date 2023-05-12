const path = require('path')
module.exports = {
    mode: 'production',
    entry: './src/main.js',
    output: {
        filename: 'leaflet-gridviz.min.js',
        path: path.resolve(__dirname, 'dist'),
    },
    devtool: false,
    watch: false,
    optimization: {
        usedExports: true,
        minimize: true,
    },
}
