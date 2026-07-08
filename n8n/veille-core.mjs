// === Moteur de veille (corroboration OSINT/HUMINT), reutilisable ===
// Importe par corroboration.mjs (CLI) et serveur.mjs (HTTP). Aucun effet de bord
// a l'import (pas de run). Meme logique validee que corroboration-standalone.mjs.
// Cles via ./.env ou environnement. Node 18+.

import { readFileSync } from 'node:fs';

function loadDotEnv() {
  try {
    for (const line of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      if (process.env[m[1]] == null) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (e) { /* pas de .env */ }
}
loadDotEnv();

export const CONFIG = {
  mistralKey: process.env.MISTRAL_API_KEY || '',
  braveKey: process.env.BRAVE_API_KEY || '',
  googleKey: process.env.GOOGLE_API_KEY || '',
  useGoogleFallback: String(process.env.USE_GOOGLE_FALLBACK || 'false').toLowerCase() === 'true',
  seuil: Number(process.env.CORROB_SEUIL || 0.7),
};

const MODEL_BY_TASK = { extract: 'mistral-small-latest', gather: 'mistral-small-latest', judge: 'mistral-small-latest', synthesis: 'mistral-large-latest' };
const pickModel = (t) => MODEL_BY_TASK[t] || 'mistral-small-latest';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const statusOf = (e) => { const m = String((e && e.message) || '').match(/\b(429|5\d\d)\b/); return Number((e && (e.status || e.statusCode)) || (m && m[1]) || 0); };
async function fetchT(url, opts = {}, ms = 25000) { const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms); try { return await fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(t); } }
export function parseJSON(txt, fb) {
  if (txt == null) return fb;
  let s = String(txt).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch (e) { const m = s.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (e2) {} } return fb; }
}

async function mistralChat({ task, system, user, temperature = 0.2 }) {
  if (!CONFIG.mistralKey) throw new Error('MISTRAL_API_KEY manquante');
  const body = { model: pickModel(task), temperature, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  for (let a = 0; a < 3; a++) {
    await sleep(250);
    try {
      const res = await fetchT('https://api.mistral.ai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + CONFIG.mistralKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const e = new Error('mistral ' + res.status); e.status = res.status; throw e; }
      const data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    } catch (e) { const c = statusOf(e); if ((c === 429 || (c >= 500 && c < 600)) && a < 2) { await sleep(1500 * (a + 1)); continue; } if (a >= 2) return ''; }
  }
  return '';
}

let braveLast = 0;
async function braveSearch(query, { count = 5, country = 'fr', lang = 'fr' } = {}) {
  if (!CONFIG.braveKey) throw new Error('BRAVE_API_KEY manquante');
  const wait = 1100 - (Date.now() - braveLast); if (wait > 0) await sleep(wait); braveLast = Date.now();
  try {
    const qs = new URLSearchParams({ q: query, count: String(count), country, search_lang: lang });
    const r = await fetchT('https://api.search.brave.com/res/v1/web/search?' + qs, { headers: { 'X-Subscription-Token': CONFIG.braveKey, Accept: 'application/json' } });
    if (!r.ok) return [];
    const data = await r.json();
    return ((data.web && data.web.results) || []).map((it) => ({ source: (it.meta_url && it.meta_url.hostname) || 'web', titre: it.title || '', url: it.url || '', extrait: it.description || '', date: it.page_age || it.age || '' }));
  } catch (e) { return []; }
}

async function googleGround(query) {
  if (!CONFIG.useGoogleFallback || !CONFIG.googleKey) return [];
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + CONFIG.googleKey;
    const r = await fetchT(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Sources publiques recentes sur: ' + query }] }], tools: [{ google_search: {} }] }) });
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

const toDate = (s) => { if (!s) return null; let m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]); m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return new Date(+m[3], +m[2] - 1, +m[1]); return null; };
const tokens = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
function prefilter(point, candidates) {
  const keys = new Set([...tokens((point.pays || '').split('-').pop()), ...tokens(point.actor)]);
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

const QGEN_SYS = ["Tu es analyste OSINT. A partir d'un renseignement, genere 2 a 3 requetes de recherche web courtes (francais ET anglais) pour retrouver CET evenement precis dans la presse, ACLED, rapports ONU ou trackers OSINT.", 'Vise les mots-cles distinctifs (lieu, acteur, nature du fait), pas la date. Reponds en JSON strict: {"requetes":["",""]}.'].join(' ');
const JUDGE_SYS = ['Tu es analyste OSINT. On te donne un incident HUMINT et des candidats publics.', 'corrobore=true seulement si au moins un candidat rapporte le MEME evenement: meme lieu, date a plus ou moins 3 jours, acteur ou type coherent.', "Meme region ou meme conflit mais autre evenement = rejet. N'invente jamais d'URL: utilise uniquement les URL des candidats.", 'texte_reformule: reecris le fait en version publiable OSINT, attribuee aux sources ("selon ..."), sans aucun detail que seule une source humaine pourrait connaitre.', 'Reponds en JSON strict: {"corrobore":bool,"confiance":0..1,"sources":[{"nom":"","url":"","date":""}],"texte_reformule":"","raison":""}.'].join(' ');
const PARSE_SYS = 'Tu recois le texte brut d\'un bulletin de veille securitaire. Extrait CHAQUE incident. Reponds en JSON strict: {"incidents":[{"pays":"","date":"","lieu":"","acteur":"","type":"","fait":"phrase factuelle"}]}. Garde la date telle quelle. Pas de texte hors JSON.';

function queriesMecaniques(p) {
  const lieu = (p.pays || '').split('-').pop().trim();
  return [[p.actor, lieu, p.date].filter(Boolean).join(' ').trim() || p.fait.slice(0, 60), [lieu, p.type].filter(Boolean).join(' ').trim()].filter(Boolean);
}
async function genQueries(p) {
  const j = parseJSON(await mistralChat({ task: 'gather', system: QGEN_SYS, user: JSON.stringify({ acteur: p.actor, type: p.type, lieu: p.pays, date: p.date, fait: p.fait }) }), null);
  const q = (j && Array.isArray(j.requetes)) ? j.requetes.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3) : [];
  return q.length ? q : queriesMecaniques(p);
}

// Extrait des incidents structures depuis un bulletin brut (texte -> points).
export async function extractIncidents(texte, zone = '') {
  const j = parseJSON(await mistralChat({ task: 'extract', system: PARSE_SYS, user: String(texte || '').slice(0, 12000) }), null);
  const arr = (j && Array.isArray(j.incidents)) ? j.incidents : [];
  return arr.map((it, i) => ({ id: i + 1, zone, actor: it.acteur || '', type: it.type || '', date: it.date || '', pays: it.pays || it.lieu || '', fait: it.fait || '' }));
}

// Corrobore un point HUMINT. Renvoie {id,corrobore,confiance,sources,texte_reformule,raison,...}.
export async function corroborate(p) {
  const cand = prefilter(p, await findSources(await genQueries(p)));
  if (!cand.length) return { id: p.id, zone: p.zone, lieu: p.pays, corrobore: false, confiance: 0, sources: [], raison: 'aucune source' };
  const j = parseJSON(await mistralChat({ task: 'judge', system: JUDGE_SYS, user: JSON.stringify({ incident: { acteur: p.actor, type: p.type, date: p.date, lieu: p.pays, fait: p.fait }, candidats: cand }) }), null);
  const conf = j ? Number(j.confiance || 0) : 0;
  const srcJudge = (j && j.corrobore) ? (j.sources || []).filter((s) => s && /^https?:/i.test(s.url || '')) : [];
  const ok = !!(srcJudge.length && conf >= CONFIG.seuil);
  return { id: p.id, zone: p.zone, acteur: p.actor, type: p.type, date: p.date, lieu: p.pays, corrobore: ok, confiance: conf, sources: ok ? srcJudge : [], texte_reformule: (j && j.texte_reformule) || '', raison: (j && j.raison) || (ok ? '' : 'sous le seuil ou sans source') };
}

// Corrobore une liste, chaque point isole. Renvoie {total,nb_corrobores,taux_pct,resultats}.
export async function corroborateBatch(points, onProgress) {
  const resultats = [];
  for (const p of points) {
    let r;
    try { r = await corroborate(p); }
    catch (e) { r = { id: p.id, zone: p.zone, lieu: p.pays, corrobore: false, confiance: 0, sources: [], raison: 'erreur: ' + ((e && e.message) || e) }; }
    resultats.push(r);
    if (onProgress) onProgress(r);
  }
  const nb = resultats.filter((r) => r.corrobore).length;
  return { total: points.length, nb_corrobores: nb, taux_pct: points.length ? Math.round((nb / points.length) * 100) : 0, resultats };
}

export const POINTS_TEST = [
  { id: 21, zone: 'rdc', actor: 'UN', type: 'Divers Informations', date: '20/12/2025', pays: 'RDC - Kinshasa', fait: "Le Conseil de securite de l'ONU a vote a l'unanimite la prolongation d'un an du mandat de la MONUSCO, jusqu'au 20 decembre 2026." },
  { id: 41, zone: 'sahel', actor: 'EIGS', type: 'Assassinat', date: '2026-01-18', pays: 'Niger - Yatakala', fait: "Le 18/01 des combattants de l'EIGS ont assassine 31 civils dans le hameau de Bossi, pres du village de Yatakala commune de Goroual." },
];
