(function () {
/* global React, ReactDOM, HomeView, PlatformView, Starfield */

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
  const [view, setView] = useState('home');
  const [clock, setClock] = useState('--:--');

  // Lock theme + accent (no Tweaks panel in production).
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('data-accent', 'violet');
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
    className: "app-header"
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
  }, "Geopolitical Intelligence"))), view === 'platform' && /*#__PURE__*/React.createElement("nav", {
    className: "app-header__nav",
    "aria-label": "Sections"
  }, /*#__PURE__*/React.createElement("a", {
    className: "nav-link",
    "aria-current": "page"
  }, "Plateforme"), /*#__PURE__*/React.createElement("a", {
    className: "nav-link",
    href: "/admin/"
  }, "Admin")), /*#__PURE__*/React.createElement("div", {
    className: "app-header__right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "header-cta-wrap"
  }, /*#__PURE__*/React.createElement("a", {
    className: "header-cta",
    href: "/sahel/"
  }, /*#__PURE__*/React.createElement("svg", {
    className: "header-cta__star",
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2.5l2.9 5.9 6.6.95-4.75 4.63 1.12 6.52L12 17.9l-5.9 3.1 1.13-6.52L2.5 9.85l6.6-.95z"
  })), "Passer premium"), /*#__PURE__*/React.createElement("div", {
    className: "cta-pop",
    role: "tooltip"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cta-pop__card"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cta-pop__kicker"
  }, "Algor Access \xB7 Premium"), /*#__PURE__*/React.createElement("div", {
    className: "cta-pop__title"
  }, "Passez en premium"), /*#__PURE__*/React.createElement("p", {
    className: "cta-pop__lede"
  }, "Toute l'intelligence OSINT d'Algor, sans limite."), /*#__PURE__*/React.createElement("ul", {
    className: "cta-pop__list"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(PopCheck, null), "Les 6 theatres d'analyse en acces illimite"), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(PopCheck, null), "Cartes, calques et chronologie interactifs"), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(PopCheck, null), "Briefs de securite generes par IA"), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(PopCheck, null), "Donnees OSINT actualisees en continu")), /*#__PURE__*/React.createElement("div", {
    className: "cta-pop__custom"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cta-pop__tag"
  }, "Sur-mesure"), "Un besoin precis ? Nous realisons votre analyse sur commande, selon votre demande.")))), /*#__PURE__*/React.createElement("div", {
    className: "status-pill"
  }, /*#__PURE__*/React.createElement("span", {
    className: "status-pill__group"
  }, /*#__PURE__*/React.createElement("span", {
    className: "status-pill__dot"
  }), "Systeme operationnel"), /*#__PURE__*/React.createElement("span", {
    className: "status-pill__sep"
  }), /*#__PURE__*/React.createElement("span", {
    className: "status-pill__group"
  }, /*#__PURE__*/React.createElement("span", {
    className: "status-pill__clock"
  }, clock), /*#__PURE__*/React.createElement("span", {
    className: "status-pill__loc"
  }, "Paris")))))), view === 'home' && /*#__PURE__*/React.createElement(HomeView, {
    onEnter: () => setView('platform'),
    clock: clock,
    videoStyle: "strip"
  }), view === 'platform' && /*#__PURE__*/React.createElement(PlatformView, {
    onBack: () => setView('home')
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})();
