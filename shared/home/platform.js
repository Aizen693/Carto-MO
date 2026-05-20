(function () {
/* global React, ZONES, REPORTS, GRAPHS, THEMES, SidePanel, Arrow */
// Page 2 — 4 actions : Region · Rapport · Graph · Theme

const {
  useState: useStateP
} = React;
function PlatformView({
  onBack
}) {
  const [action, setAction] = useStateP(null);
  const [open, setOpen] = useStateP(false);
  function openAction(a) {
    setAction(a);
    setOpen(true);
  }
  function closePanel() {
    setOpen(false);
  }
  return /*#__PURE__*/React.createElement("main", {
    className: "view-enter view-enter-active"
  }, /*#__PURE__*/React.createElement("div", {
    className: "platform"
  }, /*#__PURE__*/React.createElement("button", {
    className: "platform__back",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(ArrowBack, null), " Retour a l'accueil"), /*#__PURE__*/React.createElement("header", {
    className: "platform__intro"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "\u2014 Bureau de travail \xB7 plateforme"), /*#__PURE__*/React.createElement("h1", {
    className: "platform__title"
  }, "Que souhaitez-vous ", /*#__PURE__*/React.createElement("em", null, "consulter"), "\xA0?")), /*#__PURE__*/React.createElement("p", {
    className: "platform__lede"
  }, "Quatre points d'entree pour naviguer dans les donnees Algor Int. Chacun ouvre un panneau lateral structure, avec recherche et navigation hierarchique.")), /*#__PURE__*/React.createElement("div", {
    className: "actions-grid"
  }, /*#__PURE__*/React.createElement(ActionCard, {
    num: "01",
    name: "Region",
    desc: "Choisir un theatre operationnel \u2014 Sahel, Moyen-Orient, RDC, Madagascar, Afrique, Asie du Sud.",
    count: `${ZONES.length} zones`,
    icon: /*#__PURE__*/React.createElement(RegionIcon, null),
    onClick: () => openAction('region')
  }), /*#__PURE__*/React.createElement(ActionCard, {
    num: "02",
    name: "Rapport",
    desc: "Documents analytiques classes par zone puis par sujet.",
    count: `${Object.values(REPORTS).flat().length} documents`,
    icon: /*#__PURE__*/React.createElement(DocIconLg, null),
    onClick: () => openAction('rapport')
  }), /*#__PURE__*/React.createElement(ActionCard, {
    num: "03",
    name: "Graph",
    desc: "Visualisations, indicateurs et series \u2014 densites, flux, reseaux.",
    count: `${Object.values(GRAPHS).flat().length} visualisations`,
    icon: /*#__PURE__*/React.createElement(GraphIconLg, null),
    onClick: () => openAction('graph')
  }), /*#__PURE__*/React.createElement(ActionCard, {
    num: "04",
    name: "Theme",
    desc: "Lectures transversales \u2014 Ports, Mines, JNIM, Routes, Energie...",
    count: `${THEMES.length} themes`,
    icon: /*#__PURE__*/React.createElement(ThemeIconLg, null),
    onClick: () => openAction('theme')
  })), /*#__PURE__*/React.createElement("div", {
    className: "section-rule"
  }, /*#__PURE__*/React.createElement("span", {
    className: "section-rule__label"
  }, "\u2014 Recemment consultes"), /*#__PURE__*/React.createElement("span", {
    className: "section-rule__line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "recent-grid"
  }, /*#__PURE__*/React.createElement(RecentItem, {
    icon: /*#__PURE__*/React.createElement(MapIconSm, null),
    title: "Sahel \u2014 Carte interactive",
    href: "/sahel/"
  }), /*#__PURE__*/React.createElement(RecentItem, {
    icon: /*#__PURE__*/React.createElement(DocIconSm, null),
    title: "Sahel \u2014 Rapport analytique Q1 2026",
    href: "/sahel/rapport.html"
  }), /*#__PURE__*/React.createElement(RecentItem, {
    icon: /*#__PURE__*/React.createElement(MapIconSm, null),
    title: "Moyen-Orient \u2014 Carte interactive",
    href: "/moyen-orient/"
  }), /*#__PURE__*/React.createElement(RecentItem, {
    icon: /*#__PURE__*/React.createElement(MapIconSm, null),
    title: "RDC \u2014 Carte interactive",
    href: "/rdc/"
  }), /*#__PURE__*/React.createElement(RecentItem, {
    icon: /*#__PURE__*/React.createElement(MapIconSm, null),
    title: "Afrique Maritime \u2014 AIS temps reel",
    href: "/afrique/"
  }), /*#__PURE__*/React.createElement(RecentItem, {
    icon: /*#__PURE__*/React.createElement(MapIconSm, null),
    title: "Asie du Sud \u2014 Carte interactive",
    href: "/asie-sud/"
  }))), /*#__PURE__*/React.createElement(SidePanel, {
    open: open,
    action: action,
    onClose: closePanel
  }));
}
function ActionCard({
  num,
  name,
  desc,
  count,
  icon,
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: "action-card",
    onClick: onClick
  }, /*#__PURE__*/React.createElement("div", {
    className: "action-card__top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "action-card__icon"
  }, icon), /*#__PURE__*/React.createElement("span", {
    className: "action-card__num"
  }, "\u2014 ", num)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "action-card__title"
  }, name), /*#__PURE__*/React.createElement("p", {
    className: "action-card__desc"
  }, desc)), /*#__PURE__*/React.createElement("div", {
    className: "action-card__foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "action-card__count"
  }, count), /*#__PURE__*/React.createElement("span", {
    className: "action-card__arrow"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 7h7M7 3.5L10.5 7 7 10.5",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })))));
}
function RecentItem({
  icon,
  title,
  href
}) {
  const Tag = href ? 'a' : 'button';
  return /*#__PURE__*/React.createElement(Tag, {
    className: "recent-item",
    href: href || undefined
  }, /*#__PURE__*/React.createElement("span", {
    className: "recent-item__type"
  }, icon), /*#__PURE__*/React.createElement("span", {
    className: "recent-item__body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "recent-item__title"
  }, title)), /*#__PURE__*/React.createElement(ArrowSm, {
    muted: true
  }));
}
function RegionIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 22 22",
    fill: "none"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8",
    stroke: "currentColor",
    strokeWidth: "1.6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 11h16M11 3c2.5 2.5 4 5 4 8s-1.5 5.5-4 8c-2.5-2.5-4-5-4-8s1.5-5.5 4-8z",
    stroke: "currentColor",
    strokeWidth: "1.5"
  }));
}
function DocIconLg() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 22 22",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 3h7l4 4v12a.5.5 0 01-.5.5h-10.5a.5.5 0 01-.5-.5V3.5A.5.5 0 016 3z",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M13 3v4h4M8 11h6M8 14h6M8 17h4",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }));
}
function GraphIconLg() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 22 22",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 18V4M4 18h14",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 14l3-4 3 2 4-6",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "17",
    cy: "6",
    r: "1.6",
    fill: "currentColor"
  }));
}
function ThemeIconLg() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 22 22",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M11 3l2.4 4.8 5.3.8-3.85 3.75.9 5.3L11 15.2l-4.75 2.5.9-5.3L3.3 8.6l5.3-.8L11 3z",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinejoin: "round"
  }));
}
function ArrowBack() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12.5 8h-9M7 4.5L3.5 8 7 11.5",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}
function ArrowSm({
  muted
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none",
    style: {
      opacity: muted ? 0.5 : 1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 7h7M7 3.5L10.5 7 7 10.5",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}
function MapIconSm() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 4.5L7 3l4 1.5L16 3v10.5L11 15l-4-1.5L2 15V4.5z",
    stroke: "currentColor",
    strokeWidth: "1.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 3v10.5M11 4.5V15",
    stroke: "currentColor",
    strokeWidth: "1.4"
  }));
}
function DocIconSm() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 2.5h6l3 3V15.5h-9V2.5z",
    stroke: "currentColor",
    strokeWidth: "1.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M11 2.5v3h3",
    stroke: "currentColor",
    strokeWidth: "1.4"
  }));
}
Object.assign(window, {
  PlatformView
});
})();
