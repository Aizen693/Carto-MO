/* Lecture des canaux Telegram publics via l'apercu web t.me/s/<canal>.
   Aucune cle, aucun compte, aucun acces MTProto : c'est la page publique
   que Telegram sert aux moteurs de recherche.
   Limite : ne fonctionne que pour les canaux publics dont l'apercu est active. */

import { fetchText, stripTags, decodeEntities } from './http.mjs';

const MSG_SPLIT = /<div[^>]+class="[^"]*tgme_widget_message\b[^"]*"/g;

export function parseChannelHtml(html, channel) {
  const out = [];
  // On decoupe le flux sur chaque bloc message, puis on lit les champs dans le bloc.
  const marks = [];
  let m;
  MSG_SPLIT.lastIndex = 0;
  while ((m = MSG_SPLIT.exec(html)) !== null) marks.push(m.index);
  for (let i = 0; i < marks.length; i++) {
    const block = html.slice(marks[i], i + 1 < marks.length ? marks[i + 1] : html.length);

    const post = /data-post="([^"]+)"/.exec(block);
    const id = post ? post[1] : null;
    if (!id) continue;

    const textMatch = /<div[^>]+class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(block);
    const text = textMatch ? stripTags(textMatch[1]) : '';

    const timeMatch = /<time[^>]+datetime="([^"]+)"/.exec(block);
    const publishedAt = timeMatch ? new Date(timeMatch[1]).toISOString() : null;

    const views = /<span[^>]+class="[^"]*tgme_widget_message_views[^"]*"[^>]*>([^<]*)</.exec(block);

    const media = [];
    const photo = /background-image:\s*url\('([^']+)'\)/g;
    let p;
    while ((p = photo.exec(block)) !== null) media.push(decodeEntities(p[1]));

    if (!text && media.length === 0) continue;

    out.push({
      source: 'telegram',
      source_url: `https://t.me/${id}`,
      author: `@${channel}`,
      published_at: publishedAt,
      text,
      media,
      audience: views ? views[1].trim() : null
    });
  }
  return out;
}

export async function fetchChannel(channel, opts = {}) {
  const url = `https://t.me/s/${encodeURIComponent(channel)}`;
  const html = await fetchText(url, opts);
  // Un canal prive ou inexistant renvoie une page sans aucun bloc message.
  return parseChannelHtml(html, channel);
}
