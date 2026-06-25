// Edge Function : demo-actors  (PUBLIQUE — pas d'auth)
// POST { label, region?, countryCode? }
// Retourne { actors: [{ name, color }], events: [string] } pour la démo cartographique
// publique /demo/ : acteurs + types d'incidents plausibles pour la zone tapée.
//
// 100 % fictif / démonstration. IA souveraine : Mistral (UE), pas de Google.
// Secret requis dans Supabase : MISTRAL_API_KEY (déjà partagé avec brief-securite-mistral).
// Deploy : supabase functions deploy demo-actors --no-verify-jwt

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY');
// Demo publique fictive : modele economique (limite l'impact d'un abus de quota sur l'endpoint non authentifie)
const MISTRAL_MODEL = 'mistral-small-latest';
const MISTRAL_ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';

const ALLOWED_ORIGINS = [
  'https://algoracces.fr',
  'https://www.algoracces.fr',
  'http://localhost:8768',
  'http://localhost:8765',
];
function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

// Rôle → couleur (palette ACTOR_COLORS du site, cohérente quelle que soit la zone)
const ROLE_COLORS: Record<string, string> = {
  armed_group: '#e63946', jihadist: '#9d0208', insurgent: '#e63946',
  cartel: '#f48c06', criminal: '#f48c06', separatist: '#8e24aa', militia: '#8e24aa',
  state_forces: '#2e7d32', police: '#1d7ed8', international: '#2e6fb8', paramilitary: '#6c757d',
};
const ROLES = Object.keys(ROLE_COLORS);

function buildPrompt(label: string, region: string, cc: string): string {
  const loc = label + (region && region !== label ? ` (${region})` : '') + (cc ? `, pays ${cc}` : '');
  return `Tu es analyste géopolitique senior. Pour une DÉMONSTRATION cartographique (données fictives, jamais affichées comme réelles), liste les acteurs sécuritaires et les types d'incidents les plus PLAUSIBLES pour la zone suivante.

Zone : ${loc}.

- Donne 5 acteurs réellement pertinents pour cette zone (groupes armés / jihadistes / cartels / séparatistes / forces gouvernementales / police / forces internationales / milices), chacun avec un "role" parmi : ${ROLES.join(', ')}.
- Donne 6 "events" : types d'incidents courts (2 à 4 mots) typiques de la zone (ex : "Affrontement armé", "Saisie de cocaïne", "Frappe de drone", "Embuscade").
- Tout en français.
- Si la zone est paisible, reste réaliste : police, gendarmerie, criminalité organisée, manifestations — pas de faux groupes armés.

Réponds UNIQUEMENT par un objet JSON strict, sans texte autour, sans bloc de code, de la forme :
{"actors":[{"name":"...","role":"..."}],"events":["...","..."]}`;
}

function extractJson(txt: string): any | null {
  if (!txt) return null;
  let s = txt.trim();
  // Retire d'éventuels fences ```json ... ```
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(s); } catch (_) { /* tente une extraction */ }
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { /* abandon */ }
  }
  return null;
}

async function callMistral(prompt: string): Promise<any | null> {
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(MISTRAL_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: MISTRAL_MODEL,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.4,
          max_tokens: 500,
        }),
      });
      if (!res.ok) {
        // 429 / 5xx : on retente une fois
        if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 600)); continue; }
        return null;
      }
      const j = await res.json();
      const txt = j?.choices?.[0]?.message?.content;
      const parsed = extractJson(typeof txt === 'string' ? txt : '');
      if (parsed) return parsed;
    } catch (_) { /* retente */ }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!MISTRAL_API_KEY) return json({ error: 'MISTRAL_API_KEY manquant dans les secrets Supabase' }, 500);

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const label = String(body.label || '').slice(0, 80).trim();
  if (label.length < 2) return json({ error: 'label requis' }, 400);
  const region = String(body.region || '').slice(0, 80);
  const cc = String(body.countryCode || '').slice(0, 4);

  const out = await callMistral(buildPrompt(label, region, cc));
  if (!out || !Array.isArray(out.actors) || out.actors.length < 3) return json({ error: 'generation failed' }, 502);

  const actors = out.actors.slice(0, 6).map((a: any) => ({
    name: String(a?.name || 'Acteur').slice(0, 42),
    color: ROLE_COLORS[a?.role] || '#6c757d',
  }));
  let events = (Array.isArray(out.events) ? out.events : []).map((e: any) => String(e).slice(0, 32)).filter(Boolean).slice(0, 8);
  if (events.length < 4) events = ['Affrontement armé', 'Attaque ciblée', 'Mouvement de troupes', 'Tension', 'Embuscade', 'Raid'];

  return json({ actors, events });
});
