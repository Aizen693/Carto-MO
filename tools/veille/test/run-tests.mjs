#!/usr/bin/env node
/* Tests hors-ligne du collecteur : parsing Telegram/RSS, classification,
   geocodage et construction GeoJSON. Aucun acces reseau.
   Usage : node tools/veille/test/run-tests.mjs */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChannelHtml } from '../lib/telegram.mjs';
import { parseFeed } from '../lib/rss.mjs';
import { classify, extractToll, normalize } from '../lib/classify.mjs';
import { geocode, fromGeotag, loadGazetteer } from '../lib/geocode.mjs';
import { parseOutput as parseIg } from '../lib/instagram.mjs';
import { buildFeature, mergeCollection, makeRef } from '../lib/geojson.mjs';
import { parseSearch, mapVideo, toIso, hasKey } from '../lib/tiktok.mjs';
import { decide, applyPrune, summarize } from '../lib/prune.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = n => readFileSync(resolve(__dirname, 'fixtures', n), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}
function eq(a, b, label) { ok(a === b, label, `attendu ${JSON.stringify(b)}, recu ${JSON.stringify(a)}`); }

console.log('\n# Telegram (apercu web)');
const tg = parseChannelHtml(fixture('telegram.html'), 'zonewatch');
eq(tg.length, 3, '3 messages extraits');
eq(tg[0].source_url, 'https://t.me/zonewatch/1234', 'URL du post');
eq(tg[0].author, '@zonewatch', 'canal');
eq(tg[0].published_at, '2026-09-20T08:14:03.000Z', 'horodatage ISO');
ok(tg[0].text.includes('Nampala'), 'texte decode et nettoye');
ok(tg[0].text.includes('tués'), 'entites HTML decodees');
eq(tg[0].media.length, 1, 'media detecte');
eq(tg[0].audience, '12.4K', 'compteur de vues');

console.log('\n# RSS');
const rss = parseFeed(fixture('feed.xml'), 'Test Feed');
eq(rss.length, 3, '3 items extraits');
eq(rss[0].source_url, 'https://example.org/article/1', 'lien item');
eq(rss[0].published_at, '2026-09-20T07:05:00.000Z', 'pubDate convertie');
ok(rss[0].text.includes('Djibo') && rss[0].text.includes('8 morts'), 'titre + description concatenes');

console.log('\n# Classification');
eq(classify(tg[0]).type, 'Attaque', 'attaque sur poste militaire');
eq(classify(tg[1]), null, 'bruit sportif rejete');
eq(classify(tg[2]).type, 'Embuscades', 'embuscade sur convoi');
ok(classify(tg[0]).actors.includes('jnim'), 'acteur JNIM identifie');
eq(classify(tg[0]).confidence, 'elevee', 'confiance elevee (acteur + bilan)');
eq(classify(rss[1]), null, 'annonce de concert rejetee');
eq(extractToll('au moins 12 soldats tues'), '12 (annonce, non verifie)', 'bilan FR');
eq(extractToll('at least 9 killed in the raid'), '9 (annonce, non verifie)', 'bilan EN');
eq(classify({ text: 'court' }), null, 'texte trop court rejete');
eq(normalize('Ménaka'), 'menaka', 'normalisation des accents');

console.log('\n# TikTok (API TikNeuron)');
const tkRaw = JSON.parse(fixture('tiktok-search.json'));
const tk = parseSearch(tkRaw, 'Burkina Faso attaque Djibo');
eq(tk.items.length, 2, 'videos sans texte ecartees');
eq(tk.items[0].source, 'tiktok', 'source marquee tiktok');
eq(tk.items[0].source_url, 'https://www.tiktok.com/@veille_sahel/video/7409731702890827041', 'URL reconstruite (arobase nettoyee)');
eq(tk.items[0].author, '@veille_sahel', 'auteur normalise');
eq(tk.items[0].published_at, '2026-09-20T06:30:00.000Z', 'created_at ISO');
ok(tk.items[0].text.includes('#burkina'), 'hashtags ajoutes au texte');
eq(tk.items[1].published_at, toIso(1758348600), 'created_at epoch secondes');
eq(toIso(1758348600), '2025-09-20T06:10:00.000Z', 'conversion epoch secondes');
eq(toIso(1758348600000), '2025-09-20T06:10:00.000Z', 'conversion epoch millisecondes');
eq(toIso(''), null, 'date vide');
eq(tk.cursor, '20', 'curseur de pagination');
eq(tk.hasMore, true, 'indicateur has_more');
eq(tk.searchUid, 'abc123', 'search_uid conserve');
eq(classify(tk.items[0]).type, 'Attaque', 'item TikTok classe');
eq(classify(tk.items[1]), null, 'recette de cuisine rejetee');
eq(hasKey(), Boolean(process.env.TIKNEURON_MCP_API_KEY), 'detection de la cle');

console.log('\n# Geocodage (gazetteer local)');
const gaz = loadGazetteer();
ok(gaz.entries.length > 150, `gazetteer charge (${gaz.entries.length} entrees)`);
eq(geocode(tg[0].text, 'sahel', gaz).name, 'Nampala', 'Nampala (Mali)');
eq(geocode(tg[0].text, 'sahel', gaz).country, 'Mali', 'pays resolu');
eq(geocode(tg[2].text, 'rdc', gaz).name, 'Beni', 'Beni (RDC) : premier toponyme cite');
ok(geocode(tg[2].text, 'rdc', gaz).others.includes('Oicha'), 'Oicha conserve en lieu secondaire');
eq(geocode(rss[2].text, 'moyen-orient', gaz).name, 'Deir ez-Zor', 'alias Deir ez-Zor');
eq(geocode('Aucun toponyme connu ici', 'sahel', gaz), null, 'texte non localisable');
eq(geocode(tg[0].text, 'rdc', gaz), null, 'cloisonnement par zone');
eq(geocode('violences a Gorom-Gorom cette nuit', 'sahel', gaz).name, 'Gorom-Gorom', 'toponyme compose');

console.log('\n# Geocodage GeoNames (regles fines)');
const mini = loadGazetteer(resolve(__dirname, 'fixtures', 'gazetteer-mini.json'));
eq(geocode('Kwilu : incendies a Bulungu', 'rdc', mini).name, 'Bulungu', 'localite preferee a la region citee avant');
eq(geocode('attaque pres de hombori hier', 'sahel', mini), null, 'village GeoNames sans majuscule ignore');
eq(geocode('attaque pres de Hombori hier', 'sahel', mini).name, 'Hombori', 'village GeoNames avec majuscule');
eq(geocode('la junte de Bamako accuse le GSIM', 'sahel', mini), null, 'metonymie "junte de Bamako" ignoree');
eq(geocode('explosion a Bamako', 'sahel', mini).name, 'Bamako', 'capitale comme lieu reel');
eq(geocode('camp de Dioura attaque', 'sahel', mini), null, 'homonyme sans ancre ignore');
const dio = geocode('attaque a Dioura puis a Sevare', 'sahel', mini);
eq(dio && dio.lon, -5.2547, 'homonyme tranche par le lieu voisin (Sevare)');
eq(geocode('camp de Dioura attaque', 'sahel', mini)?.lon, -5.2547, 'homonyme resolu reutilise dans le meme passage');
eq(geocode('Bamako-Senou visite du ministre', 'sahel', mini), null, 'toponyme morceau de mot compose ignore');
eq(geocode('selon Bamako News, explosion a Mopti', 'sahel', mini).name, 'Mopti', 'toponyme dans un nom de media ignore');

console.log('\n# Instagram (sortie Instaloader)');
const igItems = parseIg(fixture('instagram-output.jsonl'));
eq(igItems.length, 2, 'deux items lus, journal et ligne tronquee ignores');
eq(igItems[0].source_url, 'https://www.instagram.com/p/ABC123/', 'URL du post');
const igGeo = fromGeotag(igItems[0].geotag, 'sahel', mini);
eq(igGeo && igGeo.lat, 15.29, 'geotag garde ses coordonnees exactes');
eq(igGeo && igGeo.country, 'Mali', 'pays deduit du lieu voisin');
eq(igGeo && igGeo.precision, 'geotag', 'precision geotag');
eq(fromGeotag(igItems[1].geotag, 'sahel', mini), null, 'geotag hors zone (Paris) rejete');
const igF = buildFeature(igItems[0], classify(igItems[0]), igGeo, { zone: 'sahel' });
eq(igF.properties.Canal, 'Instagram @veille_test', 'canal Instagram');
eq(igF.geometry.coordinates[1], 15.29, 'point place au geotag');

console.log('\n# Purge des sources mortes');
const probes = [
  { kind: 'rss', key: 'https://a.example/rss', label: 'rss A', status: 'ok', count: 12 },
  { kind: 'rss', key: 'https://b.example/rss', label: 'rss B', status: 'error', count: 0, error: 'HTTP 404' },
  { kind: 'rss', key: 'https://c.example/rss', label: 'rss C', status: 'empty', count: 0 },
  { kind: 'telegram', key: 'canal_mort', label: 'telegram @canal_mort', status: 'error', count: 0, error: 'HTTP 404' },
  { kind: 'telegram', key: 'canal_vivant', label: 'telegram @canal_vivant', status: 'ok', count: 20 },
  { kind: 'tiktok', key: 'requete morte', label: 'tiktok "requete morte"', status: 'empty', count: 0 }
];
const { kept, removed } = decide(probes);
eq(kept.length, 2, 'seules les sources qui renvoient des items sont gardees');
eq(removed.length, 4, 'erreurs et sources vides retirees');

const confAvant = {
  telegram: ['canal_mort', 'canal_vivant'],
  rss: [
    { url: 'https://a.example/rss', label: 'rss A' },
    { url: 'https://b.example/rss', label: 'rss B' },
    { url: 'https://c.example/rss', label: 'rss C' }
  ],
  tiktok: { queries: ['requete morte', 'requete vivante'], pages: 2 }
};
const confApres = applyPrune(confAvant, removed);
eq(confApres.telegram.join(','), 'canal_vivant', 'canal mort retire');
eq(confApres.rss.length, 1, 'un seul flux conserve');
eq(confApres.rss[0].url, 'https://a.example/rss', 'le bon flux conserve');
eq(confApres.tiktok.queries.join(','), 'requete vivante', 'requete tiktok morte retiree');
eq(confApres.tiktok.pages, 2, 'reste de la config tiktok preserve');
eq(confAvant.telegram.length, 2, 'config d entree non mutee');
eq(applyPrune(confAvant, []).rss.length, 3, 'aucune suppression sans source morte');
ok(summarize(removed)[0].includes('HTTP 404'), 'motif de suppression explicite');
eq(decide([]).removed.length, 0, 'liste vide toleree');

console.log('\n# GeoJSON');
const cls = classify(tg[0]);
const geo = geocode(tg[0].text, 'sahel', gaz);
const f = buildFeature(tg[0], cls, geo, { zone: 'sahel' });
eq(f.type, 'Feature', 'type Feature');
eq(f.geometry.type, 'Point', 'geometrie Point');
eq(f.geometry.coordinates.length, 2, '[lon, lat]');
ok(f.geometry.coordinates[0] === geo.lon && f.geometry.coordinates[1] === geo.lat, 'ordre lon/lat respecte');
eq(f.properties.type, 'Attaque', 'type compatible colorExpr');
eq(f.properties.Lieu, 'Nampala', 'lieu en propriete');
eq(f.properties.Statut, 'a valider', 'statut de validation');
ok(/^Telegram\|https:\/\/t\.me\//.test(f.properties.sources), 'format sources "Label|url"');
ok(f.properties.Resume.length <= 281, 'resume tronque');
eq(makeRef(tg[0], geo.name), f.properties.Ref, 'Ref reproductible');

const tkFeature = buildFeature(tk.items[0], classify(tk.items[0]), geocode(tk.items[0].text, 'sahel', gaz), { zone: 'sahel' });
eq(tkFeature.properties.Lieu, 'Djibo', 'point TikTok localise a Djibo');
ok(tkFeature.properties.sources.startsWith('TikTok|https://www.tiktok.com/'), 'libelle de source TikTok');
eq(tkFeature.properties.Canal, 'TikTok @veille_sahel', 'canal TikTok');

const merged1 = mergeCollection({ type: 'FeatureCollection', features: [] }, [f], { days: 30 });
eq(merged1.added, 1, 'ajout initial');
const merged2 = mergeCollection(merged1.collection, [f], { days: 30 });
eq(merged2.added, 0, 'dedoublonnage sur Ref');
eq(merged2.total, 1, 'total stable');

const vieux = JSON.parse(JSON.stringify(f));
vieux.properties.Ref = 'vieuxref01';
vieux.properties.Date = '2020-01-01 00:00 UTC';
const merged3 = mergeCollection({ type: 'FeatureCollection', features: [vieux] }, [f], { days: 30 });
eq(merged3.total, 1, 'retention : point hors fenetre purge');

console.log(`\n${pass} ok, ${fail} echec(s)\n`);
process.exit(fail === 0 ? 0 : 1);
