#!/usr/bin/env node
/* Collecteur de veille sans API ni cle.
   Sources : canaux Telegram publics (apercu web t.me/s) + flux RSS/Atom.
   Sortie  : <zone>/veille.geojson, au format attendu par le calque Veille IA.

   Usage :
     node tools/veille/collect.mjs --zone sahel
     node tools/veille/collect.mjs --all --days 30
     node tools/veille/collect.mjs --zone rdc --check      # teste les sources
     node tools/veille/collect.mjs --all --prune           # teste ET retire les mortes
     node tools/veille/collect.mjs --zone sahel --dry-run  # n'ecrit rien

   Node >= 20 (fetch natif). Aucune dependance npm. */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchChannel } from './lib/telegram.mjs';
import { fetchFeed } from './lib/rss.mjs';
import { search as tiktokSearch, hasKey as tiktokHasKey } from './lib/tiktok.mjs';
import { classify } from './lib/classify.mjs';
import { geocode, loadGazetteer } from './lib/geocode.mjs';
import { buildFeature, mergeCollection } from './lib/geojson.mjs';
import { decide, applyPrune, summarize } from './lib/prune.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SOURCES_PATH = resolve(__dirname, 'sources.json');
const SOURCES = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'));

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
const CHECK = flag('check') || flag('prune');
const PRUNE = flag('prune');   // --prune : retire du fichier les sources mortes
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
  const results = [];

  for (const chan of conf.telegram || []) {
    results.push(await probe('telegram', chan, `telegram @${chan}`,
      o => fetchChannel(chan, o)));
  }
  for (const feed of conf.rss || []) {
    results.push(await probe('rss', feed.url, `rss ${feed.label}`,
      o => fetchFeed(feed.url, feed.label, o)));
  }

  const tkQueries = conf.tiktok?.queries || [];
  if (tkQueries.length && !tiktokHasKey()) {
    // Sans cle, la source n'est pas testable : on ne la purge donc jamais.
    console.log(`  --   tiktok (${tkQueries.length} requetes) — ignore : TIKNEURON_MCP_API_KEY absente`);
  } else {
    for (const q of tkQueries) {
      results.push(await probe('tiktok', q, `tiktok "${q}"`,
        o => tiktokSearch(q, { pages: 1, opts: o })));
    }
  }

  if (!PRUNE) return;

  const { kept, removed } = decide(results);
  if (removed.length === 0) {
    console.log(`  → rien a retirer, les ${kept.length} sources repondent`);
    return;
  }

  SOURCES.zones[zone] = applyPrune(conf, removed);
  copyFileSync(SOURCES_PATH, `${SOURCES_PATH}.bak`);
  writeFileSync(SOURCES_PATH, JSON.stringify(SOURCES, null, 2) + '\n', 'utf8');

  console.log(`  → ${removed.length} source(s) retiree(s) de sources.json :`);
  for (const line of summarize(removed)) console.log(`      - ${line}`);
  console.log(`  → ${kept.length} conservee(s). Sauvegarde : sources.json.bak`);
}

/* Sonde une source. Une source qui echoue est retentee une fois avant d'etre
   declaree morte : un hoquet reseau ne doit pas supprimer un bon flux. */
async function probe(kind, key, label, fn) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    try {
      const items = await fn({ retries: 0, timeout: 15000 });
      const ms = Date.now() - t0;
      const status = items.length > 0 ? 'ok' : 'empty';
      console.log(`  ${status === 'ok' ? 'OK  ' : 'VIDE'} ${label} — ${items.length} items (${ms} ms)`);
      return { kind, key, label, status, count: items.length };
    } catch (e) {
      if (attempt === 0) { await new Promise(r => setTimeout(r, 1500)); continue; }
      console.log(`  KO   ${label} — ${e.message}`);
      return { kind, key, label, status: 'error', count: 0, error: e.message };
    }
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
  // TikTok : source optionnelle, payante (API TikNeuron). Sans cle, on saute
  // sans faire echouer la collecte.
  const tkQueries = conf.tiktok?.queries || [];
  const tkActive = tkQueries.length > 0 && tiktokHasKey();
  if (tkQueries.length > 0 && !tkActive) {
    console.log(`  [i] tiktok ignore (TIKNEURON_MCP_API_KEY absente)`);
  }
  if (tkActive) {
    for (const q of tkQueries) {
      batches.push(await pull(`tiktok "${q}"`, () => tiktokSearch(q, { pages: conf.tiktok.pages || 2 })));
    }
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
  const sourceCount = (conf.telegram || []).length + (conf.rss || []).length + (tkActive ? tkQueries.length : 0);
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
