import { randomBytes } from 'node:crypto';
import { BRAND, DARK } from '@jax/shared';
import { markerStyles } from './icons';
import { MAP_ATTRIBUTION, MAP_BOUNDS } from './tiles';

/**
 * D99: the map page shown inside the app (a WebView). MapLibre draws our Duval tiles with
 * the free Protomaps dark style; fonts and icons come from Protomaps' free asset site. The
 * app sends places and your location in with `window.jaxSetData(...)`; tapping a place
 * posts `{ type: 'open', id }` back to the app. Scripts are pinned versions (D99).
 */

const MAPLIBRE = 'https://unpkg.com/maplibre-gl@5.24.0/dist';
const PMTILES = 'https://unpkg.com/pmtiles@4.5.0/dist/pmtiles.js';
const BASEMAPS = 'https://unpkg.com/@protomaps/basemaps@5.7.2/dist/basemaps.js';
const ASSETS = 'https://protomaps.github.io/basemaps-assets';

export function mapPage(tilesUrl: string): { html: string; csp: string } {
  const nonce = randomBytes(16).toString('base64');
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https://unpkg.com`,
    "style-src 'unsafe-inline' https://unpkg.com",
    // A trailing slash so it covers everything under the folder (without it, only that exact
    // address is allowed and every font and icon file is blocked).
    `img-src data: blob: ${ASSETS}/`,
    `connect-src 'self' ${ASSETS}/`,
    // D113: the icon font the markers are drawn with (GET /api/v1/map/font).
    "font-src 'self'",

    'worker-src blob:',
    'child-src blob:',
  ].join('; ');
  const config = JSON.stringify({
    tiles: tilesUrl,
    bounds: MAP_BOUNDS,
    attribution: MAP_ATTRIBUTION,
    me: DARK.accent,
    page: DARK.page,
    white: BRAND.white,
    // D113: markers and the place pop-up.
    font: '/api/v1/map/font',
    markers: markerStyles(),
  });
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="${MAPLIBRE}/maplibre-gl.css">
<style>
  html, body, #map { margin: 0; height: 100%; background: ${DARK.page}; }
  .maplibregl-ctrl-attrib { font-size: 10px; }
  /* D113: the place pop-up, in the app's dark card style. */
  .jax-pop .maplibregl-popup-content { background: ${DARK.card}; color: ${DARK.text}; border-radius: 12px;
    padding: 10px 14px; font: 14px/1.35 system-ui, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.5); cursor: pointer; }
  .jax-pop .maplibregl-popup-tip { border-top-color: ${DARK.card}; border-bottom-color: ${DARK.card}; }
  .jax-pop b { display: block; font-size: 15px; margin-bottom: 2px; }
  .jax-pop span { color: ${DARK.textMuted}; }
  .jax-pop i { display: block; font-style: normal; color: ${DARK.accent}; font-size: 12px; margin-top: 4px; }
</style>
<script src="${MAPLIBRE}/maplibre-gl.js"></script>
<script src="${PMTILES}"></script>
<script src="${BASEMAPS}"></script>
</head>
<body>
<div id="map"></div>
<script nonce="${nonce}">
(function () {
  var C = ${config};
  var post = function (m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  // D100: report each step to the app (which forwards it to the development log).
  window.onerror = function (msg, src, line, col) { post({ type: 'error', message: msg + ' @ ' + src + ':' + line + ':' + col }); };
  window.addEventListener('unhandledrejection', function (e) { post({ type: 'error', message: 'promise: ' + (e.reason && e.reason.message || e.reason) }); });
  var gl = (function () { try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  post({ type: 'log', message: 'scripts: maplibre=' + (typeof maplibregl) + ' pmtiles=' + (typeof pmtiles) + ' basemaps=' + (typeof basemaps) + ' webgl=' + gl + ' ua=' + navigator.userAgent });
  fetch(C.tiles, { headers: { Range: 'bytes=0-126' } })
    .then(function (r) { post({ type: 'log', message: 'tiles test: HTTP ' + r.status + ' ' + (r.headers.get('content-range') || '') }); })
    .catch(function (e) { post({ type: 'error', message: 'tiles test failed: ' + e }); });
  try {
    var protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    var pad = 0.25;
    var map = new maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        glyphs: '${ASSETS}/fonts/{fontstack}/{range}.pbf',
        sprite: '${ASSETS}/sprites/v4/dark',
        sources: {
          protomaps: { type: 'vector', url: 'pmtiles://' + location.origin + C.tiles, attribution: C.attribution }
        },
        layers: basemaps.layers('protomaps', basemaps.namedFlavor('dark'), { lang: 'en' })
      },
      bounds: C.bounds,
      maxBounds: [C.bounds[0] - pad, C.bounds[1] - pad, C.bounds[2] + pad, C.bounds[3] + pad],
      minZoom: 8,
      maxZoom: 18,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false
    });
    map.touchZoomRotate.disableRotation();
    var empty = { type: 'FeatureCollection', features: [] };
    var pending = null;
    function apply(d) {
      var places = { type: 'FeatureCollection', features: (d.places || []).map(function (p) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
          properties: { id: p.id, name: p.name, icon: p.icon, posts: p.posts, favorites: p.favorites } };
      }) };
      map.getSource('places').setData(places);
      map.getSource('me').setData(d.me ? { type: 'Feature', geometry: { type: 'Point',
        coordinates: [d.me.longitude, d.me.latitude] }, properties: {} } : empty);
      if (d.fit && d.me) {
        var b = new maplibregl.LngLatBounds([d.me.longitude, d.me.latitude], [d.me.longitude, d.me.latitude]);
        (d.places || []).forEach(function (p) { b.extend([p.longitude, p.latitude]); });
        map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 0 });
      }
    }
    window.jaxSetData = function (d) { if (map.getSource('places')) apply(d); else pending = d; };
    // D113: one marker image per category group: a circle in the group's color with a white
    // edge and the group's icon (Ionicons font) in white. Without the font, just the circle.
    function addMarkers(fontReady) {
      var px = 2, size = 44 * px;
      Object.keys(C.markers).forEach(function (key) {
        var m = C.markers[key];
        var cv = document.createElement('canvas'); cv.width = size; cv.height = size;
        var g = cv.getContext('2d');
        g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 3 * px, 0, Math.PI * 2);
        g.fillStyle = m.color; g.fill();
        g.lineWidth = 2.5 * px; g.strokeStyle = C.white; g.stroke();
        if (fontReady) {
          g.fillStyle = C.white; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = (22 * px) + 'px JaxIcons';
          g.fillText(String.fromCodePoint(m.code), size / 2, size / 2 + px);
        }
        map.addImage(key, g.getImageData(0, 0, size, size), { pixelRatio: px });
      });
    }
    var iconFont = new FontFace('JaxIcons', 'url(' + C.font + ')');
    var fontLoaded = iconFont.load().then(function (f) { document.fonts.add(f); return true; })
      .catch(function (err) { post({ type: 'error', message: 'icon font: ' + err }); return false; });

    map.on('load', function () {
      fontLoaded.then(function (ok) { addMarkers(ok); start(); });
    });
    function start() {
      map.addSource('places', { type: 'geojson', data: empty });
      map.addSource('me', { type: 'geojson', data: empty });
      map.addLayer({ id: 'me-halo', type: 'circle', source: 'me',
        paint: { 'circle-radius': 16, 'circle-color': C.me, 'circle-opacity': 0.25 } });
      map.addLayer({ id: 'me', type: 'circle', source: 'me',
        paint: { 'circle-radius': 7, 'circle-color': C.me, 'circle-stroke-color': C.white, 'circle-stroke-width': 2 } });
      // D113: each place is its category icon, white on a circle in the category color.
      map.addLayer({ id: 'places', type: 'symbol', source: 'places',
        layout: { 'icon-image': ['get', 'icon'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 16, 0.9],
          'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      map.addLayer({ id: 'place-names', type: 'symbol', source: 'places', minzoom: 15,
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Medium'], 'text-size': 12,
          'text-offset': [0, 1.6], 'text-anchor': 'top', 'text-max-width': 9 },
        paint: { 'text-color': C.white, 'text-halo-color': C.page, 'text-halo-width': 1.5 } });
      // D113: tap a place for a small pop-up (name, posts, favorites); tap the pop-up, or the
      // same place, again to open the place; tap anywhere else to close it.
      var popup = null, openId = null;
      function closePopup() { if (popup) popup.remove(); popup = null; openId = null; }
      function plural(n, one) { return n + ' ' + one + (n === 1 ? '' : 's'); }
      map.on('click', function (e) {
        var f = map.queryRenderedFeatures(e.point, { layers: ['places'] })[0];
        if (!f) return closePopup();
        var id = f.properties.id;
        if (openId === id) return post({ type: 'open', id: id });
        closePopup();
        var el = document.createElement('div');
        var name = document.createElement('b');
        name.textContent = f.properties.name;
        var stats = document.createElement('span');
        stats.textContent = plural(Number(f.properties.posts), 'post') + ' \u00b7 ' +
          plural(Number(f.properties.favorites), 'favorite');
        var hint = document.createElement('i');
        hint.textContent = 'Tap to open';
        el.appendChild(name); el.appendChild(stats); el.appendChild(hint);
        el.addEventListener('click', function () { post({ type: 'open', id: id }); });
        popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 18,
          className: 'jax-pop', maxWidth: '240px' })
          .setLngLat(f.geometry.coordinates).setDOMContent(el).addTo(map);
        openId = id;
      });
      if (pending) { apply(pending); pending = null; }
      post({ type: 'ready' });
    }
    map.on('error', function (e) { post({ type: 'error', message: String(e && e.error && e.error.message || e) }); });
  } catch (err) {
    post({ type: 'error', message: String(err && err.message || err) });
  }
})();
</script>
</body>
</html>`;
  return { html, csp };
}
