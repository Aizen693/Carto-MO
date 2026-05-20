/* global React, ZONES, REPORTS, GRAPHS, THEMES, THEME_DETAIL */
// Side panel — système hiérarchique pour les 4 actions :
//   • RÉGION   : liste zones → détail zone (carte/rapport/graph/thème)
//   • RAPPORT  : liste zones → liste rapports zone
//   • GRAPH    : liste zones → liste graphs zone
//   • THÈME    : liste thèmes → sous-contenus thème (Carte/Rapport/Graph/...)

const { useState, useEffect, useRef } = React;

function SidePanel({ open, action, onClose }) {
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
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  const top = stack[stack.length - 1] || null;
  const push = (frame) => setStack(s => [...s, frame]);
  const popTo = (idx) => setStack(s => s.slice(0, idx + 1));

  if (!action) return (
    <>
      <div className={`panel-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`side-panel ${open ? 'open' : ''}`} aria-hidden={!open} />
    </>
  );

  return (
    <>
      <div className={`panel-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`side-panel ${open ? 'open' : ''}`} aria-hidden={!open}>
        <PanelHeader
          stack={stack}
          onCrumbClick={popTo}
          onClose={onClose}
        />

        {!!top && top.kind !== 'detail-zone' && top.kind !== 'detail-theme' && (
          <div className="side-panel__search">
            <div className="search-input">
              <SearchIcon />
              <input
                placeholder={`Rechercher dans ${top.title.toLowerCase()}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus={open}
              />
              {query && (
                <button className="search-input__clear" onClick={() => setQuery('')}>
                  <CloseSm />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="side-panel__body">
          {top && renderFrame(top, query, push)}
        </div>
      </aside>
    </>
  );
}

// ─── Root frame factory ───────────────────────────────────
function rootFor(action) {
  if (action === 'region')  return { kind: 'zones',   title: 'Régions',  subtitle: 'Choisissez un théâtre pour accéder à sa cartographie, ses rapports et ses indicateurs.' };
  if (action === 'rapport') return { kind: 'zones-r', title: 'Rapports', subtitle: 'Classement par zone, puis par rapport. Notes hebdomadaires, synthèses et études.' };
  if (action === 'graph')   return { kind: 'zones-g', title: 'Graphs',   subtitle: 'Visualisations et indicateurs : flux, densités, réseaux, séries temporelles.' };
  if (action === 'theme')   return { kind: 'themes',  title: 'Thèmes',   subtitle: 'Lectures transversales — un sujet, plusieurs zones. Ports, Mines, JNIM, etc.' };
  if (action === 'cartographie') return { kind: 'zones', title: 'Cartographie', subtitle: 'Accès direct aux cartes interactives — sélectionnez un théâtre pour l\'ouvrir.' };
  return null;
}

// ─── Header (breadcrumb + title) ──────────────────────────
function PanelHeader({ stack, onCrumbClick, onClose }) {
  const top = stack[stack.length - 1];
  if (!top) return null;
  return (
    <div className="side-panel__head">
      {stack.length > 1 && (
        <div className="side-panel__breadcrumb">
          {stack.map((f, i) => (
            <React.Fragment key={i}>
              <button
                onClick={() => onCrumbClick(i)}
                disabled={i === stack.length - 1}>
                {f.title}
              </button>
              {i < stack.length - 1 && <span className="side-panel__breadcrumb-sep">/</span>}
            </React.Fragment>
          ))}
        </div>
      )}
      <div className="side-panel__head-row">
        <div>
          <h2 className="side-panel__title">{top.title}</h2>
          {top.subtitle && <p className="side-panel__subtitle">{top.subtitle}</p>}
        </div>
        <button className="side-panel__close" onClick={onClose} aria-label="Fermer">
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

// ─── Frame renderers ──────────────────────────────────────
function renderFrame(frame, query, push) {
  switch (frame.kind) {
    case 'zones':   return <ZonesList   q={query} onPick={(z) => { if (z.href) window.location.href = z.href; else push({ kind: 'detail-zone',  title: z.name, subtitle: z.countries, payload: z }); }} />;
    case 'zones-r': return <ZonesList   q={query} mode="reports" onPick={(z) => push({ kind: 'reports-of-zone', title: `Rapports · ${z.name}`, subtitle: z.countries, payload: z })} />;
    case 'zones-g': return <ZonesList   q={query} mode="graphs"  onPick={(z) => push({ kind: 'graphs-of-zone',  title: `Graphs · ${z.name}`,  subtitle: z.countries, payload: z })} />;
    case 'themes':  return <ThemesList  q={query} onPick={(t) => push({ kind: 'detail-theme', title: t.name, subtitle: t.desc, payload: t })} />;

    case 'reports-of-zone': return <ReportsList q={query} zoneId={frame.payload.id} />;
    case 'graphs-of-zone':  return <GraphsList  q={query} zoneId={frame.payload.id} />;

    case 'detail-zone':  return <ZoneDetail  zone={frame.payload} />;
    case 'detail-theme': return <ThemeDetail theme={frame.payload} />;
    default: return null;
  }
}

// ─── Lists ────────────────────────────────────────────────
function ZonesList({ q, mode, onPick }) {
  const filtered = ZONES.filter(z => match(q, z.name, z.countries));
  return (
    <div className="panel-list">
      <div className="panel-list__group-label">Théâtres opérationnels · {filtered.length}</div>
      {filtered.map(z => (
        <button key={z.id} className="panel-row" onClick={() => onPick(z)}>
          <span className="panel-row__flag">{z.code}</span>
          <span className="panel-row__body">
            <span className="panel-row__title">{z.name}</span>
            <span className="panel-row__meta">{z.countries}</span>
          </span>
          <span className={`panel-row__badge ${z.status === 'beta' ? '' : 'ok'}`}>
            {mode === 'reports' ? `${(REPORTS[z.id] || []).length} doc` :
             mode === 'graphs'  ? `${(GRAPHS[z.id] || []).length} vues` :
             `${z.events} évts`}
          </span>
          <ChevRight />
        </button>
      ))}
      {!filtered.length && <Empty q={q} />}
    </div>
  );
}

function ReportsList({ q, zoneId }) {
  const list = (REPORTS[zoneId] || []).filter(r => match(q, r.title, r.tag));
  return (
    <div className="panel-list">
      <div className="panel-list__group-label">Documents disponibles · {list.length}</div>
      {list.map(r => {
        const Tag = r.href ? 'a' : 'button';
        return (
          <Tag key={r.id} className="panel-row" href={r.href || undefined}>
            <span className="panel-row__flag panel-row__flag--doc"><DocIcon /></span>
            <span className="panel-row__body">
              <span className="panel-row__title">{r.title}</span>
              <span className="panel-row__meta">{r.date} · {r.pages} pages</span>
            </span>
            <span className="panel-row__badge">{r.tag}</span>
            <ChevRight />
          </Tag>
        );
      })}
      {!list.length && <Empty q={q} />}
    </div>
  );
}

function GraphsList({ q, zoneId }) {
  const list = (GRAPHS[zoneId] || []).filter(g => match(q, g.title, g.type));
  return (
    <div className="panel-list">
      <div className="panel-list__group-label">Visualisations · {list.length}</div>
      {list.map(g => (
        <button key={g.id} className="panel-row">
          <span className="panel-row__flag panel-row__flag--graph"><GraphIcon /></span>
          <span className="panel-row__body">
            <span className="panel-row__title">{g.title}</span>
            <span className="panel-row__meta">{g.type} · {g.scope}</span>
          </span>
          <ChevRight />
        </button>
      ))}
      {!list.length && <Empty q={q} />}
    </div>
  );
}

function ThemesList({ q, onPick }) {
  const list = THEMES.filter(t => match(q, t.name, t.desc));
  return (
    <div className="panel-list">
      <div className="panel-list__group-label">Thèmes transverses · {list.length}</div>
      {list.map(t => (
        <button key={t.id} className="panel-row" onClick={() => onPick(t)}>
          <span className="panel-row__flag" style={{ background: `${t.color}22`, color: t.color }}>
            <ThemeGlyph name={t.name} />
          </span>
          <span className="panel-row__body">
            <span className="panel-row__title">{t.name}</span>
            <span className="panel-row__meta">{t.desc}</span>
          </span>
          <span className="panel-row__badge">{t.count} pts</span>
          <ChevRight />
        </button>
      ))}
      {!list.length && <Empty q={q} />}
    </div>
  );
}

// ─── Detail views ─────────────────────────────────────────
function ZoneDetail({ zone }) {
  return (
    <>
      <div className="detail-section">
        <div className="detail-section__head">
          <span className="detail-section__label">— Vue d'ensemble</span>
          <span className="detail-section__count">{zone.period}</span>
        </div>
        <div className="detail-stats">
          <div className="detail-stat">
            <div className="detail-stat__value">{zone.events}</div>
            <div className="detail-stat__label">Évènements</div>
          </div>
          <div className="detail-stat">
            <div className="detail-stat__value">{(REPORTS[zone.id] || []).length}</div>
            <div className="detail-stat__label">Rapports</div>
          </div>
          <div className="detail-stat">
            <div className="detail-stat__value">{(GRAPHS[zone.id] || []).length}</div>
            <div className="detail-stat__label">Graphs</div>
          </div>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section__head">
          <span className="detail-section__label">— Accès rapide</span>
        </div>
        <div className="panel-list">
          <a className="panel-row" href={zone.href || '#'}>
            <span className="panel-row__flag"><MapIcon /></span>
            <span className="panel-row__body">
              <span className="panel-row__title">Carte interactive</span>
              <span className="panel-row__meta">Mapbox · calques · 3D</span>
            </span>
            <ChevRight />
          </a>
          {(REPORTS[zone.id] || []).find(r => r.href) && (
            <a className="panel-row" href={(REPORTS[zone.id] || []).find(r => r.href).href}>
              <span className="panel-row__flag panel-row__flag--doc"><DocIcon /></span>
              <span className="panel-row__body">
                <span className="panel-row__title">Rapport analytique</span>
                <span className="panel-row__meta">{(REPORTS[zone.id] || []).length} documents</span>
              </span>
              <ChevRight />
            </a>
          )}
          <button className="panel-row">
            <span className="panel-row__flag panel-row__flag--graph"><GraphIcon /></span>
            <span className="panel-row__body">
              <span className="panel-row__title">Graphs &amp; indicateurs</span>
              <span className="panel-row__meta">{(GRAPHS[zone.id] || []).length} vues disponibles</span>
            </span>
            <ChevRight />
          </button>
          <button className="panel-row">
            <span className="panel-row__flag"><ThemeGlyph name="Theme" /></span>
            <span className="panel-row__body">
              <span className="panel-row__title">Themes lies</span>
              <span className="panel-row__meta">Ports · Mines · JNIM · Flux</span>
            </span>
            <ChevRight />
          </button>
        </div>
      </div>

      <div className="action-row">
        <a className="btn btn--primary" href={zone.href || '#'} style={{ flex: 1 }}>Ouvrir la carte<Arrow /></a>
      </div>
    </>
  );
}

function ThemeDetail({ theme }) {
  const items = THEME_DETAIL[theme.id] || [];
  return (
    <>
      <div className="detail-section">
        <div className="detail-section__head">
          <span className="detail-section__label">— Aperçu</span>
          <span className="detail-section__count">{theme.count} points</span>
        </div>
        <div className="detail-stats">
          <div className="detail-stat">
            <div className="detail-stat__value">{theme.count}</div>
            <div className="detail-stat__label">Points liés</div>
          </div>
          <div className="detail-stat">
            <div className="detail-stat__value">04</div>
            <div className="detail-stat__label">Zones concernées</div>
          </div>
          <div className="detail-stat">
            <div className="detail-stat__value up">+12%</div>
            <div className="detail-stat__label">Tendance 30j</div>
          </div>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section__head">
          <span className="detail-section__label">— Contenus disponibles</span>
          <span className="detail-section__count">{items.length}</span>
        </div>
        <div className="panel-list">
          {items.length === 0 && (
            <div className="empty">
              <p>Pas encore de contenu rattaché à ce thème.</p>
            </div>
          )}
          {items.map(it => {
            const Tag = it.href ? 'a' : 'button';
            return (
              <Tag key={it.id} className="panel-row" href={it.href || undefined}>
                <span className="panel-row__flag" style={{ background: `${theme.color}22`, color: theme.color }}>
                  {it.type === 'Carte'   && <MapIcon />}
                  {it.type === 'Rapport' && <DocIcon />}
                  {it.type === 'Graph'   && <GraphIcon />}
                  {it.type === 'Reseau'  && <NetIcon />}
                </span>
                <span className="panel-row__body">
                  <span className="panel-row__title">{it.title}</span>
                  <span className="panel-row__meta">{it.type} · {it.meta}</span>
                </span>
                <ChevRight />
              </Tag>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Empty({ q }) {
  return (
    <div className="empty">
      <p>Aucun résultat{q ? <> pour « <strong>{q}</strong> »</> : ''}.</p>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────
function match(q, ...fields) {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  return fields.some(f => (f || '').toLowerCase().includes(needle));
}

// ─── Icons ────────────────────────────────────────────────
function SearchIcon() {
  return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>);
}
function CloseIcon() {
  return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>);
}
function CloseSm() {
  return (<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>);
}
function ChevRight() {
  return (<svg className="panel-row__chev" width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
}
function MapIcon() {
  return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M2 4.5L7 3l4 1.5L16 3v10.5L11 15l-4-1.5L2 15V4.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M7 3v10.5M11 4.5V15" stroke="currentColor" strokeWidth="1.4"/>
  </svg>);
}
function DocIcon() {
  return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M5 2.5h6l3 3V15a.5.5 0 01-.5.5h-8.5a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M11 2.5v3h3M6.5 9h5M6.5 11.5h5M6.5 7h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>);
}
function GraphIcon() {
  return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M3 14V4M3 14h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M5 11l3-3 2 2 4-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="14" cy="5" r="1.4" fill="currentColor"/>
  </svg>);
}
function NetIcon() {
  return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="4" r="1.6" fill="currentColor"/>
    <circle cx="4" cy="13" r="1.6" fill="currentColor"/>
    <circle cx="14" cy="13" r="1.6" fill="currentColor"/>
    <circle cx="9" cy="10" r="1.6" fill="currentColor"/>
    <path d="M9 5.5v3M7.5 11l-2 1.5M10.5 11l2 1.5" stroke="currentColor" strokeWidth="1.3"/>
  </svg>);
}
function ThemeGlyph({ name }) {
  // Simple iconographic placeholder per theme name
  if (/port/i.test(name))     return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2v8M5 5l4-3 4 3M3 14c2 1 4 1 6-1 2 2 4 2 6 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>);
  if (/min/i.test(name))      return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 15l4-7 3 3 5-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="15" cy="4" r="1.4" fill="currentColor"/></svg>);
  if (/jnim|djih/i.test(name))return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6L9 3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>);
  if (/route|flux/i.test(name))return(<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9c0-3 2-5 5-5s4 3 4 5-2 5-4 5-5-2-5-5z" stroke="currentColor" strokeWidth="1.3"/><path d="M3 9h12M10 5l3 4-3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>);
  if (/énerg|energ|petr|pétr/i.test(name))return(<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2L6 9h2.5L7 16l5-9h-2.5L11 2H9z" fill="currentColor"/></svg>);
  if (/pop/i.test(name))      return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="6" cy="6" r="2.3" stroke="currentColor" strokeWidth="1.3"/><circle cx="12" cy="6" r="2.3" stroke="currentColor" strokeWidth="1.3"/><path d="M2 15c0-2 2-3.5 4-3.5s4 1.5 4 3.5M8 15c0-2 2-3.5 4-3.5s4 1.5 4 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>);
  return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="3" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/></svg>);
}

Object.assign(window, { SidePanel });
