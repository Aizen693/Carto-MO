#!/usr/bin/env node
/* Veille radio Sahel : journaux des studios -> transcription -> synthese.

   1. Lit le flux RSS de chaque studio (radio/sources.json) et repere les MP3
      de l'edition en francais (piece jointe ou lien dans l'article).
   2. Telecharge, convertit (ffmpeg) et transcrit en local (whisper.cpp) :
      gratuit, rien ne sort de la machine a cette etape.
   3. Mistral extrait les faits utiles et ecarte le bruit (sport, culture,
      sante generale...). Chaque fait doit citer un extrait MOT POUR MOT de la
      transcription ; le code verifie l'extrait et rejette tout fait dont
      l'extrait est introuvable (anti-hallucination).
   4. Synthese du jour : Mistral regroupe les faits des dernieres 24 h en
      points cles, chacun renvoyant aux faits sources par identifiant ; un
      point qui cite un identifiant inconnu est rejete.

   Sortie : radio/out/sahel-radio.json (bulletins + synthese du jour).

   Usage :
     node tools/veille/radio/radio.mjs                 # tous les studios, 2 derniers jours
     node tools/veille/radio/radio.mjs --studio yafa --max 1
     node tools/veille/radio/radio.mjs --since 5       # remonte 5 jours
     node tools/veille/radio/radio.mjs --no-ai         # transcription seule
     node tools/veille/radio/radio.mjs --digest-only   # refait la synthese du jour
     node tools/veille/radio/radio.mjs --publier       # + depot dans le bucket prive (premium)

   Prerequis : ffmpeg, whisper-cli (brew install whisper-cpp) et un modele
   ggml (WHISPER_MODEL, defaut ~/.cache/whisper/ggml-large-v3-turbo.bin) ;
   MISTRAL_API_KEY pour les etapes 3 et 4 ; SUPABASE_URL + SUPABASE_SERVICE_ROLE
   pour --publier (depot zones/sahel/radio.json, lisible des seuls abonnes
   premium par la RLS du bucket). WHISPER_THREADS : coeurs utilises (defaut 8). */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir, homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { UA, decodeEntities, stripTags } from '../lib/http.mjs';
import { normalize } from '../lib/classify.mjs';
import { geocode, loadGazetteer } from '../lib/geocode.mjs';

const run = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONF = JSON.parse(readFileSync(resolve(__dirname, 'sources.json'), 'utf8'));
const STATE_DIR = resolve(__dirname, 'state');
const TRANS_DIR = resolve(STATE_DIR, 'transcripts');
const OUT_DIR = resolve(__dirname, 'out');
const OUT = resolve(OUT_DIR, 'sahel-radio.json');

const argv = process.argv.slice(2);
const flag = n => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ONLY = opt('studio', null);
const SINCE_DAYS = Number(opt('since', 2));
const MAX = Number(opt('max', 6));            // fichiers audio max par studio et par passage
const KEEP_DAYS = Number(opt('keep', 14));     // retention des bulletins dans la sortie
const NO_AI = flag('no-ai');
const DIGEST_ONLY = flag('digest-only');
const PUBLISH = flag('publier');
const BUCKET_PATH = 'zones/sahel/radio.json';

const WHISPER_BIN = process.env.WHISPER_BIN || 'whisper-cli';
const WHISPER_MODEL = process.env.WHISPER_MODEL || join(homedir(), '.cache', 'whisper', 'ggml-large-v3-turbo.bin');
const WHISPER_THREADS = String(process.env.WHISPER_THREADS || 8);
const MISTRAL_MODEL = process.env.RADIO_MISTRAL_MODEL || 'mistral-small-latest';

/* ---------- 1. Flux RSS des studios ---------- */

export function parseStudioFeed(xml) {
  const items = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const tag = t => { const r = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(block); return r ? r[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : ''; };
    const audio = new Set();
    for (const e of block.matchAll(/<enclosure[^>]+url="([^"]+)"/g)) audio.add(e[1]);
    for (const e of block.matchAll(/https?:\/\/[^"'<>\s]+\.(?:mp3|m4a|aac)/gi)) audio.add(e[0]);
    items.push({
      title: decodeEntities(stripTags(tag('title'))),
      link: tag('link'),
      published_at: new Date(tag('pubDate')).toISOString(),
      audio: [...audio].filter(u => /\.(mp3|m4a|aac)$/i.test(u)).map(u => u.replace(/&amp;/g, '&'))
    });
  }
  return items;
}

/* Edition francaise : on teste le nom de fichier decode ; un meme fichier
   peut apparaitre encode (%C2%B0) et non encode, on dedoublonne. */
export function frenchAudio(urls, pattern) {
  const re = new RegExp(pattern, 'i');
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    let name;
    try { name = decodeURIComponent(u.split('/').pop()); } catch { name = u.split('/').pop(); }
    if (!re.test(name) || seen.has(name)) continue;
    seen.add(name);
    out.push({ url: encodeURI(decodeURI(u)), name });
  }
  return out;
}

/* ---------- 2. Transcription locale ---------- */

async function transcribe(url, id) {
  const cached = join(TRANS_DIR, `${id}.txt`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  const dir = join(tmpdir(), `radio-${id}`);
  mkdirSync(dir, { recursive: true });
  try {
    const mp3 = join(dir, 'in.mp3'), wav = join(dir, 'in.wav');
    await run('curl', ['-sL', '-m', '600', '-A', UA, '-o', mp3, url]);
    const { stdout: dur } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3, '-ac', '1', '-ar', '16000', wav]);
    const t0 = Date.now();
    const { stdout } = await run(WHISPER_BIN, ['-m', WHISPER_MODEL, '-l', 'fr', '-t', WHISPER_THREADS, '-nt', '-f', wav], { maxBuffer: 64 * 1024 * 1024 });
    const res = { text: stdout.replace(/\s+/g, ' ').trim(), duration_s: Math.round(Number(dur) || 0), transcribe_s: Math.round((Date.now() - t0) / 1000) };
    mkdirSync(TRANS_DIR, { recursive: true });
    writeFileSync(cached, JSON.stringify(res));
    return res;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ---------- 3. Extraction des faits (Mistral) ---------- */

const CATEGORIES = ['securite', 'humanitaire', 'politique', 'economie', 'societe'];

const EXTRACT_PROMPT = `Tu es analyste de veille sur le Sahel. On te donne la transcription automatique d'un journal radio d'un studio d'information local ({studio}, {pays}), diffuse le {date}.

Tache : extraire UNIQUEMENT les faits d'actualite utiles a un analyste (securite, humanitaire, politique, economie, societe si enjeu collectif). ECARTE le bruit : jingles, sport, culture, conseils de sante generaux, portraits, meteo, publicites, annonces de programme.

Regles strictes :
- N'invente rien. Chaque fait doit etre dit explicitement dans la transcription.
- "extrait" = une phrase COPIEE MOT POUR MOT de la transcription (8 a 30 mots), qui prouve le fait. Ne la reformule pas, ne corrige pas l'orthographe.
- "lieu" = la localite ou region citee (orthographe de la transcription), sinon "".
- "date_evenement" = seulement si elle est dite (AAAA-MM-JJ), sinon "".
- Un meme fait n'apparait qu'une fois.
- La transcription automatique peut deformer les noms propres : garde-les tels quels.

Reponds en JSON : {"resume": "2 phrases maximum sur l'essentiel du journal", "faits": [{"titre": "titre factuel court", "fait": "1 a 2 phrases neutres", "categorie": "securite|humanitaire|politique|economie|societe", "lieu": "", "pays": "", "date_evenement": "", "extrait": ""}]}
Si rien d'utile : {"resume": "", "faits": []}.`;

export async function mistral(messages, { model = MISTRAL_MODEL, temperature = 0.1 } = {}) {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error('MISTRAL_API_KEY absente');
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature, response_format: { type: 'json_object' }, messages })
    });
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`Mistral ${res.status}`);
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  }
  throw new Error('Mistral indisponible');
}

/* Verification de l'extrait : present tel quel (apres normalisation), ou au
   moins une sequence de 6 mots consecutifs identique dans la transcription. */
export function extractIsGrounded(extract, transcript, run = 6) {
  const e = normalize(extract), t = ` ${normalize(transcript)} `;
  if (!e || e.split(' ').length < 4) return false;
  if (t.includes(` ${e} `)) return true;
  const w = e.split(' ');
  if (w.length < run) return false;
  for (let i = 0; i + run <= w.length; i++) {
    if (t.includes(` ${w.slice(i, i + run).join(' ')} `)) return true;
  }
  return false;
}

export async function extractFacts(transcript, meta, gaz) {
  const prompt = EXTRACT_PROMPT.replace('{studio}', meta.studio).replace('{pays}', meta.pays).replace('{date}', meta.date.slice(0, 10));
  const out = await mistral([{ role: 'system', content: prompt }, { role: 'user', content: transcript.slice(0, 60000) }]);
  const facts = [];
  let rejected = 0;
  for (const f of Array.isArray(out.faits) ? out.faits : []) {
    if (!f || !f.fait || !extractIsGrounded(f.extrait || '', transcript)) { rejected++; continue; }
    const cat = CATEGORIES.includes(f.categorie) ? f.categorie : 'societe';
    const geo = geocode(`${f.lieu || ''} ${f.pays || meta.pays} ${f.fait}`, 'sahel', gaz);
    facts.push({
      id: createHash('sha1').update(`${meta.audio}|${normalize(f.extrait)}`).digest('hex').slice(0, 10),
      titre: String(f.titre || '').slice(0, 140),
      fait: String(f.fait).slice(0, 500),
      categorie: cat,
      lieu: f.lieu || '',
      pays: f.pays || meta.pays,
      date_evenement: /^\d{4}-\d{2}-\d{2}$/.test(f.date_evenement || '') ? f.date_evenement : '',
      extrait: String(f.extrait).slice(0, 400),
      geo: geo ? { name: geo.name, lat: geo.lat, lon: geo.lon, country: geo.country, precision: geo.precision } : null
    });
  }
  return { resume: String(out.resume || '').slice(0, 600), facts, rejected };
}

/* ---------- 3 bis. Recoupement ---------- */

/* Un fait radio est « recoupé » quand une AUTRE source signale un événement
   au même endroit (30 km) à ±3 jours : un autre studio ou une note OSINT de la
   veille géopolitique (fil public : lieu, date, titre, lien). Même zone et
   même période ne prouvent pas le même événement (mesuré le 23/09 : des
   attaques contre les FAMa à Sévaré rapprochées de frappes FAMa près de
   Mopti) ; l'affichage dit donc « même zone, même période », jamais
   « confirmé ». On ne compare que des localités, jamais des pays. Pure. */
const kmEntre = (a, b) => {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};
export function recouper(bulletins, notes = [], { rayonKm = 30, jours = 3 } = {}) {
  const fenetre = jours * 86400e3;
  const tous = bulletins.flatMap(b => (b.faits || []).filter(f => f.geo).map(f => ({ f, b, t: Date.parse(f.date_evenement || b.date) })));
  for (const { f, b, t } of tous) {
    const rec = [];
    for (const o of tous) {
      if (o.b.studio === b.studio || o.f.id === f.id) continue;
      if (Math.abs(o.t - t) > fenetre || kmEntre(f.geo, o.f.geo) > rayonKm) continue;
      if (rec.some(r => r.source === o.b.studio)) continue;
      rec.push({ type: 'radio', source: o.b.studio, titre: o.f.titre, date: o.b.date.slice(0, 10) });
    }
    for (const n of notes) {
      const lat = Number(n.lat), lon = Number(n.lon);
      if (!isFinite(lat) || !isFinite(lon) || (!lat && !lon)) continue;
      const tn = Date.parse(String(n.date).length === 10 ? `${n.date}T12:00:00Z` : n.date);
      if (Math.abs(tn - t) > fenetre || kmEntre(f.geo, { lat, lon }) > rayonKm) continue;
      if (rec.filter(r => r.type === 'osint').length >= 3) break;
      rec.push({ type: 'osint', source: n.source || 'Veille OSINT', titre: String(n.titre || '').slice(0, 140), date: String(n.date).slice(0, 10), url: /^https?:\/\//.test(n.source_url || '') ? n.source_url : null });
    }
    f.recoupements = rec;
    f.recoupe = rec.length > 0;
  }
  return bulletins;
}

const FIL_VEILLE = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co/functions/v1/veille-feed/notifications.json';
/* Le fil public ne porte plus de coordonnées (lat/lon null depuis la v2 du
   23/09) : on géolocalise le champ « lieu » avec le gazetteer, au niveau
   localité seulement (« Mali » ou « Burkina Faso » ne recoupent rien). */
async function notesOsint(gaz) {
  try {
    const r = await fetch(FIL_VEILLE, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return [];
    const d = await r.json();
    return (Array.isArray(d) ? d : d.items || []).filter(n => n.theatre === 'sahel').map(n => {
      if (isFinite(Number(n.lat)) && n.lat !== null && n.lon !== null) return n;
      const g = geocode(String(n.lieu || ''), 'sahel', gaz);
      return g && g.precision !== 'region' ? { ...n, lat: g.lat, lon: g.lon } : n;
    });
  } catch { return []; }
}

/* ---------- 4. Synthese du jour ---------- */

const DIGEST_PROMPT = `Tu rediges la synthese radio du jour pour un analyste Sahel, a partir de faits deja extraits et verifies de journaux de radios locales. Chaque fait a un identifiant.

Regles :
- N'ajoute AUCUNE information absente des faits fournis.
- Regroupe les faits qui parlent du meme evenement (plusieurs studios = meme fait confirme).
- Un fait avec un champ "recoupe" non vide : une autre source (autre radio ou note OSINT) signale un evenement AU MEME ENDROIT a quelques jours pres. Ce n'est PAS forcement le meme evenement : n'ecris jamais "confirme". A importance egale, place-le en tete.
- 3 a 7 points cles maximum, du plus important (securite, humanitaire) au moins important.
- Ton neutre et factuel, sans speculation, sans tiret de ponctuation.
- Chaque point cite les identifiants des faits qui le fondent.

Reponds en JSON : {"titre": "titre factuel de la journee", "points": [{"texte": "1 a 2 phrases", "faits": ["id1", "id2"]}]}`;

async function digest(bulletins) {
  const since = Date.now() - 36 * 3600 * 1000;
  const recent = bulletins.filter(b => Date.parse(b.date) >= since);
  const facts = recent.flatMap(b => b.faits.filter(f => f.categorie !== 'societe').map(f => ({ id: f.id, studio: b.studio, categorie: f.categorie, lieu: f.lieu, pays: f.pays, fait: f.fait, recoupe: (f.recoupements || []).map(r => r.source) })));
  if (facts.length === 0) return null;
  const ids = new Set(facts.map(f => f.id));
  const out = await mistral([{ role: 'system', content: DIGEST_PROMPT }, { role: 'user', content: JSON.stringify(facts) }], { temperature: 0.2 });
  const points = (Array.isArray(out.points) ? out.points : [])
    .map(p => ({ texte: String(p.texte || '').slice(0, 500), faits: (p.faits || []).filter(id => ids.has(id)) }))
    .filter(p => p.texte && p.faits.length > 0); // un point sans fait source verifie est rejete
  return {
    date: new Date().toISOString(),
    titre: String(out.titre || 'Synthese radio du jour').slice(0, 160),
    points,
    sources: [...new Set(recent.map(b => b.studio))],
    nb_faits: facts.length
  };
}

/* ---------- Orchestration ---------- */

async function main() {
  const gaz = loadGazetteer();
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { bulletins: [] };
  const known = new Map(prev.bulletins.map(b => [b.audio, b]));
  const since = Date.now() - SINCE_DAYS * 86400000;

  if (!DIGEST_ONLY) {
    for (const s of CONF.studios) {
      if (ONLY && s.id !== ONLY) continue;
      let items;
      try {
        const { stdout } = await run('curl', ['-sL', '-m', '30', '-A', UA, s.feed], { maxBuffer: 32 * 1024 * 1024 });
        items = parseStudioFeed(stdout);
      } catch (e) { console.warn(`[!] ${s.label} : flux illisible (${e.message})`); continue; }

      let done = 0;
      const skip = s.skip_title ? new RegExp(s.skip_title, 'i') : null;
      const only = s.only_title ? new RegExp(s.only_title, 'i') : null;
      for (const it of items) {
        if (Date.parse(it.published_at) < since) continue;
        if (skip && skip.test(it.title)) continue;
        if (only && !only.test(it.title)) continue;
        for (const a of frenchAudio(it.audio, s.lang_pattern)) {
          if (done >= MAX) break;
          if (known.has(a.url) && (NO_AI || known.get(a.url).faits)) continue;
          const id = createHash('sha1').update(a.url).digest('hex').slice(0, 12);
          try {
            const tr = await transcribe(a.url, id);
            console.log(`[${s.id}] ${a.name} : ${tr.duration_s} s d'audio, transcrit en ${tr.transcribe_s} s`);
            const b = { studio: s.label, pays: s.pays, titre: it.title, date: it.published_at, page: it.link, audio: a.url, fichier: a.name, duree_s: tr.duration_s, mots: tr.text.split(' ').length };
            if (!NO_AI) {
              const ex = await extractFacts(tr.text, { studio: s.label, pays: s.pays, date: it.published_at, audio: a.url }, gaz);
              Object.assign(b, { resume: ex.resume, faits: ex.facts });
              console.log(`         ${ex.facts.length} faits retenus, ${ex.rejected} rejetes (extrait introuvable)`);
            }
            known.set(a.url, b);
            done++;
          } catch (e) {
            console.warn(`[!] ${s.id} ${a.name} : ${e.message}`);
          }
        }
      }
    }
  }

  // Journaux captés en direct sur les radios (live.mjs) : fusionnés ici pour
  // entrer dans la même synthèse et le même dépôt.
  const LIVE = resolve(STATE_DIR, 'live-bulletins.json');
  if (existsSync(LIVE)) {
    try { for (const b of JSON.parse(readFileSync(LIVE, 'utf8'))) known.set(b.audio, b); }
    catch (e) { console.warn(`[!] live-bulletins.json illisible : ${e.message}`); }
  }

  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  const bulletins = [...known.values()].filter(b => Date.parse(b.date) >= cutoff).sort((a, b) => b.date.localeCompare(a.date));
  recouper(bulletins, await notesOsint(gaz));
  let synth = prev.synthese || null;
  if (!NO_AI) {
    try { synth = await digest(bulletins.filter(b => b.faits)) || synth; }
    catch (e) { console.warn(`[!] synthese du jour : ${e.message}`); }
  }
  const body = JSON.stringify({ generated: new Date().toISOString(), synthese: synth, bulletins }, null, 1) + '\n';
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, body);
  console.log(`[radio] ${bulletins.length} bulletins, synthese : ${synth ? synth.points.length + ' points' : 'aucune'} -> ${OUT}`);
  if (PUBLISH) await publish(body);
}

/* Depot dans le bucket prive : la page premium le lit via algorAuth.loadZoneFile.
   cache-control court : par defaut Supabase sert 1 h de cache et l'abonne
   verrait l'ancienne synthese. */
async function publish(body) {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE absents');
  const r = await fetch(`${url}/storage/v1/object/${BUCKET_PATH}`, {
    method: 'POST', body, signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json', 'x-upsert': 'true', 'cache-control': 'max-age=120' }
  });
  if (!r.ok) throw new Error(`depot ${BUCKET_PATH} : HTTP ${r.status}`);
  console.log(`[radio] publie dans ${BUCKET_PATH}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exitCode = 1; });
}
