/**
 * staff-gate.js — Verrou « équipe interne » pour les dossiers clients (Castel…)
 *
 * Réserve la page aux comptes internes : profil avec role = 'admin' ou 'editor'.
 * Les clients (viewer / premium) sont refusés — contrairement au portail des
 * théâtres (site-auth.js) qui, lui, ouvre aux abonnés premium.
 *
 * La session est partagée avec la console admin et les théâtres
 * (storageKey 'carto-admin-auth'). Le parcours prévu : se connecter dans la
 * console admin, puis ouvrir le lien du dossier — la session est déjà là.
 *
 * Fail-closed : le contenu reste masqué tant que l'accès n'est pas accordé.
 * Le masquage initial est posé inline dans le <head> de la page (classe
 * 'staff-pending'), ce module ne fait que le lever en cas de succès.
 *
 * IMPORTANT : on ne fait pas supabase.from() dans onAuthStateChange (deadlock) —
 * on lit le profil par fetch() direct avec le token, comme admin/modules/auth.js.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const SUPABASE_URL = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xxnL12zd9o5N30y1-Oi-0Q_YGYKMjh2';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storageKey: 'carto-admin-auth',
    flowType: 'implicit',
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true
  }
});

const ADMIN_URL = '/admin/';

function injectStyles() {
  const css = `
  html.staff-pending body > *:not(#staff-gate-overlay) { visibility: hidden !important; }
  #staff-gate-overlay {
    position: fixed; inset: 0; z-index: 99999;
    display: flex; align-items: center; justify-content: center;
    background: radial-gradient(120% 120% at 50% 0%, #2E1857 0%, #160a2e 55%, #0b0518 100%);
    font-family: 'Plus Jakarta Sans', -apple-system, system-ui, sans-serif;
    color: #ECE7F7; padding: 24px;
  }
  #staff-gate-overlay .sg-card {
    width: 100%; max-width: 420px; text-align: center;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(180,150,230,0.22);
    border-radius: 18px; padding: 38px 32px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.45);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  }
  #staff-gate-overlay .sg-mark {
    width: 46px; height: 46px; margin: 0 auto 18px;
    border-radius: 12px; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #6B3FA0, #2E1857);
    color: #fff; font-weight: 700; font-size: 20px;
  }
  #staff-gate-overlay h1 { font-size: 19px; font-weight: 700; margin: 0 0 8px; letter-spacing: .01em; }
  #staff-gate-overlay p { font-size: 14px; line-height: 1.5; color: #B9AFC9; margin: 0 0 22px; }
  #staff-gate-overlay .sg-spinner {
    width: 26px; height: 26px; margin: 4px auto 0;
    border: 2.5px solid rgba(180,150,230,0.25); border-top-color: #B48CE6;
    border-radius: 50%; animation: sg-spin .8s linear infinite;
  }
  @keyframes sg-spin { to { transform: rotate(360deg); } }
  #staff-gate-overlay .sg-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: linear-gradient(135deg, #6B3FA0, #8B5FBF);
    color: #fff; text-decoration: none; font-weight: 600; font-size: 14px;
    padding: 11px 20px; border-radius: 10px; border: none; cursor: pointer;
    transition: filter .15s, transform .15s;
  }
  #staff-gate-overlay .sg-btn:hover { filter: brightness(1.08); transform: translateY(-1px); }
  #staff-gate-overlay .sg-ghost {
    display: inline-block; margin-top: 14px; font-size: 12.5px;
    color: #9C8FC0; text-decoration: underline; cursor: pointer; background: none; border: none;
  }
  #staff-gate-overlay .sg-foot { margin-top: 20px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #6E6390; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

function buildOverlay() {
  const ov = document.createElement('div');
  ov.id = 'staff-gate-overlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = `
    <div class="sg-card">
      <div class="sg-mark">C</div>
      <div class="sg-body" id="sg-body">
        <h1>Vérification de l'accès…</h1>
        <div class="sg-spinner"></div>
      </div>
      <div class="sg-foot">Dossier client · accès réservé à l'équipe</div>
    </div>`;
  document.body.appendChild(ov);
  return ov;
}

function showDenied(ov, { signedIn }) {
  const body = ov.querySelector('#sg-body');
  if (signedIn) {
    body.innerHTML = `
      <h1>Accès réservé à l'équipe</h1>
      <p>Ce dossier client est réservé aux comptes internes Algor (rôle éditeur ou admin). Votre compte n'y a pas accès.</p>
      <button class="sg-btn" id="sg-logout">Changer de compte</button>`;
    body.querySelector('#sg-logout').addEventListener('click', async () => {
      await supabase.auth.signOut();
      location.href = ADMIN_URL;
    });
  } else {
    body.innerHTML = `
      <h1>Accès réservé</h1>
      <p>Connectez-vous à la console pour ouvrir ce dossier client.</p>
      <a class="sg-btn" href="${ADMIN_URL}">Aller à la console</a>`;
  }
}

function reveal(ov) {
  document.documentElement.classList.remove('staff-pending');
  ov.remove();
}

async function fetchRole(userId, accessToken) {
  const url = `${SUPABASE_URL}/rest/v1/profiles?select=role&id=eq.${userId}`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.pgrst.object+json'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.role ? data.role : null;
  } catch (_) {
    return null;
  }
}

async function run() {
  // Sécurité : si JS échoue avant ce point, 'staff-pending' garde le contenu masqué.
  if (!document.documentElement.classList.contains('staff-pending')) {
    document.documentElement.classList.add('staff-pending');
  }
  injectStyles();
  const ov = buildOverlay();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !session.user) {
    showDenied(ov, { signedIn: false });
    return;
  }

  const role = await fetchRole(session.user.id, session.access_token);
  if (role === 'admin' || role === 'editor') {
    reveal(ov);
  } else {
    showDenied(ov, { signedIn: true });
  }
}

run();
