/* global React, ZONES, REPORTS, GRAPHS, THEMES, THEME_DETAIL, SidePanel, Arrow */
// Page 2 — 5 actions : Region · Rapport · Graph · Theme · Cartographie

const { useState: useStateP } = React;

function PlatformView({ onBack }) {
  const [action, setAction] = useStateP(null);
  const [open, setOpen]     = useStateP(false);

  function openAction(a) { setAction(a); setOpen(true); }
  function closePanel()  { setOpen(false); }

  return (
    <main className="view-enter view-enter-active">
      <div className="platform">
        <button className="platform__back" onClick={onBack}>
          <ArrowBack /> Retour à l'accueil
        </button>

        <header className="platform__intro">
          <div>
            <span className="eyebrow">Bureau de travail · plateforme</span>
            <h1 className="platform__title">
              Que souhaitez-vous <em>consulter</em>&nbsp;?
            </h1>
          </div>
          <p className="platform__lede">
            Cinq points d'entrée pour naviguer dans les données Algor Int. Chacun ouvre un panneau latéral structuré, avec recherche et navigation hiérarchique.
          </p>
        </header>

        <div className="actions-grid">
          <ActionCard
            num="01" name="Region" desc="Choisir un pays suivi pour ouvrir sa carte de renseignement."
            count="7 pays" icon={<RegionIcon />}
            onClick={() => openAction('region')} />

          <ActionCard
            num="02" name="Rapport" desc="Documents analytiques classés par zone puis par sujet."
            count={`${Object.values(REPORTS).flat().length} documents`} icon={<DocIconLg />}
            onClick={() => openAction('rapport')} />

          <ActionCard
            num="03" name="Graph" desc="Visualisations, indicateurs et séries : densités, flux, réseaux."
            count={`${Object.values(GRAPHS).flat().length} visualisations`} icon={<GraphIconLg />}
            onClick={() => openAction('graph')} />

          <ActionCard
            num="04" name="Theme" desc="Lectures transversales : Ports, Mines, JNIM, Routes, Énergie..."
            count={`${THEMES.length} thèmes`} icon={<ThemeIconLg />}
            onClick={() => openAction('theme')} />

          <ActionCard
            num="05" name="Cartographie" desc="Accès direct aux cartes de renseignement par pays : événements, acteurs et dates filtrables."
            count="7 pays" icon={<CartoIconLg />}
            onClick={() => openAction('cartographie')} />
        </div>

        <div className="section-rule">
          <span className="section-rule__label">Récemment consultés</span>
          <span className="section-rule__line" />
        </div>

        <div className="recent-grid">
          <RecentItem icon={<MapIconSm />}   title="Sahel : Carte interactive"                href="/sahel/" />
          <RecentItem icon={<DocIconSm />}   title="Sahel : Rapport analytique Q1 2026"       href="/sahel/rapport.html" />
          <RecentItem icon={<MapIconSm />}   title="Moyen-Orient : Carte interactive"         href="/moyen-orient/" />
          <RecentItem icon={<MapIconSm />}   title="RDC : Carte interactive"                  href="/rdc/" />
          <RecentItem icon={<MapIconSm />}   title="Afrique Maritime : AIS temps réel"        href="/afrique/" />
          <RecentItem icon={<MapIconSm />}   title="Asie du Sud : Carte interactive"          href="/asie-sud/" />
        </div>
      </div>

      <SidePanel open={open} action={action} onClose={closePanel} />
    </main>
  );
}

// Cascade au survol : carte d'action -> sous-éléments -> actions.
// Pays suivis (données HUMINT) — pivot vers une navigation par pays.
const PAYS_HUMINT = ['Mali', 'Niger', 'Burkina Faso', 'Nigeria', 'RDC', 'Bénin', 'Togo'];
function paysCascade() {
  return PAYS_HUMINT.map(p => ({
    label: p, meta: 'Renseignement',
    actions: [
      { label: 'Ouvrir la carte du pays', meta: 'Événements · Acteurs · Dates',
        href: '/carte/?pays=' + encodeURIComponent(p) },
    ],
  }));
}

function cascadeFor(name) {
  const zoneName = id => (ZONES.find(z => z.id === id) || {}).name || id;
  const zoneHref = id => (ZONES.find(z => z.id === id) || {}).href || '#';
  if (name === 'Region') {
    return paysCascade();
  }
  if (name === 'Rapport') {
    return Object.keys(REPORTS).map(zid => ({
      label: zoneName(zid), meta: `${REPORTS[zid].length} doc(s)`,
      actions: REPORTS[zid].map(r => ({
        label: r.title, meta: `${r.pages} p · ${r.tag}`, href: r.href || zoneHref(zid),
      })),
    }));
  }
  if (name === 'Graph') {
    return Object.keys(GRAPHS).map(zid => ({
      label: zoneName(zid), meta: `${GRAPHS[zid].length} vue(s)`,
      actions: GRAPHS[zid].map(g => ({
        label: g.title, meta: `${g.type} · ${g.scope}`, href: zoneHref(zid),
      })),
    }));
  }
  if (name === 'Theme') {
    return THEMES.map(t => {
      const detail = THEME_DETAIL[t.id] || [];
      return {
        label: t.name, meta: `${t.count} entrées`,
        actions: detail.length
          ? detail.map(d => ({ label: d.title, meta: `${d.type} · ${d.meta}`, href: d.href || null }))
          : [{ label: t.desc, meta: 'Lecture transverse', href: null }],
      };
    });
  }
  if (name === 'Cartographie') {
    return paysCascade();
  }
  return [];
}

// Apercu video en fond de carte — capture reelle de la page cible, jouee au survol.
const PREVIEW_SRC = {
  Region:       './shared/home/assets/preview-region.mp4?v=20260522b',
  Rapport:      './shared/home/assets/preview-rapport.mp4?v=20260522b',
  Graph:        './shared/home/assets/preview-graph.mp4?v=20260522b',
  Theme:        './shared/home/assets/preview-theme.mp4?v=20260522b',
  Cartographie: './shared/home/assets/preview-cartographie.mp4?v=20260522b',
};

function ActionCard({ num, name, desc, count, icon, onClick }) {
  const groups = cascadeFor(name);
  const previewSrc = PREVIEW_SRC[name];
  const videoRef = React.useRef(null);

  function startPreview() {
    const v = videoRef.current;
    if (!v) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try { v.currentTime = 0; v.play().catch(() => {}); } catch (e) {}
  }
  function stopPreview() {
    const v = videoRef.current;
    if (v) v.pause();
  }

  return (
    <div className="action-card-wrap"
         onMouseEnter={startPreview} onMouseLeave={stopPreview}>
      <div className="action-card" onClick={onClick} role="button" tabIndex={0}
           onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>
        {previewSrc && (
          <div className="action-card__media" aria-hidden="true">
            <video ref={videoRef} className="action-card__media-video" src={previewSrc}
                   loop muted playsInline preload="metadata" />
          </div>
        )}
        <div className="action-card__top">
          <div className="action-card__icon">{icon}</div>
          <span className="action-card__num">{num}</span>
        </div>
        <div>
          <h3 className="action-card__title">{name}</h3>
          <p className="action-card__desc">{desc}</p>
        </div>
        <div className="action-card__foot">
          <span className="action-card__count">{count}</span>
          <span className="action-card__arrow">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h7M7 3.5L10.5 7 7 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>
      </div>

      {groups.length > 0 && (
        <div className="cascade-pop" role="menu">
          {groups.map((g, i) => (
            <div className="cascade-row" key={i}>
              <span className="cascade-row__label">{g.label}</span>
              <span className="cascade-row__meta">{g.meta}</span>
              <ChevronRight />
              <div className="cascade-sub">
                {g.actions.map((a, j) => (
                  a.href
                    ? <a className="cascade-sub__item" href={a.href} key={j}>
                        <span className="cascade-sub__label">{a.label}</span>
                        <span className="cascade-sub__meta">{a.meta}</span>
                      </a>
                    : <span className="cascade-sub__item cascade-sub__item--static" key={j}>
                        <span className="cascade-sub__label">{a.label}</span>
                        <span className="cascade-sub__meta">{a.meta}</span>
                      </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChevronRight() {
  return (<svg className="cascade-row__chev" width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
}

function RecentItem({ icon, title, href }) {
  const Tag = href ? 'a' : 'button';
  return (
    <Tag className="recent-item" href={href || undefined}>
      <span className="recent-item__type">{icon}</span>
      <span className="recent-item__body">
        <span className="recent-item__title">{title}</span>
      </span>
      <ArrowSm muted />
    </Tag>
  );
}

function RegionIcon() {
  return (<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.6"/>
    <path d="M3 11h16M11 3c2.5 2.5 4 5 4 8s-1.5 5.5-4 8c-2.5-2.5-4-5-4-8s1.5-5.5 4-8z" stroke="currentColor" strokeWidth="1.5"/>
  </svg>);
}
function DocIconLg() {
  return (<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <path d="M6 3h7l4 4v12a.5.5 0 01-.5.5h-10.5a.5.5 0 01-.5-.5V3.5A.5.5 0 016 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M13 3v4h4M8 11h6M8 14h6M8 17h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>);
}
function GraphIconLg() {
  return (<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <path d="M4 18V4M4 18h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M7 14l3-4 3 2 4-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="17" cy="6" r="1.6" fill="currentColor"/>
  </svg>);
}
function ThemeIconLg() {
  return (<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <path d="M11 3l2.4 4.8 5.3.8-3.85 3.75.9 5.3L11 15.2l-4.75 2.5.9-5.3L3.3 8.6l5.3-.8L11 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>);
}
function CartoIconLg() {
  return (<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <path d="M11 2.5l8 3.9-8 3.9-8-3.9 8-3.9z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M3.2 10.9L11 14.7l7.8-3.8M3.2 14.9L11 18.7l7.8-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
}
function ArrowBack() {
  return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M12.5 8h-9M7 4.5L3.5 8 7 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
}
function ArrowSm({ muted }) {
  return (<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity: muted ? 0.5 : 1 }}>
    <path d="M3 7h7M7 3.5L10.5 7 7 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
}
function MapIconSm()   { return (<svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M2 4.5L7 3l4 1.5L16 3v10.5L11 15l-4-1.5L2 15V4.5z" stroke="currentColor" strokeWidth="1.4"/><path d="M7 3v10.5M11 4.5V15" stroke="currentColor" strokeWidth="1.4"/></svg>); }
function DocIconSm()   { return (<svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M5 2.5h6l3 3V15.5h-9V2.5z" stroke="currentColor" strokeWidth="1.4"/><path d="M11 2.5v3h3" stroke="currentColor" strokeWidth="1.4"/></svg>); }

Object.assign(window, { PlatformView });
