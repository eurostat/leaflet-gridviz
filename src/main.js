import proj4 from 'proj4'
import { Map } from 'gridviz'
import './L.CanvasLayer.js'

// define our projection
proj4.defs('EPSG:3035', '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs')

/** An extension of L.CanvasLayer (leaflet-canvas-layer) for integrating gridviz into Leaflet
 *  @description 
 *  methods	description
    needRedraw - will schedule next frame call for drawLayer
    delegate(object) - optionaly set receiver of the events if not 'inheriting' from L.CanvasLayer
 * 
 */
L.GridvizLayer = function (opts) {
    opts = opts || {}
    this.proj = opts.proj || 'EPSG:3035'     // proj4 projection definition name. Make sure to add it using proj4.defs() first
    this.gridvizMap = null //gridviz map. See https://eurostat.github.io/gridviz/docs/reference
    this.onLayerDidMountCallback = opts.onLayerDidMountCallback || null // Specify a callback function to fire when the layer is added to the map and the gridviz app is built

    /**
     * @description Fires after leaflet layer canvas is attached/added to the map
     *
     */
    this.onLayerDidMount = function () {
        // build gridviz app
        this.buildGridvizMap();

        if (this.onLayerDidMountCallback) this.onLayerDidMountCallback(this.gridvizMap);

        // Resize observer
        this.addResizeObserver()

    };

    this.addResizeObserver = function () {
        const mapContainer = this._map._container;
        const resizeObserver = new ResizeObserver((entries) => {
            window.requestAnimationFrame(() => {
                if (!Array.isArray(entries) || !entries.length) return;
                if (this.gridvizMap.h !== mapContainer.clientHeight || this.gridvizMap.w !== mapContainer.clientWidth) {
                    this.gridvizMap.h = mapContainer.clientHeight;
                    this.gridvizMap.w = mapContainer.clientWidth;
                    this.gridvizMap.geoCanvas.h = mapContainer.clientHeight;
                    this.gridvizMap.geoCanvas.w = mapContainer.clientWidth;
                    this._canvas.setAttribute('width', '' + this.gridvizMap.w);
                    this._canvas.setAttribute('height', '' + this.gridvizMap.h);
                    this.gridvizMap.redraw();
                    this.needRedraw()
                }
            });
        });
        resizeObserver.observe(mapContainer);
    }

    /**
     * @description Fires before layer is removed from the map
     *
     */
    this.onLayerWillUnmount = function () {
        this.gridvizMap.destroy();
    };

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
        if (this._zooming) return; // defer to zoomend

        // Sync view to Leaflet
        const geoCenter = this.leafletToGeoCenter(this._map.getCenter());
        const zoomFactor = this.leafletZoomToGridvizZoom();
        this.gridvizMap.setView(geoCenter[0], geoCenter[1], zoomFactor);

        // Redraw gridviz canvas
        this.gridvizMap.redraw();
    };

    /**
     * @description Converts gridviz geoCenter to leaflet center
     * proj4(fromProjection, toProjection, [coordinates])
     * @param {number} x
     * @param {number} y
     */
    this.geoCenterToLeaflet = function (x, y) {
        let xy = proj4(this.proj, 'WGS84', [x, y])
        return [xy[1], xy[0]] // leaflet uses [lat,lon]
    }

    /**
     * @description Converts leaflet center to gridviz projection's geoCenter
     * proj4(fromProjection, toProjection, [coordinates])
     * @param {{lng: number, lat: number}} latLon leaflet latLon object
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
        // get map center
        let centerLatLng = this._map.getCenter()

        // convert to containerpoint (pixels)
        let pointC = this._map.latLngToContainerPoint(centerLatLng)
        let pointX = [pointC.x + 1, pointC.y] // add one pixel to x

        // convert containerpoints to latlng's
        let latLngC = this._map.containerPointToLatLng(pointC)
        let latLngX = this._map.containerPointToLatLng(pointX)

        // convert to our projection
        let projCenter = this.leafletToGeoCenter(latLngC)
        let projX = this.leafletToGeoCenter(latLngX)
        let difference = projX[0] - projCenter[0]

        //console.log('zoom factor: ' + difference + '. Zoom level: ' + this._map._zoom)
        return difference
    }

    /**
     * @description build a gridviz app and add a layer to it
     * gridviz api: https://eurostat.github.io/gridviz/docs/reference
     * Uses (optionally):
     * opts.container
     * opts.selectionRectangleColor
     * opts.selectionRectangleWidthPix
     * opts.legendDivId
     */
    this.buildGridvizMap = function () {
        let geoCenter = this.leafletToGeoCenter(this._map.getCenter())
        opts.container = opts.container || this._canvas.parentElement
        this.gridvizMap = new Map(opts.container, {
            canvas: this._canvas,
            w: window.innerWidth,
            h: window.innerHeight,
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

L.GridvizLayer.prototype = new L.CanvasLayer() // -- setup prototype
