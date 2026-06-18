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
    // Point multi-pays / frontière → rattaché au 1er pays nommé (aucune perte).
    if (/[,/]/.test(s) || /fronti/i.test(s)) {
      s = s.replace(/fronti[èe]re/i, '').split(/[,/]/)[0].replace(/\s*\(.*?\)\s*/g, '').trim();
      if (!s) return null;
    }
    var key = s.toLowerCase();
    if (PAYS_TYPOS[key]) return PAYS_TYPOS[key];
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
    m = s.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
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
    allRaw: [],          // toutes les features du fichier chargé (pays + voisins)
    layers: new Set(),   // pays frontaliers affichés en calque
    sel: { from: null, to: null, event: null, actor: null },
    dataFor: null,
    mapReady: false,
    tl: { gran: 'jour', buckets: [], idx: 0, playing: false, timer: null },
  };
  var SRC = 'humint-src';

  // Pays frontaliers (uniquement ceux pour lesquels on a de la donnée HUMINT).
  var NEIGHBORS = {
    'Mali': ['Niger', 'Burkina Faso'],
    'Niger': ['Mali', 'Burkina Faso', 'Nigeria', 'Bénin'],
    'Burkina Faso': ['Mali', 'Niger', 'Bénin', 'Togo'],
    'Nigeria': ['Niger', 'Bénin'],
    'Bénin': ['Niger', 'Burkina Faso', 'Nigeria', 'Togo'],
    'Togo': ['Burkina Faso', 'Bénin'],
    'RDC': [],
  };
  // Une feature est affichée si elle appartient au pays courant OU à un calque actif.
  function inScope(f) { return f.pays === state.country || (state.layers && state.layers.has(f.pays)); }

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
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout bucket')); }, 20000); }),
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
        var feats = (gj.features || []).map(normFeature).filter(Boolean);
        state.allRaw = feats;
        state.all = feats.filter(function (f) { return f.pays === target; });
        state.dataFor = target;
        showLoader(false);
        tryRender();
      })
      .catch(function (e) { showLoader(false); showError('Données HUMINT indisponibles.'); console.error(e); });
  }

  // Rendu dès que la donnée ET la carte sont prêtes (ordre d'arrivée indifférent).
  function tryRender() {
    if (!state.mapReady || state.dataFor !== state.country) return;
    buildTimeline();
    applyFacets();
    fitToFiltered();
    renderNew();
  }

  /* ─────────── Panneau « Nouveau cette semaine » (abonnés) ─────────── */
  // Basé sur la date d'INGESTION (champ `added` posé par n8n à l'arrivée).
  function daysSince(iso) {
    if (!iso) return Infinity;
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((now - isoToDate(iso)) / 86400000);
  }
  function relTime(iso) {
    var d = daysSince(iso);
    if (!isFinite(d)) return '';
    if (d <= 0) return "aujourd'hui";
    if (d === 1) return 'hier';
    if (d < 7) return 'il y a ' + d + ' j';
    var w = Math.round(d / 7);
    return 'il y a ' + w + ' sem';
  }
  function renderNew() {
    var box = $('news'); if (!box) return;
    var pts = state.all.filter(function (f) { return f.added && daysSince(f.added) >= 0 && daysSince(f.added) <= 7; })
      .sort(function (a, b) { return (b.added || '').localeCompare(a.added || '') || (b.iso || '').localeCompare(a.iso || ''); });
    var art = /^(RDC|RCA)$/i.test(state.country || '') ? 'la ' : 'le ';
    var titre = 'Nouveauté cette semaine' + (state.country ? ' sur ' + art + state.country : '');
    var head = '<div class="news-head">' +
      (pts.length ? '<span class="news-badge">' + pts.length + '</span>' : '') +
      '<span class="news-title">' + esc(titre) + '</span>' +
      '<span class="news-caret">▾</span></div>';
    // Bandeau cliquable : déplie / replie la liste (état mémorisé dans state.newsOpen).
    function wireToggle() {
      var h = box.querySelector('.news-head');
      if (h) h.onclick = function () { state.newsOpen = !state.newsOpen; box.classList.toggle('news-open', state.newsOpen); };
      box.classList.toggle('news-open', !!state.newsOpen);
    }
    if (!pts.length) {
      box.innerHTML = head + '<div class="news-list"><div class="news-empty">Aucune nouvelle donnée cette semaine pour ' + esc(state.country || 'ce pays') + '.</div></div>';
      box.style.display = 'flex'; wireToggle(); return;
    }
    box.innerHTML = head + '<div class="news-list">' + pts.slice(0, 60).map(function (f, i) {
      var c = actorColor(f.acteur);
      return '<button class="news-row" data-i="' + i + '" style="--c:' + c + ';--i:' + i + '">' +
        '<span class="news-accent"></span>' +
        '<span class="news-main">' +
          '<span class="news-top"><span class="news-type">' + esc(f.type || 'Renseignement') + '</span>' +
          '<span class="news-when">' + esc(relTime(f.iso)) + '</span></span>' +
          '<span class="news-actor">' + esc(f.acteur) + '</span>' +
        '</span>' +
        '<span class="news-go">→</span>' +
      '</button>';
    }).join('') + '</div>';
    box.style.display = 'flex';
    wireToggle();
    box.querySelectorAll('.news-row').forEach(function (el) {
      el.onclick = function () {
        var f = pts[+el.getAttribute('data-i')];
        if (f && map) {
          try { map.flyTo({ center: f.coords, zoom: 9, duration: 700 }); } catch (e) { /* */ }
          new mapboxgl.Popup({ closeButton: true, maxWidth: '320px', className: 'humint-popup' })
            .setLngLat(f.coords)
            .setHTML(makePopup({ acteur: f.acteur, type: f.type, iso: f.iso, description: f.description, sources: f.sources, _color: actorColor(f.acteur) }))
            .addTo(map);
        }
      };
    });
  }

  /* ─────────── Curseur temporel (granularité adaptée à la période) ─────────── */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoToDate(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dateToIso(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function frShort(iso) { var ms = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']; var p = iso.split('-'); return parseInt(p[2], 10) + ' ' + ms[parseInt(p[1], 10) - 1]; }

  function activeRange() {
    if (state.sel.from && state.sel.to) return [state.sel.from, state.sel.to];
    var min = null, max = null;
    state.all.forEach(function (f) { if (f.iso) { if (!min || f.iso < min) min = f.iso; if (!max || f.iso > max) max = f.iso; } });
    return (min && max) ? [min, max] : null;
  }

  function buildBuckets(fromIso, toIso) {
    var span = Math.round((isoToDate(toIso) - isoToDate(fromIso)) / 86400000) + 1;
    var buckets = [], gran, d, end = isoToDate(toIso);
    if (span <= 31) {
      gran = 'jour';
      for (d = isoToDate(fromIso); d <= end; d.setDate(d.getDate() + 1)) { var iso = dateToIso(d); buckets.push({ start: iso, end: iso, label: frDate(iso) }); }
    } else if (span <= 92) {
      gran = 'semaine';
      d = isoToDate(fromIso);
      while (d <= end) { var s = new Date(d); var e = new Date(d); e.setDate(e.getDate() + 6); if (e > end) e = new Date(end); buckets.push({ start: dateToIso(s), end: dateToIso(e), label: frShort(dateToIso(s)) + ' – ' + frShort(dateToIso(e)) }); d.setDate(d.getDate() + 7); }
    } else {
      gran = 'mois';
      var y = +fromIso.slice(0, 4), m = +fromIso.slice(5, 7) - 1;
      d = new Date(y, m, 1);
      while (d <= end) {
        var by = d.getFullYear(), bm = d.getMonth();
        var bs = dateToIso(new Date(by, bm, 1)), be = dateToIso(new Date(by, bm + 1, 0));
        if (bs < fromIso) bs = fromIso; if (be > toIso) be = toIso;
        buckets.push({ start: bs, end: be, label: MOIS_FR[bm] + ' ' + by });
        d = new Date(by, bm + 1, 1);
      }
    }
    return { gran: gran, buckets: buckets };
  }

  function buildTimeline() {
    stopPlay();
    var r = activeRange();
    if (!r) { state.tl = { gran: 'jour', buckets: [], idx: 0, playing: false, timer: null }; renderTimeline(); return; }
    var bb = buildBuckets(r[0], r[1]);
    state.tl = { gran: bb.gran, buckets: bb.buckets, idx: 0, playing: false, timer: null };
    renderTimeline();
  }

  function tlPasses(f) {
    if (state.tl.idx <= 0) return true;
    var b = state.tl.buckets[state.tl.idx - 1];
    if (!b) return true;
    return f.iso && f.iso >= b.start && f.iso <= b.end;
  }
  function tlLabel() {
    if (state.tl.idx === 0) return 'Toute la période · par ' + state.tl.gran;
    var b = state.tl.buckets[state.tl.idx - 1];
    return b ? b.label : '';
  }
  function updateTl() {
    var l = $('tl-label'); if (l) l.textContent = tlLabel();
    var s = $('tl-slider'); if (s) s.value = state.tl.idx;
  }
  function renderTimeline() {
    var box = $('timeline'); if (!box) return;
    if (!state.tl.buckets.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'flex';
    var n = state.tl.buckets.length;
    box.innerHTML = '<button id="tl-play" class="tl-btn" title="Lecture">▶</button>' +
      '<input type="range" id="tl-slider" min="0" max="' + n + '" step="1" value="' + state.tl.idx + '">' +
      '<span id="tl-label">' + esc(tlLabel()) + '</span>';
    $('tl-slider').oninput = function () { stopPlay(); state.tl.idx = +this.value; updateTl(); applyFacets(); };
    $('tl-play').onclick = function () { togglePlay(); };
  }
  function togglePlay() { if (state.tl.playing) stopPlay(); else startPlay(); }
  function startPlay() {
    if (!state.tl.buckets.length) return;
    if (state.tl.idx >= state.tl.buckets.length) state.tl.idx = 0;
    state.tl.playing = true;
    var btn = $('tl-play'); if (btn) btn.textContent = '❚❚';
    state.tl.timer = setInterval(function () {
      state.tl.idx++;
      if (state.tl.idx > state.tl.buckets.length) { stopPlay(); state.tl.idx = 0; updateTl(); applyFacets(); return; }
      updateTl(); applyFacets();
    }, 950);
  }
  function stopPlay() {
    if (!state.tl) return;
    state.tl.playing = false;
    if (state.tl.timer) { clearInterval(state.tl.timer); state.tl.timer = null; }
    var btn = $('tl-play'); if (btn) btn.textContent = '▶';
  }

  function normFeature(f) {
    var p = (f && f.properties) || {};
    var coords = (f.geometry && f.geometry.coordinates) || null;
    // Coordonnées valides obligatoires : 2 nombres finis, lon ∈ [-180,180], lat ∈ [-90,90].
    // Un point pourri (coquille source → lat>90, NaN…) est ignoré au lieu de casser le rendu.
    if (!coords || !isFinite(coords[0]) || !isFinite(coords[1]) ||
        coords[0] < -180 || coords[0] > 180 || coords[1] < -90 || coords[1] > 90) return null;
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
      added: p.added ? String(p.added).slice(0, 10) : null,
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
    var shown = (state.allRaw || []).filter(function (f) { return inScope(f) && passes(f) && tlPasses(f); });
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
      bar.appendChild(facetChip('event', "Typologie d'événement", state.sel.event || 'Toutes', !!state.sel.event));
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
    el.onclick = function (e) { e.stopPropagation(); if (popAnchor === el) { closePop(); return; } openEditor(key, el); };
    return el;
  }

  /* ── Popover générique ── */
  var popAnchor = null;
  function closePop() {
    var p = $('facet-pop'); if (p) p.remove();
    document.removeEventListener('mousedown', outsidePop);
    if (popAnchor && popAnchor.classList) popAnchor.classList.remove('chip-pop-open');
    popAnchor = null;
    cancelHideNeighbor(); closeNeighborMenu();
  }
  function outsidePop(e) { var p = $('facet-pop'); if (p && !p.contains(e.target) && !(e.target.closest && (e.target.closest('.chip-edit') || e.target.closest('#fp-sub')))) closePop(); }
  function openPop(anchor, html, wire) {
    closePop();
    var p = document.createElement('div');
    p.id = 'facet-pop'; p.className = 'facet-pop';
    p.innerHTML = html;
    document.body.appendChild(p);
    popAnchor = anchor; if (anchor && anchor.classList) anchor.classList.add('chip-pop-open');
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
    if (key === 'pays') return openList(anchor, 'Pays', null, (state.manifest.countries || []).map(function (c) { return { v: c.name, n: c.count }; }), state.country, false, function (val) { switchCountry(val); }, true);
    if (key === 'event') return openList(anchor, "Typologie d'événement", 'Toutes les typologies', distinctCount(rowsFor(false), 'type'), state.sel.event, true, function (val) { state.sel.event = val; applyFacets(); renderSummary(); fitToFiltered(); });
    if (key === 'actor') return openList(anchor, 'Acteur', 'Tous les acteurs', distinctCount(rowsFor(true), 'acteur'), state.sel.actor, true, function (val) { state.sel.actor = val; applyFacets(); renderSummary(); fitToFiltered(); });
    if (key === 'date') return openCalendar(anchor);
  }

  function openList(anchor, title, allLabel, items, current, isActor, onPick, withLayers) {
    var rows = '';
    if (allLabel) rows += '<button class="fp-opt' + (!current ? ' on' : '') + '" data-v="__all"><span class="fp-l">' + esc(allLabel) + '</span></button>';
    rows += items.map(function (o) {
      var dot = isActor ? '<span class="fp-dot" style="background:' + actorColor(o.v) + '"></span>' : '';
      var caret = (withLayers && (NEIGHBORS[o.v] || []).length) ? '<span class="fp-more">›</span>' : '';
      return '<button class="fp-opt' + (o.v === current ? ' on' : '') + '" data-v="' + esc(o.v) + '">' + dot + '<span class="fp-l">' + esc(o.v) + '</span><span class="fp-n">' + o.n + '</span>' + caret + '</button>';
    }).join('') || '<div class="fp-empty">Aucune valeur</div>';
    openPop(anchor, '<div class="fp-head">' + esc(title) + '</div><div class="fp-body">' + rows + '</div>', function (p) {
      p.querySelectorAll('.fp-opt').forEach(function (b) {
        b.onclick = function () { var v = b.getAttribute('data-v'); closePop(); onPick(v === '__all' ? null : v); };
        if (withLayers) {
          var name = b.getAttribute('data-v');
          b.addEventListener('mouseenter', function () { cancelHideNeighbor(); openNeighborMenu(b, name); });
          b.addEventListener('mouseleave', scheduleHideNeighbor);
        }
      });
    });
  }

  /* ── Calques frontaliers : popup latérale au survol d'un pays ── */
  var neighborHideTimer = null;
  function cancelHideNeighbor() { if (neighborHideTimer) { clearTimeout(neighborHideTimer); neighborHideTimer = null; } }
  function scheduleHideNeighbor() { cancelHideNeighbor(); neighborHideTimer = setTimeout(closeNeighborMenu, 240); }
  function closeNeighborMenu() { var m = $('fp-sub'); if (m) m.remove(); }
  function openNeighborMenu(rowEl, country) {
    closeNeighborMenu();
    var nb = NEIGHBORS[country] || [];
    if (!nb.length) return;
    var counts = {}; (state.manifest.countries || []).forEach(function (c) { counts[c.name] = c.count; });
    var m = document.createElement('div');
    m.id = 'fp-sub'; m.className = 'fp-sub';
    m.innerHTML = '<div class="fp-head">Calques frontaliers</div><div class="fp-body">' + nb.map(function (name) {
      var on = state.layers && state.layers.has(name);
      return '<div class="fp-sub-row" data-c="' + esc(name) + '">' +
        '<span class="fp-l">' + esc(name) + '</span><span class="fp-n">' + (counts[name] || 0) + '</span>' +
        '<button class="lay-toggle' + (on ? ' on' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '"><span class="lay-knob"></span></button>' +
        '</div>';
    }).join('') + '</div>';
    document.body.appendChild(m);
    var r = rowEl.getBoundingClientRect();
    var w = m.offsetWidth;
    var left = r.right + 6;
    if (left + w > window.innerWidth - 8) left = r.left - w - 6;
    m.style.left = Math.max(8, left) + 'px';
    m.style.top = Math.max(8, Math.min(r.top - 4, window.innerHeight - m.offsetHeight - 8)) + 'px';
    m.addEventListener('mouseenter', cancelHideNeighbor);
    m.addEventListener('mouseleave', scheduleHideNeighbor);
    m.querySelectorAll('.fp-sub-row').forEach(function (rw) {
      var btn = rw.querySelector('.lay-toggle');
      btn.onclick = function (e) {
        e.stopPropagation();
        var c = rw.getAttribute('data-c');
        if (!state.layers) state.layers = new Set();
        if (state.layers.has(c)) state.layers.delete(c); else state.layers.add(c);
        var on = state.layers.has(c);
        btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        applyFacets(); fitToFiltered();
      };
    });
  }

  function switchCountry(name) {
    var entry = (state.manifest.countries || []).find(function (c) { return c.name === name; });
    if (!entry || name === state.country) return;
    state.entry = entry; state.country = name;
    state.sel = { from: null, to: null, event: null, actor: null };
    state.dataFor = null; state.all = []; state.layers = new Set();
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
    // Le calendrier va toujours au moins jusqu'au mois courant (calculé à l'exécution :
    // s'étend tout seul chaque début de mois, même sans donnée encore arrivée).
    var now = new Date();
    var nowKey = now.getFullYear() + '-' + pad(now.getMonth() + 1);
    if (nowKey > maxKey) maxKey = nowKey;
    var mk = maxKey.split('-').map(Number);
    var todayIso = nowKey + '-' + pad(now.getDate());
    var minDate = minKey + '-01';
    // Dans le mois courant, on ne sélectionne pas au-delà d'aujourd'hui.
    var maxDate = (maxKey === nowKey) ? todayIso : maxKey + '-' + pad(lastDay(mk[0], mk[1]));
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
      var ok = p.querySelector('[data-act=ok]'); if (ok) ok.onclick = function () { if (from && to) { state.sel.from = from; state.sel.to = to; closePop(); buildTimeline(); applyFacets(); renderSummary(); fitToFiltered(); } };
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
    if (p.type) rows += '<div class="popup-row"><span class="popup-key">Typologie d\'événement</span><span class="popup-val">' + esc(p.type) + '</span></div>';
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
    var shown = (state.allRaw || []).filter(function (f) { return inScope(f) && passes(f); });
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
