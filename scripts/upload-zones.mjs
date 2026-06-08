#!/usr/bin/env node
/**
 * upload-zones.mjs — Migration V1 (audit sécu)
 *
 * Pousse tous les fichiers de données des théâtres premium (geojson / kml / json)
 * vers le bucket privé Supabase « zones ». La clé d'objet conserve le chemin de
 * zone (ex. sahel/humint.geojson) pour que le loader client le retrouve.
 *
 * Aucune dépendance npm : utilise l'API REST Storage + fetch natif (Node ≥ 18).
 *
 * USAGE :
 *   SUPABASE_SERVICE_ROLE_KEY="eyJ..." node scripts/upload-zones.mjs
 *
 * La clé service_role se trouve dans :
 *   Supabase Dashboard > Project Settings > API > service_role (secret).
 * ⚠️  Ne JAMAIS commiter cette clé ni la coller dans du code front. Elle reste
 *     uniquement dans ton terminal le temps de l'upload.
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const SUPABASE_URL = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co';
const BUCKET = 'zones';
const ZONES = ['sahel', 'rdc', 'moyen-orient', 'afrique', 'madagascar', 'asie-sud'];
const EXT = new Set(['.geojson', '.kml', '.json']);

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error('❌  Manque SUPABASE_SERVICE_ROLE_KEY dans l\'environnement.');
  console.error('   Ex : SUPABASE_SERVICE_ROLE_KEY="eyJ..." node scripts/upload-zones.mjs');
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function contentType(file) {
  return extname(file) === '.kml' ? 'application/xml' : 'application/json';
}

async function upload(relPath, body) {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${relPath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': contentType(relPath),
      'x-upsert': 'true', // ré-exécutable : écrase la version précédente
    },
    body,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} — ${txt}`);
  }
}

let ok = 0, fail = 0;
for (const zone of ZONES) {
  let files;
  try {
    files = await readdir(join(ROOT, zone));
  } catch { continue; }
  for (const name of files) {
    if (!EXT.has(extname(name))) continue;
    const rel = `${zone}/${name}`;
    try {
      const body = await readFile(join(ROOT, zone, name));
      await upload(rel, body);
      ok++;
      console.log(`✓ ${rel}`);
    } catch (e) {
      fail++;
      console.error(`✗ ${rel} — ${e.message}`);
    }
  }
}

console.log(`\nTerminé : ${ok} uploadés, ${fail} en échec.`);
process.exit(fail ? 1 : 0);
