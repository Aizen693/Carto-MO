#!/usr/bin/env node
/* Collecteur de veille sans API ni cle.
   Sources : canaux Telegram publics (apercu web t.me/s) + flux RSS/Atom.
   Sortie  : <zone>/veille.geojson, au format attendu par le calque Veille IA.

   Usage :
     node tools/veille/collect.mjs --zone sahel
     node tools/veille/collect.mjs --all --days 30
     node tools/veille/collect.mjs --zone rdc --check      # teste les sources
     node tools/veille/collect.mjs --zone sahel --dry-run  # n'ecrit rien

   Node >= 20 (fetch natif). Aucune dependance npm. */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchChannel } from './lib/telegram.mjs';
import { fetchFeed } from './lib/rss.mjs';
import { classify } from './lib/classify.mjs';
import { geocode, loadGazetteer } from './lib/geocode.mjs';
import { buildFeature, mergeCollection } from './lib/geojson.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SOURCES = JSON.parse(readFileSync(resolve(__dirname, 'sources.json'), 'utf8'));

const argv = process.argv.slice(2);
const flag = n => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const DAYS = Number(opt('days', 30));         // retention du fichier de sortie
const MAX_AGE = Number(opt('max-age', 3));    // age max d'un item collecte
const LIMIT = Number(opt('limit', 60));       // items max retenus par zone et par passage
const DRY = flag('dry-run');
const CHECK = flag('check');
const OUT = opt('out', null);

const zones = flag('all')
  ? Object.keys(SOURCES.zones)
  : [opt('zone', null)].filter(Boolean);

if (zones.length === 0) {
  console.error('Usage : --zone <sahel|moyen-orient|rdc> ou --all');
  process.exit(2);
}

for (const zone of zones) {
  const conf = SOURCES.zones[zone];
  if (!conf) { console.error(`[veille] zone inconnue : ${zone}`); process.exitCode = 2; continue; }
  if (CHECK) await checkZone(zone, conf);
  else await runZone(zone, conf);
}

async function checkZone(zone, conf) {
  console.log(`\n[check] zone ${zone}`);
  for (const chan of conf.telegram || []) {
    await probe(`telegram @${chan}`, () => fetchChannel(chan, { retries: 0, timeout: 15000 }));
  }
  for (const feed of conf.rss || []) {
    await probe(`rss ${feed.label}`, () => fetchFeed(feed.url, feed.label, { retries: 0, timeout: 15000 }));
  }
}

async function probe(label, fn) {
  const t0 = Date.now();
  try {
    const items = await fn();
    const ms = Date.now() - t0;
    console.log(`  ${items.length > 0 ? 'OK  ' : 'VIDE'} ${label} — ${items.length} items (${ms} ms)`);
  } catch (e) {
    console.log(`  KO   ${label} — ${e.message}`);
  }
}

async function runZone(zone, conf) {
  const gaz = loadGazetteer();
  const since = Date.now() - MAX_AGE * 86400000;
  const stats = { fetched: 0, recent: 0, classified: 0, located: 0, errors: 0 };
  const features = [];
  const seen = new Set();

  const pull = async (label, fn) => {
    try {
      const items = await fn();
      stats.fetched += items.length;
      return items;
    } catch (e) {
      stats.errors++;
      console.warn(`  [!] ${label} : ${e.message}`);
      return [];
    }
  };

  const batches = [];
  for (const chan of conf.telegram || []) {
    batches.push(await pull(`telegram @${chan}`, () => fetchChannel(chan)));
  }
  for (const feed of conf.rss || []) {
    batches.push(await pull(`rss ${feed.label}`, () => fetchFeed(feed.url, feed.label)));
  }

  for (const item of batches.flat()) {
    const ts = item.published_at ? Date.parse(item.published_at) : NaN;
    if (!isNaN(ts) && ts < since) continue;
    stats.recent++;

    const cls = classify(item);
    if (!cls) continue;
    stats.classified++;

    const geo = geocode(item.text, zone, gaz);
    if (!geo) continue;
    stats.located++;

    const f = buildFeature(item, cls, geo, { zone });
    if (seen.has(f.properties.Ref)) continue;
    seen.add(f.properties.Ref);
    features.push(f);
    if (features.length >= LIMIT) break;
  }

  const outPath = resolve(ROOT, OUT || `${zone}/veille.geojson`);
  const existing = existsSync(outPath) ? safeJson(outPath) : { type: 'FeatureCollection', features: [] };
  const { collection, added, total } = mergeCollection(existing, features, { days: DAYS });

  console.log(`[veille:${zone}] collectes ${stats.fetched} | recents ${stats.recent} | qualifies ${stats.classified} | localises ${stats.located} | nouveaux ${added} | total ${total}${stats.errors ? ` | sources en erreur ${stats.errors}` : ''}`);

  if (DRY) { console.log(`[veille:${zone}] dry-run : ${outPath} non modifie`); return; }

  // Filet de securite : si toutes les sources ont echoue et qu'aucun point
  // n'a ete produit, on ne reecrit pas le fichier (evite de purger la
  // retention sur un simple incident reseau).
  const sourceCount = (conf.telegram || []).length + (conf.rss || []).length;
  if (features.length === 0 && stats.errors > 0 && stats.errors === sourceCount) {
    console.warn(`[veille:${zone}] toutes les sources en echec : ${outPath} laisse intact`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(collection, null, 1) + '\n', 'utf8');
  console.log(`[veille:${zone}] ecrit ${outPath}`);
}

function safeJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch { return { type: 'FeatureCollection', features: [] }; }
}
