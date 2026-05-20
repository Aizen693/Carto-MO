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
          <ArrowBack /> Retour a l'accueil
        </button>

        <header className="platform__intro">
          <div>
            <span className="eyebrow">— Bureau de travail · plateforme</span>
            <h1 className="platform__title">
              Que souhaitez-vous <em>consulter</em>&nbsp;?
            </h1>
          </div>
          <p className="platform__lede">
            Cinq points d'entree pour naviguer dans les donnees Algor Int. Chacun ouvre un panneau lateral structure, avec recherche et navigation hierarchique.
          </p>
        </header>

        <div className="actions-grid">
          <ActionCard
            num="01" name="Region" desc="Choisir un theatre operationnel — Sahel, Moyen-Orient, RDC, Madagascar, Afrique, Asie du Sud."
            count={`${ZONES.length} zones`} icon={<RegionIcon />}
            onClick={() => openAction('region')} />

          <ActionCard
            num="02" name="Rapport" desc="Documents analytiques classes par zone puis par sujet."
            count={`${Object.values(REPORTS).flat().length} documents`} icon={<DocIconLg />}
            onClick={() => openAction('rapport')} />

          <ActionCard
            num="03" name="Graph" desc="Visualisations, indicateurs et series — densites, flux, reseaux."
            count={`${Object.values(GRAPHS).flat().length} visualisations`} icon={<GraphIconLg />}
            onClick={() => openAction('graph')} />

          <ActionCard
            num="04" name="Theme" desc="Lectures transversales — Ports, Mines, JNIM, Routes, Energie..."
            count={`${THEMES.length} themes`} icon={<ThemeIconLg />}
            onClick={() => openAction('theme')} />

          <ActionCard
            num="05" name="Cartographie" desc="Acces direct aux cartes interactives — six theatres, calques et timeline."
            count={`${ZONES.length} cartes`} icon={<CartoIconLg />}
            onClick={() => openAction('cartographie')} />
        </div>

        <div className="section-rule">
          <span className="section-rule__label">— Recemment consultes</span>
          <span className="section-rule__line" />
        </div>

        <div className="recent-grid">
          <RecentItem icon={<MapIconSm />}   title="Sahel — Carte interactive"                href="/sahel/" />
          <RecentItem icon={<DocIconSm />}   title="Sahel — Rapport analytique Q1 2026"       href="/sahel/rapport.html" />
          <RecentItem icon={<MapIconSm />}   title="Moyen-Orient — Carte interactive"         href="/moyen-orient/" />
          <RecentItem icon={<MapIconSm />}   title="RDC — Carte interactive"                  href="/rdc/" />
          <RecentItem icon={<MapIconSm />}   title="Afrique Maritime — AIS temps reel"        href="/afrique/" />
          <RecentItem icon={<MapIconSm />}   title="Asie du Sud — Carte interactive"          href="/asie-sud/" />
        </div>
      </div>

      <SidePanel open={open} action={action} onClose={closePanel} />
    </main>
  );
}

// Cascade au survol : carte d'action -> sous-elements -> actions.
function cascadeFor(name) {
  const zoneName = id => (ZONES.find(z => z.id === id) || {}).name || id;
  const zoneHref = id => (ZONES.find(z => z.id === id) || {}).href || '#';
  if (name === 'Region') {
    return ZONES.map(z => ({
      label: z.name, meta: z.code,
      actions: [
        { label: 'Carte interactive', meta: z.countries, href: z.href },
        { label: 'Rapports analytiques', meta: `${(REPORTS[z.id] || []).length} document(s)`,
          href: ((REPORTS[z.id] || []).find(r => r.href) || {}).href || z.href },
        { label: 'Visualisations', meta: `${(GRAPHS[z.id] || []).length} graph(s)`, href: z.href },
      ],
    }));
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
        label: t.name, meta: `${t.count} entrees`,
        actions: detail.length
          ? detail.map(d => ({ label: d.title, meta: `${d.type} · ${d.meta}`, href: d.href || null }))
          : [{ label: t.desc, meta: 'Lecture transverse', href: null }],
      };
    });
  }
  if (name === 'Cartographie') {
    return ZONES.map(z => ({
      label: z.name, meta: z.code,
      actions: [
        { label: 'Ouvrir la carte interactive', meta: z.countries, href: z.href },
      ],
    }));
  }
  return [];
}

// Apercu anime en tete du popup — aurore violet/bleu + mini-clip propre a la carte.
function CascadePreview({ name, count }) {
  return (
    <div className="cascade-preview" aria-hidden="true">
      <div className="cascade-preview__aurora" />
      <div className="cascade-preview__grid" />
      <PreviewScene name={name} />
      <div className="cascade-preview__shine" />
      <div className="cascade-preview__caption">
        <span className="cascade-preview__dot" />
        Apercu · {name}
        <span className="cascade-preview__count">{count}</span>
      </div>
    </div>
  );
}

// Mini-clip anime distinct par carte (boucle ~10-14 s, joue au survol).
function PreviewScene({ name }) {
  if (name === 'Region')       return <SceneGlobe />;
  if (name === 'Rapport')      return <SceneDoc />;
  if (name === 'Graph')        return <SceneChart />;
  if (name === 'Theme')        return <SceneNet />;
  if (name === 'Cartographie') return <SceneMap />;
  return null;
}

function SceneGlobe() {
  return (
    <div className="cp-scene cp-globe">
      <div className="cp-globe__ball"><div className="cp-globe__lines" /></div>
      <span className="cp-ping" style={{ left: '32%', top: '34%' }} />
      <span className="cp-ping" style={{ left: '64%', top: '50%', animationDelay: '1.3s' }} />
      <span className="cp-ping" style={{ left: '46%', top: '70%', animationDelay: '2.6s' }} />
    </div>
  );
}

function SceneDoc() {
  const bars = [
    { cls: 'cp-doc__bar cp-doc__bar--h', w: '62%' },
    { w: '92%' }, { w: '74%' }, { w: '88%' }, { w: '56%' }, { w: '80%' },
  ];
  return (
    <div className="cp-scene cp-doc">
      <div className="cp-doc__sheet">
        {bars.map((b, i) => (
          <span key={i} className={b.cls || 'cp-doc__bar'}
                style={{ width: b.w, animationDelay: (i * 0.55) + 's' }} />
        ))}
      </div>
    </div>
  );
}

function SceneChart() {
  const bars = [44, 72, 32, 88, 58];
  return (
    <div className="cp-scene cp-chart">
      {bars.map((h, i) => (
        <span key={i} className="cp-bar"
              style={{ height: h + 'px', animationDelay: (i * 0.28) + 's' }} />
      ))}
    </div>
  );
}

function SceneNet() {
  return (
    <div className="cp-scene cp-net">
      <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid meet">
        <g className="cp-net__links">
          <line x1="50" y1="42" x2="100" y2="28" />
          <line x1="100" y1="28" x2="150" y2="48" />
          <line x1="50" y1="42" x2="86" y2="86" />
          <line x1="86" y1="86" x2="150" y2="48" />
          <line x1="86" y1="86" x2="136" y2="94" />
          <line x1="100" y1="28" x2="86" y2="86" />
        </g>
        <g className="cp-net__nodes">
          <circle cx="50" cy="42" r="5" />
          <circle cx="100" cy="28" r="6.5" />
          <circle cx="150" cy="48" r="5" />
          <circle cx="86" cy="86" r="6.5" />
          <circle cx="136" cy="94" r="4.5" />
        </g>
      </svg>
    </div>
  );
}

function SceneMap() {
  return (
    <div className="cp-scene cp-map">
      <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
        <path className="cp-map__land" d="M14 84 Q42 54 80 60 Q116 66 126 40 Q156 22 192 42 L192 120 L14 120 Z" />
        <path className="cp-map__land cp-map__land--2" d="M2 26 Q34 18 56 32 Q74 44 62 60 Q40 72 16 58 Q-6 44 2 26 Z" />
        <path className="cp-map__route" d="M34 94 Q72 64 108 76 Q148 90 172 44" />
        <circle className="cp-map__pin" cx="172" cy="44" r="4.5" />
      </svg>
      <div className="cp-radar" />
    </div>
  );
}

function ActionCard({ num, name, desc, count, icon, onClick }) {
  const groups = cascadeFor(name);
  return (
    <div className="action-card-wrap">
      <div className="action-card" onClick={onClick} role="button" tabIndex={0}
           onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>
        <div className="action-card__top">
          <div className="action-card__icon">{icon}</div>
          <span className="action-card__num">— {num}</span>
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
          <CascadePreview name={name} count={count} />
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
