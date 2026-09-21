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
const MAX_TOKENS = 5;

export function loadGazetteer(path = GAZ_PATH) {
  if (cache && cache.__path === path) return cache;
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const entries = [];
  // Index : "zone|toponyme normalise" -> lieu. Le premier inscrit gagne :
  // seed manuel, puis villes, puis regions, puis villages.
  const index = new Map();
  const sorted = [...raw.places].sort((a, b) => rank(a) - rank(b));
  for (const e of sorted) {
    const names = [e.name, ...(e.alias || [])];
    for (const n of names) {
      const norm = normalize(n);
      if (norm.length < 3) continue; // evite les faux positifs sur 1-2 lettres
      const tokens = norm.split(' ').length;
      if (tokens > MAX_TOKENS) continue;
      entries.push({ norm, tokens, place: e });
      const k = `${e.zone}|${norm}`;
      if (!index.has(k)) index.set(k, e);
    }
  }
  cache = { __path: path, entries, index, meta: raw.meta || {} };
  return cache;
}

/* Renvoie { name, country, lon, lat, precision, source } ou null.
   Regle de selection : le premier toponyme cite l'emporte (c'est en general
   le lieu de l'evenement) ; a position egale, le plus long gagne, ce qui
   fait preferer "Gorom-Gorom" a "Gorom".
   - Un lieu issu de GeoNames ne compte que s'il est ecrit avec une majuscule
     dans le texte d'origine (le seed manuel en est dispense).
   - Si le premier lieu est une region et qu'une localite plus precise est
     citee ensuite ("Kwilu : incendies a Bulungu"), la localite l'emporte.
   - Un nom porte par plusieurs villages eloignes (amb) est tranche par
     proximite avec les autres lieux cites ; a defaut, par une resolution
     deja faite sur un autre texte du meme passage ; sinon il est ignore
     plutot que place au hasard.
   - "la junte de Bamako", "les autorites de Kinshasa" : la capitale designe
     le pouvoir, pas le lieu de l'evenement, on ne la retient pas. */
export function geocode(text, zone, gaz = loadGazetteer()) {
  const words = tokenize(text);
  const found = [];
  const seen = new Set();
  for (let i = 0; i < words.length; i++) {
    for (let n = Math.min(MAX_TOKENS, words.length - i); n >= 1; n--) {
      const norm = words.slice(i, i + n).map(w => w.norm).join(' ');
      if (norm.length < 3) continue;
      const place = zone ? gaz.index.get(`${zone}|${norm}`) : findAnyZone(gaz, norm);
      if (!place) continue;
      if (place.src !== 'seed' && !/^\p{Lu}/u.test(words[i].raw)) continue;
      if (isMetonymy(words, i)) break;
      if (seen.has(place.name)) break;
      seen.add(place.name);
      found.push({ at: i, len: norm.length, place });
      break; // plus long match a cette position
    }
  }
  resolveHomonyms(found, gaz, zone);
  const kept = found.filter(f => f.place);
  if (kept.length === 0) return null;
  kept.sort((a, b) => (a.at - b.at) || (b.len - a.len));
  const precise = kept.find(f => f.place.precision !== 'region');
  const bestF = kept[0].place.precision === 'region' && precise ? precise : kept[0];
  const best = bestF.place;
  return {
    name: best.name,
    country: best.country,
    lon: best.lon,
    lat: best.lat,
    precision: best.precision || 'ville',
    source: best.src || 'seed',
    others: kept.filter(f => f !== bestF).slice(0, 3).map(f => f.place.name)
  };
}

/* Decoupe en mots en gardant la forme d'origine (pour tester la majuscule)
   et la forme normalisee (pour la recherche). */
function tokenize(text) {
  const out = [];
  for (const raw of String(text || '').split(/[\s’'`]+/)) {
    for (const part of normalize(raw).split(' ')) {
      if (!part) continue;
      const clean = raw.replace(/^[^\p{L}\p{N}]+/u, '');
      out.push({ raw: clean, norm: part });
    }
  }
  return out;
}

const AMB_RADIUS_KM = 150;

function resolveHomonyms(found, gaz, zone) {
  if (!gaz.resolved) gaz.resolved = new Map();
  const anchors = found.filter(f => !f.place.amb).map(f => f.place);
  for (const f of found) {
    if (!f.place.amb) continue;
    const key = `${zone}|${f.place.name}`;
    let best = null, bestD = Infinity;
    for (const [lat, lon, country] of f.place.amb) {
      for (const a of anchors) {
        const d = km({ lat, lon }, a);
        if (d < bestD) { bestD = d; best = { lat, lon, country }; }
      }
    }
    if (best && bestD <= AMB_RADIUS_KM) gaz.resolved.set(key, best);
    else best = gaz.resolved.get(key) || null;
    f.place = best ? { ...f.place, ...best, amb: undefined } : null;
  }
}

const POWER = new Set(['junte', 'autorites', 'autorite', 'pouvoir', 'regime', 'gouvernement', 'dirigeants', 'transition', 'presidence']);

function isMetonymy(words, i) {
  const w1 = words[i - 1]?.norm, w2 = words[i - 2]?.norm;
  return (w1 === 'de' || w1 === 'd') && POWER.has(w2);
}

function km(a, b) {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

function rank(p) {
  if (p.src === 'seed') return 0;
  if (p.precision === 'ville') return 1;
  if (p.precision === 'region') return 2;
  return 3;
}

function findAnyZone(gaz, norm) {
  for (const e of gaz.entries) if (e.norm === norm) return e.place;
  return null;
}
