(function () {
/* global React, ReactDOM, HomeView, ConsoleView, ArchivesView, VeilleView, PlatformView, Starfield */

const {
  useState,
  useEffect,
  useRef
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

  // Co-branding : le logo est rattaché au COMPTE (profiles.logo) pour suivre le
  // client partout, sur tout appareil. localStorage = cache d'affichage instantané.
  const [clientLogo, setClientLogo] = useState(() => {
    try {
      return localStorage.getItem('algor-client-logo') || '';
    } catch (e) {
      return '';
    }
  });
  const logoInputRef = useRef(null);
  function sbClient() {
    return window.algorAuth && window.algorAuth.supabase || null;
  }
  async function sbUserId() {
    const c = sbClient();
    if (!c) return null;
    try {
      const r = await c.auth.getSession();
      return r.data && r.data.session && r.data.session.user ? r.data.session.user.id : null;
    } catch (e) {
      return null;
    }
  }
  function applyLogoLocal(url) {
    setClientLogo(url || '');
    try {
      if (url) localStorage.setItem('algor-client-logo', url);else localStorage.removeItem('algor-client-logo');
    } catch (e) {}
  }
  async function saveLogo(url) {
    applyLogoLocal(url);
    const c = sbClient();
    const uid = await sbUserId();
    if (c && uid) {
      try {
        await c.from('profiles').update({
          logo: url || null
        }).eq('id', uid);
      } catch (e) {}
    }
  }
  // Source de vérité = le compte : on charge profiles.logo dès qu'une session existe.
  useEffect(function () {
    let on = true;
    async function load() {
      const c = sbClient();
      if (!c) return;
      const uid = await sbUserId();
      if (!uid || !on) return;
      try {
        const r = await c.from('profiles').select('logo').eq('id', uid).single();
        if (on && r.data) applyLogoLocal(r.data.logo || '');
      } catch (e) {}
    }
    load();
    window.addEventListener('algorAuthReady', load);
    window.addEventListener('algorAuthStateChanged', load);
    return function () {
      on = false;
      window.removeEventListener('algorAuthReady', load);
      window.removeEventListener('algorAuthStateChanged', load);
    };
  }, []);
  function downscaleLogo(dataUrl, isSvg, cb) {
    if (isSvg) {
      cb(dataUrl);
      return;
    } // SVG : on garde le vectoriel tel quel
    const img = new Image();
    img.onload = function () {
      const maxH = 320,
        scale = Math.min(1, maxH / (img.height || maxH));
      const w = Math.max(1, Math.round(img.width * scale)),
        h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      let out;
      try {
        out = cv.toDataURL('image/png');
      } catch (e) {
        out = dataUrl;
      }
      if (out.length > 220000) {
        try {
          const j = cv.toDataURL('image/jpeg', 0.85);
          if (j.length < out.length) out = j;
        } catch (e) {}
      }
      cb(out);
    };
    img.onerror = function () {
      cb(dataUrl);
    };
    img.src = dataUrl;
  }
  function onLogoPick(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) {
      alert('Choisissez un fichier image (PNG, JPG, SVG…).');
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      alert('Image trop lourde : 4 Mo maximum.');
      return;
    }
    const r = new FileReader();
    r.onload = function () {
      downscaleLogo(r.result, f.type === 'image/svg+xml', function (small) {
        saveLogo(small);
      });
    };
    r.readAsDataURL(f);
  }
  function resetLogo() {
    saveLogo('');
  }

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
  }, clientLogo ? /*#__PURE__*/React.createElement("img", {
    className: "brand__logo",
    src: clientLogo,
    alt: "Logo entreprise"
  }) : /*#__PURE__*/React.createElement("div", {
    className: "brand__mark"
  }), !clientLogo && /*#__PURE__*/React.createElement("div", {
    className: "brand__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand__name"
  }, "Algor ", /*#__PURE__*/React.createElement("span", null, "Access")))), /*#__PURE__*/React.createElement("nav", {
    className: "site-nav",
    "aria-label": "Rubriques"
  }, /*#__PURE__*/React.createElement("a", {
    href: "/plateforme/"
  }, "Plateforme"), /*#__PURE__*/React.createElement("a", {
    href: "/debunkage/"
  }, "D\xE9bunkage"), /*#__PURE__*/React.createElement("a", {
    href: "/methodologie/"
  }, "M\xE9thodologie"), /*#__PURE__*/React.createElement("a", {
    href: "/offres/"
  }, "Offres"), /*#__PURE__*/React.createElement("a", {
    href: "/theatres/"
  }, "Th\xE9\xE2tres"), /*#__PURE__*/React.createElement("a", {
    href: "/a-propos/"
  }, "\xC0 propos"), /*#__PURE__*/React.createElement("a", {
    href: "/contact/"
  }, "Contact")), /*#__PURE__*/React.createElement("div", {
    className: "app-header__right"
  }, authLoggedIn && /*#__PURE__*/React.createElement("span", {
    className: "logo-tool"
  }, /*#__PURE__*/React.createElement("input", {
    ref: logoInputRef,
    type: "file",
    accept: "image/*",
    onChange: onLogoPick,
    hidden: true
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "logo-import",
    onClick: () => logoInputRef.current && logoInputRef.current.click(),
    "aria-label": "T\xE9l\xE9charger le logo de votre entreprise",
    "data-tip": "T\xE9l\xE9charger le logo de votre entreprise"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 8l-5-5-5 5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 3v12"
  }))), clientLogo && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "logo-reset",
    onClick: resetLogo,
    title: "R\xE9tablir le logo Algor Access"
  }, "R\xE9tablir")), /*#__PURE__*/React.createElement("a", {
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
