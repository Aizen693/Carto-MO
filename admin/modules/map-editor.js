/**
 * map-editor.js — Carte Mapbox editeur avec click-to-add et selection de points
 */

function parseStaticDesc(raw) {
  if (!raw) return null;
  const r = {};
  raw.split('\n').forEach(l => {
    const m = l.match(/^([^:]+):\s*(.+)$/);
    if (m) {
      const k = m[1].trim().toLowerCase(), v = m[2].trim();
      if (k === 'date') r.date = v;
      else if (k === 'pays') r.pays = v;
      else if (k === 'evenement' || k === 'événement') r.event = v;
      else if (k === 'détail' || k === 'detail') r.detail = v;
    }
  });
  return Object.keys(r).length ? r : null;
}

let editorMap = null;
let adminPointsData = [];
let onMapClickCb = null;
let onPointClickCb = null;
let selectedPointId = null;

const ADMIN_SOURCE = 'admin-points';
const ADMIN_LAYER_DOTS = 'admin-dots';
const ADMIN_LAYER_GLOW = 'admin-glow';
const ADMIN_LAYER_SELECTED = 'admin-selected';
const STATIC_SOURCE = 'static-points';
const STATIC_LAYER_DOTS = 'static-dots';
const STATIC_LAYER_GLOW = 'static-glow';

export function getMap() { return editorMap; }

let mapReadyResolve = null;
let mapReadyPromise = null;

export function initEditorMap(container, zoneConfig) {
  if (editorMap) { editorMap.remove(); editorMap = null; }

  mapReadyPromise = new Promise(r => { mapReadyResolve = r; });

  mapboxgl.accessToken = 'pk.eyJ1IjoiYXo2OTMiLCJhIjoiY21uMGlhY2ZyMGx6bDJycjAxYWZjbWt5eiJ9.SQqOLLgLwWKnUGMztrSArg';

  editorMap = new mapboxgl.Map({
    container,
    style: zoneConfig.STYLES.standard || 'mapbox://styles/mapbox/standard',
    center: zoneConfig.MAP_CENTER,
    zoom: zoneConfig.MAP_ZOOM || 5,
    bearing: zoneConfig.MAP_BEARING || 0,
    pitch: 0,
    attributionControl: false
  });

  editorMap.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right');

  editorMap.on('load', () => {
    addAdminSource();
    addAdminLayers();
    setupInteractions();
    mapReadyResolve();
  });

  return editorMap;
}

export function whenReady() {
  return mapReadyPromise || Promise.resolve();
}

function addAdminSource() {
  editorMap.addSource(STATIC_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });
  editorMap.addSource(ADMIN_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });
}

function addAdminLayers() {
  // ── Static file points — identical styling to public map (engine.js) ──

  // Pulse ring (animated stroke)
  editorMap.addLayer({
    id: 'static-pulse',
    type: 'circle',
    source: STATIC_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 7, 7, 12, 12, 18],
      'circle-color': ['get', '_color'],
      'circle-opacity': 0,
      'circle-stroke-color': ['get', '_color'],
      'circle-stroke-width': 1,
      'circle-stroke-opacity': 0.25,
      'circle-pitch-alignment': 'map',
      'circle-pitch-scale': 'map'
    }
  });

  // Glow (soft blur halo) — matches public map exactly
  editorMap.addLayer({
    id: STATIC_LAYER_GLOW,
    type: 'circle',
    source: STATIC_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 7, 9, 12, 14],
      'circle-color': ['get', '_color'],
      'circle-opacity': 0.12,
      'circle-blur': 0.8,
      'circle-pitch-alignment': 'map',
      'circle-pitch-scale': 'map'
    }
  });

  // Main dots — casualties-based dynamic radius, white stroke (public map style)
  editorMap.addLayer({
    id: STATIC_LAYER_DOTS,
    type: 'circle',
    source: STATIC_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        3, ['interpolate', ['linear'], ['get', '_casualties'], 0, 3.5, 10, 4, 100, 4.5, 500, 5, 1000, 5.5, 10000, 6.5],
        7, ['interpolate', ['linear'], ['get', '_casualties'], 0, 5, 10, 5.5, 100, 6.5, 500, 7.5, 1000, 8.5, 10000, 10],
        12, ['interpolate', ['linear'], ['get', '_casualties'], 0, 7, 10, 8, 100, 9.5, 500, 11, 1000, 13, 10000, 16]
      ],
      'circle-color': ['get', '_color'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-opacity': 1,
      'circle-pitch-alignment': 'map',
      'circle-pitch-scale': 'map'
    }
  });

  // Labels at high zoom
  editorMap.addLayer({
    id: 'static-labels',
    type: 'symbol',
    source: STATIC_SOURCE,
    minzoom: 10,
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-offset': [0, 1.3],
      'text-anchor': 'top',
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
      'text-optional': true,
      'text-pitch-alignment': 'map'
    },
    paint: {
      'text-color': '#fff',
      'text-halo-color': 'rgba(0,0,0,0.9)',
      'text-halo-width': 2,
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 12, 1]
    }
  });

  // ── Admin (Supabase) points — same public-map style + gold selection ring ──

  editorMap.addLayer({
    id: ADMIN_LAYER_GLOW,
    type: 'circle',
    source: ADMIN_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 7, 9, 12, 14],
      'circle-color': ['get', '_color'],
      'circle-opacity': 0.15,
      'circle-blur': 0.8
    }
  });

  editorMap.addLayer({
    id: ADMIN_LAYER_DOTS,
    type: 'circle',
    source: ADMIN_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        3, ['interpolate', ['linear'], ['get', '_casualties'], 0, 3.5, 10, 4, 100, 4.5, 500, 5, 1000, 5.5, 10000, 6.5],
        7, ['interpolate', ['linear'], ['get', '_casualties'], 0, 5, 10, 5.5, 100, 6.5, 500, 7.5, 1000, 8.5, 10000, 10],
        12, ['interpolate', ['linear'], ['get', '_casualties'], 0, 7, 10, 8, 100, 9.5, 500, 11, 1000, 13, 10000, 16]
      ],
      'circle-color': ['get', '_color'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-opacity': 1
    }
  });

  editorMap.addLayer({
    id: ADMIN_LAYER_SELECTED,
    type: 'circle',
    source: ADMIN_SOURCE,
    filter: ['==', ['get', '_id'], ''],
    paint: {
      'circle-radius': 10,
      'circle-color': 'transparent',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2
    }
  });

  // Pulse animation (matches public map)
  let op = 0.1, dir = 1;
  (function pulse() {
    op += 0.015 * dir;
    if (op > 0.65) dir = -1;
    if (op < 0.05) dir = 1;
    if (editorMap && editorMap.getLayer('static-pulse')) {
      editorMap.setPaintProperty('static-pulse', 'circle-stroke-opacity', op);
    }
    requestAnimationFrame(pulse);
  })();
}

function setupInteractions() {
  editorMap.on('click', ADMIN_LAYER_DOTS, (e) => {
    e.preventDefault();
    if (!e.features.length) return;
    const id = e.features[0].properties._id;
    selectPoint(id);
    if (onPointClickCb) onPointClickCb(id);
  });

  editorMap.on('click', (e) => {
    if (e.defaultPrevented) return;
    const features = editorMap.queryRenderedFeatures(e.point, { layers: [ADMIN_LAYER_DOTS] });
    if (features.length) return;
    if (onMapClickCb) onMapClickCb([e.lngLat.lng, e.lngLat.lat]);
  });

  editorMap.on('mouseenter', ADMIN_LAYER_DOTS, () => {
    editorMap.getCanvas().style.cursor = 'pointer';
  });
  editorMap.on('mouseleave', ADMIN_LAYER_DOTS, () => {
    editorMap.getCanvas().style.cursor = 'crosshair';
  });

  // Click popup for static file points (like public map but smaller)
  editorMap.on('click', STATIC_LAYER_DOTS, (e) => {
    if (!e.features.length) return;
    const f = e.features[0].properties;
    const color = f._color || '#888';
    const desc = f._desc && f._desc !== 'null' ? parseStaticDesc(f._desc) : null;
    let body = '';
    if (desc) {
      if (desc.date)   body += `<div style="display:flex;gap:6px;margin-bottom:3px"><span style="font:500 7px/1 var(--m);color:var(--ach);min-width:42px;text-transform:uppercase;letter-spacing:0.1em;padding-top:1px">Date</span><span style="font:500 9px/1.4 var(--m);color:#fff">${desc.date}</span></div>`;
      if (desc.pays)   body += `<div style="display:flex;gap:6px;margin-bottom:3px"><span style="font:500 7px/1 var(--m);color:var(--ach);min-width:42px;text-transform:uppercase;letter-spacing:0.1em;padding-top:1px">Pays</span><span style="font:400 9px/1.4 var(--m);color:#fff">${desc.pays}</span></div>`;
      if (desc.event)  body += `<div style="display:flex;gap:6px;margin-bottom:3px"><span style="font:500 7px/1 var(--m);color:var(--ach);min-width:42px;text-transform:uppercase;letter-spacing:0.1em;padding-top:1px">Event</span><span style="font:500 9px/1.4 var(--m);color:#fff">${desc.event}</span></div>`;
      if (desc.detail) body += `<div style="display:flex;gap:6px;margin-bottom:3px"><span style="font:500 7px/1 var(--m);color:var(--ach);min-width:42px;text-transform:uppercase;letter-spacing:0.1em;padding-top:1px">Detail</span><span style="font:400 9px/1.4 var(--m);color:#ddd">${desc.detail}</span></div>`;
    }
    const html = `<div style="display:flex;align-items:stretch;border-bottom:1px solid rgba(255,255,255,0.08)"><div style="width:3px;background:${color}"></div><div style="font:600 10px/1.2 var(--bc);color:#fff;flex:1;letter-spacing:0.04em;text-transform:uppercase;padding:6px 8px">${f.name || 'Point'}</div><div style="font:400 7px/1 var(--m);color:var(--ach);border-left:1px solid rgba(255,255,255,0.08);padding:0 6px;display:flex;align-items:center">${f._period || ''}</div></div>${body ? `<div style="padding:6px 8px 8px">${body}</div>` : ''}`;
    new mapboxgl.Popup({ closeButton: true, maxWidth: '260px', className: 'algor-popup' })
      .setLngLat(e.lngLat).setHTML(html).addTo(editorMap);
  });
  editorMap.on('mouseenter', STATIC_LAYER_DOTS, () => {
    editorMap.getCanvas().style.cursor = 'pointer';
  });
  editorMap.on('mouseleave', STATIC_LAYER_DOTS, () => {
    editorMap.getCanvas().style.cursor = 'crosshair';
  });
}

export async function renderAdminPoints(points) {
  adminPointsData = points;
  if (mapReadyPromise) await mapReadyPromise;
  const features = points.map(p => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: p.coordinates },
    properties: {
      _id: p.id,
      _color: p._color || '#888888',
      _casualties: p._casualties || 0,
      name: p.name,
      period: p.period,
      description: p.description
    }
  }));
  const src = editorMap.getSource(ADMIN_SOURCE);
  if (src) src.setData({ type: 'FeatureCollection', features });
}

export function selectPoint(pointId) {
  selectedPointId = pointId;
  editorMap.setFilter(ADMIN_LAYER_SELECTED, ['==', ['get', '_id'], pointId || '']);
}

export function clearSelection() {
  selectedPointId = null;
  editorMap.setFilter(ADMIN_LAYER_SELECTED, ['==', ['get', '_id'], '']);
}

export function flyToPoint(coords) {
  editorMap.flyTo({ center: coords, zoom: 8, duration: 1200 });
}

export function onMapClick(cb) { onMapClickCb = cb; }
export function onPointClick(cb) { onPointClickCb = cb; }

export function switchZone(zoneConfig) {
  if (!editorMap) return;
  editorMap.flyTo({
    center: zoneConfig.MAP_CENTER,
    zoom: zoneConfig.MAP_ZOOM || 5,
    bearing: zoneConfig.MAP_BEARING || 0,
    duration: 1500
  });
}

export async function renderStaticPoints(features) {
  if (mapReadyPromise) await mapReadyPromise;
  const src = editorMap.getSource(STATIC_SOURCE);
  if (src) src.setData({ type: 'FeatureCollection', features });
}

export function destroy() {
  if (editorMap) { editorMap.remove(); editorMap = null; }
}
