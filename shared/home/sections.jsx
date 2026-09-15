/* global React */
// Sections de l'accueil, refonte 09-2026 v4 (hero nuit + sections claires,
// mouvement GSAP/Lenis orchestre par motion.js via les attributs data-*).
// Toutes les images sont de vraies captures du produit : extraits Mapbox
// Static des theatres (theatres/assets), calques Sahel rendus depuis les
// donnees reelles du site (assets/calques), captures et videos du /carte/.

const { useEffect: useEffectSec, useRef: useRefSec } = React;

function SecArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8h9M9 4.5L12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── 1. THEATRES ─────────────────────────────────────────────────────────
// Metadonnees reelles : periodes = ZONE_CONFIG.PERIODS de chaque zone,
// calques = toggles de la barre laterale, reperes = epingles de /theatres/.
const THEATRES = [
  { id: 'moyen-orient', n: '01', name: 'Moyen-Orient', href: '/moyen-orient/',
    img: '/theatres/assets/carte-moyen-orient.png?v=20260910b',
    pays: 'Iraq · Syrie · Liban · Yémen',
    lat: 33.0, lon: 44.0, periode: '2005 → 2026', periodes: 10, calques: 3,
    calquesLbl: 'événements, zones de contrôle, Daesh',
    text: "Fronts confessionnels, influence iranienne, reconstruction syrienne, guerre du Yémen et tensions au Liban-Sud. L'historique couvre dix périodes, de 2005 à aujourd'hui.",
    pins: [[60.04, 18.48], [41.75, 17.69], [39.96, 16.18], [59.7, 83.82]] },
  { id: 'sahel', n: '02', name: 'Sahel', href: '/sahel/',
    img: '/theatres/assets/carte-sahel.png?v=20260910b',
    pays: 'Mali · Burkina Faso · Niger · Tchad · Mauritanie',
    lat: 16.0, lon: 0.0, periode: '12.2025 → 05.2026', periodes: 11, calques: 8,
    calquesLbl: 'ethnies, forces, population, mines, infrastructures, événements, HUMINT, flux',
    text: "Groupes affiliés à al-Qaïda et à l'État islamique, retrait des forces internationales, juntes militaires et corridors de trafic. Le théâtre le plus dense en calques.",
    pins: [[51.06, 46.35], [43.61, 44.44], [54.7, 38.03], [54.8, 54.16], [51.08, 54.83], [88.99, 61.97], [11.01, 39.42]] },
  { id: 'rdc', n: '03', name: 'RDC, Grands Lacs', href: '/rdc/',
    img: '/theatres/assets/carte-rdc.png?v=20260910b',
    pays: 'Nord-Kivu · Sud-Kivu · Ituri',
    lat: -2.0, lon: 29.0, periode: '01.2026 → 04.2026', periodes: 6, calques: 3,
    calquesLbl: 'événements, HUMINT, zones de contrôle',
    text: "L'Est congolais sous pression : offensive du M23, multiplication des groupes armés, implications régionales et économie minière de guerre. Mouvements M23, Wazalendo et FARDC suivis période par période.",
    pins: [[46.86, 60.43], [43.48, 71.77], [56.52, 16.21], [46.11, 83.79]] },
  { id: 'madagascar', n: '04', name: 'Madagascar', href: '/madagascar/',
    img: '/theatres/assets/carte-madagascar.png?v=20260910b',
    pays: 'Grand Sud · SAVA · Analamanga · canal du Mozambique',
    lat: -19.0, lon: 47.0, periode: '01.2026 → 04.2026', periodes: 8, calques: 9,
    calquesLbl: 'ethnies, forces, population, mines, infrastructures, événements, flux, parcs, zones maritimes',
    text: "Insécurité rurale dans le Grand Sud, trafics d'or, de bois précieux et de ressources halieutiques, enjeux stratégiques du canal du Mozambique.",
    pins: [[52.8, 44.58], [37.07, 73.06], [62.93, 16.0], [50.63, 84.0]] },
  { id: 'afrique', n: '05', name: 'Afrique maritime', href: '/afrique/',
    img: '/theatres/assets/carte-afrique-maritime.png?v=20260910b',
    pays: 'Suez · Bab-el-Mandeb · Ormuz · golfe de Guinée',
    lat: 12.0, lon: 43.0, periode: 'temps réel (AIS)', periodes: 0, calques: 27,
    calquesLbl: 'flux, ports, piraterie, hubs, présences navales, AIS temps réel',
    text: "Piraterie dans le golfe de Guinée, attaques en mer Rouge, sûreté des détroits et présence navale concurrente. Suivi AIS des navires en temps réel, six catégories filtrables.",
    pins: [[54.21, 20.14], [69.78, 59.53], [88.46, 28.25], [11.54, 79.86]] },
  { id: 'asie-sud', n: '06', name: 'Asie du Sud', href: '/asie-sud/',
    img: '/theatres/assets/carte-asie-sud.png?v=20260910b',
    pays: 'Kaboul · Islamabad · Quetta · Cachemire',
    lat: 30.0, lon: 74.0, periode: '01.2026 → 04.2026', periodes: 8, calques: 8,
    calquesLbl: 'ethnies, forces, population, mines, infrastructures, événements, flux, frontières',
    text: "Insurrection au Baloutchistan, mouvements djihadistes au Pakistan, situation afghane sous les Taliban et tensions indo-pakistanaises persistantes au Cachemire.",
    pins: [[34.32, 16.04], [69.85, 29.42], [14.65, 83.96], [85.35, 23.22]] },
];

function fmtLat(v) { const a = Math.abs(v); return a.toFixed(3).padStart(6, '0') + (v < 0 ? ' S' : ' N'); }
function fmtLon(v) { const a = Math.abs(v); return a.toFixed(3).padStart(7, '0') + (v < 0 ? ' O' : ' E'); }

// Instrument de metadonnees : ses valeurs sont pilotees par motion.js au defilement.
function Instrument() {
  return (
    <div className="instr" data-instr aria-hidden="true">
      <div className="instr__row"><span className="instr__k">Lat</span><span className="instr__v" data-instr-lat>{fmtLat(33)}</span></div>
      <div className="instr__row"><span className="instr__k">Lon</span><span className="instr__v" data-instr-lon>{fmtLon(44)}</span></div>
      <div className="instr__row"><span className="instr__k">Période</span><span className="instr__v" data-instr-per>2005 → 2026</span></div>
      <div className="instr__row"><span className="instr__k">Calques</span><span className="instr__v" data-instr-cal>03</span></div>
      <div className="instr__row"><span className="instr__k">Théâtre</span><span className="instr__v" data-instr-th>01 / 06</span></div>
    </div>
  );
}

function TheatresSection() {
  return (
    <section className="th-sec" id="theatres">
      <div className="th-sec__wrap">
        <header className="th-sec__head">
          <h2 className="v4-title" data-split>Six théâtres, une même carte de situation</h2>
          <p className="v4-intro" data-reveal="up">
            Chaque théâtre est une carte interactive relue période par période. Les calques thématiques
            se superposent aux événements datés, sourcés et cotés. Les extraits ci-dessous sont tirés
            des cartes elles-mêmes.
          </p>
        </header>

        <div className="th-list">
          <Instrument />
          {THEATRES.map((t, i) => (
            <article className={'th-row' + (i % 2 ? ' th-row--flip' : '')} key={t.id}
                     data-th data-lat={t.lat} data-lon={t.lon} data-per={t.periode}
                     data-cal={String(t.calques).padStart(2, '0')} data-n={t.n}>
              <a className="th-row__frame" href={t.href} data-clip data-gl-hover aria-label={'Ouvrir le théâtre ' + t.name}>
                <img className="th-row__img" src={t.img} alt={'Extrait de carte du théâtre ' + t.name + ' : ' + t.pays} loading={i < 2 ? 'eager' : 'lazy'} data-parallax="6" />
                {t.pins.map(([x, y], k) => (
                  <span className="gpin" style={{ left: x + '%', top: y + '%' }} key={k} aria-hidden="true" />
                ))}
                <span className="th-row__cap"><span>{t.pays}</span><span>Extrait de carte</span></span>
              </a>
              <div className="th-row__body">
                <p className="th-row__meta" data-reveal="fade">
                  <span>Théâtre {t.n}</span>
                  <span>{t.periode}</span>
                  <span>{t.periodes ? t.periodes + ' périodes' : 'flux continu'}</span>
                  <span>{t.calques} calques</span>
                </p>
                <h3 className="th-row__name" data-split>{t.name}</h3>
                <p className="th-row__text" data-reveal="up">{t.text}</p>
                <p className="th-row__layers" data-reveal="up">Calques : {t.calquesLbl}.</p>
                <a className="v4-link" href={t.href} data-reveal="up">Ouvrir le théâtre <SecArrow /></a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 2. METHODE ET SERVICES ──────────────────────────────────────────────
// Empilement de calques : base + 5 calques rendus depuis ethnies/forces/mines/
// flux/evenements.geojson du theatre Sahel (memes couleurs que la carte).
const CALQUES = [
  { id: 'base', k: '00', t: 'Fond de carte', d: 'Sahel central, du Sénégal au Tchad. Fond Mapbox, le même que sur la carte.' },
  { id: 'ethnies', k: '01', t: 'Ethnies', d: '25 aires ethnolinguistiques, du Wolof au Touareg, chacune reliée à ses sources.' },
  { id: 'forces', k: '02', t: 'Forces en présence', d: '16 bases, garnisons et QG : FAMA, Africa Corps, FAN, ANA, VDP, Dan Nan Ambassagou.' },
  { id: 'mines', k: '03', t: 'Mines', d: '68 sites miniers, actifs, artisanaux ou fermés : or, fer, uranium, lithium, phosphate.' },
  { id: 'flux', k: '04', t: 'Flux', d: '18 corridors : narcotrafic, trafic d\'armes, migration, contrebande d\'or.' },
  { id: 'evenements', k: '05', t: 'Événements', d: '17 événements sécuritaires datés, attribués et sourcés, chacun avec son bilan.' },
];

function LayerStack() {
  return (
    <div className="stack" data-stack>
      <div className="stack__col">
      <div className="stack__sticky">
        <div className="stack__frame" data-stack-frame>
          <img className="stack__base" src="/shared/home/assets/calques/sahel-base.jpg?v=20260914a" alt="Extrait de carte du Sahel central, fond Mapbox" />
          {CALQUES.slice(1).map((c) => (
            <img className="stack__layer" key={c.id} data-stack-layer={c.id}
                 src={'/shared/home/assets/calques/sahel-' + c.id + '.png?v=20260914a'}
                 alt={'Calque ' + c.t + ' du théâtre Sahel'} loading="lazy" />
          ))}
          <div className="stack__legend" aria-hidden="true">
            {CALQUES.map((c) => (
              <span className="stack__chip" key={c.id} data-stack-chip={c.id}>{c.t}</span>
            ))}
          </div>
          <span className="stack__cap"><span>Sahel · calques réels de la carte</span><span>Rendu à partir des données du site</span></span>
        </div>
      </div>
      </div>
      <ol className="stack__steps">
        {CALQUES.map((c) => (
          <li className="stack__step" key={c.id} data-stack-step={c.id}>
            <span className="stack__k">{c.k}</span>
            <h4 className="stack__t">{c.t}</h4>
            <p className="stack__d">{c.d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

const SERVICES = [
  { id: 'veille', t: 'Veille continue', span: 'wide',
    d: "Un flux OSINT consolidé sur les six théâtres, sélectionné, daté et sourcé. Chaque note est reliée à sa source et géolocalisée sur la carte de veille.",
    img: '/shared/home/assets/services-veille.jpg?v=20260914a',
    alt: 'Fil de veille Algor Access : notes datées, sourcées et localisées' },
  { id: 'analyse', t: 'Analyse par pays', span: 'narrow',
    d: "Pour chaque pays, la répartition des incidents par région, par typologie et par acteur, calculée sur les données collectées.",
    img: '/shared/home/assets/get-analyse.jpg?v=20260630a', vid: '/shared/home/assets/get-analyse.mp4?v=20260630a',
    alt: "Panneau d'analyse : répartition des incidents par région, type et acteur, ici le Burkina Faso" },
  { id: 'brief', t: 'Brief IA', span: 'narrow',
    d: "Une appréciation de situation générée à la demande sur les faits de la période : tendance dominante, acteurs, implications. Relue avant diffusion.",
    img: '/shared/home/assets/get-decision.jpg?v=20260630a', vid: '/shared/home/assets/get-decision.mp4?v=20260630a',
    alt: 'Appréciation de situation Algor Access : tendances, acteurs et implications, ici le Mali' },
  { id: 'carte', t: 'Carte de situation et export', span: 'wide',
    d: "Chaque événement est corroboré et relié à ses sources sur la carte, avec son statut. Le brief et la fiche s'exportent en HTML autonome, lisibles hors ligne et transmissibles.",
    img: '/shared/home/assets/get-carte.jpg?v=20260630a', vid: '/shared/home/assets/get-carte.mp4?v=20260630a',
    alt: 'Carte de situation Algor Access : événement corroboré et ses sources, ici le Bénin' },
];

function MethodeSection() {
  useEffectSec(() => {
    const vids = document.querySelectorAll('.svc__media video');
    if (!vids.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) { if (v.preload === 'none') v.preload = 'metadata'; v.playbackRate = 1.6; v.play().catch(() => {}); }
        else v.pause();
      });
    }, { threshold: 0.4 });
    vids.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, []);
  return (
    <section className="me-sec" id="methode">
      <div className="me-sec__wrap">
        <header className="me-sec__head">
          <h2 className="v4-title" data-split>Une chaîne de traitement, de la collecte à l'export</h2>
          <p className="v4-intro" data-reveal="up">
            Veille, cartographie par calques, analyse, brief et rapport suivent le même fil : un fait est
            collecté, daté, croisé, coté, puis restitué. Ci-dessous, les calques du Sahel se superposent
            comme sur la carte.
          </p>
        </header>

        <LayerStack />

        <div className="svc-grid">
          {SERVICES.map((s) => (
            <article className={'svc svc--' + s.span} key={s.id}>
              <div className="svc__media" data-clip>
                {s.vid ? (
                  <video poster={s.img} muted loop playsInline preload="none" aria-label={s.alt} data-parallax="4">
                    <source src={s.vid} type="video/mp4" />
                  </video>
                ) : (
                  <img src={s.img} alt={s.alt} loading="lazy" data-parallax="4" />
                )}
              </div>
              <div className="svc__body">
                <h3 className="svc__t" data-reveal="up">{s.t}</h3>
                <p className="svc__d" data-reveal="up">{s.d}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 3. A PROPOS (court) ─────────────────────────────────────────────────
function AboutSection() {
  return (
    <section className="ab-sec" id="a-propos">
      <div className="ab-sec__wrap">
        <div className="ab-sec__col">
          <h2 className="v4-title v4-title--sm" data-split>Algor Access</h2>
        </div>
        <div className="ab-sec__col">
          <p className="ab-sec__text" data-reveal="up">
            Algor Access est la plateforme de cartographie d'Algor Int, structure indépendante d'analyse
            géopolitique. Elle applique les méthodes du renseignement à des sources ouvertes et en restitue
            le résultat sous une forme lisible : une carte, une chronologie, un brief. Les théâtres sont suivis
            dans la durée par des analystes qui en connaissent le contexte et les acteurs.
          </p>
          <a className="v4-link" href="/a-propos/" data-reveal="up">En savoir plus sur Algor Int <SecArrow /></a>
        </div>
      </div>
    </section>
  );
}

// ─── 4. EXTRAIT DU TRAVAIL : fiche evenement reelle (Yatakala-Bosiye) ────
function ExtraitSection() {
  return (
    <section className="ex-sec" id="extrait">
      <div className="ex-sec__wrap">
        <div className="ex-sec__col">
        <div className="ex-sec__copy">
          <h2 className="v4-title v4-title--sm" data-split>Un extrait du travail, tel qu'il est publié</h2>
          <p className="v4-intro" data-reveal="up">
            Plutôt que des références, un cas réel. Cette fiche suit un événement du théâtre Sahel à travers
            les six temps de la chaîne : collecte, datation, sourçage, croisement, cotation, restitution.
            Les sources sont publiques et citées.
          </p>
          <p className="ex-sec__note" data-reveal="fade">Cotation selon la grille OTAN : fiabilité de la source de A à F, crédibilité de l'information de 1 à 6.</p>
        </div>
        </div>
        <div className="fiche ex-sec__fiche" data-clip aria-label="Fiche événement : un incident réel traversant les six temps de la chaîne">
          <div className="fiche__head"><span>Fiche événement · <b>Sahel</b> · Niger, Tillabéri</span><span className="cote-chip">Cote B1</span></div>
          <div className="fiche__map">
            <img src="/methodologie/assets/carte-yatakala.png?v=20260910b" alt="Extrait de carte : Yatakala, commune du Goroual, région de Tillabéri, Niger" loading="lazy" data-parallax="5" />
            <span className="gpin gpin--center" aria-hidden="true" />
            <div className="fiche__map-cap">Yatakala-Bosiye · 14,79 N · 0,38 E · 18 janv. 2026</div>
          </div>
          <div className="fiche__rows">
            <div className="fiche__row"><span className="fiche__n">01</span><span className="fiche__k">Collecte</span><span className="fiche__v">Presse nigérienne le 20 janv., puis rapport d'enquête de Human Rights Watch le 12 févr.</span></div>
            <div className="fiche__row"><span className="fiche__n">02</span><span className="fiche__k">Datation</span><span className="fiche__v">Événement le <b>18 janvier 2026</b> · première collecte le 20 janvier. Les deux dates sont conservées.</span></div>
            <div className="fiche__row"><span className="fiche__n">03</span><span className="fiche__k">Sourçage</span><span className="fiche__v"><a href="https://www.hrw.org/news/2026/02/12/niger-islamist-armed-group-massacres-villagers-in-west" target="_blank" rel="noopener">hrw.org</a> · <a href="https://www.actuniger.com/societe/21694-insecurite-une-trentaine-de-civils-encore-massacres-a-yatakala-bosiye-dans-le-goroual-tillaberi.html" target="_blank" rel="noopener">actuniger.com</a> · <a href="https://lesechosduniger.com/2026/01/20/tillaberi-31-civils-encore-massacres-dans-une-attaque-terroriste-a-yatakala-dans-le-goroual-zone-des-3-frontieres/" target="_blank" rel="noopener">lesechosduniger.com</a></span></div>
            <div className="fiche__row"><span className="fiche__n">04</span><span className="fiche__k">Croisement</span><span className="fiche__v"><span className="ok">3 sources sur 3 concordantes</span> sur la date, le lieu, l'acteur (État islamique au Sahel) et le bilan (31 tués, 5 blessés).</span></div>
            <div className="fiche__row"><span className="fiche__n">05</span><span className="fiche__k">Cotation</span><span className="fiche__v">Source <b>B</b>, habituellement fiable · information <b>1</b>, confirmée par d'autres sources.</span></div>
            <div className="fiche__row"><span className="fiche__n">06</span><span className="fiche__k">Restitution</span><span className="fiche__v">Point intégré à la carte Sahel, quinzaine du 16 au 31 janvier, fiche reliée aux trois sources.</span></div>
          </div>
          <div className="fiche__foot">Exemple réel, sources publiques citées · fond de carte Mapbox</div>
        </div>
      </div>
    </section>
  );
}

// ─── 5. CTA FINAL ────────────────────────────────────────────────────────
function FinalCta() {
  return (
    <section className="cta-sec" id="acces">
      <div className="cta-sec__wrap">
        <h2 className="v4-title" data-split>Demander un accès aux théâtres</h2>
        <p className="v4-intro cta-sec__intro" data-reveal="up">
          L'inscription est libre. L'accès aux six théâtres, aux calques et aux briefs est ouvert
          sur validation, selon l'offre choisie.
        </p>
        <div className="cta-sec__row" data-reveal="up">
          <a className="btn btn--primary btn--lg cta-sec__btn" href="/offres/">Voir les offres <SecArrow /></a>
          <a className="v4-link" href="/contact/">Nous écrire <SecArrow /></a>
        </div>
      </div>
    </section>
  );
}

// ALGOR_THEATRES : lu par le globe du hero pour la fiche d'un theatre clique.
Object.assign(window, { TheatresSection, MethodeSection, AboutSection, ExtraitSection, FinalCta, ALGOR_THEATRES: THEATRES });
