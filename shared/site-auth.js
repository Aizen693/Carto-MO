/**
 * site-auth.js — Site-wide Supabase auth gate
 *
 * Imported by each page (lobby + zones). Shows a full-screen login overlay
 * until the user has a valid Supabase session. Once authenticated, the
 * overlay fades out and the page renders normally.
 *
 * Sessions are shared with the admin tool (same storageKey: 'carto-admin-auth').
 * Users must be created via the Supabase dashboard.
 *
 * Design : carte sign-in glassmorphism violette (charte Carto-MO v3),
 * faisceaux lumineux animés + tilt 3D — porté du composant 21st.dev
 * "sign-in-card-2" en JS/CSS vanilla.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const SUPABASE_URL = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xxnL12zd9o5N30y1-Oi-0Q_YGYKMjh2';

// « Se souvenir de moi » : route le token vers localStorage (persistant) ou
// sessionStorage (effacé à la fermeture du navigateur). La préférence elle-même
// reste dans localStorage pour survivre entre les sessions.
const REMEMBER_KEY = 'carto-auth-remember';
const authStorage = {
  _target() {
    return localStorage.getItem(REMEMBER_KEY) === '0'
      ? window.sessionStorage
      : window.localStorage;
  },
  getItem(k) { return this._target().getItem(k); },
  setItem(k, v) { this._target().setItem(k, v); },
  removeItem(k) {
    window.sessionStorage.removeItem(k);
    window.localStorage.removeItem(k);
  },
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storageKey: 'carto-admin-auth',
    storage: authStorage,
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

const ICON_MAIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
const ICON_LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const ICON_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>`;
const ICON_ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

const OVERLAY_HTML = `
<div id="site-auth-overlay" aria-hidden="false" role="dialog" aria-modal="true">
  <div class="sa-bg-gradient"></div>
  <div class="sa-bg-noise"></div>
  <div class="sa-glow sa-glow-top"></div>
  <div class="sa-glow sa-glow-bottom"></div>
  <div class="sa-spot sa-spot-1"></div>
  <div class="sa-spot sa-spot-2"></div>

  <div class="sa-card-wrap">
    <div class="sa-tilt" id="sa-tilt">
      <div class="sa-beams" aria-hidden="true">
        <span class="sa-beam sa-beam-top"></span>
        <span class="sa-beam sa-beam-right"></span>
        <span class="sa-beam sa-beam-bottom"></span>
        <span class="sa-beam sa-beam-left"></span>
        <span class="sa-corner sa-corner-tl"></span>
        <span class="sa-corner sa-corner-tr"></span>
        <span class="sa-corner sa-corner-br"></span>
        <span class="sa-corner sa-corner-bl"></span>
      </div>

      <div class="sa-card">
        <div class="sa-card-pattern" aria-hidden="true"></div>

        <div class="sa-head">
          <div class="sa-logo">
            <img src="/shared/algor-mark.jpg" alt="Algor Access" decoding="async">
          </div>
          <h1 class="sa-title">Authentification</h1>
          <p class="sa-sub">Connectez-vous pour accéder à la console Algor Access.</p>
        </div>

        <form id="site-auth-form" autocomplete="on">
          <div class="sa-field">
            <span class="sa-field-icon">${ICON_MAIL}</span>
            <input id="site-auth-email" type="email" placeholder="Adresse email"
                   autocomplete="username" required spellcheck="false">
          </div>

          <div class="sa-field">
            <span class="sa-field-icon">${ICON_LOCK}</span>
            <input id="site-auth-password" type="password" placeholder="Mot de passe"
                   autocomplete="current-password" required>
            <button type="button" id="site-auth-eye" class="sa-eye"
                    aria-label="Afficher le mot de passe">
              <span class="sa-eye-off">${ICON_EYE_OFF}</span>
              <span class="sa-eye-on">${ICON_EYE}</span>
            </button>
          </div>

          <div class="sa-row">
            <label class="sa-remember">
              <input type="checkbox" id="site-auth-remember" checked>
              <span class="sa-check">${ICON_CHECK}</span>
              <span>Se souvenir de moi</span>
            </label>
            <a href="#" id="site-auth-forgot" class="sa-link">Mot de passe oublié&nbsp;?</a>
          </div>

          <div id="site-auth-error" role="alert" aria-live="polite"></div>

          <button id="site-auth-submit" type="submit" class="sa-submit">
            <span class="sa-submit-content">
              <span class="sa-btn-text">Se connecter</span>
              <span class="sa-btn-arrow">${ICON_ARROW}</span>
            </span>
            <span class="sa-spinner" aria-hidden="true"></span>
          </button>

          <p class="sa-signup">
            Pas encore de compte&nbsp;?
            <a href="#" id="site-auth-signup" class="sa-link sa-link-strong">Demander un accès</a>
          </p>
        </form>

        <div class="sa-foot">
          <span>algoracces.fr</span>
          <span class="sa-foot-sep">·</span>
          <span>accès restreint</span>
        </div>
      </div>
    </div>
  </div>
</div>
`;

const OVERLAY_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

:root.sa-pending body > *:not(#site-auth-overlay) {
  filter: blur(8px); pointer-events: none; user-select: none;
}

#site-auth-overlay {
  --v:       #7c4dbf;            /* violet vif */
  --v-deep:  #6B3FA0;            /* violet charte Carto-MO */
  --v-soft:  #a679e0;            /* violet clair */
  --sa-bg:   #0d0a18;            /* fond violet sombre */
  --sa-tx:   #ededf2;
  --sa-tx-d: rgba(255,255,255,0.55);
  --sa-tx-f: rgba(255,255,255,0.34);

  position: fixed; inset: 0; z-index: 999999;
  display: flex; align-items: center; justify-content: center;
  background: var(--sa-bg);
  font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  color: var(--sa-tx);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  opacity: 0;
  animation: sa-fadein 0.3s ease forwards;
}
#site-auth-overlay.sa-closing { animation: sa-fadeout 0.3s ease forwards; }
@keyframes sa-fadein  { to { opacity: 1; } }
@keyframes sa-fadeout { to { opacity: 0; visibility: hidden; } }

/* ── Fonds ─────────────────────────────────────────────── */
.sa-bg-gradient {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg,
    rgba(124,77,191,0.40) 0%,
    rgba(107,63,160,0.34) 38%,
    rgba(13,10,24,1) 88%);
}
.sa-bg-noise {
  position: absolute; inset: 0; pointer-events: none;
  opacity: 0.04; mix-blend-mode: soft-light;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px 200px;
}
.sa-glow {
  position: absolute; left: 50%; transform: translateX(-50%);
  pointer-events: none; filter: blur(70px);
}
.sa-glow-top {
  top: -22vh; width: 110vh; height: 60vh;
  border-radius: 0 0 50% 50%;
  background: rgba(166,121,224,0.30);
  animation: sa-pulse 8s ease-in-out infinite;
}
.sa-glow-bottom {
  bottom: -42vh; width: 92vh; height: 92vh;
  border-radius: 50%;
  background: rgba(124,77,191,0.34);
  animation: sa-pulse 6s ease-in-out infinite 1s;
}
.sa-spot {
  position: absolute; width: 24rem; height: 24rem; border-radius: 50%;
  background: rgba(255,255,255,0.05); filter: blur(100px);
  pointer-events: none; opacity: 0.4;
}
.sa-spot-1 { left: 22%; top: 20%; animation: sa-breathe 7s ease-in-out infinite; }
.sa-spot-2 { right: 22%; bottom: 20%; animation: sa-breathe 7s ease-in-out infinite 2s; }
@keyframes sa-pulse {
  0%,100% { opacity: 0.4; transform: translateX(-50%) scale(0.98); }
  50%     { opacity: 0.7; transform: translateX(-50%) scale(1.04); }
}
@keyframes sa-breathe {
  0%,100% { opacity: 0.25; } 50% { opacity: 0.5; }
}

/* ── Carte + tilt 3D ───────────────────────────────────── */
.sa-card-wrap {
  position: relative; z-index: 1;
  width: 384px; max-width: calc(100vw - 40px);
  perspective: 1500px;
  animation: sa-rise 0.7s cubic-bezier(0.22,1,0.36,1) both;
}
@keyframes sa-rise { from { opacity: 0; transform: translateY(22px); } }
.sa-tilt {
  position: relative;
  transition: transform 0.3s ease;
  transform-style: preserve-3d;
}

/* ── Faisceaux lumineux ────────────────────────────────── */
.sa-beams {
  position: absolute; inset: -1px;
  border-radius: 25px; overflow: hidden;
  pointer-events: none;
}
.sa-beam { position: absolute; opacity: 0.65; }
.sa-beam-top, .sa-beam-bottom {
  height: 2px; width: 50%;
  background: linear-gradient(90deg, transparent, #fff, transparent);
}
.sa-beam-left, .sa-beam-right {
  width: 2px; height: 50%;
  background: linear-gradient(180deg, transparent, #fff, transparent);
}
.sa-beam-top    { top: 0;    animation: sa-beam-h-l 4s ease-in-out infinite; }
.sa-beam-right  { right: 0;  animation: sa-beam-v-t 4s ease-in-out infinite 1s; }
.sa-beam-bottom { bottom: 0; animation: sa-beam-h-r 4s ease-in-out infinite 2s; }
.sa-beam-left   { left: 0;   animation: sa-beam-v-b 4s ease-in-out infinite 3s; }
@keyframes sa-beam-h-l { 0% { left: -50%; }   70%,100% { left: 100%; } }
@keyframes sa-beam-h-r { 0% { right: -50%; }  70%,100% { right: 100%; } }
@keyframes sa-beam-v-t { 0% { top: -50%; }    70%,100% { top: 100%; } }
@keyframes sa-beam-v-b { 0% { bottom: -50%; } 70%,100% { bottom: 100%; } }
.sa-corner {
  position: absolute; width: 7px; height: 7px; border-radius: 50%;
  background: rgba(255,255,255,0.55); filter: blur(2px);
  animation: sa-corner-pulse 2.3s ease-in-out infinite;
}
.sa-corner-tl { top: 0; left: 0; }
.sa-corner-tr { top: 0; right: 0; animation-delay: 0.5s; }
.sa-corner-br { bottom: 0; right: 0; animation-delay: 1s; }
.sa-corner-bl { bottom: 0; left: 0; animation-delay: 1.5s; }
@keyframes sa-corner-pulse { 0%,100% { opacity: 0.2; } 50% { opacity: 0.5; } }

/* ── Surface verre ─────────────────────────────────────── */
.sa-card {
  position: relative;
  background: rgba(20,14,38,0.62);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 24px;
  padding: 28px 28px 22px;
  box-shadow: 0 28px 70px rgba(0,0,0,0.55);
  overflow: hidden;
}
.sa-card-pattern {
  position: absolute; inset: 0; pointer-events: none; opacity: 0.035;
  background-image:
    linear-gradient(135deg, #fff 0.5px, transparent 0.5px),
    linear-gradient(45deg,  #fff 0.5px, transparent 0.5px);
  background-size: 30px 30px;
}

/* ── En-tête ───────────────────────────────────────────── */
.sa-head { position: relative; text-align: center; margin-bottom: 22px; }
.sa-logo {
  width: 46px; height: 46px; margin: 0 auto 12px;
  border-radius: 12px;
  background: #fff;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  box-shadow: 0 8px 22px rgba(124,77,191,0.45);
}
.sa-logo img {
  width: 100%; height: 100%;
  object-fit: contain;
  padding: 5px; box-sizing: border-box;
}
.sa-title {
  font-size: 21px; font-weight: 700; letter-spacing: -0.01em;
  margin: 0 0 5px; color: #fff;
}
.sa-sub {
  font-size: 12.5px; font-weight: 400; line-height: 1.45;
  color: var(--sa-tx-d); margin: 0;
}

/* ── Champs ────────────────────────────────────────────── */
.sa-field {
  position: relative; display: flex; align-items: center;
  margin-bottom: 12px;
}
.sa-field-icon {
  position: absolute; left: 13px;
  width: 16px; height: 16px;
  color: var(--sa-tx-f);
  display: flex; pointer-events: none;
  transition: color 0.25s ease;
}
.sa-field-icon svg { width: 100%; height: 100%; }
.sa-field:focus-within .sa-field-icon { color: #fff; }
#site-auth-email, #site-auth-password {
  width: 100%; box-sizing: border-box;
  height: 44px; padding: 0 14px 0 40px;
  background: rgba(255,255,255,0.05);
  border: 1px solid transparent;
  border-radius: 11px;
  color: #fff; font-family: inherit; font-size: 14px;
  outline: none;
  transition: border-color 0.25s ease, background 0.25s ease;
}
#site-auth-password { padding-right: 42px; }
#site-auth-email::placeholder, #site-auth-password::placeholder {
  color: var(--sa-tx-f);
}
#site-auth-email:focus, #site-auth-password:focus {
  background: rgba(255,255,255,0.09);
  border-color: rgba(255,255,255,0.20);
}
.sa-eye {
  position: absolute; right: 8px;
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: 0; padding: 0; cursor: pointer;
  color: var(--sa-tx-f);
  transition: color 0.2s ease;
}
.sa-eye:hover { color: #fff; }
.sa-eye svg { width: 16px; height: 16px; }
.sa-eye .sa-eye-on  { display: none; }
.sa-eye.is-open .sa-eye-off { display: none; }
.sa-eye.is-open .sa-eye-on  { display: flex; }

/* ── Ligne « se souvenir » + lien ──────────────────────── */
.sa-row {
  display: flex; align-items: center; justify-content: space-between;
  margin: 14px 0 4px;
}
.sa-remember {
  position: relative; display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--sa-tx-d); cursor: pointer;
  user-select: none;
}
.sa-remember input {
  position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  width: 17px; height: 17px; margin: 0; opacity: 0; cursor: pointer;
}
.sa-check {
  width: 17px; height: 17px; flex: 0 0 17px;
  border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.24);
  background: rgba(255,255,255,0.05);
  display: inline-flex; align-items: center; justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.sa-check svg {
  width: 11px; height: 11px; color: var(--sa-bg);
  opacity: 0; transition: opacity 0.15s ease;
}
.sa-remember input:checked ~ .sa-check {
  background: #fff; border-color: #fff;
}
.sa-remember input:checked ~ .sa-check svg { opacity: 1; }
.sa-remember input:focus-visible ~ .sa-check {
  box-shadow: 0 0 0 3px rgba(255,255,255,0.18);
}
.sa-link {
  font-size: 12px; color: var(--sa-tx-d);
  text-decoration: none; transition: color 0.2s ease;
}
.sa-link:hover { color: #fff; }
.sa-link-strong { color: #fff; font-weight: 600; }

/* ── Erreur / info ─────────────────────────────────────── */
#site-auth-error {
  display: none;
  font-size: 11.5px; line-height: 1.45;
  padding: 8px 0 2px;
  color: #ef8d86;
}
#site-auth-error.visible { display: block; }
#site-auth-error.sa-info { color: var(--sa-soft, var(--v-soft)); }

/* ── Bouton connexion ──────────────────────────────────── */
.sa-submit {
  position: relative; width: 100%; height: 46px; margin-top: 14px;
  border: 0; border-radius: 11px; cursor: pointer;
  background: linear-gradient(150deg, var(--v) 0%, var(--v-deep) 100%);
  color: #fff; font-family: inherit;
  overflow: hidden;
  box-shadow: 0 10px 26px rgba(124,77,191,0.40);
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
}
.sa-submit::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%);
  transform: translateX(-100%);
}
.sa-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow: 0 14px 32px rgba(124,77,191,0.55);
}
.sa-submit:active:not(:disabled) { transform: translateY(0) scale(0.99); }
.sa-submit:disabled { cursor: progress; }
.sa-submit-content {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  font-size: 14px; font-weight: 600;
}
.sa-btn-arrow { display: flex; width: 15px; height: 15px; }
.sa-btn-arrow svg { width: 100%; height: 100%; }
.sa-submit:hover:not(:disabled) .sa-btn-arrow { transform: translateX(3px); }
.sa-btn-arrow { transition: transform 0.25s ease; }
.sa-spinner {
  display: none;
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.45);
  border-top-color: #fff; border-radius: 50%;
  animation: sa-spin 0.7s linear infinite;
}
@keyframes sa-spin { to { transform: rotate(360deg); } }
.sa-submit.is-loading .sa-submit-content { display: none; }
.sa-submit.is-loading .sa-spinner {
  display: block; margin: 0 auto;
}
.sa-submit.is-loading::before { animation: sa-shimmer 1.4s ease-in-out infinite; }
@keyframes sa-shimmer {
  0% { transform: translateX(-100%); } 100% { transform: translateX(100%); }
}

/* ── Pied ──────────────────────────────────────────────── */
.sa-signup {
  text-align: center; font-size: 12px;
  color: var(--sa-tx-d); margin: 14px 0 0;
}
.sa-foot {
  display: flex; justify-content: center; gap: 9px;
  margin-top: 18px; padding-top: 14px;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--sa-tx-f);
}
.sa-foot-sep { opacity: 0.5; }

@media (prefers-reduced-motion: reduce) {
  #site-auth-overlay *, #site-auth-overlay {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
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
  const rememberIn = overlayEl.querySelector('#site-auth-remember');
  const eyeBtn = overlayEl.querySelector('#site-auth-eye');
  const tiltEl = overlayEl.querySelector('#sa-tilt');
  const wrapEl = overlayEl.querySelector('.sa-card-wrap');
  emailIn.focus();

  // Affiche/masque le mot de passe
  eyeBtn.addEventListener('click', () => {
    const reveal = passIn.type === 'password';
    passIn.type = reveal ? 'text' : 'password';
    eyeBtn.classList.toggle('is-open', reveal);
    eyeBtn.setAttribute('aria-label',
      reveal ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  });

  // Liens « mot de passe oublié » / « demander un accès » : gérés en interne
  function showNote(msg) {
    errEl.textContent = msg;
    errEl.className = 'visible sa-info';
  }
  overlayEl.querySelector('#site-auth-forgot').addEventListener('click', (e) => {
    e.preventDefault();
    showNote('Réinitialisation gérée en interne — contactez votre administrateur Algor Access.');
  });
  overlayEl.querySelector('#site-auth-signup').addEventListener('click', (e) => {
    e.preventDefault();
    showNote('Les accès sont créés en interne — contactez votre administrateur Algor Access.');
  });

  // Tilt 3D au survol (désactivé si l'utilisateur réduit les animations)
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    wrapEl.addEventListener('mousemove', (e) => {
      const r = tiltEl.getBoundingClientRect();
      const ry = ((e.clientX - r.left) / r.width - 0.5) * 16;
      const rx = (0.5 - (e.clientY - r.top) / r.height) * 16;
      tiltEl.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    });
    wrapEl.addEventListener('mouseleave', () => {
      tiltEl.style.transform = 'rotateX(0deg) rotateY(0deg)';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.className = '';
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    try {
      localStorage.setItem(REMEMBER_KEY, rememberIn.checked ? '1' : '0');
      const { error } = await supabase.auth.signInWithPassword({
        email: emailIn.value.trim(),
        password: passIn.value,
      });
      if (error) throw error;
      removeOverlay();
    } catch (err) {
      const code = (err && (err.status || err.code)) || 'auth';
      errEl.textContent = 'Échec de connexion · code ' + code + ' · vérifier email et mot de passe';
      errEl.className = 'visible';
      passIn.value = '';
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
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
