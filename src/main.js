import * as L from 'leaflet'
import * as CanvasLayer from 'leaflet-canvas-layer'
import * as gridviz from 'gridviz'
import { interpolateInferno } from 'd3-scale-chromatic'
import proj4 from 'proj4'
import 'proj4leaflet'

proj4.defs(
    'EPSG:3035',
    '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs'
)

/** An extension of L.CanvasLayer (leaflet-canvas-layer) for integrating gridviz into Leaflet
 *  @description 
 *  methods	description
    needRedraw - will schedule next frame call for drawLayer
    delegate(object) - optionaly set receiver of the events if not 'inheriting' from L.CanvasLayer
 * 
 */
L.GridvizLayer = function (opts) {
    // layer opacity
    this.opacity = 0.5 || opts.opacity

    /**
     * @description Fires after leaflet layer canvas is attached/added to the map
     *
     */
    this.onLayerDidMount = function () {
        // build gridviz app
        this.buildGridVizApp()

        //set canvas opacity
        this.app.cg.canvas.style.opacity = this.opacity
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

    this.zoomEndHandler = function (e) {
        console.log(e)
        console.log(this)
    }

    /**
     * @description build a gridviz app and add a layer to it
     */
    this.buildGridVizApp = function () {
        console.log(this)
        let container = this._canvas.parentElement
        let geoCenter = proj4('EPSG:3035', [this.map._lastCenter.lng, this.map._lastCenter.lat])
        this.app = new gridviz.App(container, {
            canvas: this._canvas,
            w: window.innerWidth,
            h: window.innerHeight,
            onZoomEndFun: (e) => this.zoomEndHandler(e),
        })
            .setGeoCenter({ x: geoCenter[0], y: geoCenter[1] })
            .setZoomFactor(this.map._zoom * 2300)
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

        // here we want event callbacks from gridviz in order to sync them with out Leaflet map
        // .onZoomEnd(this.zoomHandler)
        // .onPanEnd(this.panHandler)

        console.log(this.app.cg.canvas)
    }

    console.log(this)
}

L.GridvizLayer.prototype = new CanvasLayer.CanvasLayer() // -- setup prototype
