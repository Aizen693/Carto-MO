// === Corroboration OSINT/HUMINT autonome (1 seul fichier, pour le VPS) ===
// Zero Sonnet. Brave recupere, pre-filtre JS, Mistral small juge puis verifie
// sur extraits. Google seulement si USE_GOOGLE_FALLBACK=true.
//
// Cles lues dans ./.env (meme dossier) ou variables d'environnement systeme.
// Usage:  node corroboration.mjs [points.json] [sortie.json]
//         sans argument -> utilise les 5 points de test integres.
// Node 18+.

import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

/* -------- .env local (KEY="valeur"), pour ne jamais taper de cle en commande -------- */
function loadDotEnv() {
  try {
    for (const line of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      if (process.env[m[1]] == null) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (e) { /* pas de .env: on retombe sur l'environnement systeme */ }
}
loadDotEnv();

const CONFIG = {
  mistralKey: process.env.MISTRAL_API_KEY || '',
  braveKey: process.env.BRAVE_API_KEY || '',
  googleKey: process.env.GOOGLE_API_KEY || '',
  useGoogleFallback: String(process.env.USE_GOOGLE_FALLBACK || 'false').toLowerCase() === 'true',
  seuil: Number(process.env.CORROB_SEUIL || 0.7),
};

/* -------- Routage modele par tache -------- */
const MODEL_BY_TASK = { judge: 'mistral-small-latest', verify: 'mistral-small-latest', synthesis: 'mistral-large-latest' };
function pickModel(task) { return MODEL_BY_TASK[task] || 'mistral-small-latest'; }

/* -------- Helpers -------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function statusOf(e) { const m = String((e && e.message) || '').match(/\b(429|5\d\d)\b/); return Number((e && (e.status || e.statusCode)) || (m && m[1]) || 0); }
function parseJSON(txt, fb) {
  if (txt == null) return fb;
  let s = String(txt).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch (e) { const m = s.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (e2) {} } return fb; }
}

/* -------- Mistral (tout le langage) -------- */
async function mistralChat({ task, system, user, temperature = 0.2 }) {
  if (!CONFIG.mistralKey) throw new Error('MISTRAL_API_KEY manquante (verifie ton .env)');
  const body = { model: pickModel(task), temperature, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  for (let a = 0; a < 3; a++) {
    await sleep(250);
    try {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + CONFIG.mistralKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const e = new Error('mistral ' + res.status); e.status = res.status; throw e; }
      const data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    } catch (e) { const c = statusOf(e); if ((c === 429 || (c >= 500 && c < 600)) && a < 2) { await sleep(1500 * (a + 1)); continue; } if (a >= 2) return ''; }
  }
  return '';
}

/* -------- Brave (recherche, grounding principal) -------- */
let braveLast = 0;
async function braveSearch(query, { count = 5, country = 'fr', lang = 'fr' } = {}) {
  if (!CONFIG.braveKey) throw new Error('BRAVE_API_KEY manquante (verifie ton .env)');
  const wait = 1100 - (Date.now() - braveLast); if (wait > 0) await sleep(wait); braveLast = Date.now();
  try {
    const qs = new URLSearchParams({ q: query, count: String(count), country, search_lang: lang });
    const r = await fetch('https://api.search.brave.com/res/v1/web/search?' + qs, { headers: { 'X-Subscription-Token': CONFIG.braveKey, Accept: 'application/json' } });
    if (!r.ok) return [];
    const data = await r.json();
    return ((data.web && data.web.results) || []).map((it) => ({ source: (it.meta_url && it.meta_url.hostname) || 'web', titre: it.title || '', url: it.url || '', extrait: it.description || '', date: it.page_age || it.age || '' }));
  } catch (e) { return []; }
}

/* -------- Google Gemini (grounding de SECOURS, coupable) -------- */
async function googleGround(query) {
  if (!CONFIG.useGoogleFallback || !CONFIG.googleKey) return [];
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + CONFIG.googleKey;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Sources publiques recentes sur: ' + query }] }], tools: [{ google_search: {} }] }) });
    if (!r.ok) return [];
    const data = await r.json();
    const chunks = (((data.candidates || [])[0] || {}).groundingMetadata || {}).groundingChunks || [];
    return chunks.map((c) => ({ source: (c.web && c.web.title) || 'google', titre: (c.web && c.web.title) || '', url: (c.web && c.web.uri) || '', extrait: '', date: '' })).filter((c) => c.url);
  } catch (e) { return []; }
}

async function findSources(queries) {
  const seen = new Set(); const out = [];
  for (const q of queries) for (const c of await braveSearch(q)) if (c.url && !seen.has(c.url)) { seen.add(c.url); out.push(c); }
  if (!out.length && CONFIG.useGoogleFallback) for (const c of await googleGround(queries[0])) if (c.url && !seen.has(c.url)) { seen.add(c.url); out.push(c); }
  return out;
}

/* -------- Pre-filtre JS (date +/- 5j, chevauchement lieu/acteur) -------- */
function toDate(s) { if (!s) return null; let m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]); m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return new Date(+m[3], +m[2] - 1, +m[1]); return null; }
function tokens(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((t) => t.length >= 4); }
function prefilter(point, candidates) {
  const lieu = (point.pays || '').split('-').pop();
  const keys = new Set([...tokens(lieu), ...tokens(point.actor)]);
  const pd = toDate(point.date);
  const scored = candidates.map((c) => {
    const hay = (c.titre + ' ' + c.extrait).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let score = 0; for (const k of keys) if (hay.includes(k)) score++;
    const cd = toDate(c.date); if (pd && cd && Math.abs(cd - pd) <= 6 * 864e5) score += 2;
    return { c, score };
  });
  const kept = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.c);
  return (kept.length ? kept : candidates.slice(0, 5)).slice(0, 8);
}

const JUDGE_SYS = ['Tu es analyste OSINT. On te donne un incident HUMINT et des candidats publics.', 'corrobore=true seulement si au moins un candidat rapporte le MEME evenement: meme lieu, date a plus ou moins 3 jours, acteur ou type coherent.', "Meme region ou meme conflit mais autre evenement = rejet. N'invente jamais d'URL: utilise uniquement les URL des candidats.", 'texte_reformule: reecris le fait en version publiable OSINT, attribuee aux sources ("selon ..."), sans aucun detail que seule une source humaine pourrait connaitre.', 'Reponds en JSON strict: {"corrobore":bool,"confiance":0..1,"sources":[{"nom":"","url":"","date":""}],"texte_reformule":"","raison":""}.'].join(' ');
const VERIFY_SYS = ['Verification adversariale OSINT. Sois sceptique par defaut: ton role est de REFUTER les correspondances faibles.', "On te donne un incident HUMINT et des sources retenues avec leurs extraits.", 'Sur la seule base des extraits fournis, garde une source uniquement si elle rapporte le MEME evenement: meme lieu, date a plus ou moins 3 jours, acteur ou type coherent. Meme region mais autre evenement = rejet.', 'corrobore=true seulement si au moins une source resiste. sources_validees ne contient QUE les URL fournies confirmees.', 'Reponds en JSON strict: {"corrobore":bool,"confiance":0..1,"sources_validees":[{"nom":"","url":"","date":""}],"raison":""}.'].join(' ');

function queriesFor(p) {
  const lieu = (p.pays || '').split('-').pop().trim();
  const base = [p.actor, lieu, p.date].filter(Boolean).join(' ').trim();
  const alt = [lieu, p.type].filter(Boolean).join(' ').trim();
  return [base || p.fait.slice(0, 60), alt].filter(Boolean);
}

async function corroborate(p) {
  const cand = prefilter(p, await findSources(queriesFor(p)));
  if (!cand.length) return { id: p.id, zone: p.zone, lieu: p.pays, corrobore: false, confiance: 0, sources: [], raison: 'aucune source' };
  const j = parseJSON(await mistralChat({ task: 'judge', system: JUDGE_SYS, user: JSON.stringify({ incident: { acteur: p.actor, type: p.type, date: p.date, lieu: p.pays, fait: p.fait }, candidats: cand }) }), null);
  const conf = j ? Number(j.confiance || 0) : 0;
  const srcJudge = (j && j.corrobore) ? (j.sources || []).filter((s) => s && /^https?:/i.test(s.url || '')) : [];
  if (!srcJudge.length || conf < CONFIG.seuil) return { id: p.id, zone: p.zone, lieu: p.pays, corrobore: false, confiance: conf, sources: [], texte_reformule: (j && j.texte_reformule) || '', raison: (j && j.raison) || 'sous le seuil' };
  const retenus = cand.filter((c) => srcJudge.some((s) => s.url === c.url));
  const v = parseJSON(await mistralChat({ task: 'verify', system: VERIFY_SYS, user: JSON.stringify({ incident: { acteur: p.actor, type: p.type, date: p.date, lieu: p.pays, fait: p.fait }, sources: retenus.length ? retenus : srcJudge }) }), null);
  const ok = !!(v && v.corrobore && (v.sources_validees || []).length);
  return { id: p.id, zone: p.zone, acteur: p.actor, type: p.type, date: p.date, lieu: p.pays, corrobore: ok, confiance: ok ? Number(v.confiance || conf) : conf, sources: ok ? v.sources_validees : [], texte_reformule: (j && j.texte_reformule) || '', raison: ok ? (v.raison || '') : ('refute a la verif: ' + ((v && v.raison) || 'aucune source resistante')) };
}

/* -------- 5 points de test integres (utilises si aucun fichier passe) -------- */
const POINTS_TEST = [
  { id: 21, zone: 'rdc', actor: 'UN', type: 'Divers Informations', date: '20/12/2025', pays: 'RDC - Kinshasa', fait: "Le Conseil de securite de l'ONU a vote a l'unanimite la prolongation d'un an du mandat de la MONUSCO, jusqu'au 20 decembre 2026." },
  { id: 5, zone: 'rdc', actor: 'GAT', type: 'Attaque', date: '18/12/2025', pays: 'RDC - Bamande', fait: "Des combattants des ADF (affiliees a l'Etat islamique) ont attaque une patrouille mixte des FARDC et de l'UPDF a proximite de Bamande (66KM/SO de Bunia)." },
  { id: 41, zone: 'sahel', actor: 'EIGS', type: 'Assassinat', date: '2026-01-18', pays: 'Niger - Yatakala', fait: "Le 18/01 des combattants de l'EIGS ont assassine 31 civils dans le hameau de Bossi, pres du village de Yatakala commune de Goroual." },
  { id: 43, zone: 'sahel', actor: 'GSIM', type: 'Attaque', date: '2026-01-08', pays: 'Benin - Mekrou', fait: "Le 08/01, des combattants du GSIM ont attaque le poste militaire de Mekrou. L'attaque a ete repoussee, 06 combattants tues." },
  { id: 49, zone: 'sahel', actor: 'FAMA', type: 'Liberation', date: '2026-03-18', pays: 'Mali - Bamako', fait: "Dans la nuit du 18 au 19/03, la junte a libere plus de 200 prisonniers detenus a l'ANSE, dont des proches du GSIM et des civils." },
];

/* -------- Run -------- */
const inPath = process.argv[2] || '';
const outPath = process.argv[3] || 'corroboration-out.json';
const points = inPath ? JSON.parse(await readFile(inPath, 'utf8')) : POINTS_TEST;

console.log('Corroboration de ' + points.length + ' points (Brave + Mistral small, Google fallback=' + CONFIG.useGoogleFallback + ').');
const resultats = [];
for (const p of points) {
  const r = await corroborate(p);
  resultats.push(r);
  console.log((r.corrobore ? 'OK ' : '.. ') + '#' + r.id + ' ' + (r.lieu || r.zone) + '  conf=' + (r.confiance || 0).toFixed(2));
}
const nb = resultats.filter((r) => r.corrobore).length;
const taux = points.length ? Math.round((nb / points.length) * 100) : 0;
await writeFile(outPath, JSON.stringify({ total: points.length, nb_corrobores: nb, taux_pct: taux, resultats }, null, 2));
console.log('Termine: ' + nb + '/' + points.length + ' corrobores (' + taux + '%). -> ' + outPath);
