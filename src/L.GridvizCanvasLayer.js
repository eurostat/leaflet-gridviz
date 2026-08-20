/*
  Generic Canvas Layer for Leaflet 0.7–1.9
  Based on L.CanvasOverlay by Stanislav Sumbera (MIT)
  Updated by Joseph Davies for Leaflet 1.9+ and gridviz (EPSG:3035 / Proj4Leaflet)

  This version matches Leaflet's GridLayer zoom handling by listening to the
  'zoom' event (which fires continuously during pinch) rather than relying
  solely on 'zoomanim' (which requires zoomAnimation: true).
*/

// -----------------------------------------------------------------------------
// Polyfill for very old Leaflet builds
L.DomUtil.setTransform =
    L.DomUtil.setTransform ||
    function (el, offset, scale) {
        var pos = offset || new L.Point(0, 0)
        el.style[L.DomUtil.TRANSFORM] =
            (L.Browser.ie3d ? 'translate(' + pos.x + 'px,' + pos.y + 'px)' : 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)') +
            (scale ? ' scale(' + scale + ')' : '')
    }

// -----------------------------------------------------------------------------
// Canvas Layer definition
L.GridvizCanvasLayer = (L.Layer ? L.Layer : L.Class).extend({
    initialize: function (options) {
        this._map = null
        this._canvas = null
        this._frame = null
        this._delegate = null
        this._zooming = false
        L.setOptions(this, options)
    },

    delegate: function (del) {
        this._delegate = del
        return this
    },

    needRedraw: function () {
        if (!this._frame) {
            this._frame = L.Util.requestAnimFrame(this.drawLayer, this)
        }
        return this
    },

    _updatePosition: function () {
        requestAnimationFrame(() => {
            if (this._map == null) return
            if (this._map.containerPointToLayerPoint == null) return
            var topLeft = this._map.containerPointToLayerPoint([0, 0])
            L.DomUtil.setPosition(this._canvas, topLeft)
        })
    },

    // ---------------------------------------------------------------------------
    onAdd: function (map) {
        this._map = map
        this._canvas = L.DomUtil.create('canvas', 'leaflet-layer')
        this._canvas.style.transformOrigin = '0 0'
        // Leaflet's own CSS (.leaflet-zoom-anim .leaflet-zoom-animated) puts a
        // "transition: transform 0.25s" on every element carrying the
        // leaflet-zoom-animated class while an animated zoom is in progress - and
        // explicitly opts its own tiles back OUT of that (.leaflet-zoom-anim
        // .leaflet-tile { transition: none }), since it positions tiles itself via
        // JS every frame and doesn't want the browser fighting that. This canvas is
        // the same story - _onZoom/_onAnimZoom already update its transform every
        // frame during an active zoom, and _onZoomEnd/_updatePosition do deliberate
        // *instant* jumps afterwards (reset to identity, then to the position that
        // counters the pane's own pan offset). Without this, those instant jumps
        // inherit the CSS transition too, so the browser smoothly glides the canvas
        // across that (often large) distance instead of snapping - that's what read
        // as the layer "flying/sliding in from off-map" after a zoom interrupted an
        // in-flight pan. An inline style beats the class-based rule regardless of
        // which zoom-related classes end up on the map container.
        this._canvas.style.transition = 'none'

        L.DomUtil.addClass(this._canvas, 'leaflet-zoom-animated')
        L.DomUtil.addClass(this._canvas, 'gridviz-canvas-layer')

        var size = map.getSize()
        this._canvas.width = size.x
        this._canvas.height = size.y

        var animated = map.options.zoomAnimation && L.Browser.any3d
        L.DomUtil.addClass(this._canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'))

        // Create a dedicated pane for the canvas (useful for ordering)
        var pane = map.createPane('gridviz')
        pane.style.zIndex = 399
        pane.appendChild(this._canvas)
        // Use gridviz pane like other overlay layers
        // var pane = map.getPane('overlayPane')
        // pane.appendChild(this._canvas)

        map.on(this.getEvents(), this)

        var del = this._delegate || this
        if (del.onLayerDidMount) del.onLayerDidMount()

        this._updatePosition()
        this._initCanvasLevel()
        L.DomUtil.setTransform(this._canvas, L.point(0, 0), 1)
        this.needRedraw()
    },

    // ---------------------------------------------------------------------------
    onRemove: function (map) {
        var del = this._delegate || this
        if (del.onLayerWillUnmount) del.onLayerWillUnmount()

        if (this._frame) L.Util.cancelAnimFrame(this._frame)

        var pane = map.getPane('gridviz')
        if (this._canvas && this._canvas.parentElement === pane) {
            pane.removeChild(this._canvas)
        }
        map.off(this.getEvents(), this)
        this._canvas = null
    },

    // ---------------------------------------------------------------------------
    // Initialize a virtual canvas "level" that mirrors GridLayer logic
    _initCanvasLevel: function () {
        if (this._map) {
            var z = this._map.getZoom()
            var c = this._map.getCenter()
            var topLeft = this._map._getTopLeftPoint(c, z).round()
            this._canvasLevel = { zoom: z, origin: topLeft, el: this._canvas }
        }
    },

    // ---------------------------------------------------------------------------
    // This is the key method - matches GridLayer._setZoomTransform exactly
    _setZoomTransform: function (center, zoom) {
        if (!this._canvasLevel) return

        var level = this._canvasLevel
        var scale = this._map.getZoomScale(zoom, level.zoom)
        var translate = level.origin.multiplyBy(scale).subtract(this._map._getNewPixelOrigin(center, zoom)).round()

        if (L.Browser.any3d) {
            L.DomUtil.setTransform(this._canvas, translate, scale)
        } else {
            L.DomUtil.setPosition(this._canvas, translate)
        }
    },

    // ---------------------------------------------------------------------------
    // Event bindings - KEY CHANGE: listen to 'zoom' event like GridLayer does
    getEvents: function () {
        var events = {
            resize: this._onLayerDidResize,
            moveend: this._onMoveEnd,
            viewreset: this._onViewReset,
            zoom: this._onZoom, // Fires continuously during pinch!
            zoomstart: this._onZoomStart,
            zoomend: this._onZoomEnd,
        }

        // Also listen to zoomanim if zoomAnimation is enabled
        if (this._map && this._map.options.zoomAnimation && L.Browser.any3d) {
            events.zoomanim = this._onAnimZoom
        }

        return events
    },

    _onMoveEnd: function (e) {
        if (this._zooming) return
        this._updatePosition()
        this.drawLayer()
    },

    _onViewReset: function (e) {
        this._updatePosition()
        this._initCanvasLevel()
        L.DomUtil.setTransform(this._canvas, L.point(0, 0), 1)
        this.needRedraw()
    },

    // ---------------------------------------------------------------------------
    // Zoom handling

    _onZoomStart: function () {
        this._zooming = true
        this._initCanvasLevel()
    },

    // This fires continuously during pinch zoom - the key to smooth transforms!
    _onZoom: function () {
        if (!this._canvasLevel) {
            this._initCanvasLevel()
        }
        this._setZoomTransform(this._map.getCenter(), this._map.getZoom())
    },

    _onZoomEnd: function () {
        this._zooming = false

        // Reset transform to identity
        L.DomUtil.setTransform(this._canvas, L.point(0, 0), 1)

        // Re-align canvas position
        this._updatePosition()

        // Re-initialize level for next zoom
        this._initCanvasLevel()

        // Force redraw at new zoom level
        this.needRedraw()
    },

    // For animated zoom (scroll wheel with zoomAnimation: true)
    _onAnimZoom: function (e) {
        this._setZoomTransform(e.center, e.zoom)
    },

    // ---------------------------------------------------------------------------
    _onLayerDidResize: function (e) {
        this._canvas.width = e.newSize.x
        this._canvas.height = e.newSize.y
        this._updatePosition()
        L.DomUtil.setTransform(this._canvas, L.point(0, 0), 1)
        this._initCanvasLevel()
        this.drawLayer()
    },

    // ---------------------------------------------------------------------------
    addTo: function (map) {
        map.addLayer(this)
        return this
    },

    // ---------------------------------------------------------------------------
    // needRedraw() only schedules a new animation frame when this._frame is falsy,
    // so it doubles as a debounce guard. Bailing out here for an in-progress zoom
    // used to return *before* clearing that guard - once that happened, this._frame
    // was left permanently non-null (the frame that would have cleared it already
    // fired and returned early), so every future needRedraw() silently no-op'd
    // forever. In particular, if a 'viewreset' (see _onViewReset) lands while a zoom
    // that interrupted an in-flight pan-inertia animation is still finishing up, its
    // needRedraw() call gets jammed by this - and even _onZoomEnd's own explicit
    // needRedraw() call right after can't recover it, since the guard is already
    // stuck. The visible symptom: the canvas's CSS transform still gets reset/
    // repositioned correctly (that's handled separately in _onZoomEnd), but
    // onDrawLayer() - which is what re-syncs the actual drawn content to Leaflet's
    // new center/zoom - never runs again, so the layer keeps showing whatever it
    // last drew before the interrupted pan, "flying in" once its (now-correct)
    // position no longer matches its (stale) content. Always releasing the guard,
    // whether or not the draw actually ran, keeps needRedraw() usable afterwards.
    drawLayer: function () {
        if (this._zooming) {
            this._frame = null
            return
        }
        if (this.onDrawLayer) this.onDrawLayer()
        this._frame = null
    },
})

// Factory helper
L.gridvizCanvasLayer = function () {
    return new L.GridvizCanvasLayer()
}
