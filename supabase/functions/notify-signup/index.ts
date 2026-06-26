// Edge Function : notify-signup  (PRIVEE — appelee par un Database Webhook)
// Previent Gaspar a chaque nouvelle inscription (INSERT dans public.profiles),
// sur Telegram ET par email, avec un lien vers la console admin ou il valide
// le passage en premium.
//
// Le compte arrive deja verrouille (plan = 'free', trigger handle_new_user) :
// cette fonction n'accorde aucun acces, elle te notifie pour que tu valides.
//
// Declenchee par un Database Webhook Supabase sur INSERT de public.profiles.
// Le webhook envoie un en-tete partage 'x-webhook-secret' qu'on verifie ici,
// pour que personne d'autre ne puisse spammer la fonction.
//
// Secrets attendus (supabase secrets set ...) :
//   NOTIFY_WEBHOOK_SECRET  secret partage avec le webhook (genere par nos soins)
//   TELEGRAM_BOT_TOKEN     token du bot @algoracces_bot
//   TELEGRAM_CHAT_ID       id du chat Telegram qui recoit la notif (Gaspar)
//   RESEND_API_KEY         cle API Resend pour l'email
//   NOTIFY_EMAIL_TO        destinataire de l'email (def: gapcimadomo@gmail.com)
//   NOTIFY_EMAIL_FROM      expediteur Resend (def: onboarding@resend.dev)
//   ADMIN_URL              lien console admin (def: https://algoracces.fr/admin/)
//
// Deploy : supabase functions deploy notify-signup --no-verify-jwt

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const WEBHOOK_SECRET   = Deno.env.get('NOTIFY_WEBHOOK_SECRET') ?? '';
const TELEGRAM_TOKEN   = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_TO   = Deno.env.get('NOTIFY_EMAIL_TO')   ?? 'gapcimadomo@gmail.com';
const EMAIL_FROM = Deno.env.get('NOTIFY_EMAIL_FROM') ?? 'onboarding@resend.dev';
const ADMIN_URL  = Deno.env.get('ADMIN_URL') ?? 'https://algoracces.fr/admin/';

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Echappe le HTML pour l'email (l'email est saisi par le visiteur).
function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

async function sendTelegram(email: string, when: string) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    return { ok: false, skipped: 'telegram non configure' };
  }
  const text =
    `🔔 *Nouvelle inscription Carto*\n\n` +
    `✉️ ${email}\n` +
    `🕒 ${when}\n\n` +
    `Compte cree en *free* (verrouille). Valide le passage premium dans la console admin.\n` +
    `${ADMIN_URL}`;
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!r.ok) return { ok: false, status: r.status, body: await r.text() };
  return { ok: true };
}

async function sendEmail(email: string, when: string) {
  if (!RESEND_API_KEY) return { ok: false, skipped: 'resend non configure' };
  const html =
    `<div style="font-family:system-ui,sans-serif;color:#1d1530">` +
    `<h2 style="color:#6B3FA0;margin:0 0 12px">Nouvelle inscription Carto</h2>` +
    `<p style="margin:4px 0"><strong>Email :</strong> ${esc(email)}</p>` +
    `<p style="margin:4px 0"><strong>Date :</strong> ${esc(when)}</p>` +
    `<p style="margin:16px 0 4px">Le compte est cree en <strong>free</strong> et reste verrouille ` +
    `tant que tu ne l'as pas valide.</p>` +
    `<p style="margin:16px 0"><a href="${esc(ADMIN_URL)}" ` +
    `style="background:#6B3FA0;color:#fff;padding:10px 18px;border-radius:8px;` +
    `text-decoration:none;display:inline-block">Ouvrir la console admin</a></p>` +
    `</div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Carto AlgorAcces <${EMAIL_FROM}>`,
      to: [EMAIL_TO],
      subject: `Nouvelle inscription : ${email}`,
      html,
    }),
  });
  if (!r.ok) return { ok: false, status: r.status, body: await r.text() };
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // Verifie le secret partage avec le webhook.
  if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  let payload: { type?: string; record?: { email?: string; created_at?: string } };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  // On ne notifie que sur les INSERT (le webhook devrait deja filtrer).
  if (payload.type && payload.type !== 'INSERT') {
    return json({ ok: true, ignored: payload.type });
  }

  const email = payload.record?.email ?? '(email inconnu)';
  const when  = payload.record?.created_at ?? new Date().toISOString();

  const [tg, mail] = await Promise.allSettled([
    sendTelegram(email, when),
    sendEmail(email, when),
  ]);

  return json({
    ok: true,
    telegram: tg.status === 'fulfilled' ? tg.value : { ok: false, error: String(tg.reason) },
    email: mail.status === 'fulfilled' ? mail.value : { ok: false, error: String(mail.reason) },
  });
});
