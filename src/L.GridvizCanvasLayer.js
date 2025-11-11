/*
  Generic Canvas Layer for Leaflet 0.7–1.9
  Based on L.CanvasOverlay by Stanislav Sumbera (MIT)
  Updated by Joseph Davies for Leaflet 1.9+ and gridviz (EPSG:3035 / Proj4Leaflet)

  This version reproduces Leaflet’s GridLayer zoom animation behavior precisely,
  ensuring perfect alignment with tiled layers even after panning.
*/

// -----------------------------------------------------------------------------
// Polyfill for very old Leaflet builds
L.DomUtil.setTransform =
  L.DomUtil.setTransform ||
  function (el, offset, scale) {
    var pos = offset || new L.Point(0, 0);
    el.style[L.DomUtil.TRANSFORM] =
      (L.Browser.ie3d
        ? 'translate(' + pos.x + 'px,' + pos.y + 'px)'
        : 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)') +
      (scale ? ' scale(' + scale + ')' : '');
  };

// -----------------------------------------------------------------------------
// Canvas Layer definition
L.GridvizCanvasLayer = (L.Layer ? L.Layer : L.Class).extend({
  initialize: function (options) {
    this._map = null;
    this._canvas = null;
    this._frame = null;
    this._delegate = null;
    this._zooming = false;
    L.setOptions(this, options);
  },

  // Optional: external object (e.g., Gridviz) can handle draw callbacks
  delegate: function (del) {
    this._delegate = del;
    return this;
  },

  // Request an animation frame to trigger redraw
  needRedraw: function () {
    if (!this._frame) {
      this._frame = L.Util.requestAnimFrame(this.drawLayer, this);
    }
    return this;
  },

  // Anchors the canvas to the map’s current top-left corner
  _updatePosition: function () {
    requestAnimationFrame(() => {
      if (this._map == null) return;
      if (this._map.containerPointToLayerPoint == null) return;
      var topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);
    });
  },



  // ---------------------------------------------------------------------------
  // Add layer to map and initialize canvas
  onAdd: function (map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'leaflet-layer');
    this._canvas.style.transformOrigin = '0 0';
    L.DomUtil.addClass(this._canvas, 'leaflet-zoom-animated');

    var size = map.getSize();
    this._canvas.width = size.x;
    this._canvas.height = size.y;

    var animated = map.options.zoomAnimation && L.Browser.any3d;
    L.DomUtil.addClass(this._canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));

    // Create a dedicated pane for the canvas (useful for ordering)
    var pane = map.createPane('gridviz');
    pane.style.zIndex = 399;
    pane.style.cursor = 'pointer'; // do this in gridviz instead?
    pane.appendChild(this._canvas);

    map.on(this.getEvents(), this);

    // Fire callback when mounted (e.g., to build gridviz app)
    var del = this._delegate || this;
    if (del.onLayerDidMount) del.onLayerDidMount();

    this._updatePosition();      // Place for current view
    this._initCanvasLevel();     // Seed for zoom animation math
    L.DomUtil.setTransform(this._canvas, L.point(0, 0), 1);
    this.needRedraw();
  },

  // ---------------------------------------------------------------------------
  // Remove layer and clean up
  onRemove: function (map) {
    var del = this._delegate || this;
    if (del.onLayerWillUnmount) del.onLayerWillUnmount();

    if (this._frame) L.Util.cancelAnimFrame(this._frame);

    var pane = map.getPane('gridviz');
    if (this._canvas && this._canvas.parentElement === pane) {
      pane.removeChild(this._canvas);
      map.off(this.getEvents(), this);
      this._canvas = null;
    }
  },

  // ---------------------------------------------------------------------------
  // Initialize a virtual canvas "level" that mirrors GridLayer logic
  // This ensures zoom animations stay aligned with Leaflet’s tile transforms
  _initCanvasLevel: function () {
    if (this._map) {
      var z = this._map.getZoom();
      var c = this._map.getCenter();

      // The top-left point of the current map view in pixel coordinates
      // This is the same origin used by Leaflet’s GridLayer for its zoom math
      var topLeft = this._map._getTopLeftPoint(c, z).round();

      this._canvasLevel = { zoom: z, origin: topLeft, el: this._canvas };
    } else {
      console.warn('GridvizCanvasLayer: _initCanvasLevel called before map init');
    }
  },

  // ---------------------------------------------------------------------------

  // Event bindings for panning, zooming, resizing
  getEvents: function () {
    return {
      resize: this._onLayerDidResize,
      movestart: this._onMoveStart,   // ← panning begins (only real pan)
      moveend: this._onMoveEnd,  // ← updated
      viewreset: this._onLayerDidMove,
      zoomstart: this._onZoomStart,
      zoomanim: this._onAnimZoom,
      zoomend: this._onZoomEnd
    };
  },

  _onMoveStart: function (e) {
    // If Leaflet is currently animating a zoom, this movestart is NOT a real pan.
    //this._panning = true;
  },

  // handle move end
  _onMoveEnd: function (e) {
    //this._panning = false;
    // if (this._wasHiddenForPan) {
    //   this._canvas.style.visibility = 'visible';
    //   this._wasHiddenForPan = false;
    // }

    // original behavior
    this._onLayerDidMove();
  },

  _onLayerDidMove: function () {
    this._updatePosition();
    this.drawLayer();
  },

  // ---------------------------------------------------------------------------
  // Zoom animation lifecycle

  _onZoomStart: function () {
    L.DomUtil.setPosition(this._canvas, L.point(0, 0));
    this._initCanvasLevel();
  },

  _onZoomEnd: function () {
    // Re-align after zoom ends
    this._updatePosition();
    this._initCanvasLevel();
  },

  _onAnimZoom: function (e) {
    // if (this._panning) {
    //   this._canvas.style.visibility = 'hidden';
    //   this._wasHiddenForPan = true;
    // }

    // Replicates GridLayer._setZoomTransform
    var level = this._canvasLevel;
    var scale = this._map.getZoomScale(e.zoom, level.zoom);
    var translate = level.origin
      .multiplyBy(scale)
      .subtract(this._map._getNewPixelOrigin(e.center, e.zoom))
      .round();

    if (L.Browser.any3d) {
      L.DomUtil.setTransform(level.el, translate, scale);
    } else {
      L.DomUtil.setPosition(level.el, translate);
    }
  },

  // ---------------------------------------------------------------------------
  // Resize or view reset
  _onLayerDidResize: function (e) {
    this._canvas.width = e.newSize.x;
    this._canvas.height = e.newSize.y;
    this._updatePosition();
    L.DomUtil.setTransform(this._canvas, L.point(0, 0), 1);
    this._initCanvasLevel();
    this.drawLayer();
  },

  // ---------------------------------------------------------------------------
  // Add helper for chaining
  addTo: function (map) {
    map.addLayer(this);
    return this;
  },

  // ---------------------------------------------------------------------------
  // Triggered when drawing is needed
  drawLayer: function () {
    // Skip if zooming (Gridviz redraws on zoomend)
    if (this._zooming) return;
    if (this.onDrawLayer) this.onDrawLayer(); // delegate to external renderer
    this._frame = null;
  }
});

// Factory helper
L.gridvizCanvasLayer = function () {
  return new L.GridvizCanvasLayer();
};
