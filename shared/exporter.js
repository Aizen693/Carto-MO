/**
 * exporter.js — Generate standalone HTML deliverables from a zone's Mapbox map
 *
 * For each visible Mapbox source, walks the page's paint expressions
 * (match / interpolate / get / coalesce ...) against every feature so the
 * exported HTML has concrete per-feature colors + radii. Renders with
 * Leaflet + CartoDB Dark Matter tiles (no Mapbox token in the deliverable).
 *
 * Usage:
 *   import { exportZoneAsHTML } from '../shared/exporter.js';
 *   exportZoneAsHTML({ zoneName: 'Sahel', map: window.algorMap });
 */

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; OpenStreetMap contributors &copy; CARTO';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

const SKIP_PROPS = new Set(['_color', '_radius', '_size', '_g', '_h', '_c', '_a']);
const SKIP_SOURCE_PATTERNS = [
  /^mapbox-/,
  /^composite$/,
  /^kml-/,
  /-3d-(?:glow|base|body|mid|cap|beacon|label)$/,
];

const isInternalSource = id => SKIP_SOURCE_PATTERNS.some(re => re.test(id));

// Heuristic for the "primary" visual layer per source. We pick the order:
//   *-fill, *-outline (for polygons), *-dots (for points), *-line / *-lines
//   (linestrings), and skip ancillary effects (glow / ring / pulse / label).
const PRIMARY_SUFFIX_ORDER = [
  /-(?:dots|circle)$/,        // central dot
  /-(?:fill)$/,               // polygon fill
  /-(?:line|lines|outline)$/, // outlines & corridor lines
];
const SKIP_LAYER_PATTERNS = [
  /-(?:glow|ring|pulse|beacon|label)$/,
  /-3d-/,
];

export async function exportZoneAsHTML(opts = {}) {
  const map = opts.map || window.algorMap;
  if (!map || typeof map.getStyle !== 'function') {
    throw new Error('Mapbox map instance not found (window.algorMap)');
  }
  const zoneName = opts.zoneName || document.title.replace(/.*—\s*/, '').trim() || 'Algor Int';
  const subtitle = opts.subtitle || '';
  const zoom = map.getZoom();

  const style = map.getStyle();
  const allLayers = (style && style.layers) || [];

  // 1) Group visible non-ancillary layers by source
  const sourceGroups = new Map(); // srcId -> { layers: [], geomType: 'point'|'polygon'|'line'|'mixed' }
  for (const layer of allLayers) {
    if (!layer.source || isInternalSource(layer.source)) continue;
    const visibility = (layer.layout && layer.layout.visibility) || 'visible';
    if (visibility === 'none') continue;
    if (SKIP_LAYER_PATTERNS.some(re => re.test(layer.id))) continue;
    const src = map.getSource(layer.source);
    if (!src || src.type !== 'geojson') continue;
    if (!sourceGroups.has(layer.source)) {
      sourceGroups.set(layer.source, { layers: [], primary: null });
    }
    sourceGroups.get(layer.source).layers.push(layer);
  }

  // 2) Pick the "primary" layer per source (used to read paint expressions)
  for (const [, group] of sourceGroups) {
    for (const re of PRIMARY_SUFFIX_ORDER) {
      const match = group.layers.find(l => re.test(l.id));
      if (match) { group.primary = match; break; }
    }
    if (!group.primary) group.primary = group.layers[0];
  }

  // 3) Pull source data, resolve per-feature styles, build datasets
  const datasets = [];
  for (const [srcId, group] of sourceGroups) {
    const src = map.getSource(srcId);
    let data = src._data;
    if (typeof data === 'string') {
      try {
        const res = await fetch(data, { cache: 'no-cache' });
        data = await res.json();
      } catch { continue; }
    }
    if (!data || !data.type) continue;

    const layer = group.primary;
    const paint = layer.paint || {};
    // Pre-collect expressions we care about
    const colorExpr = paint['circle-color'] || paint['fill-color'] || paint['line-color'] || null;
    const outlineExpr = paint['circle-stroke-color'] || paint['line-color'] || null;
    const radiusExpr = paint['circle-radius'] || null;
    const widthExpr = paint['line-width'] || null;
    const fillOpacity = numericPaint(paint, 'fill-opacity', 0.2);
    const opacity = numericPaint(paint, 'line-opacity', paint['circle-opacity'] != null ? Number(paint['circle-opacity']) : 0.85);

    const features = (data.features || []).map(f => {
      const props = f.properties || {};
      const ctx = { props, zoom };
      const fillColor = evalExpr(colorExpr, ctx) || '#c49a3c';
      const strokeColor = evalExpr(outlineExpr, ctx) || fillColor;
      const radius = clampNumber(evalExpr(radiusExpr, ctx), 3, 14, 6);
      const weight = clampNumber(evalExpr(widthExpr, ctx), 0.5, 5, 1.5);
      return {
        ...f,
        properties: { ...props, _exportFill: fillColor, _exportStroke: strokeColor, _exportRadius: radius, _exportWeight: weight },
      };
    });

    // Build legend entries: detect `match` expression on a property and group by that prop
    const legendEntries = buildLegendForSource(colorExpr, features);

    datasets.push({
      id: srcId,
      label: friendlyLabel(srcId),
      geometryType: detectGeometry(features),
      color: typeof colorExpr === 'string' ? colorExpr : '#c49a3c',
      strokeColor: typeof outlineExpr === 'string' ? outlineExpr : null,
      fillOpacity,
      opacity,
      legendEntries,
      data: { type: data.type, features },
    });
  }

  if (!datasets.length) {
    alert('Aucun calque actif a exporter. Active au moins un calque sur la carte.');
    return;
  }

  const center = map.getCenter();
  const bounds = map.getBounds();
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const filename = `algorint-${slug(zoneName)}-${slug(today.replace(/\//g, '-'))}.html`;
  const html = buildHTML({
    title: `Algor Int — ${zoneName}`,
    zone: zoneName,
    subtitle,
    today,
    center: [center.lat, center.lng],
    zoom,
    bounds: [
      [bounds.getSouth(), bounds.getWest()],
      [bounds.getNorth(), bounds.getEast()],
    ],
    datasets,
  });
  triggerDownload(filename, html);
  return { filename, size: html.length, datasets: datasets.length };
}

// ────────────────────────────────────────────────────────── helpers

function numericPaint(paint, key, fallback) {
  const v = paint[key];
  if (v == null) return fallback;
  if (typeof v === 'number') return v;
  // expression — try evaluate without context for static values
  const r = evalExpr(v, { props: {}, zoom: 6 });
  return typeof r === 'number' ? r : fallback;
}

function clampNumber(v, min, max, fallback) {
  const n = Number(v);
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function detectGeometry(features) {
  for (const f of features) {
    const t = f.geometry && f.geometry.type;
    if (t === 'Point' || t === 'MultiPoint') return 'point';
    if (t === 'Polygon' || t === 'MultiPolygon') return 'polygon';
    if (t === 'LineString' || t === 'MultiLineString') return 'line';
  }
  return 'unknown';
}

function friendlyLabel(srcId) {
  const map = {
    'ethnies-src': 'Ethnies & sous-groupes',
    'forces-src': 'Forces en présence',
    'mines-src': 'Ressources minières',
    'infra-src': 'Infrastructures & axes',
    'flux-src': 'Flux & trafics',
    'events-src': 'Événements sécuritaires',
    'population-src': 'Population & mobilités',
    'frontieres-countries': 'Frontières',
    'humint-src': 'Humint',
  };
  if (map[srcId]) return map[srcId];
  return srcId.replace(/-src$/, '').replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
}

function buildLegendForSource(colorExpr, features) {
  if (!Array.isArray(colorExpr) || colorExpr[0] !== 'match') return [];
  const inputExpr = colorExpr[1];
  if (!Array.isArray(inputExpr) || inputExpr[0] !== 'get') return [];
  const propName = inputExpr[1];
  // Collect unique (label, color) pairs that actually appear in the features
  const seen = new Map(); // label -> color
  for (const f of features) {
    const label = f.properties && f.properties[propName];
    if (label == null) continue;
    const color = f.properties._exportFill;
    if (!seen.has(label)) seen.set(label, color);
  }
  return Array.from(seen.entries())
    .map(([label, color]) => ({ label, color }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
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
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
}

// ────────────────────────────────────────────────────────── Mapbox expression evaluator (minimal)

function evalExpr(expr, ctx) {
  if (expr == null) return null;
  const t = typeof expr;
  if (t === 'string' || t === 'number' || t === 'boolean') return expr;
  if (!Array.isArray(expr)) return null;
  const op = expr[0];
  const e = (i) => evalExpr(expr[i], ctx);
  switch (op) {
    case 'literal': return expr[1];
    case 'get': {
      const key = expr[1];
      return ctx.props ? ctx.props[key] : null;
    }
    case 'has': return ctx.props && ctx.props[expr[1]] != null;
    case 'zoom': return ctx.zoom;
    case 'coalesce':
      for (let i = 1; i < expr.length; i++) {
        const v = e(i);
        if (v != null && !(typeof v === 'number' && isNaN(v))) return v;
      }
      return null;
    case 'to-number': {
      const n = Number(e(1));
      return isFinite(n) ? n : (expr.length > 2 ? Number(e(2)) : 0);
    }
    case 'to-string': return String(e(1));
    case 'to-boolean': return !!e(1);
    case '+': case '-': case '*': case '/': {
      let acc = Number(e(1)) || 0;
      for (let i = 2; i < expr.length; i++) {
        const v = Number(e(i)) || 0;
        if (op === '+') acc += v;
        else if (op === '-') acc -= v;
        else if (op === '*') acc *= v;
        else if (op === '/') acc /= (v || 1);
      }
      return acc;
    }
    case '==': return e(1) === e(2);
    case '!=': return e(1) !== e(2);
    case '<':  return Number(e(1)) <  Number(e(2));
    case '<=': return Number(e(1)) <= Number(e(2));
    case '>':  return Number(e(1)) >  Number(e(2));
    case '>=': return Number(e(1)) >= Number(e(2));
    case 'case': {
      for (let i = 1; i < expr.length - 1; i += 2) {
        if (e(i)) return e(i + 1);
      }
      return e(expr.length - 1);
    }
    case 'match': {
      const input = e(1);
      // pairs are at indices 2..N-2; fallback is N-1
      for (let i = 2; i < expr.length - 1; i += 2) {
        const labels = Array.isArray(expr[i]) ? expr[i] : [expr[i]];
        if (labels.includes(input)) return evalExpr(expr[i + 1], ctx);
      }
      return e(expr.length - 1);
    }
    case 'step': {
      const input = e(1);
      let result = e(2);
      for (let i = 3; i < expr.length; i += 2) {
        const stop = e(i);
        if (Number(input) >= Number(stop)) result = evalExpr(expr[i + 1], ctx);
      }
      return result;
    }
    case 'interpolate': {
      // ['interpolate', interp, input, stop1_in, stop1_out, ...]
      const input = Number(e(2));
      if (!isFinite(input)) return evalExpr(expr[4], ctx);
      const stops = [];
      for (let i = 3; i < expr.length; i += 2) {
        stops.push([Number(evalExpr(expr[i], ctx)), evalExpr(expr[i + 1], ctx)]);
      }
      stops.sort((a, b) => a[0] - b[0]);
      if (input <= stops[0][0]) return stops[0][1];
      if (input >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (input >= stops[i][0] && input <= stops[i + 1][0]) {
          const a = stops[i], b = stops[i + 1];
          if (typeof a[1] === 'number' && typeof b[1] === 'number') {
            const t = (input - a[0]) / (b[0] - a[0]);
            return a[1] + t * (b[1] - a[1]);
          }
          return a[1];
        }
      }
      return stops[0][1];
    }
    case 'geometry-type': return ctx.geomType || null;
    case 'concat': return expr.slice(1).map(x => String(e(0))).join('');
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────── HTML template

function buildHTML({ title, zone, subtitle, today, center, zoom, bounds, datasets }) {
  // Strip transient helper props that would clutter popups
  const exportData = datasets.map(d => ({
    id: d.id,
    label: d.label,
    geometryType: d.geometryType,
    fillOpacity: d.fillOpacity,
    opacity: d.opacity,
    legendEntries: d.legendEntries,
    color: d.color,
    data: d.data,
  }));

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
    --bg: #0a0b0d; --s1: #14161a;
    --tx1: #ededee; --tx2: #8a8d93; --tx3: #4a4d52;
    --gold: #b8954a; --line: rgba(255,255,255,0.08);
    --sans: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  }
  *,*::before,*::after { box-sizing: border-box; }
  html,body { margin: 0; padding: 0; height: 100%; }
  body {
    font-family: var(--sans); background: var(--bg); color: var(--tx1);
    font-size: 14px; line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    display: flex; flex-direction: column; overflow: hidden;
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
    flex: 0 0 8px;
  }
  .brand .stack { display: flex; flex-direction: column; line-height: 1.2; }
  .brand .l1 { font-size: 13px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; }
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
  #map { flex: 1 1 auto; min-height: 0; background: var(--bg); }
  footer {
    flex: 0 0 auto; padding: 10px 28px;
    background: var(--s1); border-top: 1px solid var(--line);
    display: flex; justify-content: space-between;
    font-family: var(--mono); font-size: 10px; color: var(--tx3);
    letter-spacing: 0.1em; text-transform: uppercase;
  }
  /* Sidebar legend (collapsible) */
  #legend {
    position: absolute; top: 78px; left: 16px;
    width: 248px; max-height: calc(100vh - 160px);
    background: rgba(20,22,26,0.94);
    border: 1px solid var(--line);
    border-top: 2px solid var(--gold);
    z-index: 500;
    backdrop-filter: blur(8px);
    overflow: hidden;
    display: flex; flex-direction: column;
  }
  #legend .lg-head {
    padding: 10px 14px;
    font-family: var(--mono); font-size: 10px;
    color: var(--tx2); letter-spacing: 0.12em; text-transform: uppercase;
    border-bottom: 1px solid var(--line);
    display: flex; justify-content: space-between; cursor: pointer; user-select: none;
  }
  #legend .lg-head:hover { color: var(--gold); }
  #legend.collapsed .lg-body { display: none; }
  .lg-body { overflow-y: auto; flex: 1; }
  .lg-section {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .lg-section:last-child { border-bottom: none; }
  .lg-section .lg-section-title {
    font-family: var(--mono); font-size: 9.5px;
    color: var(--tx2); letter-spacing: 0.1em; text-transform: uppercase;
    margin-bottom: 8px; display: flex; justify-content: space-between;
  }
  .lg-section .lg-section-title .lg-count { color: var(--tx3); }
  .lg-row {
    display: flex; align-items: center; gap: 9px;
    padding: 3px 0; font-size: 11px; color: var(--tx1);
  }
  .lg-sw {
    width: 12px; height: 12px; flex: 0 0 12px;
    border: 1px solid rgba(0,0,0,0.3);
  }
  .lg-sw.point { border-radius: 50%; }
  .lg-sw.line { height: 3px; margin: 4px 0; }
  .lg-empty { font-size: 10.5px; color: var(--tx3); font-style: italic; }

  /* Leaflet overrides */
  .leaflet-container { background: var(--bg); font-family: var(--sans); }
  .leaflet-control-attribution {
    background: rgba(20,22,26,0.85);
    color: var(--tx3); font-family: var(--mono); font-size: 9px;
  }
  .leaflet-control-attribution a { color: var(--tx2); }
  .leaflet-control-zoom a {
    background: rgba(20,22,26,0.92); color: var(--tx1);
    border: 1px solid var(--line);
  }
  .leaflet-control-zoom a:hover { background: var(--s1); color: var(--gold); }
  .leaflet-popup-content-wrapper {
    background: rgba(20,22,26,0.96); color: var(--tx1);
    border: 1px solid rgba(184,149,74,0.30);
    border-radius: 0;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  }
  .leaflet-popup-tip { background: rgba(20,22,26,0.96); }
  .leaflet-popup-close-button { color: var(--tx2) !important; }
  .popup { padding: 4px 6px; min-width: 200px; max-width: 320px; }
  .popup .p-title {
    font-size: 13px; font-weight: 600; color: var(--gold);
    letter-spacing: 0.02em; margin-bottom: 8px;
    padding-bottom: 6px; border-bottom: 1px solid var(--line);
  }
  .popup .p-row {
    display: grid; grid-template-columns: 90px 1fr; gap: 8px;
    padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.04);
  }
  .popup .p-row:last-child { border-bottom: none; }
  .popup .p-k {
    font-family: var(--mono); font-size: 9.5px;
    color: var(--tx3); letter-spacing: 0.05em; text-transform: uppercase;
  }
  .popup .p-v { font-size: 12px; color: var(--tx1); word-break: break-word; }
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
<div id="map">
  <div id="legend">
    <div class="lg-head" onclick="document.getElementById('legend').classList.toggle('collapsed')">
      <span>Légende</span>
      <span>▾</span>
    </div>
    <div class="lg-body" id="legend-body"><div class="lg-empty" style="padding:10px 14px">Chargement…</div></div>
  </div>
</div>
<footer>
  <span>© Algor·Int — Cartographie OSINT</span>
  <span>Livrable autonome · pas d'accès à la plateforme</span>
</footer>
<script src="${LEAFLET_JS}" crossorigin></script>
<script>
const DATASETS = ${JSON.stringify(exportData)};
const SKIP_PROPS = ${JSON.stringify(Array.from(SKIP_PROPS))};

const map = L.map('map', { zoomControl: true, attributionControl: true })
  .setView([${center[0]}, ${center[1]}], ${zoom});
L.tileLayer(${JSON.stringify(TILE_URL)}, {
  attribution: ${JSON.stringify(TILE_ATTR)},
  subdomains: 'abcd', maxZoom: 19,
}).addTo(map);

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function formatValue(v) {
  if (v == null) return '';
  const s = String(v);
  if (/^https?:\\/\\//i.test(s)) return '<a href="' + escHtml(s) + '" target="_blank" rel="noopener">' + escHtml(s) + '</a>';
  return escHtml(s);
}
function buildPopup(props) {
  const skip = new Set(SKIP_PROPS);
  const title = props && (props.name || props.nom || props.title || props.actor || props.acteur || props.event_type || props.type || props.force) || 'Détail';
  const entries = Object.entries(props || {})
    .filter(([k, v]) => !skip.has(k) && !k.startsWith('_export') && v !== null && v !== '' && v !== undefined);
  const rows = entries.map(([k, v]) =>
    '<div class="p-row"><div class="p-k">' + escHtml(k) + '</div><div class="p-v">' + formatValue(v) + '</div></div>'
  ).join('');
  return '<div class="popup"><div class="p-title">' + escHtml(title) + '</div>' + rows + '</div>';
}

// Helpers to read feature coords for point renderings
function pointLatLng(geom) {
  if (!geom) return null;
  if (geom.type === 'Point') return L.latLng(geom.coordinates[1], geom.coordinates[0]);
  if (geom.type === 'MultiPoint' && geom.coordinates[0]) return L.latLng(geom.coordinates[0][1], geom.coordinates[0][0]);
  return null;
}

DATASETS.forEach(ds => {
  const isPoint   = ds.geometryType === 'point';
  const isPolygon = ds.geometryType === 'polygon';
  const isLine    = ds.geometryType === 'line';

  if (isPoint) {
    // 3-layer radar render: halo (large, low-opacity fill) + ring (stroke-only) + dot
    const haloGroup = L.layerGroup();
    const ringGroup = L.layerGroup();
    const dotGroup = L.layerGroup();
    ds.data.features.forEach(feat => {
      const p = feat.properties || {};
      const ll = pointLatLng(feat.geometry);
      if (!ll) return;
      const color = p._exportFill || ds.color || '#c49a3c';
      const base = p._exportRadius || 5;
      L.circleMarker(ll, {
        radius: base * 3,
        fillColor: color, fillOpacity: 0.07,
        stroke: false, interactive: false,
      }).addTo(haloGroup);
      L.circleMarker(ll, {
        radius: base * 1.7,
        fillOpacity: 0,
        color: color, weight: 1, opacity: 0.40,
        interactive: false,
      }).addTo(ringGroup);
      const dot = L.circleMarker(ll, {
        radius: base,
        fillColor: color, fillOpacity: 0.95,
        color: '#0a0b0d', weight: 1, opacity: 1,
      });
      dot.bindPopup(buildPopup(p), { maxWidth: 360 });
      dot.addTo(dotGroup);
    });
    haloGroup.addTo(map);
    ringGroup.addTo(map);
    dotGroup.addTo(map);
  } else {
    // Polygons + lines via L.geoJSON
    L.geoJSON(ds.data, {
      style: (feat) => {
        const p = feat.properties || {};
        return {
          color: p._exportStroke || p._exportFill || ds.color,
          weight: p._exportWeight || (isLine ? 2.2 : 1.6),
          opacity: ds.opacity != null ? ds.opacity : 0.85,
          fillColor: p._exportFill || ds.color,
          fillOpacity: ds.fillOpacity != null ? ds.fillOpacity : 0.22,
        };
      },
      onEachFeature: (feat, lyr) => {
        lyr.bindPopup(buildPopup(feat.properties), { maxWidth: 360 });
      },
    }).addTo(map);
  }
});

// Render legend
(function renderLegend() {
  const body = document.getElementById('legend-body');
  const parts = [];
  for (const ds of DATASETS) {
    const featureCount = (ds.data && ds.data.features && ds.data.features.length) || 0;
    let section = '<div class="lg-section"><div class="lg-section-title"><span>' + escHtml(ds.label) + '</span><span class="lg-count">' + featureCount + '</span></div>';
    if (ds.legendEntries && ds.legendEntries.length) {
      for (const e of ds.legendEntries) {
        const swClass = ds.geometryType === 'point' ? 'lg-sw point' : (ds.geometryType === 'line' ? 'lg-sw line' : 'lg-sw');
        section += '<div class="lg-row"><span class="' + swClass + '" style="background:' + escHtml(e.color) + '"></span><span>' + escHtml(e.label) + '</span></div>';
      }
    } else {
      // single-color layer
      const swClass = ds.geometryType === 'point' ? 'lg-sw point' : (ds.geometryType === 'line' ? 'lg-sw line' : 'lg-sw');
      section += '<div class="lg-row"><span class="' + swClass + '" style="background:' + escHtml(ds.color) + '"></span><span>' + escHtml(ds.label) + '</span></div>';
    }
    section += '</div>';
    parts.push(section);
  }
  body.innerHTML = parts.join('') || '<div class="lg-empty" style="padding:10px 14px">Aucun calque visible</div>';
})();
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
