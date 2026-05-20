(function () {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* global React */
// Page 1 — Accueil interne Carto-MO / Algor Int

function HomeView({
  onEnter,
  clock,
  videoStyle
}) {
  return /*#__PURE__*/React.createElement("main", {
    className: "view-enter view-enter-active"
  }, /*#__PURE__*/React.createElement("section", {
    className: "hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hero__copy"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hero__eyebrow"
  }, /*#__PURE__*/React.createElement("span", null, "console"), /*#__PURE__*/React.createElement("span", {
    className: "hero__eyebrow-sep"
  }), /*#__PURE__*/React.createElement("span", null, "outil interne"), /*#__PURE__*/React.createElement("span", {
    className: "hero__eyebrow-sep"
  }), /*#__PURE__*/React.createElement("span", {
    className: "hero__eyebrow-muted"
  }, "Algor Int \xB7 usage interne \xB7 2026")), /*#__PURE__*/React.createElement("h1", {
    className: "hero__title"
  }, "Console interne", /*#__PURE__*/React.createElement("br", null), "de ", /*#__PURE__*/React.createElement("em", null, "cartographie"), /*#__PURE__*/React.createElement("br", null), "OSINT"), /*#__PURE__*/React.createElement("p", {
    className: "hero__lede"
  }, "Outil de travail des analystes Algor Int sur six theatres \u2014 Moyen-Orient, Sahel, RDC, Madagascar, Afrique Maritime, Asie du Sud. Imagerie satellite, ACLED, GDELT, presse d'Etat, OSINT social et flux Telegram sont agreges sur une carte unique, sourcee, datee et auditable evenement par evenement."), /*#__PURE__*/React.createElement("div", {
    className: "hero__cta-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn--primary btn--lg",
    onClick: onEnter
  }, "Ouvrir un theatre", /*#__PURE__*/React.createElement(Arrow, null)), /*#__PURE__*/React.createElement("a", {
    className: "btn--ghost-link",
    href: "/admin/"
  }, "Console admin", /*#__PURE__*/React.createElement(ArrowDiag, null))), /*#__PURE__*/React.createElement("nav", {
    className: "hero__foot-nav"
  }, /*#__PURE__*/React.createElement("a", {
    href: "/sahel/"
  }, "Sahel"), /*#__PURE__*/React.createElement("a", {
    href: "/moyen-orient/"
  }, "Moyen-Orient"), /*#__PURE__*/React.createElement("a", {
    href: "/rdc/"
  }, "RDC"), /*#__PURE__*/React.createElement("a", {
    href: "/afrique/"
  }, "Afrique"))), /*#__PURE__*/React.createElement("div", {
    className: "hero__visual"
  }, /*#__PURE__*/React.createElement(Globe, null))), /*#__PURE__*/React.createElement(VideoBand, {
    style: videoStyle
  }));
}
const HOME_VIDEOS = [{
  cat: 'Veille',
  title: 'Cartographie OSINT en temps reel',
  meta: 'Plateforme · 2 min 14',
  duration: '2:14'
}, {
  cat: 'Influence',
  title: 'Analyse multicouche du theatre sahelien',
  meta: 'Etude de cas · 3 min 02',
  duration: '3:02'
}, {
  cat: 'Protection',
  title: 'Evaluation de menaces sur les infrastructures',
  meta: 'Mission · 4 min 28',
  duration: '4:28'
}, {
  cat: 'Methode',
  title: 'De la donnee brute au rapport decisionnel',
  meta: 'Coulisses · 2 min 47',
  duration: '2:47'
}, {
  cat: 'Terrain',
  title: 'Reseaux djihadistes au Sahel — pattern 2026',
  meta: 'Decryptage · 5 min 12',
  duration: '5:12'
}];
function VideoBand({
  style = 'strip'
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: `video-band video-band--${style}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "video-band__head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "\u2014 Notre travail en images"), /*#__PURE__*/React.createElement("h2", {
    className: "video-band__title"
  }, "Capsules ", /*#__PURE__*/React.createElement("em", null, "videos"), " \xB7 activites Algor Int")), /*#__PURE__*/React.createElement("p", {
    className: "video-band__intro"
  }, "Cinq formats courts pour comprendre nos methodes, nos terrains et nos livrables. Glissez horizontalement pour parcourir.")), /*#__PURE__*/React.createElement("div", {
    className: "video-band__strip"
  }, HOME_VIDEOS.map((v, i) => /*#__PURE__*/React.createElement(VideoCard, _extends({
    key: i
  }, v, {
    index: i,
    variant: style
  })))));
}
function VideoCard({
  cat,
  title,
  meta,
  duration,
  index
}) {
  return /*#__PURE__*/React.createElement("article", {
    className: "video-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "video-card__thumb"
  }, /*#__PURE__*/React.createElement(ThumbMosaic, {
    seed: index
  }), /*#__PURE__*/React.createElement("div", {
    className: "video-card__play"
  }, /*#__PURE__*/React.createElement("div", {
    className: "play-circle"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 3.5v11l10-5.5z"
  })))), /*#__PURE__*/React.createElement("span", {
    className: "video-card__duration"
  }, duration)), /*#__PURE__*/React.createElement("div", {
    className: "video-card__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "video-card__cat"
  }, "\u2014 ", cat), /*#__PURE__*/React.createElement("h3", {
    className: "video-card__title"
  }, title), /*#__PURE__*/React.createElement("p", {
    className: "video-card__meta"
  }, meta)));
}
function ThumbMosaic({
  seed = 0
}) {
  const cells = [];
  const cols = 14,
    rows = 10;
  const rng = mulberry(seed * 1337 + 7);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const o = 0.05 + rng() * 0.22;
      const size = 5.5 + rng() * 4.5;
      cells.push({
        x: (c + 0.5) * (100 / cols),
        y: (r + 0.5) * (100 / rows),
        o,
        size
      });
    }
  }
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 100 70",
    preserveAspectRatio: "xMidYMid slice"
  }, cells.map((c, i) => /*#__PURE__*/React.createElement("rect", {
    key: i,
    x: c.x - c.size / 2,
    y: c.y - c.size / 2,
    width: c.size,
    height: c.size,
    transform: `rotate(45 ${c.x} ${c.y})`,
    fill: "#fff",
    opacity: c.o
  })));
}
function mulberry(a) {
  return function () {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function Arrow() {
  return /*#__PURE__*/React.createElement("svg", {
    className: "btn__arrow",
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3.5 8h9M9 4.5L12.5 8 9 11.5",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}
function ArrowDiag() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 10L10 4M5 4h5v5",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}
Object.assign(window, {
  HomeView,
  VideoBand,
  Arrow,
  ArrowDiag
});
})();
