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
  var SUPABASE_URL = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co';

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
  // Localité : la partie après « Pays - » (ex. « Nigeria - Maiduguri » → « Maiduguri »).
  // Sert aux graphiques d'analyse (répartition géographique). Null si non précisée.
  function villeOf(raw) {
    if (!raw) return null;
    var parts = String(raw).split(/\s*-\s*/);
    if (parts.length < 2) return null;
    var v = parts.slice(1).join(' - ').replace(/\s*\(.*?\)\s*/g, '').replace(/\s+/g, ' ').trim();
    return v || null;
  }
  function canonEvent(raw) {
    if (!raw) return null;
    var s = String(raw).trim(), low = s.toLowerCase();
    if (/frappe|dr[ôo]ne|artillerie|missile|pilonnage|a[ée]rienne/.test(low)) return 'Frappe / Drône';
    if (/\bied\b|\bie[df]\b|\beid\b|mine|explosif/.test(low)) return 'IED / Explosif';
    if (/assassinat|meurtre/.test(low)) return 'Assassinat';
    if (/enl[èe]vem|kidnapp|rapt|otage|s[ée]questr|disparition/.test(low)) return 'Enlèvement / Prise d\'otage';
    if (/embuscade|interception/.test(low)) return 'Embuscade';
    if (/combat|affront|accroch/.test(low)) return 'Combat / Affrontement';
    if (/vol|braquage|pillage|pr[ée]l[èe]vement|cotisation|extorsion|racket/.test(low)) return 'Vol / Pillage / Extorsion';
    if (/menace|ultimatum|alerte|intimidation/.test(low)) return 'Menaces / Alerte';
    if (/arrestation|interpellation|reddition/.test(low)) return 'Arrestation';
    if (/op[ée]ration|offensive|ratissage|reconnaissance|contr[ôo]le/.test(low)) return 'Opération (forces)';
    if (/attaque|incursion|p[ée]n[ée]trat|raid|\btir\b/.test(low)) return 'Attaque';
    if (/d[ée]placement|r[ée]fugi/.test(low)) return 'Déplacement / Réfugiés';
    if (/regroupement|pr[ée]sence|rassemblement|renforcement|position|mouvement/.test(low)) return 'Présence / Mouvement';
    if (/destruction|incendie/.test(low)) return 'Destruction';
    if (/discours|d[ée]claration|revendication|rencontre|r[ée]union|[ée]lection|manifestation|[ée]meute|divers|information|crash|trafic|lib[ée]ration|violence/.test(low)) return 'Information / Divers';
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
        whenAuthorized(function () { ensureRegions(); if (state.entry) startLoad(); initMap(); });
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
      // On MASQUE la frontière native fine (sinon double trait décalé au dézoom) :
      // seul le trait épais ci-dessous (mapbox-streets-v8 admin) doit s'afficher.
      try { map.setConfigProperty('basemap', 'colorAdminBoundaries', 'rgba(0,0,0,0)'); } catch (e) { /* config indispo */ }
      // Frontières pays ÉPAISSES et PRÉCISES : tracées depuis la source Mapbox Streets
      // elle-même (couche `admin`, niveau 0) → MÊME géométrie que le fond, alignement
      // parfait (zéro frontière fausse). Niveau 0 = pays uniquement, hors maritime.
      try {
        if (!map.getSource('mb-admin')) map.addSource('mb-admin', { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' });
        if (!map.getLayer('admin0-thick')) map.addLayer({
          id: 'admin0-thick', type: 'line', slot: 'middle',
          source: 'mb-admin', 'source-layer': 'admin',
          filter: ['all', ['==', ['get', 'admin_level'], 0], ['==', ['get', 'maritime'], 'false']],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#000000',
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 6, 2.2, 9, 3.2, 12, 4.2],
            'line-opacity': 0.92,
          },
        });
      } catch (e) { /* tileset indispo : la frontière native fine reste en place */ }
      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'humint-glow', type: 'circle', source: SRC, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 8, 11, 12, 16], 'circle-color': ['get', '_color'], 'circle-opacity': 0.06, 'circle-blur': 1.2 } });
      map.addLayer({ id: 'humint-ring', type: 'circle', source: SRC, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 8, 5, 12, 8], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', '_color'], 'circle-stroke-width': 0.7, 'circle-stroke-opacity': 0.5 } });
      map.addLayer({ id: 'humint-dots', type: 'circle', source: SRC, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.8, 8, 3, 12, 4.5], 'circle-color': ['get', '_color'], 'circle-stroke-color': '#0d1117', 'circle-stroke-width': 0.5 } });
      // Surlignage de région (clic sur une ligne du panneau d'analyse) — sous les points.
      map.addSource('region-hl', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'region-hl-fill', type: 'fill', source: 'region-hl', paint: { 'fill-color': '#6B3FA0', 'fill-opacity': 0.07 } }, 'humint-glow');
      map.addLayer({ id: 'region-hl-line', type: 'line', source: 'region-hl', paint: { 'line-color': '#6B3FA0', 'line-width': 1.8, 'line-opacity': 0.55 } }, 'humint-glow');
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
      .catch(function (e) { showLoader(false); showError('Données indisponibles.'); console.error(e); });
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
            .setHTML(makePopup({ acteur: f.acteur, type: f.type, iso: f.iso, description: f.description, sources: f.sources, corrobore: f.corrobore, _color: actorColor(f.acteur) }))
            .addTo(map);
        }
      };
    });
  }

  /* ─────────── Panneau d'analyse (graphiques data + synthèse IA) ─────────── */
  // Tout est calculé sur la VRAIE donnée HUMINT du pays courant (respecte les
  // facettes date/typo/acteur, ignore le curseur temporel). L'IA n'invente rien :
  // on lui passe ces chiffres et elle les interprète (edge function mode=analyse).
  function statsTally(feats, field) {
    var m = {};
    feats.forEach(function (f) { var k = (f[field] == null || f[field] === '') ? 'Non précisé' : f[field]; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { k: k, n: m[k] }; })
      .sort(function (a, b) { return b.n - a.n || a.k.localeCompare(b.k); });
  }
  function anaSig() { return [state.country, state.sel.from, state.sel.to, state.sel.event, state.sel.actor].join('|'); }

  /* ── Régions administratives (ADM1) : rattachement par point-dans-polygone ── */
  // Contours = carte/regions.geojson (108 régions des 7 pays, geoBoundaries simplifié).
  // On attribue chaque point à sa région réelle → analyse géographique cohérente
  // (un foyer = une région, pas 60 villages éclatés). Chiffres 100 % vérifiables.
  function bboxOf(coords) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    (function walk(c) { if (typeof c[0] === 'number') { if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1]; } else c.forEach(walk); })(coords);
    return b;
  }
  function inRing(pt, ring) {
    var x = pt[0], y = pt[1], inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function inPoly(pt, poly) { if (!inRing(pt, poly[0])) return false; for (var k = 1; k < poly.length; k++) if (inRing(pt, poly[k])) return false; return true; }
  function inGeom(pt, g) { return g.type === 'Polygon' ? inPoly(pt, g.coordinates) : g.coordinates.some(function (p) { return inPoly(pt, p); }); }
  function regionOf(pt, pays) {
    if (!state.regions || !pt) return null;
    for (var i = 0; i < state.regions.length; i++) {
      var rg = state.regions[i];
      if (pays && rg.pays !== pays) continue;
      var b = rg.bb; if (pt[0] < b[0] || pt[0] > b[2] || pt[1] < b[1] || pt[1] > b[3]) continue;
      if (inGeom(pt, rg.geom)) return rg.name;
    }
    return null;
  }
  function ensureRegions() {
    if (state.regionsReady || state._regionsP) return state._regionsP;
    state._regionsP = fetch('/carte/regions.geojson?v=20260619c').then(function (r) { return r.json(); }).then(function (gj) {
      state.regions = (gj.features || []).map(function (f) {
        return { name: f.properties.name, pays: f.properties.pays, geom: f.geometry, bb: bboxOf(f.geometry.coordinates) };
      });
      state.regionsReady = true;
      state._anaSig = null;
      renderAnalysis(state._lastShown || []); // recalcule dès que les contours sont là
    }).catch(function (e) { console.warn('[regions] indisponibles', e && e.message); });
    return state._regionsP;
  }

  function anaSection(title, rows, total, colorFn, moreNoun, clickable) {
    var max = rows.length ? rows[0].n : 1;
    var body = rows.slice(0, 8).map(function (r) {
      var w = Math.max(4, Math.round(r.n / max * 100));
      var p = total ? Math.round(r.n / total * 100) : 0;
      // Localités cliquables → la carte vole sur la ville/village (data-v = clé).
      var clic = (clickable && r.k !== 'Non précisé') ? ' ana-row-clic' : '';
      var dv = clic ? ' data-v="' + esc(r.k) + '"' : '';
      // Compte = pastille à gauche (collée au nom) ; % = colonne de droite.
      // On évite « 3 · 8% » qui se lirait « 3,8% ».
      return '<div class="ana-row' + clic + '"' + dv + (clic ? ' title="Voir ' + esc(r.k) + ' sur la carte"' : '') + '>' +
        '<span class="ana-row-c" title="' + r.n + ' événement' + (r.n > 1 ? 's' : '') + '">' + r.n + '</span>' +
        '<span class="ana-row-l">' + esc(r.k) + '</span>' +
        '<span class="ana-row-track"><span class="ana-row-fill" style="width:' + w + '%;background:' + colorFn(r.k) + '"></span></span>' +
        '<span class="ana-row-v">' + p + '%</span>' +
        (clic ? '<span class="ana-row-go">→</span>' : '') + '</div>';
    }).join('') || '<div class="ana-empty">Aucune donnée</div>';
    var more = rows.length > 8 ? '<div class="ana-more">+ ' + (rows.length - 8) + ' autres ' + (moreNoun || 'entrées') + '</div>' : '';
    return '<div class="ana-sec"><div class="ana-sec-h"><span class="ana-sec-t">' + esc(title) +
      '</span><span class="ana-sec-n">' + rows.length + '</span></div><div class="ana-bars">' + body + more + '</div></div>';
  }

  function renderAnalysis(shown) {
    var box = $('analysis'); if (!box) return;
    if (!state.country || !(state.all && state.all.length)) { box.style.display = 'none'; state._anaSig = null; return; }
    state._lastShown = shown || [];
    // Jeu EXACT affiché sur la carte, restreint au pays courant → compteur du
    // panneau == points visibles (le décalage venait du fait que l'analyse
    // ignorait le curseur temporel / les calques).
    var feats = (shown || []).filter(function (f) { return f.pays === state.country; });
    state._anaFeats = feats;
    var ready = state.regionsReady;
    if (!ready) ensureRegions();
    if (ready) feats.forEach(function (f) { if (f._region === undefined) f._region = regionOf(f.coords, f.pays) || 'Hors région'; });
    var sig = anaSig() + '#' + feats.length + '#' + state.tl.idx + '#' + (ready ? 'r' : '-');
    if (sig === state._anaSig && box.style.display !== 'none') return;
    state._anaSig = sig;
    if (state.anaOpen === undefined) state.anaOpen = true;
    state.anaDrill = null; // nouvelles données → on revient à la vue graphiques
    state._anaStats = {
      total: feats.length,
      regions: ready ? statsTally(feats, '_region') : [],
      types: statsTally(feats, 'type'), acteurs: statsTally(feats, 'acteur'),
    };
    var head = '<div class="ana-head"><span class="ana-badge">' + state._anaStats.total + '</span>' +
      '<span class="ana-title">Analyse · ' + esc(state.country) + '</span><span class="ana-caret">▾</span></div>';
    box.innerHTML = head + '<div class="ana-body"></div>';
    box.style.display = 'flex';
    box.classList.toggle('ana-open', !!state.anaOpen);
    var h = box.querySelector('.ana-head');
    if (h) h.onclick = function () { state.anaOpen = !state.anaOpen; box.classList.toggle('ana-open', state.anaOpen); };
    paintAnaBody();
  }

  function anaChartsHTML(stats, ready) {
    var geo = ready
      ? anaSection('Régions touchées', stats.regions, stats.total, function () { return 'linear-gradient(90deg,#6B3FA0,#5650C6)'; }, 'régions', true)
      : '<div class="ana-sec"><div class="ana-sec-h"><span class="ana-sec-t">Régions touchées</span></div>' +
        '<div class="ana-bars"><div class="ana-empty">Calcul des régions…</div></div></div>';
    return geo +
      anaSection("Typologie d'événement", stats.types, stats.total, function () { return 'linear-gradient(90deg,#5650C6,#2E84D4)'; }, "typologies") +
      anaSection('Acteurs', stats.acteurs, stats.total, function (k) { return actorColor(k); }, 'acteurs') +
      '<div class="ana-ia"><button class="ana-ia-btn" type="button">✶ Générer la synthèse IA</button><div class="ana-ia-out"></div></div>';
  }

  // Liste auditable des événements d'une région (clic sur une ligne « région »).
  function regionDrillFeats(name) {
    return (state._anaFeats || []).filter(function (f) { return (f._region || 'Hors région') === name; })
      .sort(function (a, b) { return (b.iso || '').localeCompare(a.iso || ''); });
  }
  function anaDrillHTML(name) {
    var fs = regionDrillFeats(name);
    var rows = fs.map(function (f, i) {
      return '<button class="ana-ev" data-i="' + i + '" style="--c:' + actorColor(f.acteur) + '">' +
        '<span class="ana-ev-dot"></span>' +
        '<span class="ana-ev-main"><span class="ana-ev-top">' +
        '<span class="ana-ev-type">' + esc(f.type || '—') + '</span>' +
        '<span class="ana-ev-date">' + esc(f.iso ? frDate(f.iso) : '—') + '</span></span>' +
        '<span class="ana-ev-sub">' + esc(f.acteur || '—') + (f.ville ? ' · ' + esc(f.ville) : '') + '</span>' +
        '</span></button>';
    }).join('') || '<div class="ana-empty">Aucun événement</div>';
    return '<div class="ana-drill-head"><button class="ana-back" type="button">← Régions</button>' +
      '<span class="ana-drill-t" title="' + esc(name) + '">' + esc(name) + '</span>' +
      '<span class="ana-drill-n">' + fs.length + '</span></div>' +
      '<div class="ana-ev-list">' + rows + '</div>';
  }
  function paintAnaBody() {
    var box = $('analysis'); if (!box) return;
    var body = box.querySelector('.ana-body'); if (!body) return;
    if (state.anaDrill) {
      body.innerHTML = anaDrillHTML(state.anaDrill);
      var back = body.querySelector('.ana-back');
      if (back) back.onclick = function () {
        state.anaDrill = null;
        try { if (map && map.getSource('region-hl')) map.getSource('region-hl').setData({ type: 'FeatureCollection', features: [] }); } catch (e) { /* */ }
        paintAnaBody();
      };
      var fs = regionDrillFeats(state.anaDrill);
      body.querySelectorAll('.ana-ev').forEach(function (el) {
        el.onclick = function () {
          var f = fs[+el.getAttribute('data-i')];
          if (f && map && f.coords) {
            try { map.flyTo({ center: f.coords, zoom: 9, duration: 700 }); } catch (e) { /* */ }
            new mapboxgl.Popup({ closeButton: true, maxWidth: '320px', className: 'humint-popup' })
              .setLngLat(f.coords)
              .setHTML(makePopup({ acteur: f.acteur, type: f.type, iso: f.iso, description: f.description, sources: f.sources, corrobore: f.corrobore, _color: actorColor(f.acteur) }))
              .addTo(map);
          }
        };
      });
      return;
    }
    body.innerHTML = anaChartsHTML(state._anaStats, state.regionsReady);
    var btn = body.querySelector('.ana-ia-btn'), out = body.querySelector('.ana-ia-out');
    if (btn) btn.onclick = function () { runAnalysisIA(btn, out, state._anaStats); };
    body.querySelectorAll('.ana-row-clic').forEach(function (el) {
      el.onclick = function () { openRegionDrill(el.getAttribute('data-v')); };
    });
  }
  function openRegionDrill(name) {
    state.anaDrill = name;
    flyToRegion(name);
    paintAnaBody();
  }

  // Clic sur une région → la carte cadre dessus, on surligne son contour et on
  // voit tous ses points (le compte du panneau devient vérifiable à l'œil).
  function flyToRegion(name) {
    if (!map || !name) return;
    var rg = null;
    for (var i = 0; i < (state.regions || []).length; i++) {
      if (state.regions[i].pays === state.country && state.regions[i].name === name) { rg = state.regions[i]; break; }
    }
    if (rg) {
      try { if (map.getSource('region-hl')) map.getSource('region-hl').setData({ type: 'Feature', geometry: rg.geom, properties: {} }); } catch (e) { /* */ }
      var b = rg.bb;
      try { map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: { top: 80, bottom: 80, left: 360, right: 80 }, duration: 800 }); } catch (e) { /* */ }
      return;
    }
    // « Hors région » : on cadre simplement sur ces points.
    var fs = (state._anaFeats || []).filter(function (f) { return (f._region || 'Hors région') === name && f.coords; });
    if (!fs.length) return;
    try {
      var bb = new mapboxgl.LngLatBounds();
      fs.forEach(function (f) { bb.extend(f.coords); });
      map.fitBounds(bb, { padding: { top: 80, bottom: 80, left: 360, right: 80 }, maxZoom: 9, duration: 800 });
    } catch (e) { map.flyTo({ center: fs[0].coords, zoom: 7, duration: 800 }); }
  }

  function buildStatsText(s) {
    function block(title, rows) {
      var t = rows.reduce(function (a, r) { return a + r.n; }, 0) || 1;
      return title + ' :\n' + rows.slice(0, 12).map(function (r) {
        return '- ' + r.k + ' : ' + r.n + ' (' + Math.round(r.n / t * 100) + '%)';
      }).join('\n');
    }
    return block('Regions administratives (repartition geographique)', s.regions) + '\n\n' +
      block('Typologies d evenement', s.types) + '\n\n' +
      block('Acteurs', s.acteurs);
  }
  function mdMini(md) {
    var safe = esc(md).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return safe.split(/\n{2,}/).map(function (blk) {
      blk = blk.trim(); if (!blk) return '';
      var h = blk.match(/^#{1,6}\s+([\s\S]+)$/);
      if (h) return '<h4>' + h[1].replace(/\n/g, ' ').trim() + '</h4>';
      return '<p>' + blk.replace(/\n/g, ' ') + '</p>';
    }).join('');
  }
  function runAnalysisIA(btn, out, stats) {
    if (state._anaBusy) return;
    state._anaBusy = true;
    btn.disabled = true; btn.textContent = 'Analyse en cours…';
    out.innerHTML = '<div class="ana-ia-load">Mistral analyse ' + esc(state.country) + ' sur nos ' + stats.total + ' événements…</div>';
    var done = function (html, label) {
      state._anaBusy = false; btn.disabled = false; btn.textContent = label || '↻ Regénérer la synthèse';
      out.innerHTML = html;
    };
    var sa = window.algorAuth && window.algorAuth.supabase;
    if (!sa) { done('<div class="ana-ia-err">Session indisponible. Recharge la page.</div>', '✶ Générer la synthèse IA'); return; }
    sa.auth.getSession().then(function (res) {
      var token = res && res.data && res.data.session && res.data.session.access_token;
      if (!token) { done('<div class="ana-ia-err">Session expirée. Recharge la page.</div>', '✶ Générer la synthèse IA'); return; }
      var periode = (state.sel.from && state.sel.to) ? (frDate(state.sel.from) + ' – ' + frDate(state.sel.to)) : 'toutes dates';
      return fetch(SUPABASE_URL + '/functions/v1/brief-securite-mistral', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: state.country, pays: state.country, mode: 'analyse',
          context: { stats: buildStatsText(stats), total: String(stats.total), periode: periode },
        }),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (o) {
          if (!o.ok) { done('<div class="ana-ia-err">' + esc(o.j.error || 'Erreur IA') + (o.j.hint ? '<br><span>' + esc(o.j.hint) + '</span>' : '') + '</div>'); return; }
          var src = (o.j.sources || []).slice(0, 6).map(function (s) {
            return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title || 'source') + '</a>';
          }).join('');
          done('<div class="ana-ia-txt">' + mdMini(o.j.brief || '') + '</div>' +
            (src ? '<div class="ana-ia-src">' + src + '</div>' : '') +
            '<div class="ana-ia-foot">Généré par ' + esc(o.j.model || 'Mistral') + ' · interprétation de nos ' + stats.total + ' événements</div>');
        });
    }).catch(function (e) { done('<div class="ana-ia-err">Échec réseau. ' + esc(String((e && e.message) || e)) + '</div>'); });
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
    // Cumul : on montre tout ce qui s'est passé jusqu'à la fin du bucket courant
    // (les points s'accumulent au fil du play, ils ne disparaissent pas d'une période à l'autre)
    return f.iso && f.iso <= b.end;
  }
  function tlLabel() {
    if (state.tl.idx === 0) return 'Toute la période · par ' + state.tl.gran;
    var b = state.tl.buckets[state.tl.idx - 1];
    return b ? 'Jusqu\'à ' + b.label : '';
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
      pays: normalizePays(pays), ville: villeOf(pays), iso: iso, mkey: monthKey(iso),
      type: canonEvent(type), acteur: normalizeActor(acteur) || '—',
      description: p.description || detail || '', sources: p.sources || '', coords: coords,
      // Statut client : info recoupee (renseignement + OSINT) ou non. Defaut = non corrobore.
      corrobore: !!(p.corrobore === true || /corrobor|recoup/i.test(String(p.statut || ''))),
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
    // Jeu de points RÉELLEMENT affiché sur la carte (mêmes filtres : pays/calques,
    // facettes, ET curseur temporel). L'analyse est calculée sur CE jeu → les
    // chiffres du panneau == les points visibles, vérifiable à l'œil.
    var shown = (state.allRaw || []).filter(function (f) { return inScope(f) && passes(f) && tlPasses(f); });
    renderAnalysis(shown);
    if (!map || !map.getSource(SRC)) return;
    map.getSource(SRC).setData({
      type: 'FeatureCollection',
      features: shown.map(function (f) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: f.coords },
          properties: { acteur: f.acteur, type: f.type, iso: f.iso || '', description: f.description, sources: f.sources, corrobore: f.corrobore ? 1 : 0, _color: actorColor(f.acteur) } };
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
    document.title = (state.country || 'Carte') + ' · Algor Access';
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
    state.dataFor = null; state.all = []; state.layers = new Set(); state._anaSig = null;
    if (map) {
      try { if (map.getSource('region-hl')) map.getSource('region-hl').setData({ type: 'FeatureCollection', features: [] }); } catch (e) { /* */ }
      try { map.flyTo({ center: entry.center, zoom: entry.zoom, duration: 600 }); } catch (e) { /* */ }
    }
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
      // Une case = un jour cliquable. Les jours des mois voisins comblent les
      // debuts/fins de semaine (grille toujours pleine, plus de cases vides).
      function cell(iso, d) {
        var off = iso < minDate || iso > maxDate;
        var sel = iso === from || iso === to, rng = from && to && iso > from && iso < to;
        return '<button class="cd' + (off ? ' cd-off' : '') + (sel ? ' cd-sel' : '') + (rng ? ' cd-rng' : '') + '" data-iso="' + iso + '"' + (off ? ' disabled' : '') + '>' + d + '</button>';
      }
      var pm = vm === 1 ? 12 : vm - 1, py = vm === 1 ? vy - 1 : vy, pdim = lastDay(py, pm);
      for (var i = lead; i > 0; i--) { var pdd = pdim - i + 1; cells += cell(py + '-' + pad(pm) + '-' + pad(pdd), pdd); }
      for (var d = 1; d <= dim; d++) cells += cell(vy + '-' + pad(vm) + '-' + pad(d), d);
      var nm = vm === 12 ? 1 : vm + 1, ny = vm === 12 ? vy + 1 : vy, nd = 1, tot = lead + dim;
      while (tot % 7 !== 0) { cells += cell(ny + '-' + pad(nm) + '-' + pad(nd), nd); nd++; tot++; }
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
    // Statut de recoupement : seul indicateur de fiabilite montre au client (jamais HUMINT / OSINT).
    var corr = !!p.corrobore;
    var sColor = corr ? '#2e9e5b' : '#9aa0a6';
    var sLabel = corr ? 'Corroboré' : 'Non corroboré';
    rows += '<div class="popup-row"><span class="popup-key">Statut</span><span class="popup-val"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + sColor + ';margin-right:6px;vertical-align:middle"></span>' + sLabel + '</span></div>';
    if (p.type) rows += '<div class="popup-row"><span class="popup-key">Typologie d\'événement</span><span class="popup-val">' + esc(p.type) + '</span></div>';
    if (p.iso) rows += '<div class="popup-row"><span class="popup-key">Date</span><span class="popup-val">' + esc(p.iso) + '</span></div>';
    if (p.description) rows += '<div class="popup-row popup-desc"><span class="popup-val">' + esc(p.description) + '</span></div>';
    // Carte vue client : aucune source ni origine affichee (HUMINT / OSINT jamais montres).
    return head + '<div class="popup-body">' + rows + '</div>';
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
