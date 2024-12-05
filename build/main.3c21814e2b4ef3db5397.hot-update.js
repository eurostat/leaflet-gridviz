/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
self["webpackHotUpdateleaflet_gridviz"]("main",{

/***/ "./src/L.CanvasLayer.js":
/*!******************************!*\
  !*** ./src/L.CanvasLayer.js ***!
  \******************************/
/***/ (() => {

eval("/*\r\n  Generic  Canvas Layer for leaflet 0.7 and 1.0-rc, 1.2, 1.3\r\n  copyright Stanislav Sumbera,  2016-2018, sumbera.com , license MIT\r\n  originally created and motivated by L.CanvasOverlay  available here: https://gist.github.com/Sumbera/11114288  \r\n  \r\n  also thanks to contributors: heyyeyheman,andern,nikiv3, anyoneelse ?\r\n  enjoy !\r\n*/\r\n\r\n// -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7\r\n//------------------------------------------------------------------------------\r\nL.DomUtil.setTransform =\r\n    L.DomUtil.setTransform ||\r\n    function (el, offset, scale) {\r\n        var pos = offset || new L.Point(0, 0)\r\n\r\n        el.style[L.DomUtil.TRANSFORM] =\r\n            (L.Browser.ie3d ? 'translate(' + pos.x + 'px,' + pos.y + 'px)' : 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)') +\r\n            (scale ? ' scale(' + scale + ')' : '')\r\n    }\r\n\r\n// -- support for both  0.0.7 and 1.0.0 rc2 leaflet\r\nL.CanvasLayer = (L.Layer ? L.Layer : L.Class).extend({\r\n    // -- initialized is called on prototype\r\n    initialize: function (options) {\r\n        this._map = null\r\n        this._canvas = null\r\n        this._frame = null\r\n        this._delegate = null\r\n        L.setOptions(this, options)\r\n    },\r\n\r\n    delegate: function (del) {\r\n        this._delegate = del\r\n        return this\r\n    },\r\n\r\n    needRedraw: function () {\r\n        if (!this._frame) {\r\n            this._frame = L.Util.requestAnimFrame(this.drawLayer, this)\r\n        }\r\n        return this\r\n    },\r\n\r\n    //-------------------------------------------------------------\r\n    _onLayerDidResize: function (resizeEvent) {\r\n        this._canvas.width = resizeEvent.newSize.x\r\n        this._canvas.height = resizeEvent.newSize.y\r\n    },\r\n    //-------------------------------------------------------------\r\n    _updatePosition: function () {\r\n        var topLeft = this._map.containerPointToLayerPoint([0, 0])\r\n        L.DomUtil.setPosition(this._canvas, topLeft)\r\n    },\r\n    _onLayerDidMove: function () {\r\n        this._updatePosition()\r\n        this.drawLayer()\r\n    },\r\n    //-------------------------------------------------------------\r\n    getEvents: function () {\r\n        var events = {\r\n            resize: this._onLayerDidResize,\r\n            moveend: this._onLayerDidMove,\r\n            zoom: this._onLayerDidMove,\r\n        }\r\n        if (this._map.options.zoomAnimation && L.Browser.any3d) {\r\n            events.zoomanim = this._animateZoom\r\n        }\r\n\r\n        return events\r\n    },\r\n    //-------------------------------------------------------------\r\n    onAdd: function (map) {\r\n        this._map = map\r\n        this._canvas = L.DomUtil.create('canvas', 'leaflet-layer')\r\n        this.tiles = {}\r\n\r\n        var size = this._map.getSize()\r\n        this._canvas.width = size.x\r\n        this._canvas.height = size.y\r\n\r\n        var animated = this._map.options.zoomAnimation && L.Browser.any3d\r\n        L.DomUtil.addClass(this._canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'))\r\n\r\n        // map._panes.overlayPane.appendChild(this._canvas)\r\n        //create our own gridviz pane\r\n        let ourPane = map.createPane('gridviz')\r\n        map.getPane('gridviz').style.zIndex = 399\r\n        ourPane.appendChild(this._canvas)\r\n\r\n        map.on(this.getEvents(), this)\r\n\r\n        var del = this._delegate || this\r\n        del.onLayerDidMount && del.onLayerDidMount() // -- callback\\\r\n        this._updatePosition()\r\n        this.needRedraw()\r\n    },\r\n\r\n    //-------------------------------------------------------------\r\n    onRemove: function (map) {\r\n        var del = this._delegate || this\r\n        del.onLayerWillUnmount && del.onLayerWillUnmount() // -- callback\r\n\r\n        if (this._frame) {\r\n            L.Util.cancelAnimFrame(this._frame)\r\n        }\r\n\r\n        let panes = map.getPanes()\r\n        // let overlayPane = panes.overlayPane\r\n        let overlayPane = map.getPane('gridviz')\r\n        if (this._canvas) {\r\n            if (this._canvas.parentElement === overlayPane) {\r\n                overlayPane.removeChild(this._canvas)\r\n\r\n                map.off(this.getEvents(), this)\r\n\r\n                this._canvas = null\r\n            }\r\n        }\r\n    },\r\n\r\n    //------------------------------------------------------------\r\n    addTo: function (map) {\r\n        map.addLayer(this)\r\n        return this\r\n    },\r\n    // --------------------------------------------------------------------------------\r\n    LatLonToMercator: function (latlon) {\r\n        return {\r\n            x: (latlon.lng * 6378137 * Math.PI) / 180,\r\n            y: Math.log(Math.tan(((90 + latlon.lat) * Math.PI) / 360)) * 6378137,\r\n        }\r\n    },\r\n\r\n    //------------------------------------------------------------------------------\r\n    drawLayer: function () {\r\n        this.onDrawLayer()\r\n        this._frame = null\r\n    },\r\n    // -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7\r\n    //------------------------------------------------------------------------------\r\n    _setTransform: function (el, offset, scale) {\r\n        var pos = offset || new L.Point(0, 0)\r\n\r\n        el.style[L.DomUtil.TRANSFORM] =\r\n            (L.Browser.ie3d ? 'translate(' + pos.x + 'px,' + pos.y + 'px)' : 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)') +\r\n            (scale ? ' scale(' + scale + ')' : '')\r\n    },\r\n\r\n    //------------------------------------------------------------------------------\r\n    _animateZoom: function (e) {\r\n        var scale = this._map.getZoomScale(e.zoom)\r\n        // -- different calc of animation zoom  in leaflet 1.0.3 thanks @peterkarabinovic, @jduggan1\r\n        var offset = L.Layer\r\n            ? this._map._latLngBoundsToNewLayerBounds(this._map.getBounds(), e.zoom, e.center).min\r\n            : this._map._getCenterOffset(e.center)._multiplyBy(-scale).subtract(this._map._getMapPanePos())\r\n\r\n        L.DomUtil.setTransform(this._canvas, offset, scale)\r\n    },\r\n\r\n})\r\n\r\nL.canvasLayer = function () {\r\n    return new L.CanvasLayer()\r\n}\r\n\n\n//# sourceURL=webpack://leaflet-gridviz/./src/L.CanvasLayer.js?");

/***/ })

},
/******/ function(__webpack_require__) { // webpackRuntimeModules
/******/ /* webpack/runtime/getFullHash */
/******/ (() => {
/******/ 	__webpack_require__.h = () => ("b494bb7aea7baf31f6e3")
/******/ })();
/******/ 
/******/ }
);