/**
 * map-editor.js — Carte Mapbox editeur avec click-to-add et selection de points
 */

let editorMap = null;
let adminPointsData = [];
let onMapClickCb = null;
let onPointClickCb = null;
let selectedPointId = null;

const ADMIN_SOURCE = 'admin-points';
const ADMIN_LAYER_DOTS = 'admin-dots';
const ADMIN_LAYER_GLOW = 'admin-glow';
const ADMIN_LAYER_SELECTED = 'admin-selected';

export function getMap() { return editorMap; }

export function initEditorMap(container, zoneConfig) {
  if (editorMap) { editorMap.remove(); editorMap = null; }

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
  });

  return editorMap;
}

function addAdminSource() {
  editorMap.addSource(ADMIN_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });
}

function addAdminLayers() {
  editorMap.addLayer({
    id: ADMIN_LAYER_GLOW,
    type: 'circle',
    source: ADMIN_SOURCE,
    paint: {
      'circle-radius': 12,
      'circle-color': ['get', '_color'],
      'circle-opacity': 0.15,
      'circle-blur': 0.6
    }
  });

  editorMap.addLayer({
    id: ADMIN_LAYER_DOTS,
    type: 'circle',
    source: ADMIN_SOURCE,
    paint: {
      'circle-radius': 6,
      'circle-color': ['get', '_color'],
      'circle-stroke-color': '#c49a3c',
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
      'circle-stroke-color': '#e0b452',
      'circle-stroke-width': 2.5
    }
  });
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
}

export function renderAdminPoints(points) {
  adminPointsData = points;
  const features = points.map(p => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: p.coordinates },
    properties: {
      _id: p.id,
      _color: p._color || '#888888',
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

export function destroy() {
  if (editorMap) { editorMap.remove(); editorMap = null; }
}
