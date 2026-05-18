// Edge Function : brief-securite
// POST { name, ville?, pays?, lng?, lat? }
// Retourne un brief securite IA (Claude opus-4-7 + web_search) sur le point clique.
//
// Secrets requis dans Supabase : ANTHROPIC_API_KEY
// Deploy : supabase functions deploy brief-securite --no-verify-jwt=false

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

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

Tu DOIS utiliser web_search pour obtenir des informations a jour. Cite tes sources avec leur URL.

Sortie en francais, sobre, factuelle. Pas d'introduction ni de conclusion, juste les puces et les sources.`;
}

interface BriefResult {
  brief: string;
  sources: Array<{ title: string; url: string }>;
  model: string;
}

async function callClaude(prompt: string): Promise<BriefResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textBlocks = (data.content || []).filter((b: { type: string }) => b.type === 'text');
  const brief = textBlocks.map((b: { text: string }) => b.text).join('\n').trim();

  const sources: Array<{ title: string; url: string }> = [];
  for (const block of data.content || []) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const item of block.content) {
        if (item.type === 'web_search_result' && item.url) {
          sources.push({ title: item.title || item.url, url: item.url });
        }
      }
    }
  }

  return { brief, sources, model: data.model || 'claude-opus-4-7' };
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

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({
      error: 'Cle Anthropic absente',
      hint: 'Ajoute ANTHROPIC_API_KEY dans Supabase > Project Settings > Edge Functions > Secrets',
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
    const result = await callClaude(prompt);
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
