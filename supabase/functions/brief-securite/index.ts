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

const GEMINI_MODEL = 'gemini-2.0-flash';
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

function buildPrompt(input: { name: string; ville?: string; pays?: string }): string {
  const lieu = [input.ville, input.pays].filter(Boolean).join(', ') || input.name;
  return `Tu es analyste securite pour Algor Int (cabinet d'intelligence economique francais).

Donne un brief securite concis sur : **${input.name}**${lieu !== input.name ? ` (${lieu})` : ''}

Format strict :
- 3 a 5 puces, chacune une phrase courte
- Focus evenements securitaires recents (3 derniers mois)
- Acteurs cles, tendance (escalade / stabilisation / nouveau)
- Aucune speculation, uniquement faits sources

Utilise la recherche web Google pour obtenir des informations a jour. Cite tes sources.

Sortie en francais, sobre, factuelle. Pas d'introduction ni de conclusion, juste les puces.`;
}

interface BriefResult {
  brief: string;
  sources: Array<{ title: string; url: string }>;
  model: string;
}

async function callGemini(prompt: string): Promise<BriefResult> {
  const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1500,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API ${response.status}: ${errText}`);
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

  return { brief, sources, model: GEMINI_MODEL };
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

  let input: { name?: string; ville?: string; pays?: string };
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
    const prompt = buildPrompt({ name: input.name, ville: input.ville, pays: input.pays });
    const result = await callGemini(prompt);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  } catch (e) {
    console.error('brief-securite error:', e);
    return new Response(JSON.stringify({ error: 'Echec generation', detail: String(e) }), {
      status: 502,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
});
