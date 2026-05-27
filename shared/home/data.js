(function () {
/* global React */
// Donnees reelles des 6 théâtres Algor Int.
// id correspond au dossier (/{id}/index.html) sauf 'afrique' = AIS maritime.

const ZONES = [{
  id: 'sahel',
  code: 'SH',
  name: 'Sahel',
  countries: 'Mali · Burkina · Niger · Tchad · Mauritanie',
  events: 214,
  period: 'Jan-Mar 26',
  status: 'active',
  href: '/sahel/'
}, {
  id: 'moyen-orient',
  code: 'MO',
  name: 'Moyen-Orient',
  countries: 'Syrie · Irak · Liban · Iran',
  events: 178,
  period: '2005-2026',
  status: 'active',
  href: '/moyen-orient/'
}, {
  id: 'rdc',
  code: 'CD',
  name: 'RDC',
  countries: 'Kivu · Ituri · Tanganyika',
  events: 47,
  period: '2023-2026',
  status: 'active',
  href: '/rdc/'
}, {
  id: 'madagascar',
  code: 'MG',
  name: 'Madagascar',
  countries: 'Antananarivo · Toamasina · Mahajanga',
  events: 28,
  period: '2024-2026',
  status: 'active',
  href: '/madagascar/'
}, {
  id: 'asie-sud',
  code: 'AS',
  name: 'Asie du Sud',
  countries: 'Inde · Pakistan · Bangladesh · Sri Lanka',
  events: 64,
  period: '2023-2026',
  status: 'active',
  href: '/asie-sud/'
}, {
  id: 'afrique',
  code: 'AF',
  name: 'Afrique Maritime',
  countries: 'AIS temps reel · 2 360 navires',
  events: 2360,
  period: 'Temps reel',
  status: 'active',
  href: '/afrique/'
}];

// Rapports par zone, pointe vers /{id}/rapport.html quand il existe.
const REPORTS = {
  sahel: [{
    id: 'r-sh-rap',
    title: 'Rapport analytique Sahel · Q1 2026',
    date: '14 mars 2026',
    pages: 42,
    tag: 'Synthèse',
    href: '/sahel/rapport.html'
  }, {
    id: 'r-sh-01',
    title: 'JNIM, pattern attaques Mali-Burkina',
    date: '14 mars 2026',
    pages: 28,
    tag: 'Hebdo'
  }, {
    id: 'r-sh-02',
    title: 'Mines aurifères, flux et acteurs',
    date: '08 mars 2026',
    pages: 42,
    tag: 'Synthèse'
  }, {
    id: 'r-sh-03',
    title: 'Deplacements forces Q1 2026',
    date: '02 mars 2026',
    pages: 17,
    tag: 'Note'
  }],
  'moyen-orient': [{
    id: 'r-mo-rap',
    title: 'Rapport analytique Moyen-Orient',
    date: '12 mars 2026',
    pages: 56,
    tag: 'Synthèse',
    href: '/moyen-orient/rapport.html'
  }, {
    id: 'r-mo-01',
    title: 'Reconfiguration des forces chiites en Syrie',
    date: '12 mars 2026',
    pages: 36,
    tag: 'Synthèse'
  }, {
    id: 'r-mo-02',
    title: 'Ports du Golfe, capacité et trafic',
    date: '04 mars 2026',
    pages: 22,
    tag: 'Hebdo'
  }],
  rdc: [{
    id: 'r-cd-rap',
    title: 'Rapport analytique RDC',
    date: '11 mars 2026',
    pages: 34,
    tag: 'Synthèse',
    href: '/rdc/rapport.html'
  }, {
    id: 'r-cd-01',
    title: 'M23 / FARDC, ligne de front Kivu',
    date: '11 mars 2026',
    pages: 24,
    tag: 'Hebdo'
  }],
  madagascar: [{
    id: 'r-mg-01',
    title: 'Madagascar, sécurité côtière',
    date: '09 mars 2026',
    pages: 19,
    tag: 'Note'
  }],
  'asie-sud': [{
    id: 'r-as-01',
    title: 'Asie du Sud, tensions frontalières',
    date: '08 mars 2026',
    pages: 24,
    tag: 'Synthèse'
  }],
  afrique: [{
    id: 'r-af-01',
    title: 'Afrique maritime, couverture AIS',
    date: '15 mars 2026',
    pages: 54,
    tag: 'Reference'
  }]
};

// Graphs par zone
const GRAPHS = {
  sahel: [{
    id: 'g-sh-01',
    title: 'Frontière Mali-Guinée, densité d\'évts',
    type: 'Heatmap',
    scope: '90 jours'
  }, {
    id: 'g-sh-02',
    title: 'Frontière Côte d\'Ivoire-Mali, flux',
    type: 'Flow',
    scope: '90 jours'
  }, {
    id: 'g-sh-03',
    title: 'Casualties par acteur · Q1 2026',
    type: 'Histogramme',
    scope: 'Trimestre'
  }],
  'moyen-orient': [{
    id: 'g-mo-01',
    title: 'Trafic maritime Détroit d\'Ormuz',
    type: 'Timeline',
    scope: '12 mois'
  }, {
    id: 'g-mo-02',
    title: 'Acteurs chiites, graphe relations',
    type: 'Réseau',
    scope: 'Cumulé'
  }],
  rdc: [{
    id: 'g-cd-01',
    title: 'Densite M23 sur l\'axe Goma-Bunia',
    type: 'Heatmap',
    scope: '60 jours'
  }],
  madagascar: [{
    id: 'g-mg-01',
    title: 'Madagascar, densité portuaire',
    type: 'Choropleth',
    scope: 'Annuel'
  }],
  'asie-sud': [{
    id: 'g-as-01',
    title: 'Asie du Sud, corridors logistiques',
    type: 'Flow',
    scope: '12 mois'
  }],
  afrique: [{
    id: 'g-af-01',
    title: 'AIS temps reel · 6 catégories navires',
    type: 'Carte',
    scope: 'Live'
  }, {
    id: 'g-af-02',
    title: 'Ports, trafic comparé',
    type: 'Barres',
    scope: '24 mois'
  }]
};

// Themes transverses
const THEMES = [{
  id: 't-ports',
  name: 'Ports',
  desc: 'Capacités, trafic, gouvernance maritime',
  count: 47,
  color: '#2E6FB8'
}, {
  id: 't-mines',
  name: 'Mines',
  desc: 'Or, uranium, cobalt, terres rares',
  count: 34,
  color: '#C97E2A'
}, {
  id: 't-jnim',
  name: 'JNIM',
  desc: 'Groupe djihadiste transrégional',
  count: 86,
  color: '#B83A4A'
}, {
  id: 't-routes',
  name: 'Routes & flux',
  desc: 'Corridors logistiques, armes, drogues',
  count: 29,
  color: '#6B3FA0'
}, {
  id: 't-energie',
  name: 'Energie',
  desc: 'Pétrole, gaz, infrastructures critiques',
  count: 22,
  color: '#0F7A7A'
}, {
  id: 't-pop',
  name: 'Populations',
  desc: 'Ethnies, déplacements, réfugiés',
  count: 41,
  color: '#2F8A6B'
}];
const THEME_DETAIL = {
  't-jnim': [{
    id: 'jnim-1',
    title: 'Carte des attaques du JNIM (Sahel)',
    type: 'Carte',
    meta: '214 points',
    href: '/sahel/'
  }, {
    id: 'jnim-2',
    title: 'Rapport Sahel, JNIM pattern',
    type: 'Rapport',
    meta: '28 pages',
    href: '/sahel/rapport.html'
  }, {
    id: 'jnim-3',
    title: 'Graphs JNIM',
    type: 'Graph',
    meta: '4 vues'
  }],
  't-ports': [{
    id: 'p-1',
    title: 'Afrique maritime, couverture AIS',
    type: 'Carte',
    meta: '2 360 navires',
    href: '/afrique/'
  }, {
    id: 'p-2',
    title: 'Trafic comparé · 24 mois',
    type: 'Graph',
    meta: '12 ports'
  }],
  't-mines': [{
    id: 'm-1',
    title: 'Sahel, sites aurifères',
    type: 'Carte',
    meta: '78 sites',
    href: '/sahel/'
  }, {
    id: 'm-2',
    title: 'Flux et acteurs (Sahel)',
    type: 'Rapport',
    meta: '42 pages'
  }]
};
Object.assign(window, {
  ZONES,
  REPORTS,
  GRAPHS,
  THEMES,
  THEME_DETAIL
});
})();
