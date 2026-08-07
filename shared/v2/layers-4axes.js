/**
 * layers-4axes.js — Couches Mapbox encodant le modele marqueur V2
 *
 * 4 couches :
 *   v2-points-halo   : halo diffus, severite >= 3 uniquement, pulse conditionne
 *   v2-points-core   : cercle principal — couleur sev, taille importance
 *   v2-points-stroke : ring exterieur — opacite encode la fiabilite
 *   v2-points-sel    : anneau de selection (vide au depart, alimente au click)
 *
 * Bord interne 1px couleur acteur : applique via circle-stroke-color sur v2-points-core
 *   avec un trick d'expression (stroke + width 1px utilise pour l'acteur).
 *
 * Pulse :
 *   - sev 1-2 : aucun
 *   - sev 3   : cycle lent (2.4s, amplitude 0.15)
 *   - sev 4   : cycle rapide (1.4s, amplitude 0.35)
 *
 * Respecte prefers-reduced-motion.
 */

import {
  sevColorExpr,
  radiusExpr,
  confOpacityExpr,
  SEV_HIGH_FILTER,
  enrichFeatureProperties,
} from './marker-model.js';

const SOURCE_ID = 'v2-points-src';

let _pulseRaf = null;
let _pulseStarted = 0;

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { return false; }
}

/**
 * Cree la source GeoJSON enrichie + les 4 couches v2.
 * @param {mapboxgl.Map} map
 * @param {FeatureCollection} geojson - sera enrichi en place (ajoute _sev/_imp/_conf/_kind)
 * @param {object} opts - { clusters?: bool }
 */
export function addV2Layers(map, geojson, opts = {}) {
  // Enrichit chaque feature avec les axes derives
  const enriched = {
    type: 'FeatureCollection',
    features: (geojson?.features || [])
      .filter((f) => f.geometry && f.geometry.type === 'Point')
      .map(enrichFeatureProperties),
  };

  // Source — clustering optionnel
  if (map.getSource(SOURCE_ID)) {
    map.getSource(SOURCE_ID).setData(enriched);
  } else {
    const sourceDef = {
      type: 'geojson',
      data: enriched,
    };
    if (opts.clusters) {
      sourceDef.cluster = true;
      sourceDef.clusterMaxZoom = 9;
      sourceDef.clusterRadius = 35;
      sourceDef.clusterProperties = {
        max_sev: ['max', ['get', '_sev']],
      };
    }
    map.addSource(SOURCE_ID, sourceDef);
  }

  // Halo — sev >= 3 uniquement
  if (!map.getLayer('v2-points-halo')) {
    map.addLayer({
      id: 'v2-points-halo',
      type: 'circle',
      source: SOURCE_ID,
      filter: ['all', ['!=', ['get', 'cluster'], true], SEV_HIGH_FILTER],
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          3,  ['match', ['get', '_sev'], 3, 6,  4, 9,  6],
          12, ['match', ['get', '_sev'], 3, 16, 4, 24, 16],
        ],
        'circle-color': sevColorExpr(),
        'circle-opacity': 0.18,
        'circle-blur': 0.6,
        'circle-pitch-alignment': 'map',
        'circle-pitch-scale': 'map',
      },
    });
  }

  // Stroke — ring exterieur encode la fiabilite (opacity 1/0.6/0.3)
  if (!map.getLayer('v2-points-stroke')) {
    map.addLayer({
      id: 'v2-points-stroke',
      type: 'circle',
      source: SOURCE_ID,
      filter: ['!=', ['get', 'cluster'], true],
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          3,  ['+', ['match', ['get', '_imp'], 1, 2.5, 2, 3.5, 3, 4.5, 4, 6, 3.5], 2],
          12, ['+', ['match', ['get', '_imp'], 1, 6,   2, 9,   3, 13,  4, 18, 8], 3],
        ],
        'circle-color': 'transparent',
        'circle-stroke-color': sevColorExpr(),
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': confOpacityExpr(),
        'circle-pitch-alignment': 'map',
      },
    });
  }

  // Core — cercle principal, couleur severite, bordure 1px couleur acteur
  if (!map.getLayer('v2-points-core')) {
    map.addLayer({
      id: 'v2-points-core',
      type: 'circle',
      source: SOURCE_ID,
      filter: ['!=', ['get', 'cluster'], true],
      paint: {
        'circle-radius': radiusExpr(),
        'circle-color': sevColorExpr(),
        'circle-stroke-color': ['get', '_color'],
        'circle-stroke-width': 1,
        'circle-stroke-opacity': 0.85,
        'circle-opacity': 1,
        'circle-pitch-alignment': 'map',
      },
    });
  }

  // Selection — anneau accent or, alimente au click via setFilter
  if (!map.getLayer('v2-points-sel')) {
    map.addLayer({
      id: 'v2-points-sel',
      type: 'circle',
      source: SOURCE_ID,
      filter: ['==', ['get', '__selected'], true], // vide par defaut
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          3,  ['+', ['match', ['get', '_imp'], 1, 2.5, 2, 3.5, 3, 4.5, 4, 6, 3.5], 6],
          12, ['+', ['match', ['get', '_imp'], 1, 6,   2, 9,   3, 13,  4, 18, 8], 8],
        ],
        'circle-color': 'transparent',
        'circle-stroke-color': '#c49a3c',
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0.9,
      },
    });
  }

  // Clusters (si opts.clusters)
  if (opts.clusters) {
    if (!map.getLayer('v2-clusters')) {
      map.addLayer({
        id: 'v2-clusters',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['==', 'cluster', true],
        paint: {
          'circle-color': 'transparent',
          'circle-stroke-color': [
            'match', ['get', 'max_sev'],
            1, '#5a8a9a', 2, '#c49a3c', 3, '#d97742', 4, '#c0392b',
            '#c49a3c',
          ],
          'circle-stroke-width': 1.5,
          'circle-radius': [
            'step', ['get', 'point_count'],
            14, 5, 18, 20, 22, 50, 26,
          ],
          'circle-pitch-alignment': 'map',
        },
      });
      map.addLayer({
        id: 'v2-clusters-count',
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['==', 'cluster', true],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 10,
        },
        paint: {
          'text-color': '#e8ecf2',
          'text-halo-color': '#0d0e10',
          'text-halo-width': 1.2,
        },
      });
    }
  }

  startConditionalPulse(map);
  return SOURCE_ID;
}

/**
 * Pulse conditionne : seules les sev>=3 pulsent, avec amplitude + frequence
 * dependantes de la severite. Implementation via setPaintProperty sur halo.
 * Un seul RAF global.
 */
export function startConditionalPulse(map) {
  if (_pulseRaf) return;
  if (reducedMotion()) {
    // Force opacity statique
    try { map.setPaintProperty('v2-points-halo', 'circle-opacity', 0.18); } catch (e) {}
    return;
  }
  _pulseStarted = performance.now();
  const tick = (t) => {
    const elapsed = (t - _pulseStarted) / 1000;
    // Calcule deux pulses (sev3 et sev4) puis applique via expression match
    const sev3 = 0.18 + 0.15 * Math.sin((elapsed * 2 * Math.PI) / 2.4);
    const sev4 = 0.22 + 0.35 * Math.sin((elapsed * 2 * Math.PI) / 1.4);
    try {
      if (map.getLayer('v2-points-halo')) {
        map.setPaintProperty('v2-points-halo', 'circle-opacity', [
          'match', ['get', '_sev'],
          3, sev3,
          4, sev4,
          0.18,
        ]);
      }
    } catch (e) { /* layer pas pret */ }
    _pulseRaf = requestAnimationFrame(tick);
  };
  _pulseRaf = requestAnimationFrame(tick);
}

export function stopConditionalPulse() {
  if (_pulseRaf) {
    cancelAnimationFrame(_pulseRaf);
    _pulseRaf = null;
  }
}

/**
 * Marque un point comme selectionne : alimente le filter de v2-points-sel.
 * Pour bouger la selection, repasser un nouveau featureId.
 */
export function setSelectedFeatureId(map, featureId) {
  if (!map.getLayer('v2-points-sel')) return;
  if (featureId == null) {
    map.setFilter('v2-points-sel', ['==', ['get', '__never__'], true]);
    return;
  }
  // On match sur "name" (ou un id stable si dispo) — pas ideal mais suffisant pour la demo.
  map.setFilter('v2-points-sel', ['==', ['get', 'name'], featureId]);
}

export function removeV2Layers(map) {
  stopConditionalPulse();
  ['v2-clusters-count', 'v2-clusters', 'v2-points-sel', 'v2-points-core', 'v2-points-stroke', 'v2-points-halo'].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}
