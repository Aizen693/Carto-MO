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

// ════════════════════════════════════════════════════════════════════════
// VEILLE HEBDOMADAIRE — flux OSINT (cloche + section editoriale)
// Donnees : notifications.json sur la branche veille-data (alimente par n8n).
// Teaser public ; analyse complete + archive reservees aux abonnes.
// ════════════════════════════════════════════════════════════════════════
const VEILLE_REMOTE = 'https://raw.githubusercontent.com/Aizen693/Carto-MO/veille-data/notifications.json';
const SEV = {
  info: {
    lbl: 'Signal',
    c: '#6B3FA0'
  },
  alerte: {
    lbl: 'Alerte',
    c: '#C77A12'
  },
  critique: {
    lbl: 'Critique',
    c: '#B83A4A'
  }
};
const VEILLE_SEED = [{
  id: 'v08',
  date: '2026-06-15',
  theatre: 'sahel',
  severite: 'alerte',
  source: 'ACLED',
  source_url: 'https://acleddata.com',
  titre: "Le blocus jihadiste autour de Djibo se durcit",
  resume: "Le JNIM resserre son étau sur Djibo : convois ciblés et axes coupés au nord du Burkina.",
  detail: "Sur la semaine écoulée, ACLED recense une hausse nette des embuscades sur les axes Djibo Kongoussi. Le ravitaillement de la ville devient difficile et le risque humanitaire monte d'un cran pour les organisations encore présentes sur zone."
}, {
  id: 'v07',
  date: '2026-06-14',
  theatre: 'moyen-orient',
  severite: 'critique',
  source: 'ISW',
  source_url: 'https://understandingwar.org',
  titre: "Regain de frappes le long du corridor d'Hodeida",
  resume: "Plusieurs frappes signalées sur les infrastructures portuaires de la mer Rouge.",
  detail: "L'Institute for the Study of War documente une série de frappes visant les installations portuaires d'Hodeida. La logistique maritime régionale est directement exposée, avec un report possible du trafic vers des routes alternatives."
}, {
  id: 'v06',
  date: '2026-06-13',
  theatre: 'rdc',
  severite: 'alerte',
  source: 'Kivu Security Tracker',
  source_url: 'https://kivusecurity.org',
  titre: "Progression du M23 confirmée vers Uvira",
  resume: "Mouvements de colonnes observés au sud du lac Kivu.",
  detail: "Le Kivu Security Tracker confirme des mouvements du M23 en direction d'Uvira. Plusieurs localités changent de contrôle. La pression sur les axes commerciaux vers le Burundi s'accentue."
}, {
  id: 'v05',
  date: '2026-06-12',
  theatre: 'asie-sud',
  severite: 'info',
  source: 'Bellingcat',
  source_url: 'https://www.bellingcat.com',
  titre: "Renforts observés le long de la Ligne de contrôle",
  resume: "L'imagerie satellite montre de nouveaux déploiements au Cachemire.",
  detail: "L'analyse d'imagerie ouverte met en évidence de nouveaux cantonnements et un trafic logistique accru le long de la Ligne de contrôle. À surveiller comme signal précoce d'une montée de tension."
}, {
  id: 'v04',
  date: '2026-06-11',
  theatre: 'afrique',
  severite: 'info',
  source: 'IMB Piracy Reporting Centre',
  source_url: 'https://www.icc-ccs.org',
  titre: "Pic d'approches suspectes dans le golfe de Guinée",
  resume: "Trois tentatives d'abordage rapportées en une semaine au large du Nigeria.",
  detail: "Le Bureau maritime international relève trois approches hostiles en une semaine. Le mode opératoire reste l'enlèvement d'équipage. Les armateurs adaptent leurs routes et leurs vitesses de transit."
}, {
  id: 'v03',
  date: '2026-06-10',
  theatre: 'madagascar',
  severite: 'info',
  source: 'Presse régionale',
  source_url: '',
  titre: "Tensions sociales à Antananarivo",
  resume: "Manifestations et coupures de courant signalées dans la capitale.",
  detail: "Plusieurs rassemblements liés aux coupures d'électricité sont rapportés dans la capitale. La situation reste contenue mais mérite un suivi rapproché pour les implantations locales."
}, {
  id: 'v02',
  date: '2026-06-09',
  theatre: 'sahel',
  severite: 'info',
  source: 'RFI',
  source_url: 'https://www.rfi.fr',
  titre: "Nouvelle vague de recrutement des VDP au Burkina",
  resume: "Les autorités annoncent un renfort des supplétifs civils.",
  detail: "Une nouvelle campagne de recrutement de Volontaires pour la Défense de la Patrie est annoncée. L'encadrement et l'équipement de ces unités restent un point de vigilance documenté."
}, {
  id: 'v01',
  date: '2026-06-08',
  theatre: 'moyen-orient',
  severite: 'alerte',
  source: 'MarineTraffic',
  source_url: 'https://www.marinetraffic.com',
  titre: "Concentration navale inhabituelle en mer Rouge",
  resume: "Une densité anormale de bâtiments militaires est détectée.",
  detail: "Le suivi AIS révèle une concentration inhabituelle de bâtiments dans le sud de la mer Rouge. Le signal est cohérent avec une posture de dissuasion autour du détroit de Bab el Mandeb."
}];
function veilleZone(k) {
  return ZONE_LABELS[k] || k;
}
function veilleDateFR(d) {
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short'
    });
  } catch (e) {
    return d;
  }
}
function srcLogo(url) {
  try {
    return 'https://www.google.com/s2/favicons?domain=' + new URL(url).hostname + '&sz=128';
  } catch (e) {
    return null;
  }
}
function reliabilityOf(s) {
  s = (s || '').toLowerCase();
  if (/acled|isw|bellingcat|kivu|reuters|afp|crisis|hrw|amnesty|\bonu\b|\bun\b|imb|janes/.test(s)) return 'Élevée';
  if (/rfi|guardian|\bbbc\b|france 24|le monde|trt|jazeera|figaro|ap\b/.test(s)) return 'Établie';
  return 'À recouper';
}
function VBlock({
  v
}) {
  if (Array.isArray(v) && v.length) return /*#__PURE__*/React.createElement("ul", {
    className: "vreport__ul"
  }, v.map((x, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, x)));
  return /*#__PURE__*/React.createElement("p", null, Array.isArray(v) ? v.join(' ') : v);
}
function useVeille() {
  const [items, setItems] = useState(VEILLE_SEED);
  useEffect(() => {
    let on = true;
    fetch(VEILLE_REMOTE, {
      cache: 'no-store'
    }).then(r => r.ok ? r.json() : Promise.reject()).then(d => {
      const a = Array.isArray(d) ? d : d.items || [];
      if (on && a.length) setItems(a.slice().sort((x, y) => String(y.date).localeCompare(String(x.date))));
    }).catch(() => {});
    return () => {
      on = false;
    };
  }, []);
  return items;
}
function useSubscriber() {
  // Connecte = acces complet aux notes d'analyse. La detection s'aligne sur
  // site-auth.js : etat initial (window.algorAuthState) + evenement de session
  // (« algorAuthStateChanged », emis sur toutes les pages, accueil compris) +
  // filet via le client Supabase. L'ancienne version n'ecoutait que
  // « algorAuthReady » (jamais emis sur l'accueil public) → cadenas a tort.
  const [sub, setSub] = useState(() => !!(window.algorAuthState && window.algorAuthState.loggedIn));
  useEffect(() => {
    let on = true;
    const apply = v => {
      if (on) setSub(!!v);
    };
    if (window.algorAuthState) apply(window.algorAuthState.loggedIn);
    const onState = e => apply(e && e.detail && e.detail.loggedIn);
    window.addEventListener('algorAuthStateChanged', onState);
    const probe = () => {
      try {
        const a = window.algorAuth;
        if (a && a.supabase && a.supabase.auth) {
          a.supabase.auth.getSession().then(({
            data
          }) => apply(!!(data && data.session))).catch(() => {});
        }
      } catch (e) {}
    };
    probe();
    window.addEventListener('algorAuthReady', probe);
    return () => {
      on = false;
      window.removeEventListener('algorAuthStateChanged', onState);
      window.removeEventListener('algorAuthReady', probe);
    };
  }, []);
  return sub;
}
function VeilleCard({
  it,
  onOpen
}) {
  const sev = SEV[it.severite] || SEV.info;
  return /*#__PURE__*/React.createElement("article", {
    className: "vcard",
    onClick: onOpen,
    tabIndex: "0",
    onKeyDown: e => {
      if (e.key === 'Enter') onOpen();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "vcard__media",
    "data-zone": it.theatre
  }, it.image ? /*#__PURE__*/React.createElement("img", {
    className: "vcard__img",
    src: it.image,
    alt: "",
    loading: "lazy",
    onError: e => {
      e.target.style.display = 'none';
    }
  }) : null, /*#__PURE__*/React.createElement("span", {
    className: "vcard__grid",
    "aria-hidden": "true"
  }), srcLogo(it.source_url) ? /*#__PURE__*/React.createElement("img", {
    className: "vcard__logo",
    src: srcLogo(it.source_url),
    alt: it.source,
    loading: "lazy",
    onError: e => {
      e.target.style.display = 'none';
    }
  }) : null, /*#__PURE__*/React.createElement("span", {
    className: "vcard__src"
  }, it.source), /*#__PURE__*/React.createElement("span", {
    className: "vcard__sev",
    style: {
      color: sev.c,
      borderColor: sev.c + '59',
      background: sev.c + '14'
    }
  }, sev.lbl)), /*#__PURE__*/React.createElement("div", {
    className: "vcard__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vcard__meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "vcard__zone"
  }, veilleZone(it.theatre)), /*#__PURE__*/React.createElement("span", {
    className: "vcard__date"
  }, veilleDateFR(it.date))), /*#__PURE__*/React.createElement("h3", {
    className: "vcard__title"
  }, it.titre), /*#__PURE__*/React.createElement("p", {
    className: "vcard__resume"
  }, it.resume), /*#__PURE__*/React.createElement("span", {
    className: "vcard__more"
  }, "Lire ", /*#__PURE__*/React.createElement(Arrow, null))));
}
function VeilleRow({
  it,
  onOpen
}) {
  const sev = SEV[it.severite] || SEV.info;
  return /*#__PURE__*/React.createElement("button", {
    className: "vrow",
    onClick: onOpen
  }, /*#__PURE__*/React.createElement("span", {
    className: "vrow__dot",
    style: {
      background: sev.c
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "vrow__body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "vrow__meta"
  }, veilleZone(it.theatre), " \xB7 ", veilleDateFR(it.date), " \xB7 ", it.source), /*#__PURE__*/React.createElement("span", {
    className: "vrow__t"
  }, it.titre)));
}
function VeilleModal({
  it,
  sub,
  onClose
}) {
  const sev = SEV[it.severite] || SEV.info;
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    className: "vmodal-scrim",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "vmodal",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("button", {
    className: "vmodal__x",
    onClick: onClose,
    "aria-label": "Fermer"
  }, "\u2715"), /*#__PURE__*/React.createElement("div", {
    className: "vmodal__media",
    "data-zone": it.theatre
  }, it.image ? /*#__PURE__*/React.createElement("img", {
    src: it.image,
    alt: "",
    onError: e => {
      e.target.style.display = 'none';
    }
  }) : null, /*#__PURE__*/React.createElement("span", {
    className: "vcard__grid",
    "aria-hidden": "true"
  }), srcLogo(it.source_url) ? /*#__PURE__*/React.createElement("img", {
    className: "vcard__logo",
    src: srcLogo(it.source_url),
    alt: it.source,
    onError: e => {
      e.target.style.display = 'none';
    }
  }) : null, /*#__PURE__*/React.createElement("span", {
    className: "vcard__src"
  }, it.source)), /*#__PURE__*/React.createElement("div", {
    className: "vmodal__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vcard__meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "vcard__zone"
  }, veilleZone(it.theatre)), /*#__PURE__*/React.createElement("span", {
    className: "vcard__date"
  }, veilleDateFR(it.date)), /*#__PURE__*/React.createElement("span", {
    className: "vcard__sev",
    style: {
      color: sev.c,
      borderColor: sev.c + '59',
      background: sev.c + '14'
    }
  }, sev.lbl)), /*#__PURE__*/React.createElement("h3", {
    className: "vmodal__title"
  }, it.titre), /*#__PURE__*/React.createElement("p", {
    className: "vmodal__resume"
  }, it.resume), sub ? /*#__PURE__*/React.createElement("div", {
    className: "vreport"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vreport__class"
  }, "Note d'analyse \xB7 Acc\xE8s abonn\xE9"), /*#__PURE__*/React.createElement("div", {
    className: "vreport__sec"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vreport__lbl"
  }, "Analyse"), /*#__PURE__*/React.createElement("p", null, it.detail || it.resume)), it.implications && (Array.isArray(it.implications) ? it.implications.length : it.implications) ? /*#__PURE__*/React.createElement("div", {
    className: "vreport__sec"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vreport__lbl"
  }, "Implications op\xE9rationnelles"), /*#__PURE__*/React.createElement(VBlock, {
    v: it.implications
  })) : null, /*#__PURE__*/React.createElement("div", {
    className: "vreport__sec vreport__reco"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vreport__lbl"
  }, "Recommandations \xB7 que faire de cette information"), it.recommandations && (Array.isArray(it.recommandations) ? it.recommandations.length : it.recommandations) ? /*#__PURE__*/React.createElement(VBlock, {
    v: it.recommandations
  }) : /*#__PURE__*/React.createElement("p", {
    className: "vreport__muted"
  }, "\xC0 partir de ce signal, nos analystes produisent sur demande une note d'impact d\xE9di\xE9e \xE0 votre organisation : exposition, sc\xE9narios probables et mesures \xE0 prendre.")), /*#__PURE__*/React.createElement("div", {
    className: "vreport__sec"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vreport__lbl"
  }, "Sources et fiabilit\xE9"), /*#__PURE__*/React.createElement("div", {
    className: "vreport__srcrow"
  }, it.source_url ? /*#__PURE__*/React.createElement("a", {
    className: "vmodal__srclink",
    href: it.source_url,
    target: "_blank",
    rel: "noopener"
  }, it.source, " \u2197") : /*#__PURE__*/React.createElement("span", {
    className: "vreport__srcname"
  }, it.source), /*#__PURE__*/React.createElement("span", {
    className: "vreport__rel"
  }, "Fiabilit\xE9 \xB7 ", reliabilityOf(it.source)))), /*#__PURE__*/React.createElement("a", {
    className: "vreport__cta",
    href: "/contact/"
  }, "Demander un brief approfondi sur ce sujet", /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14M13 6l6 6-6 6"
  }))), /*#__PURE__*/React.createElement("a", {
    className: "vreport__map",
    href: '/veille-carte/?focus=' + encodeURIComponent(it.id)
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 20l-6 2V6l6-2 6 2 6-2v16l-6 2-6-2z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 4v16M15 6v16"
  })), "Voir ce signal sur la carte de veille")) : /*#__PURE__*/React.createElement("div", {
    className: "vmodal__gate"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#6B3FA0",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "11",
    width: "18",
    height: "11",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 11V7a5 5 0 0 1 10 0v4"
  })), /*#__PURE__*/React.createElement("div", {
    className: "vmodal__gate-t"
  }, "Note d'analyse r\xE9serv\xE9e aux abonn\xE9s"), /*#__PURE__*/React.createElement("div", {
    className: "vmodal__gate-s"
  }, "Chaque signal est livr\xE9 sous forme de note exploitable. L'abonnement ouvre l'acc\xE8s complet :"), /*#__PURE__*/React.createElement("ul", {
    className: "vgate__list"
  }, /*#__PURE__*/React.createElement("li", null, "Analyse d\xE9taill\xE9e et mise en contexte"), /*#__PURE__*/React.createElement("li", null, "Implications op\xE9rationnelles pour votre organisation"), /*#__PURE__*/React.createElement("li", null, "Recommandations actionnables"), /*#__PURE__*/React.createElement("li", null, "Sources v\xE9rifiables et niveau de fiabilit\xE9")), /*#__PURE__*/React.createElement("a", {
    className: "btn btn--primary",
    href: "/offres/"
  }, "Voir les offres")))));
}
function VeilleSystem() {
  const items = useVeille();
  const sub = useSubscriber();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(null);
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem('algor-veille-seen') || '';
    } catch (e) {
      return '';
    }
  });
  const latest = items.reduce((m, it) => it.date > m ? it.date : m, '');
  const unread = items.filter(it => (it.date || '') > seen).length;
  useEffect(() => {
    if (open) {
      try {
        localStorage.setItem('algor-veille-seen', latest);
      } catch (e) {}
      setSeen(latest);
    }
  }, [open, latest]);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("section", {
    className: "home-sec veille-sec",
    id: "veille"
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-sec__wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "veille-sec__head"
  }, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: "Veille \xB7 mise \xE0 jour hebdomadaire",
    title: "Ce que notre veille a",
    em: "capt\xE9 cette semaine",
    intro: "Flux OSINT consolid\xE9 en continu sur nos six th\xE9\xE2tres. S\xE9lection sourc\xE9e et dat\xE9e. L'analyse compl\xE8te et l'archive sont r\xE9serv\xE9es aux abonn\xE9s."
  }), /*#__PURE__*/React.createElement("span", {
    className: "veille-live"
  }, /*#__PURE__*/React.createElement("span", {
    className: "veille-live__dot"
  }), "Veille active")), /*#__PURE__*/React.createElement("div", {
    className: "veille-grid"
  }, items.slice(0, 6).map(it => /*#__PURE__*/React.createElement(VeilleCard, {
    key: it.id,
    it: it,
    onOpen: () => setSel(it)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "veille-sec__foot"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn--ghost-link",
    onClick: () => setOpen(true)
  }, "Tout le fil de veille ", /*#__PURE__*/React.createElement(ArrowDiag, null))))), ReactDOM.createPortal(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "veille-bell",
    "aria-label": "Fil de veille",
    onClick: () => setOpen(true)
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: "21",
    height: "21",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M13.7 21a2 2 0 0 1-3.4 0"
  })), unread > 0 && /*#__PURE__*/React.createElement("span", {
    className: "veille-bell__badge"
  }, unread)), /*#__PURE__*/React.createElement("div", {
    className: 'veille-panel-scrim' + (open ? ' is-open' : ''),
    onClick: () => setOpen(false)
  }), /*#__PURE__*/React.createElement("aside", {
    className: 'veille-panel' + (open ? ' is-open' : ''),
    "aria-hidden": !open
  }, /*#__PURE__*/React.createElement("div", {
    className: "veille-panel__head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "veille-panel__t"
  }, "Fil de veille"), /*#__PURE__*/React.createElement("div", {
    className: "veille-panel__s"
  }, "OSINT \xB7 six th\xE9\xE2tres")), /*#__PURE__*/React.createElement("button", {
    className: "veille-panel__x",
    onClick: () => setOpen(false),
    "aria-label": "Fermer"
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "veille-panel__list"
  }, items.map(it => /*#__PURE__*/React.createElement(VeilleRow, {
    key: it.id,
    it: it,
    onOpen: () => setSel(it)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "veille-panel__foot"
  }, "Veille aliment\xE9e en continu. Analyse compl\xE8te r\xE9serv\xE9e aux abonn\xE9s.")), sel && /*#__PURE__*/React.createElement(VeilleModal, {
    it: sel,
    sub: sub,
    onClose: () => setSel(null)
  })), document.body));
}
function HomeView({
  onEnter,
  onConsole,
  clock,
  videoStyle
}) {
  // Abonné connecté OU aperçu forcé (?apercu=1) → vue outil (pas la démo).
  const sub = useSubscriber() || /[?&]apercu=1/.test(window.location.search);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("main", {
    className: "view-enter view-enter-active"
  }, /*#__PURE__*/React.createElement("section", {
    className: "hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hero__copy"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "hero__title"
  }, "Anticiper les risques", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("em", null, "op\xE9rationnels")), /*#__PURE__*/React.createElement("p", {
    className: "hero__lede"
  }, "Th\xE9\xE2tres g\xE9opolitiques suivis en continu pour les directions s\xFBret\xE9, cabinets d'analyse et r\xE9dactions sp\xE9cialis\xE9es. Solution souveraine fran\xE7aise, vos donn\xE9es h\xE9berg\xE9es en Europe : chaque \xE9v\xE9nement sourc\xE9, dat\xE9 et auditable."), /*#__PURE__*/React.createElement("div", {
    className: "hero__cta-row"
  }, /*#__PURE__*/React.createElement("a", {
    className: "btn btn--primary btn--lg btn--neon",
    href: "/theatres/"
  }, /*#__PURE__*/React.createElement("span", {
    className: "btn-neon btn-neon--top",
    "aria-hidden": "true"
  }), "D\xE9couvrir les th\xE9\xE2tres", /*#__PURE__*/React.createElement(Arrow, null), /*#__PURE__*/React.createElement("span", {
    className: "btn-neon btn-neon--bottom",
    "aria-hidden": "true"
  })), /*#__PURE__*/React.createElement("a", {
    className: "btn--ghost-link",
    href: "/offres/"
  }, "Voir les offres", /*#__PURE__*/React.createElement(ArrowDiag, null))), /*#__PURE__*/React.createElement("div", {
    className: "hero__demo"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "21",
    y1: "21",
    x2: "16.65",
    y2: "16.65"
  })), sub ? /*#__PURE__*/React.createElement("span", null, "Indiquez ", /*#__PURE__*/React.createElement("strong", null, "un pays suivi"), " dans la barre sous le globe pour ouvrir sa carte de renseignement HUMINT : \xE9v\xE9nements, acteurs et dates, filtrables.") : /*#__PURE__*/React.createElement("span", null, "Essayez la d\xE9mo : indiquez ", /*#__PURE__*/React.createElement("strong", null, "n'importe quelle ville, r\xE9gion ou pays du monde"), " dans la barre de recherche, sous le globe.", /*#__PURE__*/React.createElement("em", {
    className: "hero__demo-warn"
  }, "Donn\xE9es fictives, \xE0 titre d'illustration du rendu de nos cartes.")))), /*#__PURE__*/React.createElement("div", {
    className: "hero__visual"
  }, /*#__PURE__*/React.createElement(Globe, null))), /*#__PURE__*/React.createElement(VeilleSystem, null), /*#__PURE__*/React.createElement(GetSection, null), /*#__PURE__*/React.createElement(DiffSection, null), /*#__PURE__*/React.createElement(AudienceSection, null), /*#__PURE__*/React.createElement(CompareSection, null)), /*#__PURE__*/React.createElement(SiteFooter, null));
}

// ─── Pied de page — sobre, dans la DA client (violet/blanc/Jakarta).
const FOOT_COLS = [{
  head: 'Plateforme',
  links: [['Théâtres', '/theatres/'], ['Offres', '/offres/'], ['Méthodologie', '/methodologie/'], ['La plateforme', '/plateforme/']]
}, {
  head: 'Théâtres suivis',
  links: [['Sahel', '/sahel/'], ['Moyen-Orient', '/moyen-orient/'], ['RDC', '/rdc/'], ['Afrique', '/afrique/']]
}, {
  head: 'Société',
  links: [['À propos', '/a-propos/'], ['Débunkage', '/debunkage/'], ['Contact', '/contact/']]
}];
function SiteFooter() {
  return /*#__PURE__*/React.createElement("footer", {
    className: "site-footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "site-footer__wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "site-footer__brand"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand__name"
  }, "ALGOR INT"), /*#__PURE__*/React.createElement("p", {
    className: "site-footer__tag"
  }, "Renseignement g\xE9opolitique. Six th\xE9\xE2tres \xE0 risque suivis en continu, chaque \xE9v\xE9nement sourc\xE9, dat\xE9 et auditable.")), /*#__PURE__*/React.createElement("nav", {
    className: "site-footer__cols",
    "aria-label": "Liens de pied de page"
  }, FOOT_COLS.map(c => /*#__PURE__*/React.createElement("div", {
    className: "site-footer__col",
    key: c.head
  }, /*#__PURE__*/React.createElement("div", {
    className: "site-footer__head"
  }, c.head), c.links.map(([label, href]) => /*#__PURE__*/React.createElement("a", {
    className: "site-footer__link",
    href: href,
    key: href
  }, label)))))), /*#__PURE__*/React.createElement("div", {
    className: "site-footer__bar"
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 Algor Int \xB7 Tous droits r\xE9serv\xE9s"), /*#__PURE__*/React.createElement("span", {
    className: "site-footer__legal"
  }, /*#__PURE__*/React.createElement("a", {
    href: "/mentions-legales/"
  }, "Mentions l\xE9gales"), /*#__PURE__*/React.createElement("a", {
    href: "/confidentialite/"
  }, "Confidentialit\xE9"), /*#__PURE__*/React.createElement("a", {
    href: "/contact/"
  }, "Contact"))));
}

// ─── Trust band : chiffres clés juste sous le hero
function TrustBand() {
  const items = [{
    value: '6',
    label: 'Théâtres suivis en continu'
  }, {
    value: '500+',
    label: 'Sources OSINT croisées'
  }, {
    value: 'Quotidien',
    label: 'Rythme de mise à jour'
  }, {
    value: '2005',
    label: "Année d'historique la plus ancienne"
  }];
  return /*#__PURE__*/React.createElement("section", {
    className: "trust-band"
  }, /*#__PURE__*/React.createElement("div", {
    className: "trust-band__wrap"
  }, items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    className: "trust-band__item",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "trust-band__value"
  }, it.value), /*#__PURE__*/React.createElement("div", {
    className: "trust-band__label"
  }, it.label)))));
}

// ─── Production récente : 3 notes les plus récentes (sans signature)
const PRODUCTION_ITEMS = [{
  zone: 'Sahel',
  zoneSlug: 'sahel',
  date: '14 mars 2026',
  tag: 'Synthèse',
  title: 'JNIM, pattern attaques Mali-Burkina'
}, {
  zone: 'Moyen-Orient',
  zoneSlug: 'moyen-orient',
  date: '12 mars 2026',
  tag: 'Synthèse',
  title: 'Reconfiguration des forces chiites en Syrie'
}, {
  zone: 'RDC',
  zoneSlug: 'rdc',
  date: '11 mars 2026',
  tag: 'Hebdo',
  title: 'M23 / FARDC, ligne de front Kivu'
}];
function ProductionSection() {
  return /*#__PURE__*/React.createElement("section", {
    className: "home-sec home-sec--alt"
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-sec__wrap"
  }, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: "Production r\xE9cente",
    title: "Trois derni\xE8res notes,",
    em: "sur les th\xE9\xE2tres actifs",
    intro: "Notes synth\xE9tiques produites en interne, dat\xE9es et sourc\xE9es. Mise \xE0 jour continue sur chacun des six th\xE9\xE2tres."
  }), /*#__PURE__*/React.createElement("div", {
    className: "prod-grid"
  }, PRODUCTION_ITEMS.map((p, i) => /*#__PURE__*/React.createElement("a", {
    className: "prod-card",
    key: i,
    href: `/${p.zoneSlug}/`
  }, /*#__PURE__*/React.createElement("div", {
    className: "prod-card__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "prod-card__zone"
  }, p.zone), /*#__PURE__*/React.createElement("span", {
    className: "prod-card__date"
  }, p.date)), /*#__PURE__*/React.createElement("h3", {
    className: "prod-card__title"
  }, p.title), /*#__PURE__*/React.createElement("div", {
    className: "prod-card__foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "prod-card__tag"
  }, p.tag), /*#__PURE__*/React.createElement("span", {
    className: "prod-card__arrow"
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
  })))))))));
}

// ─── Sections de presentation — structure marketing par sections (inspiration vigideep).

function SectionHead({
  eyebrow,
  title,
  em,
  intro
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "home-sec__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, eyebrow), /*#__PURE__*/React.createElement("h2", {
    className: "home-sec__title"
  }, title, " ", /*#__PURE__*/React.createElement("em", null, em)), intro && /*#__PURE__*/React.createElement("p", {
    className: "home-sec__intro"
  }, intro));
}

// Cadre visuel reserve — en attente des captures definitives.
function MediaFrame({
  label
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "media-frame",
    role: "img",
    "aria-label": label
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "4",
    width: "18",
    height: "16",
    rx: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "9.5",
    r: "1.6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 15l-5-5L5 21"
  })), /*#__PURE__*/React.createElement("span", {
    className: "media-frame__label"
  }, label));
}

// ── 1. Ce que vous obtenez — livrables concrets, ton commercial.
const HOME_GET = [{
  tag: "La carte",
  t: "Une carte de situation",
  d: "Chaque pays sur une carte interactive : incidents, acteurs et zones se lisent d'un coup d'oeil, là où il faudrait autrement compiler des dizaines d'articles.",
  img: "/shared/home/assets/get-carte.jpg?v=20260622c",
  vid: "/shared/home/assets/get-carte.mp4?v=20260622c",
  gif: "/shared/home/assets/get-carte.gif?v=20260622e",
  auto: true,
  alt: "Carte de situation Algor Access : incidents et acteurs géolocalisés, ici le Mali"
}, {
  tag: "L'analyse",
  t: "Une lecture analytique immédiate",
  d: "Pour chaque pays, la répartition des incidents par région, par type et par acteur, calculée automatiquement à partir des données collectées.",
  img: "/shared/home/assets/get-analyse.jpg?v=20260622c",
  vid: "/shared/home/assets/get-analyse.mp4?v=20260622c",
  gif: "/shared/home/assets/get-analyse.gif?v=20260622e",
  auto: true,
  alt: "Panneau d'analyse : répartition des incidents par région, type et acteur"
}, {
  tag: "L'accès",
  t: "Un accès continu",
  d: "Plutôt qu'un rapport figé, une plateforme mise à jour chaque semaine, consultable au moment où la décision se pose.",
  img: "/shared/home/assets/get-acces.jpg?v=20260622c",
  vid: "/shared/home/assets/get-acces.mp4?v=20260622c",
  gif: "/shared/home/assets/get-acces.gif?v=20260622e",
  auto: true,
  alt: "Plateforme Algor Access : couverture continue, ici la région des Grands Lacs"
}];
function GetSection() {
  // Les vidéos en lecture auto (data-auto) jouent quand elles entrent dans la vue
  // et se mettent en pause quand on sort — la compilation est visible sans survol.
  useEffect(() => {
    const vids = document.querySelectorAll('video[data-auto="1"]');
    if (!vids.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const v = e.target;
        if (e.isIntersecting) {
          v.playbackRate = 2.2;
          v.play().catch(() => {});
        } else v.pause();
      });
    }, {
      threshold: 0.25
    });
    vids.forEach(v => io.observe(v));
    return () => io.disconnect();
  }, []);
  return /*#__PURE__*/React.createElement("section", {
    className: "home-sec home-sec--alt",
    id: "offre"
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-sec__wrap"
  }, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: "Ce que vous obtenez",
    title: "De la donn\xE9e brute",
    em: "\xE0 la d\xE9cision",
    intro: "Trois outils pour lire une situation, en \xE9valuer la port\xE9e et y revenir quand la d\xE9cision se pose."
  }), /*#__PURE__*/React.createElement("div", {
    className: "get-grid"
  }, HOME_GET.map((g, i) => /*#__PURE__*/React.createElement("article", {
    className: "get-card get-card--solo",
    key: i,
    onMouseEnter: e => {
      if (g.auto) return;
      const v = e.currentTarget.querySelector('video');
      if (v) v.play().catch(() => {});
    },
    onMouseLeave: e => {
      if (g.auto) return;
      const v = e.currentTarget.querySelector('video');
      if (v) {
        v.pause();
        v.currentTime = 0;
      }
    },
    onClick: e => {
      if (g.auto) return;
      const v = e.currentTarget.querySelector('video');
      if (!v) return;
      if (v.paused) v.play().catch(() => {});else {
        v.pause();
        v.currentTime = 0;
      }
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "get-card__media"
  }, /*#__PURE__*/React.createElement("img", {
    className: "get-card__gif",
    src: g.gif,
    alt: g.alt,
    loading: "lazy",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "get-card__body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "get-card__tag"
  }, g.tag), /*#__PURE__*/React.createElement("h3", {
    className: "get-card__title"
  }, g.t), /*#__PURE__*/React.createElement("p", {
    className: "get-card__text"
  }, g.d)))))));
}

// ── 2. Notre difference — la vraie plus-value, sans repeter le hero.
const HOME_DIFF = [{
  icon: "terrain",
  t: "Une connaissance du terrain",
  d: "Chaque théâtre est suivi dans la durée par des analystes qui en connaissent le contexte, les acteurs et les dynamiques. Cette familiarité permet de hiérarchiser l'information et d'en restituer la portée réelle."
}, {
  icon: "rigueur",
  t: "La rigueur du renseignement",
  d: "Croisement des sources, datation et cotation de la fiabilité : chaque information est vérifiée avant d'être cartographiée."
}, {
  icon: "temps",
  t: "La lecture dans le temps",
  d: "Nos théâtres se relisent période par période. Au-delà de l'événement du jour, vous suivez la façon dont une situation s'installe et évolue."
}];
function PillarIcon({
  name
}) {
  const sw = 2.2;
  const gradId = `pillar-grad-${name}`;
  const grad = `url(#${gradId})`;
  const common = {
    viewBox: "0 0 64 64",
    fill: "none",
    stroke: grad,
    strokeWidth: sw,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };
  const defs = /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: gradId,
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#6B3FA0"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "48%",
    stopColor: "#5650C6"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#2E84D4"
  })));
  if (name === "terrain") {
    return /*#__PURE__*/React.createElement("svg", common, defs, /*#__PURE__*/React.createElement("circle", {
      cx: "32",
      cy: "32",
      r: "27"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "32",
      cy: "18",
      r: "3.2",
      fill: grad,
      stroke: "none"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M27 23 C 26 28 26 34 27 38 L 37 38 C 38 34 38 28 37 23 Q 32 20 27 23 Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M32 38 L 32 50"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M32 46 Q 23 46 19 41 Q 25 40 32 43"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M32 46 Q 41 46 45 41 Q 39 40 32 43"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M32 49 Q 26 52 22 50 Q 26 47 31 48.5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M32 49 Q 38 52 42 50 Q 38 47 33 48.5"
    }));
  }
  if (name === "rigueur") {
    return /*#__PURE__*/React.createElement("svg", common, defs, /*#__PURE__*/React.createElement("circle", {
      cx: "32",
      cy: "32",
      r: "27"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M32 13 L 47 17 L 47 31 Q 47 43 32 51 Q 17 43 17 31 L 17 17 Z"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "32",
      y1: "33",
      x2: "32",
      y2: "22"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "32",
      y1: "33",
      x2: "22",
      y2: "27"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "32",
      y1: "33",
      x2: "42",
      y2: "27"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "32",
      y1: "33",
      x2: "24",
      y2: "41"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "32",
      y1: "33",
      x2: "40",
      y2: "41"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "32",
      cy: "22",
      r: "2.4",
      fill: grad,
      stroke: "none"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "22",
      cy: "27",
      r: "2.4",
      fill: grad,
      stroke: "none"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "42",
      cy: "27",
      r: "2.4",
      fill: grad,
      stroke: "none"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "24",
      cy: "41",
      r: "2.4",
      fill: grad,
      stroke: "none"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "40",
      cy: "41",
      r: "2.4",
      fill: grad,
      stroke: "none"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "32",
      cy: "33",
      r: "3",
      fill: grad,
      stroke: "none"
    }));
  }
  if (name === "temps") {
    return /*#__PURE__*/React.createElement("svg", common, defs, /*#__PURE__*/React.createElement("circle", {
      cx: "32",
      cy: "32",
      r: "27",
      strokeDasharray: "3 3.5"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "32",
      cy: "32",
      r: "17"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "32",
      y1: "18",
      x2: "32",
      y2: "22"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "46",
      y1: "32",
      x2: "42",
      y2: "32"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "32",
      y1: "46",
      x2: "32",
      y2: "42"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "18",
      y1: "32",
      x2: "22",
      y2: "32"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "40.5",
      y1: "20.5",
      x2: "38.7",
      y2: "23.5"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "43.5",
      y1: "40.5",
      x2: "40.5",
      y2: "38.7"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "23.5",
      y1: "43.5",
      x2: "25.3",
      y2: "40.5"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "20.5",
      y1: "23.5",
      x2: "23.5",
      y2: "25.3"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "32",
      y1: "32",
      x2: "26",
      y2: "27"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "32",
      y1: "32",
      x2: "39",
      y2: "24"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "32",
      cy: "32",
      r: "1.6",
      fill: grad,
      stroke: "none"
    }));
  }
  return null;
}
function DiffSection() {
  return /*#__PURE__*/React.createElement("section", {
    className: "home-sec",
    id: "difference"
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-sec__wrap"
  }, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: "Notre approche",
    title: "Notre approche du",
    em: "renseignement",
    intro: "Trois principes guident la fa\xE7on dont nous traitons et restituons l'information."
  }), /*#__PURE__*/React.createElement("div", {
    className: "pillar-list"
  }, HOME_DIFF.map((p, i) => /*#__PURE__*/React.createElement("article", {
    className: "pillar",
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    className: "pillar__num"
  }, String(i + 1).padStart(2, '0')), /*#__PURE__*/React.createElement("div", {
    className: "pillar__body"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "pillar__title"
  }, p.t), /*#__PURE__*/React.createElement("p", {
    className: "pillar__text"
  }, p.d)), /*#__PURE__*/React.createElement("span", {
    className: "pillar__icon"
  }, /*#__PURE__*/React.createElement(PillarIcon, {
    name: p.icon
  })))))));
}

// ── 3. Pour qui — segments clients.
const HOME_AUD = [{
  t: "Décideurs & directions",
  d: "Arbitrer rapidement sur un risque-pays, sans avoir à dépouiller la presse."
}, {
  t: "Sûreté & sécurité",
  d: "Évaluer la menace sur des sites, des trajets et des implantations."
}, {
  t: "Conseil & due diligence",
  d: "Étayer une recommandation avec des sources datées et sourcées."
}, {
  t: "Opérateurs sur zone",
  d: "ONG, industriels et logisticiens présents sur des théâtres sensibles."
}];
function AudienceSection() {
  return /*#__PURE__*/React.createElement("section", {
    className: "home-sec home-sec--alt",
    id: "pour-qui"
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-sec__wrap"
  }, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: "Pour qui",
    title: "\xC0 qui s'adresse",
    em: "Algor Access",
    intro: "Des profils diff\xE9rents, un m\xEAme besoin : une lecture fiable et dat\xE9e des th\xE9\xE2tres \xE0 risque."
  }), /*#__PURE__*/React.createElement("div", {
    className: "aud-grid"
  }, HOME_AUD.map((a, i) => /*#__PURE__*/React.createElement("article", {
    className: "aud-card",
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    className: "aud-card__rule"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "aud-card__title"
  }, a.t), /*#__PURE__*/React.createElement("p", {
    className: "aud-card__text"
  }, a.d))))));
}

// ── 4. Comparatif — retravaille : police plus large, lignes orientees plus-value.
const COMPARE_ROWS = [["Datation", "Variable, parfois absente", "Systématique, horodatée"], ["Connaissance du terrain", "Limitée aux canaux publics", "Suivi continu par des analystes dédiés"], ["Vérification", "Au cas par cas", "Croisement systématique avant publication"], ["Fiabilité", "Non évaluée", "Cotée, source par source"], ["Profondeur", "L'actualité du jour", "La situation rejouable dans le temps"], ["Lecture", "Du texte à compiler soi-même", "Une carte de situation immédiate"]];
function CompareSection() {
  return /*#__PURE__*/React.createElement("section", {
    className: "home-sec",
    id: "comparatif"
  }, /*#__PURE__*/React.createElement("div", {
    className: "home-sec__wrap"
  }, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: "Comparatif",
    title: "Le suivi d'actualit\xE9",
    em: "et la plateforme",
    intro: "Deux fa\xE7ons de suivre une zone : voici ce qui les distingue, crit\xE8re par crit\xE8re."
  }), /*#__PURE__*/React.createElement("div", {
    className: "cmp-table"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cmp-table__row cmp-table__row--head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cmp-table__cell"
  }, "Crit\xE8re"), /*#__PURE__*/React.createElement("div", {
    className: "cmp-table__cell"
  }, "Fil d'actualit\xE9 & presse"), /*#__PURE__*/React.createElement("div", {
    className: "cmp-table__cell cmp-table__cell--pos"
  }, "Algor Access")), COMPARE_ROWS.map(([c, neg, pos], i) => /*#__PURE__*/React.createElement("div", {
    className: "cmp-table__row",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "cmp-table__cell cmp-table__crit"
  }, c), /*#__PURE__*/React.createElement("div", {
    className: "cmp-table__cell cmp-table__neg"
  }, neg), /*#__PURE__*/React.createElement("div", {
    className: "cmp-table__cell cmp-table__cell--pos cmp-table__pos"
  }, pos))))));
}
const HOME_VIDEOS = [{
  cat: 'Veille',
  title: 'Cartographie OSINT en temps réel',
  meta: 'Plateforme · 2 min 14',
  duration: '2:14'
}, {
  cat: 'Influence',
  title: 'Analyse multicouche du théâtre sahélien',
  meta: 'Étude de cas · 3 min 02',
  duration: '3:02'
}, {
  cat: 'Protection',
  title: 'Évaluation de menaces sur les infrastructures',
  meta: 'Mission · 4 min 28',
  duration: '4:28'
}, {
  cat: 'Méthode',
  title: 'De la donnée brute au rapport décisionnel',
  meta: 'Coulisses · 2 min 47',
  duration: '2:47'
}, {
  cat: 'Terrain',
  title: 'Réseaux djihadistes au Sahel : pattern 2026',
  meta: 'Décryptage · 5 min 12',
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
  }, "Notre travail en images"), /*#__PURE__*/React.createElement("h2", {
    className: "video-band__title"
  }, "Capsules ", /*#__PURE__*/React.createElement("em", null, "vid\xE9os"), " \xB7 activit\xE9s Algor Int")), /*#__PURE__*/React.createElement("p", {
    className: "video-band__intro"
  }, "Cinq formats courts pour comprendre nos m\xE9thodes, nos terrains et nos livrables. Glissez horizontalement pour parcourir.")), /*#__PURE__*/React.createElement("div", {
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
  }, cat), /*#__PURE__*/React.createElement("h3", {
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
  }, "Bient\xF4t"));
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
  }, "\u2190 Retour \xE0 l'accueil"), /*#__PURE__*/React.createElement("h1", {
    className: "hero__title"
  }, "Console ", /*#__PURE__*/React.createElement("em", null, "interne")), /*#__PURE__*/React.createElement("p", {
    className: "hero__lede"
  }, "Outil de travail des analystes Algor Int sur six th\xE9\xE2tres : Moyen-Orient, Sahel, RDC, Madagascar, Afrique Maritime, Asie du Sud. Imagerie satellite, ACLED, GDELT, presse d'\xC9tat, OSINT social et flux Telegram sont agr\xE9g\xE9s sur une carte unique, sourc\xE9e, dat\xE9e et auditable \xE9v\xE9nement par \xE9v\xE9nement."), /*#__PURE__*/React.createElement("div", {
    className: "console-tabs"
  }, /*#__PURE__*/React.createElement(ConsoleTab, {
    href: "/admin/",
    label: "Carto",
    popTitle: "Cartographie OSINT",
    popText: "Edition des points, acteurs et calques sur les 6 th\xE9\xE2tres. Ouvre la console d'administration cartographique.",
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
    popText: "Tous les points cartographi\xE9s des 6 th\xE9\xE2tres, conserv\xE9s en base. Consultable sous forme de tableau, par th\xE9\xE2tre.",
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
    popText: "Agregateur d'articles OSINT : chargement, filtres, scoring et exports. Outil de veille interne.",
    icon: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "3"
    }))
  }), /*#__PURE__*/React.createElement(ConsoleTab, {
    href: "/cloud/",
    label: "Cloud",
    popTitle: "Cloud",
    popText: "Plateforme collaborative de l'\xE9quipe : base de sources, documents, suivi client, comptes rendus et synth\xE8ses, synchronises.",
    icon: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"
    }))
  }), /*#__PURE__*/React.createElement(ConsoleTab, {
    href: "/debunkage/carte-afrique.html",
    label: "Dossiers",
    popTitle: "Dossiers clients",
    popText: "Dossiers d'analyse reserves a l'equipe interne. Acces verrouille (compte editeur ou admin).",
    icon: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M9 13a3 3 0 1 1 6 0"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 13v3"
    }))
  }), /*#__PURE__*/React.createElement(ConsoleTab, {
    soon: true,
    label: "Rapport",
    popTitle: "Rapport",
    popText: "Generation de rapports d'analyse decisionnels. Bient\xF4t disponible.",
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
    popText: "Visualisation des r\xE9seaux et relations en graphes. Bient\xF4t disponible.",
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

// Page « Veille » — outil de veille OSINT (app Streamlit Algor Int) intégré en cadre.
const VEILLE_URL = 'https://carto-mo-d95ewgm9x6zzfugtcpdst8.streamlit.app/';
function VeilleView({
  onBack
}) {
  return ReactDOM.createPortal(/*#__PURE__*/React.createElement("div", {
    className: "veille-fs"
  }, /*#__PURE__*/React.createElement("iframe", {
    className: "veille-fs__iframe",
    src: VEILLE_URL + '?embed=true',
    title: "Outil de veille OSINT Algor Int"
  }), /*#__PURE__*/React.createElement("div", {
    className: "veille-fs__bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "veille-fs__btn",
    onClick: onBack
  }, "\u2190 Retour \xE0 la console"))), document.body);
}

// Page « Archives » — dashboard de tous les points, par théâtre (lecture base Supabase).
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

  // Esc ferme le détail
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
  }, "\u2190 Retour \xE0 la console"), /*#__PURE__*/React.createElement("h1", {
    className: "hero__title"
  }, "Archives ", /*#__PURE__*/React.createElement("em", null, "des points")), /*#__PURE__*/React.createElement("p", {
    className: "hero__lede"
  }, "Tous les points cartographi\xE9s, regroup\xE9s par th\xE9\xE2tre. Conserv\xE9s en base m\xEAme apr\xE8s retrait des cartes."), points && points.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "dash-search"
  }, /*#__PURE__*/React.createElement("div", {
    className: "search-input"
  }, /*#__PURE__*/React.createElement(DashSearchIcon, null), /*#__PURE__*/React.createElement("input", {
    placeholder: "Rechercher un point : nom, description, p\xE9riode, th\xE9\xE2tre...",
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
  }, "Aucun r\xE9sultat pour \xAB ", query, " \xBB."), points && zones.map(z => /*#__PURE__*/React.createElement("div", {
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
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Nom"), /*#__PURE__*/React.createElement("th", null, "P\xE9riode"), /*#__PURE__*/React.createElement("th", null, "Latitude"), /*#__PURE__*/React.createElement("th", null, "Longitude"), /*#__PURE__*/React.createElement("th", null, "Victimes"), /*#__PURE__*/React.createElement("th", null, "Statut"))), /*#__PURE__*/React.createElement("tbody", null, groups[z].map(p => {
    const c = Array.isArray(p.coordinates) ? p.coordinates : [];
    return /*#__PURE__*/React.createElement("tr", {
      key: p.id,
      className: "dash-row",
      tabIndex: 0,
      onClick: () => setSelected(p),
      onKeyDown: e => {
        if (e.key === 'Enter') setSelected(p);
      }
    }, /*#__PURE__*/React.createElement("td", null, p.name || '·'), /*#__PURE__*/React.createElement("td", null, p.period || '·'), /*#__PURE__*/React.createElement("td", null, c[1] != null ? Number(c[1]).toFixed(4) : '·'), /*#__PURE__*/React.createElement("td", null, c[0] != null ? Number(c[0]).toFixed(4) : '·'), /*#__PURE__*/React.createElement("td", null, p.casualties || 0), /*#__PURE__*/React.createElement("td", null, p.deleted ? /*#__PURE__*/React.createElement("span", {
      className: "dash-tag dash-tag--archived"
    }, "Archiv\xE9") : /*#__PURE__*/React.createElement("span", {
      className: "dash-tag dash-tag--live"
    }, "Actif")));
  }))))))), selected && /*#__PURE__*/React.createElement(PointDetail, {
    point: selected,
    onClose: () => setSelected(null)
  }));
}

// Parse le champ description structure (Date / Pays / Evenement / Detail),
// même logique que l'ancien pop-up des cartes (shared/engine.js parseDesc).
function parsePointDesc(raw) {
  if (!raw || raw === 'null') return null;
  const txt = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  const r = {};
  txt.split('\n').forEach(l => {
    const m = l.match(/^([^:]+):\s*(.+)$/);
    if (!m) return;
    const k = m[1].trim().toLowerCase();
    const v = m[2].trim();
    if (k === 'date') r.date = v;else if (k === 'pays') r.pays = v;else if (k === 'événement' || k === 'evenement') r.event = v;else if (k === 'détail' || k === 'detail') r.détail = v;
  });
  return Object.keys(r).length ? r : null;
}

// Popup détail d'un point — reprend le contenu de l'ancien pop-up des cartes.
function PointDetail({
  point,
  onClose
}) {
  const c = Array.isArray(point.coordinates) ? point.coordinates : [];
  const lng = c[0] != null ? Number(c[0]).toFixed(5) : '·';
  const lat = c[1] != null ? Number(c[1]).toFixed(5) : '·';
  const created = point.created_at ? new Date(point.created_at).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }) : '·';
  const d = parsePointDesc(point.description);
  const eventRows = [];
  if (d) {
    if (d.date) eventRows.push(['Date', d.date]);
    if (d.pays) eventRows.push(['Pays', d.pays]);
    if (d.event) eventRows.push(['Événement', d.event]);
    if (d.détail) eventRows.push(['Détail', d.détail]);
  }
  const metaRows = [['Théâtre', ZONE_LABELS[point.zone] || point.zone], ['Coordonnées', lat + ', ' + lng], ['Victimes', String(point.casualties || 0)], ['Statut', point.deleted ? 'Archivé (retiré des cartes)' : 'Actif'], ['Ajouté le', created]];
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
