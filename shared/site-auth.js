/**
 * site-auth.js — Site-wide Supabase auth gate
 *
 * Imported by each page (lobby + zones). Shows a full-screen login overlay
 * until the user has a valid Supabase session. Once authenticated, the
 * overlay fades out and the page renders normally.
 *
 * Sessions are shared with the admin tool (same storageKey: 'carto-admin-auth').
 * Users must be created via the Supabase dashboard.
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
    autoRefreshToken: true,
  },
});

// Expose for convenience (e.g. logout buttons across pages can call this)
window.algorAuth = {
  supabase,
  async logout() {
    await supabase.auth.signOut();
    location.reload();
  },
};

const OVERLAY_HTML = `
<div id="site-auth-overlay" aria-hidden="false" role="dialog" aria-modal="true">
  <div id="site-auth-card">
    <div class="sa-brand">
      <span class="sa-logo-dot"></span>
      <div class="sa-brand-stack">
        <div class="sa-brand-l1">ALGOR INT</div>
        <div class="sa-brand-l2">Console interne · accès restreint</div>
      </div>
    </div>
    <h1 class="sa-title">Authentification</h1>
    <p class="sa-intro">Identifiants requis pour accéder à la plateforme cartographique. Comptes créés et gérés en interne.</p>
    <form id="site-auth-form" autocomplete="on">
      <label class="sa-field">
        <span class="sa-label">Email</span>
        <input id="site-auth-email" type="email" autocomplete="username" required spellcheck="false">
      </label>
      <label class="sa-field">
        <span class="sa-label">Mot de passe</span>
        <input id="site-auth-password" type="password" autocomplete="current-password" required>
      </label>
      <div id="site-auth-error" role="alert" aria-live="polite"></div>
      <button id="site-auth-submit" type="submit">
        <span class="sa-btn-text">Se connecter</span>
        <span class="sa-btn-arrow">→</span>
      </button>
    </form>
    <div class="sa-foot">
      <span>algoracces.fr</span>
      <span class="sa-foot-sep">·</span>
      <span>diffusion restreinte</span>
    </div>
  </div>
</div>
`;

const OVERLAY_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
:root.sa-pending body > *:not(#site-auth-overlay) { filter: blur(8px); pointer-events: none; user-select: none; }
#site-auth-overlay {
  position: fixed; inset: 0; z-index: 999999;
  display: flex; align-items: center; justify-content: center;
  background:
    radial-gradient(ellipse 64% 52% at 80% 18%, rgba(107,63,160,0.12), transparent 62%),
    radial-gradient(ellipse 58% 48% at 14% 86%, rgba(46,132,212,0.10), transparent 62%),
    #F7F6FA;
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: #181428;
  -webkit-font-smoothing: antialiased;
  opacity: 0;
  animation: sa-fadein 0.25s ease forwards;
}
#site-auth-overlay.sa-closing { animation: sa-fadeout 0.3s ease forwards; }
@keyframes sa-fadein  { to { opacity: 1; } }
@keyframes sa-fadeout { to { opacity: 0; visibility: hidden; } }
#site-auth-card {
  position: relative; z-index: 1;
  width: 392px; max-width: calc(100vw - 48px);
  background: #FFFFFF;
  border: 1px solid rgba(24,20,40,0.10);
  border-radius: 18px;
  padding: 38px 38px 30px;
  box-shadow: 0 32px 80px -24px rgba(46,24,87,0.28), 0 12px 28px -12px rgba(24,20,40,0.10);
}
.sa-brand {
  display: flex; align-items: center; gap: 13px;
  padding-bottom: 22px;
  margin-bottom: 22px;
  border-bottom: 1px solid rgba(24,20,40,0.08);
}
.sa-logo-dot {
  width: 30px; height: 30px; flex: 0 0 30px;
  border-radius: 9px;
  background: linear-gradient(130deg, #6B3FA0 0%, #5650C6 48%, #2E84D4 100%);
  box-shadow: 0 6px 16px -4px rgba(86,80,198,0.55);
}
.sa-brand-l1 {
  font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
  color: #181428;
}
.sa-brand-l2 {
  font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  font-size: 9.5px; font-weight: 400; letter-spacing: 0.12em;
  color: #6E6982; text-transform: uppercase; margin-top: 4px;
}
.sa-title {
  font-size: 24px; font-weight: 700; letter-spacing: -0.02em;
  margin: 0 0 10px; color: #181428;
}
.sa-intro {
  font-size: 13px; line-height: 1.55; color: #6E6982;
  margin: 0 0 26px; font-weight: 400;
}
.sa-field { display: block; margin-bottom: 14px; }
.sa-label {
  display: block;
  font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase;
  color: #6E6982; margin-bottom: 7px;
}
#site-auth-email, #site-auth-password {
  width: 100%; box-sizing: border-box;
  padding: 12px 13px;
  background: #F5F3FA;
  border: 1px solid rgba(24,20,40,0.14);
  border-radius: 8px;
  color: #181428;
  font-family: inherit; font-size: 14px;
  outline: none;
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
#site-auth-email:focus, #site-auth-password:focus {
  border-color: #6B3FA0;
  background: #FFFFFF;
  box-shadow: 0 0 0 3px rgba(107,63,160,0.12);
}
#site-auth-error {
  display: none;
  font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  font-size: 10.5px; line-height: 1.4;
  color: #B83A4A;
  padding: 8px 0 4px;
}
#site-auth-error.visible { display: block; }
#site-auth-submit {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; margin-top: 20px;
  padding: 14px 16px;
  background: linear-gradient(130deg, #6B3FA0 0%, #5650C6 48%, #2E84D4 100%);
  border: none;
  border-radius: 10px;
  color: #FFFFFF;
  font-family: inherit; font-size: 13.5px; font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow: 0 8px 20px -8px rgba(86,80,198,0.6);
  transition: filter .15s ease, box-shadow .15s ease, transform .12s ease;
}
#site-auth-submit:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: 0 10px 26px -8px rgba(86,80,198,0.72);
}
#site-auth-submit:active:not(:disabled) { transform: translateY(1px); }
#site-auth-submit:disabled { opacity: 0.6; cursor: progress; }
.sa-btn-arrow { opacity: 0.85; }
.sa-foot {
  margin-top: 28px; padding-top: 16px;
  border-top: 1px solid rgba(24,20,40,0.07);
  font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  font-size: 9.5px; letter-spacing: 0.10em; text-transform: uppercase;
  color: #A19DB0;
  display: flex; gap: 10px;
}
.sa-foot-sep { color: #CFC8E2; }
`;

let overlayEl = null;

function injectStyles() {
  if (document.getElementById('site-auth-styles')) return;
  const style = document.createElement('style');
  style.id = 'site-auth-styles';
  style.textContent = OVERLAY_CSS;
  document.head.appendChild(style);
}

function buildOverlay() {
  injectStyles();
  document.documentElement.classList.add('sa-pending');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = OVERLAY_HTML;
  overlayEl = wrapper.firstElementChild;
  document.body.appendChild(overlayEl);

  const form = overlayEl.querySelector('#site-auth-form');
  const emailIn = overlayEl.querySelector('#site-auth-email');
  const passIn = overlayEl.querySelector('#site-auth-password');
  const errEl = overlayEl.querySelector('#site-auth-error');
  const submitBtn = overlayEl.querySelector('#site-auth-submit');
  emailIn.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.remove('visible');
    submitBtn.disabled = true;
    submitBtn.querySelector('.sa-btn-text').textContent = 'Vérification…';
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailIn.value.trim(),
        password: passIn.value,
      });
      if (error) throw error;
      removeOverlay();
    } catch (err) {
      const code = (err && (err.status || err.code)) || 'auth';
      errEl.textContent = 'Échec de connexion · code ' + code + ' · vérifier email et mot de passe';
      errEl.classList.add('visible');
      passIn.value = '';
      submitBtn.disabled = false;
      submitBtn.querySelector('.sa-btn-text').textContent = 'Se connecter';
    }
  });
}

function removeOverlay() {
  document.documentElement.classList.remove('sa-pending');
  if (!overlayEl) return;
  overlayEl.classList.add('sa-closing');
  setTimeout(() => {
    overlayEl?.remove();
    overlayEl = null;
    window.dispatchEvent(new CustomEvent('algorAuthReady'));
    if (window.map?.resize) try { window.map.resize(); } catch {}
  }, 320);
}

async function gateSite() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) {
      window.dispatchEvent(new CustomEvent('algorAuthReady'));
      return;
    }
  } catch (e) {
    // proceed to show login
  }
  buildOverlay();
}

gateSite();
