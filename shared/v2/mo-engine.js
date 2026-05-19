/**
 * mo-engine.js — Engine V2 dedie a la page moyen-orient-v2.html
 *
 * Autonome, ne charge PAS engine.js v1. Controle :
 *   - Init Mapbox style dark
 *   - Chargement data (Supabase prioritaire, fallback fichiers KML/GeoJSON)
 *   - Markers reticule 4-axes
 *   - Flux animes (axe IRGC + axe sunnite)
 *   - Popup briefing 5 lignes
 *   - Side panel droit "Analyse approfondie"
 *   - Legend severite cliquable
 *   - Acteurs groupes cliquables (filter)
 *   - Boutons periodes
 *   - Filtres sev>=3 + toggle flux
 */

import {
  pointToMarkerSpec,
  enrichFeatureProperties,
  sevColorExpr,
  confOpacityExpr,
  SEV_COLORS,
  SEV_LABELS,
  CONF_LABELS,
  formatImpact,
} from './marker-model.js?v=20260520a';

mapboxgl.accessToken = 'pk.eyJ1IjoiYXo2OTMiLCJhIjoiY21uMGlhY2ZyMGx6bDJycjAxYWZjbWt5eiJ9.SQqOLLgLwWKnUGMztrSArg';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

// ════════════════════════════════════════════════════════════════════
//  CONFIG MOYEN-ORIENT
// ════════════════════════════════════════════════════════════════════
const ZONE_ID = 'moyen-orient';

const ACTOR_GROUPS = {
  'Milices chiites': ['Hezbollah','Asaib Ahl al-Haq','IRGC-Qods Force','IRGC-Qods Force+Basij','Kataib Hezbollah','Basij','Kataib Sayyid al-Shuhada','Harakat Hezbollah al-Nujaba','Fatemiyoun Brigade','Zainebiyoun Brigade','PMF / Hashd al-Shaabi','PMF / Hashd al-Shaabi+Kataib Hezbollah','IRGC Ground Forces','Houthis'],
  'Djihadistes sunnites': ['Daesh','Daesh + Armées Irakiennes'],
  'Coalitions & États': ['Coalition Internationale','USA','USA, Force Delta','Israel / IDF','Armées Irakiennes','Armées Irakiennes + Peshmergas vs. Daesh'],
  'Kurdes & FDS': ['Peshmergas','Forces Démocratiques Syriennes'],
};

const ACTOR_COLORS = {
  'Hezbollah':'#e63946','Asaib Ahl al-Haq':'#ff6b35','IRGC-Qods Force':'#c1121f',
  'IRGC-Qods Force+Basij':'#9d0208','Kataib Hezbollah':'#ff4d6d','Basij':'#dc2f02',
  'Kataib Sayyid al-Shuhada':'#f48c06','Harakat Hezbollah al-Nujaba':'#e85d04',
  'Fatemiyoun Brigade':'#faa307','PMF / Hashd al-Shaabi':'#ffba08',
  'PMF / Hashd al-Shaabi+Kataib Hezbollah':'#e76f51','IRGC Ground Forces':'#ae2012',
  'Zainebiyoun Brigade':'#bb3e03','Houthis':'#7b2d8b','Daesh':'#a0a0a0',
  'Daesh + Armées Irakiennes':'#777777','Coalition Internationale':'#1d7ed8',
  'USA':'#0077b6','USA, Force Delta':'#023e8a','Israel / IDF':'#1a5f7a',
  'Peshmergas':'#ccaa00','Armées Irakiennes':'#2d6a4f',
  'Armées Irakiennes + Peshmergas vs. Daesh':'#40916c',
  'Forces Démocratiques Syriennes':'#48cae4',
};

const NORMALIZE = (raw) => {
  if (!raw) return null;
  const n = String(raw).trim();
  if (!n || /^\d{4}-\d{4}$/.test(n)) return null;
  const M = {
    'Asaib Ahl al-Haq ': 'Asaib Ahl al-Haq', 'Basij ': 'Basij',
    'Coalition': 'Coalition Internationale', 'Coalition Int.': 'Coalition Internationale',
    'Daesh-Armées Irakiennes': 'Daesh + Armées Irakiennes',
    'Force Démocratiques Syriennes': 'Forces Démocratiques Syriennes',
    'Hezbollah ': 'Hezbollah', 'IRGC-Qods': 'IRGC-Qods Force',
    'IRGC-Qods Force ': 'IRGC-Qods Force',
    'IRGC-Qods Force+Basij ': 'IRGC-Qods Force+Basij',
    'Kataib Hezbollah ': 'Kataib Hezbollah',
    'PMF / Hashd al-Shaabi ': 'PMF / Hashd al-Shaabi',
    ' PMF / Hashd al-Shaabi': 'PMF / Hashd al-Shaabi',
  };
  return M[n] !== undefined ? M[n] : n;
};

const PERIODS = [
  { label: '2005-2006', file: '2005-2006.geojson' },
  { label: '2007-2008', file: '2007-2008.geojson' },
  { label: '2009-2010', file: '2009-2010.geojson' },
  { label: '2011-2012', file: '2011-2012.geojson' },
  { label: '2013-2014', file: '2013-2014.geojson' },
  { label: '2015-2016', file: '2015-2016.geojson' },
  { label: '2017-2018', file: '2017-2018.geojson' },
  { label: '2019-2020', file: '2019-2020.geojson' },
  { label: '2021-2022', file: '2021-2022.geojson' },
  { label: '2023-2026', file: '2023-2026.geojson' },
];

const FLOWS = [
  { from: [51.3890, 35.6892], to: [44.3661, 33.3152], label: 'Téhéran → Bagdad',    intensity: 1.0,  side: 'chiite' },
  { from: [51.3890, 35.6892], to: [36.2765, 33.5138], label: 'Téhéran → Damas',     intensity: 0.95, side: 'chiite' },
  { from: [51.3890, 35.6892], to: [35.5018, 33.8938], label: 'Téhéran → Beyrouth',  intensity: 0.95, side: 'chiite' },
  { from: [51.3890, 35.6892], to: [44.2068, 15.3694], label: 'Téhéran → Sanaa',     intensity: 0.7,  side: 'chiite' },
  { from: [46.6753, 24.7136], to: [44.2068, 15.3694], label: 'Riyad → Sanaa',       intensity: 0.6,  side: 'sunnite' },
];

const MAP_CENTER = [43, 30];
const MAP_ZOOM = 4.7;
const MAP_BEARING = 0;

// ════════════════════════════════════════════════════════════════════
//  ÉTAT
// ════════════════════════════════════════════════════════════════════
const state = {
  features: [],          // all features (enriched)
  activePeriods: new Set(PERIODS.map((_, i) => i)),  // par defaut: tout actif
  actorFilter: null,
  sevFilter: false,      // filter sev>=3
  fluxVisible: false,
  selectedName: null,
  selectedFeature: null,
};

// ════════════════════════════════════════════════════════════════════
//  INIT MAP
// ════════════════════════════════════════════════════════════════════
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/dark-v11',
  center: MAP_CENTER,
  zoom: MAP_ZOOM,
  bearing: MAP_BEARING,
  pitch: 0,
  maxPitch: 65,
  antialias: true,
});
window.algorMapV2MO = map;

map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false, showCompass: false }), 'top-right');
map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right');

// ════════════════════════════════════════════════════════════════════
//  CHARGEMENT DONNEES
// ════════════════════════════════════════════════════════════════════
async function loadAll() {
  // Supabase d'abord
  if (typeof window.loadFirestorePoints === 'function') {
    try {
      const fsGeo = await window.loadFirestorePoints(ZONE_ID);
      if (fsGeo && fsGeo.features && fsGeo.features.length > 0) {
        return processFeatures(fsGeo.features);
      }
    } catch (e) {
      console.warn('[v2] Supabase fail, fallback files:', e.message);
    }
  }
  // Fallback fichiers
  const all = [];
  for (const p of PERIODS) {
    try {
      const r = await fetch(`./moyen-orient/${p.file}?v=20260520a`);
      if (!r.ok) continue;
      const geo = await r.json();
      if (geo?.features) {
        geo.features.forEach((f) => {
          f.properties = f.properties || {};
          f.properties._period = p.label;
        });
        all.push(...geo.features);
      }
    } catch (e) {
      console.warn('[v2] fetch fail:', p.file);
    }
  }
  return processFeatures(all);
}

function processFeatures(rawFeatures) {
  const out = [];
  for (const f of rawFeatures) {
    if (!f.geometry || f.geometry.type !== 'Point') continue;
    f.properties = f.properties || {};
    const name = NORMALIZE(f.properties.name);
    if (!name) continue;
    f.properties.name = name;
    f.properties._color = ACTOR_COLORS[name] || '#888888';
    // Description en plat (engine.js le faisait avec strip HTML)
    if (f.properties.description && !f.properties._desc) {
      f.properties._desc = String(f.properties.description)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim() || null;
    }
    if (f.properties._desc && f.properties._casualties == null) {
      const nm = f.properties._desc.match(/([0-9][0-9 ]*)\s*(?:tués?|morts?|victimes?|blessés?)/gi);
      if (nm) {
        const vals = nm.map((n) => parseInt(n.replace(/\s/g, ''))).filter((n) => !isNaN(n) && n > 0);
        f.properties._casualties = vals.length ? Math.max(...vals) : 0;
      } else f.properties._casualties = 0;
    }
    enrichFeatureProperties(f);
    out.push(f);
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════
//  RENDER MARKERS
// ════════════════════════════════════════════════════════════════════
function currentFilteredFeatures() {
  const activeLabels = new Set([...state.activePeriods].map((i) => PERIODS[i].label));
  return state.features.filter((f) => {
    if (!activeLabels.has(f.properties._period)) return false;
    if (state.actorFilter && f.properties.name !== state.actorFilter) return false;
    if (state.sevFilter && f.properties._sev < 3) return false;
    return true;
  });
}

function setSourceData() {
  const features = currentFilteredFeatures();
  const data = { type: 'FeatureCollection', features };
  if (map.getSource('v2-pts')) {
    map.getSource('v2-pts').setData(data);
  } else {
    map.addSource('v2-pts', { type: 'geojson', data });
  }
  return features;
}

function ensureLayers() {
  if (!map.isStyleLoaded()) return false;
  if (map.getLayer('v2-core')) return true;

  // Halo : seul sev 4
  map.addLayer({
    id: 'v2-halo',
    type: 'circle',
    source: 'v2-pts',
    filter: ['==', ['get', '_sev'], 4],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 10, 12, 28],
      'circle-color': '#c0392b',
      'circle-opacity': 0.22,
      'circle-blur': 0.5,
    },
  });

  // Anneau exterieur (reticule). Plus visible que l'overlay precedent.
  map.addLayer({
    id: 'v2-ring',
    type: 'circle',
    source: 'v2-pts',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        3, ['match', ['get', '_sev'], 1, 6, 2, 7, 3, 9, 4, 11, 7],
        12, ['match', ['get', '_sev'], 1, 11, 2, 13, 3, 16, 4, 20, 13]],
      'circle-color': 'transparent',
      'circle-stroke-color': sevColorExpr(),
      'circle-stroke-width': 1.2,
      'circle-stroke-opacity': [
        'interpolate', ['linear'], ['zoom'],
        3, ['*', confOpacityExpr(), 0.5],
        7, confOpacityExpr(),
      ],
    },
  });

  // Core dot net
  map.addLayer({
    id: 'v2-core',
    type: 'circle',
    source: 'v2-pts',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        3, ['match', ['get', '_sev'], 1, 2.2, 2, 2.8, 3, 3.3, 4, 4.2, 2.8],
        12, ['match', ['get', '_sev'], 1, 4, 2, 5.5, 3, 7, 4, 9, 5.5]],
      'circle-color': sevColorExpr(),
      'circle-stroke-color': '#0d0e10',
      'circle-stroke-width': 0.8,
      'circle-stroke-opacity': 1,
      'circle-opacity': 1,
    },
  });

  // Selection (anneau or)
  map.addLayer({
    id: 'v2-sel',
    type: 'circle',
    source: 'v2-pts',
    filter: ['==', ['get', 'name'], '__never__'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 14, 12, 26],
      'circle-color': 'transparent',
      'circle-stroke-color': '#c49a3c',
      'circle-stroke-width': 1.6,
      'circle-stroke-opacity': 0.95,
    },
  });

  startPulse();
  setupInteractions();
  return true;
}

// ════════════════════════════════════════════════════════════════════
//  PULSE SUR SEV 4 SEULEMENT
// ════════════════════════════════════════════════════════════════════
let _pulseRaf = null;
let _pulseStart = 0;
function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}
function startPulse() {
  if (_pulseRaf || reducedMotion()) return;
  _pulseStart = performance.now();
  const tick = (t) => {
    const e = (t - _pulseStart) / 1000;
    const a = 0.22 + 0.30 * Math.abs(Math.sin((e * Math.PI) / 1.6));
    try {
      if (map.getLayer('v2-halo')) {
        map.setPaintProperty('v2-halo', 'circle-opacity', a);
      }
    } catch (err) {}
    _pulseRaf = requestAnimationFrame(tick);
  };
  _pulseRaf = requestAnimationFrame(tick);
}

// ════════════════════════════════════════════════════════════════════
//  FLUX
// ════════════════════════════════════════════════════════════════════
function makeArc(a, b, curvature) {
  const steps = 36;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const nx = -dy / dist, ny = dx / dist;
  const cx = mx + nx * dist * curvature;
  const cy = my + ny * dist * curvature;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * b[0];
    const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * b[1];
    pts.push([x, y]);
  }
  return pts;
}

function ensureFlux() {
  if (!map.isStyleLoaded()) return;
  if (map.getLayer('v2-flux-line')) {
    // Toggle visibility
    const vis = state.fluxVisible ? 'visible' : 'none';
    ['v2-flux-line', 'v2-flux-glow', 'v2-flux-arrow'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    });
    return;
  }
  if (!state.fluxVisible) return;
  const features = FLOWS.map((f, i) => ({
    type: 'Feature',
    properties: { _flowId: i, intensity: f.intensity, label: f.label, side: f.side },
    geometry: { type: 'LineString', coordinates: makeArc(f.from, f.to, 0.18) },
  }));
  map.addSource('v2-flux', { type: 'geojson', data: { type: 'FeatureCollection', features } });

  const beforeId = map.getLayer('v2-halo') ? 'v2-halo' : undefined;

  map.addLayer({
    id: 'v2-flux-glow',
    type: 'line',
    source: 'v2-flux',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'side'], 'chiite', '#e63946', 'sunnite', '#1d7ed8', '#c49a3c'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 4, 10, 8],
      'line-opacity': 0.08,
      'line-blur': 4,
    },
  }, beforeId);
  map.addLayer({
    id: 'v2-flux-line',
    type: 'line',
    source: 'v2-flux',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'side'], 'chiite', '#e63946', 'sunnite', '#1d7ed8', '#c49a3c'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 10, 1.5],
      'line-opacity': ['*', ['get', 'intensity'], 0.6],
      'line-dasharray': [0, 4, 3],
    },
  }, beforeId);
  map.addLayer({
    id: 'v2-flux-arrow',
    type: 'symbol',
    source: 'v2-flux',
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 100,
      'text-field': '›',
      'text-size': 15,
      'text-keep-upright': false,
      'text-rotation-alignment': 'map',
      'text-pitch-alignment': 'map',
    },
    paint: {
      'text-color': ['match', ['get', 'side'], 'chiite', '#e63946', 'sunnite', '#1d7ed8', '#c49a3c'],
      'text-opacity': 0.7,
      'text-halo-color': 'rgba(0,0,0,0.5)',
      'text-halo-width': 0.8,
    },
  }, beforeId);
  startFluxAnim();
}

const DASH_SEQ = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1],
  [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3],
  [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];
let _fluxInt = null, _fluxStep = 0;
function startFluxAnim() {
  if (_fluxInt || reducedMotion()) return;
  _fluxInt = setInterval(() => {
    _fluxStep = (_fluxStep + 1) % DASH_SEQ.length;
    try {
      if (map.getLayer('v2-flux-line')) {
        map.setPaintProperty('v2-flux-line', 'line-dasharray', DASH_SEQ[_fluxStep]);
      }
    } catch (e) {}
  }, 90);
}

// ════════════════════════════════════════════════════════════════════
//  INTERACTIONS : click popup, hover tooltip
// ════════════════════════════════════════════════════════════════════
const tooltip = document.getElementById('v2-tooltip');

function setupInteractions() {
  if (map.__v2Hooked) return;
  map.__v2Hooked = true;
  ['v2-core', 'v2-ring'].forEach((layerId) => {
    map.on('click', layerId, (e) => {
      if (!e.features?.length) return;
      openPopup(e.features[0], e.lngLat);
    });
    map.on('mouseenter', layerId, (e) => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layerId, () => {
      map.getCanvas().style.cursor = '';
      tooltip.style.display = 'none';
    });
    map.on('mousemove', layerId, (e) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const p = f.properties;
      const date = parseDescField(p._desc, /^date:\s*(.+)$/im);
      const event = parseDescField(p._desc, /^evenement:\s*(.+)$/im) || parseDescField(p._desc, /^événement:\s*(.+)$/im);
      const sev = p._sev;
      tooltip.innerHTML = `<span class="v2-tt-actor">${esc(p.name)}</span> · <span class="v2-tt-sub">SEV ${sev}</span>${date ? `<br><span class="v2-tt-sub">${esc(date)}</span>` : ''}${event ? `<br><span style="color:var(--tx)">${esc(event.length > 60 ? event.slice(0,57)+'…' : event)}</span>` : ''}`;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.originalEvent.clientX + 14) + 'px';
      tooltip.style.top = (e.originalEvent.clientY - 10) + 'px';
    });
  });
}

function parseDescField(raw, regex) {
  if (!raw) return null;
  const m = String(raw).match(regex);
  return m ? m[1].trim() : null;
}

// ════════════════════════════════════════════════════════════════════
//  POPUP
// ════════════════════════════════════════════════════════════════════
let _currentPopup = null;

function openPopup(feature, lngLat) {
  if (_currentPopup) { try { _currentPopup.remove(); } catch (e) {} }
  const spec = pointToMarkerSpec(feature);
  const d = spec.desc || {};
  const sev = spec.severity;
  const dateStr = d.date || '';
  const titleStr = d.event || spec.name || 'Point';
  const locParts = [];
  if (d.ville) locParts.push(d.ville);
  if (d.pays && d.pays !== d.ville) locParts.push(d.pays);
  const locStr = locParts.join(' · ');
  let lectureStr = '';
  if (d.detail) {
    const first = d.detail.split(/[.!?](\s|$)/)[0] || d.detail;
    lectureStr = first.length > 140 ? first.slice(0, 137) + '…' : first;
  }
  const briefBtn =
    typeof window.buildBriefIAButton === 'function'
      ? window.buildBriefIAButton(
          spec.name || titleStr,
          { ...d, period: spec.period || '', event: d.event || titleStr },
          'evenements'
        )
      : '';

  const html = `
    <div class="pv2">
      <div class="pv2-bar" style="background:${esc(SEV_COLORS[sev])}"></div>
      <div class="pv2-head">
        <div class="pv2-sev" data-sev="${sev}">${esc(SEV_LABELS[sev])}</div>
        <div class="pv2-meta">
          ${dateStr ? `<span class="pv2-meta-date">${esc(dateStr)}</span><span class="pv2-meta-sep">·</span>` : ''}
          <span class="pv2-meta-conf" data-conf="${spec.confidence}">${esc(CONF_LABELS[spec.confidence])}</span>
        </div>
      </div>
      <div class="pv2-title">${esc(titleStr)}</div>
      ${locStr ? `<div class="pv2-loc">${esc(locStr)}</div>` : ''}
      <dl class="pv2-grid">
        <dt>Acteur</dt><dd>${esc(spec.name || '—')}</dd>
        <dt>Impact</dt><dd>${esc(formatImpact(spec))}</dd>
        <dt>Lecture</dt><dd>${lectureStr ? esc(lectureStr) : '<em style="color:var(--tx2)">À compléter via Brief IA</em>'}</dd>
      </dl>
      ${briefBtn ? `<div class="pv2-brief-slot">${briefBtn}</div>` : ''}
      <div class="pv2-actions">
        <button class="pv2-btn" type="button" data-v2-action="details">Détails →</button>
      </div>
    </div>
  `;

  const popup = new mapboxgl.Popup({
    closeButton: true,
    maxWidth: '320px',
    offset: 14,
    className: 'v2-popup',
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);

  setTimeout(() => {
    const el = popup.getElement();
    el?.querySelector('[data-v2-action="details"]')?.addEventListener('click', () => {
      openSidePanel(feature);
    });
  }, 0);
  popup.on('close', () => {
    setSelected(null);
    _currentPopup = null;
  });
  _currentPopup = popup;
  setSelected(feature.properties.name);
}

function setSelected(name) {
  state.selectedName = name;
  if (!map.getLayer('v2-sel')) return;
  if (!name) {
    map.setFilter('v2-sel', ['==', ['get', 'name'], '__never__']);
    return;
  }
  map.setFilter('v2-sel', ['==', ['get', 'name'], name]);
}

// ════════════════════════════════════════════════════════════════════
//  SIDE PANEL
// ════════════════════════════════════════════════════════════════════
function openSidePanel(feature) {
  const panel = document.getElementById('side-panel');
  if (!panel) return;
  const spec = pointToMarkerSpec(feature);
  const d = spec.desc || {};

  // Sources extraites du _desc (Sources: ...) ou de description
  const sources = extractSources(d, feature.properties);
  const grouped = { officiel: [], presse: [], osint: [], humint: [] };
  for (const s of sources) {
    const u = (s.url || '').toLowerCase();
    const txt = (s.name || '').toLowerCase();
    if (/(gov|mil|nato|un\.org|defense|onu)/.test(u)) grouped.officiel.push(s);
    else if (/(humint|algor)/.test(u) || /humint/.test(txt)) grouped.humint.push(s);
    else if (/(twitter|x\.com|telegram|reddit|wamap|nitter)/.test(u)) grouped.osint.push(s);
    else grouped.presse.push(s);
  }

  document.getElementById('sp-title').textContent = d.event || spec.name || 'Point';

  const briefBtn =
    typeof window.buildBriefIAButton === 'function'
      ? window.buildBriefIAButton(
          spec.name || (d.event || 'Point'),
          { ...d, period: spec.period || '' },
          'evenements'
        )
      : '';

  document.getElementById('sp-body').innerHTML = `
    <div class="sp-sevbar">
      <div class="sp-sev-badge" data-sev="${spec.severity}">${esc(SEV_LABELS[spec.severity])}</div>
      <div class="sp-meta">Fiabilité <b>${esc(CONF_LABELS[spec.confidence])}</b></div>
      ${d.date ? `<div class="sp-meta" style="margin-left:auto;">${esc(d.date)}</div>` : ''}
    </div>

    <section class="sp-section">
      <h3>Synthèse</h3>
      ${d.detail
        ? `<p class="sp-detail">${esc(d.detail)}</p>`
        : `<p class="sp-empty">Aucun détail textuel chargé. Lancer le Brief IA Sécurité pour obtenir une synthèse contextualisée.</p>`}
    </section>

    <section class="sp-section">
      <h3>Impact</h3>
      <dl class="sp-impact">
        <dt>Acteur</dt><dd><span style="display:inline-block;width:8px;height:8px;background:${esc(spec.actorColor)};margin-right:8px;vertical-align:middle;"></span>${esc(spec.name || '—')}</dd>
        ${d.pays ? `<dt>Pays</dt><dd>${esc(d.pays)}</dd>` : ''}
        ${d.ville ? `<dt>Ville</dt><dd>${esc(d.ville)}</dd>` : ''}
        ${spec.period ? `<dt>Période</dt><dd>${esc(spec.period)}</dd>` : ''}
        <dt>Bilan</dt><dd>${esc(formatImpact(spec))}</dd>
        <dt>Typologie</dt><dd>${esc(spec.kind)}</dd>
      </dl>
    </section>

    ${sources.length ? `
    <section class="sp-section">
      <h3>Sources (${sources.length})</h3>
      ${Object.entries(grouped).filter(([, arr]) => arr.length).map(([cat, arr]) => `
        <div class="sp-src-group">
          <h4>${esc(cat.toUpperCase())}</h4>
          <ul>${arr.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name || s.url)}</a></li>`).join('')}</ul>
        </div>
      `).join('')}
    </section>
    ` : ''}

    <section class="sp-section">
      <h3>Action</h3>
      <div class="sp-action">
        ${briefBtn}
        <button class="sp-btn" type="button" data-action="permalien">Copier permalien</button>
      </div>
    </section>
  `;

  panel.querySelector('[data-action="permalien"]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      const b = panel.querySelector('[data-action="permalien"]');
      const old = b.textContent; b.textContent = 'Copié ✓';
      setTimeout(() => { b.textContent = old; }, 1500);
    } catch (e) {}
  });

  panel.classList.add('open');
}

function extractSources(desc, props) {
  // Format dans description : "Sources: [NomA|http://...] [NomB|http://...]"
  // OU liens cliquables dans description HTML originale
  const out = [];
  const seen = new Set();
  // 1) Parse text "Sources:" line
  if (desc?.sources) {
    const matches = desc.sources.matchAll(/\[([^|\]]+)\|([^\]]+)\]/g);
    for (const m of matches) {
      const url = m[2].trim();
      if (!seen.has(url)) { out.push({ name: m[1].trim(), url }); seen.add(url); }
    }
  }
  // 2) Parse raw description for http(s) urls
  const raw = props.description || props._desc || '';
  const urls = String(raw).match(/https?:\/\/[^\s<>"'\)]+/g);
  if (urls) {
    for (const url of urls) {
      if (seen.has(url)) continue;
      out.push({ name: url.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 50), url });
      seen.add(url);
    }
  }
  return out;
}

// Side panel close
document.getElementById('sp-close')?.addEventListener('click', () => {
  document.getElementById('side-panel').classList.remove('open');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const sp = document.getElementById('side-panel');
    if (sp?.classList.contains('open')) sp.classList.remove('open');
    else if (_currentPopup) { _currentPopup.remove(); }
  }
});

// ════════════════════════════════════════════════════════════════════
//  UI : LEGENDE, ACTEURS, PERIODES, FILTRES
// ════════════════════════════════════════════════════════════════════
function updateLegendCounts() {
  const visible = currentFilteredFeatures();
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const actorCounts = {};
  for (const f of visible) {
    const s = f.properties._sev;
    if (counts[s] != null) counts[s]++;
    const n = f.properties.name;
    if (n) actorCounts[n] = (actorCounts[n] || 0) + 1;
  }
  for (let s = 1; s <= 4; s++) {
    const el = document.getElementById(`lc-${s}`);
    if (el) el.textContent = counts[s];
  }
  document.getElementById('event-count').textContent = visible.length;
  document.getElementById('event-crit-count').textContent = (counts[3] + counts[4]) + ' (' + counts[4] + ' crit.)';

  // Acteurs
  renderActors(actorCounts);
}

function renderActors(actorCounts) {
  const cont = document.getElementById('legend-actors');
  cont.innerHTML = '';
  Object.entries(ACTOR_GROUPS).forEach(([group, members]) => {
    const visible = members.filter((m) => actorCounts[m]);
    if (!visible.length) return;
    const div = document.createElement('div');
    div.className = 'actor-group';
    div.innerHTML = `<div class="actor-group-title">${esc(group)}</div>`;
    visible.sort((a, b) => (actorCounts[b] || 0) - (actorCounts[a] || 0));
    visible.forEach((name) => {
      const row = document.createElement('div');
      row.className = 'actor-row';
      if (state.actorFilter && state.actorFilter !== name) row.classList.add('muted');
      if (state.actorFilter === name) row.classList.add('active');
      row.innerHTML = `<div class="actor-dot" style="background:${esc(ACTOR_COLORS[name] || '#888')}"></div>${esc(name)}<span class="actor-count">${actorCounts[name]}</span>`;
      row.addEventListener('click', () => {
        state.actorFilter = state.actorFilter === name ? null : name;
        applyAndRender();
      });
      div.appendChild(row);
    });
    cont.appendChild(div);
  });
  if (!cont.children.length) {
    cont.innerHTML = '<div style="font:400 9px/1.4 var(--m); color: var(--tx2); padding: 4px 0;">Aucun acteur visible</div>';
  }
}

function buildPeriodButtons() {
  const row = document.getElementById('periods-row');
  row.innerHTML = '';
  PERIODS.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'period-btn active';
    btn.textContent = p.label;
    btn.dataset.idx = i;
    btn.addEventListener('click', () => {
      if (state.activePeriods.has(i)) state.activePeriods.delete(i);
      else state.activePeriods.add(i);
      document.getElementById('btn-tout').classList.remove('active');
      btn.classList.toggle('active', state.activePeriods.has(i));
      applyAndRender();
    });
    row.appendChild(btn);
  });
}

function setupFilters() {
  document.getElementById('btn-tout').addEventListener('click', () => {
    if (state.activePeriods.size === PERIODS.length) {
      state.activePeriods.clear();
      document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
      document.getElementById('btn-tout').classList.remove('active');
    } else {
      state.activePeriods = new Set(PERIODS.map((_, i) => i));
      document.querySelectorAll('.period-btn').forEach((b) => b.classList.add('active'));
      document.getElementById('btn-tout').classList.add('active');
    }
    applyAndRender();
  });

  document.getElementById('filt-sev3').addEventListener('change', (e) => {
    state.sevFilter = e.target.checked;
    applyAndRender();
  });

  document.getElementById('filt-flux').addEventListener('change', (e) => {
    state.fluxVisible = e.target.checked;
    ensureFlux();
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    map.flyTo({ center: MAP_CENTER, zoom: MAP_ZOOM, bearing: MAP_BEARING, pitch: 0, duration: 900 });
  });

  // Legend sev rows : toggle filter sev (juste highlight pour l'instant)
  document.querySelectorAll('#legend-sev .leg-row').forEach((row) => {
    row.addEventListener('click', () => {
      const sev = parseInt(row.dataset.sev);
      // Toggle sevFilter pour ce niveau (TODO: filtrage multi-niveau, simplifie ici)
      if (sev >= 3) {
        state.sevFilter = !state.sevFilter;
        document.getElementById('filt-sev3').checked = state.sevFilter;
        applyAndRender();
      }
    });
  });
}

function applyAndRender() {
  setSourceData();
  updateLegendCounts();
  updatePeriodBadge();
}

function updatePeriodBadge() {
  const badge = document.getElementById('period-badge');
  if (state.activePeriods.size === 0) badge.textContent = 'Aucune période';
  else if (state.activePeriods.size === PERIODS.length) badge.textContent = 'Toutes · 2005-2026';
  else if (state.activePeriods.size === 1) badge.textContent = PERIODS[[...state.activePeriods][0]].label;
  else badge.textContent = `${state.activePeriods.size} périodes`;
  document.getElementById('footer-info').textContent = `${state.activePeriods.size}/${PERIODS.length} périodes · ${state.sevFilter ? 'sév ≥3' : 'tous'} · ${state.actorFilter ? '"'+state.actorFilter.slice(0,18)+'"' : 'tous acteurs'}`;
}

// ════════════════════════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════════════════════════
async function boot() {
  buildPeriodButtons();
  setupFilters();

  await new Promise((r) => { if (map.loaded()) r(); else map.once('load', r); });

  // Style override leger : reduire labels villes en dark
  try {
    const style = map.getStyle();
    style.layers.forEach((l) => {
      if (/^settlement-(major|minor)-label|place-label/i.test(l.id)) {
        try { map.setPaintProperty(l.id, 'text-color', '#727a87'); } catch (e) {}
      }
    });
  } catch (e) {}

  state.features = await loadAll();

  setSourceData();

  // Retry pattern robuste : essaie tout de suite, puis re-essaie sur style.load,
  // sur idle, et avec un fallback timer toutes les 500ms pendant 10s max.
  let attempts = 0;
  const tryEnsure = () => {
    if (map.getLayer('v2-core')) return; // deja fait
    if (ensureLayers()) {
      ensureFlux();
      applyAndRender();
    } else if (attempts++ < 20) {
      setTimeout(tryEnsure, 500);
    }
  };
  tryEnsure();
  map.on('style.load', tryEnsure);
  map.on('idle', tryEnsure);

  ensureFlux();
  applyAndRender();

  document.getElementById('map-loader').style.display = 'none';
  console.info('[v2 mo-engine] ready · features:', state.features.length);
}

boot().catch((e) => {
  console.error('[v2 mo-engine] boot failed:', e);
  const ld = document.getElementById('map-loader');
  if (ld) ld.textContent = 'Erreur : ' + e.message;
});
