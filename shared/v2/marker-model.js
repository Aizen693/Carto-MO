/**
 * marker-model.js — Modele 4-axes du marqueur (V2 refonte 2026-05)
 *
 * Fonctions pures. Pas de DOM, pas de globals.
 *
 * Axes encodes :
 *   kind        : typologie (incident_arme / acteur / infrastructure / alerte)
 *   severity    : 1..4 (low → critical)
 *   importance  : 1..4 (palier de taille du marqueur)
 *   confidence  : 1..3 (confirmed / plausible / rumor)
 */

// ── Constantes publiques ──────────────────────────────────────────────
export const SEV_COLORS = {
  1: '#5a8a9a',
  2: '#c49a3c',
  3: '#d97742',
  4: '#c0392b',
};

export const SEV_LABELS = {
  1: 'LOW',
  2: 'MODÉRÉ',
  3: 'ÉLEVÉ',
  4: 'CRITIQUE',
};

export const CONF_LABELS = {
  1: 'CONFIRMÉ',
  2: 'PLAUSIBLE',
  3: 'NON-VÉRIFIÉ',
};

export const CONF_OPACITY = {
  1: 1.0,
  2: 0.6,
  3: 0.3,
};

// Mapping OTAN A-F → confidence 1-3
const OTAN_TO_CONF = { A: 1, B: 1, C: 2, D: 2, E: 3, F: 3 };

// ── Parsing description (mirror engine.js parseDesc) ─────────────────
function parseDesc(raw) {
  if (!raw) return null;
  const r = {};
  String(raw).split('\n').forEach((l) => {
    const m = l.match(/^([^:]+):\s*(.+)$/);
    if (!m) return;
    const k = m[1].trim().toLowerCase();
    const v = m[2].trim();
    if (k === 'date') r.date = v;
    else if (k === 'pays') r.pays = v;
    else if (k === 'ville') r.ville = v;
    else if (k === 'evenement' || k === 'événement') r.event = v;
    else if (k === 'détail' || k === 'detail') r.detail = v;
  });
  return Object.keys(r).length ? r : { raw: String(raw) };
}

// ── Derivations ───────────────────────────────────────────────────────
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function deriveSeverity(props, desc) {
  if (props._severity != null) return clamp(Number(props._severity), 1, 4);
  const c = Number(props._casualties || 0);
  if (c >= 50) return 4;
  if (c >= 10) return 3;
  if (c >= 1)  return 2;
  // Mots-cles non-cinetiques eleves
  const text = String(desc?.event || desc?.detail || props.name || '').toLowerCase();
  if (/coup\s*d.?état|putsch|évacuation|sanctions/.test(text)) return 3;
  return 1;
}

function deriveImportance(props, desc, severity) {
  if (props._importance != null) return clamp(Number(props._importance), 1, 4);
  // Fallback : importance correle a la severite mais avec un palier de plus pour casualties extremes
  const c = Number(props._casualties || 0);
  if (c >= 500) return 4;
  if (c >= 100) return 3;
  if (c >= 1)   return 2;
  return Math.max(1, severity - 1);
}

function deriveConfidence(props, desc) {
  if (props._confidence != null) return clamp(Number(props._confidence), 1, 3);
  // Si cotation OTAN dispo (passee via props._otan)
  const otan = props._otan;
  if (otan && typeof otan === 'string' && otan.length) {
    const letter = otan[0].toUpperCase();
    if (OTAN_TO_CONF[letter]) return OTAN_TO_CONF[letter];
  }
  return 2; // plausible par defaut
}

function deriveKind(props, desc) {
  if (props._kind) return String(props._kind);
  const text = String(desc?.event || props.name || '').toLowerCase();
  if (/infra|poste|pipeline|aéroport|aeroport|port |usine/.test(text)) return 'infrastructure';
  if (/alerte|warning|évacuation/.test(text)) return 'alerte';
  // Par defaut on considere un incident
  return 'incident';
}

// ── API publique : pointToMarkerSpec ──────────────────────────────────
export function pointToMarkerSpec(feature) {
  const p = (feature && feature.properties) || {};
  const desc = p._desc && p._desc !== 'null' ? parseDesc(p._desc) : (p.desc || null);
  const severity = deriveSeverity(p, desc);
  const importance = deriveImportance(p, desc, severity);
  const confidence = deriveConfidence(p, desc);
  const kind = deriveKind(p, desc);

  return {
    kind,
    severity,
    importance,
    confidence,
    actorColor: p._color || '#888888',
    name: p.name || '',
    period: p._period || '',
    casualties: Number(p._casualties || 0),
    desc: desc || {},
    raw: p,
  };
}

// Enrichit un feature avec les champs derives, pour usage Mapbox expressions
export function enrichFeatureProperties(feature) {
  const spec = pointToMarkerSpec(feature);
  feature.properties = feature.properties || {};
  feature.properties._sev = spec.severity;
  feature.properties._imp = spec.importance;
  feature.properties._conf = spec.confidence;
  feature.properties._kind = spec.kind;
  return feature;
}

// ── Mapbox paint expressions ──────────────────────────────────────────
// Couleur par severite — utilise _sev injecte par enrichFeatureProperties
export function sevColorExpr() {
  return [
    'match', ['get', '_sev'],
    1, SEV_COLORS[1],
    2, SEV_COLORS[2],
    3, SEV_COLORS[3],
    4, SEV_COLORS[4],
    SEV_COLORS[2],
  ];
}

// Rayon par importance + zoom (4 paliers)
export function radiusExpr() {
  return [
    'interpolate', ['linear'], ['zoom'],
    3,  ['match', ['get', '_imp'], 1, 2.5, 2, 3.5, 3, 4.5, 4, 6, 3.5],
    7,  ['match', ['get', '_imp'], 1, 4,   2, 6,   3, 8,   4, 11, 5],
    12, ['match', ['get', '_imp'], 1, 6,   2, 9,   3, 13,  4, 18, 8],
  ];
}

// Opacite stroke par confidence
export function confOpacityExpr() {
  return [
    'match', ['get', '_conf'],
    1, CONF_OPACITY[1],
    2, CONF_OPACITY[2],
    3, CONF_OPACITY[3],
    CONF_OPACITY[2],
  ];
}

// Filtre : ne pulse que sev >= 3
export const SEV_HIGH_FILTER = ['>=', ['get', '_sev'], 3];

// Formatage impact pour popup
export function formatImpact(spec) {
  if (spec.casualties >= 1) {
    const k = Math.floor(spec.casualties);
    return `${k} victime${k > 1 ? 's' : ''} signalée${k > 1 ? 's' : ''}`;
  }
  if (spec.kind === 'infrastructure') return 'Cible matérielle';
  if (spec.kind === 'alerte')         return 'Aucun bilan humain';
  return 'Non chiffré';
}
