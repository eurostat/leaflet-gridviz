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
    /**
     * @description Layer (canvas) opacity
     *
     */
    this.opacity = 0.5 || opts.opacity

    /**
     * @description gridviz app. see https://eurostat.github.io/gridviz/docs/reference
     *
     */
    this.app = null

    /**
     * @description EPSG:3035 tiling resolutions
     *
     */
    this.resolutions = [
        66145.9656252646, 26458.386250105836, 13229.193125052918, 6614.596562526459,
        2645.8386250105837, 1322.9193125052918, 661.4596562526459, 264.5838625010584,
        132.2919312505292, 66.1459656252646,
    ]

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
        console.log(info)
    }

    /**
     * @description Handles gridviz zoom events and syncs them with leaflet
     *
     */
    this.gridvizZoomEndHandler = function (e) {
        // calculate new center
        let geoCenter = this.app.getGeoCenter()
        let leafletCenter = this.geoCenterToLeaflet(geoCenter.x, geoCenter.y)

        if (e.sourceEvent.wheelDelta) {
            // zoom event
            let gvizZoom = this.app.getZoomFactor()
            let leafletZoom = this.gridvizZoomToLeafletZoom(gvizZoom, e.sourceEvent.wheelDelta)

            // check zoom isnt out of resolutions array limits
            if (leafletZoom && this.resolutions[leafletZoom]) {
                // set leaflet center and zoom. This applies a tranlate transform to the styles property of the leaflet layer canvas element
                this._map.setView(leafletCenter, leafletZoom)

                // apply the leaflet translate to our gridviz canvas
                let gridvizCanvas = this.app.cg.canvas
                let leafletCanvas = gridvizCanvas.previousElementSibling
                let transform = leafletCanvas.style.transform
                gridvizCanvas.style.transform = transform

                // set gridviz zoom to match leaflet and redraw
                this.app.setZoomFactor(this.resolutions[leafletZoom])
                this.app.redraw()
            }
        } else {
            // pan event

            this._map.panTo(leafletCenter)
        }
    }

    /**
     * @description Converts leaflet zoom level to gridviz zoom factor (pixel size, in ground m)
     *
     */
    this.leafletZoomToGridvizZoom = function (leafletZoom) {
        return this.zoomLevelToMetresPerPixel()
    }

    /**
     * @description Converts gridviz zoom factor (pixel size, in ground m) to leaflet zoom level
     * @param {number} gvizZoom The gridviz Zoom Factor
     * @param {number} wheelDelta The zoom event wheelDelta
     */
    this.gridvizZoomToLeafletZoom = function (gvizZoom, wheelDelta) {
        let newZoom
        // find which resolution bracket we're currently in
        this.resolutions.some((res, i) => {
            if (gvizZoom >= res) {
                // move to next resolution up/down for zoom in/out (if possible)
                return (newZoom = wheelDelta > 0 ? i + 1 : i - 1)
            }
        })
        return newZoom
    }

    /**
     * @description Converts gridviz geoCenter to leaflet center
     * proj4(fromProjection, toProjection, [coordinates])
     *
     */
    this.geoCenterToLeaflet = function (x, y) {
        let xy = proj4('EPSG:3035', 'WGS84', [x, y])
        return [xy[1], xy[0]] // leaflet does [lat,lon]
    }

    /**
     * @description Converts leaflet center to gridviz EPSG geoCenter
     * proj4(fromProjection, toProjection, [coordinates])
     *
     */
    this.leafletToGeoCenter = function (x, y) {
        return proj4('EPSG:3035', [x, y])
    }

    /**
     * @description Calculates meters per pixel at a leaflet zoom level
     *
     */
    this.zoomLevelToMetresPerPixel = function () {
        let centerLatLng = this._map.getCenter() // get map center
        let pointC = this._map.latLngToContainerPoint(centerLatLng) // convert to containerpoint (pixels)
        let pointX = [pointC.x + 1, pointC.y] // add one pixel to x
        let pointY = [pointC.x, pointC.y + 1] // add one pixel to y

        // convert containerpoints to latlng's
        let latLngC = this._map.containerPointToLatLng(pointC)
        let latLngX = this._map.containerPointToLatLng(pointX)
        let latLngY = this._map.containerPointToLatLng(pointY)

        let distanceX = latLngC.distanceTo(latLngX) // calculate distance between c and x (latitude)
        let distanceY = latLngC.distanceTo(latLngY) // calculate distance between c and y (longitude)

        return distanceX + distanceY / 2
    }

    /**
     * @description build a gridviz app and add a layer to it
     */
    this.buildGridVizApp = function () {
        let container = this._canvas.parentElement
        let geoCenter = this.leafletToGeoCenter(this.map._lastCenter.lng, this.map._lastCenter.lat)

        this.app = new gridviz.App(container, {
            // canvas: this._canvas, // when leaflet and gridviz share the same canvas it is chaos
            w: window.innerWidth,
            h: window.innerHeight,
            onZoomEndFun: (e) => this.gridvizZoomEndHandler(e),
            onZoomFun: (e) => this.gridvizZoomEndHandler(e),
        })
            .setGeoCenter({ x: geoCenter[0], y: geoCenter[1] })
            .setZoomFactor(this.leafletZoomToGridvizZoom(this.map._zoom))
            .setZoomFactorExtent([
                this.resolutions[this.resolutions.length - 1],
                this.resolutions[0],
            ])
            .setBackgroundColor('#ffffff')
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
    }
}

L.GridvizLayer.prototype = new CanvasLayer.CanvasLayer() // -- setup prototype
