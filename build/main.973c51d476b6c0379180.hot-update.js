"use strict";
/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
self["webpackHotUpdateleaflet_gridviz"]("main",{

/***/ "./src/main.js":
/*!*********************!*\
  !*** ./src/main.js ***!
  \*********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var leaflet__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! leaflet */ \"./node_modules/leaflet/dist/leaflet-src.js\");\n/* harmony import */ var leaflet__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(leaflet__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var leaflet_canvas_layer__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! leaflet-canvas-layer */ \"./node_modules/leaflet-canvas-layer/dist/leaflet-canvas-layer.js\");\n/* harmony import */ var leaflet_canvas_layer__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(leaflet_canvas_layer__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var gridviz__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! gridviz */ \"./node_modules/gridviz/dist/gridviz.min.js\");\n/* harmony import */ var gridviz__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(gridviz__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var d3_scale_chromatic__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! d3-scale-chromatic */ \"./node_modules/d3-scale-chromatic/src/sequential-multi/viridis.js\");\n\r\n\r\n\r\n\r\n\r\n/** An extension of L.CanvasLayer (leaflet-canvas-layer) for integrating gridviz into Leaflet\r\n *  @description \r\n *  methods\tdescription\r\n    needRedraw - will schedule next frame call for drawLayer\r\n    delegate(object) - optionaly set receiver of the events if not 'inheriting' from L.CanvasLayer\r\n * \r\n */\r\nleaflet__WEBPACK_IMPORTED_MODULE_0__.GridvizLayer = function () {\r\n    this.onLayerDidMount = function (info) {\r\n        // after canvas is attached/added to the map\r\n        this.buildGridVizApp()\r\n    }\r\n    this.onLayerWillUnmount = function () {\r\n        // before layer is removed from the map\r\n    }\r\n    this.setData = function (data) {\r\n        // -- custom data set\r\n        this.needRedraw() // -- call to drawLayer\r\n    }\r\n    this.onDrawLayer = function (info) {\r\n        // -- when layer is drawn , info contains view parameters like bounds, size, canvas etc.\r\n        console.log(info)\r\n    }\r\n\r\n    this.buildGridVizApp = function () {\r\n        this.app = new gridviz__WEBPACK_IMPORTED_MODULE_2__.App(this._canvas, { w: window.innerWidth, h: window.innerHeight })\r\n            .setGeoCenter({ x: 4000000, y: 2960000 })\r\n            .setZoomFactor(1000)\r\n            .setZoomFactorExtent([30, 7000])\r\n            .setBackgroundColor('black')\r\n            .setLabelLayer(\r\n                gridviz__WEBPACK_IMPORTED_MODULE_2__.getEuronymeLabelLayer('EUR', 50, {\r\n                    ex: 2,\r\n                    fontFamily: 'mfLeg',\r\n                    exSize: 0.9,\r\n                    color: () => 'black',\r\n                    haloColor: () => '#ffffff',\r\n                    haloWidth: () => 3,\r\n                })\r\n            )\r\n            .setBoundaryLayer(\r\n                gridviz__WEBPACK_IMPORTED_MODULE_2__.getEurostatBoundariesLayer({\r\n                    scale: '10M',\r\n                    col: '#fff5',\r\n                    lineDash: () => [],\r\n                })\r\n            )\r\n            .addMultiScaleTiledGridLayer(\r\n                [1000, 2000, 5000, 10000, 20000, 50000, 100000],\r\n                (r) =>\r\n                    'https://raw.githubusercontent.com/jgaffuri/tiledgrids/main/data/europe/population/' +\r\n                    r +\r\n                    'm/',\r\n                gridviz__WEBPACK_IMPORTED_MODULE_2__.TanakaStyle.get('2018', {\r\n                    tFun: (v, r, s, zf) => gridviz__WEBPACK_IMPORTED_MODULE_2__.sExpRev((v - s.min) / (s.max - s.min), -7),\r\n                    nb: 6,\r\n                    color: (t) => (0,d3_scale_chromatic__WEBPACK_IMPORTED_MODULE_3__.inferno)(t * 0.9 + 0.1),\r\n                    colDark: '#333',\r\n                }),\r\n                {\r\n                    pixNb: 6,\r\n                    cellInfoHTML: (c) => '<b>' + c['2018'] + '</b> inhabitant(s)',\r\n                }\r\n            )\r\n    }\r\n\r\n    console.log(this)\r\n}\r\n\r\nleaflet__WEBPACK_IMPORTED_MODULE_0__.GridvizLayer.prototype = new leaflet_canvas_layer__WEBPACK_IMPORTED_MODULE_1__.CanvasLayer() // -- setup prototype\r\n\n\n//# sourceURL=webpack://leaflet-gridviz/./src/main.js?");

/***/ })

},
/******/ function(__webpack_require__) { // webpackRuntimeModules
/******/ /* webpack/runtime/getFullHash */
/******/ (() => {
/******/ 	__webpack_require__.h = () => ("56f535a0a08cb48cd12f")
/******/ })();
/******/ 
/******/ }
);