// main.js
//import L from 'leaflet';
import proj4 from 'proj4'
import { Map } from 'gridviz'
import './L.GridvizCanvasLayer.js' // must define L.GridvizCanvasLayer on L

// define our projection (only if not already defined)
if (!proj4.defs('EPSG:3035')) {
    proj4.defs('EPSG:3035', '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs')
}

export function registerGridvizLayer(Lin = L) {
    if (!Lin) throw new Error('Leaflet L is required')
    if (!proj4) throw new Error('proj4 is required')
    if (!Map) throw new Error('gridviz.Map is required')
    if (!Lin.GridvizCanvasLayer) {
        throw new Error('L.GridvizCanvasLayer not found. Load ./L.GridvizCanvasLayer.js first.')
    }

    // ---- Your original class (scoped to Lin) ----
    Lin.GridvizLayer = function (opts) {
        opts = opts || {}
        this.proj = opts.proj || 'EPSG:3035' // make sure proj4.defs() has this first
        this.gridvizMap = null // gridviz map. See https://eurostat.github.io/gridviz/docs/reference
        this.onLayerDidMountCallback = opts.onLayerDidMountCallback || null
        this.legendContainer = opts.legendContainer || null
        // canvas padding (L.GridvizCanvasLayer options.padding)
        if (opts.padding !== undefined) this.options = Object.assign({}, this.options, { padding: opts.padding })
        // a container given by the user (otherwise the canvas's pane, per Leaflet map)
        const userContainer = opts.container

        this.onLayerDidMount = function () {
            // build the gridviz app once; when the layer is added again, the same one is
            // reused (with its datasets, tile caches and WebGL resources) - see destroy()
            // (rebuilt when added to another Leaflet map: the old one is tied to that map's pane)
            if (this.gridvizMap && !this.gridvizMap._destroyed && this._gridvizLeafletMap !== this._map) {
                this.gridvizMap.destroy()
                this.gridvizMap = null
            }
            if (!this.gridvizMap || this.gridvizMap._destroyed) this.buildGridvizMap()
            else this.syncGridvizSize()

            if (this.onLayerDidMountCallback) this.onLayerDidMountCallback(this.gridvizMap)

            //set cursor to pointer
            this._canvas.style.cursor = 'pointer'

            // Resize observer
            this.addResizeObserver(this._canvas)
        }

        // gridviz map size = canvas size (the Leaflet map's size, plus the padding)
        this.syncGridvizSize = function () {
            const size = this._getCanvasSize()
            const w = size.x | 0
            const h = size.y | 0
            const gv = this.gridvizMap
            if (gv.w === w && gv.h === h) return
            gv.w = w
            gv.h = h
            gv.geoCanvas.w = w
            gv.geoCanvas.h = h
            gv.geoCanvas.offscreenCanvas.width = w
            gv.geoCanvas.offscreenCanvas.height = h
            this._canvas.setAttribute('width', '' + w)
            this._canvas.setAttribute('height', '' + h)
        }

        // Draws the gridviz map now. With a gridviz that schedules redraw() (asyncRedraw),
        // drawing in the same frame as the canvas is repositioned keeps content and
        // position in step.
        this.redrawGridvizNow = function () {
            if (this.gridvizMap.redrawNow) this.gridvizMap.redrawNow()
            else this.gridvizMap.redraw()
        }

        this.addResizeObserver = function (canvas) {
            const map = this._map
            const mapContainer = map._container
            if (this._resizeObserver) this._resizeObserver.disconnect()

            const resizeObserver = new ResizeObserver((entries) => {
                if (!Array.isArray(entries) || !entries.length) return

                // Let Leaflet settle its size, then sync to the final dimensions.
                map.invalidateSize({ debounceMoveend: true })
                map.once('resize', (e) => {
                    // removed meanwhile
                    if (!this._map || !this.gridvizMap) return
                    const size = this._getCanvasSize(e && e.newSize ? e.newSize : map.getSize())
                    const w = size.x | 0
                    const h = size.y | 0

                    if (this.gridvizMap.w === w && this.gridvizMap.h === h) return

                    this.syncGridvizSize()

                    if (canvas) {
                        L.DomUtil.setTransform(canvas, L.point(0, 0), 1)
                        this._updatePosition()
                        this._initCanvasLevel()
                    }

                    // one redraw, in the next frame with the repositioned canvas
                    this.needRedraw()
                })
            })

            resizeObserver.observe(mapContainer)
            this._resizeObserver = resizeObserver
        }

        // Removing the layer keeps its gridviz map for when it's added again: only what
        // ties it to the page is released (the resize observer, a pending redraw, the
        // tooltip). Call destroy() to dispose of it for good.
        this.onLayerWillUnmount = function () {
            if (this._resizeObserver) this._resizeObserver.disconnect()
            this._resizeObserver = null
            if (!this.gridvizMap) return
            if (this.gridvizMap._redrawFrame) {
                cancelAnimationFrame(this.gridvizMap._redrawFrame)
                this.gridvizMap._redrawFrame = null
            }
            if (this.gridvizMap.tooltip) this.gridvizMap.tooltip.hide()
        }

        /** Disposes of the gridviz map (remove the layer from the map first). */
        this.destroy = function () {
            if (this._map) this._map.removeLayer(this)
            if (this.gridvizMap) this.gridvizMap.destroy()
            this.gridvizMap = null
            this._canvas = null
            return this
        }

        this.setData = function (_data) {
            this.needRedraw()
        }

        this.onDrawLayer = function (_info) {
            if (this._zooming) return // defer to zoomend

            // Sync view to Leaflet
            if (this._map && this.gridvizMap) {
                const geoCenter = this.leafletToGeoCenter(this._map.getCenter())
                const zoomFactor = this.leafletZoomToGridvizZoom()
                this.gridvizMap.setView(geoCenter[0], geoCenter[1], zoomFactor)

                // Redraw gridviz canvas, in this frame
                this.redrawGridvizNow()
            }
        }

        // Converts leaflet center to gridviz projection's geoCenter
        this.leafletToGeoCenter = function (latLon) {
            return proj4(this.proj, [latLon.lng, latLon.lat])
        }

        // Converts leaflet zoom level to gridviz zoom factor (pixel size, in ground m)
        this.leafletZoomToGridvizZoom = function () {
            return this.getMetresPerPixel()
        }

        // Calculates meters per pixel at the current leaflet zoom level
        this.getMetresPerPixel = function () {
            const centerLatLng = this._map.getCenter()

            // convert to containerpoint (pixels)
            const pointC = this._map.latLngToContainerPoint(centerLatLng)
            const pointX = [pointC.x + 1, pointC.y] // add one pixel to x

            // convert containerpoints to latlng's
            const latLngC = this._map.containerPointToLatLng(pointC)
            const latLngX = this._map.containerPointToLatLng(pointX)

            // convert to our projection
            const projCenter = this.leafletToGeoCenter(latLngC)
            const projX = this.leafletToGeoCenter(latLngX)
            const difference = projX[0] - projCenter[0]

            return difference
        }

        // build a gridviz app and add a layer to it
        this.buildGridvizMap = function () {
            const geoCenter = this.leafletToGeoCenter(this._map.getCenter())
            opts.container = userContainer || this._canvas.parentElement
            this._gridvizLeafletMap = this._map
            const size = this._getCanvasSize()
            this.gridvizMap = new Map(opts.container, {
                canvas: this._canvas,
                // the canvas's size (the window's used to be given: wrong until the first resize)
                w: size.x,
                h: size.y,
                // draw once per animation frame however many tiles arrive (gridviz >= 3.0.37)
                asyncRedraw: true,
                x: geoCenter[0],
                y: geoCenter[1],
                z: this.leafletZoomToGridvizZoom(),
                disableZoom: true,
                transparentBackground: true,
                selectionRectangleColor: opts.selectionRectangleColor,
                selectionRectangleWidthPix: opts.selectionRectangleWidthPix,
                legendContainer: opts.legendContainer,
                tooltip: { parentElement: document.body },
            })
        }
    }

    Lin.GridvizLayer.prototype = new Lin.GridvizCanvasLayer() // inherit
    return Lin.GridvizLayer
}

// auto-register in browsers if L is on window
if (typeof window !== 'undefined' && window.L && !window.L.GridvizLayer) {
    registerGridvizLayer(window.L)
}

export default registerGridvizLayer
