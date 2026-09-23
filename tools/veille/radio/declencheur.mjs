#!/usr/bin/env node
/* Déclenchement automatique de la capture radio sur événement.

   Lit le fil public de la veille géopolitique (veille-feed, champs publics
   seulement) ; pour chaque note CRITIQUE nouvelle sur le théâtre Sahel, lance
   une capture de 20 min sur les radios d'information du pays concerné
   (lancer-direct.sh declencher <pays>).

   Pourquoi « critique » seulement : le 23/09, 82 des 101 notes Sahel étaient
   en « alerte » ; déclencher dessus reviendrait à écouter en continu, ce que
   le CPU du VPS ne tient pas (transcription ~1,5 x la durée de l'audio).

   Garde-fous : une note ne déclenche qu'une fois ; un pays au plus toutes les
   6 h ; notes de plus de 36 h ignorées (le fil n'a que la date du jour).

   Usage (cron toutes les 10 min sur le VPS) :
     node declencheur.mjs            # lance les captures
     node declencheur.mjs --essai    # affiche ce qui serait lancé, sans rien lancer */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { fromGeotag, geocode, loadGazetteer } from '../lib/geocode.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE = resolve(__dirname, 'state');
const MEMO = resolve(STATE, 'declenchements.json');
const FIL = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co/functions/v1/veille-feed/notifications.json';
const LANCEUR = process.env.RADIO_LANCEUR || '/opt/veille-radio/lancer-direct.sh';
const ESSAI = process.argv.includes('--essai');
const PAUSE_PAYS_H = 6;
const AGE_MAX_H = 36;

/* Pays d'une note : coordonnées d'abord (plus sûres), texte ensuite. */
export function paysDeNote(note, gaz) {
  const lat = Number(note.lat), lon = Number(note.lon);
  if (isFinite(lat) && isFinite(lon) && (lat || lon)) {
    const g = fromGeotag({ lat, lon, name: note.lieu }, 'sahel', gaz, 250);
    if (g) return g.country;
  }
  const g = geocode(`${note.lieu || ''} ${note.titre || ''}`, 'sahel', gaz);
  return g ? g.country : null;
}

/* Notes à déclencher, parmi celles du fil. Pure : testée. */
export function aDeclencher(notes, memo, { now = Date.now(), gaz } = {}) {
  const out = [];
  const dejaPays = { ...(memo.pays || {}) };
  for (const n of notes) {
    if (n.theatre !== 'sahel' || n.severite !== 'critique') continue;
    if ((memo.notes || {})[n.id]) continue;
    const t = Date.parse(String(n.date).length === 10 ? `${n.date}T00:00:00Z` : n.date);
    if (!isFinite(t) || now - t > AGE_MAX_H * 3600e3) continue;
    const pays = paysDeNote(n, gaz);
    if (!pays) continue;
    const dernier = dejaPays[pays] ? Date.parse(dejaPays[pays]) : 0;
    if (now - dernier < PAUSE_PAYS_H * 3600e3) continue;
    dejaPays[pays] = new Date(now).toISOString();
    out.push({ id: n.id, pays, titre: n.titre });
  }
  return out;
}

async function main() {
  mkdirSync(STATE, { recursive: true });
  const memo = existsSync(MEMO) ? JSON.parse(readFileSync(MEMO, 'utf8')) : { notes: {}, pays: {} };
  const r = await fetch(FIL, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`fil de veille : HTTP ${r.status}`);
  const d = await r.json();
  const notes = Array.isArray(d) ? d : d.items || [];
  const gaz = loadGazetteer();
  const liste = aDeclencher(notes, memo, { gaz });
  // Les notes critiques déjà vues ou trop anciennes sont mémorisées aussi, pour ne pas les réexaminer.
  for (const n of notes) if (n.theatre === 'sahel' && n.severite === 'critique') memo.notes[n.id] ||= new Date().toISOString();
  for (const x of liste) {
    console.log(`[declencheur] ${x.pays} : « ${String(x.titre).slice(0, 90)} »${ESSAI ? ' (essai, rien lancé)' : ''}`);
    if (ESSAI) continue;
    memo.pays[x.pays] = new Date().toISOString();
    // Détaché : la capture dure plus longtemps que ce passage de cron.
    spawn(LANCEUR, ['declencher', x.pays, '20'], { detached: true, stdio: 'ignore' }).unref();
  }
  // Mémoire bornée à 30 jours.
  const lim = Date.now() - 30 * 86400e3;
  memo.notes = Object.fromEntries(Object.entries(memo.notes).filter(([, v]) => Date.parse(v) >= lim));
  if (!ESSAI) writeFileSync(MEMO, JSON.stringify(memo, null, 1));
  if (!liste.length) console.log('[declencheur] aucune note critique nouvelle');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
