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
    /**
     * @description Fires after leaflet layer canvas is attached/added to the map
     *
     */
    this.onLayerDidMount = function () {
        this.buildGridVizApp()
    }

    /**
     * @description Fires before layer is removed from the map
     *
     */
    this.onLayerWillUnmount = function () {
        // cleanup?
    }

    /**
     * @description Fires when layer data changes
     *
     */
    this.setData = function (data) {
        // -- custom data set
        this.needRedraw() // -- call to drawLayer
    }

    /**
     * @description Fires when layer is drawn , info contains view parameters like bounds, size, canvas etc.
     *
     */
    this.onDrawLayer = function (info) {
        //
        console.log(info)
    }

    /**
     * @description build a gridviz app and add a layer to it
     */
    this.buildGridVizApp = function () {
        let container = this._canvas.parentElement
        this.app = new gridviz.App(container, { w: window.innerWidth, h: window.innerHeight })
            .setGeoCenter({ x: 4000000, y: 2960000 })
            .setZoomFactor(1000)
            .setZoomFactorExtent([30, 7000])
            .setBackgroundColor('black')

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
