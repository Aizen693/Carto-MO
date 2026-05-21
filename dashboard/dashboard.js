/**
 * dashboard.js — Recherche full-text sur tous les GeoJSON archives.
 *
 * 1. Au boot, fetch en parallele les ~90 fichiers .geojson des 6 zones.
 * 2. Construit un index plat de features avec _searchBlob pre-calcule
 *    (concat lowercase de tous les champs string).
 * 3. Filtre live a chaque keystroke (debounced 80ms).
 * 4. Filtres pills par zone.
 * 5. Pagination par 60.
 */
(function() {
  // ─── Catalogue des fichiers (idem archive.js, garde simple sans factoriser pour
  //     isoler le dashboard et eviter une dependance partagee fragile) ────────────
  var ZONES = [
    { id: 'sahel',        label: 'Sahel',         files: [
      '2026-jan-01-15.geojson','2026-jan-16-31.geojson','2026-fev-01-14.geojson','2026-fev-15-28.geojson',
      '2026-mars-01-15.geojson','2026-mars-16-31.geojson','2026-avr-01-15.geojson',
      'ethnies.geojson','evenements.geojson','fama-import.geojson','flux.geojson','forces.geojson',
      'heatmap-data.geojson','humint.geojson','infrastructures.geojson','mines.geojson',
      'points-eau.geojson','population.geojson','puits-mali.geojson'
    ]},
    { id: 'moyen-orient', label: 'Moyen-Orient',  files: [
      '2005-2006.geojson','2007-2008.geojson','2009-2010.geojson','2011-2012.geojson','2013-2014.geojson',
      '2015-2016.geojson','2017-2018.geojson','2019-2020.geojson','2021-2022.geojson','2023-2026.geojson'
    ]},
    { id: 'rdc',          label: 'Grands Lacs',   files: [
      '2026-jan-01-15.geojson','2026-jan-16-31.geojson','2026-fev-01-14.geojson','2026-fev-15-28.geojson',
      '2026-mars-01-15.geojson','2026-avr-01-15.geojson','humint.geojson'
    ]},
    { id: 'madagascar',   label: 'Madagascar',    files: [
      '2026-jan-01-15.geojson','2026-jan-16-31.geojson','2026-fev-01-14.geojson','2026-fev-15-28.geojson',
      '2026-mars-01-15.geojson','2026-mars-16-31.geojson','2026-avr-01-15.geojson','2026-avr-16-21.geojson',
      'ethnies.geojson','evenements.geojson','flux.geojson','forces.geojson','heatmap-data.geojson',
      'infrastructures.geojson','mines.geojson','parcs.geojson','points-eau.geojson','population.geojson','zones-maritimes.geojson'
    ]},
    { id: 'afrique',      label: 'Afrique Maritime', files: [
      'flux-maritimes.geojson','flux-noeuds.geojson','hubs-entrepots.geojson',
      'navale-chine.geojson','navale-france.geojson','navale-usa.geojson',
      'piraterie-guinee.geojson','piraterie-mozambique.geojson','piraterie-somalie.geojson',
      'ports-commerciaux.geojson','ports-militaires.geojson','ports-mineraliers.geojson',
      'ports-peche.geojson','ports-petroliers.geojson'
    ]},
    { id: 'asie-sud',     label: 'Asie du Sud',   files: [
      '2026-jan-01-15.geojson','2026-jan-16-31.geojson','2026-fev-01-14.geojson','2026-fev-15-28.geojson',
      '2026-mars-01-15.geojson','2026-mars-16-31.geojson','2026-avril-01-15.geojson','2026-avril-16-23.geojson',
      'ethnies.geojson','evenements.geojson','flux.geojson','forces.geojson',
      'infrastructures.geojson','mines.geojson','population.geojson'
    ]}
  ];

  var PAGE_SIZE = 60;

  // ─── Utils ────────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function stripHtml(s) {
    if (!s || typeof s !== 'string') return '';
    return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  }

  function highlight(text, terms) {
    if (!text) return '';
    var html = esc(text);
    terms.forEach(function(t) {
      if (!t) return;
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      html = html.replace(re, '<mark>$1</mark>');
    });
    return html;
  }

  function fileLabel(file) {
    return file.replace(/\.geojson$/i, '');
  }

  // Extrait une date depuis les proprietes ou la description (formats varies)
  function extractDate(props) {
    if (!props) return null;
    var fields = ['date','Date','DATE','_normDate'];
    for (var i = 0; i < fields.length; i++) {
      var v = props[fields[i]];
      if (v && typeof v === 'string' && v.length >= 4) return v;
    }
    // Cherche dans description
    var d = props.description || props.Description || '';
    if (typeof d === 'string') {
      var m = d.match(/[Dd]ate\s*:\s*([^\n<]+)/);
      if (m) return m[1].trim();
      m = d.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      if (m) return m[1];
      m = d.match(/\b(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{4})\b/);
      if (m) return m[1];
    }
    return null;
  }

  function blobFromProps(props) {
    if (!props) return '';
    var bits = [];
    for (var k in props) {
      var v = props[k];
      if (typeof v === 'string' && v.length) bits.push(v);
      else if (typeof v === 'number') bits.push(String(v));
    }
    return bits.join(' · ').toLowerCase();
  }

  // ─── State global ─────────────────────────────────────────────────────────────
  var index = [];          // [{ zone, file, name, type, pays, date, description, sources, blob }]
  var filtered = [];
  var visibleCount = PAGE_SIZE;
  var activeZones = new Set();  // empty = toutes
  var currentTerms = [];
  var loaded = 0;
  var totalFiles = ZONES.reduce(function(a, z) { return a + z.files.length; }, 0);

  var inputEl = document.getElementById('search-input');
  var clearEl = document.getElementById('search-clear');
  var statusEl = document.getElementById('search-status');
  var filterRowEl = document.getElementById('filter-row');
  var resultsEl = document.getElementById('results-container');
  var progressEl = document.getElementById('boot-progress');

  // ─── Boot : fetch tous les fichiers ───────────────────────────────────────────
  function boot() {
    statusEl.textContent = 'Chargement de l\'index 0 / ' + totalFiles + ' fichiers…';
    var promises = [];
    ZONES.forEach(function(zone) {
      zone.files.forEach(function(file) {
        var p = fetch('../' + zone.id + '/' + file + '?v=20260519a')
          .then(function(r) { return r.ok ? r.json() : null; })
          .then(function(data) {
            if (data && Array.isArray(data.features)) {
              data.features.forEach(function(f) {
                var props = (f && f.properties) || {};
                var cleanDesc = stripHtml(props.description || props.Description || '');
                var entry = {
                  zone: zone.id,
                  zoneLabel: zone.label,
                  file: file,
                  name: props.name || props.Name || props.title || '',
                  type: props.type || props.kind || props.category || '',
                  pays: props.pays || props.country || '',
                  ville: props.ville || props.city || '',
                  date: extractDate(props),
                  description: cleanDesc,
                  sources: props.sources || props.source || '',
                  geomType: f.geometry && f.geometry.type || '',
                  blob: ''
                };
                entry.blob = (
                  entry.name + ' ' + entry.type + ' ' + entry.pays + ' ' + entry.ville + ' ' +
                  entry.date + ' ' + cleanDesc + ' ' + entry.sources + ' ' +
                  entry.file + ' ' + entry.zone + ' ' + entry.zoneLabel + ' ' +
                  blobFromProps(props)
                ).toLowerCase();
                index.push(entry);
              });
            }
          })
          .catch(function() {})
          .then(function() {
            loaded++;
            progressEl.style.width = (loaded / totalFiles * 100) + '%';
            if (loaded % 8 === 0 || loaded === totalFiles) {
              statusEl.textContent = 'Chargement de l\'index ' + loaded + ' / ' + totalFiles + ' fichiers…';
            }
          });
        promises.push(p);
      });
    });

    Promise.all(promises).then(function() {
      progressEl.style.display = 'none';
      buildFilters();
      runSearch();
      statusEl.innerHTML = '<span class="hit">' + index.length.toLocaleString() + '</span> features indexees · ' + totalFiles + ' fichiers · 6 zones';
    });
  }

  // ─── Filtres pills par zone ───────────────────────────────────────────────────
  function buildFilters() {
    var counts = {};
    index.forEach(function(e) { counts[e.zone] = (counts[e.zone] || 0) + 1; });
    filterRowEl.innerHTML = '';
    ZONES.forEach(function(zone) {
      var btn = document.createElement('button');
      btn.className = 'filter-pill';
      btn.dataset.zone = zone.id;
      btn.innerHTML = esc(zone.label) + '<span class="ct">' + (counts[zone.id] || 0) + '</span>';
      btn.addEventListener('click', function() {
        if (activeZones.has(zone.id)) {
          activeZones.delete(zone.id);
          btn.classList.remove('active');
        } else {
          activeZones.add(zone.id);
          btn.classList.add('active');
        }
        runSearch();
      });
      filterRowEl.appendChild(btn);
    });
  }

  // ─── Recherche ────────────────────────────────────────────────────────────────
  function runSearch() {
    var q = (inputEl.value || '').trim().toLowerCase();
    currentTerms = q ? q.split(/\s+/).filter(Boolean) : [];

    filtered = index.filter(function(e) {
      if (activeZones.size && !activeZones.has(e.zone)) return false;
      if (!currentTerms.length) return true;
      for (var i = 0; i < currentTerms.length; i++) {
        if (e.blob.indexOf(currentTerms[i]) === -1) return false;
      }
      return true;
    });

    // Tri : matchs dans le name d'abord, puis dans le type, puis ailleurs
    if (currentTerms.length) {
      filtered.sort(function(a, b) {
        var aName = currentTerms.some(function(t) { return (a.name || '').toLowerCase().indexOf(t) !== -1; }) ? 0 : 1;
        var bName = currentTerms.some(function(t) { return (b.name || '').toLowerCase().indexOf(t) !== -1; }) ? 0 : 1;
        if (aName !== bName) return aName - bName;
        return 0;
      });
    }

    visibleCount = PAGE_SIZE;
    render();
  }

  function render() {
    if (!filtered.length) {
      var msg = currentTerms.length
        ? 'Aucune feature ne correspond a « ' + esc(currentTerms.join(' ')) + ' »'
        : 'Aucune donnee dans le filtre actif';
      resultsEl.innerHTML = '<div class="empty"><div class="big">∅</div>' + msg + '</div>';
      return;
    }

    var slice = filtered.slice(0, visibleCount);
    var html = '<div class="search-status" style="margin-bottom:8px;"><span class="hit">' +
      filtered.length.toLocaleString() + '</span> resultat' + (filtered.length > 1 ? 's' : '') +
      (currentTerms.length ? ' pour « ' + esc(currentTerms.join(' ')) + ' »' : '') +
      (activeZones.size ? ' · ' + activeZones.size + ' zone(s)' : '') +
      '</div>';
    html += '<div class="results-grid">';
    slice.forEach(function(e, i) {
      html += renderCard(e, i);
    });
    html += '</div>';
    if (filtered.length > visibleCount) {
      html += '<button class="load-more" id="load-more">Charger ' + Math.min(PAGE_SIZE, filtered.length - visibleCount) + ' resultats supplementaires (' + visibleCount + ' / ' + filtered.length + ')</button>';
    }
    resultsEl.innerHTML = html;
    var lm = document.getElementById('load-more');
    if (lm) lm.addEventListener('click', function() { visibleCount += PAGE_SIZE; render(); });

    // Toggle desc expansion
    resultsEl.querySelectorAll('.res-desc-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var d = btn.previousElementSibling;
        if (!d) return;
        var open = d.classList.toggle('expanded');
        btn.textContent = open ? 'Reduire' : 'Voir plus';
      });
    });
  }

  function renderCard(e, i) {
    var nameHtml = e.name ? highlight(e.name, currentTerms) : '<span style="color:var(--tx3)">(sans nom)</span>';
    var typeHtml = e.type ? highlight(e.type, currentTerms) : '';
    var descHtml = e.description ? highlight(e.description, currentTerms) : '';
    var needsToggle = e.description && e.description.length > 280;
    var metaBits = [];
    if (e.pays)  metaBits.push('<span><span class="k">Pays</span><span class="v">' + highlight(e.pays, currentTerms) + '</span></span>');
    if (e.ville) metaBits.push('<span><span class="k">Ville</span><span class="v">' + highlight(e.ville, currentTerms) + '</span></span>');
    if (e.sources) metaBits.push('<span><span class="k">Sources</span><span class="v">' + highlight(typeof e.sources === 'string' ? e.sources : JSON.stringify(e.sources), currentTerms) + '</span></span>');
    if (e.geomType) metaBits.push('<span><span class="k">Geom</span><span class="v">' + esc(e.geomType) + '</span></span>');

    return '<div class="res-card">' +
      '<div class="res-head">' +
        '<span class="res-zone">' + esc(e.zoneLabel) + '</span>' +
        '<span class="res-file">' + esc(fileLabel(e.file)) + '</span>' +
        (e.date ? '<span class="res-date">' + esc(e.date) + '</span>' : '') +
      '</div>' +
      '<div class="res-name">' + nameHtml + '</div>' +
      (typeHtml ? '<div class="res-type">' + typeHtml + '</div>' : '') +
      (descHtml ? '<div class="res-desc' + (needsToggle ? '' : ' expanded') + '">' + descHtml + '</div>' : '') +
      (needsToggle ? '<button class="res-desc-toggle">Voir plus</button>' : '') +
      (metaBits.length ? '<div class="res-meta-row">' + metaBits.join('') + '</div>' : '') +
    '</div>';
  }

  // ─── Events ────────────────────────────────────────────────────────────────────
  var searchTimer = null;
  inputEl.addEventListener('input', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 80);
  });
  clearEl.addEventListener('click', function() {
    inputEl.value = '';
    activeZones.clear();
    filterRowEl.querySelectorAll('.filter-pill').forEach(function(b) { b.classList.remove('active'); });
    runSearch();
    inputEl.focus();
  });

  // ─── Lance ────────────────────────────────────────────────────────────────────
  boot();
})();
