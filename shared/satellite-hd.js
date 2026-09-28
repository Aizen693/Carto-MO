/**
 * satellite-hd.js — Imagerie satellite haute définition pour la carte (/carte/).
 *
 * Module IIFE autonome et ADDITIF, sur le modèle de basemap-toggle.js : n'édite pas
 * humint-engine.js. Il récupère l'instance Mapbox via window.HumintMap.getMap().
 *
 * Remplace la vue 3D (fond-3d.js), trop lourde pour Safari : c'est la MÊME imagerie Google
 * que le maillage 3D (Airbus, Maxar, ~30 cm), mais en tuiles 2D affichées par Mapbox, sans
 * second moteur graphique. Jeton « Imagerie : Standard / Satellite HD » dans la barre.
 *
 * En mode HD :
 *  - fond : Google Maps 2D Satellite (Cesium ion, actif 3830182) ;
 *  - noms de lieux : Google Maps 2D Labels Only (actif 3830185), transparents ;
 *  - frontières : Natural Earth 1:10 M (/shared/v5/frontieres-3d.json), lignes blanches ;
 *  - les couches du fond Mapbox sont masquées (pas de mélange de deux cartes, exigence
 *    des conditions Google) ; les incidents et régions restent au-dessus.
 *  - mention obligatoire : logo Google + copyright de la zone vue (Map Tiles API, viewport).
 *
 * Jeton : window.ALGOR_3D = { ionToken } lu dans /shared/v5/config-3d.js (en local,
 * /carte/globe-3d/_local/config.js d'abord). Sans jeton, le jeton de barre n'apparaît pas.
 */
(function () {
  'use strict';

  var DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var ION = 'https://api.cesium.com/v1/assets/';
  var ACTIF_SAT = 3830182, ACTIF_NOMS = 3830185;
  var FRONTIERES_URL = '/shared/v5/frontieres-3d.json?v=20260928b';
  var IDS = { sat: 'shd-sat', noms: 'shd-noms', front: 'shd-front' };
  var SRC = { sat: 'shd-sat-src', noms: 'shd-noms-src', front: 'shd-front-src' };
  var NOTRE = /^(shd-|humint|region|th-)/;
  // Écrans Retina : tuiles déclarées en 128 px pour que Mapbox demande le niveau de zoom
  // supérieur (une image deux fois plus fine à taille égale à l'écran).
  var TAILLE = (window.devicePixelRatio || 1) >= 1.5 ? 128 : 256;
  var ICON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5M12 3.5C9.4 5.9 8.1 8.7 8.1 12s1.3 6.1 3.9 8.5"/></svg>';

  var map = null, chip = null, on = false, demarre = false;
  var sessions = null, frontieres = null, masques = [], credit = null, erreurs = 0, relance = false;

  function cfg() { return window.ALGOR_3D || {}; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function chargerScript(src) {
    return new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = ok; s.onerror = function () { ko(new Error('chargement impossible : ' + src)); };
      document.head.appendChild(s);
    });
  }
  function chargerConfig() {
    if (window.ALGOR_3D) return Promise.resolve();
    var enLigne = function () { return chargerScript('/shared/v5/config-3d.js?v=20260928a').catch(function () { /* pas de clé */ }); };
    if (!DEV) return enLigne();
    return chargerScript('/carte/globe-3d/_local/config.js').catch(function () { /* */ }).then(function () { if (!window.ALGOR_3D) return enLigne(); });
  }

  /* ─────────── Sessions Google (par Cesium ion) ─────────── */
  function session(actif) {
    return fetch(ION + actif + '/endpoint', { headers: { Authorization: 'Bearer ' + cfg().ionToken } })
      .then(function (r) { if (!r.ok) throw new Error('Cesium ion ' + r.status); return r.json(); })
      .then(function (d) {
        var o = d.options || {};
        if (!o.url || !o.session || !o.key) throw new Error('réponse Cesium ion inattendue');
        return {
          base: o.url.replace(/\/$/, ''), q: 'session=' + encodeURIComponent(o.session) + '&key=' + encodeURIComponent(o.key),
          format: o.imageFormat || 'jpeg',
        };
      });
  }
  function ouvrirSessions() {
    return Promise.all([session(ACTIF_SAT), session(ACTIF_NOMS)]).then(function (r) { sessions = { sat: r[0], noms: r[1] }; return sessions; });
  }
  function tuiles(s) { return [s.base + '/v1/2dtiles/{z}/{x}/{y}?' + s.q]; }

  /* ─────────── Couches ─────────── */
  function avant() {
    var ls = map.getStyle().layers || [];
    for (var i = 0; i < ls.length; i++) if (/^(region|humint|th-)/.test(ls[i].id)) return ls[i].id;
    return undefined;
  }
  function chargerFrontieres() {
    if (frontieres) return Promise.resolve(frontieres);
    return fetch(FRONTIERES_URL).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (d) {
      var lignes = (d.lignes || []).map(function (l) {
        var c = []; for (var i = 0; i + 1 < l.length; i += 2) c.push([l[i], l[i + 1]]); return c;
      });
      frontieres = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lignes } }] };
      return frontieres;
    });
  }
  function ajouterCouches() {
    var b = avant();
    if (!map.getSource(SRC.sat)) {
      map.addSource(SRC.sat, { type: 'raster', tiles: tuiles(sessions.sat), tileSize: TAILLE, maxzoom: 19, attribution: '' });
      map.addLayer({ id: IDS.sat, type: 'raster', source: SRC.sat, paint: { 'raster-fade-duration': 150 } }, b);
    }
    if (frontieres && !map.getSource(SRC.front)) {
      map.addSource(SRC.front, { type: 'geojson', data: frontieres });
      map.addLayer({
        id: IDS.front, type: 'line', source: SRC.front, layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 6, 1.5, 10, 2.2, 14, 2.8] },
      }, b);
    }
    if (!map.getSource(SRC.noms)) {
      // Noms toujours en tuiles de 256 px : en 128 px ils s'afficheraient à moitié taille.
      map.addSource(SRC.noms, { type: 'raster', tiles: tuiles(sessions.noms), tileSize: 256, maxzoom: 19, attribution: '' });
      map.addLayer({ id: IDS.noms, type: 'raster', source: SRC.noms, paint: { 'raster-fade-duration': 150 } }, b);
    }
  }
  function retirerCouches() {
    [IDS.noms, IDS.front, IDS.sat].forEach(function (id) { if (map.getLayer(id)) map.removeLayer(id); });
    [SRC.noms, SRC.front, SRC.sat].forEach(function (id) { if (map.getSource(id)) map.removeSource(id); });
  }
  // Masque le fond Mapbox (rues, noms, bâtiments, sol) : une source Mapbox n'est plus
  // téléchargée quand aucun de ses calques n'est visible. Les calques des autres modules restent.
  function masquerFond() {
    (map.getStyle().layers || []).forEach(function (l) {
      if (NOTRE.test(l.id)) return;
      var fond = l.type === 'background' || l.type === 'sky' || l.source === 'composite' || l.source === 'mapbox';
      if (!fond || (l.layout || {}).visibility === 'none') return;
      try { map.setLayoutProperty(l.id, 'visibility', 'none'); masques.push(l.id); } catch (e) { /* */ }
    });
  }
  function reveilFond() {
    masques.forEach(function (id) { try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible'); } catch (e) { /* */ } });
    masques = [];
  }

  /* ─────────── Mention obligatoire (logo Google + copyright de la zone vue) ─────────── */
  function afficherCredit(v) {
    if (!credit) {
      credit = document.createElement('div');
      credit.id = 'shd-credit';
      credit.style.cssText = 'position:absolute;left:100px;bottom:6px;z-index:5;display:flex;align-items:center;gap:8px;max-width:calc(100% - 520px);' +
        'padding:2px 6px;border-radius:2px;background:rgba(15,16,19,.66);color:#e6e6e8;font:400 11px/1.4 "IBM Plex Mono",monospace;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      credit.innerHTML = '<img alt="Google" src="https://assets.ion.cesium.com/google-credit.png" style="height:13px;flex:none"><span data-c></span><span style="opacity:.7">via Cesium ion</span>';
      (map.getContainer() || document.body).appendChild(credit);
    }
    credit.style.display = v ? 'flex' : 'none';
  }
  var creditT = null, creditJeton = 0;
  function majCredit() {
    if (!on || !sessions) return;
    clearTimeout(creditT);
    creditT = setTimeout(function () {
      var b = map.getBounds(), z = Math.max(0, Math.min(19, Math.round(map.getZoom()))), j = ++creditJeton, s = sessions.sat;
      var u = s.base + '/tile/v1/viewport?' + s.q + '&zoom=' + z + '&north=' + b.getNorth().toFixed(5) + '&south=' + b.getSouth().toFixed(5) +
        '&east=' + b.getEast().toFixed(5) + '&west=' + b.getWest().toFixed(5);
      fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (j !== creditJeton || !credit) return;
        credit.querySelector('[data-c]').textContent = (d && d.copyright) || 'Imagery ©Google';
      }).catch(function () { /* */ });
    }, 500);
  }

  /* ─────────── Bascule ─────────── */
  function activer() {
    return Promise.all([ouvrirSessions(), chargerFrontieres().catch(function () { return null; })]).then(function () {
      erreurs = 0; relance = false;
      masquerFond();
      ajouterCouches();
      afficherCredit(true);
      majCredit();
    });
  }
  function desactiver() {
    retirerCouches();
    reveilFond();
    afficherCredit(false);
  }
  // Session Google expirée ou refusée : on en rouvre une fois, puis on abandonne proprement.
  function surErreur(e) {
    if (!on || !e || (e.sourceId !== SRC.sat && e.sourceId !== SRC.noms)) return;
    if (++erreurs < 8) return;
    if (!relance) {
      relance = true; erreurs = 0;
      ouvrirSessions().then(function () {
        [['sat', SRC.sat], ['noms', SRC.noms]].forEach(function (p) { var s = map.getSource(p[1]); if (s && s.setTiles) s.setTiles(tuiles(sessions[p[0]])); });
      }).catch(function () { /* */ });
      return;
    }
    on = false; desactiver(); render('indisponible');
    setTimeout(function () { render(); }, 3000);
  }

  function render(etat) {
    chip.className = 'chip chip-edit chip-satellite-hd' + (on ? ' chip-pays' : '');
    chip.innerHTML = '<span class="chip-key">Imagerie</span><span class="chip-val">' + esc(etat || (on ? 'Satellite HD' : 'Standard')) + '</span><span class="chip-caret">' + ICON + '</span>';
    chip.title = on ? 'Revenir à la carte standard' : 'Afficher l\'imagerie satellite haute définition';
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function makeChip() {
    chip = document.createElement('button');
    chip.type = 'button';
    chip.id = 'chip-satellite-hd';
    render();
    chip.onclick = function (e) {
      e.stopPropagation();
      on = !on;
      if (!on) { desactiver(); render(); return; }
      render('chargement…');
      activer().then(function () { render(); }, function (err) {
        console.warn('[satellite-hd]', err && err.message); on = false; desactiver(); render('indisponible');
        setTimeout(function () { render(); }, 2500);
      });
    };
  }
  function ensureInBar() {
    var bar = document.getElementById('chipbar');
    if (!bar || !chip) return;
    // Même règle que basemap-toggle.js : en dernier. Si ce module est chargé, on se place
    // juste avant lui (se mettre après ferait boucler les deux MutationObserver).
    var fond = document.getElementById('chip-basemap');
    if (fond && fond.parentNode === bar) { if (chip.nextElementSibling !== fond) bar.insertBefore(chip, fond); }
    else if (chip.parentNode !== bar || chip !== bar.lastElementChild) bar.appendChild(chip);
  }

  function build() {
    if (demarre) return;
    map = window.HumintMap && window.HumintMap.getMap && window.HumintMap.getMap();
    if (!map) return;
    demarre = true;
    chargerConfig().then(function () {
      if (!cfg().ionToken) return;
      makeChip();
      ensureInBar();
      var bar = document.getElementById('chipbar');
      if (bar) new MutationObserver(ensureInBar).observe(bar, { childList: true });
      map.on('moveend', majCredit);
      map.on('error', surErreur);
      // Style rechargé : les couches ajoutées disparaissent avec lui, on les remet.
      map.on('style.load', function () { if (on && sessions) { masques = []; masquerFond(); ajouterCouches(); } });
    });
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
