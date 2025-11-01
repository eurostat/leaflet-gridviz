/*
  Generic  Canvas Layer for leaflet 0.7 and 1.0-rc, 1.2, 1.3
  copyright Stanislav Sumbera,  2016-2018, MIT
  originally from L.CanvasOverlay: https://gist.github.com/Sumbera/11114288
  Heavily updated by Joseph Davies to support Leaflet 1.9+ and gridviz in EPSG:3035
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
// L.CanvasLayer
L.CanvasLayer = (L.Layer ? L.Layer : L.Class).extend({
  initialize: function (options) {
    this._map = null;
    this._canvas = null;
    this._frame = null;
    this._delegate = null;
    this._zooming = false;
    L.setOptions(this, options);
  },

  delegate: function (del) {
    this._delegate = del;
    return this;
  },

  needRedraw: function () {
    if (!this._frame) {
      this._frame = L.Util.requestAnimFrame(this.drawLayer, this);
    }
    return this;
  },

  // ---- Positioning (used only after pan/viewreset; never during zoomanim)
  _updatePosition: function () {
    var topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
  },

  // ---- Events: IMPORTANT — do NOT listen to 'zoom' or 'move' (they fire during animations)
  getEvents: function () {
    return {
      resize: this._onLayerDidResize,
      moveend: this._onLayerDidMove,   // rebase after pan finishes
      viewreset: this._onLayerDidMove, // e.g., setView/reset
      zoomstart: this._onZoomStart,
      zoomanim: this._onAnimZoom,      // CSS transform only
      zoomend: this._onZoomEnd
    };
  },

  // ---- Lifecycle
  onAdd: function (map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'leaflet-layer');
    this._canvas.style.transformOrigin = '0 0';
    L.DomUtil.addClass(this._canvas, 'leaflet-zoom-animated');

    var size = this._map.getSize();
    this._canvas.width = size.x;
    this._canvas.height = size.y;

    var animated = this._map.options.zoomAnimation && L.Browser.any3d;
    L.DomUtil.addClass(this._canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));

    // Put this in its own pane (like before)
    var ourPane = map.createPane('gridviz');
    map.getPane('gridviz').style.zIndex = 399;
    ourPane.appendChild(this._canvas);

    map.on(this.getEvents(), this);

    var del = this._delegate || this;
    if (del.onLayerDidMount) del.onLayerDidMount();

    // Initial pin to current view and first draw
    this._updatePosition();
    this.needRedraw();

    // Seed virtual zoom level state (used in zoomanim math)
    this._initCanvasLevel();

    // Ensure no residual transform
    L.DomUtil.setTransform(this._canvas, L.point(0, 0), 1);
  },

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

  // ---- Virtual level (identical idea to GridLayer)
  _initCanvasLevel: function () {
    var z = this._map.getZoom();
    this._canvasLevel = {
      zoom: z,
      origin: this._map
        .project(this._map.unproject(this._map.getPixelOrigin()), z)
        .round(),
      el: this._canvas
    };
  },

  // ---- Non-animated pan/view changes
  _onLayerDidMove: function () {
    if (this._zooming) return; // don't fight zoom animation
    this._updatePosition();
    this.drawLayer();
  },

  // ---- Zoom animation
  _onZoomStart: function () {
    this._zooming = true;

    // Snap element to pane origin so GridLayer's zoomanim math applies cleanly
    L.DomUtil.setPosition(this._canvas, L.point(0, 0));

    // Recompute level at the starting integer zoom
    this._initCanvasLevel();
  },

  _onAnimZoom: function (e) {
    // EXACTLY like GridLayer’s _setZoomTransform
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

  _onZoomEnd: function () {
    this._zooming = false;

    // Reset transform and go back to overlay anchoring for pans
    L.DomUtil.setTransform(this._canvas, L.point(0, 0), 1);
    this._updatePosition();

    // Rebase virtual level for the new integer zoom
    this._initCanvasLevel();

    // Now redraw content at the final zoom (Gridviz gets a clean frame)
    this.needRedraw();
  },

  // ---- Resize / View reset helpers
  _onLayerDidResize: function (e) {
    this._canvas.width  = e.newSize.x;
    this._canvas.height = e.newSize.y;

    // Re-anchor and clear any transform
    this._updatePosition();
    L.DomUtil.setTransform(this._canvas, L.point(0, 0), 1);

    // Rebase level and redraw
    this._initCanvasLevel();
    this.drawLayer();
  },

  // ---- Public helpers
  addTo: function (map) {
    map.addLayer(this);
    return this;
  },

  LatLonToMercator: function (latlon) {
    return {
      x: (latlon.lng * 6378137 * Math.PI) / 180,
      y: Math.log(Math.tan(((90 + latlon.lat) * Math.PI) / 360)) * 6378137
    };
  },

  drawLayer: function () {
    // IMPORTANT: do not let clients redraw during zoom anim
    if (this._zooming) { this._frame = null; return; }

    if (this.onDrawLayer) this.onDrawLayer(); // delegate to Gridviz, etc.
    this._frame = null;
  }
});

L.canvasLayer = function () {
  return new L.CanvasLayer();
};
