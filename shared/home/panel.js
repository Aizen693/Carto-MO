(function () {
/* global React, ZONES, REPORTS, GRAPHS, THEMES, THEME_DETAIL */
// Side panel — système hiérarchique pour les 4 actions :
//   • RÉGION   : liste zones → détail zone (carte/rapport/graph/thème)
//   • RAPPORT  : liste zones → liste rapports zone
//   • GRAPH    : liste zones → liste graphs zone
//   • THÈME    : liste thèmes → sous-contenus thème (Carte/Rapport/Graph/...)

const {
  useState,
  useEffect,
  useRef
} = React;
function SidePanel({
  open,
  action,
  onClose
}) {
  // Internal navigation stack: [{ kind, label, payload }]
  const [stack, setStack] = useState([]);
  const [query, setQuery] = useState('');

  // Reset stack to root whenever a new action is opened
  useEffect(() => {
    if (action) setStack([rootFor(action)]);
    setQuery('');
  }, [action]);

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const h = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  const top = stack[stack.length - 1] || null;
  const push = frame => setStack(s => [...s, frame]);
  const popTo = idx => setStack(s => s.slice(0, idx + 1));
  if (!action) return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: `panel-overlay ${open ? 'open' : ''}`,
    onClick: onClose
  }), /*#__PURE__*/React.createElement("aside", {
    className: `side-panel ${open ? 'open' : ''}`,
    "aria-hidden": !open
  }));
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: `panel-overlay ${open ? 'open' : ''}`,
    onClick: onClose
  }), /*#__PURE__*/React.createElement("aside", {
    className: `side-panel ${open ? 'open' : ''}`,
    "aria-hidden": !open
  }, /*#__PURE__*/React.createElement(PanelHeader, {
    stack: stack,
    onCrumbClick: popTo,
    onClose: onClose
  }), !!top && top.kind !== 'detail-zone' && top.kind !== 'detail-theme' && /*#__PURE__*/React.createElement("div", {
    className: "side-panel__search"
  }, /*#__PURE__*/React.createElement("div", {
    className: "search-input"
  }, /*#__PURE__*/React.createElement(SearchIcon, null), /*#__PURE__*/React.createElement("input", {
    placeholder: `Rechercher dans ${top.title.toLowerCase()}…`,
    value: query,
    onChange: e => setQuery(e.target.value),
    autoFocus: open
  }), query && /*#__PURE__*/React.createElement("button", {
    className: "search-input__clear",
    onClick: () => setQuery('')
  }, /*#__PURE__*/React.createElement(CloseSm, null)))), /*#__PURE__*/React.createElement("div", {
    className: "side-panel__body"
  }, top && renderFrame(top, query, push))));
}

// ─── Root frame factory ───────────────────────────────────
function rootFor(action) {
  if (action === 'region') return {
    kind: 'zones',
    title: 'Régions',
    subtitle: 'Choisissez un théâtre pour accéder à sa cartographie, ses rapports et ses indicateurs.'
  };
  if (action === 'rapport') return {
    kind: 'zones-r',
    title: 'Rapports',
    subtitle: 'Classement par zone, puis par rapport. Notes hebdomadaires, synthèses et études.'
  };
  if (action === 'graph') return {
    kind: 'zones-g',
    title: 'Graphs',
    subtitle: 'Visualisations et indicateurs : flux, densités, réseaux, séries temporelles.'
  };
  if (action === 'theme') return {
    kind: 'themes',
    title: 'Thèmes',
    subtitle: 'Lectures transversales : un sujet, plusieurs zones. Ports, Mines, JNIM, etc.'
  };
  if (action === 'cartographie') return {
    kind: 'zones',
    title: 'Cartographie',
    subtitle: 'Accès direct aux cartes interactives : sélectionnez un théâtre pour l\'ouvrir.'
  };
  return null;
}

// ─── Header (breadcrumb + title) ──────────────────────────
function PanelHeader({
  stack,
  onCrumbClick,
  onClose
}) {
  const top = stack[stack.length - 1];
  if (!top) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "side-panel__head"
  }, stack.length > 1 && /*#__PURE__*/React.createElement("div", {
    className: "side-panel__breadcrumb"
  }, stack.map((f, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onCrumbClick(i),
    disabled: i === stack.length - 1
  }, f.title), i < stack.length - 1 && /*#__PURE__*/React.createElement("span", {
    className: "side-panel__breadcrumb-sep"
  }, "/")))), /*#__PURE__*/React.createElement("div", {
    className: "side-panel__head-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "side-panel__title"
  }, top.title), top.subtitle && /*#__PURE__*/React.createElement("p", {
    className: "side-panel__subtitle"
  }, top.subtitle)), /*#__PURE__*/React.createElement("button", {
    className: "side-panel__close",
    onClick: onClose,
    "aria-label": "Fermer"
  }, /*#__PURE__*/React.createElement(CloseIcon, null))));
}

// ─── Frame renderers ──────────────────────────────────────
function renderFrame(frame, query, push) {
  switch (frame.kind) {
    case 'zones':
      return /*#__PURE__*/React.createElement(ZonesList, {
        q: query,
        onPick: z => {
          if (z.href) window.location.href = z.href;else push({
            kind: 'detail-zone',
            title: z.name,
            subtitle: z.countries,
            payload: z
          });
        }
      });
    case 'zones-r':
      return /*#__PURE__*/React.createElement(ZonesList, {
        q: query,
        mode: "reports",
        onPick: z => push({
          kind: 'reports-of-zone',
          title: `Rapports · ${z.name}`,
          subtitle: z.countries,
          payload: z
        })
      });
    case 'zones-g':
      return /*#__PURE__*/React.createElement(ZonesList, {
        q: query,
        mode: "graphs",
        onPick: z => push({
          kind: 'graphs-of-zone',
          title: `Graphs · ${z.name}`,
          subtitle: z.countries,
          payload: z
        })
      });
    case 'themes':
      return /*#__PURE__*/React.createElement(ThemesList, {
        q: query,
        onPick: t => push({
          kind: 'detail-theme',
          title: t.name,
          subtitle: t.desc,
          payload: t
        })
      });
    case 'reports-of-zone':
      return /*#__PURE__*/React.createElement(ReportsList, {
        q: query,
        zoneId: frame.payload.id
      });
    case 'graphs-of-zone':
      return /*#__PURE__*/React.createElement(GraphsList, {
        q: query,
        zoneId: frame.payload.id
      });
    case 'detail-zone':
      return /*#__PURE__*/React.createElement(ZoneDetail, {
        zone: frame.payload
      });
    case 'detail-theme':
      return /*#__PURE__*/React.createElement(ThemeDetail, {
        theme: frame.payload
      });
    default:
      return null;
  }
}

// ─── Lists ────────────────────────────────────────────────
function ZonesList({
  q,
  mode,
  onPick
}) {
  const filtered = ZONES.filter(z => match(q, z.name, z.countries));
  return /*#__PURE__*/React.createElement("div", {
    className: "panel-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-list__group-label"
  }, "Th\xE9\xE2tres op\xE9rationnels \xB7 ", filtered.length), filtered.map(z => /*#__PURE__*/React.createElement("button", {
    key: z.id,
    className: "panel-row",
    onClick: () => onPick(z)
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__flag"
  }, z.code), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__title"
  }, z.name), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__meta"
  }, z.countries)), /*#__PURE__*/React.createElement("span", {
    className: `panel-row__badge ${z.status === 'beta' ? '' : 'ok'}`
  }, mode === 'reports' ? `${(REPORTS[z.id] || []).length} doc` : mode === 'graphs' ? `${(GRAPHS[z.id] || []).length} vues` : `${z.events} évts`), /*#__PURE__*/React.createElement(ChevRight, null))), !filtered.length && /*#__PURE__*/React.createElement(Empty, {
    q: q
  }));
}
function ReportsList({
  q,
  zoneId
}) {
  const list = (REPORTS[zoneId] || []).filter(r => match(q, r.title, r.tag));
  return /*#__PURE__*/React.createElement("div", {
    className: "panel-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-list__group-label"
  }, "Documents disponibles \xB7 ", list.length), list.map(r => {
    const Tag = r.href ? 'a' : 'button';
    return /*#__PURE__*/React.createElement(Tag, {
      key: r.id,
      className: "panel-row",
      href: r.href || undefined
    }, /*#__PURE__*/React.createElement("span", {
      className: "panel-row__flag panel-row__flag--doc"
    }, /*#__PURE__*/React.createElement(DocIcon, null)), /*#__PURE__*/React.createElement("span", {
      className: "panel-row__body"
    }, /*#__PURE__*/React.createElement("span", {
      className: "panel-row__title"
    }, r.title), /*#__PURE__*/React.createElement("span", {
      className: "panel-row__meta"
    }, r.date, " \xB7 ", r.pages, " pages")), /*#__PURE__*/React.createElement("span", {
      className: "panel-row__badge"
    }, r.tag), /*#__PURE__*/React.createElement(ChevRight, null));
  }), !list.length && /*#__PURE__*/React.createElement(Empty, {
    q: q
  }));
}
function GraphsList({
  q,
  zoneId
}) {
  const list = (GRAPHS[zoneId] || []).filter(g => match(q, g.title, g.type));
  return /*#__PURE__*/React.createElement("div", {
    className: "panel-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-list__group-label"
  }, "Visualisations \xB7 ", list.length), list.map(g => /*#__PURE__*/React.createElement("button", {
    key: g.id,
    className: "panel-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__flag panel-row__flag--graph"
  }, /*#__PURE__*/React.createElement(GraphIcon, null)), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__title"
  }, g.title), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__meta"
  }, g.type, " \xB7 ", g.scope)), /*#__PURE__*/React.createElement(ChevRight, null))), !list.length && /*#__PURE__*/React.createElement(Empty, {
    q: q
  }));
}
function ThemesList({
  q,
  onPick
}) {
  const list = THEMES.filter(t => match(q, t.name, t.desc));
  return /*#__PURE__*/React.createElement("div", {
    className: "panel-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-list__group-label"
  }, "Th\xE8mes transverses \xB7 ", list.length), list.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    className: "panel-row",
    onClick: () => onPick(t)
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__flag",
    style: {
      background: `${t.color}22`,
      color: t.color
    }
  }, /*#__PURE__*/React.createElement(ThemeGlyph, {
    name: t.name
  })), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__title"
  }, t.name), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__meta"
  }, t.desc)), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__badge"
  }, t.count, " pts"), /*#__PURE__*/React.createElement(ChevRight, null))), !list.length && /*#__PURE__*/React.createElement(Empty, {
    q: q
  }));
}

// ─── Detail views ─────────────────────────────────────────
function ZoneDetail({
  zone
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "detail-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-section__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "detail-section__label"
  }, "Vue d'ensemble"), /*#__PURE__*/React.createElement("span", {
    className: "detail-section__count"
  }, zone.period)), /*#__PURE__*/React.createElement("div", {
    className: "detail-stats"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-stat__value"
  }, zone.events), /*#__PURE__*/React.createElement("div", {
    className: "detail-stat__label"
  }, "\xC9v\xE8nements")), /*#__PURE__*/React.createElement("div", {
    className: "detail-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-stat__value"
  }, (REPORTS[zone.id] || []).length), /*#__PURE__*/React.createElement("div", {
    className: "detail-stat__label"
  }, "Rapports")), /*#__PURE__*/React.createElement("div", {
    className: "detail-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-stat__value"
  }, (GRAPHS[zone.id] || []).length), /*#__PURE__*/React.createElement("div", {
    className: "detail-stat__label"
  }, "Graphs")))), /*#__PURE__*/React.createElement("div", {
    className: "detail-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-section__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "detail-section__label"
  }, "Acc\xE8s rapide")), /*#__PURE__*/React.createElement("div", {
    className: "panel-list"
  }, /*#__PURE__*/React.createElement("a", {
    className: "panel-row",
    href: zone.href || '#'
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__flag"
  }, /*#__PURE__*/React.createElement(MapIcon, null)), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__title"
  }, "Carte interactive"), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__meta"
  }, "Mapbox \xB7 calques \xB7 3D")), /*#__PURE__*/React.createElement(ChevRight, null)), (REPORTS[zone.id] || []).find(r => r.href) && /*#__PURE__*/React.createElement("a", {
    className: "panel-row",
    href: (REPORTS[zone.id] || []).find(r => r.href).href
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__flag panel-row__flag--doc"
  }, /*#__PURE__*/React.createElement(DocIcon, null)), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__title"
  }, "Rapport analytique"), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__meta"
  }, (REPORTS[zone.id] || []).length, " documents")), /*#__PURE__*/React.createElement(ChevRight, null)), /*#__PURE__*/React.createElement("button", {
    className: "panel-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__flag panel-row__flag--graph"
  }, /*#__PURE__*/React.createElement(GraphIcon, null)), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__title"
  }, "Graphs & indicateurs"), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__meta"
  }, (GRAPHS[zone.id] || []).length, " vues disponibles")), /*#__PURE__*/React.createElement(ChevRight, null)), /*#__PURE__*/React.createElement("button", {
    className: "panel-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__flag"
  }, /*#__PURE__*/React.createElement(ThemeGlyph, {
    name: "Theme"
  })), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "panel-row__title"
  }, "Themes lies"), /*#__PURE__*/React.createElement("span", {
    className: "panel-row__meta"
  }, "Ports \xB7 Mines \xB7 JNIM \xB7 Flux")), /*#__PURE__*/React.createElement(ChevRight, null)))), /*#__PURE__*/React.createElement("div", {
    className: "action-row"
  }, /*#__PURE__*/React.createElement("a", {
    className: "btn btn--primary",
    href: zone.href || '#',
    style: {
      flex: 1
    }
  }, "Ouvrir la carte", /*#__PURE__*/React.createElement(Arrow, null))));
}
function ThemeDetail({
  theme
}) {
  const items = THEME_DETAIL[theme.id] || [];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "detail-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-section__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "detail-section__label"
  }, "Aper\xE7u"), /*#__PURE__*/React.createElement("span", {
    className: "detail-section__count"
  }, theme.count, " points")), /*#__PURE__*/React.createElement("div", {
    className: "detail-stats"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-stat__value"
  }, theme.count), /*#__PURE__*/React.createElement("div", {
    className: "detail-stat__label"
  }, "Points li\xE9s")), /*#__PURE__*/React.createElement("div", {
    className: "detail-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-stat__value"
  }, "04"), /*#__PURE__*/React.createElement("div", {
    className: "detail-stat__label"
  }, "Zones concern\xE9es")), /*#__PURE__*/React.createElement("div", {
    className: "detail-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-stat__value up"
  }, "+12%"), /*#__PURE__*/React.createElement("div", {
    className: "detail-stat__label"
  }, "Tendance 30j")))), /*#__PURE__*/React.createElement("div", {
    className: "detail-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-section__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "detail-section__label"
  }, "Contenus disponibles"), /*#__PURE__*/React.createElement("span", {
    className: "detail-section__count"
  }, items.length)), /*#__PURE__*/React.createElement("div", {
    className: "panel-list"
  }, items.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, /*#__PURE__*/React.createElement("p", null, "Pas encore de contenu rattach\xE9 \xE0 ce th\xE8me.")), items.map(it => {
    const Tag = it.href ? 'a' : 'button';
    return /*#__PURE__*/React.createElement(Tag, {
      key: it.id,
      className: "panel-row",
      href: it.href || undefined
    }, /*#__PURE__*/React.createElement("span", {
      className: "panel-row__flag",
      style: {
        background: `${theme.color}22`,
        color: theme.color
      }
    }, it.type === 'Carte' && /*#__PURE__*/React.createElement(MapIcon, null), it.type === 'Rapport' && /*#__PURE__*/React.createElement(DocIcon, null), it.type === 'Graph' && /*#__PURE__*/React.createElement(GraphIcon, null), it.type === 'Reseau' && /*#__PURE__*/React.createElement(NetIcon, null)), /*#__PURE__*/React.createElement("span", {
      className: "panel-row__body"
    }, /*#__PURE__*/React.createElement("span", {
      className: "panel-row__title"
    }, it.title), /*#__PURE__*/React.createElement("span", {
      className: "panel-row__meta"
    }, it.type, " \xB7 ", it.meta)), /*#__PURE__*/React.createElement(ChevRight, null));
  }))));
}
function Empty({
  q
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, /*#__PURE__*/React.createElement("p", null, "Aucun r\xE9sultat", q ? /*#__PURE__*/React.createElement(React.Fragment, null, " pour \xAB ", /*#__PURE__*/React.createElement("strong", null, q), " \xBB") : '', "."));
}

// ─── helpers ──────────────────────────────────────────────
function match(q, ...fields) {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  return fields.some(f => (f || '').toLowerCase().includes(needle));
}

// ─── Icons ────────────────────────────────────────────────
function SearchIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "7",
    r: "5",
    stroke: "currentColor",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M11 11l3 3",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }));
}
function CloseIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 4l10 10M14 4L4 14",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }));
}
function CloseSm() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 3l6 6M9 3l-6 6",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round"
  }));
}
function ChevRight() {
  return /*#__PURE__*/React.createElement("svg", {
    className: "panel-row__chev",
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 4l4 4-4 4",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}
function MapIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 4.5L7 3l4 1.5L16 3v10.5L11 15l-4-1.5L2 15V4.5z",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 3v10.5M11 4.5V15",
    stroke: "currentColor",
    strokeWidth: "1.4"
  }));
}
function DocIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 2.5h6l3 3V15a.5.5 0 01-.5.5h-8.5a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5z",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M11 2.5v3h3M6.5 9h5M6.5 11.5h5M6.5 7h2.5",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round"
  }));
}
function GraphIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 14V4M3 14h12",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 11l3-3 2 2 4-5",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "14",
    cy: "5",
    r: "1.4",
    fill: "currentColor"
  }));
}
function NetIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "4",
    r: "1.6",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "4",
    cy: "13",
    r: "1.6",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "14",
    cy: "13",
    r: "1.6",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "10",
    r: "1.6",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 5.5v3M7.5 11l-2 1.5M10.5 11l2 1.5",
    stroke: "currentColor",
    strokeWidth: "1.3"
  }));
}
function ThemeGlyph({
  name
}) {
  // Simple iconographic placeholder per theme name
  if (/port/i.test(name)) return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 2v8M5 5l4-3 4 3M3 14c2 1 4 1 6-1 2 2 4 2 6 1",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round"
  }));
  if (/min/i.test(name)) return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 15l4-7 3 3 5-7",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "15",
    cy: "4",
    r: "1.4",
    fill: "currentColor"
  }));
  if (/jnim|djih/i.test(name)) return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 3l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6L9 3z",
    stroke: "currentColor",
    strokeWidth: "1.3",
    strokeLinejoin: "round"
  }));
  if (/route|flux/i.test(name)) return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 9c0-3 2-5 5-5s4 3 4 5-2 5-4 5-5-2-5-5z",
    stroke: "currentColor",
    strokeWidth: "1.3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 9h12M10 5l3 4-3 4",
    stroke: "currentColor",
    strokeWidth: "1.3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
  if (/énerg|energ|petr|pétr/i.test(name)) return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 2L6 9h2.5L7 16l5-9h-2.5L11 2H9z",
    fill: "currentColor"
  }));
  if (/pop/i.test(name)) return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "6",
    r: "2.3",
    stroke: "currentColor",
    strokeWidth: "1.3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "6",
    r: "2.3",
    stroke: "currentColor",
    strokeWidth: "1.3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M2 15c0-2 2-3.5 4-3.5s4 1.5 4 3.5M8 15c0-2 2-3.5 4-3.5s4 1.5 4 3.5",
    stroke: "currentColor",
    strokeWidth: "1.3",
    strokeLinecap: "round"
  }));
  return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "3",
    width: "12",
    height: "12",
    rx: "2",
    stroke: "currentColor",
    strokeWidth: "1.3"
  }));
}
Object.assign(window, {
  SidePanel
});
})();
