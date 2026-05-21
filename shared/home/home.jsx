/* global React */
// Page 1 — Accueil client Algor Access (plateforme OSINT)

function HomeView({ onEnter, clock, videoStyle }) {
  return (
    <main className="view-enter view-enter-active">
      <section className="hero">
        <div className="hero__copy">
          <div className="hero__eyebrow">
            <span>plateforme</span>
            <span className="hero__eyebrow-sep" />
            <span>intelligence OSINT</span>
            <span className="hero__eyebrow-sep" />
            <span className="hero__eyebrow-muted">Algor Access · 2026</span>
          </div>

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
            <a className="btn--ghost-link" href="/admin/">
              Console admin
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

Object.assign(window, { HomeView, VideoBand, Arrow, ArrowDiag });
