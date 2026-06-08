/**
 * firebase-loader.js — Chargeur Supabase read-only pour les cartes publiques
 *
 * Charge les points admin depuis Supabase et les rend disponibles
 * au moteur engine.js via window.loadFirestorePoints(zone).
 *
 * Inclus dans chaque page de zone avec :
 *   <script type="module" src="../shared/firebase-loader.js"></script>
 */

// V4 : on réutilise le client AUTHENTIFIÉ de site-auth (window.algorAuth.supabase)
// au lieu d'un client anonyme dédié, pour que la lecture des points respecte la
// RLS premium (et un seul GoTrueClient au lieu de deux).
function getSupabase() {
  return (window.algorAuth && window.algorAuth.supabase) || null;
}

// Cache local (30s TTL — les modifications admin apparaissent rapidement)
const cache = {};
const CACHE_TTL = 30 * 1000;

async function loadFirestorePoints(zone) {
  // Attend l'accès premium (zones gated) avant de lire les points (RLS premium).
  if (window.algorReady) { try { await window.algorReady; } catch (_) {} }
  const supabase = getSupabase();
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
