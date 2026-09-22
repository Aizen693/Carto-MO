// Edge Function : veille-feed  (v2, 17/09/2026 : analyse réservée aux abonnés premium)
//
// Deux niveaux d'accès sur le fil de veille géopolitique :
//
//   GET /functions/v1/veille-feed/notifications.json
//       PUBLIC. Fil réduit : identité de la note, titre, résumé, source, lieu.
//       Jamais d'analyse (detail, implications, recommandations).
//       Lecteurs : accueil, /veille/ (aperçu), /theatres/, /methodologie/, /compte/alertes/.
//
//   GET /functions/v1/veille-feed/notifications-complet.json[?lang=en]
//       PREMIUM. En-tête Authorization: Bearer <jeton de session de l'abonné>.
//       Contrôle : public.is_premium() appelé AVEC le jeton de l'abonné, c'est-à-dire la même
//       règle que la policy Storage zones_premium_read. 401 sans session, 403 sans premium.
//       ?lang=en fusionne la version anglaise (zones/veille-geo/notes-en.json), comme i18n.js
//       le fait pour le fil public.
//
//   GET /functions/v1/veille-feed/<zone>/veille.geojson
//       PREMIUM (même contrôle). Calque « Veille IA » des pages théâtre.
//
// Stockage : bucket PRIVÉ « zones », dossier veille-geo/ (écrit par n8n avec la clé service).
// Transition : tant que l'objet n'existe pas dans le bucket, repli sur la branche veille-data
// du dépôt GitHub. À SUPPRIMER (bloc « REPLI GITHUB ») une fois n8n basculé et la branche effacée.
//
// Les traitements serveur (alerter-abonnes, VPS) ne passent PAS par ici : ils lisent
// directement zones/veille-geo/notifications.json avec la clé service.
//
// Deploy : supabase functions deploy veille-feed --no-verify-jwt
// (verify_jwt reste désactivé : la route publique doit rester sans jeton, le contrôle premium est fait ici)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GH_TOKEN = Deno.env.get('GH_TOKEN');
const GH_REPO = 'Aizen693/Carto-MO';
const GH_BRANCH = 'veille-data';

const BUCKET = 'zones';
const FIL_COMPLET = 'veille-geo/notifications.json';
const NOTES_EN = 'veille-geo/notes-en.json';

// Champs visibles sans abonnement. Tout le reste (detail, implications, recommandations,
// et tout champ ajouté plus tard par n8n) est retiré : liste blanche, pas liste noire.
const CHAMPS_PUBLICS = ['id', 'date', 'theatre', 'severite', 'titre', 'resume', 'source', 'source_url', 'image', 'lieu', 'lat', 'lon'];

const CORS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function json(obj: unknown, status = 200, cache = 'no-store') {
  return new Response(typeof obj === 'string' ? obj : JSON.stringify(obj), {
    status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });
}

// Lit un objet du bucket privé (clé service). null si absent.
async function lireBucket(chemin: string): Promise<string | null> {
  const { data, error } = await admin.storage.from(BUCKET).download(chemin);
  if (error || !data) return null;
  return await data.text();
}

// ── REPLI GITHUB (transition, à supprimer après bascule n8n) ──
async function lireGithub(chemin: string): Promise<string | null> {
  if (!GH_TOKEN) return null;
  const gh = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${chemin}?ref=${GH_BRANCH}`, {
    headers: { Authorization: `token ${GH_TOKEN}`, 'User-Agent': 'algoracces-veille-feed', Accept: 'application/vnd.github.raw' },
  });
  return gh.ok ? await gh.text() : null;
}
// ── fin REPLI GITHUB ──

async function lireFil(): Promise<{ updated?: string; items: Record<string, unknown>[] } | null> {
  const brut = (await lireBucket(FIL_COMPLET)) ?? (await lireGithub('notifications.json'));
  if (!brut) return null;
  const d = JSON.parse(brut);
  return Array.isArray(d) ? { items: d } : { ...d, items: d.items ?? [] };
}

// Jeton de session → abonné premium ? Même fonction SQL que la RLS du bucket zones.
async function estPremium(req: Request): Promise<'ok' | 401 | 403> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt || jwt === ANON_KEY) return 401;
  const { data: u, error: eu } = await admin.auth.getUser(jwt);
  if (eu || !u?.user) return 401;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data, error } = await client.rpc('is_premium');
  return !error && data === true ? 'ok' : 403;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405);

  const url = new URL(req.url);
  const m = url.pathname.match(/\/veille-feed\/(.+)$/);
  const chemin = m ? decodeURIComponent(m[1]).replace(/^\/+/, '') : '';

  try {
    // ── Fil public réduit ──
    if (chemin === 'notifications.json') {
      const fil = await lireFil();
      if (!fil) return json({ error: 'fil indisponible' }, 502);
      const items = fil.items.map((it) => Object.fromEntries(CHAMPS_PUBLICS.filter((k) => k in it).map((k) => [k, it[k]])));
      return json({ updated: fil.updated, acces: 'public', items }, 200, 'public, max-age=120');
    }

    // ── Fil complet (premium) ──
    if (chemin === 'notifications-complet.json') {
      const acces = await estPremium(req);
      if (acces !== 'ok') return json({ error: acces === 401 ? 'session requise' : 'abonnement premium requis' }, acces);
      const fil = await lireFil();
      if (!fil) return json({ error: 'fil indisponible' }, 502);
      if (url.searchParams.get('lang') === 'en') {
        const en = await lireBucket(NOTES_EN);
        const trad: Record<string, Record<string, unknown>> = en ? (JSON.parse(en).notes ?? {}) : {};
        for (const it of fil.items) {
          const e = trad[String(it.id)];
          if (!e) continue;
          for (const [k, v] of Object.entries(e)) if (v != null && v !== '') { it[`${k}_fr`] = it[k]; it[k] = v; }
        }
      }
      return json({ updated: fil.updated, acces: 'premium', items: fil.items }, 200, 'private, no-store');
    }

    // ── Calque veille d'un théâtre (premium) ──
    const z = chemin.match(/^([a-z][a-z0-9-]*)\/veille\.geojson$/);
    if (z) {
      const acces = await estPremium(req);
      if (acces !== 'ok') return json({ error: acces === 401 ? 'session requise' : 'abonnement premium requis' }, acces);
      const brut = (await lireBucket(`${z[1]}/veille.geojson`)) ?? (await lireGithub(`${z[1]}/veille.geojson`));
      return brut ? json(brut, 200, 'private, no-store') : json({ error: 'introuvable' }, 404);
    }

    return json({ error: 'path non autorise' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
