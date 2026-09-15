(function () {
/* global React */
// Sections de l'accueil, refonte 09-2026 v4 (hero nuit + sections claires,
// mouvement GSAP/Lenis orchestre par motion.js via les attributs data-*).
// Toutes les images sont de vraies captures du produit : extraits Mapbox
// Static des theatres (theatres/assets), calques Sahel rendus depuis les
// donnees reelles du site (assets/calques), captures et videos du /carte/.

const {
  useEffect: useEffectSec,
  useRef: useRefSec
} = React;
function SecArrow() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3.5 8h9M9 4.5L12.5 8 9 11.5",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}

// ─── 1. THEATRES ─────────────────────────────────────────────────────────
// Metadonnees reelles : periodes = ZONE_CONFIG.PERIODS de chaque zone,
// calques = toggles de la barre laterale, reperes = epingles de /theatres/.
const THEATRES = [{
  id: 'moyen-orient',
  n: '01',
  name: 'Moyen-Orient',
  href: '/moyen-orient/',
  img: '/theatres/assets/carte-moyen-orient.png?v=20260910b',
  pays: 'Iraq · Syrie · Liban · Yémen',
  lat: 33.0,
  lon: 44.0,
  periode: '2005 → 2026',
  periodes: 10,
  calques: 3,
  calquesLbl: 'événements, zones de contrôle, Daesh',
  text: "Fronts confessionnels, influence iranienne, reconstruction syrienne, guerre du Yémen et tensions au Liban-Sud. L'historique couvre dix périodes, de 2005 à aujourd'hui.",
  pins: [[60.04, 18.48], [41.75, 17.69], [39.96, 16.18], [59.7, 83.82]]
}, {
  id: 'sahel',
  n: '02',
  name: 'Sahel',
  href: '/sahel/',
  img: '/theatres/assets/carte-sahel.png?v=20260910b',
  pays: 'Mali · Burkina Faso · Niger · Tchad · Mauritanie',
  lat: 16.0,
  lon: 0.0,
  periode: '12.2025 → 05.2026',
  periodes: 11,
  calques: 8,
  calquesLbl: 'ethnies, forces, population, mines, infrastructures, événements, HUMINT, flux',
  text: "Groupes affiliés à al-Qaïda et à l'État islamique, retrait des forces internationales, juntes militaires et corridors de trafic. Le théâtre le plus dense en calques.",
  pins: [[51.06, 46.35], [43.61, 44.44], [54.7, 38.03], [54.8, 54.16], [51.08, 54.83], [88.99, 61.97], [11.01, 39.42]]
}, {
  id: 'rdc',
  n: '03',
  name: 'RDC, Grands Lacs',
  href: '/rdc/',
  img: '/theatres/assets/carte-rdc.png?v=20260910b',
  pays: 'Nord-Kivu · Sud-Kivu · Ituri',
  lat: -2.0,
  lon: 29.0,
  periode: '01.2026 → 04.2026',
  periodes: 6,
  calques: 3,
  calquesLbl: 'événements, HUMINT, zones de contrôle',
  text: "L'Est congolais sous pression : offensive du M23, multiplication des groupes armés, implications régionales et économie minière de guerre. Mouvements M23, Wazalendo et FARDC suivis période par période.",
  pins: [[46.86, 60.43], [43.48, 71.77], [56.52, 16.21], [46.11, 83.79]]
}, {
  id: 'madagascar',
  n: '04',
  name: 'Madagascar',
  href: '/madagascar/',
  img: '/theatres/assets/carte-madagascar.png?v=20260910b',
  pays: 'Grand Sud · SAVA · Analamanga · canal du Mozambique',
  lat: -19.0,
  lon: 47.0,
  periode: '01.2026 → 04.2026',
  periodes: 8,
  calques: 9,
  calquesLbl: 'ethnies, forces, population, mines, infrastructures, événements, flux, parcs, zones maritimes',
  text: "Insécurité rurale dans le Grand Sud, trafics d'or, de bois précieux et de ressources halieutiques, enjeux stratégiques du canal du Mozambique.",
  pins: [[52.8, 44.58], [37.07, 73.06], [62.93, 16.0], [50.63, 84.0]]
}, {
  id: 'afrique',
  n: '05',
  name: 'Afrique maritime',
  href: '/afrique/',
  img: '/theatres/assets/carte-afrique-maritime.png?v=20260910b',
  pays: 'Suez · Bab-el-Mandeb · Ormuz · golfe de Guinée',
  lat: 12.0,
  lon: 43.0,
  periode: 'temps réel (AIS)',
  periodes: 0,
  calques: 27,
  calquesLbl: 'flux, ports, piraterie, hubs, présences navales, AIS temps réel',
  text: "Piraterie dans le golfe de Guinée, attaques en mer Rouge, sûreté des détroits et présence navale concurrente. Suivi AIS des navires en temps réel, six catégories filtrables.",
  pins: [[54.21, 20.14], [69.78, 59.53], [88.46, 28.25], [11.54, 79.86]]
}, {
  id: 'asie-sud',
  n: '06',
  name: 'Asie du Sud',
  href: '/asie-sud/',
  img: '/theatres/assets/carte-asie-sud.png?v=20260910b',
  pays: 'Kaboul · Islamabad · Quetta · Cachemire',
  lat: 30.0,
  lon: 74.0,
  periode: '01.2026 → 04.2026',
  periodes: 8,
  calques: 8,
  calquesLbl: 'ethnies, forces, population, mines, infrastructures, événements, flux, frontières',
  text: "Insurrection au Baloutchistan, mouvements djihadistes au Pakistan, situation afghane sous les Taliban et tensions indo-pakistanaises persistantes au Cachemire.",
  pins: [[34.32, 16.04], [69.85, 29.42], [14.65, 83.96], [85.35, 23.22]]
}];
function fmtLat(v) {
  const a = Math.abs(v);
  return a.toFixed(3).padStart(6, '0') + (v < 0 ? ' S' : ' N');
}
function fmtLon(v) {
  const a = Math.abs(v);
  return a.toFixed(3).padStart(7, '0') + (v < 0 ? ' O' : ' E');
}

// Instrument de metadonnees : ses valeurs sont pilotees par motion.js au defilement.
function Instrument() {
  return /*#__PURE__*/React.createElement("div", {
    className: "instr",
    "data-instr": true,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("div", {
    className: "instr__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "instr__k"
  }, "Lat"), /*#__PURE__*/React.createElement("span", {
    className: "instr__v",
    "data-instr-lat": true
  }, fmtLat(33))), /*#__PURE__*/React.createElement("div", {
    className: "instr__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "instr__k"
  }, "Lon"), /*#__PURE__*/React.createElement("span", {
    className: "instr__v",
    "data-instr-lon": true
  }, fmtLon(44))), /*#__PURE__*/React.createElement("div", {
    className: "instr__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "instr__k"
  }, "P\xE9riode"), /*#__PURE__*/React.createElement("span", {
    className: "instr__v",
    "data-instr-per": true
  }, "2005 \u2192 2026")), /*#__PURE__*/React.createElement("div", {
    className: "instr__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "instr__k"
  }, "Calques"), /*#__PURE__*/React.createElement("span", {
    className: "instr__v",
    "data-instr-cal": true
  }, "03")), /*#__PURE__*/React.createElement("div", {
    className: "instr__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "instr__k"
  }, "Th\xE9\xE2tre"), /*#__PURE__*/React.createElement("span", {
    className: "instr__v",
    "data-instr-th": true
  }, "01 / 06")));
}
function TheatresSection() {
  return /*#__PURE__*/React.createElement("section", {
    className: "th-sec",
    id: "theatres"
  }, /*#__PURE__*/React.createElement("div", {
    className: "th-sec__wrap"
  }, /*#__PURE__*/React.createElement("header", {
    className: "th-sec__head"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "v4-title",
    "data-split": true
  }, "Six th\xE9\xE2tres, une m\xEAme carte de situation"), /*#__PURE__*/React.createElement("p", {
    className: "v4-intro",
    "data-reveal": "up"
  }, "Chaque th\xE9\xE2tre est une carte interactive relue p\xE9riode par p\xE9riode. Les calques th\xE9matiques se superposent aux \xE9v\xE9nements dat\xE9s, sourc\xE9s et cot\xE9s. Les extraits ci-dessous sont tir\xE9s des cartes elles-m\xEAmes.")), /*#__PURE__*/React.createElement("div", {
    className: "th-list"
  }, /*#__PURE__*/React.createElement(Instrument, null), THEATRES.map((t, i) => /*#__PURE__*/React.createElement("article", {
    className: 'th-row' + (i % 2 ? ' th-row--flip' : ''),
    key: t.id,
    "data-th": true,
    "data-lat": t.lat,
    "data-lon": t.lon,
    "data-per": t.periode,
    "data-cal": String(t.calques).padStart(2, '0'),
    "data-n": t.n
  }, /*#__PURE__*/React.createElement("a", {
    className: "th-row__frame",
    href: t.href,
    "data-clip": true,
    "data-gl-hover": true,
    "aria-label": 'Ouvrir le théâtre ' + t.name
  }, /*#__PURE__*/React.createElement("img", {
    className: "th-row__img",
    src: t.img,
    alt: 'Extrait de carte du théâtre ' + t.name + ' : ' + t.pays,
    loading: i < 2 ? 'eager' : 'lazy',
    "data-parallax": "6"
  }), t.pins.map(([x, y], k) => /*#__PURE__*/React.createElement("span", {
    className: "gpin",
    style: {
      left: x + '%',
      top: y + '%'
    },
    key: k,
    "aria-hidden": "true"
  })), /*#__PURE__*/React.createElement("span", {
    className: "th-row__cap"
  }, /*#__PURE__*/React.createElement("span", null, t.pays), /*#__PURE__*/React.createElement("span", null, "Extrait de carte"))), /*#__PURE__*/React.createElement("div", {
    className: "th-row__body"
  }, /*#__PURE__*/React.createElement("p", {
    className: "th-row__meta",
    "data-reveal": "fade"
  }, /*#__PURE__*/React.createElement("span", null, "Th\xE9\xE2tre ", t.n), /*#__PURE__*/React.createElement("span", null, t.periode), /*#__PURE__*/React.createElement("span", null, t.periodes ? t.periodes + ' périodes' : 'flux continu'), /*#__PURE__*/React.createElement("span", null, t.calques, " calques")), /*#__PURE__*/React.createElement("h3", {
    className: "th-row__name",
    "data-split": true
  }, t.name), /*#__PURE__*/React.createElement("p", {
    className: "th-row__text",
    "data-reveal": "up"
  }, t.text), /*#__PURE__*/React.createElement("p", {
    className: "th-row__layers",
    "data-reveal": "up"
  }, "Calques : ", t.calquesLbl, "."), /*#__PURE__*/React.createElement("a", {
    className: "v4-link",
    href: t.href,
    "data-reveal": "up"
  }, "Ouvrir le th\xE9\xE2tre ", /*#__PURE__*/React.createElement(SecArrow, null))))))));
}

// ─── 2. METHODE ET SERVICES ──────────────────────────────────────────────
// Empilement de calques : base + 5 calques rendus depuis ethnies/forces/mines/
// flux/evenements.geojson du theatre Sahel (memes couleurs que la carte).
const CALQUES = [{
  id: 'base',
  k: '00',
  t: 'Fond de carte',
  d: 'Sahel central, du Sénégal au Tchad. Fond Mapbox, le même que sur la carte.'
}, {
  id: 'ethnies',
  k: '01',
  t: 'Ethnies',
  d: '25 aires ethnolinguistiques, du Wolof au Touareg, chacune reliée à ses sources.'
}, {
  id: 'forces',
  k: '02',
  t: 'Forces en présence',
  d: '16 bases, garnisons et QG : FAMA, Africa Corps, FAN, ANA, VDP, Dan Nan Ambassagou.'
}, {
  id: 'mines',
  k: '03',
  t: 'Mines',
  d: '68 sites miniers, actifs, artisanaux ou fermés : or, fer, uranium, lithium, phosphate.'
}, {
  id: 'flux',
  k: '04',
  t: 'Flux',
  d: '18 corridors : narcotrafic, trafic d\'armes, migration, contrebande d\'or.'
}, {
  id: 'evenements',
  k: '05',
  t: 'Événements',
  d: '17 événements sécuritaires datés, attribués et sourcés, chacun avec son bilan.'
}];
function LayerStack() {
  return /*#__PURE__*/React.createElement("div", {
    className: "stack",
    "data-stack": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "stack__col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stack__sticky"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stack__frame",
    "data-stack-frame": true
  }, /*#__PURE__*/React.createElement("img", {
    className: "stack__base",
    src: "/shared/home/assets/calques/sahel-base.jpg?v=20260914a",
    alt: "Extrait de carte du Sahel central, fond Mapbox"
  }), CALQUES.slice(1).map(c => /*#__PURE__*/React.createElement("img", {
    className: "stack__layer",
    key: c.id,
    "data-stack-layer": c.id,
    src: '/shared/home/assets/calques/sahel-' + c.id + '.png?v=20260914a',
    alt: 'Calque ' + c.t + ' du théâtre Sahel',
    loading: "lazy"
  })), /*#__PURE__*/React.createElement("div", {
    className: "stack__legend",
    "aria-hidden": "true"
  }, CALQUES.map(c => /*#__PURE__*/React.createElement("span", {
    className: "stack__chip",
    key: c.id,
    "data-stack-chip": c.id
  }, c.t))), /*#__PURE__*/React.createElement("span", {
    className: "stack__cap"
  }, /*#__PURE__*/React.createElement("span", null, "Sahel \xB7 calques r\xE9els de la carte"), /*#__PURE__*/React.createElement("span", null, "Rendu \xE0 partir des donn\xE9es du site"))))), /*#__PURE__*/React.createElement("ol", {
    className: "stack__steps"
  }, CALQUES.map(c => /*#__PURE__*/React.createElement("li", {
    className: "stack__step",
    key: c.id,
    "data-stack-step": c.id
  }, /*#__PURE__*/React.createElement("span", {
    className: "stack__k"
  }, c.k), /*#__PURE__*/React.createElement("h4", {
    className: "stack__t"
  }, c.t), /*#__PURE__*/React.createElement("p", {
    className: "stack__d"
  }, c.d)))));
}
const SERVICES = [{
  id: 'veille',
  t: 'Veille continue',
  span: 'wide',
  d: "Un flux OSINT consolidé sur les six théâtres, sélectionné, daté et sourcé. Chaque note est reliée à sa source et géolocalisée sur la carte de veille.",
  img: '/shared/home/assets/services-veille.jpg?v=20260914a',
  alt: 'Fil de veille Algor Access : notes datées, sourcées et localisées'
}, {
  id: 'analyse',
  t: 'Analyse par pays',
  span: 'narrow',
  d: "Pour chaque pays, la répartition des incidents par région, par typologie et par acteur, calculée sur les données collectées.",
  img: '/shared/home/assets/get-analyse.jpg?v=20260630a',
  vid: '/shared/home/assets/get-analyse.mp4?v=20260630a',
  alt: "Panneau d'analyse : répartition des incidents par région, type et acteur, ici le Burkina Faso"
}, {
  id: 'brief',
  t: 'Brief IA',
  span: 'narrow',
  d: "Une appréciation de situation générée à la demande sur les faits de la période : tendance dominante, acteurs, implications. Relue avant diffusion.",
  img: '/shared/home/assets/get-decision.jpg?v=20260630a',
  vid: '/shared/home/assets/get-decision.mp4?v=20260630a',
  alt: 'Appréciation de situation Algor Access : tendances, acteurs et implications, ici le Mali'
}, {
  id: 'carte',
  t: 'Carte de situation et export',
  span: 'wide',
  d: "Chaque événement est corroboré et relié à ses sources sur la carte, avec son statut. Le brief et la fiche s'exportent en HTML autonome, lisibles hors ligne et transmissibles.",
  img: '/shared/home/assets/get-carte.jpg?v=20260630a',
  vid: '/shared/home/assets/get-carte.mp4?v=20260630a',
  alt: 'Carte de situation Algor Access : événement corroboré et ses sources, ici le Bénin'
}];
function MethodeSection() {
  useEffectSec(() => {
    const vids = document.querySelectorAll('.svc__media video');
    if (!vids.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const v = e.target;
        if (e.isIntersecting) {
          if (v.preload === 'none') v.preload = 'metadata';
          v.playbackRate = 1.6;
          v.play().catch(() => {});
        } else v.pause();
      });
    }, {
      threshold: 0.4
    });
    vids.forEach(v => io.observe(v));
    return () => io.disconnect();
  }, []);
  return /*#__PURE__*/React.createElement("section", {
    className: "me-sec",
    id: "methode"
  }, /*#__PURE__*/React.createElement("div", {
    className: "me-sec__wrap"
  }, /*#__PURE__*/React.createElement("header", {
    className: "me-sec__head"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "v4-title",
    "data-split": true
  }, "Une cha\xEEne de traitement, de la collecte \xE0 l'export"), /*#__PURE__*/React.createElement("p", {
    className: "v4-intro",
    "data-reveal": "up"
  }, "Veille, cartographie par calques, analyse, brief et rapport suivent le m\xEAme fil : un fait est collect\xE9, dat\xE9, crois\xE9, cot\xE9, puis restitu\xE9. Ci-dessous, les calques du Sahel se superposent comme sur la carte.")), /*#__PURE__*/React.createElement(LayerStack, null), /*#__PURE__*/React.createElement("div", {
    className: "svc-grid"
  }, SERVICES.map(s => /*#__PURE__*/React.createElement("article", {
    className: 'svc svc--' + s.span,
    key: s.id
  }, /*#__PURE__*/React.createElement("div", {
    className: "svc__media",
    "data-clip": true
  }, s.vid ? /*#__PURE__*/React.createElement("video", {
    poster: s.img,
    muted: true,
    loop: true,
    playsInline: true,
    preload: "none",
    "aria-label": s.alt,
    "data-parallax": "4"
  }, /*#__PURE__*/React.createElement("source", {
    src: s.vid,
    type: "video/mp4"
  })) : /*#__PURE__*/React.createElement("img", {
    src: s.img,
    alt: s.alt,
    loading: "lazy",
    "data-parallax": "4"
  })), /*#__PURE__*/React.createElement("div", {
    className: "svc__body"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "svc__t",
    "data-reveal": "up"
  }, s.t), /*#__PURE__*/React.createElement("p", {
    className: "svc__d",
    "data-reveal": "up"
  }, s.d)))))));
}

// ─── 3. A PROPOS (court) ─────────────────────────────────────────────────
function AboutSection() {
  return /*#__PURE__*/React.createElement("section", {
    className: "ab-sec",
    id: "a-propos"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ab-sec__wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ab-sec__col"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "v4-title v4-title--sm",
    "data-split": true
  }, "Algor Access")), /*#__PURE__*/React.createElement("div", {
    className: "ab-sec__col"
  }, /*#__PURE__*/React.createElement("p", {
    className: "ab-sec__text",
    "data-reveal": "up"
  }, "Algor Access est la plateforme de cartographie d'Algor Int, structure ind\xE9pendante d'analyse g\xE9opolitique. Elle applique les m\xE9thodes du renseignement \xE0 des sources ouvertes et en restitue le r\xE9sultat sous une forme lisible : une carte, une chronologie, un brief. Les th\xE9\xE2tres sont suivis dans la dur\xE9e par des analystes qui en connaissent le contexte et les acteurs."), /*#__PURE__*/React.createElement("a", {
    className: "v4-link",
    href: "/a-propos/",
    "data-reveal": "up"
  }, "En savoir plus sur Algor Int ", /*#__PURE__*/React.createElement(SecArrow, null)))));
}

// ─── 4. EXTRAIT DU TRAVAIL : fiche evenement reelle (Yatakala-Bosiye) ────
function ExtraitSection() {
  return /*#__PURE__*/React.createElement("section", {
    className: "ex-sec",
    id: "extrait"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ex-sec__wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ex-sec__col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ex-sec__copy"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "v4-title v4-title--sm",
    "data-split": true
  }, "Un extrait du travail, tel qu'il est publi\xE9"), /*#__PURE__*/React.createElement("p", {
    className: "v4-intro",
    "data-reveal": "up"
  }, "Plut\xF4t que des r\xE9f\xE9rences, un cas r\xE9el. Cette fiche suit un \xE9v\xE9nement du th\xE9\xE2tre Sahel \xE0 travers les six temps de la cha\xEEne : collecte, datation, sour\xE7age, croisement, cotation, restitution. Les sources sont publiques et cit\xE9es."), /*#__PURE__*/React.createElement("p", {
    className: "ex-sec__note",
    "data-reveal": "fade"
  }, "Cotation selon la grille OTAN : fiabilit\xE9 de la source de A \xE0 F, cr\xE9dibilit\xE9 de l'information de 1 \xE0 6."))), /*#__PURE__*/React.createElement("div", {
    className: "fiche ex-sec__fiche",
    "data-clip": true,
    "aria-label": "Fiche \xE9v\xE9nement : un incident r\xE9el traversant les six temps de la cha\xEEne"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fiche__head"
  }, /*#__PURE__*/React.createElement("span", null, "Fiche \xE9v\xE9nement \xB7 ", /*#__PURE__*/React.createElement("b", null, "Sahel"), " \xB7 Niger, Tillab\xE9ri"), /*#__PURE__*/React.createElement("span", {
    className: "cote-chip"
  }, "Cote B1")), /*#__PURE__*/React.createElement("div", {
    className: "fiche__map"
  }, /*#__PURE__*/React.createElement("img", {
    src: "/methodologie/assets/carte-yatakala.png?v=20260910b",
    alt: "Extrait de carte : Yatakala, commune du Goroual, r\xE9gion de Tillab\xE9ri, Niger",
    loading: "lazy",
    "data-parallax": "5"
  }), /*#__PURE__*/React.createElement("span", {
    className: "gpin gpin--center",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", {
    className: "fiche__map-cap"
  }, "Yatakala-Bosiye \xB7 14,79 N \xB7 0,38 E \xB7 18 janv. 2026")), /*#__PURE__*/React.createElement("div", {
    className: "fiche__rows"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fiche__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "fiche__n"
  }, "01"), /*#__PURE__*/React.createElement("span", {
    className: "fiche__k"
  }, "Collecte"), /*#__PURE__*/React.createElement("span", {
    className: "fiche__v"
  }, "Presse nig\xE9rienne le 20 janv., puis rapport d'enqu\xEAte de Human Rights Watch le 12 f\xE9vr.")), /*#__PURE__*/React.createElement("div", {
    className: "fiche__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "fiche__n"
  }, "02"), /*#__PURE__*/React.createElement("span", {
    className: "fiche__k"
  }, "Datation"), /*#__PURE__*/React.createElement("span", {
    className: "fiche__v"
  }, "\xC9v\xE9nement le ", /*#__PURE__*/React.createElement("b", null, "18 janvier 2026"), " \xB7 premi\xE8re collecte le 20 janvier. Les deux dates sont conserv\xE9es.")), /*#__PURE__*/React.createElement("div", {
    className: "fiche__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "fiche__n"
  }, "03"), /*#__PURE__*/React.createElement("span", {
    className: "fiche__k"
  }, "Sour\xE7age"), /*#__PURE__*/React.createElement("span", {
    className: "fiche__v"
  }, /*#__PURE__*/React.createElement("a", {
    href: "https://www.hrw.org/news/2026/02/12/niger-islamist-armed-group-massacres-villagers-in-west",
    target: "_blank",
    rel: "noopener"
  }, "hrw.org"), " \xB7 ", /*#__PURE__*/React.createElement("a", {
    href: "https://www.actuniger.com/societe/21694-insecurite-une-trentaine-de-civils-encore-massacres-a-yatakala-bosiye-dans-le-goroual-tillaberi.html",
    target: "_blank",
    rel: "noopener"
  }, "actuniger.com"), " \xB7 ", /*#__PURE__*/React.createElement("a", {
    href: "https://lesechosduniger.com/2026/01/20/tillaberi-31-civils-encore-massacres-dans-une-attaque-terroriste-a-yatakala-dans-le-goroual-zone-des-3-frontieres/",
    target: "_blank",
    rel: "noopener"
  }, "lesechosduniger.com"))), /*#__PURE__*/React.createElement("div", {
    className: "fiche__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "fiche__n"
  }, "04"), /*#__PURE__*/React.createElement("span", {
    className: "fiche__k"
  }, "Croisement"), /*#__PURE__*/React.createElement("span", {
    className: "fiche__v"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ok"
  }, "3 sources sur 3 concordantes"), " sur la date, le lieu, l'acteur (\xC9tat islamique au Sahel) et le bilan (31 tu\xE9s, 5 bless\xE9s).")), /*#__PURE__*/React.createElement("div", {
    className: "fiche__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "fiche__n"
  }, "05"), /*#__PURE__*/React.createElement("span", {
    className: "fiche__k"
  }, "Cotation"), /*#__PURE__*/React.createElement("span", {
    className: "fiche__v"
  }, "Source ", /*#__PURE__*/React.createElement("b", null, "B"), ", habituellement fiable \xB7 information ", /*#__PURE__*/React.createElement("b", null, "1"), ", confirm\xE9e par d'autres sources.")), /*#__PURE__*/React.createElement("div", {
    className: "fiche__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "fiche__n"
  }, "06"), /*#__PURE__*/React.createElement("span", {
    className: "fiche__k"
  }, "Restitution"), /*#__PURE__*/React.createElement("span", {
    className: "fiche__v"
  }, "Point int\xE9gr\xE9 \xE0 la carte Sahel, quinzaine du 16 au 31 janvier, fiche reli\xE9e aux trois sources."))), /*#__PURE__*/React.createElement("div", {
    className: "fiche__foot"
  }, "Exemple r\xE9el, sources publiques cit\xE9es \xB7 fond de carte Mapbox"))));
}

// ─── 5. CTA FINAL ────────────────────────────────────────────────────────
function FinalCta() {
  return /*#__PURE__*/React.createElement("section", {
    className: "cta-sec",
    id: "acces"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cta-sec__wrap"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "v4-title",
    "data-split": true
  }, "Demander un acc\xE8s aux th\xE9\xE2tres"), /*#__PURE__*/React.createElement("p", {
    className: "v4-intro cta-sec__intro",
    "data-reveal": "up"
  }, "L'inscription est libre. L'acc\xE8s aux six th\xE9\xE2tres, aux calques et aux briefs est ouvert sur validation, selon l'offre choisie."), /*#__PURE__*/React.createElement("div", {
    className: "cta-sec__row",
    "data-reveal": "up"
  }, /*#__PURE__*/React.createElement("a", {
    className: "btn btn--primary btn--lg cta-sec__btn",
    href: "/offres/"
  }, "Voir les offres ", /*#__PURE__*/React.createElement(SecArrow, null)), /*#__PURE__*/React.createElement("a", {
    className: "v4-link",
    href: "/contact/"
  }, "Nous \xE9crire ", /*#__PURE__*/React.createElement(SecArrow, null)))));
}

// ALGOR_THEATRES : lu par le globe du hero pour la fiche d'un theatre clique.
Object.assign(window, {
  TheatresSection,
  MethodeSection,
  AboutSection,
  ExtraitSection,
  FinalCta,
  ALGOR_THEATRES: THEATRES
});
})();
