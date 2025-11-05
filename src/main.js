// main.js
//import L from 'leaflet';
import proj4 from 'proj4';
import { Map } from 'gridviz';
import './L.GridvizCanvasLayer.js'; // must define L.GridvizCanvasLayer on L

// define our projection (only if not already defined)
if (!proj4.defs('EPSG:3035')) {
    proj4.defs(
        'EPSG:3035',
        '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs'
    );
}

export function registerGridvizLayer(Lin = L) {
    if (!Lin) throw new Error('Leaflet L is required');
    if (!proj4) throw new Error('proj4 is required');
    if (!Map) throw new Error('gridviz.Map is required');
    if (!Lin.GridvizCanvasLayer) {
        throw new Error('L.GridvizCanvasLayer not found. Load ./L.GridvizCanvasLayer.js first.');
    }

    // ---- Your original class (scoped to Lin) ----
    Lin.GridvizLayer = function (opts) {
        opts = opts || {};
        this.proj = opts.proj || 'EPSG:3035'; // make sure proj4.defs() has this first
        this.gridvizMap = null; // gridviz map. See https://eurostat.github.io/gridviz/docs/reference
        this.onLayerDidMountCallback = opts.onLayerDidMountCallback || null;

        this.onLayerDidMount = function () {
            // build gridviz app
            this.buildGridvizMap();

            if (this.onLayerDidMountCallback) this.onLayerDidMountCallback(this.gridvizMap);

            // Resize observer
            this.addResizeObserver();
        };

        this.addResizeObserver = function () {
            const map = this._map;
            const mapContainer = map._container;

            const resizeObserver = new ResizeObserver((entries) => {
                if (!Array.isArray(entries) || !entries.length) return;

                // Let Leaflet settle its size, then sync to the final dimensions.
                map.invalidateSize({ debounceMoveend: true });
                map.once('resize', (e) => {
                    const size = (e && e.newSize) ? e.newSize : map.getSize();
                    const w = size.x | 0;
                    const h = size.y | 0;

                    if (this.gridvizMap.w === w && this.gridvizMap.h === h) return;

                    this.gridvizMap.w = w;
                    this.gridvizMap.h = h;
                    this.gridvizMap.geoCanvas.w = w;
                    this.gridvizMap.geoCanvas.h = h;
                    this.gridvizMap.geoCanvas.offscreenCanvas.width = w;
                    this.gridvizMap.geoCanvas.offscreenCanvas.height = h;

                    this._canvas.setAttribute('width', '' + w);
                    this._canvas.setAttribute('height', '' + h);

                    this._updatePosition();
                    L.DomUtil.setTransform(this._canvas, L.point(0, 0), 1);
                    this._initCanvasLevel();

                    this.gridvizMap.redraw();
                    this.needRedraw();
                });
            });

            resizeObserver.observe(mapContainer);
        };


        this.onLayerWillUnmount = function () {
            this.gridvizMap.destroy();
        };

        this.setData = function (_data) {
            this.needRedraw();
        };

        this.onDrawLayer = function (_info) {
            if (this._zooming) return; // defer to zoomend

            // Sync view to Leaflet
            const geoCenter = this.leafletToGeoCenter(this._map.getCenter());
            const zoomFactor = this.leafletZoomToGridvizZoom();
            this.gridvizMap.setView(geoCenter[0], geoCenter[1], zoomFactor);

            // Redraw gridviz canvas
            this.gridvizMap.redraw();
        };

        // Converts leaflet center to gridviz projection's geoCenter
        this.leafletToGeoCenter = function (latLon) {
            return proj4(this.proj, [latLon.lng, latLon.lat]);
        };

        // Converts leaflet zoom level to gridviz zoom factor (pixel size, in ground m)
        this.leafletZoomToGridvizZoom = function () {
            return this.getMetresPerPixel();
        };

        // Calculates meters per pixel at the current leaflet zoom level
        this.getMetresPerPixel = function () {
            const centerLatLng = this._map.getCenter();

            // convert to containerpoint (pixels)
            const pointC = this._map.latLngToContainerPoint(centerLatLng);
            const pointX = [pointC.x + 1, pointC.y]; // add one pixel to x

            // convert containerpoints to latlng's
            const latLngC = this._map.containerPointToLatLng(pointC);
            const latLngX = this._map.containerPointToLatLng(pointX);

            // convert to our projection
            const projCenter = this.leafletToGeoCenter(latLngC);
            const projX = this.leafletToGeoCenter(latLngX);
            const difference = projX[0] - projCenter[0];

            return difference;
        };

        // build a gridviz app and add a layer to it
        this.buildGridvizMap = function () {
            const geoCenter = this.leafletToGeoCenter(this._map.getCenter());
            opts.container = opts.container || this._canvas.parentElement;
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
                tooltip: { parentElement: document.body }
            });
        };
    };

    Lin.GridvizLayer.prototype = new Lin.GridvizCanvasLayer(); // inherit
    return Lin.GridvizLayer;
}

// auto-register in browsers if L is on window
if (typeof window !== 'undefined' && window.L && !window.L.GridvizLayer) {
    registerGridvizLayer(window.L);
}

export default registerGridvizLayer;
