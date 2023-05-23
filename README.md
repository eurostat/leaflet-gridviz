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
```

Documentation coming soon..

## Installation for development

With node.js 14.20.1:

`npm install`  
`npm start`
