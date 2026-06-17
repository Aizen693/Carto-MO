#!/usr/bin/env node
/**
 * build-humint-manifest.mjs — Générateur one-off du manifeste pays HUMINT.
 *
 * Scanne les fichiers humint.geojson de chaque théâtre, normalise les 4
 * dimensions (pays / date / événement / acteur) et produit carte/countries.json :
 * la liste des pays disponibles avec, pour chacun, sa zone source, son centre,
 * son zoom, et les listes distinctes d'événements canoniques, d'acteurs et de
 * mois présents dans la donnée.
 *
 * Les helpers normalizePays / canonEvent DOIVENT rester identiques à ceux de
 * shared/humint-engine.js (même normalisation au build et au runtime).
 *
 *   node scripts/build-humint-manifest.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Sources HUMINT par théâtre.
const SOURCES = [
  { zone: 'sahel', file: 'sahel/humint.geojson' },
  { zone: 'rdc',   file: 'rdc/humint.geojson' },
];

/* ── Normalisation pays (identique runtime) ── */
const PAYS_TYPOS = {
  'bukrina faso': 'Burkina Faso',
  'burkina faso': 'Burkina Faso',
  'mali-mauritanie': 'Mali',
  'rdc': 'RDC',
  'israel': 'Israël',
  'benin': 'Bénin',
};
function normalizePays(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // Coupe la ville : "Niger - Niamey" / "RDC -Uvira" / "Burkina Faso -Bogandé"
  s = s.split(/\s*-\s*/)[0];
  // Retire un parenthétique régional : "Pakistan (KP)"
  s = s.replace(/\s*\(.*?\)\s*/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const key = s.toLowerCase();
  if (PAYS_TYPOS[key]) return PAYS_TYPOS[key];
  // Multi-pays ("Frontière Bénin, Nigéria...") → on ignore (trop ambigu).
  if (/[,/]/.test(s) || /fronti/i.test(s)) return null;
  return s;
}

/* ── Canonicalisation événement (identique runtime) ── */
function canonEvent(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  const low = s.toLowerCase();
  if (/\bied\b|mine|explosif/.test(low)) return 'IED / Explosif';
  if (/frappe|dr[ôo]ne/.test(low)) return 'Frappe aérienne / Drône';
  if (/assassinat/.test(low)) return 'Assassinat';
  if (/embuscade/.test(low)) return 'Embuscade';
  if (/enl[èe]vement|kidnapp/.test(low)) return 'Enlèvement';
  if (/attaque/.test(low)) return 'Attaque';
  if (/combat/.test(low)) return 'Combat';
  if (/menace/.test(low)) return 'Menaces';
  if (/op[ée]ration/.test(low)) return 'Opération';
  if (/arrestation/.test(low)) return 'Arrestation';
  if (/regroupement|pr[ée]sence/.test(low)) return 'Présence / Regroupement';
  if (/divers|information/.test(low)) return 'Divers';
  // Première lettre majuscule par défaut.
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ── Normalisation acteur (identique runtime) ── */
function normalizeActor(raw) {
  if (!raw) return null;
  let s = String(raw).trim().replace(/\s+/g, ' ');
  // Unifie l'espacement autour des séparateurs : "EI - S" → "EI-S", "FAMA / AK" → "FAMA/AK"
  s = s.replace(/\s*-\s*/g, '-').replace(/\s*\/\s*/g, '/');
  return s || null;
}

/* ── Parse description (fallback RDC, calqué sur engine.parseDesc) ── */
function parseDesc(desc) {
  const out = {};
  if (!desc) return out;
  String(desc).split(/\n/).forEach((line) => {
    const m = line.match(/^\s*([^:]+?)\s*:\s*(.+)$/);
    if (!m) return;
    const k = m[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const v = m[2].trim();
    if (k.startsWith('date')) out.date = v;
    else if (k.startsWith('pays')) out.pays = v;
    else if (k.startsWith('even')) out.type = v;
  });
  return out;
}

/* ── Date → ISO + clé mois ── */
const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
function toISO(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Déjà ISO : 2026-01-02
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD/MM/YYYY
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  return null;
}
function monthKey(iso) { return iso ? iso.slice(0, 7) : null; }
function monthLabel(key) {
  if (!key) return null;
  const [y, mo] = key.split('-');
  return `${MOIS_FR[parseInt(mo, 10) - 1]} ${y}`;
}

/* ── Normalise une feature HUMINT vers la forme unifiée ── */
function normFeature(f) {
  const p = f.properties || {};
  const coords = (f.geometry && f.geometry.coordinates) || null;
  let pays = p.pays, date = p.date, type = p.type, acteur = p.name;
  if (!pays || !date || !type) {
    const parsed = parseDesc(p.description);
    pays = pays || parsed.pays;
    date = date || parsed.date;
    type = type || parsed.type;
  }
  return {
    pays: normalizePays(pays),
    iso: toISO(date),
    type: canonEvent(type),
    acteur: normalizeActor(acteur),
    coords,
  };
}

/* ── Centre/zoom par défaut connus (sinon centroïde calculé) ── */
const KNOWN = {
  'Mali':         { center: [-3.5, 17.6], zoom: 5.2 },
  'Niger':        { center: [8.1, 17.6], zoom: 5.0 },
  'Burkina Faso': { center: [-1.6, 12.3], zoom: 5.8 },
  'Bénin':        { center: [2.3, 9.5], zoom: 6.2 },
  'Nigeria':      { center: [8.1, 9.6], zoom: 5.4 },
  'RDC':          { center: [27.5, -2.5], zoom: 6.3 },
};

// Pays réellement couverts : écarte les villes mal saisies dans le champ pays
// (« Segbana », « Kerou »… sont des localités béninoises, pas des pays).
const VALID_COUNTRIES = new Set(['Mali', 'Niger', 'Burkina Faso', 'Bénin', 'Nigeria', 'RDC', 'Togo']);

const countries = {};
const dropped = new Set();
for (const src of SOURCES) {
  const path = join(ROOT, src.file);
  if (!existsSync(path)) { console.warn('SKIP (absent):', src.file); continue; }
  const gj = JSON.parse(readFileSync(path, 'utf8'));
  for (const f of (gj.features || [])) {
    const n = normFeature(f);
    if (!n.pays || !n.coords) continue;
    if (!VALID_COUNTRIES.has(n.pays)) { dropped.add(n.pays); continue; }
    const c = countries[n.pays] || (countries[n.pays] = {
      name: n.pays, zone: src.zone, file: '/' + src.file,
      events: new Set(), actors: new Set(), months: new Set(),
      _sumLng: 0, _sumLat: 0, _count: 0,
    });
    if (n.type) c.events.add(n.type);
    if (n.acteur) c.actors.add(n.acteur);
    const mk = monthKey(n.iso);
    if (mk) c.months.add(mk);
    c._sumLng += n.coords[0]; c._sumLat += n.coords[1]; c._count++;
  }
}

const list = Object.values(countries).map((c) => {
  const known = KNOWN[c.name];
  const center = known ? known.center : [c._sumLng / c._count, c._sumLat / c._count];
  const zoom = known ? known.zoom : 5.5;
  const months = [...c.months].sort();
  return {
    name: c.name,
    zone: c.zone,
    file: c.file,
    center,
    zoom,
    count: c._count,
    events: [...c.events].sort((a, b) => a.localeCompare(b, 'fr')),
    actors: [...c.actors].sort((a, b) => a.localeCompare(b, 'fr')),
    months: months.map((k) => ({ key: k, label: monthLabel(k) })),
  };
}).sort((a, b) => b.count - a.count);

const out = { generated: 'build-humint-manifest', countries: list };
writeFileSync(join(ROOT, 'carte/countries.json'), JSON.stringify(out, null, 2));
console.log('OK → carte/countries.json');
list.forEach((c) => console.log(`  ${c.name.padEnd(14)} ${String(c.count).padStart(4)} pts · ${c.events.length} évts · ${c.actors.length} acteurs · ${c.months.length} mois`));
if (dropped.size) console.log('Écartés (non-pays):', [...dropped].join(', '));
