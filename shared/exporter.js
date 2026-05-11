/**
 * exporter.js — Generate standalone HTML deliverables from a zone's Mapbox map
 *
 * Reads the current Mapbox map state (visible layers, GeoJSON sources, viewport)
 * and bundles it into a single self-contained HTML file that opens in any
 * browser without internet. Uses Leaflet + CartoDB Dark Matter tiles (no token
 * required) so the deliverable works even if the client has no Mapbox account.
 *
 * Usage from a zone page:
 *   import { exportZoneAsHTML } from '../shared/exporter.js';
 *   exportZoneAsHTML({ zoneName: 'Sahel', map: window.map });
 */

const DEFAULT_COLOR = '#c49a3c';
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; OpenStreetMap contributors &copy; CARTO';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

const SKIP_PROPS = new Set(['_color', '_radius', '_size', '_casualties_norm', '_internal']);

// Internal/system sources that should never be exported (selection overlays, raster basemaps, 3D extrusion duplicates)
const SKIP_SOURCE_PATTERNS = [
  /^mapbox-/,           // built-in raster sources
  /^composite$/,        // Mapbox style composite
  /^kml-/,              // live click selection overlays
  /-3d-(?:glow|base|body|mid|cap|beacon|label)$/,  // 3D extrusion duplicate sources
];

function isInternalSource(id) {
  return SKIP_SOURCE_PATTERNS.some(re => re.test(id));
}

export async function exportZoneAsHTML(opts = {}) {
  const map = opts.map || window.algorMap;
  if (!map || typeof map.getStyle !== 'function') throw new Error('No Mapbox map instance found');
  const zoneName = opts.zoneName || document.title.replace(/.*—\s*/, '').trim() || 'Algor Int';
  const subtitle = opts.subtitle || '';

  const style = map.getStyle();
  const layers = (style && style.layers) || [];

  // 1) Find which sources are visible (any layer using them is visible)
  const visibleSources = new Map(); // srcId -> { color, layers: [...] }
  for (const layer of layers) {
    if (!layer.source || isInternalSource(layer.source)) continue;
    const visibility = (layer.layout && layer.layout.visibility) || 'visible';
    if (visibility === 'none') continue;
    const src = map.getSource(layer.source);
    if (!src || src.type !== 'geojson') continue;
    const entry = visibleSources.get(layer.source) || { color: null, layers: [] };
    entry.layers.push(layer);
    if (!entry.color) entry.color = extractColor(map, layer);
    visibleSources.set(layer.source, entry);
  }

  // 2) Pull data from each source
  const datasets = [];
  for (const [srcId, meta] of visibleSources) {
    const src = map.getSource(srcId);
    let data = src._data;
    if (typeof data === 'string') {
      try {
        const res = await fetch(data, { cache: 'no-cache' });
        data = await res.json();
      } catch (e) {
        console.warn('[exporter] fetch failed for source', srcId, e);
        continue;
      }
    }
    if (!data || !data.type) continue;
    datasets.push({
      id: srcId,
      color: meta.color || DEFAULT_COLOR,
      data,
    });
  }

  if (!datasets.length) {
    alert("Aucun calque actif a exporter. Active au moins un calque sur la carte.");
    return;
  }

  // 3) Viewport
  const center = map.getCenter();
  const zoom = map.getZoom();

  // 4) Build the standalone HTML
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const filename = `algorint-${slug(zoneName)}-${slug(today.replace(/\//g, '-'))}.html`;
  const html = buildHTML({
    title: `Algor Int — ${zoneName}`,
    zone: zoneName,
    subtitle,
    today,
    center: [center.lat, center.lng],
    zoom,
    datasets,
  });

  // 5) Trigger download
  triggerDownload(filename, html);
  return { filename, size: html.length, datasets: datasets.length };
}

function extractColor(map, layer) {
  const props = ['circle-color', 'fill-color', 'line-color', 'icon-color'];
  for (const p of props) {
    try {
      const val = map.getPaintProperty(layer.id, p);
      if (typeof val === 'string') return val;
      if (Array.isArray(val) && val[0] === 'get' && typeof val[1] === 'string') return null; // per-feature
    } catch {}
  }
  return null;
}

function slug(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function triggerDownload(filename, content) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
}

function buildHTML({ title, zone, subtitle, today, center, zoom, datasets }) {
  const dataJS = `const DATASETS = ${JSON.stringify(datasets)};`;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${LEAFLET_CSS}" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0a0b0d;
    --s1: #14161a;
    --tx1: #ededee;
    --tx2: #8a8d93;
    --tx3: #4a4d52;
    --gold: #b8954a;
    --line: rgba(255,255,255,0.08);
    --sans: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  }
  *,*::before,*::after { box-sizing: border-box; }
  html,body { margin: 0; padding: 0; height: 100%; }
  body {
    font-family: var(--sans); background: var(--bg); color: var(--tx1);
    font-size: 14px; line-height: 1.5;
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 28px; gap: 24px;
    background: var(--s1); border-bottom: 1px solid var(--line);
    flex: 0 0 auto;
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand .dot {
    width: 8px; height: 8px; background: var(--gold);
    box-shadow: 0 0 0 3px rgba(184,149,74,0.15);
  }
  .brand .stack { display: flex; flex-direction: column; line-height: 1.2; }
  .brand .l1 {
    font-size: 13px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;
  }
  .brand .l2 {
    font-family: var(--mono); font-size: 10px; color: var(--tx2);
    letter-spacing: 0.14em; text-transform: uppercase; margin-top: 4px;
  }
  .meta {
    display: flex; align-items: center; gap: 22px;
    font-family: var(--mono); font-size: 10.5px;
    color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase;
  }
  .meta strong { color: var(--tx1); font-weight: 500; }
  .meta .sep { color: var(--tx3); }
  #map {
    flex: 1 1 auto; min-height: 0;
    background: var(--bg);
  }
  .legend {
    position: absolute; right: 16px; bottom: 16px;
    background: rgba(20,22,26,0.92);
    border: 1px solid var(--line);
    padding: 12px 14px 10px;
    min-width: 180px;
    font-size: 11px;
    z-index: 500;
    backdrop-filter: blur(6px);
  }
  .legend .lg-head {
    font-family: var(--mono); font-size: 9.5px;
    color: var(--tx2); letter-spacing: 0.12em; text-transform: uppercase;
    margin-bottom: 8px; padding-bottom: 7px;
    border-bottom: 1px solid var(--line);
  }
  .legend .lg-row { display: flex; align-items: center; gap: 9px; padding: 4px 0; color: var(--tx1); }
  .legend .lg-sw { width: 11px; height: 11px; flex: 0 0 11px; border-radius: 50%; }
  footer {
    flex: 0 0 auto;
    padding: 10px 28px;
    background: var(--s1); border-top: 1px solid var(--line);
    display: flex; justify-content: space-between;
    font-family: var(--mono); font-size: 10px;
    color: var(--tx3); letter-spacing: 0.1em; text-transform: uppercase;
  }
  footer a { color: var(--tx2); text-decoration: none; border-bottom: 1px solid var(--line); }
  footer a:hover { color: var(--gold); border-color: var(--gold); }

  /* Leaflet overrides */
  .leaflet-container { background: var(--bg); font-family: var(--sans); }
  .leaflet-control-attribution {
    background: rgba(20,22,26,0.85);
    color: var(--tx3); font-family: var(--mono); font-size: 9px;
  }
  .leaflet-control-attribution a { color: var(--tx2); }
  .leaflet-control-zoom a {
    background: rgba(20,22,26,0.92);
    color: var(--tx1);
    border: 1px solid var(--line);
  }
  .leaflet-control-zoom a:hover { background: var(--s1); color: var(--gold); }
  .leaflet-popup-content-wrapper {
    background: rgba(20,22,26,0.96);
    color: var(--tx1);
    border: 1px solid rgba(184,149,74,0.30);
    border-radius: 0;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  }
  .leaflet-popup-tip { background: rgba(20,22,26,0.96); }
  .leaflet-popup-close-button { color: var(--tx2) !important; }
  .popup {
    padding: 4px 6px;
    min-width: 200px;
    max-width: 320px;
  }
  .popup .p-title {
    font-size: 13px; font-weight: 600; color: var(--gold);
    letter-spacing: 0.02em; margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
  }
  .popup .p-row {
    display: grid; grid-template-columns: 90px 1fr; gap: 8px;
    padding: 4px 0;
    border-bottom: 1px dashed rgba(255,255,255,0.04);
  }
  .popup .p-row:last-child { border-bottom: none; }
  .popup .p-k {
    font-family: var(--mono); font-size: 9.5px;
    color: var(--tx3); letter-spacing: 0.05em; text-transform: uppercase;
  }
  .popup .p-v {
    font-size: 12px; color: var(--tx1);
    word-break: break-word;
  }
  .popup .p-v a { color: var(--gold); }
</style>
</head>
<body>
<header>
  <div class="brand">
    <span class="dot"></span>
    <div class="stack">
      <span class="l1">ALGOR INT</span>
      <span class="l2">${escapeHtml(zone)}${subtitle ? ' · ' + escapeHtml(subtitle) : ''}</span>
    </div>
  </div>
  <div class="meta">
    <span><strong>${datasets.length}</strong> calques</span>
    <span class="sep">·</span>
    <span>${escapeHtml(today)}</span>
    <span class="sep">·</span>
    <span>Diffusion restreinte</span>
  </div>
</header>
<div id="map"></div>
<footer>
  <span>© Algor·Int — Cartographie OSINT</span>
  <span>Livrable autonome · pas d'accès à la plateforme</span>
</footer>
<script src="${LEAFLET_JS}" crossorigin></script>
<script>
${dataJS}

const map = L.map('map', { zoomControl: true, attributionControl: true })
  .setView([${center[0]}, ${center[1]}], ${zoom});
L.tileLayer(${JSON.stringify(TILE_URL)}, {
  attribution: ${JSON.stringify(TILE_ATTR)},
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);

function formatValue(k, v) {
  if (v == null) return '';
  const s = String(v);
  if (/^https?:\\/\\//i.test(s)) return '<a href="' + s + '" target="_blank" rel="noopener">' + s + '</a>';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildPopup(props) {
  const skip = new Set(${JSON.stringify(Array.from(SKIP_PROPS))});
  const entries = Object.entries(props || {}).filter(([k, v]) => !skip.has(k) && v !== null && v !== '' && v !== undefined);
  if (!entries.length) return '<div class="popup"><div class="p-title">Pas de detail</div></div>';
  const title = props.name || props.nom || props.title || props.actor || props.acteur || props.event_type || props.type || 'Detail';
  const rows = entries.map(([k, v]) =>
    '<div class="p-row"><div class="p-k">' + k.replace(/&/g, '&amp;') + '</div><div class="p-v">' + formatValue(k, v) + '</div></div>'
  ).join('');
  return '<div class="popup"><div class="p-title">' + String(title).replace(/&/g, '&amp;') + '</div>' + rows + '</div>';
}

function styleFor(color) {
  return {
    radius: 6,
    fillColor: color,
    color: '#0a0b0d',
    weight: 1.5,
    opacity: 1,
    fillOpacity: 0.85,
  };
}

DATASETS.forEach(ds => {
  const layer = L.geoJSON(ds.data, {
    pointToLayer: (feat, latlng) => {
      const featureColor = feat.properties && feat.properties._color;
      return L.circleMarker(latlng, styleFor(featureColor || ds.color));
    },
    style: (feat) => ({
      color: (feat.properties && feat.properties._color) || ds.color,
      weight: 1.5,
      opacity: 0.85,
      fillColor: (feat.properties && feat.properties._color) || ds.color,
      fillOpacity: 0.18,
    }),
    onEachFeature: (feat, lyr) => {
      lyr.bindPopup(buildPopup(feat.properties), { maxWidth: 360 });
    },
  });
  layer.addTo(map);
});
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
