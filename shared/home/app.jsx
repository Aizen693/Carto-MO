/* global React, ReactDOM, HomeView, ConsoleView, ArchivesView, VeilleView, PlatformView, Starfield */

const { useState, useEffect, useRef } = React;

function PopCheck() {
  return (
    <svg className="cta-pop__check" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function App() {
  // Ancre #console : ouvre directement la Console (retour depuis /cloud/, /admin/...).
  const [view, setView] = useState(
    window.location.hash === '#console' ? 'console' : 'home'
  );
  const [clock, setClock] = useState('--:--');
  const [menuOpen, setMenuOpen] = useState(false);
  const [authLoggedIn, setAuthLoggedIn] = useState(
    !!(window.algorAuthState && window.algorAuthState.loggedIn)
  );

  // Co-branding : un abonné peut remplacer le logo Algor Access par celui de son
  // entreprise. Stocké en local (par navigateur).
  const [clientLogo, setClientLogo] = useState(() => {
    try { return localStorage.getItem('algor-client-logo') || ''; } catch (e) { return ''; }
  });
  const logoInputRef = useRef(null);
  function onLogoPick(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { alert('Choisissez un fichier image (PNG, JPG, SVG…).'); return; }
    if (f.size > 1.5 * 1024 * 1024) { alert('Logo trop lourd : 1,5 Mo maximum.'); return; }
    const r = new FileReader();
    r.onload = function () { try { localStorage.setItem('algor-client-logo', r.result); } catch (e) {} setClientLogo(r.result); };
    r.readAsDataURL(f);
  }
  function resetLogo() { try { localStorage.removeItem('algor-client-logo'); } catch (e) {} setClientLogo(''); }

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
                        title="Remplacer le logo Algor Access par celui de votre entreprise">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
                  <span className="lbl">Importer le logo de votre entreprise</span>
                </button>
                {clientLogo && (
                  <button type="button" className="logo-reset" onClick={resetLogo} title="Rétablir le logo Algor Access">Rétablir</button>
                )}
              </span>
            )}
            <a className={'site-login' + (authLoggedIn ? ' is-logged' : '')}
               href="#" data-algor-login>
              {authLoggedIn ? 'Connecté' : 'Connexion'}
            </a>
            <a className="site-cta" href="/offres/">Voir les offres</a>
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
          clock={clock}
          videoStyle="strip" />
      )}
      {view === 'console' && (
        <ConsoleView
          onBack={() => setView('home')}
          onArchives={() => setView('archives')}
          onVeille={() => setView('veille')} />
      )}
      {view === 'archives' && <ArchivesView onBack={() => setView('console')} />}
      {view === 'veille' && <VeilleView onBack={() => setView('console')} />}
      {view === 'platform' && <PlatformView onBack={() => setView('home')} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
