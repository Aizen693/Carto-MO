/**
 * engine.js — Moteur cartographique partage Carto-MO
 *
 * Chaque page de zone definit un objet global ZONE_CONFIG avant de charger ce script.
 * ZONE_CONFIG contient : OTAN_DATA, ACTOR_GROUPS, ACTOR_COLORS, normalizeName,
 * PERIODS, STYLES, MAP_CENTER, MAP_ZOOM, MAP_BEARING, MAP_ZONES,
 * BADGE_ALL_TEXT, TUTORIAL_KEY
 */

// ── ACCESS TOKEN (partage) ───────────────────────────────────────────
mapboxgl.accessToken = 'pk.eyJ1IjoiYXo2OTMiLCJhIjoiY21uMGlhY2ZyMGx6bDJycjAxYWZjbWt5eiJ9.SQqOLLgLwWKnUGMztrSArg';

// ── DESTRUCTURATION ZONE_CONFIG ──────────────────────────────────────
const { OTAN_DATA, ACTOR_GROUPS, ACTOR_COLORS, PERIODS, STYLES, MAP_ZONES } = ZONE_CONFIG;

function getColor(n) { return ACTOR_COLORS[n] || '#888888'; }
function normalizeName(raw) { return ZONE_CONFIG.normalizeName(raw); }

// ── COTATIONS OTAN ───────────────────────────────────────────────────
function getOtanData(period, actor, event) {
  const exactKey = `${period}|${actor}|${event}`;
  if (OTAN_DATA[exactKey]) return OTAN_DATA[exactKey];
  if (!event) return null;
  const prefix = `${period}|${actor}|`;
  const eventLower = event.toLowerCase().trim();
  for (const [key, val] of Object.entries(OTAN_DATA)) {
    if (!key.startsWith(prefix)) continue;
    const keyEvent = key.slice(prefix.length).toLowerCase();
    if (keyEvent.includes(eventLower) || eventLower.includes(keyEvent.substring(0, 20))) return val;
  }
  return null;
}

function otanColor(cotation) {
  if (!cotation) return '#6b7280';
  const letter = cotation[0];
  const colors = { A: '#22c55e', B: '#84cc16', C: '#eab308', D: '#f97316', E: '#ef4444', F: '#dc2626' };
  return colors[letter] || '#6b7280';
}

// ── PARSING ──────────────────────────────────────────────────────────
function parseDesc(raw) {
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
  return Object.keys(r).length ? r : { raw };
}

function makePopupHTML(p) {
  const color = p._color || '#888';
  const desc = p._desc && p._desc !== 'null' ? parseDesc(p._desc) : null;
  const otan = desc && desc.event ? getOtanData(p._period, p.name, desc.event) : null;
  let body = '';
  if (desc) {
    if (desc.date)   body += `<div class="popup-row"><span class="popup-key">Date</span><span class="popup-val bold">${desc.date}</span></div>`;
    if (desc.pays)   body += `<div class="popup-row"><span class="popup-key">Pays</span><span class="popup-val">${desc.pays}</span></div>`;
    if (desc.event)  body += `<div class="popup-row"><span class="popup-key">Événement</span><span class="popup-val bold">${desc.event}</span></div>`;
    if (desc.detail) body += `<div class="popup-row"><span class="popup-key">Détail</span><span class="popup-val">${desc.detail}</span></div>`;
    if (desc.raw)    body += `<div class="popup-row"><span class="popup-val" style="white-space:pre-line;color:#ffffff">${desc.raw}</span></div>`;
  }
  let otanBlock = '';
  if (otan && otan.cotation) {
    const c = otanColor(otan.cotation);
    const linksHtml = (otan.links || []).map(l =>
      `<a href="${l.url}" target="_blank" style="font-family:'JetBrains Mono',monospace;color:#c49a3c;font-size:8px;text-decoration:none;border:1px solid rgba(196,154,60,0.25);padding:2px 7px;letter-spacing:0.06em;text-transform:uppercase;">${l.name}</a>`
    ).join(' ');
    otanBlock = `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="background:${c};color:#fff;font-size:11px;font-weight:800;padding:2px 9px;border-radius:6px;letter-spacing:1px;">${otan.cotation}</span>${linksHtml}</div>`;
  }
  return `<div class="popup-header"><div class="popup-dot-bar" style="background:${color}"></div><div class="popup-actor">${p.name || 'Point'}</div><div class="popup-period-badge">${p._period || ''}</div></div>${body || otanBlock ? `<div class="popup-body">${body}${otanBlock}</div>` : ''}`;
}

// ── CONFIGURATION ────────────────────────────────────────────────────
const PITCH_THRESHOLD = 20;

let activePeriods = new Set(), activeFilter = null, mapReady = false;
let showAll = false, is3DMode = false, isPlaying = false, playInterval = null;
let compareMode = false, comparePeriod = null, map2Instance = null;
let heatmapVisible = false;
const loadedData = {};

// ── CARTE ────────────────────────────────────────────────────────────
const map = new mapboxgl.Map({
  container: 'map',
  style: STYLES.standard,
  center: ZONE_CONFIG.MAP_CENTER,
  zoom: ZONE_CONFIG.MAP_ZOOM,
  pitch: 0,
  bearing: ZONE_CONFIG.MAP_BEARING,
  maxPitch: 85,
  antialias: true
});
map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right');
map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

// ── BOUTONS PERIODES ─────────────────────────────────────────────────
const btnContainer = document.getElementById('period-buttons');
PERIODS.forEach((p, i) => {
  const btn = document.createElement('button');
  btn.className = 'period-btn'; btn.textContent = p.label; btn.id = 'pbtn-' + i;
  btn.onclick = () => togglePeriod(i);
  btnContainer.appendChild(btn);
});

// ── SLIDER ───────────────────────────────────────────────────────────
const slider = document.getElementById('timeline-slider');
const sliderLabel = document.getElementById('slider-label');
slider.max = PERIODS.length - 1;

function updateSliderLabel(i) {
  const pct = i / (PERIODS.length - 1), tw = slider.offsetWidth;
  sliderLabel.style.left = (pct * (tw - 16) + 8) + 'px';
  sliderLabel.textContent = PERIODS[i].label;
}
slider.addEventListener('input', function () {
  const i = parseInt(this.value); updateSliderLabel(i);
  if (!isPlaying) togglePeriod(i); else jumpTo(i);
});
window.addEventListener('resize', () => updateSliderLabel(parseInt(slider.value)));

function centerMap() {
  map.flyTo({ center: ZONE_CONFIG.MAP_CENTER, zoom: ZONE_CONFIG.MAP_ZOOM, pitch: 0, bearing: ZONE_CONFIG.MAP_BEARING, duration: 1500, essential: true });
}

let chartOpen = false;
function toggleChart() {
  chartOpen = !chartOpen;
  document.getElementById('chart-panel').classList.toggle('open', chartOpen);
}

function updateChart(features) {
  const counts = {};
  features.forEach(f => { const n = f.properties.name; if (!n) return; counts[n] = (counts[n] || 0) + 1; });
  const total = features.filter(f => f.geometry && f.geometry.type === 'Point').length;
  document.getElementById('chart-total').textContent = total + ' pts';
  document.getElementById('chart-tab-count').textContent = total;
  animateCounter(total);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = sorted.length ? sorted[0][1] : 1;
  const body = document.getElementById('chart-body');
  body.innerHTML = '';
  sorted.forEach(([name, count]) => {
    const color = getColor(name), pct = (count / max * 100).toFixed(0);
    const row = document.createElement('div'); row.className = 'bar-row';
    row.innerHTML = `<span class="bar-label" title="${name}">${name}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div><span class="bar-num">${count}</span>`;
    body.appendChild(row);
  });
}

// ── COMPARAISON ──────────────────────────────────────────────────────
function toggleComparePanel() {
  const panel = document.getElementById('compare-panel');
  const isVisible = panel.style.display === 'block';
  panel.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) buildCompareSelect();
}
function buildCompareSelect() {
  const sel = document.getElementById('compare-select'); sel.innerHTML = '';
  PERIODS.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'cmp-btn' + (comparePeriod === i ? ' selected' : '');
    btn.textContent = p.label; btn.onclick = () => selectComparePeriod(i);
    sel.appendChild(btn);
  });
}
function selectComparePeriod(index) {
  comparePeriod = index;
  document.querySelectorAll('.cmp-btn').forEach((b, i) => b.classList.toggle('selected', i === index));
  enableCompare(index);
}
function enableCompare(secondIndex) {
  compareMode = true;
  document.getElementById('map2').style.display = 'block';
  document.getElementById('split-label-1').style.display = 'block';
  document.getElementById('split-label-2').style.display = 'block';
  const p1 = activePeriods.size === 1 ? PERIODS[[...activePeriods][0]].label : 'Période 1';
  document.getElementById('split-label-1').textContent = p1;
  document.getElementById('split-label-2').textContent = PERIODS[secondIndex].label;
  document.getElementById('btn-compare').classList.add('active');
  if (map2Instance) { map2Instance.remove(); map2Instance = null; }
  map2Instance = new mapboxgl.Map({
    container: 'map2', style: map.getStyle() || STYLES.standard,
    center: map.getCenter(), zoom: map.getZoom(),
    pitch: map.getPitch(), bearing: map.getBearing(), antialias: true
  });
  map2Instance.on('load', async () => { setupMapLayersOn(map2Instance); await renderOnMap(map2Instance, secondIndex); });
  map.on('move', syncMaps);
  map2Instance.on('move', () => {
    map.off('move', syncMaps);
    map.setCenter(map2Instance.getCenter()); map.setZoom(map2Instance.getZoom());
    setTimeout(() => map.on('move', syncMaps), 50);
  });
}
function syncMaps() {
  if (!map2Instance) return;
  map2Instance.setCenter(map.getCenter()); map2Instance.setZoom(map.getZoom());
  map2Instance.setPitch(map.getPitch()); map2Instance.setBearing(map.getBearing());
}
function closeCompare() {
  compareMode = false; comparePeriod = null;
  document.getElementById('compare-panel').style.display = 'none';
  document.getElementById('map2').style.display = 'none';
  document.getElementById('split-label-1').style.display = 'none';
  document.getElementById('split-label-2').style.display = 'none';
  document.getElementById('btn-compare').classList.remove('active');
  if (map2Instance) { map.off('move', syncMaps); map2Instance.remove(); map2Instance = null; }
}

function updateProgress() {
  if (!activePeriods.size) { document.getElementById('progress-fill').style.width = '0%'; return; }
  const pct = ((Math.max(...activePeriods) + 1) / PERIODS.length * 100);
  document.getElementById('progress-fill').style.width = pct + '%';
}

function togglePlay() {
  isPlaying = !isPlaying;
  const btn = document.getElementById('btn-play');
  if (isPlaying) {
    btn.textContent = '\u23F8'; btn.classList.add('playing');
    activePeriods = new Set(); showAll = false;
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-all').classList.remove('active');
    let current = 0; addPeriod(current);
    playInterval = setInterval(() => {
      current++;
      if (current >= PERIODS.length) { togglePlay(); return; }
      addPeriod(current);
    }, 2000);
  } else {
    btn.textContent = 'Play'; btn.classList.remove('playing');
    clearInterval(playInterval); playInterval = null;
  }
}
function addPeriod(index) {
  activePeriods.add(index);
  document.getElementById('pbtn-' + index).classList.add('active');
  slider.value = index; updateSliderLabel(index);
  updateBadge(); updateProgress();
  if (mapReady) renderAll();
}
function jumpTo(index) {
  activePeriods = new Set([index]); showAll = false; slider.value = index; updateSliderLabel(index);
  document.querySelectorAll('.period-btn').forEach((b, i) => b.classList.toggle('active', i === index));
  document.getElementById('btn-all').classList.remove('active');
  updateBadge(); updateProgress(); if (mapReady) renderAll();
}

let legendOpen = true;
function toggleLegend() {
  legendOpen = !legendOpen;
  document.getElementById('legend-body').classList.toggle('collapsed', !legendOpen);
  document.getElementById('legend-toggle').classList.toggle('open', legendOpen);
}

map.on('pitch', () => {
  const nm = map.getPitch() > PITCH_THRESHOLD;
  if (nm !== is3DMode) { is3DMode = nm; if (mapReady && activePeriods.size > 0) updatePointDisplay(); }
});

function togglePeriod(index) {
  if (isPlaying) togglePlay();
  if (showAll) { showAll = false; document.getElementById('btn-all').classList.remove('active'); }
  if (activePeriods.has(index)) { activePeriods.delete(index); document.getElementById('pbtn-' + index).classList.remove('active'); }
  else { activePeriods.add(index); document.getElementById('pbtn-' + index).classList.add('active'); slider.value = index; updateSliderLabel(index); }
  updateBadge(); updateProgress(); if (mapReady) renderAll();
}
function toggleAll() {
  if (isPlaying) togglePlay();
  showAll = !showAll;
  document.getElementById('btn-all').classList.toggle('active', showAll);
  activePeriods = showAll ? new Set(PERIODS.map((_, i) => i)) : new Set();
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', showAll));
  updateBadge(); updateProgress(); if (mapReady) renderAll();
}
function updateBadge() {
  const b = document.getElementById('period-badge');
  if (!b) return;
  if (!activePeriods.size) b.textContent = 'Aucune période';
  else if (activePeriods.size === PERIODS.length) b.textContent = ZONE_CONFIG.BADGE_ALL_TEXT;
  else if (activePeriods.size === 1) b.textContent = PERIODS[[...activePeriods][0]].label;
  else b.textContent = activePeriods.size + ' périodes';
}

function toggleActorFilter(name) {
  activeFilter = activeFilter === name ? null : name;
  document.querySelectorAll('.legend-item').forEach(el => {
    if (!activeFilter) { el.classList.remove('filtered-out', 'active-filter'); }
    else if (el.dataset.actor === activeFilter) { el.classList.add('active-filter'); el.classList.remove('filtered-out'); }
    else { el.classList.add('filtered-out'); el.classList.remove('active-filter'); }
  });
  if (mapReady && activePeriods.size > 0) applyFilter();
}
function applyFilter() {
  const ptFilter = activeFilter ? ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'name'], activeFilter]] : ['==', ['geometry-type'], 'Point'];
  ['kml-dots', 'kml-dots-glow', 'kml-pulse', 'kml-points-labels'].forEach(id => { if (map.getLayer(id)) map.setFilter(id, ptFilter); });
  ['kml-cylinders', 'kml-cylinders-top'].forEach(id => { if (map.getLayer(id)) map.setFilter(id, activeFilter ? ['==', ['get', 'name'], activeFilter] : null); });
}

// ── CHARGEMENT KML ───────────────────────────────────────────────────
async function loadKML(index) {
  if (loadedData[index]) return loadedData[index];
  try {
    let geo, descMap = {};
    const res = await fetch('./' + PERIODS[index].file);
    if (!res.ok) throw new Error('404');
    if (PERIODS[index].file.endsWith('.geojson')) {
      geo = await res.json();
      geo.features.forEach((f, i) => {
        const d = f.properties.description || '';
        descMap[i] = d.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() || null;
      });
    } else {
      const text = await res.text();
      const dom = new DOMParser().parseFromString(text, 'text/xml');
      dom.querySelectorAll('Placemark').forEach((pm, i) => {
        const de = pm.querySelector('description');
        if (de) { const raw = de.textContent || ''; descMap[i] = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() || null; }
      });
      geo = toGeoJSON.kml(dom);
    }
    const cleaned = [];
    geo.features.forEach((f, i) => {
      f.properties = f.properties || {};
      const name = normalizeName(f.properties.name || ''); if (!name) return;
      f.properties.name = name; f.properties._period = PERIODS[index].label;
      f.properties._color = getColor(name); f.properties._desc = descMap[i] || null;
      if (descMap[i]) {
        const nm = descMap[i].match(/([0-9][0-9 ]*)\s*(?:tués?|morts?|victimes?|blessés?|hommes)/gi);
        if (nm) { const vals = nm.map(n => parseInt(n.replace(/\s/g, ''))).filter(n => !isNaN(n) && n > 0); f.properties._casualties = vals.length ? Math.max(...vals) : 0; }
        else f.properties._casualties = 0;
      } else f.properties._casualties = 0;
      if (f.geometry && f.geometry.type === 'Point') f.geometry.coordinates = [f.geometry.coordinates[0], f.geometry.coordinates[1]];
      cleaned.push(f);
    });
    geo.features = cleaned; loadedData[index] = geo; return geo;
  } catch (e) { console.warn('KML non chargé:', PERIODS[index].file); return null; }
}

function createCircleMeters(center, r, steps) {
  const coords = [], rKm = r / 1000;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI, dx = rKm / 111.32, dy = rKm / (111.32 * Math.cos(center[1] * Math.PI / 180));
    coords.push([center[0] + dy * Math.cos(a), center[1] + dx * Math.sin(a)]);
  }
  coords.push(coords[0]); return coords;
}
function pointsToCircles(features, r) {
  return features.filter(f => f.geometry && f.geometry.type === 'Point').map(f => ({
    type: 'Feature', properties: { ...f.properties },
    geometry: { type: 'Polygon', coordinates: [createCircleMeters(f.geometry.coordinates, r, 20)] }
  }));
}
function updatePointDisplay() {
  ['kml-dots-glow', 'kml-dots', 'kml-pulse'].forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', is3DMode ? 'none' : 'visible'); });
  ['kml-cylinders', 'kml-cylinders-top'].forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', is3DMode ? 'visible' : 'none'); });
}

async function renderAll() {
  ['kml-dots-glow', 'kml-dots', 'kml-pulse', 'kml-cylinders', 'kml-cylinders-top', 'kml-points-labels', 'kml-lines', 'kml-fill', 'kml-fill-outline'].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
  if (map.getSource('kml-circles')) map.removeSource('kml-circles');
  if (map.getSource('kml-current')) map.removeSource('kml-current');
  if (!activePeriods.size) { updateLegend({}); updateChart([]); return; }
  const allFeatures = [];
  for (const index of activePeriods) { const geo = await loadKML(index); if (geo && geo.features) allFeatures.push(...geo.features); }
  if (!allFeatures.length) return;
  map.addSource('kml-current', { type: 'geojson', data: { type: 'FeatureCollection', features: allFeatures } });
  map.addSource('kml-circles', { type: 'geojson', data: { type: 'FeatureCollection', features: pointsToCircles(allFeatures, 40) } });
  addLayers(map, 'kml-current', 'kml-circles');
  setupPopupsAndTooltip(map);
  if (activeFilter) applyFilter();
  const actorsVisible = {};
  allFeatures.forEach(f => { const n = f.properties.name; if (n && !actorsVisible[n]) actorsVisible[n] = f.properties._color; });
  updateLegend(actorsVisible);
  updateChart(allFeatures);
  initHeatmap(allFeatures);
}

function addLayers(m, srcPts, srcCircles) {
  m.addLayer({ id: 'kml-pulse', type: 'circle', source: srcPts, filter: ['==', ['geometry-type'], 'Point'], layout: { visibility: is3DMode ? 'none' : 'visible' }, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 7, 7, 12, 12, 18], 'circle-color': ['get', '_color'], 'circle-opacity': 0, 'circle-stroke-color': ['get', '_color'], 'circle-stroke-width': 1, 'circle-stroke-opacity': 0.25, 'circle-pitch-alignment': 'map', 'circle-pitch-scale': 'map' } });
  m.addLayer({ id: 'kml-dots-glow', type: 'circle', source: srcPts, filter: ['==', ['geometry-type'], 'Point'], layout: { visibility: is3DMode ? 'none' : 'visible' }, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 7, 9, 12, 14], 'circle-color': ['get', '_color'], 'circle-opacity': 0.12, 'circle-blur': 0.8, 'circle-pitch-alignment': 'map', 'circle-pitch-scale': 'map' } });
  m.addLayer({
    id: 'kml-dots', type: 'circle', source: srcPts, filter: ['==', ['geometry-type'], 'Point'],
    layout: { visibility: is3DMode ? 'none' : 'visible' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        3, ['interpolate', ['linear'], ['get', '_casualties'], 0, 3.5, 10, 4, 100, 4.5, 500, 5, 1000, 5.5, 10000, 6.5],
        7, ['interpolate', ['linear'], ['get', '_casualties'], 0, 5, 10, 5.5, 100, 6.5, 500, 7.5, 1000, 8.5, 10000, 10],
        12, ['interpolate', ['linear'], ['get', '_casualties'], 0, 7, 10, 8, 100, 9.5, 500, 11, 1000, 13, 10000, 16]
      ],
      'circle-color': ['get', '_color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-opacity': 1, 'circle-pitch-alignment': 'map', 'circle-pitch-scale': 'map'
    }
  });
  m.addLayer({ id: 'kml-cylinders', type: 'fill-extrusion', source: srcCircles, layout: { visibility: is3DMode ? 'visible' : 'none' }, paint: { 'fill-extrusion-color': ['get', '_color'], 'fill-extrusion-height': 300, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.95 } });
  m.addLayer({ id: 'kml-cylinders-top', type: 'fill-extrusion', source: srcCircles, layout: { visibility: is3DMode ? 'visible' : 'none' }, paint: { 'fill-extrusion-color': ['get', '_color'], 'fill-extrusion-height': 320, 'fill-extrusion-base': 295, 'fill-extrusion-opacity': 1 } });
  m.addLayer({ id: 'kml-points-labels', type: 'symbol', source: srcPts, filter: ['==', ['geometry-type'], 'Point'], minzoom: 10, layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'], 'text-optional': true, 'text-pitch-alignment': 'map' }, paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 2, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 12, 1] } });
  m.addLayer({ id: 'kml-lines', type: 'line', source: srcPts, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': ['get', '_color'], 'line-width': 2.5, 'line-opacity': 0.85 } });
  m.addLayer({ id: 'kml-fill', type: 'fill', source: srcPts, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': ['get', '_color'], 'fill-opacity': 0.35 } });
  m.addLayer({ id: 'kml-fill-outline', type: 'line', source: srcPts, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': ['get', '_color'], 'line-width': 1.5 } });
  let op = 0.1, dir = 1;
  (function pulse() {
    op += 0.015 * dir; if (op > 0.65) dir = -1; if (op < 0.05) dir = 1;
    if (m.getLayer('kml-pulse')) m.setPaintProperty('kml-pulse', 'circle-stroke-opacity', op);
    requestAnimationFrame(pulse);
  })();
}

function setupPopupsAndTooltip(m) {
  ['kml-dots', 'kml-fill', 'kml-cylinders'].forEach(layerId => {
    m.on('click', layerId, (e) => {
      const p = e.features[0].properties;
      const popup = new mapboxgl.Popup({ closeButton: true, maxWidth: '310px', className: 'algor-popup' })
        .setLngLat(e.lngLat).setHTML(makePopupHTML(p)).addTo(m);
      popup.getElement()?.querySelector('.mapboxgl-popup-close-button')?.addEventListener('click', () => popup.remove());
    });
    m.on('mouseenter', layerId, () => m.getCanvas().style.cursor = 'pointer');
    m.on('mouseleave', layerId, () => m.getCanvas().style.cursor = '');
  });
}

async function renderOnMap(m, periodIndex) {
  const geo = await loadKML(periodIndex);
  if (!geo || !geo.features) return;
  const srcId = 'kml-cmp-pts', srcCId = 'kml-cmp-circles';
  ['kml-pulse', 'kml-dots-glow', 'kml-dots', 'kml-cylinders', 'kml-cylinders-top', 'kml-points-labels', 'kml-lines', 'kml-fill', 'kml-fill-outline'].forEach(id => { if (m.getLayer(id)) m.removeLayer(id); });
  if (m.getSource(srcCId)) m.removeSource(srcCId);
  if (m.getSource(srcId)) m.removeSource(srcId);
  m.addSource(srcId, { type: 'geojson', data: { type: 'FeatureCollection', features: geo.features } });
  m.addSource(srcCId, { type: 'geojson', data: { type: 'FeatureCollection', features: pointsToCircles(geo.features, 40) } });
  addLayers(m, srcId, srcCId);
  setupPopupsAndTooltip(m);
}

function updateLegend(actors) {
  const container = document.getElementById('legend-items');
  container.innerHTML = '';
  if (!Object.keys(actors).length) { container.innerHTML = '<div style="font-size:11px;color:#6b7280;padding:4px 14px">Sélectionne une période</div>'; return; }
  Object.entries(ACTOR_GROUPS).forEach(([groupName, members]) => {
    const visible = members.filter(m => actors[m]);
    if (!visible.length) return;
    const group = document.createElement('div'); group.className = 'legend-group';
    group.innerHTML = '<div class="legend-group-title">' + groupName + '</div>';
    visible.forEach(name => {
      const color = actors[name];
      const item = document.createElement('div'); item.className = 'legend-item'; item.dataset.actor = name;
      if (activeFilter === name) item.classList.add('active-filter');
      else if (activeFilter) item.classList.add('filtered-out');
      item.innerHTML = '<div class="legend-dot" style="background:' + color + ';box-shadow:0 0 4px ' + color + '66"></div><span>' + name + '</span>';
      item.onclick = () => toggleActorFilter(name);
      group.appendChild(item);
    });
    container.appendChild(group);
  });
}

function setStyle(s) {
  document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-' + s).classList.add('active');
  mapReady = false; map.setStyle(STYLES[s]);
  map.once('style.load', () => { setupMapLayersOn(map); mapReady = true; renderAll(); });
}

function setupMapLayersOn(m) {
  try {
    if (!m.getSource('mapbox-dem')) m.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
    m.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 });
  } catch (e) { console.warn('Terrain non supporté:', e); }
  try {
    if (!m.getLayer('sky')) m.addLayer({ id: 'sky', type: 'sky', paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun': [220, 8], 'sky-atmosphere-sun-intensity': 14, 'sky-atmosphere-color': 'rgba(30,100,220,1.0)', 'sky-atmosphere-halo-color': 'rgba(255,140,40,0.9)', 'sky-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0, 4, 0.4, 7, 1.0] } });
  } catch (e) { console.warn('Sky non supporté:', e); }
  try { m.setLight({ anchor: 'map', color: '#ffd580', intensity: 0.8, position: [1.5, 200, 10] }); } catch (e) {}
  try {
    if (m.getSource('composite') && !m.getLayer('3d-buildings')) m.addLayer({ id: '3d-buildings', source: 'composite', 'source-layer': 'building', filter: ['==', 'extrude', 'true'], type: 'fill-extrusion', minzoom: 10, paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'height'], 0, '#d4c5a9', 30, '#b8a88a', 80, '#a09070', 200, '#6a5a48'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': ['get', 'min_height'], 'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 12, 0.9], 'fill-extrusion-ambient-occlusion-intensity': 0.5, 'fill-extrusion-ambient-occlusion-radius': 4 } });
  } catch (e) {}
}

// ── RECHERCHE ────────────────────────────────────────────────────────
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
searchInput.addEventListener('input', function () {
  const q = this.value.trim().toLowerCase();
  searchResults.style.display = 'none'; searchResults.innerHTML = '';
  if (!q || q.length < 2) return;
  const matches = [];
  Object.values(loadedData).forEach(geo => {
    if (!geo) return;
    geo.features.forEach(f => {
      if (!f.geometry || f.geometry.type !== 'Point') return;
      const name = (f.properties.name || '').toLowerCase();
      const desc = (f.properties._desc || '').toLowerCase();
      if (name.includes(q) || desc.includes(q)) matches.push(f);
    });
  });
  if (!matches.length) return;
  const seen = new Set();
  matches.slice(0, 12).forEach(f => {
    const key = f.properties.name + '_' + f.properties._period;
    if (seen.has(key)) return; seen.add(key);
    const div = document.createElement('div'); div.className = 'search-result';
    const color = f.properties._color || '#888';
    const parsed = f.properties._desc ? parseDesc(f.properties._desc) : null;
    const lieu = parsed && parsed.pays ? parsed.pays : '';
    const evt = parsed && parsed.event ? parsed.event : '';
    div.innerHTML = '<div class="search-result-dot" style="background:' + color + '"></div>' +
      '<div><div class="search-result-name">' + f.properties.name + '</div>' +
      '<div class="search-result-sub">' + (evt || lieu || '') + (lieu && evt ? ' · ' : '') + f.properties._period + '</div></div>';
    div.onclick = () => {
      const coords = f.geometry.coordinates;
      map.flyTo({ center: coords, zoom: 10, duration: 1200, essential: true });
      searchResults.style.display = 'none'; searchInput.value = '';
      setTimeout(() => {
        const sp = new mapboxgl.Popup({ closeButton: true, maxWidth: '310px', className: 'algor-popup' })
          .setLngLat(coords).setHTML(makePopupHTML(f.properties)).addTo(map);
        sp.getElement()?.querySelector('.mapboxgl-popup-close-button')?.addEventListener('click', () => sp.remove());
      }, 1300);
    };
    searchResults.appendChild(div);
  });
  searchResults.style.display = 'block';
});
document.addEventListener('click', (e) => {
  if (!document.getElementById('search-box').contains(e.target)) searchResults.style.display = 'none';
});

// ── COMPTEUR ─────────────────────────────────────────────────────────
let counterInterval = null, counterTarget = 0, counterCurrent = 0;
function animateCounter(target) {
  clearInterval(counterInterval);
  const counter = document.getElementById('event-counter');
  counter.style.display = 'block';
  counterTarget = target;
  if (counterCurrent > target) counterCurrent = 0;
  const step = Math.max(1, Math.ceil((target - counterCurrent) / 30));
  counterInterval = setInterval(() => {
    counterCurrent = Math.min(counterCurrent + step, counterTarget);
    counter.textContent = counterCurrent.toLocaleString() + ' événements';
    if (counterCurrent >= counterTarget) clearInterval(counterInterval);
  }, 40);
}

// ── EXPORT PNG ────────────────────────────────────────────────────────
function exportMap() {
  const btn = document.getElementById('btn-export');
  btn.textContent = '\u23F3 Export...';
  map.once('render', () => {
    const canvas = map.getCanvas();
    const link = document.createElement('a');
    const period = activePeriods.size === 1 ? PERIODS[[...activePeriods][0]].label : 'carte-' + new Date().toISOString().slice(0, 10);
    link.download = 'algor-int-' + period + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    btn.textContent = 'PNG';
  });
  map.triggerRepaint();
}

// ── HEATMAP ──────────────────────────────────────────────────────────
function initHeatmap(features) {
  const pts = features.filter(f => f.geometry && f.geometry.type === 'Point');
  if (map.getSource('heatmap-src')) {
    map.getSource('heatmap-src').setData({ type: 'FeatureCollection', features: pts });
  } else {
    map.addSource('heatmap-src', { type: 'geojson', data: { type: 'FeatureCollection', features: pts } });
    map.addLayer({
      id: 'heatmap-layer', type: 'heatmap', source: 'heatmap-src', maxzoom: 14,
      layout: { visibility: 'none' },
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', '_casualties'], 0, 0.3, 100, 1, 1000, 2, 10000, 4],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 10, 2],
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
          0,   'rgba(0,0,255,0)',
          0.1, 'rgba(65,105,225,0.6)',
          0.3, 'rgba(0,200,150,0.7)',
          0.5, 'rgba(255,220,0,0.8)',
          0.7, 'rgba(255,120,0,0.9)',
          1.0, 'rgba(220,20,20,1)'
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 20, 7, 35, 12, 50],
        'heatmap-opacity': 0.75,
      }
    }, 'kml-dots-glow');
  }
}
function toggleHeatmap() {
  heatmapVisible = !heatmapVisible;
  document.getElementById('btn-heatmap').classList.toggle('active', heatmapVisible);
  if (map.getLayer('heatmap-layer')) map.setLayoutProperty('heatmap-layer', 'visibility', heatmapVisible ? 'visible' : 'none');
}

// ── TOOLTIP SURVOL ───────────────────────────────────────────────────
const tooltip = document.getElementById('hover-tooltip');
map.on('mousemove', 'kml-dots', (e) => {
  if (!e.features || !e.features[0]) return;
  const p = e.features[0].properties;
  const color = p._color || '#888';
  tooltip.innerHTML = '<span class="tooltip-dot" style="background:' + color + '"></span>' + (p.name || '');
  tooltip.style.display = 'block';
  tooltip.style.left = (e.originalEvent.clientX + 12) + 'px';
  tooltip.style.top  = (e.originalEvent.clientY - 8)  + 'px';
});
map.on('mouseleave', 'kml-dots', () => { tooltip.style.display = 'none'; });

// ── TUTORIEL ─────────────────────────────────────────────────────────
function closeTutorial() {
  const ov = document.getElementById('tutorial-overlay');
  if (ov) ov.style.display = 'none';
  localStorage.setItem(ZONE_CONFIG.TUTORIAL_KEY, '1');
}
(function () {
  const seen = localStorage.getItem(ZONE_CONFIG.TUTORIAL_KEY);
  const el = document.getElementById('tutorial-overlay');
  if (!el) return;
  el.style.display = seen ? 'none' : 'flex';
})();

// ── INITIALISATION ───────────────────────────────────────────────────

map.on('load', async () => {
  setupMapLayersOn(map);
  mapReady = true;
  document.getElementById('loader').style.display = 'none';
  updateSliderLabel(0);
  // Prechargement en arriere-plan
  for (let i = 0; i < PERIODS.length; i++) { await loadKML(i); }
  // Auto-selection premiere periode
  togglePeriod(0);
});
map.on('error', (e) => console.warn('Mapbox error:', e));
