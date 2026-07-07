/* global React, ReactDOM, HomeView, ConsoleView, ConsoleGate, ComptesView, ArchivesView, VeilleView, RapportsView, PlatformView, Starfield */

const { useState, useEffect, useRef } = React;

// Statut « equipe » : true (admin/editor), false (client/anon), null (en cours).
// Sert a verrouiller la Console interne et ses sous-vues. La vraie protection
// des donnees reste cote serveur (RLS Supabase) ; ceci cache l'UI aux clients.
function useStaff() {
  const [staff, setStaff] = useState(null);
  useEffect(() => {
    let on = true, tries = 0;
    async function check() {
      const c = window.algorAuth && window.algorAuth.supabase;
      if (!c) { if (on && tries++ < 20) setTimeout(check, 250); return; }
      try {
        const { data: s } = await c.auth.getSession();
        const uid = s && s.session && s.session.user && s.session.user.id;
        if (!uid) { if (on) setStaff(false); return; }
        const r = await c.from('profiles').select('role').eq('id', uid).single();
        const role = r.data && r.data.role;
        if (on) setStaff(role === 'admin' || role === 'editor');
      } catch (e) { if (on) setStaff(false); }
    }
    check();
    const recheck = () => { tries = 0; check(); };
    window.addEventListener('algorAuthStateChanged', recheck);
    window.addEventListener('algorAuthReady', recheck);
    return () => {
      on = false;
      window.removeEventListener('algorAuthStateChanged', recheck);
      window.removeEventListener('algorAuthReady', recheck);
    };
  }, []);
  return staff;
}

// Statut « premium » du compte connecté : plan premium ou rôle équipe
// (admin/editor), soit l'accès réel aux 6 théâtres. Alimente le badge
// Premium du header. Même mécanique de détection que useStaff.
function usePremium() {
  const [premium, setPremium] = useState(false);
  useEffect(() => {
    let on = true, tries = 0;
    async function check() {
      const c = window.algorAuth && window.algorAuth.supabase;
      if (!c) { if (on && tries++ < 20) setTimeout(check, 250); return; }
      try {
        const { data: s } = await c.auth.getSession();
        const uid = s && s.session && s.session.user && s.session.user.id;
        if (!uid) { if (on) setPremium(false); return; }
        const r = await c.from('profiles').select('role, plan').eq('id', uid).single();
        const p = r.data || {};
        if (on) setPremium(p.plan === 'premium' || p.role === 'admin' || p.role === 'editor');
      } catch (e) { if (on) setPremium(false); }
    }
    check();
    const recheck = () => { tries = 0; check(); };
    window.addEventListener('algorAuthStateChanged', recheck);
    window.addEventListener('algorAuthReady', recheck);
    return () => {
      on = false;
      window.removeEventListener('algorAuthStateChanged', recheck);
      window.removeEventListener('algorAuthReady', recheck);
    };
  }, []);
  return premium;
}

function StarIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.9 6.26 6.6.7-4.9 4.5 1.35 6.54L12 16.9 6.05 20l1.35-6.54-4.9-4.5 6.6-.7z" />
    </svg>
  );
}

function PopCheck() {
  return (
    <svg className="cta-pop__check" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function App() {
  // Ancres : #comptes ouvre directement la vue Comptes (lien des notifs
  // d'inscription), #console ouvre la Console. Retour depuis /cloud/, /admin/...
  const [view, setView] = useState(
    window.location.hash === '#comptes' ? 'comptes'
      : window.location.hash === '#rapports' ? 'rapports'
      : window.location.hash === '#console' ? 'console'
      : 'home'
  );
  const [clock, setClock] = useState('--:--');
  const staff = useStaff();
  const premium = usePremium();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authLoggedIn, setAuthLoggedIn] = useState(
    !!(window.algorAuthState && window.algorAuthState.loggedIn)
  );

  // Co-branding : le logo est rattaché au COMPTE (profiles.logo) pour suivre le
  // client partout, sur tout appareil. localStorage = cache d'affichage instantané.
  const [clientLogo, setClientLogo] = useState(() => {
    try { return localStorage.getItem('algor-client-logo') || ''; } catch (e) { return ''; }
  });
  const logoInputRef = useRef(null);
  function sbClient() { return (window.algorAuth && window.algorAuth.supabase) || null; }
  async function sbUserId() {
    const c = sbClient(); if (!c) return null;
    try { const r = await c.auth.getSession(); return r.data && r.data.session && r.data.session.user ? r.data.session.user.id : null; } catch (e) { return null; }
  }
  function applyLogoLocal(url) {
    setClientLogo(url || '');
    try { if (url) localStorage.setItem('algor-client-logo', url); else localStorage.removeItem('algor-client-logo'); } catch (e) {}
  }
  async function saveLogo(url) {
    applyLogoLocal(url);
    const c = sbClient(); const uid = await sbUserId();
    if (c && uid) { try { await c.from('profiles').update({ logo: url || null }).eq('id', uid); } catch (e) {} }
  }
  // Source de vérité = le compte : on charge profiles.logo dès qu'une session existe.
  useEffect(function () {
    let on = true;
    async function load() {
      const c = sbClient(); if (!c) return;
      const uid = await sbUserId(); if (!uid || !on) return;
      try { const r = await c.from('profiles').select('logo').eq('id', uid).single(); if (on && r.data) applyLogoLocal(r.data.logo || ''); } catch (e) {}
    }
    load();
    window.addEventListener('algorAuthReady', load);
    window.addEventListener('algorAuthStateChanged', load);
    return function () { on = false; window.removeEventListener('algorAuthReady', load); window.removeEventListener('algorAuthStateChanged', load); };
  }, []);
  function downscaleLogo(dataUrl, isSvg, cb) {
    if (isSvg) { cb(dataUrl); return; } // SVG : on garde le vectoriel tel quel
    const img = new Image();
    img.onload = function () {
      const maxH = 320, scale = Math.min(1, maxH / (img.height || maxH));
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      let out; try { out = cv.toDataURL('image/png'); } catch (e) { out = dataUrl; }
      if (out.length > 220000) { try { const j = cv.toDataURL('image/jpeg', 0.85); if (j.length < out.length) out = j; } catch (e) {} }
      cb(out);
    };
    img.onerror = function () { cb(dataUrl); };
    img.src = dataUrl;
  }
  function onLogoPick(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { alert('Choisissez un fichier image (PNG, JPG, SVG…).'); return; }
    if (f.size > 4 * 1024 * 1024) { alert('Image trop lourde : 4 Mo maximum.'); return; }
    const r = new FileReader();
    r.onload = function () { downscaleLogo(r.result, f.type === 'image/svg+xml', function (small) { saveLogo(small); }); };
    r.readAsDataURL(f);
  }
  function resetLogo() { saveLogo(''); }

  // Reflète l'état de session sur le bouton « Connexion » (texte « Connecté »
  // si une session est active). site-auth.js dispatch l'événement.
  useEffect(() => {
    const h = (e) => setAuthLoggedIn(!!(e.detail && e.detail.loggedIn));
    window.addEventListener('algorAuthStateChanged', h);
    return () => window.removeEventListener('algorAuthStateChanged', h);
  }, []);

  // Lock theme + accent (no Tweaks panel in production).
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('data-accent', 'violet');
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Live clock (Paris)
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const opts = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Paris' };
      setClock(d.toLocaleTimeString('fr-FR', opts));
    };
    fmt();
    const id = setInterval(fmt, 30 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="bg-stage" aria-hidden="true">
        <Starfield />
      </div>

      <header className={'app-header' + (menuOpen ? ' is-open' : '')}>
        <div className="app-header__inner">
          <div className="brand" onClick={() => setView('home')}>
            {clientLogo
              ? <img className="brand__logo" src={clientLogo} alt="Logo entreprise" />
              : <div className="brand__mark" />}
            {!clientLogo && (
              <div className="brand__body">
                <div className="brand__name">Algor <span>Access</span></div>
              </div>
            )}
          </div>
          {/* Pastille compacte : garde le statut premium visible quand le
              menu mobile replie la partie droite du header. */}
          {premium && (
            <span className="premium-chip" aria-label="Compte premium">
              <StarIcon /> Premium
            </span>
          )}

          <nav className="site-nav" aria-label="Rubriques">
            <a href="/plateforme/">Plateforme</a>
            <a href="/debunkage/">Débunkage</a>
            <a href="/methodologie/">Méthodologie</a>
            <a href="/offres/">Offres</a>
            <a href="/theatres/">Théâtres</a>
            <a href="/a-propos/">À propos</a>
            <a href="/contact/">Contact</a>
          </nav>

          <div className="app-header__right">
            {authLoggedIn && (
              <span className="logo-tool">
                <input ref={logoInputRef} type="file" accept="image/*" onChange={onLogoPick} hidden />
                <button type="button" className="logo-import" onClick={() => logoInputRef.current && logoInputRef.current.click()}
                        aria-label="Télécharger le logo de votre entreprise" data-tip="Télécharger le logo de votre entreprise">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
                </button>
                {clientLogo && (
                  <button type="button" className="logo-reset" onClick={resetLogo} title="Rétablir le logo Algor Access">Rétablir</button>
                )}
              </span>
            )}
            {premium ? (
              <a className="premium-badge" href="#" data-algor-login
                 title="Compte premium : accès complet aux 6 théâtres">
                <StarIcon className="premium-badge__star" /> Premium
              </a>
            ) : (
              <a className={'site-login' + (authLoggedIn ? ' is-logged' : '')}
                 href="#" data-algor-login>
                {authLoggedIn ? 'Connecté' : 'Connexion'}
              </a>
            )}
            {premium ? (
              <a className="site-cta" href="/theatres/">Accéder aux théâtres</a>
            ) : (
              <a className="site-cta" href="/offres/">Voir les offres</a>
            )}
          </div>
          <button className="site-burger" aria-label="Menu" aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((o) => !o)}>
            <span /><span /><span />
          </button>
        </div>
      </header>

      {view === 'home' && (
        <HomeView
          onEnter={() => setView('platform')}
          onConsole={() => setView('console')}
          clock={clock} />
      )}
      {/* Console interne + sous-vues : reservees a l'equipe (admin/editor).
          Tant que staff !== true, on affiche la garde d'acces a la place. */}
      {['console', 'comptes', 'archives', 'veille', 'rapports'].includes(view) && staff !== true && (
        <ConsoleGate checking={staff === null} onBack={() => setView('home')} />
      )}
      {view === 'console' && staff === true && (
        <ConsoleView
          onBack={() => setView('home')}
          onArchives={() => setView('archives')}
          onVeille={() => setView('veille')}
          onComptes={() => setView('comptes')}
          onRapports={() => setView('rapports')} />
      )}
      {view === 'comptes' && staff === true && <ComptesView onBack={() => setView('console')} />}
      {view === 'archives' && staff === true && <ArchivesView onBack={() => setView('console')} />}
      {view === 'veille' && staff === true && <VeilleView onBack={() => setView('console')} />}
      {view === 'rapports' && staff === true && <RapportsView onBack={() => setView('console')} />}
      {view === 'platform' && <PlatformView onBack={() => setView('home')} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
