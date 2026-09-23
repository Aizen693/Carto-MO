#!/usr/bin/env node
/* Inventaire des radios sahéliennes captables, via l'API non documentée de
   Radio Garden (celle qu'utilise son propre lecteur).

   Chaine : places -> channels de chaque ville -> listen/<id>/channel.mp3 qui
   REDIRIGE (302) vers le flux d'origine de la station. C'est ce flux d'origine
   qu'on enregistre ensuite avec ffmpeg, pas le proxy de Radio Garden.

   Usage :
     node tools/veille/radio/build-stations.mjs            # met a jour stations.json
     node tools/veille/radio/build-stations.mjs --probe    # + teste chaque flux (ffprobe)

   Radio Garden est derriere Cloudflare : entete de navigateur + Referer
   obligatoires, et une pause entre deux appels sinon le challenge se declenche.
   Aucune cle, aucun compte. */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { UA } from '../lib/http.mjs';

const run = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'stations.json');
const API = 'https://radio.garden/api/ara/content';

const argv = process.argv.slice(2);
const PROBE = argv.includes('--probe');

/* Pays du theatre Sahel, tels que Radio Garden les nomme (anglais). */
const PAYS = { Mali: 'Mali', 'Burkina Faso': 'Burkina Faso', Niger: 'Niger', Chad: 'Tchad', Mauritania: 'Mauritanie' };
/* Fuseau par pays : sert aux fenetres de capture, donnees en heure locale. */
const TZ = { Mali: 'Africa/Bamako', 'Burkina Faso': 'Africa/Ouagadougou', Niger: 'Africa/Niamey', Tchad: 'Africa/Ndjamena', Mauritanie: 'Africa/Nouakchott' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* curl plutot que fetch : Cloudflare refuse le client HTTP de Node sur ce site. */
async function get(url, json = true) {
  const { stdout } = await run('curl', ['-sL', '-m', '25', '-A', UA, '-H', 'Accept: application/json', '-H', 'Referer: https://radio.garden/', url], { maxBuffer: 32 * 1024 * 1024 });
  return json ? JSON.parse(stdout) : stdout;
}

/* Le flux reel est la cible de la redirection 302 ; on ne la suit pas. */
export async function streamUrl(id) {
  const { stdout } = await run('curl', ['-s', '-m', '20', '-o', '/dev/null', '-D', '-', '-A', UA, '-H', 'Referer: https://radio.garden/', `${API}/listen/${id}/channel.mp3`]);
  const loc = stdout.split('\n').find(l => l.toLowerCase().startsWith('location:'));
  return loc ? loc.slice(loc.indexOf(':') + 1).trim() : null;
}

async function probe(url) {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-rw_timeout', '10000000', '-show_entries', 'stream=codec_name,sample_rate', '-of', 'csv=p=0', url], { timeout: 40000 });
    return stdout.trim().split('\n')[0] || null;
  } catch { return null; }
}

async function main() {
  const anciennes = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { stations: [] };
  const gardees = new Map((anciennes.stations || []).map(s => [s.id, s]));

  const places = (await get(`${API}/places`)).data.list.filter(p => PAYS[p.country]);
  console.log(`[stations] ${places.length} villes sahéliennes sur Radio Garden`);

  const stations = [];
  for (const p of places) {
    let items = [];
    try { items = (await get(`${API}/page/${p.id}/channels`)).data.content[0].items; }
    catch (e) { console.warn(`  [!] ${p.title} : ${e.message}`); continue; }
    for (const c of items) {
      const page = c.page || c;
      const id = String(page.url || '').replace(/\/$/, '').split('/').pop();
      if (!id) continue;
      const prev = gardees.get(id) || {};
      const st = {
        id,
        station: page.title,
        pays: PAYS[p.country],
        ville: p.title,
        tz: TZ[PAYS[p.country]],
        geo: p.geo,                                   // [lon, lat]
        page: `https://radio.garden/listen/${id}`,
        stream: await streamUrl(id),
        // Fenetres de capture, heure LOCALE de la station. Vide = jamais captée
        // automatiquement : a remplir depuis les mesures de `live.mjs --sonde`.
        fenetres: prev.fenetres || [],
        langues: prev.langues || [],                  // mesurees par la sonde
        note: prev.note || '',
        ...(prev.exclure_sonde ? { exclure_sonde: true } : {})
      };
      if (PROBE) { st.flux_ok = Boolean(await probe(st.stream)); }
      stations.push(st);
      console.log(`  ${st.pays.padEnd(13)} ${String(st.station).slice(0, 34).padEnd(34)} ${PROBE ? (st.flux_ok ? 'flux OK ' : 'flux KO ') : ''}${st.stream || 'sans flux'}`);
      await sleep(1200);
    }
  }
  if (!stations.length) { console.error('[stations] aucune station : fichier existant conservé'); process.exit(1); }
  writeFileSync(OUT, JSON.stringify({
    meta: { genere: new Date().toISOString().slice(0, 10), source: 'radio.garden (API non documentée)', count: stations.length },
    stations
  }, null, 1) + '\n');
  console.log(`[stations] ${stations.length} stations écrites dans ${OUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
