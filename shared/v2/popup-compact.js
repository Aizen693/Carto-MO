/**
 * popup-compact.js — Briefing 5 lignes pour decision rapide
 *
 * Remplacement de makePopupHTML() de engine.js pour la V2.
 * Conserve l'integration window.buildBriefIAButton (brief-ia.js existant).
 *
 * Structure :
 *   [bar sev] [SEV BADGE]              date · conf
 *             Titre evenement
 *             Lieu, pays
 *             ─────
 *             Acteur     ...
 *             Impact     ...
 *             Lecture    ...
 *             ─────
 *             [Brief IA]  (slot existant)
 *             [Detail] [Sources]
 */

import {
  pointToMarkerSpec,
  SEV_COLORS,
  SEV_LABELS,
  CONF_LABELS,
  formatImpact,
} from './marker-model.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

function formatDate(raw) {
  if (!raw) return '';
  // raw peut etre "12 mars 2024", "12/03/2024", "2024-03-12", etc.
  // On affiche tel quel, mais on uppercase si court.
  const s = String(raw).trim();
  if (s.length <= 14) return s.toUpperCase();
  return s;
}

function buildLocLine(spec) {
  const d = spec.desc || {};
  const parts = [];
  if (d.ville)                 parts.push(d.ville);
  if (d.pays && d.pays !== d.ville) parts.push(d.pays);
  return parts.join(' · ');
}

function buildLecture(spec) {
  const d = spec.desc || {};
  // 1) si _lecture est fourni explicitement, l'utiliser (data-driven)
  if (spec.raw._lecture) return String(spec.raw._lecture);
  // 2) extraire de detail (clamp 140 chars sur la premiere phrase)
  if (d.detail) {
    const first = d.detail.split(/[.!?](\s|$)/)[0];
    return first.length > 140 ? first.slice(0, 137) + '…' : first;
  }
  return '<em>Lecture analytique à compléter</em>';
}

/**
 * Construit le HTML du popup compact.
 * @param {object} feature - Feature GeoJSON (avec properties enrichies)
 * @param {object} opts    - { briefSector?: string, onDetail?: bool, onSources?: bool }
 */
export function makePopupCompactHTML(feature, opts = {}) {
  const spec = pointToMarkerSpec(feature);
  const sev = spec.severity;
  const sevLabel = SEV_LABELS[sev];
  const confLabel = CONF_LABELS[spec.confidence];
  const sevBarColor = SEV_COLORS[sev];

  const dateStr = formatDate(spec.desc.date);
  const locStr = buildLocLine(spec);
  const titleStr = spec.desc.event || spec.name || 'Point';
  const impactStr = formatImpact(spec);
  const lectureStr = buildLecture(spec);

  // Slot Brief IA (utilise l'API existante si chargee)
  const briefSector = opts.briefSector || 'evenements';
  const briefBtn =
    typeof window !== 'undefined' && typeof window.buildBriefIAButton === 'function'
      ? window.buildBriefIAButton(
          spec.name || titleStr,
          {
            ...spec.desc,
            pays: spec.desc.pays || '',
            ville: spec.desc.ville || '',
            period: spec.period || '',
            event: spec.desc.event || titleStr,
          },
          briefSector
        )
      : '';

  return `
    <div class="pv2">
      <div class="pv2-bar" style="background:${esc(sevBarColor)}"></div>
      <div class="pv2-head">
        <div class="pv2-sev" data-sev="${sev}">${esc(sevLabel)}</div>
        <div class="pv2-meta">
          ${dateStr ? `<span class="pv2-meta-date">${esc(dateStr)}</span>` : ''}
          ${dateStr ? `<span class="pv2-meta-sep">·</span>` : ''}
          <span class="pv2-meta-conf" data-conf="${spec.confidence}">${esc(confLabel)}</span>
        </div>
      </div>
      <div class="pv2-title">${esc(titleStr)}</div>
      ${locStr ? `<div class="pv2-loc">${esc(locStr)}</div>` : ''}
      <dl class="pv2-grid">
        <dt>Acteur</dt><dd>${esc(spec.name || '—')}</dd>
        <dt>Impact</dt><dd>${esc(impactStr)}</dd>
        <dt>Lecture</dt><dd>${lectureStr.startsWith('<em>') ? lectureStr : esc(lectureStr)}</dd>
      </dl>
      ${briefBtn ? `<div class="pv2-brief-slot">${briefBtn}</div>` : ''}
      <div class="pv2-actions">
        <button class="pv2-btn" type="button" data-action="details" data-name="${esc(spec.name)}">Détails</button>
        <button class="pv2-btn" type="button" data-action="sources" data-name="${esc(spec.name)}">Sources</button>
      </div>
    </div>
  `;
}

/**
 * Attache les handlers Details / Sources d'un popup deja monte.
 * @param {HTMLElement} popupEl - container du popup (ex: popup.getElement())
 * @param {object} feature      - feature GeoJSON
 * @param {object} handlers     - { onDetails?: fn(feature), onSources?: fn(feature) }
 */
export function bindPopupActions(popupEl, feature, handlers = {}) {
  if (!popupEl) return;
  const details = popupEl.querySelector('[data-action="details"]');
  const sources = popupEl.querySelector('[data-action="sources"]');
  if (details && handlers.onDetails) {
    details.addEventListener('click', () => handlers.onDetails(feature));
  }
  if (sources && handlers.onSources) {
    sources.addEventListener('click', () => handlers.onSources(feature));
  }
}
