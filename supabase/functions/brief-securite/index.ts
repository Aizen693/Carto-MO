// Edge Function : brief-securite
// POST { name, ville?, pays?, lng?, lat? }
// Retourne un brief securite IA (Google Gemini 2.0 Flash + Google Search grounding)
// sur le point clique.
//
// Secrets requis dans Supabase : GEMINI_API_KEY (gratuite sur https://aistudio.google.com)
// Deploy : supabase functions deploy brief-securite

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const ALLOWED_ORIGINS = [
  'https://algoracces.fr',
  'https://www.algoracces.fr',
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

function buildSynthesePrompt(input: {
  name: string;
  context?: Record<string, string>;
}): string {
  const ctx = input.context || {};
  const scope = ctx.scope || ctx.zone_label || input.name;
  return `Tu es analyste senior pour Algor Int — cabinet francais d'intelligence economique et securitaire.

Produis UN SEUL paragraphe synthese decisionnelle pour la PAGE 1 du rapport sur : **${input.name}**
Scope : ${scope}

Ce paragraphe doit permettre au decideur (DG, DSI, exec) de trancher SANS lire le reste du rapport.

REGLES STRICTES :
- UN seul paragraphe de 4 a 6 lignes (60 a 110 mots)
- 1er mot = verdict fort (ex : "Escalade", "Stabilisation", "Bascule", "Erosion", "Fragmentation", "Consolidation")
- Suivi : trajectoire dominante (1-2 phrases factuelles, datees)
- Acteurs / dynamiques cles (1-2 phrases)
- Phrase finale = implication actionnable pour le decideur
- AUCUNE puce, AUCUN markdown, AUCUN emoji
- Texte continu, dense, sobre, registre analyste senior
- Si une info n'est pas verifiable, ne l'inclus pas

UTILISE la recherche web Google : 3-5 recherches ciblees minimum pour les faits des 3 derniers mois. Privilegie sources tier-1 (ACLED, ONU, ICG, IISS, presse internationale).

Sortie : juste le paragraphe, rien d'autre.`;
}

function buildPrompt(input: {
  name: string;
  ville?: string;
  pays?: string;
  context?: Record<string, string>;
  mode?: string;
}): string {
  if (input.mode === 'synthese') return buildSynthesePrompt(input);
  const ctx = input.context || {};
  // Champs utiles a injecter dans le prompt (on filtre les bruits)
  const skipKeys = new Set(['name', 'Name', 'nom', 'Nom', '_calque']);
  const ctxLines = Object.entries(ctx)
    .filter(([k, v]) => !skipKeys.has(k) && typeof v === 'string' && v.trim())
    .slice(0, 20)
    .map(([k, v]) => `- ${k} : ${v}`)
    .join('\n');

  const calque = ctx._calque || '';
  const angleHint = (() => {
    if (calque === 'mines' || ctx.statut || ctx.operateur) return 'angle economique + securitaire (acteurs operationnels, conflits autour de l\'actif, tensions filiere)';
    if (calque === 'evenements' || ctx.evenement || ctx.event) return 'angle threat (acteur, victimes, mode operatoire, revendications, suites)';
    if (calque === 'flux') return 'angle flux (volumes, axes, acteurs, evolution, vulnerabilites)';
    if (calque === 'infrastructures') return 'angle infrastructure (criticite, securisation, incidents passes)';
    if (calque === 'population' || calque === 'ethnies') return 'angle communautaire (tensions, deplacements, dynamiques recentes)';
    return 'angle securitaire general (acteurs, tendance, incidents recents)';
  })();

  return `Tu es analyste senior pour Algor Int — cabinet francais d'intelligence economique et securitaire (style Palantir / Stratfor).
Ton client est un decideur : il doit pouvoir trancher en 90 secondes de lecture. La plus-value du cabinet repose sur la profondeur et la verifiabilite.

POINT ANALYSE : **${input.name}**
${ctxLines ? `\nCONTEXTE FOURNI (a integrer) :\n${ctxLines}\n` : ''}
MISSION : Note d'analyse complete, ${angleHint}.

UTILISE INTENSIVEMENT la recherche web Google : 5-10 recherches ciblees minimum. Privilegie sources tier-1 (presse internationale, instituts, ONU, ACLED, IISS, Crisis Group, presse regionale). Pas de blogs aleatoires.

FORMAT IMPOSE — utilise EXACTEMENT cette structure markdown :

## Synthese decisionnelle
Un paragraphe dense de 3 a 5 lignes. L'essentiel a retenir pour la decision. Sans euphemisme, sans langue de bois. Ton ferme, analytique.

## Acteurs cles
- **Acteur 1** — role precis, capacite, posture actuelle
- **Acteur 2** — idem
(3 a 6 acteurs, prioriser ceux pertinents pour la decision)

## Chronologie recente
- **JJ/MM/AAAA** — Evenement horodate, source
- **JJ/MM/AAAA** — Evenement horodate, source
(5 a 10 entrees, focus 6 derniers mois, du plus recent au plus ancien)

## Dynamique
Un paragraphe de 2 a 4 lignes. Tendance de fond, signaux faibles, ruptures recentes. Lecture analytique, pas description.

## Axes de vigilance
- **Axe 1** — declencheur a surveiller + ce que ca signifierait
- **Axe 2** — idem
(3 a 5 axes operationnels, pas de generalites)

REGLES :
- Francais sobre, registre analyste senior
- Aucun emoji, aucun gradient typographique, aucune mise en page fantaisiste
- Aucune phrase d'introduction ou de conclusion en dehors des sections
- Si une info n'est pas verifiable, ne l'inclus pas — ne speculer JAMAIS
- Dates en JJ/MM/AAAA, montants avec unite, acteurs en gras (**nom**)
- Si le contexte fourni mentionne un point fixe (mine, infrastructure, FMP), traite-le comme objet : qui l'exploite/le surveille, quels incidents le concernent, quelle valeur strategique

Cite tes sources via grounding Google (elles seront affichees automatiquement).`;
}

interface BriefResult {
  brief: string;
  sources: Array<{ title: string; url: string }>;
  model: string;
}

// Erreur typee : permet a l'appelant de distinguer un rate-limit (429) d'un
// echec generique et de renvoyer un message clair au lieu d'une erreur brute.
class GeminiError extends Error {
  status: number;
  rateLimited: boolean;
  retryAfterMs: number;
  constructor(status: number, message: string, retryAfterMs = 0) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.rateLimited = status === 429;
    this.retryAfterMs = retryAfterMs;
  }
}

// Tente d'abord gemini-2.5-flash puis fallback gemini-2.0-flash-001 si 503 persistant
const FALLBACK_MODEL = 'gemini-2.0-flash-001';
const FALLBACK_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${FALLBACK_MODEL}:generateContent`;

// Lit l'en-tete Retry-After (secondes ou date HTTP) renvoye sur un 429.
function parseRetryAfterMs(response: Response): number {
  const h = response.headers.get('retry-after');
  if (!h) return 0;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(h);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : 0;
}

async function callGemini(prompt: string): Promise<BriefResult> {
  // Retry sur 503 (modele surcharge) et 429 (rate limit) — 6 tentatives.
  // Backoff progressif ; sur 429 on respecte Retry-After si Gemini le fournit,
  // avec un jitter pour eviter que plusieurs clients ne retentent en meme temps.
  const delays = [0, 1500, 4000, 9000, 14000, 20000];
  let response: Response | null = null;
  let lastErrText = '';
  let lastStatus = 0;
  let lastRetryAfterMs = 0;
  let usedModel = GEMINI_MODEL;
  for (let i = 0; i < delays.length; i++) {
    // Sur un 429 precedent, privilegie le delai Retry-After serveur si plus long.
    const jitter = lastStatus === 429 ? Math.floor(Math.random() * 500) : 0;
    const d = Math.max(delays[i], lastRetryAfterMs) + (i > 0 ? jitter : 0);
    if (d > 0) await new Promise((r) => setTimeout(r, d));
    // A la derniere tentative, bascule sur le modele fallback si surcharge persistante
    const endpoint = (i === delays.length - 1) ? FALLBACK_ENDPOINT : `${GEMINI_ENDPOINT}`;
    if (i === delays.length - 1) usedModel = FALLBACK_MODEL;
    response = await fetch(`${endpoint}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 6000 },
      }),
    });
    if (response.ok) break;
    lastStatus = response.status;
    lastRetryAfterMs = response.status === 429 ? parseRetryAfterMs(response) : 0;
    lastErrText = await response.text();
    // Ne retry que sur 503 (UNAVAILABLE) et 429 (rate limit transitoire)
    if (response.status !== 503 && response.status !== 429) break;
  }
  if (!response || !response.ok) {
    throw new GeminiError(
      lastStatus || response?.status || 502,
      `Gemini API ${lastStatus || response?.status || '???'}: ${lastErrText}`,
      lastRetryAfterMs,
    );
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error('Gemini : aucune reponse generee');

  const brief = (candidate.content?.parts || [])
    .map((p: { text?: string }) => p.text || '')
    .join('\n')
    .trim();

  const sources: Array<{ title: string; url: string }> = [];
  const chunks = candidate.groundingMetadata?.groundingChunks || [];
  for (const chunk of chunks) {
    const web = chunk.web;
    if (web?.uri) {
      sources.push({ title: web.title || web.uri, url: web.uri });
    }
  }

  return { brief, sources, model: usedModel };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Auth requise' }), {
      status: 401,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Session invalide' }), {
      status: 401,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({
      error: 'Cle Gemini absente',
      hint: 'Ajoute GEMINI_API_KEY dans Supabase > Project Settings > Edge Functions > Secrets. Cle gratuite sur https://aistudio.google.com',
    }), {
      status: 503,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  let input: { name?: string; ville?: string; pays?: string; mode?: string; context?: Record<string, string> };
  try {
    input = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
  if (!input?.name || typeof input.name !== 'string') {
    return new Response(JSON.stringify({ error: 'Champ "name" requis' }), {
      status: 400,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  try {
    const prompt = buildPrompt({
      name: input.name,
      ville: input.ville,
      pays: input.pays,
      context: input.context,
      mode: input.mode,
    });
    const result = await callGemini(prompt);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  } catch (e) {
    console.error('brief-securite error:', e);
    // Rate limit du fournisseur IA (429) : message clair + Retry-After, pas une
    // erreur brute. Le front peut proposer de reessayer sans alarmer l'utilisateur.
    if (e instanceof GeminiError && e.rateLimited) {
      const retryAfterS = Math.max(1, Math.ceil((e.retryAfterMs || 15000) / 1000));
      return new Response(JSON.stringify({
        error: 'Le fournisseur IA limite temporairement les requetes.',
        hint: `Patiente quelques secondes puis reessaie.`,
        retryAfter: retryAfterS,
        rateLimited: true,
      }), {
        status: 429,
        headers: { ...cors, 'content-type': 'application/json', 'retry-after': String(retryAfterS) },
      });
    }
    return new Response(JSON.stringify({ error: 'Echec generation', detail: String(e) }), {
      status: 502,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
});
