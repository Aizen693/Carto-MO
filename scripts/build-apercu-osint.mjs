#!/usr/bin/env node
/**
 * build-apercu-osint.mjs — Aperçu public des cartes OSINT pour les visiteurs sans compte.
 *
 * Décision du 20/10/2026 : sans compte, on voit la démo ET un échantillon des cartes OSINT
 * (Moyen-Orient, Asie du Sud, Madagascar). Le compte gratuit ouvre la totalité, le premium
 * ajoute Sahel et RDC (remontées terrain, jamais dans cet aperçu).
 *
 * Échantillon = environ un événement sur trois, PAR PAYS (chaque pays garde au moins un
 * point), choisi par empreinte stable du point : régénérer l'aperçu ne rebat pas les cartes,
 * un visiteur ne reconstitue donc pas la base en rechargeant la page.
 *
 * Les fiches restent complètes (type, date, lieu, texte) ; on retire seulement ce que la
 * carte n'affiche jamais : sources, cotation interne, notes de vérification.
 *
 *   node scripts/build-apercu-osint.mjs [dossier des reference-2026.geojson]
 *
 * Entrée par défaut : <racine>/{moyen-orient,asie-sud,madagascar}/reference-2026.geojson
 * (copies locales, exclues de git). Sortie : carte/apercu/<theatre>.geojson (public).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = process.argv[2] || ROOT;
const OUT_DIR = join(ROOT, 'carte', 'apercu');
const THEATRES = ['moyen-orient', 'asie-sud', 'madagascar'];
const PART = 3; // un sur trois

// Seuls champs publiés : ceux que lit shared/humint-engine.js (normFeature).
const CHAMPS = ['name', 'type', 'date', 'pays', 'description', 'statut', 'theatre', 'added'];

function empreinte(f) {
  const p = f.properties || {};
  const c = (f.geometry && f.geometry.coordinates) || [];
  return createHash('sha256').update([p.date, p.pays, p.type, p.name, c[0], c[1]].join('|')).digest('hex');
}
const paysDe = (f) => String((f.properties || {}).pays || '').split(' - ')[0].trim();

mkdirSync(OUT_DIR, { recursive: true });
for (const t of THEATRES) {
  const gj = JSON.parse(readFileSync(join(SRC_DIR, t, 'reference-2026.geojson'), 'utf8'));
  const parPays = new Map();
  for (const f of gj.features || []) {
    const k = paysDe(f);
    if (!parPays.has(k)) parPays.set(k, []);
    parPays.get(k).push(f);
  }
  const garde = [];
  for (const fs of parPays.values()) {
    const tries = fs.map((f) => [empreinte(f), f]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    tries.slice(0, Math.ceil(fs.length / PART)).forEach(([, f]) => garde.push(f));
  }
  garde.sort((a, b) => String(a.properties.date).localeCompare(String(b.properties.date)));
  const out = {
    type: 'FeatureCollection',
    apercu: { part: `1/${PART}`, total: gj.features.length, publie: garde.length },
    features: garde.map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: Object.fromEntries(CHAMPS.filter((k) => f.properties[k] != null).map((k) => [k, f.properties[k]])),
    })),
  };
  writeFileSync(join(OUT_DIR, `${t}.geojson`), JSON.stringify(out));
  console.log(`${t}: ${garde.length} / ${gj.features.length} points publiés dans l'aperçu`);
}
