/* Collecte TikTok via l'API TikNeuron (celle qu'utilise le MCP
   https://github.com/seym0n/tiktok-mcp).

   ATTENTION : contrairement aux autres sources de ce collecteur, cette voie
   N'EST PAS sans cle. Elle appelle un service tiers payant et requiert
   TIKNEURON_MCP_API_KEY. Sans la variable d'environnement, la source est
   simplement ignoree et le reste de la collecte continue.

   Endpoints utilises (identiques a ceux du MCP) :
     GET /api/mcp/search        ?query=&cursor=&search_uid=
     GET /api/mcp/post-detail   ?tiktok_url=
     GET /api/mcp/get-subtitles ?tiktok_url=&language_code= */

import { UA } from './http.mjs';

const BASE = 'https://tikneuron.com/api/mcp';

export function hasKey() { return Boolean(process.env.TIKNEURON_MCP_API_KEY); }

async function call(path, params, { timeout = 25000 } = {}) {
  const key = process.env.TIKNEURON_MCP_API_KEY;
  if (!key) throw new Error('TIKNEURON_MCP_API_KEY absente');

  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': UA, 'MCP-API-KEY': key }
    });
    // On ne remonte jamais le corps brut d'une erreur : il peut contenir
    // l'URL complete et donc la cle en cas de mauvaise implementation cote API.
    if (!res.ok) throw new Error(`TikNeuron ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* Normalise created_at : ISO, epoch secondes ou epoch millisecondes. */
export function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || /^\d{9,13}$/.test(String(value))) {
    const n = Number(value);
    const ms = String(Math.trunc(n)).length <= 10 ? n * 1000 : n;
    const d = new Date(ms);
    return isNaN(d) ? null : d.toISOString();
  }
  const d = new Date(value);
  return isNaN(d) ? null : d.toISOString();
}

/* Mappe une video TikNeuron vers l'item normalise du collecteur. */
export function mapVideo(v, query) {
  const hashtags = Array.isArray(v.hashtags) ? v.hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)) : [];
  const text = [v.description || '', hashtags.join(' ')].filter(Boolean).join(' ').trim();
  const creator = String(v.creator || '').replace(/^@/, '');
  return {
    source: 'tiktok',
    source_url: v.video_id && creator
      ? `https://www.tiktok.com/@${creator}/video/${v.video_id}`
      : (v.video_id ? `https://www.tiktok.com/video/${v.video_id}` : ''),
    author: creator ? `@${creator}` : 'tiktok',
    published_at: toIso(v.created_at),
    text,
    media: [],
    audience: v.views ? String(v.views) : null,
    query
  };
}

export function parseSearch(data, query) {
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  return {
    items: videos.map(v => mapVideo(v, query)).filter(i => i.text.length > 0),
    cursor: data?.metadata?.cursor || null,
    hasMore: Boolean(data?.metadata?.has_more),
    searchUid: data?.metadata?.search_uid || null
  };
}

/* Recherche paginee. pages = nombre maximum d'appels par requete. */
export async function search(query, { pages = 2, opts = {} } = {}) {
  const out = [];
  let cursor = null, searchUid = null;
  for (let i = 0; i < pages; i++) {
    const data = await call('search', { query, cursor, search_uid: searchUid }, opts);
    const page = parseSearch(data, query);
    out.push(...page.items);
    if (!page.hasMore || !page.cursor) break;
    cursor = page.cursor;
    searchUid = page.searchUid;
  }
  return out;
}

/* Enrichissements ponctuels, utiles en analyse manuelle plus qu'en collecte. */
export async function postDetails(tiktokUrl, opts = {}) {
  return call('post-detail', { tiktok_url: tiktokUrl }, opts);
}

export async function subtitles(tiktokUrl, languageCode = '', opts = {}) {
  const data = await call('get-subtitles', { tiktok_url: tiktokUrl, language_code: languageCode }, opts);
  return data?.subtitle_content || '';
}
