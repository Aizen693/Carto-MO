(function () {
/* global React, ZONES, REPORTS, GRAPHS, THEMES, THEME_DETAIL, SidePanel, Arrow */
// Page 2 — 5 actions : Region · Rapport · Graph · Theme · Cartographie

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
  }, "Cinq points d'entree pour naviguer dans les donnees Algor Int. Chacun ouvre un panneau lateral structure, avec recherche et navigation hierarchique.")), /*#__PURE__*/React.createElement("div", {
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
  }), /*#__PURE__*/React.createElement(ActionCard, {
    num: "05",
    name: "Cartographie",
    desc: "Acces direct aux cartes interactives \u2014 six theatres, calques et timeline.",
    count: `${ZONES.length} cartes`,
    icon: /*#__PURE__*/React.createElement(CartoIconLg, null),
    onClick: () => openAction('cartographie')
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

// Cascade au survol : carte d'action -> sous-elements -> actions.
function cascadeFor(name) {
  const zoneName = id => (ZONES.find(z => z.id === id) || {}).name || id;
  const zoneHref = id => (ZONES.find(z => z.id === id) || {}).href || '#';
  if (name === 'Region') {
    return ZONES.map(z => ({
      label: z.name,
      meta: z.code,
      actions: [{
        label: 'Carte interactive',
        meta: z.countries,
        href: z.href
      }, {
        label: 'Rapports analytiques',
        meta: `${(REPORTS[z.id] || []).length} document(s)`,
        href: ((REPORTS[z.id] || []).find(r => r.href) || {}).href || z.href
      }, {
        label: 'Visualisations',
        meta: `${(GRAPHS[z.id] || []).length} graph(s)`,
        href: z.href
      }]
    }));
  }
  if (name === 'Rapport') {
    return Object.keys(REPORTS).map(zid => ({
      label: zoneName(zid),
      meta: `${REPORTS[zid].length} doc(s)`,
      actions: REPORTS[zid].map(r => ({
        label: r.title,
        meta: `${r.pages} p · ${r.tag}`,
        href: r.href || zoneHref(zid)
      }))
    }));
  }
  if (name === 'Graph') {
    return Object.keys(GRAPHS).map(zid => ({
      label: zoneName(zid),
      meta: `${GRAPHS[zid].length} vue(s)`,
      actions: GRAPHS[zid].map(g => ({
        label: g.title,
        meta: `${g.type} · ${g.scope}`,
        href: zoneHref(zid)
      }))
    }));
  }
  if (name === 'Theme') {
    return THEMES.map(t => {
      const detail = THEME_DETAIL[t.id] || [];
      return {
        label: t.name,
        meta: `${t.count} entrees`,
        actions: detail.length ? detail.map(d => ({
          label: d.title,
          meta: `${d.type} · ${d.meta}`,
          href: d.href || null
        })) : [{
          label: t.desc,
          meta: 'Lecture transverse',
          href: null
        }]
      };
    });
  }
  if (name === 'Cartographie') {
    return ZONES.map(z => ({
      label: z.name,
      meta: z.code,
      actions: [{
        label: 'Ouvrir la carte interactive',
        meta: z.countries,
        href: z.href
      }]
    }));
  }
  return [];
}

// Apercu anime en tete du popup — aurore violet/bleu + mini-clip propre a la carte.
function CascadePreview({
  name,
  count
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "cascade-preview",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cascade-preview__aurora"
  }), /*#__PURE__*/React.createElement("div", {
    className: "cascade-preview__grid"
  }), /*#__PURE__*/React.createElement(PreviewScene, {
    name: name
  }), /*#__PURE__*/React.createElement("div", {
    className: "cascade-preview__shine"
  }), /*#__PURE__*/React.createElement("div", {
    className: "cascade-preview__caption"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cascade-preview__dot"
  }), "Apercu \xB7 ", name, /*#__PURE__*/React.createElement("span", {
    className: "cascade-preview__count"
  }, count)));
}

// Mini-clip anime distinct par carte (boucle ~10-14 s, joue au survol).
function PreviewScene({
  name
}) {
  if (name === 'Region') return /*#__PURE__*/React.createElement(SceneGlobe, null);
  if (name === 'Rapport') return /*#__PURE__*/React.createElement(SceneDoc, null);
  if (name === 'Graph') return /*#__PURE__*/React.createElement(SceneChart, null);
  if (name === 'Theme') return /*#__PURE__*/React.createElement(SceneNet, null);
  if (name === 'Cartographie') return /*#__PURE__*/React.createElement(SceneMap, null);
  return null;
}
function SceneGlobe() {
  return /*#__PURE__*/React.createElement("div", {
    className: "cp-scene cp-globe"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cp-globe__ball"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cp-globe__lines"
  })), /*#__PURE__*/React.createElement("span", {
    className: "cp-ping",
    style: {
      left: '32%',
      top: '34%'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "cp-ping",
    style: {
      left: '64%',
      top: '50%',
      animationDelay: '1.3s'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "cp-ping",
    style: {
      left: '46%',
      top: '70%',
      animationDelay: '2.6s'
    }
  }));
}
function SceneDoc() {
  const bars = [{
    cls: 'cp-doc__bar cp-doc__bar--h',
    w: '62%'
  }, {
    w: '92%'
  }, {
    w: '74%'
  }, {
    w: '88%'
  }, {
    w: '56%'
  }, {
    w: '80%'
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "cp-scene cp-doc"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cp-doc__sheet"
  }, bars.map((b, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: b.cls || 'cp-doc__bar',
    style: {
      width: b.w,
      animationDelay: i * 0.55 + 's'
    }
  }))));
}
function SceneChart() {
  const bars = [44, 72, 32, 88, 58];
  return /*#__PURE__*/React.createElement("div", {
    className: "cp-scene cp-chart"
  }, bars.map((h, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "cp-bar",
    style: {
      height: h + 'px',
      animationDelay: i * 0.28 + 's'
    }
  })));
}
function SceneNet() {
  return /*#__PURE__*/React.createElement("div", {
    className: "cp-scene cp-net"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 200 120",
    preserveAspectRatio: "xMidYMid meet"
  }, /*#__PURE__*/React.createElement("g", {
    className: "cp-net__links"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "50",
    y1: "42",
    x2: "100",
    y2: "28"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "100",
    y1: "28",
    x2: "150",
    y2: "48"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "50",
    y1: "42",
    x2: "86",
    y2: "86"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "86",
    y1: "86",
    x2: "150",
    y2: "48"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "86",
    y1: "86",
    x2: "136",
    y2: "94"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "100",
    y1: "28",
    x2: "86",
    y2: "86"
  })), /*#__PURE__*/React.createElement("g", {
    className: "cp-net__nodes"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "50",
    cy: "42",
    r: "5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "100",
    cy: "28",
    r: "6.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "150",
    cy: "48",
    r: "5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "86",
    cy: "86",
    r: "6.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "136",
    cy: "94",
    r: "4.5"
  }))));
}
function SceneMap() {
  return /*#__PURE__*/React.createElement("div", {
    className: "cp-scene cp-map"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 200 120",
    preserveAspectRatio: "xMidYMid slice"
  }, /*#__PURE__*/React.createElement("path", {
    className: "cp-map__land",
    d: "M14 84 Q42 54 80 60 Q116 66 126 40 Q156 22 192 42 L192 120 L14 120 Z"
  }), /*#__PURE__*/React.createElement("path", {
    className: "cp-map__land cp-map__land--2",
    d: "M2 26 Q34 18 56 32 Q74 44 62 60 Q40 72 16 58 Q-6 44 2 26 Z"
  }), /*#__PURE__*/React.createElement("path", {
    className: "cp-map__route",
    d: "M34 94 Q72 64 108 76 Q148 90 172 44"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "cp-map__pin",
    cx: "172",
    cy: "44",
    r: "4.5"
  })), /*#__PURE__*/React.createElement("div", {
    className: "cp-radar"
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
  const groups = cascadeFor(name);
  return /*#__PURE__*/React.createElement("div", {
    className: "action-card-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "action-card",
    onClick: onClick,
    role: "button",
    tabIndex: 0,
    onKeyDown: e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    }
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
  }))))), groups.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "cascade-pop",
    role: "menu"
  }, /*#__PURE__*/React.createElement(CascadePreview, {
    name: name,
    count: count
  }), groups.map((g, i) => /*#__PURE__*/React.createElement("div", {
    className: "cascade-row",
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    className: "cascade-row__label"
  }, g.label), /*#__PURE__*/React.createElement("span", {
    className: "cascade-row__meta"
  }, g.meta), /*#__PURE__*/React.createElement(ChevronRight, null), /*#__PURE__*/React.createElement("div", {
    className: "cascade-sub"
  }, g.actions.map((a, j) => a.href ? /*#__PURE__*/React.createElement("a", {
    className: "cascade-sub__item",
    href: a.href,
    key: j
  }, /*#__PURE__*/React.createElement("span", {
    className: "cascade-sub__label"
  }, a.label), /*#__PURE__*/React.createElement("span", {
    className: "cascade-sub__meta"
  }, a.meta)) : /*#__PURE__*/React.createElement("span", {
    className: "cascade-sub__item cascade-sub__item--static",
    key: j
  }, /*#__PURE__*/React.createElement("span", {
    className: "cascade-sub__label"
  }, a.label), /*#__PURE__*/React.createElement("span", {
    className: "cascade-sub__meta"
  }, a.meta))))))));
}
function ChevronRight() {
  return /*#__PURE__*/React.createElement("svg", {
    className: "cascade-row__chev",
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4.5 2.5L8 6l-3.5 3.5",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
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
function CartoIconLg() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 22 22",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M11 2.5l8 3.9-8 3.9-8-3.9 8-3.9z",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3.2 10.9L11 14.7l7.8-3.8M3.2 14.9L11 18.7l7.8-3.8",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
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
