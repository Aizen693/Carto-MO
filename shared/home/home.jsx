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

// ════════════════════════════════════════════════════════════════════════
// VEILLE HEBDOMADAIRE — flux OSINT (cloche + section editoriale)
// Donnees : notifications.json sur la branche veille-data (alimente par n8n).
// Teaser public ; analyse complete + archive reservees aux abonnes.
// ════════════════════════════════════════════════════════════════════════
const VEILLE_REMOTE = 'https://raw.githubusercontent.com/Aizen693/Carto-MO/veille-data/notifications.json';
const SEV = {
  info:     { lbl: 'Signal',   c: '#6B3FA0' },
  alerte:   { lbl: 'Alerte',   c: '#C77A12' },
  critique: { lbl: 'Critique', c: '#B83A4A' },
};
const VEILLE_SEED = [
  { id:'v08', date:'2026-06-15', theatre:'sahel', severite:'alerte', source:'ACLED', source_url:'https://acleddata.com',
    titre:"Le blocus jihadiste autour de Djibo se durcit",
    resume:"Le JNIM resserre son étau sur Djibo : convois ciblés et axes coupés au nord du Burkina.",
    detail:"Sur la semaine écoulée, ACLED recense une hausse nette des embuscades sur les axes Djibo Kongoussi. Le ravitaillement de la ville devient difficile et le risque humanitaire monte d'un cran pour les organisations encore présentes sur zone." },
  { id:'v07', date:'2026-06-14', theatre:'moyen-orient', severite:'critique', source:'ISW', source_url:'https://understandingwar.org',
    titre:"Regain de frappes le long du corridor d'Hodeida",
    resume:"Plusieurs frappes signalées sur les infrastructures portuaires de la mer Rouge.",
    detail:"L'Institute for the Study of War documente une série de frappes visant les installations portuaires d'Hodeida. La logistique maritime régionale est directement exposée, avec un report possible du trafic vers des routes alternatives." },
  { id:'v06', date:'2026-06-13', theatre:'rdc', severite:'alerte', source:'Kivu Security Tracker', source_url:'https://kivusecurity.org',
    titre:"Progression du M23 confirmée vers Uvira",
    resume:"Mouvements de colonnes observés au sud du lac Kivu.",
    detail:"Le Kivu Security Tracker confirme des mouvements du M23 en direction d'Uvira. Plusieurs localités changent de contrôle. La pression sur les axes commerciaux vers le Burundi s'accentue." },
  { id:'v05', date:'2026-06-12', theatre:'asie-sud', severite:'info', source:'Bellingcat', source_url:'https://www.bellingcat.com',
    titre:"Renforts observés le long de la Ligne de contrôle",
    resume:"L'imagerie satellite montre de nouveaux déploiements au Cachemire.",
    detail:"L'analyse d'imagerie ouverte met en évidence de nouveaux cantonnements et un trafic logistique accru le long de la Ligne de contrôle. À surveiller comme signal précoce d'une montée de tension." },
  { id:'v04', date:'2026-06-11', theatre:'afrique', severite:'info', source:'IMB Piracy Reporting Centre', source_url:'https://www.icc-ccs.org',
    titre:"Pic d'approches suspectes dans le golfe de Guinée",
    resume:"Trois tentatives d'abordage rapportées en une semaine au large du Nigeria.",
    detail:"Le Bureau maritime international relève trois approches hostiles en une semaine. Le mode opératoire reste l'enlèvement d'équipage. Les armateurs adaptent leurs routes et leurs vitesses de transit." },
  { id:'v03', date:'2026-06-10', theatre:'madagascar', severite:'info', source:'Presse régionale', source_url:'',
    titre:"Tensions sociales à Antananarivo",
    resume:"Manifestations et coupures de courant signalées dans la capitale.",
    detail:"Plusieurs rassemblements liés aux coupures d'électricité sont rapportés dans la capitale. La situation reste contenue mais mérite un suivi rapproché pour les implantations locales." },
  { id:'v02', date:'2026-06-09', theatre:'sahel', severite:'info', source:'RFI', source_url:'https://www.rfi.fr',
    titre:"Nouvelle vague de recrutement des VDP au Burkina",
    resume:"Les autorités annoncent un renfort des supplétifs civils.",
    detail:"Une nouvelle campagne de recrutement de Volontaires pour la Défense de la Patrie est annoncée. L'encadrement et l'équipement de ces unités restent un point de vigilance documenté." },
  { id:'v01', date:'2026-06-08', theatre:'moyen-orient', severite:'alerte', source:'MarineTraffic', source_url:'https://www.marinetraffic.com',
    titre:"Concentration navale inhabituelle en mer Rouge",
    resume:"Une densité anormale de bâtiments militaires est détectée.",
    detail:"Le suivi AIS révèle une concentration inhabituelle de bâtiments dans le sud de la mer Rouge. Le signal est cohérent avec une posture de dissuasion autour du détroit de Bab el Mandeb." },
];

function veilleZone(k){ return ZONE_LABELS[k] || k; }
function veilleDateFR(d){ try { return new Date(d).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}); } catch(e){ return d; } }
function srcLogo(url){ try { return 'https://www.google.com/s2/favicons?domain=' + new URL(url).hostname + '&sz=128'; } catch(e){ return null; } }
function reliabilityOf(s){ s = (s||'').toLowerCase();
  if (/acled|isw|bellingcat|kivu|reuters|afp|crisis|hrw|amnesty|\bonu\b|\bun\b|imb|janes/.test(s)) return 'Élevée';
  if (/rfi|guardian|\bbbc\b|france 24|le monde|trt|jazeera|figaro|ap\b/.test(s)) return 'Établie';
  return 'À recouper'; }
function VBlock({ v }){
  if (Array.isArray(v) && v.length) return (<ul className="vreport__ul">{v.map((x,i)=>(<li key={i}>{x}</li>))}</ul>);
  return <p>{Array.isArray(v) ? v.join(' ') : v}</p>;
}

function useVeille(){
  const [items,setItems]=useState(VEILLE_SEED);
  useEffect(()=>{ let on=true;
    fetch(VEILLE_REMOTE,{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject())
      .then(d=>{ const a=Array.isArray(d)?d:(d.items||[]); if(on&&a.length) setItems(a.slice().sort((x,y)=>String(y.date).localeCompare(String(x.date)))); })
      .catch(()=>{});
    return ()=>{on=false;};
  },[]);
  return items;
}
function useSubscriber(){
  // Connecte = acces complet aux notes d'analyse. La detection s'aligne sur
  // site-auth.js : etat initial (window.algorAuthState) + evenement de session
  // (« algorAuthStateChanged », emis sur toutes les pages, accueil compris) +
  // filet via le client Supabase. L'ancienne version n'ecoutait que
  // « algorAuthReady » (jamais emis sur l'accueil public) → cadenas a tort.
  const [sub,setSub]=useState(()=> !!(window.algorAuthState && window.algorAuthState.loggedIn));
  useEffect(()=>{ let on=true;
    const apply=(v)=>{ if(on) setSub(!!v); };
    if(window.algorAuthState) apply(window.algorAuthState.loggedIn);
    const onState=(e)=> apply(e && e.detail && e.detail.loggedIn);
    window.addEventListener('algorAuthStateChanged', onState);
    const probe=()=>{ try{ const a=window.algorAuth; if(a&&a.supabase&&a.supabase.auth){ a.supabase.auth.getSession().then(({data})=>apply(!!(data&&data.session))).catch(()=>{}); } }catch(e){} };
    probe(); window.addEventListener('algorAuthReady', probe);
    return ()=>{ on=false; window.removeEventListener('algorAuthStateChanged', onState); window.removeEventListener('algorAuthReady', probe); };
  },[]);
  return sub;
}

function VeilleCard({ it, onOpen }){
  const sev = SEV[it.severite] || SEV.info;
  return (
    <article className="vcard" onClick={onOpen} tabIndex="0" onKeyDown={(e)=>{ if(e.key==='Enter') onOpen(); }}>
      <div className="vcard__media" data-zone={it.theatre}>
        {it.image ? <img className="vcard__img" src={it.image} alt="" loading="lazy" onError={(e)=>{ e.target.style.display='none'; }} /> : null}
        <span className="vcard__grid" aria-hidden="true" />
        {srcLogo(it.source_url) ? <img className="vcard__logo" src={srcLogo(it.source_url)} alt={it.source} loading="lazy" onError={(e)=>{ e.target.style.display='none'; }} /> : null}
        <span className="vcard__src">{it.source}</span>
        <span className="vcard__sev" style={{ color: sev.c, borderColor: sev.c+'59', background: sev.c+'14' }}>{sev.lbl}</span>
      </div>
      <div className="vcard__body">
        <div className="vcard__meta"><span className="vcard__zone">{veilleZone(it.theatre)}</span><span className="vcard__date">{veilleDateFR(it.date)}</span></div>
        <h3 className="vcard__title">{it.titre}</h3>
        <p className="vcard__resume">{it.resume}</p>
        <span className="vcard__more">Lire <Arrow /></span>
      </div>
    </article>
  );
}
function VeilleRow({ it, onOpen }){
  const sev = SEV[it.severite] || SEV.info;
  return (
    <button className="vrow" onClick={onOpen}>
      <span className="vrow__dot" style={{ background: sev.c }} />
      <span className="vrow__body">
        <span className="vrow__meta">{veilleZone(it.theatre)} · {veilleDateFR(it.date)} · {it.source}</span>
        <span className="vrow__t">{it.titre}</span>
      </span>
    </button>
  );
}
function VeilleModal({ it, sub, onClose }){
  const sev = SEV[it.severite] || SEV.info;
  useEffect(()=>{ const h=(e)=>{ if(e.key==='Escape') onClose(); }; window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h); },[]);
  return (
    <div className="vmodal-scrim" onClick={onClose}>
      <div className="vmodal" onClick={(e)=>e.stopPropagation()}>
        <button className="vmodal__x" onClick={onClose} aria-label="Fermer">✕</button>
        <div className="vmodal__media" data-zone={it.theatre}>
          {it.image ? <img src={it.image} alt="" onError={(e)=>{ e.target.style.display='none'; }} /> : null}
          <span className="vcard__grid" aria-hidden="true" />
          {srcLogo(it.source_url) ? <img className="vcard__logo" src={srcLogo(it.source_url)} alt={it.source} onError={(e)=>{ e.target.style.display='none'; }} /> : null}
          <span className="vcard__src">{it.source}</span>
        </div>
        <div className="vmodal__body">
          <div className="vcard__meta">
            <span className="vcard__zone">{veilleZone(it.theatre)}</span>
            <span className="vcard__date">{veilleDateFR(it.date)}</span>
            <span className="vcard__sev" style={{ color: sev.c, borderColor: sev.c+'59', background: sev.c+'14' }}>{sev.lbl}</span>
          </div>
          <h3 className="vmodal__title">{it.titre}</h3>
          <p className="vmodal__resume">{it.resume}</p>
          {sub ? (
            <div className="vreport">
              <div className="vreport__class">Note d'analyse · Accès abonné</div>
              <div className="vreport__sec">
                <div className="vreport__lbl">Analyse</div>
                <p>{it.detail || it.resume}</p>
              </div>
              {it.implications && (Array.isArray(it.implications) ? it.implications.length : it.implications) ? (
                <div className="vreport__sec">
                  <div className="vreport__lbl">Implications opérationnelles</div>
                  <VBlock v={it.implications} />
                </div>
              ) : null}
              <div className="vreport__sec vreport__reco">
                <div className="vreport__lbl">Recommandations · que faire de cette information</div>
                {it.recommandations && (Array.isArray(it.recommandations) ? it.recommandations.length : it.recommandations)
                  ? <VBlock v={it.recommandations} />
                  : <p className="vreport__muted">À partir de ce signal, nos analystes produisent sur demande une note d'impact dédiée à votre organisation : exposition, scénarios probables et mesures à prendre.</p>}
              </div>
              <div className="vreport__sec">
                <div className="vreport__lbl">Sources et fiabilité</div>
                <div className="vreport__srcrow">
                  {it.source_url
                    ? <a className="vmodal__srclink" href={it.source_url} target="_blank" rel="noopener">{it.source} ↗</a>
                    : <span className="vreport__srcname">{it.source}</span>}
                  <span className="vreport__rel">Fiabilité · {reliabilityOf(it.source)}</span>
                </div>
              </div>
              <a className="vreport__cta" href="/contact/">
                Demander un brief approfondi sur ce sujet
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </a>
              <a className="vreport__map" href={'/veille-carte/?focus=' + encodeURIComponent(it.id)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-6 2V6l6-2 6 2 6-2v16l-6 2-6-2z"/><path d="M9 4v16M15 6v16"/></svg>
                Voir ce signal sur la carte de veille
              </a>
            </div>
          ) : (
            <div className="vmodal__gate">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6B3FA0" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <div className="vmodal__gate-t">Note d'analyse réservée aux abonnés</div>
              <div className="vmodal__gate-s">Chaque signal est livré sous forme de note exploitable. L'abonnement ouvre l'accès complet :</div>
              <ul className="vgate__list">
                <li>Analyse détaillée et mise en contexte</li>
                <li>Implications opérationnelles pour votre organisation</li>
                <li>Recommandations actionnables</li>
                <li>Sources vérifiables et niveau de fiabilité</li>
              </ul>
              <a className="btn btn--primary" href="/offres/">Voir les offres</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VeilleSystem(){
  const items = useVeille();
  const sub = useSubscriber();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(null);
  const [seen, setSeen] = useState(()=>{ try { return localStorage.getItem('algor-veille-seen') || ''; } catch(e){ return ''; } });
  const latest = items.reduce((m,it)=> (it.date > m ? it.date : m), '');
  const unread = items.filter(it => (it.date||'') > seen).length;
  useEffect(()=>{ if(open){ try{ localStorage.setItem('algor-veille-seen', latest); }catch(e){} setSeen(latest); } },[open, latest]);

  return (
    <>
      <section className="home-sec veille-sec" id="veille">
        <div className="home-sec__wrap">
          <div className="veille-sec__head">
            <SectionHead eyebrow="Veille · mise à jour hebdomadaire"
              title="Ce que notre veille a" em="capté cette semaine"
              intro="Flux OSINT consolidé en continu sur nos six théâtres. Sélection sourcée et datée. L'analyse complète et l'archive sont réservées aux abonnés." />
            <span className="veille-live"><span className="veille-live__dot" />Veille active</span>
          </div>
          <div className="veille-grid">
            {items.slice(0,6).map(it => <VeilleCard key={it.id} it={it} onOpen={()=>setSel(it)} />)}
          </div>
          <div className="veille-sec__foot">
            <button className="btn--ghost-link" onClick={()=>setOpen(true)}>Tout le fil de veille <ArrowDiag /></button>
          </div>
        </div>
      </section>

      {ReactDOM.createPortal(
      <>
      <button className="veille-bell" aria-label="Fil de veille" onClick={()=>setOpen(true)}>
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
        {unread>0 && <span className="veille-bell__badge">{unread}</span>}
      </button>

      <div className={'veille-panel-scrim'+(open?' is-open':'')} onClick={()=>setOpen(false)} />
      <aside className={'veille-panel'+(open?' is-open':'')} aria-hidden={!open}>
        <div className="veille-panel__head">
          <div><div className="veille-panel__t">Fil de veille</div><div className="veille-panel__s">OSINT · six théâtres</div></div>
          <button className="veille-panel__x" onClick={()=>setOpen(false)} aria-label="Fermer">✕</button>
        </div>
        <div className="veille-panel__list">
          {items.map(it => <VeilleRow key={it.id} it={it} onOpen={()=>setSel(it)} />)}
        </div>
        <div className="veille-panel__foot">Veille alimentée en continu. Analyse complète réservée aux abonnés.</div>
      </aside>

      {sel && <VeilleModal it={sel} sub={sub} onClose={()=>setSel(null)} />}
      </>,
      document.body
      )}
    </>
  );
}

function HomeView({ onEnter, onConsole, clock, videoStyle }) {
  // Abonné connecté OU aperçu forcé (?apercu=1) → vue outil (pas la démo).
  const sub = useSubscriber() || /[?&]apercu=1/.test(window.location.search);
  return (
    <>
    <main className="view-enter view-enter-active">
      <section className="hero">
        <div className="hero__copy">
          <h1 className="hero__title">
            Anticiper les risques<br />
            <em>opérationnels</em>
          </h1>

          <p className="hero__lede">
            Théâtres géopolitiques suivis en continu pour les directions sûreté, cabinets d'analyse et rédactions spécialisées. Solution souveraine française, vos données hébergées en Europe : chaque événement sourcé, daté et auditable.
          </p>

          <div className="hero__cta-row">
            <a className="btn btn--primary btn--lg btn--neon" href="/theatres/">
              <span className="btn-neon btn-neon--top" aria-hidden="true" />
              Découvrir les théâtres
              <Arrow />
              <span className="btn-neon btn-neon--bottom" aria-hidden="true" />
            </a>
            <a className="btn--ghost-link" href="/offres/">
              Voir les offres
              <ArrowDiag />
            </a>
          </div>

          <div className="hero__demo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {sub ? (
              <span>Indiquez <strong>un pays suivi</strong> dans la barre sous le globe pour ouvrir sa carte de renseignement HUMINT : événements, acteurs et dates, filtrables.</span>
            ) : (
              <span>Essayez la démo : indiquez <strong>n'importe quelle ville, région ou pays du monde</strong> dans la barre de recherche, sous le globe.
                <em className="hero__demo-warn">Données fictives, à titre d'illustration du rendu de nos cartes.</em>
              </span>
            )}
          </div>
        </div>

        <div className="hero__visual">
          <Globe />
        </div>
      </section>

      <VeilleSystem />
      <GetSection />
      <DiffSection />
      <AudienceSection />
      <CompareSection />
    </main>
    <SiteFooter />
    </>
  );
}

// ─── Pied de page — sobre, dans la DA client (violet/blanc/Jakarta).
const FOOT_COLS = [
  { head: 'Plateforme', links: [
    ['Théâtres', '/theatres/'],
    ['Offres', '/offres/'],
    ['Méthodologie', '/methodologie/'],
    ['La plateforme', '/plateforme/'],
  ] },
  { head: 'Théâtres suivis', links: [
    ['Sahel', '/sahel/'],
    ['Moyen-Orient', '/moyen-orient/'],
    ['RDC', '/rdc/'],
    ['Afrique', '/afrique/'],
  ] },
  { head: 'Société', links: [
    ['À propos', '/a-propos/'],
    ['Débunkage', '/debunkage/'],
    ['Contact', '/contact/'],
  ] },
];

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__wrap">
        <div className="site-footer__brand">
          <div className="brand__name">ALGOR INT</div>
          <p className="site-footer__tag">
            Renseignement géopolitique. Six théâtres à risque suivis en continu, chaque événement sourcé, daté et auditable.
          </p>
        </div>
        <nav className="site-footer__cols" aria-label="Liens de pied de page">
          {FOOT_COLS.map((c) => (
            <div className="site-footer__col" key={c.head}>
              <div className="site-footer__head">{c.head}</div>
              {c.links.map(([label, href]) => (
                <a className="site-footer__link" href={href} key={href}>{label}</a>
              ))}
            </div>
          ))}
        </nav>
      </div>
      <div className="site-footer__bar">
        <span>© 2026 Algor Int · Tous droits réservés</span>
        <span className="site-footer__legal">
          <a href="/mentions-legales/">Mentions légales</a>
          <a href="/confidentialite/">Confidentialité</a>
          <a href="/contact/">Contact</a>
        </span>
      </div>
    </footer>
  );
}

// ─── Trust band : chiffres clés juste sous le hero
function TrustBand() {
  const items = [
    { value: '6',         label: 'Théâtres suivis en continu' },
    { value: '500+',      label: 'Sources OSINT croisées' },
    { value: 'Quotidien', label: 'Rythme de mise à jour' },
    { value: '2005',      label: "Année d'historique la plus ancienne" },
  ];
  return (
    <section className="trust-band">
      <div className="trust-band__wrap">
        {items.map((it, i) => (
          <div className="trust-band__item" key={i}>
            <div className="trust-band__value">{it.value}</div>
            <div className="trust-band__label">{it.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Production récente : 3 notes les plus récentes (sans signature)
const PRODUCTION_ITEMS = [
  { zone: 'Sahel',        zoneSlug: 'sahel',        date: '14 mars 2026', tag: 'Synthèse', title: 'JNIM, pattern attaques Mali-Burkina' },
  { zone: 'Moyen-Orient', zoneSlug: 'moyen-orient', date: '12 mars 2026', tag: 'Synthèse', title: 'Reconfiguration des forces chiites en Syrie' },
  { zone: 'RDC',          zoneSlug: 'rdc',          date: '11 mars 2026', tag: 'Hebdo',    title: 'M23 / FARDC, ligne de front Kivu' },
];

function ProductionSection() {
  return (
    <section className="home-sec home-sec--alt">
      <div className="home-sec__wrap">
        <SectionHead
          eyebrow="Production récente"
          title="Trois dernières notes,"
          em="sur les théâtres actifs"
          intro="Notes synthétiques produites en interne, datées et sourcées. Mise à jour continue sur chacun des six théâtres." />
        <div className="prod-grid">
          {PRODUCTION_ITEMS.map((p, i) => (
            <a className="prod-card" key={i} href={`/${p.zoneSlug}/`}>
              <div className="prod-card__head">
                <span className="prod-card__zone">{p.zone}</span>
                <span className="prod-card__date">{p.date}</span>
              </div>
              <h3 className="prod-card__title">{p.title}</h3>
              <div className="prod-card__foot">
                <span className="prod-card__tag">{p.tag}</span>
                <span className="prod-card__arrow">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7h7M7 3.5L10.5 7 7 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Sections de presentation — structure marketing par sections (inspiration vigideep).

function SectionHead({ eyebrow, title, em, intro }) {
  return (
    <div className="home-sec__head">
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="home-sec__title">{title} <em>{em}</em></h2>
      {intro && <p className="home-sec__intro">{intro}</p>}
    </div>
  );
}

// Cadre visuel reserve — en attente des captures definitives.
function MediaFrame({ label }) {
  return (
    <div className="media-frame" role="img" aria-label={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.6" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
      <span className="media-frame__label">{label}</span>
    </div>
  );
}

// ── 1. Ce que vous obtenez — livrables concrets, ton commercial.
const HOME_GET = [
  { tag: "La carte",
    t: "Une carte de situation",
    d: "Chaque pays sur une carte interactive : incidents, acteurs et zones se lisent d'un coup d'oeil, là où il faudrait autrement compiler des dizaines d'articles.",
    img: "/shared/home/assets/get-carte.jpg?v=20260622c",
    vid: "/shared/home/assets/get-carte.mp4?v=20260622f",
    gif: "/shared/home/assets/get-carte.gif?v=20260622e",
    auto: false,
    alt: "Carte de situation Algor Access : incidents et acteurs géolocalisés, ici le Mali" },
  { tag: "L'analyse",
    t: "Une lecture analytique immédiate",
    d: "Pour chaque pays, la répartition des incidents par région, par type et par acteur, calculée automatiquement à partir des données collectées.",
    img: "/shared/home/assets/get-analyse.jpg?v=20260622c",
    vid: "/shared/home/assets/get-analyse.mp4?v=20260622f",
    gif: "/shared/home/assets/get-analyse.gif?v=20260622e",
    auto: false,
    alt: "Panneau d'analyse : répartition des incidents par région, type et acteur" },
  { tag: "L'accès",
    t: "Un accès continu",
    d: "Plutôt qu'un rapport figé, une plateforme mise à jour chaque semaine, consultable au moment où la décision se pose.",
    img: "/shared/home/assets/get-acces.jpg?v=20260622i",
    vid: "/shared/home/assets/get-acces.mp4?v=20260622i",
    gif: "/shared/home/assets/get-acces.gif?v=20260622e",
    auto: false,
    alt: "Plateforme Algor Access : couverture continue, ici la région des Grands Lacs" },
];

function GetSection() {
  // Les vidéos en lecture auto (data-auto) jouent quand elles entrent dans la vue
  // et se mettent en pause quand on sort — la compilation est visible sans survol.
  useEffect(() => {
    const vids = document.querySelectorAll('video[data-auto="1"]');
    if (!vids.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) { v.playbackRate = 2.2; v.play().catch(() => {}); }
        else v.pause();
      });
    }, { threshold: 0.25 });
    vids.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, []);
  return (
    <section className="home-sec home-sec--alt" id="offre">
      <div className="home-sec__wrap">
        <SectionHead
          eyebrow="Ce que vous obtenez"
          title="De la donnée brute"
          em="à la décision"
          intro="Trois outils pour lire une situation, en évaluer la portée et y revenir quand la décision se pose." />
        <div className="get-grid">
          {HOME_GET.map((g, i) => (
            <article className="get-card get-card--solo" key={i}
              onMouseEnter={(e) => { if (g.auto) return; const v = e.currentTarget.querySelector('video'); if (v) v.play().catch(() => {}); }}
              onMouseLeave={(e) => { if (g.auto) return; const v = e.currentTarget.querySelector('video'); if (v) { v.pause(); v.currentTime = 0; } }}
              onClick={(e) => { if (g.auto) return; const v = e.currentTarget.querySelector('video'); if (!v) return; if (v.paused) v.play().catch(() => {}); else { v.pause(); v.currentTime = 0; } }}>
              <div className="get-card__media">
                <video poster={g.img} muted loop playsInline preload="metadata"
                       style={{ backgroundImage: `url("${g.img}")`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
                       aria-label={g.alt} tabIndex={0}
                       onFocus={(e) => { e.currentTarget.play().catch(() => {}); }}
                       onBlur={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}>
                  <source src={g.vid} type="video/mp4" />
                </video>
                <span className="get-card__playhint" aria-hidden="true">
                  <svg width="13" height="13" viewBox="0 0 18 18" fill="currentColor"><path d="M5 3.5v11l10-5.5z" /></svg>
                  Survolez pour l'aperçu
                </span>
              </div>
              <div className="get-card__body">
                <span className="get-card__tag">{g.tag}</span>
                <h3 className="get-card__title">{g.t}</h3>
                <p className="get-card__text">{g.d}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 2. Notre difference — la vraie plus-value, sans repeter le hero.
const HOME_DIFF = [
  { icon: "terrain",
    t: "Une connaissance du terrain",
    d: "Chaque théâtre est suivi dans la durée par des analystes qui en connaissent le contexte, les acteurs et les dynamiques. Cette familiarité permet de hiérarchiser l'information et d'en restituer la portée réelle." },
  { icon: "rigueur",
    t: "La rigueur du renseignement",
    d: "Croisement des sources, datation et cotation de la fiabilité : chaque information est vérifiée avant d'être cartographiée." },
  { icon: "temps",
    t: "La lecture dans le temps",
    d: "Nos théâtres se relisent période par période. Au-delà de l'événement du jour, vous suivez la façon dont une situation s'installe et évolue." },
];

function PillarIcon({ name }) {
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
    "aria-hidden": "true",
  };
  const defs = (
    <defs>
      <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6B3FA0" />
        <stop offset="48%" stopColor="#5650C6" />
        <stop offset="100%" stopColor="#2E84D4" />
      </linearGradient>
    </defs>
  );
  if (name === "terrain") {
    return (
      <svg {...common}>
        {defs}
        <circle cx="32" cy="32" r="27" />
        <circle cx="32" cy="18" r="3.2" fill={grad} stroke="none" />
        <path d="M27 23 C 26 28 26 34 27 38 L 37 38 C 38 34 38 28 37 23 Q 32 20 27 23 Z" />
        <path d="M32 38 L 32 50" />
        <path d="M32 46 Q 23 46 19 41 Q 25 40 32 43" />
        <path d="M32 46 Q 41 46 45 41 Q 39 40 32 43" />
        <path d="M32 49 Q 26 52 22 50 Q 26 47 31 48.5" />
        <path d="M32 49 Q 38 52 42 50 Q 38 47 33 48.5" />
      </svg>
    );
  }
  if (name === "rigueur") {
    return (
      <svg {...common}>
        {defs}
        <circle cx="32" cy="32" r="27" />
        <path d="M32 13 L 47 17 L 47 31 Q 47 43 32 51 Q 17 43 17 31 L 17 17 Z" />
        <line x1="32" y1="33" x2="32" y2="22" />
        <line x1="32" y1="33" x2="22" y2="27" />
        <line x1="32" y1="33" x2="42" y2="27" />
        <line x1="32" y1="33" x2="24" y2="41" />
        <line x1="32" y1="33" x2="40" y2="41" />
        <circle cx="32" cy="22" r="2.4" fill={grad} stroke="none" />
        <circle cx="22" cy="27" r="2.4" fill={grad} stroke="none" />
        <circle cx="42" cy="27" r="2.4" fill={grad} stroke="none" />
        <circle cx="24" cy="41" r="2.4" fill={grad} stroke="none" />
        <circle cx="40" cy="41" r="2.4" fill={grad} stroke="none" />
        <circle cx="32" cy="33" r="3" fill={grad} stroke="none" />
      </svg>
    );
  }
  if (name === "temps") {
    return (
      <svg {...common}>
        {defs}
        <circle cx="32" cy="32" r="27" strokeDasharray="3 3.5" />
        <circle cx="32" cy="32" r="17" />
        <line x1="32" y1="18" x2="32" y2="22" />
        <line x1="46" y1="32" x2="42" y2="32" />
        <line x1="32" y1="46" x2="32" y2="42" />
        <line x1="18" y1="32" x2="22" y2="32" />
        <line x1="40.5" y1="20.5" x2="38.7" y2="23.5" />
        <line x1="43.5" y1="40.5" x2="40.5" y2="38.7" />
        <line x1="23.5" y1="43.5" x2="25.3" y2="40.5" />
        <line x1="20.5" y1="23.5" x2="23.5" y2="25.3" />
        <line x1="32" y1="32" x2="26" y2="27" />
        <line x1="32" y1="32" x2="39" y2="24" />
        <circle cx="32" cy="32" r="1.6" fill={grad} stroke="none" />
      </svg>
    );
  }
  return null;
}

function DiffSection() {
  return (
    <section className="home-sec" id="difference">
      <div className="home-sec__wrap">
        <SectionHead
          eyebrow="Notre approche"
          title="Notre approche du"
          em="renseignement"
          intro="Trois principes guident la façon dont nous traitons et restituons l'information." />
        <div className="pillar-list">
          {HOME_DIFF.map((p, i) => (
            <article className="pillar" key={i}>
              <span className="pillar__num">{String(i + 1).padStart(2, '0')}</span>
              <div className="pillar__body">
                <h3 className="pillar__title">{p.t}</h3>
                <p className="pillar__text">{p.d}</p>
              </div>
              <span className="pillar__icon" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: '56px', lineHeight: 1, background: 'linear-gradient(130deg, #6B3FA0, #5650C6, #1E6FBE)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{String(i + 1).padStart(2, '0')}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 3. Pour qui — segments clients.
const HOME_AUD = [
  { t: "Décideurs & directions",
    d: "Arbitrer rapidement sur un risque-pays, sans avoir à dépouiller la presse." },
  { t: "Sûreté & sécurité",
    d: "Évaluer la menace sur des sites, des trajets et des implantations." },
  { t: "Conseil & due diligence",
    d: "Étayer une recommandation avec des sources datées et sourcées." },
  { t: "Opérateurs sur zone",
    d: "ONG, industriels et logisticiens présents sur des théâtres sensibles." },
];

function AudienceSection() {
  return (
    <section className="home-sec home-sec--alt" id="pour-qui">
      <div className="home-sec__wrap">
        <SectionHead
          eyebrow="Pour qui"
          title="À qui s'adresse"
          em="Algor Access"
          intro="Des profils différents, un même besoin : une lecture fiable et datée des théâtres à risque." />
        <div className="aud-grid">
          {HOME_AUD.map((a, i) => (
            <article className="aud-card" key={i}>
              <span className="aud-card__rule" />
              <h3 className="aud-card__title">{a.t}</h3>
              <p className="aud-card__text">{a.d}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 4. Comparatif — retravaille : police plus large, lignes orientees plus-value.
const COMPARE_ROWS = [
  ["Datation",                "Variable, parfois absente",       "Systématique, horodatée"],
  ["Connaissance du terrain", "Limitée aux canaux publics",      "Suivi continu par des analystes dédiés"],
  ["Vérification",            "Au cas par cas",                  "Croisement systématique avant publication"],
  ["Fiabilité",               "Non évaluée",                     "Cotée, source par source"],
  ["Profondeur",              "L'actualité du jour",             "La situation rejouable dans le temps"],
  ["Lecture",                 "Du texte à compiler soi-même",    "Une carte de situation immédiate"],
];

function CompareSection() {
  return (
    <section className="home-sec" id="comparatif">
      <div className="home-sec__wrap">
        <SectionHead
          eyebrow="Comparatif"
          title="Le suivi d'actualité"
          em="et la plateforme"
          intro="Deux façons de suivre une zone : voici ce qui les distingue, critère par critère." />
        <div className="cmp-table">
          <div className="cmp-table__row cmp-table__row--head">
            <div className="cmp-table__cell">Critère</div>
            <div className="cmp-table__cell">Fil d'actualité & presse</div>
            <div className="cmp-table__cell cmp-table__cell--pos">Algor Access</div>
          </div>
          {COMPARE_ROWS.map(([c, neg, pos], i) => (
            <div className="cmp-table__row" key={i}>
              <div className="cmp-table__cell cmp-table__crit">{c}</div>
              <div className="cmp-table__cell cmp-table__neg">{neg}</div>
              <div className="cmp-table__cell cmp-table__cell--pos cmp-table__pos">{pos}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const HOME_VIDEOS = [
  { cat: 'Veille',     title: 'Cartographie OSINT en temps réel',                meta: 'Plateforme · 2 min 14',    duration: '2:14' },
  { cat: 'Influence',  title: 'Analyse multicouche du théâtre sahélien',         meta: 'Étude de cas · 3 min 02',  duration: '3:02' },
  { cat: 'Protection', title: 'Évaluation de menaces sur les infrastructures',   meta: 'Mission · 4 min 28',       duration: '4:28' },
  { cat: 'Méthode',    title: 'De la donnée brute au rapport décisionnel',       meta: 'Coulisses · 2 min 47',     duration: '2:47' },
  { cat: 'Terrain',    title: 'Réseaux djihadistes au Sahel : pattern 2026',     meta: 'Décryptage · 5 min 12',    duration: '5:12' },
];

function VideoBand({ style = 'strip' }) {
  return (
    <section className={`video-band video-band--${style}`}>
      <div className="video-band__head">
        <div>
          <span className="eyebrow">Notre travail en images</span>
          <h2 className="video-band__title">
            Capsules <em>vidéos</em> · activités Algor Int
          </h2>
        </div>
        <p className="video-band__intro">
          Cinq formats courts pour comprendre nos méthodes, nos terrains et nos livrables. Glissez horizontalement pour parcourir.
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
        <div className="video-card__cat">{cat}</div>
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
      {soon && <span className="console-tab__badge">Bientôt</span>}
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
          &larr; Retour à l'accueil
        </a>
        <h1 className="hero__title">
          Console <em>interne</em>
        </h1>
        <p className="hero__lede">
          Outil de travail des analystes Algor Int sur six théâtres : Moyen-Orient, Sahel, RDC, Madagascar, Afrique Maritime, Asie du Sud. Imagerie satellite, ACLED, GDELT, presse d'État, OSINT social et flux Telegram sont agrégés sur une carte unique, sourcée, datée et auditable événement par événement.
        </p>

        <div className="console-tabs">
          <ConsoleTab
            href="/admin/"
            label="Carto"
            popTitle="Cartographie OSINT"
            popText="Edition des points, acteurs et calques sur les 6 théâtres. Ouvre la console d'administration cartographique."
            icon={<><path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" /></>}
          />
          <ConsoleTab
            onClick={onArchives}
            label="Archives"
            popTitle="Archives"
            popText="Tous les points cartographiés des 6 théâtres, conservés en base. Consultable sous forme de tableau, par théâtre."
            icon={<><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></>}
          />
          <ConsoleTab
            onClick={onVeille}
            label="Veille"
            popTitle="Veille"
            popText="Agregateur d'articles OSINT : chargement, filtres, scoring et exports. Outil de veille interne."
            icon={<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>}
          />
          <ConsoleTab
            href="/cloud/"
            label="Cloud"
            popTitle="Cloud"
            popText="Plateforme collaborative de l'équipe : base de sources, documents, suivi client, comptes rendus et synthèses, synchronises."
            icon={<><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></>}
          />
          <ConsoleTab
            href="/debunkage/carte-afrique.html"
            label="Dossiers"
            popTitle="Dossiers clients"
            popText="Dossiers d'analyse reserves a l'equipe interne. Acces verrouille (compte editeur ou admin)."
            icon={<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 13a3 3 0 1 1 6 0" /><path d="M12 13v3" /></>}
          />
          <ConsoleTab
            soon
            label="Rapport"
            popTitle="Rapport"
            popText="Generation de rapports d'analyse decisionnels. Bientôt disponible."
            icon={<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5" /><path d="M9 13h6M9 17h6" /></>}
          />
          <ConsoleTab
            soon
            label="Graph"
            popTitle="Graph"
            popText="Visualisation des réseaux et relations en graphes. Bientôt disponible."
            icon={<><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M8.2 7.3l7.6 3.4M8.2 16.7l7.6-3.4" /></>}
          />
        </div>
      </section>
    </main>
  );
}

// Page « Veille » — outil de veille OSINT (app Streamlit Algor Int) intégré en cadre.
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
          &larr; Retour à la console
        </button>
      </div>
    </div>,
    document.body
  );
}

// Page « Archives » — dashboard de tous les points, par théâtre (lecture base Supabase).
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

  // Esc ferme le détail
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
          &larr; Retour à la console
        </a>
        <h1 className="hero__title">Archives <em>des points</em></h1>
        <p className="hero__lede">
          Tous les points cartographiés, regroupés par théâtre. Conservés en base même après retrait des cartes.
        </p>

        {points && points.length > 0 && (
          <div className="dash-search">
            <div className="search-input">
              <DashSearchIcon />
              <input
                placeholder="Rechercher un point : nom, description, période, théâtre..."
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
          <div className="dash-msg">Aucun résultat pour « {query} ».</div>
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
                    <th>Nom</th><th>Période</th><th>Latitude</th>
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
                        <td>{p.name || '·'}</td>
                        <td>{p.period || '·'}</td>
                        <td>{c[1] != null ? Number(c[1]).toFixed(4) : '·'}</td>
                        <td>{c[0] != null ? Number(c[0]).toFixed(4) : '·'}</td>
                        <td>{p.casualties || 0}</td>
                        <td>
                          {p.deleted
                            ? <span className="dash-tag dash-tag--archived">Archivé</span>
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
// même logique que l'ancien pop-up des cartes (shared/engine.js parseDesc).
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
    else if (k === 'événement' || k === 'evenement') r.event = v;
    else if (k === 'détail' || k === 'detail') r.détail = v;
  });
  return Object.keys(r).length ? r : null;
}

// Popup détail d'un point — reprend le contenu de l'ancien pop-up des cartes.
function PointDetail({ point, onClose }) {
  const c = Array.isArray(point.coordinates) ? point.coordinates : [];
  const lng = c[0] != null ? Number(c[0]).toFixed(5) : '·';
  const lat = c[1] != null ? Number(c[1]).toFixed(5) : '·';
  const created = point.created_at
    ? new Date(point.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '·';
  const d = parsePointDesc(point.description);

  const eventRows = [];
  if (d) {
    if (d.date) eventRows.push(['Date', d.date]);
    if (d.pays) eventRows.push(['Pays', d.pays]);
    if (d.event) eventRows.push(['Événement', d.event]);
    if (d.détail) eventRows.push(['Détail', d.détail]);
  }
  const metaRows = [
    ['Théâtre', ZONE_LABELS[point.zone] || point.zone],
    ['Coordonnées', lat + ', ' + lng],
    ['Victimes', String(point.casualties || 0)],
    ['Statut', point.deleted ? 'Archivé (retiré des cartes)' : 'Actif'],
    ['Ajouté le', created],
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
