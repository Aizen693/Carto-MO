// inscription : crée un compte gratuit SANS mail de confirmation.
// Pourquoi : le service de mail intégré de Supabase est plafonné à 2 mails par
// heure pour tout le projet ; le 3e inscrit recevait une erreur 429.
// Ici le compte est créé déjà confirmé via l'Admin API (aucun mail envoyé),
// puis le site connecte la personne avec son mot de passe.
//
// Garde-fous : email et mot de passe validés, plafond par réseau (30 comptes
// par heure et par IP, assez pour une classe ou un bureau derrière le même
// wifi) et plafond global (300 par heure). L'IP n'est jamais stockée en clair.
// Le passage en premium reste une validation manuelle dans la console.
// Déploiement : verify_jwt = false (appelée par des visiteurs non connectés).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ORIGINES = ['https://algoracces.fr', 'https://www.algoracces.fr'];
const MIN_PASSWORD = 12;
const PAR_IP_HEURE = 30;
const GLOBAL_HEURE = 300;

function cors(req: Request) {
  const o = req.headers.get('Origin') || '';
  const ok = ORIGINES.includes(o) || /^http:\/\/localhost:\d+$/.test(o);
  return {
    'Access-Control-Allow-Origin': ok ? o : ORIGINES[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

async function empreinte(ip: string, sel: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(sel), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  const h = cors(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'methode' }, 405);

  let email = '', password = '';
  try {
    const b = await req.json();
    email = String(b.email || '').trim().toLowerCase();
    password = String(b.password || '');
  } catch { return json({ error: 'requete' }, 400); }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return json({ error: 'email' }, 400);
  if (password.length < MIN_PASSWORD || password.length > 72) return json({ error: 'mot_de_passe' }, 400);

  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, service, { auth: { persistSession: false } });

  const ip = (req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'inconnue').trim();
  const ipE = await empreinte(ip, service);
  const depuis = new Date(Date.now() - 3600_000).toISOString();

  const [{ count: nIp }, { count: nTout }] = await Promise.all([
    admin.from('inscriptions_journal').select('id', { count: 'exact', head: true }).eq('ip_empreinte', ipE).gte('cree_le', depuis),
    admin.from('inscriptions_journal').select('id', { count: 'exact', head: true }).gte('cree_le', depuis),
  ]);
  if ((nIp ?? 0) >= PAR_IP_HEURE || (nTout ?? 0) >= GLOBAL_HEURE) return json({ error: 'trop' }, 429);

  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    const code = (error as { code?: string }).code || '';
    if (code === 'email_exists' || /already|registered|exists/i.test(error.message)) return json({ error: 'existe' }, 409);
    if (code === 'weak_password') return json({ error: 'mot_de_passe' }, 400);
    return json({ error: 'serveur' }, 500);
  }

  await admin.from('inscriptions_journal').insert({ ip_empreinte: ipE });
  // Nettoyage : rien n'est gardé au-delà de 24 h.
  await admin.from('inscriptions_journal').delete().lt('cree_le', new Date(Date.now() - 86400_000).toISOString());

  return json({ ok: true });
});
