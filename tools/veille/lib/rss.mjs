/* Lecture de flux RSS 2.0 et Atom, sans dependance.
   Couvre les sites de presse, les instances RSSHub auto-hebergees et tout
   pont RSS (Nitter, bridges divers) : aucune cle d'API n'est requise. */

import { fetchText, stripTags, decodeEntities } from './http.mjs';

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = re.exec(block);
  if (!m) return '';
  return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
}

function atomLink(block) {
  const alt = /<link[^>]+rel="alternate"[^>]*href="([^"]+)"/i.exec(block);
  if (alt) return decodeEntities(alt[1]);
  const any = /<link[^>]+href="([^"]+)"/i.exec(block);
  return any ? decodeEntities(any[1]) : '';
}

export function parseFeed(xml, feedLabel) {
  const items = [];
  const blocks = [
    ...String(xml).matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...String(xml).matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)
  ];
  for (const b of blocks) {
    const block = b[1];
    const title = stripTags(tag(block, 'title'));
    const link = tag(block, 'link') || atomLink(block);
    const desc = stripTags(tag(block, 'description') || tag(block, 'summary') || tag(block, 'content'));
    const date = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date');
    if (!title && !desc) continue;
    const d = date ? new Date(date) : null;
    items.push({
      source: 'rss',
      source_url: link,
      author: feedLabel,
      published_at: d && !isNaN(d) ? d.toISOString() : null,
      text: [title, desc].filter(Boolean).join(' — '),
      media: []
    });
  }
  return items;
}

export async function fetchFeed(url, label, opts = {}) {
  const xml = await fetchText(url, opts);
  return parseFeed(xml, label || url);
}
