/**
 * engine-v2.js — Mini-moteur V2 pour demo-v2.html
 *
 * Minimaliste, autonome. NE TOUCHE PAS engine.js. Cree pour faire
 * la demonstration du socle (style override + marker 4-axes + popup compact).
 *
 * Attend une variable globale DEMO_CONFIG avec :
 *   TOKEN          : Mapbox access token
 *   STYLE          : URL du style Mapbox (ex: mapbox://styles/mapbox/standard)
 *   CENTER         : [lng, lat]
 *   ZOOM           : number
 *   BEARING        : number
 *   GEOJSON_URLS   : string[] — fichiers GeoJSON a charger
 *   BRIEF_SECTOR   : 'evenements' | 'eco' | 'commercial' (defaut: evenements)
 */

import { applyAnalystDarkStyle, attachAnalystDarkOnStyleLoad } from './style-override.js';
import { addV2Layers, setSelectedFeatureId, removeV2Layers } from './layers-4axes.js';
import { makePopupCompactHTML, bindPopupActions } from './popup-compact.js';
import { resolveStyle, BASE_STYLES } from './base-styles.js';

if (typeof window === 'undefined' || typeof window.mapboxgl === 'undefined') {
  throw new Error('engine-v2: mapboxgl manquant. Charge mapbox-gl.js avant ce module.');
}
const mapboxgl = window.mapboxgl;

const CFG = window.DEMO_CONFIG || {};
if (!CFG.TOKEN) throw new Error('engine-v2: DEMO_CONFIG.TOKEN requis.');
mapboxgl.accessToken = CFG.TOKEN;

// Styles : 3 fonds raster sans token (par defaut) + 2 styles Mapbox (necessitent un
// token autorise sur le domaine — en local ils renvoient 403). resolveStyle accepte
// soit une cle locale ("cartodb-dark"), soit une URL Mapbox.
const STYLES = {
  'cartodb-dark':    'cartodb-dark',
  'cartodb-voyager': 'cartodb-voyager',
  'esri-imagery':    'esri-imagery',
  'mapbox-dark':     'mapbox://styles/mapbox/dark-v11',
  'mapbox-standard': 'mapbox://styles/mapbox/standard',
};
const DEFAULT_STYLE_KEY = CFG.STYLE_KEY || 'cartodb-dark';

// ── Init carte ────────────────────────────────────────────────────────
const map = new mapboxgl.Map({
  container: 'map',
  style: resolveStyle(STYLES[DEFAULT_STYLE_KEY] || DEFAULT_STYLE_KEY),
  center: CFG.CENTER || [0, 15],
  zoom: CFG.ZOOM || 4,
  bearing: CFG.BEARING || 0,
  pitch: 0,
  maxPitch: 60,
  antialias: true,
});
window.algorMapV2 = map;

map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right');

// Attache l'override Analyst Dark sur chaque style.load (initial + swap)
attachAnalystDarkOnStyleLoad(map);

// ── Chargement data ───────────────────────────────────────────────────
async function loadAllGeoJSON(urls) {
  const out = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) { console.warn('[v2] fetch failed:', url, res.status); continue; }
      const geo = await res.json();
      if (geo && Array.isArray(geo.features)) {
        // Annote la periode si le fichier est une periode Sahel
        const period = guessPeriodLabel(url);
        for (const f of geo.features) {
          f.properties = f.properties || {};
          if (!f.properties._period && period) f.properties._period = period;
          // Convertit description HTML en texte plat pour parseDesc
          if (f.properties.description && !f.properties._desc) {
            f.properties._desc = String(f.properties.description)
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<[^>]+>/g, '')
              .trim() || null;
          }
          // Extrait casualties pour fallback severity
          if (f.properties._desc && f.properties._casualties == null) {
            const nm = f.properties._desc.match(/([0-9][0-9 ]*)\s*(?:tués?|morts?|victimes?|blessés?)/gi);
            if (nm) {
              const vals = nm.map((n) => parseInt(n.replace(/\s/g, ''))).filter((n) => !isNaN(n) && n > 0);
              f.properties._casualties = vals.length ? Math.max(...vals) : 0;
            } else {
              f.properties._casualties = 0;
            }
          }
        }
        out.push(...geo.features);
      }
    } catch (e) {
      console.warn('[v2] load error:', url, e.message);
    }
  }
  return { type: 'FeatureCollection', features: out };
}

function guessPeriodLabel(url) {
  const m = url.match(/(\d{4})-(jan|fev|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec)-(\d{2})-(\d{2})/i);
  if (!m) return '';
  return `${m[3]}-${m[4]} ${m[2]} ${m[1]}`;
}

// ── Popup helpers ─────────────────────────────────────────────────────
let _currentPopup = null;

function openPopup(feature, lngLat) {
  if (_currentPopup) { try { _currentPopup.remove(); } catch (e) {} }
  const html = makePopupCompactHTML(feature, { briefSector: CFG.BRIEF_SECTOR || 'evenements' });
  const popup = new mapboxgl.Popup({
    closeButton: true,
    maxWidth: '320px',
    className: 'algor-popup',
    offset: 12,
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);
  // Anneau de selection
  const featId = feature.properties.name || feature.properties.id;
  setSelectedFeatureId(map, featId);
  // Bind actions
  setTimeout(() => {
    const el = popup.getElement();
    bindPopupActions(el, feature, {
      onDetails: (f) => alert('Side panel — non implemente dans la demo (etape 5)\n\nName: ' + (f.properties.name || '')),
      onSources: (f) => alert('Sources — non implemente dans la demo (etape 5)\n\nName: ' + (f.properties.name || '')),
    });
  }, 0);
  popup.on('close', () => {
    setSelectedFeatureId(map, null);
    _currentPopup = null;
  });
  _currentPopup = popup;
}

function setupInteractions() {
  ['v2-points-core', 'v2-points-stroke', 'v2-points-halo'].forEach((layerId) => {
    map.on('click', layerId, (e) => {
      if (!e.features || !e.features[0]) return;
      openPopup(e.features[0], e.lngLat);
    });
    map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
  });

  // Cluster click : zoom-in
  map.on('click', 'v2-clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['v2-clusters'] });
    const clusterId = features[0]?.properties?.cluster_id;
    if (clusterId == null) return;
    map.getSource('v2-points-src').getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({ center: features[0].geometry.coordinates, zoom });
    });
  });
}

// ── Boot ──────────────────────────────────────────────────────────────
async function boot() {
  await new Promise((res) => {
    if (map.loaded()) res();
    else map.once('load', res);
  });

  const urls = Array.isArray(CFG.GEOJSON_URLS) ? CFG.GEOJSON_URLS : [];
  const geo = await loadAllGeoJSON(urls);

  // Stats
  const total = geo.features.length;
  const counters = document.getElementById('demo-counter');
  if (counters) counters.textContent = `${total} pts`;
  console.info('[v2] features loaded:', total);

  addV2Layers(map, geo, { clusters: true });
  setupInteractions();

  document.getElementById('demo-loader')?.style && (document.getElementById('demo-loader').style.display = 'none');
}

boot();

// Expose minimal pour debug console + style switcher
window.cartoMoV2 = {
  map,
  STYLES,
  reloadStyle: (which) => {
    const target = STYLES[which];
    if (!target) { console.warn('[v2] style inconnu:', which, 'cles dispo:', Object.keys(STYLES)); return; }
    map.setStyle(resolveStyle(target));
    // les couches V2 doivent etre re-ajoutees au style.load suivant
    map.once('style.load', async () => {
      const urls = Array.isArray(CFG.GEOJSON_URLS) ? CFG.GEOJSON_URLS : [];
      const geo = await loadAllGeoJSON(urls);
      addV2Layers(map, geo, { clusters: true });
      setupInteractions();
    });
  },
};
