import { randomBytes } from 'node:crypto';
import { BRAND, DARK } from '@jax/shared';
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
    `img-src data: blob: ${ASSETS}`,
    `connect-src 'self' ${ASSETS}`,
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
          properties: { id: p.id, name: p.name, color: p.color } };
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
    map.on('load', function () {
      map.addSource('places', { type: 'geojson', data: empty });
      map.addSource('me', { type: 'geojson', data: empty });
      map.addLayer({ id: 'me-halo', type: 'circle', source: 'me',
        paint: { 'circle-radius': 16, 'circle-color': C.me, 'circle-opacity': 0.25 } });
      map.addLayer({ id: 'me', type: 'circle', source: 'me',
        paint: { 'circle-radius': 7, 'circle-color': C.me, 'circle-stroke-color': C.white, 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'places', type: 'circle', source: 'places',
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 17, 11],
          'circle-color': ['get', 'color'], 'circle-stroke-color': C.white, 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'place-names', type: 'symbol', source: 'places', minzoom: 15,
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Medium'], 'text-size': 12,
          'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-max-width': 9 },
        paint: { 'text-color': C.white, 'text-halo-color': C.page, 'text-halo-width': 1.5 } });
      map.on('click', 'places', function (e) {
        var f = e.features && e.features[0];
        if (f) post({ type: 'open', id: f.properties.id });
      });
      map.on('mouseenter', 'places', function () { map.getCanvas().style.cursor = 'pointer'; });
      if (pending) { apply(pending); pending = null; }
      post({ type: 'ready' });
    });
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
