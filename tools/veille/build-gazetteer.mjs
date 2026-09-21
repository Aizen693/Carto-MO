#!/usr/bin/env node
/* Regenere tools/veille/gazetteer.json depuis GeoNames.
   Donnees libres (CC BY 4.0), telechargement direct, aucune cle requise :
   https://download.geonames.org/export/dump/<CC>.zip

   Usage :
     node tools/veille/build-gazetteer.mjs                 # toutes les zones
     node tools/veille/build-gazetteer.mjs --zone sahel
     node tools/veille/build-gazetteer.mjs --min-pop 2000

   Le fichier produit remplace le seed manuel : coordonnees exactes et
   couverture complete (toutes les localites au-dessus du seuil). */

import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { UA } from './lib/http.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'gazetteer.json');

/* Pays couverts par zone (codes ISO 3166-1 alpha-2 GeoNames). */
const ZONES = {
  sahel: { ML: 'Mali', BF: 'Burkina Faso', NE: 'Niger', TD: 'Tchad', MR: 'Mauritanie' },
  'moyen-orient': { SY: 'Syrie', IQ: 'Irak', LB: 'Liban', IL: 'Israel', PS: 'Territoires palestiniens', JO: 'Jordanie', YE: 'Yemen', IR: 'Iran', SA: 'Arabie saoudite' },
  rdc: { CD: 'RDC' }
};

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const MIN_POP = Number(opt('min-pop', 5000));
const ONLY = opt('zone', null);

const places = [];

for (const [zone, countries] of Object.entries(ZONES)) {
  if (ONLY && zone !== ONLY) continue;
  for (const [cc, label] of Object.entries(countries)) {
    process.stdout.write(`[gazetteer] ${zone} / ${cc} ... `);
    try {
      const txt = await downloadCountry(cc);
      const before = places.length;
      parseGeonames(txt, zone, label, places);
      console.log(`${places.length - before} lieux`);
    } catch (e) {
      console.log(`ECHEC (${e.message})`);
      process.exitCode = 1;
    }
  }
}

if (places.length === 0) {
  console.error('[gazetteer] aucun lieu recupere, fichier existant conserve');
  process.exit(1);
}

// Dedoublonnage sur nom normalise + zone, la population la plus forte gagne.
const byKey = new Map();
for (const p of places) {
  const k = `${p.zone}|${p.name.toLowerCase()}`;
  const prev = byKey.get(k);
  if (!prev || (p._pop || 0) > (prev._pop || 0)) byKey.set(k, p);
}
const final = [...byKey.values()].map(({ _pop, ...rest }) => rest);

const doc = {
  meta: {
    version: 2,
    generated: new Date().toISOString().slice(0, 10),
    source: `GeoNames (CC BY 4.0), population >= ${MIN_POP} + chefs-lieux ADM1`,
    count: final.length
  },
  places: final
};
writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n', 'utf8');
console.log(`[gazetteer] ${final.length} lieux ecrits dans ${OUT}`);

async function downloadCountry(cc) {
  const res = await fetch(`https://download.geonames.org/export/dump/${cc}.zip`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const zip = Buffer.from(await res.arrayBuffer());
  return unzipFirstTxt(zip, `${cc}.txt`);
}

/* Lecteur ZIP minimal : on passe par le repertoire central pour connaitre
   les tailles, puis on decompresse l'entree demandee (deflate ou stored). */
function unzipFirstTxt(buf, wanted) {
  const eocd = findSignature(buf, 0x06054b50);
  if (eocd < 0) throw new Error('archive ZIP illisible (EOCD absent)');
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error('entree ZIP invalide');
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);

    if (name.toLowerCase() === wanted.toLowerCase()) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      return (method === 0 ? data : inflateRawSync(data)).toString('utf8');
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} absent de l'archive`);
}

function findSignature(buf, sig) {
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === sig) return i;
  return -1;
}

/* Colonnes GeoNames : 1 name, 2 asciiname, 3 alternatenames, 4 lat, 5 lon,
   6 feature class, 7 feature code, 14 population. */
function parseGeonames(txt, zone, country, out) {
  for (const line of txt.split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    if (c.length < 15) continue;
    const fclass = c[6], fcode = c[7];
    const pop = Number(c[14]) || 0;
    const isTown = fclass === 'P' && pop >= MIN_POP;
    const isAdm1 = fclass === 'A' && fcode === 'ADM1';
    if (!isTown && !isAdm1) continue;

    const name = (c[2] || c[1] || '').trim();
    if (name.length < 3) continue;

    const alias = (c[3] || '').split(',')
      .map(s => s.trim())
      .filter(s => s.length >= 3 && s.toLowerCase() !== name.toLowerCase() && /^[\p{Script=Latin}\p{Script=Arabic}\s'\-.]+$/u.test(s))
      .slice(0, 4);

    out.push({
      zone, country, name,
      lat: Math.round(Number(c[4]) * 1e5) / 1e5,
      lon: Math.round(Number(c[5]) * 1e5) / 1e5,
      alias,
      precision: isAdm1 ? 'region' : 'ville',
      src: 'geonames',
      _pop: pop
    });
  }
}
