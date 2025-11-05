const path = require('path')

module.exports = {
    entry: './src/main.js',
    mode: 'development',
    output: {
        filename: 'leaflet-gridviz.js',
        path: path.resolve(__dirname, 'dist'),
        library: {
            name: "LeafletGridviz", // window.LeafletGridviz when loaded in browser
            type: "umd"
        },
    },
    externals: {
        leaflet: { root: 'L', commonjs: 'leaflet', commonjs2: 'leaflet', amd: 'leaflet' },
        proj4: { root: 'proj4', commonjs: 'proj4', commonjs2: 'proj4', amd: 'proj4' },
        gridviz: { root: 'gridviz', commonjs: 'gridviz', commonjs2: 'gridviz', amd: 'gridviz' }
    },
    //plugins: [new CleanWebpackPlugin()],
    watch: false,
    optimization: {
        usedExports: true,
        minimize: false,
    },
}
