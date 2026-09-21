/* Construction du FeatureCollection attendu par le calque Veille.
   Les cles de properties sont affichees telles quelles dans le popup
   (voir popupHTML dans <zone>/index.html) : name / type / sources sont
   traites a part, toutes les autres cles deviennent une ligne du popup. */

import { createHash } from 'node:crypto';
import { normalize } from './classify.mjs';

const SOURCE_LABEL = { telegram: 'Telegram', rss: 'RSS', tiktok: 'TikTok' };

export function makeRef(item, place) {
  // Empreinte stable : texte normalise tronque + lieu + jour.
  const day = (item.published_at || new Date().toISOString()).slice(0, 10);
  const body = normalize(item.text).slice(0, 180);
  return createHash('sha1').update(`${body}|${place}|${day}`).digest('hex').slice(0, 10);
}

export function buildFeature(item, cls, geo, { zone }) {
  const ref = makeRef(item, geo.name);
  const when = item.published_at || new Date().toISOString();
  const resume = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 280);

  const props = {
    name: `${cls.type} — ${geo.name}`,
    type: cls.type,
    Date: when.replace('T', ' ').slice(0, 16) + ' UTC',
    Lieu: geo.name,
    Pays: geo.country,
    Zone: zone
  };
  if (cls.actors.length) props.Acteurs = cls.actors.join(', ');
  if (cls.toll) props.Bilan = cls.toll;
  props.Resume = resume + (String(item.text || '').length > 280 ? '…' : '');
  props['Mots-cles'] = cls.keywords.join(', ');
  props.Confiance = cls.confidence;
  props.Precision = `${geo.precision} (${geo.source})`;
  if (geo.others && geo.others.length) props['Autres lieux cites'] = geo.others.join(', ');
  props.Canal = `${SOURCE_LABEL[item.source] || item.source} ${item.author || ''}`.trim();
  props.Statut = 'a valider';
  props.Ref = ref;
  props.Collecte = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  props.sources = item.source_url ? `${SOURCE_LABEL[item.source] || 'Source'}|${item.source_url}` : '';

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [round(geo.lon), round(geo.lat)] },
    properties: props
  };
}

function round(n) { return Math.round(Number(n) * 1e5) / 1e5; }

/* Fusionne les nouveaux points avec le fichier existant :
   - dedoublonnage sur Ref
   - retention glissante sur Date (jours) */
export function mergeCollection(existing, features, { days = 30 } = {}) {
  const cutoff = Date.now() - days * 86400000;
  const byRef = new Map();

  const keep = f => {
    const d = Date.parse(String(f?.properties?.Date || '').replace(' UTC', 'Z').replace(' ', 'T'));
    return isNaN(d) ? true : d >= cutoff;
  };

  for (const f of (existing?.features || [])) {
    if (!f?.properties?.Ref || !keep(f)) continue;
    byRef.set(f.properties.Ref, f);
  }
  let added = 0;
  for (const f of features) {
    if (!keep(f)) continue;
    if (byRef.has(f.properties.Ref)) continue;
    byRef.set(f.properties.Ref, f);
    added++;
  }

  const out = [...byRef.values()].sort((a, b) => String(b.properties.Date).localeCompare(String(a.properties.Date)));
  return {
    collection: { type: 'FeatureCollection', features: out },
    added,
    total: out.length
  };
}
