/**
 * firebase-loader.js — Chargeur Supabase read-only pour les cartes publiques
 *
 * Charge les points admin depuis Supabase et les rend disponibles
 * au moteur engine.js via window.loadFirestorePoints(zone).
 *
 * Inclus dans chaque page de zone avec :
 *   <script type="module" src="../shared/firebase-loader.js"></script>
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

// Meme config que admin/supabase-config.js
const SUPABASE_URL  = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_xxnL12zd9o5N30y1-Oi-0Q_YGYKMjh2';

let supabase;
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
  console.warn('Supabase loader: init skipped', e.message);
}

// Cache local (5 min TTL)
const cache = {};
const CACHE_TTL = 5 * 60 * 1000;

async function loadFirestorePoints(zone) {
  if (!supabase) return { type: 'FeatureCollection', features: [] };

  const cached = cache[zone];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const { data, error } = await supabase
      .from('points')
      .select('*')
      .eq('zone', zone)
      .eq('deleted', false);

    if (error) throw error;

    const features = (data || []).map(d => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: d.coordinates },
      properties: {
        name: d.name || '',
        description: d.description || '',
        _period: d.period || '',
        _color: d.color || '#888888',
        _casualties: d.casualties || 0,
        _desc: d.description || '',
        _source: 'supabase'
      }
    }));

    const result = { type: 'FeatureCollection', features };
    cache[zone] = { data: result, ts: Date.now() };
    return result;
  } catch (e) {
    console.warn('Supabase loader: erreur chargement points', e.message);
    return { type: 'FeatureCollection', features: [] };
  }
}

// Exposer en global pour engine.js (qui n'est pas un module ES)
window.loadFirestorePoints = loadFirestorePoints;
