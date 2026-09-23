/**
 * site-auth.js — Portail d'accès aux théâtres (Supabase auth)
 *
 * Importé par les 6 zones (pas la homepage, qui est publique).
 * Affiche un overlay plein écran tant que l'utilisateur n'a pas :
 *   1. une session Supabase valide  ET
 *   2. un profil avec plan = 'premium'.
 *
 * 3 vues dans l'overlay :
 *   - login   : connexion email + mot de passe
 *   - signup  : création de compte en libre-service (compte créé en 'free')
 *   - upgrade : compte connecté mais gratuit → accès théâtres refusé
 *
 * Les comptes sont créés par les visiteurs eux-mêmes. Le passage en
 * 'premium' se fait uniquement côté admin (console admin).
 * Session partagée avec la console admin (storageKey 'carto-admin-auth').
 *
 * Design : carte sign-in glassmorphism violette — porté du composant
 * 21st.dev "sign-in-card-2" en JS/CSS vanilla.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const SUPABASE_URL = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xxnL12zd9o5N30y1-Oi-0Q_YGYKMjh2';

const MIN_PASSWORD = 12;

// Lien d'abonnement premium (Stripe...). Vide tant que le paiement n'est pas
// branché → le bouton « S'abonner » reste désactivé.
const SUBSCRIBE_URL = '';

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

// Retour depuis un lien email (confirmation d'inscription, lien magique,
// réinitialisation) : Supabase (flow implicit) renvoie les jetons dans le hash,
// p.ex. #access_token=…&type=signup. On le repère AVANT que detectSessionInUrl
// ne nettoie l'URL, pour afficher ensuite le message « Vous êtes bien connecté ».
const EMAIL_RETURN = /[#&](access_token|code)=/.test(location.hash)
                  || /[?&]code=/.test(location.search);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storageKey: 'carto-admin-auth',
    storage: authStorage,
    flowType: 'implicit',
    // true : consomme le jeton présent dans l'URL au retour d'un lien email et
    // ouvre la session automatiquement → l'utilisateur est connecté dès qu'il
    // revient sur le site après avoir confirmé son adresse (auto-login).
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Expose for convenience (e.g. logout buttons across pages can call this).
// openLogin() est défini plus bas, après buildOverlay().
window.algorAuth = {
  supabase,
  async logout() {
    await supabase.auth.signOut();
    location.reload();
  },
};

// Promesse résolue une fois l'accès premium confirmé (voir l'événement
// « algorAuthReady » émis par gateSite() / proceedAfterAuth()). Les zones
// attendent ceci avant de télécharger leurs données depuis le Storage privé.
let _resolvePremiumReady;
window.algorAuth.ready = new Promise((resolve) => { _resolvePremiumReady = resolve; });
window.addEventListener('algorAuthReady', () => _resolvePremiumReady());

// Charge le contenu BRUT (texte) d'un fichier de zone depuis le bucket privé
// Supabase « zones ». `path` = chemin type 'sahel/humint.geojson' ou
// 'moyen-orient/2005-2006.kml'. Bloque jusqu'à confirmation de l'accès premium
// → la RLS Storage refuse tout téléchargement sans session premium (plan
// premium ou rôle staff). Sert de base au chargement geojson ET kml.
window.algorAuth.loadZoneRaw = async function (path) {
  await window.algorAuth.ready;
  const clean = String(path).replace(/^\.?\//, '').split('?')[0];
  // Rafale au démarrage : plusieurs calques se chargent en parallèle dès que
  // l'accès est confirmé, mais le token de session peut ne pas être encore
  // attaché au client storage (plusieurs GoTrueClient en concurrence). On force
  // getSession() avant chaque tentative pour garantir le token, et on réessaie.
  let lastErr = '';
  for (let i = 0; i < 5; i++) {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess && sess.session && sess.session.access_token;
      // Lecture SANS cache (navigateur ni CDN) : Storage autorise 1 h de cache,
      // on relisait parfois l'ancienne version du fichier après une publication.
      if (token) {
        const r = await fetch(SUPABASE_URL + '/storage/v1/object/authenticated/zones/' + clean.split('/').map(encodeURIComponent).join('/') + '?cb=' + Date.now(),
          { headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_KEY }, cache: 'no-store' });
        if (r.ok) return r.text();
      }
      const { data, error } = await supabase.storage.from('zones').download(clean);
      if (data && !error) return data.text();
      lastErr = (error && error.message) || 'inconnue';
    } catch (e) { lastErr = String(e); }
    await new Promise(function (r) { setTimeout(r, 400 * (i + 1)); });
  }
  console.warn('[algorAuth] Storage échec définitif', clean, lastErr);
  throw new Error('Zone indisponible: ' + clean);
};

// Variante JSON (geojson / .json) : renvoie l'objet parsé.
window.algorAuth.loadZoneFile = async function (path) {
  return JSON.parse(await window.algorAuth.loadZoneRaw(path));
};

const ICON_MAIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
const ICON_LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const ICON_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>`;
const ICON_ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_STAR = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2.5l2.9 5.9 6.6.95-4.75 4.63 1.12 6.52L12 17.9l-5.9 3.1 1.13-6.52L2.5 9.85l6.6-.95z"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const ICON_USER  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

const FIELD = (icon, input) =>
  `<div class="sa-field"><span class="sa-field-icon">${icon}</span>${input}</div>`;

const PASSWORD_FIELD = (id, placeholder, autocomplete) => `
<div class="sa-field">
  <span class="sa-field-icon">${ICON_LOCK}</span>
  <input id="${id}" type="password" placeholder="${placeholder}"
         autocomplete="${autocomplete}" required>
  <button type="button" class="sa-eye" aria-label="Afficher le mot de passe">
    <span class="sa-eye-off">${ICON_EYE_OFF}</span>
    <span class="sa-eye-on">${ICON_EYE}</span>
  </button>
</div>`;

const SUBMIT = (label) => `
<button type="submit" class="sa-submit">
  <span class="sa-submit-content">
    <span class="sa-btn-text">${label}</span>
    <span class="sa-btn-arrow">${ICON_ARROW}</span>
  </span>
  <span class="sa-spinner" aria-hidden="true"></span>
</button>`;

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

        <button type="button" class="sa-close" id="sa-close-btn" aria-label="Fermer">
          ${ICON_CLOSE}
        </button>

        <div class="sa-head">
          <div class="sa-logo">
            <svg viewBox="0 0 100 100" role="img" aria-label="Algor Access"><path fill="currentColor" d="M16 90 L28 90 L46.4 40 L34.4 40 Z M74 90 L86 90 L75 62 L63 62 Z M50 5 L59 14 L50 23 L41 14 Z"/></svg>
          </div>
          <h1 class="sa-title" id="sa-title">Authentification</h1>
          <p class="sa-sub" id="sa-sub">Connectez-vous pour accéder aux théâtres Algor Access.</p>
        </div>

        <!-- ── Vue : connexion ── -->
        <div class="sa-view sa-view-active" id="sa-view-login">
          <form id="site-auth-form" autocomplete="on">
            ${FIELD(ICON_MAIL, `<input id="site-auth-email" type="email" placeholder="Adresse email" autocomplete="username" required spellcheck="false">`)}
            ${PASSWORD_FIELD('site-auth-password', 'Mot de passe', 'current-password')}
            <div class="sa-row">
              <label class="sa-remember">
                <input type="checkbox" id="site-auth-remember" checked>
                <span class="sa-check">${ICON_CHECK}</span>
                <span>Se souvenir de moi</span>
              </label>
              <a href="#" id="site-auth-forgot" class="sa-link">Mot de passe oublié&nbsp;?</a>
            </div>
            <div class="sa-error" id="site-auth-error" role="alert" aria-live="polite"></div>
            ${SUBMIT('Se connecter')}
          </form>
          <p class="sa-signup">
            Pas encore de compte&nbsp;?
            <a href="#" id="sa-go-signup" class="sa-link sa-link-strong">Créer un compte</a>
          </p>
          <p class="sa-premium-line">${ICON_STAR}<span>Les 6 théâtres d'analyse sont réservés aux abonnés premium</span></p>
        </div>

        <!-- ── Vue : inscription ── -->
        <div class="sa-view" id="sa-view-signup">
          <form id="site-auth-signup-form" autocomplete="on">
            ${FIELD(ICON_MAIL, `<input id="sa-signup-email" type="email" placeholder="Adresse email" autocomplete="email" required spellcheck="false">`)}
            ${PASSWORD_FIELD('sa-signup-password', 'Mot de passe (12 caractères min.)', 'new-password')}
            ${PASSWORD_FIELD('sa-signup-confirm', 'Confirmer le mot de passe', 'new-password')}
            <div class="sa-error" id="site-auth-signup-error" role="alert" aria-live="polite"></div>
            ${SUBMIT('Créer mon compte')}
          </form>
          <p class="sa-signup">
            Déjà un compte&nbsp;?
            <a href="#" id="sa-go-login" class="sa-link sa-link-strong">Se connecter</a>
          </p>
          <p class="sa-note">Le compte créé est gratuit. L'accès aux théâtres nécessite un passage premium.</p>
        </div>

        <!-- ── Vue : compte connecté (premium / admin / editor) ── -->
        <div class="sa-view" id="sa-view-account">
          <div class="sa-upgrade">
            <div class="sa-upgrade-badge">${ICON_USER}</div>
            <p class="sa-upgrade-lead">
              Connecté en tant que <strong id="sa-account-email">…</strong>.<br>
              <span class="sa-account-plan-line">Plan&nbsp;: <span id="sa-account-plan">…</span></span>
            </p>
            <button type="button" id="sa-goto-theatres" class="sa-submit">
              <span class="sa-submit-content">
                <span class="sa-btn-text">Accéder aux théâtres</span>
                <span class="sa-btn-arrow">${ICON_ARROW}</span>
              </span>
            </button>
            <a href="#" id="sa-account-logout" class="sa-link sa-upgrade-logout">Se déconnecter</a>
          </div>
        </div>

        <!-- ── Vue : compte gratuit (upgrade premium) ── -->
        <div class="sa-view" id="sa-view-upgrade">
          <div class="sa-upgrade">
            <div class="sa-upgrade-badge">${ICON_STAR}</div>
            <p class="sa-upgrade-lead">
              L'accès aux 6 théâtres d'analyse est réservé aux abonnés premium.
            </p>
            <ul class="sa-perks">
              <li>${ICON_CHECK}<span>6 théâtres OSINT suivis en temps réel</span></li>
              <li>${ICON_CHECK}<span>Cartographie interactive, calques &amp; timeline</span></li>
              <li>${ICON_CHECK}<span>Briefs de sécurité générés par IA</span></li>
            </ul>
            <button type="button" id="sa-subscribe-btn" class="sa-submit" disabled>
              <span class="sa-submit-content">
                <span class="sa-btn-text">S'abonner — bientôt disponible</span>
              </span>
            </button>
            <a href="#" id="sa-logout-btn" class="sa-link sa-upgrade-logout">Se déconnecter</a>
          </div>
        </div>

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
/* Charte v5 (sept. 2026) : nuit, papier, filets. Plus de verre, de halos ni de faisceaux. */
:root.sa-pending body > *:not(#site-auth-overlay):not(#algor-welcome-toast) {
  filter: blur(8px); pointer-events: none; user-select: none;
}
#site-auth-overlay {
  --sa-ink: #1C1D21; --sa-ink-2: #3C3D42; --sa-muted: #6E6F74; --sa-faint: #A8A9AD;
  --sa-line: rgba(28,29,33,0.14); --sa-stone: #D8D8D8;
  position: fixed; inset: 0; z-index: 999999;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: #0F1013;
  font-family: 'Host Grotesk', 'Helvetica Neue', Arial, sans-serif;
  color: var(--sa-ink); -webkit-font-smoothing: antialiased;
  overflow: auto; opacity: 0; animation: sa-fadein .35s ease forwards;
}
#site-auth-overlay.sa-closing { animation: sa-fadeout .3s ease forwards; }
@keyframes sa-fadein  { to { opacity: 1; } }
@keyframes sa-fadeout { to { opacity: 0; visibility: hidden; } }
#site-auth-overlay.is-dismissible { background: rgba(15,16,19,0.78); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.sa-bg-gradient, .sa-bg-noise, .sa-glow, .sa-spot, .sa-beams, .sa-corner, .sa-card-pattern { display: none !important; }

.sa-card-wrap { position: relative; z-index: 1; width: 420px; max-width: 100%; margin: auto; animation: sa-rise .6s cubic-bezier(0.16,1,0.3,1) both; }
@keyframes sa-rise { from { opacity: 0; transform: translateY(14px); } }
.sa-tilt { transform: none !important; }
.sa-card { position: relative; background: #FFFFFF; border-radius: 4px; padding: 36px 36px 26px; box-shadow: 0 30px 80px -40px rgba(0,0,0,.6); }

.sa-close { position: absolute; top: 14px; right: 14px; width: 34px; height: 34px; display: none; align-items: center; justify-content: center; background: none; border: 1px solid var(--sa-line); border-radius: 2px; padding: 0; cursor: pointer; color: var(--sa-ink); z-index: 2; transition: background .2s ease; }
.sa-close:hover { background: #EEEEEE; }
.sa-close svg { width: 15px; height: 15px; }
#site-auth-overlay.is-dismissible .sa-close { display: flex; }

.sa-head { position: relative; margin-bottom: 26px; }
.sa-logo { width: 34px; height: 34px; margin: 0 0 22px; color: var(--sa-ink); background: none; box-shadow: none; }
.sa-logo svg { width: 100%; height: 100%; display: block; }
.sa-title { font-size: 30px; font-weight: 400; line-height: 1.1; letter-spacing: -0.03em; margin: 0 0 8px; color: var(--sa-ink); }
.sa-sub { font-size: 15px; line-height: 1.5; color: var(--sa-muted); margin: 0; }

.sa-view { display: none; }
.sa-view.sa-view-active { display: block; }

.sa-field { position: relative; display: flex; align-items: center; margin-bottom: 18px; }
.sa-field-icon { display: none; }
.sa-field input { width: 100%; box-sizing: border-box; height: 46px; padding: 0 0 4px; background: transparent; border: 0; border-bottom: 1px solid var(--sa-stone); border-radius: 0; color: var(--sa-ink); font: 400 17px/1.3 inherit; font-family: inherit; outline: none; transition: border-color .2s ease; }
.sa-field input[type="password"] { padding-right: 40px; }
.sa-field input::placeholder { color: var(--sa-faint); }
.sa-field input:focus { border-bottom-color: var(--sa-ink); background: transparent; }
.sa-eye { position: absolute; right: 0; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; background: none; border: 0; padding: 0; cursor: pointer; color: var(--sa-muted); border-radius: 2px; transition: color .2s ease; }
.sa-eye:hover { color: var(--sa-ink); background: none; }
.sa-eye svg { width: 17px; height: 17px; }
.sa-eye .sa-eye-on { display: none; }
.sa-eye.is-open .sa-eye-off { display: none; }
.sa-eye.is-open .sa-eye-on { display: flex; }

.sa-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 6px 0 4px; }
.sa-remember { position: relative; display: inline-flex; align-items: center; gap: 9px; font-size: 14px; color: var(--sa-ink-2); cursor: pointer; user-select: none; }
.sa-remember input { position: absolute; left: 0; top: 50%; transform: translateY(-50%); width: 17px; height: 17px; margin: 0; opacity: 0; cursor: pointer; }
.sa-check { width: 17px; height: 17px; flex: 0 0 17px; border-radius: 2px; border: 1px solid var(--sa-ink-2); background: #FFF; display: inline-flex; align-items: center; justify-content: center; transition: background .15s ease; }
.sa-check svg { width: 11px; height: 11px; color: #FFFFFF; opacity: 0; transition: opacity .15s ease; }
.sa-remember input:checked ~ .sa-check { background: var(--sa-ink); border-color: var(--sa-ink); }
.sa-remember input:checked ~ .sa-check svg { opacity: 1; }
.sa-remember input:focus-visible ~ .sa-check { outline: 2px solid var(--sa-ink); outline-offset: 2px; box-shadow: none; }
.sa-link { font-size: 14px; color: var(--sa-ink-2); text-decoration: underline; text-decoration-color: var(--sa-faint); text-underline-offset: 4px; text-decoration-thickness: 1px; transition: text-decoration-color .2s ease; }
.sa-link:hover { color: var(--sa-ink); text-decoration-color: currentColor; }
.sa-link-strong { color: var(--sa-ink); font-weight: 500; }

.sa-error { display: none; font-size: 14px; line-height: 1.45; padding: 10px 0 2px; color: #A12E2E; }
.sa-error.visible { display: block; }
.sa-error.sa-info { color: var(--sa-ink-2); }
.sa-error.sa-ok { color: #1F6B45; }

.sa-submit { position: relative; width: 100%; height: 48px; margin-top: 20px; border: 1px solid var(--sa-ink); border-radius: 2px; cursor: pointer; background: var(--sa-ink); color: #FFF; font-family: inherit; overflow: hidden; box-shadow: none; transition: background .2s ease, color .2s ease; }
.sa-submit::before { display: none; }
.sa-submit:hover:not(:disabled) { background: #FFF; color: var(--sa-ink); transform: none; filter: none; box-shadow: none; }
.sa-submit:active:not(:disabled) { transform: none; }
.sa-submit:disabled { opacity: .5; cursor: not-allowed; }
.sa-submit.is-loading { opacity: 1; cursor: progress; }
.sa-submit-ghost { background: #FFF; color: var(--sa-ink); border: 1px solid var(--sa-ink); }
.sa-submit-ghost:hover:not(:disabled) { background: var(--sa-ink); color: #FFF; }
.sa-submit-content { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 16px; font-weight: 400; }
.sa-btn-arrow { display: flex; width: 16px; height: 16px; transition: transform .45s cubic-bezier(0.16,1,0.3,1); }
.sa-btn-arrow svg { width: 100%; height: 100%; }
.sa-submit:hover:not(:disabled) .sa-btn-arrow { transform: translateX(3px); }
.sa-spinner { display: none; width: 18px; height: 18px; border: 1.5px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%; animation: sa-spin .7s linear infinite; }
@keyframes sa-spin { to { transform: rotate(360deg); } }
.sa-submit.is-loading .sa-submit-content { display: none; }
.sa-submit.is-loading .sa-spinner { display: block; margin: 0 auto; }

.sa-signup { font-size: 14px; color: var(--sa-muted); margin: 18px 0 0; }
.sa-note { font-size: 13px; line-height: 1.5; color: var(--sa-muted); margin: 10px 0 0; }
.sa-premium-line { display: flex; align-items: flex-start; gap: 8px; font-size: 14px; line-height: 1.45; color: var(--sa-ink-2); margin: 18px 0 0; padding-top: 16px; border-top: 1px solid var(--sa-line); }
.sa-premium-line svg { width: 14px; height: 14px; flex: 0 0 14px; margin-top: 3px; }

.sa-upgrade { padding: 2px 0; }
.sa-upgrade-badge { display: none; }
.sa-upgrade-lead { font-size: 16px; line-height: 1.55; color: var(--sa-ink-2); margin: 0 0 16px; }
.sa-perks { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--sa-line); }
.sa-perks li { display: flex; align-items: center; gap: 10px; font-size: 15px; color: var(--sa-ink); padding: 11px 0; border-bottom: 1px solid var(--sa-line); }
.sa-perks li svg { display: none; }
.sa-upgrade-logout { display: inline-block; margin-top: 16px; }
.sa-account-plan-line { font-size: 14px; color: var(--sa-ink-2); }

.sa-foot { display: flex; gap: 9px; margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--sa-line); font-size: 13px; color: var(--sa-muted); }
.sa-foot-sep { opacity: .5; }

@media (max-width: 480px) { .sa-card { padding: 28px 22px 22px; } .sa-title { font-size: 26px; } }
@media (prefers-reduced-motion: reduce) {
  #site-auth-overlay *, #site-auth-overlay { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
`;

// Message de bienvenue : styles autonomes (aucune dépendance à l'overlay) →
// fonctionne sur toutes les pages, y compris la homepage publique.
const TOAST_CSS = `
#algor-welcome-toast {
  position: fixed; z-index: 1000000; right: 20px; bottom: 20px;
  display: flex; align-items: center; gap: 12px; max-width: min(380px, calc(100vw - 40px));
  padding: 14px 14px 14px 18px; background: #1B1C21; color: #F2F2F4;
  font-family: 'Host Grotesk', 'Helvetica Neue', Arial, sans-serif;
  border-radius: 4px; box-shadow: 0 20px 50px -24px rgba(0,0,0,.6);
  opacity: 0; transform: translateY(14px);
  transition: opacity .3s ease, transform .5s cubic-bezier(0.16,1,0.3,1);
}
#algor-welcome-toast.awt-in { opacity: 1; transform: translateY(0); }
#algor-welcome-toast .awt-icon { display: none; }
#algor-welcome-toast .awt-text { font-size: 15px; font-weight: 400; line-height: 1.4; }
#algor-welcome-toast .awt-email { display: block; font-size: 14px; color: #A8A9AD; word-break: break-all; }
#algor-welcome-toast .awt-close { flex: 0 0 auto; margin-left: 4px; background: none; border: 0; padding: 6px; cursor: pointer; color: #A8A9AD; display: flex; border-radius: 2px; transition: color .2s ease; }
#algor-welcome-toast .awt-close:hover { color: #FFF; background: none; }
#algor-welcome-toast .awt-close svg { width: 15px; height: 15px; }
@media (prefers-reduced-motion: reduce) { #algor-welcome-toast, #algor-welcome-toast.awt-in { transition: opacity .2s ease; transform: none; } }
`;

const VIEWS = {
  login: {
    title: 'Authentification',
    sub: 'Connectez-vous pour accéder aux théâtres Algor Access.',
    focus: '#site-auth-email',
  },
  signup: {
    title: 'Créer un compte',
    sub: 'Inscrivez-vous pour rejoindre Algor Access.',
    focus: '#sa-signup-email',
  },
  upgrade: {
    title: 'Passez premium',
    sub: "Débloquez l'accès complet aux théâtres d'analyse.",
    focus: null,
  },
  account: {
    title: 'Votre compte',
    sub: 'Vous êtes déjà connecté à Algor Access.',
    focus: null,
  },
};

// Pages gatées (overlay bloquant au chargement). Sur les autres pages
// (homepage publique, rubriques marketing), site-auth.js expose seulement
// algorAuth.openLogin() pour le bouton « Connexion ».
// « /veille/ » n'est plus dans cette liste : la page se garde elle-même et montre une
// présentation publique aux visiteurs (les données complètes restent protégées par la RLS premium).
const GATED_PREFIXES = ['/carte/', '/veille-carte/', '/veille-cyber/', '/sahel/', '/moyen-orient/', '/rdc/', '/afrique/', '/madagascar/', '/asie-sud/', '/archive/'];
const IS_GATED_PAGE = GATED_PREFIXES.some((p) => location.pathname.startsWith(p))
                   || /-v2\.html$/.test(location.pathname);

// Marque la page comme « zone privée » : les modules partagés (engine.js,
// calque-timeline.js) routent alors leurs chargements de données vers le
// Storage privé (premium) au lieu des fichiers statiques publics. La démo
// publique n'importe pas site-auth → ce flag reste absent → fetch statique.
window.ZONE_PRIVATE = IS_GATED_PAGE;

let overlayEl = null;

function injectStyles() {
  if (document.getElementById('site-auth-styles')) return;
  const style = document.createElement('style');
  style.id = 'site-auth-styles';
  style.textContent = OVERLAY_CSS;
  document.head.appendChild(style);
}

function switchView(name) {
  if (!overlayEl) return;
  overlayEl.querySelectorAll('.sa-view').forEach((v) => v.classList.remove('sa-view-active'));
  overlayEl.querySelector(`#sa-view-${name}`).classList.add('sa-view-active');
  const meta = VIEWS[name];
  overlayEl.querySelector('#sa-title').textContent = meta.title;
  overlayEl.querySelector('#sa-sub').textContent = meta.sub;
  if (meta.focus) overlayEl.querySelector(meta.focus)?.focus();
}

// Lit le rôle + le plan du profil connecté.
// En cas de doute (erreur, profil absent), valeurs les plus restrictives.
async function fetchProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, plan')
      .eq('id', userId)
      .single();
    if (error || !data) return { role: 'viewer', plan: 'free' };
    return { role: data.role || 'viewer', plan: data.plan || 'free' };
  } catch (e) {
    return { role: 'viewer', plan: 'free' };
  }
}

// Accès aux théâtres : l'équipe interne (admin/editor) y a toujours droit ;
// pour les autres comptes, il faut un plan premium.
function hasZoneAccess(profile) {
  return profile.role === 'admin'
    || profile.role === 'editor'
    || profile.plan === 'premium';
}

// Après une authentification réussie : accès accordé → on ouvre la zone,
// sinon → on bascule sur la vue upgrade.
async function proceedAfterAuth(userId) {
  const profile = await fetchProfile(userId);
  if (hasZoneAccess(profile)) {
    removeOverlay();
    // Débloque le chargement des données de zone (Storage privé).
    window.dispatchEvent(new CustomEvent('algorAuthReady'));
  } else {
    switchView('upgrade');
  }
}

function setError(el, message, kind) {
  el.textContent = message;
  el.className = 'sa-error visible' + (kind ? ' ' + kind : '');
}
function clearError(el) { el.className = 'sa-error'; }

// Affiche « Vous êtes bien connecté en tant que <email> ». Autonome : injecte
// ses propres styles si besoin, ne dépend pas de l'overlay. Auto-disparition.
let _welcomeTimer = null;
function showWelcomeToast(email) {
  if (!document.getElementById('algor-toast-styles')) {
    const st = document.createElement('style');
    st.id = 'algor-toast-styles';
    st.textContent = TOAST_CSS;
    document.head.appendChild(st);
  }
  document.getElementById('algor-welcome-toast')?.remove();
  clearTimeout(_welcomeTimer);

  const toast = document.createElement('div');
  toast.id = 'algor-welcome-toast';
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <span class="awt-icon">${ICON_CHECK}</span>
    <span class="awt-text">Vous êtes bien connecté<span class="awt-email"></span></span>
    <button type="button" class="awt-close" aria-label="Fermer">${ICON_CLOSE}</button>`;
  // email injecté en textContent (jamais innerHTML) → aucune injection possible.
  toast.querySelector('.awt-email').textContent = email ? 'en tant que ' + email : '';
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('awt-in'));
  const dismiss = () => {
    toast.classList.remove('awt-in');
    setTimeout(() => toast.remove(), 300);
  };
  toast.querySelector('.awt-close').addEventListener('click', dismiss);
  _welcomeTimer = setTimeout(dismiss, 6000);
}

function buildOverlay(opts) {
  injectStyles();
  const dismissible = !!(opts && opts.dismissible);
  if (!dismissible) {
    // Mode « gate » : on bloque toute la page sous l'overlay.
    document.documentElement.classList.add('sa-pending');
  }
  const wrapper = document.createElement('div');
  wrapper.innerHTML = OVERLAY_HTML;
  overlayEl = wrapper.firstElementChild;
  if (dismissible) overlayEl.classList.add('is-dismissible');
  document.body.appendChild(overlayEl);

  // Bouton fermer (visible seulement en mode dismissible — bouton « Connexion »).
  overlayEl.querySelector('#sa-close-btn').addEventListener('click', () => {
    removeOverlay({ silent: true });
  });
  // Esc ferme aussi en mode dismissible.
  if (dismissible) {
    const escHandler = (e) => {
      if (e.key === 'Escape') { removeOverlay({ silent: true }); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
  }

  // Bouton « Accéder aux théâtres » (vue account).
  overlayEl.querySelector('#sa-goto-theatres').addEventListener('click', () => {
    location.href = '/sahel/';
  });
  // Bouton « Se déconnecter » de la vue account.
  overlayEl.querySelector('#sa-account-logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    location.reload();
  });

  const loginForm = overlayEl.querySelector('#site-auth-form');
  const signupForm = overlayEl.querySelector('#site-auth-signup-form');
  const loginErr = overlayEl.querySelector('#site-auth-error');
  const signupErr = overlayEl.querySelector('#site-auth-signup-error');
  const rememberIn = overlayEl.querySelector('#site-auth-remember');
  const tiltEl = overlayEl.querySelector('#sa-tilt');
  const wrapEl = overlayEl.querySelector('.sa-card-wrap');

  overlayEl.querySelector('#site-auth-email').focus();

  // Affiche/masque les mots de passe (tous les champs .sa-eye)
  overlayEl.querySelectorAll('.sa-eye').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      btn.classList.toggle('is-open', reveal);
      btn.setAttribute('aria-label',
        reveal ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    });
  });

  // Bascule entre les vues login / signup
  overlayEl.querySelector('#sa-go-signup').addEventListener('click', (e) => {
    e.preventDefault();
    clearError(loginErr); clearError(signupErr);
    switchView('signup');
  });
  overlayEl.querySelector('#sa-go-login').addEventListener('click', (e) => {
    e.preventDefault();
    clearError(loginErr); clearError(signupErr);
    switchView('login');
  });

  // Mot de passe oublié — réinitialisation par email Supabase
  overlayEl.querySelector('#site-auth-forgot').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = overlayEl.querySelector('#site-auth-email').value.trim();
    if (!email) {
      setError(loginErr, 'Saisissez votre email ci-dessus, puis recliquez sur « Mot de passe oublié ».', 'sa-info');
      return;
    }
    try {
      await supabase.auth.resetPasswordForEmail(email);
      setError(loginErr, "Si un compte existe, un email de réinitialisation vient d'être envoyé.", 'sa-ok');
    } catch (err) {
      setError(loginErr, "Échec de l'envoi · réessayez plus tard.", null);
    }
  });

  // Bouton « S'abonner » — actif seulement si un lien de paiement est configuré
  const subscribeBtn = overlayEl.querySelector('#sa-subscribe-btn');
  if (SUBSCRIBE_URL) {
    subscribeBtn.disabled = false;
    subscribeBtn.querySelector('.sa-btn-text').textContent = "S'abonner";
    subscribeBtn.addEventListener('click', () => window.open(SUBSCRIBE_URL, '_blank', 'noopener'));
  }

  // Déconnexion depuis la vue upgrade
  overlayEl.querySelector('#sa-logout-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    location.reload();
  });

  // Tilt 3D au survol (désactivé si l'utilisateur réduit les animations)
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    wrapEl.addEventListener('mousemove', (e) => {
      const r = tiltEl.getBoundingClientRect();
      const ry = ((e.clientX - r.left) / r.width - 0.5) * 16;
      const rx = (0.5 - (e.clientY - r.top) / r.height) * 16;
      /* v5 : pas d'effet 3D */
    });
    wrapEl.addEventListener('mouseleave', () => {
      tiltEl.style.transform = 'rotateX(0deg) rotateY(0deg)';
    });
  }

  // ── Connexion ──
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(loginErr);
    const btn = loginForm.querySelector('.sa-submit');
    btn.disabled = true; btn.classList.add('is-loading');
    try {
      localStorage.setItem(REMEMBER_KEY, rememberIn.checked ? '1' : '0');
      const { data, error } = await supabase.auth.signInWithPassword({
        email: overlayEl.querySelector('#site-auth-email').value.trim(),
        password: overlayEl.querySelector('#site-auth-password').value,
      });
      if (error) throw error;
      await proceedAfterAuth(data.user.id);
      showWelcomeToast(data.user?.email);
    } catch (err) {
      const code = (err && (err.status || err.code)) || 'auth';
      setError(loginErr, 'Échec de connexion · code ' + code + ' · vérifier email et mot de passe', null);
      overlayEl.querySelector('#site-auth-password').value = '';
    } finally {
      btn.disabled = false; btn.classList.remove('is-loading');
    }
  });

  // ── Inscription ──
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(signupErr);
    const email = overlayEl.querySelector('#sa-signup-email').value.trim();
    const password = overlayEl.querySelector('#sa-signup-password').value;
    const confirm = overlayEl.querySelector('#sa-signup-confirm').value;

    if (password.length < MIN_PASSWORD) {
      setError(signupErr, `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`, null);
      return;
    }
    if (password !== confirm) {
      setError(signupErr, 'Les deux mots de passe ne correspondent pas.', null);
      return;
    }

    const btn = signupForm.querySelector('.sa-submit');
    btn.disabled = true; btn.classList.add('is-loading');
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session && data.user) {
        // Inscription immédiate (confirmation email désactivée) → compte gratuit
        await proceedAfterAuth(data.user.id);
        showWelcomeToast(data.user?.email);
      } else {
        // Confirmation email requise → au clic sur le lien, l'utilisateur
        // revient sur le site déjà connecté (detectSessionInUrl + toast).
        setError(signupErr, 'Compte créé. Cliquez sur le lien reçu par email : vous serez connecté automatiquement.', 'sa-ok');
        signupForm.reset();
      }
    } catch (err) {
      const msg = (err && err.message) || '';
      const friendly = /registered|already/i.test(msg)
        ? 'Un compte existe déjà avec cet email.'
        : 'Échec de l\'inscription · ' + (msg || 'réessayez plus tard');
      setError(signupErr, friendly, null);
    } finally {
      btn.disabled = false; btn.classList.remove('is-loading');
    }
  });
}

function removeOverlay(opts) {
  document.documentElement.classList.remove('sa-pending');
  if (!overlayEl) return;
  overlayEl.classList.add('sa-closing');
  const silent = !!(opts && opts.silent);
  setTimeout(() => {
    overlayEl?.remove();
    overlayEl = null;
    if (!silent) window.dispatchEvent(new CustomEvent('algorAuthReady'));
    if (window.map?.resize) try { window.map.resize(); } catch {}
  }, 320);
}

// Ouvre l'overlay à la demande (bouton « Connexion » sur pages publiques).
// Choisit automatiquement la vue selon l'état de session.
async function openLogin() {
  if (overlayEl) return; // déjà ouvert
  buildOverlay({ dismissible: true });
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) {
      const user = data.session.user;
      const profile = await fetchProfile(user.id);
      if (hasZoneAccess(profile)) {
        // Connecté avec accès → vue récap compte.
        overlayEl.querySelector('#sa-account-email').textContent = user.email || '—';
        const planLabel = profile.role === 'admin' ? 'admin'
                         : profile.role === 'editor' ? 'editor'
                         : (profile.plan || 'premium');
        overlayEl.querySelector('#sa-account-plan').textContent = planLabel;
        switchView('account');
        return;
      }
      // Connecté mais pas d'accès → vue upgrade.
      switchView('upgrade');
      return;
    }
  } catch (_) { /* fall through to login */ }
  switchView('login');
}
window.algorAuth.openLogin = openLogin;

// Auto-câblage : tout élément avec [data-algor-login] ou class .site-login
// ouvre l'overlay au clic. On délègue depuis document pour ne PAS toucher
// au DOM React (qui crash si on lui mute des attributs sous les pieds).
function startWireObserver() {
  window.__algorWireAttached = true;
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-algor-login], .site-login');
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    window.__algorWireFired = (window.__algorWireFired || 0) + 1;
    openLogin();
  }, true);
}

// Reflète l'état de session sur les boutons « Connexion » :
//  - HTML statique : on remplace directement le textContent.
//  - SPA React (sous #root) : on évite de toucher au DOM, le composant
//    écoute l'événement « algorAuthStateChanged » et fait le rendu.
async function notifyAuthState(session) {
  try {
    // Appel sans argument (init au chargement) : on lit la session une fois.
    // C'est hors callback onAuthStateChange, donc aucun risque de deadlock.
    if (arguments.length === 0) {
      const { data } = await supabase.auth.getSession();
      session = data?.session || null;
    }
    const loggedIn = !!session?.user;
    const email = session?.user?.email || null;
    window.algorAuthState = { loggedIn, email };
    document.documentElement.classList.toggle('algor-connecte', loggedIn);
    document.querySelectorAll('.site-login, [data-algor-login]').forEach((el) => {
      if (el.closest('#root')) return; // géré par React via l'event
      if (el.hasAttribute('data-auth-icone')) {
        // Case icône (nav mobile v5) : on garde les SVG, on change l'étiquette.
        el.setAttribute('aria-label', loggedIn ? 'Connecté' + (email ? ' : ' + email : '') : 'Connexion');
        el.title = el.getAttribute('aria-label');
        el.classList.toggle('is-logged', loggedIn);
        return;
      }
      el.textContent = loggedIn ? 'Connecté' : 'Connexion';
      el.classList.toggle('is-logged', loggedIn);
    });
    window.dispatchEvent(new CustomEvent('algorAuthStateChanged', { detail: { loggedIn, email } }));
  } catch (_) { /* ignore */ }
}
// Re-check à chaque changement (login / logout via overlay).
// IMPORTANT : on n'appelle JAMAIS getSession()/from() dans ce callback —
// supabase-js v2 tient un verrou pendant l'event et toute requete qui le
// redemande provoque un deadlock (bouton qui tourne sans fin). On se sert
// donc directement de la session fournie par l'event.
supabase.auth.onAuthStateChange((event, session) => {
  notifyAuthState(session);
  // Retour d'un lien email : detectSessionInUrl vient d'ouvrir la session
  // → confirmation visible « Vous êtes bien connecté… », une seule fois.
  // (On n'appelle JAMAIS getSession()/from() ici : on se sert de `session`.)
  if (EMAIL_RETURN && session?.user && !window.__algorWelcomed
      && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
    window.__algorWelcomed = true;
    showWelcomeToast(session.user.email);
  }
});

async function gateSite() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) {
      const profile = await fetchProfile(data.session.user.id);
      if (hasZoneAccess(profile)) {
        window.dispatchEvent(new CustomEvent('algorAuthReady'));
        return;
      }
      buildOverlay();
      switchView('upgrade');
      return;
    }
  } catch (e) {
    // proceed to show login
  }
  buildOverlay();
}

if (IS_GATED_PAGE) {
  // Pages théâtres / archive / rapports : overlay bloquant au chargement.
  gateSite();
} else {
  // Pages publiques (home, rubriques) : pas de gate, juste câbler les boutons
  // et refléter l'état de session sur le bouton « Connexion ».
  const initPublic = () => { startWireObserver(); notifyAuthState(); };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPublic);
  } else {
    initPublic();
  }
}
