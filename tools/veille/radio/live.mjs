#!/usr/bin/env node
/* Capture en direct des radios sahéliennes (flux trouvés via Radio Garden).

   Radio Garden n'a pas d'API publique ; son lecteur appelle
   listen/<id>/channel.mp3, qui redirige vers le flux d'origine de la station.
   build-stations.mjs a fait l'inventaire (stations.json) ; ici on enregistre
   ces flux avec ffmpeg en segments horodatés, on transcrit, on filtre, et on
   passe les journaux retenus à la même extraction que les studios.

   Pourquoi des fenêtres et pas du 24 h/24 : mesuré le 22/09, une station
   captée au hasard diffuse surtout de la musique ou une langue nationale, et
   Whisper y invente du texte (« Terima kasih kerana menonton » sur de la
   musique malienne). On ne capte donc qu'aux heures de journal, trouvées par
   la sonde, et chaque segment passe des garde-fous avant d'être retenu.

   Modes :
     node live.mjs --sonde [--secondes 45] [--stations id1,id2]
                                                     échantillon sur chaque station : langue, débit, hallucination, genre
     node live.mjs --capturer                        cron toutes les 5 min : lance les fenêtres qui commencent
     node live.mjs --declencher --pays Mali [--minutes 20]
                                                     événement : capture immédiate des stations du pays
     node live.mjs --station <id> --minutes 5        capture manuelle d'une station
     node live.mjs --proposer [--ecrire]             déduit des sondes les heures de journal de chaque station

   Sorties : state/segments/<station>/<AAAAMMJJ-HHMMSSZ>.wav, heure UTC (supprimés après
   transcription), state/sonde.jsonl (mesures), state/live-bulletins.json
   (journaux retenus, fusionnés par radio.mjs dans la synthèse). */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, appendFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { UA } from '../lib/http.mjs';
import { loadGazetteer } from '../lib/geocode.mjs';

const run = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE = resolve(__dirname, 'state');
const SEG_DIR = resolve(STATE, 'segments');
const LIVE_OUT = resolve(STATE, 'live-bulletins.json');
const SONDE_OUT = resolve(STATE, 'sonde.jsonl');
const DONE = resolve(STATE, 'fenetres-faites.json');
const STATIONS_PATH = resolve(__dirname, 'stations.json');

const argv = process.argv.slice(2);
const flag = n => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const WHISPER_BIN = process.env.WHISPER_BIN || 'whisper-cli';
const WHISPER_MODEL = process.env.WHISPER_MODEL || join(process.env.HOME || '', '.cache', 'whisper', 'ggml-large-v3-turbo.bin');
const WHISPER_THREADS = String(process.env.WHISPER_THREADS || 8);
// La sonde n'a besoin que de la langue et d'un texte approximatif : un modèle
// léger suffit et tient la cadence horaire sur les 2 cœurs du VPS.
const SONDE_MODEL = process.env.SONDE_WHISPER_MODEL || WHISPER_MODEL;
const SEGMENT_S = 300;           // segments de 5 min : un flux qui coupe ne fait perdre qu'un segment
const KEEP_DAYS = 14;

/* ---------- Garde-fous (purs, testés) ---------- */

/* Phrases que Whisper produit sur de la musique ou du silence : génériques de
   sous-titres de vidéos, sur lesquels le modèle a été entraîné. Ni « www » ni
   « merci de votre attention » : Whisper écrit l'adresse web de la station et
   les journaux se closent réellement ainsi. */
const HALLU = [
  'terima kasih', 'merci d avoir regarde', 'sous titres realises par', 'sous titrage',
  'abonnez vous', 'thank you for watching', 'thanks for watching', 'like and subscribe',
  'amara org'
];

const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/* Retire les phrases de générique hallucinées ; renvoie le texte propre et la
   part retirée (en mots). */
export function retirerHallucinations(texte) {
  const phrases = String(texte || '').split(/(?<=[.!?…])\s+/);
  let retires = 0, total = 0;
  const gardees = [];
  for (const ph of phrases) {
    const n = norm(ph).split(' ').filter(Boolean).length;
    total += n;
    if (HALLU.some(h => ` ${norm(ph)} `.includes(` ${h} `))) { retires += n; continue; }
    gardees.push(ph);
  }
  return { texte: gardees.join(' ').trim(), part: total ? retires / total : 0 };
}

/* Verdict sur un segment transcrit. Renvoie { ok, raison, texte, mots, mots_min, repetition }.
   `texte` est le texte nettoyé des génériques hallucinés : c'est lui qu'on garde.
   - langue non attendue ou détection incertaine ;
   - génériques hallucinés : retirés, segment rejeté seulement s'ils en font plus de 30 % ;
   - trop peu de mots par minute une fois nettoyé : musique ou silence ;
   - boucle d'hallucination (« oh oh oh », même phrase x10) : part des groupes
     de 4 mots qui se répètent. Mesuré le 23/09 : 0,01 à 0,32 sur six vrais
     journaux, 0,83 à 0,98 sur les boucles captées ; seuil à 0,5. Le ratio de
     mots uniques, essayé d'abord, descendait à 0,35 sur un vrai journal. */
export function jugerSegment(texte, { duree_s, langue, proba, langues = ['fr'] } = {}) {
  const propre = retirerHallucinations(texte);
  const t = norm(propre.texte);
  const mots = t ? t.split(' ') : [];
  const minutes = Math.max(duree_s || 60, 1) / 60;
  const mots_min = Math.round(mots.length / minutes);
  const g4 = [];
  for (let i = 0; i + 4 <= mots.length; i++) g4.push(mots.slice(i, i + 4).join(' '));
  const repet = g4.length ? 1 - new Set(g4).size / g4.length : 0;
  const base = { texte: propre.texte, mots: mots.length, mots_min, repetition: Math.round(repet * 100) / 100 };
  if (langue && !langues.includes(langue)) return { ok: false, raison: `langue ${langue}`, ...base };
  if (proba != null && proba < 0.6) return { ok: false, raison: `langue incertaine (${proba})`, ...base };
  if (propre.part > 0.3) return { ok: false, raison: 'générique halluciné', ...base };
  if (mots_min < 60) return { ok: false, raison: 'peu de parole (musique ou silence)', ...base };
  if (mots.length >= 40 && repet > 0.5) return { ok: false, raison: 'boucle répétitive', ...base };
  return { ok: true, raison: '', ...base };
}

/* Heure locale "HH:MM" d'une date dans un fuseau donné. */
export function heureLocale(date, tz) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
export function jourLocal(date, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);  // AAAA-MM-JJ
}

/* Fenêtres qui démarrent dans le créneau courant du cron (tolérance en minutes). */
export function fenetresAOuvrir(station, date, tolMin = 5) {
  const [h, m] = heureLocale(date, station.tz).split(':').map(Number);
  const now = h * 60 + m;
  return (station.fenetres || []).filter(f => {
    const [fh, fm] = String(f.debut).split(':').map(Number);
    const d = now - (fh * 60 + fm);
    return d >= 0 && d < tolMin;
  });
}

/* ---------- Flux, enregistrement, transcription ---------- */

function stations() { return JSON.parse(readFileSync(STATIONS_PATH, 'utf8')).stations; }

/* Le flux d'une station change parfois : on redemande la redirection à Radio
   Garden à chaque capture, et on garde l'URL de l'inventaire en secours. */
async function fluxActuel(st) {
  try {
    const { stdout } = await run('curl', ['-s', '-m', '20', '-o', '/dev/null', '-D', '-', '-A', UA, '-H', 'Referer: https://radio.garden/', `https://radio.garden/api/ara/content/listen/${st.id}/channel.mp3`]);
    const loc = stdout.split('\n').find(l => l.toLowerCase().startsWith('location:'));
    if (loc) return loc.slice(loc.indexOf(':') + 1).trim();
  } catch { /* repli sur l'inventaire */ }
  return st.stream;
}

/* Enregistre `secondes` de flux en segments WAV 16 kHz mono horodatés.
   -reconnect : un flux qui décroche est relancé au lieu d'arrêter la capture. */
async function enregistrer(st, secondes) {
  const url = await fluxActuel(st);
  if (!url) throw new Error('aucun flux');
  const dir = join(SEG_DIR, st.id);
  mkdirSync(dir, { recursive: true });
  const avant = new Set(readdirSync(dir));
  await new Promise((ok, ko) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error',
      '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '10', '-rw_timeout', '15000000',
      '-user_agent', UA, '-i', url, '-t', String(secondes), '-ac', '1', '-ar', '16000',
      '-f', 'segment', '-segment_time', String(Math.min(SEGMENT_S, secondes)), '-strftime', '1', '-reset_timestamps', '1',
      join(dir, '%Y%m%d-%H%M%SZ.wav')], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, TZ: 'UTC' } });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    const garde = setTimeout(() => p.kill('SIGTERM'), (secondes + 90) * 1000);
    p.on('close', code => { clearTimeout(garde); code === 0 || readdirSync(dir).length > avant.size ? ok() : ko(new Error(`ffmpeg ${code} ${err.slice(0, 160)}`)); });
  });
  return readdirSync(dir).filter(f => f.endsWith('.wav') && !avant.has(f)).sort().map(f => join(dir, f));
}

async function duree(wav) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]);
  return Math.round(Number(stdout) || 0);
}

/* Whisper en détection automatique : on récupère la langue et sa probabilité
   dans le journal de whisper-cli, pour écarter les passages en langue nationale. */
async function transcrire(wav, langueForcee, modele = WHISPER_MODEL) {
  const args = ['-m', modele, '-t', WHISPER_THREADS, '-nt', '-l', langueForcee || 'auto', '-f', wav];
  // Verrou CPU commun (WHISPER_LOCK) : le 23/09, capture + sonde + studios en
  // parallèle ont porté la charge à 7 sur les 2 cœurs du VPS. Les enregistrements
  // restent à l'heure ; seules les transcriptions passent l'une après l'autre.
  const [bin, a] = process.env.WHISPER_LOCK ? ['flock', [process.env.WHISPER_LOCK, WHISPER_BIN, ...args]] : [WHISPER_BIN, args];
  const { stdout, stderr } = await run(bin, a, { maxBuffer: 64 * 1024 * 1024 });
  const m = /auto-detected language: (\w+) \(p = ([\d.]+)\)/.exec(stderr);
  return { texte: stdout.replace(/\s+/g, ' ').trim(), langue: m ? m[1] : langueForcee || null, proba: m ? Number(m[2]) : null };
}

/* Genre d'un passage : parler n'est pas informer (mesuré le 23/09 : du rap
   en français passait tous les garde-fous, une récitation coranique aussi).
   Mistral classe le passage ; sans clé, le genre reste inconnu. */
export const GENRES = ['journal', 'debat', 'musique', 'religieux', 'publicite', 'autre'];
async function genre(texte) {
  if (!process.env.MISTRAL_API_KEY || !texte) return null;
  const { mistral } = await import('./radio.mjs');
  const out = await mistral([
    { role: 'system', content: `Tu classes un extrait transcrit automatiquement d'une radio sahélienne. Genres possibles : journal (bulletin ou revue d'information, actualité), debat (émission de discussion, interview, talk-show), musique (chanson, paroles), religieux (prêche, récitation), publicite (annonce, spot), autre. Réponds en JSON : {"genre": "...", "sujet": "5 mots maximum sur le sujet, vide si musique"}.` },
    { role: 'user', content: texte.slice(0, 3000) }
  ]);
  return { genre: GENRES.includes(out.genre) ? out.genre : 'autre', sujet: String(out.sujet || '').slice(0, 80) };
}

/* ---------- Modes ---------- */

async function sonde(liste, secondes = 90) {
  mkdirSync(STATE, { recursive: true });
  const now = new Date();
  console.log(`[sonde] ${liste.length} stations, ${secondes} s chacune (${now.toISOString().slice(0, 16)} UTC)`);
  // Enregistrements en parallèle (réseau), transcriptions en série (CPU).
  const enr = await Promise.all(liste.map(st => enregistrer(st, secondes).then(f => ({ st, f })).catch(e => ({ st, e }))));
  for (const { st, f, e } of enr) {
    const mesure = { date: now.toISOString(), heure_locale: heureLocale(now, st.tz), station: st.id, nom: st.station, pays: st.pays };
    if (e || !f?.length) { Object.assign(mesure, { ok: false, raison: `capture : ${e?.message || 'vide'}` }); }
    else {
      const wav = f[0];
      const tr = await transcrire(wav, null, SONDE_MODEL);
      const v = jugerSegment(tr.texte, { duree_s: await duree(wav), langue: tr.langue, proba: tr.proba, langues: st.langues?.length ? st.langues : ['fr'] });
      Object.assign(mesure, { langue: tr.langue, proba: tr.proba, ...v, texte: v.texte.slice(0, 1500) });
      if (v.ok) { try { Object.assign(mesure, await genre(v.texte)); } catch (e) { mesure.genre_err = e.message; } }
      for (const x of f) rmSync(x, { force: true });
    }
    appendFileSync(SONDE_OUT, JSON.stringify(mesure) + '\n');
    const etat = !mesure.ok ? '  --  ' : (mesure.genre || 'PAROLE').toUpperCase().padEnd(9).slice(0, 9);
    console.log(`  ${etat} ${st.pays.padEnd(12)} ${String(st.station).slice(0, 30).padEnd(30)} ${mesure.heure_locale} ${String(mesure.langue || '').padEnd(3)} ${mesure.mots_min ?? '-'} mots/min ${mesure.raison || mesure.sujet || ''}`);
  }
}

/* Capture d'une station pendant `minutes`, puis transcription + garde-fous +
   extraction des faits. Seuls les segments jugés « parole en langue attendue »
   entrent dans le texte envoyé à Mistral. */
async function capter(st, minutes, motif) {
  const debut = new Date();
  console.log(`[capture] ${st.station} (${st.pays}) ${minutes} min, motif : ${motif}`);
  const segments = await enregistrer(st, minutes * 60);
  // FRANÇAIS SEULEMENT, volontairement. Mesuré le 23/09 sur « La Semaine sur
  // Kalangou » du 19/09, publiée en français ET en haoussa : Whisper rend le
  // haoussa en boucle (197 mots pour 12 min) ; KhayaAI/w2v-bert-hau le transcrit
  // correctement (1 824 mots), mais Mistral en tire des faits ABSENTS du journal
  // (poste frontalier, Tillabéri) au lieu du remaniement et du passeport AES de
  // l'édition française, et le contrôle d'extrait ne les rejette pas : l'extrait
  // haoussa existe bien, c'est son sens qui est inventé. Ne pas ajouter d'autre
  // langue sans une traduction fiable vers le français et une comparaison du même type.
  const langues = ['fr'];
  const retenus = [];
  let rejets = 0;
  for (const wav of segments) {
    // Détection automatique à chaque segment : un passage en langue nationale au
    // milieu d'un journal français est écarté au lieu d'être transcrit de force.
    const tr = await transcrire(wav, null);
    const v = jugerSegment(tr.texte, { duree_s: await duree(wav), langue: tr.langue, proba: tr.proba, langues });
    if (v.ok) retenus.push(v.texte); else rejets++;
    console.log(`   ${wav.split('/').pop()} : ${v.ok ? 'retenu' : 'rejeté (' + v.raison + ')'} ${v.mots_min} mots/min`);
    rmSync(wav, { force: true });
  }
  if (!retenus.length) { console.log('   aucun segment exploitable'); return null; }

  const texte = retenus.join(' ');
  // Transcription gardée dans l'état privé pour contrôle ; jamais publiée
  // (le contenu appartient à la station, seuls les faits et extraits courts sortent).
  const trDir = join(STATE, 'transcripts-direct');
  mkdirSync(trDir, { recursive: true });
  writeFileSync(join(trDir, `${st.id}-${debut.toISOString().slice(0, 16).replace(/[:T]/g, '')}.txt`), texte + '\n');
  const b = {
    studio: `${st.station} (direct)`,
    pays: st.pays,
    titre: `${motif} · ${heureLocale(debut, st.tz)} heure locale`,
    date: debut.toISOString(),
    page: st.page,
    audio: `direct:${st.id}:${debut.toISOString().slice(0, 16)}`,     // clé unique, pas de fichier réutilisable
    fichier: null,
    duree_s: retenus.length * SEGMENT_S,
    mots: texte.split(' ').length,
    direct: true,
    segments: { retenus: retenus.length, rejetes: rejets }
  };
  if (process.env.MISTRAL_API_KEY) {
    const { extractFacts } = await import('./radio.mjs');
    const ex = await extractFacts(texte, { studio: b.studio, pays: st.pays, date: b.date, audio: b.audio }, loadGazetteer());
    Object.assign(b, { resume: ex.resume, faits: ex.facts });
    console.log(`   ${ex.facts.length} faits retenus, ${ex.rejected} rejetés (extrait introuvable)`);
  }
  const prev = existsSync(LIVE_OUT) ? JSON.parse(readFileSync(LIVE_OUT, 'utf8')) : [];
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  writeFileSync(LIVE_OUT, JSON.stringify([b, ...prev.filter(x => Date.parse(x.date) >= cutoff && x.audio !== b.audio)], null, 1) + '\n');
  return b;
}

async function capturer() {
  const now = new Date();
  const faites = existsSync(DONE) ? JSON.parse(readFileSync(DONE, 'utf8')) : {};
  const aLancer = [];
  for (const st of stations()) {
    for (const f of fenetresAOuvrir(st, now)) {
      const cle = `${st.id}|${jourLocal(now, st.tz)}|${f.debut}`;
      if (faites[cle]) continue;
      faites[cle] = now.toISOString();
      aLancer.push(capter(st, f.minutes || 15, f.libelle || 'Journal').catch(e => console.warn(`[!] ${st.station} : ${e.message}`)));
    }
  }
  // Mémoire des fenêtres faites : 3 jours suffisent à éviter les doublons.
  const lim = Date.now() - 3 * 86400000;
  mkdirSync(STATE, { recursive: true });
  writeFileSync(DONE, JSON.stringify(Object.fromEntries(Object.entries(faites).filter(([, d]) => Date.parse(d) >= lim)), null, 1));
  if (!aLancer.length) return;
  await Promise.all(aLancer);
}

/* Heures de journal par station, déduites des sondes : une heure est retenue
   quand la sonde y a trouvé un journal au moins `min` fois, sur des jours
   différents. La fenêtre démarre à l'heure pile (les journaux sahéliens
   commencent à l'heure ; la sonde passe quelques minutes après). */
export function proposerFenetres(mesures, { min = 2 } = {}) {
  const par = new Map();
  for (const m of mesures) {
    if (!m.ok || m.genre !== 'journal' || !m.heure_locale) continue;
    const h = m.heure_locale.slice(0, 2);
    const cle = `${m.station}|${h}`;
    if (!par.has(cle)) par.set(cle, new Set());
    par.get(cle).add(String(m.date).slice(0, 10));
  }
  const out = {};
  for (const [cle, jours] of par) {
    if (jours.size < min) continue;
    const [station, h] = cle.split('|');
    (out[station] ||= []).push({ debut: `${h}:00`, minutes: 20, libelle: `Journal de ${Number(h)} h`, vu: jours.size });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.debut.localeCompare(b.debut));
  return out;
}

async function proposer(ecrire) {
  if (!existsSync(SONDE_OUT)) { console.log('[proposer] aucune sonde enregistrée'); return; }
  const mesures = readFileSync(SONDE_OUT, 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const jours = new Set(mesures.map(m => String(m.date).slice(0, 10)));
  const prop = proposerFenetres(mesures, { min: jours.size >= 2 ? 2 : 1 });
  const doc = JSON.parse(readFileSync(STATIONS_PATH, 'utf8'));
  console.log(`[proposer] ${mesures.length} mesures sur ${jours.size} jour(s)`);
  for (const st of doc.stations) {
    const f = prop[st.id];
    if (!f) continue;
    console.log(`  ${st.station} (${st.pays}) : ${f.map(x => `${x.debut} (vu ${x.vu} j)`).join(', ')}`);
    if (ecrire) st.fenetres = f.map(({ vu, ...x }) => x);
  }
  if (ecrire) { writeFileSync(STATIONS_PATH, JSON.stringify(doc, null, 1) + '\n'); console.log('[proposer] fenêtres écrites dans stations.json'); }
}

async function main() {
  mkdirSync(STATE, { recursive: true });
  const toutes = stations().filter(s => s.stream);
  if (flag('sonde')) {
    const ids = opt('stations', null);
    // Radios confessionnelles exclues par défaut (exclure_sonde) : pas d'information générale.
    return sonde(ids ? toutes.filter(s => ids.split(',').includes(s.id)) : toutes.filter(s => !s.exclure_sonde), Number(opt('secondes', 90)));
  }
  if (flag('capturer')) return capturer();
  if (flag('proposer')) return proposer(flag('ecrire'));
  if (flag('declencher')) {
    const pays = opt('pays', null);
    // Stations qui font de l'information : fenêtres connues, ou sonde ayant
    // déjà entendu un journal ou un débat en langue attendue.
    const infos = new Set();
    if (existsSync(SONDE_OUT)) for (const l of readFileSync(SONDE_OUT, 'utf8').trim().split('\n')) {
      try { const m = JSON.parse(l); if (m.ok && ['journal', 'debat'].includes(m.genre)) infos.add(m.station); } catch { /* ligne tronquée */ }
    }
    const cibles = toutes.filter(s => (!pays || s.pays === pays) && ((s.fenetres || []).length || infos.has(s.id)));
    if (!cibles.length) { console.log(`[declencher] aucune station d'information connue pour ${pays || 'le Sahel'} : laisser la sonde tourner`); return; }
    console.log(`[declencher] ${cibles.length} station(s) : ${cibles.map(s => s.station).join(', ')}`);
    return Promise.all(cibles.map(st => capter(st, Number(opt('minutes', 20)), opt('motif', 'Déclenchement sur événement'))));
  }
  const id = opt('station', null);
  if (id) {
    const st = toutes.find(s => s.id === id || s.station === id);
    if (!st) throw new Error(`station inconnue : ${id}`);
    return capter(st, Number(opt('minutes', 5)), opt('motif', 'Capture manuelle'));
  }
  console.log('Modes : --sonde | --capturer | --proposer [--ecrire] | --declencher --pays <Pays> | --station <id> --minutes <n>');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });

