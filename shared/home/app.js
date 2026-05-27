(function () {
/* global React, ReactDOM, HomeView, ConsoleView, ArchivesView, VeilleView, PlatformView, Starfield */

const {
  useState,
  useEffect
} = React;
function PopCheck() {
  return /*#__PURE__*/React.createElement("svg", {
    className: "cta-pop__check",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "20 6 9 17 4 12"
  }));
}
function App() {
  // Ancre #console : ouvre directement la Console (retour depuis /cloud/, /admin/...).
  const [view, setView] = useState(window.location.hash === '#console' ? 'console' : 'home');
  const [clock, setClock] = useState('--:--');
  const [menuOpen, setMenuOpen] = useState(false);
  const [authLoggedIn, setAuthLoggedIn] = useState(!!(window.algorAuthState && window.algorAuthState.loggedIn));

  // Reflète l'état de session sur le bouton « Connexion » (texte « Connecté »
  // si une session est active). site-auth.js dispatch l'événement.
  useEffect(() => {
    const h = e => setAuthLoggedIn(!!(e.detail && e.detail.loggedIn));
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
      const opts = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/Paris'
      };
      setClock(d.toLocaleTimeString('fr-FR', opts));
    };
    fmt();
    const id = setInterval(fmt, 30 * 1000);
    return () => clearInterval(id);
  }, []);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "bg-stage",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement(Starfield, null)), /*#__PURE__*/React.createElement("header", {
    className: 'app-header' + (menuOpen ? ' is-open' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "app-header__inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand",
    onClick: () => setView('home')
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand__mark"
  }), /*#__PURE__*/React.createElement("div", {
    className: "brand__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand__name"
  }, "ALGOR INT"), /*#__PURE__*/React.createElement("div", {
    className: "brand__tag"
  }, "Renseignement geopolitique"))), /*#__PURE__*/React.createElement("nav", {
    className: "site-nav",
    "aria-label": "Rubriques"
  }, /*#__PURE__*/React.createElement("a", {
    href: "/plateforme/"
  }, "Plateforme"), /*#__PURE__*/React.createElement("a", {
    href: "/methodologie/"
  }, "M\xE9thodologie"), /*#__PURE__*/React.createElement("a", {
    href: "/offres/"
  }, "Offres"), /*#__PURE__*/React.createElement("a", {
    href: "/theatres/"
  }, "Th\xE9\xE2tres"), /*#__PURE__*/React.createElement("a", {
    href: "/debunkage/"
  }, "D\xE9bunkage"), /*#__PURE__*/React.createElement("a", {
    href: "/a-propos/"
  }, "A propos"), /*#__PURE__*/React.createElement("a", {
    href: "/contact/"
  }, "Contact")), /*#__PURE__*/React.createElement("div", {
    className: "app-header__right"
  }, /*#__PURE__*/React.createElement("a", {
    className: 'site-login' + (authLoggedIn ? ' is-logged' : ''),
    href: "#",
    "data-algor-login": true
  }, authLoggedIn ? 'Connecté' : 'Connexion'), /*#__PURE__*/React.createElement("a", {
    className: "site-cta",
    href: "/offres/"
  }, "Voir les offres")), /*#__PURE__*/React.createElement("button", {
    className: "site-burger",
    "aria-label": "Menu",
    "aria-expanded": menuOpen,
    onClick: () => setMenuOpen(o => !o)
  }, /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", null)))), view === 'home' && /*#__PURE__*/React.createElement(HomeView, {
    onEnter: () => setView('platform'),
    onConsole: () => setView('console'),
    clock: clock,
    videoStyle: "strip"
  }), view === 'console' && /*#__PURE__*/React.createElement(ConsoleView, {
    onBack: () => setView('home'),
    onArchives: () => setView('archives'),
    onVeille: () => setView('veille')
  }), view === 'archives' && /*#__PURE__*/React.createElement(ArchivesView, {
    onBack: () => setView('console')
  }), view === 'veille' && /*#__PURE__*/React.createElement(VeilleView, {
    onBack: () => setView('console')
  }), view === 'platform' && /*#__PURE__*/React.createElement(PlatformView, {
    onBack: () => setView('home')
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})();
