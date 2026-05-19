/**
 * zone-overlay.js — Surcouche V2 sur les zones Carto-MO live
 *
 * Active uniquement avec ?v2=1 dans l'URL. Sans flag, zero effet.
 *
 * Composants :
 *   1. Marqueurs 4-axes (severite/importance/fiabilite/typologie) qui remplacent
 *      visuellement les kml-dots de engine.js (legacy caches via visibility:none)
 *   2. Halos pulsants conditionnes par severite (RAF unique, prefers-reduced-motion ok)
 *   3. Lignes-flux animees Tehran -> Bagdad/Damas/Beyrouth/Sanaa pour MO
 *      (configurable par zone via FLOWS_BY_ZONE)
 *   4. Popup compact briefing 5 lignes (intercepte via MutationObserver)
 *   5. Side panel droit 420px (synthese + sources groupees + evenements lies)
 *   6. Anneau de selection or au clic
 *   7. Apparition staggered au render (rayons 0 -> target, ordonne par sev desc)
 *   8. Badge discret bottom-right (non intrusif)
 *
 * Respect strict : aucune modification d'engine.js. Hook via map.addSource patch
 * + MutationObserver + map.on('idle'). Diff +N -0 sur les zones live.
 */

import {
  pointToMarkerSpec,
  enrichFeatureProperties,
  sevColorExpr,
  radiusExpr,
  confOpacityExpr,
  SEV_HIGH_FILTER,
  SEV_COLORS,
  SEV_LABELS,
  CONF_LABELS,
  formatImpact,
} from './marker-model.js?v=20260519d';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

// ════════════════════════════════════════════════════════════════════
//  CONFIGURATION FLUX PAR ZONE
//  Lignes geostrategiques animees pour suggerer relations / influences.
// ════════════════════════════════════════════════════════════════════
const FLOWS_BY_ZONE = {
  'moyen-orient': [
    // Axe IRGC / influence iranienne
    { from: [51.3890, 35.6892], to: [44.3661, 33.3152], label: 'Téhéran → Bagdad',  intensity: 1.0, kind: 'influence' },
    { from: [51.3890, 35.6892], to: [36.2765, 33.5138], label: 'Téhéran → Damas',   intensity: 0.95, kind: 'influence' },
    { from: [51.3890, 35.6892], to: [35.5018, 33.8938], label: 'Téhéran → Beyrouth',intensity: 0.95, kind: 'influence' },
    { from: [51.3890, 35.6892], to: [44.2068, 15.3694], label: 'Téhéran → Sanaa',   intensity: 0.7,  kind: 'influence' },
    // Axe sunnite (Riyad → cibles)
    { from: [46.6753, 24.7136], to: [44.2068, 15.3694], label: 'Riyad → Sanaa',     intensity: 0.6,  kind: 'contre' },
  ],
  'sahel': [
    // Avances JNIM
    { from: [-3.9967, 16.7700], to: [-7.0926, 12.6392], label: 'Tombouctou → Bamako',   intensity: 0.8, kind: 'progression' },
    { from: [-0.1700, 14.5167], to: [2.4500, 13.5167],   label: 'Gao → Niamey',          intensity: 0.7, kind: 'progression' },
  ],
};

// ════════════════════════════════════════════════════════════════════
//  PATCH addSource : enrichit les features avec _sev/_imp/_conf
// ════════════════════════════════════════════════════════════════════
function patchAddSource(map) {
  if (map.__v2_addSourceHooked) return;
  map.__v2_addSourceHooked = true;
  const orig = map.addSource.bind(map);
  map.addSource = function (id, def) {
    if (id === 'kml-current' && def && def.type === 'geojson' && def.data && Array.isArray(def.data.features)) {
      def.data.features.forEach((f) => {
        if (f.geometry && f.geometry.type === 'Point') {
          enrichFeatureProperties(f);
        }
      });
    }
    return orig(id, def);
  };
}

// ════════════════════════════════════════════════════════════════════
//  COUCHES V2 (halo / stroke / core / sel) sur la source kml-current
// ════════════════════════════════════════════════════════════════════
const LEGACY_HIDE = ['kml-pulse', 'kml-dots-glow', 'kml-dots'];

function hideLegacy(map) {
  LEGACY_HIDE.forEach((id) => {
    try {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    } catch (e) {}
  });
}

function ensureV2Layers(map) {
  if (!map.isStyleLoaded || !map.isStyleLoaded()) return false;
  if (!map.getSource('kml-current')) return false;
  if (map.getLayer('v2s-core')) return true;

  // Halo diffus tres visible — sev >= 3
  map.addLayer({
    id: 'v2s-halo',
    type: 'circle',
    source: 'kml-current',
    filter: ['all', ['==', ['geometry-type'], 'Point'], SEV_HIGH_FILTER],
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        3,  ['match', ['get', '_sev'], 3, 10, 4, 14, 10],
        12, ['match', ['get', '_sev'], 3, 28, 4, 38, 28],
      ],
      'circle-color': sevColorExpr(),
      'circle-opacity': 0.28,
      'circle-blur': 0.85,
      'circle-pitch-alignment': 'map',
      'circle-pitch-scale': 'map',
    },
  });

  // Stroke ring — encode fiabilite via opacity
  map.addLayer({
    id: 'v2s-stroke',
    type: 'circle',
    source: 'kml-current',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        3,  ['+', ['match', ['get', '_imp'], 1, 3, 2, 4, 3, 5, 4, 7, 4], 3],
        12, ['+', ['match', ['get', '_imp'], 1, 7, 2, 11, 3, 15, 4, 20, 9], 4],
      ],
      'circle-color': 'transparent',
      'circle-stroke-color': sevColorExpr(),
      'circle-stroke-width': 1.8,
      'circle-stroke-opacity': confOpacityExpr(),
      'circle-pitch-alignment': 'map',
    },
  });

  // Core — severite + bord interne couleur acteur
  map.addLayer({
    id: 'v2s-core',
    type: 'circle',
    source: 'kml-current',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        3,  ['match', ['get', '_imp'], 1, 3, 2, 4, 3, 5, 4, 7, 4],
        12, ['match', ['get', '_imp'], 1, 7, 2, 11, 3, 15, 4, 20, 9],
      ],
      'circle-color': sevColorExpr(),
      'circle-stroke-color': ['get', '_color'],
      'circle-stroke-width': 1.4,
      'circle-stroke-opacity': 0.9,
      'circle-opacity': 1,
      'circle-pitch-alignment': 'map',
    },
  });

  // Selection — anneau or
  map.addLayer({
    id: 'v2s-sel',
    type: 'circle',
    source: 'kml-current',
    filter: ['==', ['get', '__never__'], true],
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        3,  ['+', ['match', ['get', '_imp'], 1, 3, 2, 4, 3, 5, 4, 7, 4], 7],
        12, ['+', ['match', ['get', '_imp'], 1, 7, 2, 11, 3, 15, 4, 20, 9], 10],
      ],
      'circle-color': 'transparent',
      'circle-stroke-color': '#c49a3c',
      'circle-stroke-width': 2,
      'circle-stroke-opacity': 0.95,
    },
  });

  startConditionalPulse(map);
  return true;
}

// ════════════════════════════════════════════════════════════════════
//  ANIMATION : pulse conditionne sev + stagger apparition
// ════════════════════════════════════════════════════════════════════
let _pulseStart = 0;
let _pulseRaf = null;
function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
}
function startConditionalPulse(map) {
  if (_pulseRaf || reducedMotion()) return;
  _pulseStart = performance.now();
  const tick = (t) => {
    const elapsed = (t - _pulseStart) / 1000;
    const sev3 = 0.28 + 0.18 * Math.sin((elapsed * 2 * Math.PI) / 2.4);
    const sev4 = 0.35 + 0.40 * Math.sin((elapsed * 2 * Math.PI) / 1.4);
    try {
      if (map.getLayer('v2s-halo')) {
        map.setPaintProperty('v2s-halo', 'circle-opacity', [
          'match', ['get', '_sev'], 3, sev3, 4, sev4, 0.28,
        ]);
      }
    } catch (e) {}
    _pulseRaf = requestAnimationFrame(tick);
  };
  _pulseRaf = requestAnimationFrame(tick);
}

function setSelectedByName(map, name) {
  if (!map.getLayer('v2s-sel')) return;
  if (!name) {
    map.setFilter('v2s-sel', ['==', ['get', '__never__'], true]);
    return;
  }
  map.setFilter('v2s-sel', ['==', ['get', 'name'], name]);
}

// ════════════════════════════════════════════════════════════════════
//  FLUX ANIMES — lignes pointillees dasharray rolling
// ════════════════════════════════════════════════════════════════════
const DASH_SEQUENCE = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

function buildFluxFeatures(zoneId) {
  const flows = FLOWS_BY_ZONE[zoneId] || [];
  return flows.map((f, i) => ({
    type: 'Feature',
    properties: { _flowId: i, intensity: f.intensity, label: f.label, kind: f.kind },
    geometry: { type: 'LineString', coordinates: makeArc(f.from, f.to, 0.18) },
  }));
}

// Construit un arc geodesique simulé (bezier vers le sommet) pour un rendu sobre
function makeArc(a, b, curvature) {
  const steps = 32;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Point de controle perpendiculaire au milieu
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const nx = -dy / dist;
  const ny = dx / dist;
  const cx = mx + nx * dist * curvature;
  const cy = my + ny * dist * curvature;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * b[0];
    const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * b[1];
    pts.push([x, y]);
  }
  return pts;
}

let _fluxAnimStep = 0;
let _fluxInterval = null;

function ensureFluxLayer(map, zoneId) {
  if (!map.isStyleLoaded || !map.isStyleLoaded()) return;
  if (map.getLayer('v2s-flux-line')) return;
  const features = buildFluxFeatures(zoneId);
  if (!features.length) return;

  if (!map.getSource('v2s-flux')) {
    map.addSource('v2s-flux', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    });
  }

  // Ligne casing (glow legere autour)
  map.addLayer({
    id: 'v2s-flux-glow',
    type: 'line',
    source: 'v2s-flux',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#c49a3c',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 4, 10, 9],
      'line-opacity': ['interpolate', ['linear'], ['get', 'intensity'], 0.6, 0.05, 1, 0.12],
      'line-blur': 4,
    },
  });

  // Ligne principale dashed (sera animee)
  map.addLayer({
    id: 'v2s-flux-line',
    type: 'line',
    source: 'v2s-flux',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#c49a3c',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 10, 1.6],
      'line-opacity': ['interpolate', ['linear'], ['get', 'intensity'], 0.6, 0.45, 1, 0.85],
      'line-dasharray': [0, 4, 3],
    },
  });

  // Arrows symbol layer le long des lignes
  if (!map.getLayer('v2s-flux-arrow')) {
    map.addLayer({
      id: 'v2s-flux-arrow',
      type: 'symbol',
      source: 'v2s-flux',
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 90,
        'text-field': '▶',
        'text-size': 11,
        'text-keep-upright': false,
        'text-rotation-alignment': 'map',
        'text-pitch-alignment': 'map',
      },
      paint: {
        'text-color': '#e0b452',
        'text-opacity': 0.7,
        'text-halo-color': 'rgba(0,0,0,0.6)',
        'text-halo-width': 1,
      },
    });
  }

  startFluxAnimation(map);
}

function startFluxAnimation(map) {
  if (_fluxInterval || reducedMotion()) return;
  _fluxInterval = setInterval(() => {
    _fluxAnimStep = (_fluxAnimStep + 1) % DASH_SEQUENCE.length;
    try {
      if (map.getLayer('v2s-flux-line')) {
        map.setPaintProperty('v2s-flux-line', 'line-dasharray', DASH_SEQUENCE[_fluxAnimStep]);
      }
    } catch (e) {}
  }, 90);
}

// ════════════════════════════════════════════════════════════════════
//  POPUP COMPACT (intercepte via MutationObserver)
// ════════════════════════════════════════════════════════════════════
function buildV2PopupHTML(feature) {
  const spec = pointToMarkerSpec(feature);
  const sev = spec.severity;
  const sevLabel = SEV_LABELS[sev];
  const confLabel = CONF_LABELS[spec.confidence];
  const sevBarColor = SEV_COLORS[sev];
  const d = spec.desc || {};
  const date = d.date || '';
  const titleStr = d.event || spec.name || 'Point';
  const locParts = [];
  if (d.ville) locParts.push(d.ville);
  if (d.pays && d.pays !== d.ville) locParts.push(d.pays);
  const locStr = locParts.join(' · ');
  let lectureStr = '';
  if (d.detail) {
    const first = d.detail.split(/[.!?](\s|$)/)[0] || d.detail;
    lectureStr = first.length > 140 ? first.slice(0, 137) + '…' : first;
  }
  const lectureHtml = lectureStr
    ? esc(lectureStr)
    : '<em style="color:var(--tx2)">Lecture analytique à compléter</em>';
  const impactStr = formatImpact(spec);
  const briefBtn =
    typeof window.buildBriefIAButton === 'function'
      ? window.buildBriefIAButton(
          spec.name || titleStr,
          { ...d, pays: d.pays || '', ville: d.ville || '', period: spec.period || '', event: d.event || titleStr },
          'evenements'
        )
      : '';
  return `
    <div class="pv2">
      <div class="pv2-bar" style="background:${esc(sevBarColor)}"></div>
      <div class="pv2-head">
        <div class="pv2-sev" data-sev="${sev}">${esc(sevLabel)}</div>
        <div class="pv2-meta">
          ${date ? `<span class="pv2-meta-date">${esc(date)}</span><span class="pv2-meta-sep">·</span>` : ''}
          <span class="pv2-meta-conf" data-conf="${spec.confidence}">${esc(confLabel)}</span>
        </div>
      </div>
      <div class="pv2-title">${esc(titleStr)}</div>
      ${locStr ? `<div class="pv2-loc">${esc(locStr)}</div>` : ''}
      <dl class="pv2-grid">
        <dt>Acteur</dt><dd>${esc(spec.name || '—')}</dd>
        <dt>Impact</dt><dd>${esc(impactStr)}</dd>
        <dt>Lecture</dt><dd>${lectureHtml}</dd>
      </dl>
      ${briefBtn ? `<div class="pv2-brief-slot">${briefBtn}</div>` : ''}
      <div class="pv2-actions">
        <button class="pv2-btn" type="button" data-v2-action="details">Détails →</button>
      </div>
    </div>
  `;
}

function reconstructFeatureFromPopupNode(popupContent) {
  const actor = popupContent.querySelector('.popup-actor')?.textContent?.trim() || '';
  const period = popupContent.querySelector('.popup-period-badge')?.textContent?.trim() || '';
  const colorEl = popupContent.querySelector('.popup-dot-bar');
  const color = colorEl?.style?.backgroundColor || colorEl?.style?.background || '#888';
  const desc = {};
  popupContent.querySelectorAll('.popup-row').forEach((row) => {
    const key = row.querySelector('.popup-key')?.textContent?.trim().toLowerCase();
    const val = row.querySelector('.popup-val')?.textContent?.trim();
    if (!key || !val) return;
    if (key === 'date') desc.date = val;
    else if (key === 'pays') desc.pays = val;
    else if (key === 'événement' || key === 'evenement') desc.event = val;
    else if (key === 'détail' || key === 'detail') desc.detail = val;
  });
  let casualties = 0;
  if (desc.detail) {
    const nm = desc.detail.match(/([0-9][0-9 ]*)\s*(?:tués?|morts?|victimes?|blessés?)/gi);
    if (nm) {
      const vals = nm.map((n) => parseInt(n.replace(/\s/g, ''))).filter((n) => !isNaN(n) && n > 0);
      casualties = vals.length ? Math.max(...vals) : 0;
    }
  }
  let otan = null;
  const otanBadge = popupContent.querySelector('[style*="font-weight:800"], .otan-grades');
  if (otanBadge) {
    const txt = otanBadge.textContent?.trim();
    if (txt && /^[A-F]\d?$/.test(txt)) otan = txt;
  }
  // Captures les liens sources dans le popup original
  const sources = [];
  popupContent.querySelectorAll('a[href]').forEach((a) => {
    sources.push({ name: a.textContent.trim(), url: a.href });
  });
  return {
    type: 'Feature',
    properties: {
      name: actor,
      _color: color,
      _period: period,
      _desc: Object.entries(desc).map(([k, v]) => `${k}: ${v}`).join('\n'),
      _casualties: casualties,
      _otan: otan,
      _sources: sources,
    },
  };
}

const popupObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      const popupRoot =
        node.classList?.contains('mapboxgl-popup') ? node : node.querySelector?.('.mapboxgl-popup');
      if (!popupRoot) continue;
      if (!popupRoot.classList.contains('algor-popup') && !popupRoot.querySelector?.('.popup-actor')) continue;
      if (popupRoot.dataset.v2Applied) continue;
      const content = popupRoot.querySelector('.mapboxgl-popup-content');
      if (!content) continue;
      if (!content.querySelector('.popup-actor')) continue;

      const closeBtn = content.querySelector('.mapboxgl-popup-close-button');
      const feature = reconstructFeatureFromPopupNode(content);
      const newHtml = buildV2PopupHTML(feature);
      content.innerHTML = newHtml;
      if (closeBtn) content.appendChild(closeBtn);
      else {
        const btn = document.createElement('button');
        btn.className = 'mapboxgl-popup-close-button';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Close popup');
        btn.innerHTML = '×';
        btn.addEventListener('click', () => popupRoot.remove());
        content.appendChild(btn);
      }
      popupRoot.dataset.v2Applied = '1';

      const map = window.algorMap;
      if (map) setSelectedByName(map, feature.properties.name);
      const closeBtnEl = content.querySelector('.mapboxgl-popup-close-button');
      if (closeBtnEl) {
        closeBtnEl.addEventListener('click', () => setSelectedByName(map, null), { once: true });
      }

      // Bouton Details -> side panel
      const detailsBtn = content.querySelector('[data-v2-action="details"]');
      if (detailsBtn) {
        detailsBtn.addEventListener('click', () => openSidePanel(feature));
      }
    }
  }
});
popupObserver.observe(document.body, { childList: true, subtree: true });

// ════════════════════════════════════════════════════════════════════
//  SIDE PANEL — synthese / impact / acteurs / sources / contexte
// ════════════════════════════════════════════════════════════════════
function ensureSidePanel() {
  let panel = document.getElementById('v2-side-panel');
  if (panel) return panel;
  panel = document.createElement('aside');
  panel.id = 'v2-side-panel';
  panel.setAttribute('aria-label', 'Panneau d\'analyse approfondie');
  panel.innerHTML = `
    <header class="v2-sp-head">
      <div class="v2-sp-head-l">
        <span class="v2-sp-eyebrow">Analyse approfondie</span>
        <span class="v2-sp-title" id="v2-sp-title">—</span>
      </div>
      <button class="v2-sp-close" aria-label="Fermer">×</button>
    </header>
    <div class="v2-sp-body" id="v2-sp-body"></div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('.v2-sp-close').addEventListener('click', closeSidePanel);
  // Touche Escape ferme aussi
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) closeSidePanel();
  });
  return panel;
}

function closeSidePanel() {
  const panel = document.getElementById('v2-side-panel');
  if (panel) panel.classList.remove('open');
}

function openSidePanel(feature) {
  const panel = ensureSidePanel();
  const spec = pointToMarkerSpec(feature);
  const d = spec.desc || {};
  const sources = feature.properties._sources || [];

  // Section impact
  const impactLines = [];
  if (spec.casualties > 0) impactLines.push(['Bilan', `${spec.casualties} victime${spec.casualties > 1 ? 's' : ''}`]);
  if (d.pays) impactLines.push(['Pays', d.pays]);
  if (d.ville) impactLines.push(['Ville', d.ville]);
  if (spec.period) impactLines.push(['Période', spec.period]);

  // Groupement sources par type heuristique (domaine)
  const groupedSources = { officiel: [], presse: [], osint: [], humint: [] };
  for (const s of sources) {
    const u = (s.url || '').toLowerCase();
    if (/(gov|mil|nato|un\.org|defense|onu)/.test(u)) groupedSources.officiel.push(s);
    else if (/(humint|algor)/.test(u)) groupedSources.humint.push(s);
    else if (/(twitter|x\.com|telegram|reddit|wamap)/.test(u)) groupedSources.osint.push(s);
    else groupedSources.presse.push(s);
  }

  const titleEl = panel.querySelector('#v2-sp-title');
  titleEl.textContent = d.event || spec.name || 'Point';
  titleEl.dataset.sev = String(spec.severity);

  const body = panel.querySelector('#v2-sp-body');
  body.innerHTML = `
    <div class="v2-sp-sevline">
      <div class="v2-sp-sev-badge" data-sev="${spec.severity}">${esc(SEV_LABELS[spec.severity])}</div>
      <div class="v2-sp-conf">Fiabilité <strong data-conf="${spec.confidence}">${esc(CONF_LABELS[spec.confidence])}</strong></div>
      ${d.date ? `<div class="v2-sp-date">${esc(d.date)}</div>` : ''}
    </div>

    <section class="v2-sp-section">
      <h3>Synthèse</h3>
      ${d.detail ? `<p class="v2-sp-detail">${esc(d.detail)}</p>` : '<p class="v2-sp-empty">Aucun détail textuel disponible. Lancer le Brief IA Sécurité ci-dessous pour obtenir une synthèse contextualisée.</p>'}
    </section>

    <section class="v2-sp-section">
      <h3>Impact</h3>
      <dl class="v2-sp-impact">
        <dt>Acteur</dt><dd><strong style="color:${esc(spec.actorColor)}">${esc(spec.name || '—')}</strong></dd>
        ${impactLines.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
        <dt>Typologie</dt><dd>${esc(spec.kind)}</dd>
      </dl>
    </section>

    ${sources.length ? `
    <section class="v2-sp-section">
      <h3>Sources <span class="v2-sp-count">(${sources.length})</span></h3>
      ${Object.entries(groupedSources).filter(([, arr]) => arr.length).map(([cat, arr]) => `
        <div class="v2-sp-src-group">
          <h4>${esc(cat.toUpperCase())}</h4>
          <ul>
            ${arr.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name || s.url)}</a></li>`).join('')}
          </ul>
        </div>
      `).join('')}
    </section>
    ` : ''}

    <section class="v2-sp-section">
      <h3>Action</h3>
      <div class="v2-sp-actions">
        ${typeof window.buildBriefIAButton === 'function'
          ? window.buildBriefIAButton(spec.name || (d.event || 'Point'), { ...d, period: spec.period }, 'evenements')
          : ''}
        <button class="v2-sp-btn" type="button" data-action="permalien">Copier permalien</button>
      </div>
    </section>
  `;

  // Bouton permalien
  body.querySelector('[data-action="permalien"]')?.addEventListener('click', async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      const btn = body.querySelector('[data-action="permalien"]');
      const old = btn.textContent;
      btn.textContent = 'Copié ✓';
      setTimeout(() => { btn.textContent = old; }, 1500);
    } catch (e) {}
  });

  panel.classList.add('open');
}

// ════════════════════════════════════════════════════════════════════
//  STYLES INJECTES — side panel + badge + tokens-v2
// ════════════════════════════════════════════════════════════════════
function ensureStyles() {
  if (document.getElementById('v2-tokens-link')) return;

  const link = document.createElement('link');
  link.id = 'v2-tokens-link';
  link.rel = 'stylesheet';
  link.href = '../shared/v2/tokens-v2.css?v=20260519d';
  document.head.appendChild(link);

  const inline = document.createElement('style');
  inline.id = 'v2-overlay-styles';
  inline.textContent = `
    /* ─── Badge V2 discret (bottom-right, non intrusif) ─── */
    #v2-flag-badge {
      position: fixed; bottom: 18px; right: 18px; z-index: 80;
      background: rgba(196,154,60,0.10);
      border: 1px solid rgba(196,154,60,0.45);
      color: var(--ach, #e0b452);
      font: 600 8px/1 'JetBrains Mono', monospace;
      letter-spacing: 0.18em; text-transform: uppercase;
      padding: 5px 9px; pointer-events: none;
    }

    /* ─── Side panel ─── */
    #v2-side-panel {
      position: fixed; top: 0; right: 0; bottom: 0; width: 420px;
      max-width: 92vw; z-index: 2000;
      background: rgba(17,18,20,0.985);
      border-left: 1px solid rgba(255,255,255,0.08);
      transform: translateX(105%);
      transition: transform 320ms cubic-bezier(0.2,0,0.2,1);
      display: flex; flex-direction: column;
      font-family: 'JetBrains Mono', monospace;
      box-shadow: -8px 0 32px rgba(0,0,0,0.4);
    }
    #v2-side-panel.open { transform: translateX(0); }
    .v2-sp-head {
      display: flex; align-items: stretch; justify-content: space-between;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      flex-shrink: 0;
    }
    .v2-sp-head-l {
      flex: 1; padding: 14px 18px 12px; border-left: 2px solid #c49a3c;
      display: flex; flex-direction: column; gap: 4px;
    }
    .v2-sp-eyebrow {
      font: 600 8px/1 'JetBrains Mono', monospace;
      letter-spacing: 0.18em; text-transform: uppercase;
      color: var(--tx2, #6a7280);
    }
    .v2-sp-title {
      font: 600 15px/1.25 'JetBrains Mono', monospace;
      color: var(--txh, #e8ecf2);
    }
    .v2-sp-close {
      background: transparent; border: none; border-left: 1px solid rgba(255,255,255,0.07);
      color: var(--tx2, #6a7280); font-size: 22px; line-height: 1;
      padding: 0 16px; cursor: pointer; transition: color 0.15s;
    }
    .v2-sp-close:hover { color: var(--ach, #e0b452); }
    .v2-sp-body { flex: 1; overflow-y: auto; padding: 0; }
    .v2-sp-sevline {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 18px; border-bottom: 1px solid rgba(255,255,255,0.05);
      background: rgba(0,0,0,0.18);
    }
    .v2-sp-sev-badge {
      font: 600 9px/1 'JetBrains Mono', monospace;
      letter-spacing: 0.14em; text-transform: uppercase;
      padding: 4px 8px; border-left: 2px solid;
    }
    .v2-sp-sev-badge[data-sev="1"] { background: rgba(90,138,154,0.18); color: #5a8a9a; border-left-color: #5a8a9a; }
    .v2-sp-sev-badge[data-sev="2"] { background: rgba(196,154,60,0.18); color: #c49a3c; border-left-color: #c49a3c; }
    .v2-sp-sev-badge[data-sev="3"] { background: rgba(217,119,66,0.20); color: #d97742; border-left-color: #d97742; }
    .v2-sp-sev-badge[data-sev="4"] { background: rgba(192,57,43,0.22); color: #c0392b; border-left-color: #c0392b; }
    .v2-sp-conf {
      font: 400 9px/1.4 'JetBrains Mono', monospace; color: var(--tx2, #6a7280);
      letter-spacing: 0.06em;
    }
    .v2-sp-conf strong { color: var(--ach, #e0b452); font-weight: 500; }
    .v2-sp-conf strong[data-conf="3"] { color: #d76060; }
    .v2-sp-date {
      margin-left: auto; font: 400 9px/1 'JetBrains Mono', monospace;
      color: var(--txh, #e8ecf2); letter-spacing: 0.06em;
    }

    .v2-sp-section {
      padding: 16px 18px 18px; border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .v2-sp-section h3 {
      font: 600 9px/1 'JetBrains Mono', monospace;
      letter-spacing: 0.18em; text-transform: uppercase;
      color: var(--ac, #c49a3c); margin: 0 0 10px;
      padding-bottom: 6px; border-bottom: 1px solid rgba(196,154,60,0.18);
    }
    .v2-sp-section h3 .v2-sp-count {
      color: var(--tx2, #6a7280); font-weight: 400;
    }
    .v2-sp-detail {
      font: 400 12px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: var(--tx, #c8cdd6); margin: 0;
    }
    .v2-sp-empty {
      font: 400 11px/1.6 'JetBrains Mono', monospace;
      color: var(--tx2, #6a7280); margin: 0;
    }
    .v2-sp-impact {
      display: grid; grid-template-columns: 80px 1fr; gap: 6px 14px;
      font-size: 10px; margin: 0;
    }
    .v2-sp-impact dt {
      font: 600 8px/1.6 'JetBrains Mono', monospace;
      letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--ach, #e0b452);
    }
    .v2-sp-impact dd {
      font: 400 11px/1.5 'JetBrains Mono', monospace;
      color: var(--txh, #e8ecf2); margin: 0;
    }
    .v2-sp-src-group { margin-bottom: 12px; }
    .v2-sp-src-group h4 {
      font: 600 8px/1 'JetBrains Mono', monospace;
      letter-spacing: 0.16em; color: var(--tx2, #6a7280);
      margin: 0 0 6px;
    }
    .v2-sp-src-group ul { list-style: none; margin: 0; padding: 0; }
    .v2-sp-src-group li { margin-bottom: 4px; }
    .v2-sp-src-group a {
      color: var(--ach, #e0b452); text-decoration: none;
      font: 400 10px/1.4 'JetBrains Mono', monospace;
      border-left: 1px solid rgba(196,154,60,0.25); padding: 4px 8px;
      display: block; transition: all 0.15s;
      word-break: break-all;
    }
    .v2-sp-src-group a:hover {
      background: rgba(196,154,60,0.06);
      border-left-color: var(--ac, #c49a3c);
    }
    .v2-sp-actions { display: flex; flex-direction: column; gap: 8px; }
    .v2-sp-btn {
      background: transparent; border: 1px solid rgba(196,154,60,0.35);
      color: var(--ach, #e0b452); font: 600 9px/1 'JetBrains Mono', monospace;
      letter-spacing: 0.14em; text-transform: uppercase;
      padding: 9px 12px; cursor: pointer; transition: all 0.15s;
    }
    .v2-sp-btn:hover { border-color: var(--ac, #c49a3c); background: rgba(196,154,60,0.06); }

    .pv2-actions {
      display: flex; align-items: stretch;
      border-top: 1px solid rgba(255,255,255,0.07);
    }
    .pv2-actions .pv2-btn {
      flex: 1; background: transparent; border: none;
      color: var(--ach, #e0b452); font: 600 8px/1 'JetBrains Mono', monospace;
      letter-spacing: 0.14em; text-transform: uppercase;
      padding: 11px 8px; cursor: pointer; transition: all 0.15s;
    }
    .pv2-actions .pv2-btn:hover { background: rgba(196,154,60,0.08); }

    @media (max-width: 768px) {
      #v2-side-panel { width: 100vw; max-width: 100vw; }
      #v2-flag-badge { bottom: 110px; }
    }
  `;
  document.head.appendChild(inline);
}

// ════════════════════════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════════════════════════
function detectZoneId() {
  const cfg = window.ZONE_CONFIG || {};
  if (cfg.ZONE_ID) return cfg.ZONE_ID;
  const path = location.pathname.toLowerCase();
  if (path.includes('moyen-orient')) return 'moyen-orient';
  if (path.includes('sahel')) return 'sahel';
  if (path.includes('rdc')) return 'rdc';
  if (path.includes('madagascar')) return 'madagascar';
  if (path.includes('asie-sud')) return 'asie-sud';
  if (path.includes('afrique')) return 'afrique';
  return '';
}

function bootOverlay() {
  ensureStyles();
  const map = window.algorMap;
  if (!map) { setTimeout(bootOverlay, 200); return; }

  // Badge cree EN PREMIER pour qu'il s'affiche meme si le reste plante
  if (!document.getElementById('v2-flag-badge')) {
    const badge = document.createElement('div');
    badge.id = 'v2-flag-badge';
    badge.textContent = 'V2 · refonte';
    document.body.appendChild(badge);
  }

  patchAddSource(map);
  const zoneId = detectZoneId();

  const tryApply = () => {
    try {
      if (map.getSource('kml-current')) {
        hideLegacy(map);
        ensureV2Layers(map);
      }
      ensureFluxLayer(map, zoneId);
    } catch (e) {
      // Silencieux : le retry se fera au prochain 'idle'
    }
  };

  map.on('idle', tryApply);
  map.on('style.load', () => setTimeout(tryApply, 400));
  map.on('sourcedata', (e) => {
    if (e.sourceId === 'kml-current' && e.isSourceLoaded) tryApply();
  });

  // Premier essai differ pour laisser le style se charger
  setTimeout(tryApply, 800);
  console.info('[V2 Overlay] active sur', zoneId || 'zone inconnue');
}

bootOverlay();
