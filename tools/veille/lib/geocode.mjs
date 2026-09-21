/* Geocodage hors-ligne par gazetteer local.
   Aucun appel a un service de geocodage : on cherche les toponymes du
   gazetteer dans le texte, plus long match d'abord, restreint a la zone.
   tools/veille/build-gazetteer.mjs regenere le fichier depuis GeoNames
   (donnees libres CC-BY, telechargement direct, sans cle). */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from './classify.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAZ_PATH = resolve(__dirname, '..', 'gazetteer.json');

let cache = null;

export function loadGazetteer(path = GAZ_PATH) {
  if (cache && cache.__path === path) return cache;
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const entries = [];
  for (const e of raw.places) {
    const names = [e.name, ...(e.alias || [])];
    for (const n of names) {
      const norm = normalize(n);
      if (norm.length < 3) continue; // evite les faux positifs sur 1-2 lettres
      entries.push({ norm, tokens: norm.split(' ').length, place: e });
    }
  }
  // Plus long toponyme en premier : "Gorom-Gorom" avant "Gorom".
  entries.sort((a, b) => b.norm.length - a.norm.length);
  cache = { __path: path, entries, meta: raw.meta || {} };
  return cache;
}

/* Renvoie { name, country, lon, lat, precision, source } ou null.
   Regle de selection : le premier toponyme cite l'emporte (c'est en general
   le lieu de l'evenement) ; a position egale, le plus long gagne, ce qui
   fait preferer "Gorom-Gorom" a "Gorom". */
export function geocode(text, zone, gaz = loadGazetteer()) {
  const norm = ` ${normalize(text)} `;
  const found = [];
  const seen = new Set();
  for (const e of gaz.entries) {
    if (zone && e.place.zone !== zone) continue;
    const at = norm.indexOf(` ${e.norm} `);
    if (at < 0) continue;
    if (seen.has(e.place.name)) continue;
    seen.add(e.place.name);
    found.push({ at, len: e.norm.length, place: e.place });
  }
  if (found.length === 0) return null;
  found.sort((a, b) => (a.at - b.at) || (b.len - a.len));
  const best = found[0].place;
  return {
    name: best.name,
    country: best.country,
    lon: best.lon,
    lat: best.lat,
    precision: best.precision || 'ville',
    source: best.src || 'seed',
    others: found.slice(1, 4).map(f => f.place.name)
  };
}
