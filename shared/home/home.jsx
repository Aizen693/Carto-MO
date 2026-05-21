/* global React, ReactDOM */
// Page 1 — Accueil client Algor Access (plateforme OSINT)

const { useState, useEffect } = React;

const SB_URL = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co';
const SB_KEY = 'sb_publishable_xxnL12zd9o5N30y1-Oi-0Q_YGYKMjh2';
const ZONE_LABELS = {
  'moyen-orient': 'Moyen-Orient',
  'sahel': 'Sahel',
  'rdc': 'RDC',
  'madagascar': 'Madagascar',
  'afrique': 'Afrique Maritime',
  'asie-sud': 'Asie du Sud',
};

function HomeView({ onEnter, onConsole, clock, videoStyle }) {
  return (
    <main className="view-enter view-enter-active">
      <section className="hero">
        <div className="hero__copy">
          <h1 className="hero__title">
            Anticiper les<br />
            <em>risques operationnels</em>
          </h1>

          <p className="hero__lede">
            Six theatres geopolitiques suivis en continu — Moyen-Orient, Sahel, RDC, Madagascar, Afrique Maritime, Asie du Sud. Imagerie satellite, ACLED, GDELT, presse d'Etat, OSINT social et flux Telegram, agreges sur une carte unique : chaque evenement source, date et auditable.
          </p>

          <div className="hero__cta-row">
            <button className="btn btn--primary btn--lg btn--neon" onClick={onEnter}>
              <span className="btn-neon btn-neon--top" aria-hidden="true" />
              Acceder au catalogue
              <Arrow />
              <span className="btn-neon btn-neon--bottom" aria-hidden="true" />
            </button>
            <a className="btn--ghost-link" href="#console"
               onClick={(e) => { e.preventDefault(); onConsole(); }}>
              Console interne
              <ArrowDiag />
            </a>
          </div>

          <nav className="hero__foot-nav">
            <a href="/sahel/">Sahel</a>
            <a href="/moyen-orient/">Moyen-Orient</a>
            <a href="/rdc/">RDC</a>
            <a href="/afrique/">Afrique</a>
          </nav>
        </div>

        <div className="hero__visual">
          <Globe />
        </div>
      </section>

      <VideoBand style={videoStyle} />
    </main>
  );
}

const HOME_VIDEOS = [
  { cat: 'Veille',     title: 'Cartographie OSINT en temps reel',                meta: 'Plateforme · 2 min 14',    duration: '2:14' },
  { cat: 'Influence',  title: 'Analyse multicouche du theatre sahelien',         meta: 'Etude de cas · 3 min 02',  duration: '3:02' },
  { cat: 'Protection', title: 'Evaluation de menaces sur les infrastructures',   meta: 'Mission · 4 min 28',       duration: '4:28' },
  { cat: 'Methode',    title: 'De la donnee brute au rapport decisionnel',       meta: 'Coulisses · 2 min 47',     duration: '2:47' },
  { cat: 'Terrain',    title: 'Reseaux djihadistes au Sahel — pattern 2026',     meta: 'Decryptage · 5 min 12',    duration: '5:12' },
];

function VideoBand({ style = 'strip' }) {
  return (
    <section className={`video-band video-band--${style}`}>
      <div className="video-band__head">
        <div>
          <span className="eyebrow">— Notre travail en images</span>
          <h2 className="video-band__title">
            Capsules <em>videos</em> · activites Algor Int
          </h2>
        </div>
        <p className="video-band__intro">
          Cinq formats courts pour comprendre nos methodes, nos terrains et nos livrables. Glissez horizontalement pour parcourir.
        </p>
      </div>

      <div className="video-band__strip">
        {HOME_VIDEOS.map((v, i) => (
          <VideoCard key={i} {...v} index={i} variant={style} />
        ))}
      </div>
    </section>
  );
}

function VideoCard({ cat, title, meta, duration, index }) {
  return (
    <article className="video-card">
      <div className="video-card__thumb">
        <ThumbMosaic seed={index} />
        <div className="video-card__play">
          <div className="play-circle">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <path d="M5 3.5v11l10-5.5z" />
            </svg>
          </div>
        </div>
        <span className="video-card__duration">{duration}</span>
      </div>
      <div className="video-card__body">
        <div className="video-card__cat">— {cat}</div>
        <h3 className="video-card__title">{title}</h3>
        <p className="video-card__meta">{meta}</p>
      </div>
    </article>
  );
}

function ThumbMosaic({ seed = 0 }) {
  const cells = [];
  const cols = 14, rows = 10;
  const rng = mulberry(seed * 1337 + 7);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const o = 0.05 + rng() * 0.22;
      const size = 5.5 + rng() * 4.5;
      cells.push({ x: (c + 0.5) * (100 / cols), y: (r + 0.5) * (100 / rows), o, size });
    }
  }
  return (
    <svg viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice">
      {cells.map((c, i) => (
        <rect key={i}
          x={c.x - c.size / 2}
          y={c.y - c.size / 2}
          width={c.size} height={c.size}
          transform={`rotate(45 ${c.x} ${c.y})`}
          fill="#fff" opacity={c.o} />
      ))}
    </svg>
  );
}
function mulberry(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Arrow() {
  return (
    <svg className="btn__arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 8h9M9 4.5L12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ArrowDiag() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M4 10L10 4M5 4h5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Page « Console interne » — presentation de la plateforme interne, dans la D.A. client.
function ConsoleTab({ href, soon, onClick, icon, label, popTitle, popText }) {
  const inner = (
    <>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icon}
      </svg>
      {label}
      {soon && <span className="console-tab__badge">Bientot</span>}
    </>
  );
  return (
    <div className="console-tab-wrap">
      {soon
        ? <div className="console-tab console-tab--soon">{inner}</div>
        : onClick
          ? <a className="console-tab" href="#" onClick={(e) => { e.preventDefault(); onClick(); }}>{inner}</a>
          : <a className="console-tab" href={href}>{inner}</a>}
      <div className="console-tab-pop">
        <div className="console-tab-pop__card">
          <div className="console-tab-pop__title">{popTitle}</div>
          <p className="console-tab-pop__text">{popText}</p>
        </div>
      </div>
    </div>
  );
}

function ConsoleView({ onBack, onArchives, onVeille }) {
  return (
    <main className="view-enter view-enter-active">
      <section className="console-page">
        <a className="console-back" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
          &larr; Retour a l'accueil
        </a>
        <h1 className="hero__title">
          Console <em>interne</em>
        </h1>
        <p className="hero__lede">
          Outil de travail des analystes Algor Int sur six theatres — Moyen-Orient, Sahel, RDC, Madagascar, Afrique Maritime, Asie du Sud. Imagerie satellite, ACLED, GDELT, presse d'Etat, OSINT social et flux Telegram sont agreges sur une carte unique, sourcee, datee et auditable evenement par evenement.
        </p>

        <div className="console-tabs">
          <ConsoleTab
            href="/admin/"
            label="Carto"
            popTitle="Cartographie OSINT"
            popText="Edition des points, acteurs et calques sur les 6 theatres. Ouvre la console d'administration cartographique."
            icon={<><path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" /></>}
          />
          <ConsoleTab
            onClick={onArchives}
            label="Archives"
            popTitle="Archives"
            popText="Tous les points cartographies des 6 theatres, conserves en base. Consultable sous forme de tableau, par theatre."
            icon={<><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></>}
          />
          <ConsoleTab
            onClick={onVeille}
            label="Veille"
            popTitle="Veille"
            popText="Agregateur d'articles OSINT — chargement, filtres, scoring et exports. Outil de veille interne."
            icon={<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>}
          />
          <ConsoleTab
            soon
            label="Rapport"
            popTitle="Rapport"
            popText="Generation de rapports d'analyse decisionnels. Bientot disponible."
            icon={<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5" /><path d="M9 13h6M9 17h6" /></>}
          />
          <ConsoleTab
            soon
            label="Graph"
            popTitle="Graph"
            popText="Visualisation des reseaux et relations en graphes. Bientot disponible."
            icon={<><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M8.2 7.3l7.6 3.4M8.2 16.7l7.6-3.4" /></>}
          />
        </div>
      </section>
    </main>
  );
}

// Page « Veille » — outil de veille OSINT (app Streamlit Algor Int) integre en cadre.
const VEILLE_URL = 'https://carto-mo-d95ewgm9x6zzfugtcpdst8.streamlit.app/';

function VeilleView({ onBack }) {
  return ReactDOM.createPortal(
    <div className="veille-fs">
      <iframe
        className="veille-fs__iframe"
        src={VEILLE_URL + '?embed=true'}
        title="Outil de veille OSINT Algor Int"
      />
      <div className="veille-fs__bar">
        <button className="veille-fs__btn" onClick={onBack}>
          &larr; Retour a la console
        </button>
        <a className="veille-fs__btn veille-fs__btn--ghost" href={VEILLE_URL}
           target="_blank" rel="noopener noreferrer">
          Ouvrir dans un onglet ↗
        </a>
      </div>
    </div>,
    document.body
  );
}

// Page « Archives » — dashboard de tous les points, par theatre (lecture base Supabase).
function ArchivesView({ onBack }) {
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
          const res = await fetch(
            SB_URL + '/rest/v1/points?select=id,zone,name,description,period,coordinates,color,casualties,deleted,created_at'
              + '&order=zone.asc,created_at.desc&offset=' + offset + '&limit=' + page,
            { headers: { apikey: SB_KEY } }
          );
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const chunk = await res.json();
          all.push(...chunk);
          if (chunk.length < page) break;
          offset += page;
        }
        if (!cancelled) setPoints(all);
      } catch (e) {
        if (!cancelled) setError((e && e.message) || 'Erreur de chargement');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Esc ferme le detail
  useEffect(() => {
    if (!selected) return;
    const h = (e) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selected]);

  const needle = query.toLowerCase().trim();
  const visible = (points || []).filter((p) => {
    if (!needle) return true;
    return [p.name, p.description, p.period, ZONE_LABELS[p.zone] || p.zone]
      .some((f) => (f || '').toString().toLowerCase().includes(needle));
  });

  const groups = {};
  visible.forEach((p) => { (groups[p.zone] = groups[p.zone] || []).push(p); });
  const zones = Object.keys(groups).sort();

  return (
    <main className="view-enter view-enter-active">
      <section className="console-page">
        <a className="console-back" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
          &larr; Retour a la console
        </a>
        <h1 className="hero__title">Archives <em>des points</em></h1>
        <p className="hero__lede">
          Tous les points cartographies, regroupes par theatre. Conserves en base meme apres retrait des cartes.
        </p>

        {points && points.length > 0 && (
          <div className="dash-search">
            <div className="search-input">
              <DashSearchIcon />
              <input
                placeholder="Rechercher un point — nom, description, periode, theatre..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button className="search-input__clear" onClick={() => setQuery('')} aria-label="Effacer">
                  <DashCloseIcon size={12} />
                </button>
              )}
            </div>
            <span className="dash-search__count">
              {visible.length} point{visible.length > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {error && <div className="dash-msg dash-msg--err">Erreur : {error}</div>}
        {!points && !error && <div className="dash-msg">Chargement des points...</div>}
        {points && points.length === 0 && <div className="dash-msg">Aucun point en base.</div>}
        {points && points.length > 0 && zones.length === 0 && (
          <div className="dash-msg">Aucun resultat pour « {query} ».</div>
        )}

        {points && zones.map((z) => (
          <div className="dash-zone" key={z}>
            <div className="dash-zone__head">
              <h2 className="dash-zone__name">{ZONE_LABELS[z] || z}</h2>
              <span className="dash-zone__count">{groups[z].length} points</span>
            </div>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Nom</th><th>Periode</th><th>Latitude</th>
                    <th>Longitude</th><th>Victimes</th><th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {groups[z].map((p) => {
                    const c = Array.isArray(p.coordinates) ? p.coordinates : [];
                    return (
                      <tr key={p.id} className="dash-row" tabIndex={0}
                          onClick={() => setSelected(p)}
                          onKeyDown={(e) => { if (e.key === 'Enter') setSelected(p); }}>
                        <td>{p.name || '—'}</td>
                        <td>{p.period || '—'}</td>
                        <td>{c[1] != null ? Number(c[1]).toFixed(4) : '—'}</td>
                        <td>{c[0] != null ? Number(c[0]).toFixed(4) : '—'}</td>
                        <td>{p.casualties || 0}</td>
                        <td>
                          {p.deleted
                            ? <span className="dash-tag dash-tag--archived">Archive</span>
                            : <span className="dash-tag dash-tag--live">Actif</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>

      {selected && <PointDetail point={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

// Parse le champ description structure (Date / Pays / Evenement / Detail),
// meme logique que l'ancien pop-up des cartes (shared/engine.js parseDesc).
function parsePointDesc(raw) {
  if (!raw || raw === 'null') return null;
  const txt = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  const r = {};
  txt.split('\n').forEach((l) => {
    const m = l.match(/^([^:]+):\s*(.+)$/);
    if (!m) return;
    const k = m[1].trim().toLowerCase();
    const v = m[2].trim();
    if (k === 'date') r.date = v;
    else if (k === 'pays') r.pays = v;
    else if (k === 'evenement' || k === 'événement') r.event = v;
    else if (k === 'détail' || k === 'detail') r.detail = v;
  });
  return Object.keys(r).length ? r : null;
}

// Popup detail d'un point — reprend le contenu de l'ancien pop-up des cartes.
function PointDetail({ point, onClose }) {
  const c = Array.isArray(point.coordinates) ? point.coordinates : [];
  const lng = c[0] != null ? Number(c[0]).toFixed(5) : '—';
  const lat = c[1] != null ? Number(c[1]).toFixed(5) : '—';
  const created = point.created_at
    ? new Date(point.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  const d = parsePointDesc(point.description);

  const eventRows = [];
  if (d) {
    if (d.date) eventRows.push(['Date', d.date]);
    if (d.pays) eventRows.push(['Pays', d.pays]);
    if (d.event) eventRows.push(['Evenement', d.event]);
    if (d.detail) eventRows.push(['Detail', d.detail]);
  }
  const metaRows = [
    ['Theatre', ZONE_LABELS[point.zone] || point.zone],
    ['Coordonnees', lat + ', ' + lng],
    ['Victimes', String(point.casualties || 0)],
    ['Statut', point.deleted ? 'Archive (retire des cartes)' : 'Actif'],
    ['Ajoute le', created],
  ];

  return ReactDOM.createPortal(
    <div className="point-modal-overlay" onClick={onClose}>
      <div className="point-modal" role="dialog" aria-modal="true"
           onClick={(e) => e.stopPropagation()}>
        <button className="point-modal__close" onClick={onClose} aria-label="Fermer">
          <DashCloseIcon size={16} />
        </button>
        <div className="point-modal__head">
          <span className="point-modal__dot" style={{ background: point.color || '#888888' }} />
          <h3 className="point-modal__name">{point.name || 'Point sans nom'}</h3>
          {point.period && <span className="point-modal__period">{point.period}</span>}
        </div>

        {eventRows.length > 0 && (
          <div className="point-modal__rows point-modal__rows--event">
            {eventRows.map(([k, v]) => (
              <div className="point-modal__row" key={k}>
                <span className="point-modal__key">{k}</span>
                <span className="point-modal__val">{v}</span>
              </div>
            ))}
          </div>
        )}
        {!eventRows.length && point.description && point.description !== 'null' && (
          <p className="point-modal__desc">{point.description}</p>
        )}

        <div className="point-modal__rows">
          {metaRows.map(([k, v]) => (
            <div className="point-modal__row" key={k}>
              <span className="point-modal__key">{k}</span>
              <span className="point-modal__val">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

function DashSearchIcon() {
  return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>);
}
function DashCloseIcon({ size = 14 }) {
  return (<svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>);
}

Object.assign(window, { HomeView, VideoBand, ConsoleView, ArchivesView, VeilleView, Arrow, ArrowDiag });
