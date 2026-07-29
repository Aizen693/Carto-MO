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
      await supabase.auth.getSession();
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
            <img src="/shared/algor-mark.jpg" alt="Algor Access" decoding="async">
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
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

:root.sa-pending body > *:not(#site-auth-overlay):not(#algor-welcome-toast) {
  filter: blur(8px); pointer-events: none; user-select: none;
}

#site-auth-overlay {
  --v:       #7c4dbf;
  --v-deep:  #6B3FA0;
  --v-soft:  #a679e0;
  --sa-bg:   #F4F2F8;
  --sa-tx:   #181428;
  --sa-tx-d: rgba(24,20,40,0.62);
  --sa-tx-f: rgba(24,20,40,0.38);

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
    rgba(124,77,191,0.16) 0%,
    rgba(107,63,160,0.10) 38%,
    rgba(244,242,248,1) 88%);
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
  background: rgba(166,121,224,0.22);
  animation: sa-pulse 8s ease-in-out infinite;
}
.sa-glow-bottom {
  bottom: -42vh; width: 92vh; height: 92vh;
  border-radius: 50%;
  background: rgba(124,77,191,0.18);
  animation: sa-pulse 6s ease-in-out infinite 1s;
}
.sa-spot {
  position: absolute; width: 24rem; height: 24rem; border-radius: 50%;
  background: rgba(107,63,160,0.07); filter: blur(100px);
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
  background: linear-gradient(90deg, transparent, #6B3FA0, transparent);
}
.sa-beam-left, .sa-beam-right {
  width: 2px; height: 50%;
  background: linear-gradient(180deg, transparent, #6B3FA0, transparent);
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
  background: rgba(107,63,160,0.55); filter: blur(2px);
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
  background: rgba(255,255,255,0.74);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(24,20,40,0.08);
  border-radius: 24px;
  padding: 28px 28px 22px;
  box-shadow: 0 28px 70px rgba(46,24,87,0.16);
  overflow: hidden;
}
.sa-card-pattern {
  position: absolute; inset: 0; pointer-events: none; opacity: 0.04;
  background-image:
    linear-gradient(135deg, #6B3FA0 0.5px, transparent 0.5px),
    linear-gradient(45deg,  #6B3FA0 0.5px, transparent 0.5px);
  background-size: 30px 30px;
}

/* ── Bouton fermer (visible seulement en mode dismissible) ── */
.sa-close {
  position: absolute; top: 12px; right: 12px;
  width: 30px; height: 30px;
  display: none; align-items: center; justify-content: center;
  background: rgba(24,20,40,0.05); border: 1px solid rgba(24,20,40,0.10);
  border-radius: 8px; padding: 0; cursor: pointer;
  color: var(--sa-tx-d); z-index: 2;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
}
.sa-close:hover { background: rgba(24,20,40,0.09); color: #181428; border-color: rgba(24,20,40,0.20); }
.sa-close svg { width: 15px; height: 15px; }
#site-auth-overlay.is-dismissible .sa-close { display: flex; }

/* En mode dismissible : fond plus discret pour ne pas masquer la page */
#site-auth-overlay.is-dismissible { background: rgba(244,242,248,0.82); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
#site-auth-overlay.is-dismissible .sa-bg-gradient { opacity: 0.55; }

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
  margin: 0 0 5px; color: #181428;
}
.sa-sub {
  font-size: 12.5px; font-weight: 400; line-height: 1.45;
  color: var(--sa-tx-d); margin: 0;
}

/* ── Vues ──────────────────────────────────────────────── */
.sa-view { display: none; }
.sa-view.sa-view-active { display: block; }

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
.sa-field:focus-within .sa-field-icon { color: var(--v-deep); }
.sa-field input {
  width: 100%; box-sizing: border-box;
  height: 44px; padding: 0 14px 0 40px;
  background: rgba(24,20,40,0.04);
  border: 1px solid rgba(24,20,40,0.07);
  border-radius: 11px;
  color: #181428; font-family: inherit; font-size: 14px;
  outline: none;
  transition: border-color 0.25s ease, background 0.25s ease;
}
.sa-field input[type="password"] { padding-right: 42px; }
.sa-field input::placeholder { color: var(--sa-tx-f); }
.sa-field input:focus {
  background: #FFFFFF;
  border-color: rgba(107,63,160,0.45);
}
.sa-eye {
  position: absolute; right: 8px;
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: 0; padding: 0; cursor: pointer;
  color: var(--sa-tx-d);
  transition: color 0.2s ease, background 0.2s ease;
  border-radius: 7px;
}
.sa-eye:hover { color: #181428; background: rgba(24,20,40,0.06); }
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
  border: 1px solid rgba(24,20,40,0.24);
  background: rgba(24,20,40,0.04);
  display: inline-flex; align-items: center; justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.sa-check svg {
  width: 11px; height: 11px; color: #FFFFFF;
  opacity: 0; transition: opacity 0.15s ease;
}
.sa-remember input:checked ~ .sa-check {
  background: var(--v-deep); border-color: var(--v-deep);
}
.sa-remember input:checked ~ .sa-check svg { opacity: 1; }
.sa-remember input:focus-visible ~ .sa-check {
  box-shadow: 0 0 0 3px rgba(107,63,160,0.30);
}
.sa-link {
  font-size: 12px; color: var(--sa-tx-d);
  text-decoration: none; transition: color 0.2s ease;
}
.sa-link:hover { color: var(--v-deep); }
.sa-link-strong { color: var(--v-deep); font-weight: 600; }

/* ── Erreur / info ─────────────────────────────────────── */
.sa-error {
  display: none;
  font-size: 11.5px; line-height: 1.45;
  padding: 8px 0 2px;
  color: #b23b3b;
}
.sa-error.visible { display: block; }
.sa-error.sa-info { color: var(--v-deep); }
.sa-error.sa-ok   { color: #1b7f3b; }

/* ── Bouton principal ──────────────────────────────────── */
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
.sa-submit:disabled { opacity: 0.55; cursor: not-allowed; }
.sa-submit.is-loading { opacity: 1; cursor: progress; }
.sa-submit-ghost {
  background: rgba(24,20,40,0.04);
  border: 1px solid rgba(24,20,40,0.12);
  box-shadow: none;
}
.sa-submit-ghost:hover:not(:disabled) {
  background: rgba(24,20,40,0.08);
  filter: none;
  box-shadow: none;
}
.sa-submit-content {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  font-size: 14px; font-weight: 600;
}
.sa-btn-arrow { display: flex; width: 15px; height: 15px; transition: transform 0.25s ease; }
.sa-btn-arrow svg { width: 100%; height: 100%; }
.sa-submit:hover:not(:disabled) .sa-btn-arrow { transform: translateX(3px); }
.sa-spinner {
  display: none;
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.45);
  border-top-color: #fff; border-radius: 50%;
  animation: sa-spin 0.7s linear infinite;
}
@keyframes sa-spin { to { transform: rotate(360deg); } }
.sa-submit.is-loading .sa-submit-content { display: none; }
.sa-submit.is-loading .sa-spinner { display: block; margin: 0 auto; }
.sa-submit.is-loading::before { animation: sa-shimmer 1.4s ease-in-out infinite; }
@keyframes sa-shimmer {
  0% { transform: translateX(-100%); } 100% { transform: translateX(100%); }
}

/* ── Bas de carte ──────────────────────────────────────── */
.sa-signup {
  text-align: center; font-size: 12px;
  color: var(--sa-tx-d); margin: 14px 0 0;
}
.sa-note {
  text-align: center; font-size: 11px; line-height: 1.45;
  color: var(--sa-tx-f); margin: 9px 0 0;
}
.sa-premium-line {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  font-size: 11.5px; line-height: 1.4; color: var(--v-deep);
  margin: 13px 0 0; padding-top: 13px;
  border-top: 1px solid rgba(24,20,40,0.08);
  text-align: center;
}
.sa-premium-line svg { width: 13px; height: 13px; flex: 0 0 13px; }

/* ── Vue upgrade ───────────────────────────────────────── */
.sa-upgrade { text-align: center; padding: 4px 4px 2px; }
.sa-upgrade-badge {
  width: 44px; height: 44px; margin: 2px auto 14px;
  border-radius: 12px;
  background: linear-gradient(150deg, var(--v) 0%, var(--v-deep) 100%);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 22px rgba(124,77,191,0.45);
}
.sa-upgrade-badge svg { width: 22px; height: 22px; color: #fff; }
.sa-upgrade-lead {
  font-size: 13px; line-height: 1.55; color: var(--sa-tx-d);
  margin: 0 0 14px;
}
.sa-perks { list-style: none; margin: 0; padding: 0; text-align: left; }
.sa-perks li {
  display: flex; align-items: center; gap: 9px;
  font-size: 12.5px; color: var(--sa-tx);
  padding: 5px 2px;
}
.sa-perks li svg { width: 14px; height: 14px; flex: 0 0 14px; color: var(--v-deep); }
.sa-upgrade-logout { display: inline-block; margin-top: 14px; }
.sa-account-plan-line { font-size: 12px; color: var(--v-deep); }

.sa-foot {
  display: flex; justify-content: center; gap: 9px;
  margin-top: 18px; padding-top: 14px;
  border-top: 1px solid rgba(24,20,40,0.08);
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

// Message de bienvenue : styles autonomes (aucune dépendance à l'overlay) →
// fonctionne sur toutes les pages, y compris la homepage publique.
const TOAST_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&display=swap');
#algor-welcome-toast {
  position: fixed; z-index: 1000000;
  right: 20px; bottom: 20px;
  display: flex; align-items: center; gap: 12px;
  max-width: min(360px, calc(100vw - 40px));
  padding: 14px 16px;
  background: linear-gradient(150deg, #7c4dbf 0%, #6B3FA0 100%);
  color: #fff;
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(107,63,160,0.45);
  opacity: 0; transform: translateY(14px);
  transition: opacity .3s ease, transform .3s cubic-bezier(0.22,1,0.36,1);
}
#algor-welcome-toast.awt-in { opacity: 1; transform: translateY(0); }
#algor-welcome-toast .awt-icon {
  flex: 0 0 30px; width: 30px; height: 30px; border-radius: 9px;
  background: rgba(255,255,255,0.18);
  display: flex; align-items: center; justify-content: center;
}
#algor-welcome-toast .awt-icon svg { width: 16px; height: 16px; color: #fff; }
#algor-welcome-toast .awt-text { font-size: 13.5px; font-weight: 600; line-height: 1.4; }
#algor-welcome-toast .awt-email {
  display: block; font-weight: 500; font-size: 12.5px;
  opacity: 0.92; word-break: break-all;
}
#algor-welcome-toast .awt-close {
  flex: 0 0 auto; margin-left: 2px;
  background: none; border: 0; padding: 4px; cursor: pointer;
  color: rgba(255,255,255,0.8); display: flex; border-radius: 6px;
  transition: color .2s ease, background .2s ease;
}
#algor-welcome-toast .awt-close:hover { color: #fff; background: rgba(255,255,255,0.16); }
#algor-welcome-toast .awt-close svg { width: 15px; height: 15px; }
@media (prefers-reduced-motion: reduce) {
  #algor-welcome-toast, #algor-welcome-toast.awt-in { transition: opacity .2s ease; transform: none; }
}
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
const GATED_PREFIXES = ['/carte/', '/veille-carte/', '/sahel/', '/moyen-orient/', '/rdc/', '/afrique/', '/madagascar/', '/asie-sud/', '/archive/'];
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
      tiltEl.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
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
    document.querySelectorAll('.site-login, [data-algor-login]').forEach((el) => {
      if (el.closest('#root')) return; // géré par React via l'event
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
