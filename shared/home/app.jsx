/* global React, ReactDOM, HomeView, ConsoleView, ArchivesView, VeilleView, PlatformView, Starfield */

const { useState, useEffect } = React;

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
            <div className="brand__mark" />
            <div className="brand__body">
              <div className="brand__name">ALGOR INT</div>
              <div className="brand__tag">Geopolitical Intelligence</div>
            </div>
          </div>

          <nav className="site-nav" aria-label="Rubriques">
            <a href="/plateforme/">Plateforme</a>
            <a href="/methodologie/">Méthodologie</a>
            <a href="/offres/">Offres</a>
            <a href="/theatres/">Théâtres</a>
            <a href="/a-propos/">A propos</a>
            <a href="/contact/">Contact</a>
          </nav>

          <div className="app-header__right">
            {view !== 'console' && (
            <div className="header-cta-wrap">
              <a className="header-cta" href="/sahel/">
                <svg className="header-cta__star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2.5l2.9 5.9 6.6.95-4.75 4.63 1.12 6.52L12 17.9l-5.9 3.1 1.13-6.52L2.5 9.85l6.6-.95z" />
                </svg>
                Passer premium
              </a>
              <div className="cta-pop" role="tooltip">
                <div className="cta-pop__card">
                  <span className="cta-pop__kicker">Algor Access · Premium</span>
                  <div className="cta-pop__title">Passez en premium</div>
                  <p className="cta-pop__lede">Toute l'intelligence OSINT d'Algor, sans limite.</p>
                  <ul className="cta-pop__list">
                    <li><PopCheck />Les 6 theatres d'analyse en acces illimite</li>
                    <li><PopCheck />Cartes, calques et chronologie interactifs</li>
                    <li><PopCheck />Briefs de securite generes par IA</li>
                    <li><PopCheck />Donnees OSINT actualisees en continu</li>
                  </ul>
                  <div className="cta-pop__custom">
                    <span className="cta-pop__tag">Sur-mesure</span>
                    Un besoin precis ? Nous realisons votre analyse sur commande, selon votre demande.
                  </div>
                </div>
              </div>
            </div>
            )}
            <div className="status-pill">
              <span className="status-pill__group">
                <span className="status-pill__dot" />
                Systeme operationnel
              </span>
              <span className="status-pill__sep" />
              <span className="status-pill__group">
                <span className="status-pill__clock">{clock}</span>
                <span className="status-pill__loc">Paris</span>
              </span>
            </div>
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
