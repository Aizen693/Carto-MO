/**
 * sahel-overlay.js — Surcouche V2 appliquee sur la zone Sahel live
 *
 * Active SEULEMENT si l'URL contient ?v2=1. Sinon zero effet.
 *
 * Strategie sans-modification-d-engine :
 *   1. Hook map.addSource pour enrichir les features avec _sev/_imp/_conf/_kind
 *      au moment ou engine.js ajoute la source 'kml-current'.
 *   2. Apres chaque renderAll d'engine.js (detecte via map.on('idle')), on :
 *        a. Cache les couches kml-pulse / kml-dots-glow / kml-dots
 *        b. Ajoute les couches V2 (halo / stroke / core / sel) sur la meme source
 *   3. MutationObserver intercepte la creation des .algor-popup et remplace
 *      le HTML par la version compacte V2.
 *   4. Compatible avec exporter.js : on n'altere pas la source data, juste les paint.
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
} from './marker-model.js?v=20260519c';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

// ── Patch addSource : enrichit les features de 'kml-current' ─────────
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

// ── Ajout des couches V2 par-dessus ──────────────────────────────────
const LEGACY_HIDE = ['kml-pulse', 'kml-dots-glow', 'kml-dots'];

function hideLegacy(map) {
  LEGACY_HIDE.forEach((id) => {
    try {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    } catch (e) {}
  });
}

function ensureV2Layers(map) {
  if (!map.getSource('kml-current')) return false;
  if (map.getLayer('v2s-core')) return true; // deja en place

  // Halo (sev >= 3 uniquement, anime)
  map.addLayer({
    id: 'v2s-halo',
    type: 'circle',
    source: 'kml-current',
    filter: ['all', ['==', ['geometry-type'], 'Point'], SEV_HIGH_FILTER],
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        3, ['match', ['get', '_sev'], 3, 6, 4, 9, 6],
        12, ['match', ['get', '_sev'], 3, 18, 4, 26, 18],
      ],
      'circle-color': sevColorExpr(),
      'circle-opacity': 0.22,
      'circle-blur': 0.7,
      'circle-pitch-alignment': 'map',
      'circle-pitch-scale': 'map',
    },
  });

  // Stroke = fiabilite
  map.addLayer({
    id: 'v2s-stroke',
    type: 'circle',
    source: 'kml-current',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        3,  ['+', ['match', ['get', '_imp'], 1, 2.5, 2, 3.5, 3, 4.5, 4, 6, 3.5], 2.5],
        12, ['+', ['match', ['get', '_imp'], 1, 6,   2, 9,   3, 13,  4, 18, 8], 3.5],
      ],
      'circle-color': 'transparent',
      'circle-stroke-color': sevColorExpr(),
      'circle-stroke-width': 1.5,
      'circle-stroke-opacity': confOpacityExpr(),
      'circle-pitch-alignment': 'map',
    },
  });

  // Core = severite + bordure interne couleur acteur
  map.addLayer({
    id: 'v2s-core',
    type: 'circle',
    source: 'kml-current',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': radiusExpr(),
      'circle-color': sevColorExpr(),
      'circle-stroke-color': ['get', '_color'],
      'circle-stroke-width': 1.2,
      'circle-stroke-opacity': 0.85,
      'circle-opacity': 1,
      'circle-pitch-alignment': 'map',
    },
  });

  // Selection (vide par defaut)
  map.addLayer({
    id: 'v2s-sel',
    type: 'circle',
    source: 'kml-current',
    filter: ['==', ['get', '__never__'], true],
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        3,  ['+', ['match', ['get', '_imp'], 1, 2.5, 2, 3.5, 3, 4.5, 4, 6, 3.5], 6],
        12, ['+', ['match', ['get', '_imp'], 1, 6,   2, 9,   3, 13,  4, 18, 8], 9],
      ],
      'circle-color': 'transparent',
      'circle-stroke-color': '#c49a3c',
      'circle-stroke-width': 1.6,
      'circle-stroke-opacity': 0.9,
    },
  });

  startConditionalPulse(map);
  return true;
}

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
    const sev3 = 0.22 + 0.15 * Math.sin((elapsed * 2 * Math.PI) / 2.4);
    const sev4 = 0.28 + 0.32 * Math.sin((elapsed * 2 * Math.PI) / 1.4);
    try {
      if (map.getLayer('v2s-halo')) {
        map.setPaintProperty('v2s-halo', 'circle-opacity', [
          'match', ['get', '_sev'], 3, sev3, 4, sev4, 0.22,
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

// ── Popup V2 (intercepte les popups algor-popup deja crees) ──────────
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

  // Lecture : extrait 140 chars de detail
  let lectureStr = '';
  if (d.detail) {
    const first = d.detail.split(/[.!?](\s|$)/)[0] || d.detail;
    lectureStr = first.length > 140 ? first.slice(0, 137) + '…' : first;
  }
  const lectureHtml = lectureStr
    ? esc(lectureStr)
    : '<em style="color:var(--tx2)">Lecture analytique à compléter</em>';

  const impactStr = formatImpact(spec);

  // Slot Brief IA
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
    </div>
  `;
}

// Reconstruction d'un feature depuis une popup deja rendue par engine.js
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

  // Casualties depuis detail
  let casualties = 0;
  if (desc.detail) {
    const nm = desc.detail.match(/([0-9][0-9 ]*)\s*(?:tués?|morts?|victimes?|blessés?)/gi);
    if (nm) {
      const vals = nm
        .map((n) => parseInt(n.replace(/\s/g, '')))
        .filter((n) => !isNaN(n) && n > 0);
      casualties = vals.length ? Math.max(...vals) : 0;
    }
  }

  // OTAN : recupere le badge si present
  let otan = null;
  const otanBadge = popupContent.querySelector('[style*="font-weight:800"], .otan-grades');
  if (otanBadge) {
    const txt = otanBadge.textContent?.trim();
    if (txt && /^[A-F]\d?$/.test(txt)) otan = txt;
  }

  return {
    type: 'Feature',
    properties: {
      name: actor,
      _color: color,
      _period: period,
      _desc: Object.entries(desc).map(([k, v]) => `${k}: ${v}`).join('\n'),
      _casualties: casualties,
      _otan: otan,
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
      // On cible TOUS les popups algor-popup (classe presente dans engine.js)
      if (!popupRoot.classList.contains('algor-popup') && !popupRoot.querySelector?.('.popup-actor')) continue;
      if (popupRoot.dataset.v2Applied) continue;
      const content = popupRoot.querySelector('.mapboxgl-popup-content');
      if (!content) continue;
      // Si la popup n'a pas la structure .popup-actor, on laisse tomber
      if (!content.querySelector('.popup-actor')) continue;

      // Conservation du bouton close existant
      const closeBtn = content.querySelector('.mapboxgl-popup-close-button');
      const feature = reconstructFeatureFromPopupNode(content);
      const newHtml = buildV2PopupHTML(feature);
      content.innerHTML = newHtml;
      if (closeBtn) {
        // Re-attacher le bouton close
        content.appendChild(closeBtn);
      } else {
        // Bouton close fallback
        const btn = document.createElement('button');
        btn.className = 'mapboxgl-popup-close-button';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Close popup');
        btn.innerHTML = '×';
        btn.addEventListener('click', () => popupRoot.remove());
        content.appendChild(btn);
      }
      popupRoot.dataset.v2Applied = '1';

      // Selection visuelle sur le marqueur correspondant
      const map = window.algorMap;
      if (map) setSelectedByName(map, feature.properties.name);
      // Au close du popup, on retire la selection
      const closeBtnEl = content.querySelector('.mapboxgl-popup-close-button');
      if (closeBtnEl) {
        closeBtnEl.addEventListener('click', () => setSelectedByName(map, null), { once: true });
      }
    }
  }
});
popupObserver.observe(document.body, { childList: true, subtree: true });

// ── Boot : attend window.algorMap et hooke ───────────────────────────
function bootOverlay() {
  const map = window.algorMap;
  if (!map) { setTimeout(bootOverlay, 200); return; }

  patchAddSource(map);

  const tryApply = () => {
    if (map.getSource('kml-current')) {
      hideLegacy(map);
      ensureV2Layers(map);
    }
  };

  map.on('idle', tryApply);
  map.on('style.load', () => setTimeout(tryApply, 400));
  map.on('sourcedata', (e) => {
    if (e.sourceId === 'kml-current' && e.isSourceLoaded) tryApply();
  });

  tryApply();
  console.info('[V2 Overlay] active sur Sahel');

  // Badge visuel discret pour indiquer qu'on est en V2
  const badge = document.createElement('div');
  badge.id = 'v2-flag-badge';
  badge.textContent = 'V2 ACTIF';
  badge.style.cssText = `
    position:fixed; top:8px; left:50%; transform:translateX(-50%); z-index:9999;
    background:rgba(196,154,60,0.12); border:1px solid var(--ac,#c49a3c);
    color:var(--ach,#e0b452); font:600 8px/1 'JetBrains Mono',monospace;
    letter-spacing:0.18em; text-transform:uppercase; padding:4px 10px;
    pointer-events:none;
  `;
  document.body.appendChild(badge);
}

bootOverlay();

// CSS du popup V2 : charge tokens-v2.css si pas deja la
function ensureTokensCSS() {
  const id = 'v2-tokens-link';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = '../shared/v2/tokens-v2.css?v=20260519c';
  document.head.appendChild(link);
}
ensureTokensCSS();
