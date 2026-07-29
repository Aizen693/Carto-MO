/**
 * zones-3d.js — Onglet « Infrastructures 3D » de la carte HUMINT (/carte/).
 *
 * Modélise des COMPLEXES (aéroport, hôpital, camp militaire) en 3D au-dessus
 * d'une imagerie satellite + relief, pour étudier quelles infrastructures sont
 * les plus touchées. Chaque complexe est composé de STRUCTURES (bâtiments) dont
 * l'emprise tracée est rendue en volume (fill-extrusion). La SÉVÉRITÉ de chaque
 * structure combine un statut de dommage manuel (intact/endommagé/détruit) et le
 * nombre d'incidents HUMINT/OSINT liés (auto, par proximité géo des points du
 * moteur). Couleur + classement « les plus touchées » en découlent.
 *
 * 100% additif : on réutilise l'instance Mapbox du moteur (window.HumintMap),
 * on n'ajoute/retire que des sources/couches dédiées. Design blanc/violet/Jakarta.
 *
 * Dépend de Mapbox GL JS et de shared/humint-engine.js, qui expose
 * window.HumintMap.{getMap,getCountry,isReady,recenter,getFeatures} et émet
 * l'événement `algorMapReady`.
 */
(function () {
  'use strict';

  var ZONES_PATH = '/carte/zones-3d.json';
  var ZONES_V = '20260630s';
  // Charge les zones depuis le BUCKET PRIVÉ (gated, comme le HUMINT) en priorité,
  // repli sur le fichier statique pour le dev local. Jamais de data sensible en public.
  function fetchZones() {
    if (window.algorAuth && window.algorAuth.loadZoneFile && window.ZONE_PRIVATE) {
      return Promise.race([
        window.algorAuth.loadZoneFile(ZONES_PATH),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout bucket')); }, 20000); }),
      ]).catch(function (e) {
        console.warn('[zones-3d] bucket indisponible, repli statique', e && e.message);
        return fetch(ZONES_PATH + '?v=' + ZONES_V).then(function (r) { return r.json(); });
      });
    }
    return fetch(ZONES_PATH + '?v=' + ZONES_V).then(function (r) { return r.json(); });
  }
  var DEM_SRC = 'zones3d-dem';
  var SAT_SRC = 'zones3d-sat-src';
  var SAT_LAYER = 'zones3d-sat';
  var SRC = 'zones3d-struct';
  var PERI_SRC = 'zones3d-peri';
  var ENT_SRC = 'zones3d-ent';
  var L_FILL = 'zones3d-fill', L_EXTRUDE = 'zones3d-extrude', L_LINE = 'zones3d-line', L_LABEL = 'zones3d-label';
  var L_PERI_F = 'zones3d-peri-fill', L_PERI_L = 'zones3d-peri-line';
  var L_ENT_GLOW = 'zones3d-ent-glow', L_ENT = 'zones3d-ent-mark', L_ENT_RING = 'zones3d-ent-ring';
  var SECT_SRC = 'zones3d-sector', L_SECT = 'zones3d-sector-pt';   // incidents réels du secteur (contexte + replay)
  var ENT_RADIUS_M = 9000;  // rayon « secteur » autour du complexe pour les entités HUMINT/OSINT de contexte
  var TRACE_SRC = 'zones3d-trace', L_TRACE_FILL = 'zones3d-trace-fill', L_TRACE_LINE = 'zones3d-trace-line', L_TRACE_PT = 'zones3d-trace-pt';
  var TRACE_KEY = 'algor-z3d-traces';   // emprises tracées à la main (localStorage), par id de zone
  function loadTraces() { try { return JSON.parse(localStorage.getItem(TRACE_KEY) || '{}'); } catch (e) { return {}; } }
  function saveTraces(t) { try { localStorage.setItem(TRACE_KEY, JSON.stringify(t)); } catch (e) { /* */ } }

  var IMAGERY = {
    // Esri/Maxar : nettement plus net que Mapbox en zone rurale africaine.
    esri: { source: { type: 'raster', tileSize: 256, maxzoom: 19,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics' } },
    mapbox: { source: { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 } },
  };

  var CAT_LABEL = { aeroport: 'Aéroport', hopital: 'Hôpital', militaire: 'Militaire', infrastructure: 'Infrastructure' };
  var DAMAGE = {
    intact: { base: 0, label: 'Intact', cls: 'z3d-dmg-ok' },
    endommage: { base: 2, label: 'Endommagé', cls: 'z3d-dmg-mid' },
    detruit: { base: 4, label: 'Détruit', cls: 'z3d-dmg-bad' },
  };

  var state = { zones: [], map: null, active: null, imagery: 'esri', mode: 'satellite', light: 'day', in3D: false, chipReady: false, structById: {}, linkRadiusM: 220, entities: [], linkedEnts: [], sectorEnts: [], trace: { on: false, pts: [] }, orbit: { on: false, raf: null, stop: null }, pulse: { raf: null }, replay: { on: false, raf: null }, _replayDate: null, _teleH: null };

  function $(id) { return document.getElementById(id); }
  function safe(fn) { try { fn(); } catch (e) { /* teardown résilient : un retrait qui échoue ne doit pas bloquer la suite */ } }
  function dropLayer(id) { safe(function () { if (state.map.getLayer(id)) state.map.removeLayer(id); }); }
  function dropSource(id) { safe(function () { if (state.map.getSource(id)) state.map.removeSource(id); }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function country() { return (window.HumintMap && window.HumintMap.getCountry && window.HumintMap.getCountry()) || null; }
  function zonesFor(c) { return state.zones.filter(function (z) { return z.pays === c; }); }

  /* ─────────── Géométrie & sévérité ─────────── */
  function centroid(ring) {
    var x = 0, y = 0, n = ring.length;
    for (var i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1]; }
    return [x / n, y / n];
  }
  function haversine(a, b) {
    var R = 6371000, dLat = (b[1] - a[1]) * Math.PI / 180, dLon = (b[0] - a[0]) * Math.PI / 180;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  // Incidents HUMINT/OSINT du moteur tombant dans le rayon de liaison du bâtiment.
  function autoIncidents(cen) {
    var feats = (window.HumintMap && window.HumintMap.getFeatures && window.HumintMap.getFeatures()) || [];
    return feats.filter(function (f) { return f.coords && haversine(cen, f.coords) <= state.linkRadiusM; });
  }
  function severity(struct) {
    var dmg = DAMAGE[struct.damage] || DAMAGE.intact;
    var manual = (struct.incidents || []).length;
    var auto = struct._auto != null ? struct._auto : 0;
    var linked = manual + auto;
    return { score: dmg.base + linked, dmg: dmg, manual: manual, auto: auto, linked: linked };
  }
  function sevColor(s, damageKey) {
    if (damageKey === 'detruit') return '#B23B30';
    // Intact = matériau bâti réaliste (béton/sable), pas un aplat coloré.
    if (s.score === 0) return '#cdc7b8';
    if (s.score <= 2) return '#E0A23C';
    if (s.score <= 4) return '#DD6A2A';
    return '#C0392B';
  }
  function extrudeHeight(struct) {
    // Hauteur minimale pour que chaque bâtiment soit un VOLUME lisible (pas un pavé plat).
    var h = struct.height || 0;
    if (!h) return 0;                                  // surfaces plates (piste, apron, enceinte)
    if (struct.damage === 'detruit') return Math.max(5, h * 0.6);  // partiellement effondré, reste un volume
    return Math.max(6, h);
  }

  /* ─────────── CSS injecté ─────────── */
  function injectCSS() {
    if ($('zones3d-css')) return;
    var s = document.createElement('style');
    s.id = 'zones3d-css';
    s.textContent = [
      '.chip-3d{cursor:pointer;appearance:none;-webkit-appearance:none;text-align:left;transition:border-color .12s,box-shadow .12s}',
      '.chip-3d:hover{border-left-color:var(--blue)}',
      '.chip-3d.on{background:var(--grad);border:none;box-shadow:0 8px 22px -7px rgba(86,80,198,.6)}',
      '.chip-3d.on .chip-key{color:rgba(255,255,255,.82)}',
      '.chip-3d.on .chip-val{color:#fff}',
      '.chip-3d.on .chip-caret{color:rgba(255,255,255,.85)}',
      '.chip-3d[disabled]{opacity:.5;cursor:default}',
      '#z3d-bar{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);z-index:9;display:none;',
      '  align-items:center;gap:12px;background:rgba(255,255,255,.9);backdrop-filter:blur(16px) saturate(1.4);-webkit-backdrop-filter:blur(16px) saturate(1.4);border:1px solid var(--ln);border-radius:14px;',
      '  box-shadow:var(--shadow);padding:9px 13px 9px 16px;max-width:calc(100% - 60px)}',
      '#z3d-bar.on{display:flex;animation:z3dIn .4s cubic-bezier(.16,.84,.3,1)}',
      '@keyframes z3dIn{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}',
      '@keyframes z3dInPanel{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}',
      '@media (prefers-reduced-motion:reduce){#z3d-bar.on,#z3d-rank.on{animation:none}}',
      '.z3d-name{font:800 13px var(--jakarta);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px}',
      '.z3d-seg{display:inline-flex;gap:3px;background:rgba(107,63,160,.07);border-radius:11px;padding:3px}',
      '.z3d-seg button{border:none;background:none;cursor:pointer;font:700 9px/1 var(--jakarta);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:8px 11px;border-radius:8px;white-space:nowrap;transition:all .15s}',
      '.z3d-seg button:hover{color:var(--violet)}',
      '.z3d-seg button.on{background:var(--grad);color:#fff;box-shadow:0 5px 14px -5px rgba(86,80,198,.55)}',
      '.z3d-exit{border:1px solid var(--ln);background:#fff;color:var(--violet);cursor:pointer;font:700 9px/1 var(--jakarta);letter-spacing:.08em;text-transform:uppercase;padding:9px 13px;border-radius:10px}',
      '.z3d-exit:hover{background:rgba(107,63,160,.07)}',
      '.z3d-sub{font:600 9px/1 var(--jakarta);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}',
      // popover liste complexes
      '.z3d-opt-meta{display:block;font:600 9px/1.3 var(--jakarta);color:var(--muted);margin-top:3px;white-space:normal}',
      '.z3d-opt-row{display:flex;align-items:center;gap:8px;width:100%}',
      '.z3d-cat{flex:none;font:800 8px/1 var(--jakarta);letter-spacing:.08em;text-transform:uppercase;color:var(--violet);background:rgba(107,63,160,.1);border-radius:6px;padding:4px 7px}',
      '.z3d-sevbadge{flex:none;font:800 9px/1 var(--jakarta);color:#fff;border-radius:7px;padding:4px 8px}',
      // panneau classement
      '#z3d-rank{position:absolute;top:64px;left:18px;z-index:7;display:none;flex-direction:column;width:312px;',
      '  max-height:calc(100% - 150px);background:rgba(255,255,255,.93);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);border:1px solid var(--ln);border-radius:18px;',
      '  box-shadow:0 24px 60px -18px rgba(46,24,87,.38);overflow:hidden}',
      '#z3d-rank.on{display:flex;animation:z3dInPanel .45s cubic-bezier(.16,.84,.3,1)}',
      '.z3d-rank-head{padding:13px 15px;border-bottom:1px solid var(--ln-soft);background:linear-gradient(180deg,rgba(107,63,160,.06),rgba(107,63,160,0))}',
      '.z3d-rank-t{font:800 8.5px/1.35 var(--jakarta);letter-spacing:.1em;text-transform:uppercase;color:var(--violet)}',
      '.z3d-rank-s{font:700 12px/1.3 var(--jakarta);color:var(--ink);margin-top:5px}',
      '.z3d-rank-list{overflow-y:auto;padding:8px}',
      '.z3d-rank-list::-webkit-scrollbar{width:6px}.z3d-rank-list::-webkit-scrollbar-thumb{background:var(--ln);border-radius:6px}',
      '.z3d-row{display:flex;align-items:center;gap:10px;width:100%;border:1px solid transparent;background:#fff;cursor:pointer;text-align:left;padding:9px 10px 9px 13px;border-radius:12px;margin-bottom:3px;transition:border-color .14s,box-shadow .14s,transform .14s}',
      '.z3d-row:hover{border-color:var(--ln);box-shadow:0 9px 22px -12px rgba(46,24,87,.32);transform:translateX(2px)}',
      '.z3d-rank-num{flex:none;width:22px;text-align:center;font:800 11px/1 var(--jakarta);color:var(--muted)}',
      '.z3d-bar-wrap{flex:1;min-width:0}',
      '.z3d-row-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px}',
      '.z3d-row-n{font:700 12.5px/1.15 var(--jakarta);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.z3d-row-fn{font:600 9.5px/1.2 var(--jakarta);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}',
      '.z3d-track{height:7px;background:rgba(123,90,189,.10);border-radius:5px;overflow:hidden;margin-top:6px}',
      '.z3d-fill{display:block;height:100%;border-radius:5px}',
      '.z3d-row-meta{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px}',
      '.z3d-dmg{font:800 8px/1 var(--jakarta);letter-spacing:.05em;text-transform:uppercase;padding:4px 7px;border-radius:6px}',
      '.z3d-dmg-ok{background:rgba(126,138,166,.14);color:#5b6b86}',
      '.z3d-dmg-mid{background:rgba(221,106,42,.14);color:#c0561f;border:1px solid rgba(221,106,42,.3)}',
      '.z3d-dmg-bad{background:rgba(192,57,43,.14);color:#a12b22;border:1px solid rgba(192,57,43,.35)}',
      '.z3d-inc{font:700 9px/1 var(--jakarta);color:var(--muted)}',
      // popup impact
      '.z3d-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}',
      '.z3d-tag{font:800 8.5px/1 var(--jakarta);letter-spacing:.05em;text-transform:uppercase;padding:5px 8px;border-radius:7px}',
      '.z3d-inc-list{margin-top:9px;padding-top:9px;border-top:1px solid var(--ln-soft);display:flex;flex-direction:column;gap:6px}',
      '.z3d-inc-row{display:flex;gap:8px;align-items:baseline}',
      '.z3d-inc-d{flex:none;font:700 9px var(--jakarta);color:var(--muted);min-width:64px}',
      '.z3d-inc-x{font:500 11px/1.4 var(--jakarta);color:var(--ink)}',
      '.z3d-inc-src{font:800 8px var(--jakarta);letter-spacing:.04em;padding:2px 5px;border-radius:5px;margin-right:5px}',
      '@media(max-width:680px){#z3d-rank{width:calc(100vw - 36px);max-height:46%}}',
      // En mode 3D, on masque les panneaux HUMINT 2D (non pertinents ici).
      'body.z3d-active #analysis, body.z3d-active #news, body.z3d-active #legend, body.z3d-active #timeline{display:none !important}',
      // ── Panneau « activité détectée » (entités par type) ──
      '.z3d-det{display:none;padding:10px 14px 4px;border-bottom:1px solid var(--ln-soft)}',
      '.z3d-det-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:9px}',
      '.z3d-det-h span:first-child{font:800 8.5px/1 var(--jakarta);letter-spacing:.12em;text-transform:uppercase;color:var(--ink)}',
      '.z3d-det-h span:last-child{font:700 8.5px/1 var(--mono,monospace);color:var(--muted);white-space:nowrap}',
      '.z3d-det-row{display:flex;align-items:center;gap:9px;margin-bottom:6px}',
      '.z3d-det-c{flex:none;min-width:22px;text-align:right;font:800 12px/1 var(--jakarta)}',
      '.z3d-det-l{flex:0 0 96px;font:600 10.5px/1.15 var(--jakarta);color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.z3d-sec-t{padding:10px 14px 2px;font:800 8.5px/1 var(--jakarta);letter-spacing:.12em;text-transform:uppercase;color:var(--violet)}',
      // chiffres clés (grille) + chronologie (sparkline)
      '.z3d-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--ln-soft);border-bottom:1px solid var(--ln-soft)}',
      '.z3d-m{background:rgba(255,255,255,.72);padding:9px 10px}',
      // bouton replay (rejoue l'activité du secteur sur la 3D)
      '.z3d-play{border:1px solid var(--ln);background:#fff;color:var(--violet);cursor:pointer;font:800 9px/1 var(--jakarta);width:24px;height:24px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;padding:0;transition:background .15s}',
      '.z3d-play:hover{background:rgba(107,63,160,.08)}',
      '.z3d-play.on{background:var(--grad);color:#fff;border:none}',
      '.z3d-m-v{font:800 16px/1.1 var(--jakarta);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.z3d-m-v.sm{font-size:12px}',
      '.z3d-m-l{font:700 7.5px/1 var(--jakarta);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:4px}',
      '.z3d-tl{padding:10px 14px 6px;border-bottom:1px solid var(--ln-soft)}',
      '.z3d-spark{display:flex;align-items:flex-end;gap:2px;height:38px;margin-top:6px}',
      '.z3d-bar{flex:1;min-width:2px;background:var(--grad);border-radius:2px 2px 0 0;opacity:.85}',
      '.z3d-spark-x{display:flex;justify-content:space-between;font:600 7.5px var(--mono,monospace);color:var(--muted);margin-top:4px}',
      '.z3d-row-date{flex:none;font:600 9px/1 var(--jakarta);color:var(--muted);white-space:nowrap}',
      '.z3d-empty{padding:12px 14px;font:500 11px/1.5 var(--jakarta);color:var(--muted)}',
      '.z3d-statpill{display:inline-block;font:800 8.5px/1 var(--jakarta);letter-spacing:.04em;text-transform:uppercase;color:#fff;border-radius:6px;padding:3px 7px;vertical-align:middle;margin-left:4px}',
      '.z3d-approx{display:inline-block;font:700 8px/1 var(--mono,monospace);color:var(--muted);border:1px solid var(--ln);border-radius:5px;padding:3px 6px;margin-left:4px}',
      // chronologie détaillée (liste)
      '.z3d-chrono-row{display:flex;gap:8px;align-items:baseline;padding:5px 0;border-top:1px solid var(--ln-soft)}',
      '.z3d-chrono-row:first-of-type{border-top:none}',
      '.z3d-chrono-d{flex:none;font:700 8.5px/1.2 var(--mono,monospace);color:var(--violet);min-width:52px}',
      '.z3d-chrono-b{flex:1;min-width:0}',
      '.z3d-chrono-t{font:700 10px/1.25 var(--jakarta);color:var(--ink)}',
      '.z3d-chrono-m{font:500 9.5px/1.35 var(--jakarta);color:var(--muted);margin-top:1px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      // ── rapport client : cases « inclure » + bouton export ──
      '.z3d-inc{display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none}',
      '.z3d-inc input{accent-color:var(--violet,#6B3FA0);width:13px;height:13px;cursor:pointer;flex:none}',
      '.z3d-inc-h{padding:10px 14px 2px}',
      '.z3d-off{opacity:.4}',
      '.z3d-rep-bar{padding:12px 14px 14px;border-top:1px solid var(--ln-soft);background:#fff}',
      '.z3d-rep-btn{width:100%;cursor:pointer;font:800 9.5px/1 var(--jakarta);letter-spacing:.1em;text-transform:uppercase;color:#fff;background:var(--grad,#6B3FA0);border:none;border-radius:9px;padding:12px;transition:opacity .15s}',
      '.z3d-rep-btn:hover{opacity:.9}',
      '.z3d-rep-hint{font:500 8.5px/1.4 var(--jakarta);color:var(--muted);margin-top:7px;text-align:center}',
      // ── HUD « ops » : réticule de coins + bandeau télémétrie ──
      '#z3d-hud{position:absolute;inset:0;z-index:6;display:none;pointer-events:none}',
      '#z3d-hud.on{display:block}',
      '.z3d-cnr{position:absolute;width:26px;height:26px;border:2px solid rgba(107,63,160,.55)}',
      '.z3d-cnr-tl{top:64px;left:14px;border-right:none;border-bottom:none}',
      '.z3d-cnr-tr{top:64px;right:14px;border-left:none;border-bottom:none}',
      '.z3d-cnr-bl{bottom:74px;left:14px;border-right:none;border-top:none}',
      '.z3d-cnr-br{bottom:74px;right:14px;border-left:none;border-top:none}',
      '.z3d-tele{position:absolute;top:64px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:8px;',
      '  background:#fff;border:1px solid var(--ln);border-radius:999px;box-shadow:var(--shadow);padding:7px 14px;',
      '  font:700 9.5px/1 var(--mono,monospace);letter-spacing:.08em;color:var(--ink);white-space:nowrap}',
      '.z3d-rec{width:8px;height:8px;border-radius:50%;background:#E0322B;box-shadow:0 0 0 0 rgba(224,50,43,.6);animation:z3dRec 1.6s ease-out infinite}',
      '@keyframes z3dRec{0%{box-shadow:0 0 0 0 rgba(224,50,43,.55)}70%{box-shadow:0 0 0 6px rgba(224,50,43,0)}100%{box-shadow:0 0 0 0 rgba(224,50,43,0)}}',
      '@media (prefers-reduced-motion:reduce){.z3d-rec{animation:none}}',
      // ── Traçage d'emprise ──
      '.z3d-trace-btn{border:1px solid var(--ln);background:#fff;color:var(--violet);cursor:pointer;font:700 9px/1 var(--jakarta);letter-spacing:.06em;text-transform:uppercase;padding:9px 12px;border-radius:10px}',
      '.z3d-trace-btn:hover{background:rgba(107,63,160,.07)}',
      '.z3d-trace-live{display:none;gap:6px}',
      '#z3d-bar.tracing .z3d-trace-btn{display:none}',
      '#z3d-bar.tracing .z3d-trace-live{display:inline-flex}',
      '.z3d-trace-ok{border:none;cursor:pointer;font:800 9px/1 var(--jakarta);letter-spacing:.04em;color:#fff;background:#1c8a4d;padding:9px 12px;border-radius:10px}',
      '.z3d-trace-cancel{border:1px solid var(--ln);background:#fff;color:#c0392b;cursor:pointer;font:800 11px/1 var(--jakarta);padding:9px 11px;border-radius:10px}',
      '#z3d-hint{position:absolute;bottom:74px;left:50%;transform:translateX(-50%);z-index:10;background:rgba(31,20,55,.92);color:#fff;',
      '  font:600 11px/1.3 var(--jakarta);padding:9px 14px;border-radius:10px;box-shadow:var(--shadow);max-width:520px;text-align:center}',
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ─────────── Jeton « Infrastructures 3D » ─────────── */
  function ensureChip() {
    var bar = $('chipbar');
    if (!bar) return;
    var chip = $('chip-3d');
    if (!chip) {
      chip = document.createElement('button');
      chip.id = 'chip-3d';
      chip.className = 'chip chip-edit chip-3d';
      chip.innerHTML = '<span class="chip-key">Infras 3D</span><span class="chip-val" id="chip-3d-val">Explorer</span><span class="chip-caret">▾</span>';
      chip.onclick = onChipClick;
      bar.appendChild(chip);
    } else if (chip !== bar.lastElementChild) {
      bar.appendChild(chip);
    }
    // Sans pays choisi, le jeton n'a aucun sens (il affichait un « Indispo. »
    // cryptique) : on le masque jusqu'a la selection d'un pays.
    if (!country()) { chip.style.display = 'none'; return; }
    chip.style.display = '';
    var list = zonesFor(country());
    chip.disabled = list.length === 0;
    chip.title = list.length ? list.length + ' infrastructure(s)' : 'Aucune infrastructure modélisée pour ce pays';
    chip.classList.toggle('on', state.in3D);
    var val = $('chip-3d-val');
    if (val) val.textContent = state.in3D && state.active ? state.active.name : (list.length ? 'Explorer' : 'Aucun site');
  }
  function onChipClick() {
    // Menu déroulant cohérent avec les autres chips (Pays, Période...) : on
    // choisit l'infrastructure dans le popup, puis on ouvre sa vue 3D dense.
    if (state.in3D) { exit3D(); return; }
    var list = zonesFor(country());
    if (list.length) openPicker(list, $('chip-3d'));
  }

  /* ─────────── Popover : choix du complexe (avec sévérité agrégée) ─────────── */
  function closePicker() { var p = $('z3d-pop'); if (p) p.remove(); document.removeEventListener('mousedown', outside); }
  function outside(e) { var p = $('z3d-pop'); if (p && !p.contains(e.target) && !e.target.closest('#chip-3d')) closePicker(); }
  // Mots-clés par catégorie : un incident réel est « lié » au complexe si son
  // texte cite ce type d'infrastructure (en plus d'être dans le secteur).
  var CATEGORY_KW = {
    aeroport: /a[ée]roport|a[ée]rodrome|\bpiste\b|base a[ée]rienne|nigerian air force|\bnaf\b|h[ée]liport|tarmac/i,
    hopital: /h[oô]pital|clinique|centre de sant|m[ée]dical|dispensaire|sanitaire|soins/i,
    militaire: /\bbase\b|\bcamp\b|caserne|garrison|brigade|bataillon|militaire|cantonnement|d[ée]p[oô]t|forces arm|barracks/i,
  };
  function featToEnt(f) {
    return { coords: f.coords, type: f.type || '', source: f.corrobore ? 'OSINT' : 'HUMINT', corrobore: !!f.corrobore, date: f.iso || '', detail: f.description || '', where: f.acteur || '' };
  }
  // Incidents réels du SECTEUR (rayon autour du complexe) — tous, pour les marqueurs + l'activité.
  function sectorFeatures(zone) {
    var feats = (window.HumintMap && window.HumintMap.getFeatures && window.HumintMap.getFeatures()) || [];
    var c = zone.center;
    return feats.filter(function (f) { return f.coords && haversine(c, f.coords) <= ENT_RADIUS_M; });
  }
  // Incidents réels LIÉS à l'infrastructure : secteur + mention du type dans le texte.
  function complexIncidents(zone) {
    var kw = CATEGORY_KW[zone.category];
    return sectorFeatures(zone).filter(function (f) {
      if (!kw) return true;
      return kw.test((f.type || '') + ' ' + (f.description || '') + ' ' + (f.acteur || ''));
    }).sort(function (a, b) { return (b.iso || '').localeCompare(a.iso || ''); });
  }
  function zoneSeverity(z) { return { n: (z.events || []).length, status: z.status || 'intact' }; }
  var STATUS_LABEL = { intact: 'Intact', endommage: 'Endommagé', detruit: 'Détruit' };
  function statusColor(s) { return s === 'detruit' ? '#C0392B' : s === 'endommage' ? '#E0852E' : '#7E8AA6'; }
  function openPicker(list, anchor) {
    closePicker();
    var pop = document.createElement('div');
    pop.className = 'facet-pop'; pop.id = 'z3d-pop';
    pop.style.minWidth = '288px'; pop.style.maxWidth = '320px';
    // Tri : détruit avant endommagé (infrastructures les plus touchées en tête).
    var rank = { detruit: 2, endommage: 1, intact: 0 };
    var scored = list.map(function (z) { return { z: z, sv: zoneSeverity(z) }; })
      .sort(function (a, b) { return (rank[b.sv.status] || 0) - (rank[a.sv.status] || 0); });
    var body = scored.map(function (o) {
      var z = o.z, col = statusColor(o.sv.status);
      return '<button class="fp-opt" data-id="' + esc(z.id) + '" style="flex-direction:column;align-items:flex-start">' +
        '<div class="z3d-opt-row"><span class="z3d-cat">' + esc(CAT_LABEL[z.category] || 'Infra') + '</span>' +
        '<span class="fp-l" style="white-space:normal;flex:1">' + esc(z.name) + '</span>' +
        '<span class="z3d-sevbadge" style="background:' + col + '">' + esc(STATUS_LABEL[o.sv.status] || '—') + '</span></div>' +
        '<span class="z3d-opt-meta">' + esc(z.summary || '') + '</span></button>';
    }).join('');
    pop.innerHTML = '<div class="fp-head">Infrastructures touchées</div><div class="fp-body">' + body + '</div>';
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    pop.querySelectorAll('.fp-opt').forEach(function (el) {
      el.onclick = function () { var z = list.find(function (x) { return x.id === el.getAttribute('data-id'); }); closePicker(); if (z) window.location.href = '/carte/sites-3d/?site=' + encodeURIComponent(z.id); };
    });
    setTimeout(function () { document.addEventListener('mousedown', outside); }, 0);
  }

  /* ─────────── Imagerie + relief ─────────── */
  function setImagery(kind) {
    var map = state.map; if (!map) return;
    state.imagery = kind;
    dropLayer(SAT_LAYER);
    dropSource(SAT_SRC);
    map.addSource(SAT_SRC, IMAGERY[kind].source);
    map.addLayer({ id: SAT_LAYER, type: 'raster', source: SAT_SRC, slot: 'bottom', paint: { 'raster-opacity': 1 } });
    syncSeg();
  }
  function enableTerrain() {
    var map = state.map;
    if (!map.getSource(DEM_SRC)) map.addSource(DEM_SRC, { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
    map.setTerrain({ source: DEM_SRC, exaggeration: 1.15 });
  }
  // Qualité « client » : lumière + ombres portées, atmosphère/brume (le lointain
  // se fond → fini le fouillis de boîtes au loin), labels secondaires masqués.
  function applyQuality() {
    var map = state.map;
    safe(function () { map.setConfigProperty('basemap', 'lightPreset', state.light); });
    // VRAIE ville 3D Mapbox (ombrée) en contexte → réalisme ; notre infra en surbrillance par-dessus.
    safe(function () { map.setConfigProperty('basemap', 'show3dObjects', true); });
    safe(function () { map.setConfigProperty('basemap', 'showPointOfInterestLabels', false); });
    safe(function () { map.setConfigProperty('basemap', 'showTransitLabels', false); });
  }

  /* ─────────── Entrée / sortie ─────────── */
  function enter3D(zone) {
    var map = state.map; if (!map) return;
    state.active = zone; state.in3D = true; state.mode = 'satellite'; state.imagery = 'esri';
    document.body.classList.add('z3d-active');
    setImagery(state.imagery);
    enableTerrain();
    applyQuality();
    renderPerimeter(zone);
    renderStructures(zone);
    renderSector(zone);      // incidents réels du secteur (contexte + replay chronologique)
    renderEntities(zone);
    startPulse();            // anneau sonar animé sur le(s) renseignement(s) source
    // Approche cinématique : arc haute altitude (curve) puis plongée sur l'infrastructure ;
    // les bâtiments « poussent » pendant la descente (growBuildings, déclenché au rendu).
    map.flyTo({ center: zone.center, zoom: zone.zoom || 15.5, pitch: zone.pitch != null ? zone.pitch : 60, bearing: zone.bearing || 0, duration: 2600, curve: 1.55, essential: true });
    // Survol cinématique : orbite auto à accélération progressive (arrêtée dès que l'utilisateur bouge la carte).
    setTimeout(startOrbit, 2750);
    showBar(zone);
    renderRank(zone);
    showHud(zone);
    ensureChip();
  }
  /* ─────────── Survol cinématique (orbite auto) ─────────── */
  function startOrbit() {
    if (!state.in3D || !state.map) return;
    stopOrbit();
    var map = state.map; state.orbit.on = true;
    var stop = function () { stopOrbit(); };
    state.orbit.stop = stop;
    ['mousedown', 'touchstart', 'wheel', 'dragstart'].forEach(function (ev) { map.on(ev, stop); });
    var t0 = performance.now();
    var step = function (now) {
      if (!state.orbit.on || !state.in3D) return;
      // Montée en vitesse progressive (3 s) → départ imperceptible, fluide.
      var ramp = Math.min(1, (now - t0) / 3000);
      try { map.setBearing((map.getBearing() + 0.12 * ramp * ramp) % 360); } catch (e) { /* */ }
      state.orbit.raf = requestAnimationFrame(step);
    };
    state.orbit.raf = requestAnimationFrame(step);
  }
  function stopOrbit() {
    if (state.orbit.raf) cancelAnimationFrame(state.orbit.raf);
    if (state.orbit.stop && state.map) ['mousedown', 'touchstart', 'wheel', 'dragstart'].forEach(function (ev) { state.map.off(ev, state.orbit.stop); });
    state.orbit = { on: false, raf: null, stop: null };
  }

  function exit3D() {
    var map = state.map; closePopups(); stopOrbit(); stopPulse(); stopReplay();
    if (map) {
      // Le relief d'abord (libère la dépendance terrain → source DEM), puis les couches, puis les sources.
      safe(function () { if (state.trace.on) endTraceMode(); });
      safe(function () { map.setTerrain(null); });
      [L_ENT, L_ENT_GLOW, L_ENT_RING, L_SECT, L_LABEL, L_LINE, L_EXTRUDE, L_FILL, L_PERI_L, L_PERI_F, L_TRACE_PT, L_TRACE_LINE, L_TRACE_FILL, SAT_LAYER].forEach(dropLayer);
      [ENT_SRC, SECT_SRC, SRC, PERI_SRC, TRACE_SRC, SAT_SRC, DEM_SRC].forEach(dropSource);
      state.light = 'day';
      safe(function () { map.setConfigProperty('basemap', 'lightPreset', 'day'); });
      safe(function () { map.setConfigProperty('basemap', 'show3dObjects', true); });
      safe(function () { map.setConfigProperty('basemap', 'showPointOfInterestLabels', true); });
      safe(function () { map.setConfigProperty('basemap', 'showTransitLabels', true); });
      safe(function () { map.setFog(null); });
      safe(function () { map.easeTo({ pitch: 0, bearing: 0, duration: 900 }); });
      setTimeout(function () { if (window.HumintMap && window.HumintMap.recenter) window.HumintMap.recenter(); }, 950);
    }
    state.in3D = false; state.active = null; state.entities = []; state.sectorEnts = [];
    document.body.classList.remove('z3d-active');
    hideBar(); hideRank(); hideHud(); ensureChip();
  }

  /* ─────────── Périmètre du complexe ─────────── */
  function renderPerimeter(zone) {
    var map = state.map;
    var peri = zone.perimeter;
    var fc = peri ? { type: 'Feature', geometry: { type: 'Polygon', coordinates: peri }, properties: {} }
                  : { type: 'FeatureCollection', features: [] };
    if (map.getSource(PERI_SRC)) { map.getSource(PERI_SRC).setData(fc); return; }
    map.addSource(PERI_SRC, { type: 'geojson', data: fc });
    map.addLayer({ id: L_PERI_F, type: 'fill', source: PERI_SRC, slot: 'bottom', paint: { 'fill-color': '#6B3FA0', 'fill-opacity': 0.05 } });
    map.addLayer({ id: L_PERI_L, type: 'line', source: PERI_SRC, slot: 'top', paint: { 'line-color': '#6B3FA0', 'line-width': 2, 'line-opacity': 0.5, 'line-dasharray': [2, 1.4] } });
  }

  // Si une emprise a été tracée à la main pour cette zone, elle remplace le carré.
  function applyTraces(zone) {
    var t = loadTraces()[zone.id];
    if (t && t.rings && t.rings.length) {
      zone.structures = t.rings.map(function (r, i) {
        return { id: 'trace' + i, name: zone.name.split(' — ')[0], function: zone.name.split(' — ')[0], height: t.height || 8, damage: zone.status || 'endommage', footprint: [r], key: i === 0, incidents: [] };
      });
      zone.osm = true;
    }
  }

  /* ─────────── Rendu des structures (fill-extrusion) ─────────── */
  function renderStructures(zone) {
    var map = state.map;
    state.structById = {};
    applyTraces(zone);
    // On ne rend QUE l'infrastructure (bâtiments clés, touchés, ou emprise tracée/approx) ;
    // le reste de la ville vient du bâti 3D natif Mapbox (ombré) → réalisme sans doublon.
    var toRender = (zone.structures || []).filter(function (st) {
      return st.key || (st.damage && st.damage !== 'intact') || st.approx || st._trace || st._context;
    });
    if (!toRender.length) toRender = (zone.structures || []).slice(0, 1);
    var features = toRender.map(function (st) {
      var cen = centroid(st.footprint[0]);
      st._auto = autoIncidents(cen).length;
      var sv = severity(st);
      // Couleur = statut d'atteinte (même code couleur que le badge) → cohérence.
      var color = st.damage === 'intact' ? '#cdc7b8' : statusColor(st.damage);
      st._sv = sv; st._color = color; st._centroid = cen;
      state.structById[st.id] = st;
      // Libellé seulement sur les bâtiments clés OU touchés (sinon 300 labels illisibles).
      var labelOn = (st.key === true || sv.score > 0) ? 1 : 0;
      // Emprise approximative (pas de footprint réel) → marquage AU SOL plat, pas un volume
      // (un bloc 3D ferait croire à un bâtiment qu'on ne connaît pas).
      var flat = st.approx || !st.height;
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: st.footprint },
        properties: { id: st.id, name: st.name, _color: color, _h: flat ? 0 : extrudeHeight(st), _flat: flat ? 1 : 0, _lab: labelOn },
      };
    });
    var fc = { type: 'FeatureCollection', features: features };
    if (map.getSource(SRC)) { map.getSource(SRC).setData(fc); growBuildings(); return; }
    map.addSource(SRC, { type: 'geojson', data: fc });
    // Aplat au sol UNIQUEMENT pour les surfaces plates (piste/apron/enceinte) ;
    // les bâtiments sont rendus en volume (l'aplat ferait doublon).
    map.addLayer({ id: L_FILL, type: 'fill', source: SRC, slot: 'top', paint: { 'fill-color': ['get', '_color'], 'fill-opacity': ['case', ['==', ['get', '_flat'], 1], 0.45, 0] } });
    map.addLayer({ id: L_LINE, type: 'line', source: SRC, slot: 'top', paint: { 'line-color': ['get', '_color'], 'line-width': 1.0, 'line-opacity': 0.6 } });
    // Volume bâti (hauteur > 0) avec relief : dégradé vertical + occlusion ambiante → vrais volumes 3D, pas des aplats.
    map.addLayer({ id: L_EXTRUDE, type: 'fill-extrusion', source: SRC, slot: 'top', filter: ['>', ['get', '_h'], 0],
      paint: {
        'fill-extrusion-color': ['get', '_color'], 'fill-extrusion-height': ['get', '_h'], 'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-ambient-occlusion-intensity': 0.3, 'fill-extrusion-ambient-occlusion-radius': 3,
      } });
    map.addLayer({ id: L_LABEL, type: 'symbol', source: SRC, slot: 'top', filter: ['==', ['get', '_lab'], 1],
      layout: { 'text-field': ['get', 'name'], 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'], 'text-size': 12, 'text-anchor': 'center', 'text-max-width': 9, 'text-allow-overlap': false },
      paint: { 'text-color': '#1F1437', 'text-halo-color': '#fff', 'text-halo-width': 1.7 } });
    growBuildings();
    wirePopups();
  }
  // Croissance animée : les volumes partent du sol et « poussent » pendant l'approche caméra.
  function growBuildings() {
    var map = state.map;
    safe(function () {
      if (!map.getLayer(L_EXTRUDE)) return;
      map.setPaintProperty(L_EXTRUDE, 'fill-extrusion-height-transition', { duration: 0 });
      map.setPaintProperty(L_EXTRUDE, 'fill-extrusion-height', ['*', ['get', '_h'], 0.02]);
      setTimeout(function () {
        safe(function () {
          if (!map.getLayer(L_EXTRUDE)) return;
          map.setPaintProperty(L_EXTRUDE, 'fill-extrusion-height-transition', { duration: 1300, delay: 0 });
          map.setPaintProperty(L_EXTRUDE, 'fill-extrusion-height', ['get', '_h']);
        });
      }, 1400);
    });
  }

  var _wired = false;
  function wirePopups() {
    if (_wired) return; _wired = true;
    var map = state.map;
    [L_EXTRUDE, L_FILL].forEach(function (lid) {
      map.on('mouseenter', lid, function () { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', lid, function () { map.getCanvas().style.cursor = ''; });
    });
    map.on('mouseenter', L_ENT, function () { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', L_ENT, function () { map.getCanvas().style.cursor = ''; });
    // Un seul gestionnaire : entités d'abord (renseignement), puis bâtiments. On
    // déduplique (un bâtiment a emprise + volume) et on ignore les couches absentes.
    map.on('click', function (e) {
      if (!state.in3D || state.trace.on) return;
      var entL = [L_ENT, L_ENT_GLOW].filter(function (l) { return map.getLayer(l); });
      if (entL.length) {
        var ent = map.queryRenderedFeatures(e.point, { layers: entL });
        if (ent.length) {
          var en = state.entities[ent[0].properties._i];
          if (en) { new mapboxgl.Popup({ closeButton: true, maxWidth: '320px', className: 'humint-popup' }).setLngLat(en.coords).setHTML(entityPopup(en)).addTo(map); return; }
        }
      }
      // Points « secteur » (incidents réels autour de l'infra) → popup renseignement.
      if (map.getLayer(L_SECT)) {
        var sp = map.queryRenderedFeatures(e.point, { layers: [L_SECT] });
        if (sp.length) {
          var se = state.sectorEnts[sp[0].properties._i];
          if (se) { new mapboxgl.Popup({ closeButton: true, maxWidth: '320px', className: 'humint-popup' }).setLngLat(se.coords).setHTML(entityPopup(se)).addTo(map); return; }
        }
      }
      var bL = [L_EXTRUDE, L_FILL].filter(function (l) { return map.getLayer(l); });
      if (!bL.length) return;
      var feats = map.queryRenderedFeatures(e.point, { layers: bL });
      if (feats.length) openStructPopup(feats[0].properties.id, e.lngLat);
    });
  }
  function openStructPopup(id, lngLat) {
    var st = state.structById[id]; if (!st) return;
    new mapboxgl.Popup({ closeButton: true, maxWidth: '340px', className: 'humint-popup' })
      .setLngLat(lngLat || st._centroid).setHTML(structPopup(st)).addTo(state.map);
  }
  function structPopup(st) {
    var sv = st._sv || severity(st);
    var color = st._color || sevColor(sv, st.damage);
    var head = '<div class="popup-header"><div class="popup-dot-bar" style="background:' + color + '"></div><div class="popup-actor">' + esc(st.name) + '</div></div>';
    var rows = '';
    if (st.function) rows += '<div class="popup-row"><span class="popup-key">Fonction</span><span class="popup-val">' + esc(st.function) + '</span></div>';
    if (st.height) rows += '<div class="popup-row"><span class="popup-key">Hauteur</span><span class="popup-val">' + esc(st.height) + ' m</span></div>';
    if (st.description) rows += '<div class="popup-row popup-desc"><span class="popup-val">' + esc(st.description) + '</span></div>';
    var d = sv.dmg;
    var tags = '<div class="z3d-tags">' +
      '<span class="z3d-tag ' + d.cls + '">' + esc(d.label) + '</span>' +
      '<span class="z3d-tag" style="background:' + color + ';color:#fff">' + sv.linked + ' incident' + (sv.linked > 1 ? 's' : '') + ' lié' + (sv.linked > 1 ? 's' : '') + '</span>' +
      (sv.auto ? '<span class="z3d-tag z3d-dmg-ok">' + sv.auto + ' à proximité (auto)</span>' : '') + '</div>';
    var inc = '';
    if ((st.incidents || []).length) {
      inc = '<div class="z3d-inc-list">' + st.incidents.map(function (i) {
        var sc = (i.source || '').toUpperCase() === 'OSINT' ? '#2E84D4' : '#6B3FA0';
        return '<div class="z3d-inc-row"><span class="z3d-inc-d">' + esc(i.date || '') + '</span>' +
          '<span class="z3d-inc-x"><span class="z3d-inc-src" style="background:' + sc + ';color:#fff">' + esc((i.source || '').toUpperCase()) + (i.corrobore ? '✓' : '') + '</span>' +
          esc(i.type ? i.type + ' — ' : '') + esc(i.detail || '') + '</span></div>';
      }).join('') + '</div>';
    }
    return head + '<div class="popup-body">' + rows + tags + inc + '</div>';
  }
  function closePopups() { Array.prototype.forEach.call(document.querySelectorAll('.humint-popup .mapboxgl-popup-close-button'), function (b) { b.click(); }); }

  /* ─────────── Surcouche renseignement (entités type Palantir) ─────────── */
  function entKind(type) { return /attaque|frappe|combat|embuscade|\bied\b|explos|assassinat|enl[èe]vement|raid|\btir|bombard|drone|dr[ôo]ne/i.test(type || '') ? 'attack' : 'other'; }
  function entColor(kind) { return kind === 'attack' ? '#E0322B' : '#2E84D4'; }
  function buildEntities(zone) {
    // Marqueurs = LE(S) renseignement(s) réel(s) du point qui a fait modéliser cette
    // infrastructure (l'attaque), placé(s) sur l'infrastructure. Donnée curée, pas d'auto-link.
    var c = zone.center;
    var ents = (zone.events || []).map(function (ev) {
      return { coords: c, type: ev.type || '', source: ev.source || 'HUMINT', corrobore: !!ev.corrobore, date: ev.date || '', detail: ev.description || '', where: ev.actor || '', sources: ev.sources || '' };
    });
    state.linkedEnts = ents;
    return ents;
  }
  function renderEntities(zone) {
    var map = state.map;
    state.entities = buildEntities(zone);
    var fc = {
      type: 'FeatureCollection',
      features: state.entities.map(function (e, idx) {
        var kind = entKind(e.type);
        return {
          type: 'Feature', geometry: { type: 'Point', coordinates: e.coords },
          properties: { _i: idx, kind: kind, color: entColor(kind), glyph: kind === 'attack' ? '◆' : '●' },
        };
      }),
    };
    if (map.getSource(ENT_SRC)) { map.getSource(ENT_SRC).setData(fc); }
    else {
      map.addSource(ENT_SRC, { type: 'geojson', data: fc });
      map.addLayer({
        id: L_ENT_GLOW, type: 'circle', source: ENT_SRC, slot: 'top',
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 7, 17, 16], 'circle-color': ['get', 'color'], 'circle-opacity': 0.16, 'circle-blur': 0.7 },
      });
      map.addLayer({
        id: L_ENT, type: 'symbol', source: ENT_SRC, slot: 'top',
        layout: { 'text-field': ['get', 'glyph'], 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 12, 17, 18], 'text-allow-overlap': true, 'text-ignore-placement': true },
        paint: { 'text-color': ['get', 'color'], 'text-halo-color': 'rgba(10,8,20,0.85)', 'text-halo-width': 1.3 },
      });
    }
  }
  function entityPopup(e) {
    var kind = entKind(e.type), color = entColor(kind);
    var sc = e.source === 'OSINT' ? '#2E84D4' : '#6B3FA0';
    var head = '<div class="popup-header"><div class="popup-dot-bar" style="background:' + color + '"></div><div class="popup-actor">' + esc(e.type || 'Renseignement') + '</div></div>';
    var rows = '';
    if (e.where) rows += '<div class="popup-row"><span class="popup-key">Acteur / lieu</span><span class="popup-val">' + esc(e.where) + '</span></div>';
    if (e.date) rows += '<div class="popup-row"><span class="popup-key">Date</span><span class="popup-val">' + esc(e.date) + '</span></div>';
    if (e.detail) rows += '<div class="popup-row popup-desc"><span class="popup-val">' + esc(e.detail) + '</span></div>';
    var tag = '<div class="z3d-tags"><span class="z3d-tag z3d-inc-src" style="background:' + sc + ';color:#fff">' + esc(e.source) + (e.corrobore ? ' ✓ corroboré' : '') + '</span></div>';
    return head + '<div class="popup-body">' + rows + tag + '</div>';
  }

  /* ─────────── Barre de contrôle ─────────── */
  function ensureBar() {
    if ($('z3d-bar')) return;
    var bar = document.createElement('div'); bar.id = 'z3d-bar';
    bar.innerHTML = '<span class="z3d-name" id="z3d-name"></span>' +
      '<span class="z3d-seg" id="z3d-seg">' +
        '<button data-m="maquette">Maquette</button>' +
        '<button data-m="satellite">Satellite</button>' +
        '<button data-m="vue3d">Vue 3D</button>' +
        '<button data-m="general">Vue générale</button>' +
      '</span>' +
      '<button class="z3d-trace-btn" id="z3d-trace-btn" title="Tracer l\'emprise du bâtiment sur le satellite">✎ Tracer</button>' +
      '<span class="z3d-trace-live" id="z3d-trace-live"><button class="z3d-trace-ok" id="z3d-trace-ok">✓ Terminer</button><button class="z3d-trace-cancel" id="z3d-trace-cancel">✕</button></span>' +
      '<button class="z3d-exit" id="z3d-exit">Quitter la 3D</button>';
    document.body.appendChild(bar);
    $('z3d-seg').querySelectorAll('button').forEach(function (b) {
      b.onclick = function () { setMode(b.getAttribute('data-m')); };
    });
    $('z3d-exit').onclick = exit3D;
    $('z3d-trace-btn').onclick = startTrace;
    $('z3d-trace-ok').onclick = finishTrace;
    $('z3d-trace-cancel').onclick = cancelTrace;
  }
  function showBar(zone) { ensureBar(); $('z3d-name').textContent = zone.name; $('z3d-bar').classList.add('on'); syncSeg(); }
  function hideBar() { var b = $('z3d-bar'); if (b) b.classList.remove('on'); }
  function syncSeg() { var seg = $('z3d-seg'); if (seg) seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-m') === state.mode); }); }

  /* ─────────── Les 4 modes de vue ─────────── */
  // Maquette : fond clair Mapbox (pas de satellite), ville 3D + emprises → rendu
  // épuré. Satellite : imagerie Esri/Maxar sous les volumes. Vue 3D / Vue générale :
  // bascule de perspective (plongée ↔ aplomb) sans quitter la 3D.
  function setMode(mode) {
    var map = state.map; if (!map || !state.in3D) return;
    stopOrbit();
    if (mode === 'maquette') {
      state.mode = 'maquette';
      dropLayer(SAT_LAYER); dropSource(SAT_SRC);           // fond clair révélé
      safe(function () { map.easeTo({ pitch: state.active && state.active.pitch != null ? state.active.pitch : 60, duration: 700 }); });
    } else if (mode === 'satellite') {
      state.mode = 'satellite';
      setImagery('esri');
      safe(function () { map.easeTo({ pitch: state.active && state.active.pitch != null ? state.active.pitch : 60, duration: 700 }); });
    } else if (mode === 'vue3d') {
      state.mode = 'vue3d';
      safe(function () { map.easeTo({ pitch: 62, duration: 800 }); });
      setTimeout(startOrbit, 850);
    } else if (mode === 'general') {
      state.mode = 'general';
      safe(function () { map.easeTo({ pitch: 0, bearing: 0, duration: 800 }); });
    }
    syncSeg();
  }

  /* ─────────── Traçage manuel d'emprise sur le satellite ─────────── */
  function startTrace() {
    var map = state.map; if (!state.active) return;
    state.trace = { on: true, pts: [] };
    safe(function () { map.easeTo({ pitch: 0, bearing: 0, duration: 500 }); });
    map.getCanvas().style.cursor = 'crosshair';
    if (!map.getSource(TRACE_SRC)) {
      map.addSource(TRACE_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: L_TRACE_FILL, type: 'fill', source: TRACE_SRC, slot: 'top', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#6B3FA0', 'fill-opacity': 0.28 } });
      map.addLayer({ id: L_TRACE_LINE, type: 'line', source: TRACE_SRC, slot: 'top', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#6B3FA0', 'line-width': 2.2 } });
      map.addLayer({ id: L_TRACE_PT, type: 'circle', source: TRACE_SRC, slot: 'top', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#6B3FA0', 'circle-stroke-width': 2 } });
    }
    map.on('click', onTraceClick);
    map.on('contextmenu', onTraceUndo);
    var b = $('z3d-bar'); if (b) b.classList.add('tracing');
    traceHint(true);
  }
  function onTraceClick(e) { if (!state.trace.on) return; state.trace.pts.push([e.lngLat.lng, e.lngLat.lat]); updateTraceSrc(); }
  function onTraceUndo(e) { if (!state.trace.on) return; e.preventDefault(); state.trace.pts.pop(); updateTraceSrc(); }
  function updateTraceSrc() {
    var pts = state.trace.pts, feats = pts.map(function (p) { return { type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} }; });
    if (pts.length >= 2) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts.concat(pts.length >= 3 ? [pts[0]] : []) }, properties: {} });
    if (pts.length >= 3) feats.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts.concat([pts[0]])] }, properties: {} });
    var s = state.map.getSource(TRACE_SRC); if (s) s.setData({ type: 'FeatureCollection', features: feats });
    var ok = $('z3d-trace-ok'); if (ok) ok.textContent = '✓ Terminer (' + pts.length + ')';
  }
  function finishTrace() {
    var z = state.active; if (!z) return;
    if (state.trace.pts.length < 3) { endTraceMode(); return; }
    var ring = state.trace.pts.concat([state.trace.pts[0]]).map(function (p) { return [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6]; });
    var t = loadTraces(); t[z.id] = { rings: [ring], height: 8, name: z.name, ts: 1 }; saveTraces(t);
    endTraceMode();
    renderStructures(z); renderRank(z);
    safe(function () { state.map.easeTo({ pitch: z.pitch || 60, duration: 600 }); });
  }
  function cancelTrace() { endTraceMode(); }
  function endTraceMode() {
    var map = state.map;
    map.off('click', onTraceClick); map.off('contextmenu', onTraceUndo);
    state.trace = { on: false, pts: [] };
    map.getCanvas().style.cursor = '';
    [L_TRACE_PT, L_TRACE_LINE, L_TRACE_FILL].forEach(dropLayer); dropSource(TRACE_SRC);
    var b = $('z3d-bar'); if (b) b.classList.remove('tracing');
    traceHint(false);
  }
  function traceHint(on) {
    var h = $('z3d-hint');
    if (on && !h) {
      h = document.createElement('div'); h.id = 'z3d-hint';
      h.innerHTML = 'Clique chaque coin du bâtiment sur le satellite · clic droit = annuler le dernier point · « Terminer » pour valider';
      document.body.appendChild(h);
    } else if (!on && h) { h.remove(); }
  }
  // Export des emprises tracées (à coller à Claude pour intégration permanente dans zones-3d.json).
  function exportTraces() { var s = JSON.stringify(loadTraces(), null, 0); console.log('[zones-3d] emprises tracées →\n' + s); return s; }
  window.z3dExportTraces = exportTraces;   // à exécuter en console pour récupérer les tracés à committer

  /* ─────────── Panneau « infrastructures les plus touchées » ─────────── */
  function ensureRank() {
    if ($('z3d-rank')) return;
    var p = document.createElement('div'); p.id = 'z3d-rank';
    p.innerHTML = '<div class="z3d-rank-head"><div class="z3d-rank-t">Fiche infrastructure</div><div class="z3d-rank-s" id="z3d-rank-s"></div></div>' +
      '<div class="z3d-ana" id="z3d-ana">' +
      '  <div class="z3d-metrics" id="z3d-metrics"></div>' +
      '  <div class="z3d-tl" id="z3d-tl"></div>' +
      '  <div id="z3d-report"></div>' +
      '  <div class="z3d-det" id="z3d-chrono"></div>' +
      '</div>' +
      '<div class="z3d-inc-h"><label class="z3d-inc"><input type="checkbox" data-rep="renseignement" checked><span class="z3d-sec-t" id="z3d-sec-bat">Renseignement (source du marquage)</span></label></div>' +
      '<div class="z3d-rank-list" id="z3d-rank-list"></div>' +
      '<div class="z3d-rep-bar"><button class="z3d-rep-btn" id="z3d-rep-btn">⤓ Générer le rapport client</button><div class="z3d-rep-hint">Décoche ce que tu ne veux pas montrer au client.</div></div>';
    document.body.appendChild(p);
  }
  // Couleurs d'acteurs — identiques au panneau ANALYSE (parité visuelle).
  function actorColor(actor) {
    if (!actor) return '#ff9800';
    var a = String(actor).toUpperCase();
    if (/CIVIL/.test(a)) return '#c49a3c';
    if (/GENERAL/.test(a)) return '#7b1fa2';
    if (/\b(FR|USA|ONU|UE|UN|ONG|SMP)\b/.test(a)) return '#1565c0';
    if (/FAMA|FDS|FAN|\bANT\b|VDP|BIR|GMI|\bFA\b|FORCES/.test(a)) return '#2e7d32';
    if (/EI|GSIM|GAT|JAS|ISWAP|AQ|GANE|HANI|JNIM|ISCAP|GAE|\bAK\b|FLA/.test(a)) return '#d32f2f';
    return '#ff9800';
  }
  // Section de données style ANALYSE : compteur + libellé + barre + %, avec case « inclure au rapport ».
  function anaSec(repKey, title, rows, total, colorFn, moreNoun) {
    var max = rows.length ? rows[0].n : 1;
    var body = rows.slice(0, 8).map(function (r) {
      var w = Math.max(4, Math.round(r.n / max * 100));
      var p = total ? Math.round(r.n / total * 100) : 0;
      return '<div class="ana-row"><span class="ana-row-c">' + r.n + '</span>' +
        '<span class="ana-row-l">' + esc(r.k) + '</span>' +
        '<span class="ana-row-track"><span class="ana-row-fill" style="width:' + w + '%;background:' + colorFn(r.k) + '"></span></span>' +
        '<span class="ana-row-v">' + p + '%</span></div>';
    }).join('') || '<div class="ana-empty">Aucune donnée</div>';
    var more = rows.length > 8 ? '<div class="ana-more">+ ' + (rows.length - 8) + ' autres ' + (moreNoun || 'entrées') + '</div>' : '';
    return '<div class="ana-sec" data-sec="' + repKey + '"><div class="ana-sec-h">' +
      '<label class="z3d-inc"><input type="checkbox" data-rep="' + repKey + '" checked><span class="ana-sec-t">' + esc(title) + '</span></label>' +
      '<span class="ana-sec-n">' + rows.length + '</span></div>' +
      '<div class="ana-bars">' + body + more + '</div></div>';
  }
  // Analyse dense (style Palantir) : chiffres clés + chronologie + répartition type & acteurs,
  // calculés sur les incidents RÉELS du secteur (rayon) autour de l'infrastructure.
  function renderAnalysis(zone) {
    var sector = sectorFeatures(zone);
    var linkedN = (state.linkedEnts && state.linkedEnts.length) || (zone.events || []).length;
    var isos = sector.map(function (f) { return f.iso; }).filter(Boolean).sort();
    var first = isos[0] || '—', last = isos[isos.length - 1] || '—';
    var hum = sector.filter(function (f) { return !f.corrobore; }).length, osi = sector.length - hum;
    function topOf(key) { var m = {}; sector.forEach(function (f) { var v = f[key] || '—'; m[v] = (m[v] || 0) + 1; }); return Object.keys(m).map(function (k) { return { k: k, n: m[k] }; }).sort(function (a, b) { return b.n - a.n; }); }
    var byType = topOf('type'), byActor = topOf('acteur');
    var corrPct = sector.length ? Math.round(osi / sector.length * 100) : 0;
    var recence = '—';
    if (last !== '—') {
      var d = new Date(last + 'T00:00:00'), now = new Date();
      var days = Math.max(0, Math.round((now - d) / 86400000));
      recence = days === 0 ? "auj." : days < 31 ? (days + 'j') : days < 365 ? (Math.round(days / 30) + ' mois') : (Math.round(days / 365) + ' an');
    }
    // Chiffres clés
    var mBox = $('z3d-metrics');
    if (mBox) mBox.innerHTML =
      metric(linkedN, 'liés') + metric(sector.length, 'secteur') +
      metric(byActor[0] ? byActor[0].k : '—', 'acteur #1', true) +
      metric((first !== '—' ? first.slice(2) : '—') + '→' + (last !== '—' ? last.slice(2) : '—'), 'période', true) +
      metric(corrPct + '%', 'corroboré') +
      metric(recence, 'dernier');
    // Chronologie mensuelle (sparkline)
    var months = {}; isos.forEach(function (d) { var k = d.slice(0, 7); months[k] = (months[k] || 0) + 1; });
    var mk = Object.keys(months).sort(); var mmax = Math.max.apply(null, mk.map(function (k) { return months[k]; })) || 1;
    var tlBox = $('z3d-tl');
    if (tlBox) tlBox.innerHTML = mk.length ? ('<div class="z3d-det-h"><span>Activité dans le temps</span><span>' + hum + ' HUM / ' + osi + ' OSINT</span></div>' +
      '<div class="z3d-spark">' + mk.map(function (k) { return '<span class="z3d-bar" style="height:' + Math.max(8, Math.round(months[k] / mmax * 100)) + '%" title="' + k + ' : ' + months[k] + '"></span>'; }).join('') + '</div>' +
      '<div class="z3d-spark-x"><span>' + (mk[0] || '') + '</span><span>' + (mk[mk.length - 1] || '') + '</span></div>') : '';
    // Sections de données (style ANALYSE) — cochables pour le rapport client
    var corr = [{ k: 'Corroboré (OSINT)', n: osi }, { k: 'HUMINT seul', n: hum }].filter(function (r) { return r.n; });
    var rep = $('z3d-report');
    if (rep) rep.innerHTML =
      anaSec('typologie', "Typologie d'événement", byType, sector.length, function () { return 'linear-gradient(90deg,#5650C6,#2E84D4)'; }, 'typologies') +
      anaSec('acteurs', 'Acteurs impliqués', byActor, sector.length, function (k) { return actorColor(k); }, 'acteurs') +
      (corr.length ? anaSec('corroboration', 'Corroboration', corr, sector.length, function (k) { return /Corrobor/.test(k) ? '#2e7d32' : '#c49a3c'; }, 'états') : '');
    // Chronologie détaillée (liste)
    var chrono = sector.slice().filter(function (f) { return f.iso; }).sort(function (a, b) { return (b.iso || '').localeCompare(a.iso || ''); });
    var cBox = $('z3d-chrono');
    if (cBox) {
      if (!chrono.length) { cBox.style.display = 'none'; cBox.innerHTML = ''; }
      else {
        cBox.style.display = 'block'; cBox.setAttribute('data-sec', 'chronologie');
        cBox.innerHTML = '<div class="z3d-det-h"><label class="z3d-inc"><input type="checkbox" data-rep="chronologie" checked><span>Chronologie détaillée</span></label><span>' + chrono.length + ' incident' + (chrono.length > 1 ? 's' : '') + '</span></div>' +
          chrono.slice(0, 14).map(function (f) {
            return '<div class="z3d-chrono-row"><span class="z3d-chrono-d">' + esc((f.iso || '').slice(2)) + '</span>' +
              '<span class="z3d-chrono-b"><span class="z3d-chrono-t">' + esc(f.type || '—') + (f.acteur && f.acteur !== '—' ? ' · ' + esc(f.acteur) : '') + '</span>' +
              (f.description ? '<span class="z3d-chrono-m">' + esc(f.description) + '</span>' : '') + '</span></div>';
          }).join('') +
          (chrono.length > 14 ? '<div class="z3d-empty" style="padding:6px 0 0">+ ' + (chrono.length - 14) + ' antérieurs</div>' : '');
      }
    }
    // Toggles → grise la section décochée dans la fiche (aperçu de ce que verra le client)
    $('z3d-rank').querySelectorAll('input[data-rep]').forEach(function (cb) {
      var apply = function () { var sec = cb.closest('[data-sec]') || cb.closest('.ana-sec') || cb.closest('.z3d-inc-h') || cb.closest('.z3d-det'); if (sec) sec.classList.toggle('z3d-off', !cb.checked); };
      cb.onchange = apply; apply();
    });
    // Bouton rapport client
    var repBtn = $('z3d-rep-btn');
    if (repBtn) repBtn.onclick = function () { openReport(zone, sector, byType, byActor, corr, chrono, { linkedN: linkedN, first: first, last: last, corrPct: corrPct, recence: recence }); };
  }
  // ── Rapport client : document imprimable, sections cochées uniquement ──
  function openReport(zone, sector, byType, byActor, corr, chrono, m) {
    function want(k) { var el = document.querySelector('#z3d-rank input[data-rep="' + k + '"]'); return !el || el.checked; }
    function bars(rows, total, colorFn) {
      var max = rows.length ? rows[0].n : 1;
      return '<div class="bars">' + rows.slice(0, 12).map(function (r) {
        var w = Math.max(4, Math.round(r.n / max * 100)), p = total ? Math.round(r.n / total * 100) : 0;
        return '<div class="row"><span class="c">' + r.n + '</span><span class="l">' + esc(r.k) + '</span><span class="t"><span class="f" style="width:' + w + '%;background:' + colorFn(r.k) + '"></span></span><span class="v">' + p + '%</span></div>';
      }).join('') + '</div>';
    }
    var st = zone.status || 'intact';
    var head = '<header><div class="brand">ALGORA ACCESS · RENSEIGNEMENT</div>' +
      '<h1>' + esc(zone.name) + ' <span class="pill" style="background:' + statusColor(st) + '">' + esc(STATUS_LABEL[st] || '—') + '</span></h1>' +
      '<div class="sub">' + esc(zone.pays || '') + ' · ' + esc(CAT_LABEL[zone.category] || zone.category || 'Infrastructure') + (zone.center ? ' · ' + zone.center[1].toFixed(4) + '°, ' + zone.center[0].toFixed(4) + '°' : '') + '</div>' +
      (zone.summary ? '<p class="ctx">' + esc(zone.summary) + '</p>' : '') + '</header>';
    var kpis = '<div class="kpis">' +
      '<div class="k"><b>' + m.linkedN + '</b><span>liés</span></div>' +
      '<div class="k"><b>' + sector.length + '</b><span>secteur</span></div>' +
      '<div class="k"><b>' + m.corrPct + '%</b><span>corroboré</span></div>' +
      '<div class="k"><b>' + esc(m.recence) + '</b><span>dernier</span></div>' +
      '<div class="k"><b>' + (byActor[0] ? esc(byActor[0].k) : '—') + '</b><span>acteur #1</span></div>' +
      '<div class="k"><b>' + (m.first !== '—' ? esc(m.first) : '—') + ' → ' + (m.last !== '—' ? esc(m.last) : '—') + '</b><span>période</span></div>' +
      '</div>';
    var body = [head, kpis];
    if (want('typologie') && byType.length) body.push('<section><h2>Typologie d’événement</h2>' + bars(byType, sector.length, function () { return 'linear-gradient(90deg,#5650C6,#2E84D4)'; }) + '</section>');
    if (want('acteurs') && byActor.length) body.push('<section><h2>Acteurs impliqués</h2>' + bars(byActor, sector.length, function (k) { return actorColor(k); }) + '</section>');
    if (want('corroboration') && corr.length) body.push('<section><h2>Corroboration</h2>' + bars(corr, sector.length, function (k) { return /Corrobor/.test(k) ? '#2e7d32' : '#c49a3c'; }) + '</section>');
    if (want('chronologie') && chrono.length) body.push('<section><h2>Chronologie</h2><div class="chr">' + chrono.slice(0, 60).map(function (f) {
      return '<div class="ci"><span class="cd">' + esc(f.iso || '') + '</span><div class="cb"><div class="ct">' + esc(f.type || '—') + (f.acteur && f.acteur !== '—' ? ' · ' + esc(f.acteur) : '') + (f.corrobore ? ' <em>corroboré</em>' : '') + '</div>' + (f.description ? '<div class="cm">' + esc(f.description) + '</div>' : '') + '</div></div>';
    }).join('') + '</div></section>');
    if (want('renseignement')) {
      var linked = state.linkedEnts || (zone.events || []).map(function (ev) { return { type: ev.type, source: ev.source, corrobore: ev.corrobore, date: ev.date, detail: ev.description, where: ev.actor }; });
      if (linked.length) body.push('<section><h2>Renseignement (source du marquage)</h2><div class="chr">' + linked.slice(0, 60).map(function (e) {
        return '<div class="ci"><span class="cd">' + esc(e.date || '') + '</span><div class="cb"><div class="ct">' + esc(e.type || 'Renseignement') + (e.where ? ' · ' + esc(e.where) : '') + ' <em class="src ' + (e.source === 'OSINT' ? 'o' : 'h') + '">' + esc(e.source || '') + (e.corrobore ? ' ✓' : '') + '</em></div>' + (e.detail ? '<div class="cm">' + esc(e.detail) + '</div>' : '') + '</div></div>';
      }).join('') + '</div></section>');
    }
    var css = "@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');" +
      ":root{--v:#6B3FA0;--ink:#1a1526;--muted:#7b7488;--ln:#ece8f2}*{box-sizing:border-box}" +
      "body{margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:var(--ink);background:#f4f2f8}" +
      ".wrap{max-width:760px;margin:0 auto;background:#fff;padding:34px 40px 48px}" +
      "header{border-bottom:2px solid var(--v);padding-bottom:16px;margin-bottom:20px}" +
      ".brand{font:800 10px/1 'Plus Jakarta Sans';letter-spacing:.18em;color:var(--v);text-transform:uppercase}" +
      "h1{font:800 26px/1.15 'Plus Jakarta Sans';margin:10px 0 4px}" +
      ".pill{display:inline-block;font:800 11px/1 'Plus Jakarta Sans';color:#fff;border-radius:7px;padding:4px 9px;vertical-align:middle}" +
      ".sub{font:600 12px/1.4 'Plus Jakarta Sans';color:var(--muted)}" +
      ".ctx{font:500 13px/1.6 'Plus Jakarta Sans';color:#443b57;margin:12px 0 0}" +
      ".kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--ln);border:1px solid var(--ln);margin:0 0 24px;border-radius:10px;overflow:hidden}" +
      ".k{background:#fff;padding:12px 14px}.k b{display:block;font:800 18px/1.1 'Plus Jakarta Sans'}" +
      ".k span{font:700 8.5px/1 'Plus Jakarta Sans';letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:5px;display:block}" +
      "section{margin:0 0 22px;break-inside:avoid}" +
      "h2{font:800 12px/1 'Plus Jakarta Sans';letter-spacing:.1em;text-transform:uppercase;color:var(--v);margin:0 0 12px;padding-bottom:7px;border-bottom:1px solid var(--ln)}" +
      ".row{display:flex;align-items:center;gap:10px;margin:0 0 8px}" +
      ".c{flex:none;min-width:26px;text-align:right;font:800 13px/1 'Plus Jakarta Sans';color:var(--v)}" +
      ".l{flex:0 0 150px;font:600 12px/1.2 'Plus Jakarta Sans';white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".t{flex:1;height:9px;background:var(--ln);border-radius:6px;overflow:hidden}.f{display:block;height:100%;border-radius:6px}" +
      ".v{flex:none;min-width:34px;text-align:right;font:800 12px/1 'Plus Jakarta Sans'}" +
      ".chr{display:flex;flex-direction:column}" +
      ".ci{display:flex;gap:12px;padding:7px 0;border-top:1px solid var(--ln)}.ci:first-child{border-top:none}" +
      ".cd{flex:none;min-width:74px;font:700 10px/1.3 ui-monospace,monospace;color:var(--v)}" +
      ".ct{font:700 12px/1.3 'Plus Jakarta Sans'}" +
      ".ct em{font-style:normal;font:700 9px/1 'Plus Jakarta Sans';color:#2e7d32;border:1px solid #2e7d32;border-radius:5px;padding:2px 5px;margin-left:5px}" +
      ".ct .src{border:none;color:#fff;background:var(--v)}.ct .src.o{background:#2E84D4}" +
      ".cm{font:500 11px/1.5 'Plus Jakarta Sans';color:#5c5470;margin-top:2px}" +
      "footer{margin-top:28px;padding-top:14px;border-top:1px solid var(--ln);font:700 9px/1 'Plus Jakarta Sans';letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}" +
      ".act{position:fixed;top:16px;right:16px}.act button{font:800 11px/1 'Plus Jakarta Sans';letter-spacing:.06em;text-transform:uppercase;color:#fff;background:var(--v);border:none;border-radius:9px;padding:11px 16px;cursor:pointer}" +
      "@media print{body{background:#fff}.wrap{max-width:none;padding:0}.noprint{display:none}}";
    var doc = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapport · ' + esc(zone.name) + '</title><style>' + css + '</style></head><body>' +
      '<div class="wrap">' + body.join('') + '<footer>Algora Access · confidentiel entreprise · ' + esc(zone.pays || '') + '</footer></div>' +
      '<div class="noprint act"><button onclick="window.print()">Imprimer / PDF</button></div></body></html>';
    var w = window.open('', '_blank');
    if (!w) { alert('Autorise les pop-ups pour ouvrir le rapport.'); return; }
    w.document.open(); w.document.write(doc); w.document.close();
  }
  function metric(val, lbl, small) { return '<div class="z3d-m"><div class="z3d-m-v' + (small ? ' sm' : '') + '">' + esc(String(val)) + '</div><div class="z3d-m-l">' + esc(lbl) + '</div></div>'; }
  function renderRank(zone) {
    ensureRank();
    // Renseignement(s) RÉEL(S) du/des point(s) qui ont fait modéliser cette infrastructure.
    var linked = state.linkedEnts || (zone.events || []).map(function (ev) { return { coords: zone.center, type: ev.type, source: ev.source, corrobore: ev.corrobore, date: ev.date, detail: ev.description, where: ev.actor, sources: ev.sources }; });
    var st = zone.status || 'intact';
    var secT = $('z3d-sec-bat'); if (secT) secT.textContent = 'Renseignement (source du marquage)';
    $('z3d-rank-s').innerHTML = esc(zone.name) + ' <span class="z3d-statpill" style="background:' + statusColor(st) + '">' + esc(STATUS_LABEL[st] || '—') + '</span>' +
      (zone.osm ? '' : ' <span class="z3d-approx">emprise approx.</span>');
    if (!linked.length) {
      $('z3d-rank-list').innerHTML = '<div class="z3d-empty">Aucun renseignement.</div>';
    } else {
      $('z3d-rank-list').innerHTML = linked.slice(0, 30).map(function (e, i) {
        var kind = entKind(e.type), col = entColor(kind);
        var sc = e.source === 'OSINT' ? '#2E84D4' : '#6B3FA0';
        return '<button class="z3d-row" data-i="' + i + '">' +
          '<span class="z3d-rank-num" style="color:' + col + '">' + (kind === 'attack' ? '◆' : '●') + '</span>' +
          '<span class="z3d-bar-wrap"><span class="z3d-row-top"><span class="z3d-row-n">' + esc(e.type || 'Renseignement') + '</span>' +
          '<span class="z3d-row-date">' + esc(e.date || '') + '</span></span>' +
          '<span class="z3d-row-fn">' + esc(e.where || '') + '</span></span>' +
          '<span class="z3d-row-meta"><span class="z3d-inc-src" style="background:' + sc + ';color:#fff">' + esc(e.source) + (e.corrobore ? ' ✓' : '') + '</span></span></button>';
      }).join('');
      $('z3d-rank-list').querySelectorAll('.z3d-row').forEach(function (el) {
        el.onclick = function () {
          var e = linked[+el.getAttribute('data-i')]; if (!e) return;
          state.map.flyTo({ center: e.coords, zoom: Math.max(state.map.getZoom(), 15), pitch: 55, duration: 1000, essential: true });
          new mapboxgl.Popup({ closeButton: true, maxWidth: '320px', className: 'humint-popup' }).setLngLat(e.coords).setHTML(entityPopup(e)).addTo(state.map);
        };
      });
    }
    renderAnalysis(zone);   // chiffres clés + chronologie + répartitions (dense, style Palantir)
    $('z3d-rank').classList.add('on');
  }
  function hideRank() { var p = $('z3d-rank'); if (p) p.classList.remove('on'); }

  /* ─────────── Habillage HUD « ops » (coins + bandeau télémétrie) ─────────── */
  function ensureHud() {
    if ($('z3d-hud')) return;
    var h = document.createElement('div'); h.id = 'z3d-hud';
    h.innerHTML = '<span class="z3d-cnr z3d-cnr-tl"></span><span class="z3d-cnr z3d-cnr-tr"></span>' +
      '<span class="z3d-cnr z3d-cnr-bl"></span><span class="z3d-cnr z3d-cnr-br"></span>' +
      '<div class="z3d-tele" id="z3d-tele"></div>';
    document.body.appendChild(h);
  }
  function showHud(zone) {
    ensureHud();
    var c = zone.center || [0, 0];
    var n = (state.entities || []).length;
    var t = $('z3d-tele');
    if (t) t.innerHTML = '<span class="z3d-rec"></span>ARCHIVE · ' + esc(zone.name) + ' · ' +
      (c[1]).toFixed(4) + '° ' + (c[0]).toFixed(4) + '° · ' + n + ' ENTITÉS';
    $('z3d-hud').classList.add('on');
  }
  function hideHud() { var h = $('z3d-hud'); if (h) h.classList.remove('on'); }

  /* ─────────── Boot ─────────── */
  function attach() {
    state.map = window.HumintMap && window.HumintMap.getMap ? window.HumintMap.getMap() : null;
    if (!state.map) return;
    injectCSS();
    fetchZones().then(function (d) {
      state.zones = (d && d.zones) || [];
      if (d && d.linkRadiusM) state.linkRadiusM = d.linkRadiusM;
      ensureChip();
      var bar = $('chipbar');
      if (bar && !state.chipReady) {
        state.chipReady = true;
        var prev = country();
        new MutationObserver(function () {
          if (country() !== prev) { prev = country(); if (state.in3D) exit3D(); }
          ensureChip();
        }).observe(bar, { childList: true });
      }
    }).catch(function (e) { console.warn('[zones-3d] manifeste indisponible', e && e.message); });
  }
  function boot() {
    if (window.HumintMap && window.HumintMap.isReady && window.HumintMap.isReady()) { attach(); return; }
    window.addEventListener('algorMapReady', attach, { once: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
