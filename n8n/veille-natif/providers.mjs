// === Routage multi-API de la veille (Mistral + Brave + Google en filet) ===
// Source unique de verite pour: quel modele pour quelle tache, et quelle API pour quoi.
// Objectif: cout minimal, RGPD d'abord (Mistral EU fait tout le langage, Brave la recherche,
// Google seulement en secours et coupable par flag).
//
// Cles via variables d'environnement (jamais en dur):
//   MISTRAL_API_KEY   obligatoire  (langage)
//   BRAVE_API_KEY     obligatoire  (recherche de sources)
//   GOOGLE_API_KEY    optionnel    (grounding de secours, Gemini)
//   USE_GOOGLE_FALLBACK  "true"/"false"  (defaut false -> 100% Mistral + Brave)
//
// Node 18+ (fetch global). Aucune dependance.

// Charge n8n/.env s'il existe (KEY="valeur"), pour ne jamais taper de cle en commande.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
function loadDotEnv() {
  try {
    const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env'); // n8n/.env
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim().replace(/^["']|["']$/g, '');
      if (process.env[key] == null) process.env[key] = val;
    }
  } catch (e) { /* pas de .env: on retombe sur les variables d'environnement systeme */ }
}
loadDotEnv();

const ENV = (typeof process !== 'undefined' && process.env) || {};

export const CONFIG = {
  mistralKey: ENV.MISTRAL_API_KEY || '',
  braveKey: ENV.BRAVE_API_KEY || '',
  googleKey: ENV.GOOGLE_API_KEY || '',
  useGoogleFallback: String(ENV.USE_GOOGLE_FALLBACK || 'false').toLowerCase() === 'true',
  seuil: Number(ENV.CORROB_SEUIL || 0.7),
};

// --- Routage modele par tache -------------------------------------------------
// Tout le mecanique -> mistral-small (0,10/0,30 EUR le M). Seule la synthese
// decisionnelle merite le grand modele (2/6 EUR le M).
const MODEL_BY_TASK = {
  extract: 'mistral-small-latest',      // parser un bulletin en incidents
  gather: 'mistral-small-latest',       // articles -> evenements OSINT
  judge: 'mistral-small-latest',        // corroboration
  reformulate: 'mistral-small-latest',  // version non attribuable
  verify: 'mistral-small-latest',       // verif adversariale
  synthesis: 'mistral-large-latest',    // appreciation de situation
};

export function pickModel(task) {
  return MODEL_BY_TASK[task] || 'mistral-small-latest';
}

// --- Helpers ------------------------------------------------------------------
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function status(e) {
  const m = String((e && e.message) || '').match(/\b(429|5\d\d)\b/);
  return Number((e && (e.status || e.statusCode)) || (m && m[1]) || 0);
}

export function parseJSON(txt, fb) {
  if (txt == null) return fb;
  let s = String(txt).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch (e) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) {} }
    return fb;
  }
}

// --- Mistral (tout le langage) ------------------------------------------------
export async function mistralChat({ task, system, user, temperature = 0.2, json = true }) {
  if (!CONFIG.mistralKey) throw new Error('MISTRAL_API_KEY manquante');
  const model = pickModel(task);
  const body = {
    model, temperature,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  if (json) body.response_format = { type: 'json_object' };

  for (let a = 0; a < 3; a++) {
    await sleep(250);
    try {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + CONFIG.mistralKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = new Error('mistral ' + res.status); e.status = res.status; throw e; }
      const data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    } catch (e) {
      const c = status(e);
      if ((c === 429 || (c >= 500 && c < 600)) && a < 2) { await sleep(1500 * (a + 1)); continue; }
      if (a >= 2) return '';
    }
  }
  return '';
}

// --- Brave (recherche de sources, grounding principal) ------------------------
let braveLast = 0;
export async function braveSearch(query, { count = 5, country = 'fr', lang = 'fr' } = {}) {
  if (!CONFIG.braveKey) throw new Error('BRAVE_API_KEY manquante');
  // Palier gratuit Brave = 1 requete/seconde: on cadence.
  const wait = 1100 - (Date.now() - braveLast);
  if (wait > 0) await sleep(wait);
  braveLast = Date.now();
  try {
    const qs = new URLSearchParams({ q: query, count: String(count), country, search_lang: lang });
    const r = await fetch('https://api.search.brave.com/res/v1/web/search?' + qs, {
      headers: { 'X-Subscription-Token': CONFIG.braveKey, Accept: 'application/json' },
    });
    if (!r.ok) return [];
    const data = await r.json();
    return ((data.web && data.web.results) || []).map((it) => ({
      source: (it.meta_url && it.meta_url.hostname) || 'web',
      titre: it.title || '',
      url: it.url || '',
      extrait: it.description || '',
      date: it.page_age || it.age || '',
    }));
  } catch (e) { return []; }
}

// --- Google Gemini + Google Search (grounding de SECOURS, coupable) -----------
// N'est appele que si USE_GOOGLE_FALLBACK=true ET qu'une cle est presente.
// Tant que le flag est off, la chaine reste 100% Mistral + Brave (souverain).
export async function googleGround(query) {
  if (!CONFIG.useGoogleFallback || !CONFIG.googleKey) return [];
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + CONFIG.googleKey;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Sources publiques recentes sur: ' + query + '. Reponds bref.' }] }],
        tools: [{ google_search: {} }],
      }),
    });
    if (!r.ok) return [];
    const data = await r.json();
    const chunks = (((data.candidates || [])[0] || {}).groundingMetadata || {}).groundingChunks || [];
    return chunks.map((c) => ({
      source: (c.web && c.web.title) || 'google',
      titre: (c.web && c.web.title) || '',
      url: (c.web && c.web.uri) || '',
      extrait: '',
      date: '',
    })).filter((c) => c.url);
  } catch (e) { return []; }
}

// --- Recherche combinee: Brave d'abord, Google seulement si Brave sec ---------
export async function findSources(queries) {
  const seen = new Set();
  const out = [];
  for (const q of queries) {
    for (const c of await braveSearch(q)) {
      if (c.url && !seen.has(c.url)) { seen.add(c.url); out.push(c); }
    }
  }
  if (!out.length && CONFIG.useGoogleFallback) {
    for (const c of await googleGround(queries[0])) {
      if (c.url && !seen.has(c.url)) { seen.add(c.url); out.push(c); }
    }
  }
  return out;
}
