import * as L from 'leaflet'
import * as CanvasLayer from 'leaflet-canvas-layer'
import * as gridviz from 'gridviz'
import { interpolateInferno } from 'd3-scale-chromatic'

/** An extension of L.CanvasLayer (leaflet-canvas-layer) for integrating gridviz into Leaflet
 *  @description 
 *  methods	description
    needRedraw - will schedule next frame call for drawLayer
    delegate(object) - optionaly set receiver of the events if not 'inheriting' from L.CanvasLayer
 * 
 */
L.GridvizLayer = function () {
    this.onLayerDidMount = function (info) {
        // after canvas is attached/added to the map
        this.buildGridVizApp()
    }
    this.onLayerWillUnmount = function () {
        // before layer is removed from the map
    }
    this.setData = function (data) {
        // -- custom data set
        this.needRedraw() // -- call to drawLayer
    }
    this.onDrawLayer = function (info) {
        // -- when layer is drawn , info contains view parameters like bounds, size, canvas etc.
        console.log(info)
    }

    this.buildGridVizApp = function () {
        this.app = new gridviz.App(this._canvas, { w: window.innerWidth, h: window.innerHeight })
            .setGeoCenter({ x: 4000000, y: 2960000 })
            .setZoomFactor(1000)
            .setZoomFactorExtent([30, 7000])
            .setBackgroundColor('black')
            .setLabelLayer(
                gridviz.getEuronymeLabelLayer('EUR', 50, {
                    ex: 2,
                    fontFamily: 'mfLeg',
                    exSize: 0.9,
                    color: () => 'black',
                    haloColor: () => '#ffffff',
                    haloWidth: () => 3,
                })
            )
            .setBoundaryLayer(
                gridviz.getEurostatBoundariesLayer({
                    scale: '10M',
                    col: '#fff5',
                    lineDash: () => [],
                })
            )
            .addMultiScaleTiledGridLayer(
                [1000, 2000, 5000, 10000, 20000, 50000, 100000],
                (r) =>
                    'https://raw.githubusercontent.com/jgaffuri/tiledgrids/main/data/europe/population/' +
                    r +
                    'm/',
                gridviz.TanakaStyle.get('2018', {
                    tFun: (v, r, s, zf) => gridviz.sExpRev((v - s.min) / (s.max - s.min), -7),
                    nb: 6,
                    color: (t) => interpolateInferno(t * 0.9 + 0.1),
                    colDark: '#333',
                }),
                {
                    pixNb: 6,
                    cellInfoHTML: (c) => '<b>' + c['2018'] + '</b> inhabitant(s)',
                }
            )
    }

    console.log(this)
}

L.GridvizLayer.prototype = new CanvasLayer.CanvasLayer() // -- setup prototype
