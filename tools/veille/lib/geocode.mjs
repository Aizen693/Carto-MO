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
      if (NOT_PLACE.has(norm)) break;
      if (isMetonymy(words, i)) break;
      if (splitsCompound(words, i, n)) continue;
      if (isMediaName(words, i + n)) break;
      if (seen.has(place.name)) break;
      seen.add(place.name);
      found.push({ at: i, len: norm.length, place });
      break; // plus long match a cette position
    }
  }
  resolveHomonyms(found, gaz, zone);
  // Coherence pays : si le texte nomme des pays, un village d'un autre pays
  // est un homonyme ("Mali : ... a Kassala" ne peut pas etre Kassala au Niger).
  // Limite au Sahel et a la RDC : au Moyen-Orient, "Israel" cote un village
  // de Cisjordanie dans presque chaque depeche.
  const named = zone === 'moyen-orient' ? new Set() : countriesIn(words);
  if (named.size) for (const f of found) {
    if (f.place && f.place.precision === 'localite' && !named.has(normalize(f.place.country))) f.place = null;
  }
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
  let r = 0;
  for (const raw of String(text || '').split(/[\s’'`]+/)) {
    const parts = normalize(raw).split(' ').filter(Boolean);
    const clean = raw.replace(/^[^\p{L}\p{N}]+/u, '');
    parts.forEach((part, k) => out.push({ raw: clean, norm: part, r, k, of: parts.length }));
    if (parts.length) r++;
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

/* "Ben-Gvir" : le lieu "Ben" n'est qu'un morceau d'un mot compose, on
   l'ignore. Le match doit couvrir le mot compose en entier ("Gorom-Gorom"). */
function splitsCompound(words, i, n) {
  const first = words[i], last = words[i + n - 1];
  return first.k !== 0 || last.k !== last.of - 1;
}

/* "Fars news", "Jerusalem Post", "Shin Bet" : le toponyme fait partie d'un
   nom de media ou d'organisation, ce n'est pas le lieu de l'evenement. */
const MEDIA_NEXT = new Set(['news', 'agency', 'agence', 'post', 'times', 'daily', 'tv', 'television',
  'international', 'intl', 'press', 'herald', 'tribune', 'radio', 'bet', 'channel', 'today', 'observer']);

function isMediaName(words, j) {
  return MEDIA_NEXT.has(words[j]?.norm) && /^\p{Lu}/u.test(words[j]?.raw || '') || words[j]?.norm === 'news';
}

/* Noms de pays : ils designent le pays, jamais un village homonyme ("Kenya"
   au Mali). Plus quelques mots courants qui sont aussi des localites. */
const COUNTRY_NAMES = {
  mali: 'mali', malien: 'mali', malienne: 'mali', burkina: 'burkina faso', burkinabe: 'burkina faso',
  niger: 'niger', nigerien: 'niger', nigerienne: 'niger', tchad: 'tchad', tchadien: 'tchad', chad: 'tchad',
  mauritanie: 'mauritanie', mauritanien: 'mauritanie', rdc: 'rdc', congo: 'rdc', congolais: 'rdc', congolaise: 'rdc',
};
const NOT_PLACE = new Set(['kenya', 'nigeria', 'cameroun', 'senegal', 'guinee', 'ghana', 'togo', 'benin', 'soudan',
  'sudan', 'libye', 'libya', 'algerie', 'maroc', 'ouganda', 'uganda', 'rwanda', 'burundi', 'angola', 'zambie',
  'tanzanie', 'france', 'russie', 'ukraine', 'chine', 'turquie', 'egypte', 'savane', 'brousse', 'afrique']);

function countriesIn(words) {
  const out = new Set();
  for (const w of words) if (COUNTRY_NAMES[w.norm] && /^\p{Lu}/u.test(w.raw)) out.add(COUNTRY_NAMES[w.norm]);
  return out;
}

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

/* Geotag precis (Instagram) : on garde les coordonnees du post, mais on
   verifie qu'il tombe dans la zone en cherchant le lieu du gazetteer le plus
   proche (a moins de maxKm). Hors zone -> null. Le pays vient de ce voisin. */
export function fromGeotag(geotag, zone, gaz = loadGazetteer(), maxKm = 150) {
  const lat = Number(geotag?.lat), lon = Number(geotag?.lon);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  let near = null, nearD = Infinity;
  for (const e of gaz.entries) {
    const p = e.place;
    if (zone && p.zone !== zone) continue;
    if (p.amb) continue;
    const d = km({ lat, lon }, p);
    if (d < nearD) { nearD = d; near = p; }
  }
  if (!near || nearD > maxKm) return null;
  return {
    name: geotag.name || near.name,
    country: near.country,
    lon, lat,
    precision: 'geotag',
    source: 'instagram',
    others: near.name !== geotag.name ? [`${near.name} (${Math.round(nearD)} km)`] : []
  };
}
