// Edge Function : veille-feed  (PUBLIQUE — pas d'auth)
// Ressert publiquement les fichiers de veille du repo (branche veille-data),
// pour que le flux de veille du site continue de marcher meme quand le repo
// Aizen693/Carto-MO passe en prive (raw.githubusercontent exige alors une auth).
//
// Le token GitHub reste cote serveur (secret Supabase GH_TOKEN, deja utilise par gh-deploy).
// Whitelist stricte des chemins : seulement notifications.json et <zone>/veille.geojson,
// pour qu'on ne puisse PAS lire d'autres fichiers du repo prive via ce proxy.
//
// Usage : GET /functions/v1/veille-feed/notifications.json
//         GET /functions/v1/veille-feed/sahel/veille.geojson
// Deploy : supabase functions deploy veille-feed --no-verify-jwt

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const GH_TOKEN = Deno.env.get('GH_TOKEN');
const GH_REPO = 'Aizen693/Carto-MO';
const GH_BRANCH = 'veille-data';

// Chemins autorises : notifications.json OU <zone>/veille.geojson
const ALLOW = /^(notifications\.json|[a-z][a-z0-9-]*\/veille\.geojson)$/;

const CORS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function err(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return err({ error: 'method not allowed' }, 405);

  const url = new URL(req.url);
  // pathname = .../veille-feed/<sous-chemin>
  const m = url.pathname.match(/\/veille-feed\/(.+)$/);
  const path = m ? decodeURIComponent(m[1]).replace(/^\/+/, '').split('?')[0] : '';
  if (!ALLOW.test(path)) return err({ error: 'path non autorise', path }, 400);
  if (!GH_TOKEN) return err({ error: 'GH_TOKEN non configure cote serveur' }, 500);

  try {
    const gh = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}`, {
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'User-Agent': 'algoracces-veille-feed',
        'Accept': 'application/vnd.github.raw',
      },
    });
    if (gh.status === 404) return err({ error: 'introuvable', path }, 404);
    if (!gh.ok) return err({ error: 'github error', status: gh.status }, 502);
    const body = await gh.text();
    return new Response(body, {
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=120' },
    });
  } catch (e) {
    return err({ error: String(e) }, 502);
  }
});
