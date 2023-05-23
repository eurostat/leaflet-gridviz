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

## Options
When you define your gridviz layer, you can pass an options object like so:

```JavaScript
gridvizLayer = new L.GridvizLayer(options)
```

The properties you can include in this object are detailed in the table below:

| Method             | Type   | Default     | Description                                                                                     |
| ------------------ | ------ | ----------- | ----------------------------------------------------------------------------------------------- |
| _options_.**proj** | string | 'EPSG:3035' | The layer's projection. When using proj4leaflet, this corresponds with the proj4.defs() projection definition identifier.                                                                            |
| _options_.**onLayerDidMountCallback** | Function | null | Specify a custom callback that is executed when the layer has been added to the map. |
| _options_.**selectionRectangleColor** | String | 'red' | The colour of the outline when a cell is highlighted. See https://eurostat.github.io/gridviz/docs/reference#app-options-object |
| _options_.**selectionRectangleWidthPix** | Number | 3 | The width of the outline when a cell is highlighted. See https://eurostat.github.io/gridviz/docs/reference#app-options-object |




## Installation for development

With node.js 14.20.1:

`npm install`  
`npm start`
