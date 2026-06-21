// Edge Function : brief-securite-mistral
// POST { name, ville?, pays?, lng?, lat?, mode?, context? }
// Retourne un brief securite IA via Mistral (modele francais, heberge UE, RGPD)
// avec recherche web temps reel (connecteur web_search de l'API Conversations).
//
// Variante RGPD de `brief-securite` (qui tourne sur Google Gemini). Meme contrat
// d'entree/sortie : le front peut basculer sans rien changer d'autre que l'URL.
//
// Secrets requis dans Supabase : MISTRAL_API_KEY (cle sur https://console.mistral.ai)
// Deploy : supabase functions deploy brief-securite-mistral

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const MISTRAL_MODEL = 'mistral-large-latest';
const MISTRAL_ENDPOINT = 'https://api.mistral.ai/v1/conversations';

const ALLOWED_ORIGINS = [
  'https://algoracces.fr',
  'https://www.algoracces.fr',
  'http://localhost:8765',
  'http://localhost:8768',
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

UTILISE la recherche web : 3-5 recherches ciblees minimum pour les faits des 3 derniers mois. Privilegie sources tier-1 (ACLED, ONU, ICG, IISS, presse internationale).

Sortie : juste le paragraphe, rien d'autre.`;
}

// Analyse statistique : on injecte les chiffres REELS de notre base HUMINT
// (repartition par localite / typologie / acteur) et on demande au modele d'en
// tirer une lecture analytique. Aucune donnee chiffree ne doit etre inventee :
// l'IA interprete, elle ne fabrique pas.
function buildAnalysePrompt(input: {
  name: string;
  context?: Record<string, string>;
}): string {
  const ctx = input.context || {};
  const stats = ctx.stats || '';
  const total = ctx.total || '?';
  const periode = ctx.periode ? ` (periode : ${ctx.periode})` : '';
  return `Tu es analyste senior pour Algor Int — cabinet francais d'intelligence economique et securitaire.

PAYS ANALYSE : **${input.name}**${periode}

Voici les STATISTIQUES REELLES issues de notre base HUMINT proprietaire (${total} evenements). Elles font foi. Base ton analyse EXCLUSIVEMENT sur ces chiffres : ne fabrique AUCUN nombre, AUCUN pourcentage et AUCUNE localite qui ne figure pas ci-dessous.

${stats}

Produis une lecture analytique courte et dense, en 3 sections markdown EXACTEMENT :

## Repartition geographique
2 a 3 phrases : ou se concentrent les evenements, quelles localites montrent une expansion ou un poids dominant. Cite des localites et leurs parts (%) telles que fournies.

## Typologie dominante
2 a 3 phrases : quels types d'evenements dominent, ce que ce mode operatoire revele.

## Acteurs
2 a 3 phrases : acteurs principaux et leur poids relatif.

REGLES STRICTES :
- Francais sobre, registre analyste senior, aucun emoji, aucune puce dans les paragraphes
- Cite UNIQUEMENT des chiffres presents dans les stats fournies
- Aucune speculation, aucune projection sur l'avenir
- Tu peux contextualiser tres brievement (1 incise) avec la recherche web mais sans introduire de donnee chiffree externe
- Sortie : juste les 3 sections, rien avant ni apres.`;
}

function buildPrompt(input: {
  name: string;
  ville?: string;
  pays?: string;
  context?: Record<string, string>;
  mode?: string;
}): string {
  if (input.mode === 'synthese') return buildSynthesePrompt(input);
  if (input.mode === 'analyse') return buildAnalysePrompt(input);
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

UTILISE INTENSIVEMENT la recherche web : 5-10 recherches ciblees minimum. Privilegie sources tier-1 (presse internationale, instituts, ONU, ACLED, IISS, Crisis Group, presse regionale). Pas de blogs aleatoires.

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

Cite tes sources : les references web seront affichees automatiquement.`;
}

interface BriefResult {
  brief: string;
  sources: Array<{ title: string; url: string }>;
  model: string;
}

// Parse la reponse de l'API Conversations Mistral. Le texte et les references
// arrivent dans `outputs` : entrees `message.output` dont `content` est soit une
// chaine, soit une liste de chunks (texte + `tool_reference` portant url/title).
function parseConversation(data: unknown): { brief: string; sources: Array<{ title: string; url: string }> } {
  const sources: Array<{ title: string; url: string }> = [];
  let brief = '';
  const seen = new Set<string>();
  const pushSource = (url?: string, title?: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    sources.push({ title: title || url, url });
  };

  const outputs = (data as { outputs?: unknown[] })?.outputs || [];
  for (const out of outputs) {
    const o = out as { type?: string; content?: unknown; tool_reference?: unknown[] };
    const content = o.content;
    if (typeof content === 'string') {
      brief += content;
    } else if (Array.isArray(content)) {
      for (const c of content) {
        const chunk = c as { type?: string; text?: string; url?: string; title?: string };
        if (chunk.type === 'tool_reference') {
          pushSource(chunk.url, chunk.title);
        } else if (typeof chunk.text === 'string') {
          brief += chunk.text;
        }
      }
    }
    // Certaines variantes exposent les references dans un tableau dedie.
    if (Array.isArray(o.tool_reference)) {
      for (const r of o.tool_reference) {
        const ref = r as { url?: string; title?: string };
        pushSource(ref.url, ref.title);
      }
    }
  }
  return { brief: brief.trim(), sources };
}

async function callMistral(prompt: string): Promise<BriefResult> {
  // Retry sur 429 (rate limit) et 503 (surcharge) — 5 tentatives, max ~28s.
  const delays = [0, 1500, 4000, 9000, 14000];
  let response: Response | null = null;
  let lastErrText = '';
  for (let i = 0; i < delays.length; i++) {
    const d = delays[i];
    if (d > 0) await new Promise((r) => setTimeout(r, d));
    response = await fetch(MISTRAL_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        inputs: prompt,
        tools: [{ type: 'web_search' }],
        completion_args: { temperature: 0.3 },
        // RGPD : ne pas conserver la requete cote Mistral.
        store: false,
      }),
    });
    if (response.ok) break;
    lastErrText = await response.text();
    if (response.status !== 503 && response.status !== 429) break;
  }
  if (!response || !response.ok) {
    throw new Error(`Mistral API ${response?.status ?? '???'}: ${lastErrText}`);
  }

  const data = await response.json();
  const { brief, sources } = parseConversation(data);
  if (!brief) throw new Error('Mistral : aucune reponse generee');
  return { brief, sources, model: MISTRAL_MODEL };
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

  if (!MISTRAL_API_KEY) {
    return new Response(JSON.stringify({
      error: 'Cle Mistral absente',
      hint: 'Ajoute MISTRAL_API_KEY dans Supabase > Project Settings > Edge Functions > Secrets. Cle sur https://console.mistral.ai',
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
    const result = await callMistral(prompt);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  } catch (e) {
    console.error('brief-securite-mistral error:', e);
    return new Response(JSON.stringify({ error: 'Echec generation', detail: String(e) }), {
      status: 502,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
});
