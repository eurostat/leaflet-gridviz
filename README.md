# leaflet-gridviz

<div>
    <a href="https://eurostat.github.io/leaflet-gridviz/examples/demo.html" target="_blank">
        <img src='./preview.png'>
    </a>
</div>

A plugin for Leaflet to show [gridviz](https://github.com/eurostat/gridviz) maps.

## Demo

[Population census gridviz layer in leaflet](https://eurostat.github.io/leaflet-gridviz/examples/demo.html) | [see code](./examples/demo.html)

## Usage

```JavaScript
// import leaflet-gridviz after importing leaflet
<script src="../build/leaflet-gridviz.js"></script>

// create your leaflet map
var map = new L.Map('map', {
    crs: crs,
    center: ['50.00754', '19.98211'],
})

// define your gridviz layer
gridvizLayer = new L.GridvizLayer(options)

// add it to the map
gridvizLayer.addTo(map)

// customize the gridviz app attached to the layer
gridvizLayer.app
    .addMultiScaleTiledGridLayer(
        [1000, 2000, 5000, 10000, 20000, 50000, 100000],
        (r) =>
            'https://raw.githubusercontent.com/jgaffuri/tiledgrids/main/data/europe/population/' +
            r +
            'm/',
        [
            new gviz.SquareColorWGLStyle({
                colorCol: '2018',
                tFun: (value, resolution, stats) => value / stats.max,
                stretching: { fun: 'expRev', alpha: -7 },
            }),
        ],
        {
            pixNb: 1.5,
            cellInfoHTML: (c) => '<b>' + c['2018'] + '</b> inhabitant(s)',
        }
    )

```

## Installation for development

With node.js 14.20.1:

`npm install`  
`npm start`
