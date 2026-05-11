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
  <div id="site-auth-stars"></div>
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
:root.sa-pending body > *:not(#site-auth-overlay) { filter: blur(8px); pointer-events: none; user-select: none; }
#site-auth-overlay {
  position: fixed; inset: 0; z-index: 999999;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse 80% 60% at 70% 30%, rgba(184,149,74,0.04), transparent 60%),
              radial-gradient(ellipse 70% 50% at 20% 80%, rgba(90,143,168,0.025), transparent 60%),
              #0a0b0d;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  color: #ededee;
  -webkit-font-smoothing: antialiased;
  opacity: 0;
  animation: sa-fadein 0.25s ease forwards;
}
#site-auth-overlay.sa-closing { animation: sa-fadeout 0.3s ease forwards; }
@keyframes sa-fadein  { to { opacity: 1; } }
@keyframes sa-fadeout { to { opacity: 0; visibility: hidden; } }
#site-auth-stars {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.4), transparent 50%),
    radial-gradient(1px 1px at 80% 70%, rgba(255,255,255,0.3), transparent 50%),
    radial-gradient(1px 1px at 40% 80%, rgba(255,255,255,0.35), transparent 50%),
    radial-gradient(1px 1px at 65% 15%, rgba(255,255,255,0.25), transparent 50%),
    radial-gradient(1px 1px at 10% 60%, rgba(255,255,255,0.3), transparent 50%);
}
#site-auth-card {
  position: relative; z-index: 1;
  width: 380px; max-width: calc(100vw - 48px);
  background: #14161a;
  border: 1px solid rgba(255,255,255,0.08);
  border-top: 2px solid #b8954a;
  padding: 36px 36px 28px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(184,149,74,0.04);
}
.sa-brand {
  display: flex; align-items: center; gap: 12px;
  padding-bottom: 22px;
  margin-bottom: 22px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.sa-logo-dot {
  width: 8px; height: 8px;
  background: #b8954a;
  box-shadow: 0 0 0 3px rgba(184,149,74,0.15);
  flex: 0 0 8px;
}
.sa-brand-l1 {
  font-size: 13px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;
  color: #ededee;
}
.sa-brand-l2 {
  font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  font-size: 9.5px; font-weight: 400; letter-spacing: 0.14em;
  color: #6a6d72; text-transform: uppercase; margin-top: 4px;
}
.sa-title {
  font-size: 22px; font-weight: 500; letter-spacing: -0.01em;
  margin: 0 0 10px;
}
.sa-intro {
  font-size: 12.5px; line-height: 1.5; color: #8a8d93;
  margin: 0 0 26px; font-weight: 300;
}
.sa-field { display: block; margin-bottom: 14px; }
.sa-label {
  display: block;
  font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase;
  color: #6a6d72; margin-bottom: 7px;
}
#site-auth-email, #site-auth-password {
  width: 100%; box-sizing: border-box;
  padding: 11px 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.10);
  color: #ededee;
  font-family: inherit; font-size: 14px;
  outline: none;
  transition: border-color .15s ease, background .15s ease;
}
#site-auth-email:focus, #site-auth-password:focus {
  border-color: #b8954a;
  background: rgba(184,149,74,0.04);
}
#site-auth-error {
  display: none;
  font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  font-size: 10.5px; line-height: 1.4;
  color: #ef6055;
  padding: 8px 0 4px;
}
#site-auth-error.visible { display: block; }
#site-auth-submit {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; margin-top: 18px;
  padding: 13px 16px;
  background: rgba(184,149,74,0.08);
  border: 1px solid rgba(184,149,74,0.40);
  color: #d4b56e;
  font-family: inherit; font-size: 13px; font-weight: 500;
  letter-spacing: 0.08em; text-transform: uppercase;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
#site-auth-submit:hover:not(:disabled) {
  background: rgba(184,149,74,0.16);
  border-color: rgba(184,149,74,0.60);
}
#site-auth-submit:disabled { opacity: 0.55; cursor: progress; }
.sa-btn-arrow { font-family: ui-monospace, Menlo, monospace; opacity: 0.6; }
.sa-foot {
  margin-top: 28px; padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,0.05);
  font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase;
  color: #4a4d52;
  display: flex; gap: 10px;
}
.sa-foot-sep { color: #2e3035; }
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
