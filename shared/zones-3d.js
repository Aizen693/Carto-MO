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
  var L_ENT_GLOW = 'zones3d-ent-glow', L_ENT = 'zones3d-ent-mark';
  var ENT_RADIUS_M = 9000;  // rayon « secteur » autour du complexe pour les entités HUMINT/OSINT de contexte
  var TRACE_SRC = 'zones3d-trace', L_TRACE_FILL = 'zones3d-trace-fill', L_TRACE_LINE = 'zones3d-trace-line', L_TRACE_PT = 'zones3d-trace-pt';
  var TRACE_KEY = 'algor-z3d-traces';   // emprises tracées à la main (localStorage), par id de zone
  function loadTraces() { try { return JSON.parse(localStorage.getItem(TRACE_KEY) || '{}'); } catch (e) { return {}; } }
  function saveTraces(t) { try { localStorage.setItem(TRACE_KEY, JSON.stringify(t)); } catch (e) { /* */ } }

  var IMAGERY = {
    mapbox: { source: { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 } },
  };

  var CAT_LABEL = { aeroport: 'Aéroport', hopital: 'Hôpital', militaire: 'Militaire', infrastructure: 'Infrastructure' };
  var DAMAGE = {
    intact: { base: 0, label: 'Intact', cls: 'z3d-dmg-ok' },
    endommage: { base: 2, label: 'Endommagé', cls: 'z3d-dmg-mid' },
    detruit: { base: 4, label: 'Détruit', cls: 'z3d-dmg-bad' },
  };

  var state = { zones: [], map: null, active: null, imagery: 'mapbox', in3D: false, chipReady: false, structById: {}, linkRadiusM: 220, entities: [], linkedEnts: [], trace: { on: false, pts: [] }, orbit: { on: false, raf: null, stop: null } };

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
      '  align-items:center;gap:12px;background:#fff;border:1px solid var(--ln);border-radius:14px;',
      '  box-shadow:var(--shadow);padding:9px 13px 9px 16px;max-width:calc(100% - 60px)}',
      '#z3d-bar.on{display:flex}',
      '.z3d-name{font:800 13px var(--jakarta);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px}',
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
      '  max-height:calc(100% - 150px);background:#fff;border:1px solid var(--ln);border-radius:16px;',
      '  box-shadow:0 16px 44px -14px rgba(46,24,87,.3);overflow:hidden}',
      '#z3d-rank.on{display:flex}',
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
      '.z3d-metrics{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--ln-soft);border-bottom:1px solid var(--ln-soft)}',
      '.z3d-m{background:#fff;padding:9px 12px}',
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
      // ── analyse IA (Mistral) ──
      '.z3d-ai{padding:11px 14px 13px;border-bottom:1px solid var(--ln-soft)}',
      '.z3d-ai-btn{width:100%;cursor:pointer;font:800 9.5px/1 var(--jakarta);letter-spacing:.1em;text-transform:uppercase;color:#fff;background:var(--grad,#6B3FA0);border:none;border-radius:9px;padding:11px 12px;transition:opacity .15s}',
      '.z3d-ai-btn:hover{opacity:.9}',
      '.z3d-ai-btn:disabled{opacity:.55;cursor:default}',
      '.z3d-ai-out{margin-top:10px}',
      '.z3d-ai-out:empty{margin-top:0}',
      '.z3d-ai-load{font:600 10.5px/1.5 var(--jakarta);color:var(--muted)}',
      '.z3d-ai-err{font:600 10.5px/1.5 var(--jakarta);color:#C0392B}',
      '.z3d-ai-txt{font:500 11.5px/1.6 var(--jakarta);color:var(--tx)}',
      '.z3d-ai-txt h4{font:800 9px/1.3 var(--jakarta);letter-spacing:.08em;text-transform:uppercase;color:var(--violet);margin:11px 0 4px}',
      '.z3d-ai-txt strong{color:var(--ink);font-weight:800}',
      '.z3d-ai-txt ul{margin:5px 0;padding-left:16px}',
      '.z3d-ai-txt li{margin:2px 0}',
      '.z3d-ai-foot{font:600 8px/1.4 var(--mono,monospace);color:var(--muted);margin-top:9px;letter-spacing:.02em}',
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
    var list = zonesFor(country());
    chip.disabled = list.length === 0;
    chip.title = list.length ? list.length + ' infrastructure(s)' : 'Aucune infrastructure pour ce pays';
    chip.classList.toggle('on', state.in3D);
    var val = $('chip-3d-val');
    if (val) val.textContent = state.in3D && state.active ? state.active.name : (list.length ? 'Explorer' : 'Indispo.');
  }
  function onChipClick() {
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
      el.onclick = function () { var z = list.find(function (x) { return x.id === el.getAttribute('data-id'); }); closePicker(); if (z) enter3D(z); };
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
    safe(function () { map.setConfigProperty('basemap', 'lightPreset', 'day'); });
    // VRAIE ville 3D Mapbox (ombrée) en contexte → réalisme ; notre infra en surbrillance par-dessus.
    safe(function () { map.setConfigProperty('basemap', 'show3dObjects', true); });
    safe(function () { map.setConfigProperty('basemap', 'showPointOfInterestLabels', false); });
    safe(function () { map.setConfigProperty('basemap', 'showTransitLabels', false); });
  }

  /* ─────────── Entrée / sortie ─────────── */
  function enter3D(zone) {
    var map = state.map; if (!map) return;
    state.active = zone; state.in3D = true;
    document.body.classList.add('z3d-active');
    setImagery(state.imagery);
    enableTerrain();
    applyQuality();
    renderPerimeter(zone);
    renderStructures(zone);
    renderEntities(zone);
    map.flyTo({ center: zone.center, zoom: zone.zoom || 15.5, pitch: zone.pitch != null ? zone.pitch : 60, bearing: zone.bearing || 0, duration: 1700, essential: true });
    // Survol cinématique : légère orbite auto (arrêtée dès que l'utilisateur bouge la carte).
    setTimeout(startOrbit, 1900);
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
    var step = function () {
      if (!state.orbit.on || !state.in3D) return;
      try { map.setBearing((map.getBearing() + 0.12) % 360); } catch (e) { /* */ }
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
    var map = state.map; closePopups(); stopOrbit();
    if (map) {
      // Le relief d'abord (libère la dépendance terrain → source DEM), puis les couches, puis les sources.
      safe(function () { if (state.trace.on) endTraceMode(); });
      safe(function () { map.setTerrain(null); });
      [L_ENT, L_ENT_GLOW, L_LABEL, L_LINE, L_EXTRUDE, L_FILL, L_PERI_L, L_PERI_F, L_TRACE_PT, L_TRACE_LINE, L_TRACE_FILL, SAT_LAYER].forEach(dropLayer);
      [ENT_SRC, SRC, PERI_SRC, TRACE_SRC, SAT_SRC, DEM_SRC].forEach(dropSource);
      safe(function () { map.setConfigProperty('basemap', 'show3dObjects', true); });
      safe(function () { map.setConfigProperty('basemap', 'showPointOfInterestLabels', true); });
      safe(function () { map.setConfigProperty('basemap', 'showTransitLabels', true); });
      safe(function () { map.setFog(null); });
      safe(function () { map.easeTo({ pitch: 0, bearing: 0, duration: 900 }); });
      setTimeout(function () { if (window.HumintMap && window.HumintMap.recenter) window.HumintMap.recenter(); }, 950);
    }
    state.in3D = false; state.active = null; state.entities = [];
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
      return st.key || (st.damage && st.damage !== 'intact') || st.approx || st._trace;
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
    if (map.getSource(SRC)) { map.getSource(SRC).setData(fc); return; }
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
    wirePopups();
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
    updateDetections();
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
    bar.innerHTML = '<span class="z3d-sub">3D</span><span class="z3d-name" id="z3d-name"></span>' +
      '<button class="z3d-trace-btn" id="z3d-trace-btn" title="Tracer l\'emprise du bâtiment sur le satellite">✎ Tracer</button>' +
      '<span class="z3d-trace-live" id="z3d-trace-live"><button class="z3d-trace-ok" id="z3d-trace-ok">✓ Terminer</button><button class="z3d-trace-cancel" id="z3d-trace-cancel">✕</button></span>' +
      '<button class="z3d-exit" id="z3d-exit">Quitter la 3D</button>';
    document.body.appendChild(bar);
    $('z3d-exit').onclick = exit3D;
    $('z3d-trace-btn').onclick = startTrace;
    $('z3d-trace-ok').onclick = finishTrace;
    $('z3d-trace-cancel').onclick = cancelTrace;
  }
  function showBar(zone) { ensureBar(); $('z3d-name').textContent = zone.name; $('z3d-bar').classList.add('on'); syncSeg(); }
  function hideBar() { var b = $('z3d-bar'); if (b) b.classList.remove('on'); }
  function syncSeg() { var seg = $('z3d-seg'); if (seg) seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-k') === state.imagery); }); }

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
      '  <div class="z3d-ai" id="z3d-ai"><button class="z3d-ai-btn" id="z3d-ai-btn">✶ Générer l’analyse IA</button><div class="z3d-ai-out" id="z3d-ai-out"></div></div>' +
      '  <div class="z3d-tl" id="z3d-tl"></div>' +
      '  <div class="z3d-det" id="z3d-det"></div>' +
      '  <div class="z3d-det" id="z3d-actors"></div>' +
      '  <div class="z3d-det" id="z3d-chrono"></div>' +
      '</div>' +
      '<div class="z3d-sec-t" id="z3d-sec-bat">Renseignement (source du marquage)</div>' +
      '<div class="z3d-rank-list" id="z3d-rank-list"></div>';
    document.body.appendChild(p);
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
    // Bouton analyse IA (Mistral)
    var aiBtn = $('z3d-ai-btn'), aiOut = $('z3d-ai-out');
    if (aiOut) aiOut.innerHTML = '';
    if (aiBtn) { aiBtn.disabled = false; aiBtn.textContent = '✶ Générer l’analyse IA'; aiBtn.onclick = function () { generateAnalysis(zone, sector, byType, byActor, first, last); }; }
    // Chronologie mensuelle (sparkline)
    var months = {}; isos.forEach(function (d) { var k = d.slice(0, 7); months[k] = (months[k] || 0) + 1; });
    var mk = Object.keys(months).sort(); var mmax = Math.max.apply(null, mk.map(function (k) { return months[k]; })) || 1;
    var tlBox = $('z3d-tl');
    if (tlBox) tlBox.innerHTML = mk.length ? ('<div class="z3d-det-h"><span>Activité dans le temps</span><span>' + hum + ' HUM / ' + osi + ' OSINT</span></div>' +
      '<div class="z3d-spark">' + mk.map(function (k) { return '<span class="z3d-bar" style="height:' + Math.max(8, Math.round(months[k] / mmax * 100)) + '%" title="' + k + ' : ' + months[k] + '"></span>'; }).join('') + '</div>' +
      '<div class="z3d-spark-x"><span>' + (mk[0] || '') + '</span><span>' + (mk[mk.length - 1] || '') + '</span></div>') : '';
    // Répartition par type
    fillBars($('z3d-det'), 'Répartition par événement', byType.slice(0, 6), function (r) { return entColor(entKind(r.k)); });
    // Acteurs
    fillBars($('z3d-actors'), 'Acteurs impliqués', byActor.slice(0, 6), function () { return '#6B3FA0'; });
    // Chronologie détaillée (liste)
    var chrono = sector.slice().filter(function (f) { return f.iso; }).sort(function (a, b) { return (b.iso || '').localeCompare(a.iso || ''); });
    var cBox = $('z3d-chrono');
    if (cBox) {
      if (!chrono.length) { cBox.style.display = 'none'; cBox.innerHTML = ''; }
      else {
        cBox.style.display = 'block';
        cBox.innerHTML = '<div class="z3d-det-h"><span>Chronologie détaillée</span><span>' + chrono.length + ' incident' + (chrono.length > 1 ? 's' : '') + '</span></div>' +
          chrono.slice(0, 14).map(function (f) {
            return '<div class="z3d-chrono-row"><span class="z3d-chrono-d">' + esc((f.iso || '').slice(2)) + '</span>' +
              '<span class="z3d-chrono-b"><span class="z3d-chrono-t">' + esc(f.type || '—') + (f.acteur && f.acteur !== '—' ? ' · ' + esc(f.acteur) : '') + (f.corrobore ? '' : '') + '</span>' +
              (f.description ? '<span class="z3d-chrono-m">' + esc(f.description) + '</span>' : '') + '</span></div>';
          }).join('') +
          (chrono.length > 14 ? '<div class="z3d-empty" style="padding:6px 0 0">+ ' + (chrono.length - 14) + ' antérieurs</div>' : '');
      }
    }
  }
  // ── mini markdown → HTML (pour la synthèse IA) ──
  function mdMini(t) {
    var lines = String(t || '').replace(/\r/g, '').split('\n'); var out = [], inUl = false;
    function closeUl() { if (inUl) { out.push('</ul>'); inUl = false; } }
    lines.forEach(function (ln) {
      var s = ln.trim();
      var inl = function (x) { return esc(x).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<strong>$1</strong>'); };
      if (!s) { closeUl(); return; }
      var h = s.match(/^#{1,4}\s+(.*)$/);
      if (h) { closeUl(); out.push('<h4>' + inl(h[1]) + '</h4>'); return; }
      var b = s.match(/^[-*•]\s+(.*)$/);
      if (b) { if (!inUl) { out.push('<ul>'); inUl = true; } out.push('<li>' + inl(b[1]) + '</li>'); return; }
      closeUl(); out.push('<p style="margin:5px 0">' + inl(s) + '</p>');
    });
    closeUl(); return out.join('');
  }
  // ── Analyse IA : rapport rédigé par Mistral sur l'infrastructure ──
  function generateAnalysis(zone, sector, byType, byActor, first, last) {
    if (state._z3dAiBusy) return;
    var btn = $('z3d-ai-btn'), out = $('z3d-ai-out');
    if (!out) return;
    var done = function (html, label) { state._z3dAiBusy = false; if (btn) { btn.disabled = false; btn.textContent = label || '↻ Regénérer l’analyse'; } out.innerHTML = html; };
    var sa = window.algorAuth && window.algorAuth.supabase;
    if (!sa) { out.innerHTML = '<div class="z3d-ai-err">Session indisponible. Recharge la page.</div>'; return; }
    state._z3dAiBusy = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Analyse en cours…'; }
    out.innerHTML = '<div class="z3d-ai-load">Mistral analyse ' + esc(zone.name) + ' sur ' + sector.length + ' incident' + (sector.length > 1 ? 's' : '') + ' du secteur…</div>';
    // Contexte structuré transmis au modèle
    var hum = sector.filter(function (f) { return !f.corrobore; }).length, osi = sector.length - hum;
    var lines = [];
    lines.push('INFRASTRUCTURE : ' + zone.name + ' (' + (zone.category || 'infrastructure') + '), pays ' + (zone.pays || '—') + ', statut ' + (STATUS_LABEL[zone.status] || zone.status || 'intact') + '.');
    if (zone.summary) lines.push('Contexte : ' + zone.summary);
    lines.push(sector.length + ' incidents dans un rayon de 9 km (' + osi + ' corroborés, ' + hum + ' HUMINT non corroboré). Période ' + first + ' → ' + last + '.');
    lines.push('Types dominants : ' + byType.slice(0, 6).map(function (r) { return r.k + ' (' + r.n + ')'; }).join(', ') + '.');
    lines.push('Acteurs impliqués : ' + byActor.slice(0, 6).map(function (r) { return r.k + ' (' + r.n + ')'; }).join(', ') + '.');
    lines.push('');
    lines.push('INCIDENTS (du plus récent au plus ancien) :');
    sector.slice().sort(function (a, b) { return (b.iso || '').localeCompare(a.iso || ''); }).slice(0, 20).forEach(function (f) {
      lines.push('- ' + (f.iso || '?') + ' · ' + (f.type || '—') + ' · ' + (f.acteur || '—') + (f.corrobore ? ' [corroboré]' : '') + ' : ' + String(f.description || '').slice(0, 220));
    });
    var statsText = lines.join('\n');
    var periode = (first !== '—' ? first : '') + (last !== '—' ? ' → ' + last : '');
    sa.auth.getSession().then(function (res) {
      var token = res && res.data && res.data.session && res.data.session.access_token;
      if (!token) { done('<div class="z3d-ai-err">Session expirée. Recharge la page.</div>', '✶ Générer l’analyse IA'); return; }
      return fetch('https://lwgrjdpuagnvvzmdbyzb.supabase.co/functions/v1/brief-securite-mistral', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: zone.name, pays: zone.pays || '', mode: 'analyse',
          context: { stats: statsText, total: String(sector.length), periode: periode || 'toutes dates', infrastructure: zone.name },
        }),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (o) {
          if (!o.ok) { done('<div class="z3d-ai-err">' + esc((o.j && (o.j.error || o.j.hint)) || 'Erreur IA') + '</div>', '↻ Réessayer'); return; }
          var src = ((o.j && o.j.sources) || []).slice(0, 6).map(function (s) {
            return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title || 'source') + '</a>';
          }).join(' · ');
          done('<div class="z3d-ai-txt">' + mdMini((o.j && o.j.brief) || '') + '</div>' +
            (src ? '<div class="z3d-ai-foot">Sources : ' + src + '</div>' : '') +
            '<div class="z3d-ai-foot">Généré par ' + esc((o.j && o.j.model) || 'Mistral') + ' · interprétation de ' + sector.length + ' incidents du secteur</div>');
        });
    }).catch(function (e) { done('<div class="z3d-ai-err">Échec réseau. ' + esc(String((e && e.message) || e)) + '</div>', '↻ Réessayer'); });
  }
  function metric(val, lbl, small) { return '<div class="z3d-m"><div class="z3d-m-v' + (small ? ' sm' : '') + '">' + esc(String(val)) + '</div><div class="z3d-m-l">' + esc(lbl) + '</div></div>'; }
  function fillBars(box, title, rows, colFn) {
    if (!box) return;
    if (!rows.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'block';
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; })) || 1;
    box.innerHTML = '<div class="z3d-det-h"><span>' + esc(title) + '</span></div>' + rows.map(function (r) {
      var col = colFn(r), pct = Math.round(r.n / max * 100);
      return '<div class="z3d-det-row"><span class="z3d-det-c" style="color:' + col + '">' + r.n + '</span>' +
        '<span class="z3d-det-l">' + esc(r.k) + '</span>' +
        '<span class="z3d-track"><span class="z3d-fill" style="width:' + pct + '%;background:' + col + '"></span></span></div>';
    }).join('');
  }
  // Panneau « activité détectée » : entités HUMINT/OSINT comptées par type (style Palantir).
  function updateDetections() {
    var box = $('z3d-det'); if (!box) return;
    var ents = state.entities || [];
    // Zones curées (1-2 renseignements) : le détail est déjà dans la liste, on masque ce résumé.
    if (ents.length < 3) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.style.display = 'block';
    var byType = {};
    ents.forEach(function (e) { var t = e.type || 'Divers'; byType[t] = (byType[t] || 0) + 1; });
    var rows = Object.keys(byType).map(function (t) { return { t: t, n: byType[t], k: entKind(t) }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 6);
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; })) || 1;
    var hum = ents.filter(function (e) { return e.source === 'HUMINT'; }).length, osi = ents.length - hum;
    box.innerHTML = '<div class="z3d-det-h"><span>Activité détectée</span><span>' + ents.length + ' entités · ' + hum + ' HUM / ' + osi + ' OSINT</span></div>' +
      rows.map(function (r) {
        var col = entColor(r.k), pct = Math.round(r.n / max * 100);
        return '<div class="z3d-det-row"><span class="z3d-det-c" style="color:' + col + '">' + r.n + '</span>' +
          '<span class="z3d-det-l">' + esc(r.t) + '</span>' +
          '<span class="z3d-track"><span class="z3d-fill" style="width:' + pct + '%;background:' + col + '"></span></span></div>';
      }).join('');
  }
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
