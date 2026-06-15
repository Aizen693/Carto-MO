/**
 * calque-timeline.js — Filtre les calques par les periodes selectionnees +
 * auto-activation des calques temporels au chargement + compteur d'evenements.
 *
 * Le slider/Play sont geres par engine.js (cycle de PERIODS). Quand
 * activePeriods change, engine.js appelle window.onActivePeriodsChange.
 *
 * Le helper :
 *   1. Charge chaque fichier source, extrait la date par feature (champs
 *      Date / date / DATE, ou "Date: DD/MM/YYYY" dans description) et la
 *      normalise dans `properties._normDate` (YYYY-MM-DD).
 *   2. Pousse les features normalisees dans la source Mapbox correspondante.
 *   3. Auto-active le calque dans la sidebar (toggleLayer) une fois que la
 *      source est prete (sauf si autoEnable: false).
 *   4. Calcule les plages de dates des periodes actives (start..end) :
 *      - explicite via PERIODS[i].start / .end
 *      - ou auto-derivee du nom de fichier (ex: 2026-jan-01-15.geojson).
 *   5. Applique un filtre OR cumulant les plages sur les `layers` listes.
 *   6. Met a jour le compteur #event-counter avec le total des points filtres.
 *
 * Utilisation :
 *   AlgorCalqueTimeline.init({
 *     sources: [
 *       { calqueId: 'evenements', file: 'evenements.geojson',
 *         sourceId: 'evenements-src',
 *         layers: ['events-glow','events-ring','events-dots', ...] },
 *       { calqueId: 'humint', file: 'humint.geojson',
 *         sourceId: 'humint-src',
 *         layers: ['humint-glow','humint-ring','humint-dots'] }
 *     ]
 *   });
 */
(function() {
  function pad2(n) { n = String(n); return n.length < 2 ? '0' + n : n; }

  function normalizeDate(s) {
    if (!s || typeof s !== 'string') return null;
    s = s.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/);
    if (m) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
    m = s.match(/^(\d{4})[\/\.\-](\d{1,2})[\/\.\-](\d{1,2})$/);
    if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
    return null;
  }

  var MONTHS_FR = {
    jan: 1, janv: 1, janvier: 1, january: 1,
    fev: 2, 'fév': 2, fevr: 2, 'févr': 2, fevrier: 2, 'février': 2, february: 2,
    mars: 3, march: 3,
    avr: 4, avril: 4, april: 4,
    mai: 5, may: 5,
    juin: 6, june: 6,
    juil: 7, juillet: 7, july: 7,
    aout: 8, 'août': 8, aoû: 8, august: 8,
    sep: 9, sept: 9, septembre: 9, september: 9,
    oct: 10, octobre: 10, october: 10,
    nov: 11, novembre: 11, november: 11,
    dec: 12, 'déc': 12, decembre: 12, 'décembre': 12, december: 12
  };
  var MONTH_ALT = Object.keys(MONTHS_FR).sort(function(a, b) { return b.length - a.length; }).join('|');

  function extractDateFromText(text) {
    if (!text) return null;
    var m;
    // 1. ISO YYYY-MM-DD
    m = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
    // 2. DD/MM/YYYY (ou DD-MM-YYYY, DD.MM.YYYY)
    m = text.match(/\b(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})\b/);
    if (m) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
    // 3. DD mois YYYY (FR/EN)
    m = text.match(new RegExp('\\b(\\d{1,2})\\s+(' + MONTH_ALT + ')\\.?\\s+(\\d{4})\\b', 'i'));
    if (m) {
      var mon3 = MONTHS_FR[m[2].toLowerCase()];
      if (mon3) return m[3] + '-' + pad2(mon3) + '-' + pad2(m[1]);
    }
    // 4. mois YYYY (sans jour, prend le 1er)
    m = text.match(new RegExp('\\b(' + MONTH_ALT + ')\\.?\\s+(\\d{4})\\b', 'i'));
    if (m) {
      var mon4 = MONTHS_FR[m[1].toLowerCase()];
      if (mon4) return m[2] + '-' + pad2(mon4) + '-01';
    }
    // 5. QN YYYY (trimestre — debut du trimestre)
    m = text.match(/\bQ([1-4])\s+(\d{4})\b/i);
    if (m) {
      var qm = (parseInt(m[1], 10) - 1) * 3 + 1;
      return m[2] + '-' + pad2(qm) + '-01';
    }
    return null;
  }

  function extractDate(props) {
    if (!props) return null;
    // a) Champs directs
    var direct = [props.Date, props.date, props.DATE];
    for (var i = 0; i < direct.length; i++) {
      var d = normalizeDate(direct[i]);
      if (d) return d;
    }
    // b) Scan large : description + detail + tout champ string
    var fields = ['description', 'Description', 'detail', 'Detail', 'detail'];
    for (var j = 0; j < fields.length; j++) {
      var v = props[fields[j]];
      if (typeof v === 'string') {
        var iso = extractDateFromText(v);
        if (iso) return iso;
      }
    }
    // c) Dernier recours : concatener tous les champs string
    var blob = '';
    for (var k in props) {
      if (typeof props[k] === 'string') blob += ' ' + props[k];
    }
    return extractDateFromText(blob);
  }

  function rangeFromFile(file) {
    if (!file) return null;
    var m = file.match(/^(\d{4})-([a-zééû]+)-(\d{1,2})-(\d{1,2})\.(?:geojson|kml)$/i);
    if (!m) return null;
    var month = MONTHS_FR[m[2].toLowerCase()];
    if (!month) return null;
    return {
      start: m[1] + '-' + pad2(month) + '-' + pad2(m[3]),
      end:   m[1] + '-' + pad2(month) + '-' + pad2(m[4])
    };
  }

  function init(opts) {
    if (window.ZONE_CONFIG && window.ZONE_CONFIG.DISABLE_LAYERS_AND_POINTS) return;
    opts = opts || {};
    var sources = opts.sources || [];
    var autoEnableDefault = opts.autoEnable === true;
    var allFilterLayers = [];
    sources.forEach(function(s) {
      if (s.layers && s.layers.length) allFilterLayers = allFilterLayers.concat(s.layers);
    });

    function getMap() { return window.algorMap || null; }

    function fetchSource(s) {
      var fileList = s.files || (s.file ? [s.file] : []);
      return Promise.all(fileList.map(function(f) {
        // Zone privée (théâtre premium) → Storage privé via algorAuth (on attend
        // algorReady, posé tôt, plutôt que ZONE_PRIVATE posé par le module
        // différé) ; démo publique (pas d'algorReady) → fetch statique.
        // Tester UNIQUEMENT algorReady (algorAuth pas encore défini au parse).
        var slug = location.pathname.split('/').filter(Boolean)[0] || '';
        return (window.algorReady
            ? window.algorReady.then(function () { return window.algorAuth.loadZoneFile(slug + '/' + f); })
            : fetch('./' + f + '?v=' + Date.now()).then(function(r) { return r.json(); }))
          .catch(function() { return null; });
      })).then(function(parts) {
        var merged = { type: 'FeatureCollection', features: [] };
        parts.forEach(function(p) {
          if (p && p.features) merged.features = merged.features.concat(p.features);
        });
        merged.features.forEach(function(f) {
          var iso = extractDate(f.properties || {});
          if (iso) {
            f.properties = f.properties || {};
            f.properties._normDate = iso;
          }
        });
        return merged;
      });
    }

    function pushSourceData() {
      var m = getMap();
      if (!m || !m.getSource) return;
      sources.forEach(function(s) {
        if (!s.sourceId || !s._normalized) return;
        var src = m.getSource(s.sourceId);
        if (!src) return;
        if (s._pushed) return;
        try { src.setData(s._normalized); s._pushed = true; } catch (e) {}
      });
    }

    function autoEnableCalques() {
      if (!window.toggleLayer) return;
      sources.forEach(function(s) {
        if (!s.calqueId) return;
        if (s.autoEnable === false) return;
        if (s._autoEnabled) return;
        var el = document.getElementById('sb-toggle-' + s.calqueId);
        var alreadyOn = el && el.classList.contains('on');
        if (!alreadyOn && autoEnableDefault) {
          try { window.toggleLayer(s.calqueId); } catch (e) {}
        }
        s._autoEnabled = true;
      });
    }

    function buildFilterFromState(activeIndexes, periods, showAll) {
      if (showAll) return null;
      // Aucune periode active : on garde visible uniquement les points sans
      // _normDate (calques statiques) ; les events temporels sont caches.
      if (!activeIndexes.length) return ['!', ['has', '_normDate']];
      var ranges = [];
      activeIndexes.forEach(function(i) {
        var p = periods[i];
        if (!p) return;
        var r = (p.start && p.end) ? { start: p.start, end: p.end } : rangeFromFile(p.file);
        if (r) ranges.push(r);
      });
      if (!ranges.length) return null;
      // Les points sans _normDate (calques statiques sans date detectee)
      // restent toujours visibles — on n'affiche que les events temporels
      // dans leur plage de date.
      return ['any', ['!', ['has', '_normDate']]].concat(ranges.map(function(r) {
        return ['all',
          ['>=', ['coalesce', ['get', '_normDate'], ''], r.start],
          ['<=', ['coalesce', ['get', '_normDate'], ''], r.end]
        ];
      }));
    }

    var lastFilter = null;
    var lastActive = [];
    var lastShowAll = false;

    function dateInRanges(iso, ranges) {
      if (!iso) return false;
      for (var i = 0; i < ranges.length; i++) {
        if (iso >= ranges[i].start && iso <= ranges[i].end) return true;
      }
      return false;
    }

    function countFiltered() {
      var total = 0;
      var ranges = [];
      if (!lastShowAll) {
        var periods = (window.ZONE_CONFIG && window.ZONE_CONFIG.PERIODS) || [];
        lastActive.forEach(function(i) {
          var p = periods[i];
          if (!p) return;
          var r = (p.start && p.end) ? { start: p.start, end: p.end } : rangeFromFile(p.file);
          if (r) ranges.push(r);
        });
        if (!ranges.length) return 0;
      }
      sources.forEach(function(s) {
        if (!s._normalized || !s._normalized.features) return;
        s._normalized.features.forEach(function(f) {
          var iso = f.properties && f.properties._normDate;
          if (lastShowAll) { total++; return; }
          if (dateInRanges(iso, ranges)) total++;
        });
      });
      return total;
    }

    function updateCounter() {
      var el = document.getElementById('event-counter');
      if (!el) return;
      el.style.display = 'none';
    }

    // Filtre par acteur (legende) — ANDe avec le filtre de periode sur les couches de points
    var activeActor = null;
    function isPointLayer(id) { return /(-dots|-glow|-ring|-pulse|-label|3d-)/.test(id); }
    function applyFilter(filter) {
      var m = getMap();
      if (!m || !m.getLayer) return;
      allFilterLayers.forEach(function(id) {
        if (!m.getLayer(id)) return;
        var f = filter;
        if (activeActor && isPointLayer(id)) {
          var af = ['==', ['coalesce', ['get', 'name'], ''], activeActor];
          f = f ? ['all', f, af] : af;
        }
        try { m.setFilter(id, f); } catch (e) {}
      });
    }

    function currentRanges() {
      if (lastShowAll) return null; // null = toutes les dates
      var ranges = [];
      var periods = (window.ZONE_CONFIG && window.ZONE_CONFIG.PERIODS) || [];
      lastActive.forEach(function(i) {
        var p = periods[i]; if (!p) return;
        var r = (p.start && p.end) ? { start: p.start, end: p.end } : rangeFromFile(p.file);
        if (r) ranges.push(r);
      });
      return ranges;
    }

    // Reconstruit la legende depuis les acteurs presents dans les calques ACTIFS
    // et dans la periode active (mode CALQUES_ONLY ou engine.js ne le fait pas).
    function buildCalqueLegend() {
      if (typeof window.updateLegend !== 'function') return;
      if (!lastShowAll && !lastActive.length) return; // pas de periode -> engine vide la legende
      var ranges = currentRanges();
      var getCol = (typeof window.getColor === 'function') ? window.getColor : function () { return '#888'; };
      var actors = {};
      sources.forEach(function(s) {
        if (!s.calqueId || !s._normalized) return;
        var el = document.getElementById('sb-toggle-' + s.calqueId);
        if (!el || !el.classList.contains('on')) return;
        s._normalized.features.forEach(function(f) {
          var p = (f && f.properties) || {};
          var name = p.name; if (!name) return;
          var iso = p._normDate;
          var ok = (ranges === null) || !iso || dateInRanges(iso, ranges);
          if (!ok) return;
          if (!actors[name]) actors[name] = getCol(name);
        });
      });
      window.updateLegend(actors);
    }

    Promise.all(sources.map(fetchSource)).then(function(results) {
      results.forEach(function(d, i) { sources[i]._normalized = d; });
      pushSourceData();
      autoEnableCalques();
      applyFilter(lastFilter);
      updateCounter();
      buildCalqueLegend();
    });

    window.onActivePeriodsChange = function(activeIndexes, periods, showAll) {
      lastActive = activeIndexes || [];
      lastShowAll = !!showAll;
      lastFilter = buildFilterFromState(lastActive, periods, lastShowAll);
      applyFilter(lastFilter);
      // Le calque peut etre cree de facon lazy par le factory ; on s'assure
      // que les sources/donnees soient pretes a chaque changement.
      pushSourceData();
      autoEnableCalques();
      updateCounter();
      buildCalqueLegend();
    };

    // Clic sur un item de legende -> engine.toggleActorFilter appelle ceci
    window.applyCalqueActorFilter = function(actor) {
      activeActor = actor || null;
      applyFilter(lastFilter);
    };
    window.refreshCalqueLegend = buildCalqueLegend;

    // Rafraichit la legende quand on (de)active un calque ou Tout activer/enlever
    document.addEventListener('click', function(e) {
      if (!e.target || !e.target.closest) return;
      if (e.target.closest('.sb-toggle') || e.target.closest('.sb-style-btn')) {
        setTimeout(buildCalqueLegend, 60);
      }
    });

    var m = getMap();
    if (m && m.on) {
      m.on('styledata', function() {
        pushSourceData();
        applyFilter(lastFilter);
      });
    }
  }

  window.AlgorCalqueTimeline = { init: init };
})();
