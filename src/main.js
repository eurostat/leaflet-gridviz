import * as L from 'leaflet'
import * as CanvasLayer from 'leaflet-canvas-layer'
import * as gridviz from 'gridviz'
import proj4 from 'proj4'
import 'proj4leaflet'

proj4.defs(
    'EPSG:3035',
    '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs'
)

// TODO
// instead of updating leaflet when gridviz pans and zooms, do it the other way around: disable zoom for griddviz and redraw the canvas when leaflet pans/zooms

/** An extension of L.CanvasLayer (leaflet-canvas-layer) for integrating gridviz into Leaflet
 *  @description 
 *  methods	description
    needRedraw - will schedule next frame call for drawLayer
    delegate(object) - optionaly set receiver of the events if not 'inheriting' from L.CanvasLayer
 * 
 */
L.GridvizLayer = function (opts) {
    /**
     * @description Options object defined by the user
     *
     */
    opts = opts || {}

    /**
     * @description proj4 projection definition name. Make sure to add it using proj4.defs() first
     *
     */
    this.proj = opts.proj || 'EPSG:3035'

    /**
     * @description gridviz app. see https://eurostat.github.io/gridviz/docs/reference
     *
     */
    this.app = null

    /**
     * @description Include gridviz in output layer
     *
     */
    this.gridviz = gridviz

    /**
     * @description Fires after leaflet layer canvas is attached/added to the map
     *
     */
    this.onLayerDidMount = function () {
        // build gridviz app
        this.buildGridVizApp()

        //set canvas opacity
        //this.app.cg.canvas.style.opacity = this.opacity
    }

    /**
     * @description Fires before layer is removed from the map
     *
     */
    this.onLayerWillUnmount = function () {
        // cleanup here?
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
     * @description Fires when layer is drawn, info contains view parameters like bounds, size, canvas etc.
     * Here we need to feed gridviz it's new position and zoom, then redraw it's canvas
     *
     */
    this.onDrawLayer = function (info) {
        // set gridviz center and zoom to match leaflet
        // for some reason info.center is inaccurate so we take the map center is WGS84 and project
        let geoCenter = this.leafletToGeoCenter(this.map.getCenter())
        let zoomFactor = this.leafletZoomToGridvizZoom()
        this.app.setGeoCenter({ x: geoCenter[0], y: geoCenter[1] })
        this.app.setZoomFactor(zoomFactor)
        // redraw gridviz canvas
        this.app.redraw()
    }

    /**
     * @description Converts gridviz geoCenter to leaflet center
     * proj4(fromProjection, toProjection, [coordinates])
     *
     */
    this.geoCenterToLeaflet = function (x, y) {
        let xy = proj4(this.proj, 'WGS84', [x, y])
        return [xy[1], xy[0]] // leaflet uses [lat,lon]
    }

    /**
     * @description Converts leaflet center to gridviz proj geoCenter
     * proj4(fromProjection, toProjection, [coordinates])
     *
     */
    this.leafletToGeoCenter = function (latLon) {
        return proj4(this.proj, [latLon.lng, latLon.lat])
    }

    /**
     * @description Converts leaflet zoom level to gridviz zoom factor (pixel size, in ground m)
     *@deprecated
     */
    this.leafletZoomToGridvizZoom = function () {
        return this.getMetresPerPixel()
    }

    /**
     * @description Calculates meters per pixel at the current leaflet zoom level
     *
     */
    this.getMetresPerPixel = function () {
        let centerLatLng = this.map.getCenter() // get map center
        let pointC = this.map.latLngToContainerPoint(centerLatLng) // convert to containerpoint (pixels)
        let pointX = [pointC.x + 1, pointC.y] // add one pixel to x
        let pointY = [pointC.x, pointC.y + 1] // add one pixel to y

        // convert containerpoints to latlng's
        let latLngC = this.map.containerPointToLatLng(pointC)
        let latLngX = this.map.containerPointToLatLng(pointX)
        let latLngY = this.map.containerPointToLatLng(pointY)

        // let distanceX = latLngC.distanceTo(latLngX) // calculate distance between c and x (latitude)
        // let distanceY = latLngC.distanceTo(latLngY) // calculate distance between c and y (longitude)

        // convert to our projection
        let projCenter = this.leafletToGeoCenter(latLngC)
        let projX = this.leafletToGeoCenter(latLngX)
        let difference = projX[0] - projCenter[0]

        //console.log('zoom factor: ' + difference + '. Zoom level: ' + this.map._zoom)
        return difference
    }

    /**
     * @description build a gridviz app and add a layer to it
     * gridviz api: https://eurostat.github.io/gridviz/docs/reference
     */
    this.buildGridVizApp = function () {
        let container = this._canvas.parentElement
        let geoCenter = this.leafletToGeoCenter(this.map.getCenter())

        this.app = new gridviz.App(container, {
            canvas: this._canvas,
            w: window.innerWidth,
            h: window.innerHeight,
            disableZoom: true,
            selectionRectangleColor: opts.selectionRectangleColor || 'red',
            selectionRectangleWidthPix: opts.selectionRectangleWidthPix || '4',
            legendDivId: opts.legendDivId || 'gvizLegend',
            transparentBackground: true,
        }).setGeoCenter({ x: geoCenter[0], y: geoCenter[1] })
    }
}

L.GridvizLayer.prototype = new CanvasLayer.CanvasLayer() // -- setup prototype
