/**
 * basemap-toggle.js — Bascule de fond « Carte ↔ Satellite » pour la carte HUMINT (/carte/).
 *
 * Module IIFE autonome et ADDITIF : n'édite pas humint-engine.js. Il récupère
 * l'instance Mapbox via window.HumintMap.getMap() (après l'event `algorMapReady`),
 * ajoute une couche raster satellite (masquée par défaut) sous les points HUMINT,
 * et injecte un bouton flottant dans la charte violet/blanc.
 *
 * Imagerie = Mapbox Satellite (mapbox://mapbox.satellite) : déjà couvert par le
 * token du site (restreint à localhost:8768 + algoracces.fr), haute résolution,
 * gratuit dans le quota Mapbox. Aucune clé supplémentaire.
 */
(function () {
  'use strict';

  var SAT_SRC = 'basemap-sat-src';
  var SAT_LYR = 'basemap-sat-layer';
  var on = false;
  var map = null;

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>';

  function injectCSS() {
    if (document.getElementById('basemap-toggle-css')) return;
    var s = document.createElement('style');
    s.id = 'basemap-toggle-css';
    s.textContent = [
      '#basemap-toggle{position:absolute;left:16px;bottom:52px;z-index:7;display:inline-flex;align-items:center;gap:9px;',
      'cursor:pointer;appearance:none;-webkit-appearance:none;border:1px solid var(--ln,rgba(20,16,40,.1));background:#fff;',
      'color:var(--violet,#6B3FA0);padding:9px 14px;border-radius:13px;',
      'box-shadow:var(--shadow,0 10px 30px -12px rgba(46,24,87,.4));',
      "font-family:var(--jakarta,'Plus Jakarta Sans',system-ui,sans-serif);",
      'transition:border-color .12s,box-shadow .12s,background .12s}',
      '#basemap-toggle:hover{border-color:var(--violet,#6B3FA0)}',
      '#basemap-toggle.on{background:var(--grad,linear-gradient(95deg,#6B3FA0,#5650C6 55%,#2E84D4));border:none;color:#fff;box-shadow:0 8px 22px -7px rgba(86,80,198,.6)}',
      '#basemap-toggle .bt-key{font:700 9px/1 inherit;letter-spacing:.14em;text-transform:uppercase;opacity:.72}',
      '#basemap-toggle .bt-val{font:700 13px/1 inherit}',
      '#basemap-toggle svg{width:15px;height:15px;flex:none}',
      '@media(max-width:680px){#basemap-toggle{bottom:auto;top:120px;left:16px}}',
    ].join('');
    document.head.appendChild(s);
  }

  function addSatLayer() {
    if (map.getSource(SAT_SRC)) return;
    try {
      map.addSource(SAT_SRC, { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 });
      // Sous les points HUMINT (glow/ring/dots) pour qu'ils restent lisibles.
      var beforeId = map.getLayer('humint-glow') ? 'humint-glow' : undefined;
      map.addLayer({ id: SAT_LYR, type: 'raster', source: SAT_SRC, layout: { visibility: 'none' }, paint: { 'raster-opacity': 1 } }, beforeId);
    } catch (e) { console.warn('[basemap] satellite indisponible', e && e.message); }
  }

  function render(btn) {
    btn.classList.toggle('on', on);
    btn.innerHTML = ICON + '<span class="bt-key">Fond</span><span class="bt-val">' + (on ? 'Satellite' : 'Carte') + '</span>';
    btn.title = on ? 'Revenir au fond carte' : 'Basculer vers le satellite';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function build() {
    if (document.getElementById('basemap-toggle')) return;
    map = window.HumintMap && window.HumintMap.getMap && window.HumintMap.getMap();
    if (!map) return;
    injectCSS();
    addSatLayer();
    var btn = document.createElement('button');
    btn.id = 'basemap-toggle';
    btn.type = 'button';
    render(btn);
    btn.onclick = function () {
      if (!map.getLayer(SAT_LYR)) addSatLayer();
      on = !on;
      try { map.setLayoutProperty(SAT_LYR, 'visibility', on ? 'visible' : 'none'); } catch (e) { /* */ }
      render(btn);
    };
    document.body.appendChild(btn);
  }

  function boot() {
    if (window.HumintMap && window.HumintMap.getMap && window.HumintMap.getMap()) { build(); return; }
    window.addEventListener('algorMapReady', build, { once: true });
    // Filet de sécurité si l'event est déjà passé avant le chargement du module.
    var n = 0, t = setInterval(function () {
      n++;
      if (window.HumintMap && window.HumintMap.getMap && window.HumintMap.getMap()) { clearInterval(t); build(); }
      else if (n > 60) clearInterval(t);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
