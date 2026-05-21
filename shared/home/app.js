(function () {
/* global React, ReactDOM, HomeView, PlatformView, Starfield */

const {
  useState,
  useEffect
} = React;
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
