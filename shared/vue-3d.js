/**
 * vue-3d.js — Jeton « Vue 3D » pour la carte HUMINT (/carte/).
 *
 * Module IIFE autonome et ADDITIF, calqué sur basemap-toggle.js : n'édite pas
 * humint-engine.js. Récupère la carte via window.HumintMap.getMap() après
 * l'event `algorMapReady`, pose un jeton en fin de #chipbar (ré-inséré par un
 * MutationObserver, le moteur reconstruisant la barre à chaque filtre).
 *
 * Le jeton ouvre /carte/batiments-3d/ville/?ville=<id> : la ville en 3D
 * texturée (imagerie satellite au sol et sur les toits, hauteurs par bâtiment,
 * incidents HUMINT de l'emprise). Les villes disponibles sont déclarées ici ;
 * en ajouter une = ajouter une entrée (id, nom, bbox) et générer son fichier
 * de hauteurs (voir carte/batiments-3d/outils/README.md).
 */
(function () {
  'use strict';

  var VILLES = [
    { id: 'gao', nom: 'Gao', bbox: { w: -0.0495, s: 16.2605, e: -0.0265, n: 16.2835 } }
  ];
  var PAGE = '/carte/batiments-3d/ville/';

  var map = null;
  var chip = null;

  function villeCourante() {
    if (!map) return VILLES[0];
    var c = map.getCenter();
    for (var i = 0; i < VILLES.length; i++) {
      var b = VILLES[i].bbox, m = 0.25; /* marge en degrés : la ville reste proposée autour de son emprise */
      if (c.lng > b.w - m && c.lng < b.e + m && c.lat > b.s - m && c.lat < b.n + m) return VILLES[i];
    }
    return null;
  }

  function render() {
    var v = villeCourante();
    chip.className = 'chip chip-edit chip-vue3d' + (v ? ' chip-pays' : '');
    chip.innerHTML = '<span class="chip-key">Vue 3D</span><span class="chip-val">' + (v ? v.nom : VILLES[0].nom) + '</span><span class="chip-caret">⬢</span>';
    chip.title = v ? 'Ouvrir ' + v.nom + ' en 3D texturée' : 'Ville 3D disponible : ' + VILLES.map(function (x) { return x.nom; }).join(', ');
  }

  function makeChip() {
    chip = document.createElement('button');
    chip.type = 'button';
    chip.id = 'chip-vue3d';
    render();
    chip.onclick = function (e) {
      e.stopPropagation();
      var v = villeCourante() || VILLES[0];
      window.location.href = PAGE + '?ville=' + encodeURIComponent(v.id);
    };
  }

  function ensureInBar() {
    var bar = document.getElementById('chipbar');
    if (!bar || !chip) return;
    if (chip.parentNode !== bar) bar.appendChild(chip);
  }

  function build() {
    if (chip) return;
    map = window.HumintMap && window.HumintMap.getMap && window.HumintMap.getMap();
    if (!map) return;
    makeChip();
    ensureInBar();
    map.on('moveend', render);
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
