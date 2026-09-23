/* Client HTTP minimal : User-Agent fixe, timeout, retry exponentiel.
   Aucune dependance npm, Node >= 20 (fetch natif). */

export const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

export async function fetchText(url, { timeout = 20000, retries = 2, headers = {} } = {}) {
  let lastErr;
  let lang = { 'Accept-Language': 'fr,en;q=0.8,ar;q=0.6' };
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(1000 * Math.pow(2, attempt - 1));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': UA, ...lang, ...headers }
      });
      /* Certains serveurs (ReliefWeb) repondent 406 quand aucune langue demandee
         n'existe : on relance sans Accept-Language. */
      if (res.status === 406 && Object.keys(lang).length) { lang = {}; attempt--; continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* Decode les entites HTML courantes + numeriques. */
export function decodeEntities(s) {
  if (!s) return '';
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', eacute: 'é', egrave: 'è' };
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (named[n.toLowerCase()] !== undefined ? named[n.toLowerCase()] : m));
}

function safeCodePoint(n) {
  try { return String.fromCodePoint(n); } catch { return ''; }
}

/* Supprime les balises et normalise les espaces. */
export function stripTags(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li)>/gi, '\n')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
  ).replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
