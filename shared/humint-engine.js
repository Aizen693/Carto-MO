/**
 * humint-engine.js — Carte HUMINT par pays, construite pas à pas.
 *
 * Expérience : une seule barre, façon « chat ». Le client tape un PAYS qui se
 * verrouille en jeton à gauche, puis la même barre lui demande une DATE, puis
 * une TYPOLOGIE (événement), puis un ACTEUR. Chaque réponse se verrouille et
 * affine la carte ; à tout moment « Toutes/Tous » saute une facette.
 *
 * Source : fichiers humint.geojson (sahel, rdc), filtrés au pays. Les helpers
 * de normalisation sont identiques à scripts/build-humint-manifest.mjs.
 *
 * Dépend de Mapbox GL JS + carte/countries.json. La carte n'est créée qu'après
 * l'octroi premium (événement `algorAuthReady` de site-auth.js).
 */
(function () {
  'use strict';

  mapboxgl.accessToken = 'pk.eyJ1IjoiYXo2OTMiLCJhIjoiY21uMGlhY2ZyMGx6bDJycjAxYWZjbWt5eiJ9.SQqOLLgLwWKnUGMztrSArg';

  /* ─────────── Normalisation (miroir du build) ─────────── */
  var PAYS_TYPOS = {
    'bukrina faso': 'Burkina Faso', 'burkina faso': 'Burkina Faso',
    'mali-mauritanie': 'Mali', 'rdc': 'RDC', 'israel': 'Israël', 'benin': 'Bénin',
  };
  function normalizePays(raw) {
    if (!raw) return null;
    var s = String(raw).trim().split(/\s*-\s*/)[0].replace(/\s*\(.*?\)\s*/g, '').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    var key = s.toLowerCase();
    if (PAYS_TYPOS[key]) return PAYS_TYPOS[key];
    if (/[,/]/.test(s) || /fronti/i.test(s)) return null;
    return s;
  }
  function canonEvent(raw) {
    if (!raw) return null;
    var s = String(raw).trim(), low = s.toLowerCase();
    if (/\bied\b|mine|explosif/.test(low)) return 'IED / Explosif';
    if (/frappe|dr[ôo]ne/.test(low)) return 'Frappe aérienne / Drône';
    if (/assassinat/.test(low)) return 'Assassinat';
    if (/embuscade/.test(low)) return 'Embuscade';
    if (/enl[èe]vement|kidnapp/.test(low)) return 'Enlèvement';
    if (/attaque/.test(low)) return 'Attaque';
    if (/combat/.test(low)) return 'Combat';
    if (/menace/.test(low)) return 'Menaces';
    if (/op[ée]ration/.test(low)) return 'Opération';
    if (/arrestation/.test(low)) return 'Arrestation';
    if (/regroupement|pr[ée]sence/.test(low)) return 'Présence / Regroupement';
    if (/divers|information/.test(low)) return 'Divers';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function normalizeActor(raw) {
    if (!raw) return null;
    var s = String(raw).trim().replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').replace(/\s*\/\s*/g, '/');
    return s || null;
  }
  function parseDesc(desc) {
    var out = {};
    if (!desc) return out;
    String(desc).split(/\n/).forEach(function (line) {
      var m = line.match(/^\s*([^:]+?)\s*:\s*(.+)$/);
      if (!m) return;
      var k = m[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      var v = m[2].trim();
      if (k.indexOf('date') === 0) out.date = v;
      else if (k.indexOf('pays') === 0) out.pays = v;
      else if (k.indexOf('even') === 0) out.type = v;
      else if (k.indexOf('detail') === 0 || k.indexOf('descri') === 0) out.detail = v;
    });
    return out;
  }
  var MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  function toISO(raw) {
    if (!raw) return null;
    var s = String(raw).trim(), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
    return null;
  }
  function monthKey(iso) { return iso ? iso.slice(0, 7) : null; }

  function actorColor(actor) {
    if (!actor) return '#ff9800';
    var a = actor.toUpperCase();
    if (/CIVIL/.test(a)) return '#c49a3c';
    if (/GENERAL/.test(a)) return '#7b1fa2';
    if (/\b(FR|USA|ONU|UE|UN|ONG|SMP)\b/.test(a)) return '#1565c0';
    if (/FAMA|FDS|FAN|\bANT\b|VDP|BIR|GMI|\bFA\b|FORCES/.test(a)) return '#2e7d32';
    if (/EI|GSIM|GAT|JAS|ISWAP|AQ|GANE|HANI|JNIM|ISCAP|GAE|\bAK\b|FLA/.test(a)) return '#d32f2f';
    return '#ff9800';
  }

  /* ─────────── État ─────────── */
  // Affichage : la requête (pays/date/typo/acteur) est construite sur l'accueil
  // (barre du globe) et passée en paramètres d'URL. Ici on charge et on affiche.
  var map = null;
  var state = {
    manifest: null,
    entry: null,
    country: null,
    all: [],
    sel: { from: null, to: null, event: null, actor: null },
    dataFor: null,
    mapReady: false,
  };
  var SRC = 'humint-src';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* ─────────── Boot ─────────── */
  // La requête est construite sur l'accueil et passée en paramètres :
  //   /carte/?pays=Mali&date=2026-01&event=Attaque&actor=GSIM
  function boot() {
    var q = new URLSearchParams(location.search);
    fetch('/carte/countries.json?v=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.manifest = data;
        var wanted = q.get('pays');
        var e = wanted && data.countries.find(function (c) { return c.name === wanted; });
        if (e) {
          state.entry = e; state.country = e.name;
          state.sel = { from: q.get('from') || null, to: q.get('to') || null, event: q.get('event') || null, actor: q.get('actor') || null };
        }
        renderSummary();
        whenAuthorized(function () { if (state.entry) startLoad(); initMap(); });
      })
      .catch(function (er) { showError('Manifeste pays introuvable.'); console.error(er); });
  }

  function whenAuthorized(cb) {
    if (window.__algorAuthGranted) { cb(); return; }
    window.addEventListener('algorAuthReady', function once() {
      window.removeEventListener('algorAuthReady', once);
      window.__algorAuthGranted = true;
      cb();
    });
  }

  function whenStyleLoaded(cb) {
    var done = false;
    function fin() { if (done) return; done = true; cb(); }
    if (map.isStyleLoaded()) { fin(); return; }
    map.on('style.load', fin);
    map.on('load', fin);
    var n = 0, t = setInterval(function () {
      n++;
      if (map.isStyleLoaded()) { clearInterval(t); fin(); }
      else if (n > 100) { clearInterval(t); }
    }, 100);
  }

  function initMap() {
    var c = state.entry ? state.entry.center : [2, 14];
    var z = state.entry ? state.entry.zoom : 3.4;
    map = new mapboxgl.Map({
      container: 'map', style: 'mapbox://styles/mapbox/standard',
      center: c, zoom: z, projection: 'mercator', attributionControl: false, language: 'fr',
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    whenStyleLoaded(function () {
      map.resize();
      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'humint-glow', type: 'circle', source: SRC, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 8, 11, 12, 16], 'circle-color': ['get', '_color'], 'circle-opacity': 0.06, 'circle-blur': 1.2 } });
      map.addLayer({ id: 'humint-ring', type: 'circle', source: SRC, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 8, 5, 12, 8], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', '_color'], 'circle-stroke-width': 0.7, 'circle-stroke-opacity': 0.5 } });
      map.addLayer({ id: 'humint-dots', type: 'circle', source: SRC, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.8, 8, 3, 12, 4.5], 'circle-color': ['get', '_color'], 'circle-stroke-color': '#0d1117', 'circle-stroke-width': 0.5 } });
      setupPopups();
      state.mapReady = true;
      tryRender();
    });
  }

  /* ─────────── Chargement des données (découplé de la carte) ─────────── */
  // Source = base HUMINT LIVE du bucket privé Supabase (premium, MAJ hebdo via
  // l'admin). Repli sur le fichier statique du repo pour le dev / hors session.
  function fetchZone(path) {
    if (window.algorAuth && window.algorAuth.loadZoneFile && window.ZONE_PRIVATE) {
      var live = Promise.race([
        window.algorAuth.loadZoneFile(path),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout bucket')); }, 9000); }),
      ]);
      return live.catch(function (e) {
        console.warn('[humint] bucket indisponible, repli statique', e && e.message);
        return fetch(path + '?v=' + Date.now()).then(function (r) { return r.json(); });
      });
    }
    return fetch(path + '?v=' + Date.now()).then(function (r) { return r.json(); });
  }

  function startLoad() {
    if (state.dataFor === state.country) { tryRender(); return; }
    showLoader(true);
    var target = state.country;
    fetchZone(state.entry.file)
      .then(function (gj) {
        if (state.country !== target) return;
        state.all = (gj.features || []).map(normFeature).filter(function (f) { return f && f.pays === target && f.coords; });
        state.dataFor = target;
        showLoader(false);
        tryRender();
      })
      .catch(function (e) { showLoader(false); showError('Données HUMINT indisponibles.'); console.error(e); });
  }

  // Rendu dès que la donnée ET la carte sont prêtes (ordre d'arrivée indifférent).
  function tryRender() {
    if (!state.mapReady || state.dataFor !== state.country) return;
    applyFacets();
    fitToFiltered();
  }

  function normFeature(f) {
    var p = (f && f.properties) || {};
    var coords = (f.geometry && f.geometry.coordinates) || null;
    if (!coords) return null;
    var pays = p.pays, date = p.date, type = p.type, acteur = p.name, detail = '';
    if (!pays || !date || !type) {
      var parsed = parseDesc(p.description);
      pays = pays || parsed.pays; date = date || parsed.date; type = type || parsed.type; detail = parsed.detail || '';
    }
    var iso = toISO(date);
    return {
      pays: normalizePays(pays), iso: iso, mkey: monthKey(iso),
      type: canonEvent(type), acteur: normalizeActor(acteur) || '—',
      description: p.description || detail || '', sources: p.sources || '', coords: coords,
    };
  }

  /* ─────────── Filtrage → source Mapbox ─────────── */
  function passes(f) {
    if (state.sel.from || state.sel.to) {
      if (!f.iso) return false;
      if (state.sel.from && f.iso < state.sel.from) return false;
      if (state.sel.to && f.iso > state.sel.to) return false;
    }
    if (state.sel.event && f.type !== state.sel.event) return false;
    if (state.sel.actor && f.acteur !== state.sel.actor) return false;
    return true;
  }
  function applyFacets() {
    if (!map || !map.getSource(SRC)) return;
    var shown = state.all.filter(passes);
    map.getSource(SRC).setData({
      type: 'FeatureCollection',
      features: shown.map(function (f) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: f.coords },
          properties: { acteur: f.acteur, type: f.type, iso: f.iso || '', description: f.description, sources: f.sources, _color: actorColor(f.acteur) } };
      }),
    });
    updateLegend(shown);
    updateCounter(shown.length);
  }

  /* ─────────── Résumé de la requête (jetons en lecture, ✕ pour retirer) ─────────── */
  function frDate(iso) {
    if (!iso) return '';
    var mo = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    var p = iso.split('-');
    return parseInt(p[2], 10) + ' ' + mo[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  // Jetons éditables : on change pays / date / typologie / acteur directement
  // sur la carte (clic → sélecteur), sans repasser par le curseur de l'accueil.
  function renderSummary() {
    var bar = $('chipbar');
    if (!bar) return;
    closePop();
    bar.innerHTML = '';
    if (!state.country) {
      bar.innerHTML = '<a class="builder-reset" href="/">← Choisir un pays</a>';
    } else {
      bar.appendChild(facetChip('pays', 'Pays', state.country, true));
      bar.appendChild(facetChip('date', 'Période', (state.sel.from && state.sel.to) ? (frDate(state.sel.from) + ' – ' + frDate(state.sel.to)) : 'Toute période', !!(state.sel.from && state.sel.to)));
      bar.appendChild(facetChip('actor', 'Acteur', state.sel.actor || 'Tous', !!state.sel.actor));
      bar.appendChild(facetChip('event', 'Typologie', state.sel.event || 'Toutes', !!state.sel.event));
    }
    var title = $('country-title');
    if (title) title.textContent = state.country || 'Choisir un pays';
    document.title = (state.country || 'Carte') + ' — HUMINT — Algor Int';
  }

  function facetChip(key, label, value, active) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'chip chip-edit' + (key === 'pays' ? ' chip-pays' : '') + (active ? ' chip-on' : '');
    el.innerHTML = '<span class="chip-key">' + esc(label) + '</span><span class="chip-val">' + esc(value) + '</span><span class="chip-caret">▾</span>';
    el.onclick = function (e) { e.stopPropagation(); openEditor(key, el); };
    return el;
  }

  /* ── Popover générique ── */
  function closePop() { var p = $('facet-pop'); if (p) p.remove(); document.removeEventListener('mousedown', outsidePop); }
  function outsidePop(e) { var p = $('facet-pop'); if (p && !p.contains(e.target) && !(e.target.closest && e.target.closest('.chip-edit'))) closePop(); }
  function openPop(anchor, html, wire) {
    closePop();
    var p = document.createElement('div');
    p.id = 'facet-pop'; p.className = 'facet-pop';
    p.innerHTML = html;
    document.body.appendChild(p);
    var r = anchor.getBoundingClientRect();
    p.style.left = Math.max(8, Math.min(r.left, window.innerWidth - p.offsetWidth - 8)) + 'px';
    p.style.top = (r.bottom + 8) + 'px';
    if (wire) wire(p);
    setTimeout(function () { document.addEventListener('mousedown', outsidePop); }, 0);
    return p;
  }

  /* ── Valeurs disponibles par facette (selon les autres filtres) ── */
  function rowsFor(includeEvent) {
    return state.all.filter(function (f) {
      if (state.sel.from || state.sel.to) {
        if (!f.iso) return false;
        if (state.sel.from && f.iso < state.sel.from) return false;
        if (state.sel.to && f.iso > state.sel.to) return false;
      }
      if (includeEvent && state.sel.event && f.type !== state.sel.event) return false;
      return true;
    });
  }
  function distinctCount(rows, field) {
    var m = {};
    rows.forEach(function (f) { if (f[field]) m[f[field]] = (m[f[field]] || 0) + 1; });
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).map(function (k) { return { v: k, n: m[k] }; });
  }

  /* ── Éditeurs ── */
  function openEditor(key, anchor) {
    if (key === 'pays') return openList(anchor, 'Pays', null, (state.manifest.countries || []).map(function (c) { return { v: c.name, n: c.count }; }), state.country, false, function (val) { switchCountry(val); });
    if (key === 'event') return openList(anchor, 'Typologie', 'Toutes les typologies', distinctCount(rowsFor(false), 'type'), state.sel.event, true, function (val) { state.sel.event = val; applyFacets(); renderSummary(); fitToFiltered(); });
    if (key === 'actor') return openList(anchor, 'Acteur', 'Tous les acteurs', distinctCount(rowsFor(true), 'acteur'), state.sel.actor, true, function (val) { state.sel.actor = val; applyFacets(); renderSummary(); fitToFiltered(); });
    if (key === 'date') return openCalendar(anchor);
  }

  function openList(anchor, title, allLabel, items, current, isActor, onPick) {
    var rows = '';
    if (allLabel) rows += '<button class="fp-opt' + (!current ? ' on' : '') + '" data-v="__all"><span class="fp-l">' + esc(allLabel) + '</span></button>';
    rows += items.map(function (o) {
      var dot = isActor ? '<span class="fp-dot" style="background:' + actorColor(o.v) + '"></span>' : '';
      return '<button class="fp-opt' + (o.v === current ? ' on' : '') + '" data-v="' + esc(o.v) + '">' + dot + '<span class="fp-l">' + esc(o.v) + '</span><span class="fp-n">' + o.n + '</span></button>';
    }).join('') || '<div class="fp-empty">Aucune valeur</div>';
    openPop(anchor, '<div class="fp-head">' + esc(title) + '</div><div class="fp-body">' + rows + '</div>', function (p) {
      p.querySelectorAll('.fp-opt').forEach(function (b) {
        b.onclick = function () { var v = b.getAttribute('data-v'); closePop(); onPick(v === '__all' ? null : v); };
      });
    });
  }

  function switchCountry(name) {
    var entry = (state.manifest.countries || []).find(function (c) { return c.name === name; });
    if (!entry || name === state.country) return;
    state.entry = entry; state.country = name;
    state.sel = { from: null, to: null, event: null, actor: null };
    state.dataFor = null; state.all = [];
    if (map) { try { map.flyTo({ center: entry.center, zoom: entry.zoom, duration: 600 }); } catch (e) { /* */ } }
    renderSummary();
    startLoad();
  }

  // Calendrier (intervalle), version vanilla de celui de l'accueil.
  function openCalendar(anchor) {
    var entry = state.entry; if (!entry) return;
    var MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    var JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function lastDay(y, m) { return new Date(y, m, 0).getDate(); }
    // Bornes = tous les mois réellement présents dans la donnée chargée (live),
    // sinon repli sur les mois du manifeste.
    var mset = {};
    state.all.forEach(function (f) { if (f.mkey) mset[f.mkey] = 1; });
    var keys = Object.keys(mset).sort();
    if (!keys.length) keys = (entry.months || []).map(function (m) { return m.key; }).sort();
    var minKey = keys[0] || '2026-01', maxKey = keys[keys.length - 1] || minKey;
    var mk = maxKey.split('-').map(Number);
    var minDate = minKey + '-01', maxDate = maxKey + '-' + pad(lastDay(mk[0], mk[1]));
    var view = state.sel.from ? state.sel.from.slice(0, 7) : minKey;
    var from = state.sel.from, to = state.sel.to;

    function html() {
      var vy = +view.split('-')[0], vm = +view.split('-')[1];
      var lead = (new Date(vy, vm - 1, 1).getDay() + 6) % 7, dim = lastDay(vy, vm), cells = '';
      for (var i = 0; i < lead; i++) cells += '<span class="cd cd-blank"></span>';
      for (var d = 1; d <= dim; d++) {
        var iso = vy + '-' + pad(vm) + '-' + pad(d), off = iso < minDate || iso > maxDate;
        var sel = iso === from || iso === to, rng = from && to && iso > from && iso < to;
        cells += '<button class="cd' + (off ? ' cd-off' : '') + (sel ? ' cd-sel' : '') + (rng ? ' cd-rng' : '') + '" data-iso="' + iso + '"' + (off ? ' disabled' : '') + '>' + d + '</button>';
      }
      var lab = (from && to) ? (frDate(from) + ' – ' + frDate(to)) : (from ? (frDate(from) + ' – …') : 'Sélectionnez deux dates');
      return '<div class="cal-head"><button class="cal-nav" data-nav="-1"' + (view <= minKey ? ' disabled' : '') + '>‹</button><span class="cal-title">' + MOIS[vm - 1] + ' ' + vy + '</span><button class="cal-nav" data-nav="1"' + (view >= maxKey ? ' disabled' : '') + '>›</button></div>'
        + '<div class="cal-grid cal-dow">' + JOURS.map(function (j) { return '<span class="cdow">' + j + '</span>'; }).join('') + '</div>'
        + '<div class="cal-grid cal-days">' + cells + '</div>'
        + '<div class="cal-foot"><span class="cal-range">' + esc(lab) + '</span><div class="cal-actions"><button class="cal-btn cal-ghost" data-act="cancel">Annuler</button><button class="cal-btn cal-go" data-act="ok"' + (!(from && to) ? ' disabled' : '') + '>Valider</button></div></div>';
    }
    var pop;
    function wire(p) {
      p.querySelectorAll('.cal-nav').forEach(function (b) {
        b.onclick = function () { if (b.disabled) return; var y = +view.split('-')[0], m = +view.split('-')[1] + (+b.getAttribute('data-nav')); if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; } var nk = y + '-' + pad(m); if (nk >= minKey && nk <= maxKey) { view = nk; redraw(); } };
      });
      p.querySelectorAll('.cd:not(.cd-blank)').forEach(function (b) {
        b.onclick = function () { if (b.disabled) return; var iso = b.getAttribute('data-iso'); if (!from || (from && to)) { from = iso; to = null; } else if (iso >= from) { to = iso; } else { from = iso; } redraw(); };
      });
      var c = p.querySelector('[data-act=cancel]'); if (c) c.onclick = function () { closePop(); };
      var ok = p.querySelector('[data-act=ok]'); if (ok) ok.onclick = function () { if (from && to) { state.sel.from = from; state.sel.to = to; closePop(); applyFacets(); renderSummary(); fitToFiltered(); } };
    }
    function redraw() { pop.querySelector('.cal-inner').innerHTML = html(); wire(pop); }
    pop = openPop(anchor, '<div class="cal-inner">' + html() + '</div>', wire);
  }

  /* ─────────── Légende / compteur / popups ─────────── */
  function updateLegend(shown) {
    var box = $('legend-items');
    if (!box) return;
    var counts = {};
    shown.forEach(function (f) { counts[f.acteur] = (counts[f.acteur] || 0) + 1; });
    var rows = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (!rows.length) { box.innerHTML = '<div class="legend-empty">' + (state.country ? 'Aucun renseignement pour ces filtres' : 'Choisissez un pays pour commencer') + '</div>'; return; }
    box.innerHTML = rows.map(function (a) {
      return '<div class="legend-row"><span class="legend-dot" style="background:' + actorColor(a) + '"></span><span class="legend-name">' + esc(a) + '</span><span class="legend-count">' + counts[a] + '</span></div>';
    }).join('');
  }
  function updateCounter(n) {
    var el = $('counter');
    if (el) el.textContent = n ? (n + (n > 1 ? ' renseignements' : ' renseignement')) : '';
  }
  function setupPopups() {
    map.on('mouseenter', 'humint-dots', function () { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'humint-dots', function () { map.getCanvas().style.cursor = ''; });
    map.on('click', 'humint-dots', function (e) {
      var f = e.features && e.features[0];
      if (!f) return;
      new mapboxgl.Popup({ closeButton: true, maxWidth: '320px', className: 'humint-popup' })
        .setLngLat(f.geometry.coordinates).setHTML(makePopup(f.properties)).addTo(map);
    });
  }
  function makePopup(p) {
    var color = p._color || '#888';
    var head = '<div class="popup-header"><div class="popup-dot-bar" style="background:' + color + '"></div><div class="popup-actor">' + esc(p.acteur) + '</div></div>';
    var rows = '';
    if (p.type) rows += '<div class="popup-row"><span class="popup-key">Typologie</span><span class="popup-val">' + esc(p.type) + '</span></div>';
    if (p.iso) rows += '<div class="popup-row"><span class="popup-key">Date</span><span class="popup-val">' + esc(p.iso) + '</span></div>';
    if (p.description) rows += '<div class="popup-row popup-desc"><span class="popup-val">' + esc(p.description) + '</span></div>';
    var src = '';
    if (p.sources) {
      var links = String(p.sources).split(/\s+(?=[^\s|]+\|http)/).map(function (s) {
        var parts = s.split('|');
        if (parts.length === 2 && parts[1].indexOf('http') === 0) return '<a href="' + esc(parts[1]) + '" target="_blank" rel="noopener">' + esc(parts[0]) + '</a>';
        return '<span>' + esc(s) + '</span>';
      }).join(' ');
      src = '<div class="popup-sources"><span class="popup-key">Sources</span>' + links + '</div>';
    }
    return head + '<div class="popup-body">' + rows + src + '</div>';
  }

  function fitToFiltered() {
    if (!map) return;
    var shown = state.all.filter(passes);
    var pts = shown.length ? shown : state.all;
    if (!pts.length) return;
    var b = new mapboxgl.LngLatBounds();
    pts.forEach(function (f) { b.extend(f.coords); });
    try { map.fitBounds(b, { padding: 70, maxZoom: 9, duration: 600 }); } catch (e) { /* */ }
  }
  function showLoader(on) { var l = $('loader'); if (l) l.style.display = on ? 'flex' : 'none'; }
  function showError(msg) { var l = $('loader'); if (l) { l.style.display = 'flex'; l.textContent = msg; } }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.HumintMap = { recenter: fitToFiltered };
})();
