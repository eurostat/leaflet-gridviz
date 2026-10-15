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

[See demo here](https://eurostat.github.io/leaflet-gridviz/examples/demo.html) | [see code](./examples/demo.html)

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
let gridvizLayer = new L.GridvizLayer({
    proj: 'EPSG:3035',
    onLayerDidMountCallback: (gridvizMap) => {
        //define multi resolution dataset
        const dataset = new gridviz.MultiResolutionDataset(
            //the resolutions
            [1000, 2000, 5000, 10000, 20000, 50000, 100000],
            //the function returning each dataset from the resolution
            (resolution) =>
                new gridviz.TiledGrid(
                    gridvizMap,
                    'https://raw.githubusercontent.com/jgaffuri/tiledgrids/main/data/europe/population2/' +
                        resolution +
                        'm/'
                )
        )

        //define color for each cell c
        const colorFunction = (cell, resolution) => {
            const density = (1000000 * cell.TOT_P_2021) / (resolution * resolution)
            if (density > 1500) return '#993404'
            else if (density > 600) return '#d95f0e'
            else if (density > 200) return '#fe9929'
            else if (density > 60) return '#fec44f'
            else if (density > 15) return '#fee391'
            else return '#ffffd4'
        }

        //define style
        const style = new gridviz.ShapeColorSizeStyle({ color: colorFunction })

        //add layer to map
        gridvizMap.layers = [new gridviz.GridLayer(dataset, [style], {minPixelsPerCell: 5})]

        //custom opacity
        gridvizLayer._canvas.style.opacity = 0.7
    },
})

// add it to the map
gridvizLayer.addTo(map)


```

### Options

| Option                      | Default     | Description                                                                                                                                                         |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **proj**                    | 'EPSG:3035' | The projection of the grid (define it with proj4 first).                                                                                                            |
| **onLayerDidMountCallback** | null        | Called with the gridviz map each time the layer is added to a Leaflet map. Define the gridviz layers here.                                                          |
| **legendContainer**         | null        | An element for the gridviz legends.                                                                                                                                 |
| **padding**                 | 0           | Extra canvas around the view, as a share of its size on each side (e.g. 0.15), so a pan doesn't uncover empty edges before the redraw at its end.                    |

### Removing and adding the layer again

Removing the layer keeps its gridviz map: adding it back to the same Leaflet map reuses it, with the tiles it has already loaded. _onLayerDidMountCallback_ is still called on every add, with that same gridviz map. To dispose of the layer for good, call `gridvizLayer.destroy()`.

Note: this has only been tested with EPSG:3035 grids

Feel free to contribute or open an issue!

## Installation for development

With node.js 14.20.1:

`npm install`  
`npm start`
