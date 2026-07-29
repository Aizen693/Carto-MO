/**
 * basemap-toggle.js — Bascule de fond « Carte ↔ Satellite » pour la carte HUMINT (/carte/).
 *
 * Module IIFE autonome et ADDITIF : n'édite pas humint-engine.js. Il récupère
 * l'instance Mapbox via window.HumintMap.getMap() (après l'event `algorMapReady`).
 *
 * 1) Jeton dans la barre à jetons (#chipbar), en dernière position (là où était
 *    « Infras 3D »). Le moteur reconstruit #chipbar à chaque filtre → un
 *    MutationObserver ré-insère notre jeton à la fin.
 * 2) Fond satellite = Mapbox Satellite (mapbox://mapbox.satellite), déjà couvert
 *    par le token du site, gratuit. En mode satellite on ajoute AU-DESSUS de
 *    l'imagerie les FRONTIÈRES (blanches) et les NOMS DE PAYS (sinon invisibles
 *    au dézoom), depuis mapbox-streets-v8.
 */
(function () {
  'use strict';

  var SAT_SRC = 'basemap-sat-src';
  var STREETS_SRC = 'basemap-streets-src';
  var SAT_LYR = 'basemap-sat-layer';
  var ADMIN_LYR = 'basemap-sat-admin';
  var LABEL_LYR = 'basemap-sat-label';
  var SAT_LAYERS = [SAT_LYR, ADMIN_LYR, LABEL_LYR];

  var on = false;
  var map = null;
  var chip = null;

  /* ─────────── Calques satellite (imagerie + frontières + noms pays) ─────────── */
  function addSatLayers() {
    if (!map || map.getSource(SAT_SRC)) return;
    // Insère SOUS le surlignage de région (region-hl-fill) pour que le cadrillage
    // de région et les points restent visibles par-dessus l'imagerie satellite.
    var beforeId = map.getLayer('region-hl-fill') ? 'region-hl-fill'
      : (map.getLayer('humint-glow') ? 'humint-glow' : undefined);
    try {
      // Imagerie satellite.
      map.addSource(SAT_SRC, { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 });
      map.addLayer({ id: SAT_LYR, type: 'raster', source: SAT_SRC, layout: { visibility: 'none' }, paint: { 'raster-opacity': 1 } }, beforeId);

      // Frontières + noms de pays (depuis Mapbox Streets), visibles seulement en satellite.
      if (!map.getSource(STREETS_SRC)) map.addSource(STREETS_SRC, { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' });
      map.addLayer({
        id: ADMIN_LYR, type: 'line', source: STREETS_SRC, 'source-layer': 'admin',
        filter: ['all', ['==', ['get', 'admin_level'], 0], ['==', ['get', 'maritime'], 'false']],
        layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-opacity': 0.6,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 6, 1.7, 9, 2.6, 12, 3.4],
        },
      }, beforeId);
      map.addLayer({
        id: LABEL_LYR, type: 'symbol', source: STREETS_SRC, 'source-layer': 'place_label',
        filter: ['==', ['get', 'class'], 'country'],
        layout: {
          visibility: 'none',
          'text-field': ['coalesce', ['get', 'name_fr'], ['get', 'name_en'], ['get', 'name']],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 6, 15, 9, 18],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
          'text-max-width': 7,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.7)', 'text-halo-width': 1.5 },
      }, beforeId);
    } catch (e) { console.warn('[basemap] satellite indisponible', e && e.message); }
  }

  function applyVisibility() {
    SAT_LAYERS.forEach(function (id) {
      if (map.getLayer(id)) { try { map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); } catch (e) { /* */ } }
    });
  }

  /* ─────────── Jeton dans la barre ─────────── */
  function render() {
    chip.className = 'chip chip-edit chip-basemap' + (on ? ' chip-pays' : '');
    chip.innerHTML = '<span class="chip-key">Fond</span><span class="chip-val">' + (on ? 'Satellite' : 'Carte') + '</span><span class="chip-caret">◑</span>';
    chip.title = on ? 'Revenir au fond carte' : 'Basculer vers le satellite';
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function makeChip() {
    chip = document.createElement('button');
    chip.type = 'button';
    chip.id = 'chip-basemap';
    render();
    chip.onclick = function (e) {
      e.stopPropagation();
      if (!map.getSource(SAT_SRC)) addSatLayers();
      on = !on;
      applyVisibility();
      render();
    };
  }

  function ensureInBar() {
    var bar = document.getElementById('chipbar');
    if (!bar || !chip) return;
    if (chip.parentNode !== bar || chip !== bar.lastElementChild) bar.appendChild(chip);
  }

  function build() {
    if (chip) return;
    map = window.HumintMap && window.HumintMap.getMap && window.HumintMap.getMap();
    if (!map) return;
    addSatLayers();
    makeChip();
    ensureInBar();
    var bar = document.getElementById('chipbar');
    if (bar) new MutationObserver(ensureInBar).observe(bar, { childList: true });
  }

  function boot() {
    if (window.HumintMap && window.HumintMap.getMap && window.HumintMap.getMap()) { build(); return; }
    window.addEventListener('algorMapReady', build, { once: true });
    var n = 0, t = setInterval(function () {
      n++;
      if (window.HumintMap && window.HumintMap.getMap && window.HumintMap.getMap()) { clearInterval(t); build(); }
      else if (n > 60) clearInterval(t);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
