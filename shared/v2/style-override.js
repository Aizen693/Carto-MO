/**
 * style-override.js — Style Mapbox "Analyst Dark" applique au runtime
 *
 * A appeler sur l'event 'style.load' de la map. Tente d'abord la config-driven
 * approach (mapbox://styles/mapbox/standard expose setConfigProperty), puis
 * fallback sur des overrides de paint properties pour les autres styles.
 *
 * Pas de modification de tokens.css. Pas de dependance externe.
 */

const LAYER_OVERRIDES = [
  // ── Eau : plus sombre que la terre ────────────────────────────────
  { match: /^water/i,                paint: { 'fill-color': '#0a0d10' } },
  { match: /^water-shadow/i,         paint: { 'fill-color': '#0a0d10', 'fill-opacity': 0.4 } },

  // ── Terre / land cover : ton uniforme assourdi ────────────────────
  { match: /^land$/i,                paint: { 'background-color': '#16181a' } },
  { match: /^landcover/i,            paint: { 'fill-opacity': 0.0 } },
  { match: /^national-park/i,        paint: { 'fill-opacity': 0.0 } },
  { match: /^landuse/i,              paint: { 'fill-opacity': 0.0 } },

  // ── Frontieres ────────────────────────────────────────────────────
  { match: /admin-0|country.*boundary/i,
                                     paint: { 'line-color': '#2a2d31', 'line-width': 1.4, 'line-opacity': 0.9 } },
  { match: /admin-1|state.*boundary/i,
                                     paint: { 'line-color': '#26282b', 'line-width': 0.6, 'line-opacity': 0.5 } },

  // ── Routes : couper les minor avant zoom 10, attenuer les majors ──
  { match: /road-(primary|secondary|tertiary)/i,
                                     paint: { 'line-color': '#22252a', 'line-opacity': 0.55 } },
  { match: /road-(street|minor|service|track|path|trunk)/i,
                                     layout: { 'visibility': 'none' } },
  { match: /road-(motorway|major)/i, paint: { 'line-color': '#2c2f34', 'line-opacity': 0.7 } },

  // ── Labels villes : ne garder qu'a partir du zoom 6, en gris ──────
  { match: /settlement.*label|place-(city|town|village|hamlet)/i,
                                     paint: { 'text-color': '#727a87', 'text-halo-color': '#0d0e10', 'text-halo-width': 1.2 } },
  { match: /poi-label|transit-label|airport-label/i,
                                     layout: { 'visibility': 'none' } },

  // ── Hillshade : exaggeration legere ───────────────────────────────
  { match: /^hillshade/i,            paint: { 'hillshade-illumination-anchor': 'map', 'hillshade-exaggeration': 0.3 } },
];

function applyConfigDrivenOverrides(map) {
  // Mapbox Standard expose setConfigProperty pour le basemap
  const tries = [
    ['basemap', 'lightPreset', 'night'],
    ['basemap', 'showPointOfInterestLabels', false],
    ['basemap', 'showTransitLabels', false],
    ['basemap', 'showPlaceLabels', true],
    ['basemap', 'showRoadLabels', false],
    ['basemap', 'show3dObjects', false],
  ];
  let appliedAny = false;
  for (const [ns, key, val] of tries) {
    try {
      map.setConfigProperty(ns, key, val);
      appliedAny = true;
    } catch (e) { /* style ne supporte pas */ }
  }
  return appliedAny;
}

function applyLayerOverrides(map) {
  const style = map.getStyle();
  if (!style || !Array.isArray(style.layers)) return 0;
  let count = 0;
  for (const layer of style.layers) {
    if (!layer.id) continue;
    for (const rule of LAYER_OVERRIDES) {
      if (!rule.match.test(layer.id)) continue;
      if (rule.paint) {
        for (const [prop, val] of Object.entries(rule.paint)) {
          try { map.setPaintProperty(layer.id, prop, val); count++; } catch (e) {}
        }
      }
      if (rule.layout) {
        for (const [prop, val] of Object.entries(rule.layout)) {
          try { map.setLayoutProperty(layer.id, prop, val); count++; } catch (e) {}
        }
      }
    }
  }
  return count;
}

/**
 * Applique le theme Analyst Dark sur la map.
 * Idempotent — peut etre appele plusieurs fois (style change).
 * Doit etre appele APRES style.load (sinon les layers ne sont pas encore disponibles).
 */
export function applyAnalystDarkStyle(map) {
  if (!map) return;
  const configApplied = applyConfigDrivenOverrides(map);
  const layersApplied = applyLayerOverrides(map);
  if (typeof console !== 'undefined') {
    // Soft log, pas une erreur — utile pour iterer le style en local
    console.info(`[Carto-MO V2] Analyst Dark: config=${configApplied} layers=${layersApplied}`);
  }
}

/**
 * Helper : attache l'override sur tous les style.load futurs.
 * Useful quand l'utilisateur swap entre styles (standard / satellite / dark).
 */
export function attachAnalystDarkOnStyleLoad(map) {
  const apply = () => applyAnalystDarkStyle(map);
  map.on('style.load', apply);
  // Si le style est deja charge, appliquer immediatement
  if (map.isStyleLoaded && map.isStyleLoaded()) apply();
  return () => map.off('style.load', apply);
}
