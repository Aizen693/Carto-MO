(function () {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* global React, ReactDOM */
// Page 1 — Accueil client Algor Access (plateforme OSINT)

const {
  useState,
  useEffect
} = React;
const SB_URL = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co';
const SB_KEY = 'sb_publishable_xxnL12zd9o5N30y1-Oi-0Q_YGYKMjh2';
const ZONE_LABELS = {
  'moyen-orient': 'Moyen-Orient',
  'sahel': 'Sahel',
  'rdc': 'RDC',
  'madagascar': 'Madagascar',
  'afrique': 'Afrique Maritime',
  'asie-sud': 'Asie du Sud'
};
function HomeView({
  onEnter,
  onConsole,
  clock,
  videoStyle
}) {
  return /*#__PURE__*/React.createElement("main", {
    className: "view-enter view-enter-active"
  }, /*#__PURE__*/React.createElement("section", {
    className: "hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hero__copy"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "hero__title"
  }, "Anticiper les", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("em", null, "risques operationnels")), /*#__PURE__*/React.createElement("p", {
    className: "hero__lede"
  }, "Six theatres geopolitiques suivis en continu \u2014 Moyen-Orient, Sahel, RDC, Madagascar, Afrique Maritime, Asie du Sud. Imagerie satellite, ACLED, GDELT, presse d'Etat, OSINT social et flux Telegram, agreges sur une carte unique : chaque evenement source, date et auditable."), /*#__PURE__*/React.createElement("div", {
    className: "hero__cta-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn--primary btn--lg btn--neon",
    onClick: onEnter
  }, /*#__PURE__*/React.createElement("span", {
    className: "btn-neon btn-neon--top",
    "aria-hidden": "true"
  }), "Acceder au catalogue", /*#__PURE__*/React.createElement(Arrow, null), /*#__PURE__*/React.createElement("span", {
    className: "btn-neon btn-neon--bottom",
    "aria-hidden": "true"
  })), /*#__PURE__*/React.createElement("a", {
    className: "btn--ghost-link",
    href: "#console",
    onClick: e => {
      e.preventDefault();
      onConsole();
    }
  }, "Console interne", /*#__PURE__*/React.createElement(ArrowDiag, null))), /*#__PURE__*/React.createElement("nav", {
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

// Page « Console interne » — presentation de la plateforme interne, dans la D.A. client.
function ConsoleTab({
  href,
  soon,
  onClick,
  icon,
  label,
  popTitle,
  popText
}) {
  const inner = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, icon), label, soon && /*#__PURE__*/React.createElement("span", {
    className: "console-tab__badge"
  }, "Bientot"));
  return /*#__PURE__*/React.createElement("div", {
    className: "console-tab-wrap"
  }, soon ? /*#__PURE__*/React.createElement("div", {
    className: "console-tab console-tab--soon"
  }, inner) : onClick ? /*#__PURE__*/React.createElement("a", {
    className: "console-tab",
    href: "#",
    onClick: e => {
      e.preventDefault();
      onClick();
    }
  }, inner) : /*#__PURE__*/React.createElement("a", {
    className: "console-tab",
    href: href
  }, inner), /*#__PURE__*/React.createElement("div", {
    className: "console-tab-pop"
  }, /*#__PURE__*/React.createElement("div", {
    className: "console-tab-pop__card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "console-tab-pop__title"
  }, popTitle), /*#__PURE__*/React.createElement("p", {
    className: "console-tab-pop__text"
  }, popText))));
}
function ConsoleView({
  onBack,
  onArchives,
  onVeille
}) {
  return /*#__PURE__*/React.createElement("main", {
    className: "view-enter view-enter-active"
  }, /*#__PURE__*/React.createElement("section", {
    className: "console-page"
  }, /*#__PURE__*/React.createElement("a", {
    className: "console-back",
    href: "#",
    onClick: e => {
      e.preventDefault();
      onBack();
    }
  }, "\u2190 Retour a l'accueil"), /*#__PURE__*/React.createElement("h1", {
    className: "hero__title"
  }, "Console ", /*#__PURE__*/React.createElement("em", null, "interne")), /*#__PURE__*/React.createElement("p", {
    className: "hero__lede"
  }, "Outil de travail des analystes Algor Int sur six theatres \u2014 Moyen-Orient, Sahel, RDC, Madagascar, Afrique Maritime, Asie du Sud. Imagerie satellite, ACLED, GDELT, presse d'Etat, OSINT social et flux Telegram sont agreges sur une carte unique, sourcee, datee et auditable evenement par evenement."), /*#__PURE__*/React.createElement("div", {
    className: "console-tabs"
  }, /*#__PURE__*/React.createElement(ConsoleTab, {
    href: "/admin/",
    label: "Carto",
    popTitle: "Cartographie OSINT",
    popText: "Edition des points, acteurs et calques sur les 6 theatres. Ouvre la console d'administration cartographique.",
    icon: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "10",
      r: "2.6"
    }))
  }), /*#__PURE__*/React.createElement(ConsoleTab, {
    onClick: onArchives,
    label: "Archives",
    popTitle: "Archives",
    popText: "Tous les points cartographies des 6 theatres, conserves en base. Consultable sous forme de tableau, par theatre.",
    icon: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M21 8v13H3V8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M1 3h22v5H1z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 12h4"
    }))
  }), /*#__PURE__*/React.createElement(ConsoleTab, {
    onClick: onVeille,
    label: "Veille",
    popTitle: "Veille",
    popText: "Agregateur d'articles OSINT \u2014 chargement, filtres, scoring et exports. Outil de veille interne.",
    icon: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "3"
    }))
  }), /*#__PURE__*/React.createElement(ConsoleTab, {
    soon: true,
    label: "Rapport",
    popTitle: "Rapport",
    popText: "Generation de rapports d'analyse decisionnels. Bientot disponible.",
    icon: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 2v5h5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M9 13h6M9 17h6"
    }))
  }), /*#__PURE__*/React.createElement(ConsoleTab, {
    soon: true,
    label: "Graph",
    popTitle: "Graph",
    popText: "Visualisation des reseaux et relations en graphes. Bientot disponible.",
    icon: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "6",
      cy: "6",
      r: "2.5"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "6",
      cy: "18",
      r: "2.5"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "18",
      cy: "12",
      r: "2.5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8.2 7.3l7.6 3.4M8.2 16.7l7.6-3.4"
    }))
  }))));
}

// Page « Veille » — outil de veille OSINT (app Streamlit Algor Int) integre en cadre.
const VEILLE_URL = 'https://carto-mo-d95ewgm9x6zzfugtcpdst8.streamlit.app/';
function VeilleView({
  onBack
}) {
  return /*#__PURE__*/React.createElement("main", {
    className: "view-enter view-enter-active"
  }, /*#__PURE__*/React.createElement("section", {
    className: "console-page"
  }, /*#__PURE__*/React.createElement("a", {
    className: "console-back",
    href: "#",
    onClick: e => {
      e.preventDefault();
      onBack();
    }
  }, "\u2190 Retour a la console"), /*#__PURE__*/React.createElement("h1", {
    className: "hero__title"
  }, "Veille ", /*#__PURE__*/React.createElement("em", null, "OSINT")), /*#__PURE__*/React.createElement("p", {
    className: "hero__lede"
  }, "Agregateur d'articles Inoreader \u2014 chargement a la demande, filtres, scoring local et exports. Outil de travail interne des analystes Algor Int."), /*#__PURE__*/React.createElement("div", {
    className: "veille-frame"
  }, /*#__PURE__*/React.createElement("iframe", {
    className: "veille-frame__iframe",
    src: VEILLE_URL + '?embed=true',
    title: "Outil de veille OSINT Algor Int",
    loading: "lazy"
  })), /*#__PURE__*/React.createElement("a", {
    className: "veille-frame__fallback",
    href: VEILLE_URL,
    target: "_blank",
    rel: "noopener noreferrer"
  }, "Ouvrir en plein ecran \u2197")));
}

// Page « Archives » — dashboard de tous les points, par theatre (lecture base Supabase).
function ArchivesView({
  onBack
}) {
  const [points, setPoints] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = [];
        let offset = 0;
        const page = 1000;
        while (true) {
          const res = await fetch(SB_URL + '/rest/v1/points?select=id,zone,name,description,period,coordinates,color,casualties,deleted,created_at' + '&order=zone.asc,created_at.desc&offset=' + offset + '&limit=' + page, {
            headers: {
              apikey: SB_KEY
            }
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const chunk = await res.json();
          all.push(...chunk);
          if (chunk.length < page) break;
          offset += page;
        }
        if (!cancelled) setPoints(all);
      } catch (e) {
        if (!cancelled) setError(e && e.message || 'Erreur de chargement');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Esc ferme le detail
  useEffect(() => {
    if (!selected) return;
    const h = e => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selected]);
  const needle = query.toLowerCase().trim();
  const visible = (points || []).filter(p => {
    if (!needle) return true;
    return [p.name, p.description, p.period, ZONE_LABELS[p.zone] || p.zone].some(f => (f || '').toString().toLowerCase().includes(needle));
  });
  const groups = {};
  visible.forEach(p => {
    (groups[p.zone] = groups[p.zone] || []).push(p);
  });
  const zones = Object.keys(groups).sort();
  return /*#__PURE__*/React.createElement("main", {
    className: "view-enter view-enter-active"
  }, /*#__PURE__*/React.createElement("section", {
    className: "console-page"
  }, /*#__PURE__*/React.createElement("a", {
    className: "console-back",
    href: "#",
    onClick: e => {
      e.preventDefault();
      onBack();
    }
  }, "\u2190 Retour a la console"), /*#__PURE__*/React.createElement("h1", {
    className: "hero__title"
  }, "Archives ", /*#__PURE__*/React.createElement("em", null, "des points")), /*#__PURE__*/React.createElement("p", {
    className: "hero__lede"
  }, "Tous les points cartographies, regroupes par theatre. Conserves en base meme apres retrait des cartes."), points && points.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "dash-search"
  }, /*#__PURE__*/React.createElement("div", {
    className: "search-input"
  }, /*#__PURE__*/React.createElement(DashSearchIcon, null), /*#__PURE__*/React.createElement("input", {
    placeholder: "Rechercher un point \u2014 nom, description, periode, theatre...",
    value: query,
    onChange: e => setQuery(e.target.value)
  }), query && /*#__PURE__*/React.createElement("button", {
    className: "search-input__clear",
    onClick: () => setQuery(''),
    "aria-label": "Effacer"
  }, /*#__PURE__*/React.createElement(DashCloseIcon, {
    size: 12
  }))), /*#__PURE__*/React.createElement("span", {
    className: "dash-search__count"
  }, visible.length, " point", visible.length > 1 ? 's' : '')), error && /*#__PURE__*/React.createElement("div", {
    className: "dash-msg dash-msg--err"
  }, "Erreur : ", error), !points && !error && /*#__PURE__*/React.createElement("div", {
    className: "dash-msg"
  }, "Chargement des points..."), points && points.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "dash-msg"
  }, "Aucun point en base."), points && points.length > 0 && zones.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "dash-msg"
  }, "Aucun resultat pour \xAB ", query, " \xBB."), points && zones.map(z => /*#__PURE__*/React.createElement("div", {
    className: "dash-zone",
    key: z
  }, /*#__PURE__*/React.createElement("div", {
    className: "dash-zone__head"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "dash-zone__name"
  }, ZONE_LABELS[z] || z), /*#__PURE__*/React.createElement("span", {
    className: "dash-zone__count"
  }, groups[z].length, " points")), /*#__PURE__*/React.createElement("div", {
    className: "dash-table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "dash-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Nom"), /*#__PURE__*/React.createElement("th", null, "Periode"), /*#__PURE__*/React.createElement("th", null, "Latitude"), /*#__PURE__*/React.createElement("th", null, "Longitude"), /*#__PURE__*/React.createElement("th", null, "Victimes"), /*#__PURE__*/React.createElement("th", null, "Statut"))), /*#__PURE__*/React.createElement("tbody", null, groups[z].map(p => {
    const c = Array.isArray(p.coordinates) ? p.coordinates : [];
    return /*#__PURE__*/React.createElement("tr", {
      key: p.id,
      className: "dash-row",
      tabIndex: 0,
      onClick: () => setSelected(p),
      onKeyDown: e => {
        if (e.key === 'Enter') setSelected(p);
      }
    }, /*#__PURE__*/React.createElement("td", null, p.name || '—'), /*#__PURE__*/React.createElement("td", null, p.period || '—'), /*#__PURE__*/React.createElement("td", null, c[1] != null ? Number(c[1]).toFixed(4) : '—'), /*#__PURE__*/React.createElement("td", null, c[0] != null ? Number(c[0]).toFixed(4) : '—'), /*#__PURE__*/React.createElement("td", null, p.casualties || 0), /*#__PURE__*/React.createElement("td", null, p.deleted ? /*#__PURE__*/React.createElement("span", {
      className: "dash-tag dash-tag--archived"
    }, "Archive") : /*#__PURE__*/React.createElement("span", {
      className: "dash-tag dash-tag--live"
    }, "Actif")));
  }))))))), selected && /*#__PURE__*/React.createElement(PointDetail, {
    point: selected,
    onClose: () => setSelected(null)
  }));
}

// Parse le champ description structure (Date / Pays / Evenement / Detail),
// meme logique que l'ancien pop-up des cartes (shared/engine.js parseDesc).
function parsePointDesc(raw) {
  if (!raw || raw === 'null') return null;
  const txt = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  const r = {};
  txt.split('\n').forEach(l => {
    const m = l.match(/^([^:]+):\s*(.+)$/);
    if (!m) return;
    const k = m[1].trim().toLowerCase();
    const v = m[2].trim();
    if (k === 'date') r.date = v;else if (k === 'pays') r.pays = v;else if (k === 'evenement' || k === 'événement') r.event = v;else if (k === 'détail' || k === 'detail') r.detail = v;
  });
  return Object.keys(r).length ? r : null;
}

// Popup detail d'un point — reprend le contenu de l'ancien pop-up des cartes.
function PointDetail({
  point,
  onClose
}) {
  const c = Array.isArray(point.coordinates) ? point.coordinates : [];
  const lng = c[0] != null ? Number(c[0]).toFixed(5) : '—';
  const lat = c[1] != null ? Number(c[1]).toFixed(5) : '—';
  const created = point.created_at ? new Date(point.created_at).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }) : '—';
  const d = parsePointDesc(point.description);
  const eventRows = [];
  if (d) {
    if (d.date) eventRows.push(['Date', d.date]);
    if (d.pays) eventRows.push(['Pays', d.pays]);
    if (d.event) eventRows.push(['Evenement', d.event]);
    if (d.detail) eventRows.push(['Detail', d.detail]);
  }
  const metaRows = [['Theatre', ZONE_LABELS[point.zone] || point.zone], ['Coordonnees', lat + ', ' + lng], ['Victimes', String(point.casualties || 0)], ['Statut', point.deleted ? 'Archive (retire des cartes)' : 'Actif'], ['Ajoute le', created]];
  return ReactDOM.createPortal(/*#__PURE__*/React.createElement("div", {
    className: "point-modal-overlay",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "point-modal",
    role: "dialog",
    "aria-modal": "true",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("button", {
    className: "point-modal__close",
    onClick: onClose,
    "aria-label": "Fermer"
  }, /*#__PURE__*/React.createElement(DashCloseIcon, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "point-modal__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "point-modal__dot",
    style: {
      background: point.color || '#888888'
    }
  }), /*#__PURE__*/React.createElement("h3", {
    className: "point-modal__name"
  }, point.name || 'Point sans nom'), point.period && /*#__PURE__*/React.createElement("span", {
    className: "point-modal__period"
  }, point.period)), eventRows.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "point-modal__rows point-modal__rows--event"
  }, eventRows.map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    className: "point-modal__row",
    key: k
  }, /*#__PURE__*/React.createElement("span", {
    className: "point-modal__key"
  }, k), /*#__PURE__*/React.createElement("span", {
    className: "point-modal__val"
  }, v)))), !eventRows.length && point.description && point.description !== 'null' && /*#__PURE__*/React.createElement("p", {
    className: "point-modal__desc"
  }, point.description), /*#__PURE__*/React.createElement("div", {
    className: "point-modal__rows"
  }, metaRows.map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    className: "point-modal__row",
    key: k
  }, /*#__PURE__*/React.createElement("span", {
    className: "point-modal__key"
  }, k), /*#__PURE__*/React.createElement("span", {
    className: "point-modal__val"
  }, v)))))), document.body);
}
function DashSearchIcon() {
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
function DashCloseIcon({
  size = 14
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 14 14",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3.5 3.5l7 7M10.5 3.5l-7 7",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }));
}
Object.assign(window, {
  HomeView,
  VideoBand,
  ConsoleView,
  ArchivesView,
  VeilleView,
  Arrow,
  ArrowDiag
});
})();
