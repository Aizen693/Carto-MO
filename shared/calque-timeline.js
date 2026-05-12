/**
 * calque-timeline.js — Slider/Play pilote par les dates des points des calques.
 *
 * Utilisation (apres engine.js, dans chaque zone CALQUES_ONLY) :
 *   <script src="../shared/calque-timeline.js"></script>
 *   <script>
 *     AlgorCalqueTimeline.init({
 *       sources: [
 *         {
 *           file: 'evenements.geojson',
 *           sourceId: 'evenements-src',   // id de source Mapbox cree par le calque
 *           layers: ['events-glow','events-ring','events-dots', ...]
 *         },
 *         { file: 'humint.geojson', sourceId: 'humint-src',
 *           layers: ['humint-glow','humint-ring','humint-dots'] }
 *       ],
 *       tickMs: 700  // optionnel
 *     });
 *   </script>
 *
 * Chaque source = un fichier GeoJSON dont les features portent une date dans
 * l'un des formats suivants (par ordre de priorite) :
 *   - properties.Date | date | DATE  ("YYYY-MM-DD" ou "DD/MM/YYYY")
 *   - "Date: <valeur>" dans properties.description
 *
 * Le helper normalise toutes les dates au format YYYY-MM-DD et injecte
 * `properties._normDate` dans les features de la source Mapbox, puis filtre
 * cumulativement les `layers` declares (Date <= dateCourante).
 * Les points sans date detectee restent toujours visibles.
 */
(function() {
  var MONTHS_FR = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];

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

  function fmtShort(iso) {
    var p = iso.split('-');
    if (p.length < 3) return iso;
    return parseInt(p[2], 10) + ' ' + MONTHS_FR[parseInt(p[1], 10) - 1];
  }

  function init(opts) {
    opts = opts || {};
    var sources = opts.sources || [];
    var tickMs = opts.tickMs || 700;
    var slider = document.getElementById('timeline-slider');
    var sliderLabel = document.getElementById('slider-label');
    var btnPlay = document.getElementById('btn-play');
    var yrLabels = document.querySelectorAll('#slider-wrap .yr');
    if (!slider || !btnPlay) return;

    var allDates = [];
    var currentIdx = 0;
    var playTimer = null;
    var playing = false;

    var allFilterLayers = [];
    sources.forEach(function(s) {
      if (s.layers && s.layers.length) allFilterLayers = allFilterLayers.concat(s.layers);
    });

    function getMap() { return window.algorMap || null; }

    function buildFilter(maxDate) {
      return ['any',
        ['!', ['has', '_normDate']],
        ['<=', ['coalesce', ['get', '_normDate'], ''], maxDate]
      ];
    }

    function applyFilter() {
      var m = getMap();
      if (!allDates.length || !m || !m.getLayer) return;
      var f = buildFilter(allDates[currentIdx]);
      allFilterLayers.forEach(function(id) {
        if (m.getLayer(id)) {
          try { m.setFilter(id, f); } catch (e) {}
        }
      });
    }

    // Pousse les features normalisees dans la source Mapbox quand elle existe
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

    function updateLabel() {
      if (!allDates.length) { sliderLabel.textContent = '—'; return; }
      sliderLabel.textContent = fmtShort(allDates[currentIdx]);
      var denom = Math.max(1, allDates.length - 1);
      var pct = currentIdx / denom;
      var tw = slider.offsetWidth;
      sliderLabel.style.left = (pct * (tw - 16) + 8) + 'px';
    }

    function setBounds() {
      if (yrLabels.length >= 2 && allDates.length) {
        yrLabels[0].textContent = fmtShort(allDates[0]);
        yrLabels[1].textContent = fmtShort(allDates[allDates.length - 1]);
      }
      slider.min = 0;
      slider.max = Math.max(0, allDates.length - 1);
      slider.value = currentIdx;
    }

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
        return merged;
      });
    }

    Promise.all(sources.map(fetchSource)).then(function(results) {
      var set = {};
      results.forEach(function(d, i) {
        if (!d || !d.features) return;
        d.features.forEach(function(f) {
          var iso = extractDate(f.properties || {});
          if (iso) {
            f.properties = f.properties || {};
            f.properties._normDate = iso;
            set[iso] = true;
          }
        });
        sources[i]._normalized = d;
      });
      allDates = Object.keys(set).sort();
      if (!allDates.length) return;
      currentIdx = allDates.length - 1;
      setBounds();
      updateLabel();
      pushSourceData();
      applyFilter();
    });

    slider.addEventListener('input', function() {
      currentIdx = parseInt(this.value, 10) || 0;
      updateLabel();
      applyFilter();
    });
    window.addEventListener('resize', updateLabel);

    var m = getMap();
    if (m && m.on) {
      m.on('styledata', function() {
        if (!allDates.length) return;
        pushSourceData();
        applyFilter();
      });
    }

    window.togglePlay = function() {
      if (!allDates.length) return;
      playing = !playing;
      btnPlay.textContent = playing ? '⏸' : 'Play';
      btnPlay.classList.toggle('playing', playing);
      if (playing) {
        if (currentIdx >= allDates.length - 1) {
          currentIdx = 0;
          slider.value = 0;
          updateLabel();
          applyFilter();
        }
        playTimer = setInterval(function() {
          currentIdx++;
          if (currentIdx >= allDates.length) {
            window.togglePlay();
            return;
          }
          slider.value = currentIdx;
          updateLabel();
          applyFilter();
        }, tickMs);
      } else {
        clearInterval(playTimer);
        playTimer = null;
      }
    };
  }

  window.AlgorCalqueTimeline = { init: init };
})();
