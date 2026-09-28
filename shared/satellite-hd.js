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
 *  - frontières : celles du moteur (admin0-thick), passées en blanc ;
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
  var NOTRE = /^(shd-|humint|region|th-|admin0-thick)/;
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
      // Noms à ~70 % de leur taille Google (tuiles déclarées en 180 px) : en 256 px ils
      // paraissaient trop gros et flous, en 128 px illisibles.
      map.addSource(SRC.noms, { type: 'raster', tiles: tuiles(sessions.noms), tileSize: 180, maxzoom: 19, attribution: '' });
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

  /* ─────────── Mention obligatoire (logo Google + copyright de la zone vue) ───────────
   * Posée juste au-dessus de la frise (#timeline), sur sa largeur : jamais recouverte par
   * la frise, le panneau d'analyse ou le logo Mapbox, et lisible sur mobile (retour à la ligne). */
  function afficherCredit(v) {
    if (!credit) {
      credit = document.createElement('div');
      credit.id = 'shd-credit';
      credit.style.cssText = 'position:fixed;z-index:6;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:2px 8px;' +
        'padding:3px 8px;border-radius:2px;background:rgba(15,16,19,.72);color:#e6e6e8;font:400 11px/1.35 "IBM Plex Mono",monospace;pointer-events:none;text-align:center';
      credit.innerHTML = '<img alt="Google" src="https://assets.ion.cesium.com/google-credit.png" style="height:13px;flex:none"><span data-c style="min-width:0"></span><span style="opacity:.7">via Cesium ion</span>';
      document.body.appendChild(credit);
      window.addEventListener('resize', placerCredit);
    }
    credit.style.display = v ? 'flex' : 'none';
    if (v) placerCredit();
  }
  function placerCredit() {
    if (!credit || credit.style.display === 'none') return;
    var tl = document.getElementById('timeline'), r = tl && tl.offsetParent ? tl.getBoundingClientRect() : null;
    if (r && r.width) {
      // Laisse libres les boutons +/− quand ils descendent au niveau de la mention (mobile).
      var zc = document.querySelector('.mapboxgl-ctrl-bottom-right'), zr = zc && zc.getBoundingClientRect();
      var larg = r.width;
      if (zr && zr.height && zr.left < r.right && zr.top < r.top) larg = Math.max(120, zr.left - r.left - 6);
      credit.style.left = Math.round(r.left) + 'px'; credit.style.width = Math.round(larg) + 'px';
      credit.style.right = 'auto'; credit.style.bottom = Math.round(innerHeight - r.top + 6) + 'px';
    } else {
      credit.style.left = '6px'; credit.style.right = '6px'; credit.style.width = 'auto'; credit.style.bottom = '32px';
    }
  }
  var creditT = null, creditJeton = 0;
  function majCredit() {
    if (!on || !sessions) return;
    placerCredit();
    clearTimeout(creditT);
    creditT = setTimeout(function () {
      // Niveau des tuiles réellement demandées (déclarées en TAILLE px, Mapbox raisonne en 512).
      var b = map.getBounds(), z = Math.max(0, Math.min(19, Math.round(map.getZoom() + Math.log2(512 / TAILLE)))), j = ++creditJeton, s = sessions.sat;
      var u = s.base + '/tile/v1/viewport?' + s.q + '&zoom=' + z + '&north=' + b.getNorth().toFixed(5) + '&south=' + b.getSouth().toFixed(5) +
        '&east=' + b.getEast().toFixed(5) + '&west=' + b.getWest().toFixed(5);
      fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (j !== creditJeton || !credit) return;
        credit.querySelector('[data-c]').textContent = (d && d.copyright) || 'Imagery ©Google';
        placerCredit();
      }).catch(function () { /* */ });
    }, 500);
  }

  /* ─────────── Bascule ─────────── */
  // Au-delà du détail natif des photos (niveau 19), l'image n'est plus qu'agrandie
  // (pixels visibles) : zoom plafonné en mode HD, rétabli à la sortie.
  var zoomMaxAvant = null;
  function plafonnerZoom(v) {
    var max = TAILLE === 128 ? 18.6 : 19.6;
    if (v) { zoomMaxAvant = map.getMaxZoom(); map.setMaxZoom(max); }
    else if (zoomMaxAvant != null) { map.setMaxZoom(zoomMaxAvant); zoomMaxAvant = null; }
  }
  // Frontières : on garde celle du moteur (admin0-thick, précise, suit les fleuves) passée
  // en blanc sur l'imagerie, au lieu du trait noir ; pas de second tracé approximatif.
  var FRONT = 'admin0-thick', frontAvant = null;
  function frontiereBlanche(v) {
    if (!map.getLayer(FRONT)) return;
    try {
      if (v) {
        frontAvant = { c: map.getPaintProperty(FRONT, 'line-color'), o: map.getPaintProperty(FRONT, 'line-opacity'), w: map.getPaintProperty(FRONT, 'line-width') };
        map.setPaintProperty(FRONT, 'line-color', '#ffffff');
        map.setPaintProperty(FRONT, 'line-opacity', 0.8);
        map.setPaintProperty(FRONT, 'line-width', ['interpolate', ['linear'], ['zoom'], 3, 0.9, 6, 1.6, 9, 2.2, 12, 2.8]);
      } else if (frontAvant) {
        map.setPaintProperty(FRONT, 'line-color', frontAvant.c);
        map.setPaintProperty(FRONT, 'line-opacity', frontAvant.o);
        map.setPaintProperty(FRONT, 'line-width', frontAvant.w);
        frontAvant = null;
      }
    } catch (e) { /* */ }
  }
  // gen : numéro du dernier clic. Une activation dont le clic a été suivi d'un autre
  // (double clic, clic pendant le chargement) est abandonnée au lieu d'installer la HD.
  var gen = 0;
  function activer(g) {
    return (sessions ? Promise.resolve(sessions) : ouvrirSessions()).then(function () {
      if (g !== gen || !on) return;
      erreurs = 0; relance = false; enRelance = false; t0Erreurs = 0;
      masquerFond();
      ajouterCouches();
      afficherCredit(true);
      plafonnerZoom(true);
      frontiereBlanche(true);
      majCredit();
    });
  }
  function desactiver() {
    retirerCouches();
    reveilFond();
    afficherCredit(false);
    plafonnerZoom(false);
    frontiereBlanche(false);
  }
  // Session Google expirée ou refusée : 8 échecs en 30 s déclenchent une nouvelle session
  // (les échecs de l'ancienne session arrivés pendant la relance sont ignorés) ; si ça
  // recommence ensuite, on abandonne proprement. Écouter 'error' coupe l'affichage par défaut
  // de Mapbox : les erreurs qui ne sont pas les nôtres sont donc renvoyées à la console.
  var enRelance = false, t0Erreurs = 0;
  function surErreur(e) {
    if (!e || (e.sourceId !== SRC.sat && e.sourceId !== SRC.noms)) { console.error((e && e.error) || e); return; }
    if (!on || enRelance) return;
    var now = Date.now();
    if (now - t0Erreurs > 30000) { erreurs = 0; t0Erreurs = now; }
    if (++erreurs < 8) return;
    if (!relance) {
      relance = true; enRelance = true;
      ouvrirSessions().then(function () {
        [['sat', SRC.sat], ['noms', SRC.noms]].forEach(function (p) { var s = map.getSource(p[1]); if (s && s.setTiles) s.setTiles(tuiles(sessions[p[0]])); });
      }).catch(function () { /* */ }).then(function () { enRelance = false; erreurs = 0; t0Erreurs = Date.now(); });
      return;
    }
    gen++; on = false; desactiver(); render('indisponible');
    var g2 = gen; setTimeout(function () { if (g2 === gen && !on) render(); }, 3000);
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
      var g = ++gen;
      if (!on) { desactiver(); render(); return; }
      render('chargement…');
      activer(g).then(function () { if (g === gen) render(); }, function (err) {
        if (g !== gen) return;
        console.warn('[satellite-hd]', err && err.message); on = false; sessions = null; desactiver(); render('indisponible');
        setTimeout(function () { if (g === gen && !on) render(); }, 2500);
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

  function prete() { var H = window.HumintMap; return !!(H && H.getMap && H.getMap() && (!H.isReady || H.isReady())); }
  function boot() {
    if (prete()) { build(); return; }
    window.addEventListener('algorMapReady', build, { once: true });
    var n = 0, t = setInterval(function () {
      n++;
      if (prete()) { clearInterval(t); build(); }
      else if (n > 240) clearInterval(t);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
