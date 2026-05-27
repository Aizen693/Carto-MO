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
  }, "Bureau de travail \xB7 plateforme"), /*#__PURE__*/React.createElement("h1", {
    className: "platform__title"
  }, "Que souhaitez-vous ", /*#__PURE__*/React.createElement("em", null, "consulter"), "\xA0?")), /*#__PURE__*/React.createElement("p", {
    className: "platform__lede"
  }, "Cinq points d'entree pour naviguer dans les donnees Algor Int. Chacun ouvre un panneau lateral structure, avec recherche et navigation hi\xE9rarchique.")), /*#__PURE__*/React.createElement("div", {
    className: "actions-grid"
  }, /*#__PURE__*/React.createElement(ActionCard, {
    num: "01",
    name: "Region",
    desc: "Choisir un th\xE9\xE2tre op\xE9rationnel : Sahel, Moyen-Orient, RDC, Madagascar, Afrique, Asie du Sud.",
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
    desc: "Visualisations, indicateurs et s\xE9ries : densit\xE9s, flux, r\xE9seaux.",
    count: `${Object.values(GRAPHS).flat().length} visualisations`,
    icon: /*#__PURE__*/React.createElement(GraphIconLg, null),
    onClick: () => openAction('graph')
  }), /*#__PURE__*/React.createElement(ActionCard, {
    num: "04",
    name: "Theme",
    desc: "Lectures transversales : Ports, Mines, JNIM, Routes, Energie...",
    count: `${THEMES.length} themes`,
    icon: /*#__PURE__*/React.createElement(ThemeIconLg, null),
    onClick: () => openAction('theme')
  }), /*#__PURE__*/React.createElement(ActionCard, {
    num: "05",
    name: "Cartographie",
    desc: "Acc\xE8s direct aux cartes interactives : six th\xE9\xE2tres, calques et timeline.",
    count: `${ZONES.length} cartes`,
    icon: /*#__PURE__*/React.createElement(CartoIconLg, null),
    onClick: () => openAction('cartographie')
  })), /*#__PURE__*/React.createElement("div", {
    className: "section-rule"
  }, /*#__PURE__*/React.createElement("span", {
    className: "section-rule__label"
  }, "R\xE9cemment consult\xE9s"), /*#__PURE__*/React.createElement("span", {
    className: "section-rule__line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "recent-grid"
  }, /*#__PURE__*/React.createElement(RecentItem, {
    icon: /*#__PURE__*/React.createElement(MapIconSm, null),
    title: "Sahel : Carte interactive",
    href: "/sahel/"
  }), /*#__PURE__*/React.createElement(RecentItem, {
    icon: /*#__PURE__*/React.createElement(DocIconSm, null),
    title: "Sahel : Rapport analytique Q1 2026",
    href: "/sahel/rapport.html"
  }), /*#__PURE__*/React.createElement(RecentItem, {
    icon: /*#__PURE__*/React.createElement(MapIconSm, null),
    title: "Moyen-Orient : Carte interactive",
    href: "/moyen-orient/"
  }), /*#__PURE__*/React.createElement(RecentItem, {
    icon: /*#__PURE__*/React.createElement(MapIconSm, null),
    title: "RDC : Carte interactive",
    href: "/rdc/"
  }), /*#__PURE__*/React.createElement(RecentItem, {
    icon: /*#__PURE__*/React.createElement(MapIconSm, null),
    title: "Afrique Maritime : AIS temps reel",
    href: "/afrique/"
  }), /*#__PURE__*/React.createElement(RecentItem, {
    icon: /*#__PURE__*/React.createElement(MapIconSm, null),
    title: "Asie du Sud : Carte interactive",
    href: "/asie-sud/"
  }))), /*#__PURE__*/React.createElement(SidePanel, {
    open: open,
    action: action,
    onClose: closePanel
  }));
}

// Cascade au survol : carte d'action -> sous-éléments -> actions.
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

// Apercu video en fond de carte — capture reelle de la page cible, jouee au survol.
const PREVIEW_SRC = {
  Region: './shared/home/assets/preview-region.mp4?v=20260522b',
  Rapport: './shared/home/assets/preview-rapport.mp4?v=20260522b',
  Graph: './shared/home/assets/preview-graph.mp4?v=20260522b',
  Theme: './shared/home/assets/preview-theme.mp4?v=20260522b',
  Cartographie: './shared/home/assets/preview-cartographie.mp4?v=20260522b'
};
function ActionCard({
  num,
  name,
  desc,
  count,
  icon,
  onClick
}) {
  const groups = cascadeFor(name);
  const previewSrc = PREVIEW_SRC[name];
  const videoRef = React.useRef(null);
  function startPreview() {
    const v = videoRef.current;
    if (!v) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try {
      v.currentTime = 0;
      v.play().catch(() => {});
    } catch (e) {}
  }
  function stopPreview() {
    const v = videoRef.current;
    if (v) v.pause();
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "action-card-wrap",
    onMouseEnter: startPreview,
    onMouseLeave: stopPreview
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
  }, previewSrc && /*#__PURE__*/React.createElement("div", {
    className: "action-card__media",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("video", {
    ref: videoRef,
    className: "action-card__media-video",
    src: previewSrc,
    loop: true,
    muted: true,
    playsInline: true,
    preload: "metadata"
  })), /*#__PURE__*/React.createElement("div", {
    className: "action-card__top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "action-card__icon"
  }, icon), /*#__PURE__*/React.createElement("span", {
    className: "action-card__num"
  }, num)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
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
  }, groups.map((g, i) => /*#__PURE__*/React.createElement("div", {
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
