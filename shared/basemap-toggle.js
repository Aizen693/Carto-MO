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
  var SAT_LAYERS = [SAT_LYR, ADMIN_LYR];

  // Icône v5 (calques superposés, trait 1,5 px) à la place de l'ancien glyphe demi-disque.
  var ICON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5"/><path d="M3.5 16.5L12 21l8.5-4.5"/></svg>';
  var on = false;
  var map = null;
  var chip = null;

  /* ─────────── Calques satellite ───────────
   * Fond = Mapbox Streets. L'imagerie est glissée JUSTE AU-DESSUS du sol et de l'eau,
   * SOUS les routes, pistes et noms du fond : même rendu que Satellite Streets
   * (le plus précis mesuré sur nos localités, banc d'essai /carte/fonds/ 23/09/2026).
   * En satellite, les textes du fond passent en blanc cerné de noir. */
  var textSaved = {};
  function firstOverlayLayer() {
    var ls = map.getStyle().layers || [];
    for (var i = 0; i < ls.length; i++) {
      var id = ls[i].id;
      if (ls[i].type === 'symbol' || /^(tunnel|road|bridge|aeroway|building|admin)/.test(id) || id === 'admin0-thick') return id;
    }
    return undefined;
  }
  function addSatLayers() {
    if (!map || map.getSource(SAT_SRC)) return;
    try {
      map.addSource(SAT_SRC, { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 });
      map.addLayer({ id: SAT_LYR, type: 'raster', source: SAT_SRC, layout: { visibility: 'none' }, paint: { 'raster-opacity': 1 } }, firstOverlayLayer());
      // Frontières blanches par-dessus l'imagerie (le trait noir seul se perd sur le sol sombre).
      if (!map.getSource(STREETS_SRC)) map.addSource(STREETS_SRC, { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' });
      var beforeId = map.getLayer('region-hl-fill') ? 'region-hl-fill' : (map.getLayer('humint-glow') ? 'humint-glow' : undefined);
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
    } catch (e) { console.warn('[basemap] satellite indisponible', e && e.message); }
  }

  function baseSymbols() {
    return (map.getStyle().layers || []).filter(function (l) {
      return l.type === 'symbol' && l.layout && l.layout['text-field'] && !/^humint|^region/.test(l.id);
    });
  }
  function recolorText() {
    baseSymbols().forEach(function (l) {
      try {
        if (on) {
          if (!textSaved[l.id]) textSaved[l.id] = {
            c: map.getPaintProperty(l.id, 'text-color'), h: map.getPaintProperty(l.id, 'text-halo-color'), w: map.getPaintProperty(l.id, 'text-halo-width'),
          };
          map.setPaintProperty(l.id, 'text-color', '#ffffff');
          map.setPaintProperty(l.id, 'text-halo-color', 'rgba(0,0,0,0.75)');
          map.setPaintProperty(l.id, 'text-halo-width', 1.4);
        } else if (textSaved[l.id]) {
          map.setPaintProperty(l.id, 'text-color', textSaved[l.id].c);
          map.setPaintProperty(l.id, 'text-halo-color', textSaved[l.id].h);
          map.setPaintProperty(l.id, 'text-halo-width', textSaved[l.id].w);
        }
      } catch (e) { /* */ }
    });
  }

  function applyVisibility() {
    SAT_LAYERS.forEach(function (id) {
      if (map.getLayer(id)) { try { map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); } catch (e) { /* */ } }
    });
    recolorText();
  }

  /* ─────────── Jeton dans la barre ─────────── */
  function render() {
    chip.className = 'chip chip-edit chip-basemap' + (on ? ' chip-pays' : '');
    chip.innerHTML = '<span class="chip-key">Fond</span><span class="chip-val">' + (on ? 'Satellite' : 'Carte') + '</span><span class="chip-caret">' + ICON + '</span>';
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
