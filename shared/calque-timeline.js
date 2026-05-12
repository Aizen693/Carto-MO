/**
 * calque-timeline.js — Filtre les calques par les periodes selectionnees.
 *
 * Le slider/Play sont geres par engine.js comme avant (cycle de PERIODS).
 * Quand l'utilisateur change de periode, engine.js appelle un hook
 * `window.onActivePeriodsChange(activeIndexes, PERIODS, showAll)` que ce
 * helper intercepte pour appliquer un filtre Mapbox sur les couches des
 * calques temporels.
 *
 * Le helper :
 *   1. Charge chaque fichier source, extrait la date par feature (champs
 *      Date / date / DATE, ou "Date: DD/MM/YYYY" dans description),
 *      normalise au format ISO YYYY-MM-DD dans `properties._normDate`.
 *   2. Pousse les features normalisees dans la source Mapbox correspondante.
 *   3. Calcule les plages de dates (start..end) des periodes actives :
 *      - explicite via PERIODS[i].start / .end
 *      - ou auto-derivee du nom de fichier (ex: 2026-jan-01-15.geojson).
 *   4. Construit un filtre OR cumulant les plages actives et l'applique
 *      sur tous les `layers` declares.
 *
 * Utilisation :
 *   AlgorCalqueTimeline.init({
 *     sources: [
 *       { file: 'evenements.geojson', sourceId: 'evenements-src',
 *         layers: ['events-glow','events-ring','events-dots', ...] },
 *       { files: ['2026-jan-01-15.geojson', ...], sourceId: 'evenements-src',
 *         layers: [...] }
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

  function extractDate(props) {
    if (!props) return null;
    var candidates = [props.Date, props.date, props.DATE];
    for (var i = 0; i < candidates.length; i++) {
      var d = normalizeDate(candidates[i]);
      if (d) return d;
    }
    var desc = props.description || props.Description || '';
    var m = desc.match(/Date\s*:\s*([0-9\/\.\-]+)/i);
    if (m) return normalizeDate(m[1]);
    return null;
  }

  var MONTHS_FR = {
    jan: 1, janv: 1, janvier: 1,
    fev: 2, 'fév': 2, fevr: 2, 'févr': 2, fevrier: 2, 'février': 2,
    mars: 3,
    avr: 4, avril: 4,
    mai: 5,
    juin: 6,
    juil: 7, juillet: 7,
    aout: 8, 'août': 8, aoû: 8,
    sep: 9, sept: 9, septembre: 9,
    oct: 10, octobre: 10,
    nov: 11, novembre: 11,
    dec: 12, 'déc': 12, decembre: 12, 'décembre': 12
  };

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
    opts = opts || {};
    var sources = opts.sources || [];
    var allFilterLayers = [];
    sources.forEach(function(s) {
      if (s.layers && s.layers.length) allFilterLayers = allFilterLayers.concat(s.layers);
    });

    function getMap() { return window.algorMap || null; }

    function fetchSource(s) {
      var fileList = s.files || (s.file ? [s.file] : []);
      return Promise.all(fileList.map(function(f) {
        return fetch('./' + f + '?v=' + Date.now())
          .then(function(r) { return r.json(); })
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

    Promise.all(sources.map(fetchSource)).then(function(results) {
      results.forEach(function(d, i) { sources[i]._normalized = d; });
      pushSourceData();
      applyFilterForCurrentState();
    });

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

    function buildFilterFromState(activeIndexes, periods, showAll) {
      if (showAll) return null; // pas de filtre : tout afficher
      if (!activeIndexes.length) {
        // aucune periode active = rien afficher (filtre toujours faux)
        return ['==', ['literal', 1], ['literal', 0]];
      }
      var ranges = [];
      activeIndexes.forEach(function(i) {
        var p = periods[i];
        if (!p) return;
        var r = (p.start && p.end) ? { start: p.start, end: p.end } : rangeFromFile(p.file);
        if (r) ranges.push(r);
      });
      if (!ranges.length) return null;
      return ['any'].concat(ranges.map(function(r) {
        return ['all',
          ['>=', ['coalesce', ['get', '_normDate'], ''], r.start],
          ['<=', ['coalesce', ['get', '_normDate'], ''], r.end]
        ];
      }));
    }

    var lastFilter = null;

    function applyFilter(filter) {
      var m = getMap();
      if (!m || !m.getLayer) return;
      allFilterLayers.forEach(function(id) {
        if (m.getLayer(id)) {
          try { m.setFilter(id, filter); } catch (e) {}
        }
      });
    }

    function applyFilterForCurrentState() {
      applyFilter(lastFilter);
    }

    // Hook recu d'engine.js a chaque changement de periodes (Play, slider,
    // bouton periode, TOUT).
    window.onActivePeriodsChange = function(activeIndexes, periods, showAll) {
      lastFilter = buildFilterFromState(activeIndexes, periods, showAll);
      applyFilter(lastFilter);
    };

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
