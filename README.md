# leaflet-gridviz

![npm bundle size](https://img.shields.io/bundlephobia/minzip/leaflet-gridviz)
![npm](https://img.shields.io/npm/v/leaflet-gridviz)
![license](https://img.shields.io/badge/license-EUPL-success)

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
<script src="https://www.unpkg.com/leaflet-gridviz"></script>

// create your leaflet map
var map = new L.Map('map', {
    crs: crs,
    center: ['50.00754', '19.98211'],
})

// define your leaflet-gridviz layer
gridvizLayer = new L.GridvizLayer(options)

// add it to the map
gridvizLayer.addTo(map)

//then customize it as you wish by using the gridviz app attached to our GridvizLayer...
gridvizLayer.app
    .addMultiScaleTiledGridLayer(
        [1000, 2000, 5000, 10000, 20000, 50000, 100000],
        (r) =>
            'https://raw.githubusercontent.com/jgaffuri/tiledgrids/main/data/europe/population/' +
            r +
            'm/',
        gridvizLayer.gridviz.TanakaStyle.get('2018', {
            tFun: (v, r, s, zf) =>
                gridvizLayer.gridviz.sExpRev((v - s.min) / (s.max - s.min), -7),
            nb: 6,
            color: (t) => d3.interpolateInferno(t * 0.9 + 0.1),
            colDark: '#333',
        }),
        {
            pixNb: 6,
            cellInfoHTML: (c) => '<b>' + c['2018'] + '</b> inhabitant(s)',
        }
    )

```

Note: this has only been tested with EPSG:3035 grids

Feel free to contribute or open an issue!

## Installation for development

With node.js 14.20.1:

`npm install`  
`npm start`
