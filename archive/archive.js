/**
 * archive.js — Listing des donnees GeoJSON de toutes les zones.
 * Affiche pour chaque zone la liste des fichiers, leur type, et le nombre
 * de features (fetch async). Aucune transformation : les fichiers sont
 * exposes tels qu'ils existent dans le repo, telechargeables.
 */
(function() {
  var ZONES = [
    {
      id: 'sahel',
      label: 'Sahel',
      sub: 'Mali · Burkina · Niger · Tchad · Mauritanie',
      files: [
        { f: '2026-jan-01-15.geojson',  cat: 'Periode' },
        { f: '2026-jan-16-31.geojson',  cat: 'Periode' },
        { f: '2026-fev-01-14.geojson',  cat: 'Periode' },
        { f: '2026-fev-15-28.geojson',  cat: 'Periode' },
        { f: '2026-mars-01-15.geojson', cat: 'Periode' },
        { f: '2026-mars-16-31.geojson', cat: 'Periode' },
        { f: '2026-avr-01-15.geojson',  cat: 'Periode' },
        { f: 'ethnies.geojson',         cat: 'Ethnies' },
        { f: 'evenements.geojson',      cat: 'Evenements' },
        { f: 'fama-import.geojson',     cat: 'FAMA' },
        { f: 'flux.geojson',            cat: 'Flux' },
        { f: 'forces.geojson',          cat: 'Forces' },
        { f: 'heatmap-data.geojson',    cat: 'Heatmap' },
        { f: 'humint.geojson',          cat: 'HUMINT' },
        { f: 'infrastructures.geojson', cat: 'Infra' },
        { f: 'mines.geojson',           cat: 'Mines' },
        { f: 'points-eau.geojson',      cat: 'Eau' },
        { f: 'population.geojson',      cat: 'Population' },
        { f: 'puits-mali.geojson',      cat: 'Puits' }
      ]
    },
    {
      id: 'moyen-orient',
      label: 'Moyen-Orient',
      sub: 'Iraq · Syrie · Liban · Yemen',
      files: [
        { f: '2005-2006.geojson', cat: 'Periode' },
        { f: '2007-2008.geojson', cat: 'Periode' },
        { f: '2009-2010.geojson', cat: 'Periode' },
        { f: '2011-2012.geojson', cat: 'Periode' },
        { f: '2013-2014.geojson', cat: 'Periode' },
        { f: '2015-2016.geojson', cat: 'Periode' },
        { f: '2017-2018.geojson', cat: 'Periode' },
        { f: '2019-2020.geojson', cat: 'Periode' },
        { f: '2021-2022.geojson', cat: 'Periode' },
        { f: '2023-2026.geojson', cat: 'Periode' }
      ]
    },
    {
      id: 'rdc',
      label: 'Grands Lacs / RDC',
      sub: 'RDC Est · Rwanda · Burundi · Ouganda · Tanzanie',
      files: [
        { f: '2026-jan-01-15.geojson',  cat: 'Periode' },
        { f: '2026-jan-16-31.geojson',  cat: 'Periode' },
        { f: '2026-fev-01-14.geojson',  cat: 'Periode' },
        { f: '2026-fev-15-28.geojson',  cat: 'Periode' },
        { f: '2026-mars-01-15.geojson', cat: 'Periode' },
        { f: '2026-avr-01-15.geojson',  cat: 'Periode' },
        { f: 'humint.geojson',          cat: 'HUMINT' }
      ]
    },
    {
      id: 'madagascar',
      label: 'Madagascar',
      sub: 'Grand Sud · SAVA · Analamanga · Canal Mozambique',
      files: [
        { f: '2026-jan-01-15.geojson',  cat: 'Periode' },
        { f: '2026-jan-16-31.geojson',  cat: 'Periode' },
        { f: '2026-fev-01-14.geojson',  cat: 'Periode' },
        { f: '2026-fev-15-28.geojson',  cat: 'Periode' },
        { f: '2026-mars-01-15.geojson', cat: 'Periode' },
        { f: '2026-mars-16-31.geojson', cat: 'Periode' },
        { f: '2026-avr-01-15.geojson',  cat: 'Periode' },
        { f: '2026-avr-16-21.geojson',  cat: 'Periode' },
        { f: 'ethnies.geojson',         cat: 'Ethnies' },
        { f: 'evenements.geojson',      cat: 'Evenements' },
        { f: 'flux.geojson',            cat: 'Flux' },
        { f: 'forces.geojson',          cat: 'Forces' },
        { f: 'heatmap-data.geojson',    cat: 'Heatmap' },
        { f: 'infrastructures.geojson', cat: 'Infra' },
        { f: 'mines.geojson',           cat: 'Mines' },
        { f: 'parcs.geojson',           cat: 'Parcs' },
        { f: 'points-eau.geojson',      cat: 'Eau' },
        { f: 'population.geojson',      cat: 'Population' },
        { f: 'zones-maritimes.geojson', cat: 'Maritime' }
      ]
    },
    {
      id: 'afrique',
      label: 'Afrique Maritime',
      sub: 'Ports · Flux · Piraterie · Bateaux temps reel',
      files: [
        { f: 'flux-maritimes.geojson',      cat: 'Flux' },
        { f: 'flux-noeuds.geojson',         cat: 'Flux' },
        { f: 'hubs-entrepots.geojson',      cat: 'Hubs' },
        { f: 'navale-chine.geojson',        cat: 'Navale' },
        { f: 'navale-france.geojson',       cat: 'Navale' },
        { f: 'navale-usa.geojson',          cat: 'Navale' },
        { f: 'piraterie-guinee.geojson',    cat: 'Piraterie' },
        { f: 'piraterie-mozambique.geojson', cat: 'Piraterie' },
        { f: 'piraterie-somalie.geojson',   cat: 'Piraterie' },
        { f: 'ports-commerciaux.geojson',   cat: 'Ports' },
        { f: 'ports-militaires.geojson',    cat: 'Ports' },
        { f: 'ports-mineraliers.geojson',   cat: 'Ports' },
        { f: 'ports-peche.geojson',         cat: 'Ports' },
        { f: 'ports-petroliers.geojson',    cat: 'Ports' },
        { f: 'ais-snapshot.json',           cat: 'AIS' }
      ]
    },
    {
      id: 'asie-sud',
      label: 'Asie du Sud',
      sub: 'Inde · Pakistan · Bangladesh · Afghanistan',
      files: [
        { f: '2026-jan-01-15.geojson',  cat: 'Periode' },
        { f: '2026-jan-16-31.geojson',  cat: 'Periode' },
        { f: '2026-fev-01-14.geojson',  cat: 'Periode' },
        { f: '2026-fev-15-28.geojson',  cat: 'Periode' },
        { f: '2026-mars-01-15.geojson', cat: 'Periode' },
        { f: '2026-mars-16-31.geojson', cat: 'Periode' },
        { f: '2026-avril-01-15.geojson', cat: 'Periode' },
        { f: '2026-avril-16-23.geojson', cat: 'Periode' },
        { f: 'ethnies.geojson',         cat: 'Ethnies' },
        { f: 'evenements.geojson',      cat: 'Evenements' },
        { f: 'flux.geojson',            cat: 'Flux' },
        { f: 'forces.geojson',          cat: 'Forces' },
        { f: 'infrastructures.geojson', cat: 'Infra' },
        { f: 'mines.geojson',           cat: 'Mines' },
        { f: 'population.geojson',      cat: 'Population' }
      ]
    }
  ];

  var esc = function(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var container = document.getElementById('zones-container');
  var totFilesEl = document.getElementById('tot-files');
  var totFeaturesEl = document.getElementById('tot-features');
  var totalFiles = 0;
  var totalFeatures = 0;

  ZONES.forEach(function(zone) {
    totalFiles += zone.files.length;

    var section = document.createElement('section');
    section.className = 'zone-section';
    section.id = 'zone-' + zone.id;

    var head = document.createElement('div');
    head.className = 'zone-head';
    head.innerHTML =
      '<div>' +
      '<div class="zh-title">' + esc(zone.label) + '</div>' +
      '<div style="font:500 11px/1 var(--mono);letter-spacing:0.10em;text-transform:uppercase;color:var(--tx2);margin-top:6px;">' + esc(zone.sub) + '</div>' +
      '</div>' +
      '<div class="zh-meta" id="zh-meta-' + esc(zone.id) + '">' + zone.files.length + ' fichiers</div>';
    section.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'file-grid';

    zone.files.forEach(function(item) {
      var href = '../' + zone.id + '/' + item.f;
      var card = document.createElement('div');
      card.className = 'file-card';
      card.innerHTML =
        '<div class="file-name">' + esc(item.f) + '</div>' +
        '<div class="file-meta">' +
        '<span class="badge">' + esc(item.cat) + '</span>' +
        '<span class="count" id="cnt-' + esc(zone.id + '-' + item.f) + '">…</span>' +
        '</div>' +
        '<div class="file-actions">' +
        '<a href="' + href + '" download>Telecharger</a>' +
        '<a href="' + href + '" target="_blank">Voir brut</a>' +
        '</div>';
      grid.appendChild(card);

      var cntId = 'cnt-' + zone.id + '-' + item.f;
      fetch(href + '?v=' + Date.now())
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
          var el = document.getElementById(cntId);
          if (!el) return;
          if (data && Array.isArray(data.features)) {
            el.textContent = data.features.length + ' features';
            totalFeatures += data.features.length;
            totFeaturesEl.textContent = totalFeatures.toLocaleString();
          } else if (data && Array.isArray(data.ships)) {
            el.textContent = data.ships.length + ' navires';
            totalFeatures += data.ships.length;
            totFeaturesEl.textContent = totalFeatures.toLocaleString();
          } else {
            el.textContent = 'JSON';
          }
        })
        .catch(function() {
          var el = document.getElementById(cntId);
          if (el) el.textContent = 'inaccessible';
        });
    });

    section.appendChild(grid);
    container.appendChild(section);
  });

  totFilesEl.textContent = totalFiles.toLocaleString();
})();
