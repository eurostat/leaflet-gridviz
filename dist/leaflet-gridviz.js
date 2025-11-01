/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 271:
/***/ (() => {

/*
  Generic  Canvas Layer for leaflet 0.7 and 1.0-rc, 1.2, 1.3
  copyright Stanislav Sumbera,  2016-2018, sumbera.com , license MIT
  originally created and motivated by L.CanvasOverlay  available here: https://gist.github.com/Sumbera/11114288  

  also thanks to contributors: heyyeyheman,andern,nikiv3, anyoneelse ?
  enjoy !
*/

// updated heavily by Joseph Davies in order to support Leaflet 1.9+ and gridviz in EPSG:3035
//------------------------------------------------------------------------------

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

// -- support for both 0.0.7 and 1.0.0 rc2 leaflet
L.CanvasLayer = (L.Layer ? L.Layer : L.Class).extend({
  // -- initialized is called on prototype
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

  // ---------------------------------------------------------------------------
  // Positioning: keep classic overlay anchoring for panning
  _updatePosition: function () {
    // original overlay anchor: containerPointToLayerPoint([0,0])
    var topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
  },

  // ---------------------------------------------------------------------------
  getEvents: function () {
    return {
      resize: this._onLayerDidResize,
      // Keep original "pan at end" behavior that Gridviz expects:
      moveend: this._onLayerDidMove,
      viewreset: this._onLayerDidMove,
      zoom: this._onLayerDidMove,

      // Smooth zoom animation:
      zoomstart: this._onZoomStart,
      zoomanim: this._onAnimZoom,
      zoomend: this._onZoomEnd
    };
  },

  // ---------------------------------------------------------------------------
  onAdd: function (map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'leaflet-layer');
    this._canvas.style.transformOrigin = '0 0';
    L.DomUtil.addClass(this._canvas, 'leaflet-zoom-animated');
    this.tiles = {};

    var size = this._map.getSize();
    this._canvas.width = size.x;
    this._canvas.height = size.y;

    var animated = this._map.options.zoomAnimation && L.Browser.any3d;
    L.DomUtil.addClass(this._canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));

    // Create our own pane for Gridviz
    var ourPane = map.createPane('gridviz');
    map.getPane('gridviz').style.zIndex = 399;
    ourPane.appendChild(this._canvas);

    map.on(this.getEvents(), this);

    var del = this._delegate || this;
    if (del.onLayerDidMount) del.onLayerDidMount(); // callback

    this._updatePosition();
    this.needRedraw();

    // Seed virtual level for zoom animations
    this._initCanvasLevel();
    L.DomUtil.setTransform(this._canvas, L.point(0, 0), 1);
  },

  // ---------------------------------------------------------------------------
  onRemove: function (map) {
    var del = this._delegate || this;
    if (del.onLayerWillUnmount) del.onLayerWillUnmount(); // callback

    if (this._frame) {
      L.Util.cancelAnimFrame(this._frame);
    }

    var overlayPane = map.getPane('gridviz');
    if (this._canvas && this._canvas.parentElement === overlayPane) {
      overlayPane.removeChild(this._canvas);
      map.off(this.getEvents(), this);
      this._canvas = null;
    }
  },

  // ---------------------------------------------------------------------------
  // Virtual level initializer used for zoom animation math (GridLayer-identical)
  _initCanvasLevel: function () {
    var z = this._map.getZoom();
    this._canvasLevel = {
      zoom: z,
      origin: this._map.project(this._map.unproject(this._map.getPixelOrigin()), z).round(),
      el: this._canvas
    };
  },

  // ---------------------------------------------------------------------------
  // Pan + non-animated changes (original behavior Gridviz expects)
  _onLayerDidMove: function () {
    this._updatePosition();
    this.drawLayer();
  },

  // ---------------------------------------------------------------------------
  // Smooth zoom handlers
  _onZoomStart: function () {
    this._zooming = true;
    // Snap element to pane origin so GridLayer formula applies cleanly
    L.DomUtil.setPosition(this._canvas, L.point(0, 0));
    this._initCanvasLevel();
  },

  _onAnimZoom: function (e) {
    // IDENTICAL to GridLayer's _setZoomTransform
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
    // Reset transform and restore overlay anchoring for panning
    L.DomUtil.setTransform(this._canvas, L.point(0, 0), 1);
    this._updatePosition();
    this._initCanvasLevel();
    this.needRedraw();
  },

  // ---------------------------------------------------------------------------
  _onLayerDidResize: function (e) {
    this._canvas.width = e.newSize.x;
    this._canvas.height = e.newSize.y;
    this._updatePosition();
    L.DomUtil.setTransform(this._canvas, L.point(0, 0), 1);
    this._initCanvasLevel();
    this.drawLayer();
  },

  // ---------------------------------------------------------------------------
  addTo: function (map) {
    map.addLayer(this);
    return this;
  },

  // --------------------------------------------------------------------------------
  LatLonToMercator: function (latlon) {
    return {
      x: (latlon.lng * 6378137 * Math.PI) / 180,
      y: Math.log(Math.tan(((90 + latlon.lat) * Math.PI) / 360)) * 6378137
    };
  },

  //------------------------------------------------------------------------------
  drawLayer: function () {
    // delegate to consumer (e.g., Gridviz) for actual drawing
    if (this.onDrawLayer) this.onDrawLayer();
    this._frame = null;
  }
});

L.canvasLayer = function () {
  return new L.CanvasLayer();
};


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
// This entry needs to be wrapped in an IIFE because it needs to be in strict mode.
(() => {
"use strict";

;// ./node_modules/proj4/lib/global.js
/* harmony default export */ function global(defs) {
  defs('EPSG:4326', '+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees');
  defs('EPSG:4269', '+title=NAD83 (long/lat) +proj=longlat +a=6378137.0 +b=6356752.31414036 +ellps=GRS80 +datum=NAD83 +units=degrees');
  defs('EPSG:3857', '+title=WGS 84 / Pseudo-Mercator +proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs');
  // UTM WGS84
  for (var i = 1; i <= 60; ++i) {
    defs('EPSG:' + (32600 + i), '+proj=utm +zone=' + i + ' +datum=WGS84 +units=m');
    defs('EPSG:' + (32700 + i), '+proj=utm +zone=' + i + ' +south +datum=WGS84 +units=m');
  }

  defs.WGS84 = defs['EPSG:4326'];
  defs['EPSG:3785'] = defs['EPSG:3857']; // maintain backward compat, official code is 3857
  defs.GOOGLE = defs['EPSG:3857'];
  defs['EPSG:900913'] = defs['EPSG:3857'];
  defs['EPSG:102113'] = defs['EPSG:3857'];
}

;// ./node_modules/proj4/lib/constants/values.js
var PJD_3PARAM = 1;
var PJD_7PARAM = 2;
var PJD_GRIDSHIFT = 3;
var PJD_WGS84 = 4; // WGS84 or equivalent
var PJD_NODATUM = 5; // WGS84 or equivalent
var SRS_WGS84_SEMIMAJOR = 6378137.0; // only used in grid shift transforms
var SRS_WGS84_SEMIMINOR = 6356752.314; // only used in grid shift transforms
var SRS_WGS84_ESQUARED = 0.0066943799901413165; // only used in grid shift transforms
var SEC_TO_RAD = 4.84813681109535993589914102357e-6;
var HALF_PI = Math.PI / 2;
// ellipoid pj_set_ell.c
var SIXTH = 0.1666666666666666667;
/* 1/6 */
var RA4 = 0.04722222222222222222;
/* 17/360 */
var RA6 = 0.02215608465608465608;
var EPSLN = 1.0e-10;
// you'd think you could use Number.EPSILON above but that makes
// Mollweide get into an infinate loop.

var D2R = 0.01745329251994329577;
var R2D = 57.29577951308232088;
var FORTPI = Math.PI / 4;
var TWO_PI = Math.PI * 2;
// SPI is slightly greater than Math.PI, so values that exceed the -180..180
// degree range by a tiny amount don't get wrapped. This prevents points that
// have drifted from their original location along the 180th meridian (due to
// floating point error) from changing their sign.
var SPI = 3.14159265359;

;// ./node_modules/proj4/lib/constants/PrimeMeridian.js
var primeMeridian = {};

primeMeridian.greenwich = 0.0; // "0dE",
primeMeridian.lisbon = -9.131906111111; // "9d07'54.862\"W",
primeMeridian.paris = 2.337229166667; // "2d20'14.025\"E",
primeMeridian.bogota = -74.080916666667; // "74d04'51.3\"W",
primeMeridian.madrid = -3.687938888889; // "3d41'16.58\"W",
primeMeridian.rome = 12.452333333333; // "12d27'8.4\"E",
primeMeridian.bern = 7.439583333333; // "7d26'22.5\"E",
primeMeridian.jakarta = 106.807719444444; // "106d48'27.79\"E",
primeMeridian.ferro = -17.666666666667; // "17d40'W",
primeMeridian.brussels = 4.367975; // "4d22'4.71\"E",
primeMeridian.stockholm = 18.058277777778; // "18d3'29.8\"E",
primeMeridian.athens = 23.7163375; // "23d42'58.815\"E",
primeMeridian.oslo = 10.722916666667; // "10d43'22.5\"E"

/* harmony default export */ const PrimeMeridian = (primeMeridian);

;// ./node_modules/proj4/lib/constants/units.js
/* harmony default export */ const units = ({
  mm: { to_meter: 0.001 },
  cm: { to_meter: 0.01 },
  ft: { to_meter: 0.3048 },
  'us-ft': { to_meter: 1200 / 3937 },
  fath: { to_meter: 1.8288 },
  kmi: { to_meter: 1852 },
  'us-ch': { to_meter: 20.1168402336805 },
  'us-mi': { to_meter: 1609.34721869444 },
  km: { to_meter: 1000 },
  'ind-ft': { to_meter: 0.30479841 },
  'ind-yd': { to_meter: 0.91439523 },
  mi: { to_meter: 1609.344 },
  yd: { to_meter: 0.9144 },
  ch: { to_meter: 20.1168 },
  link: { to_meter: 0.201168 },
  dm: { to_meter: 0.1 },
  in: { to_meter: 0.0254 },
  'ind-ch': { to_meter: 20.11669506 },
  'us-in': { to_meter: 0.025400050800101 },
  'us-yd': { to_meter: 0.914401828803658 }
});

;// ./node_modules/proj4/lib/match.js
var ignoredChar = /[\s_\-\/\(\)]/g;
function match(obj, key) {
  if (obj[key]) {
    return obj[key];
  }
  var keys = Object.keys(obj);
  var lkey = key.toLowerCase().replace(ignoredChar, '');
  var i = -1;
  var testkey, processedKey;
  while (++i < keys.length) {
    testkey = keys[i];
    processedKey = testkey.toLowerCase().replace(ignoredChar, '');
    if (processedKey === lkey) {
      return obj[testkey];
    }
  }
}

;// ./node_modules/proj4/lib/projString.js





/**
 * @param {string} defData
 * @returns {import('./defs').ProjectionDefinition}
 */
/* harmony default export */ function projString(defData) {
  /** @type {import('./defs').ProjectionDefinition} */
  var self = {};
  var paramObj = defData.split('+').map(function (v) {
    return v.trim();
  }).filter(function (a) {
    return a;
  }).reduce(function (p, a) {
    /** @type {Array<?>} */
    var split = a.split('=');
    split.push(true);
    p[split[0].toLowerCase()] = split[1];
    return p;
  }, {});
  var paramName, paramVal, paramOutname;
  var params = {
    proj: 'projName',
    datum: 'datumCode',
    rf: function (v) {
      self.rf = parseFloat(v);
    },
    lat_0: function (v) {
      self.lat0 = v * D2R;
    },
    lat_1: function (v) {
      self.lat1 = v * D2R;
    },
    lat_2: function (v) {
      self.lat2 = v * D2R;
    },
    lat_ts: function (v) {
      self.lat_ts = v * D2R;
    },
    lon_0: function (v) {
      self.long0 = v * D2R;
    },
    lon_1: function (v) {
      self.long1 = v * D2R;
    },
    lon_2: function (v) {
      self.long2 = v * D2R;
    },
    alpha: function (v) {
      self.alpha = parseFloat(v) * D2R;
    },
    gamma: function (v) {
      self.rectified_grid_angle = parseFloat(v) * D2R;
    },
    lonc: function (v) {
      self.longc = v * D2R;
    },
    x_0: function (v) {
      self.x0 = parseFloat(v);
    },
    y_0: function (v) {
      self.y0 = parseFloat(v);
    },
    k_0: function (v) {
      self.k0 = parseFloat(v);
    },
    k: function (v) {
      self.k0 = parseFloat(v);
    },
    a: function (v) {
      self.a = parseFloat(v);
    },
    b: function (v) {
      self.b = parseFloat(v);
    },
    r: function (v) {
      self.a = self.b = parseFloat(v);
    },
    r_a: function () {
      self.R_A = true;
    },
    zone: function (v) {
      self.zone = parseInt(v, 10);
    },
    south: function () {
      self.utmSouth = true;
    },
    towgs84: function (v) {
      self.datum_params = v.split(',').map(function (a) {
        return parseFloat(a);
      });
    },
    to_meter: function (v) {
      self.to_meter = parseFloat(v);
    },
    units: function (v) {
      self.units = v;
      var unit = match(units, v);
      if (unit) {
        self.to_meter = unit.to_meter;
      }
    },
    from_greenwich: function (v) {
      self.from_greenwich = v * D2R;
    },
    pm: function (v) {
      var pm = match(PrimeMeridian, v);
      self.from_greenwich = (pm ? pm : parseFloat(v)) * D2R;
    },
    nadgrids: function (v) {
      if (v === '@null') {
        self.datumCode = 'none';
      } else {
        self.nadgrids = v;
      }
    },
    axis: function (v) {
      var legalAxis = 'ewnsud';
      if (v.length === 3 && legalAxis.indexOf(v.substr(0, 1)) !== -1 && legalAxis.indexOf(v.substr(1, 1)) !== -1 && legalAxis.indexOf(v.substr(2, 1)) !== -1) {
        self.axis = v;
      }
    },
    approx: function () {
      self.approx = true;
    }
  };
  for (paramName in paramObj) {
    paramVal = paramObj[paramName];
    if (paramName in params) {
      paramOutname = params[paramName];
      if (typeof paramOutname === 'function') {
        paramOutname(paramVal);
      } else {
        self[paramOutname] = paramVal;
      }
    } else {
      self[paramName] = paramVal;
    }
  }
  if (typeof self.datumCode === 'string' && self.datumCode !== 'WGS84') {
    self.datumCode = self.datumCode.toLowerCase();
  }
  return self;
}

;// ./node_modules/wkt-parser/PROJJSONBuilderBase.js
class PROJJSONBuilderBase {
  static getId(node) {
    const idNode = node.find((child) => Array.isArray(child) && child[0] === 'ID');
    if (idNode && idNode.length >= 3) {
      return {
        authority: idNode[1],
        code: parseInt(idNode[2], 10),
      };
    }
    return null;
  }

  static convertUnit(node, type = 'unit') {
    if (!node || node.length < 3) {
      return { type, name: 'unknown', conversion_factor: null };
    }

    const name = node[1];
    const conversionFactor = parseFloat(node[2]) || null;

    const idNode = node.find((child) => Array.isArray(child) && child[0] === 'ID');
    const id = idNode
      ? {
        authority: idNode[1],
        code: parseInt(idNode[2], 10),
      }
      : null;

    return {
      type,
      name,
      conversion_factor: conversionFactor,
      id,
    };
  }

  static convertAxis(node) {
    const name = node[1] || 'Unknown';

    // Determine the direction
    let direction;
    const abbreviationMatch = name.match(/^\((.)\)$/); // Match abbreviations like "(E)" or "(N)"
    if (abbreviationMatch) {
      // Use the abbreviation to determine the direction
      const abbreviation = abbreviationMatch[1].toUpperCase();
      if (abbreviation === 'E') direction = 'east';
      else if (abbreviation === 'N') direction = 'north';
      else if (abbreviation === 'U') direction = 'up';
      else throw new Error(`Unknown axis abbreviation: ${abbreviation}`);
    } else {
      // Use the explicit direction provided in the AXIS node
      direction = node[2] ? node[2].toLowerCase() : 'unknown';
    }

    const orderNode = node.find((child) => Array.isArray(child) && child[0] === 'ORDER');
    const order = orderNode ? parseInt(orderNode[1], 10) : null;

    const unitNode = node.find(
      (child) =>
        Array.isArray(child) &&
        (child[0] === 'LENGTHUNIT' || child[0] === 'ANGLEUNIT' || child[0] === 'SCALEUNIT')
    );
    const unit = this.convertUnit(unitNode);

    return {
      name,
      direction, // Use the valid PROJJSON direction value
      unit,
      order,
    };
  }

  static extractAxes(node) {
    return node
      .filter((child) => Array.isArray(child) && child[0] === 'AXIS')
      .map((axis) => this.convertAxis(axis))
      .sort((a, b) => (a.order || 0) - (b.order || 0)); // Sort by the "order" property
  }

  static convert(node, result = {}) {

    switch (node[0]) {
      case 'PROJCRS':
        result.type = 'ProjectedCRS';
        result.name = node[1];
        result.base_crs = node.find((child) => Array.isArray(child) && child[0] === 'BASEGEOGCRS')
          ? this.convert(node.find((child) => Array.isArray(child) && child[0] === 'BASEGEOGCRS'))
          : null;
        result.conversion = node.find((child) => Array.isArray(child) && child[0] === 'CONVERSION')
          ? this.convert(node.find((child) => Array.isArray(child) && child[0] === 'CONVERSION'))
          : null;

        const csNode = node.find((child) => Array.isArray(child) && child[0] === 'CS');
        if (csNode) {
          result.coordinate_system = {
            type: csNode[1],
            axis: this.extractAxes(node),
          };
        }

        const lengthUnitNode = node.find((child) => Array.isArray(child) && child[0] === 'LENGTHUNIT');
        if (lengthUnitNode) {
          const unit = this.convertUnit(lengthUnitNode);
          result.coordinate_system.unit = unit; // Add unit to coordinate_system
        }

        result.id = this.getId(node);
        break;

      case 'BASEGEOGCRS':
      case 'GEOGCRS':
        result.type = 'GeographicCRS';
        result.name = node[1];
      
        // Handle DATUM or ENSEMBLE
        const datumOrEnsembleNode = node.find(
          (child) => Array.isArray(child) && (child[0] === 'DATUM' || child[0] === 'ENSEMBLE')
        );
        if (datumOrEnsembleNode) {
          const datumOrEnsemble = this.convert(datumOrEnsembleNode);
          if (datumOrEnsembleNode[0] === 'ENSEMBLE') {
            result.datum_ensemble = datumOrEnsemble;
          } else {
            result.datum = datumOrEnsemble;
          }
          const primem = node.find((child) => Array.isArray(child) && child[0] === 'PRIMEM');
          if (primem && primem[1] !== 'Greenwich') {
            datumOrEnsemble.prime_meridian = {
              name: primem[1],
              longitude: parseFloat(primem[2]),
            }
          }
        }
      
        result.coordinate_system = {
          type: 'ellipsoidal',
          axis: this.extractAxes(node),
        };
      
        result.id = this.getId(node);
        break;

      case 'DATUM':
        result.type = 'GeodeticReferenceFrame';
        result.name = node[1];
        result.ellipsoid = node.find((child) => Array.isArray(child) && child[0] === 'ELLIPSOID')
          ? this.convert(node.find((child) => Array.isArray(child) && child[0] === 'ELLIPSOID'))
          : null;
        break;
      
      case 'ENSEMBLE':
        result.type = 'DatumEnsemble';
        result.name = node[1];
      
        // Extract ensemble members
        result.members = node
          .filter((child) => Array.isArray(child) && child[0] === 'MEMBER')
          .map((member) => ({
            type: 'DatumEnsembleMember',
            name: member[1],
            id: this.getId(member), // Extract ID as { authority, code }
          }));
      
        // Extract accuracy
        const accuracyNode = node.find((child) => Array.isArray(child) && child[0] === 'ENSEMBLEACCURACY');
        if (accuracyNode) {
          result.accuracy = parseFloat(accuracyNode[1]);
        }
      
        // Extract ellipsoid
        const ellipsoidNode = node.find((child) => Array.isArray(child) && child[0] === 'ELLIPSOID');
        if (ellipsoidNode) {
          result.ellipsoid = this.convert(ellipsoidNode); // Convert the ellipsoid node
        }
      
        // Extract identifier for the ensemble
        result.id = this.getId(node);
        break;

      case 'ELLIPSOID':
        result.type = 'Ellipsoid';
        result.name = node[1];
        result.semi_major_axis = parseFloat(node[2]);
        result.inverse_flattening = parseFloat(node[3]);
        const units = node.find((child) => Array.isArray(child) && child[0] === 'LENGTHUNIT')
          ? this.convert(node.find((child) => Array.isArray(child) && child[0] === 'LENGTHUNIT'), result)
          : null;
        break;

      case 'CONVERSION':
        result.type = 'Conversion';
        result.name = node[1];
        result.method = node.find((child) => Array.isArray(child) && child[0] === 'METHOD')
          ? this.convert(node.find((child) => Array.isArray(child) && child[0] === 'METHOD'))
          : null;
        result.parameters = node
          .filter((child) => Array.isArray(child) && child[0] === 'PARAMETER')
          .map((param) => this.convert(param));
        break;

      case 'METHOD':
        result.type = 'Method';
        result.name = node[1];
        result.id = this.getId(node);
        break;

      case 'PARAMETER':
        result.type = 'Parameter';
        result.name = node[1];
        result.value = parseFloat(node[2]);
        result.unit = this.convertUnit(
          node.find(
            (child) =>
              Array.isArray(child) &&
              (child[0] === 'LENGTHUNIT' || child[0] === 'ANGLEUNIT' || child[0] === 'SCALEUNIT')
          )
        );
        result.id = this.getId(node);
        break;

      case 'BOUNDCRS':
        result.type = 'BoundCRS';

        // Process SOURCECRS
        const sourceCrsNode = node.find((child) => Array.isArray(child) && child[0] === 'SOURCECRS');
        if (sourceCrsNode) {
          const sourceCrsContent = sourceCrsNode.find((child) => Array.isArray(child));
          result.source_crs = sourceCrsContent ? this.convert(sourceCrsContent) : null;
        }

        // Process TARGETCRS
        const targetCrsNode = node.find((child) => Array.isArray(child) && child[0] === 'TARGETCRS');
        if (targetCrsNode) {
          const targetCrsContent = targetCrsNode.find((child) => Array.isArray(child));
          result.target_crs = targetCrsContent ? this.convert(targetCrsContent) : null;
        }

        // Process ABRIDGEDTRANSFORMATION
        const transformationNode = node.find((child) => Array.isArray(child) && child[0] === 'ABRIDGEDTRANSFORMATION');
        if (transformationNode) {
          result.transformation = this.convert(transformationNode);
        } else {
          result.transformation = null;
        }
        break;

      case 'ABRIDGEDTRANSFORMATION':
        result.type = 'Transformation';
        result.name = node[1];
        result.method = node.find((child) => Array.isArray(child) && child[0] === 'METHOD')
          ? this.convert(node.find((child) => Array.isArray(child) && child[0] === 'METHOD'))
          : null;

        result.parameters = node
          .filter((child) => Array.isArray(child) && (child[0] === 'PARAMETER' || child[0] === 'PARAMETERFILE'))
          .map((param) => {
            if (param[0] === 'PARAMETER') {
              return this.convert(param);
            } else if (param[0] === 'PARAMETERFILE') {
              return {
                name: param[1],
                value: param[2],
                id: {
                  'authority': 'EPSG',
                  'code': 8656
                }
              };
            }
          });

        // Adjust the Scale difference parameter if present
        if (result.parameters.length === 7) {
          const scaleDifference = result.parameters[6];
          if (scaleDifference.name === 'Scale difference') {
            scaleDifference.value = Math.round((scaleDifference.value - 1) * 1e12) / 1e6;
          }
        }

        result.id = this.getId(node);
        break;
      
      case 'AXIS':
        if (!result.coordinate_system) {
          result.coordinate_system = { type: 'unspecified', axis: [] };
        }
        result.coordinate_system.axis.push(this.convertAxis(node));
        break;
      
      case 'LENGTHUNIT':
        const unit = this.convertUnit(node, 'LinearUnit');
        if (result.coordinate_system && result.coordinate_system.axis) {
          result.coordinate_system.axis.forEach((axis) => {
            if (!axis.unit) {
              axis.unit = unit;
            }
          });
        }
        if (unit.conversion_factor && unit.conversion_factor !== 1) {
          if (result.semi_major_axis) {
            result.semi_major_axis = {
              value: result.semi_major_axis,
              unit,
            }
          }
        }
        break;

      default:
        result.keyword = node[0];
        break;
    }

    return result;
  }
}

/* harmony default export */ const wkt_parser_PROJJSONBuilderBase = (PROJJSONBuilderBase);
;// ./node_modules/wkt-parser/PROJJSONBuilder2015.js


class PROJJSONBuilder2015 extends wkt_parser_PROJJSONBuilderBase {
  static convert(node, result = {}) {
    super.convert(node, result);

    // Skip `CS` and `USAGE` nodes for WKT2-2015
    if (result.coordinate_system && result.coordinate_system.subtype === 'Cartesian') {
      delete result.coordinate_system;
    }
    if (result.usage) {
      delete result.usage;
    }

    return result;
  }
}

/* harmony default export */ const wkt_parser_PROJJSONBuilder2015 = (PROJJSONBuilder2015);
;// ./node_modules/wkt-parser/PROJJSONBuilder2019.js


class PROJJSONBuilder2019 extends wkt_parser_PROJJSONBuilderBase {
  static convert(node, result = {}) {
    super.convert(node, result);

    // Handle `CS` node for WKT2-2019
    const csNode = node.find((child) => Array.isArray(child) && child[0] === 'CS');
    if (csNode) {
      result.coordinate_system = {
        subtype: csNode[1],
        axis: this.extractAxes(node),
      };
    }

    // Handle `USAGE` node for WKT2-2019
    const usageNode = node.find((child) => Array.isArray(child) && child[0] === 'USAGE');
    if (usageNode) {
      const scope = usageNode.find((child) => Array.isArray(child) && child[0] === 'SCOPE');
      const area = usageNode.find((child) => Array.isArray(child) && child[0] === 'AREA');
      const bbox = usageNode.find((child) => Array.isArray(child) && child[0] === 'BBOX');
      result.usage = {};
      if (scope) {
        result.usage.scope = scope[1];
      }
      if (area) {
        result.usage.area = area[1];
      }
      if (bbox) {
        result.usage.bbox = bbox.slice(1);
      }
    }

    return result;
  }
}

/* harmony default export */ const wkt_parser_PROJJSONBuilder2019 = (PROJJSONBuilder2019);
;// ./node_modules/wkt-parser/buildPROJJSON.js



/**
 * Detects the WKT2 version based on the structure of the WKT.
 * @param {Array} root The root WKT array node.
 * @returns {string} The detected version ("2015" or "2019").
 */
function detectWKT2Version(root) {
  // Check for WKT2-2019-specific nodes
  if (root.find((child) => Array.isArray(child) && child[0] === 'USAGE')) {
    return '2019'; // `USAGE` is specific to WKT2-2019
  }

  // Check for WKT2-2015-specific nodes
  if (root.find((child) => Array.isArray(child) && child[0] === 'CS')) {
    return '2015'; // `CS` is valid in both, but default to 2015 unless `USAGE` is present
  }

  if (root[0] === 'BOUNDCRS' || root[0] === 'PROJCRS' || root[0] === 'GEOGCRS') {
    return '2015'; // These are valid in both, but default to 2015
  }

  // Default to WKT2-2015 if no specific indicators are found
  return '2015';
}

/**
 * Builds a PROJJSON object from a WKT array structure.
 * @param {Array} root The root WKT array node.
 * @returns {Object} The PROJJSON object.
 */
function buildPROJJSON(root) {
  const version = detectWKT2Version(root);
  const builder = version === '2019' ? wkt_parser_PROJJSONBuilder2019 : wkt_parser_PROJJSONBuilder2015;
  return builder.convert(root);
}

;// ./node_modules/wkt-parser/detectWKTVersion.js
/**
 * Detects whether the WKT string is WKT1 or WKT2.
 * @param {string} wkt The WKT string.
 * @returns {string} The detected version ("WKT1" or "WKT2").
 */
function detectWKTVersion(wkt) {
  // Normalize the WKT string for easier keyword matching
  const normalizedWKT = wkt.toUpperCase();

  // Check for WKT2-specific keywords
  if (
    normalizedWKT.includes('PROJCRS') ||
    normalizedWKT.includes('GEOGCRS') ||
    normalizedWKT.includes('BOUNDCRS') ||
    normalizedWKT.includes('VERTCRS') ||
    normalizedWKT.includes('LENGTHUNIT') ||
    normalizedWKT.includes('ANGLEUNIT') ||
    normalizedWKT.includes('SCALEUNIT')
  ) {
    return 'WKT2';
  }

  // Check for WKT1-specific keywords
  if (
    normalizedWKT.includes('PROJCS') ||
    normalizedWKT.includes('GEOGCS') ||
    normalizedWKT.includes('LOCAL_CS') ||
    normalizedWKT.includes('VERT_CS') ||
    normalizedWKT.includes('UNIT')
  ) {
    return 'WKT1';
  }

  // Default to WKT1 if no specific indicators are found
  return 'WKT1';
}
;// ./node_modules/wkt-parser/parser.js
/* harmony default export */ const parser = (parseString);

var NEUTRAL = 1;
var KEYWORD = 2;
var NUMBER = 3;
var QUOTED = 4;
var AFTERQUOTE = 5;
var ENDED = -1;
var whitespace = /\s/;
var latin = /[A-Za-z]/;
var keyword = /[A-Za-z84_]/;
var endThings = /[,\]]/;
var digets = /[\d\.E\-\+]/;
// const ignoredChar = /[\s_\-\/\(\)]/g;
function Parser(text) {
  if (typeof text !== 'string') {
    throw new Error('not a string');
  }
  this.text = text.trim();
  this.level = 0;
  this.place = 0;
  this.root = null;
  this.stack = [];
  this.currentObject = null;
  this.state = NEUTRAL;
}
Parser.prototype.readCharicter = function() {
  var char = this.text[this.place++];
  if (this.state !== QUOTED) {
    while (whitespace.test(char)) {
      if (this.place >= this.text.length) {
        return;
      }
      char = this.text[this.place++];
    }
  }
  switch (this.state) {
    case NEUTRAL:
      return this.neutral(char);
    case KEYWORD:
      return this.keyword(char)
    case QUOTED:
      return this.quoted(char);
    case AFTERQUOTE:
      return this.afterquote(char);
    case NUMBER:
      return this.number(char);
    case ENDED:
      return;
  }
};
Parser.prototype.afterquote = function(char) {
  if (char === '"') {
    this.word += '"';
    this.state = QUOTED;
    return;
  }
  if (endThings.test(char)) {
    this.word = this.word.trim();
    this.afterItem(char);
    return;
  }
  throw new Error('havn\'t handled "' +char + '" in afterquote yet, index ' + this.place);
};
Parser.prototype.afterItem = function(char) {
  if (char === ',') {
    if (this.word !== null) {
      this.currentObject.push(this.word);
    }
    this.word = null;
    this.state = NEUTRAL;
    return;
  }
  if (char === ']') {
    this.level--;
    if (this.word !== null) {
      this.currentObject.push(this.word);
      this.word = null;
    }
    this.state = NEUTRAL;
    this.currentObject = this.stack.pop();
    if (!this.currentObject) {
      this.state = ENDED;
    }

    return;
  }
};
Parser.prototype.number = function(char) {
  if (digets.test(char)) {
    this.word += char;
    return;
  }
  if (endThings.test(char)) {
    this.word = parseFloat(this.word);
    this.afterItem(char);
    return;
  }
  throw new Error('havn\'t handled "' +char + '" in number yet, index ' + this.place);
};
Parser.prototype.quoted = function(char) {
  if (char === '"') {
    this.state = AFTERQUOTE;
    return;
  }
  this.word += char;
  return;
};
Parser.prototype.keyword = function(char) {
  if (keyword.test(char)) {
    this.word += char;
    return;
  }
  if (char === '[') {
    var newObjects = [];
    newObjects.push(this.word);
    this.level++;
    if (this.root === null) {
      this.root = newObjects;
    } else {
      this.currentObject.push(newObjects);
    }
    this.stack.push(this.currentObject);
    this.currentObject = newObjects;
    this.state = NEUTRAL;
    return;
  }
  if (endThings.test(char)) {
    this.afterItem(char);
    return;
  }
  throw new Error('havn\'t handled "' +char + '" in keyword yet, index ' + this.place);
};
Parser.prototype.neutral = function(char) {
  if (latin.test(char)) {
    this.word = char;
    this.state = KEYWORD;
    return;
  }
  if (char === '"') {
    this.word = '';
    this.state = QUOTED;
    return;
  }
  if (digets.test(char)) {
    this.word = char;
    this.state = NUMBER;
    return;
  }
  if (endThings.test(char)) {
    this.afterItem(char);
    return;
  }
  throw new Error('havn\'t handled "' +char + '" in neutral yet, index ' + this.place);
};
Parser.prototype.output = function() {
  while (this.place < this.text.length) {
    this.readCharicter();
  }
  if (this.state === ENDED) {
    return this.root;
  }
  throw new Error('unable to parse string "' +this.text + '". State is ' + this.state);
};

function parseString(txt) {
  var parser = new Parser(txt);
  return parser.output();
}

;// ./node_modules/wkt-parser/process.js


function mapit(obj, key, value) {
  if (Array.isArray(key)) {
    value.unshift(key);
    key = null;
  }
  var thing = key ? {} : obj;

  var out = value.reduce(function(newObj, item) {
    sExpr(item, newObj);
    return newObj
  }, thing);
  if (key) {
    obj[key] = out;
  }
}

function sExpr(v, obj) {
  if (!Array.isArray(v)) {
    obj[v] = true;
    return;
  }
  var key = v.shift();
  if (key === 'PARAMETER') {
    key = v.shift();
  }
  if (v.length === 1) {
    if (Array.isArray(v[0])) {
      obj[key] = {};
      sExpr(v[0], obj[key]);
      return;
    }
    obj[key] = v[0];
    return;
  }
  if (!v.length) {
    obj[key] = true;
    return;
  }
  if (key === 'TOWGS84') {
    obj[key] = v;
    return;
  }
  if (key === 'AXIS') {
    if (!(key in obj)) {
      obj[key] = [];
    }
    obj[key].push(v);
    return;
  }
  if (!Array.isArray(key)) {
    obj[key] = {};
  }

  var i;
  switch (key) {
    case 'UNIT':
    case 'PRIMEM':
    case 'VERT_DATUM':
      obj[key] = {
        name: v[0].toLowerCase(),
        convert: v[1]
      };
      if (v.length === 3) {
        sExpr(v[2], obj[key]);
      }
      return;
    case 'SPHEROID':
    case 'ELLIPSOID':
      obj[key] = {
        name: v[0],
        a: v[1],
        rf: v[2]
      };
      if (v.length === 4) {
        sExpr(v[3], obj[key]);
      }
      return;
    case 'EDATUM':
    case 'ENGINEERINGDATUM':
    case 'LOCAL_DATUM':
    case 'DATUM':
    case 'VERT_CS':
    case 'VERTCRS':
    case 'VERTICALCRS':
      v[0] = ['name', v[0]];
      mapit(obj, key, v);
      return;
    case 'COMPD_CS':
    case 'COMPOUNDCRS':
    case 'FITTED_CS':
    // the followings are the crs defined in
    // https://github.com/proj4js/proj4js/blob/1da4ed0b865d0fcb51c136090569210cdcc9019e/lib/parseCode.js#L11
    case 'PROJECTEDCRS':
    case 'PROJCRS':
    case 'GEOGCS':
    case 'GEOCCS':
    case 'PROJCS':
    case 'LOCAL_CS':
    case 'GEODCRS':
    case 'GEODETICCRS':
    case 'GEODETICDATUM':
    case 'ENGCRS':
    case 'ENGINEERINGCRS':
      v[0] = ['name', v[0]];
      mapit(obj, key, v);
      obj[key].type = key;
      return;
    default:
      i = -1;
      while (++i < v.length) {
        if (!Array.isArray(v[i])) {
          return sExpr(v, obj[key]);
        }
      }
      return mapit(obj, key, v);
  }
}

;// ./node_modules/wkt-parser/util.js
var util_D2R = 0.01745329251994329577;

function d2r(input) {
  return input * util_D2R;
}

function applyProjectionDefaults(wkt) {
  // Normalize projName for WKT2 compatibility
  const normalizedProjName = (wkt.projName || '').toLowerCase().replace(/_/g, ' ');

  if (!wkt.long0 && wkt.longc && (normalizedProjName === 'albers conic equal area' || normalizedProjName === 'lambert azimuthal equal area')) {
    wkt.long0 = wkt.longc;
  }
  if (!wkt.lat_ts && wkt.lat1 && (normalizedProjName === 'stereographic south pole' || normalizedProjName === 'polar stereographic (variant b)')) {
    wkt.lat0 = d2r(wkt.lat1 > 0 ? 90 : -90);
    wkt.lat_ts = wkt.lat1;
    delete wkt.lat1;
  } else if (!wkt.lat_ts && wkt.lat0 && (normalizedProjName === 'polar stereographic' || normalizedProjName === 'polar stereographic (variant a)')) {
    wkt.lat_ts = wkt.lat0;
    wkt.lat0 = d2r(wkt.lat0 > 0 ? 90 : -90);
    delete wkt.lat1;
  }
}
;// ./node_modules/wkt-parser/transformPROJJSON.js


// Helper function to process units and to_meter
function processUnit(unit) {
  let result = { units: null, to_meter: undefined };

  if (typeof unit === 'string') {
    result.units = unit.toLowerCase();
    if (result.units === 'metre') {
      result.units = 'meter'; // Normalize 'metre' to 'meter'
    }
    if (result.units === 'meter') {
      result.to_meter = 1; // Only set to_meter if units are 'meter'
    }
  } else if (unit && unit.name) {
    result.units = unit.name.toLowerCase();
    if (result.units === 'metre') {
      result.units = 'meter'; // Normalize 'metre' to 'meter'
    }
    result.to_meter = unit.conversion_factor;
  }

  return result;
}

function toValue(valueOrObject) {
  if (typeof valueOrObject === 'object') {
    return valueOrObject.value * valueOrObject.unit.conversion_factor;
  }
  return valueOrObject;
}

function calculateEllipsoid(value, result) {
  if (value.ellipsoid.radius) {
    result.a = value.ellipsoid.radius;
    result.rf = 0;
  } else {
    result.a = toValue(value.ellipsoid.semi_major_axis);
    if (value.ellipsoid.inverse_flattening !== undefined) {
      result.rf = value.ellipsoid.inverse_flattening;
    } else if (value.ellipsoid.semi_major_axis !== undefined && value.ellipsoid.semi_minor_axis !== undefined) {
      result.rf = result.a / (result.a - toValue(value.ellipsoid.semi_minor_axis));
    }
  }
}

function transformPROJJSON(projjson, result = {}) {
  if (!projjson || typeof projjson !== 'object') {
    return projjson; // Return primitive values as-is
  }

  if (projjson.type === 'BoundCRS') {
    transformPROJJSON(projjson.source_crs, result);

    if (projjson.transformation) {
      if (projjson.transformation.method && projjson.transformation.method.name === 'NTv2') {
        // Set nadgrids to the filename from the parameterfile
        result.nadgrids = projjson.transformation.parameters[0].value;
      } else {
        // Populate datum_params if no parameterfile is found
        result.datum_params = projjson.transformation.parameters.map((param) => param.value);
      }
    }
    return result; // Return early for BoundCRS
  }

  // Handle specific keys in PROJJSON
  Object.keys(projjson).forEach((key) => {
    const value = projjson[key];
    if (value === null) {
      return;
    }

    switch (key) {
      case 'name':
        if (result.srsCode) {
          break;
        }
        result.name = value;
        result.srsCode = value; // Map `name` to `srsCode`
        break;

      case 'type':
        if (value === 'GeographicCRS') {
          result.projName = 'longlat';
        } else if (value === 'ProjectedCRS' && projjson.conversion && projjson.conversion.method) {
          result.projName = projjson.conversion.method.name; // Retain original capitalization
        }
        break;

      case 'datum':
      case 'datum_ensemble': // Handle both datum and ensemble
        if (value.ellipsoid) {
          // Extract ellipsoid properties
          result.ellps = value.ellipsoid.name;
          calculateEllipsoid(value, result);
        }
        if (value.prime_meridian) {
          result.from_greenwich = value.prime_meridian.longitude * Math.PI / 180; // Convert to radians
        }
        break;

      case 'ellipsoid':
        result.ellps = value.name;
        calculateEllipsoid(value, result);
        break;

      case 'prime_meridian':
        result.long0 = (value.longitude || 0) * Math.PI / 180; // Convert to radians
        break;

      case 'coordinate_system':
        if (value.axis) {
          result.axis = value.axis
            .map((axis) => {
              const direction = axis.direction;
              if (direction === 'east') return 'e';
              if (direction === 'north') return 'n';
              if (direction === 'west') return 'w';
              if (direction === 'south') return 's';
              throw new Error(`Unknown axis direction: ${direction}`);
            })
            .join('') + 'u'; // Combine into a single string (e.g., "enu")

          if (value.unit) {
            const { units, to_meter } = processUnit(value.unit);
            result.units = units;
            result.to_meter = to_meter;
          } else if (value.axis[0] && value.axis[0].unit) {
            const { units, to_meter } = processUnit(value.axis[0].unit);
            result.units = units;
            result.to_meter = to_meter;
          }
        }
        break;
        
      case 'id':
        if (value.authority && value.code) {
          result.title = value.authority + ':' + value.code;
        }
        break;

      case 'conversion':
        if (value.method && value.method.name) {
          result.projName = value.method.name; // Retain original capitalization
        }
        if (value.parameters) {
          value.parameters.forEach((param) => {
            const paramName = param.name.toLowerCase().replace(/\s+/g, '_');
            const paramValue = param.value;
            if (param.unit && param.unit.conversion_factor) {
              result[paramName] = paramValue * param.unit.conversion_factor; // Convert to radians or meters
            } else if (param.unit === 'degree') {
              result[paramName] = paramValue * Math.PI / 180; // Convert to radians
            } else {
              result[paramName] = paramValue;
            }
          });
        }
        break;

      case 'unit':
        if (value.name) {
          result.units = value.name.toLowerCase();
          if (result.units === 'metre') {
            result.units = 'meter';
          }
        }
        if (value.conversion_factor) {
          result.to_meter = value.conversion_factor;
        }
        break;

      case 'base_crs':
        transformPROJJSON(value, result); // Pass `result` directly
        result.datumCode = value.id ? value.id.authority + '_' + value.id.code : value.name; // Set datumCode
        break;

      default:
        // Ignore irrelevant or unneeded properties
        break;
    }
  });

  // Additional calculated properties
  if (result.latitude_of_false_origin !== undefined) {
    result.lat0 = result.latitude_of_false_origin; // Already in radians
  }
  if (result.longitude_of_false_origin !== undefined) {
    result.long0 = result.longitude_of_false_origin;
  }
  if (result.latitude_of_standard_parallel !== undefined) {
    result.lat0 = result.latitude_of_standard_parallel;
    result.lat1 = result.latitude_of_standard_parallel;
  }
  if (result.latitude_of_1st_standard_parallel !== undefined) {
    result.lat1 = result.latitude_of_1st_standard_parallel;
  }
  if (result.latitude_of_2nd_standard_parallel !== undefined) {
    result.lat2 = result.latitude_of_2nd_standard_parallel; 
  }
  if (result.latitude_of_projection_centre !== undefined) {
    result.lat0 = result.latitude_of_projection_centre;
  }
  if (result.longitude_of_projection_centre !== undefined) {
    result.longc = result.longitude_of_projection_centre;
  }
  if (result.easting_at_false_origin !== undefined) {
    result.x0 = result.easting_at_false_origin;
  }
  if (result.northing_at_false_origin !== undefined) {
    result.y0 = result.northing_at_false_origin;
  }
  if (result.latitude_of_natural_origin !== undefined) {
    result.lat0 = result.latitude_of_natural_origin;
  }
  if (result.longitude_of_natural_origin !== undefined) {
    result.long0 = result.longitude_of_natural_origin;
  }
  if (result.longitude_of_origin !== undefined) {
    result.long0 = result.longitude_of_origin;
  }
  if (result.false_easting !== undefined) {
    result.x0 = result.false_easting;
  }
  if (result.easting_at_projection_centre) {
    result.x0 = result.easting_at_projection_centre;
  }
  if (result.false_northing !== undefined) {
    result.y0 = result.false_northing;
  }
  if (result.northing_at_projection_centre) {
    result.y0 = result.northing_at_projection_centre;
  }
  if (result.standard_parallel_1 !== undefined) {
    result.lat1 = result.standard_parallel_1;
  }
  if (result.standard_parallel_2 !== undefined) {
    result.lat2 = result.standard_parallel_2;
  }
  if (result.scale_factor_at_natural_origin !== undefined) {
    result.k0 = result.scale_factor_at_natural_origin;
  }
  if (result.scale_factor_at_projection_centre !== undefined) {
    result.k0 = result.scale_factor_at_projection_centre;
  }
  if (result.scale_factor_on_pseudo_standard_parallel !== undefined) {  
    result.k0 = result.scale_factor_on_pseudo_standard_parallel;
  }
  if (result.azimuth !== undefined) {
    result.alpha = result.azimuth;
  }
  if (result.azimuth_at_projection_centre !== undefined) {
    result.alpha = result.azimuth_at_projection_centre;
  }
  if (result.angle_from_rectified_to_skew_grid) {
    result.rectified_grid_angle = result.angle_from_rectified_to_skew_grid;
  }

  // Apply projection defaults
  applyProjectionDefaults(result);

  return result;
}
;// ./node_modules/wkt-parser/index.js







var knownTypes = ['PROJECTEDCRS', 'PROJCRS', 'GEOGCS', 'GEOCCS', 'PROJCS', 'LOCAL_CS', 'GEODCRS',
  'GEODETICCRS', 'GEODETICDATUM', 'ENGCRS', 'ENGINEERINGCRS'];

function rename(obj, params) {
  var outName = params[0];
  var inName = params[1];
  if (!(outName in obj) && (inName in obj)) {
    obj[outName] = obj[inName];
    if (params.length === 3) {
      obj[outName] = params[2](obj[outName]);
    }
  }
}

function cleanWKT(wkt) {
  var keys = Object.keys(wkt);
  for (var i = 0, ii = keys.length; i <ii; ++i) {
    var key = keys[i];
    // the followings are the crs defined in
    // https://github.com/proj4js/proj4js/blob/1da4ed0b865d0fcb51c136090569210cdcc9019e/lib/parseCode.js#L11
    if (knownTypes.indexOf(key) !== -1) {
      setPropertiesFromWkt(wkt[key]);
    }
    if (typeof wkt[key] === 'object') {
      cleanWKT(wkt[key]);
    }
  }
}

function setPropertiesFromWkt(wkt) {
  if (wkt.AUTHORITY) {
    var authority = Object.keys(wkt.AUTHORITY)[0];
    if (authority && authority in wkt.AUTHORITY) {
      wkt.title = authority + ':' + wkt.AUTHORITY[authority];
    }
  }
  if (wkt.type === 'GEOGCS') {
    wkt.projName = 'longlat';
  } else if (wkt.type === 'LOCAL_CS') {
    wkt.projName = 'identity';
    wkt.local = true;
  } else {
    if (typeof wkt.PROJECTION === 'object') {
      wkt.projName = Object.keys(wkt.PROJECTION)[0];
    } else {
      wkt.projName = wkt.PROJECTION;
    }
  }
  if (wkt.AXIS) {
    var axisOrder = '';
    for (var i = 0, ii = wkt.AXIS.length; i < ii; ++i) {
      var axis = [wkt.AXIS[i][0].toLowerCase(), wkt.AXIS[i][1].toLowerCase()];
      if (axis[0].indexOf('north') !== -1 || ((axis[0] === 'y' || axis[0] === 'lat') && axis[1] === 'north')) {
        axisOrder += 'n';
      } else if (axis[0].indexOf('south') !== -1 || ((axis[0] === 'y' || axis[0] === 'lat') && axis[1] === 'south')) {
        axisOrder += 's';
      } else if (axis[0].indexOf('east') !== -1 || ((axis[0] === 'x' || axis[0] === 'lon') && axis[1] === 'east')) {
        axisOrder += 'e';
      } else if (axis[0].indexOf('west') !== -1 || ((axis[0] === 'x' || axis[0] === 'lon') && axis[1] === 'west')) {
        axisOrder += 'w';
      }
    }
    if (axisOrder.length === 2) {
      axisOrder += 'u';
    }
    if (axisOrder.length === 3) {
      wkt.axis = axisOrder;
    }
  }
  if (wkt.UNIT) {
    wkt.units = wkt.UNIT.name.toLowerCase();
    if (wkt.units === 'metre') {
      wkt.units = 'meter';
    }
    if (wkt.UNIT.convert) {
      if (wkt.type === 'GEOGCS') {
        if (wkt.DATUM && wkt.DATUM.SPHEROID) {
          wkt.to_meter = wkt.UNIT.convert*wkt.DATUM.SPHEROID.a;
        }
      } else {
        wkt.to_meter = wkt.UNIT.convert;
      }
    }
  }
  var geogcs = wkt.GEOGCS;
  if (wkt.type === 'GEOGCS') {
    geogcs = wkt;
  }
  if (geogcs) {
    //if(wkt.GEOGCS.PRIMEM&&wkt.GEOGCS.PRIMEM.convert){
    //  wkt.from_greenwich=wkt.GEOGCS.PRIMEM.convert*D2R;
    //}
    if (geogcs.DATUM) {
      wkt.datumCode = geogcs.DATUM.name.toLowerCase();
    } else {
      wkt.datumCode = geogcs.name.toLowerCase();
    }
    if (wkt.datumCode.slice(0, 2) === 'd_') {
      wkt.datumCode = wkt.datumCode.slice(2);
    }
    if (wkt.datumCode === 'new_zealand_1949') {
      wkt.datumCode = 'nzgd49';
    }
    if (wkt.datumCode === 'wgs_1984' || wkt.datumCode === 'world_geodetic_system_1984') {
      if (wkt.PROJECTION === 'Mercator_Auxiliary_Sphere') {
        wkt.sphere = true;
      }
      wkt.datumCode = 'wgs84';
    }
    if (wkt.datumCode === 'belge_1972') {
      wkt.datumCode = 'rnb72';
    }
    if (geogcs.DATUM && geogcs.DATUM.SPHEROID) {
      wkt.ellps = geogcs.DATUM.SPHEROID.name.replace('_19', '').replace(/[Cc]larke\_18/, 'clrk');
      if (wkt.ellps.toLowerCase().slice(0, 13) === 'international') {
        wkt.ellps = 'intl';
      }

      wkt.a = geogcs.DATUM.SPHEROID.a;
      wkt.rf = parseFloat(geogcs.DATUM.SPHEROID.rf, 10);
    }

    if (geogcs.DATUM && geogcs.DATUM.TOWGS84) {
      wkt.datum_params = geogcs.DATUM.TOWGS84;
    }
    if (~wkt.datumCode.indexOf('osgb_1936')) {
      wkt.datumCode = 'osgb36';
    }
    if (~wkt.datumCode.indexOf('osni_1952')) {
      wkt.datumCode = 'osni52';
    }
    if (~wkt.datumCode.indexOf('tm65')
      || ~wkt.datumCode.indexOf('geodetic_datum_of_1965')) {
      wkt.datumCode = 'ire65';
    }
    if (wkt.datumCode === 'ch1903+') {
      wkt.datumCode = 'ch1903';
    }
    if (~wkt.datumCode.indexOf('israel')) {
      wkt.datumCode = 'isr93';
    }
  }
  if (wkt.b && !isFinite(wkt.b)) {
    wkt.b = wkt.a;
  }
  if (wkt.rectified_grid_angle) {
    wkt.rectified_grid_angle = d2r(wkt.rectified_grid_angle);
  }

  function toMeter(input) {
    var ratio = wkt.to_meter || 1;
    return input * ratio;
  }
  var renamer = function(a) {
    return rename(wkt, a);
  };
  var list = [
    ['standard_parallel_1', 'Standard_Parallel_1'],
    ['standard_parallel_1', 'Latitude of 1st standard parallel'],
    ['standard_parallel_2', 'Standard_Parallel_2'],
    ['standard_parallel_2', 'Latitude of 2nd standard parallel'],
    ['false_easting', 'False_Easting'],
    ['false_easting', 'False easting'],
    ['false-easting', 'Easting at false origin'],
    ['false_northing', 'False_Northing'],
    ['false_northing', 'False northing'],
    ['false_northing', 'Northing at false origin'],
    ['central_meridian', 'Central_Meridian'],
    ['central_meridian', 'Longitude of natural origin'],
    ['central_meridian', 'Longitude of false origin'],
    ['latitude_of_origin', 'Latitude_Of_Origin'],
    ['latitude_of_origin', 'Central_Parallel'],
    ['latitude_of_origin', 'Latitude of natural origin'],
    ['latitude_of_origin', 'Latitude of false origin'],
    ['scale_factor', 'Scale_Factor'],
    ['k0', 'scale_factor'],
    ['latitude_of_center', 'Latitude_Of_Center'],
    ['latitude_of_center', 'Latitude_of_center'],
    ['lat0', 'latitude_of_center', d2r],
    ['longitude_of_center', 'Longitude_Of_Center'],
    ['longitude_of_center', 'Longitude_of_center'],
    ['longc', 'longitude_of_center', d2r],
    ['x0', 'false_easting', toMeter],
    ['y0', 'false_northing', toMeter],
    ['long0', 'central_meridian', d2r],
    ['lat0', 'latitude_of_origin', d2r],
    ['lat0', 'standard_parallel_1', d2r],
    ['lat1', 'standard_parallel_1', d2r],
    ['lat2', 'standard_parallel_2', d2r],
    ['azimuth', 'Azimuth'],
    ['alpha', 'azimuth', d2r],
    ['srsCode', 'name']
  ];
  list.forEach(renamer);
  applyProjectionDefaults(wkt);
}
/* harmony default export */ function wkt_parser(wkt) {
  if (typeof wkt === 'object') {
    return transformPROJJSON(wkt);
  }
  const version = detectWKTVersion(wkt);
  var lisp = parser(wkt);
  if (version === 'WKT2') {
    const projjson = buildPROJJSON(lisp);
    return transformPROJJSON(projjson);
  }
  var type = lisp[0];
  var obj = {};
  sExpr(lisp, obj);
  cleanWKT(obj);
  return obj[type];
}

;// ./node_modules/proj4/lib/defs.js




/**
 * @typedef {Object} ProjectionDefinition
 * @property {string} title
 * @property {string} [projName]
 * @property {string} [ellps]
 * @property {import('./Proj.js').DatumDefinition} [datum]
 * @property {string} [datumName]
 * @property {number} [rf]
 * @property {number} [lat0]
 * @property {number} [lat1]
 * @property {number} [lat2]
 * @property {number} [lat_ts]
 * @property {number} [long0]
 * @property {number} [long1]
 * @property {number} [long2]
 * @property {number} [alpha]
 * @property {number} [longc]
 * @property {number} [x0]
 * @property {number} [y0]
 * @property {number} [k0]
 * @property {number} [a]
 * @property {number} [b]
 * @property {true} [R_A]
 * @property {number} [zone]
 * @property {true} [utmSouth]
 * @property {string|Array<number>} [datum_params]
 * @property {number} [to_meter]
 * @property {string} [units]
 * @property {number} [from_greenwich]
 * @property {string} [datumCode]
 * @property {string} [nadgrids]
 * @property {string} [axis]
 * @property {boolean} [sphere]
 * @property {number} [rectified_grid_angle]
 * @property {boolean} [approx]
 * @property {<T extends import('./core').TemplateCoordinates>(coordinates: T, enforceAxis?: boolean) => T} inverse
 * @property {<T extends import('./core').TemplateCoordinates>(coordinates: T, enforceAxis?: boolean) => T} forward
 */

/**
 * @overload
 * @param {string} name
 * @param {string|ProjectionDefinition|import('./core.js').PROJJSONDefinition} projection
 * @returns {void}
 */
/**
 * @overload
 * @param {Array<[string, string]>} name
 * @returns {Array<ProjectionDefinition|undefined>}
 */
/**
 * @overload
 * @param {string} name
 * @returns {ProjectionDefinition}
 */

/**
 * @param {string | Array<Array<string>> | Partial<Record<'EPSG'|'ESRI'|'IAU2000', ProjectionDefinition>>} name
 * @returns {ProjectionDefinition | Array<ProjectionDefinition|undefined> | void}
 */
function defs(name) {
  /* global console */
  var that = this;
  if (arguments.length === 2) {
    var def = arguments[1];
    if (typeof def === 'string') {
      if (def.charAt(0) === '+') {
        defs[/** @type {string} */ (name)] = projString(arguments[1]);
      } else {
        defs[/** @type {string} */ (name)] = wkt_parser(arguments[1]);
      }
    } else {
      defs[/** @type {string} */ (name)] = def;
    }
  } else if (arguments.length === 1) {
    if (Array.isArray(name)) {
      return name.map(function (v) {
        if (Array.isArray(v)) {
          return defs.apply(that, v);
        } else {
          return defs(v);
        }
      });
    } else if (typeof name === 'string') {
      if (name in defs) {
        return defs[name];
      }
    } else if ('EPSG' in name) {
      defs['EPSG:' + name.EPSG] = name;
    } else if ('ESRI' in name) {
      defs['ESRI:' + name.ESRI] = name;
    } else if ('IAU2000' in name) {
      defs['IAU2000:' + name.IAU2000] = name;
    } else {
      console.log(name);
    }
    return;
  }
}
global(defs);
/* harmony default export */ const lib_defs = (defs);

;// ./node_modules/proj4/lib/parseCode.js




function testObj(code) {
  return typeof code === 'string';
}
function testDef(code) {
  return code in lib_defs;
}
function testWKT(code) {
  return (code.indexOf('+') !== 0 && code.indexOf('[') !== -1) || (typeof code === 'object' && !('srsCode' in code));
}
var codes = ['3857', '900913', '3785', '102113'];
function checkMercator(item) {
  var auth = match(item, 'authority');
  if (!auth) {
    return;
  }
  var code = match(auth, 'epsg');
  return code && codes.indexOf(code) > -1;
}
function checkProjStr(item) {
  var ext = match(item, 'extension');
  if (!ext) {
    return;
  }
  return match(ext, 'proj4');
}
function testProj(code) {
  return code[0] === '+';
}
/**
 * @param {string | import('./core').PROJJSONDefinition | import('./defs').ProjectionDefinition} code
 * @returns {import('./defs').ProjectionDefinition}
 */
function parse(code) {
  if (testObj(code)) {
    // check to see if this is a WKT string
    if (testDef(code)) {
      return lib_defs[code];
    }
    if (testWKT(code)) {
      var out = wkt_parser(code);
      // test of spetial case, due to this being a very common and often malformed
      if (checkMercator(out)) {
        return lib_defs['EPSG:3857'];
      }
      var maybeProjStr = checkProjStr(out);
      if (maybeProjStr) {
        return projString(maybeProjStr);
      }
      return out;
    }
    if (testProj(code)) {
      return projString(code);
    }
  } else if (!('projName' in code)) {
    return wkt_parser(code);
  } else {
    return code;
  }
}

/* harmony default export */ const parseCode = (parse);

;// ./node_modules/proj4/lib/extend.js
/* harmony default export */ function extend(destination, source) {
  destination = destination || {};
  var value, property;
  if (!source) {
    return destination;
  }
  for (property in source) {
    value = source[property];
    if (value !== undefined) {
      destination[property] = value;
    }
  }
  return destination;
}

;// ./node_modules/proj4/lib/common/msfnz.js
/* harmony default export */ function msfnz(eccent, sinphi, cosphi) {
  var con = eccent * sinphi;
  return cosphi / (Math.sqrt(1 - con * con));
}

;// ./node_modules/proj4/lib/common/sign.js
/* harmony default export */ function sign(x) {
  return x < 0 ? -1 : 1;
}

;// ./node_modules/proj4/lib/common/adjust_lon.js



/* harmony default export */ function adjust_lon(x) {
  return (Math.abs(x) <= SPI) ? x : (x - (sign(x) * TWO_PI));
}

;// ./node_modules/proj4/lib/common/tsfnz.js


/* harmony default export */ function tsfnz(eccent, phi, sinphi) {
  var con = eccent * sinphi;
  var com = 0.5 * eccent;
  con = Math.pow(((1 - con) / (1 + con)), com);
  return (Math.tan(0.5 * (HALF_PI - phi)) / con);
}

;// ./node_modules/proj4/lib/common/phi2z.js


/* harmony default export */ function phi2z(eccent, ts) {
  var eccnth = 0.5 * eccent;
  var con, dphi;
  var phi = HALF_PI - 2 * Math.atan(ts);
  for (var i = 0; i <= 15; i++) {
    con = eccent * Math.sin(phi);
    dphi = HALF_PI - 2 * Math.atan(ts * (Math.pow(((1 - con) / (1 + con)), eccnth))) - phi;
    phi += dphi;
    if (Math.abs(dphi) <= 0.0000000001) {
      return phi;
    }
  }
  // console.log("phi2z has NoConvergence");
  return -9999;
}

;// ./node_modules/proj4/lib/projections/merc.js







/**
 * @typedef {Object} LocalThis
 * @property {number} es
 * @property {number} e
 * @property {number} k
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function init() {
  var con = this.b / this.a;
  this.es = 1 - con * con;
  if (!('x0' in this)) {
    this.x0 = 0;
  }
  if (!('y0' in this)) {
    this.y0 = 0;
  }
  this.e = Math.sqrt(this.es);
  if (this.lat_ts) {
    if (this.sphere) {
      this.k0 = Math.cos(this.lat_ts);
    } else {
      this.k0 = msfnz(this.e, Math.sin(this.lat_ts), Math.cos(this.lat_ts));
    }
  } else {
    if (!this.k0) {
      if (this.k) {
        this.k0 = this.k;
      } else {
        this.k0 = 1;
      }
    }
  }
}

/* Mercator forward equations--mapping lat,long to x,y
  -------------------------------------------------- */

function forward(p) {
  var lon = p.x;
  var lat = p.y;
  // convert to radians
  if (lat * R2D > 90 && lat * R2D < -90 && lon * R2D > 180 && lon * R2D < -180) {
    return null;
  }

  var x, y;
  if (Math.abs(Math.abs(lat) - HALF_PI) <= EPSLN) {
    return null;
  } else {
    if (this.sphere) {
      x = this.x0 + this.a * this.k0 * adjust_lon(lon - this.long0);
      y = this.y0 + this.a * this.k0 * Math.log(Math.tan(FORTPI + 0.5 * lat));
    } else {
      var sinphi = Math.sin(lat);
      var ts = tsfnz(this.e, lat, sinphi);
      x = this.x0 + this.a * this.k0 * adjust_lon(lon - this.long0);
      y = this.y0 - this.a * this.k0 * Math.log(ts);
    }
    p.x = x;
    p.y = y;
    return p;
  }
}

/* Mercator inverse equations--mapping x,y to lat/long
  -------------------------------------------------- */
function inverse(p) {
  var x = p.x - this.x0;
  var y = p.y - this.y0;
  var lon, lat;

  if (this.sphere) {
    lat = HALF_PI - 2 * Math.atan(Math.exp(-y / (this.a * this.k0)));
  } else {
    var ts = Math.exp(-y / (this.a * this.k0));
    lat = phi2z(this.e, ts);
    if (lat === -9999) {
      return null;
    }
  }
  lon = adjust_lon(this.long0 + x / (this.a * this.k0));

  p.x = lon;
  p.y = lat;
  return p;
}

var names = ['Mercator', 'Popular Visualisation Pseudo Mercator', 'Mercator_1SP', 'Mercator_Auxiliary_Sphere', 'Mercator_Variant_A', 'merc'];
/* harmony default export */ const merc = ({
  init: init,
  forward: forward,
  inverse: inverse,
  names: names
});

;// ./node_modules/proj4/lib/projections/longlat.js
function longlat_init() {
  // no-op for longlat
}

function identity(pt) {
  return pt;
}


var longlat_names = ['longlat', 'identity'];
/* harmony default export */ const longlat = ({
  init: longlat_init,
  forward: identity,
  inverse: identity,
  names: longlat_names
});

;// ./node_modules/proj4/lib/projections.js


/** @type {Array<Partial<import('./Proj').default>>} */
var projs = [merc, longlat];
var projections_names = {};
var projStore = [];

/**
 * @param {import('./Proj').default} proj
 * @param {number} i
 */
function add(proj, i) {
  var len = projStore.length;
  if (!proj.names) {
    console.log(i);
    return true;
  }
  projStore[len] = proj;
  proj.names.forEach(function (n) {
    projections_names[n.toLowerCase()] = len;
  });
  return this;
}

function getNormalizedProjName(n) {
  return n.replace(/[-\(\)\s]+/g, ' ').trim().replace(/ /g, '_');
}

/**
 * Get a projection by name.
 * @param {string} name
 * @returns {import('./Proj').default|false}
 */
function get(name) {
  if (!name) {
    return false;
  }
  var n = name.toLowerCase();
  if (typeof projections_names[n] !== 'undefined' && projStore[projections_names[n]]) {
    return projStore[projections_names[n]];
  }
  n = getNormalizedProjName(n);
  if (n in projections_names && projStore[projections_names[n]]) {
    return projStore[projections_names[n]];
  }
}

function start() {
  projs.forEach(add);
}
/* harmony default export */ const projections = ({
  start: start,
  add: add,
  get: get
});

;// ./node_modules/proj4/lib/constants/Ellipsoid.js
var ellipsoids = {
  MERIT: {
    a: 6378137,
    rf: 298.257,
    ellipseName: 'MERIT 1983'
  },
  SGS85: {
    a: 6378136,
    rf: 298.257,
    ellipseName: 'Soviet Geodetic System 85'
  },
  GRS80: {
    a: 6378137,
    rf: 298.257222101,
    ellipseName: 'GRS 1980(IUGG, 1980)'
  },
  IAU76: {
    a: 6378140,
    rf: 298.257,
    ellipseName: 'IAU 1976'
  },
  airy: {
    a: 6377563.396,
    b: 6356256.91,
    ellipseName: 'Airy 1830'
  },
  APL4: {
    a: 6378137,
    rf: 298.25,
    ellipseName: 'Appl. Physics. 1965'
  },
  NWL9D: {
    a: 6378145,
    rf: 298.25,
    ellipseName: 'Naval Weapons Lab., 1965'
  },
  mod_airy: {
    a: 6377340.189,
    b: 6356034.446,
    ellipseName: 'Modified Airy'
  },
  andrae: {
    a: 6377104.43,
    rf: 300,
    ellipseName: 'Andrae 1876 (Den., Iclnd.)'
  },
  aust_SA: {
    a: 6378160,
    rf: 298.25,
    ellipseName: 'Australian Natl & S. Amer. 1969'
  },
  GRS67: {
    a: 6378160,
    rf: 298.247167427,
    ellipseName: 'GRS 67(IUGG 1967)'
  },
  bessel: {
    a: 6377397.155,
    rf: 299.1528128,
    ellipseName: 'Bessel 1841'
  },
  bess_nam: {
    a: 6377483.865,
    rf: 299.1528128,
    ellipseName: 'Bessel 1841 (Namibia)'
  },
  clrk66: {
    a: 6378206.4,
    b: 6356583.8,
    ellipseName: 'Clarke 1866'
  },
  clrk80: {
    a: 6378249.145,
    rf: 293.4663,
    ellipseName: 'Clarke 1880 mod.'
  },
  clrk80ign: {
    a: 6378249.2,
    b: 6356515,
    rf: 293.4660213,
    ellipseName: 'Clarke 1880 (IGN)'
  },
  clrk58: {
    a: 6378293.645208759,
    rf: 294.2606763692654,
    ellipseName: 'Clarke 1858'
  },
  CPM: {
    a: 6375738.7,
    rf: 334.29,
    ellipseName: 'Comm. des Poids et Mesures 1799'
  },
  delmbr: {
    a: 6376428,
    rf: 311.5,
    ellipseName: 'Delambre 1810 (Belgium)'
  },
  engelis: {
    a: 6378136.05,
    rf: 298.2566,
    ellipseName: 'Engelis 1985'
  },
  evrst30: {
    a: 6377276.345,
    rf: 300.8017,
    ellipseName: 'Everest 1830'
  },
  evrst48: {
    a: 6377304.063,
    rf: 300.8017,
    ellipseName: 'Everest 1948'
  },
  evrst56: {
    a: 6377301.243,
    rf: 300.8017,
    ellipseName: 'Everest 1956'
  },
  evrst69: {
    a: 6377295.664,
    rf: 300.8017,
    ellipseName: 'Everest 1969'
  },
  evrstSS: {
    a: 6377298.556,
    rf: 300.8017,
    ellipseName: 'Everest (Sabah & Sarawak)'
  },
  fschr60: {
    a: 6378166,
    rf: 298.3,
    ellipseName: 'Fischer (Mercury Datum) 1960'
  },
  fschr60m: {
    a: 6378155,
    rf: 298.3,
    ellipseName: 'Fischer 1960'
  },
  fschr68: {
    a: 6378150,
    rf: 298.3,
    ellipseName: 'Fischer 1968'
  },
  helmert: {
    a: 6378200,
    rf: 298.3,
    ellipseName: 'Helmert 1906'
  },
  hough: {
    a: 6378270,
    rf: 297,
    ellipseName: 'Hough'
  },
  intl: {
    a: 6378388,
    rf: 297,
    ellipseName: 'International 1909 (Hayford)'
  },
  kaula: {
    a: 6378163,
    rf: 298.24,
    ellipseName: 'Kaula 1961'
  },
  lerch: {
    a: 6378139,
    rf: 298.257,
    ellipseName: 'Lerch 1979'
  },
  mprts: {
    a: 6397300,
    rf: 191,
    ellipseName: 'Maupertius 1738'
  },
  new_intl: {
    a: 6378157.5,
    b: 6356772.2,
    ellipseName: 'New International 1967'
  },
  plessis: {
    a: 6376523,
    rf: 6355863,
    ellipseName: 'Plessis 1817 (France)'
  },
  krass: {
    a: 6378245,
    rf: 298.3,
    ellipseName: 'Krassovsky, 1942'
  },
  SEasia: {
    a: 6378155,
    b: 6356773.3205,
    ellipseName: 'Southeast Asia'
  },
  walbeck: {
    a: 6376896,
    b: 6355834.8467,
    ellipseName: 'Walbeck'
  },
  WGS60: {
    a: 6378165,
    rf: 298.3,
    ellipseName: 'WGS 60'
  },
  WGS66: {
    a: 6378145,
    rf: 298.25,
    ellipseName: 'WGS 66'
  },
  WGS7: {
    a: 6378135,
    rf: 298.26,
    ellipseName: 'WGS 72'
  },
  WGS84: {
    a: 6378137,
    rf: 298.257223563,
    ellipseName: 'WGS 84'
  },
  sphere: {
    a: 6370997,
    b: 6370997,
    ellipseName: 'Normal Sphere (r=6370997)'
  }
};

/* harmony default export */ const Ellipsoid = (ellipsoids);

;// ./node_modules/proj4/lib/deriveConstants.js




const WGS84 = Ellipsoid.WGS84; // default ellipsoid

function eccentricity(a, b, rf, R_A) {
  var a2 = a * a; // used in geocentric
  var b2 = b * b; // used in geocentric
  var es = (a2 - b2) / a2; // e ^ 2
  var e = 0;
  if (R_A) {
    a *= 1 - es * (SIXTH + es * (RA4 + es * RA6));
    a2 = a * a;
    es = 0;
  } else {
    e = Math.sqrt(es); // eccentricity
  }
  var ep2 = (a2 - b2) / b2; // used in geocentric
  return {
    es: es,
    e: e,
    ep2: ep2
  };
}
function sphere(a, b, rf, ellps, sphere) {
  if (!a) { // do we have an ellipsoid?
    var ellipse = match(Ellipsoid, ellps);
    if (!ellipse) {
      ellipse = WGS84;
    }
    a = ellipse.a;
    b = ellipse.b;
    rf = ellipse.rf;
  }

  if (rf && !b) {
    b = (1.0 - 1.0 / rf) * a;
  }
  if (rf === 0 || Math.abs(a - b) < EPSLN) {
    sphere = true;
    b = a;
  }
  return {
    a: a,
    b: b,
    rf: rf,
    sphere: sphere
  };
}

;// ./node_modules/proj4/lib/constants/Datum.js
var datums = {
  wgs84: {
    towgs84: '0,0,0',
    ellipse: 'WGS84',
    datumName: 'WGS84'
  },
  ch1903: {
    towgs84: '674.374,15.056,405.346',
    ellipse: 'bessel',
    datumName: 'swiss'
  },
  ggrs87: {
    towgs84: '-199.87,74.79,246.62',
    ellipse: 'GRS80',
    datumName: 'Greek_Geodetic_Reference_System_1987'
  },
  nad83: {
    towgs84: '0,0,0',
    ellipse: 'GRS80',
    datumName: 'North_American_Datum_1983'
  },
  nad27: {
    nadgrids: '@conus,@alaska,@ntv2_0.gsb,@ntv1_can.dat',
    ellipse: 'clrk66',
    datumName: 'North_American_Datum_1927'
  },
  potsdam: {
    towgs84: '598.1,73.7,418.2,0.202,0.045,-2.455,6.7',
    ellipse: 'bessel',
    datumName: 'Potsdam Rauenberg 1950 DHDN'
  },
  carthage: {
    towgs84: '-263.0,6.0,431.0',
    ellipse: 'clark80',
    datumName: 'Carthage 1934 Tunisia'
  },
  hermannskogel: {
    towgs84: '577.326,90.129,463.919,5.137,1.474,5.297,2.4232',
    ellipse: 'bessel',
    datumName: 'Hermannskogel'
  },
  mgi: {
    towgs84: '577.326,90.129,463.919,5.137,1.474,5.297,2.4232',
    ellipse: 'bessel',
    datumName: 'Militar-Geographische Institut'
  },
  osni52: {
    towgs84: '482.530,-130.596,564.557,-1.042,-0.214,-0.631,8.15',
    ellipse: 'airy',
    datumName: 'Irish National'
  },
  ire65: {
    towgs84: '482.530,-130.596,564.557,-1.042,-0.214,-0.631,8.15',
    ellipse: 'mod_airy',
    datumName: 'Ireland 1965'
  },
  rassadiran: {
    towgs84: '-133.63,-157.5,-158.62',
    ellipse: 'intl',
    datumName: 'Rassadiran'
  },
  nzgd49: {
    towgs84: '59.47,-5.04,187.44,0.47,-0.1,1.024,-4.5993',
    ellipse: 'intl',
    datumName: 'New Zealand Geodetic Datum 1949'
  },
  osgb36: {
    towgs84: '446.448,-125.157,542.060,0.1502,0.2470,0.8421,-20.4894',
    ellipse: 'airy',
    datumName: 'Ordnance Survey of Great Britain 1936'
  },
  s_jtsk: {
    towgs84: '589,76,480',
    ellipse: 'bessel',
    datumName: 'S-JTSK (Ferro)'
  },
  beduaram: {
    towgs84: '-106,-87,188',
    ellipse: 'clrk80',
    datumName: 'Beduaram'
  },
  gunung_segara: {
    towgs84: '-403,684,41',
    ellipse: 'bessel',
    datumName: 'Gunung Segara Jakarta'
  },
  rnb72: {
    towgs84: '106.869,-52.2978,103.724,-0.33657,0.456955,-1.84218,1',
    ellipse: 'intl',
    datumName: 'Reseau National Belge 1972'
  },
  EPSG_5451: {
    towgs84: '6.41,-49.05,-11.28,1.5657,0.5242,6.9718,-5.7649'
  },
  IGNF_LURESG: {
    towgs84: '-192.986,13.673,-39.309,-0.4099,-2.9332,2.6881,0.43'
  },
  EPSG_4614: {
    towgs84: '-119.4248,-303.65872,-11.00061,1.164298,0.174458,1.096259,3.657065'
  },
  EPSG_4615: {
    towgs84: '-494.088,-312.129,279.877,-1.423,-1.013,1.59,-0.748'
  },
  ESRI_37241: {
    towgs84: '-76.822,257.457,-12.817,2.136,-0.033,-2.392,-0.031'
  },
  ESRI_37249: {
    towgs84: '-440.296,58.548,296.265,1.128,10.202,4.559,-0.438'
  },
  ESRI_37245: {
    towgs84: '-511.151,-181.269,139.609,1.05,2.703,1.798,3.071'
  },
  EPSG_4178: {
    towgs84: '24.9,-126.4,-93.2,-0.063,-0.247,-0.041,1.01'
  },
  EPSG_4622: {
    towgs84: '-472.29,-5.63,-304.12,0.4362,-0.8374,0.2563,1.8984'
  },
  EPSG_4625: {
    towgs84: '126.93,547.94,130.41,-2.7867,5.1612,-0.8584,13.8227'
  },
  EPSG_5252: {
    towgs84: '0.023,0.036,-0.068,0.00176,0.00912,-0.01136,0.00439'
  },
  EPSG_4314: {
    towgs84: '597.1,71.4,412.1,0.894,0.068,-1.563,7.58'
  },
  EPSG_4282: {
    towgs84: '-178.3,-316.7,-131.5,5.278,6.077,10.979,19.166'
  },
  EPSG_4231: {
    towgs84: '-83.11,-97.38,-117.22,0.0276,-0.2167,0.2147,0.1218'
  },
  EPSG_4274: {
    towgs84: '-230.994,102.591,25.199,0.633,-0.239,0.9,1.95'
  },
  EPSG_4134: {
    towgs84: '-180.624,-225.516,173.919,-0.81,-1.898,8.336,16.71006'
  },
  EPSG_4254: {
    towgs84: '18.38,192.45,96.82,0.056,-0.142,-0.2,-0.0013'
  },
  EPSG_4159: {
    towgs84: '-194.513,-63.978,-25.759,-3.4027,3.756,-3.352,-0.9175'
  },
  EPSG_4687: {
    towgs84: '0.072,-0.507,-0.245,0.0183,-0.0003,0.007,-0.0093'
  },
  EPSG_4227: {
    towgs84: '-83.58,-397.54,458.78,-17.595,-2.847,4.256,3.225'
  },
  EPSG_4746: {
    towgs84: '599.4,72.4,419.2,-0.062,-0.022,-2.723,6.46'
  },
  EPSG_4745: {
    towgs84: '612.4,77,440.2,-0.054,0.057,-2.797,2.55'
  },
  EPSG_6311: {
    towgs84: '8.846,-4.394,-1.122,-0.00237,-0.146528,0.130428,0.783926'
  },
  EPSG_4289: {
    towgs84: '565.7381,50.4018,465.2904,-1.91514,1.60363,-9.09546,4.07244'
  },
  EPSG_4230: {
    towgs84: '-68.863,-134.888,-111.49,-0.53,-0.14,0.57,-3.4'
  },
  EPSG_4154: {
    towgs84: '-123.02,-158.95,-168.47'
  },
  EPSG_4156: {
    towgs84: '570.8,85.7,462.8,4.998,1.587,5.261,3.56'
  },
  EPSG_4299: {
    towgs84: '482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15'
  },
  EPSG_4179: {
    towgs84: '33.4,-146.6,-76.3,-0.359,-0.053,0.844,-0.84'
  },
  EPSG_4313: {
    towgs84: '-106.8686,52.2978,-103.7239,0.3366,-0.457,1.8422,-1.2747'
  },
  EPSG_4194: {
    towgs84: '163.511,127.533,-159.789'
  },
  EPSG_4195: {
    towgs84: '105,326,-102.5'
  },
  EPSG_4196: {
    towgs84: '-45,417,-3.5'
  },
  EPSG_4611: {
    towgs84: '-162.619,-276.959,-161.764,0.067753,-2.243649,-1.158827,-1.094246'
  },
  EPSG_4633: {
    towgs84: '137.092,131.66,91.475,-1.9436,-11.5993,-4.3321,-7.4824'
  },
  EPSG_4641: {
    towgs84: '-408.809,366.856,-412.987,1.8842,-0.5308,2.1655,-121.0993'
  },
  EPSG_4643: {
    towgs84: '-480.26,-438.32,-643.429,16.3119,20.1721,-4.0349,-111.7002'
  },
  EPSG_4300: {
    towgs84: '482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15'
  },
  EPSG_4188: {
    towgs84: '482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15'
  },
  EPSG_4660: {
    towgs84: '982.6087,552.753,-540.873,32.39344,-153.25684,-96.2266,16.805'
  },
  EPSG_4662: {
    towgs84: '97.295,-263.247,310.882,-1.5999,0.8386,3.1409,13.3259'
  },
  EPSG_3906: {
    towgs84: '577.88891,165.22205,391.18289,4.9145,-0.94729,-13.05098,7.78664'
  },
  EPSG_4307: {
    towgs84: '-209.3622,-87.8162,404.6198,0.0046,3.4784,0.5805,-1.4547'
  },
  EPSG_6892: {
    towgs84: '-76.269,-16.683,68.562,-6.275,10.536,-4.286,-13.686'
  },
  EPSG_4690: {
    towgs84: '221.597,152.441,176.523,2.403,1.3893,0.884,11.4648'
  },
  EPSG_4691: {
    towgs84: '218.769,150.75,176.75,3.5231,2.0037,1.288,10.9817'
  },
  EPSG_4629: {
    towgs84: '72.51,345.411,79.241,-1.5862,-0.8826,-0.5495,1.3653'
  },
  EPSG_4630: {
    towgs84: '165.804,216.213,180.26,-0.6251,-0.4515,-0.0721,7.4111'
  },
  EPSG_4692: {
    towgs84: '217.109,86.452,23.711,0.0183,-0.0003,0.007,-0.0093'
  },
  EPSG_9333: {
    towgs84: '0,0,0,-8.393,0.749,-10.276,0'
  },
  EPSG_9059: {
    towgs84: '0,0,0'
  },
  EPSG_4312: {
    towgs84: '601.705,84.263,485.227,4.7354,1.3145,5.393,-2.3887'
  },
  EPSG_4123: {
    towgs84: '-96.062,-82.428,-121.753,4.801,0.345,-1.376,1.496'
  },
  EPSG_4309: {
    towgs84: '-124.45,183.74,44.64,-0.4384,0.5446,-0.9706,-2.1365'
  },
  ESRI_104106: {
    towgs84: '-283.088,-70.693,117.445,-1.157,0.059,-0.652,-4.058'
  },
  EPSG_4281: {
    towgs84: '-219.247,-73.802,269.529'
  },
  EPSG_4322: {
    towgs84: '0,0,4.5'
  },
  EPSG_4324: {
    towgs84: '0,0,1.9'
  },
  EPSG_4284: {
    towgs84: '43.822,-108.842,-119.585,1.455,-0.761,0.737,0.549'
  },
  EPSG_4277: {
    towgs84: '446.448,-125.157,542.06,0.15,0.247,0.842,-20.489'
  },
  EPSG_4207: {
    towgs84: '-282.1,-72.2,120,-1.529,0.145,-0.89,-4.46'
  },
  EPSG_4688: {
    towgs84: '347.175,1077.618,2623.677,33.9058,-70.6776,9.4013,186.0647'
  },
  EPSG_4689: {
    towgs84: '410.793,54.542,80.501,-2.5596,-2.3517,-0.6594,17.3218'
  },
  EPSG_4720: {
    towgs84: '0,0,4.5'
  },
  EPSG_4273: {
    towgs84: '278.3,93,474.5,7.889,0.05,-6.61,6.21'
  },
  EPSG_4240: {
    towgs84: '204.64,834.74,293.8'
  },
  EPSG_4817: {
    towgs84: '278.3,93,474.5,7.889,0.05,-6.61,6.21'
  },
  ESRI_104131: {
    towgs84: '426.62,142.62,460.09,4.98,4.49,-12.42,-17.1'
  },
  EPSG_4265: {
    towgs84: '-104.1,-49.1,-9.9,0.971,-2.917,0.714,-11.68'
  },
  EPSG_4263: {
    towgs84: '-111.92,-87.85,114.5,1.875,0.202,0.219,0.032'
  },
  EPSG_4298: {
    towgs84: '-689.5937,623.84046,-65.93566,-0.02331,1.17094,-0.80054,5.88536'
  },
  EPSG_4270: {
    towgs84: '-253.4392,-148.452,386.5267,0.15605,0.43,-0.1013,-0.0424'
  },
  EPSG_4229: {
    towgs84: '-121.8,98.1,-10.7'
  },
  EPSG_4220: {
    towgs84: '-55.5,-348,-229.2'
  },
  EPSG_4214: {
    towgs84: '12.646,-155.176,-80.863'
  },
  EPSG_4232: {
    towgs84: '-345,3,223'
  },
  EPSG_4238: {
    towgs84: '-1.977,-13.06,-9.993,0.364,0.254,0.689,-1.037'
  },
  EPSG_4168: {
    towgs84: '-170,33,326'
  },
  EPSG_4131: {
    towgs84: '199,931,318.9'
  },
  EPSG_4152: {
    towgs84: '-0.9102,2.0141,0.5602,0.029039,0.010065,0.010101,0'
  },
  EPSG_5228: {
    towgs84: '572.213,85.334,461.94,4.9732,1.529,5.2484,3.5378'
  },
  EPSG_8351: {
    towgs84: '485.021,169.465,483.839,7.786342,4.397554,4.102655,0'
  },
  EPSG_4683: {
    towgs84: '-127.62,-67.24,-47.04,-3.068,4.903,1.578,-1.06'
  },
  EPSG_4133: {
    towgs84: '0,0,0'
  },
  EPSG_7373: {
    towgs84: '0.819,-0.5762,-1.6446,-0.00378,-0.03317,0.00318,0.0693'
  },
  EPSG_9075: {
    towgs84: '-0.9102,2.0141,0.5602,0.029039,0.010065,0.010101,0'
  },
  EPSG_9072: {
    towgs84: '-0.9102,2.0141,0.5602,0.029039,0.010065,0.010101,0'
  },
  EPSG_9294: {
    towgs84: '1.16835,-1.42001,-2.24431,-0.00822,-0.05508,0.01818,0.23388'
  },
  EPSG_4212: {
    towgs84: '-267.434,173.496,181.814,-13.4704,8.7154,7.3926,14.7492'
  },
  EPSG_4191: {
    towgs84: '-44.183,-0.58,-38.489,2.3867,2.7072,-3.5196,-8.2703'
  },
  EPSG_4237: {
    towgs84: '52.684,-71.194,-13.975,-0.312,-0.1063,-0.3729,1.0191'
  },
  EPSG_4740: {
    towgs84: '-1.08,-0.27,-0.9'
  },
  EPSG_4124: {
    towgs84: '419.3836,99.3335,591.3451,0.850389,1.817277,-7.862238,-0.99496'
  },
  EPSG_5681: {
    towgs84: '584.9636,107.7175,413.8067,1.1155,0.2824,-3.1384,7.9922'
  },
  EPSG_4141: {
    towgs84: '23.772,17.49,17.859,-0.3132,-1.85274,1.67299,-5.4262'
  },
  EPSG_4204: {
    towgs84: '-85.645,-273.077,-79.708,2.289,-1.421,2.532,3.194'
  },
  EPSG_4319: {
    towgs84: '226.702,-193.337,-35.371,-2.229,-4.391,9.238,0.9798'
  },
  EPSG_4200: {
    towgs84: '24.82,-131.21,-82.66'
  },
  EPSG_4130: {
    towgs84: '0,0,0'
  },
  EPSG_4127: {
    towgs84: '-82.875,-57.097,-156.768,-2.158,1.524,-0.982,-0.359'
  },
  EPSG_4149: {
    towgs84: '674.374,15.056,405.346'
  },
  EPSG_4617: {
    towgs84: '-0.991,1.9072,0.5129,1.25033e-7,4.6785e-8,5.6529e-8,0'
  },
  EPSG_4663: {
    towgs84: '-210.502,-66.902,-48.476,2.094,-15.067,-5.817,0.485'
  },
  EPSG_4664: {
    towgs84: '-211.939,137.626,58.3,-0.089,0.251,0.079,0.384'
  },
  EPSG_4665: {
    towgs84: '-105.854,165.589,-38.312,-0.003,-0.026,0.024,-0.048'
  },
  EPSG_4666: {
    towgs84: '631.392,-66.551,481.442,1.09,-4.445,-4.487,-4.43'
  },
  EPSG_4756: {
    towgs84: '-192.873,-39.382,-111.202,-0.00205,-0.0005,0.00335,0.0188'
  },
  EPSG_4723: {
    towgs84: '-179.483,-69.379,-27.584,-7.862,8.163,6.042,-13.925'
  },
  EPSG_4726: {
    towgs84: '8.853,-52.644,180.304,-0.393,-2.323,2.96,-24.081'
  },
  EPSG_4267: {
    towgs84: '-8.0,160.0,176.0'
  },
  EPSG_5365: {
    towgs84: '-0.16959,0.35312,0.51846,0.03385,-0.16325,0.03446,0.03693'
  },
  EPSG_4218: {
    towgs84: '304.5,306.5,-318.1'
  },
  EPSG_4242: {
    towgs84: '-33.722,153.789,94.959,-8.581,-4.478,4.54,8.95'
  },
  EPSG_4216: {
    towgs84: '-292.295,248.758,429.447,4.9971,2.99,6.6906,1.0289'
  },
  ESRI_104105: {
    towgs84: '631.392,-66.551,481.442,1.09,-4.445,-4.487,-4.43'
  },
  ESRI_104129: {
    towgs84: '0,0,0'
  },
  EPSG_4673: {
    towgs84: '174.05,-25.49,112.57'
  },
  EPSG_4202: {
    towgs84: '-124,-60,154'
  },
  EPSG_4203: {
    towgs84: '-117.763,-51.51,139.061,0.292,0.443,0.277,-0.191'
  },
  EPSG_3819: {
    towgs84: '595.48,121.69,515.35,4.115,-2.9383,0.853,-3.408'
  },
  EPSG_8694: {
    towgs84: '-93.799,-132.737,-219.073,-1.844,0.648,-6.37,-0.169'
  },
  EPSG_4145: {
    towgs84: '275.57,676.78,229.6'
  },
  EPSG_4283: {
    towgs84: '61.55,-10.87,-40.19,39.4924,32.7221,32.8979,-9.994'
  },
  EPSG_4317: {
    towgs84: '2.3287,-147.0425,-92.0802,-0.3092483,0.32482185,0.49729934,5.68906266'
  },
  EPSG_4272: {
    towgs84: '59.47,-5.04,187.44,0.47,-0.1,1.024,-4.5993'
  },
  EPSG_4248: {
    towgs84: '-307.7,265.3,-363.5'
  },
  EPSG_5561: {
    towgs84: '24,-121,-76'
  },
  EPSG_5233: {
    towgs84: '-0.293,766.95,87.713,0.195704,1.695068,3.473016,-0.039338'
  },
  ESRI_104130: {
    towgs84: '-86,-98,-119'
  },
  ESRI_104102: {
    towgs84: '682,-203,480'
  },
  ESRI_37207: {
    towgs84: '7,-10,-26'
  },
  EPSG_4675: {
    towgs84: '59.935,118.4,-10.871'
  },
  ESRI_104109: {
    towgs84: '-89.121,-348.182,260.871'
  },
  ESRI_104112: {
    towgs84: '-185.583,-230.096,281.361'
  },
  ESRI_104113: {
    towgs84: '25.1,-275.6,222.6'
  },
  IGNF_WGS72G: {
    towgs84: '0,12,6'
  },
  IGNF_NTFG: {
    towgs84: '-168,-60,320'
  },
  IGNF_EFATE57G: {
    towgs84: '-127,-769,472'
  },
  IGNF_PGP50G: {
    towgs84: '324.8,153.6,172.1'
  },
  IGNF_REUN47G: {
    towgs84: '94,-948,-1262'
  },
  IGNF_CSG67G: {
    towgs84: '-186,230,110'
  },
  IGNF_GUAD48G: {
    towgs84: '-467,-16,-300'
  },
  IGNF_TAHI51G: {
    towgs84: '162,117,154'
  },
  IGNF_TAHAAG: {
    towgs84: '65,342,77'
  },
  IGNF_NUKU72G: {
    towgs84: '84,274,65'
  },
  IGNF_PETRELS72G: {
    towgs84: '365,194,166'
  },
  IGNF_WALL78G: {
    towgs84: '253,-133,-127'
  },
  IGNF_MAYO50G: {
    towgs84: '-382,-59,-262'
  },
  IGNF_TANNAG: {
    towgs84: '-139,-967,436'
  },
  IGNF_IGN72G: {
    towgs84: '-13,-348,292'
  },
  IGNF_ATIGG: {
    towgs84: '1118,23,66'
  },
  IGNF_FANGA84G: {
    towgs84: '150.57,158.33,118.32'
  },
  IGNF_RUSAT84G: {
    towgs84: '202.13,174.6,-15.74'
  },
  IGNF_KAUE70G: {
    towgs84: '126.74,300.1,-75.49'
  },
  IGNF_MOP90G: {
    towgs84: '-10.8,-1.8,12.77'
  },
  IGNF_MHPF67G: {
    towgs84: '338.08,212.58,-296.17'
  },
  IGNF_TAHI79G: {
    towgs84: '160.61,116.05,153.69'
  },
  IGNF_ANAA92G: {
    towgs84: '1.5,3.84,4.81'
  },
  IGNF_MARQUI72G: {
    towgs84: '330.91,-13.92,58.56'
  },
  IGNF_APAT86G: {
    towgs84: '143.6,197.82,74.05'
  },
  IGNF_TUBU69G: {
    towgs84: '237.17,171.61,-77.84'
  },
  IGNF_STPM50G: {
    towgs84: '11.363,424.148,373.13'
  },
  EPSG_4150: {
    towgs84: '674.374,15.056,405.346'
  },
  EPSG_4754: {
    towgs84: '-208.4058,-109.8777,-2.5764'
  },
  ESRI_104101: {
    towgs84: '374,150,588'
  },
  EPSG_4693: {
    towgs84: '0,-0.15,0.68'
  },
  EPSG_6207: {
    towgs84: '293.17,726.18,245.36'
  },
  EPSG_4153: {
    towgs84: '-133.63,-157.5,-158.62'
  },
  EPSG_4132: {
    towgs84: '-241.54,-163.64,396.06'
  },
  EPSG_4221: {
    towgs84: '-154.5,150.7,100.4'
  },
  EPSG_4266: {
    towgs84: '-80.7,-132.5,41.1'
  },
  EPSG_4193: {
    towgs84: '-70.9,-151.8,-41.4'
  },
  EPSG_5340: {
    towgs84: '-0.41,0.46,-0.35'
  },
  EPSG_4246: {
    towgs84: '-294.7,-200.1,525.5'
  },
  EPSG_4318: {
    towgs84: '-3.2,-5.7,2.8'
  },
  EPSG_4121: {
    towgs84: '-199.87,74.79,246.62'
  },
  EPSG_4223: {
    towgs84: '-260.1,5.5,432.2'
  },
  EPSG_4158: {
    towgs84: '-0.465,372.095,171.736'
  },
  EPSG_4285: {
    towgs84: '-128.16,-282.42,21.93'
  },
  EPSG_4613: {
    towgs84: '-404.78,685.68,45.47'
  },
  EPSG_4607: {
    towgs84: '195.671,332.517,274.607'
  },
  EPSG_4475: {
    towgs84: '-381.788,-57.501,-256.673'
  },
  EPSG_4208: {
    towgs84: '-157.84,308.54,-146.6'
  },
  EPSG_4743: {
    towgs84: '70.995,-335.916,262.898'
  },
  EPSG_4710: {
    towgs84: '-323.65,551.39,-491.22'
  },
  EPSG_7881: {
    towgs84: '-0.077,0.079,0.086'
  },
  EPSG_4682: {
    towgs84: '283.729,735.942,261.143'
  },
  EPSG_4739: {
    towgs84: '-156,-271,-189'
  },
  EPSG_4679: {
    towgs84: '-80.01,253.26,291.19'
  },
  EPSG_4750: {
    towgs84: '-56.263,16.136,-22.856'
  },
  EPSG_4644: {
    towgs84: '-10.18,-350.43,291.37'
  },
  EPSG_4695: {
    towgs84: '-103.746,-9.614,-255.95'
  },
  EPSG_4292: {
    towgs84: '-355,21,72'
  },
  EPSG_4302: {
    towgs84: '-61.702,284.488,472.052'
  },
  EPSG_4143: {
    towgs84: '-124.76,53,466.79'
  },
  EPSG_4606: {
    towgs84: '-153,153,307'
  },
  EPSG_4699: {
    towgs84: '-770.1,158.4,-498.2'
  },
  EPSG_4247: {
    towgs84: '-273.5,110.6,-357.9'
  },
  EPSG_4160: {
    towgs84: '8.88,184.86,106.69'
  },
  EPSG_4161: {
    towgs84: '-233.43,6.65,173.64'
  },
  EPSG_9251: {
    towgs84: '-9.5,122.9,138.2'
  },
  EPSG_9253: {
    towgs84: '-78.1,101.6,133.3'
  },
  EPSG_4297: {
    towgs84: '-198.383,-240.517,-107.909'
  },
  EPSG_4269: {
    towgs84: '0,0,0'
  },
  EPSG_4301: {
    towgs84: '-147,506,687'
  },
  EPSG_4618: {
    towgs84: '-59,-11,-52'
  },
  EPSG_4612: {
    towgs84: '0,0,0'
  },
  EPSG_4678: {
    towgs84: '44.585,-131.212,-39.544'
  },
  EPSG_4250: {
    towgs84: '-130,29,364'
  },
  EPSG_4144: {
    towgs84: '214,804,268'
  },
  EPSG_4147: {
    towgs84: '-17.51,-108.32,-62.39'
  },
  EPSG_4259: {
    towgs84: '-254.1,-5.36,-100.29'
  },
  EPSG_4164: {
    towgs84: '-76,-138,67'
  },
  EPSG_4211: {
    towgs84: '-378.873,676.002,-46.255'
  },
  EPSG_4182: {
    towgs84: '-422.651,-172.995,84.02'
  },
  EPSG_4224: {
    towgs84: '-143.87,243.37,-33.52'
  },
  EPSG_4225: {
    towgs84: '-205.57,168.77,-4.12'
  },
  EPSG_5527: {
    towgs84: '-67.35,3.88,-38.22'
  },
  EPSG_4752: {
    towgs84: '98,390,-22'
  },
  EPSG_4310: {
    towgs84: '-30,190,89'
  },
  EPSG_9248: {
    towgs84: '-192.26,65.72,132.08'
  },
  EPSG_4680: {
    towgs84: '124.5,-63.5,-281'
  },
  EPSG_4701: {
    towgs84: '-79.9,-158,-168.9'
  },
  EPSG_4706: {
    towgs84: '-146.21,112.63,4.05'
  },
  EPSG_4805: {
    towgs84: '682,-203,480'
  },
  EPSG_4201: {
    towgs84: '-165,-11,206'
  },
  EPSG_4210: {
    towgs84: '-157,-2,-299'
  },
  EPSG_4183: {
    towgs84: '-104,167,-38'
  },
  EPSG_4139: {
    towgs84: '11,72,-101'
  },
  EPSG_4668: {
    towgs84: '-86,-98,-119'
  },
  EPSG_4717: {
    towgs84: '-2,151,181'
  },
  EPSG_4732: {
    towgs84: '102,52,-38'
  },
  EPSG_4280: {
    towgs84: '-377,681,-50'
  },
  EPSG_4209: {
    towgs84: '-138,-105,-289'
  },
  EPSG_4261: {
    towgs84: '31,146,47'
  },
  EPSG_4658: {
    towgs84: '-73,46,-86'
  },
  EPSG_4721: {
    towgs84: '265.025,384.929,-194.046'
  },
  EPSG_4222: {
    towgs84: '-136,-108,-292'
  },
  EPSG_4601: {
    towgs84: '-255,-15,71'
  },
  EPSG_4602: {
    towgs84: '725,685,536'
  },
  EPSG_4603: {
    towgs84: '72,213.7,93'
  },
  EPSG_4605: {
    towgs84: '9,183,236'
  },
  EPSG_4621: {
    towgs84: '137,248,-430'
  },
  EPSG_4657: {
    towgs84: '-28,199,5'
  },
  EPSG_4316: {
    towgs84: '103.25,-100.4,-307.19'
  },
  EPSG_4642: {
    towgs84: '-13,-348,292'
  },
  EPSG_4698: {
    towgs84: '145,-187,103'
  },
  EPSG_4192: {
    towgs84: '-206.1,-174.7,-87.7'
  },
  EPSG_4311: {
    towgs84: '-265,120,-358'
  },
  EPSG_4135: {
    towgs84: '58,-283,-182'
  },
  ESRI_104138: {
    towgs84: '198,-226,-347'
  },
  EPSG_4245: {
    towgs84: '-11,851,5'
  },
  EPSG_4142: {
    towgs84: '-125,53,467'
  },
  EPSG_4213: {
    towgs84: '-106,-87,188'
  },
  EPSG_4253: {
    towgs84: '-133,-77,-51'
  },
  EPSG_4129: {
    towgs84: '-132,-110,-335'
  },
  EPSG_4713: {
    towgs84: '-77,-128,142'
  },
  EPSG_4239: {
    towgs84: '217,823,299'
  },
  EPSG_4146: {
    towgs84: '295,736,257'
  },
  EPSG_4155: {
    towgs84: '-83,37,124'
  },
  EPSG_4165: {
    towgs84: '-173,253,27'
  },
  EPSG_4672: {
    towgs84: '175,-38,113'
  },
  EPSG_4236: {
    towgs84: '-637,-549,-203'
  },
  EPSG_4251: {
    towgs84: '-90,40,88'
  },
  EPSG_4271: {
    towgs84: '-2,374,172'
  },
  EPSG_4175: {
    towgs84: '-88,4,101'
  },
  EPSG_4716: {
    towgs84: '298,-304,-375'
  },
  EPSG_4315: {
    towgs84: '-23,259,-9'
  },
  EPSG_4744: {
    towgs84: '-242.2,-144.9,370.3'
  },
  EPSG_4244: {
    towgs84: '-97,787,86'
  },
  EPSG_4293: {
    towgs84: '616,97,-251'
  },
  EPSG_4714: {
    towgs84: '-127,-769,472'
  },
  EPSG_4736: {
    towgs84: '260,12,-147'
  },
  EPSG_6883: {
    towgs84: '-235,-110,393'
  },
  EPSG_6894: {
    towgs84: '-63,176,185'
  },
  EPSG_4205: {
    towgs84: '-43,-163,45'
  },
  EPSG_4256: {
    towgs84: '41,-220,-134'
  },
  EPSG_4262: {
    towgs84: '639,405,60'
  },
  EPSG_4604: {
    towgs84: '174,359,365'
  },
  EPSG_4169: {
    towgs84: '-115,118,426'
  },
  EPSG_4620: {
    towgs84: '-106,-129,165'
  },
  EPSG_4184: {
    towgs84: '-203,141,53'
  },
  EPSG_4616: {
    towgs84: '-289,-124,60'
  },
  EPSG_9403: {
    towgs84: '-307,-92,127'
  },
  EPSG_4684: {
    towgs84: '-133,-321,50'
  },
  EPSG_4708: {
    towgs84: '-491,-22,435'
  },
  EPSG_4707: {
    towgs84: '114,-116,-333'
  },
  EPSG_4709: {
    towgs84: '145,75,-272'
  },
  EPSG_4712: {
    towgs84: '-205,107,53'
  },
  EPSG_4711: {
    towgs84: '124,-234,-25'
  },
  EPSG_4718: {
    towgs84: '230,-199,-752'
  },
  EPSG_4719: {
    towgs84: '211,147,111'
  },
  EPSG_4724: {
    towgs84: '208,-435,-229'
  },
  EPSG_4725: {
    towgs84: '189,-79,-202'
  },
  EPSG_4735: {
    towgs84: '647,1777,-1124'
  },
  EPSG_4722: {
    towgs84: '-794,119,-298'
  },
  EPSG_4728: {
    towgs84: '-307,-92,127'
  },
  EPSG_4734: {
    towgs84: '-632,438,-609'
  },
  EPSG_4727: {
    towgs84: '912,-58,1227'
  },
  EPSG_4729: {
    towgs84: '185,165,42'
  },
  EPSG_4730: {
    towgs84: '170,42,84'
  },
  EPSG_4733: {
    towgs84: '276,-57,149'
  },
  ESRI_37218: {
    towgs84: '230,-199,-752'
  },
  ESRI_37240: {
    towgs84: '-7,215,225'
  },
  ESRI_37221: {
    towgs84: '252,-209,-751'
  },
  ESRI_4305: {
    towgs84: '-123,-206,219'
  },
  ESRI_104139: {
    towgs84: '-73,-247,227'
  },
  EPSG_4748: {
    towgs84: '51,391,-36'
  },
  EPSG_4219: {
    towgs84: '-384,664,-48'
  },
  EPSG_4255: {
    towgs84: '-333,-222,114'
  },
  EPSG_4257: {
    towgs84: '-587.8,519.75,145.76'
  },
  EPSG_4646: {
    towgs84: '-963,510,-359'
  },
  EPSG_6881: {
    towgs84: '-24,-203,268'
  },
  EPSG_6882: {
    towgs84: '-183,-15,273'
  },
  EPSG_4715: {
    towgs84: '-104,-129,239'
  },
  IGNF_RGF93GDD: {
    towgs84: '0,0,0'
  },
  IGNF_RGM04GDD: {
    towgs84: '0,0,0'
  },
  IGNF_RGSPM06GDD: {
    towgs84: '0,0,0'
  },
  IGNF_RGTAAF07GDD: {
    towgs84: '0,0,0'
  },
  IGNF_RGFG95GDD: {
    towgs84: '0,0,0'
  },
  IGNF_RGNCG: {
    towgs84: '0,0,0'
  },
  IGNF_RGPFGDD: {
    towgs84: '0,0,0'
  },
  IGNF_ETRS89G: {
    towgs84: '0,0,0'
  },
  IGNF_RGR92GDD: {
    towgs84: '0,0,0'
  },
  EPSG_4173: {
    towgs84: '0,0,0'
  },
  EPSG_4180: {
    towgs84: '0,0,0'
  },
  EPSG_4619: {
    towgs84: '0,0,0'
  },
  EPSG_4667: {
    towgs84: '0,0,0'
  },
  EPSG_4075: {
    towgs84: '0,0,0'
  },
  EPSG_6706: {
    towgs84: '0,0,0'
  },
  EPSG_7798: {
    towgs84: '0,0,0'
  },
  EPSG_4661: {
    towgs84: '0,0,0'
  },
  EPSG_4669: {
    towgs84: '0,0,0'
  },
  EPSG_8685: {
    towgs84: '0,0,0'
  },
  EPSG_4151: {
    towgs84: '0,0,0'
  },
  EPSG_9702: {
    towgs84: '0,0,0'
  },
  EPSG_4758: {
    towgs84: '0,0,0'
  },
  EPSG_4761: {
    towgs84: '0,0,0'
  },
  EPSG_4765: {
    towgs84: '0,0,0'
  },
  EPSG_8997: {
    towgs84: '0,0,0'
  },
  EPSG_4023: {
    towgs84: '0,0,0'
  },
  EPSG_4670: {
    towgs84: '0,0,0'
  },
  EPSG_4694: {
    towgs84: '0,0,0'
  },
  EPSG_4148: {
    towgs84: '0,0,0'
  },
  EPSG_4163: {
    towgs84: '0,0,0'
  },
  EPSG_4167: {
    towgs84: '0,0,0'
  },
  EPSG_4189: {
    towgs84: '0,0,0'
  },
  EPSG_4190: {
    towgs84: '0,0,0'
  },
  EPSG_4176: {
    towgs84: '0,0,0'
  },
  EPSG_4659: {
    towgs84: '0,0,0'
  },
  EPSG_3824: {
    towgs84: '0,0,0'
  },
  EPSG_3889: {
    towgs84: '0,0,0'
  },
  EPSG_4046: {
    towgs84: '0,0,0'
  },
  EPSG_4081: {
    towgs84: '0,0,0'
  },
  EPSG_4558: {
    towgs84: '0,0,0'
  },
  EPSG_4483: {
    towgs84: '0,0,0'
  },
  EPSG_5013: {
    towgs84: '0,0,0'
  },
  EPSG_5264: {
    towgs84: '0,0,0'
  },
  EPSG_5324: {
    towgs84: '0,0,0'
  },
  EPSG_5354: {
    towgs84: '0,0,0'
  },
  EPSG_5371: {
    towgs84: '0,0,0'
  },
  EPSG_5373: {
    towgs84: '0,0,0'
  },
  EPSG_5381: {
    towgs84: '0,0,0'
  },
  EPSG_5393: {
    towgs84: '0,0,0'
  },
  EPSG_5489: {
    towgs84: '0,0,0'
  },
  EPSG_5593: {
    towgs84: '0,0,0'
  },
  EPSG_6135: {
    towgs84: '0,0,0'
  },
  EPSG_6365: {
    towgs84: '0,0,0'
  },
  EPSG_5246: {
    towgs84: '0,0,0'
  },
  EPSG_7886: {
    towgs84: '0,0,0'
  },
  EPSG_8431: {
    towgs84: '0,0,0'
  },
  EPSG_8427: {
    towgs84: '0,0,0'
  },
  EPSG_8699: {
    towgs84: '0,0,0'
  },
  EPSG_8818: {
    towgs84: '0,0,0'
  },
  EPSG_4757: {
    towgs84: '0,0,0'
  },
  EPSG_9140: {
    towgs84: '0,0,0'
  },
  EPSG_8086: {
    towgs84: '0,0,0'
  },
  EPSG_4686: {
    towgs84: '0,0,0'
  },
  EPSG_4737: {
    towgs84: '0,0,0'
  },
  EPSG_4702: {
    towgs84: '0,0,0'
  },
  EPSG_4747: {
    towgs84: '0,0,0'
  },
  EPSG_4749: {
    towgs84: '0,0,0'
  },
  EPSG_4674: {
    towgs84: '0,0,0'
  },
  EPSG_4755: {
    towgs84: '0,0,0'
  },
  EPSG_4759: {
    towgs84: '0,0,0'
  },
  EPSG_4762: {
    towgs84: '0,0,0'
  },
  EPSG_4763: {
    towgs84: '0,0,0'
  },
  EPSG_4764: {
    towgs84: '0,0,0'
  },
  EPSG_4166: {
    towgs84: '0,0,0'
  },
  EPSG_4170: {
    towgs84: '0,0,0'
  },
  EPSG_5546: {
    towgs84: '0,0,0'
  },
  EPSG_7844: {
    towgs84: '0,0,0'
  },
  EPSG_4818: {
    towgs84: '589,76,480'
  }
};

for (var key in datums) {
  var datum = datums[key];
  if (!datum.datumName) {
    continue;
  }
  datums[datum.datumName] = datum;
}

/* harmony default export */ const Datum = (datums);

;// ./node_modules/proj4/lib/datum.js


function datum_datum(datumCode, datum_params, a, b, es, ep2, nadgrids) {
  var out = {};

  if (datumCode === undefined || datumCode === 'none') {
    out.datum_type = PJD_NODATUM;
  } else {
    out.datum_type = PJD_WGS84;
  }

  if (datum_params) {
    out.datum_params = datum_params.map(parseFloat);
    if (out.datum_params[0] !== 0 || out.datum_params[1] !== 0 || out.datum_params[2] !== 0) {
      out.datum_type = PJD_3PARAM;
    }
    if (out.datum_params.length > 3) {
      if (out.datum_params[3] !== 0 || out.datum_params[4] !== 0 || out.datum_params[5] !== 0 || out.datum_params[6] !== 0) {
        out.datum_type = PJD_7PARAM;
        out.datum_params[3] *= SEC_TO_RAD;
        out.datum_params[4] *= SEC_TO_RAD;
        out.datum_params[5] *= SEC_TO_RAD;
        out.datum_params[6] = (out.datum_params[6] / 1000000.0) + 1.0;
      }
    }
  }

  if (nadgrids) {
    out.datum_type = PJD_GRIDSHIFT;
    out.grids = nadgrids;
  }
  out.a = a; // datum object also uses these values
  out.b = b;
  out.es = es;
  out.ep2 = ep2;
  return out;
}

/* harmony default export */ const lib_datum = (datum_datum);

;// ./node_modules/proj4/lib/nadgrid.js
/**
 * Resources for details of NTv2 file formats:
 * - https://web.archive.org/web/20140127204822if_/http://www.mgs.gov.on.ca:80/stdprodconsume/groups/content/@mgs/@iandit/documents/resourcelist/stel02_047447.pdf
 * - http://mimaka.com/help/gs/html/004_NTV2%20Data%20Format.htm
 */

/**
 * @typedef {Object} NadgridInfo
 * @property {string} name The name of the NAD grid or 'null' if not specified.
 * @property {boolean} mandatory Indicates if the grid is mandatory (true) or optional (false).
 * @property {*} grid The loaded NAD grid object, or null if not loaded or not applicable.
 * @property {boolean} isNull True if the grid is explicitly 'null', otherwise false.
 */

/**
 * @typedef {Object} NTV2GridOptions
 * @property {boolean} [includeErrorFields=true] Whether to include error fields in the subgrids.
 */

/**
 * @typedef {Object} NadgridHeader
 * @property {number} [nFields] Number of fields in the header.
 * @property {number} [nSubgridFields] Number of fields in each subgrid header.
 * @property {number} nSubgrids Number of subgrids in the file.
 * @property {string} [shiftType] Type of shift (e.g., "SECONDS").
 * @property {number} [fromSemiMajorAxis] Source ellipsoid semi-major axis.
 * @property {number} [fromSemiMinorAxis] Source ellipsoid semi-minor axis.
 * @property {number} [toSemiMajorAxis] Target ellipsoid semi-major axis.
 * @property {number} [toSemiMinorAxis] Target ellipsoid semi-minor axis.
 */

/**
 * @typedef {Object} Subgrid
 * @property {Array<number>} ll Lower left corner of the grid in radians [longitude, latitude].
 * @property {Array<number>} del Grid spacing in radians [longitude interval, latitude interval].
 * @property {Array<number>} lim Number of columns in the grid [longitude columns, latitude columns].
 * @property {number} [count] Total number of grid nodes.
 * @property {Array} cvs Mapped node values for the grid.
 */

/** @typedef {{header: NadgridHeader, subgrids: Array<Subgrid>}} NADGrid */

/**
 * @typedef {Object} GeoTIFF
 * @property {() => Promise<number>} getImageCount - Returns the number of images in the GeoTIFF.
 * @property {(index: number) => Promise<GeoTIFFImage>} getImage - Returns a GeoTIFFImage for the given index.
 */

/**
 * @typedef {Object} GeoTIFFImage
 * @property {() => number} getWidth - Returns the width of the image.
 * @property {() => number} getHeight - Returns the height of the image.
 * @property {() => number[]} getBoundingBox - Returns the bounding box as [minX, minY, maxX, maxY] in degrees.
 * @property {() => Promise<ArrayLike<ArrayLike<number>>>} readRasters - Returns the raster data as an array of bands.
 * @property {Object} fileDirectory - The file directory object containing metadata.
 * @property {Object} fileDirectory.ModelPixelScale - The pixel scale array [scaleX, scaleY, scaleZ] in degrees.
 */

var loadedNadgrids = {};

/**
 * @overload
 * @param {string} key - The key to associate with the loaded grid.
 * @param {ArrayBuffer} data - The NTv2 grid data as an ArrayBuffer.
 * @param {NTV2GridOptions} [options] - Optional parameters for loading the grid.
 * @returns {NADGrid} - The loaded NAD grid information.
 */
/**
 * @overload
 * @param {string} key - The key to associate with the loaded grid.
 * @param {GeoTIFF} data - The GeoTIFF instance to read the grid from.
 * @returns {{ready: Promise<NADGrid>}} - A promise that resolves to the loaded grid information.
 */
/**
 * Load either a NTv2 file (.gsb) or a Geotiff (.tif) to a key that can be used in a proj string like +nadgrids=<key>. Pass the NTv2 file
 * as an ArrayBuffer. Pass Geotiff as a GeoTIFF instance from the geotiff.js library.
 * @param {string} key - The key to associate with the loaded grid.
 * @param {ArrayBuffer|GeoTIFF} data The data to load, either an ArrayBuffer for NTv2 or a GeoTIFF instance.
 * @param {NTV2GridOptions} [options] Optional parameters.
 * @returns {{ready: Promise<NADGrid>}|NADGrid} - A promise that resolves to the loaded grid information.
 */
function nadgrid(key, data, options) {
  if (data instanceof ArrayBuffer) {
    return readNTV2Grid(key, data, options);
  }
  return { ready: readGeotiffGrid(key, data) };
}

/**
 * @param {string} key The key to associate with the loaded grid.
 * @param {ArrayBuffer} data The NTv2 grid data as an ArrayBuffer.
 * @param {NTV2GridOptions} [options] Optional parameters for loading the grid.
 * @returns {NADGrid} The loaded NAD grid information.
 */
function readNTV2Grid(key, data, options) {
  var includeErrorFields = true;
  if (options !== undefined && options.includeErrorFields === false) {
    includeErrorFields = false;
  }
  var view = new DataView(data);
  var isLittleEndian = detectLittleEndian(view);
  var header = readHeader(view, isLittleEndian);
  var subgrids = readSubgrids(view, header, isLittleEndian, includeErrorFields);
  var nadgrid = { header: header, subgrids: subgrids };
  loadedNadgrids[key] = nadgrid;
  return nadgrid;
}

/**
 * @param {string} key The key to associate with the loaded grid.
 * @param {GeoTIFF} tiff The GeoTIFF instance to read the grid from.
 * @returns {Promise<NADGrid>} A promise that resolves to the loaded NAD grid information.
 */
async function readGeotiffGrid(key, tiff) {
  var subgrids = [];
  var subGridCount = await tiff.getImageCount();
  // proj produced tiff grid shift files appear to organize lower res subgrids first, higher res/ child subgrids last.
  for (var subgridIndex = subGridCount - 1; subgridIndex >= 0; subgridIndex--) {
    var image = await tiff.getImage(subgridIndex);

    var rasters = await image.readRasters();
    var data = rasters;
    var lim = [image.getWidth(), image.getHeight()];
    var imageBBoxRadians = image.getBoundingBox().map(degreesToRadians);
    var del = [image.fileDirectory.ModelPixelScale[0], image.fileDirectory.ModelPixelScale[1]].map(degreesToRadians);

    var maxX = imageBBoxRadians[0] + (lim[0] - 1) * del[0];
    var minY = imageBBoxRadians[3] - (lim[1] - 1) * del[1];

    var latitudeOffsetBand = data[0];
    var longitudeOffsetBand = data[1];
    var nodes = [];

    for (let i = lim[1] - 1; i >= 0; i--) {
      for (let j = lim[0] - 1; j >= 0; j--) {
        var index = i * lim[0] + j;
        nodes.push([-secondsToRadians(longitudeOffsetBand[index]), secondsToRadians(latitudeOffsetBand[index])]);
      }
    }

    subgrids.push({
      del: del,
      lim: lim,
      ll: [-maxX, minY],
      cvs: nodes
    });
  }

  var tifGrid = {
    header: {
      nSubgrids: subGridCount
    },
    subgrids: subgrids
  };
  loadedNadgrids[key] = tifGrid;
  return tifGrid;
};

/**
 * Given a proj4 value for nadgrids, return an array of loaded grids
 * @param {string} nadgrids A comma-separated list of grid names, optionally prefixed with '@' to indicate optional grids.
 * @returns
 */
function getNadgrids(nadgrids) {
  // Format details: http://proj.maptools.org/gen_parms.html
  if (nadgrids === undefined) {
    return null;
  }
  var grids = nadgrids.split(',');
  return grids.map(parseNadgridString);
}

/**
 * @param {string} value The nadgrid string to get information for.
 * @returns {NadgridInfo|null} An object with grid information, or null if the input is empty.
 */
function parseNadgridString(value) {
  if (value.length === 0) {
    return null;
  }
  var optional = value[0] === '@';
  if (optional) {
    value = value.slice(1);
  }
  if (value === 'null') {
    return { name: 'null', mandatory: !optional, grid: null, isNull: true };
  }
  return {
    name: value,
    mandatory: !optional,
    grid: loadedNadgrids[value] || null,
    isNull: false
  };
}

function degreesToRadians(degrees) {
  return (degrees) * Math.PI / 180;
}

function secondsToRadians(seconds) {
  return (seconds / 3600) * Math.PI / 180;
}

function detectLittleEndian(view) {
  var nFields = view.getInt32(8, false);
  if (nFields === 11) {
    return false;
  }
  nFields = view.getInt32(8, true);
  if (nFields !== 11) {
    console.warn('Failed to detect nadgrid endian-ness, defaulting to little-endian');
  }
  return true;
}

function readHeader(view, isLittleEndian) {
  return {
    nFields: view.getInt32(8, isLittleEndian),
    nSubgridFields: view.getInt32(24, isLittleEndian),
    nSubgrids: view.getInt32(40, isLittleEndian),
    shiftType: decodeString(view, 56, 56 + 8).trim(),
    fromSemiMajorAxis: view.getFloat64(120, isLittleEndian),
    fromSemiMinorAxis: view.getFloat64(136, isLittleEndian),
    toSemiMajorAxis: view.getFloat64(152, isLittleEndian),
    toSemiMinorAxis: view.getFloat64(168, isLittleEndian)
  };
}

function decodeString(view, start, end) {
  return String.fromCharCode.apply(null, new Uint8Array(view.buffer.slice(start, end)));
}

function readSubgrids(view, header, isLittleEndian, includeErrorFields) {
  var gridOffset = 176;
  var grids = [];
  for (var i = 0; i < header.nSubgrids; i++) {
    var subHeader = readGridHeader(view, gridOffset, isLittleEndian);
    var nodes = readGridNodes(view, gridOffset, subHeader, isLittleEndian, includeErrorFields);
    var lngColumnCount = Math.round(
      1 + (subHeader.upperLongitude - subHeader.lowerLongitude) / subHeader.longitudeInterval);
    var latColumnCount = Math.round(
      1 + (subHeader.upperLatitude - subHeader.lowerLatitude) / subHeader.latitudeInterval);
    // Proj4 operates on radians whereas the coordinates are in seconds in the grid
    grids.push({
      ll: [secondsToRadians(subHeader.lowerLongitude), secondsToRadians(subHeader.lowerLatitude)],
      del: [secondsToRadians(subHeader.longitudeInterval), secondsToRadians(subHeader.latitudeInterval)],
      lim: [lngColumnCount, latColumnCount],
      count: subHeader.gridNodeCount,
      cvs: mapNodes(nodes)
    });
    var rowSize = 16;
    if (includeErrorFields === false) {
      rowSize = 8;
    }
    gridOffset += 176 + subHeader.gridNodeCount * rowSize;
  }
  return grids;
}

/**
 * @param {*} nodes
 * @returns Array<Array<number>>
 */
function mapNodes(nodes) {
  return nodes.map(function (r) {
    return [secondsToRadians(r.longitudeShift), secondsToRadians(r.latitudeShift)];
  });
}

function readGridHeader(view, offset, isLittleEndian) {
  return {
    name: decodeString(view, offset + 8, offset + 16).trim(),
    parent: decodeString(view, offset + 24, offset + 24 + 8).trim(),
    lowerLatitude: view.getFloat64(offset + 72, isLittleEndian),
    upperLatitude: view.getFloat64(offset + 88, isLittleEndian),
    lowerLongitude: view.getFloat64(offset + 104, isLittleEndian),
    upperLongitude: view.getFloat64(offset + 120, isLittleEndian),
    latitudeInterval: view.getFloat64(offset + 136, isLittleEndian),
    longitudeInterval: view.getFloat64(offset + 152, isLittleEndian),
    gridNodeCount: view.getInt32(offset + 168, isLittleEndian)
  };
}

function readGridNodes(view, offset, gridHeader, isLittleEndian, includeErrorFields) {
  var nodesOffset = offset + 176;
  var gridRecordLength = 16;

  if (includeErrorFields === false) {
    gridRecordLength = 8;
  }

  var gridShiftRecords = [];
  for (var i = 0; i < gridHeader.gridNodeCount; i++) {
    var record = {
      latitudeShift: view.getFloat32(nodesOffset + i * gridRecordLength, isLittleEndian),
      longitudeShift: view.getFloat32(nodesOffset + i * gridRecordLength + 4, isLittleEndian)

    };

    if (includeErrorFields !== false) {
      record.latitudeAccuracy = view.getFloat32(nodesOffset + i * gridRecordLength + 8, isLittleEndian);
      record.longitudeAccuracy = view.getFloat32(nodesOffset + i * gridRecordLength + 12, isLittleEndian);
    }

    gridShiftRecords.push(record);
  }
  return gridShiftRecords;
}

;// ./node_modules/proj4/lib/Proj.js









/**
 * @typedef {Object} DatumDefinition
 * @property {number} datum_type - The type of datum.
 * @property {number} a - Semi-major axis of the ellipsoid.
 * @property {number} b - Semi-minor axis of the ellipsoid.
 * @property {number} es - Eccentricity squared of the ellipsoid.
 * @property {number} ep2 - Second eccentricity squared of the ellipsoid.
 */

/**
 * @param {string | import('./core').PROJJSONDefinition | import('./defs').ProjectionDefinition} srsCode
 * @param {(errorMessage?: string, instance?: Projection) => void} [callback]
 */
function Projection(srsCode, callback) {
  if (!(this instanceof Projection)) {
    return new Projection(srsCode);
  }
  /** @type {<T extends import('./core').TemplateCoordinates>(coordinates: T, enforceAxis?: boolean) => T} */
  this.forward = null;
  /** @type {<T extends import('./core').TemplateCoordinates>(coordinates: T, enforceAxis?: boolean) => T} */
  this.inverse = null;
  /** @type {function(): void} */
  this.init = null;
  /** @type {string} */
  this.name;
  /** @type {Array<string>} */
  this.names = null;
  /** @type {string} */
  this.title;
  callback = callback || function (error) {
    if (error) {
      throw error;
    }
  };
  var json = parseCode(srsCode);
  if (typeof json !== 'object') {
    callback('Could not parse to valid json: ' + srsCode);
    return;
  }
  var ourProj = Projection.projections.get(json.projName);
  if (!ourProj) {
    callback('Could not get projection name from: ' + srsCode);
    return;
  }
  if (json.datumCode && json.datumCode !== 'none') {
    var datumDef = match(Datum, json.datumCode);
    if (datumDef) {
      json.datum_params = json.datum_params || (datumDef.towgs84 ? datumDef.towgs84.split(',') : null);
      json.ellps = datumDef.ellipse;
      json.datumName = datumDef.datumName ? datumDef.datumName : json.datumCode;
    }
  }
  json.k0 = json.k0 || 1.0;
  json.axis = json.axis || 'enu';
  json.ellps = json.ellps || 'wgs84';
  json.lat1 = json.lat1 || json.lat0; // Lambert_Conformal_Conic_1SP, for example, needs this

  var sphere_ = sphere(json.a, json.b, json.rf, json.ellps, json.sphere);
  var ecc = eccentricity(sphere_.a, sphere_.b, sphere_.rf, json.R_A);
  var nadgrids = getNadgrids(json.nadgrids);
  /** @type {DatumDefinition} */
  var datumObj = json.datum || lib_datum(json.datumCode, json.datum_params, sphere_.a, sphere_.b, ecc.es, ecc.ep2,
    nadgrids);

  extend(this, json); // transfer everything over from the projection because we don't know what we'll need
  extend(this, ourProj); // transfer all the methods from the projection

  // copy the 4 things over we calculated in deriveConstants.sphere
  this.a = sphere_.a;
  this.b = sphere_.b;
  this.rf = sphere_.rf;
  this.sphere = sphere_.sphere;

  // copy the 3 things we calculated in deriveConstants.eccentricity
  this.es = ecc.es;
  this.e = ecc.e;
  this.ep2 = ecc.ep2;

  // add in the datum object
  this.datum = datumObj;

  // init the projection
  if ('init' in this && typeof this.init === 'function') {
    this.init();
  }

  // legecy callback from back in the day when it went to spatialreference.org
  callback(null, this);
}
Projection.projections = projections;
Projection.projections.start();
/* harmony default export */ const Proj = (Projection);

;// ./node_modules/proj4/lib/datumUtils.js


function compareDatums(source, dest) {
  if (source.datum_type !== dest.datum_type) {
    return false; // false, datums are not equal
  } else if (source.a !== dest.a || Math.abs(source.es - dest.es) > 0.000000000050) {
    // the tolerance for es is to ensure that GRS80 and WGS84
    // are considered identical
    return false;
  } else if (source.datum_type === PJD_3PARAM) {
    return (source.datum_params[0] === dest.datum_params[0] && source.datum_params[1] === dest.datum_params[1] && source.datum_params[2] === dest.datum_params[2]);
  } else if (source.datum_type === PJD_7PARAM) {
    return (source.datum_params[0] === dest.datum_params[0] && source.datum_params[1] === dest.datum_params[1] && source.datum_params[2] === dest.datum_params[2] && source.datum_params[3] === dest.datum_params[3] && source.datum_params[4] === dest.datum_params[4] && source.datum_params[5] === dest.datum_params[5] && source.datum_params[6] === dest.datum_params[6]);
  } else {
    return true; // datums are equal
  }
} // cs_compare_datums()

/*
 * The function Convert_Geodetic_To_Geocentric converts geodetic coordinates
 * (latitude, longitude, and height) to geocentric coordinates (X, Y, Z),
 * according to the current ellipsoid parameters.
 *
 *    Latitude  : Geodetic latitude in radians                     (input)
 *    Longitude : Geodetic longitude in radians                    (input)
 *    Height    : Geodetic height, in meters                       (input)
 *    X         : Calculated Geocentric X coordinate, in meters    (output)
 *    Y         : Calculated Geocentric Y coordinate, in meters    (output)
 *    Z         : Calculated Geocentric Z coordinate, in meters    (output)
 *
 */
function geodeticToGeocentric(p, es, a) {
  var Longitude = p.x;
  var Latitude = p.y;
  var Height = p.z ? p.z : 0; // Z value not always supplied

  var Rn; /*  Earth radius at location  */
  var Sin_Lat; /*  Math.sin(Latitude)  */
  var Sin2_Lat; /*  Square of Math.sin(Latitude)  */
  var Cos_Lat; /*  Math.cos(Latitude)  */

  /*
   ** Don't blow up if Latitude is just a little out of the value
   ** range as it may just be a rounding issue.  Also removed longitude
   ** test, it should be wrapped by Math.cos() and Math.sin().  NFW for PROJ.4, Sep/2001.
   */
  if (Latitude < -HALF_PI && Latitude > -1.001 * HALF_PI) {
    Latitude = -HALF_PI;
  } else if (Latitude > HALF_PI && Latitude < 1.001 * HALF_PI) {
    Latitude = HALF_PI;
  } else if (Latitude < -HALF_PI) {
    /* Latitude out of range */
    // ..reportError('geocent:lat out of range:' + Latitude);
    return { x: -Infinity, y: -Infinity, z: p.z };
  } else if (Latitude > HALF_PI) {
    /* Latitude out of range */
    return { x: Infinity, y: Infinity, z: p.z };
  }

  if (Longitude > Math.PI) {
    Longitude -= (2 * Math.PI);
  }
  Sin_Lat = Math.sin(Latitude);
  Cos_Lat = Math.cos(Latitude);
  Sin2_Lat = Sin_Lat * Sin_Lat;
  Rn = a / (Math.sqrt(1.0e0 - es * Sin2_Lat));
  return {
    x: (Rn + Height) * Cos_Lat * Math.cos(Longitude),
    y: (Rn + Height) * Cos_Lat * Math.sin(Longitude),
    z: ((Rn * (1 - es)) + Height) * Sin_Lat
  };
} // cs_geodetic_to_geocentric()

function geocentricToGeodetic(p, es, a, b) {
  /* local defintions and variables */
  /* end-criterium of loop, accuracy of sin(Latitude) */
  var genau = 1e-12;
  var genau2 = (genau * genau);
  var maxiter = 30;

  var P; /* distance between semi-minor axis and location */
  var RR; /* distance between center and location */
  var CT; /* sin of geocentric latitude */
  var ST; /* cos of geocentric latitude */
  var RX;
  var RK;
  var RN; /* Earth radius at location */
  var CPHI0; /* cos of start or old geodetic latitude in iterations */
  var SPHI0; /* sin of start or old geodetic latitude in iterations */
  var CPHI; /* cos of searched geodetic latitude */
  var SPHI; /* sin of searched geodetic latitude */
  var SDPHI; /* end-criterium: addition-theorem of sin(Latitude(iter)-Latitude(iter-1)) */
  var iter; /* # of continous iteration, max. 30 is always enough (s.a.) */

  var X = p.x;
  var Y = p.y;
  var Z = p.z ? p.z : 0.0; // Z value not always supplied
  var Longitude;
  var Latitude;
  var Height;

  P = Math.sqrt(X * X + Y * Y);
  RR = Math.sqrt(X * X + Y * Y + Z * Z);

  /*      special cases for latitude and longitude */
  if (P / a < genau) {
    /*  special case, if P=0. (X=0., Y=0.) */
    Longitude = 0.0;

    /*  if (X,Y,Z)=(0.,0.,0.) then Height becomes semi-minor axis
     *  of ellipsoid (=center of mass), Latitude becomes PI/2 */
    if (RR / a < genau) {
      Latitude = HALF_PI;
      Height = -b;
      return {
        x: p.x,
        y: p.y,
        z: p.z
      };
    }
  } else {
    /*  ellipsoidal (geodetic) longitude
     *  interval: -PI < Longitude <= +PI */
    Longitude = Math.atan2(Y, X);
  }

  /* --------------------------------------------------------------
   * Following iterative algorithm was developped by
   * "Institut for Erdmessung", University of Hannover, July 1988.
   * Internet: www.ife.uni-hannover.de
   * Iterative computation of CPHI,SPHI and Height.
   * Iteration of CPHI and SPHI to 10**-12 radian resp.
   * 2*10**-7 arcsec.
   * --------------------------------------------------------------
   */
  CT = Z / RR;
  ST = P / RR;
  RX = 1.0 / Math.sqrt(1.0 - es * (2.0 - es) * ST * ST);
  CPHI0 = ST * (1.0 - es) * RX;
  SPHI0 = CT * RX;
  iter = 0;

  /* loop to find sin(Latitude) resp. Latitude
   * until |sin(Latitude(iter)-Latitude(iter-1))| < genau */
  do {
    iter++;
    RN = a / Math.sqrt(1.0 - es * SPHI0 * SPHI0);

    /*  ellipsoidal (geodetic) height */
    Height = P * CPHI0 + Z * SPHI0 - RN * (1.0 - es * SPHI0 * SPHI0);

    RK = es * RN / (RN + Height);
    RX = 1.0 / Math.sqrt(1.0 - RK * (2.0 - RK) * ST * ST);
    CPHI = ST * (1.0 - RK) * RX;
    SPHI = CT * RX;
    SDPHI = SPHI * CPHI0 - CPHI * SPHI0;
    CPHI0 = CPHI;
    SPHI0 = SPHI;
  }
  while (SDPHI * SDPHI > genau2 && iter < maxiter);

  /*      ellipsoidal (geodetic) latitude */
  Latitude = Math.atan(SPHI / Math.abs(CPHI));
  return {
    x: Longitude,
    y: Latitude,
    z: Height
  };
} // cs_geocentric_to_geodetic()

/****************************************************************/
// pj_geocentic_to_wgs84( p )
//  p = point to transform in geocentric coordinates (x,y,z)

/** point object, nothing fancy, just allows values to be
    passed back and forth by reference rather than by value.
    Other point classes may be used as long as they have
    x and y properties, which will get modified in the transform method.
*/
function geocentricToWgs84(p, datum_type, datum_params) {
  if (datum_type === PJD_3PARAM) {
    // if( x[io] === HUGE_VAL )
    //    continue;
    return {
      x: p.x + datum_params[0],
      y: p.y + datum_params[1],
      z: p.z + datum_params[2]
    };
  } else if (datum_type === PJD_7PARAM) {
    var Dx_BF = datum_params[0];
    var Dy_BF = datum_params[1];
    var Dz_BF = datum_params[2];
    var Rx_BF = datum_params[3];
    var Ry_BF = datum_params[4];
    var Rz_BF = datum_params[5];
    var M_BF = datum_params[6];
    // if( x[io] === HUGE_VAL )
    //    continue;
    return {
      x: M_BF * (p.x - Rz_BF * p.y + Ry_BF * p.z) + Dx_BF,
      y: M_BF * (Rz_BF * p.x + p.y - Rx_BF * p.z) + Dy_BF,
      z: M_BF * (-Ry_BF * p.x + Rx_BF * p.y + p.z) + Dz_BF
    };
  }
} // cs_geocentric_to_wgs84

/****************************************************************/
// pj_geocentic_from_wgs84()
//  coordinate system definition,
//  point to transform in geocentric coordinates (x,y,z)
function geocentricFromWgs84(p, datum_type, datum_params) {
  if (datum_type === PJD_3PARAM) {
    // if( x[io] === HUGE_VAL )
    //    continue;
    return {
      x: p.x - datum_params[0],
      y: p.y - datum_params[1],
      z: p.z - datum_params[2]
    };
  } else if (datum_type === PJD_7PARAM) {
    var Dx_BF = datum_params[0];
    var Dy_BF = datum_params[1];
    var Dz_BF = datum_params[2];
    var Rx_BF = datum_params[3];
    var Ry_BF = datum_params[4];
    var Rz_BF = datum_params[5];
    var M_BF = datum_params[6];
    var x_tmp = (p.x - Dx_BF) / M_BF;
    var y_tmp = (p.y - Dy_BF) / M_BF;
    var z_tmp = (p.z - Dz_BF) / M_BF;
    // if( x[io] === HUGE_VAL )
    //    continue;

    return {
      x: x_tmp + Rz_BF * y_tmp - Ry_BF * z_tmp,
      y: -Rz_BF * x_tmp + y_tmp + Rx_BF * z_tmp,
      z: Ry_BF * x_tmp - Rx_BF * y_tmp + z_tmp
    };
  } // cs_geocentric_from_wgs84()
}

;// ./node_modules/proj4/lib/datum_transform.js




function checkParams(type) {
  return (type === PJD_3PARAM || type === PJD_7PARAM);
}

/* harmony default export */ function datum_transform(source, dest, point) {
  // Short cut if the datums are identical.
  if (compareDatums(source, dest)) {
    return point; // in this case, zero is sucess,
    // whereas cs_compare_datums returns 1 to indicate TRUE
    // confusing, should fix this
  }

  // Explicitly skip datum transform by setting 'datum=none' as parameter for either source or dest
  if (source.datum_type === PJD_NODATUM || dest.datum_type === PJD_NODATUM) {
    return point;
  }

  // If this datum requires grid shifts, then apply it to geodetic coordinates.
  var source_a = source.a;
  var source_es = source.es;
  if (source.datum_type === PJD_GRIDSHIFT) {
    var gridShiftCode = applyGridShift(source, false, point);
    if (gridShiftCode !== 0) {
      return undefined;
    }
    source_a = SRS_WGS84_SEMIMAJOR;
    source_es = SRS_WGS84_ESQUARED;
  }

  var dest_a = dest.a;
  var dest_b = dest.b;
  var dest_es = dest.es;
  if (dest.datum_type === PJD_GRIDSHIFT) {
    dest_a = SRS_WGS84_SEMIMAJOR;
    dest_b = SRS_WGS84_SEMIMINOR;
    dest_es = SRS_WGS84_ESQUARED;
  }

  // Do we need to go through geocentric coordinates?
  if (source_es === dest_es && source_a === dest_a && !checkParams(source.datum_type) && !checkParams(dest.datum_type)) {
    return point;
  }

  // Convert to geocentric coordinates.
  point = geodeticToGeocentric(point, source_es, source_a);
  // Convert between datums
  if (checkParams(source.datum_type)) {
    point = geocentricToWgs84(point, source.datum_type, source.datum_params);
  }
  if (checkParams(dest.datum_type)) {
    point = geocentricFromWgs84(point, dest.datum_type, dest.datum_params);
  }
  point = geocentricToGeodetic(point, dest_es, dest_a, dest_b);

  if (dest.datum_type === PJD_GRIDSHIFT) {
    var destGridShiftResult = applyGridShift(dest, true, point);
    if (destGridShiftResult !== 0) {
      return undefined;
    }
  }

  return point;
}

function applyGridShift(source, inverse, point) {
  if (source.grids === null || source.grids.length === 0) {
    console.log('Grid shift grids not found');
    return -1;
  }
  var input = { x: -point.x, y: point.y };
  var output = { x: Number.NaN, y: Number.NaN };
  var attemptedGrids = [];
  outer:
  for (var i = 0; i < source.grids.length; i++) {
    var grid = source.grids[i];
    attemptedGrids.push(grid.name);
    if (grid.isNull) {
      output = input;
      break;
    }
    if (grid.grid === null) {
      if (grid.mandatory) {
        console.log('Unable to find mandatory grid \'' + grid.name + '\'');
        return -1;
      }
      continue;
    }
    var subgrids = grid.grid.subgrids;
    for (var j = 0, jj = subgrids.length; j < jj; j++) {
      var subgrid = subgrids[j];
      // skip tables that don't match our point at all
      var epsilon = (Math.abs(subgrid.del[1]) + Math.abs(subgrid.del[0])) / 10000.0;
      var minX = subgrid.ll[0] - epsilon;
      var minY = subgrid.ll[1] - epsilon;
      var maxX = subgrid.ll[0] + (subgrid.lim[0] - 1) * subgrid.del[0] + epsilon;
      var maxY = subgrid.ll[1] + (subgrid.lim[1] - 1) * subgrid.del[1] + epsilon;
      if (minY > input.y || minX > input.x || maxY < input.y || maxX < input.x) {
        continue;
      }
      output = applySubgridShift(input, inverse, subgrid);
      if (!isNaN(output.x)) {
        break outer;
      }
    }
  }
  if (isNaN(output.x)) {
    console.log('Failed to find a grid shift table for location \''
      + -input.x * R2D + ' ' + input.y * R2D + ' tried: \'' + attemptedGrids + '\'');
    return -1;
  }
  point.x = -output.x;
  point.y = output.y;
  return 0;
}

function applySubgridShift(pin, inverse, ct) {
  var val = { x: Number.NaN, y: Number.NaN };
  if (isNaN(pin.x)) {
    return val;
  }
  var tb = { x: pin.x, y: pin.y };
  tb.x -= ct.ll[0];
  tb.y -= ct.ll[1];
  tb.x = adjust_lon(tb.x - Math.PI) + Math.PI;
  var t = nadInterpolate(tb, ct);
  if (inverse) {
    if (isNaN(t.x)) {
      return val;
    }
    t.x = tb.x - t.x;
    t.y = tb.y - t.y;
    var i = 9, tol = 1e-12;
    var dif, del;
    do {
      del = nadInterpolate(t, ct);
      if (isNaN(del.x)) {
        console.log('Inverse grid shift iteration failed, presumably at grid edge.  Using first approximation.');
        break;
      }
      dif = { x: tb.x - (del.x + t.x), y: tb.y - (del.y + t.y) };
      t.x += dif.x;
      t.y += dif.y;
    } while (i-- && Math.abs(dif.x) > tol && Math.abs(dif.y) > tol);
    if (i < 0) {
      console.log('Inverse grid shift iterator failed to converge.');
      return val;
    }
    val.x = adjust_lon(t.x + ct.ll[0]);
    val.y = t.y + ct.ll[1];
  } else {
    if (!isNaN(t.x)) {
      val.x = pin.x + t.x;
      val.y = pin.y + t.y;
    }
  }
  return val;
}

function nadInterpolate(pin, ct) {
  var t = { x: pin.x / ct.del[0], y: pin.y / ct.del[1] };
  var indx = { x: Math.floor(t.x), y: Math.floor(t.y) };
  var frct = { x: t.x - 1.0 * indx.x, y: t.y - 1.0 * indx.y };
  var val = { x: Number.NaN, y: Number.NaN };
  var inx;
  if (indx.x < 0 || indx.x >= ct.lim[0]) {
    return val;
  }
  if (indx.y < 0 || indx.y >= ct.lim[1]) {
    return val;
  }
  inx = (indx.y * ct.lim[0]) + indx.x;
  var f00 = { x: ct.cvs[inx][0], y: ct.cvs[inx][1] };
  inx++;
  var f10 = { x: ct.cvs[inx][0], y: ct.cvs[inx][1] };
  inx += ct.lim[0];
  var f11 = { x: ct.cvs[inx][0], y: ct.cvs[inx][1] };
  inx--;
  var f01 = { x: ct.cvs[inx][0], y: ct.cvs[inx][1] };
  var m11 = frct.x * frct.y, m10 = frct.x * (1.0 - frct.y),
    m00 = (1.0 - frct.x) * (1.0 - frct.y), m01 = (1.0 - frct.x) * frct.y;
  val.x = (m00 * f00.x + m10 * f10.x + m01 * f01.x + m11 * f11.x);
  val.y = (m00 * f00.y + m10 * f10.y + m01 * f01.y + m11 * f11.y);
  return val;
}

;// ./node_modules/proj4/lib/adjust_axis.js
/* harmony default export */ function adjust_axis(crs, denorm, point) {
  var xin = point.x,
    yin = point.y,
    zin = point.z || 0.0;
  var v, t, i;
  /** @type {import("./core").InterfaceCoordinates} */
  var out = {};
  for (i = 0; i < 3; i++) {
    if (denorm && i === 2 && point.z === undefined) {
      continue;
    }
    if (i === 0) {
      v = xin;
      if ('ew'.indexOf(crs.axis[i]) !== -1) {
        t = 'x';
      } else {
        t = 'y';
      }
    } else if (i === 1) {
      v = yin;
      if ('ns'.indexOf(crs.axis[i]) !== -1) {
        t = 'y';
      } else {
        t = 'x';
      }
    } else {
      v = zin;
      t = 'z';
    }
    switch (crs.axis[i]) {
      case 'e':
        out[t] = v;
        break;
      case 'w':
        out[t] = -v;
        break;
      case 'n':
        out[t] = v;
        break;
      case 's':
        out[t] = -v;
        break;
      case 'u':
        if (point[t] !== undefined) {
          out.z = v;
        }
        break;
      case 'd':
        if (point[t] !== undefined) {
          out.z = -v;
        }
        break;
      default:
      // console.log("ERROR: unknow axis ("+crs.axis[i]+") - check definition of "+crs.projName);
        return null;
    }
  }
  return out;
}

;// ./node_modules/proj4/lib/common/toPoint.js
/**
 * @param {Array<number>} array
 * @returns {import("../core").InterfaceCoordinates}
 */
/* harmony default export */ function toPoint(array) {
  var out = {
    x: array[0],
    y: array[1]
  };
  if (array.length > 2) {
    out.z = array[2];
  }
  if (array.length > 3) {
    out.m = array[3];
  }
  return out;
}

;// ./node_modules/proj4/lib/checkSanity.js
/* harmony default export */ function checkSanity(point) {
  checkCoord(point.x);
  checkCoord(point.y);
}
function checkCoord(num) {
  if (typeof Number.isFinite === 'function') {
    if (Number.isFinite(num)) {
      return;
    }
    throw new TypeError('coordinates must be finite numbers');
  }
  if (typeof num !== 'number' || num !== num || !isFinite(num)) {
    throw new TypeError('coordinates must be finite numbers');
  }
}

;// ./node_modules/proj4/lib/transform.js







function checkNotWGS(source, dest) {
  return (
    (source.datum.datum_type === PJD_3PARAM || source.datum.datum_type === PJD_7PARAM || source.datum.datum_type === PJD_GRIDSHIFT) && dest.datumCode !== 'WGS84')
  || ((dest.datum.datum_type === PJD_3PARAM || dest.datum.datum_type === PJD_7PARAM || dest.datum.datum_type === PJD_GRIDSHIFT) && source.datumCode !== 'WGS84');
}

/**
 * @param {import('./defs').ProjectionDefinition} source
 * @param {import('./defs').ProjectionDefinition} dest
 * @param {import('./core').TemplateCoordinates} point
 * @param {boolean} enforceAxis
 * @returns {import('./core').InterfaceCoordinates | undefined}
 */
function transform(source, dest, point, enforceAxis) {
  var wgs84;
  if (Array.isArray(point)) {
    point = toPoint(point);
  } else {
    // Clone the point object so inputs don't get modified
    point = {
      x: point.x,
      y: point.y,
      z: point.z,
      m: point.m
    };
  }
  var hasZ = point.z !== undefined;
  checkSanity(point);
  // Workaround for datum shifts towgs84, if either source or destination projection is not wgs84
  if (source.datum && dest.datum && checkNotWGS(source, dest)) {
    wgs84 = new Proj('WGS84');
    point = transform(source, wgs84, point, enforceAxis);
    source = wgs84;
  }
  // DGR, 2010/11/12
  if (enforceAxis && source.axis !== 'enu') {
    point = adjust_axis(source, false, point);
  }
  // Transform source points to long/lat, if they aren't already.
  if (source.projName === 'longlat') {
    point = {
      x: point.x * D2R,
      y: point.y * D2R,
      z: point.z || 0
    };
  } else {
    if (source.to_meter) {
      point = {
        x: point.x * source.to_meter,
        y: point.y * source.to_meter,
        z: point.z || 0
      };
    }
    point = source.inverse(point); // Convert Cartesian to longlat
    if (!point) {
      return;
    }
  }
  // Adjust for the prime meridian if necessary
  if (source.from_greenwich) {
    point.x += source.from_greenwich;
  }

  // Convert datums if needed, and if possible.
  point = datum_transform(source.datum, dest.datum, point);
  if (!point) {
    return;
  }

  point = /** @type {import('./core').InterfaceCoordinates} */ (point);

  // Adjust for the prime meridian if necessary
  if (dest.from_greenwich) {
    point = {
      x: point.x - dest.from_greenwich,
      y: point.y,
      z: point.z || 0
    };
  }

  if (dest.projName === 'longlat') {
    // convert radians to decimal degrees
    point = {
      x: point.x * R2D,
      y: point.y * R2D,
      z: point.z || 0
    };
  } else { // else project
    point = dest.forward(point);
    if (dest.to_meter) {
      point = {
        x: point.x / dest.to_meter,
        y: point.y / dest.to_meter,
        z: point.z || 0
      };
    }
  }

  // DGR, 2010/11/12
  if (enforceAxis && dest.axis !== 'enu') {
    return adjust_axis(dest, true, point);
  }

  if (point && !hasZ) {
    delete point.z;
  }
  return point;
}

;// ./node_modules/proj4/lib/core.js


var wgs84 = Proj('WGS84');

/**
 * @typedef {{x: number, y: number, z?: number, m?: number}} InterfaceCoordinates
 */

/**
 * @typedef {Array<number> | InterfaceCoordinates} TemplateCoordinates
 */

/**
 * @typedef {Object} Converter
 * @property {<T extends TemplateCoordinates>(coordinates: T, enforceAxis?: boolean) => T} forward
 * @property {<T extends TemplateCoordinates>(coordinates: T, enforceAxis?: boolean) => T} inverse
 * @property {proj} [oProj]
 */

/**
 * @typedef {Object} PROJJSONDefinition
 * @property {string} [$schema]
 * @property {string} type
 * @property {string} [name]
 * @property {{authority: string, code: number}} [id]
 * @property {string} [scope]
 * @property {string} [area]
 * @property {{south_latitude: number, west_longitude: number, north_latitude: number, east_longitude: number}} [bbox]
 * @property {PROJJSONDefinition[]} [components]
 * @property {{type: string, name: string}} [datum]
 * @property {{
 *   name: string,
 *   members: Array<{
 *     name: string,
 *     id?: {authority: string, code: number}
 *   }>,
 *   ellipsoid?: {
 *     name: string,
 *     semi_major_axis: number,
 *     inverse_flattening?: number
 *   },
 *   accuracy?: string,
 *   id?: {authority: string, code: number}
 * }} [datum_ensemble]
 * @property {{
 *   subtype: string,
 *   axis: Array<{
 *     name: string,
 *     abbreviation?: string,
 *     direction: string,
 *     unit: string
 *   }>
 * }} [coordinate_system]
 * @property {{
 *   name: string,
 *   method: {name: string},
 *   parameters: Array<{
 *     name: string,
 *     value: number,
 *     unit?: string
 *   }>
 * }} [conversion]
 * @property {{
 *   name: string,
 *   method: {name: string},
 *   parameters: Array<{
 *     name: string,
 *     value: number,
 *     unit?: string,
 *     type?: string,
 *     file_name?: string
 *   }>
 * }} [transformation]
 */

/**
 * @template {TemplateCoordinates} T
 * @param {proj} from
 * @param {proj} to
 * @param {T} coords
 * @param {boolean} [enforceAxis]
 * @returns {T}
 */
function transformer(from, to, coords, enforceAxis) {
  var transformedArray, out, keys;
  if (Array.isArray(coords)) {
    transformedArray = transform(from, to, coords, enforceAxis) || { x: NaN, y: NaN };
    if (coords.length > 2) {
      if ((typeof from.name !== 'undefined' && from.name === 'geocent') || (typeof to.name !== 'undefined' && to.name === 'geocent')) {
        if (typeof transformedArray.z === 'number') {
          return /** @type {T} */ ([transformedArray.x, transformedArray.y, transformedArray.z].concat(coords.slice(3)));
        } else {
          return /** @type {T} */ ([transformedArray.x, transformedArray.y, coords[2]].concat(coords.slice(3)));
        }
      } else {
        return /** @type {T} */ ([transformedArray.x, transformedArray.y].concat(coords.slice(2)));
      }
    } else {
      return /** @type {T} */ ([transformedArray.x, transformedArray.y]);
    }
  } else {
    out = transform(from, to, coords, enforceAxis);
    keys = Object.keys(coords);
    if (keys.length === 2) {
      return /** @type {T} */ (out);
    }
    keys.forEach(function (key) {
      if ((typeof from.name !== 'undefined' && from.name === 'geocent') || (typeof to.name !== 'undefined' && to.name === 'geocent')) {
        if (key === 'x' || key === 'y' || key === 'z') {
          return;
        }
      } else {
        if (key === 'x' || key === 'y') {
          return;
        }
      }
      out[key] = coords[key];
    });
    return /** @type {T} */ (out);
  }
}

/**
 * @param {proj | string | PROJJSONDefinition | Converter} item
 * @returns {import('./Proj').default}
 */
function checkProj(item) {
  if (item instanceof Proj) {
    return item;
  }
  if (typeof item === 'object' && 'oProj' in item) {
    return item.oProj;
  }
  return Proj(/** @type {string | PROJJSONDefinition} */ (item));
}

/**
 * @overload
 * @param {string | PROJJSONDefinition | proj} toProj
 * @returns {Converter}
 */
/**
 * @overload
 * @param {string | PROJJSONDefinition | proj} fromProj
 * @param {string | PROJJSONDefinition | proj} toProj
 * @returns {Converter}
 */
/**
 * @template {TemplateCoordinates} T
 * @overload
 * @param {string | PROJJSONDefinition | proj} toProj
 * @param {T} coord
 * @returns {T}
 */
/**
 * @template {TemplateCoordinates} T
 * @overload
 * @param {string | PROJJSONDefinition | proj} fromProj
 * @param {string | PROJJSONDefinition | proj} toProj
 * @param {T} coord
 * @returns {T}
 */
/**
 * @template {TemplateCoordinates} T
 * @param {string | PROJJSONDefinition | proj} fromProjOrToProj
 * @param {string | PROJJSONDefinition | proj | TemplateCoordinates} [toProjOrCoord]
 * @param {T} [coord]
 * @returns {T|Converter}
 */
function proj4(fromProjOrToProj, toProjOrCoord, coord) {
  /** @type {proj} */
  var fromProj;
  /** @type {proj} */
  var toProj;
  var single = false;
  /** @type {Converter} */
  var obj;
  if (typeof toProjOrCoord === 'undefined') {
    toProj = checkProj(fromProjOrToProj);
    fromProj = wgs84;
    single = true;
  } else if (typeof /** @type {?} */ (toProjOrCoord).x !== 'undefined' || Array.isArray(toProjOrCoord)) {
    coord = /** @type {T} */ (/** @type {?} */ (toProjOrCoord));
    toProj = checkProj(fromProjOrToProj);
    fromProj = wgs84;
    single = true;
  }
  if (!fromProj) {
    fromProj = checkProj(fromProjOrToProj);
  }
  if (!toProj) {
    toProj = checkProj(/** @type {string | PROJJSONDefinition | proj } */ (toProjOrCoord));
  }
  if (coord) {
    return transformer(fromProj, toProj, coord);
  } else {
    obj = {
      /**
       * @template {TemplateCoordinates} T
       * @param {T} coords
       * @param {boolean=} enforceAxis
       * @returns {T}
       */
      forward: function (coords, enforceAxis) {
        return transformer(fromProj, toProj, coords, enforceAxis);
      },
      /**
       * @template {TemplateCoordinates} T
       * @param {T} coords
       * @param {boolean=} enforceAxis
       * @returns {T}
       */
      inverse: function (coords, enforceAxis) {
        return transformer(toProj, fromProj, coords, enforceAxis);
      }
    };
    if (single) {
      obj.oProj = toProj;
    }
    return obj;
  }
}

/* harmony default export */ const core = (proj4);

;// ./node_modules/mgrs/mgrs.js



/**
 * UTM zones are grouped, and assigned to one of a group of 6
 * sets.
 *
 * {int} @private
 */
var NUM_100K_SETS = 6;

/**
 * The column letters (for easting) of the lower left value, per
 * set.
 *
 * {string} @private
 */
var SET_ORIGIN_COLUMN_LETTERS = 'AJSAJS';

/**
 * The row letters (for northing) of the lower left value, per
 * set.
 *
 * {string} @private
 */
var SET_ORIGIN_ROW_LETTERS = 'AFAFAF';

var A = 65; // A
var I = 73; // I
var O = 79; // O
var V = 86; // V
var Z = 90; // Z
/* harmony default export */ const mgrs = ({
  forward: mgrs_forward,
  inverse: mgrs_inverse,
  toPoint: mgrs_toPoint
});
/**
 * Conversion of lat/lon to MGRS.
 *
 * @param {object} ll Object literal with lat and lon properties on a
 *     WGS84 ellipsoid.
 * @param {int} accuracy Accuracy in digits (5 for 1 m, 4 for 10 m, 3 for
 *      100 m, 2 for 1000 m or 1 for 10000 m). Optional, default is 5.
 * @return {string} the MGRS string for the given location and accuracy.
 */
function mgrs_forward(ll, accuracy) {
  accuracy = accuracy || 5; // default accuracy 1m
  return encode(LLtoUTM({
    lat: ll[1],
    lon: ll[0]
  }), accuracy);
};

/**
 * Conversion of MGRS to lat/lon.
 *
 * @param {string} mgrs MGRS string.
 * @return {array} An array with left (longitude), bottom (latitude), right
 *     (longitude) and top (latitude) values in WGS84, representing the
 *     bounding box for the provided MGRS reference.
 */
function mgrs_inverse(mgrs) {
  var bbox = UTMtoLL(decode(mgrs.toUpperCase()));
  if (bbox.lat && bbox.lon) {
    return [bbox.lon, bbox.lat, bbox.lon, bbox.lat];
  }
  return [bbox.left, bbox.bottom, bbox.right, bbox.top];
};

function mgrs_toPoint(mgrs) {
  var bbox = UTMtoLL(decode(mgrs.toUpperCase()));
  if (bbox.lat && bbox.lon) {
    return [bbox.lon, bbox.lat];
  }
  return [(bbox.left + bbox.right) / 2, (bbox.top + bbox.bottom) / 2];
};
/**
 * Conversion from degrees to radians.
 *
 * @private
 * @param {number} deg the angle in degrees.
 * @return {number} the angle in radians.
 */
function degToRad(deg) {
  return (deg * (Math.PI / 180.0));
}

/**
 * Conversion from radians to degrees.
 *
 * @private
 * @param {number} rad the angle in radians.
 * @return {number} the angle in degrees.
 */
function radToDeg(rad) {
  return (180.0 * (rad / Math.PI));
}

/**
 * Converts a set of Longitude and Latitude co-ordinates to UTM
 * using the WGS84 ellipsoid.
 *
 * @private
 * @param {object} ll Object literal with lat and lon properties
 *     representing the WGS84 coordinate to be converted.
 * @return {object} Object literal containing the UTM value with easting,
 *     northing, zoneNumber and zoneLetter properties, and an optional
 *     accuracy property in digits. Returns null if the conversion failed.
 */
function LLtoUTM(ll) {
  var Lat = ll.lat;
  var Long = ll.lon;
  var a = 6378137.0; //ellip.radius;
  var eccSquared = 0.00669438; //ellip.eccsq;
  var k0 = 0.9996;
  var LongOrigin;
  var eccPrimeSquared;
  var N, T, C, A, M;
  var LatRad = degToRad(Lat);
  var LongRad = degToRad(Long);
  var LongOriginRad;
  var ZoneNumber;
  // (int)
  ZoneNumber = Math.floor((Long + 180) / 6) + 1;

  //Make sure the longitude 180.00 is in Zone 60
  if (Long === 180) {
    ZoneNumber = 60;
  }

  // Special zone for Norway
  if (Lat >= 56.0 && Lat < 64.0 && Long >= 3.0 && Long < 12.0) {
    ZoneNumber = 32;
  }

  // Special zones for Svalbard
  if (Lat >= 72.0 && Lat < 84.0) {
    if (Long >= 0.0 && Long < 9.0) {
      ZoneNumber = 31;
    }
    else if (Long >= 9.0 && Long < 21.0) {
      ZoneNumber = 33;
    }
    else if (Long >= 21.0 && Long < 33.0) {
      ZoneNumber = 35;
    }
    else if (Long >= 33.0 && Long < 42.0) {
      ZoneNumber = 37;
    }
  }

  LongOrigin = (ZoneNumber - 1) * 6 - 180 + 3; //+3 puts origin
  // in middle of
  // zone
  LongOriginRad = degToRad(LongOrigin);

  eccPrimeSquared = (eccSquared) / (1 - eccSquared);

  N = a / Math.sqrt(1 - eccSquared * Math.sin(LatRad) * Math.sin(LatRad));
  T = Math.tan(LatRad) * Math.tan(LatRad);
  C = eccPrimeSquared * Math.cos(LatRad) * Math.cos(LatRad);
  A = Math.cos(LatRad) * (LongRad - LongOriginRad);

  M = a * ((1 - eccSquared / 4 - 3 * eccSquared * eccSquared / 64 - 5 * eccSquared * eccSquared * eccSquared / 256) * LatRad - (3 * eccSquared / 8 + 3 * eccSquared * eccSquared / 32 + 45 * eccSquared * eccSquared * eccSquared / 1024) * Math.sin(2 * LatRad) + (15 * eccSquared * eccSquared / 256 + 45 * eccSquared * eccSquared * eccSquared / 1024) * Math.sin(4 * LatRad) - (35 * eccSquared * eccSquared * eccSquared / 3072) * Math.sin(6 * LatRad));

  var UTMEasting = (k0 * N * (A + (1 - T + C) * A * A * A / 6.0 + (5 - 18 * T + T * T + 72 * C - 58 * eccPrimeSquared) * A * A * A * A * A / 120.0) + 500000.0);

  var UTMNorthing = (k0 * (M + N * Math.tan(LatRad) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24.0 + (61 - 58 * T + T * T + 600 * C - 330 * eccPrimeSquared) * A * A * A * A * A * A / 720.0)));
  if (Lat < 0.0) {
    UTMNorthing += 10000000.0; //10000000 meter offset for
    // southern hemisphere
  }

  return {
    northing: Math.round(UTMNorthing),
    easting: Math.round(UTMEasting),
    zoneNumber: ZoneNumber,
    zoneLetter: getLetterDesignator(Lat)
  };
}

/**
 * Converts UTM coords to lat/long, using the WGS84 ellipsoid. This is a convenience
 * class where the Zone can be specified as a single string eg."60N" which
 * is then broken down into the ZoneNumber and ZoneLetter.
 *
 * @private
 * @param {object} utm An object literal with northing, easting, zoneNumber
 *     and zoneLetter properties. If an optional accuracy property is
 *     provided (in meters), a bounding box will be returned instead of
 *     latitude and longitude.
 * @return {object} An object literal containing either lat and lon values
 *     (if no accuracy was provided), or top, right, bottom and left values
 *     for the bounding box calculated according to the provided accuracy.
 *     Returns null if the conversion failed.
 */
function UTMtoLL(utm) {

  var UTMNorthing = utm.northing;
  var UTMEasting = utm.easting;
  var zoneLetter = utm.zoneLetter;
  var zoneNumber = utm.zoneNumber;
  // check the ZoneNummber is valid
  if (zoneNumber < 0 || zoneNumber > 60) {
    return null;
  }

  var k0 = 0.9996;
  var a = 6378137.0; //ellip.radius;
  var eccSquared = 0.00669438; //ellip.eccsq;
  var eccPrimeSquared;
  var e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));
  var N1, T1, C1, R1, D, M;
  var LongOrigin;
  var mu, phi1Rad;

  // remove 500,000 meter offset for longitude
  var x = UTMEasting - 500000.0;
  var y = UTMNorthing;

  // We must know somehow if we are in the Northern or Southern
  // hemisphere, this is the only time we use the letter So even
  // if the Zone letter isn't exactly correct it should indicate
  // the hemisphere correctly
  if (zoneLetter < 'N') {
    y -= 10000000.0; // remove 10,000,000 meter offset used
    // for southern hemisphere
  }

  // There are 60 zones with zone 1 being at West -180 to -174
  LongOrigin = (zoneNumber - 1) * 6 - 180 + 3; // +3 puts origin
  // in middle of
  // zone

  eccPrimeSquared = (eccSquared) / (1 - eccSquared);

  M = y / k0;
  mu = M / (a * (1 - eccSquared / 4 - 3 * eccSquared * eccSquared / 64 - 5 * eccSquared * eccSquared * eccSquared / 256));

  phi1Rad = mu + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu) + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu);
  // double phi1 = ProjMath.radToDeg(phi1Rad);

  N1 = a / Math.sqrt(1 - eccSquared * Math.sin(phi1Rad) * Math.sin(phi1Rad));
  T1 = Math.tan(phi1Rad) * Math.tan(phi1Rad);
  C1 = eccPrimeSquared * Math.cos(phi1Rad) * Math.cos(phi1Rad);
  R1 = a * (1 - eccSquared) / Math.pow(1 - eccSquared * Math.sin(phi1Rad) * Math.sin(phi1Rad), 1.5);
  D = x / (N1 * k0);

  var lat = phi1Rad - (N1 * Math.tan(phi1Rad) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * eccPrimeSquared) * D * D * D * D / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * eccPrimeSquared - 3 * C1 * C1) * D * D * D * D * D * D / 720);
  lat = radToDeg(lat);

  var lon = (D - (1 + 2 * T1 + C1) * D * D * D / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * eccPrimeSquared + 24 * T1 * T1) * D * D * D * D * D / 120) / Math.cos(phi1Rad);
  lon = LongOrigin + radToDeg(lon);

  var result;
  if (utm.accuracy) {
    var topRight = UTMtoLL({
      northing: utm.northing + utm.accuracy,
      easting: utm.easting + utm.accuracy,
      zoneLetter: utm.zoneLetter,
      zoneNumber: utm.zoneNumber
    });
    result = {
      top: topRight.lat,
      right: topRight.lon,
      bottom: lat,
      left: lon
    };
  }
  else {
    result = {
      lat: lat,
      lon: lon
    };
  }
  return result;
}

/**
 * Calculates the MGRS letter designator for the given latitude.
 *
 * @private
 * @param {number} lat The latitude in WGS84 to get the letter designator
 *     for.
 * @return {char} The letter designator.
 */
function getLetterDesignator(lat) {
  //This is here as an error flag to show that the Latitude is
  //outside MGRS limits
  var LetterDesignator = 'Z';

  if ((84 >= lat) && (lat >= 72)) {
    LetterDesignator = 'X';
  }
  else if ((72 > lat) && (lat >= 64)) {
    LetterDesignator = 'W';
  }
  else if ((64 > lat) && (lat >= 56)) {
    LetterDesignator = 'V';
  }
  else if ((56 > lat) && (lat >= 48)) {
    LetterDesignator = 'U';
  }
  else if ((48 > lat) && (lat >= 40)) {
    LetterDesignator = 'T';
  }
  else if ((40 > lat) && (lat >= 32)) {
    LetterDesignator = 'S';
  }
  else if ((32 > lat) && (lat >= 24)) {
    LetterDesignator = 'R';
  }
  else if ((24 > lat) && (lat >= 16)) {
    LetterDesignator = 'Q';
  }
  else if ((16 > lat) && (lat >= 8)) {
    LetterDesignator = 'P';
  }
  else if ((8 > lat) && (lat >= 0)) {
    LetterDesignator = 'N';
  }
  else if ((0 > lat) && (lat >= -8)) {
    LetterDesignator = 'M';
  }
  else if ((-8 > lat) && (lat >= -16)) {
    LetterDesignator = 'L';
  }
  else if ((-16 > lat) && (lat >= -24)) {
    LetterDesignator = 'K';
  }
  else if ((-24 > lat) && (lat >= -32)) {
    LetterDesignator = 'J';
  }
  else if ((-32 > lat) && (lat >= -40)) {
    LetterDesignator = 'H';
  }
  else if ((-40 > lat) && (lat >= -48)) {
    LetterDesignator = 'G';
  }
  else if ((-48 > lat) && (lat >= -56)) {
    LetterDesignator = 'F';
  }
  else if ((-56 > lat) && (lat >= -64)) {
    LetterDesignator = 'E';
  }
  else if ((-64 > lat) && (lat >= -72)) {
    LetterDesignator = 'D';
  }
  else if ((-72 > lat) && (lat >= -80)) {
    LetterDesignator = 'C';
  }
  return LetterDesignator;
}

/**
 * Encodes a UTM location as MGRS string.
 *
 * @private
 * @param {object} utm An object literal with easting, northing,
 *     zoneLetter, zoneNumber
 * @param {number} accuracy Accuracy in digits (1-5).
 * @return {string} MGRS string for the given UTM location.
 */
function encode(utm, accuracy) {
  // prepend with leading zeroes
  var seasting = "00000" + utm.easting,
    snorthing = "00000" + utm.northing;

  return utm.zoneNumber + utm.zoneLetter + get100kID(utm.easting, utm.northing, utm.zoneNumber) + seasting.substr(seasting.length - 5, accuracy) + snorthing.substr(snorthing.length - 5, accuracy);
}

/**
 * Get the two letter 100k designator for a given UTM easting,
 * northing and zone number value.
 *
 * @private
 * @param {number} easting
 * @param {number} northing
 * @param {number} zoneNumber
 * @return the two letter 100k designator for the given UTM location.
 */
function get100kID(easting, northing, zoneNumber) {
  var setParm = get100kSetForZone(zoneNumber);
  var setColumn = Math.floor(easting / 100000);
  var setRow = Math.floor(northing / 100000) % 20;
  return getLetter100kID(setColumn, setRow, setParm);
}

/**
 * Given a UTM zone number, figure out the MGRS 100K set it is in.
 *
 * @private
 * @param {number} i An UTM zone number.
 * @return {number} the 100k set the UTM zone is in.
 */
function get100kSetForZone(i) {
  var setParm = i % NUM_100K_SETS;
  if (setParm === 0) {
    setParm = NUM_100K_SETS;
  }

  return setParm;
}

/**
 * Get the two-letter MGRS 100k designator given information
 * translated from the UTM northing, easting and zone number.
 *
 * @private
 * @param {number} column the column index as it relates to the MGRS
 *        100k set spreadsheet, created from the UTM easting.
 *        Values are 1-8.
 * @param {number} row the row index as it relates to the MGRS 100k set
 *        spreadsheet, created from the UTM northing value. Values
 *        are from 0-19.
 * @param {number} parm the set block, as it relates to the MGRS 100k set
 *        spreadsheet, created from the UTM zone. Values are from
 *        1-60.
 * @return two letter MGRS 100k code.
 */
function getLetter100kID(column, row, parm) {
  // colOrigin and rowOrigin are the letters at the origin of the set
  var index = parm - 1;
  var colOrigin = SET_ORIGIN_COLUMN_LETTERS.charCodeAt(index);
  var rowOrigin = SET_ORIGIN_ROW_LETTERS.charCodeAt(index);

  // colInt and rowInt are the letters to build to return
  var colInt = colOrigin + column - 1;
  var rowInt = rowOrigin + row;
  var rollover = false;

  if (colInt > Z) {
    colInt = colInt - Z + A - 1;
    rollover = true;
  }

  if (colInt === I || (colOrigin < I && colInt > I) || ((colInt > I || colOrigin < I) && rollover)) {
    colInt++;
  }

  if (colInt === O || (colOrigin < O && colInt > O) || ((colInt > O || colOrigin < O) && rollover)) {
    colInt++;

    if (colInt === I) {
      colInt++;
    }
  }

  if (colInt > Z) {
    colInt = colInt - Z + A - 1;
  }

  if (rowInt > V) {
    rowInt = rowInt - V + A - 1;
    rollover = true;
  }
  else {
    rollover = false;
  }

  if (((rowInt === I) || ((rowOrigin < I) && (rowInt > I))) || (((rowInt > I) || (rowOrigin < I)) && rollover)) {
    rowInt++;
  }

  if (((rowInt === O) || ((rowOrigin < O) && (rowInt > O))) || (((rowInt > O) || (rowOrigin < O)) && rollover)) {
    rowInt++;

    if (rowInt === I) {
      rowInt++;
    }
  }

  if (rowInt > V) {
    rowInt = rowInt - V + A - 1;
  }

  var twoLetter = String.fromCharCode(colInt) + String.fromCharCode(rowInt);
  return twoLetter;
}

/**
 * Decode the UTM parameters from a MGRS string.
 *
 * @private
 * @param {string} mgrsString an UPPERCASE coordinate string is expected.
 * @return {object} An object literal with easting, northing, zoneLetter,
 *     zoneNumber and accuracy (in meters) properties.
 */
function decode(mgrsString) {

  if (mgrsString && mgrsString.length === 0) {
    throw ("MGRSPoint coverting from nothing");
  }

  var length = mgrsString.length;

  var hunK = null;
  var sb = "";
  var testChar;
  var i = 0;

  // get Zone number
  while (!(/[A-Z]/).test(testChar = mgrsString.charAt(i))) {
    if (i >= 2) {
      throw ("MGRSPoint bad conversion from: " + mgrsString);
    }
    sb += testChar;
    i++;
  }

  var zoneNumber = parseInt(sb, 10);

  if (i === 0 || i + 3 > length) {
    // A good MGRS string has to be 4-5 digits long,
    // ##AAA/#AAA at least.
    throw ("MGRSPoint bad conversion from: " + mgrsString);
  }

  var zoneLetter = mgrsString.charAt(i++);

  // Should we check the zone letter here? Why not.
  if (zoneLetter <= 'A' || zoneLetter === 'B' || zoneLetter === 'Y' || zoneLetter >= 'Z' || zoneLetter === 'I' || zoneLetter === 'O') {
    throw ("MGRSPoint zone letter " + zoneLetter + " not handled: " + mgrsString);
  }

  hunK = mgrsString.substring(i, i += 2);

  var set = get100kSetForZone(zoneNumber);

  var east100k = getEastingFromChar(hunK.charAt(0), set);
  var north100k = getNorthingFromChar(hunK.charAt(1), set);

  // We have a bug where the northing may be 2000000 too low.
  // How
  // do we know when to roll over?

  while (north100k < getMinNorthing(zoneLetter)) {
    north100k += 2000000;
  }

  // calculate the char index for easting/northing separator
  var remainder = length - i;

  if (remainder % 2 !== 0) {
    throw ("MGRSPoint has to have an even number \nof digits after the zone letter and two 100km letters - front \nhalf for easting meters, second half for \nnorthing meters" + mgrsString);
  }

  var sep = remainder / 2;

  var sepEasting = 0.0;
  var sepNorthing = 0.0;
  var accuracyBonus, sepEastingString, sepNorthingString, easting, northing;
  if (sep > 0) {
    accuracyBonus = 100000.0 / Math.pow(10, sep);
    sepEastingString = mgrsString.substring(i, i + sep);
    sepEasting = parseFloat(sepEastingString) * accuracyBonus;
    sepNorthingString = mgrsString.substring(i + sep);
    sepNorthing = parseFloat(sepNorthingString) * accuracyBonus;
  }

  easting = sepEasting + east100k;
  northing = sepNorthing + north100k;

  return {
    easting: easting,
    northing: northing,
    zoneLetter: zoneLetter,
    zoneNumber: zoneNumber,
    accuracy: accuracyBonus
  };
}

/**
 * Given the first letter from a two-letter MGRS 100k zone, and given the
 * MGRS table set for the zone number, figure out the easting value that
 * should be added to the other, secondary easting value.
 *
 * @private
 * @param {char} e The first letter from a two-letter MGRS 100´k zone.
 * @param {number} set The MGRS table set for the zone number.
 * @return {number} The easting value for the given letter and set.
 */
function getEastingFromChar(e, set) {
  // colOrigin is the letter at the origin of the set for the
  // column
  var curCol = SET_ORIGIN_COLUMN_LETTERS.charCodeAt(set - 1);
  var eastingValue = 100000.0;
  var rewindMarker = false;

  while (curCol !== e.charCodeAt(0)) {
    curCol++;
    if (curCol === I) {
      curCol++;
    }
    if (curCol === O) {
      curCol++;
    }
    if (curCol > Z) {
      if (rewindMarker) {
        throw ("Bad character: " + e);
      }
      curCol = A;
      rewindMarker = true;
    }
    eastingValue += 100000.0;
  }

  return eastingValue;
}

/**
 * Given the second letter from a two-letter MGRS 100k zone, and given the
 * MGRS table set for the zone number, figure out the northing value that
 * should be added to the other, secondary northing value. You have to
 * remember that Northings are determined from the equator, and the vertical
 * cycle of letters mean a 2000000 additional northing meters. This happens
 * approx. every 18 degrees of latitude. This method does *NOT* count any
 * additional northings. You have to figure out how many 2000000 meters need
 * to be added for the zone letter of the MGRS coordinate.
 *
 * @private
 * @param {char} n Second letter of the MGRS 100k zone
 * @param {number} set The MGRS table set number, which is dependent on the
 *     UTM zone number.
 * @return {number} The northing value for the given letter and set.
 */
function getNorthingFromChar(n, set) {

  if (n > 'V') {
    throw ("MGRSPoint given invalid Northing " + n);
  }

  // rowOrigin is the letter at the origin of the set for the
  // column
  var curRow = SET_ORIGIN_ROW_LETTERS.charCodeAt(set - 1);
  var northingValue = 0.0;
  var rewindMarker = false;

  while (curRow !== n.charCodeAt(0)) {
    curRow++;
    if (curRow === I) {
      curRow++;
    }
    if (curRow === O) {
      curRow++;
    }
    // fixing a bug making whole application hang in this loop
    // when 'n' is a wrong character
    if (curRow > V) {
      if (rewindMarker) { // making sure that this loop ends
        throw ("Bad character: " + n);
      }
      curRow = A;
      rewindMarker = true;
    }
    northingValue += 100000.0;
  }

  return northingValue;
}

/**
 * The function getMinNorthing returns the minimum northing value of a MGRS
 * zone.
 *
 * Ported from Geotrans' c Lattitude_Band_Value structure table.
 *
 * @private
 * @param {char} zoneLetter The MGRS zone to get the min northing for.
 * @return {number}
 */
function getMinNorthing(zoneLetter) {
  var northing;
  switch (zoneLetter) {
  case 'C':
    northing = 1100000.0;
    break;
  case 'D':
    northing = 2000000.0;
    break;
  case 'E':
    northing = 2800000.0;
    break;
  case 'F':
    northing = 3700000.0;
    break;
  case 'G':
    northing = 4600000.0;
    break;
  case 'H':
    northing = 5500000.0;
    break;
  case 'J':
    northing = 6400000.0;
    break;
  case 'K':
    northing = 7300000.0;
    break;
  case 'L':
    northing = 8200000.0;
    break;
  case 'M':
    northing = 9100000.0;
    break;
  case 'N':
    northing = 0.0;
    break;
  case 'P':
    northing = 800000.0;
    break;
  case 'Q':
    northing = 1700000.0;
    break;
  case 'R':
    northing = 2600000.0;
    break;
  case 'S':
    northing = 3500000.0;
    break;
  case 'T':
    northing = 4400000.0;
    break;
  case 'U':
    northing = 5300000.0;
    break;
  case 'V':
    northing = 6200000.0;
    break;
  case 'W':
    northing = 7000000.0;
    break;
  case 'X':
    northing = 7900000.0;
    break;
  default:
    northing = -1.0;
  }
  if (northing >= 0.0) {
    return northing;
  }
  else {
    throw ("Invalid zone letter: " + zoneLetter);
  }

}

;// ./node_modules/proj4/lib/Point.js


/**
 * @deprecated v3.0.0 - use proj4.toPoint instead
 * @param {number | import('./core').TemplateCoordinates | string} x
 * @param {number} [y]
 * @param {number} [z]
 */
function Point(x, y, z) {
  if (!(this instanceof Point)) {
    return new Point(x, y, z);
  }
  if (Array.isArray(x)) {
    this.x = x[0];
    this.y = x[1];
    this.z = x[2] || 0.0;
  } else if (typeof x === 'object') {
    this.x = x.x;
    this.y = x.y;
    this.z = x.z || 0.0;
  } else if (typeof x === 'string' && typeof y === 'undefined') {
    var coords = x.split(',');
    this.x = parseFloat(coords[0]);
    this.y = parseFloat(coords[1]);
    this.z = parseFloat(coords[2]) || 0.0;
  } else {
    this.x = x;
    this.y = y;
    this.z = z || 0.0;
  }
  console.warn('proj4.Point will be removed in version 3, use proj4.toPoint');
}

Point.fromMGRS = function (mgrsStr) {
  return new Point(mgrs_toPoint(mgrsStr));
};
Point.prototype.toMGRS = function (accuracy) {
  return mgrs_forward([this.x, this.y], accuracy);
};
/* harmony default export */ const lib_Point = (Point);

;// ./node_modules/proj4/lib/common/pj_enfn.js
var C00 = 1;
var C02 = 0.25;
var C04 = 0.046875;
var C06 = 0.01953125;
var C08 = 0.01068115234375;
var C22 = 0.75;
var C44 = 0.46875;
var C46 = 0.01302083333333333333;
var C48 = 0.00712076822916666666;
var C66 = 0.36458333333333333333;
var C68 = 0.00569661458333333333;
var C88 = 0.3076171875;

/* harmony default export */ function pj_enfn(es) {
  var en = [];
  en[0] = C00 - es * (C02 + es * (C04 + es * (C06 + es * C08)));
  en[1] = es * (C22 - es * (C04 + es * (C06 + es * C08)));
  var t = es * es;
  en[2] = t * (C44 - es * (C46 + es * C48));
  t *= es;
  en[3] = t * (C66 - es * C68);
  en[4] = t * es * C88;
  return en;
}

;// ./node_modules/proj4/lib/common/pj_mlfn.js
/* harmony default export */ function pj_mlfn(phi, sphi, cphi, en) {
  cphi *= sphi;
  sphi *= sphi;
  return (en[0] * phi - cphi * (en[1] + sphi * (en[2] + sphi * (en[3] + sphi * en[4]))));
}

;// ./node_modules/proj4/lib/common/pj_inv_mlfn.js



var MAX_ITER = 20;

/* harmony default export */ function pj_inv_mlfn(arg, es, en) {
  var k = 1 / (1 - es);
  var phi = arg;
  for (var i = MAX_ITER; i; --i) { /* rarely goes over 2 iterations */
    var s = Math.sin(phi);
    var t = 1 - es * s * s;
    // t = this.pj_mlfn(phi, s, Math.cos(phi), en) - arg;
    // phi -= t * (t * Math.sqrt(t)) * k;
    t = (pj_mlfn(phi, s, Math.cos(phi), en) - arg) * (t * Math.sqrt(t)) * k;
    phi -= t;
    if (Math.abs(t) < EPSLN) {
      return phi;
    }
  }
  // ..reportError("cass:pj_inv_mlfn: Convergence error");
  return phi;
}

;// ./node_modules/proj4/lib/projections/tmerc.js
// Heavily based on this tmerc projection implementation
// https://github.com/mbloch/mapshaper-proj/blob/master/src/projections/tmerc.js









/**
 * @typedef {Object} LocalThis
 * @property {number} es
 * @property {Array<number>} en
 * @property {number} ml0
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function tmerc_init() {
  this.x0 = this.x0 !== undefined ? this.x0 : 0;
  this.y0 = this.y0 !== undefined ? this.y0 : 0;
  this.long0 = this.long0 !== undefined ? this.long0 : 0;
  this.lat0 = this.lat0 !== undefined ? this.lat0 : 0;

  if (this.es) {
    this.en = pj_enfn(this.es);
    this.ml0 = pj_mlfn(this.lat0, Math.sin(this.lat0), Math.cos(this.lat0), this.en);
  }
}

/**
    Transverse Mercator Forward  - long/lat to x/y
    long/lat in radians
  */
function tmerc_forward(p) {
  var lon = p.x;
  var lat = p.y;

  var delta_lon = adjust_lon(lon - this.long0);
  var con;
  var x, y;
  var sin_phi = Math.sin(lat);
  var cos_phi = Math.cos(lat);

  if (!this.es) {
    var b = cos_phi * Math.sin(delta_lon);

    if ((Math.abs(Math.abs(b) - 1)) < EPSLN) {
      return (93);
    } else {
      x = 0.5 * this.a * this.k0 * Math.log((1 + b) / (1 - b)) + this.x0;
      y = cos_phi * Math.cos(delta_lon) / Math.sqrt(1 - Math.pow(b, 2));
      b = Math.abs(y);

      if (b >= 1) {
        if ((b - 1) > EPSLN) {
          return (93);
        } else {
          y = 0;
        }
      } else {
        y = Math.acos(y);
      }

      if (lat < 0) {
        y = -y;
      }

      y = this.a * this.k0 * (y - this.lat0) + this.y0;
    }
  } else {
    var al = cos_phi * delta_lon;
    var als = Math.pow(al, 2);
    var c = this.ep2 * Math.pow(cos_phi, 2);
    var cs = Math.pow(c, 2);
    var tq = Math.abs(cos_phi) > EPSLN ? Math.tan(lat) : 0;
    var t = Math.pow(tq, 2);
    var ts = Math.pow(t, 2);
    con = 1 - this.es * Math.pow(sin_phi, 2);
    al = al / Math.sqrt(con);
    var ml = pj_mlfn(lat, sin_phi, cos_phi, this.en);

    x = this.a * (this.k0 * al * (1
      + als / 6 * (1 - t + c
        + als / 20 * (5 - 18 * t + ts + 14 * c - 58 * t * c
          + als / 42 * (61 + 179 * ts - ts * t - 479 * t)))))
        + this.x0;

    y = this.a * (this.k0 * (ml - this.ml0
      + sin_phi * delta_lon * al / 2 * (1
        + als / 12 * (5 - t + 9 * c + 4 * cs
          + als / 30 * (61 + ts - 58 * t + 270 * c - 330 * t * c
            + als / 56 * (1385 + 543 * ts - ts * t - 3111 * t))))))
          + this.y0;
  }

  p.x = x;
  p.y = y;

  return p;
}

/**
    Transverse Mercator Inverse  -  x/y to long/lat
  */
function tmerc_inverse(p) {
  var con, phi;
  var lat, lon;
  var x = (p.x - this.x0) * (1 / this.a);
  var y = (p.y - this.y0) * (1 / this.a);

  if (!this.es) {
    var f = Math.exp(x / this.k0);
    var g = 0.5 * (f - 1 / f);
    var temp = this.lat0 + y / this.k0;
    var h = Math.cos(temp);
    con = Math.sqrt((1 - Math.pow(h, 2)) / (1 + Math.pow(g, 2)));
    lat = Math.asin(con);

    if (y < 0) {
      lat = -lat;
    }

    if ((g === 0) && (h === 0)) {
      lon = 0;
    } else {
      lon = adjust_lon(Math.atan2(g, h) + this.long0);
    }
  } else { // ellipsoidal form
    con = this.ml0 + y / this.k0;
    phi = pj_inv_mlfn(con, this.es, this.en);

    if (Math.abs(phi) < HALF_PI) {
      var sin_phi = Math.sin(phi);
      var cos_phi = Math.cos(phi);
      var tan_phi = Math.abs(cos_phi) > EPSLN ? Math.tan(phi) : 0;
      var c = this.ep2 * Math.pow(cos_phi, 2);
      var cs = Math.pow(c, 2);
      var t = Math.pow(tan_phi, 2);
      var ts = Math.pow(t, 2);
      con = 1 - this.es * Math.pow(sin_phi, 2);
      var d = x * Math.sqrt(con) / this.k0;
      var ds = Math.pow(d, 2);
      con = con * tan_phi;

      lat = phi - (con * ds / (1 - this.es)) * 0.5 * (1
        - ds / 12 * (5 + 3 * t - 9 * c * t + c - 4 * cs
          - ds / 30 * (61 + 90 * t - 252 * c * t + 45 * ts + 46 * c
            - ds / 56 * (1385 + 3633 * t + 4095 * ts + 1574 * ts * t))));

      lon = adjust_lon(this.long0 + (d * (1
        - ds / 6 * (1 + 2 * t + c
          - ds / 20 * (5 + 28 * t + 24 * ts + 8 * c * t + 6 * c
            - ds / 42 * (61 + 662 * t + 1320 * ts + 720 * ts * t)))) / cos_phi));
    } else {
      lat = HALF_PI * sign(y);
      lon = 0;
    }
  }

  p.x = lon;
  p.y = lat;

  return p;
}

var tmerc_names = ['Fast_Transverse_Mercator', 'Fast Transverse Mercator'];
/* harmony default export */ const tmerc = ({
  init: tmerc_init,
  forward: tmerc_forward,
  inverse: tmerc_inverse,
  names: tmerc_names
});

;// ./node_modules/proj4/lib/common/sinh.js
/* harmony default export */ function sinh(x) {
  var r = Math.exp(x);
  r = (r - 1 / r) / 2;
  return r;
}

;// ./node_modules/proj4/lib/common/hypot.js
/* harmony default export */ function hypot(x, y) {
  x = Math.abs(x);
  y = Math.abs(y);
  var a = Math.max(x, y);
  var b = Math.min(x, y) / (a ? a : 1);

  return a * Math.sqrt(1 + Math.pow(b, 2));
}

;// ./node_modules/proj4/lib/common/log1py.js
/* harmony default export */ function log1py(x) {
  var y = 1 + x;
  var z = y - 1;

  return z === 0 ? x : x * Math.log(y) / z;
}

;// ./node_modules/proj4/lib/common/asinhy.js



/* harmony default export */ function asinhy(x) {
  var y = Math.abs(x);
  y = log1py(y * (1 + y / (hypot(1, y) + 1)));

  return x < 0 ? -y : y;
}

;// ./node_modules/proj4/lib/common/gatg.js
/* harmony default export */ function gatg(pp, B) {
  var cos_2B = 2 * Math.cos(2 * B);
  var i = pp.length - 1;
  var h1 = pp[i];
  var h2 = 0;
  var h;

  while (--i >= 0) {
    h = -h2 + cos_2B * h1 + pp[i];
    h2 = h1;
    h1 = h;
  }

  return (B + h * Math.sin(2 * B));
}

;// ./node_modules/proj4/lib/common/clens.js
/* harmony default export */ function clens(pp, arg_r) {
  var r = 2 * Math.cos(arg_r);
  var i = pp.length - 1;
  var hr1 = pp[i];
  var hr2 = 0;
  var hr;

  while (--i >= 0) {
    hr = -hr2 + r * hr1 + pp[i];
    hr2 = hr1;
    hr1 = hr;
  }

  return Math.sin(arg_r) * hr;
}

;// ./node_modules/proj4/lib/common/cosh.js
/* harmony default export */ function cosh(x) {
  var r = Math.exp(x);
  r = (r + 1 / r) / 2;
  return r;
}

;// ./node_modules/proj4/lib/common/clens_cmplx.js



/* harmony default export */ function clens_cmplx(pp, arg_r, arg_i) {
  var sin_arg_r = Math.sin(arg_r);
  var cos_arg_r = Math.cos(arg_r);
  var sinh_arg_i = sinh(arg_i);
  var cosh_arg_i = cosh(arg_i);
  var r = 2 * cos_arg_r * cosh_arg_i;
  var i = -2 * sin_arg_r * sinh_arg_i;
  var j = pp.length - 1;
  var hr = pp[j];
  var hi1 = 0;
  var hr1 = 0;
  var hi = 0;
  var hr2;
  var hi2;

  while (--j >= 0) {
    hr2 = hr1;
    hi2 = hi1;
    hr1 = hr;
    hi1 = hi;
    hr = -hr2 + r * hr1 - i * hi1 + pp[j];
    hi = -hi2 + i * hr1 + r * hi1;
  }

  r = sin_arg_r * cosh_arg_i;
  i = cos_arg_r * sinh_arg_i;

  return [r * hr - i * hi, r * hi + i * hr];
}

;// ./node_modules/proj4/lib/projections/etmerc.js
// Heavily based on this etmerc projection implementation
// https://github.com/mbloch/mapshaper-proj/blob/master/src/projections/etmerc.js










/**
 * @typedef {Object} LocalThis
 * @property {number} es
 * @property {Array<number>} cbg
 * @property {Array<number>} cgb
 * @property {Array<number>} utg
 * @property {Array<number>} gtu
 * @property {number} Qn
 * @property {number} Zb
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function etmerc_init() {
  if (!this.approx && (isNaN(this.es) || this.es <= 0)) {
    throw new Error('Incorrect elliptical usage. Try using the +approx option in the proj string, or PROJECTION["Fast_Transverse_Mercator"] in the WKT.');
  }
  if (this.approx) {
    // When '+approx' is set, use tmerc instead
    tmerc.init.apply(this);
    this.forward = tmerc.forward;
    this.inverse = tmerc.inverse;
  }

  this.x0 = this.x0 !== undefined ? this.x0 : 0;
  this.y0 = this.y0 !== undefined ? this.y0 : 0;
  this.long0 = this.long0 !== undefined ? this.long0 : 0;
  this.lat0 = this.lat0 !== undefined ? this.lat0 : 0;

  this.cgb = [];
  this.cbg = [];
  this.utg = [];
  this.gtu = [];

  var f = this.es / (1 + Math.sqrt(1 - this.es));
  var n = f / (2 - f);
  var np = n;

  this.cgb[0] = n * (2 + n * (-2 / 3 + n * (-2 + n * (116 / 45 + n * (26 / 45 + n * (-2854 / 675))))));
  this.cbg[0] = n * (-2 + n * (2 / 3 + n * (4 / 3 + n * (-82 / 45 + n * (32 / 45 + n * (4642 / 4725))))));

  np = np * n;
  this.cgb[1] = np * (7 / 3 + n * (-8 / 5 + n * (-227 / 45 + n * (2704 / 315 + n * (2323 / 945)))));
  this.cbg[1] = np * (5 / 3 + n * (-16 / 15 + n * (-13 / 9 + n * (904 / 315 + n * (-1522 / 945)))));

  np = np * n;
  this.cgb[2] = np * (56 / 15 + n * (-136 / 35 + n * (-1262 / 105 + n * (73814 / 2835))));
  this.cbg[2] = np * (-26 / 15 + n * (34 / 21 + n * (8 / 5 + n * (-12686 / 2835))));

  np = np * n;
  this.cgb[3] = np * (4279 / 630 + n * (-332 / 35 + n * (-399572 / 14175)));
  this.cbg[3] = np * (1237 / 630 + n * (-12 / 5 + n * (-24832 / 14175)));

  np = np * n;
  this.cgb[4] = np * (4174 / 315 + n * (-144838 / 6237));
  this.cbg[4] = np * (-734 / 315 + n * (109598 / 31185));

  np = np * n;
  this.cgb[5] = np * (601676 / 22275);
  this.cbg[5] = np * (444337 / 155925);

  np = Math.pow(n, 2);
  this.Qn = this.k0 / (1 + n) * (1 + np * (1 / 4 + np * (1 / 64 + np / 256)));

  this.utg[0] = n * (-0.5 + n * (2 / 3 + n * (-37 / 96 + n * (1 / 360 + n * (81 / 512 + n * (-96199 / 604800))))));
  this.gtu[0] = n * (0.5 + n * (-2 / 3 + n * (5 / 16 + n * (41 / 180 + n * (-127 / 288 + n * (7891 / 37800))))));

  this.utg[1] = np * (-1 / 48 + n * (-1 / 15 + n * (437 / 1440 + n * (-46 / 105 + n * (1118711 / 3870720)))));
  this.gtu[1] = np * (13 / 48 + n * (-3 / 5 + n * (557 / 1440 + n * (281 / 630 + n * (-1983433 / 1935360)))));

  np = np * n;
  this.utg[2] = np * (-17 / 480 + n * (37 / 840 + n * (209 / 4480 + n * (-5569 / 90720))));
  this.gtu[2] = np * (61 / 240 + n * (-103 / 140 + n * (15061 / 26880 + n * (167603 / 181440))));

  np = np * n;
  this.utg[3] = np * (-4397 / 161280 + n * (11 / 504 + n * (830251 / 7257600)));
  this.gtu[3] = np * (49561 / 161280 + n * (-179 / 168 + n * (6601661 / 7257600)));

  np = np * n;
  this.utg[4] = np * (-4583 / 161280 + n * (108847 / 3991680));
  this.gtu[4] = np * (34729 / 80640 + n * (-3418889 / 1995840));

  np = np * n;
  this.utg[5] = np * (-20648693 / 638668800);
  this.gtu[5] = np * (212378941 / 319334400);

  var Z = gatg(this.cbg, this.lat0);
  this.Zb = -this.Qn * (Z + clens(this.gtu, 2 * Z));
}

function etmerc_forward(p) {
  var Ce = adjust_lon(p.x - this.long0);
  var Cn = p.y;

  Cn = gatg(this.cbg, Cn);
  var sin_Cn = Math.sin(Cn);
  var cos_Cn = Math.cos(Cn);
  var sin_Ce = Math.sin(Ce);
  var cos_Ce = Math.cos(Ce);

  Cn = Math.atan2(sin_Cn, cos_Ce * cos_Cn);
  Ce = Math.atan2(sin_Ce * cos_Cn, hypot(sin_Cn, cos_Cn * cos_Ce));
  Ce = asinhy(Math.tan(Ce));

  var tmp = clens_cmplx(this.gtu, 2 * Cn, 2 * Ce);

  Cn = Cn + tmp[0];
  Ce = Ce + tmp[1];

  var x;
  var y;

  if (Math.abs(Ce) <= 2.623395162778) {
    x = this.a * (this.Qn * Ce) + this.x0;
    y = this.a * (this.Qn * Cn + this.Zb) + this.y0;
  } else {
    x = Infinity;
    y = Infinity;
  }

  p.x = x;
  p.y = y;

  return p;
}

function etmerc_inverse(p) {
  var Ce = (p.x - this.x0) * (1 / this.a);
  var Cn = (p.y - this.y0) * (1 / this.a);

  Cn = (Cn - this.Zb) / this.Qn;
  Ce = Ce / this.Qn;

  var lon;
  var lat;

  if (Math.abs(Ce) <= 2.623395162778) {
    var tmp = clens_cmplx(this.utg, 2 * Cn, 2 * Ce);

    Cn = Cn + tmp[0];
    Ce = Ce + tmp[1];
    Ce = Math.atan(sinh(Ce));

    var sin_Cn = Math.sin(Cn);
    var cos_Cn = Math.cos(Cn);
    var sin_Ce = Math.sin(Ce);
    var cos_Ce = Math.cos(Ce);

    Cn = Math.atan2(sin_Cn * cos_Ce, hypot(sin_Ce, cos_Ce * cos_Cn));
    Ce = Math.atan2(sin_Ce, cos_Ce * cos_Cn);

    lon = adjust_lon(Ce + this.long0);
    lat = gatg(this.cgb, Cn);
  } else {
    lon = Infinity;
    lat = Infinity;
  }

  p.x = lon;
  p.y = lat;

  return p;
}

var etmerc_names = ['Extended_Transverse_Mercator', 'Extended Transverse Mercator', 'etmerc', 'Transverse_Mercator', 'Transverse Mercator', 'Gauss Kruger', 'Gauss_Kruger', 'tmerc'];
/* harmony default export */ const etmerc = ({
  init: etmerc_init,
  forward: etmerc_forward,
  inverse: etmerc_inverse,
  names: etmerc_names
});

;// ./node_modules/proj4/lib/common/adjust_zone.js


/* harmony default export */ function adjust_zone(zone, lon) {
  if (zone === undefined) {
    zone = Math.floor((adjust_lon(lon) + Math.PI) * 30 / Math.PI) + 1;

    if (zone < 0) {
      return 0;
    } else if (zone > 60) {
      return 60;
    }
  }
  return zone;
}

;// ./node_modules/proj4/lib/projections/utm.js


var dependsOn = 'etmerc';


/** @this {import('../defs.js').ProjectionDefinition} */
function utm_init() {
  var zone = adjust_zone(this.zone, this.long0);
  if (zone === undefined) {
    throw new Error('unknown utm zone');
  }
  this.lat0 = 0;
  this.long0 = ((6 * Math.abs(zone)) - 183) * D2R;
  this.x0 = 500000;
  this.y0 = this.utmSouth ? 10000000 : 0;
  this.k0 = 0.9996;

  etmerc.init.apply(this);
  this.forward = etmerc.forward;
  this.inverse = etmerc.inverse;
}

var utm_names = ['Universal Transverse Mercator System', 'utm'];
/* harmony default export */ const utm = ({
  init: utm_init,
  names: utm_names,
  dependsOn: dependsOn
});

;// ./node_modules/proj4/lib/common/srat.js
/* harmony default export */ function srat(esinp, exp) {
  return (Math.pow((1 - esinp) / (1 + esinp), exp));
}

;// ./node_modules/proj4/lib/projections/gauss.js

var gauss_MAX_ITER = 20;


/**
 * @typedef {Object} LocalThis
 * @property {number} rc
 * @property {number} C
 * @property {number} phic0
 * @property {number} ratexp
 * @property {number} K
 * @property {number} e
 * @property {number} es
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function gauss_init() {
  var sphi = Math.sin(this.lat0);
  var cphi = Math.cos(this.lat0);
  cphi *= cphi;
  this.rc = Math.sqrt(1 - this.es) / (1 - this.es * sphi * sphi);
  this.C = Math.sqrt(1 + this.es * cphi * cphi / (1 - this.es));
  this.phic0 = Math.asin(sphi / this.C);
  this.ratexp = 0.5 * this.C * this.e;
  this.K = Math.tan(0.5 * this.phic0 + FORTPI) / (Math.pow(Math.tan(0.5 * this.lat0 + FORTPI), this.C) * srat(this.e * sphi, this.ratexp));
}

function gauss_forward(p) {
  var lon = p.x;
  var lat = p.y;

  p.y = 2 * Math.atan(this.K * Math.pow(Math.tan(0.5 * lat + FORTPI), this.C) * srat(this.e * Math.sin(lat), this.ratexp)) - HALF_PI;
  p.x = this.C * lon;
  return p;
}

function gauss_inverse(p) {
  var DEL_TOL = 1e-14;
  var lon = p.x / this.C;
  var lat = p.y;
  var num = Math.pow(Math.tan(0.5 * lat + FORTPI) / this.K, 1 / this.C);
  for (var i = gauss_MAX_ITER; i > 0; --i) {
    lat = 2 * Math.atan(num * srat(this.e * Math.sin(p.y), -0.5 * this.e)) - HALF_PI;
    if (Math.abs(lat - p.y) < DEL_TOL) {
      break;
    }
    p.y = lat;
  }
  /* convergence failed */
  if (!i) {
    return null;
  }
  p.x = lon;
  p.y = lat;
  return p;
}

var gauss_names = ['gauss'];
/* harmony default export */ const gauss = ({
  init: gauss_init,
  forward: gauss_forward,
  inverse: gauss_inverse,
  names: gauss_names
});

;// ./node_modules/proj4/lib/projections/sterea.js




/**
 * @typedef {Object} LocalThis
 * @property {number} sinc0
 * @property {number} cosc0
 * @property {number} R2
 * @property {number} rc
 * @property {number} phic0
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function sterea_init() {
  gauss.init.apply(this);
  if (!this.rc) {
    return;
  }
  this.sinc0 = Math.sin(this.phic0);
  this.cosc0 = Math.cos(this.phic0);
  this.R2 = 2 * this.rc;
  if (!this.title) {
    this.title = 'Oblique Stereographic Alternative';
  }
}

function sterea_forward(p) {
  var sinc, cosc, cosl, k;
  p.x = adjust_lon(p.x - this.long0);
  gauss.forward.apply(this, [p]);
  sinc = Math.sin(p.y);
  cosc = Math.cos(p.y);
  cosl = Math.cos(p.x);
  k = this.k0 * this.R2 / (1 + this.sinc0 * sinc + this.cosc0 * cosc * cosl);
  p.x = k * cosc * Math.sin(p.x);
  p.y = k * (this.cosc0 * sinc - this.sinc0 * cosc * cosl);
  p.x = this.a * p.x + this.x0;
  p.y = this.a * p.y + this.y0;
  return p;
}

function sterea_inverse(p) {
  var sinc, cosc, lon, lat, rho;
  p.x = (p.x - this.x0) / this.a;
  p.y = (p.y - this.y0) / this.a;

  p.x /= this.k0;
  p.y /= this.k0;
  if ((rho = hypot(p.x, p.y))) {
    var c = 2 * Math.atan2(rho, this.R2);
    sinc = Math.sin(c);
    cosc = Math.cos(c);
    lat = Math.asin(cosc * this.sinc0 + p.y * sinc * this.cosc0 / rho);
    lon = Math.atan2(p.x * sinc, rho * this.cosc0 * cosc - p.y * this.sinc0 * sinc);
  } else {
    lat = this.phic0;
    lon = 0;
  }

  p.x = lon;
  p.y = lat;
  gauss.inverse.apply(this, [p]);
  p.x = adjust_lon(p.x + this.long0);
  return p;
}

var sterea_names = ['Stereographic_North_Pole', 'Oblique_Stereographic', 'sterea', 'Oblique Stereographic Alternative', 'Double_Stereographic'];
/* harmony default export */ const sterea = ({
  init: sterea_init,
  forward: sterea_forward,
  inverse: sterea_inverse,
  names: sterea_names
});

;// ./node_modules/proj4/lib/projections/stere.js








/**
 * @typedef {Object} LocalThis
 * @property {number} coslat0
 * @property {number} sinlat0
 * @property {number} ms1
 * @property {number} X0
 * @property {number} cosX0
 * @property {number} sinX0
 * @property {number} con
 * @property {number} cons
 * @property {number} e
 */

function ssfn_(phit, sinphi, eccen) {
  sinphi *= eccen;
  return (Math.tan(0.5 * (HALF_PI + phit)) * Math.pow((1 - sinphi) / (1 + sinphi), 0.5 * eccen));
}

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function stere_init() {
  // setting default parameters
  this.x0 = this.x0 || 0;
  this.y0 = this.y0 || 0;
  this.lat0 = this.lat0 || 0;
  this.long0 = this.long0 || 0;

  this.coslat0 = Math.cos(this.lat0);
  this.sinlat0 = Math.sin(this.lat0);
  if (this.sphere) {
    if (this.k0 === 1 && !isNaN(this.lat_ts) && Math.abs(this.coslat0) <= EPSLN) {
      this.k0 = 0.5 * (1 + sign(this.lat0) * Math.sin(this.lat_ts));
    }
  } else {
    if (Math.abs(this.coslat0) <= EPSLN) {
      if (this.lat0 > 0) {
        // North pole
        // trace('stere:north pole');
        this.con = 1;
      } else {
        // South pole
        // trace('stere:south pole');
        this.con = -1;
      }
    }
    this.cons = Math.sqrt(Math.pow(1 + this.e, 1 + this.e) * Math.pow(1 - this.e, 1 - this.e));
    if (this.k0 === 1 && !isNaN(this.lat_ts) && Math.abs(this.coslat0) <= EPSLN && Math.abs(Math.cos(this.lat_ts)) > EPSLN) {
      // When k0 is 1 (default value) and lat_ts is a vaild number and lat0 is at a pole and lat_ts is not at a pole
      // Recalculate k0 using formula 21-35 from p161 of Snyder, 1987
      this.k0 = 0.5 * this.cons * msfnz(this.e, Math.sin(this.lat_ts), Math.cos(this.lat_ts)) / tsfnz(this.e, this.con * this.lat_ts, this.con * Math.sin(this.lat_ts));
    }
    this.ms1 = msfnz(this.e, this.sinlat0, this.coslat0);
    this.X0 = 2 * Math.atan(ssfn_(this.lat0, this.sinlat0, this.e)) - HALF_PI;
    this.cosX0 = Math.cos(this.X0);
    this.sinX0 = Math.sin(this.X0);
  }
}

// Stereographic forward equations--mapping lat,long to x,y
function stere_forward(p) {
  var lon = p.x;
  var lat = p.y;
  var sinlat = Math.sin(lat);
  var coslat = Math.cos(lat);
  var A, X, sinX, cosX, ts, rh;
  var dlon = adjust_lon(lon - this.long0);

  if (Math.abs(Math.abs(lon - this.long0) - Math.PI) <= EPSLN && Math.abs(lat + this.lat0) <= EPSLN) {
    // case of the origine point
    // trace('stere:this is the origin point');
    p.x = NaN;
    p.y = NaN;
    return p;
  }
  if (this.sphere) {
    // trace('stere:sphere case');
    A = 2 * this.k0 / (1 + this.sinlat0 * sinlat + this.coslat0 * coslat * Math.cos(dlon));
    p.x = this.a * A * coslat * Math.sin(dlon) + this.x0;
    p.y = this.a * A * (this.coslat0 * sinlat - this.sinlat0 * coslat * Math.cos(dlon)) + this.y0;
    return p;
  } else {
    X = 2 * Math.atan(ssfn_(lat, sinlat, this.e)) - HALF_PI;
    cosX = Math.cos(X);
    sinX = Math.sin(X);
    if (Math.abs(this.coslat0) <= EPSLN) {
      ts = tsfnz(this.e, lat * this.con, this.con * sinlat);
      rh = 2 * this.a * this.k0 * ts / this.cons;
      p.x = this.x0 + rh * Math.sin(lon - this.long0);
      p.y = this.y0 - this.con * rh * Math.cos(lon - this.long0);
      // trace(p.toString());
      return p;
    } else if (Math.abs(this.sinlat0) < EPSLN) {
      // Eq
      // trace('stere:equateur');
      A = 2 * this.a * this.k0 / (1 + cosX * Math.cos(dlon));
      p.y = A * sinX;
    } else {
      // other case
      // trace('stere:normal case');
      A = 2 * this.a * this.k0 * this.ms1 / (this.cosX0 * (1 + this.sinX0 * sinX + this.cosX0 * cosX * Math.cos(dlon)));
      p.y = A * (this.cosX0 * sinX - this.sinX0 * cosX * Math.cos(dlon)) + this.y0;
    }
    p.x = A * cosX * Math.sin(dlon) + this.x0;
  }
  // trace(p.toString());
  return p;
}

//* Stereographic inverse equations--mapping x,y to lat/long
function stere_inverse(p) {
  p.x -= this.x0;
  p.y -= this.y0;
  var lon, lat, ts, ce, Chi;
  var rh = Math.sqrt(p.x * p.x + p.y * p.y);
  if (this.sphere) {
    var c = 2 * Math.atan(rh / (2 * this.a * this.k0));
    lon = this.long0;
    lat = this.lat0;
    if (rh <= EPSLN) {
      p.x = lon;
      p.y = lat;
      return p;
    }
    lat = Math.asin(Math.cos(c) * this.sinlat0 + p.y * Math.sin(c) * this.coslat0 / rh);
    if (Math.abs(this.coslat0) < EPSLN) {
      if (this.lat0 > 0) {
        lon = adjust_lon(this.long0 + Math.atan2(p.x, -1 * p.y));
      } else {
        lon = adjust_lon(this.long0 + Math.atan2(p.x, p.y));
      }
    } else {
      lon = adjust_lon(this.long0 + Math.atan2(p.x * Math.sin(c), rh * this.coslat0 * Math.cos(c) - p.y * this.sinlat0 * Math.sin(c)));
    }
    p.x = lon;
    p.y = lat;
    return p;
  } else {
    if (Math.abs(this.coslat0) <= EPSLN) {
      if (rh <= EPSLN) {
        lat = this.lat0;
        lon = this.long0;
        p.x = lon;
        p.y = lat;
        // trace(p.toString());
        return p;
      }
      p.x *= this.con;
      p.y *= this.con;
      ts = rh * this.cons / (2 * this.a * this.k0);
      lat = this.con * phi2z(this.e, ts);
      lon = this.con * adjust_lon(this.con * this.long0 + Math.atan2(p.x, -1 * p.y));
    } else {
      ce = 2 * Math.atan(rh * this.cosX0 / (2 * this.a * this.k0 * this.ms1));
      lon = this.long0;
      if (rh <= EPSLN) {
        Chi = this.X0;
      } else {
        Chi = Math.asin(Math.cos(ce) * this.sinX0 + p.y * Math.sin(ce) * this.cosX0 / rh);
        lon = adjust_lon(this.long0 + Math.atan2(p.x * Math.sin(ce), rh * this.cosX0 * Math.cos(ce) - p.y * this.sinX0 * Math.sin(ce)));
      }
      lat = -1 * phi2z(this.e, Math.tan(0.5 * (HALF_PI + Chi)));
    }
  }
  p.x = lon;
  p.y = lat;

  // trace(p.toString());
  return p;
}

var stere_names = ['stere', 'Stereographic_South_Pole', 'Polar_Stereographic_variant_A', 'Polar_Stereographic_variant_B', 'Polar_Stereographic'];
/* harmony default export */ const stere = ({
  init: stere_init,
  forward: stere_forward,
  inverse: stere_inverse,
  names: stere_names,
  ssfn_: ssfn_
});

;// ./node_modules/proj4/lib/projections/somerc.js
/*
  references:
    Formules et constantes pour le Calcul pour la
    projection cylindrique conforme à axe oblique et pour la transformation entre
    des systèmes de référence.
    http://www.swisstopo.admin.ch/internet/swisstopo/fr/home/topics/survey/sys/refsys/switzerland.parsysrelated1.31216.downloadList.77004.DownloadFile.tmp/swissprojectionfr.pdf
  */

/**
 * @typedef {Object} LocalThis
 * @property {number} lambda0
 * @property {number} e
 * @property {number} R
 * @property {number} b0
 * @property {number} K
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function somerc_init() {
  var phy0 = this.lat0;
  this.lambda0 = this.long0;
  var sinPhy0 = Math.sin(phy0);
  var semiMajorAxis = this.a;
  var invF = this.rf;
  var flattening = 1 / invF;
  var e2 = 2 * flattening - Math.pow(flattening, 2);
  var e = this.e = Math.sqrt(e2);
  this.R = this.k0 * semiMajorAxis * Math.sqrt(1 - e2) / (1 - e2 * Math.pow(sinPhy0, 2));
  this.alpha = Math.sqrt(1 + e2 / (1 - e2) * Math.pow(Math.cos(phy0), 4));
  this.b0 = Math.asin(sinPhy0 / this.alpha);
  var k1 = Math.log(Math.tan(Math.PI / 4 + this.b0 / 2));
  var k2 = Math.log(Math.tan(Math.PI / 4 + phy0 / 2));
  var k3 = Math.log((1 + e * sinPhy0) / (1 - e * sinPhy0));
  this.K = k1 - this.alpha * k2 + this.alpha * e / 2 * k3;
}

function somerc_forward(p) {
  var Sa1 = Math.log(Math.tan(Math.PI / 4 - p.y / 2));
  var Sa2 = this.e / 2 * Math.log((1 + this.e * Math.sin(p.y)) / (1 - this.e * Math.sin(p.y)));
  var S = -this.alpha * (Sa1 + Sa2) + this.K;

  // spheric latitude
  var b = 2 * (Math.atan(Math.exp(S)) - Math.PI / 4);

  // spheric longitude
  var I = this.alpha * (p.x - this.lambda0);

  // psoeudo equatorial rotation
  var rotI = Math.atan(Math.sin(I) / (Math.sin(this.b0) * Math.tan(b) + Math.cos(this.b0) * Math.cos(I)));

  var rotB = Math.asin(Math.cos(this.b0) * Math.sin(b) - Math.sin(this.b0) * Math.cos(b) * Math.cos(I));

  p.y = this.R / 2 * Math.log((1 + Math.sin(rotB)) / (1 - Math.sin(rotB))) + this.y0;
  p.x = this.R * rotI + this.x0;
  return p;
}

function somerc_inverse(p) {
  var Y = p.x - this.x0;
  var X = p.y - this.y0;

  var rotI = Y / this.R;
  var rotB = 2 * (Math.atan(Math.exp(X / this.R)) - Math.PI / 4);

  var b = Math.asin(Math.cos(this.b0) * Math.sin(rotB) + Math.sin(this.b0) * Math.cos(rotB) * Math.cos(rotI));
  var I = Math.atan(Math.sin(rotI) / (Math.cos(this.b0) * Math.cos(rotI) - Math.sin(this.b0) * Math.tan(rotB)));

  var lambda = this.lambda0 + I / this.alpha;

  var S = 0;
  var phy = b;
  var prevPhy = -1000;
  var iteration = 0;
  while (Math.abs(phy - prevPhy) > 0.0000001) {
    if (++iteration > 20) {
      // ...reportError("omercFwdInfinity");
      return;
    }
    // S = Math.log(Math.tan(Math.PI / 4 + phy / 2));
    S = 1 / this.alpha * (Math.log(Math.tan(Math.PI / 4 + b / 2)) - this.K) + this.e * Math.log(Math.tan(Math.PI / 4 + Math.asin(this.e * Math.sin(phy)) / 2));
    prevPhy = phy;
    phy = 2 * Math.atan(Math.exp(S)) - Math.PI / 2;
  }

  p.x = lambda;
  p.y = phy;
  return p;
}

var somerc_names = ['somerc'];
/* harmony default export */ const somerc = ({
  init: somerc_init,
  forward: somerc_forward,
  inverse: somerc_inverse,
  names: somerc_names
});

;// ./node_modules/proj4/lib/projections/omerc.js






/**
 * @typedef {Object} LocalThis
 * @property {boolean} no_off
 * @property {boolean} no_rot
 * @property {number} rectified_grid_angle
 * @property {number} es
 * @property {number} A
 * @property {number} B
 * @property {number} E
 * @property {number} e
 * @property {number} lam0
 * @property {number} singam
 * @property {number} cosgam
 * @property {number} sinrot
 * @property {number} cosrot
 * @property {number} rB
 * @property {number} ArB
 * @property {number} BrA
 * @property {number} u_0
 * @property {number} v_pole_n
 * @property {number} v_pole_s
 */

var TOL = 1e-7;

function isTypeA(P) {
  var typeAProjections = ['Hotine_Oblique_Mercator', 'Hotine_Oblique_Mercator_variant_A', 'Hotine_Oblique_Mercator_Azimuth_Natural_Origin'];
  var projectionName = typeof P.projName === 'object' ? Object.keys(P.projName)[0] : P.projName;

  return 'no_uoff' in P || 'no_off' in P || typeAProjections.indexOf(projectionName) !== -1 || typeAProjections.indexOf(getNormalizedProjName(projectionName)) !== -1;
}

/**
 * Initialize the Oblique Mercator  projection
 * @this {import('../defs.js').ProjectionDefinition & LocalThis}
 */
function omerc_init() {
  var con, com, cosph0, D, F, H, L, sinph0, p, J, gamma = 0,
    gamma0, lamc = 0, lam1 = 0, lam2 = 0, phi1 = 0, phi2 = 0, alpha_c = 0;

  // only Type A uses the no_off or no_uoff property
  // https://github.com/OSGeo/proj.4/issues/104
  this.no_off = isTypeA(this);
  this.no_rot = 'no_rot' in this;

  var alp = false;
  if ('alpha' in this) {
    alp = true;
  }

  var gam = false;
  if ('rectified_grid_angle' in this) {
    gam = true;
  }

  if (alp) {
    alpha_c = this.alpha;
  }

  if (gam) {
    gamma = this.rectified_grid_angle;
  }

  if (alp || gam) {
    lamc = this.longc;
  } else {
    lam1 = this.long1;
    phi1 = this.lat1;
    lam2 = this.long2;
    phi2 = this.lat2;

    if (Math.abs(phi1 - phi2) <= TOL || (con = Math.abs(phi1)) <= TOL
      || Math.abs(con - HALF_PI) <= TOL || Math.abs(Math.abs(this.lat0) - HALF_PI) <= TOL
      || Math.abs(Math.abs(phi2) - HALF_PI) <= TOL) {
      throw new Error();
    }
  }

  var one_es = 1.0 - this.es;
  com = Math.sqrt(one_es);

  if (Math.abs(this.lat0) > EPSLN) {
    sinph0 = Math.sin(this.lat0);
    cosph0 = Math.cos(this.lat0);
    con = 1 - this.es * sinph0 * sinph0;
    this.B = cosph0 * cosph0;
    this.B = Math.sqrt(1 + this.es * this.B * this.B / one_es);
    this.A = this.B * this.k0 * com / con;
    D = this.B * com / (cosph0 * Math.sqrt(con));
    F = D * D - 1;

    if (F <= 0) {
      F = 0;
    } else {
      F = Math.sqrt(F);
      if (this.lat0 < 0) {
        F = -F;
      }
    }

    this.E = F += D;
    this.E *= Math.pow(tsfnz(this.e, this.lat0, sinph0), this.B);
  } else {
    this.B = 1 / com;
    this.A = this.k0;
    this.E = D = F = 1;
  }

  if (alp || gam) {
    if (alp) {
      gamma0 = Math.asin(Math.sin(alpha_c) / D);
      if (!gam) {
        gamma = alpha_c;
      }
    } else {
      gamma0 = gamma;
      alpha_c = Math.asin(D * Math.sin(gamma0));
    }
    this.lam0 = lamc - Math.asin(0.5 * (F - 1 / F) * Math.tan(gamma0)) / this.B;
  } else {
    H = Math.pow(tsfnz(this.e, phi1, Math.sin(phi1)), this.B);
    L = Math.pow(tsfnz(this.e, phi2, Math.sin(phi2)), this.B);
    F = this.E / H;
    p = (L - H) / (L + H);
    J = this.E * this.E;
    J = (J - L * H) / (J + L * H);
    con = lam1 - lam2;

    if (con < -Math.PI) {
      lam2 -= TWO_PI;
    } else if (con > Math.PI) {
      lam2 += TWO_PI;
    }

    this.lam0 = adjust_lon(0.5 * (lam1 + lam2) - Math.atan(J * Math.tan(0.5 * this.B * (lam1 - lam2)) / p) / this.B);
    gamma0 = Math.atan(2 * Math.sin(this.B * adjust_lon(lam1 - this.lam0)) / (F - 1 / F));
    gamma = alpha_c = Math.asin(D * Math.sin(gamma0));
  }

  this.singam = Math.sin(gamma0);
  this.cosgam = Math.cos(gamma0);
  this.sinrot = Math.sin(gamma);
  this.cosrot = Math.cos(gamma);

  this.rB = 1 / this.B;
  this.ArB = this.A * this.rB;
  this.BrA = 1 / this.ArB;

  if (this.no_off) {
    this.u_0 = 0;
  } else {
    this.u_0 = Math.abs(this.ArB * Math.atan(Math.sqrt(D * D - 1) / Math.cos(alpha_c)));

    if (this.lat0 < 0) {
      this.u_0 = -this.u_0;
    }
  }

  F = 0.5 * gamma0;
  this.v_pole_n = this.ArB * Math.log(Math.tan(FORTPI - F));
  this.v_pole_s = this.ArB * Math.log(Math.tan(FORTPI + F));
}

/* Oblique Mercator forward equations--mapping lat,long to x,y
    ---------------------------------------------------------- */
function omerc_forward(p) {
  var coords = {};
  var S, T, U, V, W, temp, u, v;
  p.x = p.x - this.lam0;

  if (Math.abs(Math.abs(p.y) - HALF_PI) > EPSLN) {
    W = this.E / Math.pow(tsfnz(this.e, p.y, Math.sin(p.y)), this.B);

    temp = 1 / W;
    S = 0.5 * (W - temp);
    T = 0.5 * (W + temp);
    V = Math.sin(this.B * p.x);
    U = (S * this.singam - V * this.cosgam) / T;

    if (Math.abs(Math.abs(U) - 1.0) < EPSLN) {
      throw new Error();
    }

    v = 0.5 * this.ArB * Math.log((1 - U) / (1 + U));
    temp = Math.cos(this.B * p.x);

    if (Math.abs(temp) < TOL) {
      u = this.A * p.x;
    } else {
      u = this.ArB * Math.atan2((S * this.cosgam + V * this.singam), temp);
    }
  } else {
    v = p.y > 0 ? this.v_pole_n : this.v_pole_s;
    u = this.ArB * p.y;
  }

  if (this.no_rot) {
    coords.x = u;
    coords.y = v;
  } else {
    u -= this.u_0;
    coords.x = v * this.cosrot + u * this.sinrot;
    coords.y = u * this.cosrot - v * this.sinrot;
  }

  coords.x = (this.a * coords.x + this.x0);
  coords.y = (this.a * coords.y + this.y0);

  return coords;
}

function omerc_inverse(p) {
  var u, v, Qp, Sp, Tp, Vp, Up;
  var coords = {};

  p.x = (p.x - this.x0) * (1.0 / this.a);
  p.y = (p.y - this.y0) * (1.0 / this.a);

  if (this.no_rot) {
    v = p.y;
    u = p.x;
  } else {
    v = p.x * this.cosrot - p.y * this.sinrot;
    u = p.y * this.cosrot + p.x * this.sinrot + this.u_0;
  }

  Qp = Math.exp(-this.BrA * v);
  Sp = 0.5 * (Qp - 1 / Qp);
  Tp = 0.5 * (Qp + 1 / Qp);
  Vp = Math.sin(this.BrA * u);
  Up = (Vp * this.cosgam + Sp * this.singam) / Tp;

  if (Math.abs(Math.abs(Up) - 1) < EPSLN) {
    coords.x = 0;
    coords.y = Up < 0 ? -HALF_PI : HALF_PI;
  } else {
    coords.y = this.E / Math.sqrt((1 + Up) / (1 - Up));
    coords.y = phi2z(this.e, Math.pow(coords.y, 1 / this.B));

    if (coords.y === Infinity) {
      throw new Error();
    }

    coords.x = -this.rB * Math.atan2((Sp * this.cosgam - Vp * this.singam), Math.cos(this.BrA * u));
  }

  coords.x += this.lam0;

  return coords;
}

var omerc_names = ['Hotine_Oblique_Mercator', 'Hotine Oblique Mercator', 'Hotine_Oblique_Mercator_variant_A', 'Hotine_Oblique_Mercator_Variant_B', 'Hotine_Oblique_Mercator_Azimuth_Natural_Origin', 'Hotine_Oblique_Mercator_Two_Point_Natural_Origin', 'Hotine_Oblique_Mercator_Azimuth_Center', 'Oblique_Mercator', 'omerc'];
/* harmony default export */ const omerc = ({
  init: omerc_init,
  forward: omerc_forward,
  inverse: omerc_inverse,
  names: omerc_names
});

;// ./node_modules/proj4/lib/projections/lcc.js







/**
 * @typedef {Object} LocalThis
 * @property {number} e
 * @property {number} ns
 * @property {number} f0
 * @property {number} rh
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function lcc_init() {
  // double lat0;                    /* the reference latitude               */
  // double long0;                   /* the reference longitude              */
  // double lat1;                    /* first standard parallel              */
  // double lat2;                    /* second standard parallel             */
  // double r_maj;                   /* major axis                           */
  // double r_min;                   /* minor axis                           */
  // double false_east;              /* x offset in meters                   */
  // double false_north;             /* y offset in meters                   */

  // the above value can be set with proj4.defs
  // example: proj4.defs("EPSG:2154","+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

  if (!this.lat2) {
    this.lat2 = this.lat1;
  } // if lat2 is not defined
  if (!this.k0) {
    this.k0 = 1;
  }
  this.x0 = this.x0 || 0;
  this.y0 = this.y0 || 0;
  // Standard Parallels cannot be equal and on opposite sides of the equator
  if (Math.abs(this.lat1 + this.lat2) < EPSLN) {
    return;
  }

  var temp = this.b / this.a;
  this.e = Math.sqrt(1 - temp * temp);

  var sin1 = Math.sin(this.lat1);
  var cos1 = Math.cos(this.lat1);
  var ms1 = msfnz(this.e, sin1, cos1);
  var ts1 = tsfnz(this.e, this.lat1, sin1);

  var sin2 = Math.sin(this.lat2);
  var cos2 = Math.cos(this.lat2);
  var ms2 = msfnz(this.e, sin2, cos2);
  var ts2 = tsfnz(this.e, this.lat2, sin2);

  var ts0 = Math.abs(Math.abs(this.lat0) - HALF_PI) < EPSLN
    ? 0 // Handle poles by setting ts0 to 0
    : tsfnz(this.e, this.lat0, Math.sin(this.lat0));

  if (Math.abs(this.lat1 - this.lat2) > EPSLN) {
    this.ns = Math.log(ms1 / ms2) / Math.log(ts1 / ts2);
  } else {
    this.ns = sin1;
  }
  if (isNaN(this.ns)) {
    this.ns = sin1;
  }
  this.f0 = ms1 / (this.ns * Math.pow(ts1, this.ns));
  this.rh = this.a * this.f0 * Math.pow(ts0, this.ns);
  if (!this.title) {
    this.title = 'Lambert Conformal Conic';
  }
}

// Lambert Conformal conic forward equations--mapping lat,long to x,y
// -----------------------------------------------------------------
function lcc_forward(p) {
  var lon = p.x;
  var lat = p.y;

  // singular cases :
  if (Math.abs(2 * Math.abs(lat) - Math.PI) <= EPSLN) {
    lat = sign(lat) * (HALF_PI - 2 * EPSLN);
  }

  var con = Math.abs(Math.abs(lat) - HALF_PI);
  var ts, rh1;
  if (con > EPSLN) {
    ts = tsfnz(this.e, lat, Math.sin(lat));
    rh1 = this.a * this.f0 * Math.pow(ts, this.ns);
  } else {
    con = lat * this.ns;
    if (con <= 0) {
      return null;
    }
    rh1 = 0;
  }
  var theta = this.ns * adjust_lon(lon - this.long0);
  p.x = this.k0 * (rh1 * Math.sin(theta)) + this.x0;
  p.y = this.k0 * (this.rh - rh1 * Math.cos(theta)) + this.y0;

  return p;
}

// Lambert Conformal Conic inverse equations--mapping x,y to lat/long
// -----------------------------------------------------------------
function lcc_inverse(p) {
  var rh1, con, ts;
  var lat, lon;
  var x = (p.x - this.x0) / this.k0;
  var y = (this.rh - (p.y - this.y0) / this.k0);
  if (this.ns > 0) {
    rh1 = Math.sqrt(x * x + y * y);
    con = 1;
  } else {
    rh1 = -Math.sqrt(x * x + y * y);
    con = -1;
  }
  var theta = 0;
  if (rh1 !== 0) {
    theta = Math.atan2((con * x), (con * y));
  }
  if ((rh1 !== 0) || (this.ns > 0)) {
    con = 1 / this.ns;
    ts = Math.pow((rh1 / (this.a * this.f0)), con);
    lat = phi2z(this.e, ts);
    if (lat === -9999) {
      return null;
    }
  } else {
    lat = -HALF_PI;
  }
  lon = adjust_lon(theta / this.ns + this.long0);

  p.x = lon;
  p.y = lat;
  return p;
}

var lcc_names = [
  'Lambert Tangential Conformal Conic Projection',
  'Lambert_Conformal_Conic',
  'Lambert_Conformal_Conic_1SP',
  'Lambert_Conformal_Conic_2SP',
  'lcc',
  'Lambert Conic Conformal (1SP)',
  'Lambert Conic Conformal (2SP)'
];

/* harmony default export */ const lcc = ({
  init: lcc_init,
  forward: lcc_forward,
  inverse: lcc_inverse,
  names: lcc_names
});

;// ./node_modules/proj4/lib/projections/krovak.js


function krovak_init() {
  this.a = 6377397.155;
  this.es = 0.006674372230614;
  this.e = Math.sqrt(this.es);
  if (!this.lat0) {
    this.lat0 = 0.863937979737193;
  }
  if (!this.long0) {
    this.long0 = 0.7417649320975901 - 0.308341501185665;
  }
  /* if scale not set default to 0.9999 */
  if (!this.k0) {
    this.k0 = 0.9999;
  }
  this.s45 = 0.785398163397448; /* 45 */
  this.s90 = 2 * this.s45;
  this.fi0 = this.lat0;
  this.e2 = this.es;
  this.e = Math.sqrt(this.e2);
  this.alfa = Math.sqrt(1 + (this.e2 * Math.pow(Math.cos(this.fi0), 4)) / (1 - this.e2));
  this.uq = 1.04216856380474;
  this.u0 = Math.asin(Math.sin(this.fi0) / this.alfa);
  this.g = Math.pow((1 + this.e * Math.sin(this.fi0)) / (1 - this.e * Math.sin(this.fi0)), this.alfa * this.e / 2);
  this.k = Math.tan(this.u0 / 2 + this.s45) / Math.pow(Math.tan(this.fi0 / 2 + this.s45), this.alfa) * this.g;
  this.k1 = this.k0;
  this.n0 = this.a * Math.sqrt(1 - this.e2) / (1 - this.e2 * Math.pow(Math.sin(this.fi0), 2));
  this.s0 = 1.37008346281555;
  this.n = Math.sin(this.s0);
  this.ro0 = this.k1 * this.n0 / Math.tan(this.s0);
  this.ad = this.s90 - this.uq;
}

/* ellipsoid */
/* calculate xy from lat/lon */
/* Constants, identical to inverse transform function */
function krovak_forward(p) {
  var gfi, u, deltav, s, d, eps, ro;
  var lon = p.x;
  var lat = p.y;
  var delta_lon = adjust_lon(lon - this.long0);
  /* Transformation */
  gfi = Math.pow(((1 + this.e * Math.sin(lat)) / (1 - this.e * Math.sin(lat))), (this.alfa * this.e / 2));
  u = 2 * (Math.atan(this.k * Math.pow(Math.tan(lat / 2 + this.s45), this.alfa) / gfi) - this.s45);
  deltav = -delta_lon * this.alfa;
  s = Math.asin(Math.cos(this.ad) * Math.sin(u) + Math.sin(this.ad) * Math.cos(u) * Math.cos(deltav));
  d = Math.asin(Math.cos(u) * Math.sin(deltav) / Math.cos(s));
  eps = this.n * d;
  ro = this.ro0 * Math.pow(Math.tan(this.s0 / 2 + this.s45), this.n) / Math.pow(Math.tan(s / 2 + this.s45), this.n);
  p.y = ro * Math.cos(eps) / 1;
  p.x = ro * Math.sin(eps) / 1;

  if (!this.czech) {
    p.y *= -1;
    p.x *= -1;
  }
  return (p);
}

/* calculate lat/lon from xy */
function krovak_inverse(p) {
  var u, deltav, s, d, eps, ro, fi1;
  var ok;

  /* Transformation */
  /* revert y, x */
  var tmp = p.x;
  p.x = p.y;
  p.y = tmp;
  if (!this.czech) {
    p.y *= -1;
    p.x *= -1;
  }
  ro = Math.sqrt(p.x * p.x + p.y * p.y);
  eps = Math.atan2(p.y, p.x);
  d = eps / Math.sin(this.s0);
  s = 2 * (Math.atan(Math.pow(this.ro0 / ro, 1 / this.n) * Math.tan(this.s0 / 2 + this.s45)) - this.s45);
  u = Math.asin(Math.cos(this.ad) * Math.sin(s) - Math.sin(this.ad) * Math.cos(s) * Math.cos(d));
  deltav = Math.asin(Math.cos(s) * Math.sin(d) / Math.cos(u));
  p.x = this.long0 - deltav / this.alfa;
  fi1 = u;
  ok = 0;
  var iter = 0;
  do {
    p.y = 2 * (Math.atan(Math.pow(this.k, -1 / this.alfa) * Math.pow(Math.tan(u / 2 + this.s45), 1 / this.alfa) * Math.pow((1 + this.e * Math.sin(fi1)) / (1 - this.e * Math.sin(fi1)), this.e / 2)) - this.s45);
    if (Math.abs(fi1 - p.y) < 0.0000000001) {
      ok = 1;
    }
    fi1 = p.y;
    iter += 1;
  } while (ok === 0 && iter < 15);
  if (iter >= 15) {
    return null;
  }

  return (p);
}

var krovak_names = ['Krovak', 'krovak'];
/* harmony default export */ const krovak = ({
  init: krovak_init,
  forward: krovak_forward,
  inverse: krovak_inverse,
  names: krovak_names
});

;// ./node_modules/proj4/lib/common/mlfn.js
/* harmony default export */ function mlfn(e0, e1, e2, e3, phi) {
  return (e0 * phi - e1 * Math.sin(2 * phi) + e2 * Math.sin(4 * phi) - e3 * Math.sin(6 * phi));
}

;// ./node_modules/proj4/lib/common/e0fn.js
/* harmony default export */ function e0fn(x) {
  return (1 - 0.25 * x * (1 + x / 16 * (3 + 1.25 * x)));
}

;// ./node_modules/proj4/lib/common/e1fn.js
/* harmony default export */ function e1fn(x) {
  return (0.375 * x * (1 + 0.25 * x * (1 + 0.46875 * x)));
}

;// ./node_modules/proj4/lib/common/e2fn.js
/* harmony default export */ function e2fn(x) {
  return (0.05859375 * x * x * (1 + 0.75 * x));
}

;// ./node_modules/proj4/lib/common/e3fn.js
/* harmony default export */ function e3fn(x) {
  return (x * x * x * (35 / 3072));
}

;// ./node_modules/proj4/lib/common/gN.js
/* harmony default export */ function gN(a, e, sinphi) {
  var temp = e * sinphi;
  return a / Math.sqrt(1 - temp * temp);
}

;// ./node_modules/proj4/lib/common/adjust_lat.js



/* harmony default export */ function adjust_lat(x) {
  return (Math.abs(x) < HALF_PI) ? x : (x - (sign(x) * Math.PI));
}

;// ./node_modules/proj4/lib/common/imlfn.js
/* harmony default export */ function imlfn(ml, e0, e1, e2, e3) {
  var phi;
  var dphi;

  phi = ml / e0;
  for (var i = 0; i < 15; i++) {
    dphi = (ml - (e0 * phi - e1 * Math.sin(2 * phi) + e2 * Math.sin(4 * phi) - e3 * Math.sin(6 * phi))) / (e0 - 2 * e1 * Math.cos(2 * phi) + 4 * e2 * Math.cos(4 * phi) - 6 * e3 * Math.cos(6 * phi));
    phi += dphi;
    if (Math.abs(dphi) <= 0.0000000001) {
      return phi;
    }
  }

  // ..reportError("IMLFN-CONV:Latitude failed to converge after 15 iterations");
  return NaN;
}

;// ./node_modules/proj4/lib/projections/cass.js











/**
 * @typedef {Object} LocalThis
 * @property {number} es
 * @property {number} e0
 * @property {number} e1
 * @property {number} e2
 * @property {number} e3
 * @property {number} ml0
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function cass_init() {
  if (!this.sphere) {
    this.e0 = e0fn(this.es);
    this.e1 = e1fn(this.es);
    this.e2 = e2fn(this.es);
    this.e3 = e3fn(this.es);
    this.ml0 = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, this.lat0);
  }
}

/* Cassini forward equations--mapping lat,long to x,y
  ----------------------------------------------------------------------- */
function cass_forward(p) {
  /* Forward equations
      ----------------- */
  var x, y;
  var lam = p.x;
  var phi = p.y;
  lam = adjust_lon(lam - this.long0);

  if (this.sphere) {
    x = this.a * Math.asin(Math.cos(phi) * Math.sin(lam));
    y = this.a * (Math.atan2(Math.tan(phi), Math.cos(lam)) - this.lat0);
  } else {
    // ellipsoid
    var sinphi = Math.sin(phi);
    var cosphi = Math.cos(phi);
    var nl = gN(this.a, this.e, sinphi);
    var tl = Math.tan(phi) * Math.tan(phi);
    var al = lam * Math.cos(phi);
    var asq = al * al;
    var cl = this.es * cosphi * cosphi / (1 - this.es);
    var ml = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, phi);

    x = nl * al * (1 - asq * tl * (1 / 6 - (8 - tl + 8 * cl) * asq / 120));
    y = ml - this.ml0 + nl * sinphi / cosphi * asq * (0.5 + (5 - tl + 6 * cl) * asq / 24);
  }

  p.x = x + this.x0;
  p.y = y + this.y0;
  return p;
}

/* Inverse equations
  ----------------- */
function cass_inverse(p) {
  p.x -= this.x0;
  p.y -= this.y0;
  var x = p.x / this.a;
  var y = p.y / this.a;
  var phi, lam;

  if (this.sphere) {
    var dd = y + this.lat0;
    phi = Math.asin(Math.sin(dd) * Math.cos(x));
    lam = Math.atan2(Math.tan(x), Math.cos(dd));
  } else {
    /* ellipsoid */
    var ml1 = this.ml0 / this.a + y;
    var phi1 = imlfn(ml1, this.e0, this.e1, this.e2, this.e3);
    if (Math.abs(Math.abs(phi1) - HALF_PI) <= EPSLN) {
      p.x = this.long0;
      p.y = HALF_PI;
      if (y < 0) {
        p.y *= -1;
      }
      return p;
    }
    var nl1 = gN(this.a, this.e, Math.sin(phi1));

    var rl1 = nl1 * nl1 * nl1 / this.a / this.a * (1 - this.es);
    var tl1 = Math.pow(Math.tan(phi1), 2);
    var dl = x * this.a / nl1;
    var dsq = dl * dl;
    phi = phi1 - nl1 * Math.tan(phi1) / rl1 * dl * dl * (0.5 - (1 + 3 * tl1) * dl * dl / 24);
    lam = dl * (1 - dsq * (tl1 / 3 + (1 + 3 * tl1) * tl1 * dsq / 15)) / Math.cos(phi1);
  }

  p.x = adjust_lon(lam + this.long0);
  p.y = adjust_lat(phi);
  return p;
}

var cass_names = ['Cassini', 'Cassini_Soldner', 'cass'];
/* harmony default export */ const cass = ({
  init: cass_init,
  forward: cass_forward,
  inverse: cass_inverse,
  names: cass_names
});

;// ./node_modules/proj4/lib/common/qsfnz.js
/* harmony default export */ function qsfnz(eccent, sinphi) {
  var con;
  if (eccent > 1.0e-7) {
    con = eccent * sinphi;
    return ((1 - eccent * eccent) * (sinphi / (1 - con * con) - (0.5 / eccent) * Math.log((1 - con) / (1 + con))));
  } else {
    return (2 * sinphi);
  }
}

;// ./node_modules/proj4/lib/projections/laea.js





/**
 * @typedef {Object} LocalThis
 * @property {number} mode
 * @property {Array<number>} apa
 * @property {number} dd
 * @property {number} e
 * @property {number} es
 * @property {number} mmf
 * @property {number} rq
 * @property {number} qp
 * @property {number} sinb1
 * @property {number} cosb1
 * @property {number} ymf
 * @property {number} xmf
 * @property {number} sinph0
 * @property {number} cosph0
 */

/*
  reference
    "New Equal-Area Map Projections for Noncircular Regions", John P. Snyder,
    The American Cartographer, Vol 15, No. 4, October 1988, pp. 341-355.
  */

var S_POLE = 1;
var N_POLE = 2;
var EQUIT = 3;
var OBLIQ = 4;

/**
 * Initialize the Lambert Azimuthal Equal Area projection
 * @this {import('../defs.js').ProjectionDefinition & LocalThis}
 */
function laea_init() {
  var t = Math.abs(this.lat0);
  if (Math.abs(t - HALF_PI) < EPSLN) {
    this.mode = this.lat0 < 0 ? S_POLE : N_POLE;
  } else if (Math.abs(t) < EPSLN) {
    this.mode = EQUIT;
  } else {
    this.mode = OBLIQ;
  }
  if (this.es > 0) {
    var sinphi;

    this.qp = qsfnz(this.e, 1);
    this.mmf = 0.5 / (1 - this.es);
    this.apa = authset(this.es);
    switch (this.mode) {
      case N_POLE:
        this.dd = 1;
        break;
      case S_POLE:
        this.dd = 1;
        break;
      case EQUIT:
        this.rq = Math.sqrt(0.5 * this.qp);
        this.dd = 1 / this.rq;
        this.xmf = 1;
        this.ymf = 0.5 * this.qp;
        break;
      case OBLIQ:
        this.rq = Math.sqrt(0.5 * this.qp);
        sinphi = Math.sin(this.lat0);
        this.sinb1 = qsfnz(this.e, sinphi) / this.qp;
        this.cosb1 = Math.sqrt(1 - this.sinb1 * this.sinb1);
        this.dd = Math.cos(this.lat0) / (Math.sqrt(1 - this.es * sinphi * sinphi) * this.rq * this.cosb1);
        this.ymf = (this.xmf = this.rq) / this.dd;
        this.xmf *= this.dd;
        break;
    }
  } else {
    if (this.mode === OBLIQ) {
      this.sinph0 = Math.sin(this.lat0);
      this.cosph0 = Math.cos(this.lat0);
    }
  }
}

/* Lambert Azimuthal Equal Area forward equations--mapping lat,long to x,y
  ----------------------------------------------------------------------- */
function laea_forward(p) {
  /* Forward equations
      ----------------- */
  var x, y, coslam, sinlam, sinphi, q, sinb, cosb, b, cosphi;
  var lam = p.x;
  var phi = p.y;

  lam = adjust_lon(lam - this.long0);
  if (this.sphere) {
    sinphi = Math.sin(phi);
    cosphi = Math.cos(phi);
    coslam = Math.cos(lam);
    if (this.mode === this.OBLIQ || this.mode === this.EQUIT) {
      y = (this.mode === this.EQUIT) ? 1 + cosphi * coslam : 1 + this.sinph0 * sinphi + this.cosph0 * cosphi * coslam;
      if (y <= EPSLN) {
        return null;
      }
      y = Math.sqrt(2 / y);
      x = y * cosphi * Math.sin(lam);
      y *= (this.mode === this.EQUIT) ? sinphi : this.cosph0 * sinphi - this.sinph0 * cosphi * coslam;
    } else if (this.mode === this.N_POLE || this.mode === this.S_POLE) {
      if (this.mode === this.N_POLE) {
        coslam = -coslam;
      }
      if (Math.abs(phi + this.lat0) < EPSLN) {
        return null;
      }
      y = FORTPI - phi * 0.5;
      y = 2 * ((this.mode === this.S_POLE) ? Math.cos(y) : Math.sin(y));
      x = y * Math.sin(lam);
      y *= coslam;
    }
  } else {
    sinb = 0;
    cosb = 0;
    b = 0;
    coslam = Math.cos(lam);
    sinlam = Math.sin(lam);
    sinphi = Math.sin(phi);
    q = qsfnz(this.e, sinphi);
    if (this.mode === this.OBLIQ || this.mode === this.EQUIT) {
      sinb = q / this.qp;
      cosb = Math.sqrt(1 - sinb * sinb);
    }
    switch (this.mode) {
      case this.OBLIQ:
        b = 1 + this.sinb1 * sinb + this.cosb1 * cosb * coslam;
        break;
      case this.EQUIT:
        b = 1 + cosb * coslam;
        break;
      case this.N_POLE:
        b = HALF_PI + phi;
        q = this.qp - q;
        break;
      case this.S_POLE:
        b = phi - HALF_PI;
        q = this.qp + q;
        break;
    }
    if (Math.abs(b) < EPSLN) {
      return null;
    }
    switch (this.mode) {
      case this.OBLIQ:
      case this.EQUIT:
        b = Math.sqrt(2 / b);
        if (this.mode === this.OBLIQ) {
          y = this.ymf * b * (this.cosb1 * sinb - this.sinb1 * cosb * coslam);
        } else {
          y = (b = Math.sqrt(2 / (1 + cosb * coslam))) * sinb * this.ymf;
        }
        x = this.xmf * b * cosb * sinlam;
        break;
      case this.N_POLE:
      case this.S_POLE:
        if (q >= 0) {
          x = (b = Math.sqrt(q)) * sinlam;
          y = coslam * ((this.mode === this.S_POLE) ? b : -b);
        } else {
          x = y = 0;
        }
        break;
    }
  }

  p.x = this.a * x + this.x0;
  p.y = this.a * y + this.y0;
  return p;
}

/* Inverse equations
  ----------------- */
function laea_inverse(p) {
  p.x -= this.x0;
  p.y -= this.y0;
  var x = p.x / this.a;
  var y = p.y / this.a;
  var lam, phi, cCe, sCe, q, rho, ab;
  if (this.sphere) {
    var cosz = 0,
      rh, sinz = 0;

    rh = Math.sqrt(x * x + y * y);
    phi = rh * 0.5;
    if (phi > 1) {
      return null;
    }
    phi = 2 * Math.asin(phi);
    if (this.mode === this.OBLIQ || this.mode === this.EQUIT) {
      sinz = Math.sin(phi);
      cosz = Math.cos(phi);
    }
    switch (this.mode) {
      case this.EQUIT:
        phi = (Math.abs(rh) <= EPSLN) ? 0 : Math.asin(y * sinz / rh);
        x *= sinz;
        y = cosz * rh;
        break;
      case this.OBLIQ:
        phi = (Math.abs(rh) <= EPSLN) ? this.lat0 : Math.asin(cosz * this.sinph0 + y * sinz * this.cosph0 / rh);
        x *= sinz * this.cosph0;
        y = (cosz - Math.sin(phi) * this.sinph0) * rh;
        break;
      case this.N_POLE:
        y = -y;
        phi = HALF_PI - phi;
        break;
      case this.S_POLE:
        phi -= HALF_PI;
        break;
    }
    lam = (y === 0 && (this.mode === this.EQUIT || this.mode === this.OBLIQ)) ? 0 : Math.atan2(x, y);
  } else {
    ab = 0;
    if (this.mode === this.OBLIQ || this.mode === this.EQUIT) {
      x /= this.dd;
      y *= this.dd;
      rho = Math.sqrt(x * x + y * y);
      if (rho < EPSLN) {
        p.x = this.long0;
        p.y = this.lat0;
        return p;
      }
      sCe = 2 * Math.asin(0.5 * rho / this.rq);
      cCe = Math.cos(sCe);
      x *= (sCe = Math.sin(sCe));
      if (this.mode === this.OBLIQ) {
        ab = cCe * this.sinb1 + y * sCe * this.cosb1 / rho;
        q = this.qp * ab;
        y = rho * this.cosb1 * cCe - y * this.sinb1 * sCe;
      } else {
        ab = y * sCe / rho;
        q = this.qp * ab;
        y = rho * cCe;
      }
    } else if (this.mode === this.N_POLE || this.mode === this.S_POLE) {
      if (this.mode === this.N_POLE) {
        y = -y;
      }
      q = (x * x + y * y);
      if (!q) {
        p.x = this.long0;
        p.y = this.lat0;
        return p;
      }
      ab = 1 - q / this.qp;
      if (this.mode === this.S_POLE) {
        ab = -ab;
      }
    }
    lam = Math.atan2(x, y);
    phi = authlat(Math.asin(ab), this.apa);
  }

  p.x = adjust_lon(this.long0 + lam);
  p.y = phi;
  return p;
}

/* determine latitude from authalic latitude */
var P00 = 0.33333333333333333333;

var P01 = 0.17222222222222222222;
var P02 = 0.10257936507936507936;
var P10 = 0.06388888888888888888;
var P11 = 0.06640211640211640211;
var P20 = 0.01641501294219154443;

function authset(es) {
  var t;
  var APA = [];
  APA[0] = es * P00;
  t = es * es;
  APA[0] += t * P01;
  APA[1] = t * P10;
  t *= es;
  APA[0] += t * P02;
  APA[1] += t * P11;
  APA[2] = t * P20;
  return APA;
}

function authlat(beta, APA) {
  var t = beta + beta;
  return (beta + APA[0] * Math.sin(t) + APA[1] * Math.sin(t + t) + APA[2] * Math.sin(t + t + t));
}

var laea_names = ['Lambert Azimuthal Equal Area', 'Lambert_Azimuthal_Equal_Area', 'laea'];
/* harmony default export */ const laea = ({
  init: laea_init,
  forward: laea_forward,
  inverse: laea_inverse,
  names: laea_names,
  S_POLE: S_POLE,
  N_POLE: N_POLE,
  EQUIT: EQUIT,
  OBLIQ: OBLIQ
});

;// ./node_modules/proj4/lib/common/asinz.js
/* harmony default export */ function asinz(x) {
  if (Math.abs(x) > 1) {
    x = (x > 1) ? 1 : -1;
  }
  return Math.asin(x);
}

;// ./node_modules/proj4/lib/projections/aea.js






/**
 * @typedef {Object} LocalThis
 * @property {number} temp
 * @property {number} es
 * @property {number} e3
 * @property {number} sin_po
 * @property {number} cos_po
 * @property {number} t1
 * @property {number} con
 * @property {number} ms1
 * @property {number} qs1
 * @property {number} t2
 * @property {number} ms2
 * @property {number} qs2
 * @property {number} t3
 * @property {number} qs0
 * @property {number} ns0
 * @property {number} c
 * @property {number} rh
 * @property {number} sin_phi
 * @property {number} cos_phi
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function aea_init() {
  if (Math.abs(this.lat1 + this.lat2) < EPSLN) {
    return;
  }
  this.temp = this.b / this.a;
  this.es = 1 - Math.pow(this.temp, 2);
  this.e3 = Math.sqrt(this.es);

  this.sin_po = Math.sin(this.lat1);
  this.cos_po = Math.cos(this.lat1);
  this.t1 = this.sin_po;
  this.con = this.sin_po;
  this.ms1 = msfnz(this.e3, this.sin_po, this.cos_po);
  this.qs1 = qsfnz(this.e3, this.sin_po);

  this.sin_po = Math.sin(this.lat2);
  this.cos_po = Math.cos(this.lat2);
  this.t2 = this.sin_po;
  this.ms2 = msfnz(this.e3, this.sin_po, this.cos_po);
  this.qs2 = qsfnz(this.e3, this.sin_po);

  this.sin_po = Math.sin(this.lat0);
  this.cos_po = Math.cos(this.lat0);
  this.t3 = this.sin_po;
  this.qs0 = qsfnz(this.e3, this.sin_po);

  if (Math.abs(this.lat1 - this.lat2) > EPSLN) {
    this.ns0 = (this.ms1 * this.ms1 - this.ms2 * this.ms2) / (this.qs2 - this.qs1);
  } else {
    this.ns0 = this.con;
  }
  this.c = this.ms1 * this.ms1 + this.ns0 * this.qs1;
  this.rh = this.a * Math.sqrt(this.c - this.ns0 * this.qs0) / this.ns0;
}

/* Albers Conical Equal Area forward equations--mapping lat,long to x,y
  ------------------------------------------------------------------- */
/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function aea_forward(p) {
  var lon = p.x;
  var lat = p.y;

  this.sin_phi = Math.sin(lat);
  this.cos_phi = Math.cos(lat);

  var qs = qsfnz(this.e3, this.sin_phi);
  var rh1 = this.a * Math.sqrt(this.c - this.ns0 * qs) / this.ns0;
  var theta = this.ns0 * adjust_lon(lon - this.long0);
  var x = rh1 * Math.sin(theta) + this.x0;
  var y = this.rh - rh1 * Math.cos(theta) + this.y0;

  p.x = x;
  p.y = y;
  return p;
}

function aea_inverse(p) {
  var rh1, qs, con, theta, lon, lat;

  p.x -= this.x0;
  p.y = this.rh - p.y + this.y0;
  if (this.ns0 >= 0) {
    rh1 = Math.sqrt(p.x * p.x + p.y * p.y);
    con = 1;
  } else {
    rh1 = -Math.sqrt(p.x * p.x + p.y * p.y);
    con = -1;
  }
  theta = 0;
  if (rh1 !== 0) {
    theta = Math.atan2(con * p.x, con * p.y);
  }
  con = rh1 * this.ns0 / this.a;
  if (this.sphere) {
    lat = Math.asin((this.c - con * con) / (2 * this.ns0));
  } else {
    qs = (this.c - con * con) / this.ns0;
    lat = this.phi1z(this.e3, qs);
  }

  lon = adjust_lon(theta / this.ns0 + this.long0);
  p.x = lon;
  p.y = lat;
  return p;
}

/* Function to compute phi1, the latitude for the inverse of the
   Albers Conical Equal-Area projection.
------------------------------------------- */
function phi1z(eccent, qs) {
  var sinphi, cosphi, con, com, dphi;
  var phi = asinz(0.5 * qs);
  if (eccent < EPSLN) {
    return phi;
  }

  var eccnts = eccent * eccent;
  for (var i = 1; i <= 25; i++) {
    sinphi = Math.sin(phi);
    cosphi = Math.cos(phi);
    con = eccent * sinphi;
    com = 1 - con * con;
    dphi = 0.5 * com * com / cosphi * (qs / (1 - eccnts) - sinphi / com + 0.5 / eccent * Math.log((1 - con) / (1 + con)));
    phi = phi + dphi;
    if (Math.abs(dphi) <= 1e-7) {
      return phi;
    }
  }
  return null;
}

var aea_names = ['Albers_Conic_Equal_Area', 'Albers_Equal_Area', 'Albers', 'aea'];
/* harmony default export */ const aea = ({
  init: aea_init,
  forward: aea_forward,
  inverse: aea_inverse,
  names: aea_names,
  phi1z: phi1z
});

;// ./node_modules/proj4/lib/projections/gnom.js




/**
 * @typedef {Object} LocalThis
 * @property {number} sin_p14
 * @property {number} cos_p14
 * @property {number} infinity_dist
 * @property {number} rc
 */

/**
  reference:
    Wolfram Mathworld "Gnomonic Projection"
    http://mathworld.wolfram.com/GnomonicProjection.html
    Accessed: 12th November 2009
   @this {import('../defs.js').ProjectionDefinition & LocalThis}
 */
function gnom_init() {
  /* Place parameters in static storage for common use
      ------------------------------------------------- */
  this.sin_p14 = Math.sin(this.lat0);
  this.cos_p14 = Math.cos(this.lat0);
  // Approximation for projecting points to the horizon (infinity)
  this.infinity_dist = 1000 * this.a;
  this.rc = 1;
}

/* Gnomonic forward equations--mapping lat,long to x,y
    --------------------------------------------------- */
function gnom_forward(p) {
  var sinphi, cosphi; /* sin and cos value        */
  var dlon; /* delta longitude value      */
  var coslon; /* cos of longitude        */
  var ksp; /* scale factor          */
  var g;
  var x, y;
  var lon = p.x;
  var lat = p.y;
  /* Forward equations
      ----------------- */
  dlon = adjust_lon(lon - this.long0);

  sinphi = Math.sin(lat);
  cosphi = Math.cos(lat);

  coslon = Math.cos(dlon);
  g = this.sin_p14 * sinphi + this.cos_p14 * cosphi * coslon;
  ksp = 1;
  if ((g > 0) || (Math.abs(g) <= EPSLN)) {
    x = this.x0 + this.a * ksp * cosphi * Math.sin(dlon) / g;
    y = this.y0 + this.a * ksp * (this.cos_p14 * sinphi - this.sin_p14 * cosphi * coslon) / g;
  } else {
    // Point is in the opposing hemisphere and is unprojectable
    // We still need to return a reasonable point, so we project
    // to infinity, on a bearing
    // equivalent to the northern hemisphere equivalent
    // This is a reasonable approximation for short shapes and lines that
    // straddle the horizon.

    x = this.x0 + this.infinity_dist * cosphi * Math.sin(dlon);
    y = this.y0 + this.infinity_dist * (this.cos_p14 * sinphi - this.sin_p14 * cosphi * coslon);
  }
  p.x = x;
  p.y = y;
  return p;
}

function gnom_inverse(p) {
  var rh; /* Rho */
  var sinc, cosc;
  var c;
  var lon, lat;

  /* Inverse equations
      ----------------- */
  p.x = (p.x - this.x0) / this.a;
  p.y = (p.y - this.y0) / this.a;

  p.x /= this.k0;
  p.y /= this.k0;

  if ((rh = Math.sqrt(p.x * p.x + p.y * p.y))) {
    c = Math.atan2(rh, this.rc);
    sinc = Math.sin(c);
    cosc = Math.cos(c);

    lat = asinz(cosc * this.sin_p14 + (p.y * sinc * this.cos_p14) / rh);
    lon = Math.atan2(p.x * sinc, rh * this.cos_p14 * cosc - p.y * this.sin_p14 * sinc);
    lon = adjust_lon(this.long0 + lon);
  } else {
    lat = this.phic0;
    lon = 0;
  }

  p.x = lon;
  p.y = lat;
  return p;
}

var gnom_names = ['gnom'];
/* harmony default export */ const gnom = ({
  init: gnom_init,
  forward: gnom_forward,
  inverse: gnom_inverse,
  names: gnom_names
});

;// ./node_modules/proj4/lib/common/iqsfnz.js


/* harmony default export */ function iqsfnz(eccent, q) {
  var temp = 1 - (1 - eccent * eccent) / (2 * eccent) * Math.log((1 - eccent) / (1 + eccent));
  if (Math.abs(Math.abs(q) - temp) < 1.0E-6) {
    if (q < 0) {
      return (-1 * HALF_PI);
    } else {
      return HALF_PI;
    }
  }
  // var phi = 0.5* q/(1-eccent*eccent);
  var phi = Math.asin(0.5 * q);
  var dphi;
  var sin_phi;
  var cos_phi;
  var con;
  for (var i = 0; i < 30; i++) {
    sin_phi = Math.sin(phi);
    cos_phi = Math.cos(phi);
    con = eccent * sin_phi;
    dphi = Math.pow(1 - con * con, 2) / (2 * cos_phi) * (q / (1 - eccent * eccent) - sin_phi / (1 - con * con) + 0.5 / eccent * Math.log((1 - con) / (1 + con)));
    phi += dphi;
    if (Math.abs(dphi) <= 0.0000000001) {
      return phi;
    }
  }

  // console.log("IQSFN-CONV:Latitude failed to converge after 30 iterations");
  return NaN;
}

;// ./node_modules/proj4/lib/projections/cea.js





/**
 * @typedef {Object} LocalThis
 * @property {number} e
 */

/**
  reference:
    "Cartographic Projection Procedures for the UNIX Environment-
    A User's Manual" by Gerald I. Evenden,
    USGS Open File Report 90-284and Release 4 Interim Reports (2003)
  @this {import('../defs.js').ProjectionDefinition & LocalThis}
*/
function cea_init() {
  // no-op
  if (!this.sphere) {
    this.k0 = msfnz(this.e, Math.sin(this.lat_ts), Math.cos(this.lat_ts));
  }
}

/* Cylindrical Equal Area forward equations--mapping lat,long to x,y
    ------------------------------------------------------------ */
function cea_forward(p) {
  var lon = p.x;
  var lat = p.y;
  var x, y;
  /* Forward equations
      ----------------- */
  var dlon = adjust_lon(lon - this.long0);
  if (this.sphere) {
    x = this.x0 + this.a * dlon * Math.cos(this.lat_ts);
    y = this.y0 + this.a * Math.sin(lat) / Math.cos(this.lat_ts);
  } else {
    var qs = qsfnz(this.e, Math.sin(lat));
    x = this.x0 + this.a * this.k0 * dlon;
    y = this.y0 + this.a * qs * 0.5 / this.k0;
  }

  p.x = x;
  p.y = y;
  return p;
}

/* Cylindrical Equal Area inverse equations--mapping x,y to lat/long
    ------------------------------------------------------------ */
function cea_inverse(p) {
  p.x -= this.x0;
  p.y -= this.y0;
  var lon, lat;

  if (this.sphere) {
    lon = adjust_lon(this.long0 + (p.x / this.a) / Math.cos(this.lat_ts));
    lat = Math.asin((p.y / this.a) * Math.cos(this.lat_ts));
  } else {
    lat = iqsfnz(this.e, 2 * p.y * this.k0 / this.a);
    lon = adjust_lon(this.long0 + p.x / (this.a * this.k0));
  }

  p.x = lon;
  p.y = lat;
  return p;
}

var cea_names = ['cea'];
/* harmony default export */ const cea = ({
  init: cea_init,
  forward: cea_forward,
  inverse: cea_inverse,
  names: cea_names
});

;// ./node_modules/proj4/lib/projections/eqc.js



function eqc_init() {
  this.x0 = this.x0 || 0;
  this.y0 = this.y0 || 0;
  this.lat0 = this.lat0 || 0;
  this.long0 = this.long0 || 0;
  this.lat_ts = this.lat_ts || 0;
  this.title = this.title || 'Equidistant Cylindrical (Plate Carre)';

  this.rc = Math.cos(this.lat_ts);
}

// forward equations--mapping lat,long to x,y
// -----------------------------------------------------------------
function eqc_forward(p) {
  var lon = p.x;
  var lat = p.y;

  var dlon = adjust_lon(lon - this.long0);
  var dlat = adjust_lat(lat - this.lat0);
  p.x = this.x0 + (this.a * dlon * this.rc);
  p.y = this.y0 + (this.a * dlat);
  return p;
}

// inverse equations--mapping x,y to lat/long
// -----------------------------------------------------------------
function eqc_inverse(p) {
  var x = p.x;
  var y = p.y;

  p.x = adjust_lon(this.long0 + ((x - this.x0) / (this.a * this.rc)));
  p.y = adjust_lat(this.lat0 + ((y - this.y0) / (this.a)));
  return p;
}

var eqc_names = ['Equirectangular', 'Equidistant_Cylindrical', 'Equidistant_Cylindrical_Spherical', 'eqc'];
/* harmony default export */ const eqc = ({
  init: eqc_init,
  forward: eqc_forward,
  inverse: eqc_inverse,
  names: eqc_names
});

;// ./node_modules/proj4/lib/projections/poly.js











/**
 * @typedef {Object} LocalThis
 * @property {number} temp
 * @property {number} es
 * @property {number} e
 * @property {number} e0
 * @property {number} e1
 * @property {number} e2
 * @property {number} e3
 * @property {number} ml0
 */

var poly_MAX_ITER = 20;

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function poly_init() {
  /* Place parameters in static storage for common use
      ------------------------------------------------- */
  this.temp = this.b / this.a;
  this.es = 1 - Math.pow(this.temp, 2); // devait etre dans tmerc.js mais n y est pas donc je commente sinon retour de valeurs nulles
  this.e = Math.sqrt(this.es);
  this.e0 = e0fn(this.es);
  this.e1 = e1fn(this.es);
  this.e2 = e2fn(this.es);
  this.e3 = e3fn(this.es);
  this.ml0 = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, this.lat0); // si que des zeros le calcul ne se fait pas
}

/* Polyconic forward equations--mapping lat,long to x,y
    --------------------------------------------------- */
function poly_forward(p) {
  var lon = p.x;
  var lat = p.y;
  var x, y, el;
  var dlon = adjust_lon(lon - this.long0);
  el = dlon * Math.sin(lat);
  if (this.sphere) {
    if (Math.abs(lat) <= EPSLN) {
      x = this.a * dlon;
      y = -1 * this.a * this.lat0;
    } else {
      x = this.a * Math.sin(el) / Math.tan(lat);
      y = this.a * (adjust_lat(lat - this.lat0) + (1 - Math.cos(el)) / Math.tan(lat));
    }
  } else {
    if (Math.abs(lat) <= EPSLN) {
      x = this.a * dlon;
      y = -1 * this.ml0;
    } else {
      var nl = gN(this.a, this.e, Math.sin(lat)) / Math.tan(lat);
      x = nl * Math.sin(el);
      y = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, lat) - this.ml0 + nl * (1 - Math.cos(el));
    }
  }
  p.x = x + this.x0;
  p.y = y + this.y0;
  return p;
}

/* Inverse equations
  ----------------- */
function poly_inverse(p) {
  var lon, lat, x, y, i;
  var al, bl;
  var phi, dphi;
  x = p.x - this.x0;
  y = p.y - this.y0;

  if (this.sphere) {
    if (Math.abs(y + this.a * this.lat0) <= EPSLN) {
      lon = adjust_lon(x / this.a + this.long0);
      lat = 0;
    } else {
      al = this.lat0 + y / this.a;
      bl = x * x / this.a / this.a + al * al;
      phi = al;
      var tanphi;
      for (i = poly_MAX_ITER; i; --i) {
        tanphi = Math.tan(phi);
        dphi = -1 * (al * (phi * tanphi + 1) - phi - 0.5 * (phi * phi + bl) * tanphi) / ((phi - al) / tanphi - 1);
        phi += dphi;
        if (Math.abs(dphi) <= EPSLN) {
          lat = phi;
          break;
        }
      }
      lon = adjust_lon(this.long0 + (Math.asin(x * Math.tan(phi) / this.a)) / Math.sin(lat));
    }
  } else {
    if (Math.abs(y + this.ml0) <= EPSLN) {
      lat = 0;
      lon = adjust_lon(this.long0 + x / this.a);
    } else {
      al = (this.ml0 + y) / this.a;
      bl = x * x / this.a / this.a + al * al;
      phi = al;
      var cl, mln, mlnp, ma;
      var con;
      for (i = poly_MAX_ITER; i; --i) {
        con = this.e * Math.sin(phi);
        cl = Math.sqrt(1 - con * con) * Math.tan(phi);
        mln = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, phi);
        mlnp = this.e0 - 2 * this.e1 * Math.cos(2 * phi) + 4 * this.e2 * Math.cos(4 * phi) - 6 * this.e3 * Math.cos(6 * phi);
        ma = mln / this.a;
        dphi = (al * (cl * ma + 1) - ma - 0.5 * cl * (ma * ma + bl)) / (this.es * Math.sin(2 * phi) * (ma * ma + bl - 2 * al * ma) / (4 * cl) + (al - ma) * (cl * mlnp - 2 / Math.sin(2 * phi)) - mlnp);
        phi -= dphi;
        if (Math.abs(dphi) <= EPSLN) {
          lat = phi;
          break;
        }
      }

      // lat=phi4z(this.e,this.e0,this.e1,this.e2,this.e3,al,bl,0,0);
      cl = Math.sqrt(1 - this.es * Math.pow(Math.sin(lat), 2)) * Math.tan(lat);
      lon = adjust_lon(this.long0 + Math.asin(x * cl / this.a) / Math.sin(lat));
    }
  }

  p.x = lon;
  p.y = lat;
  return p;
}

var poly_names = ['Polyconic', 'American_Polyconic', 'poly'];
/* harmony default export */ const poly = ({
  init: poly_init,
  forward: poly_forward,
  inverse: poly_inverse,
  names: poly_names
});

;// ./node_modules/proj4/lib/projections/nzmg.js


/*
  reference
    Department of Land and Survey Technical Circular 1973/32
      http://www.linz.govt.nz/docs/miscellaneous/nz-map-definition.pdf
    OSG Technical Report 4.1
      http://www.linz.govt.nz/docs/miscellaneous/nzmg.pdf
  */

/**
 * iterations: Number of iterations to refine inverse transform.
 *     0 -> km accuracy
 *     1 -> m accuracy -- suitable for most mapping applications
 *     2 -> mm accuracy
 */
var iterations = 1;

function nzmg_init() {
  this.A = [];
  this.A[1] = 0.6399175073;
  this.A[2] = -0.1358797613;
  this.A[3] = 0.063294409;
  this.A[4] = -0.02526853;
  this.A[5] = 0.0117879;
  this.A[6] = -0.0055161;
  this.A[7] = 0.0026906;
  this.A[8] = -0.001333;
  this.A[9] = 0.00067;
  this.A[10] = -0.00034;

  this.B_re = [];
  this.B_im = [];
  this.B_re[1] = 0.7557853228;
  this.B_im[1] = 0;
  this.B_re[2] = 0.249204646;
  this.B_im[2] = 0.003371507;
  this.B_re[3] = -0.001541739;
  this.B_im[3] = 0.041058560;
  this.B_re[4] = -0.10162907;
  this.B_im[4] = 0.01727609;
  this.B_re[5] = -0.26623489;
  this.B_im[5] = -0.36249218;
  this.B_re[6] = -0.6870983;
  this.B_im[6] = -1.1651967;

  this.C_re = [];
  this.C_im = [];
  this.C_re[1] = 1.3231270439;
  this.C_im[1] = 0;
  this.C_re[2] = -0.577245789;
  this.C_im[2] = -0.007809598;
  this.C_re[3] = 0.508307513;
  this.C_im[3] = -0.112208952;
  this.C_re[4] = -0.15094762;
  this.C_im[4] = 0.18200602;
  this.C_re[5] = 1.01418179;
  this.C_im[5] = 1.64497696;
  this.C_re[6] = 1.9660549;
  this.C_im[6] = 2.5127645;

  this.D = [];
  this.D[1] = 1.5627014243;
  this.D[2] = 0.5185406398;
  this.D[3] = -0.03333098;
  this.D[4] = -0.1052906;
  this.D[5] = -0.0368594;
  this.D[6] = 0.007317;
  this.D[7] = 0.01220;
  this.D[8] = 0.00394;
  this.D[9] = -0.0013;
}

/**
    New Zealand Map Grid Forward  - long/lat to x/y
    long/lat in radians
  */
function nzmg_forward(p) {
  var n;
  var lon = p.x;
  var lat = p.y;

  var delta_lat = lat - this.lat0;
  var delta_lon = lon - this.long0;

  // 1. Calculate d_phi and d_psi    ...                          // and d_lambda
  // For this algorithm, delta_latitude is in seconds of arc x 10-5, so we need to scale to those units. Longitude is radians.
  var d_phi = delta_lat / SEC_TO_RAD * 1E-5;
  var d_lambda = delta_lon;
  var d_phi_n = 1; // d_phi^0

  var d_psi = 0;
  for (n = 1; n <= 10; n++) {
    d_phi_n = d_phi_n * d_phi;
    d_psi = d_psi + this.A[n] * d_phi_n;
  }

  // 2. Calculate theta
  var th_re = d_psi;
  var th_im = d_lambda;

  // 3. Calculate z
  var th_n_re = 1;
  var th_n_im = 0; // theta^0
  var th_n_re1;
  var th_n_im1;

  var z_re = 0;
  var z_im = 0;
  for (n = 1; n <= 6; n++) {
    th_n_re1 = th_n_re * th_re - th_n_im * th_im;
    th_n_im1 = th_n_im * th_re + th_n_re * th_im;
    th_n_re = th_n_re1;
    th_n_im = th_n_im1;
    z_re = z_re + this.B_re[n] * th_n_re - this.B_im[n] * th_n_im;
    z_im = z_im + this.B_im[n] * th_n_re + this.B_re[n] * th_n_im;
  }

  // 4. Calculate easting and northing
  p.x = (z_im * this.a) + this.x0;
  p.y = (z_re * this.a) + this.y0;

  return p;
}

/**
    New Zealand Map Grid Inverse  -  x/y to long/lat
  */
function nzmg_inverse(p) {
  var n;
  var x = p.x;
  var y = p.y;

  var delta_x = x - this.x0;
  var delta_y = y - this.y0;

  // 1. Calculate z
  var z_re = delta_y / this.a;
  var z_im = delta_x / this.a;

  // 2a. Calculate theta - first approximation gives km accuracy
  var z_n_re = 1;
  var z_n_im = 0; // z^0
  var z_n_re1;
  var z_n_im1;

  var th_re = 0;
  var th_im = 0;
  for (n = 1; n <= 6; n++) {
    z_n_re1 = z_n_re * z_re - z_n_im * z_im;
    z_n_im1 = z_n_im * z_re + z_n_re * z_im;
    z_n_re = z_n_re1;
    z_n_im = z_n_im1;
    th_re = th_re + this.C_re[n] * z_n_re - this.C_im[n] * z_n_im;
    th_im = th_im + this.C_im[n] * z_n_re + this.C_re[n] * z_n_im;
  }

  // 2b. Iterate to refine the accuracy of the calculation
  //        0 iterations gives km accuracy
  //        1 iteration gives m accuracy -- good enough for most mapping applications
  //        2 iterations bives mm accuracy
  for (var i = 0; i < this.iterations; i++) {
    var th_n_re = th_re;
    var th_n_im = th_im;
    var th_n_re1;
    var th_n_im1;

    var num_re = z_re;
    var num_im = z_im;
    for (n = 2; n <= 6; n++) {
      th_n_re1 = th_n_re * th_re - th_n_im * th_im;
      th_n_im1 = th_n_im * th_re + th_n_re * th_im;
      th_n_re = th_n_re1;
      th_n_im = th_n_im1;
      num_re = num_re + (n - 1) * (this.B_re[n] * th_n_re - this.B_im[n] * th_n_im);
      num_im = num_im + (n - 1) * (this.B_im[n] * th_n_re + this.B_re[n] * th_n_im);
    }

    th_n_re = 1;
    th_n_im = 0;
    var den_re = this.B_re[1];
    var den_im = this.B_im[1];
    for (n = 2; n <= 6; n++) {
      th_n_re1 = th_n_re * th_re - th_n_im * th_im;
      th_n_im1 = th_n_im * th_re + th_n_re * th_im;
      th_n_re = th_n_re1;
      th_n_im = th_n_im1;
      den_re = den_re + n * (this.B_re[n] * th_n_re - this.B_im[n] * th_n_im);
      den_im = den_im + n * (this.B_im[n] * th_n_re + this.B_re[n] * th_n_im);
    }

    // Complex division
    var den2 = den_re * den_re + den_im * den_im;
    th_re = (num_re * den_re + num_im * den_im) / den2;
    th_im = (num_im * den_re - num_re * den_im) / den2;
  }

  // 3. Calculate d_phi              ...                                    // and d_lambda
  var d_psi = th_re;
  var d_lambda = th_im;
  var d_psi_n = 1; // d_psi^0

  var d_phi = 0;
  for (n = 1; n <= 9; n++) {
    d_psi_n = d_psi_n * d_psi;
    d_phi = d_phi + this.D[n] * d_psi_n;
  }

  // 4. Calculate latitude and longitude
  // d_phi is calcuated in second of arc * 10^-5, so we need to scale back to radians. d_lambda is in radians.
  var lat = this.lat0 + (d_phi * SEC_TO_RAD * 1E5);
  var lon = this.long0 + d_lambda;

  p.x = lon;
  p.y = lat;

  return p;
}

var nzmg_names = ['New_Zealand_Map_Grid', 'nzmg'];
/* harmony default export */ const nzmg = ({
  init: nzmg_init,
  forward: nzmg_forward,
  inverse: nzmg_inverse,
  names: nzmg_names
});

;// ./node_modules/proj4/lib/projections/mill.js


/*
  reference
    "New Equal-Area Map Projections for Noncircular Regions", John P. Snyder,
    The American Cartographer, Vol 15, No. 4, October 1988, pp. 341-355.
  */

/* Initialize the Miller Cylindrical projection
  ------------------------------------------- */
function mill_init() {
  // no-op
}

/* Miller Cylindrical forward equations--mapping lat,long to x,y
    ------------------------------------------------------------ */
function mill_forward(p) {
  var lon = p.x;
  var lat = p.y;
  /* Forward equations
      ----------------- */
  var dlon = adjust_lon(lon - this.long0);
  var x = this.x0 + this.a * dlon;
  var y = this.y0 + this.a * Math.log(Math.tan((Math.PI / 4) + (lat / 2.5))) * 1.25;

  p.x = x;
  p.y = y;
  return p;
}

/* Miller Cylindrical inverse equations--mapping x,y to lat/long
    ------------------------------------------------------------ */
function mill_inverse(p) {
  p.x -= this.x0;
  p.y -= this.y0;

  var lon = adjust_lon(this.long0 + p.x / this.a);
  var lat = 2.5 * (Math.atan(Math.exp(0.8 * p.y / this.a)) - Math.PI / 4);

  p.x = lon;
  p.y = lat;
  return p;
}

var mill_names = ['Miller_Cylindrical', 'mill'];
/* harmony default export */ const mill = ({
  init: mill_init,
  forward: mill_forward,
  inverse: mill_inverse,
  names: mill_names
});

;// ./node_modules/proj4/lib/projections/sinu.js



var sinu_MAX_ITER = 20;






/**
 * @typedef {Object} LocalThis
 * @property {Array<number>} en
 * @property {number} n
 * @property {number} m
 * @property {number} C_y
 * @property {number} C_x
 * @property {number} es
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function sinu_init() {
  /* Place parameters in static storage for common use
    ------------------------------------------------- */

  if (!this.sphere) {
    this.en = pj_enfn(this.es);
  } else {
    this.n = 1;
    this.m = 0;
    this.es = 0;
    this.C_y = Math.sqrt((this.m + 1) / this.n);
    this.C_x = this.C_y / (this.m + 1);
  }
}

/* Sinusoidal forward equations--mapping lat,long to x,y
  ----------------------------------------------------- */
function sinu_forward(p) {
  var x, y;
  var lon = p.x;
  var lat = p.y;
  /* Forward equations
    ----------------- */
  lon = adjust_lon(lon - this.long0);

  if (this.sphere) {
    if (!this.m) {
      lat = this.n !== 1 ? Math.asin(this.n * Math.sin(lat)) : lat;
    } else {
      var k = this.n * Math.sin(lat);
      for (var i = sinu_MAX_ITER; i; --i) {
        var V = (this.m * lat + Math.sin(lat) - k) / (this.m + Math.cos(lat));
        lat -= V;
        if (Math.abs(V) < EPSLN) {
          break;
        }
      }
    }
    x = this.a * this.C_x * lon * (this.m + Math.cos(lat));
    y = this.a * this.C_y * lat;
  } else {
    var s = Math.sin(lat);
    var c = Math.cos(lat);
    y = this.a * pj_mlfn(lat, s, c, this.en);
    x = this.a * lon * c / Math.sqrt(1 - this.es * s * s);
  }

  p.x = x;
  p.y = y;
  return p;
}

function sinu_inverse(p) {
  var lat, temp, lon, s;

  p.x -= this.x0;
  lon = p.x / this.a;
  p.y -= this.y0;
  lat = p.y / this.a;

  if (this.sphere) {
    lat /= this.C_y;
    lon = lon / (this.C_x * (this.m + Math.cos(lat)));
    if (this.m) {
      lat = asinz((this.m * lat + Math.sin(lat)) / this.n);
    } else if (this.n !== 1) {
      lat = asinz(Math.sin(lat) / this.n);
    }
    lon = adjust_lon(lon + this.long0);
    lat = adjust_lat(lat);
  } else {
    lat = pj_inv_mlfn(p.y / this.a, this.es, this.en);
    s = Math.abs(lat);
    if (s < HALF_PI) {
      s = Math.sin(lat);
      temp = this.long0 + p.x * Math.sqrt(1 - this.es * s * s) / (this.a * Math.cos(lat));
      // temp = this.long0 + p.x / (this.a * Math.cos(lat));
      lon = adjust_lon(temp);
    } else if ((s - EPSLN) < HALF_PI) {
      lon = this.long0;
    }
  }
  p.x = lon;
  p.y = lat;
  return p;
}

var sinu_names = ['Sinusoidal', 'sinu'];
/* harmony default export */ const sinu = ({
  init: sinu_init,
  forward: sinu_forward,
  inverse: sinu_inverse,
  names: sinu_names
});

;// ./node_modules/proj4/lib/projections/moll.js

function moll_init() {}

/* Mollweide forward equations--mapping lat,long to x,y
    ---------------------------------------------------- */
function moll_forward(p) {
  /* Forward equations
      ----------------- */
  var lon = p.x;
  var lat = p.y;

  var delta_lon = adjust_lon(lon - this.long0);
  var theta = lat;
  var con = Math.PI * Math.sin(lat);

  /* Iterate using the Newton-Raphson method to find theta
      ----------------------------------------------------- */
  while (true) {
    var delta_theta = -(theta + Math.sin(theta) - con) / (1 + Math.cos(theta));
    theta += delta_theta;
    if (Math.abs(delta_theta) < EPSLN) {
      break;
    }
  }
  theta /= 2;

  /* If the latitude is 90 deg, force the x coordinate to be "0 + false easting"
       this is done here because of precision problems with "cos(theta)"
       -------------------------------------------------------------------------- */
  if (Math.PI / 2 - Math.abs(lat) < EPSLN) {
    delta_lon = 0;
  }
  var x = 0.900316316158 * this.a * delta_lon * Math.cos(theta) + this.x0;
  var y = 1.4142135623731 * this.a * Math.sin(theta) + this.y0;

  p.x = x;
  p.y = y;
  return p;
}

function moll_inverse(p) {
  var theta;
  var arg;

  /* Inverse equations
      ----------------- */
  p.x -= this.x0;
  p.y -= this.y0;
  arg = p.y / (1.4142135623731 * this.a);

  /* Because of division by zero problems, 'arg' can not be 1.  Therefore
       a number very close to one is used instead.
       ------------------------------------------------------------------- */
  if (Math.abs(arg) > 0.999999999999) {
    arg = 0.999999999999;
  }
  theta = Math.asin(arg);
  var lon = adjust_lon(this.long0 + (p.x / (0.900316316158 * this.a * Math.cos(theta))));
  if (lon < (-Math.PI)) {
    lon = -Math.PI;
  }
  if (lon > Math.PI) {
    lon = Math.PI;
  }
  arg = (2 * theta + Math.sin(2 * theta)) / Math.PI;
  if (Math.abs(arg) > 1) {
    arg = 1;
  }
  var lat = Math.asin(arg);

  p.x = lon;
  p.y = lat;
  return p;
}

var moll_names = ['Mollweide', 'moll'];
/* harmony default export */ const moll = ({
  init: moll_init,
  forward: moll_forward,
  inverse: moll_inverse,
  names: moll_names
});

;// ./node_modules/proj4/lib/projections/eqdc.js











/**
 * @typedef {Object} LocalThis
 * @property {number} temp
 * @property {number} es
 * @property {number} e
 * @property {number} e0
 * @property {number} e1
 * @property {number} e2
 * @property {number} e3
 * @property {number} sin_phi
 * @property {number} cos_phi
 * @property {number} ms1
 * @property {number} ml1
 * @property {number} ms2
 * @property {number} ml2
 * @property {number} ns
 * @property {number} g
 * @property {number} ml0
 * @property {number} rh
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function eqdc_init() {
  /* Place parameters in static storage for common use
      ------------------------------------------------- */
  // Standard Parallels cannot be equal and on opposite sides of the equator
  if (Math.abs(this.lat1 + this.lat2) < EPSLN) {
    return;
  }
  this.lat2 = this.lat2 || this.lat1;
  this.temp = this.b / this.a;
  this.es = 1 - Math.pow(this.temp, 2);
  this.e = Math.sqrt(this.es);
  this.e0 = e0fn(this.es);
  this.e1 = e1fn(this.es);
  this.e2 = e2fn(this.es);
  this.e3 = e3fn(this.es);

  this.sin_phi = Math.sin(this.lat1);
  this.cos_phi = Math.cos(this.lat1);

  this.ms1 = msfnz(this.e, this.sin_phi, this.cos_phi);
  this.ml1 = mlfn(this.e0, this.e1, this.e2, this.e3, this.lat1);

  if (Math.abs(this.lat1 - this.lat2) < EPSLN) {
    this.ns = this.sin_phi;
  } else {
    this.sin_phi = Math.sin(this.lat2);
    this.cos_phi = Math.cos(this.lat2);
    this.ms2 = msfnz(this.e, this.sin_phi, this.cos_phi);
    this.ml2 = mlfn(this.e0, this.e1, this.e2, this.e3, this.lat2);
    this.ns = (this.ms1 - this.ms2) / (this.ml2 - this.ml1);
  }
  this.g = this.ml1 + this.ms1 / this.ns;
  this.ml0 = mlfn(this.e0, this.e1, this.e2, this.e3, this.lat0);
  this.rh = this.a * (this.g - this.ml0);
}

/* Equidistant Conic forward equations--mapping lat,long to x,y
  ----------------------------------------------------------- */
function eqdc_forward(p) {
  var lon = p.x;
  var lat = p.y;
  var rh1;

  /* Forward equations
      ----------------- */
  if (this.sphere) {
    rh1 = this.a * (this.g - lat);
  } else {
    var ml = mlfn(this.e0, this.e1, this.e2, this.e3, lat);
    rh1 = this.a * (this.g - ml);
  }
  var theta = this.ns * adjust_lon(lon - this.long0);
  var x = this.x0 + rh1 * Math.sin(theta);
  var y = this.y0 + this.rh - rh1 * Math.cos(theta);
  p.x = x;
  p.y = y;
  return p;
}

/* Inverse equations
  ----------------- */
function eqdc_inverse(p) {
  p.x -= this.x0;
  p.y = this.rh - p.y + this.y0;
  var con, rh1, lat, lon;
  if (this.ns >= 0) {
    rh1 = Math.sqrt(p.x * p.x + p.y * p.y);
    con = 1;
  } else {
    rh1 = -Math.sqrt(p.x * p.x + p.y * p.y);
    con = -1;
  }
  var theta = 0;
  if (rh1 !== 0) {
    theta = Math.atan2(con * p.x, con * p.y);
  }

  if (this.sphere) {
    lon = adjust_lon(this.long0 + theta / this.ns);
    lat = adjust_lat(this.g - rh1 / this.a);
    p.x = lon;
    p.y = lat;
    return p;
  } else {
    var ml = this.g - rh1 / this.a;
    lat = imlfn(ml, this.e0, this.e1, this.e2, this.e3);
    lon = adjust_lon(this.long0 + theta / this.ns);
    p.x = lon;
    p.y = lat;
    return p;
  }
}

var eqdc_names = ['Equidistant_Conic', 'eqdc'];
/* harmony default export */ const eqdc = ({
  init: eqdc_init,
  forward: eqdc_forward,
  inverse: eqdc_inverse,
  names: eqdc_names
});

;// ./node_modules/proj4/lib/projections/vandg.js






/**
 * @typedef {Object} LocalThis
 * @property {number} R - Radius of the Earth
 */

/**
 * Initialize the Van Der Grinten projection
 * @this {import('../defs.js').ProjectionDefinition & LocalThis}
 */
function vandg_init() {
  // this.R = 6370997; //Radius of earth
  this.R = this.a;
}

function vandg_forward(p) {
  var lon = p.x;
  var lat = p.y;

  /* Forward equations
    ----------------- */
  var dlon = adjust_lon(lon - this.long0);
  var x, y;

  if (Math.abs(lat) <= EPSLN) {
    x = this.x0 + this.R * dlon;
    y = this.y0;
  }
  var theta = asinz(2 * Math.abs(lat / Math.PI));
  if ((Math.abs(dlon) <= EPSLN) || (Math.abs(Math.abs(lat) - HALF_PI) <= EPSLN)) {
    x = this.x0;
    if (lat >= 0) {
      y = this.y0 + Math.PI * this.R * Math.tan(0.5 * theta);
    } else {
      y = this.y0 + Math.PI * this.R * -Math.tan(0.5 * theta);
    }
    //  return(OK);
  }
  var al = 0.5 * Math.abs((Math.PI / dlon) - (dlon / Math.PI));
  var asq = al * al;
  var sinth = Math.sin(theta);
  var costh = Math.cos(theta);

  var g = costh / (sinth + costh - 1);
  var gsq = g * g;
  var m = g * (2 / sinth - 1);
  var msq = m * m;
  var con = Math.PI * this.R * (al * (g - msq) + Math.sqrt(asq * (g - msq) * (g - msq) - (msq + asq) * (gsq - msq))) / (msq + asq);
  if (dlon < 0) {
    con = -con;
  }
  x = this.x0 + con;
  // con = Math.abs(con / (Math.PI * this.R));
  var q = asq + g;
  con = Math.PI * this.R * (m * q - al * Math.sqrt((msq + asq) * (asq + 1) - q * q)) / (msq + asq);
  if (lat >= 0) {
    // y = this.y0 + Math.PI * this.R * Math.sqrt(1 - con * con - 2 * al * con);
    y = this.y0 + con;
  } else {
    // y = this.y0 - Math.PI * this.R * Math.sqrt(1 - con * con - 2 * al * con);
    y = this.y0 - con;
  }
  p.x = x;
  p.y = y;
  return p;
}

/* Van Der Grinten inverse equations--mapping x,y to lat/long
  --------------------------------------------------------- */
function vandg_inverse(p) {
  var lon, lat;
  var xx, yy, xys, c1, c2, c3;
  var a1;
  var m1;
  var con;
  var th1;
  var d;

  /* inverse equations
    ----------------- */
  p.x -= this.x0;
  p.y -= this.y0;
  con = Math.PI * this.R;
  xx = p.x / con;
  yy = p.y / con;
  xys = xx * xx + yy * yy;
  c1 = -Math.abs(yy) * (1 + xys);
  c2 = c1 - 2 * yy * yy + xx * xx;
  c3 = -2 * c1 + 1 + 2 * yy * yy + xys * xys;
  d = yy * yy / c3 + (2 * c2 * c2 * c2 / c3 / c3 / c3 - 9 * c1 * c2 / c3 / c3) / 27;
  a1 = (c1 - c2 * c2 / 3 / c3) / c3;
  m1 = 2 * Math.sqrt(-a1 / 3);
  con = ((3 * d) / a1) / m1;
  if (Math.abs(con) > 1) {
    if (con >= 0) {
      con = 1;
    } else {
      con = -1;
    }
  }
  th1 = Math.acos(con) / 3;
  if (p.y >= 0) {
    lat = (-m1 * Math.cos(th1 + Math.PI / 3) - c2 / 3 / c3) * Math.PI;
  } else {
    lat = -(-m1 * Math.cos(th1 + Math.PI / 3) - c2 / 3 / c3) * Math.PI;
  }

  if (Math.abs(xx) < EPSLN) {
    lon = this.long0;
  } else {
    lon = adjust_lon(this.long0 + Math.PI * (xys - 1 + Math.sqrt(1 + 2 * (xx * xx - yy * yy) + xys * xys)) / 2 / xx);
  }

  p.x = lon;
  p.y = lat;
  return p;
}

var vandg_names = ['Van_der_Grinten_I', 'VanDerGrinten', 'Van_der_Grinten', 'vandg'];
/* harmony default export */ const vandg = ({
  init: vandg_init,
  forward: vandg_forward,
  inverse: vandg_inverse,
  names: vandg_names
});

;// ./node_modules/proj4/lib/common/vincenty.js
/**
 * Calculates the inverse geodesic problem using Vincenty's formulae.
 * Computes the forward azimuth and ellipsoidal distance between two points
 * specified by latitude and longitude on the surface of an ellipsoid.
 *
 * @param {number} lat1 Latitude of the first point in radians.
 * @param {number} lon1 Longitude of the first point in radians.
 * @param {number} lat2 Latitude of the second point in radians.
 * @param {number} lon2 Longitude of the second point in radians.
 * @param {number} a Semi-major axis of the ellipsoid (meters).
 * @param {number} f Flattening of the ellipsoid.
 * @returns {{ azi1: number, s12: number }} An object containing:
 *   - azi1: Forward azimuth from the first point to the second point (radians).
 *   - s12: Ellipsoidal distance between the two points (meters).
 */
function vincentyInverse(lat1, lon1, lat2, lon2, a, f) {
  const L = lon2 - lon1;
  const U1 = Math.atan((1 - f) * Math.tan(lat1));
  const U2 = Math.atan((1 - f) * Math.tan(lat2));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

  let lambda = L, lambdaP, iterLimit = 100;
  let sinLambda, cosLambda, sinSigma, cosSigma, sigma, sinAlpha, cos2Alpha, cos2SigmaM, C;
  let uSq, A, B, deltaSigma, s;

  do {
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) * (cosU2 * sinLambda)
      + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)
      * (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)
    );
    if (sinSigma === 0) {
      return { azi1: 0, s12: 0 }; // coincident points
    }
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
    cos2Alpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = (cos2Alpha !== 0) ? (cosSigma - 2 * sinU1 * sinU2 / cos2Alpha) : 0;
    C = f / 16 * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));
    lambdaP = lambda;
    lambda = L + (1 - C) * f * sinAlpha
    * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  } while (Math.abs(lambda - lambdaP) > 1e-12 && --iterLimit > 0);

  if (iterLimit === 0) {
    return { azi1: NaN, s12: NaN }; // formula failed to converge
  }

  uSq = cos2Alpha * (a * a - (a * (1 - f)) * (a * (1 - f))) / ((a * (1 - f)) * (a * (1 - f)));
  A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)
    - B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));

  s = (a * (1 - f)) * A * (sigma - deltaSigma);

  // Forward azimuth
  const azi1 = Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);

  return { azi1, s12: s };
}

/**
 * Solves the direct geodetic problem using Vincenty's formulae.
 * Given a starting point, initial azimuth, and distance, computes the destination point on the ellipsoid.
 *
 * @param {number} lat1 Latitude of the starting point in radians.
 * @param {number} lon1 Longitude of the starting point in radians.
 * @param {number} azi1 Initial azimuth (forward azimuth) in radians.
 * @param {number} s12 Distance to travel from the starting point in meters.
 * @param {number} a Semi-major axis of the ellipsoid in meters.
 * @param {number} f Flattening of the ellipsoid.
 * @returns {{lat2: number, lon2: number}} The latitude and longitude (in radians) of the destination point.
 */
function vincentyDirect(lat1, lon1, azi1, s12, a, f) {
  const U1 = Math.atan((1 - f) * Math.tan(lat1));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinAlpha1 = Math.sin(azi1), cosAlpha1 = Math.cos(azi1);

  const sigma1 = Math.atan2(sinU1, cosU1 * cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cos2Alpha = 1 - sinAlpha * sinAlpha;
  const uSq = cos2Alpha * (a * a - (a * (1 - f)) * (a * (1 - f))) / ((a * (1 - f)) * (a * (1 - f)));
  const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

  let sigma = s12 / ((a * (1 - f)) * A), sigmaP, iterLimit = 100;
  let cos2SigmaM, sinSigma, cosSigma, deltaSigma;

  do {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)
      - B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
    sigmaP = sigma;
    sigma = s12 / ((a * (1 - f)) * A) + deltaSigma;
  } while (Math.abs(sigma - sigmaP) > 1e-12 && --iterLimit > 0);

  if (iterLimit === 0) {
    return { lat2: NaN, lon2: NaN };
  }

  const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
  const lat2 = Math.atan2(
    sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp)
  );
  const lambda = Math.atan2(
    sinSigma * sinAlpha1,
    cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1
  );
  const C = f / 16 * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));
  const L = lambda - (1 - C) * f * sinAlpha
    * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  const lon2 = lon1 + L;

  return { lat2, lon2 };
}

;// ./node_modules/proj4/lib/projections/aeqd.js











/**
 * @typedef {Object} LocalThis
 * @property {number} es
 * @property {number} sin_p12
 * @property {number} cos_p12
 * @property {number} a
 * @property {number} f
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function aeqd_init() {
  this.sin_p12 = Math.sin(this.lat0);
  this.cos_p12 = Math.cos(this.lat0);
  // flattening for ellipsoid
  this.f = this.es / (1 + Math.sqrt(1 - this.es));
}

function aeqd_forward(p) {
  var lon = p.x;
  var lat = p.y;
  var sinphi = Math.sin(p.y);
  var cosphi = Math.cos(p.y);
  var dlon = adjust_lon(lon - this.long0);
  var e0, e1, e2, e3, Mlp, Ml, c, kp, cos_c, vars, azi1;
  if (this.sphere) {
    if (Math.abs(this.sin_p12 - 1) <= EPSLN) {
      // North Pole case
      p.x = this.x0 + this.a * (HALF_PI - lat) * Math.sin(dlon);
      p.y = this.y0 - this.a * (HALF_PI - lat) * Math.cos(dlon);
      return p;
    } else if (Math.abs(this.sin_p12 + 1) <= EPSLN) {
      // South Pole case
      p.x = this.x0 + this.a * (HALF_PI + lat) * Math.sin(dlon);
      p.y = this.y0 + this.a * (HALF_PI + lat) * Math.cos(dlon);
      return p;
    } else {
      // default case
      cos_c = this.sin_p12 * sinphi + this.cos_p12 * cosphi * Math.cos(dlon);
      c = Math.acos(cos_c);
      kp = c ? c / Math.sin(c) : 1;
      p.x = this.x0 + this.a * kp * cosphi * Math.sin(dlon);
      p.y = this.y0 + this.a * kp * (this.cos_p12 * sinphi - this.sin_p12 * cosphi * Math.cos(dlon));
      return p;
    }
  } else {
    e0 = e0fn(this.es);
    e1 = e1fn(this.es);
    e2 = e2fn(this.es);
    e3 = e3fn(this.es);
    if (Math.abs(this.sin_p12 - 1) <= EPSLN) {
      // North Pole case
      Mlp = this.a * mlfn(e0, e1, e2, e3, HALF_PI);
      Ml = this.a * mlfn(e0, e1, e2, e3, lat);
      p.x = this.x0 + (Mlp - Ml) * Math.sin(dlon);
      p.y = this.y0 - (Mlp - Ml) * Math.cos(dlon);
      return p;
    } else if (Math.abs(this.sin_p12 + 1) <= EPSLN) {
      // South Pole case
      Mlp = this.a * mlfn(e0, e1, e2, e3, HALF_PI);
      Ml = this.a * mlfn(e0, e1, e2, e3, lat);
      p.x = this.x0 + (Mlp + Ml) * Math.sin(dlon);
      p.y = this.y0 + (Mlp + Ml) * Math.cos(dlon);
      return p;
    } else {
      // Default case
      if (Math.abs(lon) < EPSLN && Math.abs(lat - this.lat0) < EPSLN) {
        p.x = p.y = 0;
        return p;
      }
      vars = vincentyInverse(this.lat0, this.long0, lat, lon, this.a, this.f);
      azi1 = vars.azi1;
      p.x = vars.s12 * Math.sin(azi1);
      p.y = vars.s12 * Math.cos(azi1);
      return p;
    }
  }
}

function aeqd_inverse(p) {
  p.x -= this.x0;
  p.y -= this.y0;
  var rh, z, sinz, cosz, lon, lat, con, e0, e1, e2, e3, Mlp, M, azi1, s12, vars;
  if (this.sphere) {
    rh = Math.sqrt(p.x * p.x + p.y * p.y);
    if (rh > (2 * HALF_PI * this.a)) {
      return;
    }
    z = rh / this.a;

    sinz = Math.sin(z);
    cosz = Math.cos(z);

    lon = this.long0;
    if (Math.abs(rh) <= EPSLN) {
      lat = this.lat0;
    } else {
      lat = asinz(cosz * this.sin_p12 + (p.y * sinz * this.cos_p12) / rh);
      con = Math.abs(this.lat0) - HALF_PI;
      if (Math.abs(con) <= EPSLN) {
        if (this.lat0 >= 0) {
          lon = adjust_lon(this.long0 + Math.atan2(p.x, -p.y));
        } else {
          lon = adjust_lon(this.long0 - Math.atan2(-p.x, p.y));
        }
      } else {
        lon = adjust_lon(this.long0 + Math.atan2(p.x * sinz, rh * this.cos_p12 * cosz - p.y * this.sin_p12 * sinz));
      }
    }

    p.x = lon;
    p.y = lat;
    return p;
  } else {
    e0 = e0fn(this.es);
    e1 = e1fn(this.es);
    e2 = e2fn(this.es);
    e3 = e3fn(this.es);
    if (Math.abs(this.sin_p12 - 1) <= EPSLN) {
      // North pole case
      Mlp = this.a * mlfn(e0, e1, e2, e3, HALF_PI);
      rh = Math.sqrt(p.x * p.x + p.y * p.y);
      M = Mlp - rh;
      lat = imlfn(M / this.a, e0, e1, e2, e3);
      lon = adjust_lon(this.long0 + Math.atan2(p.x, -1 * p.y));
      p.x = lon;
      p.y = lat;
      return p;
    } else if (Math.abs(this.sin_p12 + 1) <= EPSLN) {
      // South pole case
      Mlp = this.a * mlfn(e0, e1, e2, e3, HALF_PI);
      rh = Math.sqrt(p.x * p.x + p.y * p.y);
      M = rh - Mlp;

      lat = imlfn(M / this.a, e0, e1, e2, e3);
      lon = adjust_lon(this.long0 + Math.atan2(p.x, p.y));
      p.x = lon;
      p.y = lat;
      return p;
    } else {
      // default case
      azi1 = Math.atan2(p.x, p.y);
      s12 = Math.sqrt(p.x * p.x + p.y * p.y);
      vars = vincentyDirect(this.lat0, this.long0, azi1, s12, this.a, this.f);

      p.x = vars.lon2;
      p.y = vars.lat2;
      return p;
    }
  }
}

var aeqd_names = ['Azimuthal_Equidistant', 'aeqd'];
/* harmony default export */ const aeqd = ({
  init: aeqd_init,
  forward: aeqd_forward,
  inverse: aeqd_inverse,
  names: aeqd_names
});

;// ./node_modules/proj4/lib/projections/ortho.js




/**
 * @typedef {Object} LocalThis
 * @property {number} sin_p14
 * @property {number} cos_p14
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function ortho_init() {
  // double temp;      /* temporary variable    */

  /* Place parameters in static storage for common use
      ------------------------------------------------- */
  this.sin_p14 = Math.sin(this.lat0);
  this.cos_p14 = Math.cos(this.lat0);
}

/* Orthographic forward equations--mapping lat,long to x,y
    --------------------------------------------------- */
function ortho_forward(p) {
  var sinphi, cosphi; /* sin and cos value        */
  var dlon; /* delta longitude value      */
  var coslon; /* cos of longitude        */
  var ksp; /* scale factor          */
  var g, x, y;
  var lon = p.x;
  var lat = p.y;
  /* Forward equations
      ----------------- */
  dlon = adjust_lon(lon - this.long0);

  sinphi = Math.sin(lat);
  cosphi = Math.cos(lat);

  coslon = Math.cos(dlon);
  g = this.sin_p14 * sinphi + this.cos_p14 * cosphi * coslon;
  ksp = 1;
  if ((g > 0) || (Math.abs(g) <= EPSLN)) {
    x = this.a * ksp * cosphi * Math.sin(dlon);
    y = this.y0 + this.a * ksp * (this.cos_p14 * sinphi - this.sin_p14 * cosphi * coslon);
  }
  p.x = x;
  p.y = y;
  return p;
}

function ortho_inverse(p) {
  var rh; /* height above ellipsoid      */
  var z; /* angle          */
  var sinz, cosz; /* sin of z and cos of z      */
  var con;
  var lon, lat;
  /* Inverse equations
      ----------------- */
  p.x -= this.x0;
  p.y -= this.y0;
  rh = Math.sqrt(p.x * p.x + p.y * p.y);
  z = asinz(rh / this.a);

  sinz = Math.sin(z);
  cosz = Math.cos(z);

  lon = this.long0;
  if (Math.abs(rh) <= EPSLN) {
    lat = this.lat0;
    p.x = lon;
    p.y = lat;
    return p;
  }
  lat = asinz(cosz * this.sin_p14 + (p.y * sinz * this.cos_p14) / rh);
  con = Math.abs(this.lat0) - HALF_PI;
  if (Math.abs(con) <= EPSLN) {
    if (this.lat0 >= 0) {
      lon = adjust_lon(this.long0 + Math.atan2(p.x, -p.y));
    } else {
      lon = adjust_lon(this.long0 - Math.atan2(-p.x, p.y));
    }
    p.x = lon;
    p.y = lat;
    return p;
  }
  lon = adjust_lon(this.long0 + Math.atan2((p.x * sinz), rh * this.cos_p14 * cosz - p.y * this.sin_p14 * sinz));
  p.x = lon;
  p.y = lat;
  return p;
}

var ortho_names = ['ortho'];
/* harmony default export */ const ortho = ({
  init: ortho_init,
  forward: ortho_forward,
  inverse: ortho_inverse,
  names: ortho_names
});

;// ./node_modules/proj4/lib/projections/qsc.js
// QSC projection rewritten from the original PROJ4
// https://github.com/OSGeo/proj.4/blob/master/src/PJ_qsc.c



/**
 * @typedef {Object} LocalThis
 * @property {number} face
 * @property {number} x0
 * @property {number} y0
 * @property {number} es
 * @property {number} one_minus_f
 * @property {number} one_minus_f_squared
 */

/* constants */
var FACE_ENUM = {
  FRONT: 1,
  RIGHT: 2,
  BACK: 3,
  LEFT: 4,
  TOP: 5,
  BOTTOM: 6
};

var AREA_ENUM = {
  AREA_0: 1,
  AREA_1: 2,
  AREA_2: 3,
  AREA_3: 4
};

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function qsc_init() {
  this.x0 = this.x0 || 0;
  this.y0 = this.y0 || 0;
  this.lat0 = this.lat0 || 0;
  this.long0 = this.long0 || 0;
  this.lat_ts = this.lat_ts || 0;
  this.title = this.title || 'Quadrilateralized Spherical Cube';

  /* Determine the cube face from the center of projection. */
  if (this.lat0 >= HALF_PI - FORTPI / 2.0) {
    this.face = FACE_ENUM.TOP;
  } else if (this.lat0 <= -(HALF_PI - FORTPI / 2.0)) {
    this.face = FACE_ENUM.BOTTOM;
  } else if (Math.abs(this.long0) <= FORTPI) {
    this.face = FACE_ENUM.FRONT;
  } else if (Math.abs(this.long0) <= HALF_PI + FORTPI) {
    this.face = this.long0 > 0.0 ? FACE_ENUM.RIGHT : FACE_ENUM.LEFT;
  } else {
    this.face = FACE_ENUM.BACK;
  }

  /* Fill in useful values for the ellipsoid <-> sphere shift
   * described in [LK12]. */
  if (this.es !== 0) {
    this.one_minus_f = 1 - (this.a - this.b) / this.a;
    this.one_minus_f_squared = this.one_minus_f * this.one_minus_f;
  }
}

// QSC forward equations--mapping lat,long to x,y
// -----------------------------------------------------------------
function qsc_forward(p) {
  var xy = { x: 0, y: 0 };
  var lat, lon;
  var theta, phi;
  var t, mu;
  /* nu; */
  var area = { value: 0 };

  // move lon according to projection's lon
  p.x -= this.long0;

  /* Convert the geodetic latitude to a geocentric latitude.
   * This corresponds to the shift from the ellipsoid to the sphere
   * described in [LK12]. */
  if (this.es !== 0) { // if (P->es != 0) {
    lat = Math.atan(this.one_minus_f_squared * Math.tan(p.y));
  } else {
    lat = p.y;
  }

  /* Convert the input lat, lon into theta, phi as used by QSC.
   * This depends on the cube face and the area on it.
   * For the top and bottom face, we can compute theta and phi
   * directly from phi, lam. For the other faces, we must use
   * unit sphere cartesian coordinates as an intermediate step. */
  lon = p.x; // lon = lp.lam;
  if (this.face === FACE_ENUM.TOP) {
    phi = HALF_PI - lat;
    if (lon >= FORTPI && lon <= HALF_PI + FORTPI) {
      area.value = AREA_ENUM.AREA_0;
      theta = lon - HALF_PI;
    } else if (lon > HALF_PI + FORTPI || lon <= -(HALF_PI + FORTPI)) {
      area.value = AREA_ENUM.AREA_1;
      theta = (lon > 0.0 ? lon - SPI : lon + SPI);
    } else if (lon > -(HALF_PI + FORTPI) && lon <= -FORTPI) {
      area.value = AREA_ENUM.AREA_2;
      theta = lon + HALF_PI;
    } else {
      area.value = AREA_ENUM.AREA_3;
      theta = lon;
    }
  } else if (this.face === FACE_ENUM.BOTTOM) {
    phi = HALF_PI + lat;
    if (lon >= FORTPI && lon <= HALF_PI + FORTPI) {
      area.value = AREA_ENUM.AREA_0;
      theta = -lon + HALF_PI;
    } else if (lon < FORTPI && lon >= -FORTPI) {
      area.value = AREA_ENUM.AREA_1;
      theta = -lon;
    } else if (lon < -FORTPI && lon >= -(HALF_PI + FORTPI)) {
      area.value = AREA_ENUM.AREA_2;
      theta = -lon - HALF_PI;
    } else {
      area.value = AREA_ENUM.AREA_3;
      theta = (lon > 0.0 ? -lon + SPI : -lon - SPI);
    }
  } else {
    var q, r, s;
    var sinlat, coslat;
    var sinlon, coslon;

    if (this.face === FACE_ENUM.RIGHT) {
      lon = qsc_shift_lon_origin(lon, +HALF_PI);
    } else if (this.face === FACE_ENUM.BACK) {
      lon = qsc_shift_lon_origin(lon, +SPI);
    } else if (this.face === FACE_ENUM.LEFT) {
      lon = qsc_shift_lon_origin(lon, -HALF_PI);
    }
    sinlat = Math.sin(lat);
    coslat = Math.cos(lat);
    sinlon = Math.sin(lon);
    coslon = Math.cos(lon);
    q = coslat * coslon;
    r = coslat * sinlon;
    s = sinlat;

    if (this.face === FACE_ENUM.FRONT) {
      phi = Math.acos(q);
      theta = qsc_fwd_equat_face_theta(phi, s, r, area);
    } else if (this.face === FACE_ENUM.RIGHT) {
      phi = Math.acos(r);
      theta = qsc_fwd_equat_face_theta(phi, s, -q, area);
    } else if (this.face === FACE_ENUM.BACK) {
      phi = Math.acos(-q);
      theta = qsc_fwd_equat_face_theta(phi, s, -r, area);
    } else if (this.face === FACE_ENUM.LEFT) {
      phi = Math.acos(-r);
      theta = qsc_fwd_equat_face_theta(phi, s, q, area);
    } else {
      /* Impossible */
      phi = theta = 0;
      area.value = AREA_ENUM.AREA_0;
    }
  }

  /* Compute mu and nu for the area of definition.
   * For mu, see Eq. (3-21) in [OL76], but note the typos:
   * compare with Eq. (3-14). For nu, see Eq. (3-38). */
  mu = Math.atan((12 / SPI) * (theta + Math.acos(Math.sin(theta) * Math.cos(FORTPI)) - HALF_PI));
  t = Math.sqrt((1 - Math.cos(phi)) / (Math.cos(mu) * Math.cos(mu)) / (1 - Math.cos(Math.atan(1 / Math.cos(theta)))));

  /* Apply the result to the real area. */
  if (area.value === AREA_ENUM.AREA_1) {
    mu += HALF_PI;
  } else if (area.value === AREA_ENUM.AREA_2) {
    mu += SPI;
  } else if (area.value === AREA_ENUM.AREA_3) {
    mu += 1.5 * SPI;
  }

  /* Now compute x, y from mu and nu */
  xy.x = t * Math.cos(mu);
  xy.y = t * Math.sin(mu);
  xy.x = xy.x * this.a + this.x0;
  xy.y = xy.y * this.a + this.y0;

  p.x = xy.x;
  p.y = xy.y;
  return p;
}

// QSC inverse equations--mapping x,y to lat/long
// -----------------------------------------------------------------
function qsc_inverse(p) {
  var lp = { lam: 0, phi: 0 };
  var mu, nu, cosmu, tannu;
  var tantheta, theta, cosphi, phi;
  var t;
  var area = { value: 0 };

  /* de-offset */
  p.x = (p.x - this.x0) / this.a;
  p.y = (p.y - this.y0) / this.a;

  /* Convert the input x, y to the mu and nu angles as used by QSC.
   * This depends on the area of the cube face. */
  nu = Math.atan(Math.sqrt(p.x * p.x + p.y * p.y));
  mu = Math.atan2(p.y, p.x);
  if (p.x >= 0.0 && p.x >= Math.abs(p.y)) {
    area.value = AREA_ENUM.AREA_0;
  } else if (p.y >= 0.0 && p.y >= Math.abs(p.x)) {
    area.value = AREA_ENUM.AREA_1;
    mu -= HALF_PI;
  } else if (p.x < 0.0 && -p.x >= Math.abs(p.y)) {
    area.value = AREA_ENUM.AREA_2;
    mu = (mu < 0.0 ? mu + SPI : mu - SPI);
  } else {
    area.value = AREA_ENUM.AREA_3;
    mu += HALF_PI;
  }

  /* Compute phi and theta for the area of definition.
   * The inverse projection is not described in the original paper, but some
   * good hints can be found here (as of 2011-12-14):
   * http://fits.gsfc.nasa.gov/fitsbits/saf.93/saf.9302
   * (search for "Message-Id: <9302181759.AA25477 at fits.cv.nrao.edu>") */
  t = (SPI / 12) * Math.tan(mu);
  tantheta = Math.sin(t) / (Math.cos(t) - (1 / Math.sqrt(2)));
  theta = Math.atan(tantheta);
  cosmu = Math.cos(mu);
  tannu = Math.tan(nu);
  cosphi = 1 - cosmu * cosmu * tannu * tannu * (1 - Math.cos(Math.atan(1 / Math.cos(theta))));
  if (cosphi < -1) {
    cosphi = -1;
  } else if (cosphi > +1) {
    cosphi = +1;
  }

  /* Apply the result to the real area on the cube face.
   * For the top and bottom face, we can compute phi and lam directly.
   * For the other faces, we must use unit sphere cartesian coordinates
   * as an intermediate step. */
  if (this.face === FACE_ENUM.TOP) {
    phi = Math.acos(cosphi);
    lp.phi = HALF_PI - phi;
    if (area.value === AREA_ENUM.AREA_0) {
      lp.lam = theta + HALF_PI;
    } else if (area.value === AREA_ENUM.AREA_1) {
      lp.lam = (theta < 0.0 ? theta + SPI : theta - SPI);
    } else if (area.value === AREA_ENUM.AREA_2) {
      lp.lam = theta - HALF_PI;
    } else /* area.value == AREA_ENUM.AREA_3 */ {
      lp.lam = theta;
    }
  } else if (this.face === FACE_ENUM.BOTTOM) {
    phi = Math.acos(cosphi);
    lp.phi = phi - HALF_PI;
    if (area.value === AREA_ENUM.AREA_0) {
      lp.lam = -theta + HALF_PI;
    } else if (area.value === AREA_ENUM.AREA_1) {
      lp.lam = -theta;
    } else if (area.value === AREA_ENUM.AREA_2) {
      lp.lam = -theta - HALF_PI;
    } else /* area.value == AREA_ENUM.AREA_3 */ {
      lp.lam = (theta < 0.0 ? -theta - SPI : -theta + SPI);
    }
  } else {
    /* Compute phi and lam via cartesian unit sphere coordinates. */
    var q, r, s;
    q = cosphi;
    t = q * q;
    if (t >= 1) {
      s = 0;
    } else {
      s = Math.sqrt(1 - t) * Math.sin(theta);
    }
    t += s * s;
    if (t >= 1) {
      r = 0;
    } else {
      r = Math.sqrt(1 - t);
    }
    /* Rotate q,r,s into the correct area. */
    if (area.value === AREA_ENUM.AREA_1) {
      t = r;
      r = -s;
      s = t;
    } else if (area.value === AREA_ENUM.AREA_2) {
      r = -r;
      s = -s;
    } else if (area.value === AREA_ENUM.AREA_3) {
      t = r;
      r = s;
      s = -t;
    }
    /* Rotate q,r,s into the correct cube face. */
    if (this.face === FACE_ENUM.RIGHT) {
      t = q;
      q = -r;
      r = t;
    } else if (this.face === FACE_ENUM.BACK) {
      q = -q;
      r = -r;
    } else if (this.face === FACE_ENUM.LEFT) {
      t = q;
      q = r;
      r = -t;
    }
    /* Now compute phi and lam from the unit sphere coordinates. */
    lp.phi = Math.acos(-s) - HALF_PI;
    lp.lam = Math.atan2(r, q);
    if (this.face === FACE_ENUM.RIGHT) {
      lp.lam = qsc_shift_lon_origin(lp.lam, -HALF_PI);
    } else if (this.face === FACE_ENUM.BACK) {
      lp.lam = qsc_shift_lon_origin(lp.lam, -SPI);
    } else if (this.face === FACE_ENUM.LEFT) {
      lp.lam = qsc_shift_lon_origin(lp.lam, +HALF_PI);
    }
  }

  /* Apply the shift from the sphere to the ellipsoid as described
   * in [LK12]. */
  if (this.es !== 0) {
    var invert_sign;
    var tanphi, xa;
    invert_sign = (lp.phi < 0 ? 1 : 0);
    tanphi = Math.tan(lp.phi);
    xa = this.b / Math.sqrt(tanphi * tanphi + this.one_minus_f_squared);
    lp.phi = Math.atan(Math.sqrt(this.a * this.a - xa * xa) / (this.one_minus_f * xa));
    if (invert_sign) {
      lp.phi = -lp.phi;
    }
  }

  lp.lam += this.long0;
  p.x = lp.lam;
  p.y = lp.phi;
  return p;
}

/* Helper function for forward projection: compute the theta angle
 * and determine the area number. */
function qsc_fwd_equat_face_theta(phi, y, x, area) {
  var theta;
  if (phi < EPSLN) {
    area.value = AREA_ENUM.AREA_0;
    theta = 0.0;
  } else {
    theta = Math.atan2(y, x);
    if (Math.abs(theta) <= FORTPI) {
      area.value = AREA_ENUM.AREA_0;
    } else if (theta > FORTPI && theta <= HALF_PI + FORTPI) {
      area.value = AREA_ENUM.AREA_1;
      theta -= HALF_PI;
    } else if (theta > HALF_PI + FORTPI || theta <= -(HALF_PI + FORTPI)) {
      area.value = AREA_ENUM.AREA_2;
      theta = (theta >= 0.0 ? theta - SPI : theta + SPI);
    } else {
      area.value = AREA_ENUM.AREA_3;
      theta += HALF_PI;
    }
  }
  return theta;
}

/* Helper function: shift the longitude. */
function qsc_shift_lon_origin(lon, offset) {
  var slon = lon + offset;
  if (slon < -SPI) {
    slon += TWO_PI;
  } else if (slon > +SPI) {
    slon -= TWO_PI;
  }
  return slon;
}

var qsc_names = ['Quadrilateralized Spherical Cube', 'Quadrilateralized_Spherical_Cube', 'qsc'];
/* harmony default export */ const qsc = ({
  init: qsc_init,
  forward: qsc_forward,
  inverse: qsc_inverse,
  names: qsc_names
});

;// ./node_modules/proj4/lib/projections/robin.js
// Robinson projection
// Based on https://github.com/OSGeo/proj.4/blob/master/src/PJ_robin.c
// Polynomial coeficients from http://article.gmane.org/gmane.comp.gis.proj-4.devel/6039




var COEFS_X = [
  [1.0000, 2.2199e-17, -7.15515e-05, 3.1103e-06],
  [0.9986, -0.000482243, -2.4897e-05, -1.3309e-06],
  [0.9954, -0.00083103, -4.48605e-05, -9.86701e-07],
  [0.9900, -0.00135364, -5.9661e-05, 3.6777e-06],
  [0.9822, -0.00167442, -4.49547e-06, -5.72411e-06],
  [0.9730, -0.00214868, -9.03571e-05, 1.8736e-08],
  [0.9600, -0.00305085, -9.00761e-05, 1.64917e-06],
  [0.9427, -0.00382792, -6.53386e-05, -2.6154e-06],
  [0.9216, -0.00467746, -0.00010457, 4.81243e-06],
  [0.8962, -0.00536223, -3.23831e-05, -5.43432e-06],
  [0.8679, -0.00609363, -0.000113898, 3.32484e-06],
  [0.8350, -0.00698325, -6.40253e-05, 9.34959e-07],
  [0.7986, -0.00755338, -5.00009e-05, 9.35324e-07],
  [0.7597, -0.00798324, -3.5971e-05, -2.27626e-06],
  [0.7186, -0.00851367, -7.01149e-05, -8.6303e-06],
  [0.6732, -0.00986209, -0.000199569, 1.91974e-05],
  [0.6213, -0.010418, 8.83923e-05, 6.24051e-06],
  [0.5722, -0.00906601, 0.000182, 6.24051e-06],
  [0.5322, -0.00677797, 0.000275608, 6.24051e-06]
];

var COEFS_Y = [
  [-5.20417e-18, 0.0124, 1.21431e-18, -8.45284e-11],
  [0.0620, 0.0124, -1.26793e-09, 4.22642e-10],
  [0.1240, 0.0124, 5.07171e-09, -1.60604e-09],
  [0.1860, 0.0123999, -1.90189e-08, 6.00152e-09],
  [0.2480, 0.0124002, 7.10039e-08, -2.24e-08],
  [0.3100, 0.0123992, -2.64997e-07, 8.35986e-08],
  [0.3720, 0.0124029, 9.88983e-07, -3.11994e-07],
  [0.4340, 0.0123893, -3.69093e-06, -4.35621e-07],
  [0.4958, 0.0123198, -1.02252e-05, -3.45523e-07],
  [0.5571, 0.0121916, -1.54081e-05, -5.82288e-07],
  [0.6176, 0.0119938, -2.41424e-05, -5.25327e-07],
  [0.6769, 0.011713, -3.20223e-05, -5.16405e-07],
  [0.7346, 0.0113541, -3.97684e-05, -6.09052e-07],
  [0.7903, 0.0109107, -4.89042e-05, -1.04739e-06],
  [0.8435, 0.0103431, -6.4615e-05, -1.40374e-09],
  [0.8936, 0.00969686, -6.4636e-05, -8.547e-06],
  [0.9394, 0.00840947, -0.000192841, -4.2106e-06],
  [0.9761, 0.00616527, -0.000256, -4.2106e-06],
  [1.0000, 0.00328947, -0.000319159, -4.2106e-06]
];

var FXC = 0.8487;
var FYC = 1.3523;
var C1 = R2D / 5; // rad to 5-degree interval
var RC1 = 1 / C1;
var NODES = 18;

var poly3_val = function (coefs, x) {
  return coefs[0] + x * (coefs[1] + x * (coefs[2] + x * coefs[3]));
};

var poly3_der = function (coefs, x) {
  return coefs[1] + x * (2 * coefs[2] + x * 3 * coefs[3]);
};

function newton_rapshon(f_df, start, max_err, iters) {
  var x = start;
  for (; iters; --iters) {
    var upd = f_df(x);
    x -= upd;
    if (Math.abs(upd) < max_err) {
      break;
    }
  }
  return x;
}

function robin_init() {
  this.x0 = this.x0 || 0;
  this.y0 = this.y0 || 0;
  this.long0 = this.long0 || 0;
  this.es = 0;
  this.title = this.title || 'Robinson';
}

function robin_forward(ll) {
  var lon = adjust_lon(ll.x - this.long0);

  var dphi = Math.abs(ll.y);
  var i = Math.floor(dphi * C1);
  if (i < 0) {
    i = 0;
  } else if (i >= NODES) {
    i = NODES - 1;
  }
  dphi = R2D * (dphi - RC1 * i);
  var xy = {
    x: poly3_val(COEFS_X[i], dphi) * lon,
    y: poly3_val(COEFS_Y[i], dphi)
  };
  if (ll.y < 0) {
    xy.y = -xy.y;
  }

  xy.x = xy.x * this.a * FXC + this.x0;
  xy.y = xy.y * this.a * FYC + this.y0;
  return xy;
}

function robin_inverse(xy) {
  var ll = {
    x: (xy.x - this.x0) / (this.a * FXC),
    y: Math.abs(xy.y - this.y0) / (this.a * FYC)
  };

  if (ll.y >= 1) { // pathologic case
    ll.x /= COEFS_X[NODES][0];
    ll.y = xy.y < 0 ? -HALF_PI : HALF_PI;
  } else {
    // find table interval
    var i = Math.floor(ll.y * NODES);
    if (i < 0) {
      i = 0;
    } else if (i >= NODES) {
      i = NODES - 1;
    }
    for (;;) {
      if (COEFS_Y[i][0] > ll.y) {
        --i;
      } else if (COEFS_Y[i + 1][0] <= ll.y) {
        ++i;
      } else {
        break;
      }
    }
    // linear interpolation in 5 degree interval
    var coefs = COEFS_Y[i];
    var t = 5 * (ll.y - coefs[0]) / (COEFS_Y[i + 1][0] - coefs[0]);
    // find t so that poly3_val(coefs, t) = ll.y
    t = newton_rapshon(function (x) {
      return (poly3_val(coefs, x) - ll.y) / poly3_der(coefs, x);
    }, t, EPSLN, 100);

    ll.x /= poly3_val(COEFS_X[i], t);
    ll.y = (5 * i + t) * D2R;
    if (xy.y < 0) {
      ll.y = -ll.y;
    }
  }

  ll.x = adjust_lon(ll.x + this.long0);
  return ll;
}

var robin_names = ['Robinson', 'robin'];
/* harmony default export */ const robin = ({
  init: robin_init,
  forward: robin_forward,
  inverse: robin_inverse,
  names: robin_names
});

;// ./node_modules/proj4/lib/projections/geocent.js


function geocent_init() {
  this.name = 'geocent';
}

function geocent_forward(p) {
  var point = geodeticToGeocentric(p, this.es, this.a);
  return point;
}

function geocent_inverse(p) {
  var point = geocentricToGeodetic(p, this.es, this.a, this.b);
  return point;
}

var geocent_names = ['Geocentric', 'geocentric', 'geocent', 'Geocent'];
/* harmony default export */ const geocent = ({
  init: geocent_init,
  forward: geocent_forward,
  inverse: geocent_inverse,
  names: geocent_names
});

;// ./node_modules/proj4/lib/projections/tpers.js



/**
 * @typedef {Object} LocalThis
 * @property {number} mode
 * @property {number} sinph0
 * @property {number} cosph0
 * @property {number} pn1
 * @property {number} h
 * @property {number} rp
 * @property {number} p
 * @property {number} h1
 * @property {number} pfact
 * @property {number} es
 * @property {number} tilt
 * @property {number} azi
 * @property {number} cg
 * @property {number} sg
 * @property {number} cw
 * @property {number} sw
 */

var mode = {
  N_POLE: 0,
  S_POLE: 1,
  EQUIT: 2,
  OBLIQ: 3
};

var params = {
  h: { def: 100000, num: true }, // default is Karman line, no default in PROJ.7
  azi: { def: 0, num: true, degrees: true }, // default is North
  tilt: { def: 0, num: true, degrees: true }, // default is Nadir
  long0: { def: 0, num: true }, // default is Greenwich, conversion to rad is automatic
  lat0: { def: 0, num: true } // default is Equator, conversion to rad is automatic
};

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function tpers_init() {
  Object.keys(params).forEach(function (p) {
    if (typeof this[p] === 'undefined') {
      this[p] = params[p].def;
    } else if (params[p].num && isNaN(this[p])) {
      throw new Error('Invalid parameter value, must be numeric ' + p + ' = ' + this[p]);
    } else if (params[p].num) {
      this[p] = parseFloat(this[p]);
    }
    if (params[p].degrees) {
      this[p] = this[p] * D2R;
    }
  }.bind(this));

  if (Math.abs((Math.abs(this.lat0) - HALF_PI)) < EPSLN) {
    this.mode = this.lat0 < 0 ? mode.S_POLE : mode.N_POLE;
  } else if (Math.abs(this.lat0) < EPSLN) {
    this.mode = mode.EQUIT;
  } else {
    this.mode = mode.OBLIQ;
    this.sinph0 = Math.sin(this.lat0);
    this.cosph0 = Math.cos(this.lat0);
  }

  this.pn1 = this.h / this.a; // Normalize relative to the Earth's radius

  if (this.pn1 <= 0 || this.pn1 > 1e10) {
    throw new Error('Invalid height');
  }

  this.p = 1 + this.pn1;
  this.rp = 1 / this.p;
  this.h1 = 1 / this.pn1;
  this.pfact = (this.p + 1) * this.h1;
  this.es = 0;

  var omega = this.tilt;
  var gamma = this.azi;
  this.cg = Math.cos(gamma);
  this.sg = Math.sin(gamma);
  this.cw = Math.cos(omega);
  this.sw = Math.sin(omega);
}

function tpers_forward(p) {
  p.x -= this.long0;
  var sinphi = Math.sin(p.y);
  var cosphi = Math.cos(p.y);
  var coslam = Math.cos(p.x);
  var x, y;
  switch (this.mode) {
    case mode.OBLIQ:
      y = this.sinph0 * sinphi + this.cosph0 * cosphi * coslam;
      break;
    case mode.EQUIT:
      y = cosphi * coslam;
      break;
    case mode.S_POLE:
      y = -sinphi;
      break;
    case mode.N_POLE:
      y = sinphi;
      break;
  }
  y = this.pn1 / (this.p - y);
  x = y * cosphi * Math.sin(p.x);

  switch (this.mode) {
    case mode.OBLIQ:
      y *= this.cosph0 * sinphi - this.sinph0 * cosphi * coslam;
      break;
    case mode.EQUIT:
      y *= sinphi;
      break;
    case mode.N_POLE:
      y *= -(cosphi * coslam);
      break;
    case mode.S_POLE:
      y *= cosphi * coslam;
      break;
  }

  // Tilt
  var yt, ba;
  yt = y * this.cg + x * this.sg;
  ba = 1 / (yt * this.sw * this.h1 + this.cw);
  x = (x * this.cg - y * this.sg) * this.cw * ba;
  y = yt * ba;

  p.x = x * this.a;
  p.y = y * this.a;
  return p;
}

function tpers_inverse(p) {
  p.x /= this.a;
  p.y /= this.a;
  var r = { x: p.x, y: p.y };

  // Un-Tilt
  var bm, bq, yt;
  yt = 1 / (this.pn1 - p.y * this.sw);
  bm = this.pn1 * p.x * yt;
  bq = this.pn1 * p.y * this.cw * yt;
  p.x = bm * this.cg + bq * this.sg;
  p.y = bq * this.cg - bm * this.sg;

  var rh = hypot(p.x, p.y);
  if (Math.abs(rh) < EPSLN) {
    r.x = 0;
    r.y = p.y;
  } else {
    var cosz, sinz;
    sinz = 1 - rh * rh * this.pfact;
    sinz = (this.p - Math.sqrt(sinz)) / (this.pn1 / rh + rh / this.pn1);
    cosz = Math.sqrt(1 - sinz * sinz);
    switch (this.mode) {
      case mode.OBLIQ:
        r.y = Math.asin(cosz * this.sinph0 + p.y * sinz * this.cosph0 / rh);
        p.y = (cosz - this.sinph0 * Math.sin(r.y)) * rh;
        p.x *= sinz * this.cosph0;
        break;
      case mode.EQUIT:
        r.y = Math.asin(p.y * sinz / rh);
        p.y = cosz * rh;
        p.x *= sinz;
        break;
      case mode.N_POLE:
        r.y = Math.asin(cosz);
        p.y = -p.y;
        break;
      case mode.S_POLE:
        r.y = -Math.asin(cosz);
        break;
    }
    r.x = Math.atan2(p.x, p.y);
  }

  p.x = r.x + this.long0;
  p.y = r.y;
  return p;
}

var tpers_names = ['Tilted_Perspective', 'tpers'];
/* harmony default export */ const tpers = ({
  init: tpers_init,
  forward: tpers_forward,
  inverse: tpers_inverse,
  names: tpers_names
});

;// ./node_modules/proj4/lib/projections/geos.js


/**
 * @typedef {Object} LocalThis
 * @property {1 | 0} flip_axis
 * @property {number} h
 * @property {number} radius_g_1
 * @property {number} radius_g
 * @property {number} radius_p
 * @property {number} radius_p2
 * @property {number} radius_p_inv2
 * @property {'ellipse'|'sphere'} shape
 * @property {number} C
 * @property {string} sweep
 * @property {number} es
 */

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function geos_init() {
  this.flip_axis = (this.sweep === 'x' ? 1 : 0);
  this.h = Number(this.h);
  this.radius_g_1 = this.h / this.a;

  if (this.radius_g_1 <= 0 || this.radius_g_1 > 1e10) {
    throw new Error();
  }

  this.radius_g = 1.0 + this.radius_g_1;
  this.C = this.radius_g * this.radius_g - 1.0;

  if (this.es !== 0.0) {
    var one_es = 1.0 - this.es;
    var rone_es = 1 / one_es;

    this.radius_p = Math.sqrt(one_es);
    this.radius_p2 = one_es;
    this.radius_p_inv2 = rone_es;

    this.shape = 'ellipse'; // Use as a condition in the forward and inverse functions.
  } else {
    this.radius_p = 1.0;
    this.radius_p2 = 1.0;
    this.radius_p_inv2 = 1.0;

    this.shape = 'sphere'; // Use as a condition in the forward and inverse functions.
  }

  if (!this.title) {
    this.title = 'Geostationary Satellite View';
  }
}

function geos_forward(p) {
  var lon = p.x;
  var lat = p.y;
  var tmp, v_x, v_y, v_z;
  lon = lon - this.long0;

  if (this.shape === 'ellipse') {
    lat = Math.atan(this.radius_p2 * Math.tan(lat));
    var r = this.radius_p / hypot(this.radius_p * Math.cos(lat), Math.sin(lat));

    v_x = r * Math.cos(lon) * Math.cos(lat);
    v_y = r * Math.sin(lon) * Math.cos(lat);
    v_z = r * Math.sin(lat);

    if (((this.radius_g - v_x) * v_x - v_y * v_y - v_z * v_z * this.radius_p_inv2) < 0.0) {
      p.x = Number.NaN;
      p.y = Number.NaN;
      return p;
    }

    tmp = this.radius_g - v_x;
    if (this.flip_axis) {
      p.x = this.radius_g_1 * Math.atan(v_y / hypot(v_z, tmp));
      p.y = this.radius_g_1 * Math.atan(v_z / tmp);
    } else {
      p.x = this.radius_g_1 * Math.atan(v_y / tmp);
      p.y = this.radius_g_1 * Math.atan(v_z / hypot(v_y, tmp));
    }
  } else if (this.shape === 'sphere') {
    tmp = Math.cos(lat);
    v_x = Math.cos(lon) * tmp;
    v_y = Math.sin(lon) * tmp;
    v_z = Math.sin(lat);
    tmp = this.radius_g - v_x;

    if (this.flip_axis) {
      p.x = this.radius_g_1 * Math.atan(v_y / hypot(v_z, tmp));
      p.y = this.radius_g_1 * Math.atan(v_z / tmp);
    } else {
      p.x = this.radius_g_1 * Math.atan(v_y / tmp);
      p.y = this.radius_g_1 * Math.atan(v_z / hypot(v_y, tmp));
    }
  }
  p.x = p.x * this.a;
  p.y = p.y * this.a;
  return p;
}

function geos_inverse(p) {
  var v_x = -1.0;
  var v_y = 0.0;
  var v_z = 0.0;
  var a, b, det, k;

  p.x = p.x / this.a;
  p.y = p.y / this.a;

  if (this.shape === 'ellipse') {
    if (this.flip_axis) {
      v_z = Math.tan(p.y / this.radius_g_1);
      v_y = Math.tan(p.x / this.radius_g_1) * hypot(1.0, v_z);
    } else {
      v_y = Math.tan(p.x / this.radius_g_1);
      v_z = Math.tan(p.y / this.radius_g_1) * hypot(1.0, v_y);
    }

    var v_zp = v_z / this.radius_p;
    a = v_y * v_y + v_zp * v_zp + v_x * v_x;
    b = 2 * this.radius_g * v_x;
    det = (b * b) - 4 * a * this.C;

    if (det < 0.0) {
      p.x = Number.NaN;
      p.y = Number.NaN;
      return p;
    }

    k = (-b - Math.sqrt(det)) / (2.0 * a);
    v_x = this.radius_g + k * v_x;
    v_y *= k;
    v_z *= k;

    p.x = Math.atan2(v_y, v_x);
    p.y = Math.atan(v_z * Math.cos(p.x) / v_x);
    p.y = Math.atan(this.radius_p_inv2 * Math.tan(p.y));
  } else if (this.shape === 'sphere') {
    if (this.flip_axis) {
      v_z = Math.tan(p.y / this.radius_g_1);
      v_y = Math.tan(p.x / this.radius_g_1) * Math.sqrt(1.0 + v_z * v_z);
    } else {
      v_y = Math.tan(p.x / this.radius_g_1);
      v_z = Math.tan(p.y / this.radius_g_1) * Math.sqrt(1.0 + v_y * v_y);
    }

    a = v_y * v_y + v_z * v_z + v_x * v_x;
    b = 2 * this.radius_g * v_x;
    det = (b * b) - 4 * a * this.C;
    if (det < 0.0) {
      p.x = Number.NaN;
      p.y = Number.NaN;
      return p;
    }

    k = (-b - Math.sqrt(det)) / (2.0 * a);
    v_x = this.radius_g + k * v_x;
    v_y *= k;
    v_z *= k;

    p.x = Math.atan2(v_y, v_x);
    p.y = Math.atan(v_z * Math.cos(p.x) / v_x);
  }
  p.x = p.x + this.long0;
  return p;
}

var geos_names = ['Geostationary Satellite View', 'Geostationary_Satellite', 'geos'];
/* harmony default export */ const geos = ({
  init: geos_init,
  forward: geos_forward,
  inverse: geos_inverse,
  names: geos_names
});

;// ./node_modules/proj4/lib/projections/eqearth.js
/**
 * Copyright 2018 Bernie Jenny, Monash University, Melbourne, Australia.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Equal Earth is a projection inspired by the Robinson projection, but unlike
 * the Robinson projection retains the relative size of areas. The projection
 * was designed in 2018 by Bojan Savric, Tom Patterson and Bernhard Jenny.
 *
 * Publication:
 * Bojan Savric, Tom Patterson & Bernhard Jenny (2018). The Equal Earth map
 * projection, International Journal of Geographical Information Science,
 * DOI: 10.1080/13658816.2018.1504949
 *
 * Code released August 2018
 * Ported to JavaScript and adapted for mapshaper-proj by Matthew Bloch August 2018
 * Modified for proj4js by Andreas Hocevar by Andreas Hocevar March 2024
 */



var A1 = 1.340264,
  A2 = -0.081106,
  A3 = 0.000893,
  A4 = 0.003796,
  M = Math.sqrt(3) / 2.0;

function eqearth_init() {
  this.es = 0;
  this.long0 = this.long0 !== undefined ? this.long0 : 0;
}

function eqearth_forward(p) {
  var lam = adjust_lon(p.x - this.long0);
  var phi = p.y;
  var paramLat = Math.asin(M * Math.sin(phi)),
    paramLatSq = paramLat * paramLat,
    paramLatPow6 = paramLatSq * paramLatSq * paramLatSq;
  p.x = lam * Math.cos(paramLat)
    / (M * (A1 + 3 * A2 * paramLatSq + paramLatPow6 * (7 * A3 + 9 * A4 * paramLatSq)));
  p.y = paramLat * (A1 + A2 * paramLatSq + paramLatPow6 * (A3 + A4 * paramLatSq));

  p.x = this.a * p.x + this.x0;
  p.y = this.a * p.y + this.y0;
  return p;
}

function eqearth_inverse(p) {
  p.x = (p.x - this.x0) / this.a;
  p.y = (p.y - this.y0) / this.a;

  var EPS = 1e-9,
    NITER = 12,
    paramLat = p.y,
    paramLatSq, paramLatPow6, fy, fpy, dlat, i;

  for (i = 0; i < NITER; ++i) {
    paramLatSq = paramLat * paramLat;
    paramLatPow6 = paramLatSq * paramLatSq * paramLatSq;
    fy = paramLat * (A1 + A2 * paramLatSq + paramLatPow6 * (A3 + A4 * paramLatSq)) - p.y;
    fpy = A1 + 3 * A2 * paramLatSq + paramLatPow6 * (7 * A3 + 9 * A4 * paramLatSq);
    paramLat -= dlat = fy / fpy;
    if (Math.abs(dlat) < EPS) {
      break;
    }
  }
  paramLatSq = paramLat * paramLat;
  paramLatPow6 = paramLatSq * paramLatSq * paramLatSq;
  p.x = M * p.x * (A1 + 3 * A2 * paramLatSq + paramLatPow6 * (7 * A3 + 9 * A4 * paramLatSq))
    / Math.cos(paramLat);
  p.y = Math.asin(Math.sin(paramLat) / M);

  p.x = adjust_lon(p.x + this.long0);
  return p;
}

var eqearth_names = ['eqearth', 'Equal Earth', 'Equal_Earth'];
/* harmony default export */ const eqearth = ({
  init: eqearth_init,
  forward: eqearth_forward,
  inverse: eqearth_inverse,
  names: eqearth_names
});

;// ./node_modules/proj4/lib/projections/bonne.js








/**
 * @typedef {Object} LocalThis
 * @property {number} phi1
 * @property {number} cphi1
 * @property {number} es
 * @property {Array<number>} en
 * @property {number} m1
 * @property {number} am1
 */

var EPS10 = 1e-10;

/** @this {import('../defs.js').ProjectionDefinition & LocalThis} */
function bonne_init() {
  var c;

  this.phi1 = this.lat1;
  if (Math.abs(this.phi1) < EPS10) {
    throw new Error();
  }
  if (this.es) {
    this.en = pj_enfn(this.es);
    this.m1 = pj_mlfn(this.phi1, this.am1 = Math.sin(this.phi1),
      c = Math.cos(this.phi1), this.en);
    this.am1 = c / (Math.sqrt(1 - this.es * this.am1 * this.am1) * this.am1);
    this.inverse = e_inv;
    this.forward = e_fwd;
  } else {
    if (Math.abs(this.phi1) + EPS10 >= HALF_PI) {
      this.cphi1 = 0;
    } else {
      this.cphi1 = 1 / Math.tan(this.phi1);
    }
    this.inverse = s_inv;
    this.forward = s_fwd;
  }
}

function e_fwd(p) {
  var lam = adjust_lon(p.x - (this.long0 || 0));
  var phi = p.y;
  var rh, E, c;
  rh = this.am1 + this.m1 - pj_mlfn(phi, E = Math.sin(phi), c = Math.cos(phi), this.en);
  E = c * lam / (rh * Math.sqrt(1 - this.es * E * E));
  p.x = rh * Math.sin(E);
  p.y = this.am1 - rh * Math.cos(E);

  p.x = this.a * p.x + (this.x0 || 0);
  p.y = this.a * p.y + (this.y0 || 0);
  return p;
}

function e_inv(p) {
  p.x = (p.x - (this.x0 || 0)) / this.a;
  p.y = (p.y - (this.y0 || 0)) / this.a;

  var s, rh, lam, phi;
  rh = hypot(p.x, p.y = this.am1 - p.y);
  phi = pj_inv_mlfn(this.am1 + this.m1 - rh, this.es, this.en);
  if ((s = Math.abs(phi)) < HALF_PI) {
    s = Math.sin(phi);
    lam = rh * Math.atan2(p.x, p.y) * Math.sqrt(1 - this.es * s * s) / Math.cos(phi);
  } else if (Math.abs(s - HALF_PI) <= EPS10) {
    lam = 0;
  } else {
    throw new Error();
  }
  p.x = adjust_lon(lam + (this.long0 || 0));
  p.y = adjust_lat(phi);
  return p;
}

function s_fwd(p) {
  var lam = adjust_lon(p.x - (this.long0 || 0));
  var phi = p.y;
  var E, rh;
  rh = this.cphi1 + this.phi1 - phi;
  if (Math.abs(rh) > EPS10) {
    p.x = rh * Math.sin(E = lam * Math.cos(phi) / rh);
    p.y = this.cphi1 - rh * Math.cos(E);
  } else {
    p.x = p.y = 0;
  }

  p.x = this.a * p.x + (this.x0 || 0);
  p.y = this.a * p.y + (this.y0 || 0);
  return p;
}

function s_inv(p) {
  p.x = (p.x - (this.x0 || 0)) / this.a;
  p.y = (p.y - (this.y0 || 0)) / this.a;

  var lam, phi;
  var rh = hypot(p.x, p.y = this.cphi1 - p.y);
  phi = this.cphi1 + this.phi1 - rh;
  if (Math.abs(phi) > HALF_PI) {
    throw new Error();
  }
  if (Math.abs(Math.abs(phi) - HALF_PI) <= EPS10) {
    lam = 0;
  } else {
    lam = rh * Math.atan2(p.x, p.y) / Math.cos(phi);
  }
  p.x = adjust_lon(lam + (this.long0 || 0));
  p.y = adjust_lat(phi);
  return p;
}

var bonne_names = ['bonne', 'Bonne (Werner lat_1=90)'];
/* harmony default export */ const bonne = ({
  init: bonne_init,
  names: bonne_names
});

;// ./node_modules/proj4/projs.js































/* harmony default export */ function proj4_projs(proj4) {
  proj4.Proj.projections.add(tmerc);
  proj4.Proj.projections.add(etmerc);
  proj4.Proj.projections.add(utm);
  proj4.Proj.projections.add(sterea);
  proj4.Proj.projections.add(stere);
  proj4.Proj.projections.add(somerc);
  proj4.Proj.projections.add(omerc);
  proj4.Proj.projections.add(lcc);
  proj4.Proj.projections.add(krovak);
  proj4.Proj.projections.add(cass);
  proj4.Proj.projections.add(laea);
  proj4.Proj.projections.add(aea);
  proj4.Proj.projections.add(gnom);
  proj4.Proj.projections.add(cea);
  proj4.Proj.projections.add(eqc);
  proj4.Proj.projections.add(poly);
  proj4.Proj.projections.add(nzmg);
  proj4.Proj.projections.add(mill);
  proj4.Proj.projections.add(sinu);
  proj4.Proj.projections.add(moll);
  proj4.Proj.projections.add(eqdc);
  proj4.Proj.projections.add(vandg);
  proj4.Proj.projections.add(aeqd);
  proj4.Proj.projections.add(ortho);
  proj4.Proj.projections.add(qsc);
  proj4.Proj.projections.add(robin);
  proj4.Proj.projections.add(geocent);
  proj4.Proj.projections.add(tpers);
  proj4.Proj.projections.add(geos);
  proj4.Proj.projections.add(eqearth);
  proj4.Proj.projections.add(bonne);
}

;// ./node_modules/proj4/lib/index.js










/**
 * @typedef {Object} Mgrs
 * @property {(lonlat: [number, number]) => string} forward
 * @property {(mgrsString: string) => [number, number, number, number]} inverse
 * @property {(mgrsString: string) => [number, number]} toPoint
 */

/**
 * @typedef {import('./defs').ProjectionDefinition} ProjectionDefinition
 * @typedef {import('./core').TemplateCoordinates} TemplateCoordinates
 * @typedef {import('./core').InterfaceCoordinates} InterfaceCoordinates
 * @typedef {import('./core').Converter} Converter
 * @typedef {import('./Proj').DatumDefinition} DatumDefinition
 */

/**
 * @template {import('./core').TemplateCoordinates} T
 * @type {core<T> & {defaultDatum: string, Proj: typeof Proj, WGS84: Proj, Point: typeof Point, toPoint: typeof common, defs: typeof defs, nadgrid: typeof nadgrid, transform: typeof transform, mgrs: Mgrs, version: string}}
 */
const lib_proj4 = Object.assign(core, {
  defaultDatum: 'WGS84',
  Proj: Proj,
  WGS84: new Proj('WGS84'),
  Point: lib_Point,
  toPoint: toPoint,
  defs: lib_defs,
  nadgrid: nadgrid,
  transform: transform,
  mgrs: mgrs,
  version: '__VERSION__'
});
proj4_projs(lib_proj4);
/* harmony default export */ const lib = (lib_proj4);

;// ./node_modules/d3-selection/src/selector.js
function none() {}

/* harmony default export */ function selector(selector) {
  return selector == null ? none : function() {
    return this.querySelector(selector);
  };
}

;// ./node_modules/d3-selection/src/selection/select.js



/* harmony default export */ function selection_select(select) {
  if (typeof select !== "function") select = selector(select);

  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
      if ((node = group[i]) && (subnode = select.call(node, node.__data__, i, group))) {
        if ("__data__" in node) subnode.__data__ = node.__data__;
        subgroup[i] = subnode;
      }
    }
  }

  return new Selection(subgroups, this._parents);
}

;// ./node_modules/d3-selection/src/array.js
// Given something array like (or null), returns something that is strictly an
// array. This is used to ensure that array-like objects passed to d3.selectAll
// or selection.selectAll are converted into proper arrays when creating a
// selection; we don’t ever want to create a selection backed by a live
// HTMLCollection or NodeList. However, note that selection.selectAll will use a
// static NodeList as a group, since it safely derived from querySelectorAll.
function array(x) {
  return x == null ? [] : Array.isArray(x) ? x : Array.from(x);
}

;// ./node_modules/d3-selection/src/selectorAll.js
function empty() {
  return [];
}

/* harmony default export */ function selectorAll(selector) {
  return selector == null ? empty : function() {
    return this.querySelectorAll(selector);
  };
}

;// ./node_modules/d3-selection/src/selection/selectAll.js




function arrayAll(select) {
  return function() {
    return array(select.apply(this, arguments));
  };
}

/* harmony default export */ function selectAll(select) {
  if (typeof select === "function") select = arrayAll(select);
  else select = selectorAll(select);

  for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        subgroups.push(select.call(node, node.__data__, i, group));
        parents.push(node);
      }
    }
  }

  return new Selection(subgroups, parents);
}

;// ./node_modules/d3-selection/src/matcher.js
/* harmony default export */ function matcher(selector) {
  return function() {
    return this.matches(selector);
  };
}

function childMatcher(selector) {
  return function(node) {
    return node.matches(selector);
  };
}


;// ./node_modules/d3-selection/src/selection/selectChild.js


var find = Array.prototype.find;

function childFind(match) {
  return function() {
    return find.call(this.children, match);
  };
}

function childFirst() {
  return this.firstElementChild;
}

/* harmony default export */ function selectChild(match) {
  return this.select(match == null ? childFirst
      : childFind(typeof match === "function" ? match : childMatcher(match)));
}

;// ./node_modules/d3-selection/src/selection/selectChildren.js


var filter = Array.prototype.filter;

function children() {
  return Array.from(this.children);
}

function childrenFilter(match) {
  return function() {
    return filter.call(this.children, match);
  };
}

/* harmony default export */ function selectChildren(match) {
  return this.selectAll(match == null ? children
      : childrenFilter(typeof match === "function" ? match : childMatcher(match)));
}

;// ./node_modules/d3-selection/src/selection/filter.js



/* harmony default export */ function selection_filter(match) {
  if (typeof match !== "function") match = matcher(match);

  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
      if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
        subgroup.push(node);
      }
    }
  }

  return new Selection(subgroups, this._parents);
}

;// ./node_modules/d3-selection/src/selection/sparse.js
/* harmony default export */ function sparse(update) {
  return new Array(update.length);
}

;// ./node_modules/d3-selection/src/selection/enter.js



/* harmony default export */ function enter() {
  return new Selection(this._enter || this._groups.map(sparse), this._parents);
}

function EnterNode(parent, datum) {
  this.ownerDocument = parent.ownerDocument;
  this.namespaceURI = parent.namespaceURI;
  this._next = null;
  this._parent = parent;
  this.__data__ = datum;
}

EnterNode.prototype = {
  constructor: EnterNode,
  appendChild: function(child) { return this._parent.insertBefore(child, this._next); },
  insertBefore: function(child, next) { return this._parent.insertBefore(child, next); },
  querySelector: function(selector) { return this._parent.querySelector(selector); },
  querySelectorAll: function(selector) { return this._parent.querySelectorAll(selector); }
};

;// ./node_modules/d3-selection/src/constant.js
/* harmony default export */ function src_constant(x) {
  return function() {
    return x;
  };
}

;// ./node_modules/d3-selection/src/selection/data.js




function bindIndex(parent, group, enter, update, exit, data) {
  var i = 0,
      node,
      groupLength = group.length,
      dataLength = data.length;

  // Put any non-null nodes that fit into update.
  // Put any null nodes into enter.
  // Put any remaining data into enter.
  for (; i < dataLength; ++i) {
    if (node = group[i]) {
      node.__data__ = data[i];
      update[i] = node;
    } else {
      enter[i] = new EnterNode(parent, data[i]);
    }
  }

  // Put any non-null nodes that don’t fit into exit.
  for (; i < groupLength; ++i) {
    if (node = group[i]) {
      exit[i] = node;
    }
  }
}

function bindKey(parent, group, enter, update, exit, data, key) {
  var i,
      node,
      nodeByKeyValue = new Map,
      groupLength = group.length,
      dataLength = data.length,
      keyValues = new Array(groupLength),
      keyValue;

  // Compute the key for each node.
  // If multiple nodes have the same key, the duplicates are added to exit.
  for (i = 0; i < groupLength; ++i) {
    if (node = group[i]) {
      keyValues[i] = keyValue = key.call(node, node.__data__, i, group) + "";
      if (nodeByKeyValue.has(keyValue)) {
        exit[i] = node;
      } else {
        nodeByKeyValue.set(keyValue, node);
      }
    }
  }

  // Compute the key for each datum.
  // If there a node associated with this key, join and add it to update.
  // If there is not (or the key is a duplicate), add it to enter.
  for (i = 0; i < dataLength; ++i) {
    keyValue = key.call(parent, data[i], i, data) + "";
    if (node = nodeByKeyValue.get(keyValue)) {
      update[i] = node;
      node.__data__ = data[i];
      nodeByKeyValue.delete(keyValue);
    } else {
      enter[i] = new EnterNode(parent, data[i]);
    }
  }

  // Add any remaining nodes that were not bound to data to exit.
  for (i = 0; i < groupLength; ++i) {
    if ((node = group[i]) && (nodeByKeyValue.get(keyValues[i]) === node)) {
      exit[i] = node;
    }
  }
}

function data_datum(node) {
  return node.__data__;
}

/* harmony default export */ function data(value, key) {
  if (!arguments.length) return Array.from(this, data_datum);

  var bind = key ? bindKey : bindIndex,
      parents = this._parents,
      groups = this._groups;

  if (typeof value !== "function") value = src_constant(value);

  for (var m = groups.length, update = new Array(m), enter = new Array(m), exit = new Array(m), j = 0; j < m; ++j) {
    var parent = parents[j],
        group = groups[j],
        groupLength = group.length,
        data = arraylike(value.call(parent, parent && parent.__data__, j, parents)),
        dataLength = data.length,
        enterGroup = enter[j] = new Array(dataLength),
        updateGroup = update[j] = new Array(dataLength),
        exitGroup = exit[j] = new Array(groupLength);

    bind(parent, group, enterGroup, updateGroup, exitGroup, data, key);

    // Now connect the enter nodes to their following update node, such that
    // appendChild can insert the materialized enter node before this node,
    // rather than at the end of the parent node.
    for (var i0 = 0, i1 = 0, previous, next; i0 < dataLength; ++i0) {
      if (previous = enterGroup[i0]) {
        if (i0 >= i1) i1 = i0 + 1;
        while (!(next = updateGroup[i1]) && ++i1 < dataLength);
        previous._next = next || null;
      }
    }
  }

  update = new Selection(update, parents);
  update._enter = enter;
  update._exit = exit;
  return update;
}

// Given some data, this returns an array-like view of it: an object that
// exposes a length property and allows numeric indexing. Note that unlike
// selectAll, this isn’t worried about “live” collections because the resulting
// array will only be used briefly while data is being bound. (It is possible to
// cause the data to change while iterating by using a key function, but please
// don’t; we’d rather avoid a gratuitous copy.)
function arraylike(data) {
  return typeof data === "object" && "length" in data
    ? data // Array, TypedArray, NodeList, array-like
    : Array.from(data); // Map, Set, iterable, string, or anything else
}

;// ./node_modules/d3-selection/src/selection/exit.js



/* harmony default export */ function exit() {
  return new Selection(this._exit || this._groups.map(sparse), this._parents);
}

;// ./node_modules/d3-selection/src/selection/join.js
/* harmony default export */ function join(onenter, onupdate, onexit) {
  var enter = this.enter(), update = this, exit = this.exit();
  if (typeof onenter === "function") {
    enter = onenter(enter);
    if (enter) enter = enter.selection();
  } else {
    enter = enter.append(onenter + "");
  }
  if (onupdate != null) {
    update = onupdate(update);
    if (update) update = update.selection();
  }
  if (onexit == null) exit.remove(); else onexit(exit);
  return enter && update ? enter.merge(update).order() : update;
}

;// ./node_modules/d3-selection/src/selection/merge.js


/* harmony default export */ function merge(context) {
  var selection = context.selection ? context.selection() : context;

  for (var groups0 = this._groups, groups1 = selection._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j) {
    for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
      if (node = group0[i] || group1[i]) {
        merge[i] = node;
      }
    }
  }

  for (; j < m0; ++j) {
    merges[j] = groups0[j];
  }

  return new Selection(merges, this._parents);
}

;// ./node_modules/d3-selection/src/selection/order.js
/* harmony default export */ function order() {

  for (var groups = this._groups, j = -1, m = groups.length; ++j < m;) {
    for (var group = groups[j], i = group.length - 1, next = group[i], node; --i >= 0;) {
      if (node = group[i]) {
        if (next && node.compareDocumentPosition(next) ^ 4) next.parentNode.insertBefore(node, next);
        next = node;
      }
    }
  }

  return this;
}

;// ./node_modules/d3-selection/src/selection/sort.js


/* harmony default export */ function sort(compare) {
  if (!compare) compare = ascending;

  function compareNode(a, b) {
    return a && b ? compare(a.__data__, b.__data__) : !a - !b;
  }

  for (var groups = this._groups, m = groups.length, sortgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, sortgroup = sortgroups[j] = new Array(n), node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        sortgroup[i] = node;
      }
    }
    sortgroup.sort(compareNode);
  }

  return new Selection(sortgroups, this._parents).order();
}

function ascending(a, b) {
  return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
}

;// ./node_modules/d3-selection/src/selection/call.js
/* harmony default export */ function call() {
  var callback = arguments[0];
  arguments[0] = this;
  callback.apply(null, arguments);
  return this;
}

;// ./node_modules/d3-selection/src/selection/nodes.js
/* harmony default export */ function nodes() {
  return Array.from(this);
}

;// ./node_modules/d3-selection/src/selection/node.js
/* harmony default export */ function node() {

  for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
    for (var group = groups[j], i = 0, n = group.length; i < n; ++i) {
      var node = group[i];
      if (node) return node;
    }
  }

  return null;
}

;// ./node_modules/d3-selection/src/selection/size.js
/* harmony default export */ function size() {
  let size = 0;
  for (const node of this) ++size; // eslint-disable-line no-unused-vars
  return size;
}

;// ./node_modules/d3-selection/src/selection/empty.js
/* harmony default export */ function selection_empty() {
  return !this.node();
}

;// ./node_modules/d3-selection/src/selection/each.js
/* harmony default export */ function each(callback) {

  for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
    for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
      if (node = group[i]) callback.call(node, node.__data__, i, group);
    }
  }

  return this;
}

;// ./node_modules/d3-selection/src/namespaces.js
var xhtml = "http://www.w3.org/1999/xhtml";

/* harmony default export */ const namespaces = ({
  svg: "http://www.w3.org/2000/svg",
  xhtml: xhtml,
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace",
  xmlns: "http://www.w3.org/2000/xmlns/"
});

;// ./node_modules/d3-selection/src/namespace.js


/* harmony default export */ function namespace(name) {
  var prefix = name += "", i = prefix.indexOf(":");
  if (i >= 0 && (prefix = name.slice(0, i)) !== "xmlns") name = name.slice(i + 1);
  return namespaces.hasOwnProperty(prefix) ? {space: namespaces[prefix], local: name} : name; // eslint-disable-line no-prototype-builtins
}

;// ./node_modules/d3-selection/src/selection/attr.js


function attrRemove(name) {
  return function() {
    this.removeAttribute(name);
  };
}

function attrRemoveNS(fullname) {
  return function() {
    this.removeAttributeNS(fullname.space, fullname.local);
  };
}

function attrConstant(name, value) {
  return function() {
    this.setAttribute(name, value);
  };
}

function attrConstantNS(fullname, value) {
  return function() {
    this.setAttributeNS(fullname.space, fullname.local, value);
  };
}

function attrFunction(name, value) {
  return function() {
    var v = value.apply(this, arguments);
    if (v == null) this.removeAttribute(name);
    else this.setAttribute(name, v);
  };
}

function attrFunctionNS(fullname, value) {
  return function() {
    var v = value.apply(this, arguments);
    if (v == null) this.removeAttributeNS(fullname.space, fullname.local);
    else this.setAttributeNS(fullname.space, fullname.local, v);
  };
}

/* harmony default export */ function attr(name, value) {
  var fullname = namespace(name);

  if (arguments.length < 2) {
    var node = this.node();
    return fullname.local
        ? node.getAttributeNS(fullname.space, fullname.local)
        : node.getAttribute(fullname);
  }

  return this.each((value == null
      ? (fullname.local ? attrRemoveNS : attrRemove) : (typeof value === "function"
      ? (fullname.local ? attrFunctionNS : attrFunction)
      : (fullname.local ? attrConstantNS : attrConstant)))(fullname, value));
}

;// ./node_modules/d3-selection/src/window.js
/* harmony default export */ function src_window(node) {
  return (node.ownerDocument && node.ownerDocument.defaultView) // node is a Node
      || (node.document && node) // node is a Window
      || node.defaultView; // node is a Document
}

;// ./node_modules/d3-selection/src/selection/style.js


function styleRemove(name) {
  return function() {
    this.style.removeProperty(name);
  };
}

function styleConstant(name, value, priority) {
  return function() {
    this.style.setProperty(name, value, priority);
  };
}

function styleFunction(name, value, priority) {
  return function() {
    var v = value.apply(this, arguments);
    if (v == null) this.style.removeProperty(name);
    else this.style.setProperty(name, v, priority);
  };
}

/* harmony default export */ function style(name, value, priority) {
  return arguments.length > 1
      ? this.each((value == null
            ? styleRemove : typeof value === "function"
            ? styleFunction
            : styleConstant)(name, value, priority == null ? "" : priority))
      : styleValue(this.node(), name);
}

function styleValue(node, name) {
  return node.style.getPropertyValue(name)
      || src_window(node).getComputedStyle(node, null).getPropertyValue(name);
}

;// ./node_modules/d3-selection/src/selection/property.js
function propertyRemove(name) {
  return function() {
    delete this[name];
  };
}

function propertyConstant(name, value) {
  return function() {
    this[name] = value;
  };
}

function propertyFunction(name, value) {
  return function() {
    var v = value.apply(this, arguments);
    if (v == null) delete this[name];
    else this[name] = v;
  };
}

/* harmony default export */ function property(name, value) {
  return arguments.length > 1
      ? this.each((value == null
          ? propertyRemove : typeof value === "function"
          ? propertyFunction
          : propertyConstant)(name, value))
      : this.node()[name];
}

;// ./node_modules/d3-selection/src/selection/classed.js
function classArray(string) {
  return string.trim().split(/^|\s+/);
}

function classList(node) {
  return node.classList || new ClassList(node);
}

function ClassList(node) {
  this._node = node;
  this._names = classArray(node.getAttribute("class") || "");
}

ClassList.prototype = {
  add: function(name) {
    var i = this._names.indexOf(name);
    if (i < 0) {
      this._names.push(name);
      this._node.setAttribute("class", this._names.join(" "));
    }
  },
  remove: function(name) {
    var i = this._names.indexOf(name);
    if (i >= 0) {
      this._names.splice(i, 1);
      this._node.setAttribute("class", this._names.join(" "));
    }
  },
  contains: function(name) {
    return this._names.indexOf(name) >= 0;
  }
};

function classedAdd(node, names) {
  var list = classList(node), i = -1, n = names.length;
  while (++i < n) list.add(names[i]);
}

function classedRemove(node, names) {
  var list = classList(node), i = -1, n = names.length;
  while (++i < n) list.remove(names[i]);
}

function classedTrue(names) {
  return function() {
    classedAdd(this, names);
  };
}

function classedFalse(names) {
  return function() {
    classedRemove(this, names);
  };
}

function classedFunction(names, value) {
  return function() {
    (value.apply(this, arguments) ? classedAdd : classedRemove)(this, names);
  };
}

/* harmony default export */ function classed(name, value) {
  var names = classArray(name + "");

  if (arguments.length < 2) {
    var list = classList(this.node()), i = -1, n = names.length;
    while (++i < n) if (!list.contains(names[i])) return false;
    return true;
  }

  return this.each((typeof value === "function"
      ? classedFunction : value
      ? classedTrue
      : classedFalse)(names, value));
}

;// ./node_modules/d3-selection/src/selection/text.js
function textRemove() {
  this.textContent = "";
}

function textConstant(value) {
  return function() {
    this.textContent = value;
  };
}

function textFunction(value) {
  return function() {
    var v = value.apply(this, arguments);
    this.textContent = v == null ? "" : v;
  };
}

/* harmony default export */ function selection_text(value) {
  return arguments.length
      ? this.each(value == null
          ? textRemove : (typeof value === "function"
          ? textFunction
          : textConstant)(value))
      : this.node().textContent;
}

;// ./node_modules/d3-selection/src/selection/html.js
function htmlRemove() {
  this.innerHTML = "";
}

function htmlConstant(value) {
  return function() {
    this.innerHTML = value;
  };
}

function htmlFunction(value) {
  return function() {
    var v = value.apply(this, arguments);
    this.innerHTML = v == null ? "" : v;
  };
}

/* harmony default export */ function html(value) {
  return arguments.length
      ? this.each(value == null
          ? htmlRemove : (typeof value === "function"
          ? htmlFunction
          : htmlConstant)(value))
      : this.node().innerHTML;
}

;// ./node_modules/d3-selection/src/selection/raise.js
function raise() {
  if (this.nextSibling) this.parentNode.appendChild(this);
}

/* harmony default export */ function selection_raise() {
  return this.each(raise);
}

;// ./node_modules/d3-selection/src/selection/lower.js
function lower() {
  if (this.previousSibling) this.parentNode.insertBefore(this, this.parentNode.firstChild);
}

/* harmony default export */ function selection_lower() {
  return this.each(lower);
}

;// ./node_modules/d3-selection/src/creator.js



function creatorInherit(name) {
  return function() {
    var document = this.ownerDocument,
        uri = this.namespaceURI;
    return uri === xhtml && document.documentElement.namespaceURI === xhtml
        ? document.createElement(name)
        : document.createElementNS(uri, name);
  };
}

function creatorFixed(fullname) {
  return function() {
    return this.ownerDocument.createElementNS(fullname.space, fullname.local);
  };
}

/* harmony default export */ function creator(name) {
  var fullname = namespace(name);
  return (fullname.local
      ? creatorFixed
      : creatorInherit)(fullname);
}

;// ./node_modules/d3-selection/src/selection/append.js


/* harmony default export */ function append(name) {
  var create = typeof name === "function" ? name : creator(name);
  return this.select(function() {
    return this.appendChild(create.apply(this, arguments));
  });
}

;// ./node_modules/d3-selection/src/selection/insert.js



function constantNull() {
  return null;
}

/* harmony default export */ function insert(name, before) {
  var create = typeof name === "function" ? name : creator(name),
      select = before == null ? constantNull : typeof before === "function" ? before : selector(before);
  return this.select(function() {
    return this.insertBefore(create.apply(this, arguments), select.apply(this, arguments) || null);
  });
}

;// ./node_modules/d3-selection/src/selection/remove.js
function remove() {
  var parent = this.parentNode;
  if (parent) parent.removeChild(this);
}

/* harmony default export */ function selection_remove() {
  return this.each(remove);
}

;// ./node_modules/d3-selection/src/selection/clone.js
function selection_cloneShallow() {
  var clone = this.cloneNode(false), parent = this.parentNode;
  return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
}

function selection_cloneDeep() {
  var clone = this.cloneNode(true), parent = this.parentNode;
  return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
}

/* harmony default export */ function clone(deep) {
  return this.select(deep ? selection_cloneDeep : selection_cloneShallow);
}

;// ./node_modules/d3-selection/src/selection/datum.js
/* harmony default export */ function selection_datum(value) {
  return arguments.length
      ? this.property("__data__", value)
      : this.node().__data__;
}

;// ./node_modules/d3-selection/src/selection/on.js
function contextListener(listener) {
  return function(event) {
    listener.call(this, event, this.__data__);
  };
}

function parseTypenames(typenames) {
  return typenames.trim().split(/^|\s+/).map(function(t) {
    var name = "", i = t.indexOf(".");
    if (i >= 0) name = t.slice(i + 1), t = t.slice(0, i);
    return {type: t, name: name};
  });
}

function onRemove(typename) {
  return function() {
    var on = this.__on;
    if (!on) return;
    for (var j = 0, i = -1, m = on.length, o; j < m; ++j) {
      if (o = on[j], (!typename.type || o.type === typename.type) && o.name === typename.name) {
        this.removeEventListener(o.type, o.listener, o.options);
      } else {
        on[++i] = o;
      }
    }
    if (++i) on.length = i;
    else delete this.__on;
  };
}

function onAdd(typename, value, options) {
  return function() {
    var on = this.__on, o, listener = contextListener(value);
    if (on) for (var j = 0, m = on.length; j < m; ++j) {
      if ((o = on[j]).type === typename.type && o.name === typename.name) {
        this.removeEventListener(o.type, o.listener, o.options);
        this.addEventListener(o.type, o.listener = listener, o.options = options);
        o.value = value;
        return;
      }
    }
    this.addEventListener(typename.type, listener, options);
    o = {type: typename.type, name: typename.name, value: value, listener: listener, options: options};
    if (!on) this.__on = [o];
    else on.push(o);
  };
}

/* harmony default export */ function on(typename, value, options) {
  var typenames = parseTypenames(typename + ""), i, n = typenames.length, t;

  if (arguments.length < 2) {
    var on = this.node().__on;
    if (on) for (var j = 0, m = on.length, o; j < m; ++j) {
      for (i = 0, o = on[j]; i < n; ++i) {
        if ((t = typenames[i]).type === o.type && t.name === o.name) {
          return o.value;
        }
      }
    }
    return;
  }

  on = value ? onAdd : onRemove;
  for (i = 0; i < n; ++i) this.each(on(typenames[i], value, options));
  return this;
}

;// ./node_modules/d3-selection/src/selection/dispatch.js


function dispatchEvent(node, type, params) {
  var window = src_window(node),
      event = window.CustomEvent;

  if (typeof event === "function") {
    event = new event(type, params);
  } else {
    event = window.document.createEvent("Event");
    if (params) event.initEvent(type, params.bubbles, params.cancelable), event.detail = params.detail;
    else event.initEvent(type, false, false);
  }

  node.dispatchEvent(event);
}

function dispatchConstant(type, params) {
  return function() {
    return dispatchEvent(this, type, params);
  };
}

function dispatchFunction(type, params) {
  return function() {
    return dispatchEvent(this, type, params.apply(this, arguments));
  };
}

/* harmony default export */ function dispatch(type, params) {
  return this.each((typeof params === "function"
      ? dispatchFunction
      : dispatchConstant)(type, params));
}

;// ./node_modules/d3-selection/src/selection/iterator.js
/* harmony default export */ function* iterator() {
  for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
    for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
      if (node = group[i]) yield node;
    }
  }
}

;// ./node_modules/d3-selection/src/selection/index.js



































var root = [null];

function Selection(groups, parents) {
  this._groups = groups;
  this._parents = parents;
}

function selection() {
  return new Selection([[document.documentElement]], root);
}

function selection_selection() {
  return this;
}

Selection.prototype = selection.prototype = {
  constructor: Selection,
  select: selection_select,
  selectAll: selectAll,
  selectChild: selectChild,
  selectChildren: selectChildren,
  filter: selection_filter,
  data: data,
  enter: enter,
  exit: exit,
  join: join,
  merge: merge,
  selection: selection_selection,
  order: order,
  sort: sort,
  call: call,
  nodes: nodes,
  node: node,
  size: size,
  empty: selection_empty,
  each: each,
  attr: attr,
  style: style,
  property: property,
  classed: classed,
  text: selection_text,
  html: html,
  raise: selection_raise,
  lower: selection_lower,
  append: append,
  insert: insert,
  remove: selection_remove,
  clone: clone,
  datum: selection_datum,
  on: on,
  dispatch: dispatch,
  [Symbol.iterator]: iterator
};

/* harmony default export */ const src_selection = (selection);

;// ./node_modules/d3-selection/src/select.js


/* harmony default export */ function src_select(selector) {
  return typeof selector === "string"
      ? new Selection([[document.querySelector(selector)]], [document.documentElement])
      : new Selection([[selector]], root);
}

;// ./node_modules/d3-dispatch/src/dispatch.js
var noop = {value: () => {}};

function dispatch_dispatch() {
  for (var i = 0, n = arguments.length, _ = {}, t; i < n; ++i) {
    if (!(t = arguments[i] + "") || (t in _) || /[\s.]/.test(t)) throw new Error("illegal type: " + t);
    _[t] = [];
  }
  return new Dispatch(_);
}

function Dispatch(_) {
  this._ = _;
}

function dispatch_parseTypenames(typenames, types) {
  return typenames.trim().split(/^|\s+/).map(function(t) {
    var name = "", i = t.indexOf(".");
    if (i >= 0) name = t.slice(i + 1), t = t.slice(0, i);
    if (t && !types.hasOwnProperty(t)) throw new Error("unknown type: " + t);
    return {type: t, name: name};
  });
}

Dispatch.prototype = dispatch_dispatch.prototype = {
  constructor: Dispatch,
  on: function(typename, callback) {
    var _ = this._,
        T = dispatch_parseTypenames(typename + "", _),
        t,
        i = -1,
        n = T.length;

    // If no callback was specified, return the callback of the given type and name.
    if (arguments.length < 2) {
      while (++i < n) if ((t = (typename = T[i]).type) && (t = dispatch_get(_[t], typename.name))) return t;
      return;
    }

    // If a type was specified, set the callback for the given type and name.
    // Otherwise, if a null callback was specified, remove callbacks of the given name.
    if (callback != null && typeof callback !== "function") throw new Error("invalid callback: " + callback);
    while (++i < n) {
      if (t = (typename = T[i]).type) _[t] = set(_[t], typename.name, callback);
      else if (callback == null) for (t in _) _[t] = set(_[t], typename.name, null);
    }

    return this;
  },
  copy: function() {
    var copy = {}, _ = this._;
    for (var t in _) copy[t] = _[t].slice();
    return new Dispatch(copy);
  },
  call: function(type, that) {
    if ((n = arguments.length - 2) > 0) for (var args = new Array(n), i = 0, n, t; i < n; ++i) args[i] = arguments[i + 2];
    if (!this._.hasOwnProperty(type)) throw new Error("unknown type: " + type);
    for (t = this._[type], i = 0, n = t.length; i < n; ++i) t[i].value.apply(that, args);
  },
  apply: function(type, that, args) {
    if (!this._.hasOwnProperty(type)) throw new Error("unknown type: " + type);
    for (var t = this._[type], i = 0, n = t.length; i < n; ++i) t[i].value.apply(that, args);
  }
};

function dispatch_get(type, name) {
  for (var i = 0, n = type.length, c; i < n; ++i) {
    if ((c = type[i]).name === name) {
      return c.value;
    }
  }
}

function set(type, name, callback) {
  for (var i = 0, n = type.length; i < n; ++i) {
    if (type[i].name === name) {
      type[i] = noop, type = type.slice(0, i).concat(type.slice(i + 1));
      break;
    }
  }
  if (callback != null) type.push({name: name, value: callback});
  return type;
}

/* harmony default export */ const src_dispatch = (dispatch_dispatch);

;// ./node_modules/d3-drag/src/noevent.js
// These are typically used in conjunction with noevent to ensure that we can
// preventDefault on the event.
const nonpassive = {passive: false};
const nonpassivecapture = {capture: true, passive: false};

function nopropagation(event) {
  event.stopImmediatePropagation();
}

/* harmony default export */ function noevent(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

;// ./node_modules/d3-drag/src/nodrag.js



/* harmony default export */ function nodrag(view) {
  var root = view.document.documentElement,
      selection = src_select(view).on("dragstart.drag", noevent, nonpassivecapture);
  if ("onselectstart" in root) {
    selection.on("selectstart.drag", noevent, nonpassivecapture);
  } else {
    root.__noselect = root.style.MozUserSelect;
    root.style.MozUserSelect = "none";
  }
}

function yesdrag(view, noclick) {
  var root = view.document.documentElement,
      selection = src_select(view).on("dragstart.drag", null);
  if (noclick) {
    selection.on("click.drag", noevent, nonpassivecapture);
    setTimeout(function() { selection.on("click.drag", null); }, 0);
  }
  if ("onselectstart" in root) {
    selection.on("selectstart.drag", null);
  } else {
    root.style.MozUserSelect = root.__noselect;
    delete root.__noselect;
  }
}

;// ./node_modules/d3-interpolate/src/zoom.js
var epsilon2 = 1e-12;

function zoom_cosh(x) {
  return ((x = Math.exp(x)) + 1 / x) / 2;
}

function zoom_sinh(x) {
  return ((x = Math.exp(x)) - 1 / x) / 2;
}

function tanh(x) {
  return ((x = Math.exp(2 * x)) - 1) / (x + 1);
}

/* harmony default export */ const src_zoom = ((function zoomRho(rho, rho2, rho4) {

  // p0 = [ux0, uy0, w0]
  // p1 = [ux1, uy1, w1]
  function zoom(p0, p1) {
    var ux0 = p0[0], uy0 = p0[1], w0 = p0[2],
        ux1 = p1[0], uy1 = p1[1], w1 = p1[2],
        dx = ux1 - ux0,
        dy = uy1 - uy0,
        d2 = dx * dx + dy * dy,
        i,
        S;

    // Special case for u0 ≅ u1.
    if (d2 < epsilon2) {
      S = Math.log(w1 / w0) / rho;
      i = function(t) {
        return [
          ux0 + t * dx,
          uy0 + t * dy,
          w0 * Math.exp(rho * t * S)
        ];
      }
    }

    // General case.
    else {
      var d1 = Math.sqrt(d2),
          b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1),
          b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1),
          r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0),
          r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
      S = (r1 - r0) / rho;
      i = function(t) {
        var s = t * S,
            coshr0 = zoom_cosh(r0),
            u = w0 / (rho2 * d1) * (coshr0 * tanh(rho * s + r0) - zoom_sinh(r0));
        return [
          ux0 + u * dx,
          uy0 + u * dy,
          w0 * coshr0 / zoom_cosh(rho * s + r0)
        ];
      }
    }

    i.duration = S * 1000 * rho / Math.SQRT2;

    return i;
  }

  zoom.rho = function(_) {
    var _1 = Math.max(1e-3, +_), _2 = _1 * _1, _4 = _2 * _2;
    return zoomRho(_1, _2, _4);
  };

  return zoom;
})(Math.SQRT2, 2, 4));

;// ./node_modules/d3-selection/src/sourceEvent.js
/* harmony default export */ function sourceEvent(event) {
  let sourceEvent;
  while (sourceEvent = event.sourceEvent) event = sourceEvent;
  return event;
}

;// ./node_modules/d3-selection/src/pointer.js


/* harmony default export */ function pointer(event, node) {
  event = sourceEvent(event);
  if (node === undefined) node = event.currentTarget;
  if (node) {
    var svg = node.ownerSVGElement || node;
    if (svg.createSVGPoint) {
      var point = svg.createSVGPoint();
      point.x = event.clientX, point.y = event.clientY;
      point = point.matrixTransform(node.getScreenCTM().inverse());
      return [point.x, point.y];
    }
    if (node.getBoundingClientRect) {
      var rect = node.getBoundingClientRect();
      return [event.clientX - rect.left - node.clientLeft, event.clientY - rect.top - node.clientTop];
    }
  }
  return [event.pageX, event.pageY];
}

;// ./node_modules/d3-timer/src/timer.js
var timer_frame = 0, // is an animation frame pending?
    timeout = 0, // is a timeout pending?
    interval = 0, // are any timers active?
    pokeDelay = 1000, // how frequently we check for clock skew
    taskHead,
    taskTail,
    clockLast = 0,
    clockNow = 0,
    clockSkew = 0,
    clock = typeof performance === "object" && performance.now ? performance : Date,
    setFrame = typeof window === "object" && window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function(f) { setTimeout(f, 17); };

function now() {
  return clockNow || (setFrame(clearNow), clockNow = clock.now() + clockSkew);
}

function clearNow() {
  clockNow = 0;
}

function Timer() {
  this._call =
  this._time =
  this._next = null;
}

Timer.prototype = timer.prototype = {
  constructor: Timer,
  restart: function(callback, delay, time) {
    if (typeof callback !== "function") throw new TypeError("callback is not a function");
    time = (time == null ? now() : +time) + (delay == null ? 0 : +delay);
    if (!this._next && taskTail !== this) {
      if (taskTail) taskTail._next = this;
      else taskHead = this;
      taskTail = this;
    }
    this._call = callback;
    this._time = time;
    sleep();
  },
  stop: function() {
    if (this._call) {
      this._call = null;
      this._time = Infinity;
      sleep();
    }
  }
};

function timer(callback, delay, time) {
  var t = new Timer;
  t.restart(callback, delay, time);
  return t;
}

function timerFlush() {
  now(); // Get the current time, if not already set.
  ++timer_frame; // Pretend we’ve set an alarm, if we haven’t already.
  var t = taskHead, e;
  while (t) {
    if ((e = clockNow - t._time) >= 0) t._call.call(undefined, e);
    t = t._next;
  }
  --timer_frame;
}

function wake() {
  clockNow = (clockLast = clock.now()) + clockSkew;
  timer_frame = timeout = 0;
  try {
    timerFlush();
  } finally {
    timer_frame = 0;
    nap();
    clockNow = 0;
  }
}

function poke() {
  var now = clock.now(), delay = now - clockLast;
  if (delay > pokeDelay) clockSkew -= delay, clockLast = now;
}

function nap() {
  var t0, t1 = taskHead, t2, time = Infinity;
  while (t1) {
    if (t1._call) {
      if (time > t1._time) time = t1._time;
      t0 = t1, t1 = t1._next;
    } else {
      t2 = t1._next, t1._next = null;
      t1 = t0 ? t0._next = t2 : taskHead = t2;
    }
  }
  taskTail = t0;
  sleep(time);
}

function sleep(time) {
  if (timer_frame) return; // Soonest alarm already set, or will be.
  if (timeout) timeout = clearTimeout(timeout);
  var delay = time - clockNow; // Strictly less than if we recomputed clockNow.
  if (delay > 24) {
    if (time < Infinity) timeout = setTimeout(wake, time - clock.now() - clockSkew);
    if (interval) interval = clearInterval(interval);
  } else {
    if (!interval) clockLast = clock.now(), interval = setInterval(poke, pokeDelay);
    timer_frame = 1, setFrame(wake);
  }
}

;// ./node_modules/d3-timer/src/timeout.js


/* harmony default export */ function src_timeout(callback, delay, time) {
  var t = new Timer;
  delay = delay == null ? 0 : +delay;
  t.restart(elapsed => {
    t.stop();
    callback(elapsed + delay);
  }, delay, time);
  return t;
}

;// ./node_modules/d3-transition/src/transition/schedule.js



var emptyOn = src_dispatch("start", "end", "cancel", "interrupt");
var emptyTween = [];

var CREATED = 0;
var SCHEDULED = 1;
var STARTING = 2;
var STARTED = 3;
var RUNNING = 4;
var ENDING = 5;
var schedule_ENDED = 6;

/* harmony default export */ function schedule(node, name, id, index, group, timing) {
  var schedules = node.__transition;
  if (!schedules) node.__transition = {};
  else if (id in schedules) return;
  create(node, id, {
    name: name,
    index: index, // For context during callback.
    group: group, // For context during callback.
    on: emptyOn,
    tween: emptyTween,
    time: timing.time,
    delay: timing.delay,
    duration: timing.duration,
    ease: timing.ease,
    timer: null,
    state: CREATED
  });
}

function schedule_init(node, id) {
  var schedule = schedule_get(node, id);
  if (schedule.state > CREATED) throw new Error("too late; already scheduled");
  return schedule;
}

function schedule_set(node, id) {
  var schedule = schedule_get(node, id);
  if (schedule.state > STARTED) throw new Error("too late; already running");
  return schedule;
}

function schedule_get(node, id) {
  var schedule = node.__transition;
  if (!schedule || !(schedule = schedule[id])) throw new Error("transition not found");
  return schedule;
}

function create(node, id, self) {
  var schedules = node.__transition,
      tween;

  // Initialize the self timer when the transition is created.
  // Note the actual delay is not known until the first callback!
  schedules[id] = self;
  self.timer = timer(schedule, 0, self.time);

  function schedule(elapsed) {
    self.state = SCHEDULED;
    self.timer.restart(start, self.delay, self.time);

    // If the elapsed delay is less than our first sleep, start immediately.
    if (self.delay <= elapsed) start(elapsed - self.delay);
  }

  function start(elapsed) {
    var i, j, n, o;

    // If the state is not SCHEDULED, then we previously errored on start.
    if (self.state !== SCHEDULED) return stop();

    for (i in schedules) {
      o = schedules[i];
      if (o.name !== self.name) continue;

      // While this element already has a starting transition during this frame,
      // defer starting an interrupting transition until that transition has a
      // chance to tick (and possibly end); see d3/d3-transition#54!
      if (o.state === STARTED) return src_timeout(start);

      // Interrupt the active transition, if any.
      if (o.state === RUNNING) {
        o.state = schedule_ENDED;
        o.timer.stop();
        o.on.call("interrupt", node, node.__data__, o.index, o.group);
        delete schedules[i];
      }

      // Cancel any pre-empted transitions.
      else if (+i < id) {
        o.state = schedule_ENDED;
        o.timer.stop();
        o.on.call("cancel", node, node.__data__, o.index, o.group);
        delete schedules[i];
      }
    }

    // Defer the first tick to end of the current frame; see d3/d3#1576.
    // Note the transition may be canceled after start and before the first tick!
    // Note this must be scheduled before the start event; see d3/d3-transition#16!
    // Assuming this is successful, subsequent callbacks go straight to tick.
    src_timeout(function() {
      if (self.state === STARTED) {
        self.state = RUNNING;
        self.timer.restart(tick, self.delay, self.time);
        tick(elapsed);
      }
    });

    // Dispatch the start event.
    // Note this must be done before the tween are initialized.
    self.state = STARTING;
    self.on.call("start", node, node.__data__, self.index, self.group);
    if (self.state !== STARTING) return; // interrupted
    self.state = STARTED;

    // Initialize the tween, deleting null tween.
    tween = new Array(n = self.tween.length);
    for (i = 0, j = -1; i < n; ++i) {
      if (o = self.tween[i].value.call(node, node.__data__, self.index, self.group)) {
        tween[++j] = o;
      }
    }
    tween.length = j + 1;
  }

  function tick(elapsed) {
    var t = elapsed < self.duration ? self.ease.call(null, elapsed / self.duration) : (self.timer.restart(stop), self.state = ENDING, 1),
        i = -1,
        n = tween.length;

    while (++i < n) {
      tween[i].call(node, t);
    }

    // Dispatch the end event.
    if (self.state === ENDING) {
      self.on.call("end", node, node.__data__, self.index, self.group);
      stop();
    }
  }

  function stop() {
    self.state = schedule_ENDED;
    self.timer.stop();
    delete schedules[id];
    for (var i in schedules) return; // eslint-disable-line no-unused-vars
    delete node.__transition;
  }
}

;// ./node_modules/d3-transition/src/interrupt.js


/* harmony default export */ function interrupt(node, name) {
  var schedules = node.__transition,
      schedule,
      active,
      empty = true,
      i;

  if (!schedules) return;

  name = name == null ? null : name + "";

  for (i in schedules) {
    if ((schedule = schedules[i]).name !== name) { empty = false; continue; }
    active = schedule.state > STARTING && schedule.state < ENDING;
    schedule.state = schedule_ENDED;
    schedule.timer.stop();
    schedule.on.call(active ? "interrupt" : "cancel", node, node.__data__, schedule.index, schedule.group);
    delete schedules[i];
  }

  if (empty) delete node.__transition;
}

;// ./node_modules/d3-transition/src/selection/interrupt.js


/* harmony default export */ function selection_interrupt(name) {
  return this.each(function() {
    interrupt(this, name);
  });
}

;// ./node_modules/d3-interpolate/src/number.js
/* harmony default export */ function number(a, b) {
  return a = +a, b = +b, function(t) {
    return a * (1 - t) + b * t;
  };
}

;// ./node_modules/d3-interpolate/src/transform/decompose.js
var degrees = 180 / Math.PI;

var decompose_identity = {
  translateX: 0,
  translateY: 0,
  rotate: 0,
  skewX: 0,
  scaleX: 1,
  scaleY: 1
};

/* harmony default export */ function decompose(a, b, c, d, e, f) {
  var scaleX, scaleY, skewX;
  if (scaleX = Math.sqrt(a * a + b * b)) a /= scaleX, b /= scaleX;
  if (skewX = a * c + b * d) c -= a * skewX, d -= b * skewX;
  if (scaleY = Math.sqrt(c * c + d * d)) c /= scaleY, d /= scaleY, skewX /= scaleY;
  if (a * d < b * c) a = -a, b = -b, skewX = -skewX, scaleX = -scaleX;
  return {
    translateX: e,
    translateY: f,
    rotate: Math.atan2(b, a) * degrees,
    skewX: Math.atan(skewX) * degrees,
    scaleX: scaleX,
    scaleY: scaleY
  };
}

;// ./node_modules/d3-interpolate/src/transform/parse.js


var svgNode;

/* eslint-disable no-undef */
function parseCss(value) {
  const m = new (typeof DOMMatrix === "function" ? DOMMatrix : WebKitCSSMatrix)(value + "");
  return m.isIdentity ? decompose_identity : decompose(m.a, m.b, m.c, m.d, m.e, m.f);
}

function parseSvg(value) {
  if (value == null) return decompose_identity;
  if (!svgNode) svgNode = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svgNode.setAttribute("transform", value);
  if (!(value = svgNode.transform.baseVal.consolidate())) return decompose_identity;
  value = value.matrix;
  return decompose(value.a, value.b, value.c, value.d, value.e, value.f);
}

;// ./node_modules/d3-interpolate/src/transform/index.js



function interpolateTransform(parse, pxComma, pxParen, degParen) {

  function pop(s) {
    return s.length ? s.pop() + " " : "";
  }

  function translate(xa, ya, xb, yb, s, q) {
    if (xa !== xb || ya !== yb) {
      var i = s.push("translate(", null, pxComma, null, pxParen);
      q.push({i: i - 4, x: number(xa, xb)}, {i: i - 2, x: number(ya, yb)});
    } else if (xb || yb) {
      s.push("translate(" + xb + pxComma + yb + pxParen);
    }
  }

  function rotate(a, b, s, q) {
    if (a !== b) {
      if (a - b > 180) b += 360; else if (b - a > 180) a += 360; // shortest path
      q.push({i: s.push(pop(s) + "rotate(", null, degParen) - 2, x: number(a, b)});
    } else if (b) {
      s.push(pop(s) + "rotate(" + b + degParen);
    }
  }

  function skewX(a, b, s, q) {
    if (a !== b) {
      q.push({i: s.push(pop(s) + "skewX(", null, degParen) - 2, x: number(a, b)});
    } else if (b) {
      s.push(pop(s) + "skewX(" + b + degParen);
    }
  }

  function scale(xa, ya, xb, yb, s, q) {
    if (xa !== xb || ya !== yb) {
      var i = s.push(pop(s) + "scale(", null, ",", null, ")");
      q.push({i: i - 4, x: number(xa, xb)}, {i: i - 2, x: number(ya, yb)});
    } else if (xb !== 1 || yb !== 1) {
      s.push(pop(s) + "scale(" + xb + "," + yb + ")");
    }
  }

  return function(a, b) {
    var s = [], // string constants and placeholders
        q = []; // number interpolators
    a = parse(a), b = parse(b);
    translate(a.translateX, a.translateY, b.translateX, b.translateY, s, q);
    rotate(a.rotate, b.rotate, s, q);
    skewX(a.skewX, b.skewX, s, q);
    scale(a.scaleX, a.scaleY, b.scaleX, b.scaleY, s, q);
    a = b = null; // gc
    return function(t) {
      var i = -1, n = q.length, o;
      while (++i < n) s[(o = q[i]).i] = o.x(t);
      return s.join("");
    };
  };
}

var interpolateTransformCss = interpolateTransform(parseCss, "px, ", "px)", "deg)");
var interpolateTransformSvg = interpolateTransform(parseSvg, ", ", ")", ")");

;// ./node_modules/d3-transition/src/transition/tween.js


function tweenRemove(id, name) {
  var tween0, tween1;
  return function() {
    var schedule = schedule_set(this, id),
        tween = schedule.tween;

    // If this node shared tween with the previous node,
    // just assign the updated shared tween and we’re done!
    // Otherwise, copy-on-write.
    if (tween !== tween0) {
      tween1 = tween0 = tween;
      for (var i = 0, n = tween1.length; i < n; ++i) {
        if (tween1[i].name === name) {
          tween1 = tween1.slice();
          tween1.splice(i, 1);
          break;
        }
      }
    }

    schedule.tween = tween1;
  };
}

function tweenFunction(id, name, value) {
  var tween0, tween1;
  if (typeof value !== "function") throw new Error;
  return function() {
    var schedule = schedule_set(this, id),
        tween = schedule.tween;

    // If this node shared tween with the previous node,
    // just assign the updated shared tween and we’re done!
    // Otherwise, copy-on-write.
    if (tween !== tween0) {
      tween1 = (tween0 = tween).slice();
      for (var t = {name: name, value: value}, i = 0, n = tween1.length; i < n; ++i) {
        if (tween1[i].name === name) {
          tween1[i] = t;
          break;
        }
      }
      if (i === n) tween1.push(t);
    }

    schedule.tween = tween1;
  };
}

/* harmony default export */ function tween(name, value) {
  var id = this._id;

  name += "";

  if (arguments.length < 2) {
    var tween = schedule_get(this.node(), id).tween;
    for (var i = 0, n = tween.length, t; i < n; ++i) {
      if ((t = tween[i]).name === name) {
        return t.value;
      }
    }
    return null;
  }

  return this.each((value == null ? tweenRemove : tweenFunction)(id, name, value));
}

function tweenValue(transition, name, value) {
  var id = transition._id;

  transition.each(function() {
    var schedule = schedule_set(this, id);
    (schedule.value || (schedule.value = {}))[name] = value.apply(this, arguments);
  });

  return function(node) {
    return schedule_get(node, id).value[name];
  };
}

;// ./node_modules/d3-color/src/define.js
/* harmony default export */ function src_define(constructor, factory, prototype) {
  constructor.prototype = factory.prototype = prototype;
  prototype.constructor = constructor;
}

function define_extend(parent, definition) {
  var prototype = Object.create(parent.prototype);
  for (var key in definition) prototype[key] = definition[key];
  return prototype;
}

;// ./node_modules/d3-color/src/color.js


function Color() {}

var darker = 0.7;
var brighter = 1 / darker;

var reI = "\\s*([+-]?\\d+)\\s*",
    reN = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)\\s*",
    reP = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)%\\s*",
    reHex = /^#([0-9a-f]{3,8})$/,
    reRgbInteger = new RegExp(`^rgb\\(${reI},${reI},${reI}\\)$`),
    reRgbPercent = new RegExp(`^rgb\\(${reP},${reP},${reP}\\)$`),
    reRgbaInteger = new RegExp(`^rgba\\(${reI},${reI},${reI},${reN}\\)$`),
    reRgbaPercent = new RegExp(`^rgba\\(${reP},${reP},${reP},${reN}\\)$`),
    reHslPercent = new RegExp(`^hsl\\(${reN},${reP},${reP}\\)$`),
    reHslaPercent = new RegExp(`^hsla\\(${reN},${reP},${reP},${reN}\\)$`);

var named = {
  aliceblue: 0xf0f8ff,
  antiquewhite: 0xfaebd7,
  aqua: 0x00ffff,
  aquamarine: 0x7fffd4,
  azure: 0xf0ffff,
  beige: 0xf5f5dc,
  bisque: 0xffe4c4,
  black: 0x000000,
  blanchedalmond: 0xffebcd,
  blue: 0x0000ff,
  blueviolet: 0x8a2be2,
  brown: 0xa52a2a,
  burlywood: 0xdeb887,
  cadetblue: 0x5f9ea0,
  chartreuse: 0x7fff00,
  chocolate: 0xd2691e,
  coral: 0xff7f50,
  cornflowerblue: 0x6495ed,
  cornsilk: 0xfff8dc,
  crimson: 0xdc143c,
  cyan: 0x00ffff,
  darkblue: 0x00008b,
  darkcyan: 0x008b8b,
  darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9,
  darkgreen: 0x006400,
  darkgrey: 0xa9a9a9,
  darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b,
  darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00,
  darkorchid: 0x9932cc,
  darkred: 0x8b0000,
  darksalmon: 0xe9967a,
  darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f,
  darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3,
  deeppink: 0xff1493,
  deepskyblue: 0x00bfff,
  dimgray: 0x696969,
  dimgrey: 0x696969,
  dodgerblue: 0x1e90ff,
  firebrick: 0xb22222,
  floralwhite: 0xfffaf0,
  forestgreen: 0x228b22,
  fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc,
  ghostwhite: 0xf8f8ff,
  gold: 0xffd700,
  goldenrod: 0xdaa520,
  gray: 0x808080,
  green: 0x008000,
  greenyellow: 0xadff2f,
  grey: 0x808080,
  honeydew: 0xf0fff0,
  hotpink: 0xff69b4,
  indianred: 0xcd5c5c,
  indigo: 0x4b0082,
  ivory: 0xfffff0,
  khaki: 0xf0e68c,
  lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5,
  lawngreen: 0x7cfc00,
  lemonchiffon: 0xfffacd,
  lightblue: 0xadd8e6,
  lightcoral: 0xf08080,
  lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2,
  lightgray: 0xd3d3d3,
  lightgreen: 0x90ee90,
  lightgrey: 0xd3d3d3,
  lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa,
  lightskyblue: 0x87cefa,
  lightslategray: 0x778899,
  lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de,
  lightyellow: 0xffffe0,
  lime: 0x00ff00,
  limegreen: 0x32cd32,
  linen: 0xfaf0e6,
  magenta: 0xff00ff,
  maroon: 0x800000,
  mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd,
  mediumorchid: 0xba55d3,
  mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee,
  mediumspringgreen: 0x00fa9a,
  mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585,
  midnightblue: 0x191970,
  mintcream: 0xf5fffa,
  mistyrose: 0xffe4e1,
  moccasin: 0xffe4b5,
  navajowhite: 0xffdead,
  navy: 0x000080,
  oldlace: 0xfdf5e6,
  olive: 0x808000,
  olivedrab: 0x6b8e23,
  orange: 0xffa500,
  orangered: 0xff4500,
  orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa,
  palegreen: 0x98fb98,
  paleturquoise: 0xafeeee,
  palevioletred: 0xdb7093,
  papayawhip: 0xffefd5,
  peachpuff: 0xffdab9,
  peru: 0xcd853f,
  pink: 0xffc0cb,
  plum: 0xdda0dd,
  powderblue: 0xb0e0e6,
  purple: 0x800080,
  rebeccapurple: 0x663399,
  red: 0xff0000,
  rosybrown: 0xbc8f8f,
  royalblue: 0x4169e1,
  saddlebrown: 0x8b4513,
  salmon: 0xfa8072,
  sandybrown: 0xf4a460,
  seagreen: 0x2e8b57,
  seashell: 0xfff5ee,
  sienna: 0xa0522d,
  silver: 0xc0c0c0,
  skyblue: 0x87ceeb,
  slateblue: 0x6a5acd,
  slategray: 0x708090,
  slategrey: 0x708090,
  snow: 0xfffafa,
  springgreen: 0x00ff7f,
  steelblue: 0x4682b4,
  tan: 0xd2b48c,
  teal: 0x008080,
  thistle: 0xd8bfd8,
  tomato: 0xff6347,
  turquoise: 0x40e0d0,
  violet: 0xee82ee,
  wheat: 0xf5deb3,
  white: 0xffffff,
  whitesmoke: 0xf5f5f5,
  yellow: 0xffff00,
  yellowgreen: 0x9acd32
};

src_define(Color, color, {
  copy(channels) {
    return Object.assign(new this.constructor, this, channels);
  },
  displayable() {
    return this.rgb().displayable();
  },
  hex: color_formatHex, // Deprecated! Use color.formatHex.
  formatHex: color_formatHex,
  formatHex8: color_formatHex8,
  formatHsl: color_formatHsl,
  formatRgb: color_formatRgb,
  toString: color_formatRgb
});

function color_formatHex() {
  return this.rgb().formatHex();
}

function color_formatHex8() {
  return this.rgb().formatHex8();
}

function color_formatHsl() {
  return hslConvert(this).formatHsl();
}

function color_formatRgb() {
  return this.rgb().formatRgb();
}

function color(format) {
  var m, l;
  format = (format + "").trim().toLowerCase();
  return (m = reHex.exec(format)) ? (l = m[1].length, m = parseInt(m[1], 16), l === 6 ? rgbn(m) // #ff0000
      : l === 3 ? new Rgb((m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), ((m & 0xf) << 4) | (m & 0xf), 1) // #f00
      : l === 8 ? rgba(m >> 24 & 0xff, m >> 16 & 0xff, m >> 8 & 0xff, (m & 0xff) / 0xff) // #ff000000
      : l === 4 ? rgba((m >> 12 & 0xf) | (m >> 8 & 0xf0), (m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), (((m & 0xf) << 4) | (m & 0xf)) / 0xff) // #f000
      : null) // invalid hex
      : (m = reRgbInteger.exec(format)) ? new Rgb(m[1], m[2], m[3], 1) // rgb(255, 0, 0)
      : (m = reRgbPercent.exec(format)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) // rgb(100%, 0%, 0%)
      : (m = reRgbaInteger.exec(format)) ? rgba(m[1], m[2], m[3], m[4]) // rgba(255, 0, 0, 1)
      : (m = reRgbaPercent.exec(format)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) // rgb(100%, 0%, 0%, 1)
      : (m = reHslPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) // hsl(120, 50%, 50%)
      : (m = reHslaPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) // hsla(120, 50%, 50%, 1)
      : named.hasOwnProperty(format) ? rgbn(named[format]) // eslint-disable-line no-prototype-builtins
      : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0)
      : null;
}

function rgbn(n) {
  return new Rgb(n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, 1);
}

function rgba(r, g, b, a) {
  if (a <= 0) r = g = b = NaN;
  return new Rgb(r, g, b, a);
}

function rgbConvert(o) {
  if (!(o instanceof Color)) o = color(o);
  if (!o) return new Rgb;
  o = o.rgb();
  return new Rgb(o.r, o.g, o.b, o.opacity);
}

function color_rgb(r, g, b, opacity) {
  return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
}

function Rgb(r, g, b, opacity) {
  this.r = +r;
  this.g = +g;
  this.b = +b;
  this.opacity = +opacity;
}

src_define(Rgb, color_rgb, define_extend(Color, {
  brighter(k) {
    k = k == null ? brighter : Math.pow(brighter, k);
    return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
  },
  darker(k) {
    k = k == null ? darker : Math.pow(darker, k);
    return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
  },
  rgb() {
    return this;
  },
  clamp() {
    return new Rgb(clampi(this.r), clampi(this.g), clampi(this.b), clampa(this.opacity));
  },
  displayable() {
    return (-0.5 <= this.r && this.r < 255.5)
        && (-0.5 <= this.g && this.g < 255.5)
        && (-0.5 <= this.b && this.b < 255.5)
        && (0 <= this.opacity && this.opacity <= 1);
  },
  hex: rgb_formatHex, // Deprecated! Use color.formatHex.
  formatHex: rgb_formatHex,
  formatHex8: rgb_formatHex8,
  formatRgb: rgb_formatRgb,
  toString: rgb_formatRgb
}));

function rgb_formatHex() {
  return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}`;
}

function rgb_formatHex8() {
  return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}${hex((isNaN(this.opacity) ? 1 : this.opacity) * 255)}`;
}

function rgb_formatRgb() {
  const a = clampa(this.opacity);
  return `${a === 1 ? "rgb(" : "rgba("}${clampi(this.r)}, ${clampi(this.g)}, ${clampi(this.b)}${a === 1 ? ")" : `, ${a})`}`;
}

function clampa(opacity) {
  return isNaN(opacity) ? 1 : Math.max(0, Math.min(1, opacity));
}

function clampi(value) {
  return Math.max(0, Math.min(255, Math.round(value) || 0));
}

function hex(value) {
  value = clampi(value);
  return (value < 16 ? "0" : "") + value.toString(16);
}

function hsla(h, s, l, a) {
  if (a <= 0) h = s = l = NaN;
  else if (l <= 0 || l >= 1) h = s = NaN;
  else if (s <= 0) h = NaN;
  return new Hsl(h, s, l, a);
}

function hslConvert(o) {
  if (o instanceof Hsl) return new Hsl(o.h, o.s, o.l, o.opacity);
  if (!(o instanceof Color)) o = color(o);
  if (!o) return new Hsl;
  if (o instanceof Hsl) return o;
  o = o.rgb();
  var r = o.r / 255,
      g = o.g / 255,
      b = o.b / 255,
      min = Math.min(r, g, b),
      max = Math.max(r, g, b),
      h = NaN,
      s = max - min,
      l = (max + min) / 2;
  if (s) {
    if (r === max) h = (g - b) / s + (g < b) * 6;
    else if (g === max) h = (b - r) / s + 2;
    else h = (r - g) / s + 4;
    s /= l < 0.5 ? max + min : 2 - max - min;
    h *= 60;
  } else {
    s = l > 0 && l < 1 ? 0 : h;
  }
  return new Hsl(h, s, l, o.opacity);
}

function hsl(h, s, l, opacity) {
  return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
}

function Hsl(h, s, l, opacity) {
  this.h = +h;
  this.s = +s;
  this.l = +l;
  this.opacity = +opacity;
}

src_define(Hsl, hsl, define_extend(Color, {
  brighter(k) {
    k = k == null ? brighter : Math.pow(brighter, k);
    return new Hsl(this.h, this.s, this.l * k, this.opacity);
  },
  darker(k) {
    k = k == null ? darker : Math.pow(darker, k);
    return new Hsl(this.h, this.s, this.l * k, this.opacity);
  },
  rgb() {
    var h = this.h % 360 + (this.h < 0) * 360,
        s = isNaN(h) || isNaN(this.s) ? 0 : this.s,
        l = this.l,
        m2 = l + (l < 0.5 ? l : 1 - l) * s,
        m1 = 2 * l - m2;
    return new Rgb(
      hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2),
      hsl2rgb(h, m1, m2),
      hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2),
      this.opacity
    );
  },
  clamp() {
    return new Hsl(clamph(this.h), clampt(this.s), clampt(this.l), clampa(this.opacity));
  },
  displayable() {
    return (0 <= this.s && this.s <= 1 || isNaN(this.s))
        && (0 <= this.l && this.l <= 1)
        && (0 <= this.opacity && this.opacity <= 1);
  },
  formatHsl() {
    const a = clampa(this.opacity);
    return `${a === 1 ? "hsl(" : "hsla("}${clamph(this.h)}, ${clampt(this.s) * 100}%, ${clampt(this.l) * 100}%${a === 1 ? ")" : `, ${a})`}`;
  }
}));

function clamph(value) {
  value = (value || 0) % 360;
  return value < 0 ? value + 360 : value;
}

function clampt(value) {
  return Math.max(0, Math.min(1, value || 0));
}

/* From FvD 13.37, CSS Color Module Level 3 */
function hsl2rgb(h, m1, m2) {
  return (h < 60 ? m1 + (m2 - m1) * h / 60
      : h < 180 ? m2
      : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60
      : m1) * 255;
}

;// ./node_modules/d3-interpolate/src/basis.js
function basis(t1, v0, v1, v2, v3) {
  var t2 = t1 * t1, t3 = t2 * t1;
  return ((1 - 3 * t1 + 3 * t2 - t3) * v0
      + (4 - 6 * t2 + 3 * t3) * v1
      + (1 + 3 * t1 + 3 * t2 - 3 * t3) * v2
      + t3 * v3) / 6;
}

/* harmony default export */ function src_basis(values) {
  var n = values.length - 1;
  return function(t) {
    var i = t <= 0 ? (t = 0) : t >= 1 ? (t = 1, n - 1) : Math.floor(t * n),
        v1 = values[i],
        v2 = values[i + 1],
        v0 = i > 0 ? values[i - 1] : 2 * v1 - v2,
        v3 = i < n - 1 ? values[i + 2] : 2 * v2 - v1;
    return basis((t - i / n) * n, v0, v1, v2, v3);
  };
}

;// ./node_modules/d3-interpolate/src/basisClosed.js


/* harmony default export */ function basisClosed(values) {
  var n = values.length;
  return function(t) {
    var i = Math.floor(((t %= 1) < 0 ? ++t : t) * n),
        v0 = values[(i + n - 1) % n],
        v1 = values[i % n],
        v2 = values[(i + 1) % n],
        v3 = values[(i + 2) % n];
    return basis((t - i / n) * n, v0, v1, v2, v3);
  };
}

;// ./node_modules/d3-interpolate/src/constant.js
/* harmony default export */ const d3_interpolate_src_constant = (x => () => x);

;// ./node_modules/d3-interpolate/src/color.js


function linear(a, d) {
  return function(t) {
    return a + t * d;
  };
}

function exponential(a, b, y) {
  return a = Math.pow(a, y), b = Math.pow(b, y) - a, y = 1 / y, function(t) {
    return Math.pow(a + t * b, y);
  };
}

function hue(a, b) {
  var d = b - a;
  return d ? linear(a, d > 180 || d < -180 ? d - 360 * Math.round(d / 360) : d) : constant(isNaN(a) ? b : a);
}

function gamma(y) {
  return (y = +y) === 1 ? nogamma : function(a, b) {
    return b - a ? exponential(a, b, y) : d3_interpolate_src_constant(isNaN(a) ? b : a);
  };
}

function nogamma(a, b) {
  var d = b - a;
  return d ? linear(a, d) : d3_interpolate_src_constant(isNaN(a) ? b : a);
}

;// ./node_modules/d3-interpolate/src/rgb.js





/* harmony default export */ const rgb = ((function rgbGamma(y) {
  var color = gamma(y);

  function rgb(start, end) {
    var r = color((start = color_rgb(start)).r, (end = color_rgb(end)).r),
        g = color(start.g, end.g),
        b = color(start.b, end.b),
        opacity = nogamma(start.opacity, end.opacity);
    return function(t) {
      start.r = r(t);
      start.g = g(t);
      start.b = b(t);
      start.opacity = opacity(t);
      return start + "";
    };
  }

  rgb.gamma = rgbGamma;

  return rgb;
})(1));

function rgbSpline(spline) {
  return function(colors) {
    var n = colors.length,
        r = new Array(n),
        g = new Array(n),
        b = new Array(n),
        i, color;
    for (i = 0; i < n; ++i) {
      color = color_rgb(colors[i]);
      r[i] = color.r || 0;
      g[i] = color.g || 0;
      b[i] = color.b || 0;
    }
    r = spline(r);
    g = spline(g);
    b = spline(b);
    color.opacity = 1;
    return function(t) {
      color.r = r(t);
      color.g = g(t);
      color.b = b(t);
      return color + "";
    };
  };
}

var rgbBasis = rgbSpline(src_basis);
var rgbBasisClosed = rgbSpline(basisClosed);

;// ./node_modules/d3-interpolate/src/string.js


var reA = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g,
    reB = new RegExp(reA.source, "g");

function zero(b) {
  return function() {
    return b;
  };
}

function one(b) {
  return function(t) {
    return b(t) + "";
  };
}

/* harmony default export */ function string(a, b) {
  var bi = reA.lastIndex = reB.lastIndex = 0, // scan index for next number in b
      am, // current match in a
      bm, // current match in b
      bs, // string preceding current number in b, if any
      i = -1, // index in s
      s = [], // string constants and placeholders
      q = []; // number interpolators

  // Coerce inputs to strings.
  a = a + "", b = b + "";

  // Interpolate pairs of numbers in a & b.
  while ((am = reA.exec(a))
      && (bm = reB.exec(b))) {
    if ((bs = bm.index) > bi) { // a string precedes the next number in b
      bs = b.slice(bi, bs);
      if (s[i]) s[i] += bs; // coalesce with previous string
      else s[++i] = bs;
    }
    if ((am = am[0]) === (bm = bm[0])) { // numbers in a & b match
      if (s[i]) s[i] += bm; // coalesce with previous string
      else s[++i] = bm;
    } else { // interpolate non-matching numbers
      s[++i] = null;
      q.push({i: i, x: number(am, bm)});
    }
    bi = reB.lastIndex;
  }

  // Add remains of b.
  if (bi < b.length) {
    bs = b.slice(bi);
    if (s[i]) s[i] += bs; // coalesce with previous string
    else s[++i] = bs;
  }

  // Special optimization for only a single match.
  // Otherwise, interpolate each of the numbers and rejoin the string.
  return s.length < 2 ? (q[0]
      ? one(q[0].x)
      : zero(b))
      : (b = q.length, function(t) {
          for (var i = 0, o; i < b; ++i) s[(o = q[i]).i] = o.x(t);
          return s.join("");
        });
}

;// ./node_modules/d3-transition/src/transition/interpolate.js



/* harmony default export */ function interpolate(a, b) {
  var c;
  return (typeof b === "number" ? number
      : b instanceof color ? rgb
      : (c = color(b)) ? (b = c, rgb)
      : string)(a, b);
}

;// ./node_modules/d3-transition/src/transition/attr.js





function attr_attrRemove(name) {
  return function() {
    this.removeAttribute(name);
  };
}

function attr_attrRemoveNS(fullname) {
  return function() {
    this.removeAttributeNS(fullname.space, fullname.local);
  };
}

function attr_attrConstant(name, interpolate, value1) {
  var string00,
      string1 = value1 + "",
      interpolate0;
  return function() {
    var string0 = this.getAttribute(name);
    return string0 === string1 ? null
        : string0 === string00 ? interpolate0
        : interpolate0 = interpolate(string00 = string0, value1);
  };
}

function attr_attrConstantNS(fullname, interpolate, value1) {
  var string00,
      string1 = value1 + "",
      interpolate0;
  return function() {
    var string0 = this.getAttributeNS(fullname.space, fullname.local);
    return string0 === string1 ? null
        : string0 === string00 ? interpolate0
        : interpolate0 = interpolate(string00 = string0, value1);
  };
}

function attr_attrFunction(name, interpolate, value) {
  var string00,
      string10,
      interpolate0;
  return function() {
    var string0, value1 = value(this), string1;
    if (value1 == null) return void this.removeAttribute(name);
    string0 = this.getAttribute(name);
    string1 = value1 + "";
    return string0 === string1 ? null
        : string0 === string00 && string1 === string10 ? interpolate0
        : (string10 = string1, interpolate0 = interpolate(string00 = string0, value1));
  };
}

function attr_attrFunctionNS(fullname, interpolate, value) {
  var string00,
      string10,
      interpolate0;
  return function() {
    var string0, value1 = value(this), string1;
    if (value1 == null) return void this.removeAttributeNS(fullname.space, fullname.local);
    string0 = this.getAttributeNS(fullname.space, fullname.local);
    string1 = value1 + "";
    return string0 === string1 ? null
        : string0 === string00 && string1 === string10 ? interpolate0
        : (string10 = string1, interpolate0 = interpolate(string00 = string0, value1));
  };
}

/* harmony default export */ function transition_attr(name, value) {
  var fullname = namespace(name), i = fullname === "transform" ? interpolateTransformSvg : interpolate;
  return this.attrTween(name, typeof value === "function"
      ? (fullname.local ? attr_attrFunctionNS : attr_attrFunction)(fullname, i, tweenValue(this, "attr." + name, value))
      : value == null ? (fullname.local ? attr_attrRemoveNS : attr_attrRemove)(fullname)
      : (fullname.local ? attr_attrConstantNS : attr_attrConstant)(fullname, i, value));
}

;// ./node_modules/d3-transition/src/transition/attrTween.js


function attrInterpolate(name, i) {
  return function(t) {
    this.setAttribute(name, i.call(this, t));
  };
}

function attrInterpolateNS(fullname, i) {
  return function(t) {
    this.setAttributeNS(fullname.space, fullname.local, i.call(this, t));
  };
}

function attrTweenNS(fullname, value) {
  var t0, i0;
  function tween() {
    var i = value.apply(this, arguments);
    if (i !== i0) t0 = (i0 = i) && attrInterpolateNS(fullname, i);
    return t0;
  }
  tween._value = value;
  return tween;
}

function attrTween(name, value) {
  var t0, i0;
  function tween() {
    var i = value.apply(this, arguments);
    if (i !== i0) t0 = (i0 = i) && attrInterpolate(name, i);
    return t0;
  }
  tween._value = value;
  return tween;
}

/* harmony default export */ function transition_attrTween(name, value) {
  var key = "attr." + name;
  if (arguments.length < 2) return (key = this.tween(key)) && key._value;
  if (value == null) return this.tween(key, null);
  if (typeof value !== "function") throw new Error;
  var fullname = namespace(name);
  return this.tween(key, (fullname.local ? attrTweenNS : attrTween)(fullname, value));
}

;// ./node_modules/d3-transition/src/transition/delay.js


function delayFunction(id, value) {
  return function() {
    schedule_init(this, id).delay = +value.apply(this, arguments);
  };
}

function delayConstant(id, value) {
  return value = +value, function() {
    schedule_init(this, id).delay = value;
  };
}

/* harmony default export */ function delay(value) {
  var id = this._id;

  return arguments.length
      ? this.each((typeof value === "function"
          ? delayFunction
          : delayConstant)(id, value))
      : schedule_get(this.node(), id).delay;
}

;// ./node_modules/d3-transition/src/transition/duration.js


function durationFunction(id, value) {
  return function() {
    schedule_set(this, id).duration = +value.apply(this, arguments);
  };
}

function durationConstant(id, value) {
  return value = +value, function() {
    schedule_set(this, id).duration = value;
  };
}

/* harmony default export */ function duration(value) {
  var id = this._id;

  return arguments.length
      ? this.each((typeof value === "function"
          ? durationFunction
          : durationConstant)(id, value))
      : schedule_get(this.node(), id).duration;
}

;// ./node_modules/d3-transition/src/transition/ease.js


function easeConstant(id, value) {
  if (typeof value !== "function") throw new Error;
  return function() {
    schedule_set(this, id).ease = value;
  };
}

/* harmony default export */ function ease(value) {
  var id = this._id;

  return arguments.length
      ? this.each(easeConstant(id, value))
      : schedule_get(this.node(), id).ease;
}

;// ./node_modules/d3-transition/src/transition/easeVarying.js


function easeVarying(id, value) {
  return function() {
    var v = value.apply(this, arguments);
    if (typeof v !== "function") throw new Error;
    schedule_set(this, id).ease = v;
  };
}

/* harmony default export */ function transition_easeVarying(value) {
  if (typeof value !== "function") throw new Error;
  return this.each(easeVarying(this._id, value));
}

;// ./node_modules/d3-transition/src/transition/filter.js



/* harmony default export */ function transition_filter(match) {
  if (typeof match !== "function") match = matcher(match);

  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
      if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
        subgroup.push(node);
      }
    }
  }

  return new Transition(subgroups, this._parents, this._name, this._id);
}

;// ./node_modules/d3-transition/src/transition/merge.js


/* harmony default export */ function transition_merge(transition) {
  if (transition._id !== this._id) throw new Error;

  for (var groups0 = this._groups, groups1 = transition._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j) {
    for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
      if (node = group0[i] || group1[i]) {
        merge[i] = node;
      }
    }
  }

  for (; j < m0; ++j) {
    merges[j] = groups0[j];
  }

  return new Transition(merges, this._parents, this._name, this._id);
}

;// ./node_modules/d3-transition/src/transition/on.js


function on_start(name) {
  return (name + "").trim().split(/^|\s+/).every(function(t) {
    var i = t.indexOf(".");
    if (i >= 0) t = t.slice(0, i);
    return !t || t === "start";
  });
}

function onFunction(id, name, listener) {
  var on0, on1, sit = on_start(name) ? schedule_init : schedule_set;
  return function() {
    var schedule = sit(this, id),
        on = schedule.on;

    // If this node shared a dispatch with the previous node,
    // just assign the updated shared dispatch and we’re done!
    // Otherwise, copy-on-write.
    if (on !== on0) (on1 = (on0 = on).copy()).on(name, listener);

    schedule.on = on1;
  };
}

/* harmony default export */ function transition_on(name, listener) {
  var id = this._id;

  return arguments.length < 2
      ? schedule_get(this.node(), id).on.on(name)
      : this.each(onFunction(id, name, listener));
}

;// ./node_modules/d3-transition/src/transition/remove.js
function removeFunction(id) {
  return function() {
    var parent = this.parentNode;
    for (var i in this.__transition) if (+i !== id) return;
    if (parent) parent.removeChild(this);
  };
}

/* harmony default export */ function transition_remove() {
  return this.on("end.remove", removeFunction(this._id));
}

;// ./node_modules/d3-transition/src/transition/select.js




/* harmony default export */ function transition_select(select) {
  var name = this._name,
      id = this._id;

  if (typeof select !== "function") select = selector(select);

  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
      if ((node = group[i]) && (subnode = select.call(node, node.__data__, i, group))) {
        if ("__data__" in node) subnode.__data__ = node.__data__;
        subgroup[i] = subnode;
        schedule(subgroup[i], name, id, i, subgroup, schedule_get(node, id));
      }
    }
  }

  return new Transition(subgroups, this._parents, name, id);
}

;// ./node_modules/d3-transition/src/transition/selectAll.js




/* harmony default export */ function transition_selectAll(select) {
  var name = this._name,
      id = this._id;

  if (typeof select !== "function") select = selectorAll(select);

  for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        for (var children = select.call(node, node.__data__, i, group), child, inherit = schedule_get(node, id), k = 0, l = children.length; k < l; ++k) {
          if (child = children[k]) {
            schedule(child, name, id, k, children, inherit);
          }
        }
        subgroups.push(children);
        parents.push(node);
      }
    }
  }

  return new Transition(subgroups, parents, name, id);
}

;// ./node_modules/d3-transition/src/transition/selection.js


var selection_Selection = src_selection.prototype.constructor;

/* harmony default export */ function transition_selection() {
  return new selection_Selection(this._groups, this._parents);
}

;// ./node_modules/d3-transition/src/transition/style.js






function styleNull(name, interpolate) {
  var string00,
      string10,
      interpolate0;
  return function() {
    var string0 = styleValue(this, name),
        string1 = (this.style.removeProperty(name), styleValue(this, name));
    return string0 === string1 ? null
        : string0 === string00 && string1 === string10 ? interpolate0
        : interpolate0 = interpolate(string00 = string0, string10 = string1);
  };
}

function style_styleRemove(name) {
  return function() {
    this.style.removeProperty(name);
  };
}

function style_styleConstant(name, interpolate, value1) {
  var string00,
      string1 = value1 + "",
      interpolate0;
  return function() {
    var string0 = styleValue(this, name);
    return string0 === string1 ? null
        : string0 === string00 ? interpolate0
        : interpolate0 = interpolate(string00 = string0, value1);
  };
}

function style_styleFunction(name, interpolate, value) {
  var string00,
      string10,
      interpolate0;
  return function() {
    var string0 = styleValue(this, name),
        value1 = value(this),
        string1 = value1 + "";
    if (value1 == null) string1 = value1 = (this.style.removeProperty(name), styleValue(this, name));
    return string0 === string1 ? null
        : string0 === string00 && string1 === string10 ? interpolate0
        : (string10 = string1, interpolate0 = interpolate(string00 = string0, value1));
  };
}

function styleMaybeRemove(id, name) {
  var on0, on1, listener0, key = "style." + name, event = "end." + key, remove;
  return function() {
    var schedule = schedule_set(this, id),
        on = schedule.on,
        listener = schedule.value[key] == null ? remove || (remove = style_styleRemove(name)) : undefined;

    // If this node shared a dispatch with the previous node,
    // just assign the updated shared dispatch and we’re done!
    // Otherwise, copy-on-write.
    if (on !== on0 || listener0 !== listener) (on1 = (on0 = on).copy()).on(event, listener0 = listener);

    schedule.on = on1;
  };
}

/* harmony default export */ function transition_style(name, value, priority) {
  var i = (name += "") === "transform" ? interpolateTransformCss : interpolate;
  return value == null ? this
      .styleTween(name, styleNull(name, i))
      .on("end.style." + name, style_styleRemove(name))
    : typeof value === "function" ? this
      .styleTween(name, style_styleFunction(name, i, tweenValue(this, "style." + name, value)))
      .each(styleMaybeRemove(this._id, name))
    : this
      .styleTween(name, style_styleConstant(name, i, value), priority)
      .on("end.style." + name, null);
}

;// ./node_modules/d3-transition/src/transition/styleTween.js
function styleInterpolate(name, i, priority) {
  return function(t) {
    this.style.setProperty(name, i.call(this, t), priority);
  };
}

function styleTween(name, value, priority) {
  var t, i0;
  function tween() {
    var i = value.apply(this, arguments);
    if (i !== i0) t = (i0 = i) && styleInterpolate(name, i, priority);
    return t;
  }
  tween._value = value;
  return tween;
}

/* harmony default export */ function transition_styleTween(name, value, priority) {
  var key = "style." + (name += "");
  if (arguments.length < 2) return (key = this.tween(key)) && key._value;
  if (value == null) return this.tween(key, null);
  if (typeof value !== "function") throw new Error;
  return this.tween(key, styleTween(name, value, priority == null ? "" : priority));
}

;// ./node_modules/d3-transition/src/transition/text.js


function text_textConstant(value) {
  return function() {
    this.textContent = value;
  };
}

function text_textFunction(value) {
  return function() {
    var value1 = value(this);
    this.textContent = value1 == null ? "" : value1;
  };
}

/* harmony default export */ function transition_text(value) {
  return this.tween("text", typeof value === "function"
      ? text_textFunction(tweenValue(this, "text", value))
      : text_textConstant(value == null ? "" : value + ""));
}

;// ./node_modules/d3-transition/src/transition/textTween.js
function textInterpolate(i) {
  return function(t) {
    this.textContent = i.call(this, t);
  };
}

function textTween(value) {
  var t0, i0;
  function tween() {
    var i = value.apply(this, arguments);
    if (i !== i0) t0 = (i0 = i) && textInterpolate(i);
    return t0;
  }
  tween._value = value;
  return tween;
}

/* harmony default export */ function transition_textTween(value) {
  var key = "text";
  if (arguments.length < 1) return (key = this.tween(key)) && key._value;
  if (value == null) return this.tween(key, null);
  if (typeof value !== "function") throw new Error;
  return this.tween(key, textTween(value));
}

;// ./node_modules/d3-transition/src/transition/transition.js



/* harmony default export */ function transition() {
  var name = this._name,
      id0 = this._id,
      id1 = newId();

  for (var groups = this._groups, m = groups.length, j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        var inherit = schedule_get(node, id0);
        schedule(node, name, id1, i, group, {
          time: inherit.time + inherit.delay + inherit.duration,
          delay: 0,
          duration: inherit.duration,
          ease: inherit.ease
        });
      }
    }
  }

  return new Transition(groups, this._parents, name, id1);
}

;// ./node_modules/d3-transition/src/transition/end.js


/* harmony default export */ function end() {
  var on0, on1, that = this, id = that._id, size = that.size();
  return new Promise(function(resolve, reject) {
    var cancel = {value: reject},
        end = {value: function() { if (--size === 0) resolve(); }};

    that.each(function() {
      var schedule = schedule_set(this, id),
          on = schedule.on;

      // If this node shared a dispatch with the previous node,
      // just assign the updated shared dispatch and we’re done!
      // Otherwise, copy-on-write.
      if (on !== on0) {
        on1 = (on0 = on).copy();
        on1._.cancel.push(cancel);
        on1._.interrupt.push(cancel);
        on1._.end.push(end);
      }

      schedule.on = on1;
    });

    // The selection was empty, resolve end immediately
    if (size === 0) resolve();
  });
}

;// ./node_modules/d3-transition/src/transition/index.js






















var id = 0;

function Transition(groups, parents, name, id) {
  this._groups = groups;
  this._parents = parents;
  this._name = name;
  this._id = id;
}

function transition_transition(name) {
  return src_selection().transition(name);
}

function newId() {
  return ++id;
}

var selection_prototype = src_selection.prototype;

Transition.prototype = transition_transition.prototype = {
  constructor: Transition,
  select: transition_select,
  selectAll: transition_selectAll,
  selectChild: selection_prototype.selectChild,
  selectChildren: selection_prototype.selectChildren,
  filter: transition_filter,
  merge: transition_merge,
  selection: transition_selection,
  transition: transition,
  call: selection_prototype.call,
  nodes: selection_prototype.nodes,
  node: selection_prototype.node,
  size: selection_prototype.size,
  empty: selection_prototype.empty,
  each: selection_prototype.each,
  on: transition_on,
  attr: transition_attr,
  attrTween: transition_attrTween,
  style: transition_style,
  styleTween: transition_styleTween,
  text: transition_text,
  textTween: transition_textTween,
  remove: transition_remove,
  tween: tween,
  delay: delay,
  duration: duration,
  ease: ease,
  easeVarying: transition_easeVarying,
  end: end,
  [Symbol.iterator]: selection_prototype[Symbol.iterator]
};

;// ./node_modules/d3-ease/src/cubic.js
function cubicIn(t) {
  return t * t * t;
}

function cubicOut(t) {
  return --t * t * t + 1;
}

function cubicInOut(t) {
  return ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2;
}

;// ./node_modules/d3-transition/src/selection/transition.js





var defaultTiming = {
  time: null, // Set on use.
  delay: 0,
  duration: 250,
  ease: cubicInOut
};

function inherit(node, id) {
  var timing;
  while (!(timing = node.__transition) || !(timing = timing[id])) {
    if (!(node = node.parentNode)) {
      throw new Error(`transition ${id} not found`);
    }
  }
  return timing;
}

/* harmony default export */ function selection_transition(name) {
  var id,
      timing;

  if (name instanceof Transition) {
    id = name._id, name = name._name;
  } else {
    id = newId(), (timing = defaultTiming).time = now(), name = name == null ? null : name + "";
  }

  for (var groups = this._groups, m = groups.length, j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        schedule(node, name, id, i, group, timing || inherit(node, id));
      }
    }
  }

  return new Transition(groups, this._parents, name, id);
}

;// ./node_modules/d3-transition/src/selection/index.js




src_selection.prototype.interrupt = selection_interrupt;
src_selection.prototype.transition = selection_transition;

;// ./node_modules/d3-transition/src/index.js





;// ./node_modules/d3-zoom/src/constant.js
/* harmony default export */ const d3_zoom_src_constant = (x => () => x);

;// ./node_modules/d3-zoom/src/event.js
function ZoomEvent(type, {
  sourceEvent,
  target,
  transform,
  dispatch
}) {
  Object.defineProperties(this, {
    type: {value: type, enumerable: true, configurable: true},
    sourceEvent: {value: sourceEvent, enumerable: true, configurable: true},
    target: {value: target, enumerable: true, configurable: true},
    transform: {value: transform, enumerable: true, configurable: true},
    _: {value: dispatch}
  });
}

;// ./node_modules/d3-zoom/src/transform.js
function Transform(k, x, y) {
  this.k = k;
  this.x = x;
  this.y = y;
}

Transform.prototype = {
  constructor: Transform,
  scale: function(k) {
    return k === 1 ? this : new Transform(this.k * k, this.x, this.y);
  },
  translate: function(x, y) {
    return x === 0 & y === 0 ? this : new Transform(this.k, this.x + this.k * x, this.y + this.k * y);
  },
  apply: function(point) {
    return [point[0] * this.k + this.x, point[1] * this.k + this.y];
  },
  applyX: function(x) {
    return x * this.k + this.x;
  },
  applyY: function(y) {
    return y * this.k + this.y;
  },
  invert: function(location) {
    return [(location[0] - this.x) / this.k, (location[1] - this.y) / this.k];
  },
  invertX: function(x) {
    return (x - this.x) / this.k;
  },
  invertY: function(y) {
    return (y - this.y) / this.k;
  },
  rescaleX: function(x) {
    return x.copy().domain(x.range().map(this.invertX, this).map(x.invert, x));
  },
  rescaleY: function(y) {
    return y.copy().domain(y.range().map(this.invertY, this).map(y.invert, y));
  },
  toString: function() {
    return "translate(" + this.x + "," + this.y + ") scale(" + this.k + ")";
  }
};

var transform_identity = new Transform(1, 0, 0);

transform_transform.prototype = Transform.prototype;

function transform_transform(node) {
  while (!node.__zoom) if (!(node = node.parentNode)) return transform_identity;
  return node.__zoom;
}

;// ./node_modules/d3-zoom/src/noevent.js
function noevent_nopropagation(event) {
  event.stopImmediatePropagation();
}

/* harmony default export */ function src_noevent(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

;// ./node_modules/d3-zoom/src/zoom.js










// Ignore right-click, since that should open the context menu.
// except for pinch-to-zoom, which is sent as a wheel+ctrlKey event
function defaultFilter(event) {
  return (!event.ctrlKey || event.type === 'wheel') && !event.button;
}

function defaultExtent() {
  var e = this;
  if (e instanceof SVGElement) {
    e = e.ownerSVGElement || e;
    if (e.hasAttribute("viewBox")) {
      e = e.viewBox.baseVal;
      return [[e.x, e.y], [e.x + e.width, e.y + e.height]];
    }
    return [[0, 0], [e.width.baseVal.value, e.height.baseVal.value]];
  }
  return [[0, 0], [e.clientWidth, e.clientHeight]];
}

function defaultTransform() {
  return this.__zoom || transform_identity;
}

function defaultWheelDelta(event) {
  return -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002) * (event.ctrlKey ? 10 : 1);
}

function defaultTouchable() {
  return navigator.maxTouchPoints || ("ontouchstart" in this);
}

function defaultConstrain(transform, extent, translateExtent) {
  var dx0 = transform.invertX(extent[0][0]) - translateExtent[0][0],
      dx1 = transform.invertX(extent[1][0]) - translateExtent[1][0],
      dy0 = transform.invertY(extent[0][1]) - translateExtent[0][1],
      dy1 = transform.invertY(extent[1][1]) - translateExtent[1][1];
  return transform.translate(
    dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1),
    dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1)
  );
}

/* harmony default export */ function zoom() {
  var filter = defaultFilter,
      extent = defaultExtent,
      constrain = defaultConstrain,
      wheelDelta = defaultWheelDelta,
      touchable = defaultTouchable,
      scaleExtent = [0, Infinity],
      translateExtent = [[-Infinity, -Infinity], [Infinity, Infinity]],
      duration = 250,
      interpolate = src_zoom,
      listeners = src_dispatch("start", "zoom", "end"),
      touchstarting,
      touchfirst,
      touchending,
      touchDelay = 500,
      wheelDelay = 150,
      clickDistance2 = 0,
      tapDistance = 10;

  function zoom(selection) {
    selection
        .property("__zoom", defaultTransform)
        .on("wheel.zoom", wheeled, {passive: false})
        .on("mousedown.zoom", mousedowned)
        .on("dblclick.zoom", dblclicked)
      .filter(touchable)
        .on("touchstart.zoom", touchstarted)
        .on("touchmove.zoom", touchmoved)
        .on("touchend.zoom touchcancel.zoom", touchended)
        .style("-webkit-tap-highlight-color", "rgba(0,0,0,0)");
  }

  zoom.transform = function(collection, transform, point, event) {
    var selection = collection.selection ? collection.selection() : collection;
    selection.property("__zoom", defaultTransform);
    if (collection !== selection) {
      schedule(collection, transform, point, event);
    } else {
      selection.interrupt().each(function() {
        gesture(this, arguments)
          .event(event)
          .start()
          .zoom(null, typeof transform === "function" ? transform.apply(this, arguments) : transform)
          .end();
      });
    }
  };

  zoom.scaleBy = function(selection, k, p, event) {
    zoom.scaleTo(selection, function() {
      var k0 = this.__zoom.k,
          k1 = typeof k === "function" ? k.apply(this, arguments) : k;
      return k0 * k1;
    }, p, event);
  };

  zoom.scaleTo = function(selection, k, p, event) {
    zoom.transform(selection, function() {
      var e = extent.apply(this, arguments),
          t0 = this.__zoom,
          p0 = p == null ? centroid(e) : typeof p === "function" ? p.apply(this, arguments) : p,
          p1 = t0.invert(p0),
          k1 = typeof k === "function" ? k.apply(this, arguments) : k;
      return constrain(translate(scale(t0, k1), p0, p1), e, translateExtent);
    }, p, event);
  };

  zoom.translateBy = function(selection, x, y, event) {
    zoom.transform(selection, function() {
      return constrain(this.__zoom.translate(
        typeof x === "function" ? x.apply(this, arguments) : x,
        typeof y === "function" ? y.apply(this, arguments) : y
      ), extent.apply(this, arguments), translateExtent);
    }, null, event);
  };

  zoom.translateTo = function(selection, x, y, p, event) {
    zoom.transform(selection, function() {
      var e = extent.apply(this, arguments),
          t = this.__zoom,
          p0 = p == null ? centroid(e) : typeof p === "function" ? p.apply(this, arguments) : p;
      return constrain(transform_identity.translate(p0[0], p0[1]).scale(t.k).translate(
        typeof x === "function" ? -x.apply(this, arguments) : -x,
        typeof y === "function" ? -y.apply(this, arguments) : -y
      ), e, translateExtent);
    }, p, event);
  };

  function scale(transform, k) {
    k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], k));
    return k === transform.k ? transform : new Transform(k, transform.x, transform.y);
  }

  function translate(transform, p0, p1) {
    var x = p0[0] - p1[0] * transform.k, y = p0[1] - p1[1] * transform.k;
    return x === transform.x && y === transform.y ? transform : new Transform(transform.k, x, y);
  }

  function centroid(extent) {
    return [(+extent[0][0] + +extent[1][0]) / 2, (+extent[0][1] + +extent[1][1]) / 2];
  }

  function schedule(transition, transform, point, event) {
    transition
        .on("start.zoom", function() { gesture(this, arguments).event(event).start(); })
        .on("interrupt.zoom end.zoom", function() { gesture(this, arguments).event(event).end(); })
        .tween("zoom", function() {
          var that = this,
              args = arguments,
              g = gesture(that, args).event(event),
              e = extent.apply(that, args),
              p = point == null ? centroid(e) : typeof point === "function" ? point.apply(that, args) : point,
              w = Math.max(e[1][0] - e[0][0], e[1][1] - e[0][1]),
              a = that.__zoom,
              b = typeof transform === "function" ? transform.apply(that, args) : transform,
              i = interpolate(a.invert(p).concat(w / a.k), b.invert(p).concat(w / b.k));
          return function(t) {
            if (t === 1) t = b; // Avoid rounding error on end.
            else { var l = i(t), k = w / l[2]; t = new Transform(k, p[0] - l[0] * k, p[1] - l[1] * k); }
            g.zoom(null, t);
          };
        });
  }

  function gesture(that, args, clean) {
    return (!clean && that.__zooming) || new Gesture(that, args);
  }

  function Gesture(that, args) {
    this.that = that;
    this.args = args;
    this.active = 0;
    this.sourceEvent = null;
    this.extent = extent.apply(that, args);
    this.taps = 0;
  }

  Gesture.prototype = {
    event: function(event) {
      if (event) this.sourceEvent = event;
      return this;
    },
    start: function() {
      if (++this.active === 1) {
        this.that.__zooming = this;
        this.emit("start");
      }
      return this;
    },
    zoom: function(key, transform) {
      if (this.mouse && key !== "mouse") this.mouse[1] = transform.invert(this.mouse[0]);
      if (this.touch0 && key !== "touch") this.touch0[1] = transform.invert(this.touch0[0]);
      if (this.touch1 && key !== "touch") this.touch1[1] = transform.invert(this.touch1[0]);
      this.that.__zoom = transform;
      this.emit("zoom");
      return this;
    },
    end: function() {
      if (--this.active === 0) {
        delete this.that.__zooming;
        this.emit("end");
      }
      return this;
    },
    emit: function(type) {
      var d = src_select(this.that).datum();
      listeners.call(
        type,
        this.that,
        new ZoomEvent(type, {
          sourceEvent: this.sourceEvent,
          target: zoom,
          type,
          transform: this.that.__zoom,
          dispatch: listeners
        }),
        d
      );
    }
  };

  function wheeled(event, ...args) {
    if (!filter.apply(this, arguments)) return;
    var g = gesture(this, args).event(event),
        t = this.__zoom,
        k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], t.k * Math.pow(2, wheelDelta.apply(this, arguments)))),
        p = pointer(event);

    // If the mouse is in the same location as before, reuse it.
    // If there were recent wheel events, reset the wheel idle timeout.
    if (g.wheel) {
      if (g.mouse[0][0] !== p[0] || g.mouse[0][1] !== p[1]) {
        g.mouse[1] = t.invert(g.mouse[0] = p);
      }
      clearTimeout(g.wheel);
    }

    // If this wheel event won’t trigger a transform change, ignore it.
    else if (t.k === k) return;

    // Otherwise, capture the mouse point and location at the start.
    else {
      g.mouse = [p, t.invert(p)];
      interrupt(this);
      g.start();
    }

    src_noevent(event);
    g.wheel = setTimeout(wheelidled, wheelDelay);
    g.zoom("mouse", constrain(translate(scale(t, k), g.mouse[0], g.mouse[1]), g.extent, translateExtent));

    function wheelidled() {
      g.wheel = null;
      g.end();
    }
  }

  function mousedowned(event, ...args) {
    if (touchending || !filter.apply(this, arguments)) return;
    var currentTarget = event.currentTarget,
        g = gesture(this, args, true).event(event),
        v = src_select(event.view).on("mousemove.zoom", mousemoved, true).on("mouseup.zoom", mouseupped, true),
        p = pointer(event, currentTarget),
        x0 = event.clientX,
        y0 = event.clientY;

    nodrag(event.view);
    noevent_nopropagation(event);
    g.mouse = [p, this.__zoom.invert(p)];
    interrupt(this);
    g.start();

    function mousemoved(event) {
      src_noevent(event);
      if (!g.moved) {
        var dx = event.clientX - x0, dy = event.clientY - y0;
        g.moved = dx * dx + dy * dy > clickDistance2;
      }
      g.event(event)
       .zoom("mouse", constrain(translate(g.that.__zoom, g.mouse[0] = pointer(event, currentTarget), g.mouse[1]), g.extent, translateExtent));
    }

    function mouseupped(event) {
      v.on("mousemove.zoom mouseup.zoom", null);
      yesdrag(event.view, g.moved);
      src_noevent(event);
      g.event(event).end();
    }
  }

  function dblclicked(event, ...args) {
    if (!filter.apply(this, arguments)) return;
    var t0 = this.__zoom,
        p0 = pointer(event.changedTouches ? event.changedTouches[0] : event, this),
        p1 = t0.invert(p0),
        k1 = t0.k * (event.shiftKey ? 0.5 : 2),
        t1 = constrain(translate(scale(t0, k1), p0, p1), extent.apply(this, args), translateExtent);

    src_noevent(event);
    if (duration > 0) src_select(this).transition().duration(duration).call(schedule, t1, p0, event);
    else src_select(this).call(zoom.transform, t1, p0, event);
  }

  function touchstarted(event, ...args) {
    if (!filter.apply(this, arguments)) return;
    var touches = event.touches,
        n = touches.length,
        g = gesture(this, args, event.changedTouches.length === n).event(event),
        started, i, t, p;

    noevent_nopropagation(event);
    for (i = 0; i < n; ++i) {
      t = touches[i], p = pointer(t, this);
      p = [p, this.__zoom.invert(p), t.identifier];
      if (!g.touch0) g.touch0 = p, started = true, g.taps = 1 + !!touchstarting;
      else if (!g.touch1 && g.touch0[2] !== p[2]) g.touch1 = p, g.taps = 0;
    }

    if (touchstarting) touchstarting = clearTimeout(touchstarting);

    if (started) {
      if (g.taps < 2) touchfirst = p[0], touchstarting = setTimeout(function() { touchstarting = null; }, touchDelay);
      interrupt(this);
      g.start();
    }
  }

  function touchmoved(event, ...args) {
    if (!this.__zooming) return;
    var g = gesture(this, args).event(event),
        touches = event.changedTouches,
        n = touches.length, i, t, p, l;

    src_noevent(event);
    for (i = 0; i < n; ++i) {
      t = touches[i], p = pointer(t, this);
      if (g.touch0 && g.touch0[2] === t.identifier) g.touch0[0] = p;
      else if (g.touch1 && g.touch1[2] === t.identifier) g.touch1[0] = p;
    }
    t = g.that.__zoom;
    if (g.touch1) {
      var p0 = g.touch0[0], l0 = g.touch0[1],
          p1 = g.touch1[0], l1 = g.touch1[1],
          dp = (dp = p1[0] - p0[0]) * dp + (dp = p1[1] - p0[1]) * dp,
          dl = (dl = l1[0] - l0[0]) * dl + (dl = l1[1] - l0[1]) * dl;
      t = scale(t, Math.sqrt(dp / dl));
      p = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      l = [(l0[0] + l1[0]) / 2, (l0[1] + l1[1]) / 2];
    }
    else if (g.touch0) p = g.touch0[0], l = g.touch0[1];
    else return;

    g.zoom("touch", constrain(translate(t, p, l), g.extent, translateExtent));
  }

  function touchended(event, ...args) {
    if (!this.__zooming) return;
    var g = gesture(this, args).event(event),
        touches = event.changedTouches,
        n = touches.length, i, t;

    noevent_nopropagation(event);
    if (touchending) clearTimeout(touchending);
    touchending = setTimeout(function() { touchending = null; }, touchDelay);
    for (i = 0; i < n; ++i) {
      t = touches[i];
      if (g.touch0 && g.touch0[2] === t.identifier) delete g.touch0;
      else if (g.touch1 && g.touch1[2] === t.identifier) delete g.touch1;
    }
    if (g.touch1 && !g.touch0) g.touch0 = g.touch1, delete g.touch1;
    if (g.touch0) g.touch0[1] = this.__zoom.invert(g.touch0[0]);
    else {
      g.end();
      // If this was a dbltap, reroute to the (optional) dblclick.zoom handler.
      if (g.taps === 2) {
        t = pointer(t, this);
        if (Math.hypot(touchfirst[0] - t[0], touchfirst[1] - t[1]) < tapDistance) {
          var p = src_select(this).on("dblclick.zoom");
          if (p) p.apply(this, arguments);
        }
      }
    }
  }

  zoom.wheelDelta = function(_) {
    return arguments.length ? (wheelDelta = typeof _ === "function" ? _ : d3_zoom_src_constant(+_), zoom) : wheelDelta;
  };

  zoom.filter = function(_) {
    return arguments.length ? (filter = typeof _ === "function" ? _ : d3_zoom_src_constant(!!_), zoom) : filter;
  };

  zoom.touchable = function(_) {
    return arguments.length ? (touchable = typeof _ === "function" ? _ : d3_zoom_src_constant(!!_), zoom) : touchable;
  };

  zoom.extent = function(_) {
    return arguments.length ? (extent = typeof _ === "function" ? _ : d3_zoom_src_constant([[+_[0][0], +_[0][1]], [+_[1][0], +_[1][1]]]), zoom) : extent;
  };

  zoom.scaleExtent = function(_) {
    return arguments.length ? (scaleExtent[0] = +_[0], scaleExtent[1] = +_[1], zoom) : [scaleExtent[0], scaleExtent[1]];
  };

  zoom.translateExtent = function(_) {
    return arguments.length ? (translateExtent[0][0] = +_[0][0], translateExtent[1][0] = +_[1][0], translateExtent[0][1] = +_[0][1], translateExtent[1][1] = +_[1][1], zoom) : [[translateExtent[0][0], translateExtent[0][1]], [translateExtent[1][0], translateExtent[1][1]]];
  };

  zoom.constrain = function(_) {
    return arguments.length ? (constrain = _, zoom) : constrain;
  };

  zoom.duration = function(_) {
    return arguments.length ? (duration = +_, zoom) : duration;
  };

  zoom.interpolate = function(_) {
    return arguments.length ? (interpolate = _, zoom) : interpolate;
  };

  zoom.on = function() {
    var value = listeners.on.apply(listeners, arguments);
    return value === listeners ? zoom : value;
  };

  zoom.clickDistance = function(_) {
    return arguments.length ? (clickDistance2 = (_ = +_) * _, zoom) : Math.sqrt(clickDistance2);
  };

  zoom.tapDistance = function(_) {
    return arguments.length ? (tapDistance = +_, zoom) : tapDistance;
  };

  return zoom;
}

;// ./node_modules/d3-zoom/src/index.js



;// ./node_modules/gridviz/src/core/GeoCanvas.js
//@ts-check


/** @typedef { {xMin: number, xMax: number, yMin: number, yMax: number} } Envelope */

/**
 * A viewshed.
 * @typedef {{x: number, y: number, z: number}} View */

;


/**
 * A HTML canvas for geo data display, enhanced with zoom and pan capabilities.
 *
 * @module core
 * @author Joseph Davies, Julien Gaffuri
 */
class GeoCanvas {
    /**
     * @constructor
     * @param {HTMLCanvasElement} canvas
     * @param {number} x The x coordinate of the view
     * @param {number} y The y coordinate of the view
     * @param {number} z The zoom level of the view (pixel size, in ground m)
     * @param {object} opts
     */
    constructor(canvas, x = 0, y = 0, z = 0, opts = undefined) {
        this.opts = opts || {}

        /** @type {HTMLCanvasElement} */
        this.canvas = canvas

        /** @type {number} */
        this.w = this.canvas.offsetWidth
        /** @type {number} */
        this.h = this.canvas.offsetHeight

        // Adjust canvas width and height based on device pixel ratio
        //const dpr = window.devicePixelRatio || 1 // Get the device pixel ratio
        //this.canvas.width = this.w * dpr // Set canvas width
        //\sthis.canvas.height = this.h * dpr // Set canvas height

        // Create offscreen canvas for drawing operations
        this.offscreenCanvas = document.createElement('canvas')
        this.offscreenCanvas.width = this.w
        this.offscreenCanvas.height = this.h

        const ctx = this.canvas.getContext('2d')
        const offscreenCtx = this.offscreenCanvas.getContext('2d')
        if (!ctx) throw 'Impossible to create canvas 2D context'
        if (!offscreenCtx) throw 'Impossible to create canvas 2D context'
        /**@type {CanvasRenderingContext2D} */
        this.ctx = ctx
        this.offscreenCtx = offscreenCtx
        //this.ctx.scale(dpr, dpr) // Scale the context

        /**
         * z: pixel size, in m/pix
         * @type {View}  */
        this.view = { x: x, y: y, z: z }

        /** Background color.
         * @type {string} */
        this.backgroundColor = opts.backgroundColor || 'white'

        /** @type {function(object|undefined):void} */
        this.onZoomStartFun = opts.onZoomStartFun

        /** @type {function(object|undefined):void} */
        this.onZoomEndFun = opts.onZoomEndFun

        /** @type {function(object|undefined):void} */
        this.onZoomFun = opts.onZoomFun

        //current extent
        /** @type {Envelope} */
        this.extGeo = { xMin: NaN, xMax: NaN, yMin: NaN, yMax: NaN }
        this.updateExtentGeo()

        //rely on d3 for zoom
        if (!opts.disableZoom) {
            let tP = transform_identity
            // @ts-ignore
            let debounceTimeout = null // Add a debounce timeout variable
            const z = zoom()
                // to make the zooming a bit faster
                .wheelDelta((e) => -e.deltaY * (e.deltaMode === 1 ? 0.07 : e.deltaMode ? 1 : 0.004))
                .on('zoom', (e) => {
                    const t = e.transform
                    const zoomFactor = tP.k / t.k
                    if (zoomFactor == 1) {
                        //pan
                        const dx = tP.x - t.x
                        const dy = tP.y - t.y
                        this.pan(dx * this.view.z, -dy * this.view.z)
                    } else {
                        handleZoom(e, zoomFactor)
                    }
                    tP = t

                    if (this.onZoomFun) this.onZoomFun(e)
                })
                .on('start', (e) => {
                    // start of zoom event
                    // save the current canvas state to keep onscreen during pan/zoom before redrawing
                    this.canvasSave.c = document.createElement('canvas')
                    this.canvasSave.c.setAttribute('width', '' + this.w)
                    this.canvasSave.c.setAttribute('height', '' + this.h)
                    this.canvasSave.c.getContext('2d')?.drawImage(this.canvas, 0, 0)
                    this.canvasSave.dx = 0
                    this.canvasSave.dy = 0
                    this.canvasSave.f = 1
                    if (this.onZoomStartFun) this.onZoomStartFun(e)
                })
                .on('end', (e) => {
                    // end of pan/zoom event
                    this.redraw()
                    this.canvasSave = { c: null, dx: 0, dy: 0, f: 1 }

                    if (this.onZoomEndFun) this.onZoomEndFun(e)
                })
            // @ts-ignore
            z(src_select(this.canvas))

            const handleZoom = (event, zoomFactor) => {
                // cancel ongoing data requests
                this.cancelCurrentRequests()
                const se = event.sourceEvent

                if (se instanceof WheelEvent) {
                    //zoom at the mouse position
                    this.zoom(
                        zoomFactor,
                        // @ts-ignore
                        this.pixToGeoX(se.offsetX),
                        // @ts-ignore
                        this.pixToGeoY(se.offsetY)
                    )
                } else if (se instanceof TouchEvent) {
                    //compute average position of the touches
                    let tx = 0,
                        ty = 0
                    for (let tt of se.targetTouches) {
                        tx += tt.clientX
                        ty += tt.clientY
                    }
                    tx /= se.targetTouches.length
                    ty /= se.targetTouches.length

                    // Adjust for container's offset
                    // tx -= containerRect.left
                    // ty -= containerRect.top

                    //zoom at this average position
                    this.zoom(zoomFactor, this.pixToGeoX(tx), this.pixToGeoY(ty))
                }
            }
        }

        //center extent
        /** @type {number|undefined} */
        this.xMin = opts.centerExtent ? opts.centerExtent[0] : undefined
        /** @type {number|undefined} */
        this.yMin = opts.centerExtent ? opts.centerExtent[1] : undefined
        /** @type {number|undefined} */
        this.xMax = opts.centerExtent ? opts.centerExtent[2] : undefined
        /** @type {number|undefined} */
        this.yMax = opts.centerExtent ? opts.centerExtent[3] : undefined

        /** Zoom extent, to limit zoom in and out
         *  @type {Array.<number>} */
        this.zoomExtent = opts.zoomExtent || [0, Infinity]

        /** Canvas state, to be used to avoid unnecessary redraws on zoom/pan
         *  @type {{c:HTMLCanvasElement|null,dx:number,dy:number,f:number}} */
        this.canvasSave = { c: null, dx: 0, dy: 0, f: 1 }
    }

    /** @returns {View} */
    getView() {
        return this.view
    }

    /** @param {Array.<number>} v */
    setCenterExtent(v) {
        this.xMin = v[0]
        this.yMin = v[1]
        this.xMax = v[2]
        this.yMax = v[3]
    }
    /** @returns {Array.<number|undefined>} */
    getCenterExtent() {
        return [this.xMin, this.yMin, this.xMax, this.yMax]
    }

    /** @param {Array.<number>} v */
    setZoomExtent(v) {
        this.zoomExtent = v
    }
    /** @returns {Array.<number>} */
    getZoomExtent() {
        return this.zoomExtent
    }

    /** Initialise canvas transform with identity transformation. */
    initCanvasTransform() {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0)
        this.offscreenCtx.setTransform(1, 0, 0, 1, 0, 0)
    }

    /** Initialise canvas transform with geo to screen transformation, so that geo objects can be drawn directly in geo coordinates. */
    setCanvasTransform() {
        const k = 1 / this.view.z
        const tx = -this.view.x / this.view.z + this.w * 0.5
        const ty = this.view.y / this.view.z + this.h * 0.5
        this.ctx.setTransform(k, 0, 0, -k, tx, ty)
        this.offscreenCtx.setTransform(k, 0, 0, -k, tx, ty)
    }

    /** Get the transformation matrix to webGL screen coordinates, within [-1,1]*[-1,1] */
    getWebGLTransform() {
        const kx = 2.0 / (this.w * this.view.z)
        const ky = 2.0 / (this.h * this.view.z)
        return [kx, 0.0, 0.0, 0.0, ky, 0.0, -kx * this.view.x, -ky * this.view.y, 1.0]
    }

    /** The function specifying how to draw the map. */
    redraw() {
        throw new Error('Method redraw not implemented.')
    }

    /** When the zoom level changes, ensures that any ongoing requests are aborted before new ones are initiated. */
    cancelCurrentRequests() {
        throw new Error('Method cancelCurrentRequests not implemented.')
    }

    /**
     * Clear. To be used before a redraw for example.
     * @param {string} color
     */
    clear(color = 'white') {
        if (this.opts.transparentBackground) {
            this.ctx.clearRect(0, 0, this.w, this.h)
            this.offscreenCtx.clearRect(0, 0, this.w, this.h)
        } else {
            if (this.ctx) this.ctx.fillStyle = color
            if (this.offscreenCtx) this.offscreenCtx.fillStyle = color
            this.ctx.fillRect(0, 0, this.w, this.h)
            this.offscreenCtx.fillRect(0, 0, this.w, this.h)
        }
    }

    /**
     * @param {number} dxGeo
     * @param {number} dyGeo
     */
    pan(dxGeo = 0, dyGeo = 0) {
        //ensures x/y extent
        if (this.xMin != undefined && this.view.x + dxGeo < this.xMin) dxGeo = this.xMin - this.view.x
        if (this.yMin != undefined && this.view.y + dyGeo < this.yMin) dyGeo = this.yMin - this.view.y
        if (this.xMax != undefined && this.view.x + dxGeo > this.xMax) dxGeo = this.xMax - this.view.x
        if (this.yMax != undefined && this.view.y + dyGeo > this.yMax) dyGeo = this.yMax - this.view.y

        //pan
        this.view.x += dxGeo
        this.view.y += dyGeo
        this.updateExtentGeo()

        if (this.canvasSave.c) {
            const scale = 1 / this.view.z

            // Update saved canvas offset
            this.canvasSave.dx -= dxGeo * scale
            this.canvasSave.dy += dyGeo * scale

            // clear canvas
            this.clear(this.backgroundColor)

            // this doesnt work on mobile https://github.com/eurostat/gridviz/issues/98
            //this.ctx.drawImage(this.canvasSave.c, this.canvasSave.dx, this.canvasSave.dy)
            this.offscreenCtx.drawImage(this.canvasSave.c, this.canvasSave.dx, this.canvasSave.dy)

            // Render the offscreen canvas to the visible context
            // this.clear(this.backgroundColor)
            this.ctx.drawImage(this.offscreenCtx.canvas, 0, 0)
        } else {
            console.log('no canvas save')
        }
    }

    /**
     * Zoom.
     * @param {number} f The zoom factor, within ]0, Infinity]. 1 is for no change. <1 to zoom-in, >1 to zoom-out.
     * @param {number} xGeo The x geo position fixed in the screen.
     * @param {number} yGeo The y geo position fixed in the screen.
     */
    zoom(f = 1, xGeo = this.view.x, yGeo = this.view.y) {
        //TODO force geo extend to remain

        //trying to zoom in/out beyond limit
        if (this.zoomExtent[0] == this.view.z && f <= 1) return
        if (this.zoomExtent[1] == this.view.z && f >= 1) return

        //ensure zoom extent preserved
        const newZf = f * this.view.z
        if (newZf < this.zoomExtent[0]) f = this.zoomExtent[0] / this.view.z
        if (newZf > this.zoomExtent[1]) f = this.zoomExtent[1] / this.view.z

        this.view.z *= f

        //compute pan
        let dxGeo = (xGeo - this.view.x) * (1 - f)
        let dyGeo = (yGeo - this.view.y) * (1 - f)

        //ensures x/y extent
        if (this.xMin != undefined && this.view.x + dxGeo < this.xMin) dxGeo = this.xMin - this.view.x
        if (this.yMin != undefined && this.view.y + dyGeo < this.yMin) dyGeo = this.yMin - this.view.y
        if (this.xMax != undefined && this.view.x + dxGeo > this.xMax) dxGeo = this.xMax - this.view.x
        if (this.yMax != undefined && this.view.y + dyGeo > this.yMax) dyGeo = this.yMax - this.view.y

        //pan
        this.view.x += dxGeo
        this.view.y += dyGeo
        this.updateExtentGeo()

        // zoom in on the current canvas state
        if (this.canvasSave.c) {
            this.clear(this.backgroundColor)
            this.canvasSave.f /= f
            this.canvasSave.dx = this.geoToPixX(xGeo) * (1 - this.canvasSave.f)
            this.canvasSave.dy = this.geoToPixY(yGeo) * (1 - this.canvasSave.f)
            this.clear(this.backgroundColor)
            this.offscreenCtx.drawImage(
                this.canvasSave.c,
                this.canvasSave.dx,
                this.canvasSave.dy,
                this.canvasSave.f * this.canvasSave.c.width,
                this.canvasSave.f * this.canvasSave.c.height
            )
            this.ctx.drawImage(
                this.offscreenCanvas, // Use offscreen canvas as the source
                0,
                0, // Position the offscreen canvas at the top-left corner of the main canvas
                this.canvas.width, // The width of the visible canvas
                this.canvas.height // The height of the visible canvas
            )
        }
    }

    /**
     * @param {number} marginPx
     * @returns {Envelope} The envelope of the view, in geo coordinates.
     */
    updateExtentGeo(marginPx = 20) {
        this.extGeo = {
            xMin: this.pixToGeoX(-marginPx),
            xMax: this.pixToGeoX(this.w + marginPx),
            yMin: this.pixToGeoY(this.h + marginPx),
            yMax: this.pixToGeoY(-marginPx),
        }
        return this.extGeo
    }

    /**
     * Check if the object has to be drawn
     *
     * @param {{x:number,y:number}} obj
     */
    toDraw(obj) {
        if (obj.x < this.extGeo.xMin) return false
        if (obj.x > this.extGeo.xMax) return false
        if (obj.y < this.extGeo.yMin) return false
        if (obj.y > this.extGeo.yMax) return false
        return true
    }

    //conversion functions
    /**
     * @param {number} xGeo Geo x coordinate, in m.
     * @returns {number} Screen x coordinate, in pix.
     */
    geoToPixX(xGeo) {
        return (xGeo - this.view.x) / this.view.z + this.w * 0.5
    }
    /**
     * @param {number} yGeo Geo y coordinate, in m.
     * @returns {number} Screen y coordinate, in pix.
     */
    geoToPixY(yGeo) {
        return -(yGeo - this.view.y) / this.view.z + this.h * 0.5
    }
    /**
     * @param {number} x Screen x coordinate, in pix.
     * @returns {number} Geo x coordinate, in m.
     */
    pixToGeoX(x) {
        return (x - this.w * 0.5) * this.view.z + this.view.x
    }
    /**
     * @param {number} y Screen y coordinate, in pix.
     * @returns {number} Geo y coordinate, in m.
     */
    pixToGeoY(y) {
        return -(y - this.h * 0.5) * this.view.z + this.view.y
    }

    /** Get x,y,z elements from URL and assign them to the view. */
    setViewFromURL() {
        const x = GeoCanvas.getParameterByName('x'),
            y = GeoCanvas.getParameterByName('y'),
            z = GeoCanvas.getParameterByName('z')
        if (x != null && x != undefined && !isNaN(+x)) this.view.x = +x
        if (y != null && y != undefined && !isNaN(+y)) this.view.y = +y
        if (z != null && z != undefined && !isNaN(+z)) this.view.z = +z
    }

    /**
     * Get a URL parameter by name.
     *
     * @param {string} name
     * @returns {string | null}
     */
    static getParameterByName(name) {
        name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]')
        var regex = new RegExp('[\\?&]' + name + '=([^&#]*)'),
            results = regex.exec(location.search)
        return !results ? null : decodeURIComponent(results[1].replace(/\+/g, ' '))
    }
}

;// ./node_modules/gridviz/src/core/Tooltip.js
//@ts-check


;
//import { transition } from "d3-transition";

/**
 * A generic class to make a tooltip.
 * It is a div element, which can be moved under the mouse pointer and filled with some information in html.
 * @module core
 */
class Tooltip {
    /**
     * @param {object} opts
     */
    constructor(opts) {
        opts = opts || {}

        /** @type {string} */
        this.maxWidth = opts.maxWidth || '20em'
        /** @type {string} */
        this.fontSize = opts.fontSize || '1.2em'
        /** @type {string} */
        this.background = opts.background || 'white'
        /** @type {string} */
        this.padding = opts.padding || '5px'
        /** @type {string} */
        this.border = opts.border || '0px'
        /** @type {string} */
        this['border-radius'] = opts['border-radius'] || '0px'
        /** @type {string} */
        this['box-shadow'] = opts['box-shadow'] || '5px 5px 5px grey'
        /** @type {string} */
        this['font-family'] = opts['font-family'] || 'Helvetica, Arial, sans-serif'

        /** @type {number} */
        this.transitionDuration = opts.transitionDuration || 100
        /** @type {number} */
        this.xOffset = opts.xOffset || 30
        /** @type {number} */
        this.yOffset = opts.yOffset || 20
        /** @type {number} */ // e.g. to prevent mouse cursor covering cell being highlighted
        this.yMouseOffset = opts.yMouseOffset || 0
        /** @type {number} */
        this.xMouseOffset = opts.xMouseOffset || 0
        /** @type {HTMLElement} */
        this.parentElement = opts.parentElement || document.body
        /** @type {HTMLElement} */
        this.tooltipElement = opts.tooltipElement || null

        /**
         * @public
         * @type {import("d3-selection").Selection} */
        this.tooltip = opts.tooltipElement
            ? src_select(opts.tooltipElement) // Wrap the provided HTML node in a D3 selection
            : src_select(this.parentElement).append('div').attr('id', 'gridviz-tooltip').attr('class', 'gridviz-tooltip') // create default element

        //initialise
        this.tooltip.style('max-width', this.maxWidth)
        this.tooltip.style('overflow', 'hidden')
        this.tooltip.style('font-size', this.fontSize)
        this.tooltip.style('background', this.background)
        this.tooltip.style('padding', this.padding)
        this.tooltip.style('border', this.border)
        this.tooltip.style('border-radius', this['border-radius'])
        this.tooltip.style('box-shadow', this['box-shadow'])
        this.tooltip.style('font-family', this['font-family'])
        this.tooltip.style('position', 'absolute')
        this.tooltip.style('pointer-events', 'none')
        this.tooltip.style('opacity', '0')
        this.tooltip.style('text-wrap', 'nowrap')
        this.tooltip.style('z-index', 99999999) // important for leaflet-gridviz etc

        // these placeholders are needed to prevent an infinite DOM resizeObserver loop:
        this.tooltip.style('left', '0')
        this.tooltip.style('top', '0')

        // aria-labels (thanks to wahlatlas)
        this.tooltip.attr('role', 'tooltip').attr('aria-live', 'polite')
    }

    /** Show the tooltip */
    show() {
        // @ts-ignore
        this.tooltip.transition().duration(this.transitionDuration).style('opacity', 1)
    }

    /** Hide the tooltip */
    hide() {
        // @ts-ignore
        this.tooltip.transition().duration(this.transitionDuration).style('opacity', 0)
    }

    /**
     * Set the content of the tooltip.
     * @param {string} html
     */
    html(html) {
        this.tooltip.html(html)
    }

    /**
     * Set the position of the tooltip at the mouse event position.
     * @param {MouseEvent} event
     */
    setPosition(event) {
        // Get the bounding rect of the parent container (map2)
        let parentRect = this.parentElement.getBoundingClientRect()

        // Get the mouse position (relative to the parent container)
        let x = event.clientX - parentRect.left + this.xOffset // Relative to parent
        let y = event.clientY - parentRect.top - this.yOffset // Relative to parent

        // Now, apply the position to the tooltip
        this.tooltip.style('left', x + 'px').style('top', y + 'px')

        // Ensure the tooltip stays inside the parent container
        this.ensureTooltipInsideContainer(event, parentRect, this.tooltip.node())
    }
    /**
     * @function ensureTooltipInsideContainer
     * @description Prevents the tooltip from overflowing out of the App container (ensures that the tooltip is inside the gridviz container)
     * @param {MouseEvent} event
     * @param {DOMRect} parentRect
     * @param {HTMLElement} tooltipNode
     */
    ensureTooltipInsideContainer(event, parentRect, tooltipNode) {
        let node = tooltipNode
        let parentWidth = parentRect.width
        let parentHeight = parentRect.height

        // Ensure tooltip doesn't go beyond the right edge
        if (node.offsetLeft + node.clientWidth > parentWidth) {
            let left = event.clientX - node.clientWidth - this.xOffset
            node.style.left = left + 'px'
        }

        // Ensure tooltip doesn't go beyond the bottom edge
        if (node.offsetTop + node.clientHeight > parentHeight) {
            node.style.top = parentHeight - node.clientHeight + 'px'
        }

        // Ensure tooltip doesn't go above the top edge
        if (node.offsetTop < 0) {
            node.style.top = 0 + 'px'
        }

        // Ensure tooltip doesn't go beyond the left edge
        if (node.offsetLeft < 0) {
            node.style.left = 0 + 'px'
        }
    }

    /*
	my.mouseover = function (event, html) {
		if (html) my.html(html);
		my.setPosition(event);
		my.show()
		//this.ensureTooltipInsideContainer();
	};
	
	my.mousemove = function (event) {
		my.setPosition(event);
		//this.ensureTooltipInsideContainer();
	};
	
	my.mouseout = function () {
		my.hide();
	};*/

    style(k, v) {
        if (arguments.length == 1) return this.tooltip.style(k)
        this.tooltip.style(k, v)
        return this
    }

    attr(k, v) {
        if (arguments.length == 1) return this.tooltip.attr(k)
        this.tooltip.attr(k, v)
        return this
    }
}

;// ./node_modules/gridviz/src/button/Button.js


/**
 * Parent class for button elements used to interact with the gridviz viewer.
 *
 * @module button
 * @author Joseph Davies, Julien Gaffuri
 */
class Button {
    /**
     * @param {Object} opts
     * opts.parentNode
     * opts.id
     * opts.title
     * opts.class
     * opts.onClickFunction
     * opts.x
     * opts.y
     */
    constructor(opts = {}) {
        this.map = opts.map
        this.parentNode = opts.parentNode || opts.map.container

        // the div element
        if (opts.id) this.div = src_select('#' + opts.id)

        if (!this.div || this.div.empty()) {
            this.div = src_select(document.createElement('div'))
            if (opts.id) this.div.attr('id', opts.id)
        }

        if (opts.title) this.div.attr('title', opts.title)
        if (opts.class) this.div.attr('class', opts.class)

        // add events
        if (opts.onClickFunction) this.div.on('click', opts.onClickFunction)

        //set styles
        this.style(
            'box-shadow',
            '0 7px 8px rgba(0,47,103,.08), 0 0 22px rgba(0,47,103,.04), 0 12px 17px rgba(0,47,103,.04), 0 -4px 4px rgba(0,47,103,.04)'
        ) //.ecl-u-shadow-3
        this.style('background-color', '#ffffff')
        this.style('position', 'absolute')
        this.style('cursor', 'pointer')
        this.style('display', 'flex')
        this.style('justify-content', 'center')
        this.style('align-items', 'center')
        this.style('width', '35px')
        this.style('height', '30px')
        // this.style(padding , '4px'

        // append to parent
        this.parentNode.appendChild(this.div.node())
    }

    /**
     * Apply a style to the button div.
     * @param {string} k
     * @param {string} v
     * @returns {this}
     */
    style(k, v) {
        this.div.style(k, v)
        return this
    }
}

;// ./node_modules/gridviz/src/button/ZoomButtons.js


/**
 * Button for toggling fullscreen mode
 *
 * @module button
 * @author Joseph Davies, Julien Gaffuri
 */
class ZoomButtons extends Button {
    /**
     * @param {Object} opts
     */
    constructor(opts) {
        super(opts)

        this.onZoom = opts.onZoom // custom user event handler
        this.delta = opts.delta || 0.2

        // Create zoom in button
        this.zoomInBtn = document.createElement('a')
        this.zoomInBtn.id = 'zoom-in'
        this.zoomInBtn.className = 'gridviz-zoom-button'
        this.zoomInBtn.title = 'Zoom in'
        this.zoomInBtn.textContent = '+'
        this.zoomInBtn.addEventListener('click', (e) => {
            this.zoomIn(e)
        })
        this.zoomInBtn.addEventListener('mouseover', () => {
            this.zoomInBtn.style.backgroundColor = 'lightgrey'
        })
        this.zoomInBtn.addEventListener('mouseout', () => {
            this.zoomInBtn.style.backgroundColor = '#ffffff'
        })

        // Create zoom out button
        this.zoomOutBtn = document.createElement('a')
        this.zoomOutBtn.id = 'zoom-out'
        this.zoomOutBtn.className = 'gridviz-zoom-button'
        this.zoomOutBtn.title = 'Zoom out'
        this.zoomOutBtn.textContent = '-'
        this.zoomOutBtn.addEventListener('click', (e) => {
            this.zoomOut(e)
        })
        this.zoomOutBtn.addEventListener('mouseover', () => {
            this.zoomOutBtn.style.backgroundColor = 'lightgrey'
        })
        this.zoomOutBtn.addEventListener('mouseout', () => {
            this.zoomOutBtn.style.backgroundColor = '#ffffff'
        })

        // Set common styles for buttons
        const buttons = [this.zoomInBtn, this.zoomOutBtn]
        buttons.forEach((btn, index) => {
            btn.style.alignItems = 'center'
            btn.style.justifyContent = 'center'
            btn.style.display = 'flex'
            btn.style.border = 'none'
            btn.style.color = 'black'
            btn.style.textAlign = 'center'
            btn.style.textDecoration = 'none'
            btn.style.padding = '4px'
            btn.style.fontSize = '24px'
            btn.style.fontWeight = 'bold'
            btn.style.userSelect = 'none'
            btn.style.backgroundColor = '#ffffff'
            if (index === 0) btn.style.borderBottom = '1px solid grey' // Zoom in button only
        })

        // Unset parent class height and display for dual buttons
        this.style('height', 'unset')
        this.style('display', 'unset')

        // Set position
        if (opts.x) {
            this.style('left', opts.x + 'px')
        } else {
            this.style('right', '10px')
        }
        if (opts.y) {
            this.style('top', opts.y + 'px')
        } else {
            this.style('top', '10px')
        }

        // Append buttons to the container
        this.div.node().appendChild(this.zoomInBtn)
        this.div.node().appendChild(this.zoomOutBtn)
    }

    /* Zoom in */
    zoomIn(e) {
        this.map.setZoom(this.map.getZoom() * (1 - this.delta)).redraw()
        if (this.onZoom) this.onZoom(e)
    }

    /* Zoom out */
    zoomOut(e) {
        this.map.setZoom(this.map.getZoom() * (1 + this.delta)).redraw()
        if (this.onZoom) this.onZoom(e)
    }
}

;// ./node_modules/gridviz/src/button/FullscreenButton.js


/**
 * Button for toggling fullscreen mode
 *
 * @module button
 * @author Joseph Davies, Julien Gaffuri
 */
class FullscreenButton extends Button {
    /**
     * @param {Object} opts
     * opts.parentNode - the node that the button is appended to
     * opts.canvas - the gridviz canvas
     * opts.id
     * opts.title - HTML title attribute
     * opts.class - css class
     * opts.onClickFunction
     * opts.x - x position of the button
     * opts.y - y position of the button
     */

    // default state
    isFullscreen = false

    constructor(opts) {
        super(opts)

        // append fullscreen icon to button container
        this.div.node().innerHTML = `
        <svg
            style="height: 1.2rem; width: 1.2rem; fill:black; margin:0;"
            focusable="false"
            aria-hidden="true"
        >
            <svg fill="#000000" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
            <title/>
            <g>
            <path d="M30,0H6A5.9966,5.9966,0,0,0,0,6V30a6,6,0,0,0,12,0V12H30A6,6,0,0,0,30,0Z"/>
            <path d="M90,0H66a6,6,0,0,0,0,12H84V30a6,6,0,0,0,12,0V6A5.9966,5.9966,0,0,0,90,0Z"/>
            <path d="M30,84H12V66A6,6,0,0,0,0,66V90a5.9966,5.9966,0,0,0,6,6H30a6,6,0,0,0,0-12Z"/>
            <path d="M90,60a5.9966,5.9966,0,0,0-6,6V84H66a6,6,0,0,0,0,12H90a5.9966,5.9966,0,0,0,6-6V66A5.9966,5.9966,0,0,0,90,60Z"/>
            </g>
            </svg>
        </svg>
        `

        //save initial map dimensions
        this.defaultHeight = this.map.h
        this.defaultWidth = this.map.w

        // event handler
        this.div.on('click', (e) => {
            this.onClickFunction(e)
        })
        this.div.on('mouseover', (e) => {
            this.style('background-color', 'lightgrey')
        })
        this.div.on('mouseout', (e) => {
            this.style('background-color', '#ffffff')
        })

        //set position
        if (opts.x) {
            this.style('left', opts.x + 'px')
        } else {
            this.style('right', '10px')
        }
        if (opts.y) {
            this.style('top', opts.y + 'px')
        } else {
            this.style('top', '90px')
        }
    }

    onClickFunction(e) {
        if (this.isFullscreen) {
            this.closeFullscreen(this.map.container)
            //resize canvas to default
            this.map.h = this.defaultHeight
            this.map.w = this.defaultWidth
            this.map.geoCanvas.h = this.defaultHeight
            this.map.geoCanvas.w = this.defaultWidth
            this.map.geoCanvas.canvas.setAttribute('width', '' + this.defaultWidth)
            this.map.geoCanvas.canvas.setAttribute('height', '' + this.defaultHeight)
            this.map.redraw()
            this.isFullscreen = false
        } else {
            this.openFullscreen(this.map.container)
            //resize canvas to fullscreen
            this.map.h = window.screen.height
            this.map.w = window.screen.width
            this.isFullscreen = true
        }
    }

    /* Open fullscreen */
    openFullscreen(elem) {
        if (elem.requestFullscreen) {
            elem.requestFullscreen()
        } else if (elem.webkitRequestFullscreen) {
            /* Safari */
            elem.webkitRequestFullscreen()
        } else if (elem.msRequestFullscreen) {
            /* IE11 */
            elem.msRequestFullscreen()
        }
    }

    /* Close fullscreen */
    closeFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen()
        } else if (document.webkitExitFullscreen) {
            /* Safari */
            document.webkitExitFullscreen()
        } else if (document.msExitFullscreen) {
            /* IE11 */
            document.msExitFullscreen()
        }
    }
}

;// ./node_modules/gridviz/src/core/Map.js
//@ts-check


// internal imports
;




// external imports


/**
 * A gridviz application.
 *
 * @module core
 * @author Joseph Davies, Julien Gaffuri
 */
class Map_Map {
    /**
     * @param {HTMLDivElement} container
     * @param {object} opts
     */
    constructor(container, opts) {
        opts = opts || {}

        /**
         * The layers.
         * @type {Array.<import("./Layer.js").Layer>}
         * */
        this.layers = opts.layers || []

        //get container element
        this.container = container || document.getElementById('gridviz')
        if (!this.container) {
            console.error('Cannot find gridviz container element.')
            return
        }

        //https://css-tricks.com/absolute-positioning-inside-relative-positioning/
        this.container.style.position = 'relative' // container element must have relative positioning

        //set dimensions
        /** @type {number} */
        this.w = opts.w || this.container.offsetWidth
        /** @type {number} */
        this.h = opts.h || this.container.offsetHeight

        // Create the main canvas (for rendering to screen)
        /** @type {HTMLCanvasElement} */
        this._canvas = opts.canvas || this.initialiseCanvas()

        /**  Initialize GeoCanvas
         * @type {GeoCanvas}
         * @private */
        this.geoCanvas = new GeoCanvas(this._canvas, opts.x, opts.y, opts.z, opts)

        this.geoCanvas.redraw = () => {
            this.redraw()
        }
        this.geoCanvas.cancelCurrentRequests = () => {
            // when the zoom level changes, avoid drawing outdated tiles, and ensure that requests are properly aborted when necessary
            for (const layer of this.layers) {
                //multires
                if (layer.dataset?.datasets) {
                    for (const dataset of layer.dataset?.datasets) {
                        if (dataset?.cancelCurrentRequests) dataset.cancelCurrentRequests()
                    }
                }
                //single res
                if (layer.dataset?.cancelCurrentRequests) layer.dataset?.cancelCurrentRequests()
            }
        }

        // legend div
        this.legend = opts.legendContainer
            ? src_select(opts.legendContainer) // Wrap the provided HTML node in a D3 selection
            : null
        if (!this.legend) this.initialiseLegend()

        //tooltip

        // set App container as default parent element for tooltip
        if (!opts.tooltip) opts.tooltip = {}
        if (!opts.tooltip.parentElement) opts.tooltip.parentElement = this.container

        /**
         * @private
         * @type {Tooltip} */
        this.tooltip = new Tooltip(opts.tooltip)

        // add event listeners to container
        this.mouseOverHandler = (e) => this.focusCell(e)
        this.mouseMoveHandler = (e) => this.focusCell(e)
        this.mouseOutHandler = (e) => this.tooltip.hide()
        this.geoCanvas.canvas.addEventListener('mouseover', this.mouseOverHandler)
        this.geoCanvas.canvas.addEventListener('mousemove', this.mouseMoveHandler)
        this.geoCanvas.canvas.addEventListener('mouseout', this.mouseOutHandler)

        // listen for resize events on the App's container and handle them
        this.defineResizeObserver()

        // add extra logic to onZoomStartFun
        this.geoCanvas.onZoomStartFun = (e) => {
            if (opts.onZoomStartFun) opts.onZoomStartFun(e)
            this.tooltip.hide()
        }

        //for mouse over
        /**
         * @private
         * @type {HTMLCanvasElement|null} */
        this.canvasSave = null

        this.selectionRectangleColor = opts.selectionRectangleColor || '#FF6347'
        this.selectionRectangleWidthPix = opts.selectionRectangleWidthPix || (() => 4) //(r,z) => {}

        // transparent background (e.g. leaflet) 'red painting' fix
        this.transparentBackground = opts.transparentBackground

        //set default globalCompositeOperation
        this.defaultGlobalCompositeOperation =
            opts.defaultGlobalCompositeOperation || this.geoCanvas.ctx.globalCompositeOperation
    }

    /**
     * @protected
     * @returns {HTMLCanvasElement}
     */
    initialiseCanvas() {
        const canvas = document.createElement('canvas')
        canvas.setAttribute('width', '' + this.w)
        canvas.setAttribute('height', '' + this.h)
        this.container.appendChild(canvas)
        return canvas
    }

    initialiseLegend() {
        this.legend = src_select(this.container)
            .append('div') // Create a new container
            .attr('id', 'gridviz-legend')
            .style('position', 'absolute')
            .style('width', 'auto')
            .style('height', 'auto')
            .style('background', '#FFFFFF')
            //.style("padding", this.padding)
            .style('border', '0px')
            //.style('border-radius', '5px')
            .style('box-shadow', '3px 3px 3px grey, -3px -3px 3px #ddd')
            .style('font-family', 'Helvetica, Arial, sans-serif')
            .style('bottom', '15px')
            .style('right', '15px')
        //hide
        //.style("visibility", "hidden")
    }

    /**
     * Set/get layer stack.
     *
     * @param {undefined|import("./Layer.js").Layer|import("./Layer.js").Layer[]} layers
     * @returns { this | import("./Layer.js").Layer[] }
     */
    layers_(layers) {
        if (arguments.length === 0) return this.layers
        if (arguments.length === 1)
            if (Array.isArray(layers)) this.layers = layers
            else this.layers = [layers]
        else this.layers = arguments
        return this
    }

    /** @returns {this} */
    redraw() {
        //remove legend elements
        if (this.legend) this.legend.selectAll('*').remove()

        //clear
        this.geoCanvas.initCanvasTransform()
        this.geoCanvas.clear(this.geoCanvas.backgroundColor)

        const z = this.geoCanvas.view.z
        this.updateExtentGeo()

        //go through the layers
        for (const layer of this.layers) {
            //check if layer is visible
            if (layer.visible && !layer.visible(z)) continue

            //set layer alpha and blend mode
            this.geoCanvas.offscreenCtx.globalAlpha = layer.alpha ? layer.alpha(z) : 1.0
            if (layer.blendOperation) this.geoCanvas.offscreenCtx.globalCompositeOperation = layer.blendOperation(z)

            //set affin transform to draw with geographical coordinates
            this.geoCanvas.setCanvasTransform()

            //draw layer
            layer.draw(this.geoCanvas, this.legend)

            //draw layer filter
            if (layer.filterColor) layer.drawFilter(this.geoCanvas)

            //restore default alpha and blend operation
            this.geoCanvas.offscreenCtx.globalAlpha = 1.0
            this.geoCanvas.offscreenCtx.globalCompositeOperation = this.defaultGlobalCompositeOperation
        }

        // one drawImage call: draw the offscreen canvas to the main canvas
        this.geoCanvas.initCanvasTransform()
        this.geoCanvas.ctx.drawImage(this.geoCanvas.offscreenCanvas, 0, 0)

        this.canvasSave = null

        return this
    }

    /**
     * @param {number} marginPx
     * @returns {import('./GeoCanvas.js').Envelope}
     * @public
     */
    updateExtentGeo(marginPx = 20) {
        return this.geoCanvas.updateExtentGeo(marginPx)
    }

    /** @param {MouseEvent} e */
    focusCell(e) {
        //compute mouse geo position
        const mousePositionGeo = {
            x: this.geoCanvas.pixToGeoX(e.offsetX + this.tooltip.xMouseOffset),
            y: this.geoCanvas.pixToGeoY(e.offsetY + this.tooltip.yMouseOffset),
        }
        /** @type {{cell:import('./Dataset.js').Cell,html:string,resolution:number} | undefined} */
        const focus = this.getCellFocusInfo(mousePositionGeo)

        // transparent background (e.g. leaflet) 'red painting' fix
        if (this.transparentBackground) {
            if (focus) {
                this.tooltip.html(focus.html)
                this.tooltip.setPosition(e)
                this.tooltip.show()
            } else {
                this.tooltip.hide()
            }
            this.canvasSave = document.createElement('canvas')
            this.canvasSave.setAttribute('width', '' + this.w)
            this.canvasSave.setAttribute('height', '' + this.h)
            this.canvasSave.getContext('2d')?.drawImage(this.geoCanvas.canvas, 0, 0)
            this.geoCanvas.initCanvasTransform()
            return
        }

        if (focus) {
            this.tooltip.html(focus.html)
            this.tooltip.setPosition(e)
            this.tooltip.show()

            //show cell position as a rectangle
            if (!this.canvasSave) {
                this.canvasSave = document.createElement('canvas')
                this.canvasSave.setAttribute('width', '' + this.w)
                this.canvasSave.setAttribute('height', '' + this.h)
                this.canvasSave.getContext('2d')?.drawImage(this.geoCanvas.offscreenCanvas, 0, 0)
            } else {
                this.geoCanvas.offscreenCtx.drawImage(this.canvasSave, 0, 0)
            }

            //draw image saved + draw rectangle
            const rectWPix = this.selectionRectangleWidthPix
                ? this.selectionRectangleWidthPix(focus.resolution, this.geoCanvas.view.z)
                : 4
            this.geoCanvas.initCanvasTransform()
            const ctx = this.geoCanvas.offscreenCtx
            ctx.strokeStyle = this.selectionRectangleColor
            ctx.lineWidth = rectWPix
            ctx.beginPath()

            ctx.rect(
                this.geoCanvas.geoToPixX(focus.cell.x) - rectWPix / 2,
                this.geoCanvas.geoToPixY(focus.cell.y) + rectWPix / 2,
                focus.resolution / this.geoCanvas.view.z + rectWPix,
                -focus.resolution / this.geoCanvas.view.z - rectWPix
            )
            ctx.stroke()
            this.geoCanvas.ctx.drawImage(this.geoCanvas.offscreenCanvas, 0, 0)
        } else {
            this.tooltip.hide()
            if (this.canvasSave) this.geoCanvas.ctx.drawImage(this.canvasSave, 0, 0)
        }
    }

    /**
     * Return the cell HTML info at a given geo position.
     * This is usefull for user interactions, to show this info where the user clicks for example.
     *
     * @param {{x:number,y:number}} posGeo
     * @returns {{cell:import('./Dataset.js').Cell,html:string,resolution:number} | undefined}
     * @protected
     */
    getCellFocusInfo(posGeo) {
        //go through the layers, starting from top
        const z = this.geoCanvas.view.z
        for (let i = this.layers.length - 1; i >= 0; i--) {
            /** @type {import("./Layer.js").Layer} */
            const layer = this.layers[i]
            if (layer.visible && !layer.visible(z)) continue
            if (layer.cellInfoHTML === 'none') continue // this is necessary in order to not show tooltips for layers 'on top' (e.g. population circles on top of squares)
            if (!layer.cellInfoHTML) continue
            if (!layer.getDataset) continue
            const dsc = layer.getDataset(z)
            if (!dsc) continue

            //get cell at mouse position
            /** @type {import('./Dataset.js').Cell|undefined} */
            const cell = dsc.getCellFromPosition(posGeo, dsc.getViewCache())
            //console.log(cell, dsc.resolution)
            if (!cell) return undefined

            //rare case for a dataset with mixed resolutions
            if (dsc.mixedResolution) {
                const r = +dsc.mixedResolution(cell)
                const html = layer.cellInfoHTML(cell, r)
                if (!html) return undefined
                return { cell: cell, html: html, resolution: r }
            }

            const html = layer.cellInfoHTML(cell, dsc.getResolution())
            if (!html) return undefined
            return { cell: cell, html: html, resolution: dsc.getResolution() }
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {number|undefined} z
     */
    setView(x, y, z = undefined) {
        this.geoCanvas.view.x = x
        this.geoCanvas.view.y = y
        if (z != undefined) this.geoCanvas.view.z = z
        return this
    }

    /** @returns {import('./GeoCanvas.js').View} */
    getView() {
        return this.geoCanvas.view
    }

    /** @returns {number} */
    getZoom() {
        return this.geoCanvas.view.z
    }
    /** @param {number} z @returns {this} */
    setZoom(z) {
        this.geoCanvas.view.z = z
        return this
    }

    /** @returns {Array.<number|undefined>} */
    getCenterExtent() {
        return this.geoCanvas.getCenterExtent()
    }
    /** @param {Array.<number>} val @returns {this} */
    setCenterExtent(val) {
        this.geoCanvas.setCenterExtent(val)
        return this
    }

    /** @returns {Array.<number>} */
    getZoomExtent() {
        return this.geoCanvas.getZoomExtent()
    }
    /** @param {Array.<number>} val @returns {this} */
    setZoomExtent(val) {
        this.geoCanvas.setZoomExtent(val)
        return this
    }

    /** @returns {string} */
    getBackgroundColor() {
        return this.geoCanvas.backgroundColor
    }
    /** @param {string} val @returns {this} */
    setBackgroundColor(val) {
        this.geoCanvas.backgroundColor = val
        return this
    }

    /**
     * Adds a set of zoom buttons to the map
     *
     * @param {object} opts
     * @returns {this}
     */
    addZoomButtons(opts) {
        // * opts.id
        // * opts.onZoom - custom event handler function
        // * opts.x
        // * opts.y
        // * opts.delta - zoom delta applied on each click

        this.zoomButtons = new ZoomButtons({
            map: this,
            id: opts?.id || 'gridviz-zoom-buttons-' + this.container.id,
            class: opts?.class,
            x: opts?.x,
            y: opts?.y,
            onZoom: opts?.onZoom,
            delta: opts?.delta || 0.2,
        })

        return this
    }

    /**
     * Adds a fullscreen toggle button to the app
     *
     * @param {object} opts
     * @returns {this}
     */
    addFullscreenButton(opts) {
        // * opts.map - the gridviz map
        // * opts.id
        // * opts.x
        // * opts.y

        this.fullscreenButton = new FullscreenButton({
            map: this,
            id: opts?.id || 'gridviz-fullscreen-button',
            class: opts?.class,
            x: opts?.x,
            y: opts?.y,
        })

        return this
    }

    /** @returns {this} */
    setViewFromURL() {
        this.geoCanvas.setViewFromURL()
        return this
    }

    /**
     * @description Add a resize event observer to the Apps container and update the canvas accordingly
     * @memberof App
     */
    defineResizeObserver() {
        // Track whether the observer is currently processing a resize event
        let resizePending = false

        const resizeObserver = new ResizeObserver((entries) => {
            if (!Array.isArray(entries) || !entries.length) return

            let container = this.container

            // Ensure the container has valid dimensions
            if (container.clientWidth > 0 && container.clientHeight > 0) {
                if (!resizePending) {
                    resizePending = true // Prevent overlapping resize triggers

                    window.requestAnimationFrame(() => {
                        resizePending = false // Reset the flag after processing

                        // Check for size changes
                        if (this.h !== container.clientHeight || this.w !== container.clientWidth) {
                            this.h = container.clientHeight
                            this.w = container.clientWidth

                            // Update geoCanvas sizes
                            this.geoCanvas.h = this.h
                            this.geoCanvas.w = this.w
                            this.geoCanvas.canvas.setAttribute('width', String(this.w))
                            this.geoCanvas.canvas.setAttribute('height', String(this.h))
                            this.geoCanvas.offscreenCanvas.setAttribute('width', String(this.w))
                            this.geoCanvas.offscreenCanvas.setAttribute('height', String(this.h))

                            this.redraw()

                            // Optionally reposition UI elements
                            // if (this.zoomButtons) this.zoomButtons.node.style.left = this.w - 50 + 'px';
                            // if (this.fullscreenButton) this.fullscreenButton.node.style.left = this.w - 50 + 'px';
                        }
                    })
                }
            }
        })

        resizeObserver.observe(this.container)
    }

    /**
     * @description Destroy the map and it's event listeners
     * This should significantly reduce the memory used when creating and destroying gridviz map instances (for example in leaflet-gridviz)
     * @memberof App
     */
    destroy() {
        // clear layers
        this.layers = []
        this.bgLayers = []

        // remove event listeners from container
        this.container.removeEventListener('mouseover', this.mouseOverHandler)
        this.container.removeEventListener('mousemove', this.mouseMoveHandler)
        this.container.removeEventListener('mouseout', this.mouseOutHandler)

        // remove canvas
        this.geoCanvas.canvas.remove()

        // remove legend
        this.legend?.remove()

        // remove tooltip
        this.tooltip.tooltip?.remove()
    }
}

;// ./node_modules/gridviz/src/core/Drawable.js
//@ts-check


/**
 * This is an abstract class used to group elements shared between Layer and Style classes.
 *
 * @abstract
 * @module core
 * @author Joseph Davies, Julien Gaffuri
 */
class Drawable {
    /**
     * @param {object} opts
     */
    constructor(opts) {
        opts = opts || {}

        /** A function specifying if the element should be visible or not.
         * The function parameter is the zoom level.
         * @type {function(number):boolean} */
        this.visible = opts.visible

        /** A function returning the alpha (transparency/opacity), between 0.0 (fully transparent) and 1.0 (fully opaque).
         *  The function parameter is the zoom level.
         * (see CanvasRenderingContext2D: globalAlpha property)
         * @type {(function(number):number)|undefined} */
        this.alpha = opts.alpha

        /** A function returning the blend operation.
         * The function parameter is the zoom level.
         * (see CanvasRenderingContext2D: globalCompositeOperation property)
         * @type {function(number):GlobalCompositeOperation} */
        this.blendOperation = opts.blendOperation || ((z) => 'source-over')

        /** @type {(function(number):string)|undefined} */
        this.filterColor = opts.filterColor // (z) => "#eee7"
        /** @type {(function(number):GlobalCompositeOperation|"none")|undefined} */
        this.filterBlendOperation = opts.filterBlendOperation // (z) => "multiply"
    }

    /**
     * Draw layer filter.
     *
     * @param {import("./GeoCanvas.js").GeoCanvas} geoCanvas The canvas where to draw the layer.
     * @returns {void}
     * @abstract
     */
    drawFilter(geoCanvas) {
        //no filter: return
        if (!this.filterColor) return

        //get filter
        const fc = this.filterColor(geoCanvas.view.z)

        //no filter: return
        if (!fc || fc == 'none') return

        //draw filter

        //set color
        geoCanvas.offscreenCtx.fillStyle = fc

        //save blend mode and set new, if any
        let bo = undefined, bo2 = undefined
        if (this.filterBlendOperation) {
            bo = geoCanvas.offscreenCtx.globalCompositeOperation
            bo2 = this.filterBlendOperation(geoCanvas.view.z)
        }
        if (bo2 && bo2 != "none") geoCanvas.offscreenCtx.globalCompositeOperation = bo2;

        //draw
        geoCanvas.offscreenCtx.fillRect(0, 0, geoCanvas.w, geoCanvas.h)

        //restore blend mode
        if (bo) geoCanvas.offscreenCtx.globalCompositeOperation = bo;

    }
}

;// ./node_modules/gridviz/src/core/Style.js
//@ts-check


;

/** @typedef {"square"|"circle"|"diamond"|"donut"|"triangle_up"|"triangle_down"|"triangle_left"|"triangle_right"|"none"} Shape */

/**
 * viewScale type
 * Returns an object from a list of cells,
 * @typedef {function(Array.<import('./Dataset.js').Cell>,number, number):*} ViewScale */

/**
 * A style, to show a grid dataset.
 *
 * @module core
 * @author Joseph Davies, Julien Gaffuri
 */
class Style extends Drawable {
    /**
     * @abstract
     * @param {{filter?:function(import('./Dataset').Cell):boolean, offset?:function(import('./Dataset').Cell, number, number):{dx:number,dy:number}, visible?:function(number):boolean,alpha?:function(number):number,blendOperation?:function(number):GlobalCompositeOperation,drawFun?:function,viewScale?:ViewScale}} opts
     */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /**
         * @type {ViewScale|undefined} */
        this.viewScale = opts.viewScale

        /** A filter function to apply to the cell list, to filter out some cells not to be drawn (such as for example the cells with value=0).
         * @protected
         * @type {(function(import('./Dataset').Cell):boolean) | undefined} */
        this.filter = opts.filter || undefined

        /** An offset. This is to alter the position of all symbols in a given direction. In geographical unit.
         * @protected
         * @type {function(import('./Dataset').Cell,number,number):{dx:number,dy:number}} */
        this.offset = opts.offset || ((c, r, z) => ({ dx: 0, dy: 0 }))

        /** A draw function for the style.
         * @type {function|undefined} */
        this.drawFun = opts.drawFun

        /**
         * @public
         * @type {Array.<import("./Legend").Legend>} */
        this.legends = []
    }

    /**
     * Draw cells.
     *
     * @param {Array.<import('./Dataset').Cell>} cells The cells to draw.
     * @param {import("./GeoCanvas").GeoCanvas} geoCanvas The canvas where to draw them.
     * @param {number} resolution Their resolution (in geographic unit)
     * @abstract
     */
    draw(cells, geoCanvas, resolution) {
        if (this.drawFun) this.drawFun(cells, geoCanvas, resolution)
        else throw new Error('Method draw not implemented.')
    }

    //getters and setters

    /** @returns {function(import('./Dataset').Cell,number,number):{dx:number,dy:number}} */
    getOffset() {
        return this.offset
    }
    /** @param {function(import('./Dataset').Cell,number,number):{dx:number,dy:number}} val @returns {this} */
    setOffset(val) {
        this.offset = val
        return this
    }

    /** Update legends of the style, if any
     * @param {object} opts
     * @returns {this} */
    updateLegends(opts) {
        Style.updateLegendsRecursive(this.legends, opts)
        return this
    }

    /** @private */
    static updateLegendsRecursive(lg, opts) {
        if (Array.isArray(lg)) for (const lg_ of lg) this.updateLegendsRecursive(lg_, opts)
        else lg.update(opts)
    }

    /**
     * @param {Array.<import("./Legend").Legend>} legends
     * @returns {this} */
    addLegends(legends) {
        for (let legend of legends) this.legends.push(legend)
        return this
    }
}

;// ./node_modules/gridviz/src/core/Dataset.js
//@ts-check


/**
 * A grid cell.
 * @typedef {{x: number, y: number}} Cell */

/**
 * A dataset component, of grid cells.
 * @abstract
 *
 * @module core
 * @author Joseph Davies, Julien Gaffuri
 */
class Dataset {
    /**
     * @param {import("./Map.js").Map} map The map.
     * @param {string} url The URL of the dataset.
     * @param {number} resolution The dataset resolution, in the CRS geographical unit.
     * @param {{preprocess?:function(Cell):boolean, mixedResolution?:function(Cell):number}} opts
     * @abstract
     */
    constructor(map, url, resolution, opts = {}) {
        /**
         * The map.
         * @protected
         * @type {import("./Map.js").Map} */
        this.map = map

        /**
         * The url of the dataset.
         * @protected
         * @type {string} */
        this.url = url

        /**
         * The dataset resolution in geographical unit.
         * @protected
         * @type {number} */
        this.resolution = resolution

        /**
         * In case the dataset is a dataset with cells having different resolution,
         * this is the function returning the resolution of each cell.
         * @protected
         * @type {(function(Cell):number )| undefined } */
        this.mixedResolution = opts.mixedResolution

        /**
         * A preprocess to run on each cell after loading. It can be used to apply some specific treatment before or compute a new column. And also to determine which cells to keep after loading.
         * @type {(function(Cell):boolean )| undefined } */
        this.preprocess = opts.preprocess || undefined

        /** The cells within the view
         * @protected
         * @type {Array.<Cell>} */
        this.cellsViewCache = []
    }

    /**
     * Request data within a geographic envelope.
     *
     * @abstract
     * @param {import("./GeoCanvas").Envelope|undefined} extGeo
     * @returns {this}
     */
    getData(extGeo = undefined) {
        throw new Error('Method getData not implemented.')
    }

    /**
     * Fill the view cache with all cells which are within a geographical envelope.
     * @abstract
     * @param {import("./GeoCanvas").Envelope} extGeo The view geographical envelope.
     * @returns {void}
     */
    updateViewCache(extGeo) {
        throw new Error('Method updateViewCache not implemented.')
    }

    /**
     * Get a cell under a given position, if any.
     *
     * @param {{x:number,y:number}} posGeo
     * @param {Array.<Cell>} cells Some cells from the dataset (a subset if necessary, usually the view cache).
     * @returns {Cell|undefined}
     */
    getCellFromPosition(posGeo, cells) {
        //compute candidate cell position
        /** @type {number} */
        //const r = this.getResolution()
        /** @type {number} */
        //const cellX = r * Math.floor(posGeo.x / r)
        /** @type {number} */
        //const cellY = r * Math.floor(posGeo.y / r)

        /*/get cell
        for (const cell of cells) {
            if (cell.x != cellX) continue
            if (cell.y != cellY) continue
            return cell
        }
        return undefined*/

        //rare case of mixed resolution dataset
        if (this.mixedResolution) {
            for (const c of cells) {
                /** @type {number} */
                const r = +this.mixedResolution(c)
                if (posGeo.x < c.x) continue
                else if (c.x + r < posGeo.x) continue
                else if (posGeo.y < c.y) continue
                else if (c.y + r < posGeo.y) continue
                else return c
            }
            return undefined
        }

        //common case

        /** @type {number} */
        const r = this.getResolution()
        for (const cell of cells) {
            if (posGeo.x < cell.x) continue
            else if (cell.x + r < posGeo.x) continue
            else if (posGeo.y < cell.y) continue
            else if (cell.y + r < posGeo.y) continue
            else return cell
        }
        return undefined
    }

    //getters and setters

    /** @returns {number} */
    getResolution() {
        return this.resolution
    }

    /** @returns {Array.<Cell>} */
    getViewCache() {
        return this.cellsViewCache
    }

    /**
     * Return the relevant dataset for a specified zoom.
     * @param {number} z
     * @param {number} minPixelsPerCell
     * @returns {Dataset|undefined}
     * */
    getDataset(z, minPixelsPerCell) {
        return this
    }
}

;// ./node_modules/d3-fetch/src/json.js
function responseJson(response) {
  if (!response.ok) throw new Error(response.status + " " + response.statusText);
  if (response.status === 204 || response.status === 205) return;
  return response.json();
}

/* harmony default export */ function json(input, init) {
  return fetch(input, init).then(responseJson);
}

;// ./node_modules/d3-dsv/src/dsv.js
var EOL = {},
    EOF = {},
    QUOTE = 34,
    NEWLINE = 10,
    RETURN = 13;

function objectConverter(columns) {
  return new Function("d", "return {" + columns.map(function(name, i) {
    return JSON.stringify(name) + ": d[" + i + "] || \"\"";
  }).join(",") + "}");
}

function customConverter(columns, f) {
  var object = objectConverter(columns);
  return function(row, i) {
    return f(object(row), i, columns);
  };
}

// Compute unique columns in order of discovery.
function inferColumns(rows) {
  var columnSet = Object.create(null),
      columns = [];

  rows.forEach(function(row) {
    for (var column in row) {
      if (!(column in columnSet)) {
        columns.push(columnSet[column] = column);
      }
    }
  });

  return columns;
}

function pad(value, width) {
  var s = value + "", length = s.length;
  return length < width ? new Array(width - length + 1).join(0) + s : s;
}

function formatYear(year) {
  return year < 0 ? "-" + pad(-year, 6)
    : year > 9999 ? "+" + pad(year, 6)
    : pad(year, 4);
}

function formatDate(date) {
  var hours = date.getUTCHours(),
      minutes = date.getUTCMinutes(),
      seconds = date.getUTCSeconds(),
      milliseconds = date.getUTCMilliseconds();
  return isNaN(date) ? "Invalid Date"
      : formatYear(date.getUTCFullYear(), 4) + "-" + pad(date.getUTCMonth() + 1, 2) + "-" + pad(date.getUTCDate(), 2)
      + (milliseconds ? "T" + pad(hours, 2) + ":" + pad(minutes, 2) + ":" + pad(seconds, 2) + "." + pad(milliseconds, 3) + "Z"
      : seconds ? "T" + pad(hours, 2) + ":" + pad(minutes, 2) + ":" + pad(seconds, 2) + "Z"
      : minutes || hours ? "T" + pad(hours, 2) + ":" + pad(minutes, 2) + "Z"
      : "");
}

/* harmony default export */ function dsv(delimiter) {
  var reFormat = new RegExp("[\"" + delimiter + "\n\r]"),
      DELIMITER = delimiter.charCodeAt(0);

  function parse(text, f) {
    var convert, columns, rows = parseRows(text, function(row, i) {
      if (convert) return convert(row, i - 1);
      columns = row, convert = f ? customConverter(row, f) : objectConverter(row);
    });
    rows.columns = columns || [];
    return rows;
  }

  function parseRows(text, f) {
    var rows = [], // output rows
        N = text.length,
        I = 0, // current character index
        n = 0, // current line number
        t, // current token
        eof = N <= 0, // current token followed by EOF?
        eol = false; // current token followed by EOL?

    // Strip the trailing newline.
    if (text.charCodeAt(N - 1) === NEWLINE) --N;
    if (text.charCodeAt(N - 1) === RETURN) --N;

    function token() {
      if (eof) return EOF;
      if (eol) return eol = false, EOL;

      // Unescape quotes.
      var i, j = I, c;
      if (text.charCodeAt(j) === QUOTE) {
        while (I++ < N && text.charCodeAt(I) !== QUOTE || text.charCodeAt(++I) === QUOTE);
        if ((i = I) >= N) eof = true;
        else if ((c = text.charCodeAt(I++)) === NEWLINE) eol = true;
        else if (c === RETURN) { eol = true; if (text.charCodeAt(I) === NEWLINE) ++I; }
        return text.slice(j + 1, i - 1).replace(/""/g, "\"");
      }

      // Find next delimiter or newline.
      while (I < N) {
        if ((c = text.charCodeAt(i = I++)) === NEWLINE) eol = true;
        else if (c === RETURN) { eol = true; if (text.charCodeAt(I) === NEWLINE) ++I; }
        else if (c !== DELIMITER) continue;
        return text.slice(j, i);
      }

      // Return last token before EOF.
      return eof = true, text.slice(j, N);
    }

    while ((t = token()) !== EOF) {
      var row = [];
      while (t !== EOL && t !== EOF) row.push(t), t = token();
      if (f && (row = f(row, n++)) == null) continue;
      rows.push(row);
    }

    return rows;
  }

  function preformatBody(rows, columns) {
    return rows.map(function(row) {
      return columns.map(function(column) {
        return formatValue(row[column]);
      }).join(delimiter);
    });
  }

  function format(rows, columns) {
    if (columns == null) columns = inferColumns(rows);
    return [columns.map(formatValue).join(delimiter)].concat(preformatBody(rows, columns)).join("\n");
  }

  function formatBody(rows, columns) {
    if (columns == null) columns = inferColumns(rows);
    return preformatBody(rows, columns).join("\n");
  }

  function formatRows(rows) {
    return rows.map(formatRow).join("\n");
  }

  function formatRow(row) {
    return row.map(formatValue).join(delimiter);
  }

  function formatValue(value) {
    return value == null ? ""
        : value instanceof Date ? formatDate(value)
        : reFormat.test(value += "") ? "\"" + value.replace(/"/g, "\"\"") + "\""
        : value;
  }

  return {
    parse: parse,
    parseRows: parseRows,
    format: format,
    formatBody: formatBody,
    formatRows: formatRows,
    formatRow: formatRow,
    formatValue: formatValue
  };
}

;// ./node_modules/d3-dsv/src/csv.js


var csv = dsv(",");

var csvParse = csv.parse;
var csvParseRows = csv.parseRows;
var csvFormat = csv.format;
var csvFormatBody = csv.formatBody;
var csvFormatRows = csv.formatRows;
var csvFormatRow = csv.formatRow;
var csvFormatValue = csv.formatValue;

;// ./node_modules/d3-dsv/src/tsv.js


var tsv = dsv("\t");

var tsvParse = tsv.parse;
var tsvParseRows = tsv.parseRows;
var tsvFormat = tsv.format;
var tsvFormatBody = tsv.formatBody;
var tsvFormatRows = tsv.formatRows;
var tsvFormatRow = tsv.formatRow;
var tsvFormatValue = tsv.formatValue;

;// ./node_modules/d3-fetch/src/text.js
function responseText(response) {
  if (!response.ok) throw new Error(response.status + " " + response.statusText);
  return response.text();
}

/* harmony default export */ function src_text(input, init) {
  return fetch(input, init).then(responseText);
}

;// ./node_modules/d3-fetch/src/dsv.js



function dsvParse(parse) {
  return function(input, init, row) {
    if (arguments.length === 2 && typeof init === "function") row = init, init = undefined;
    return src_text(input, init).then(function(response) {
      return parse(response, row);
    });
  };
}

function dsv_dsv(delimiter, input, init, row) {
  if (arguments.length === 3 && typeof init === "function") row = init, init = undefined;
  var format = dsv(delimiter);
  return src_text(input, init).then(function(response) {
    return format.parse(response, row);
  });
}

var dsv_csv = dsvParse(csvParse);
var dsv_tsv = dsvParse(tsvParse);

;// ./node_modules/gridviz/src/dataset/TiledGrid.js
//@ts-check


/** @typedef {{ dims: object, crs: string, tileSizeCell: number, originPoint: {x:number,y:number}, resolutionGeo: number, tilingBounds:import("../core/GeoCanvas.js").Envelope }} GridInfo */

// internal
;
//import { monitor, monitorDuration } from '../utils/Utils.js'

// external


/**
 * A tiled dataset, composed of CSV tiles.
 *
 * @module dataset
 * @author Joseph Davies, Julien Gaffuri
 */
class TiledGrid extends Dataset {
    /**
     * @param {import("../core/Map.js").Map} map The map.
     * @param {string} url The URL of the dataset.
     * @param {{preprocess?:(function(import("../core/Dataset.js").Cell):boolean), onlyDrawWhenAllTilesReady:boolean}} opts
     */
    constructor(map, url, opts = {}) {
        super(map, url, 0, opts)
        this.onlyDrawWhenAllTilesReady = opts.onlyDrawWhenAllTilesReady || false
        /**
         * The grid info object, from the info.json file.
         *  @type {GridInfo | undefined}
         * @private
         *  */
        this.info = undefined

        /**
         * @type {string}
         * @private  */
        this.infoLoadingStatus = 'notLoaded'

        /**
         * The cache of the loaded tiles. It is double indexed: by xT and then yT.
         * Example: this.cache[xT][yT] returns the tile at [xT][yT] location.
         *
         * @type {object}
         * */
        this.cache = {}

        //launch loading
        this.loadInfo()
    }

    /**
     * Load the info.json from the url.
     * @returns this
     */
    loadInfo() {
        if (!this.info && this.infoLoadingStatus === 'notLoaded') {
            ;(async () => {
                try {
                    const data = await json(this.url + 'info.json')
                    this.info = data
                    this.resolution = data.resolutionGeo
                    this.infoLoadingStatus = 'loaded'
                    this.map.redraw()
                } catch (error) {
                    //mark as failed
                    this.infoLoadingStatus = 'failed'
                }
            })()
        } else if (this.infoLoadingStatus === 'loaded' || this.infoLoadingStatus === 'failed') this.map.redraw()
        return this
    }

    /**
     * Compute a tiling envelope from a geographical envelope.
     * This is the function to use to know which tiles to download for a geographical view.
     *
     * @param {import("../core/GeoCanvas.js").Envelope} e
     * @returns {import("../core/GeoCanvas.js").Envelope|undefined}
     */
    getTilingEnvelope(e) {
        if (!this.info) {
            this.loadInfo()
            return
        }

        const po = this.info.originPoint,
            r = this.info.resolutionGeo,
            s = this.info.tileSizeCell

        return {
            xMin: Math.floor((e.xMin - po.x) / (r * s)),
            xMax: Math.floor((e.xMax - po.x) / (r * s)),
            yMin: Math.floor((e.yMin - po.y) / (r * s)),
            yMax: Math.floor((e.yMax - po.y) / (r * s)),
        }
    }

    /**
     * Request data within a geographic envelope.
     *
     * @param {import('../core/GeoCanvas.js').Envelope} extGeo
     * @returns {this}
     */
    async getData(extGeo) {
        if (!this.info) return this

        // Create an AbortController for the current data request
        this.abortController = new AbortController()
        const signal = this.abortController.signal

        // Get the tiling envelope and check bounds
        const tb = this.getTilingEnvelope(extGeo)
        if (!tb) return this

        const { xMin: gbXMin, xMax: gbXMax, yMin: gbYMin, yMax: gbYMax } = this.info.tilingBounds

        const xMin = Math.max(tb.xMin, gbXMin)
        const xMax = Math.min(tb.xMax, gbXMax)
        const yMin = Math.max(tb.yMin, gbYMin)
        const yMax = Math.min(tb.yMax, gbYMax)

        const totalTiles = (xMax - xMin + 1) * (yMax - yMin + 1)
        let processedTiles = 0
        const tilePromises = []

        // Iterate over tiles within bounds
        for (let xT = xMin; xT <= xMax; xT++) {
            for (let yT = yMin; yT <= yMax; yT++) {
                if (!this.cache[xT]) this.cache[xT] = {}

                // Skip already loaded tiles or retry failed ones
                if (this.cache[xT][yT] && this.cache[xT][yT] !== 'failed') {
                    ++processedTiles
                    continue
                }

                // Mark tile as loading
                this.cache[xT][yT] = 'loading'

                tilePromises.push(
                    this.loadTile(xT, yT, signal)
                        .then((tile) => {
                            this.cache[xT][yT] = tile

                            // Check if this is the last tile
                            const isLastTile = ++processedTiles === totalTiles
                            this.checkAndRedraw(tile, isLastTile)
                        })
                        .catch(() => {
                            this.cache[xT][yT] = 'failed'
                            ++processedTiles
                        })
                )
            }
        }

        await Promise.allSettled(tilePromises)
        return this
    }

    /**
     * Load a tile.
     *
     * @param {number} xT
     * @param {number} yT
     * @param {AbortSignal} signal
     * @returns {Promise<any>}
     */
    async loadTile(xT, yT, signal) {
        try {
            const data = await dsv_csv(`${this.url}${xT}/${yT}.csv`, { signal })

            const cells = this.preprocess ? data.filter((cell) => this.preprocess(cell) !== false) : data

            if (!this.info) throw new Error('Tile info unknown')

            return getGridTile(cells, xT, yT, this.info)
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`Tile request for ${xT}, ${yT} was aborted.`)
            }
            throw error
        }
    }

    /**
     * Cancel ongoing data requests when zoom level changes.
     */
    cancelCurrentRequests() {
        if (this.abortController) {
            this.abortController.abort()
        }
    }

    checkAndRedraw(tile, isLastTile) {
        // Check if any visible layer depends on this dataset
        // check if redraw is really needed, that is if:
        // 1. the dataset belongs to a layer which is visible at the current zoom level
        let needsRedraw = false
        //go through the layers
        const z = this.map.getZoom()
        for (const lay of this.map.layers) {
            if (lay.visible && !lay.visible(z)) continue
            if (!lay.getDataset) continue
            if (lay.getDataset(z) != this) continue
            //found one layer. No need to seek more.
            needsRedraw = true
            break
        }

        if (!needsRedraw) return

        // Check if tile intersects the current view
        const env = this.map.updateExtentGeo()
        const { xMin, xMax, yMin, yMax } = tile.extGeo
        if (env.xMax <= xMin || env.xMin >= xMax || env.yMax <= yMin || env.yMin >= yMax) return

        // Trigger redraw
        if (this.onlyDrawWhenAllTilesReady) {
            if (isLastTile) {
                this.map.redraw()
            }
        } else {
            this.map.redraw()
        }
    }

    /**
     * Fill the view cache with all cells which are within a geographical envelope.
     * @abstract
     * @param {import("../core/GeoCanvas.js").Envelope} extGeo
     * @returns {void}
     */
    updateViewCache(extGeo) {
        //
        this.cellsViewCache = []

        //check if info has been loaded
        if (!this.info) return

        //tiles within the scope
        /** @type {import("../core/GeoCanvas.js").Envelope|undefined} */
        const tb = this.getTilingEnvelope(extGeo)
        if (!tb) return

        //grid bounds
        /** @type {import("../core/GeoCanvas.js").Envelope} */
        const gb = this.info.tilingBounds

        for (let xT = Math.max(tb.xMin, gb.xMin); xT <= Math.min(tb.xMax, gb.xMax); xT++) {
            if (!this.cache[xT]) continue
            for (let yT = Math.max(tb.yMin, gb.yMin); yT <= Math.min(tb.yMax, gb.yMax); yT++) {
                //get tile
                /** @type {object} */
                const tile = this.cache[xT][yT]
                if (!tile || typeof tile === 'string') continue

                //get cells
                //this.cellsViewCache = this.cellsViewCache.concat(tile.cells)

                for (const cell of tile.cells) {
                    if (+cell.x + this.resolution < extGeo.xMin) continue
                    if (+cell.x - this.resolution > extGeo.xMax) continue
                    if (+cell.y + this.resolution < extGeo.yMin) continue
                    if (+cell.y - this.resolution > extGeo.yMax) continue
                    this.cellsViewCache.push(cell)
                }
            }
        }
    }
}

function getGridTile(cells, xT, yT, gridInfo) {
    const tile = {}

    /** @type {Array.<import("../core/Dataset").Cell>} */
    tile.cells = cells
    /** @type {number} */
    tile.x = xT
    /** @type {number} */
    tile.y = yT

    const r = gridInfo.resolutionGeo
    const s = gridInfo.tileSizeCell

    /** @type {import("../core/GeoCanvas").Envelope} */
    tile.extGeo = {
        xMin: gridInfo.originPoint.x + r * s * tile.x,
        xMax: gridInfo.originPoint.x + r * s * (tile.x + 1),
        yMin: gridInfo.originPoint.y + r * s * tile.y,
        yMax: gridInfo.originPoint.y + r * s * (tile.y + 1),
    }

    //convert cell coordinates into geographical coordinates
    for (let cell of tile.cells) {
        cell.x = tile.extGeo.xMin + cell.x * r
        cell.y = tile.extGeo.yMin + cell.y * r
    }

    return tile
}

;// ./node_modules/gridviz/src/dataset/CSVGrid.js
//@ts-check


/** @typedef {{ dims: object, crs: string, tileSizeCell: number, originPoint: {x:number,y:number}, resolutionGeo: number, tilingBounds:import("../core/GeoCanvas.js").Envelope }} GridInfo */

;


/**
 * A dataset composed of a single CSV file (not tiled).
 *
 * @module dataset
 * @author Joseph Davies, Julien Gaffuri
 */
class CSVGrid extends Dataset {
    /**
     * @param {import("../core/Map.js").Map} map The map.
     * @param {string} url The URL of the dataset.
     * @param {number} resolution The dataset resolution in geographical unit.
     * @param {{preprocess?:(function(import("../core/Dataset.js").Cell):boolean),delimiter?:string}} opts
     */
    constructor(map, url, resolution, opts = {}) {
        super(map, url, resolution, opts)

        /**
         * @private
         * @type {Array.<import("../core/Dataset.js").Cell>} */
        this.cells = []

        /**
         * @private
         * @type {string} */
        this.delimiter = opts.delimiter || ','

        /**
         * @type {string}
         * @private  */
        this.infoLoadingStatus = 'notLoaded'

        //get data
        this.getData(undefined)
    }

    /**
     * Request data within a geographic envelope.
     * @param {import("../core/GeoCanvas.js").Envelope|undefined} e
     */
    getData(e) {
        //check if data already loaded
        if (this.infoLoadingStatus != 'notLoaded') return this

        //load data
        this.infoLoadingStatus = 'loading'
        ;(async () => {
            try {
                const data = await dsv_dsv(this.delimiter, this.url)

                //convert coordinates in numbers
                for (const c of data) {
                    c.x = +c.x
                    c.y = +c.y
                }

                //preprocess/filter
                if (this.preprocess) {
                    this.cells = []
                    for (const c of data) {
                        const b = this.preprocess(c)
                        if (b == false) continue
                        this.cells.push(c)
                    }
                } else {
                    this.cells = data
                }

                //TODO check if redraw is necessary
                //that is if the dataset belongs to a layer which is visible at the current zoom level

                //redraw map
                if (this.map) this.map.redraw()

                this.infoLoadingStatus = 'loaded'
            } catch (error) {
                //mark as failed
                this.infoLoadingStatus = 'failed'
                this.cells = []
            }
        })()

        return this
    }

    /**
     * Fill the view cache with all cells which are within a geographical envelope.
     *
     * @param {import("../core/GeoCanvas.js").Envelope} extGeo
     * @returns {void}
     */
    updateViewCache(extGeo) {
        //data not loaded yet
        if (!this.cells) return

        this.cellsViewCache = []
        for (const cell of this.cells) {
            if (+cell.x + this.resolution < extGeo.xMin) continue
            if (+cell.x - this.resolution > extGeo.xMax) continue
            if (+cell.y + this.resolution < extGeo.yMin) continue
            if (+cell.y - this.resolution > extGeo.yMax) continue
            this.cellsViewCache.push(cell)
        }
    }
}

;// ./node_modules/gridviz/src/dataset/JSGrid.js
//@ts-check


;

/**
 * A dataset composed of cells defined in javascript, or loaded outside of gridviz map.
 *
 * @module dataset
 * @author Joseph Davies, Julien Gaffuri
 */
class JSGrid extends Dataset {
    /**
     * @param {number} resolution The dataset resolution in geographical unit.
     * @param {Array.<Object>} cells The cells.
     * @param {} opts
     */
    constructor(resolution, cells, opts = {}) {
        super(undefined, '', resolution, opts)

        /**
         * @private
         * @type {Array.<import('../core/Dataset.js').Cell>} */
        this.cells = cells || []
    }

    /**
     * Request data within a geographic envelope.
     *
     * @param {import("../core/GeoCanvas.js").Envelope|undefined} e
     */
    getData(e) {
        return this
    }

    /**
     * Fill the view cache with all cells which are within a geographical envelope.
     *
     * @param {import("../core/GeoCanvas.js").Envelope} extGeo
     * @returns {void}
     */
    updateViewCache(extGeo) {
        //data not loaded yet
        if (!this.cells) return

        this.cellsViewCache = []
        for (const cell of this.cells) {
            if (+cell.x + this.resolution < extGeo.xMin) continue
            if (+cell.x - this.resolution > extGeo.xMax) continue
            if (+cell.y + this.resolution < extGeo.yMin) continue
            if (+cell.y - this.resolution > extGeo.yMax) continue
            this.cellsViewCache.push(cell)
        }
    }
}

;// ./node_modules/gridviz/src/style/ShapeColorSizeStyle.js
//@ts-check


;

/**
 * A very generic style that shows grid cells with specific color, size and shape.
 * It can be used to show variables as cell colors, cell size, cell shape, or any combination of the three visual variables.
 *
 * @module style
 * @author Joseph Davies, Julien Gaffuri
 */
class ShapeColorSizeStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}
        /** @type {(function(import('../core/Dataset.js').Cell, number, number, object):string) | string} */
        this.color = opts.color || '#EA6BAC'

        /** @type {(function(import('../core/Dataset.js').Cell, number, number, object):number) | number} */
        this.size = opts.size || ((cell, resolution) => resolution)

        /** @type {(function(import("../core/Dataset.js").Cell,number, number,object):import("../core/Style.js").Shape) | string} */
        this.shape = opts.shape || 'square'
    }

    /**
     * Draw cells as squares, with various colors and sizes.
     *
     * @param {Array.<import("../core/Dataset.js").Cell>} cells - The grid cells to draw.
     * @param {import("../core/GeoCanvas.js").GeoCanvas} geoCanvas - The canvas to draw on.
     * @param {number} resolution - Resolution of the grid.
     * @override
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //zoom
        const z = geoCanvas.view.z

        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        const r2 = resolution * 0.5

        // Precompute if color, size, and shape are functions, for efficiency
        const isColorFunction = typeof this.color === 'function'
        const isSizeFunction = typeof this.size === 'function'
        const isShapeFunction = typeof this.shape === 'function'

        const defaultColor = this.color || 'black'
        const defaultSize = this.size || resolution
        const defaultShape = this.shape || 'square'

        // Optimized
        const colorFunction = isColorFunction ? this.color : null
        const sizeFunction = isSizeFunction ? this.size : null
        const shapeFunction = isShapeFunction ? this.shape : null

        for (let c of cells) {
            // Determine color
            //@ts-ignore
            const col = colorFunction ? colorFunction(c, resolution, z, viewScale) : defaultColor
            if (!col || col === 'none') continue

            // Determine size
            //@ts-ignore
            const size = sizeFunction ? sizeFunction(c, resolution, z, viewScale) : defaultSize
            if (!size) continue

            // Determine shape
            //@ts-ignore
            const shape = shapeFunction ? shapeFunction(c, resolution, z, viewScale) : defaultShape
            if (shape === 'none') continue

            //get offset
            const offset = this.offset(c, resolution, z)

            //get context
            const ctx = geoCanvas.offscreenCtx
            ctx.fillStyle = col
            if (shape === 'square') {
                //draw square
                const d = resolution * (1 - size / resolution) * 0.5
                ctx.fillRect(c.x + d + offset.dx, c.y + d + offset.dy, size, size)
            } else if (shape === 'circle') {
                //draw circle
                ctx.beginPath()
                ctx.arc(c.x + r2 + offset.dx, c.y + r2 + offset.dy, size * 0.5, 0, 2 * Math.PI, false)
                ctx.fill()
            } else if (shape === 'donut') {
                //draw donut
                const xc = c.x + r2 + offset.dx,
                    yc = c.y + r2 + offset.dy
                ctx.beginPath()
                ctx.moveTo(xc, yc)
                ctx.arc(xc, yc, r2, 0, 2 * Math.PI)
                ctx.arc(xc, yc, (1 - size / resolution) * r2, 0, 2 * Math.PI, true)
                ctx.closePath()
                ctx.fill()
            } else if (shape === 'diamond') {
                const s2 = size * 0.5
                ctx.beginPath()
                ctx.moveTo(c.x + r2 - s2, c.y + r2)
                ctx.lineTo(c.x + r2, c.y + r2 + s2)
                ctx.lineTo(c.x + r2 + s2, c.y + r2)
                ctx.lineTo(c.x + r2, c.y + r2 - s2)
                ctx.fill()
            } else if (shape === 'triangle_up') {
                const dr2 = (size - resolution) / 2
                ctx.beginPath()
                ctx.moveTo(c.x - dr2, c.y - dr2)
                ctx.lineTo(c.x + r2, c.y + resolution + dr2)
                ctx.lineTo(c.x + resolution + dr2, c.y - dr2)
                ctx.fill()
            } else if (shape === 'triangle_down') {
                const dr2 = (size - resolution) / 2
                ctx.beginPath()
                ctx.moveTo(c.x - dr2, c.y + resolution + dr2)
                ctx.lineTo(c.x + r2, c.y - dr2)
                ctx.lineTo(c.x + resolution + dr2, c.y + resolution + dr2)
                ctx.fill()
            } else if (shape === 'triangle_left') {
                const dr2 = (size - resolution) / 2
                ctx.beginPath()
                ctx.moveTo(c.x + resolution + dr2, c.y + resolution + dr2)
                ctx.lineTo(c.x - dr2, c.y + r2)
                ctx.lineTo(c.x + resolution + dr2, c.y - dr2)
                ctx.fill()
            } else if (shape === 'triangle_right') {
                const dr2 = (size - resolution) / 2
                ctx.beginPath()
                ctx.moveTo(c.x - dr2, c.y - dr2)
                ctx.lineTo(c.x + resolution + dr2, c.y + r2)
                ctx.lineTo(c.x - dr2, c.y + resolution + dr2)
                ctx.fill()
            } else {
                throw new Error('Unexpected shape:' + shape)
            }
        }

        //update legends
        this.updateLegends({ viewScale: viewScale, resolution: resolution, z: z, cells: cells })
    }
}

;// ./node_modules/gridviz/src/style/StrokeStyle.js
//@ts-check


;

/**
 * @module style
 * @author Julien Gaffuri
 */
class StrokeStyle_StrokeStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** A function returning the color of the cell.
         * @type {function(import('../core/Dataset.js').Cell,number,number,object):string} */
        this.strokeColor = opts.strokeColor || (() => '#666') //(c,r,z,vs) => {}

        /** A function returning the size of a cell in geographical unit.
         * @type {function(import('../core/Dataset.js').Cell,number,number,object):number} */
        this.size = opts.size || ((cell, resolution) => resolution) //(c,r,z,vs) => {}

        /** The stroke line width in geographical unit.
         * @type {function(import('../core/Dataset.js').Cell,number,number,object):number} */
        this.strokeWidth = opts.strokeWidth || ((cell, resolution, z) => z * 1.5) //(c,r,z,vs) => {}

        /** A function returning the shape of a cell.
         * @type {function(import("../core/Dataset.js").Cell,number,number,object):import("../core/Style.js").Shape} */
        this.shape = opts.shape || (() => 'square') //(c,r,z,vs) => {}
    }

    /**
     * Draw cells as squares, with various colors and size.
     *
     * @param {Array.<import("../core/Dataset").Cell>} cells
     * @param {import("../core/GeoCanvas").GeoCanvas} geoCanvas
     * @param {number} resolution
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        const r2 = resolution * 0.5
        for (let c of cells) {
            //color
            const col = this.strokeColor ? this.strokeColor(c, resolution, z, viewScale) : undefined
            if (!col || col === 'none') continue
            ctx.strokeStyle = col

            //size - in geo unit
            const size = this.size ? this.size(c, resolution, z, viewScale) : resolution

            //width
            const wi = this.strokeWidth ? this.strokeWidth(c, resolution, z, viewScale) : 1 * z
            if (!wi || wi <= 0) continue
            ctx.lineWidth = wi

            //shape
            const shape = this.shape ? this.shape(c, resolution, z, viewScale) : 'square'
            if (shape === 'none') continue

            //get offset
            const offset = this.offset(c, resolution, z)

            if (shape === 'square') {
                //draw square
                const d = resolution * (1 - size / resolution) * 0.5
                ctx.beginPath()
                ctx.rect(c.x + d + offset.dx, c.y + d + offset.dy, size, size)
                ctx.stroke()
            } else if (shape === 'circle') {
                //draw circle
                ctx.beginPath()
                ctx.arc(c.x + r2 + offset.dx, c.y + r2 + offset.dy, size * 0.5, 0, 2 * Math.PI, false)
                ctx.stroke()
            } else if (shape === 'diamond') {
                const s2 = size * 0.5
                ctx.beginPath()
                ctx.moveTo(c.x + r2 - s2, c.y + r2)
                ctx.lineTo(c.x + r2, c.y + r2 + s2)
                ctx.lineTo(c.x + r2 + s2, c.y + r2)
                ctx.lineTo(c.x + r2, c.y + r2 - s2)
                ctx.lineTo(c.x + r2 - s2, c.y + r2)
                ctx.stroke()
            } else if (shape === 'donut') {
                console.error('Not implemented')
            } else if (shape === 'triangle_up') {
                const dr2 = (size - resolution) / 2
                ctx.beginPath()
                ctx.moveTo(c.x - dr2, c.y - dr2)
                ctx.lineTo(c.x + r2, c.y + resolution + dr2)
                ctx.lineTo(c.x + resolution + dr2, c.y - dr2)
                ctx.closePath()
                ctx.stroke()
            } else if (shape === 'triangle_down') {
                const dr2 = (size - resolution) / 2
                ctx.beginPath()
                ctx.moveTo(c.x - dr2, c.y + resolution + dr2)
                ctx.lineTo(c.x + r2, c.y - dr2)
                ctx.lineTo(c.x + resolution + dr2, c.y + resolution + dr2)
                ctx.closePath()
                ctx.stroke()
            } else if (shape === 'triangle_left') {
                const dr2 = (size - resolution) / 2
                ctx.beginPath()
                ctx.moveTo(c.x + resolution + dr2, c.y + resolution + dr2)
                ctx.lineTo(c.x - dr2, c.y + r2)
                ctx.lineTo(c.x + resolution + dr2, c.y - dr2)
                ctx.closePath()
                ctx.stroke()
            } else if (shape === 'triangle_right') {
                const dr2 = (size - resolution) / 2
                ctx.beginPath()
                ctx.moveTo(c.x - dr2, c.y - dr2)
                ctx.lineTo(c.x + resolution + dr2, c.y + r2)
                ctx.lineTo(c.x - dr2, c.y + resolution + dr2)
                ctx.closePath()
                ctx.stroke()
            } else {
                throw new Error('Unexpected shape:' + shape)
            }
        }

        //update legends
        this.updateLegends({ style: this, resolution: resolution, z: z, viewScale: viewScale })
    }
}

;// ./node_modules/gridviz/src/style/JoyPlotStyle.js
//@ts-check


;

/**
 * @module style
 * @author Julien Gaffuri
 */
class JoyPlotStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** A function returning the height of a cell in geographical unit.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):number} */
        this.height = opts.height || ((c, r) => r * Math.random()) //(c,r,z,vs) => {}

        /**
         * @type {function(number,{min:number, max:number},number,number):string} */
        this.lineColor = opts.lineColor || ((y, ys, r, z) => '#BBB')
        /**
         * @type {function(number,{min:number, max:number},number,number):number} */
        this.lineWidth = opts.lineWidth || ((y, ys, r, z) => z)
        /**
         * @type {function(number,{min:number, max:number},number,number):string} */
        this.fillColor = opts.fillColor || ((y, ys, r, z) => '#c08c5968')
    }

    /**
     * @param {Array.<import("../core/Dataset.js").Cell>} cells
     * @param {import("../core/GeoCanvas.js").GeoCanvas} geoCanvas
     * @param {number} resolution
     * @override
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        //index cells by y and x
        /**  @type {object} */
        const ind = {}
        for (const cell of cells) {
            let row = ind[cell.y]
            if (!row) {
                row = {}
                ind[cell.y] = row
            }
            row[cell.x] = this.height(cell, resolution, z, viewScale)
        }

        //compute extent
        const e = geoCanvas.extGeo
        if (!e) return
        const xMin = Math.floor(e.xMin / resolution) * resolution
        const xMax = Math.floor(e.xMax / resolution) * resolution
        const yMin = Math.floor(e.yMin / resolution) * resolution
        const yMax = Math.floor(e.yMax / resolution) * resolution

        /**  @type {{min:number, max:number}} */
        const ys = { min: yMin, max: yMax }

        //draw lines, row by row, stating from the top
        ctx.lineJoin = 'round'
        for (let y = yMax; y >= yMin; y -= resolution) {
            //get row
            const row = ind[y]

            //no row
            if (!row) continue

            //place first point
            ctx.beginPath()
            ctx.moveTo(xMin - resolution / 2, y)

            //store the previous height
            /** @type {number|undefined} */
            let hG_

            //go through the line cells
            for (let x = xMin; x <= xMax; x += resolution) {
                //get column value
                /** @type {number} */
                let hG = row[x]
                if (!hG) hG = 0

                if (hG || hG_) {
                    //draw line only when at least one of both values is non-null
                    //TODO test bezierCurveTo
                    ctx.lineTo(x + resolution / 2, y + hG)
                } else {
                    //else move the point
                    ctx.moveTo(x + resolution / 2, y)
                }
                //store the previous value
                hG_ = hG
            }

            //last point
            if (hG_) ctx.lineTo(xMax + resolution / 2, y)

            //draw fill
            const fc = this.fillColor(y, ys, resolution, z)
            if (fc && fc != 'none') {
                ctx.fillStyle = fc
                ctx.fill()
            }

            //draw line
            const lc = this.lineColor(y, ys, resolution, z)
            const lw = this.lineWidth(y, ys, resolution, z)
            if (lc && lc != 'none' && lw > 0) {
                ctx.strokeStyle = lc
                ctx.lineWidth = lw
                ctx.stroke()
            }
        }
    }
}

;// ./node_modules/gridviz/src/style/CompositionStyle.js
//@ts-check


;

/** @typedef {"flag"|"piechart"|"ring"|"segment"|"radar"|"agepyramid"|"halftone"} CompositionType */

/**
 * A style showing the composition of a total in different categories, with different color hues.
 * It consists of a symbol with different parts, whose size reflect the proportion of the corresponding category.
 * For a list of supported symbols, @see CompositionType
 * The symbol can be scaled depending on the cell importance.
 *
 * @module style
 * @author Julien Gaffuri
 */
class CompositionStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /**
         * The dictionary (string -> color) which give the color of each category.
         * @type {object} */
        this.color = opts.color

        /**
         * A function returning the type of decomposition symbol of a cell, @see CompositionType
         * @type {function(import("../core/Dataset.js").Cell,number, number,object):CompositionType} */
        this.type = opts.type || (() => 'flag') //(c,r,z,vs) => {}

        /** A function returning the size of a cell in geographical unit.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):number} */
        this.size = opts.size || ((c, r) => r) //(c,r,z,vs) => {}

        /** For style types with stripes (flag, segment), the orientation of the stripes (0 for horizontal, other for vertical).
         * @type {function(import("../core/Dataset.js").Cell,number,number,object):number} */
        this.stripesOrientation = opts.stripesOrientation || (() => 0) //(c,r,z,vs) => ...

        /** The function specifying an offset angle for a radar, halftone or pie chart style.
         * The angle is specified in degree. The rotation is anti-clockwise.
         * @type {function(import("../core/Dataset.js").Cell,number,number,object):number} */
        this.offsetAngle = opts.offsetAngle || (() => 0) //(c,r,z,vs) => ...

        /** The function specifying the height of the age pyramid, in geo unit.
         * @type {function(import("../core/Dataset.js").Cell,number,number,object):number} */
        this.agePyramidHeight = opts.agePyramidHeight || ((c, r) => r) //(c,r,z,vs) => ...

        /** For pie chart, this is parameter for internal radius, so that the pie chart looks like a donut.
         * 0 for normal pie charts, 0.5 to empty half of the radius.
         * @type {number} */
        this.pieChartInternalRadiusFactor = opts.pieChartInternalRadiusFactor || 0
    }

    /**
     * Draw cells as squares depending on their value.
     *
     * @param {Array.<import("../core/Dataset.js").Cell>} cells
     * @param {import("../core/GeoCanvas.js").GeoCanvas} geoCanvas
     * @param {number} resolution
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        //nb categories - used for radar and agepyramid
        const nbCat = Object.entries(this.color).length

        //draw calls
        for (let cell of cells) {
            //size
            const sG = this.size ? this.size(cell, resolution, z, viewScale) : resolution
            if (!sG) continue

            //get offset
            const offset = this.offset(cell, resolution, z)

            //get symbol type
            const type_ = this.type ? this.type(cell, resolution, z, viewScale) : 'flag'

            //compute center position
            const xc = cell.x + offset.dx + (type_ === 'agepyramid' ? 0 : resolution * 0.5)
            const yc = cell.y + offset.dy + (type_ === 'agepyramid' ? 0 : resolution * 0.5)

            //compute offset angle, when relevant
            const offAng = this.offsetAngle
                ? (this.offsetAngle(cell, resolution, z, viewScale) * Math.PI) / 180
                : 0

            if (type_ === 'agepyramid' || type_ === 'radar' || type_ === 'halftone') {
                //get cell category max value
                let maxVal = -Infinity
                for (let key of Object.keys(this.color)) {
                    const v = +cell[key]
                    if (v > maxVal) maxVal = v
                }

                //cumul
                let cumul = 0
                if (type_ === 'agepyramid' && this.agePyramidHeight)
                    cumul = (resolution - this.agePyramidHeight(cell, resolution, z, viewScale)) / 2
                if (type_ === 'radar' || type_ === 'halftone') cumul = Math.PI / 2 + offAng

                //compute the increment, which is the value to increment the cumul for each category
                const incr =
                    type_ === 'agepyramid'
                        ? (this.agePyramidHeight
                              ? this.agePyramidHeight(cell, resolution, z, viewScale)
                              : resolution) / nbCat
                        : type_ === 'radar' || type_ === 'halftone'
                        ? (2 * Math.PI) / nbCat
                        : undefined
                if (incr === undefined) throw new Error('Unexpected symbol type:' + type_)

                for (let [column, color] of Object.entries(this.color)) {
                    if (type_ === 'agepyramid') {
                        //set category color
                        ctx.fillStyle = color

                        //get category value
                        const val = cell[column]

                        //compute category length - in geo
                        /** @type {number} */
                        const wG = (sG * val) / maxVal

                        //draw bar
                        ctx.fillRect(xc + (resolution - wG) / 2, yc + cumul, wG, incr)

                        //next height
                        cumul += incr
                    } else if (type_ === 'radar') {
                        //set category color
                        ctx.fillStyle = color

                        //get categroy value
                        const val = cell[column]

                        //compute category radius - in geo
                        /** @type {number} */
                        //const rG = this.radius(val, r, stat, cellStat, z)
                        const rG = (sG / 2) * Math.sqrt(val / maxVal)

                        //draw angular sector
                        ctx.beginPath()
                        ctx.moveTo(xc, yc)
                        ctx.arc(xc, yc, rG, cumul - incr, cumul)
                        ctx.lineTo(xc, yc)
                        ctx.fill()

                        //next angular sector
                        cumul += incr
                    } else if (type_ === 'halftone') {
                        //set category color
                        ctx.fillStyle = color

                        //get categroy value
                        const val = cell[column]

                        //compute category radius - in geo
                        /** @type {number} */
                        const rG = sG * 0.333 * Math.sqrt(val / maxVal)

                        //draw circle
                        ctx.beginPath()
                        ctx.arc(
                            xc + resolution * 0.25 * Math.cos(cumul),
                            yc + resolution * 0.25 * Math.sin(cumul),
                            rG,
                            0,
                            2 * Math.PI
                        )
                        ctx.fill()

                        //next angular sector
                        cumul += incr
                    } else {
                        throw new Error('Unexpected symbol type:' + type_)
                    }
                }
            } else {
                //compute total
                let total = 0
                for (let column of Object.keys(this.color)) {
                    const v = +cell[column]
                    if (!v) continue
                    total += v
                }
                if (!total || isNaN(total)) continue

                //draw decomposition symbol
                let cumul = 0
                const d = resolution * (1 - sG / resolution) * 0.5
                const ori = this.stripesOrientation(cell, resolution, z, viewScale)

                for (let [column, color] of Object.entries(this.color)) {
                    //get share
                    const share = cell[column] / total
                    if (!share || isNaN(share)) continue

                    //set color
                    ctx.fillStyle = color

                    //draw symbol part
                    if (type_ === 'flag') {
                        //draw flag stripe
                        if (ori == 0) {
                            //horizontal
                            ctx.fillRect(
                                cell.x + d + offset.dx,
                                cell.y + d + cumul * sG + offset.dy,
                                sG,
                                share * sG
                            )
                        } else {
                            //vertical
                            ctx.fillRect(
                                cell.x + d + cumul * sG + offset.dx,
                                cell.y + d + offset.dy,
                                share * sG,
                                sG
                            )
                        }
                    } else if (type_ === 'piechart') {
                        //draw pie chart angular sector

                        //compute angles
                        const a1 = cumul * 2 * Math.PI
                        const a2 = (cumul + share) * 2 * Math.PI

                        //draw
                        ctx.beginPath()
                        ctx.moveTo(xc, yc)
                        ctx.arc(xc, yc, sG * 0.5, a1 + offAng, a2 + offAng)
                        if (this.pieChartInternalRadiusFactor)
                            ctx.arc(
                                xc,
                                yc,
                                sG * 0.5 * this.pieChartInternalRadiusFactor,
                                a1 + offAng,
                                a2 + offAng,
                                true
                            )
                        ctx.closePath()
                        ctx.fill()
                    } else if (type_ === 'ring') {
                        //draw ring
                        ctx.beginPath()
                        ctx.arc(xc, yc, Math.sqrt(1 - cumul) * sG * 0.5, 0, 2 * Math.PI)
                        ctx.fill()
                    } else if (type_ === 'segment') {
                        //draw segment sections
                        const wG = (sG * sG) / resolution
                        if (ori == 0) {
                            //horizontal
                            ctx.fillRect(
                                cell.x + offset.dx,
                                cell.y + (resolution - wG) / 2 + cumul * wG + offset.dy,
                                resolution,
                                share * wG
                            )
                        } else {
                            //vertical
                            ctx.fillRect(
                                cell.x + cumul * resolution + offset.dx,
                                cell.y + (resolution - wG) / 2 + offset.dy,
                                share * resolution,
                                wG
                            )
                        }
                    } else {
                        throw new Error('Unexpected symbol type:' + type_)
                    }

                    cumul += share
                }
            }
        }

        //update legends
        this.updateLegends({ style: this, resolution: resolution, z: z, viewScale: viewScale })
    }
}

;// ./node_modules/gridviz/src/style/SegmentStyle.js
//@ts-check


;

/**
 * A style where each cell is represented by a segment whose length, width, color and orientation can vary according to statistical values.
 *
 * @module style
 * @author Julien Gaffuri
 */
class SegmentStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** A function returning the color of the cell segment.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):string} */
        this.color = opts.color || (() => '#EA6BAC') //(c,r,z,vs) => {}

        /** A function returning the width of the segment representing a cell, in geo unit
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):number} */
        this.width = opts.width || ((cell, resolution) => resolution * 0.1) //(c,r,z,vs) => {}

        /** A function returning the length of the segment representing a cell, in geo unit
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):number} */
        this.length = opts.length || ((cell, resolution) => resolution * 0.9) //(c,r,z,vs) => {}

        /** A function returning the orientation (in degrees) of the segment representing a cell.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):number} */
        this.orientation = opts.orientation || (() => 180 * Math.random()) //(c,r,z,vs) => {}
    }

    /**
     * Draw cells as segments.
     *
     * @param {Array.<import("../core/Dataset").Cell>} cells
     * @param {import("../core/GeoCanvas").GeoCanvas} geoCanvas
     * @param {number} resolution
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        //
        ctx.lineCap = 'butt'

        //conversion factor degree -> radian
        const f = Math.PI / 180

        for (let cell of cells) {
            //color
            /** @type {string|undefined} */
            const col = this.color ? this.color(cell, resolution, z, viewScale) : undefined
            if (!col) continue

            //width
            /** @type {number|undefined} */
            const wG = this.width ? this.width(cell, resolution, z, viewScale) : undefined
            if (!wG || wG < 0) continue

            //length
            /** @type {number|undefined} */
            const lG = this.length ? this.length(cell, resolution, z, viewScale) : undefined
            if (!lG || lG < 0) continue

            //orientation (in radian)
            /** @type {number} */
            const or = this.orientation(cell, resolution, z, viewScale) * f
            if (or === undefined || isNaN(or)) continue

            //get offset
            const offset = this.offset(cell, resolution, z)

            //set color and width
            ctx.strokeStyle = col
            ctx.lineWidth = wG

            //compute segment center postition
            const cx = cell.x + resolution / 2 + offset.dx
            const cy = cell.y + resolution / 2 + offset.dy

            //compute segment direction
            const dx = 0.5 * Math.cos(or) * lG
            const dy = 0.5 * Math.sin(or) * lG

            //draw segment
            ctx.beginPath()
            ctx.moveTo(cx - dx, cy - dy)
            ctx.lineTo(cx + dx, cy + dy)
            ctx.stroke()
        }

        //update legends
        this.updateLegends({ viewScale: viewScale, resolution: resolution, z: z, cells: cells })
    }
}

;// ./node_modules/gridviz/src/style/TextStyle.js
//@ts-check


;

/**
 * @module style
 * @author Julien Gaffuri
 */
class TextStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** A function returning the text of a cell.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):string} */
        this.text = opts.text || (() => 'X') //(c,r,z,vs) => {}

        /** A function returning the color of the cell.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):string} */
        this.color = opts.color || (() => 'black') //(c,r,z,vs) => {}

        /** A function returning the font size of a cell in geo unit.
         * @type {function(import('../core/Dataset.js').Cell, number, number,object):number} */
        this.fontSize = opts.fontSize || ((cell, resolution) => resolution) //(c,r,z,vs) => {}

        /** The text font family.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):string} */
        this.fontFamily = opts.fontFamily || (() => 'Arial')

        /** The text font weight.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):string} */
        this.fontWeight = opts.fontWeight || (() => 'bold')
    }

    /**
     * Draw cells as text.
     *
     * @param {Array.<import("../core/Dataset").Cell>} cells
     * @param {import("../core/GeoCanvas").GeoCanvas} geoCanvas
     * @param {number} resolution
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx
        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        //draw with HTML canvas
        //in screen coordinates
        geoCanvas.initCanvasTransform()

        for (let cell of cells) {
            //get cell text
            const text = this.text ? this.text(cell, resolution, z, viewScale) : undefined
            if (text == undefined || text == null || text + '' === '') continue

            //color
            const col = this.color ? this.color(cell, resolution, z, viewScale) : undefined
            if (!col) continue
            ctx.fillStyle = col

            //font size
            //size - in pixel unit
            const fontSizePix = this.fontSize(cell, resolution, z, viewScale) / z
            if (!fontSizePix) continue

            //set font
            const fontFamily = this.fontFamily ? this.fontFamily(cell, resolution, z, viewScale) : 'Arial'
            const fontWeight = this.fontWeight ? this.fontWeight(cell, resolution, z, viewScale) : 'bold'
            ctx.font = fontWeight + ' ' + fontSizePix + 'px ' + fontFamily

            //get offset
            const offset = this.offset(cell, resolution, z)

            //text position
            ctx.textAlign = 'center'
            const tx = geoCanvas.geoToPixX(cell.x + resolution * 0.5 + offset.dx)
            const ty = geoCanvas.geoToPixY(cell.y + resolution * 0.5 + offset.dy) + fontSizePix * 0.3 //it should be 0.5 but 0.3 seems to work better

            //draw the text
            ctx.fillText(text, tx, ty)
        }

        //update legends
        this.updateLegends({ style: this, resolution: resolution, z: z, viewScale: viewScale })
    }

    /**
     * Build a function [0,1]->string for characters legend
     *
     * @param {Array.<string>} chars
     * @param {(function(number):number)|undefined} scale
     * @returns {function(number):string}
     */
    static textScale(chars, scale = undefined) {
        const nb = chars.length
        return (t) => {
            if (scale) t = scale(t)
            if (t == 0) return ''
            if (t >= 1) return chars[nb - 1]
            return chars[Math.floor(t * nb)]
        }
    }
}

;// ./node_modules/gridviz/src/style/PillarStyle.js
//@ts-check


;

/**
 * @module style
 * @author Julien Gaffuri
 */
class PillarStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** A function returning the height of the line representing a cell, in geo unit
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):number} */
        this.height = opts.height

        /** A function returning the color of the line representing a cell.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):string} */
        this.color = opts.color || (() => '#c08c59') //(c,r,z,vs) => {}

        /** A function returning the width of the line representing a cell, in geo unit
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):number} */
        this.width = opts.width || ((cell, resolution) => 0.5 * resolution)

        /** A function returning the width of the line representing a cell, in geo unit
         * @type {function(number, number,object):boolean} */
        this.simple = opts.simple || (() => false)

        /** @type {number} */
        this.viewHeightFactor = opts.viewHeightFactor || 1.5
        //0,0 is the center
        /** @type {number} */
        this.viewSX = opts.viewSX == undefined ? 0 : opts.viewSX
        /** @type {number} */
        this.viewSY = opts.viewSY == undefined ? -0.5 : opts.viewSY

        //TODO replace with sun location ?
        /** @type {number} */
        this.shadowDirection =
            opts.shadowDirection == undefined ? (-40.3 * Math.PI) / 180.0 : opts.shadowDirection
        /** @type {number} */
        this.shadowFactor = opts.shadowFactor || 0.3
        /** @type {string} */
        this.shadowColor = opts.shadowColor || '#00000033'

        /** @type {string} */
        this.outlineCol = opts.outlineCol || '#FFFFFF'
        /** @type {number} */
        this.outlineWidthPix = opts.outlineWidthPix == undefined ? 0.5 : opts.outlineWidthPix
    }

    /**
     * Draw cells as segments.
     *
     * @param {Array.<import("../core/Dataset").Cell>} cells
     * @param {import("../core/GeoCanvas").GeoCanvas} geoCanvas
     * @param {number} resolution
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        //get view center geo position
        const cvx = geoCanvas.view.x + this.viewSX * geoCanvas.w * z
        const cvy = geoCanvas.view.y + this.viewSY * geoCanvas.h * z
        //get view height
        const H = this.viewHeightFactor * (geoCanvas.w + geoCanvas.h) * 0.5 * z

        //sort cells by y and x
        //const distToViewCenter = (c) => { const dx = cvx - c.x, dy = cvy - c.y; return Math.sqrt(dx * dx + dy * dy) }
        cells.sort((c1, c2) => 100000000 * (c2.y - c1.y) + c1.x - c2.x)

        //get simple information
        const simple = this.simple(resolution, z, viewScale)

        ctx.lineCap = simple ? 'butt' : 'round'

        //draw shadows
        ctx.strokeStyle = this.shadowColor
        ctx.fillStyle = this.shadowColor
        for (let cell of cells) {
            //width
            /** @type {number|undefined} */
            const wG = this.width ? this.width(cell, resolution, z, viewScale) : undefined
            if (!wG || wG < 0) continue

            //height
            /** @type {number|undefined} */
            const hG = this.height ? this.height(cell, resolution, z, viewScale) : undefined
            if (!hG || hG < 0) continue

            //get offset
            //TODO use that
            //const offset = this.offset(c, resolution, z)

            //set width
            ctx.lineWidth = wG

            //compute cell center postition
            const cx = cell.x + resolution / 2
            const cy = cell.y + resolution / 2
            const ls = hG * this.shadowFactor

            //draw segment
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.lineTo(cx + ls * Math.cos(this.shadowDirection), cy + ls * Math.sin(this.shadowDirection))
            ctx.stroke()

            /*
            if (this.simple) {
                //draw base circle
                cg.ctx.beginPath();
                cg.ctx.arc(
                    cx, cy,
                    wG * 0.5,
                    0, 2 * Math.PI, false);
                //cg.ctx.stroke();
                cg.ctx.fill();
            }*/
        }

        //draw pillars
        for (let cell of cells) {
            //color
            /** @type {string|undefined} */
            const col = this.color ? this.color(cell, resolution, z, viewScale) : undefined
            if (!col) continue

            //width
            /** @type {number|undefined} */
            const wG = this.width ? this.width(cell, resolution, z, viewScale) : undefined
            if (!wG || wG < 0) continue

            //height
            /** @type {number|undefined} */
            const hG = this.height ? this.height(cell, resolution, z, viewScale) : undefined
            if (!hG || hG < 0) continue

            //get offset
            //TODO use that
            //const offset = this.offset(c, resolution, z)

            //compute cell center postition
            const cx = cell.x + resolution / 2
            const cy = cell.y + resolution / 2

            //compute angle
            const dx = cx - cvx,
                dy = cy - cvy
            const a = Math.atan2(dy, dx)
            const D = Math.sqrt(dx * dx + dy * dy)
            const d = (D * hG) / (H - hG)

            if (simple) {
                //draw segment
                ctx.strokeStyle = col
                ctx.lineWidth = wG
                ctx.beginPath()
                ctx.moveTo(cx, cy)
                ctx.lineTo(cx + d * Math.cos(a), cy + d * Math.sin(a))
                ctx.stroke()
            } else {
                //draw background segment
                ctx.strokeStyle = this.outlineCol
                ctx.lineWidth = wG + 2 * this.outlineWidthPix * z
                ctx.beginPath()
                ctx.moveTo(cx, cy)
                ctx.lineTo(cx + d * Math.cos(a), cy + d * Math.sin(a))
                ctx.stroke()

                //draw segment
                ctx.strokeStyle = col
                ctx.lineWidth = wG
                ctx.beginPath()
                ctx.moveTo(cx, cy)
                ctx.lineTo(cx + d * Math.cos(a), cy + d * Math.sin(a))
                ctx.stroke()

                //draw top circle
                ctx.strokeStyle = this.outlineCol
                //cg.ctx.fillStyle = "#c08c59"
                ctx.lineWidth = this.outlineWidthPix * z
                ctx.beginPath()
                ctx.arc(cx + d * Math.cos(a), cy + d * Math.sin(a), wG * 0.5, 0, 2 * Math.PI, false)
                ctx.stroke()
                //cg.ctx.fill();
            }
        }

        //in case...
        ctx.lineCap = 'butt'

        //update legends
        this.updateLegends({ style: this, resolution: resolution, z: z, viewScale: viewScale })
    }
}

;// ./node_modules/gridviz/src/style/SideStyle.js
//@ts-check


;

/** @typedef {{ x:number, y:number, or:"v"|"h", c1:(import('../core/Dataset').Cell)|undefined, c2:(import('../core/Dataset').Cell)|undefined }} Side */

/**
 * @typedef {function(Array.<Side>,number, number):*} SideViewScale */

/**
 * @module style
 * @author Julien Gaffuri
 */
class SideStyle_SideStyle extends Style {
    /** @param {object} opts */
    constructor(opts = {}) {
        super(opts)

        /** A function returning the color of a cell side.
         * @type {function(Side, number, number, object):string} */
        this.color = opts.color || ((side, resolution, z, sideViewScale) => '#EA6BAC')

        /** A function returning the width of a cell side, in geo unit
         * @type {function(Side, number, number, object):number} */
        this.width = opts.width || ((side, resolution, z, sideViewScale) => resolution / 5)

        /** A function returning the length of a cell side, in geo unit
         * @type {function(Side, number, number, object):number} */
        this.length = opts.length || ((side, resolution, z, sideViewScale) => resolution)

        /** Set to A or true so that the side is drawn as a diamond */
        this.diamond = opts.diamond
    }

    /**
     * @param {Array.<import("../core/Dataset").Cell>} cells
     * @param {number} resolution
     * @param {import("../core/GeoCanvas").GeoCanvas} geoCanvas
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        //build sides

        /**  @type {Array.<Side>} */
        const sides = SideStyle_SideStyle.buildSides(cells, resolution)
        if (sides.length == 0) return

        //get side view scale
        const viewScale = this.viewScale ? this.viewScale(sides, resolution, z) : undefined

        //draw sides

        ctx.lineCap = 'butt'
        const r2 = resolution * 0.5
        for (let side of sides) {
            //color
            /** @type {string|undefined} */
            const col = this.color ? this.color(side, resolution, z, viewScale) : undefined
            if (!col || col == 'none') continue

            if (this.diamond) {
                //set color
                ctx.fillStyle = col

                //draw diamond
                const x = side.x,
                    y = side.y
                ctx.beginPath()
                ctx.moveTo(x - r2, y)
                ctx.lineTo(x, y + r2)
                ctx.lineTo(x + r2, y)
                ctx.lineTo(x, y - r2)
                ctx.closePath()
                ctx.fill()
            } else {
                //width
                /** @type {number|undefined} */
                const wG = this.width ? this.width(side, resolution, z, viewScale) : undefined
                if (!wG || wG <= 0) continue

                //length
                /** @type {number|undefined} */
                const lG = this.length ? this.length(side, resolution, z, viewScale) : undefined
                if (!lG || lG <= 0) continue
                const lG2 = lG * 0.5

                //set width
                ctx.lineWidth = wG
                //set color
                ctx.strokeStyle = col

                //draw segment with correct orientation
                const x = side.x,
                    y = side.y
                ctx.beginPath()
                if (side.or === 'v') {
                    ctx.moveTo(x, y - lG2)
                    ctx.lineTo(x, y + lG2)
                } else {
                    ctx.moveTo(x - lG2, y)
                    ctx.lineTo(x + lG2, y)
                }
                ctx.stroke()
            }
        }

        //update legends
        this.updateLegends({ style: this, resolution: resolution, z: z, viewScale: viewScale })
    }

    /**
     *
     * @param {Array.<import('../core/Dataset').Cell>} cells The cells to use to build the sides.
     * @param {number} resolution The cells resolution
     * @param {boolean} withHorizontal Set to true to build horizontal sides, false otherwise.
     * @param {boolean} withVertical Set to true to build vertical sides, false otherwise.
     * @param {boolean} center Set to true so that the side coordinate are those of its center point rather than its left/bottom point (the side x,y coordinates are those of the left point for horizontal sides, and of the bottom point for vertical sides)
     * @returns { Array.<Side> }
     */
    static buildSides(cells, resolution, withHorizontal = true, withVertical = true, center = true) {
        /** @type { Array.<Side> } */
        const sides = []

        const r2 = center ? resolution / 2 : 0

        //make horizontal sides
        //sort cells by x and y
        cells.sort((c1, c2) => (c2.x == c1.x ? c1.y - c2.y : c1.x - c2.x))
        let c1 = cells[0]
        for (let i = 1; i < cells.length; i++) {
            let c2 = cells[i]

            if (c1.y + resolution == c2.y && c1.x == c2.x)
                //cells in same column and touch along horizontal side
                //make shared side
                sides.push({
                    or: 'h',
                    x: c1.x + r2,
                    y: c2.y,
                    c1: c1,
                    c2: c2,
                })
            else {
                //cells do not touch along horizontal side
                //make two sides: top one for c1, bottom for c2
                sides.push({
                    or: 'h',
                    x: c1.x + r2,
                    y: c1.y + resolution,
                    c1: c1,
                    c2: undefined,
                })
                sides.push({
                    or: 'h',
                    x: c2.x + r2,
                    y: c2.y,
                    c1: undefined,
                    c2: c2,
                })
            }

            c1 = c2
        }

        //make vertical sides
        //sort cells by y and x
        cells.sort((c1, c2) => (c2.y == c1.y ? c1.x - c2.x : c1.y - c2.y))
        c1 = cells[0]
        for (let i = 1; i < cells.length; i++) {
            let c2 = cells[i]

            if (c1.x + resolution == c2.x && c1.y == c2.y)
                //cells in same row and touch along vertical side
                //make shared side
                sides.push({
                    or: 'v',
                    x: c1.x + resolution,
                    y: c1.y + r2,
                    c1: c1,
                    c2: c2,
                })
            else {
                //cells do not touch along vertical side
                //make two sides: right one for c1, left for c2
                sides.push({
                    or: 'v',
                    x: c1.x + resolution,
                    y: c1.y + r2,
                    c1: c1,
                    c2: undefined,
                })
                sides.push({
                    or: 'v',
                    x: c2.x,
                    y: c2.y + r2,
                    c1: undefined,
                    c2: c2,
                })
            }

            c1 = c2
        }
        return sides
    }
}

;// ./node_modules/gridviz/src/style/SideCategoryStyle.js
//@ts-check


;

/**
 * A style to show the sides of grid cells based on their different categories.
 *
 * @module style
 * @author Julien Gaffuri
 */
class SideCategoryStyle extends SideStyle_SideStyle {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** A function returning the category code of a cell.
         * @type {function(import('../core/Dataset.js').Cell, number, number):string} */
        this.code = opts.code

        /**
         * The dictionary (string -> color) which give the color of each category.
         * @type {object} */
        this.color = opts.color
    }

    /**
     * @param {Array.<import("../core/Dataset.js").Cell>} cells
     * @param {import("../core/GeoCanvas.js").GeoCanvas} geoCanvas
     * @param {number} resolution
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        //build sides

        /**  @type {Array.<import('./SideStyle.js').Side>} */
        const sides = SideStyle_SideStyle.buildSides(cells, resolution)
        if (sides.length == 0) return

        //get side view scale
        const viewScale = this.viewScale ? this.viewScale(sides, resolution, z) : undefined

        //draw sides

        ctx.lineCap = 'butt'
        const r2 = resolution * 0.5
        for (let side of sides) {
            //get category codes for both cells
            const code1 = side.c1 ? this.code(side.c1, resolution, z) : undefined
            const code2 = side.c2 ? this.code(side.c2, resolution, z) : undefined
            if (code1 == code2) continue

            //width
            /** @type {number|undefined} */
            const wG = this.width ? this.width(side, resolution, z, viewScale) : undefined
            if (!wG || wG <= 0) continue
            const w2 = wG * 0.5

            //set width
            ctx.lineWidth = wG

            //draw segment with correct orientation
            if (side.or === 'h') {
                //top line
                if (code2) {
                    ctx.beginPath()
                    ctx.strokeStyle = this.color[code2]
                    ctx.moveTo(side.x - r2, side.y + w2)
                    ctx.lineTo(side.x + r2, side.y + w2)
                    ctx.stroke()
                }

                //bottom line
                if (code1) {
                    ctx.beginPath()
                    ctx.strokeStyle = this.color[code1]
                    ctx.moveTo(side.x - r2, side.y - w2)
                    ctx.lineTo(side.x + r2, side.y - w2)
                    ctx.stroke()
                }
            } else {
                //right line
                if (code2) {
                    ctx.beginPath()
                    ctx.strokeStyle = this.color[code2]
                    ctx.moveTo(side.x + w2, side.y - r2)
                    ctx.lineTo(side.x + w2, side.y + r2)
                    ctx.stroke()
                }

                //left line
                if (code1) {
                    ctx.beginPath()
                    ctx.strokeStyle = this.color[code1]
                    ctx.moveTo(side.x - w2, side.y - r2)
                    ctx.lineTo(side.x - w2, side.y + r2)
                    ctx.stroke()
                }
            }
        }

        //update legends
        this.updateLegends({ style: this, resolution: resolution, z: z, viewScale: viewScale })
    }
}

;// ./node_modules/d3-random/src/defaultSource.js
/* harmony default export */ const defaultSource = (Math.random);

;// ./node_modules/d3-random/src/normal.js


/* harmony default export */ const normal = ((function sourceRandomNormal(source) {
  function randomNormal(mu, sigma) {
    var x, r;
    mu = mu == null ? 0 : +mu;
    sigma = sigma == null ? 1 : +sigma;
    return function() {
      var y;

      // If available, use the second previously-generated uniform random.
      if (x != null) y = x, x = null;

      // Otherwise, generate a new x and y.
      else do {
        x = source() * 2 - 1;
        y = source() * 2 - 1;
        r = x * x + y * y;
      } while (!r || r > 1);

      return mu + sigma * y * Math.sqrt(-2 * Math.log(r) / r);
    };
  }

  randomNormal.source = sourceRandomNormal;

  return randomNormal;
})(defaultSource));

;// ./node_modules/gridviz/src/utils/webGLUtils.js
//@ts-check


/**
 * @param {string} width
 * @param {string} height
 * @param {object} opts
 * @returns {{canvas:HTMLCanvasElement, gl:WebGLRenderingContext}}
 */
function makeWebGLCanvas(width, height, opts = {}) {
    const canvas = document.createElement('canvas')
    canvas.setAttribute('width', width)
    canvas.setAttribute('height', height)
    /** @type {WebGLRenderingContext} */
    const gl = canvas.getContext('webgl', opts)
    if (!gl) {
        throw new Error('Unable to initialize WebGL. Your browser or machine may not support it.')
    }
    return { canvas: canvas, gl: gl }
}

/**
 * Initialize a shader program, so WebGL knows how to draw our data
 *
 * @param {WebGLRenderingContext} gl
 * @param  {...WebGLShader} shaders
 * @returns {WebGLProgram}
 */
function initShaderProgram(gl, ...shaders) {
    /** @type {WebGLProgram|null} */
    const program = gl.createProgram()
    if (program == null) throw new Error('Cannot create webGL program')
    for (const shader of shaders) gl.attachShader(program, shader)
    gl.linkProgram(program)
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program
    throw new Error(gl.getProgramInfoLog(program) || 'Cannot create webGL program (2)')
}

/**
 * Creates a shader of the given type, uploads the source and compiles it.
 *
 * @param {WebGLRenderingContext} gl
 * @param {number} type
 * @param  {...string} sources
 * @returns {WebGLShader}
 */
function createShader(gl, type, ...sources) {
    /** @type {WebGLShader|null} */
    const shader = gl.createShader(type)
    if (shader == null) throw new Error('Cannot create webGL shader')
    gl.shaderSource(shader, sources.join('\n'))
    gl.compileShader(shader)
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
    throw new Error(gl.getShaderInfoLog(shader) || 'Cannot create webGL shader (2)')
}

/**
 * Check if webGL is supported
 *
 * @returns {boolean}
 */
function checkWebGLSupport() {
    try {
        const canvas = document.createElement('canvas')
        return !!(
            !!window.WebGLRenderingContext &&
            (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
        )
    } catch (err) {
        return false
    }
}

;// ./node_modules/gridviz/src/utils/WebGLSquareColoring.js
//@ts-check


;


/**
 * Everything to easily draw colored squares with webGL.
 * All the same size, but different fill color.
 */
class WebGLSquareColoring {
    /**
     *
     * @param {WebGLRenderingContext} gl
     */
    constructor(gl, sizePix) {
        this.gl = gl
        this.sizePix = sizePix || 10.0

        this.program = initShaderProgram(
            gl,
            createShader(
                gl,
                gl.VERTEX_SHADER,
                `
            attribute vec2 pos;
            uniform float sizePix;
            uniform mat3 mat;
            attribute vec4 color;
            varying vec4 vColor;
            void main() {
              gl_Position = vec4(mat * vec3(pos, 1.0), 1.0);
              gl_PointSize = sizePix;
              vColor = color;
            }
          `
            ),
            createShader(
                gl,
                gl.FRAGMENT_SHADER,
                `
            precision mediump float;
            varying vec4 vColor;
            void main(void) {
                vec4 vColor_ = vColor / 255.0;
                vColor_[3] = 255.0 * vColor_[3];
                gl_FragColor = vColor_;
            }`
            )
        )
        gl.useProgram(this.program)

        //buffer data
        this.verticesBuffer = []
        this.colorsBuffer = []
    }

    /** Add data to vertices/size/color buffers for color squares drawing */
    addPointData(xC, yC, col) {
        //convert color
        const cc = color(col)
        //const cc = {r:45,g:87,b:98,opacity:0.9}
        if (!cc) return

        //vertices
        this.verticesBuffer.push(xC, yC)
        //color
        this.colorsBuffer.push(cc.r, cc.g, cc.b, cc.opacity)
    }

    addPointData2(xC, yC, r, g, b, opacity) {
        //vertices
        this.verticesBuffer.push(xC, yC)
        //color
        this.colorsBuffer.push(r, g, b, opacity)
    }

    /**  */
    draw(transfoMat) {
        const gl = this.gl

        //vertice data
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.verticesBuffer), gl.STATIC_DRAW)
        const position = gl.getAttribLocation(this.program, 'pos')
        gl.vertexAttribPointer(
            position,
            2, //numComponents
            gl.FLOAT, //type
            false, //normalise
            0, //stride
            0 //offset
        )
        gl.enableVertexAttribArray(position)

        //color data
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.colorsBuffer), gl.STATIC_DRAW)
        var color = gl.getAttribLocation(this.program, 'color')
        gl.vertexAttribPointer(color, 4, gl.FLOAT, false, 0, 0)
        gl.enableVertexAttribArray(color)

        //sizePix
        gl.uniform1f(gl.getUniformLocation(this.program, 'sizePix'), 1.0 * this.sizePix)

        //transformation
        gl.uniformMatrix3fv(gl.getUniformLocation(this.program, 'mat'), false, new Float32Array(transfoMat))

        // Enable the depth test
        //gl.enable(gl.DEPTH_TEST);
        // Clear the color buffer bit
        gl.clear(gl.COLOR_BUFFER_BIT)
        // Set the view port
        //gl.viewport(0, 0, cg.w, cg.h);

        gl.drawArrays(gl.POINTS, 0, this.verticesBuffer.length / 2)
    }
}

;// ./node_modules/gridviz/src/style/DotDensityStyle.js
//@ts-check


;





/**
 *
 * @module style
 * @author Julien Gaffuri
 */
class DotDensityStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** A function returning the number of dots for a cell value.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):number} */
        this.dotNumber = opts.dotNumber || ((cell, resolution) => resolution / 100) //(c,r,z,vs) => {}

        /** The color of the dots. Same color for all dots within a cell.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):string} */
        this.color = opts.color || (() => '#FF5733') //(c,r,z,vs) => {}

        /** A function returning the size of the dots, in geo unit. Same size for all cells.
         * @type {function(number, number,object):number} */
        this.dotSize = opts.dotSize || ((resolution, z) => 1.5 * z) //(c,r,z,vs) => {}

        /** A function returning the sigma of the dots distribution. Same value for all cells.
         * @type {function(number, number,object):number} */
        this.sigma = opts.sigma || ((resolution, z) => resolution / 2) //(c,r,z,vs) => {}
    }

    /**
     * Draw cells as text.
     *
     * @param {Array.<import("../core/Dataset").Cell>} cells
     * @param {import("../core/GeoCanvas").GeoCanvas} geoCanvas
     * @param {number} resolution
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z

        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        //get size
        const sGeo = this.dotSize ? this.dotSize(resolution, z, viewScale) : z

        //make random function
        const sig = this.sigma ? this.sigma(resolution, z, viewScale) : resolution * 0.4
        const rand = normal(0, sig)

        const ctx = geoCanvas.offscreenCtx

        if (checkWebGLSupport()) {
            //create canvas and webgl renderer
            const cvWGL = makeWebGLCanvas(geoCanvas.w + '', geoCanvas.h + '')
            if (!cvWGL) {
                console.error('No webGL')
                return
            }

            //create webGL program
            const prog = new WebGLSquareColoring(cvWGL.gl, sGeo / z)

            const r2 = resolution / 2

            for (let cell of cells) {
                //get color
                const col = this.color(cell, resolution, z, viewScale)
                if (!col || col === 'none') continue

                //number of dots
                const dotNumber = this.dotNumber(cell, resolution, z, viewScale)

                //get offset
                const offset = this.offset(cell, resolution, z)

                //cell center
                const cx = cell.x + offset.dx + r2
                const cy = cell.y + offset.dy + r2

                //convert color
                const cc = color(col)
                if (!cc) return

                //random points
                for (let i = 0; i <= dotNumber; i++)
                    prog.addPointData2(cx + rand(), cy + rand(), cc.r, cc.g, cc.b, cc.opacity)
            }

            //draw
            prog.draw(geoCanvas.getWebGLTransform())

            //draw in canvas geo
            geoCanvas.initCanvasTransform()
            ctx.drawImage(cvWGL.canvas, 0, 0)
        } else {
            for (let cell of cells) {
                //get color
                const col = this.color(cell, resolution, z, viewScale)
                if (!col || col === 'none') continue
                //set color
                ctx.fillStyle = col

                //number of dots
                const dotNumber = this.dotNumber(cell, resolution, z, viewScale)

                //get offset
                const offset = this.offset(cell, resolution, z)

                //draw random dots
                const cx = cell.x + offset.dx + resolution / 2,
                    cy = cell.y + offset.dy + resolution / 2
                for (let i = 0; i <= dotNumber; i++) {
                    ctx.fillRect(cx + rand(), cy + rand(), sGeo, sGeo)
                }
            }
        }

        //update legends
        this.updateLegends({ style: this, resolution: resolution, z: z, viewScale: viewScale })
    }
}

;// ./node_modules/gridviz/src/utils/WebGLSquareColoringCatAdvanced.js
//@ts-check


;


/**
 * Everything to easily draw colored squares with webGL.
 * All the same size, but different fill color.
 * Color based on categories.
 */
class WebGLSquareColoringCatAdvanced {
    /**
     * @param {Array.<string>} colors
     */
    constructor(colors) {
        /**
         * @type {Array.<string>} */
        this.colors = colors

        /** Vector shader program
         * @type {string} */
        this.vshString = `
        attribute vec2 pos;
        uniform float sizePix;
        uniform mat3 mat;

        attribute float i;
        varying float vi;

        void main() {
          gl_Position = vec4(mat * vec3(pos, 1.0), 1.0);
          gl_PointSize = sizePix;
          vi = i;
        }
        `

        //prepare fragment shader code
        //declare the uniform and other variables
        const out = []
        out.push('precision mediump float;\nvarying float vi;\n')
        //add color uniforms
        out.push('uniform vec4')
        for (let i = 0; i < colors.length; i++) {
            if (i > 0) out.push(',')
            out.push(' c' + i)
        }
        out.push(';\n')
        //start the main function
        out.push('void main(void) {\n')
        //choose color i
        for (let i = 0; i < colors.length; i++) {
            if (i > 0) out.push('else ')
            out.push('if(vi==')
            out.push(i)
            out.push('.0) gl_FragColor = vec4(c')
            out.push(i)
            out.push('[0], c')
            out.push(i)
            out.push('[1], c')
            out.push(i)
            out.push('[2], c')
            out.push(i)
            out.push('[3]);\n')
        }
        out.push('else gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);\n}')
        /** Fragment shader program
         * @type {string} */
        this.fshString = out.join('')
    }

    /**  */
    draw(gl, verticesBuffer, iBuffer, transfoMat, sizePix = 10) {
        /** @type {WebGLShader} */
        const vShader = createShader(gl, gl.VERTEX_SHADER, this.vshString)

        /** @type {WebGLShader} */
        const fShader = createShader(gl, gl.FRAGMENT_SHADER, this.fshString)

        /** @type {WebGLProgram} */
        const program = initShaderProgram(gl, vShader, fShader)
        gl.useProgram(program)

        //set uniforms

        //sizePix
        gl.uniform1f(gl.getUniformLocation(program, 'sizePix'), 1.0 * sizePix)

        //colors
        for (let i = 0; i < this.colors.length; i++) {
            const c = color(this.colors[i])
            gl.uniform4fv(gl.getUniformLocation(program, 'c' + i), [
                +c.r / 255.0,
                +c.g / 255.0,
                +c.b / 255.0,
                +c.opacity,
            ])
        }

        //vertice data
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verticesBuffer), gl.STATIC_DRAW)
        const position = gl.getAttribLocation(program, 'pos')
        gl.vertexAttribPointer(
            position,
            2, //numComponents
            gl.FLOAT, //type
            false, //normalise
            0, //stride
            0 //offset
        )
        gl.enableVertexAttribArray(position)

        //i data
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(iBuffer), gl.STATIC_DRAW)
        const i = gl.getAttribLocation(program, 'i')
        gl.vertexAttribPointer(i, 1, gl.FLOAT, false, 0, 0)
        gl.enableVertexAttribArray(i)

        //transformation
        gl.uniformMatrix3fv(gl.getUniformLocation(program, 'mat'), false, new Float32Array(transfoMat))

        // Enable the depth test
        //gl.enable(gl.DEPTH_TEST);
        // Clear the color buffer bit
        gl.clear(gl.COLOR_BUFFER_BIT)
        // Set the view port
        //gl.viewport(0, 0, cg.w, cg.h);

        gl.drawArrays(gl.POINTS, 0, verticesBuffer.length / 2)
    }
}

;// ./node_modules/gridviz/src/style/SquareColorCategoryWebGLStyle.js
//@ts-check


;



/**
 * Style based on webGL
 * To show cells as colored squares, from categories.
 * All cells are drawn as squares, with the same size
 *
 * @module style
 * @author Julien Gaffuri
 */
class SquareColorCategoryWebGLStyle_SquareColorCategoryWebGLStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /**
         * A function returning the category code of the cell, for coloring.
         * @type {function(import('../core/Dataset.js').Cell):string} */
        this.code = opts.code

        /**
         * The dictionary (code -> color) which gives the color of each category code.
         * @type {object} */
        opts.color = opts.color || undefined

        /** @type { Array.<string> } */
        const codes = Object.keys(opts.color)

        /** @type { object } @private */
        this.catToI = {}
        for (let i = 0; i < codes.length; i++) this.catToI[codes[i]] = i + ''

        /** @type { Array.<string> } @private */
        this.colors = []
        for (const code of codes) this.colors.push(opts.color['' + code])

        /**
         * A function returning the size of the cells, in geographical unit. All cells have the same size.
         * @type {function(number,number):number} */
        this.size = opts.size // (resolution, z) => ...

        /**
         * @private
         * @type { WebGLSquareColoringCatAdvanced } */
        this.wgp = new WebGLSquareColoringCatAdvanced(this.colors)
    }

    /**
     * @param {Array.<import("../core/Dataset.js").Cell>} cells
     * @param {import("../core/GeoCanvas.js").GeoCanvas} geoCanvas
     * @param {number} resolution
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z

        //add vertice and fragment data
        const r2 = resolution / 2
        let c,
            nb = cells.length
        const verticesBuffer = []
        const iBuffer = []
        for (let i = 0; i < nb; i++) {
            c = cells[i]
            const cat = this.code(c)
            if (cat == undefined) {
                console.log('Unexpected category: ' + cat)
                continue
            }
            /** @type {number} */
            const i_ = this.catToI[cat]
            if (isNaN(+i_)) {
                console.log('Unexpected category index: ' + cat + ' ' + i_)
                continue
            }
            verticesBuffer.push(c.x + r2, c.y + r2)
            iBuffer.push(+i_)
        }

        //create canvas and webgl renderer
        const cvWGL = makeWebGLCanvas(geoCanvas.w + '', geoCanvas.h + '')
        if (!cvWGL) {
            console.error('No webGL')
            return
        }

        //draw
        const sizeGeo = this.size ? this.size(resolution, z) : resolution + 0.2 * z
        this.wgp.draw(cvWGL.gl, verticesBuffer, iBuffer, geoCanvas.getWebGLTransform(), sizeGeo / z)

        //draw in canvas geo
        geoCanvas.initCanvasTransform()
        geoCanvas.offscreenCtx.drawImage(cvWGL.canvas, 0, 0)

        //update legends
        this.updateLegends({ style: this, resolution: resolution, z: z })
    }
}

;// ./node_modules/gridviz/src/style/TanakaStyle.js
//@ts-check


;



/**
 * @see https://manifold.net/doc/mfd9/example__tanaka_contours.htm
 *
 * @module style
 * @author Julien Gaffuri
 */
class TanakaStyle_TanakaStyle {
    /**
     * @param {function(import('../core/Dataset.js').Cell):number} value Function that returns the value of a cell
     * @param {Array.<number>} breaks The break values
     * @param {Array.<string>} colors The colors, one more than the break values
     * @param {object} opts
     * @returns {Array.<import("../core/Style").Style>}
     */
    static get(value, breaks, colors, opts = {}) {
        //shadow colors
        opts.colorDark = opts.colorDark || '#111'
        opts.colorBright = opts.colorBright || '#ddd'

        /** @type { function(number, number):number } */
        opts.width =
            opts.width ||
            ((sideValue, resolution, z) => {
                const minWG = 1 * z
                const maxWG = 4 * z
                const step = (maxWG - minWG) / 3
                return Math.min(minWG + (sideValue - 1) * step, maxWG)
            })

        //make classifier
        const classifier = clFun(breaks)
        //make colors table
        const colorsDict = {}
        for (let i = 0; i < colors.length; i++) colorsDict[i + ''] = colors[i]

        const cellStyle = new SquareColorCategoryWebGLStyle({
            code: (cell) => classifier(value(cell)),
            color: colorsDict,
        })

        const getSideValue = (side) => {
            const cl1 = side.c1 ? classifier(value(side.c1)) : -1
            const cl2 = side.c2 ? classifier(value(side.c2)) : -1
            return cl1 - cl2
        }

        /** The side style, for the shadow effect */
        const sideStyle = new SideStyle({
            //white or black, depending on orientation and value
            color: (side) => {
                const v = getSideValue(side)
                if (v === 0) return
                if (side.or === 'v') return v < 0 ? opts.colorBright : opts.colorDark
                return v < 0 ? opts.colorDark : opts.colorBright
            },
            //width depends on the value, that is the number of classes of difference
            width: (side, resolution, z) => opts.width(Math.abs(getSideValue(side)), resolution, z),
        })

        return [cellStyle, sideStyle]
    }
}

;// ./node_modules/gridviz/src/style/LegoStyle.js
//@ts-check


;




/**
 * @module style
 * @author Julien Gaffuri
 */
class LegoStyle {
    static get(value, breaks, colors, opts = {}) {
        opts = opts || {}

        //the colors
        //http://www.jennyscrayoncollection.com/2021/06/all-current-lego-colors.html
        //https://leonawicz.github.io/legocolors/reference/figures/README-plot-1.png
        /*opts.colors = opts.colors || [
            '#00852b', //darker green
            '#afd246', //light green
            '#fac80a', //dark yellow
            '#bb805a', //brown
            '#d67923', //mostard
            '#cb4e29', //redish
            '#b40000', //red
            '#720012', //dark red
            //"purple",
            //"#eee" //whithe
        ]*/

        opts.colDark = opts.colDark || '#333'
        opts.colBright = opts.colBright || '#aaa'
        opts.widthFactor = opts.widthFactor || 0.12

        //reuse tanaka as basis
        const ts = TanakaStyle.get(value, breaks, colors, opts)
        //style to show limits between pieces
        const sst = new StrokeStyle({
            strokeColor: () => '#666',
            strokeWidth: (c, r, z) => 0.2 * z,
            filter: opts.filter,
        })

        return [
            ts[0],
            sst,
            ts[1],
            new LegoTopStyle({ colDark: opts.colDark, colBright: opts.colBright, filter: opts.filter }),
        ]
    }

    /**
     * @param {function(import('../core/Dataset.js').Cell):string} code
     * @param {object} color
     * @param {object} opts
     * @returns {Array.<Style>}
     */
    static getCategory(code, color, opts) {
        opts = opts || {}

        opts.colDark = opts.colDark || '#333'
        opts.colBright = opts.colBright || '#aaa'

        //
        const s = new SquareColorCategoryWebGLStyle({ code: code, color: color })
        //style to show limits between pieces
        const sst = new StrokeStyle({ strokeColor: () => '#666', strokeWidth: (c, r, z) => 0.2 * z })

        return [s, sst, new LegoTopStyle({ colDark: opts.colDark, colBright: opts.colBright })]
    }
}

/**
 * A style to draw top circle of lego bricks.
 */
class LegoTopStyle extends Style {
    /** @param {object|undefined} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}
        this.colDark = opts.colDark || '#333'
        this.colBright = opts.colBright || '#aaa'
    }

    draw(cells, geoCanvas, r) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)
        const ctx = geoCanvas.offscreenCtx

        ctx.lineWidth = 0.6 * geoCanvas.view.z

        //dark part
        ctx.strokeStyle = this.colDark
        for (let c of cells) {
            ctx.beginPath()
            ctx.arc(c.x + r * 0.5, c.y + r * 0.5, r * 0.55 * 0.5, Math.PI / 4, -Math.PI * (3 / 4), true)
            ctx.stroke()
        }

        //bright part
        ctx.strokeStyle = this.colBright
        for (let c of cells) {
            ctx.beginPath()
            ctx.arc(c.x + r * 0.5, c.y + r * 0.5, r * 0.55 * 0.5, Math.PI / 4, -Math.PI * (3 / 4), false)
            ctx.stroke()
        }
    }
}

;// ./node_modules/gridviz/src/utils/WebGLSquareColoringAdvanced.js
//@ts-check


;


/**
 * Everything to easily draw colored squares with webGL.
 * All the same size, but different fill color.
 * The color interpolation is computed in the fragment shader program, by the GPU, thus it is less flexible but faster.
 */
class WebGLSquareColoringAdvanced {
    //see:
    //https://webglfundamentals.org/webgl/lessons/fr/webgl-shaders-and-glsl.html#les-uniforms-dans-les-shaders-de-vertex
    //https://thebookofshaders.com/glossary/?search=mix
    //https://thebookofshaders.com/06/
    //https://thebookofshaders.com/glossary/

    /**
     *
     * @param {*} gl
     * @param {Array.<String>} colors
     * @param {{fun:string,alpha:number}} stretching
     * @param {number} sizePix
     * @param {number|undefined} globalOpacity
     */
    constructor(gl, colors, stretching, sizePix = 10, globalOpacity = undefined) {
        /** @type {WebGLRenderingContext} */
        this.gl = gl
        //gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        //gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        /** @type {WebGLShader} */
        const vShader = createShader(
            gl,
            gl.VERTEX_SHADER,
            `
        attribute vec2 pos;
        uniform float sizePix;
        uniform mat3 mat;

        attribute float t;
        varying float vt;

        void main() {
          gl_Position = vec4(mat * vec3(pos, 1.0), 1.0);
          gl_PointSize = sizePix;
          vt = t;
        }
      `
        )

        //prepare fragment shader code
        //declare the uniform and other variables
        let fshString =
            '' +
            'precision mediump float;\n' +
            'varying float vt;\n' +
            'uniform float alpha;\n' +
            (() => {
                const out = []
                for (let i = 0; i < colors.length; i++) out.push('uniform vec4 c' + i + ';\n')
                return out.join('')
            })() +
            //start the main function, apply the stretching of t
            'void main(void) {\n'

        if (stretching) {
            if (stretching.fun == 'pow')
                //sPow = (t, alpha = 3) => Math.pow(t, alpha);
                fshString += '   float t = pow(vt, alpha);\n'
            else if (stretching.fun == 'powInv')
                //sPowRev = (t, alpha = 3) => 1 - Math.pow(1 - t, 1 / alpha);
                fshString += '   float t = 1.0-pow(1.0-vt, 1.0/alpha);\n'
            else if (stretching.fun == 'exp')
                //sExp = (t, alpha = 3) => alpha == 0 ? t : (Math.exp(t * alpha) - 1) / (Math.exp(alpha) - 1);
                fshString +=
                    stretching.alpha == 0
                        ? `float t = vt;`
                        : '   float t = (exp(vt * alpha) - 1.0) / (exp(alpha) - 1.0);\n'
            else if (stretching.fun == 'log')
                //sExpRev = (t, alpha = 3) => alpha == 0 ? t : 1 - (1 / alpha) * Math.log(Math.exp(alpha) * (1 - t) + t);
                fshString +=
                    stretching.alpha == 0
                        ? `float t = vt;`
                        : '   float t = 1.0 - (1.0 / alpha) * log(exp(alpha) * (1.0 - vt) + vt);\n'
            else if (stretching.fun == 'circle') {
                if (stretching.alpha == 0)
                    //if (alpha == 0) return t;
                    fshString += '   float t = vt;\n'
                else if (stretching.alpha == 1)
                    // if (alpha == 1) return Math.sqrt(2 * t - t * t);
                    fshString += '   float t = sqrt(vt * (2.0 - vt));\n'
                else {
                    //const a = alpha / (1 - alpha);
                    //return Math.sqrt(1 / (a * a) + t * (2 / a + 2 - t)) - 1 / a;
                    fshString +=
                        '   float a = alpha / (1.0 - alpha);\n' +
                        '   float t = sqrt(1.0 / (a * a) + vt * ( 2.0/a + 2.0 - vt )) - 1.0 / a;\n'
                }
            } else if (stretching.fun == 'circleInv') {
                // 1 - sCircleLow(1 - t, alpha)
                if (stretching.alpha == 0)
                    //if (alpha == 0) return t;
                    fshString += '   float t = vt;\n'
                else if (stretching.alpha == 1)
                    // if (alpha == 1) return Math.sqrt(2 * t - t * t);
                    fshString += '   float t = 1.0 - sqrt((1.0 - vt) * (1.0 + vt));\n'
                else {
                    //const a = alpha / (1 - alpha);
                    //return Math.sqrt(1 / (a * a) + (2 * t) / a + 2 * t - t * t) - 1 / a;
                    fshString +=
                        '   float a = alpha / (1.0 - alpha);\n' +
                        '   float t = 1.0 - sqrt(1.0 / (a * a) + (1.0-vt) * ( 2.0/a + 1.0 + vt )) + 1.0 / a;\n'
                }
            } else {
                console.error('Unexpected stretching function code: ' + stretching.fun)
                fshString += '   float t = vt;\n'
            }
        } else {
            fshString += '   float t = vt;\n'
        }

        //choose initial and final colors, and adjust t value
        if (colors.length == 1) fshString += '   vec4 cI=c0;\n   vec4 cF=c0;\n'
        else if (colors.length == 2) fshString += '   vec4 cI=c0;\n   vec4 cF=c1;\n'
        else {
            const nb = colors.length - 1
            const nbs = nb + '.0'
            fshString += '   vec4 cI;\n'
            fshString += '   vec4 cF;\n'
            fshString += '   if(t<1.0/' + nbs + ') { cI=c0; cF=c1; t=t*' + nbs + '; }\n'
            for (let i = 2; i < nb; i++)
                fshString +=
                    '   else if(t<' +
                    i +
                    '.0/' +
                    nbs +
                    ') { cI=c' +
                    (i - 1) +
                    '; cF=c' +
                    i +
                    '; t=' +
                    nbs +
                    '*t-' +
                    (i - 1) +
                    '.0; }\n'
            fshString +=
                '   else { cI=c' + (nb - 1) + '; cF=c' + nb + '; t=' + nbs + '*t-' + (nb - 1) + '.0; }\n'
        }

        //one single color
        if (colors.length == 1) fshString += '   gl_FragColor = vec4(c0[0], c0[1], c0[2], c0[3]);}\n'
        //set interpolated color, between initial and final one
        else fshString += '   gl_FragColor = mix(cI, cF, t);}\n'

        //console.log(fshString)

        /** @type {WebGLShader} */
        const fShader = createShader(gl, gl.FRAGMENT_SHADER, fshString)

        /** @type {WebGLProgram} */
        this.program = initShaderProgram(gl, vShader, fShader)
        gl.useProgram(this.program)

        //set uniforms

        //sizePix
        //TODO: bug here. Seems to be limited to some threshold value (around 250).
        gl.uniform1f(gl.getUniformLocation(this.program, 'sizePix'), 1.0 * sizePix)

        //stretching alpha factor
        gl.uniform1f(gl.getUniformLocation(this.program, 'alpha'), stretching ? 1.0 * stretching.alpha : 0.0)

        //colors
        for (let i = 0; i < colors.length; i++) {
            const c = color(colors[i])

            let opacity = c.opacity
            if (c.opacity == 1 && globalOpacity != undefined) opacity = globalOpacity

            gl.uniform4fv(gl.getUniformLocation(this.program, 'c' + i), [
                +c.r / 255.0,
                +c.g / 255.0,
                +c.b / 255.0,
                +opacity,
            ])
        }
    }

    /**  */
    draw(verticesBuffer, tBuffer, transfoMat) {
        const gl = this.gl
        const program = this.program

        //vertice data
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verticesBuffer), gl.STATIC_DRAW)
        const position = gl.getAttribLocation(program, 'pos')
        gl.vertexAttribPointer(
            position,
            2, //numComponents
            gl.FLOAT, //type
            false, //normalise
            0, //stride
            0 //offset
        )
        gl.enableVertexAttribArray(position)

        //t data
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tBuffer), gl.STATIC_DRAW)
        const t = gl.getAttribLocation(program, 't')
        gl.vertexAttribPointer(t, 1, gl.FLOAT, false, 0, 0)
        gl.enableVertexAttribArray(t)

        //transformation
        gl.uniformMatrix3fv(gl.getUniformLocation(program, 'mat'), false, new Float32Array(transfoMat))

        // Enable the depth test
        //gl.enable(gl.DEPTH_TEST);
        // Clear the color buffer bit
        gl.clear(gl.COLOR_BUFFER_BIT)
        // Set the view port
        //gl.viewport(0, 0, cg.w, cg.h);

        gl.drawArrays(gl.POINTS, 0, verticesBuffer.length / 2)
    }
}

;// ./node_modules/gridviz/src/style/SquareColorWebGLStyle.js
//@ts-check


;



/**
 * Style based on webGL
 * To show cells as colored squares, with computation of the colors on GPU side (faster than JavaScript side).
 * Alls squares with the same size
 *
 * @module style
 * @author Julien Gaffuri
 */
class SquareColorWebGLStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /**
         * A function returning a t value (within [0,1]) for a cell.
         * @type {function(import('../core/Dataset.js').Cell,number,number,object):number} */
        this.tFun = opts.tFun //(c,r,z,vs) => {}

        /**
         * Distribution stretching method.
         * The stretching is performed on GPU side (fragment shader).
         * @type {{ fun:string, alpha:number }} */
        this.stretching = opts.stretching

        /**
         * The sample of the color ramp.
         * The color is computed on GPU side (fragment shader) based on those values (linear interpolation).
         * @type {Array.<string>} */
        this.colors =
            opts.colors ||
            [
                'rgb(158, 1, 66)',
                'rgb(248, 142, 83)',
                'rgb(251, 248, 176)',
                'rgb(137, 207, 165)',
                'rgb(94, 79, 162)',
            ].reverse()
        if (opts.color)
            this.colors = [
                opts.color(0),
                opts.color(0.2),
                opts.color(0.4),
                opts.color(0.6),
                opts.color(0.8),
                opts.color(1),
            ]

        /**
         * Define the opacity of the style, within [0,1].
         * If this opacity is defined, the individual color opacity will be ignored.
         * @type {function(number,number):number} */
        this.opacity = opts.opacity // (r,z) => ...

        /**
         * A function returning the size of the cells, in geographical unit. All cells have the same size.
         * @type {function(number,number):number} */
        this.size = opts.size // (resolution, z) => ...
    }

    /**
     * @param {Array.<import("../core/Dataset.js").Cell>} cells
     * @param {import("../core/GeoCanvas.js").GeoCanvas} geoCanvas
     * @param {number} resolution
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z

        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        //create canvas and webgl renderer
        //for opacity control, see: https://webglfundamentals.org/webgl/lessons/webgl-and-alpha.html
        const cvWGL = makeWebGLCanvas(
            geoCanvas.w + '',
            geoCanvas.h + '',
            this.opacity != undefined ? { premultipliedAlpha: false } : undefined
        )
        if (!cvWGL) {
            console.error('No webGL')
            return
        }

        //add vertice and fragment data
        const r2 = resolution / 2
        const verticesBuffer = []
        const tBuffer = []
        for (let cell of cells) {
            const t = this.tFun(cell, resolution, z, viewScale)
            if (t == null || t == undefined) continue
            verticesBuffer.push(cell.x + r2, cell.y + r2)
            tBuffer.push(t > 1 ? 1 : t < 0 ? 0 : t)
        }

        //compute pixel size
        const sizeGeo = this.size ? this.size(resolution, z) : resolution + 0.2 * z

        //compute opacity
        const op = this.opacity ? this.opacity(resolution, z) : undefined

        //
        const wgp = new WebGLSquareColoringAdvanced(cvWGL.gl, this.colors, this.stretching, sizeGeo / z, op)

        //draw
        wgp.draw(verticesBuffer, tBuffer, geoCanvas.getWebGLTransform())

        // draw in canvas geo
        // NOTE: drawing each tile this way is very inefficient. WebGL is best used with fewer, heavier/larger draw calls.
        geoCanvas.initCanvasTransform()
        geoCanvas.offscreenCtx.drawImage(cvWGL.canvas, 0, 0)

        //update legends
        this.updateLegends({ style: this, resolution: resolution, z: z, viewScale: viewScale })
    }
}

;// ./node_modules/gridviz/src/style/MosaicStyle.js
//@ts-check


;

/**
 * @module style
 * @author Julien Gaffuri
 */
class MosaicStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** A function returning the color of the cell.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):string} */
        this.color = opts.color || (() => '#EA6BAC') //(c,r,z,vs) => {}

        /** The mosaic factor, within [0,0.5]. Set to 0 for no mosaic effect. Set to 0.5 for strong mosaic effect.
         * @type {number} */
        this.mosaicFactor = opts.mosaicFactor || 0.15

        /** The mosaic shadow factor, within [0,0.5]. Set to 0 for no mosaic shadow. Set to 0.5 for strong mosaic shadow.
         * @type {number} */
        this.shadowFactor = opts.shadowFactor || 0.2

        /** The mosaic shadow color.
         * @type {string} */
        this.shadowColor = opts.shadowColor || '#555'
    }

    /**
     *
     * @param {Array.<import("../core/Dataset").Cell>} cells
     * @param {import("../core/GeoCanvas").GeoCanvas} geoCanvas
     * @param {number} resolution
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        //set stroke style, for shadow
        ctx.strokeStyle = this.shadowColor
        ctx.lineWidth = this.shadowFactor * resolution
        ctx.lineJoin = 'round'
        ctx.lineCap = 'butt'

        //function to compute position mosaic effect
        const d = resolution * this.mosaicFactor
        const mosaic = () => {
            return { x: Math.random() * d, y: Math.random() * d }
        }

        for (let cell of cells) {
            //set fill color
            const col = this.color ? this.color(cell, resolution, z, viewScale) : undefined
            if (!col || col === 'none') continue
            ctx.fillStyle = col

            //get offset
            const offset = this.offset(cell, resolution, z)

            //compute position mosaic effect
            const ll = mosaic(),
                ul = mosaic(),
                lr = mosaic(),
                ur = mosaic()

            //stroke
            if (this.shadowFactor > 0) {
                ctx.beginPath()
                ctx.moveTo(cell.x + offset.dx + ll.x, cell.y + offset.dy + ll.y)
                ctx.lineTo(cell.x + offset.dx + resolution - lr.x, cell.y + offset.dy + lr.y)
                ctx.lineTo(cell.x + offset.dx + resolution - ur.x, cell.y + offset.dy + resolution - ur.y)
                ctx.stroke()
            }

            //fill

            ctx.beginPath()
            ctx.moveTo(cell.x + offset.dx + ll.x, cell.y + offset.dy + ll.y)
            ctx.lineTo(cell.x + offset.dx + resolution - lr.x, cell.y + offset.dy + lr.y)
            ctx.lineTo(cell.x + offset.dx + resolution - ur.x, cell.y + offset.dy + resolution - ur.y)
            ctx.lineTo(cell.x + offset.dx + ul.x, cell.y + offset.dy + resolution - ul.y)
            ctx.fill()
        }

        //update legends
        this.updateLegends({ style: this, resolution: resolution, z: z, viewScale: viewScale })
    }
}

;// ./node_modules/gridviz/src/style/NinjaStarStyle.js
//@ts-check


;

/**
 * @module style
 * @author Joseph Davies, Julien Gaffuri
 */
class NinjaStarStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** A function returning the color of the cell.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):string} */
        this.color = opts.color || (() => '#EA6BAC') //(c,r,z,vs) => {}

        /** A function returning the size of a cell, within [0,1]:
         *  - 0, nothing shown
         *  - 1, entire square
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):number} */
        this.size = opts.size || ((cell, resolution) => resolution) //(c,r,z,vs) => {}

        /** A function returning the shape.
         * @type {function(import("../core/Dataset").Cell):string} */
        this.shape = opts.shape || (() => 'o')
    }

    /**
     *
     * @param {Array.<import('../core/Dataset.js').Cell>} cells
     * @param {import("../core/GeoCanvas").GeoCanvas} geoCanvas
     * @param {number} resolution
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        const r2 = resolution * 0.5
        for (let cell of cells) {
            //color
            const col = this.color ? this.color(cell, resolution, z, viewScale) : undefined
            if (!col || col === 'none') continue
            ctx.fillStyle = col

            //size - in geo unit
            let k = this.size(cell, resolution, z, viewScale)
            k = k < 0 ? 0 : k > 1 ? 1 : k
            const sG2 = k * r2

            //shape
            const shape = this.shape ? this.shape(cell) : 'o'
            if (shape === 'none') continue

            //get offset
            //TODO use
            //const offset = this.offset(cell, r, z)

            //center position
            const cx = cell.x + r2
            const cy = cell.y + r2

            if (shape === 'p') {
                ctx.beginPath()
                ctx.moveTo(cx, cy + r2)
                ctx.lineTo(cx + sG2, cy + sG2)
                ctx.lineTo(cx + r2, cy)
                ctx.lineTo(cx + sG2, cy - sG2)
                ctx.lineTo(cx, cy - r2)
                ctx.lineTo(cx - sG2, cy - sG2)
                ctx.lineTo(cx - r2, cy)
                ctx.lineTo(cx - sG2, cy + sG2)
                ctx.fill()
            } else if (shape === 'o') {
                ctx.beginPath()
                ctx.moveTo(cx, cy + sG2)
                ctx.lineTo(cx + r2, cy + r2)
                ctx.lineTo(cx + sG2, cy)
                ctx.lineTo(cx + r2, cy - r2)
                ctx.lineTo(cx, cy - sG2)
                ctx.lineTo(cx - r2, cy - r2)
                ctx.lineTo(cx - sG2, cy)
                ctx.lineTo(cx - r2, cy + r2)
                ctx.fill()
            } else {
                throw new Error('Unexpected shape:' + shape)
            }
        }

        //update legends
        this.updateLegends({ style: this, resolution: resolution, z: z, viewScale: viewScale })
    }
}

;// ./node_modules/gridviz/src/style/TimeSeriesStyle.js
//@ts-check


;

/** @typedef {"first"|"bottom"|"center"|"top"|"last"} AnchorModeYEnum */

/**
 * Show cell as timeseries chart
 * Can be used for sparkline map of https://datagistips.hypotheses.org/488
 *
 * @module style
 * @author Julien Gaffuri
 */
class TimeSeriesStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** The columns of the time series, ordered in chronological order.
         * @type {Array.<string>} */
        this.ts = opts.ts

        /** A function specifying when a value should be considered as "no data" and thus not ignored. The line will have a break at these values.
         * @type {function(string):boolean} */
        this.noData = opts.noData || ((v) => v === undefined || v == '' || v === null || isNaN(+v))

        //x
        /** in geo unit
         * @type {function(import("../core/Dataset.js").Cell,number,number):number} */
        this.offsetX = opts.offsetX || ((c, r, z) => 0)
        /** @type {function(import("../core/Dataset.js").Cell,number,number):number} */
        this.width = opts.width || ((c, r, z) => r)

        //y
        /** in geo unit
         * @type {function(import("../core/Dataset.js").Cell,number,number):number} */
        this.offsetY = opts.offsetY || ((c, r, z) => 0)
        /** @type {function(import("../core/Dataset.js").Cell,number,number):number} */
        this.height = opts.height || ((c, r, z) => r)
        /** @type {function(import("../core/Dataset.js").Cell,number,number):AnchorModeYEnum} */
        this.anchorModeY = opts.anchorModeY || ((c, r, z) => 'center')

        /** A function returning the width of the line, in geo unit
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):number} */
        this.lineWidth = opts.lineWidth || ((v, r, s, z) => 1.5 * z)

        /** A function returning the color of the chart.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):string} */
        this.color = opts.color || (() => 'black') //(c,r,z,vs) => {}
    }

    /**
     * Draw cells as text.
     *
     * @param {Array.<import("../core/Dataset.js").Cell>} cells
     * @param {import("../core/GeoCanvas.js").GeoCanvas} geoCanvas
     * @param {number} resolution
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        //compute cell amplitude
        const getAmplitude = (c) => {
            let min, max
            for (let t of this.ts) {
                const val = c[t]
                if (val == undefined) continue
                if (min == undefined || val < min) min = val
                if (max == undefined || val > max) max = val
            }
            if (min == undefined) return undefined
            return max - min
        }

        //compute max amplitude
        let ampMax
        for (let c of cells) {
            const amp = getAmplitude(c)
            if (amp == undefined) continue
            if (ampMax == undefined || amp > ampMax) ampMax = amp
        }
        if (!ampMax) return

        const nb = this.ts.length

        ctx.lineCap = 'butt'
        for (let c of cells) {
            //line width
            /** @type {number|undefined} */
            const wG = this.lineWidth ? this.lineWidth(c, resolution, z, viewScale) : undefined
            if (!wG || wG < 0) continue

            //line color
            /** @type {string|undefined} */
            const col = this.color ? this.color(c, resolution, z, viewScale) : undefined
            if (!col) continue

            //x
            const offX = this.offsetX ? this.offsetX(c, resolution, z) : 0
            if (offX == undefined || isNaN(offX)) continue
            const w = this.width ? this.width(c, resolution, z) : resolution
            if (w == undefined || isNaN(w)) continue

            //y
            const offY = this.offsetY ? this.offsetY(c, resolution, z) : 0
            if (offY == undefined || isNaN(offY)) continue
            const h = this.height ? this.height(c, resolution, z) : resolution
            if (h == undefined || isNaN(h)) continue
            const anchY = this.anchorModeY ? this.anchorModeY(c, resolution, z) : 'center'
            if (!anchY) continue

            ctx.lineWidth = wG
            ctx.strokeStyle = col

            //compute anchor Y figures
            let val0, y0
            if (anchY === 'first') {
                //get first value
                val0 = c[this.ts[0]]
                y0 = 0
            } else if (anchY === 'last') {
                //get last value
                val0 = c[this.ts[this.ts.length - 1]]
                y0 = 0
            } else if (anchY === 'bottom') {
                //get min
                for (let t of this.ts) {
                    const val = +c[t]
                    if (val == undefined) continue
                    if (val0 == undefined || val < val0) val0 = val
                }
                y0 = 0
            } else if (anchY === 'top') {
                //get max
                for (let t of this.ts) {
                    const val = +c[t]
                    if (val == undefined) continue
                    if (val0 == undefined || val > val0) val0 = val
                }
                y0 = resolution
            } else if (anchY === 'center') {
                //get min and max
                let min, max
                for (let t of this.ts) {
                    const val = c[t]
                    if (val == undefined) continue
                    if (min == undefined || val < min) min = val
                    if (max == undefined || val > max) max = val
                }
                val0 = (+max + +min) * 0.5
                y0 = resolution / 2
            } else {
                console.log('Unexpected anchorModeY: ' + anchY)
                continue
            }

            /*/draw line
            if (val0 == undefined || isNaN(val0)) continue
            cg.ctx.beginPath()
            const sX = w / (nb - 1)
            for (let i = 0; i < nb; i++) {
                const val = c[this.ts[i]]
                if (val == undefined || isNaN(val)) break
                if (i == 0)
                    cg.ctx.moveTo(c.x + i * sX + offX, c.y + y0 + (val - val0) * h / ampMax + offY)
                else
                    cg.ctx.lineTo(c.x + i * sX + offX, c.y + y0 + (val - val0) * h / ampMax + offY)
            }
            cg.ctx.stroke()*/

            //draw line, segment by segment
            const sX = w / (nb - 1)

            //handle first point
            let v0 = c[this.ts[0]]
            if (!this.noData(v0)) {
                ctx.beginPath()
                ctx.moveTo(c.x + offX, c.y + y0 + ((v0 - val0) * h) / ampMax + offY)
            }
            //console.log(v0, isNaN(v0))

            let v1
            for (let i = 1; i < nb; i++) {
                v1 = c[this.ts[i]]

                //draw segment from v0 to v1

                //both points 'no data'
                if (this.noData(v0) && this.noData(v1)) {
                    //second point 'no data'
                } else if (!this.noData(v0) && this.noData(v1)) {
                    ctx.stroke()

                    //first point 'no data'
                } else if (this.noData(v0) && !this.noData(v1)) {
                    ctx.beginPath()
                    ctx.moveTo(c.x + i * sX + offX, c.y + y0 + ((v1 - val0) * h) / ampMax + offY)

                    //both points have data: trace line
                } else {
                    ctx.lineTo(c.x + i * sX + offX, c.y + y0 + ((v1 - val0) * h) / ampMax + offY)
                    //if it is the last point, stroke
                    if (i == nb - 1) ctx.stroke()
                }
                v0 = v1
            }
        }

        //update legend, if any
        this.updateLegends({ style: this, resolution: resolution, z: z, viewScale: viewScale })
    }
}

;// ./node_modules/gridviz/src/style/IsoFenceStyle.js
//@ts-check


;


/** @typedef {{x:number,y:number,or:"v"|"h",c1:import('../core/Dataset.js').Cell|undefined,c2:import('../core/Dataset.js').Cell|undefined}} Side */

/**
 * @module style
 * @author Julien Gaffuri
 */
class IsoFenceStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /**
         * The dictionary (string -> color) which give the color of each category.
         * @type {object} */
        this.color = opts.color

        /** A function returning the height of a cell in geographical unit.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):number} */
        this.height = opts.height || ((cell, resolution, z, viewScale) => resolution * 0.4)

        /** The perspective angle, in degree, within [-180,180], from [O,x] axis.
         * @type {number} */
        this.angle = opts.angle != undefined ? opts.angle : 50

        /** A function returning the corner line stroke style.
         * @type {function(import('../core/Dataset.js').Cell,number,number,number):string} */
        this.cornerLineStrokeColor = opts.cornerLineStrokeColor || ((c, r, z, angle) => '#999')

        /** A function returning the corner line width.
         * @type {function(import('../core/Dataset.js').Cell,number,number,number):number} */
        this.cornerLineWidth = opts.cornerLineWidth || ((c, r, z, angle) => (angle % 90 == 0 ? 0 : 0.8 * z))

        /**
         * Show vertical cross-sections.
         * @type {boolean} */
        this.sVert = opts.sVert != undefined ? opts.sVert : true

        /**
         * Show horizontal cross-sections.
         * @type {boolean} */
        this.sHor = opts.sHor != undefined ? opts.sHor : true
    }

    /**
     * @param {Array.<import("../core/Dataset.js").Cell>} cells
     * @param {import("../core/GeoCanvas.js").GeoCanvas} geoCanvas
     * @param {number} resolution
     * @override
     */
    draw(cells, geoCanvas, resolution) {
        //filter
        if (this.filter) cells = cells.filter(this.filter)

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        //nb categories - used for radar and agepyramid
        const cats = Object.keys(this.color)

        //half resolution
        const r2 = resolution / 2

        //get offset
        // @ts-ignore
        const offset = this.offset(undefined, resolution, z),
            dx = offset.dx,
            dy = offset.dy

        //make sides
        /**  @type {Array.<Side>} */
        const sides = SideStyle_SideStyle.buildSides(
            cells,
            resolution,
            this.angle % 180 != 90 && this.sVert,
            this.angle % 180 != 0 && this.sHor
        )

        //
        if (sides.length == 0) return

        //angle in radians
        const aRad = (this.angle * Math.PI) / 180,
            cos = Math.cos(aRad),
            sin = Math.sin(aRad)

        //sort sides so that the back ones are drawn first. This depends on the angle.
        //depending on distance to the reference corner point
        const xCorner = Math.abs(this.angle) < 90 ? geoCanvas.extGeo.xMin : geoCanvas.extGeo.xMax
        const yCorner = this.angle < 0 ? geoCanvas.extGeo.yMax : geoCanvas.extGeo.yMin
        sides.sort(
            (s1, s2) =>
                Math.hypot(s2.x - xCorner, s2.y - yCorner) - Math.hypot(s1.x - xCorner, s1.y - yCorner)
        )

        //prepare function to draw corner line for a cell *c*
        const drawCornerLine = (cell) => {
            if (!cell) return
            //line style
            const lw = this.cornerLineWidth ? this.cornerLineWidth(cell, resolution, z, this.angle) : 0.8 * z
            if (lw == 0) return
            ctx.strokeStyle = this.cornerLineStrokeColor
                ? this.cornerLineStrokeColor(cell, resolution, z, this.angle)
                : '#333'
            ctx.lineWidth = lw

            //height - in geo
            const hG = this.height(cell, resolution, z, viewScale)

            //draw line
            ctx.beginPath()
            ctx.moveTo(cell.x + r2 + dx, cell.y + r2 + dy)
            ctx.lineTo(cell.x + r2 + hG * cos + dx, cell.y + r2 + hG * sin + dy)
            ctx.stroke()
        }

        //draw sides
        ctx.lineCap = 'round'
        for (let side of sides) {
            const c1 = side.c1,
                c2 = side.c2,
                x = side.x,
                y = side.y

            //heights - in geo
            const hG1 = c1 ? this.height(c1, resolution, z, viewScale) : 0,
                hG2 = c2 ? this.height(c2, resolution, z, viewScale) : 0

            //compute totals for both cells
            const total1 = computeTotal(c1, cats),
                total2 = computeTotal(c2, cats)
            if (total1 == 0 && total2 == 0) continue

            let cumul1 = 0,
                cumul2 = 0
            for (let [column, color] of Object.entries(this.color)) {
                //draw stripe of side s and category column

                //get values for both cells
                let v1 = c1 ? +c1[column] : 0
                let v2 = c2 ? +c2[column] : 0
                if (v1 == 0 && v2 == 0) continue

                //compute heights
                const h1 = (hG1 * cumul1) / total1 || 0
                const h1n = (hG1 * (cumul1 + v1)) / total1 || 0
                const h2 = (hG2 * cumul2) / total2 || 0
                const h2n = (hG2 * (cumul2 + v2)) / total2 || 0

                //make path
                ctx.beginPath()
                if (side.or == 'h') {
                    //horizontal side - vertical section
                    //bottom left
                    ctx.moveTo(x + h1 * cos + dx, y - r2 + h1 * sin + dy)
                    //top left
                    ctx.lineTo(x + h2 * cos + dx, y + r2 + h2 * sin + dy)
                    //top right
                    ctx.lineTo(x + h2n * cos + dx, y + r2 + h2n * sin + dy)
                    //bottom right
                    ctx.lineTo(x + h1n * cos + dx, y - r2 + h1n * sin + dy)
                } else {
                    //vertical side - horizontal section
                    //bottom left
                    ctx.moveTo(x - r2 + h1 * cos + dx, y + h1 * sin + dy)
                    //bottom right
                    ctx.lineTo(x + r2 + h2 * cos + dx, y + h2 * sin + dy)
                    //top right
                    ctx.lineTo(x + r2 + h2n * cos + dx, y + h2n * sin + dy)
                    //top left
                    ctx.lineTo(x - r2 + h1n * cos + dx, y + h1n * sin + dy)
                }
                //cg.ctx.closePath()

                //fill
                ctx.fillStyle = color
                ctx.fill()

                cumul1 += v1
                cumul2 += v2

                //TODO draw only one line
                //draw corner line
                //if (side.or == "h") {
                drawCornerLine(c1)
                drawCornerLine(c2)
                //if (this.angle > 0 && side.or == "h") drawCornerLine(c2)
                //else drawCornerLine(c2)
                //}
            }
        }

        //update legends
        this.updateLegends({ style: this, resolution: resolution, z: z, viewScale: viewScale })
    }
}

const computeTotal = (cell, categories) => {
    if (!cell) return 0
    let total = 0
    for (let column of categories) {
        const v = cell[column]
        if (!v) continue
        total += +v
    }
    return total || 0
}

;// ./node_modules/gridviz/src/style/ImageStyle.js
//@ts-check


;

/**
 * @module style
 * @author Julien Gaffuri
 */
class ImageStyle extends Style {
    /** @param {object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** A function returning the image URL of a cell.
         * @type {function(import('../core/Dataset.js').Cell, number, number, object):string} */
        this.image = opts.image || (() => '') //(c,r,z,vs) => {}

        /** The image size in ground meters
         *  @type {function(import('../core/Dataset.js').Cell, number, number, object):number}        */
        this.size = opts.size || ((cell, resolution) => resolution)

        /** Dictionnary of preloaded images. url -> image
         * @private
         * @type {object} */
        this.cache = {}
    }

    /**
     * @param {Array.<import("../core/Dataset.js").Cell>} cells
     * @param {import("../core/GeoCanvas.js").GeoCanvas} geoCanvas
     * @param {number} resolution
     * @override
     */
    async draw(cells, geoCanvas, resolution) {
        //
        const z = geoCanvas.view.z,
            resolutionPix = resolution / z

        //get view scale
        const viewScale = this.viewScale ? this.viewScale(cells, resolution, z) : undefined

        //draw in screen coordinates
        geoCanvas.initCanvasTransform()

        //
        for (let cell of cells) {
            //get cell image url
            const url = this.image(cell, resolution, z, viewScale)
            if (!url) continue

            //size and position values
            let sizePix = this.size(cell, resolution, z, viewScale) / z
            if (!sizePix) continue

            //get image from cache
            const image = this.cache[url]

            //loading, keep waiting
            if (image == 'loading') return
            //no image: load it
            else if (!image) {
                //tag as loading
                this.cache[url] = 'loading'

                //define image
                const img = new Image()
                img.onload = () => {
                    //store image data in cache and redraw
                    this.cache[url] = img
                    geoCanvas.redraw()
                }
                img.onerror = () => {
                    //case when no image
                    console.warn('Could not retrieve image from', url)
                }
                //set URL to launch the download
                img.src = url
            } else {
                //draw image
                const d = (resolutionPix - sizePix) / 2
                try {
                    geoCanvas.offscreenCtx.drawImage(
                        image,
                        geoCanvas.geoToPixX(cell.x) + d,
                        geoCanvas.geoToPixY(cell.y) + d - resolutionPix,
                        sizePix,
                        sizePix
                    )
                } catch (error) {
                    console.error(error)
                }
            }
        }

        //update legends
        this.updateLegends({ style: this, resolution: resolution, z: z, viewScale: viewScale })
    }
}

;// ./node_modules/gridviz/src/core/Layer.js
//@ts-check


;

/**
 * @module core
 * @abstract
 * @author Joseph Davies, Julien Gaffuri
 */
class Layer extends Drawable {
    /**
     * Draw layer.
     *
     * @param {import("./GeoCanvas").GeoCanvas} geoCanvas The canvas where to draw the layer.
     * @param {object} legend
     * @returns {void}
     * @abstract
     */
    draw(geoCanvas, legend = undefined) {
        throw new Error('Method draw not implemented.')
    }
}

;// ./node_modules/gridviz/src/layer/GridLayer.js
//@ts-check


;

/**
 * A layer, which specifies a dataset to be shown with specified styles.
 *
 * @module layer
 * @author Joseph Davies, Julien Gaffuri
 */
class GridLayer extends Layer {
    /**
     * @param {import("../core/Dataset").Dataset|import("../core/MultiResolutionDataset").MultiResolutionDataset} dataset The dataset to show.
     * @param {Array.<import("../core/Style").Style>} styles The styles, ordered in drawing order.
     * @param {{visible?:function(number):boolean,alpha?:function(number):number,blendOperation?:function(number):GlobalCompositeOperation,minPixelsPerCell?:number,cellInfoHTML?:function(import("../core/Dataset").Cell):string}} opts
     */
    constructor(dataset, styles, opts = {}) {
        super(opts)
        opts = opts || {}

        /** @type {import("../core/Dataset").Dataset|import("../core/MultiResolutionDataset").MultiResolutionDataset} */
        this.dataset = dataset

        /** @type {Array.<import("../core/Style").Style>} */
        this.styles = styles

        /**
         * This parameter is used when the dataset is a MultiResolutionDataset.
         * It defines the minimum number of pixels a grid cell should have to select the dataset to display based on its resolution.
         * A low value, means that the map will be more detailled (smaller cells).
         * A high value, means that the map will be less detailled (larger cells).
         * This value should be higher than 1, otherwise it means a grid cell is smaller than the screen resolution.
         * For more complex cell representations that require some more map space, this value should be higher.
         * @type {number} */
        this.minPixelsPerCell = opts.minPixelsPerCell || 3

        /**
         * The function returning cell information as HTML.
         * This is typically used for tooltip information.
         * @type {function(import("../core/Dataset").Cell, number):string} */
        this.cellInfoHTML = opts.cellInfoHTML || GridLayer.defaultCellInfoHTML
    }

    /** */
    draw(geoCanvas, legend) {
        //get zoom level
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        //get layer dataset component
        /** @type {import('../core/Dataset.js').Dataset|undefined} */
        const dsc = this.getDataset(z)
        if (!dsc) return

        //launch data download, if necessary
        dsc.getData(geoCanvas.extGeo)

        //update dataset view cache
        dsc.updateViewCache(geoCanvas.extGeo)

        //draw cells, style by style
        for (const s of this.styles) {
            //check if style is visible
            if (s.visible && !s.visible(z)) continue

            //set style alpha and blend mode
            //TODO: multiply by layer alpha ?
            ctx.globalAlpha = s.alpha ? s.alpha(z) : 1.0
            if (s.blendOperation) ctx.globalCompositeOperation = s.blendOperation(z)

            //set affin transform to draw with geographical coordinates
            geoCanvas.setCanvasTransform()

            //draw with style
            s.draw(dsc.getViewCache(), geoCanvas, dsc.getResolution())

            //draw style filter
            if (s.filterColor) s.drawFilter(geoCanvas)
        }

        //add legend element
        if (legend) {
            for (const s of this.styles) {
                //check if style is visible
                if (s.visible && !s.visible(z)) continue
                GridLayer.addLegends(legend, s.legends)

                //case for styles of styles, like kernel smoothing
                //TODO do better
                if (s['styles']) {
                    for (const s2 of s['styles']) {
                        if (s2.visible && !s2.visible(z)) continue
                        GridLayer.addLegends(legend, s2.legends)
                    }
                }
            }
        }
    }

    /** @private */
    static addLegends(legendComp, lg) {
        if (Array.isArray(lg)) for (const lg_ of lg) this.addLegends(legendComp, lg_)
        else legendComp.node().append(lg.div.node())
    }

    /**
     * Return the relevant dataset component for a specified zoom.
     *
     * @param {number} z
     * @returns {import("../core/Dataset").Dataset|undefined}
     * */
    getDataset(z) {
        return this.dataset.getDataset(z, this.minPixelsPerCell)
    }

    /**
     * Set/get style stack.
     *
     * @param {undefined|import("../core/Style").Style|Array.<import("../core/Style").Style>} styles
     * @returns { this | Array.<import("../core/Style").Style> }
     */
    styles_(styles) {
        if (arguments.length === 0) return this.styles
        if (arguments.length === 1)
            if (Array.isArray(styles)) this.styles = styles
            else this.styles = [styles]
        else this.styles = arguments
        return this
    }

    /**
     * The default function returning cell information as HTML.
     * This is typically used for tooltip information.
     *
     * @param {import("../core/Dataset").Cell} cell
     * @returns {string}
     */
    static defaultCellInfoHTML(cell) {
        const buf = []
        for (const key of Object.keys(cell)) {
            if (key === 'x') continue
            if (key === 'y') continue
            buf.push('<b>', key, '</b>', ' : ', cell[key], '<br>')
        }
        return buf.join('')
    }
}

;// ./node_modules/gridviz/src/layer/BackgroundLayer.js
//@ts-check


;

/**
 *
 * A map background layer in "Slippy map" XYZ standard.
 * See https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
 * https://www.maptiler.com/google-maps-coordinates-tile-bounds-projection/#6/27.88/44.48
 *
 * @module layer
 * @author Julien Gaffuri
 */
class BackgroundLayer extends Layer {
    /**
     * @param {object} opts
     */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** The image cache, indexed by z/y/x
         * @private */
        this.cache = {}

        /**
         * @type {string} */
        this.url = opts.url
        /** @type {function(number,number,number):string} */
        this.urlFun = opts.urlFun || ((x, y, z) => this.url + z + '/' + x + '/' + y + '.png')

        /** The ground resolutions of the zoom levels, starting from the smallest (most zoomed-out, usually 0) to the largest (most zoomed-in).
         * Usually divided by 2 for each zoom level increment.
         * @type {Array.<number>} */
        this.resolutions = opts.resolutions
        if (!this.resolutions || this.resolutions.length == 0)
            throw new Error('No resolutions provided for background layer')

        /** The tile size, in number of pixels
         * @type {number} */
        this.nbPix = opts.nbPix || 256

        /** CRS coordinates of top left corner of the top left tile, the one with code /0/0.png.
         * @type {Array.<number>} */
        this.origin = opts.origin || [0, 0]

        /** The code of the smallest (most zoomed-out) zoom level, in case it is not 0.
         * @type {number} */
        this.z0 = opts.z0 || 0

        /** A coefficient to adjust the backgroun resolution with the screen resolution.
         *  If the background images are too pixelised, reduce the value.
         *  If there are too many images to download, increase the value.
         *  Default value is 1.0
         * @type {number} */
        this.pixelationCoefficient = opts.pixelationCoefficient || 1.0
    }

    /**
     * Get z/x/y cache data.
     * @param {number} z
     * @param {number} x
     * @param {number} y
     * @returns {HTMLImageElement|string|undefined}
     * @private
     */
    get(z, x, y) {
        let d = this.cache[z]
        if (!d) return
        d = d[x]
        if (!d) return
        return d[y]
    }

    /**
     * Put image in cache.
     * @param {HTMLImageElement|string} img
     * @param {number} z
     * @param {number} x
     * @param {number} y
     * @returns
     * @private
     */
    put(img, z, x, y) {
        if (!this.cache[z]) this.cache[z] = {}
        if (!this.cache[z][x]) this.cache[z][x] = {}
        this.cache[z][x][y] = img
    }

    /**
     * @param {import("../core/GeoCanvas").GeoCanvas} geoCanvas The canvas where to draw the layer.
     * @returns {void}
     */
    draw(geoCanvas) {
        if (!this.resolutions || this.resolutions.length == 0) {
            console.error('No resolutions provided for background layer')
            return
        }

        //
        const z = geoCanvas.view.z
        const x0 = this.origin[0], y0 = this.origin[1]

        //get zoom level and resolution
        let z_ = 0
        for (z_ = 0; z_ < this.resolutions.length; z_++) if (this.resolutions[z_] < z * this.pixelationCoefficient) break
        z_ -= 1
        z_ = Math.max(0, z_)
        z_ = Math.min(z_, this.resolutions.length - 1)
        const res = this.resolutions[z_]
        z_ += this.z0

        const sizeG = this.nbPix * res
        const size = sizeG / z

        //get tile numbers
        const xGeoToTMS = (x) => Math.ceil((x - x0) / sizeG)
        const yGeoToTMS = (y) => Math.ceil(-(y - y0) / sizeG)
        const xMin = xGeoToTMS(geoCanvas.extGeo.xMin) - 1
        const xMax = xGeoToTMS(geoCanvas.extGeo.xMax)
        const yMax = yGeoToTMS(geoCanvas.extGeo.yMin)
        const yMin = yGeoToTMS(geoCanvas.extGeo.yMax) - 1

        //handle images
        for (let x = xMin; x < xMax; x++) {
            for (let y = yMin; y < yMax; y++) {
                //get image
                let img = this.get(z_, x, y)

                //no image: load image from URL
                if (!img) {
                    const img = new Image()
                    this.put(img, z_, x, y)
                    img.onload = () => {
                        geoCanvas.redraw()
                    }
                    img.onerror = () => {
                        //case when no image
                        this.put('failed', z_, x, y)
                    }
                    img.src = this.urlFun(x, y, z_)
                    continue
                }

                //case when no image available
                if (img === 'failed') continue
                if (!(img instanceof HTMLImageElement)) {
                    console.log(img)
                    continue
                }
                if (img.width == 0 || img.height == 0) continue

                //draw image
                const xGeo = x0 + x * sizeG
                const yGeo = y0 - y * sizeG
                try {
                    geoCanvas.initCanvasTransform()
                    geoCanvas.offscreenCtx.drawImage(
                        img,
                        geoCanvas.geoToPixX(xGeo),
                        geoCanvas.geoToPixY(yGeo),
                        size,
                        size
                    )
                    //cg.ctx.drawImage(img, xGeo, yGeo, sizeG, -sizeG)
                } catch (error) {
                    console.error(error)
                }
            }
        }
    }
}

;// ./node_modules/gridviz/src/layer/BackgroundLayerWMS.js
//@ts-check


;

/**
 *
 * A map WMS background layer.
 *
 * @module layer
 * @author Julien Gaffuri
 */
class BackgroundLayerWMS extends Layer {
    /**
     * @param {object} opts
     */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /**
         * @type {string} */
        this.url = opts.url

        /** @type {HTMLImageElement|undefined} */
        this.img = undefined

        /** @type {number|undefined} */
        this.xMin = undefined
        /** @type {number|undefined} */
        this.xMax = undefined
        /** @type {number|undefined} */
        this.yMin = undefined
        /** @type {number|undefined} */
        this.yMax = undefined
    }

    /** Check if the view has moved and a new image needs to be retrieved.
     * @private */
    hasMoved(extGeo) {
        if (extGeo.xMin != this.xMin) return true
        else if (extGeo.xMax != this.xMax) return true
        else if (extGeo.yMin != this.yMin) return true
        else if (extGeo.yMax != this.yMax) return true
        else return false
    }

    /**
     * @param {import("../core/GeoCanvas").GeoCanvas} geoCanvas The canvas where to draw the layer.
     * @returns {void}
     */
    draw(geoCanvas) {
        //update map extent
        geoCanvas.updateExtentGeo(0)

        if (!this.hasMoved(geoCanvas.extGeo) && this.img) {
            //the map did not move and the image was already downloaded: draw the image
            geoCanvas.initCanvasTransform()
            geoCanvas.offscreenCtx.drawImage(this.img, 0, 0, geoCanvas.w, geoCanvas.h)
        } else {
            //the map moved: retrieve new image

            //
            this.xMin = geoCanvas.extGeo.xMin
            this.xMax = geoCanvas.extGeo.xMax
            this.yMin = geoCanvas.extGeo.yMin
            this.yMax = geoCanvas.extGeo.yMax

            //build WMS URL
            const url = []
            url.push(this.url)
            url.push('&width=')
            url.push(geoCanvas.w)
            url.push('&height=')
            url.push(geoCanvas.h)
            //bbox: xmin ymin xmax ymax
            url.push('&bbox=')
            url.push(geoCanvas.extGeo.xMin)
            url.push(',')
            url.push(geoCanvas.extGeo.yMin)
            url.push(',')
            url.push(geoCanvas.extGeo.xMax)
            url.push(',')
            url.push(geoCanvas.extGeo.yMax)

            const urlS = url.join('')
            //console.log(urlS)

            if (!this.img) {
                this.img = new Image()
                this.img.onload = () => {
                    geoCanvas.redraw()
                }
                this.img.onerror = () => {
                    //case when no image
                    console.warn('Could not retrieve WMS background image from', urlS)
                }
            }

            //set URL to launch the download
            this.img.src = urlS
        }
    }
}

;// ./node_modules/gridviz/src/layer/BackgroundLayerImage.js
//@ts-check


;

/**
 *
 * A map background layer composed of a single image file, geolocated.
 *
 * @module layer
 * @author Julien Gaffuri
 */
class BackgroundLayerImage extends Layer {
    /**
     * @param {object} opts
     */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** The image file URL
         * @type {string} */
        this.url = opts.url

        /** The image left coordinate
         * @type {number} */
        this.xMin = opts.xMin || 0
        /** The image top coordinate
         *  @type {number} */
        this.yMax = opts.yMax || 0

        /** The image width, in geo unit
         * @type {number} */
        this.width = opts.width || 20000
        /** The image height, in geo unit
         * @type {number} */
        this.height = opts.height || 20000

        /** The image object
         * @type {HTMLImageElement|undefined} */
        this.img = undefined
    }

    /**
     * @param {import("../core/GeoCanvas.js").GeoCanvas} geoCanvas The canvas where to draw the layer.
     * @returns {void}
     */
    draw(geoCanvas) {
        //update map extent
        //geoCanvas.updateExtentGeo(0)

        if (this.img) {
            //the image was already downloaded: draw it

            //compute screen coordinates and size ratio
            const x = geoCanvas.geoToPixX(this.xMin)
            const y = geoCanvas.geoToPixY(this.yMax)
            const z = geoCanvas.getView().z

            //draw image
            geoCanvas.initCanvasTransform()
            geoCanvas.offscreenCtx.drawImage(this.img, x, y, this.width / z, this.height / z)
        } else {
            //retrieve image

            if (!this.img) {
                this.img = new Image()
                this.img.onload = () => {
                    geoCanvas.redraw()
                }
                this.img.onerror = () => {
                    //case when no image
                    console.warn('Could not retrieve background image from', this.url)
                }
            }

            //set URL to launch the download
            this.img.src = this.url
        }
    }
}

;// ./node_modules/gridviz/src/layer/LabelLayer.js
//@ts-check


;


/** A label. The name is the text to show. (x,y) are the coordinates in the same CRS as the grid.
 * @typedef {{name: string, x:number, y:number }} Label */

/**
 * A (generic) layer for placename labels, to be shown on top of the grid layers.
 * The input is a CSV file with the position (x, y) of the labels and name + some other info on the label importance.
 * If the label data is not in the expected format or in the same CRS as the grid, it can be corrected with the "preprocess" function.
 * The selection of the label, their style (font, weight, etc.) and color can be specified depending on their importance and the zoom level.
 *
 * @module layer
 * @author Joseph Davies, Julien Gaffuri
 */
class LabelLayer extends Layer {
    /**
     * @param {object} opts
     */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /**
         * The URL of the label data, as CSV file.
         * The file should contain the information for each label such as the text, the position and other information for the display of the label according to the zoom level.
         * If necessary, this data can be reformated with the 'preprocess' parameter.
         * @private
         * @type {string} */
        this.url = opts.url

        /** Specify if and how a label should be drawn, depending on its importance and the zoom level.
         * @private
         * @type {function(Label,number):string} */
        this.style = opts.style || (() => '1.2em Arial')

        /** Specify the label color, depending on its importance and the zoom level.
         * @private
         * @type {function(Label,number):string} */
        this.color = opts.color || (opts.dark ? () => 'white' : () => 'black')

        /** Specify the label halo color, depending on its importance and the zoom level.
         * @private
         * @type {function(Label,number):string} */
        this.haloColor = opts.haloColor || (opts.dark ? () => 'black' : () => 'white')

        /** Specify the label halo width, depending on its importance and the zoom level.
         * @private
         * @type {function(Label,number):number} */
        this.haloWidth = opts.haloWidth || (() => 2.5)

        /** The anchor where to draw the text, from label position. See HTML-canvas textAlign property.
         * "left" || "right" || "center" || "start" || "end"
         * @private
         * @type {CanvasTextAlign} */
        this.textAlign = opts.textAlign || 'start'

        /**
         * @private
         * @type {Array.<number>} */
        this.offsetPix = opts.offsetPix || [5, 5]

        /**
         * A preprocess to run on each label after loading.
         * It can be used to apply some specific treatment before, format the label data, project coordinates, etc.
         * Return false if the label should not be kept.
         * @private
         * @type {function(Label):boolean} */
        this.preprocess = opts.preprocess

        /**
         * @private
         * @type {Array.<Label> | undefined} */
        this.labels = undefined

        /**
         * @private
         * @type {string} */
        this.loadingStatus = 'notLoaded'
    }

    /**
     * Draw the label layer.
     *
     * @param {import("../core/GeoCanvas").GeoCanvas} geoCanvas The canvas where to draw the layer.
     * @returns {void}
     */
    draw(geoCanvas) {
        //load labels, if not done yet.
        if (!this.labels) {
            this.load(geoCanvas.redraw)
            return
        }

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        //text align
        ctx.textAlign = this.textAlign || 'start'

        //line join and cap
        ctx.lineJoin = 'bevel' //|| "round" || "miter";
        ctx.lineCap = 'butt' //|| "round" || "square";

        //draw in pix coordinates
        geoCanvas.initCanvasTransform()

        //draw labels, one by one
        for (const lb of this.labels) {
            //get label style
            const st = this.style(lb, z)
            if (!st) continue
            ctx.font = st

            //check label within the view, to be drawn
            if (!geoCanvas.toDraw(lb)) continue

            //position
            const xP = geoCanvas.geoToPixX(lb.x) + this.offsetPix[0]
            const yP = geoCanvas.geoToPixY(lb.y) - this.offsetPix[1]

            //label stroke, for the halo
            if (this.haloColor && this.haloWidth) {
                const hc = this.haloColor(lb, z)
                const hw = this.haloWidth(lb, z)
                if (hc && hw && hw > 0) {
                    ctx.strokeStyle = hc
                    ctx.lineWidth = hw
                    ctx.strokeText(lb.name, xP, yP)
                }
            }

            //label fill
            if (this.color) {
                const col = this.color(lb, z)
                if (col) {
                    ctx.fillStyle = col
                    ctx.fillText(lb.name, xP, yP)
                }
            }
        }
    }

    /**
     * Load data for labels, from URL this.url
     * @param {function():void} callback
     * @private
     */
    async load(callback) {
        if (!this.url) {
            console.log('Failed loading labels: No URL specified. ' + this.url)
            this.loadingStatus = 'failed'
            this.labels = []
            return
        }

        //check if data already loaded
        if (this.loadingStatus != 'notLoaded') return

        //load data
        this.loadingStatus = 'loading'

        try {
            /** @type { Array.<Label> } */
            const data = await dsv_csv(this.url)

            //preprocess/filter
            if (this.preprocess) {
                this.labels = []
                for (const c of data) {
                    const b = this.preprocess(c)
                    if (b == false) continue
                    this.labels.push(c)
                }
            } else {
                //store labels
                this.labels = data
            }

            this.loadingStatus = 'loaded'

            //redraw
            if (callback) callback()
        } catch (error) {
            console.log('Failed loading labels from ' + this.url)
            this.labels = []
            this.loadingStatus = 'failed'
        }
    }
}

;// ./node_modules/gridviz/src/layer/GeoJSONLayer.js
//@ts-check


;


/**
 * @module layer
 * @author Joseph Davies, Julien Gaffuri
 */
class GeoJSONLayer extends Layer {
    /**
     * @param {object} opts
     */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /**
         * @private
         * @type {string} */
        this.url = opts.url

        /**
         * A preprocess to run on each feature after loading.
         * It can be used to apply some specific treatment before, format the label data, project coordinates, etc.
         * Return false if the label should not be kept.
         * @private
         * @type {function(object):boolean} */
        this.preprocess = opts.preprocess

        //for points
        /**
         * @private
         * @type {function(object,number):string} */
        this.shape = opts.shape || ((f, z) => 'circle')
        /**
         * In pixel
         * @private
         * @type {function(object,number):number} */
        this.size = opts.size || ((f, z) => 10)
        /**
         * @private
         * @type {function(object,number):string} */
        this.strokeStyle = opts.strokeStyle || ((f, z) => 'red')
        /**
         * @private
         * @type {function(object,number):string} */
        this.fillStyle = opts.fillStyle || ((f, z) => 'black')
        /**
         * In pixel
         * @private
         * @type {function(object,number):number} */
        this.lineWidth = opts.lineWidth || ((f, z) => 2)

        //for lines

        /**
         * @private
         * @type {function(object,number):string} */
        this.color = opts.color || ((f, z) => 'gray')
        /**
         * In pixel
         * @private
         * @type {function(object,number):number} */
        this.width = opts.width || ((f, z) => 2)
        /**
         * @private
         * @type {function(object,number):Array.<number>|undefined} */
        this.lineDash = opts.lineDash || ((f, z) => undefined)

        /**
         * @private
         * @type {Array.<object> | undefined} */
        this.fs = undefined

        /**
         * @private
         * @type {string} */
        this.loadingStatus = 'notLoaded'
    }

    /**
     * Draw the layer.
     * @param {import("../core/GeoCanvas.js").GeoCanvas} geoCanvas The canvas where to draw the layer.
     * @returns {void}
     */
    draw(geoCanvas) {
        //load data, if not done yet.
        if (!this.fs) {
            this.load(geoCanvas.redraw)
            return
        }

        //
        const z = geoCanvas.view.z
        const ctx = geoCanvas.offscreenCtx

        for (const f of this.fs) {
            const gt = f.geometry.type

            if (gt == 'Point') {
                const c = f.geometry.coordinates

                //get style parameters for the point feature
                const shape = this.shape(f, z)
                if (!shape || shape == 'none') continue
                const size = this.size(f, z) * z
                if (!size) continue
                const strokeStyle = this.strokeStyle(f, z)
                const fillStyle = this.fillStyle(f, z)
                const lineWidth = this.lineWidth(f, z) * z

                //set canvas drawing parameters
                if (strokeStyle) ctx.strokeStyle = strokeStyle
                if (fillStyle) ctx.fillStyle = fillStyle
                if (lineWidth) ctx.lineWidth = lineWidth

                if (shape == 'circle') {
                    //draw circle - fill and stroke
                    ctx.beginPath()
                    ctx.arc(c[0], c[1], size / 2, 0, 2 * Math.PI, false)
                    if (fillStyle) ctx.fill()
                    if (strokeStyle && lineWidth) ctx.stroke()
                } else if (shape == 'square') {
                    //draw square - fill and stroke
                    ctx.beginPath()
                    ctx.rect(c[0] - size / 2, c[1] - size / 2, size, size)
                    if (fillStyle) ctx.fill()
                    if (strokeStyle && lineWidth) ctx.stroke()
                } else {
                    console.error('Unexpected shape for point geojson: ' + shape)
                }
            } else if (gt == 'LineString') {
                const cs = f.geometry.coordinates
                if (cs.length < 2) continue

                //set color
                const col = this.color(f, z)
                if (!col || col == 'none') continue
                ctx.strokeStyle = col

                //set linewidth
                const wP = this.width(f, z)
                if (!wP || wP < 0) continue
                ctx.lineWidth = wP * z

                //set line dash
                const ldP = this.lineDash(f, z)
                if (ldP) ctx.setLineDash(ldP)

                //draw line
                ctx.beginPath()
                ctx.moveTo(cs[0][0], cs[0][1])
                for (let i = 1; i < cs.length; i++) ctx.lineTo(cs[i][0], cs[i][1])
                ctx.stroke()
            } else {
                console.log('Unsupported geometry type in GeoJSONLayer: ' + gt)
            }
        }

        //...
        ctx.setLineDash([])
    }

    /**
     * Load data for labels, from URL this.url
     * @param {function():void} callback
     * @private
     */
    async load(callback) {
        if (!this.url) {
            console.log('Failed loading boundaries: No URL specified. ' + this.url)
            this.loadingStatus = 'failed'
            this.labels = []
            return
        }

        //check if data already loaded
        if (this.loadingStatus != 'notLoaded') return

        //load data
        this.loadingStatus = 'loading'

        try {
            const data_ = await json(this.url)

            /** @type { Array.<object> } */
            const data = data_.features

            //preprocess/filter
            if (this.preprocess) {
                this.fs = []
                for (const c of data) {
                    const b = this.preprocess(c)
                    if (b == false) continue
                    this.fs.push(c)
                }
            } else {
                //store labels
                this.fs = data
            }

            this.loadingStatus = 'loaded'

            //redraw
            if (callback) callback()
        } catch (error) {
            console.log('Failed loading boundaries from ' + this.url)
            this.fs = []
            this.loadingStatus = 'failed'
        }
    }
}

;// ./node_modules/gridviz/src/core/Legend.js
//@ts-check


;

/**
 * A legend container.
 *
 * @module core
 * @author Joseph Davies, Julien Gaffuri
 */
class Legend {
    /**
     * @param {Object} opts
     */
    constructor(opts) {
        opts = opts || {}

        /** @type {string} */
        this.id = opts.id

        //TODO stop using it. Use style method below instead.

        /** @type {number} @deprecated */
        this.top = opts.top
        /** @type {number} @deprecated */
        this.bottom = opts.bottom
        /** @type {number} @deprecated */
        this.left = opts.left
        /** @type {number} @deprecated */
        this.right = opts.right
        /** @type {string} @deprecated */
        this.background = opts.background || 'none'
        /** @type {string} @deprecated */
        this.padding = opts.padding || '5px'
        /** @type {string} @deprecated */
        this.border = opts.border || '0px'
        /** @type {string} @deprecated */
        this['border-radius'] = opts['border-radius'] || 'none'
        /** @type {string} @deprecated */
        this['box-shadow'] = opts['box-shadow'] || 'none'
        /** @type {string} @deprecated */
        this['font-family'] = opts['font-family'] || 'Helvetica, Arial, sans-serif'
        /** @type {string} @deprecated */
        //this.width = opts.width
        /** @type {string} @deprecated */
        //this.height = opts.height

        //the div element
        if (this.id) this.div = src_select('#' + this.id)

        if (!this.div || this.div.empty()) {
            this.div = src_select(document.createElement('div'))
            if (this.id) this.div.attr('id', this.id)
        }

        //set style
        this.div.style('background', this.background)
        this.div.style('padding', this.padding)
        this.div.style('border', this.border)
        this.div.style('border-radius', this['border-radius'])
        this.div.style('box-shadow', this['box-shadow'])
        this.div.style('font-family', this['font-family'])

        //if (this.width) this.div.style('width', this.width)
        //if (this.height) this.div.style('height', this.height)

        //title
        this.title = opts.title
        this.titleFontSize = opts.titleFontSize || '0.8em'
        this.titleFontWeight = opts.titleFontWeight || 'bold'

        //label
        this.labelFontSize = opts.labelFontSize || '0.8em'
        this.labelUnitText = opts.labelUnitText || ''
        this.labelFormat = opts.labelFormat
    }

    makeTitle() {
        if (!this.title) return
        this.div
            .append('div')
            .style('font-size', this.titleFontSize)
            .style('font-weight', this.titleFontWeight)
            .style('margin-bottom', '7px')
            .text(this.title)
    }

    /**
     * Apply a style to the legend div.
     * @param {string} k
     * @param {string} v
     * @returns {this|string}
     */
    style(k, v) {
        if (arguments.length == 1) return this.div.style(k)
        this.div.style(k, v)
        return this
    }

    /**
     * @param {Object} opts
     * @abstract
     */
    update(opts = {}) {
        console.error('Legend update not implemented yet.')
    }
}

;// ./node_modules/gridviz/src/legend/ColorLegend.js
//@ts-check


;

/**
 * A legend element for continuous color style.
 * Inspiration: https://observablehq.com/@d3/color-legend
 *
 * @module legend
 * @author Joseph Davies, Julien Gaffuri
 */
class ColorLegend extends Legend {
    /** @param {Object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        //a function [0,1]->color for continuous colors.
        //it can take as second argument the viewscale.
        this.colorScale = opts.colorScale

        //function (t[0,1]) -> value (for label text)
        //it can take as second argument the viewscale.
        this.textScale = opts.textScale || ((t) => t)

        this.margin = opts.margin || 5

        //replace with labels ?
        this.tickSize = opts.tickSize || 6
        this.ticks = opts.ticks || Math.floor(this.width / 50)
        this.tickFormat = opts.tickFormat
        this.tickUnit = opts.tickUnit

        this.fontSize = opts.fontSize || '0.8em'
        this.invert = opts.invert

        this.width = opts.width || 300
        this.height = opts.height || 15
    }

    /**
     * @param {{viewScale:import('../core/Style').ViewScale} } opts
     */
    update(opts) {
        //clear
        this.div.selectAll('*').remove()

        //title
        this.makeTitle()

        const svgW = this.width + 2 * this.margin
        const svgH = this.height + this.margin + this.tickSize + 10
        const svg = this.div.append('svg').attr('width', svgW).attr('height', svgH)
        //  <rect width="300" height="100" style="fill:rgb(0,0,255);stroke-width:3;stroke:rgb(0,0,0)" />

        const g = svg.append('g').attr('transform', 'translate(' + this.margin + ' ' + 0 + ')')

        //draw color bar
        const w = this.width,
            h = this.height
        const step = 5
        for (let i = 0; i < w; i += step) {
            let t = i / (w - 1)
            if (this.invert) t = 1 - t
            g.append('rect')
                .attr('x', i)
                .attr('y', 0)
                .attr('width', step)
                .attr('height', h)
                .style('fill', this.colorScale(t, opts.viewScale))
        }

        for (let i = 0; i < this.ticks; i++) {
            let t = i / (this.ticks - 1)

            //tick line
            g.append('line')
                .attr('x1', w * t)
                .attr('y1', 0)
                .attr('x2', w * t)
                .attr('y2', h + this.tickSize)
                .style('stroke', 'black')

            //prepare tick label
            g.append('text')
                .attr('id', 'ticklabel_' + i)
                .attr('x', w * t)
                .attr('y', h + this.tickSize + 2)
                .style('font-size', this.fontSize)
                //.style("font-weight", "bold")
                //.style("font-family", "Arial")
                .style('text-anchor', i == 0 ? 'start' : i == this.ticks - 1 ? 'end' : 'middle')
                .style('alignment-baseline', 'top')
                .style('dominant-baseline', 'hanging')
                .style('pointer-events', 'none')
            //.text("-")
        }

        //update tick labels

        //label text format
        const f = this.tickFormat && this.tickFormat != 'text' ? this.tickFormat : (v) => v
        for (let i = 0; i < this.ticks; i++) {
            let t = i / (this.ticks - 1)

            const v = this.textScale(t, opts.viewScale)
            const text = (v ? f(v) : '0') + (this.tickUnit ? this.tickUnit : '')
            if (text == undefined) continue

            //tick label
            this.div.select('#' + 'ticklabel_' + i).text(text)
        }
    }
}

;// ./node_modules/gridviz/src/legend/ColorDiscreteLegend.js
//@ts-check


;

/**
 * A legend element for discrete color style.
 * Inspiration: https://observablehq.com/@d3/color-legend
 *
 * @module legend
 * @author Julien Gaffuri
 */
class ColorDiscreteLegend extends Legend {
    /** @param {Object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** @private @type {function(import('../core/Style').ViewScale):Array.<string>} */
        this.colors = opts.colors
        /** @private @type {function(import('../core/Style').ViewScale):Array.<number>} */
        this.breaks = opts.breaks

        this.width = opts.width || 300
        this.height = opts.height || 15

        this.tickSize = opts.tickSize || 3

        //label
        this.invert = opts.invert
    }

    /**
     * @param {{viewScale:import('../core/Style').ViewScale} } opts
     */
    update(opts) {
        //clear
        this.div.selectAll('*').remove()

        //title
        this.makeTitle()

        //get colors and breaks
        const colors = this.colors(opts.viewScale)
        const breaks = this.breaks(opts.viewScale)
        if (!breaks) return

        //classes
        const nb = colors.length
        if (nb == 0) return
        const w = this.width / nb

        //make svg element
        const svg = this.div
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height + this.tickSize + 2 + 10)

        //draw graphic elements
        for (let i = 0; i < nb; i++) {
            svg.append('rect')
                .attr('x', i * w)
                .attr('y', 0)
                .attr('width', w)
                .attr('height', this.height)
                .style('fill', colors[i])
        }

        //tick line
        for (let i = 1; i < nb; i++) {
            svg.append('line')
                .attr('x1', w * i)
                .attr('y1', 0)
                .attr('x2', w * i)
                .attr('y2', this.height + this.tickSize)
                .style('stroke', 'black')
        }

        //labels
        for (let i = 1; i < nb; i++) {
            let label = breaks[i - 1]
            if (isNaN(label) || label == undefined) continue
            if (this.labelFormat) label = this.labelFormat(label, i)

            //label
            svg.append('text')
                .attr('id', 'ticklabel_' + i)
                .attr('x', w * i)
                .attr('y', this.height + this.tickSize + 2)
                .style('font-size', this.labelFontSize)
                //.style("font-weight", "bold")
                //.style("font-family", "Arial")
                .style('text-anchor', 'middle')
                .style('alignment-baseline', 'top')
                .style('dominant-baseline', 'hanging')
                .style('pointer-events', 'none')
                .text(label)
        }
    }
}

;// ./node_modules/gridviz/src/legend/ColorCategoryLegend.js
//@ts-check


;

/**
 * A legend element for color categrories.
 *
 * @module legend
 * @author Joseph Davies, Julien Gaffuri
 */
class ColorCategoryLegend extends Legend {
    /** @param {Object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        //col/categories array, in display order
        /**
         * @private
         * @type {Array.<[string,string]>} */
        this.colorLabel = opts.colorLabel || [['gray', '-']]

        /**
         * @private
         * @type {import("../core/Style.js").Shape} */
        this.shape = opts.shape || 'circle'
        this.dimension = opts.dimension || { r: 8 }
        this.strokeColor = opts.strokeColor || 'gray'
        this.strokeWidth = opts.strokeWidth || 1
    }

    /**
     */
    update() {
        //clear
        this.div.selectAll('*').remove()

        //title
        this.makeTitle()

        //categories
        const nb = this.colorLabel.length
        if (nb == 0) return

        for (let i = 0; i < nb; i++) {
            const cat = this.colorLabel[i]

            //make div for category
            const d = this.div.append('div')
            //to enable vertical centering
            //.style("position", "relative")

            const sw = this.strokeWidth

            //draw graphic element: box / circle
            if (this.shape === 'square') {
                const h = this.dimension.h || 15
                const w = this.dimension.w || 20
                d.append('div')
                    .style('display', 'inline')

                    .append('svg')
                    .attr('width', w + 2 * sw)
                    .attr('height', h + 2 * sw)

                    .append('rect')
                    .attr('x', sw)
                    .attr('y', sw)
                    .attr('width', w)
                    .attr('height', h)
                    .style('fill', cat[0])
                    .style('stroke', this.strokeColor)
                    .style('stroke-width', this.strokeWidth)
            } else if (this.shape === 'circle') {
                const r = this.dimension.r || 8
                const h = 2 * r + 2 * sw
                d.append('div')
                    .style('display', 'inline')

                    .append('svg')
                    .attr('width', h)
                    .attr('height', h)

                    .append('circle')
                    .attr('cx', r + sw)
                    .attr('cy', r + sw)
                    .attr('r', r)
                    .style('fill', cat[0])
                    .style('stroke', this.strokeColor)
                    .style('stroke-width', this.strokeWidth)
            } else {
                throw new Error('Unexpected shape:' + this.shape)
            }

            //write label text
            d.append('div')
                //show on right of graphic
                .style('display', 'inline')

                //center vertically
                //.style("position", "absolute").style("top", "0").style("bottom", "0")

                .style('padding-left', '5px')
                .style('font-size', this.labelFontSize)
                .text(cat[1])
        }
    }
}

;// ./node_modules/gridviz/src/legend/SizeLegend.js
//@ts-check


;



/**
 * A legend element for proportional symbols.
 *
 * @module legend
 * @author Joseph Davies, Julien Gaffuri
 */
class SizeLegend extends Legend {
    /** @param {Object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        /** A function returning the text label, from the view scale and list of cells, resolution and zoom
         *  @type { function(object, Array.<import('../core/Dataset.js').Cell>, number, number):(number|string) } */
        this.label = opts.label || undefined

        /** A function returning the size of the legend symbol, in geo UoM, from the viewscale, resolution and zoom
         *  @type { function(object, number, number):number } */
        this.size = opts.size || undefined

        //symbol
        /**  @type {(import("../core/Style").Shape)|"line"} */
        this.shape = opts.shape || 'circle'

        //general case
        this.fillColor = opts.fillColor || 'none'
        this.strokeColor = opts.strokeColor || 'gray'
        this.strokeWidth = opts.strokeWidth || 1

        //for line shape
        //TODO this.orientation = opts.orientation || 0
        this.color = opts.color || 'gray'
        this.length = opts.length || ((resolution, z, viewScale) => resolution)
    }

    /**
     * @param {{ viewScale:object, resolution: number, z:number, cells:Array.<import('../core/Dataset.js').Cell> }} opts
     */
    update(opts) {
        //clear
        this.div.selectAll('*').remove()

        //title
        this.makeTitle()

        //get label. May not be a number (!)
        let label = this.label(opts.viewScale, opts.cells, opts.resolution, opts.z)

        //compute size of symbol, in pix
        let sizePix
        if (this.size) sizePix = this.size(opts.viewScale, opts.resolution, opts.z) / opts.z
        else sizePix = opts.viewScale(+label) / opts.z
        if (!sizePix) return

        //format label, if specified and possible
        if (this.labelFormat && !isNaN(+label)) label = this.labelFormat(label)

        const d = this.div.append('div')
        //to enable vertical centering
        //.style("position", "relative")

        //default svg construction, for square and circle
        const svg = () =>
            d
                .append('svg')
                .attr('width', sizePix + this.strokeWidth + 2)
                .attr('height', sizePix + this.strokeWidth + 2)
                .style('', 'inline-block')

        if (this.shape === 'square') {
            svg()
                .append('rect')
                .attr('x', 0)
                .attr('y', 0)
                .attr('width', sizePix)
                .attr('height', sizePix)
                .style('fill', this.fillColor)
                .style('stroke', this.strokeColor)
                .style('stroke-width', this.strokeWidth)
        } else if (this.shape === 'circle') {
            // <circle cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" />
            const r = (sizePix + this.strokeWidth) * 0.5
            svg()
                .append('circle')
                .attr('cx', r + 1)
                .attr('cy', r + 1)
                .attr('r', r)
                .style('fill', this.fillColor)
                .style('stroke', this.strokeColor)
                .style('stroke-width', this.strokeWidth)
        } else if (this.shape === 'donut') {
            //TODO
        } else if (this.shape === 'diamond') {
            //TODO
        } else if (this.shape === 'line') {
            //get segment length
            let lengthPix = this.length
                ? this.length(opts.resolution, opts.z, opts.viewScale)
                : opts.resolution
            lengthPix /= opts.z

            const svg = d
                .append('svg')
                .attr('width', lengthPix)
                .attr('height', sizePix)
                .style('', 'inline-block')

            //TODO orientation
            //<line x1="0" y1="0" x2="200" y2="200" style="stroke:rgb(255,0,0);stroke-width:2" />
            svg.append('line')
                .attr('x1', 0)
                .attr('y1', sizePix / 2)
                .attr('x2', lengthPix)
                .attr('y2', sizePix / 2)
                .style('stroke', this.color)
                .style('stroke-width', sizePix)
        } else {
            throw new Error('Unexpected shape:' + this.shape)
        }

        //label
        d.append('div')
            .style('display', 'inline')
            .style('padding-left', '5px')
            .style('font-size', this.labelFontSize)
            .text(label + (this.labelUnitText ? ' ' : '') + this.labelUnitText)
    }
}

/**
 * @param {Array.<number>} values
 * @param {function(number):number} size
 * @param { object } opts
 * @returns {Array.<SizeLegend>}
 */
function sizeLegend(values, size, opts = {}) {
    const legends = []
    for (let value of values) {
        opts.title = value == values[0] ? opts.title : undefined
        opts.size = () => size(value)
        opts.label = () => value
        legends.push(new SizeLegend(opts))
    }
    return legends
}

/**
 * @param { function(import('../core/Dataset.js').Cell):number } value
 * @param {*} opts
 * @returns {Array.<SizeLegend>}
 */
function sizeLegendViewScale(value, opts = {}) {
    const k = opts.k || [0.9, 0.5, 0.2, 0.05]
    const legends = []
    for (let k_ of k) {
        opts.title = k_ == k[0] ? opts.title : undefined
        opts.label = (viewScale, cells) => nice(k_ * max(cells, value))
        legends.push(new SizeLegend(opts))
    }
    return legends
}

/**
 * A function which return a stack of size legends for a discrete classification.
 *
 * @param { Array.<number> } breaks
 * @param { Array.<number> } sizes
 * @param { object } opts
 * @returns {Array.<SizeLegend>}
 */
function sizeDiscreteLegend(breaks, sizes, opts = {}) {
    const f = opts.labelFormat || ((x) => x)
    const labelText = opts.labelText || defaultLabelText(f)
    const legends = []
    for (let i = sizes.length - 1; i >= 0; i--) {
        opts.title = i == sizes.length - 1 ? opts.title : undefined
        opts.size = () => sizes[i]
        opts.label = () => labelText(breaks[i - 1], breaks[i])
        legends.push(new SizeLegend(opts))
    }
    return legends
}

/**
 * A function which return a stack of size legends for a discrete classification using a viewscale.
 * @param { number } classNumber
 * @param { object } opts
 * @returns {Array.<SizeLegend>}
 */
function sizeDiscreteViewScaleLegend(classNumber, opts = {}) {
    const f = opts.labelFormat || ((x) => x)
    const labelText = opts.labelText || defaultLabelText(f)
    const legends = []
    const viewScaleFun = opts.viewScaleFun || ((t) => t) //TODO do it differently? At sizelegend level !
    for (let i = classNumber - 1; i >= 0; i--) {
        opts.title = i == classNumber - 1 ? opts.title : undefined
        opts.size = (viewScale) => viewScaleFun(viewScale).values[i]
        opts.label = (viewScale) =>
            labelText(viewScaleFun(viewScale).breaks[i - 1], viewScaleFun(viewScale).breaks[i])
        legends.push(new SizeLegend(opts))
    }
    return legends
}

/**
 * A function that returns a function to format laberls for discrete scale legends.
 * @param { function(number):string } format
 * @returns { function(number|undefined, number|undefined): string }
 */
function defaultLabelText(format) {
    return (v0, v1) => {
        if (v0 == undefined && v1 == undefined) return ''
        if (v1 == undefined) return '> ' + format(v0)
        if (v0 == undefined) return '< ' + format(v1)
        return format(v0) + ' - ' + format(v1)
    }
}

;// ./node_modules/gridviz/src/legend/OrientationLegend.js
//@ts-check


;

/**
 * A legend element for segment orientation.
 *
 * @module legend
 * @author Joseph Davies, Julien Gaffuri
 */
class OrientationLegend extends Legend {
    /** @param {Object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        //orientation
        this.orientation = opts.orientation || 0
        //color
        this.color = opts.color || ((resolution, z, viewScale) => 'gray')
        //width
        this.width = opts.width || ((resolution, z, viewScale) => 3 * z)
        //length
        this.length = opts.length || ((resolution, z, viewScale) => resolution)

        //label
        this.label = opts.label || '-'
    }

    /**
     * @param {{ style: import("../style/SegmentStyle.js").SegmentStyle, resolution: number, z: number, viewScale:object }} opts
     */
    update(opts) {
        //clear
        this.div.selectAll('*').remove()

        //title
        this.makeTitle()

        const d = this.div.append('div')

        //compute segment color, width and length
        const color = this.color(opts.resolution, opts.z, opts.viewScale)
        const widthPix = this.width(opts.resolution, opts.z, opts.viewScale) / opts.z
        const lengthPix = this.length(opts.resolution, opts.z, opts.viewScale) / opts.z

        //draw SVG segment
        const svgS = Math.max(lengthPix, widthPix)
        const svg = d.append('svg').attr('width', svgS).attr('height', svgS).style('', 'inline-block')

        const cos = Math.cos((-this.orientation * Math.PI) / 180)
        const sin = Math.sin((-this.orientation * Math.PI) / 180)
        const dc = svgS * 0.5,
            l2 = lengthPix * 0.5
        svg.append('line')
            .attr('x1', dc - cos * l2)
            .attr('y1', dc - sin * l2)
            .attr('x2', dc + cos * l2)
            .attr('y2', dc + sin * l2)
            .style('stroke', color)
            .style('stroke-width', widthPix)

        //label
        d.append('div')
            .style('display', 'inline')
            .style('padding-left', '5px')
            .style('font-size', this.labelFontSize)
            .text(this.label + (this.labelUnitText ? ' ' : '') + this.labelUnitText)
    }
}

/**
 *
 * @param {Array.<number>} orientations
 * @param {Array.<string>} labels
 * @param {object} opts
 * @returns  { Array.<OrientationLegend> }
 */
function orientationLegend(orientations, labels, opts = {}) {
    const legends = []
    for (let i = 0; i < orientations.length; i++) {
        opts.title = i == 0 ? opts.title : undefined
        opts.orientation = orientations[i]
        opts.label = labels[i]
        legends.push(new OrientationLegend(opts))
    }
    return legends
}

;// ./node_modules/gridviz/src/legend/TernaryLegend.js
//@ts-check


;


/**
 *
 * @module legend
 * @author Julien Gaffuri
 */
class TernaryLegend extends Legend {
    /** @param {Object} opts */
    constructor(opts) {
        super(opts)
        opts = opts || {}

        //classifier
        this.classifier = opts.classifier

        this.width = opts.width || 150
        this.selectionColor = this.selectionColor || 'red'
        this.tooltip = opts.tooltip
        this.texts = opts.texts

        this.leftText = opts.leftText || 'Category 0'
        this.topText = opts.topText || 'Category 1'
        this.rightText = opts.rightText || 'Category 2'

        this.centerCoefficient = opts.centerCoefficient || this.classifier.centerCoefficient
    }

    /**
     * @param {{} } opts
     */
    update(opts) {
        //clear
        this.div.selectAll('*').remove()

        //title
        this.makeTitle()

        const sqrt3over2 = 0.866025
        const w = this.width,
            h = w * sqrt3over2
        const classifier = this.classifier
        const selectionColor = this.selectionColor
        const selectionStrokeWidth = 0
        const tt = this.tooltip
        const texts = this.texts || {}

        const padding = 2
        const fontSize = 12

        //make svg element
        const svg = this.div
            .append('svg')
            .attr('width', w + selectionStrokeWidth)
            .attr('height', h + 4 * padding + 2 * fontSize)

        //top label
        svg.append('text')
            .attr('x', w / 2)
            .attr('y', padding + fontSize)
            .text(this.topText)
            .attr('font-size', fontSize)
            .attr('text-anchor', 'middle')
        //left label
        svg.append('text')
            .attr('x', 0)
            .attr('y', 3 * padding + 2 * fontSize + h)
            .text(this.leftText)
            .attr('font-size', fontSize)
            .attr('text-anchor', 'start')
        //right label
        svg.append('text')
            .attr('x', w)
            .attr('y', 3 * padding + 2 * fontSize + h)
            .text(this.rightText)
            .attr('font-size', fontSize)
            .attr('text-anchor', 'end')

        //triangle group
        const g = svg
            .append('g')
            .attr(
                'transform',
                'translate(' +
                    selectionStrokeWidth / 2 +
                    ' ' +
                    (selectionStrokeWidth / 2 + (2 * padding + fontSize)) +
                    ')'
            )

        //common function for triangle patches
        const setAttributes = (elt, color, text) => {
            //elt.raise();
            elt.attr('fill', color)
                //.attr("stroke", colorOver)
                //.attr("stroke-width", 0)
                //.attr("stroke-linejoin", "round")
                .on('mouseover', function (e) {
                    /*this.parentNode.appendChild(this); select(this).attr("stroke-width", selectionStrokeWidth);*/
                    src_select(this).attr('fill', selectionColor)
                    if (!tt || !text) return
                    tt.html(text)
                    tt.setPosition(e)
                    tt.show()
                })
                .on('mouseout', function () {
                    /*select(this).attr("stroke-width", 0);*/
                    src_select(this).attr('fill', color)
                    if (tt) tt.hide()
                })
            if (tt && text)
                elt.on('mousemove', function (e) {
                    tt.setPosition(e)
                })
        }

        //const [c0, c1, c2] = classifier.center

        //trapezium s0
        const t0 = g
            .append('polygon')
            .attr(
                'points',
                '0,' +
                    h +
                    ' ' +
                    w / 3 +
                    ',' +
                    h +
                    ' ' +
                    w / 2 +
                    ',' +
                    (h * 2) / 3 +
                    ' ' +
                    w / 6 +
                    ',' +
                    (h * 2) / 3
            )
        setAttributes(t0, classifier.colors[0], texts['0'])
        //trapezium s1
        const t1 = g
            .append('polygon')
            .attr(
                'points',
                w / 2 +
                    ',0 ' +
                    (w * 2) / 3 +
                    ',' +
                    h / 3 +
                    ' ' +
                    w / 2 +
                    ',' +
                    (h * 2) / 3 +
                    ' ' +
                    w / 3 +
                    ',' +
                    h / 3
            )
        setAttributes(t1, classifier.colors[1], texts['1'])
        //trapezium s2
        const t2 = g
            .append('polygon')
            .attr(
                'points',
                w +
                    ',' +
                    h +
                    ' ' +
                    (w * 5) / 6 +
                    ',' +
                    (2 * h) / 3 +
                    ' ' +
                    w / 2 +
                    ',' +
                    (h * 2) / 3 +
                    ' ' +
                    (w * 2) / 3 +
                    ',' +
                    h
            )
        setAttributes(t2, classifier.colors[2], texts['2'])
        //triangle s0
        const t0_ = g
            .append('polygon')
            .attr(
                'points',
                w / 2 +
                    ',' +
                    (h * 2) / 3 +
                    ' ' +
                    (w * 5) / 6 +
                    ',' +
                    (h * 2) / 3 +
                    ' ' +
                    (w * 2) / 3 +
                    ',' +
                    h / 3
            )
        setAttributes(t0_, classifier.mixColors[0], texts['m12'])
        //triangle s1
        const t1_ = g
            .append('polygon')
            .attr('points', w / 2 + ',' + (h * 2) / 3 + ' ' + w / 3 + ',' + h + ' ' + (w * 2) / 3 + ',' + h)
        setAttributes(t1_, classifier.mixColors[1], texts['m02'])
        //triangle s2
        const t2_ = g
            .append('polygon')
            .attr(
                'points',
                w / 2 + ',' + (h * 2) / 3 + ' ' + w / 6 + ',' + (h * 2) / 3 + ' ' + w / 3 + ',' + h / 3
            )
        setAttributes(t2_, classifier.mixColors[2], texts['m01'])

        //center
        if (this.centerCoefficient) {
            //TODO make it an hexagon !
            const center = g
                .append('circle')
                .attr('cx', w / 2)
                .attr('cy', (h * 2) / 3)
                .attr('r', (this.centerCoefficient * h) / 3)
            setAttributes(center, classifier.centerColor, texts['center'])
        }

        /*
        let middle, left, top, right, left_, bottom_, right_
        if (!this.real) {

            //0 left triangle
            left = g.append('polygon')
                .attr('points', "0," + h + " " + (w / 3) + "," + h + " " + (w / 6) + "," + (2 * h / 3))
            //1 top triangle
            top = g.append('polygon')
                .attr('points', (w / 3) + "," + (h / 3) + " " + (w * 2 / 3) + "," + (h / 3) + " " + (w / 2) + ",0")
            //2 right triangle
            right = g.append('polygon')
                .attr('points', (w * 2 / 3) + "," + h + " " + w + "," + h + " " + (w * 5 / 6) + "," + (2 * h / 3))
            //middle triangle
            middle = g.append('polygon')
                .attr('points', (w / 2) + "," + (h / 3) + " " + (w / 4) + "," + (h * 5 / 6) + " " + (3 * w / 4) + "," + (h * 5 / 6))
            //01 left trapezium
            left_ = g.append('polygon')
                .attr('points', (w / 6) + "," + (h * 2 / 3) + " " + (w / 4) + "," + (h * 5 / 6) + " " + (w / 2) + "," + (h / 3) + " " + (w / 3) + "," + (h / 3))
            //02 bottom trapezium
            bottom_ = g.append('polygon')
                .attr('points', (w / 3) + "," + (h) + " " + (2 * w / 3) + "," + (h) + " " + (w * 3 / 4) + "," + (h * 5 / 6) + " " + (w / 4) + "," + (h * 5 / 6))
            //12 right trapezium
            right_ = g.append('polygon')
                .attr('points', (w / 2) + "," + (h / 3) + " " + (w * 3 / 4) + "," + (h * 5 / 6) + " " + (w * 5 / 6) + "," + (h * 2 / 3) + " " + (w * 2 / 3) + "," + (h / 3))

        } else {

            //middle triangle
            middle = g.append('polygon')
                .attr('points', (w / 2) + ",0 0," + h + " " + w + "," + h)

            //draw trapezium
            //draw large trapezium first
            for (let i_ = 2; i_ >= 0; i_--) {
                const i = this.classifier.lowIndex[i_]
                const r = this.classifier.lowThreshold[i]
                if (i == 2)
                    //01 left trapezium
                    left_ = g.append('polygon')
                        .attr('points', w / 2 + ",0 0," + h + " " + w * r + "," + h + " " + w * (1 + r) / 2 + "," + r * h)
                else if (i == 1)
                    //02 bottom trapezium
                    bottom_ = g.append('polygon')
                        .attr('points', "0," + h + " " + w + "," + h + " " + w * (1 - r / 2) + "," + h * (1 - r) + " " + r * w / 2 + "," + h * (1 - r))
                else
                    //12 right trapezium
                    right_ = g.append('polygon')
                        .attr('points', w + "," + h + " " + w / 2 + ",0 " + w * (1 - r) / 2 + "," + h * r + " " + w * (1 - r) + "," + h)
            }

            //draw triangles
            //draw large triangles first
            for (let i_ = 2; i_ >= 0; i_--) {
                const i = this.classifier.highIndex[i_]
                const r = this.classifier.highThreshold[i]

                if (i == 2)
                    //2 right triangle
                    right = g.append('polygon')
                        .attr('points', w + "," + h + " " + w * r + "," + h + " " + w * (1 + r) / 2 + "," + h * r)
                else if (i == 1)
                    //1 top triangle
                    top = g.append('polygon')
                        .attr('points', (w / 2) + ",0 " + w * r / 2 + "," + h * (1 - r) + " " + w * (1 - r / 2) + "," + h * (1 - r))
                else
                    //0 left triangle
                    left = g.append('polygon')
                        .attr('points', "0," + h + " " + w * (1 - r) + "," + h + " " + w * (1 - r) / 2 + "," + h * r)
            }

        }*/
    }
}

;// ./node_modules/gridviz/src/utils/stretching.js
//@ts-check


/**
 * @module utils
 */

//TODO invert for circular
//TODO use Math.sqrt
//TODO validate

/**
 * Some function [0,1]->[0,1] to stretch range of values.
 * @see https://github.com/eurostat/gridviz/blob/master/docs/reference.md#stretching
 * @see https://observablehq.com/@jgaffuri/stretching
 */

//identity function
const stretching_identity = (t) => t
stretching_identity.invert = stretching_identity

/**
 * @param {number} base
 * @returns {function(number):number}
 */
const exponentialScale = (base = 3) => {
    if (base == 0) return stretching_identity
    const a = Math.exp(base) - 1
    const f = (t) => (Math.exp(t * base) - 1) / a
    f.invert = (t) => Math.log(a * t + 1) / base
    return f
}

/**
 * @param {number} base
 * @returns {function(number):number}
 */
const logarithmicScale = (base = 3) => {
    if (base == 0) return stretching_identity
    const a = Math.exp(base),
        b = 1 - a
    const f = (t) => 1 - Math.log(a + t * b) / base
    f.invert = (t) => (Math.exp((1 - t) * base) - a) / b
    return f
}

/**
 * @param {number} exponent
 * @returns {function(number):number}
 */
const powerScale = (exponent = 3) => {
    if (exponent == 1) return stretching_identity
    //TODO if (exponent == 0.5) return Math.sqrt
    const f = (t) => Math.pow(t, exponent)
    const a = 1 / exponent
    f.invert = (t) => Math.pow(t, a)
    return f
}

/**
 * @param {number} exponent
 * @returns {function(number):number}
 */
const powerInverseScale = (exponent = 3) => {
    if (exponent == 1) return stretching_identity
    //TODO if (exponent == 2) return t => 1 - Math.sqrt(1 - t)
    const a = 1 / exponent
    const f = (t) => 1 - Math.pow(1 - t, a)
    f.invert = (t) => 1 - Math.pow(1 - t, exponent)
    return f
}

/**
 * @param {number} circularity
 * @returns {function(number):number}
 */
const circularScale = (circularity = 0.8) => {
    if (circularity == 0) return stretching_identity
    if (circularity == 1) return (t) => Math.sqrt(t * (2 - t))
    else {
        const a = circularity / (1 - circularity)
        return (t) => Math.sqrt(1 / (a * a) + t * (2 / a + 2 - t)) - 1 / a
    }
}

/**
 * @param {number} circularity
 * @returns {function(number):number}
 */
const circularInverseScale = (circularity = 0.8) => {
    if (circularity == 0) return stretching_identity
    const f = circularScale(circularity)
    return (t) => 1 - f(1 - t)
}

//test
/*
const test = (f, fun, a, err = 1e-12) => {
    for (let t = 0; t <= 1; t += 1 / 50) {
        const er = t - f.invert(f(t))
        if (Math.abs(er) < err) continue
        console.log(fun, a, er)
    }
}

for (let fun of [powerScale, powerInverseScale])
    for (let exp = -30; exp <= 50; exp += 1) {
        if (exp == 0) continue
        const f = fun(exp)
        test(f, fun, exp)
    }


for (let fun of [exponentialScale, logarithmicScale])
    for (let base = -20; base <= 20; base += 1) {
        //if (exp == 0) continue
        const f = fun(base)
        test(f, fun, base, 1e-10)
    }
*/

;// ./node_modules/d3-format/src/formatDecimal.js
/* harmony default export */ function formatDecimal(x) {
  return Math.abs(x = Math.round(x)) >= 1e21
      ? x.toLocaleString("en").replace(/,/g, "")
      : x.toString(10);
}

// Computes the decimal coefficient and exponent of the specified number x with
// significant digits p, where x is positive and p is in [1, 21] or undefined.
// For example, formatDecimalParts(1.23) returns ["123", 0].
function formatDecimalParts(x, p) {
  if ((i = (x = p ? x.toExponential(p - 1) : x.toExponential()).indexOf("e")) < 0) return null; // NaN, ±Infinity
  var i, coefficient = x.slice(0, i);

  // The string returned by toExponential either has the form \d\.\d+e[-+]\d+
  // (e.g., 1.2e+3) or the form \de[-+]\d+ (e.g., 1e+3).
  return [
    coefficient.length > 1 ? coefficient[0] + coefficient.slice(2) : coefficient,
    +x.slice(i + 1)
  ];
}

;// ./node_modules/d3-format/src/exponent.js


/* harmony default export */ function exponent(x) {
  return x = formatDecimalParts(Math.abs(x)), x ? x[1] : NaN;
}

;// ./node_modules/d3-format/src/formatGroup.js
/* harmony default export */ function formatGroup(grouping, thousands) {
  return function(value, width) {
    var i = value.length,
        t = [],
        j = 0,
        g = grouping[0],
        length = 0;

    while (i > 0 && g > 0) {
      if (length + g + 1 > width) g = Math.max(1, width - length);
      t.push(value.substring(i -= g, i + g));
      if ((length += g + 1) > width) break;
      g = grouping[j = (j + 1) % grouping.length];
    }

    return t.reverse().join(thousands);
  };
}

;// ./node_modules/d3-format/src/formatNumerals.js
/* harmony default export */ function formatNumerals(numerals) {
  return function(value) {
    return value.replace(/[0-9]/g, function(i) {
      return numerals[+i];
    });
  };
}

;// ./node_modules/d3-format/src/formatSpecifier.js
// [[fill]align][sign][symbol][0][width][,][.precision][~][type]
var re = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;

function formatSpecifier(specifier) {
  if (!(match = re.exec(specifier))) throw new Error("invalid format: " + specifier);
  var match;
  return new FormatSpecifier({
    fill: match[1],
    align: match[2],
    sign: match[3],
    symbol: match[4],
    zero: match[5],
    width: match[6],
    comma: match[7],
    precision: match[8] && match[8].slice(1),
    trim: match[9],
    type: match[10]
  });
}

formatSpecifier.prototype = FormatSpecifier.prototype; // instanceof

function FormatSpecifier(specifier) {
  this.fill = specifier.fill === undefined ? " " : specifier.fill + "";
  this.align = specifier.align === undefined ? ">" : specifier.align + "";
  this.sign = specifier.sign === undefined ? "-" : specifier.sign + "";
  this.symbol = specifier.symbol === undefined ? "" : specifier.symbol + "";
  this.zero = !!specifier.zero;
  this.width = specifier.width === undefined ? undefined : +specifier.width;
  this.comma = !!specifier.comma;
  this.precision = specifier.precision === undefined ? undefined : +specifier.precision;
  this.trim = !!specifier.trim;
  this.type = specifier.type === undefined ? "" : specifier.type + "";
}

FormatSpecifier.prototype.toString = function() {
  return this.fill
      + this.align
      + this.sign
      + this.symbol
      + (this.zero ? "0" : "")
      + (this.width === undefined ? "" : Math.max(1, this.width | 0))
      + (this.comma ? "," : "")
      + (this.precision === undefined ? "" : "." + Math.max(0, this.precision | 0))
      + (this.trim ? "~" : "")
      + this.type;
};

;// ./node_modules/d3-format/src/formatTrim.js
// Trims insignificant zeros, e.g., replaces 1.2000k with 1.2k.
/* harmony default export */ function formatTrim(s) {
  out: for (var n = s.length, i = 1, i0 = -1, i1; i < n; ++i) {
    switch (s[i]) {
      case ".": i0 = i1 = i; break;
      case "0": if (i0 === 0) i0 = i; i1 = i; break;
      default: if (!+s[i]) break out; if (i0 > 0) i0 = 0; break;
    }
  }
  return i0 > 0 ? s.slice(0, i0) + s.slice(i1 + 1) : s;
}

;// ./node_modules/d3-format/src/formatPrefixAuto.js


var prefixExponent;

/* harmony default export */ function formatPrefixAuto(x, p) {
  var d = formatDecimalParts(x, p);
  if (!d) return x + "";
  var coefficient = d[0],
      exponent = d[1],
      i = exponent - (prefixExponent = Math.max(-8, Math.min(8, Math.floor(exponent / 3))) * 3) + 1,
      n = coefficient.length;
  return i === n ? coefficient
      : i > n ? coefficient + new Array(i - n + 1).join("0")
      : i > 0 ? coefficient.slice(0, i) + "." + coefficient.slice(i)
      : "0." + new Array(1 - i).join("0") + formatDecimalParts(x, Math.max(0, p + i - 1))[0]; // less than 1y!
}

;// ./node_modules/d3-format/src/formatRounded.js


/* harmony default export */ function formatRounded(x, p) {
  var d = formatDecimalParts(x, p);
  if (!d) return x + "";
  var coefficient = d[0],
      exponent = d[1];
  return exponent < 0 ? "0." + new Array(-exponent).join("0") + coefficient
      : coefficient.length > exponent + 1 ? coefficient.slice(0, exponent + 1) + "." + coefficient.slice(exponent + 1)
      : coefficient + new Array(exponent - coefficient.length + 2).join("0");
}

;// ./node_modules/d3-format/src/formatTypes.js




/* harmony default export */ const formatTypes = ({
  "%": (x, p) => (x * 100).toFixed(p),
  "b": (x) => Math.round(x).toString(2),
  "c": (x) => x + "",
  "d": formatDecimal,
  "e": (x, p) => x.toExponential(p),
  "f": (x, p) => x.toFixed(p),
  "g": (x, p) => x.toPrecision(p),
  "o": (x) => Math.round(x).toString(8),
  "p": (x, p) => formatRounded(x * 100, p),
  "r": formatRounded,
  "s": formatPrefixAuto,
  "X": (x) => Math.round(x).toString(16).toUpperCase(),
  "x": (x) => Math.round(x).toString(16)
});

;// ./node_modules/d3-format/src/identity.js
/* harmony default export */ function src_identity(x) {
  return x;
}

;// ./node_modules/d3-format/src/locale.js









var map = Array.prototype.map,
    prefixes = ["y","z","a","f","p","n","µ","m","","k","M","G","T","P","E","Z","Y"];

/* harmony default export */ function locale(locale) {
  var group = locale.grouping === undefined || locale.thousands === undefined ? src_identity : formatGroup(map.call(locale.grouping, Number), locale.thousands + ""),
      currencyPrefix = locale.currency === undefined ? "" : locale.currency[0] + "",
      currencySuffix = locale.currency === undefined ? "" : locale.currency[1] + "",
      decimal = locale.decimal === undefined ? "." : locale.decimal + "",
      numerals = locale.numerals === undefined ? src_identity : formatNumerals(map.call(locale.numerals, String)),
      percent = locale.percent === undefined ? "%" : locale.percent + "",
      minus = locale.minus === undefined ? "−" : locale.minus + "",
      nan = locale.nan === undefined ? "NaN" : locale.nan + "";

  function newFormat(specifier) {
    specifier = formatSpecifier(specifier);

    var fill = specifier.fill,
        align = specifier.align,
        sign = specifier.sign,
        symbol = specifier.symbol,
        zero = specifier.zero,
        width = specifier.width,
        comma = specifier.comma,
        precision = specifier.precision,
        trim = specifier.trim,
        type = specifier.type;

    // The "n" type is an alias for ",g".
    if (type === "n") comma = true, type = "g";

    // The "" type, and any invalid type, is an alias for ".12~g".
    else if (!formatTypes[type]) precision === undefined && (precision = 12), trim = true, type = "g";

    // If zero fill is specified, padding goes after sign and before digits.
    if (zero || (fill === "0" && align === "=")) zero = true, fill = "0", align = "=";

    // Compute the prefix and suffix.
    // For SI-prefix, the suffix is lazily computed.
    var prefix = symbol === "$" ? currencyPrefix : symbol === "#" && /[boxX]/.test(type) ? "0" + type.toLowerCase() : "",
        suffix = symbol === "$" ? currencySuffix : /[%p]/.test(type) ? percent : "";

    // What format function should we use?
    // Is this an integer type?
    // Can this type generate exponential notation?
    var formatType = formatTypes[type],
        maybeSuffix = /[defgprs%]/.test(type);

    // Set the default precision if not specified,
    // or clamp the specified precision to the supported range.
    // For significant precision, it must be in [1, 21].
    // For fixed precision, it must be in [0, 20].
    precision = precision === undefined ? 6
        : /[gprs]/.test(type) ? Math.max(1, Math.min(21, precision))
        : Math.max(0, Math.min(20, precision));

    function format(value) {
      var valuePrefix = prefix,
          valueSuffix = suffix,
          i, n, c;

      if (type === "c") {
        valueSuffix = formatType(value) + valueSuffix;
        value = "";
      } else {
        value = +value;

        // Determine the sign. -0 is not less than 0, but 1 / -0 is!
        var valueNegative = value < 0 || 1 / value < 0;

        // Perform the initial formatting.
        value = isNaN(value) ? nan : formatType(Math.abs(value), precision);

        // Trim insignificant zeros.
        if (trim) value = formatTrim(value);

        // If a negative value rounds to zero after formatting, and no explicit positive sign is requested, hide the sign.
        if (valueNegative && +value === 0 && sign !== "+") valueNegative = false;

        // Compute the prefix and suffix.
        valuePrefix = (valueNegative ? (sign === "(" ? sign : minus) : sign === "-" || sign === "(" ? "" : sign) + valuePrefix;
        valueSuffix = (type === "s" ? prefixes[8 + prefixExponent / 3] : "") + valueSuffix + (valueNegative && sign === "(" ? ")" : "");

        // Break the formatted value into the integer “value” part that can be
        // grouped, and fractional or exponential “suffix” part that is not.
        if (maybeSuffix) {
          i = -1, n = value.length;
          while (++i < n) {
            if (c = value.charCodeAt(i), 48 > c || c > 57) {
              valueSuffix = (c === 46 ? decimal + value.slice(i + 1) : value.slice(i)) + valueSuffix;
              value = value.slice(0, i);
              break;
            }
          }
        }
      }

      // If the fill character is not "0", grouping is applied before padding.
      if (comma && !zero) value = group(value, Infinity);

      // Compute the padding.
      var length = valuePrefix.length + value.length + valueSuffix.length,
          padding = length < width ? new Array(width - length + 1).join(fill) : "";

      // If the fill character is "0", grouping is applied after padding.
      if (comma && zero) value = group(padding + value, padding.length ? width - valueSuffix.length : Infinity), padding = "";

      // Reconstruct the final output based on the desired alignment.
      switch (align) {
        case "<": value = valuePrefix + value + valueSuffix + padding; break;
        case "=": value = valuePrefix + padding + value + valueSuffix; break;
        case "^": value = padding.slice(0, length = padding.length >> 1) + valuePrefix + value + valueSuffix + padding.slice(length); break;
        default: value = padding + valuePrefix + value + valueSuffix; break;
      }

      return numerals(value);
    }

    format.toString = function() {
      return specifier + "";
    };

    return format;
  }

  function formatPrefix(specifier, value) {
    var f = newFormat((specifier = formatSpecifier(specifier), specifier.type = "f", specifier)),
        e = Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3,
        k = Math.pow(10, -e),
        prefix = prefixes[8 + e / 3];
    return function(value) {
      return f(k * value) + prefix;
    };
  }

  return {
    format: newFormat,
    formatPrefix: formatPrefix
  };
}

;// ./node_modules/d3-format/src/defaultLocale.js


var defaultLocale_locale;
var format;
var formatPrefix;

defaultLocale({
  thousands: ",",
  grouping: [3],
  currency: ["$", ""]
});

function defaultLocale(definition) {
  defaultLocale_locale = locale(definition);
  format = defaultLocale_locale.format;
  formatPrefix = defaultLocale_locale.formatPrefix;
  return defaultLocale_locale;
}

;// ./node_modules/gridviz/src/index.js
//@ts-check


// the application







// export dataset types




// export styles








//export { ContourStyle } from './style/ContourStyle.js'












// export additional layers







// export legends







// export { goToStraight, zoomTo } from "./utils/zoomUtils"





;
const getParameterByName = GeoCanvas.getParameterByName

// set default d3 locale
;
defaultLocale({
    decimal: '.',
    thousands: ' ',
    grouping: [3],
    currency: ['', '€'],
})

// EXTERNAL MODULE: ./src/L.CanvasLayer.js
var L_CanvasLayer = __webpack_require__(271);
;// ./src/main.js




// define our projection
lib.defs('EPSG:3035', '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs')

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
     * @description Converts leaflet center to gridviz projection's geoCenter
     * proj4(fromProjection, toProjection, [coordinates])
     * @param {{lng: number, lat: number}} latLon leaflet latLon object
     */
    this.leafletToGeoCenter = function (latLon) {
        return lib(this.proj, [latLon.lng, latLon.lat])
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
        this.gridvizMap = new Map_Map(opts.container, {
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

})();

/******/ })()
;