/* global React, d3, topojson */
// Globe interactif D3 orthographique — repris a l'identique du site Algor Int.
// Geometrie reelle (topojson world-atlas countries-110m), 6 theatres, flux animes.
// Seule difference vs le site : palette recoloree — terres sable, mers bleu ciel doux.

const { useEffect: useEffectGlobe, useRef: useRefGlobe, useState: useStateGlobe } = React;

// ═══════════════════════════════════════════════════════
//  MODE DÉMO — recherche d'une zone → zoom + points fictifs + cartes HUD
//  100 % fictif, aucune donnée client. Design aligné sur le reste du site.
// ═══════════════════════════════════════════════════════

// — normalisation (minuscules, sans accents, sans ponctuation)
function normZone(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// — gazetteer FR : nom → centre [lon, lat] + multiplicateur de zoom (s)
const GAZETTEER = [
  // ── continents / grandes régions (zoom large)
  { k: ['afrique'], lon: 18, lat: 2, s: 1.05, label: 'Afrique' },
  { k: ['europe'], lon: 12, lat: 50, s: 1.2, label: 'Europe' },
  { k: ['asie'], lon: 90, lat: 40, s: 0.95, label: 'Asie' },
  { k: ['amerique du nord','amerique nord'], lon: -100, lat: 45, s: 1.0, label: 'Amérique du Nord' },
  { k: ['amerique latine','amerique du sud','amerique sud'], lon: -62, lat: -15, s: 1.0, label: 'Amérique latine' },
  { k: ['amerique centrale'], lon: -86, lat: 14, s: 1.5, label: 'Amérique centrale' },
  { k: ['moyen orient','proche orient'], lon: 44, lat: 30, s: 1.3, label: 'Moyen-Orient' },
  { k: ['maghreb'], lon: 5, lat: 31, s: 1.4, label: 'Maghreb' },
  { k: ['sahel'], lon: 2, lat: 16, s: 1.35, label: 'Sahel' },
  { k: ['corne de l afrique','corne afrique'], lon: 45, lat: 8, s: 1.4, label: "Corne de l'Afrique" },
  { k: ['afrique de l ouest','afrique ouest'], lon: -4, lat: 13, s: 1.4, label: "Afrique de l'Ouest" },
  { k: ['afrique centrale'], lon: 19, lat: 2, s: 1.3, label: 'Afrique centrale' },
  { k: ['afrique de l est','afrique est'], lon: 38, lat: 0, s: 1.3, label: "Afrique de l'Est" },
  { k: ['afrique australe','afrique du sud region'], lon: 26, lat: -26, s: 1.3, label: 'Afrique australe' },
  { k: ['grands lacs'], lon: 29, lat: -2, s: 1.55, label: 'Grands Lacs' },
  { k: ['balkans'], lon: 20, lat: 43, s: 1.6, label: 'Balkans' },
  { k: ['caucase'], lon: 45, lat: 42, s: 1.7, label: 'Caucase' },
  { k: ['asie centrale'], lon: 65, lat: 42, s: 1.3, label: 'Asie centrale' },
  { k: ['asie du sud','asie sud'], lon: 78, lat: 22, s: 1.25, label: 'Asie du Sud' },
  { k: ['asie du sud est','asie sud est'], lon: 105, lat: 10, s: 1.2, label: 'Asie du Sud-Est' },
  { k: ['peninsule arabique','golfe persique','golfe','arabie'], lon: 48, lat: 24, s: 1.4, label: 'Péninsule arabique' },
  // ── pays
  { k: ['mali'], lon: -3, lat: 17, s: 1.6, label: 'Mali' },
  { k: ['niger'], lon: 9, lat: 17, s: 1.6, label: 'Niger' },
  { k: ['burkina faso','burkina'], lon: -1.5, lat: 12, s: 1.7, label: 'Burkina Faso' },
  { k: ['tchad'], lon: 19, lat: 15, s: 1.5, label: 'Tchad' },
  { k: ['mauritanie'], lon: -10, lat: 20, s: 1.5, label: 'Mauritanie' },
  { k: ['nigeria','nigéria'], lon: 8, lat: 9, s: 1.6, label: 'Nigeria' },
  { k: ['soudan'], lon: 30, lat: 15, s: 1.4, label: 'Soudan' },
  { k: ['soudan du sud'], lon: 31, lat: 7, s: 1.6, label: 'Soudan du Sud' },
  { k: ['somalie'], lon: 46, lat: 5, s: 1.5, label: 'Somalie' },
  { k: ['ethiopie','éthiopie'], lon: 39, lat: 8, s: 1.5, label: 'Éthiopie' },
  { k: ['kenya'], lon: 38, lat: 1, s: 1.6, label: 'Kenya' },
  { k: ['rdc','congo','republique democratique du congo','republique democratique'], lon: 23, lat: -2, s: 1.25, label: 'RDC' },
  { k: ['rwanda'], lon: 30, lat: -2, s: 1.95, label: 'Rwanda' },
  { k: ['centrafrique','republique centrafricaine'], lon: 21, lat: 7, s: 1.6, label: 'Centrafrique' },
  { k: ['cameroun'], lon: 12, lat: 6, s: 1.6, label: 'Cameroun' },
  { k: ['libye'], lon: 17, lat: 27, s: 1.4, label: 'Libye' },
  { k: ['algerie','algérie'], lon: 3, lat: 28, s: 1.2, label: 'Algérie' },
  { k: ['tunisie'], lon: 9, lat: 34, s: 1.7, label: 'Tunisie' },
  { k: ['maroc'], lon: -6, lat: 32, s: 1.5, label: 'Maroc' },
  { k: ['egypte','égypte'], lon: 30, lat: 27, s: 1.4, label: 'Égypte' },
  { k: ['syrie'], lon: 38, lat: 35, s: 1.6, label: 'Syrie' },
  { k: ['liban'], lon: 35.8, lat: 33.9, s: 1.95, label: 'Liban' },
  { k: ['irak','iraq'], lon: 44, lat: 33, s: 1.5, label: 'Irak' },
  { k: ['iran'], lon: 54, lat: 32, s: 1.2, label: 'Iran' },
  { k: ['yemen','yémen'], lon: 47, lat: 15, s: 1.5, label: 'Yémen' },
  { k: ['arabie saoudite'], lon: 45, lat: 24, s: 1.2, label: 'Arabie saoudite' },
  { k: ['israel','israël'], lon: 35, lat: 31, s: 1.9, label: 'Israël' },
  { k: ['palestine','gaza','cisjordanie'], lon: 34.5, lat: 31.5, s: 2.0, label: 'Palestine' },
  { k: ['jordanie'], lon: 36, lat: 31, s: 1.7, label: 'Jordanie' },
  { k: ['turquie'], lon: 35, lat: 39, s: 1.3, label: 'Turquie' },
  { k: ['afghanistan'], lon: 66, lat: 34, s: 1.4, label: 'Afghanistan' },
  { k: ['pakistan'], lon: 70, lat: 30, s: 1.3, label: 'Pakistan' },
  { k: ['inde'], lon: 79, lat: 22, s: 1.0, label: 'Inde' },
  { k: ['ukraine'], lon: 32, lat: 49, s: 1.3, label: 'Ukraine' },
  { k: ['russie'], lon: 90, lat: 60, s: 0.85, label: 'Russie' },
  { k: ['venezuela'], lon: -66, lat: 7, s: 1.5, label: 'Venezuela' },
  { k: ['colombie'], lon: -74, lat: 4, s: 1.5, label: 'Colombie' },
  { k: ['mexique'], lon: -102, lat: 23, s: 1.2, label: 'Mexique' },
  { k: ['haiti','haïti'], lon: -72, lat: 19, s: 1.95, label: 'Haïti' },
  { k: ['bresil','brésil'], lon: -52, lat: -10, s: 0.95, label: 'Brésil' },
  { k: ['madagascar'], lon: 47, lat: -19, s: 1.4, label: 'Madagascar' },
  { k: ['mozambique'], lon: 36, lat: -18, s: 1.4, label: 'Mozambique' },
  // ── villes
  { k: ['bamako'], lon: -8, lat: 12.6, s: 2.0, label: 'Bamako' },
  { k: ['beyrouth'], lon: 35.5, lat: 33.9, s: 2.1, label: 'Beyrouth' },
  { k: ['bagdad'], lon: 44.4, lat: 33.3, s: 2.0, label: 'Bagdad' },
  { k: ['damas'], lon: 36.3, lat: 33.5, s: 2.0, label: 'Damas' },
  { k: ['kinshasa'], lon: 15.3, lat: -4.3, s: 2.0, label: 'Kinshasa' },
  { k: ['goma'], lon: 29.2, lat: -1.7, s: 2.1, label: 'Goma' },
  { k: ['tripoli'], lon: 13.2, lat: 32.9, s: 2.0, label: 'Tripoli' },
  { k: ['sanaa','sana a'], lon: 44.2, lat: 15.4, s: 2.0, label: 'Sanaa' }
];

function resolveZone(raw) {
  const q = normZone(raw);
  if (!q) return null;
  let best = null, bestLen = 0;
  for (const e of GAZETTEER) {
    for (const key of e.k) {
      if (q === key) return e;
      if ((q.includes(key) || key.includes(q)) && key.length > bestLen) { best = e; bestLen = key.length; }
    }
  }
  return best;
}

// — convertit l'échelle orthographique du gazetteer en niveau de zoom Mapbox
function zoneZoom(z) {
  return Math.round((2.2 + z.s * 1.9) * 10) / 10;   // continent ~4.1, pays ~5, ville ~6.2
}

// Exemples défilants dans la barre. Visiteur → démo mondiale ; abonné → pays suivis.
const DEMO_EXAMPLES = ['Tokyo', 'Bogotá', 'Kinshasa', 'Ukraine', 'Alaska', 'Beyrouth', 'Mexico', 'Sahel', 'Cachemire', 'Somalie', 'Caracas', 'Mali'];
const PAYS_EXAMPLES = ['Mali', 'Niger', 'Burkina Faso', 'Nigeria', 'RDC', 'Bénin', 'Togo'];

// Valeurs verrouillées dans la barre : exactement le style du mot qui défile
// (texte dégradé violet animé), épuré, inline. Clic discret pour corriger.
const GS_BUILDER_CSS = `
.globe-search--builder{ width:min(720px,94%); flex-wrap:wrap; gap:7px; row-gap:8px; }
/* Champ + Passer + loupe forment un bloc : s'il ne rentre plus derrière les
   puces (pays · période · typologie), le bloc entier passe proprement sur une
   2e ligne, pleine largeur, au lieu d'être écrasé ou coupé. */
.gsb-line{ display:flex; align-items:center; flex:1 1 auto; min-width:0; gap:8px; }
.globe-search--builder .gsb-line{ flex:1 1 300px; gap:7px; }
/* Dès qu'un pays est posé : les puces sur leur ligne, le champ TOUJOURS sur la
   sienne, pleine largeur. Le texte n'a plus jamais à se battre pour la place. */
.globe-search--chips{ padding-top:11px; }
.globe-search--chips .gsb-line{ flex:1 1 100%; }
/* Faux placeholder trop long : fondu en fin de champ, jamais de coupure nette. */
.globe-search--builder .globe-search__ph{
  -webkit-mask-image:linear-gradient(to right,#000 calc(100% - 36px),transparent);
  mask-image:linear-gradient(to right,#000 calc(100% - 36px),transparent); }
.gsb-val{ flex:0 1 auto; min-width:0; max-width:100%; overflow:hidden; text-overflow:ellipsis; border:none; padding:0; cursor:pointer; white-space:nowrap;
  font-family:'Plus Jakarta Sans',system-ui,sans-serif; font-weight:700; font-size:13px; line-height:1;
  background:linear-gradient(120deg,#C8B0EA 0%,#9C9BF0 38%,#5BB0F2 62%,#9C9BF0 86%,#C8B0EA 100%); background-size:220% auto;
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent;
  animation:demoZoneFlow 3.5s linear infinite; }
.gsb-sep{ flex:0 0 auto; font:700 12px/1 'Plus Jakarta Sans',system-ui,sans-serif; opacity:.65;
  background:linear-gradient(120deg,#C8B0EA,#5BB0F2); -webkit-background-clip:text; background-clip:text;
  -webkit-text-fill-color:transparent; color:transparent; }
.gsb-dateprompt{ flex:1; cursor:pointer; color:#C8B0EA; font:600 13px 'Plus Jakarta Sans',system-ui,sans-serif; }
.gsb-skip{ flex:0 0 auto; background:rgba(255,255,255,.10); border:1px solid rgba(255,255,255,.24); color:#E9E2F6;
  cursor:pointer; font:700 10px/1 'Plus Jakarta Sans',system-ui,sans-serif; letter-spacing:.08em; text-transform:uppercase;
  padding:8px 12px; border-radius:999px; transition:background .15s; }
.gsb-skip:hover{ background:rgba(255,255,255,.2); }
.gsb-skip:focus-visible{ outline:2px solid #C8B0EA; outline-offset:2px; }
.cal-pop{ position:absolute; bottom:calc(100% + 12px); left:50%; transform:translateX(-50%); z-index:40;
  width:300px; max-width:92vw; background:#fff; border:1px solid rgba(123,90,189,0.18); border-radius:18px;
  box-shadow:0 22px 60px -18px rgba(46,24,87,.5); padding:14px; cursor:default; }
.cal-pop .cal-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.cal-pop .cal-title{ font:700 15px 'Plus Jakarta Sans',system-ui,sans-serif; color:#1F1437; }
.cal-pop .cal-nav{ width:32px; height:32px; min-width:0; display:inline-flex; align-items:center; justify-content:center;
  border:1px solid rgba(123,90,189,0.22); background:#fff; background-image:none; border-radius:9px; cursor:pointer; color:#6B3FA0; font-size:17px; line-height:1; padding:0; box-shadow:none; transform:none; }
.cal-pop .cal-nav:hover:not(:disabled){ background:rgba(107,63,160,.07); transform:none; box-shadow:none; }
.cal-pop .cal-nav:disabled{ opacity:.3; cursor:default; }
.cal-pop .cal-grid{ display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
.cal-pop .cal-dow{ margin-bottom:6px; }
.cal-pop .cal-dow__c{ text-align:center; font:700 9px/1.6 'JetBrains Mono',monospace; color:#9089AA; }
.cal-pop .cal-day{ width:100%; height:auto; aspect-ratio:1; min-width:0; display:flex; align-items:center; justify-content:center;
  border:none; background:#fff; background-image:none; color:#1F1437; border-radius:10px; cursor:pointer;
  font:600 13px 'Plus Jakarta Sans',system-ui,sans-serif; padding:0; box-shadow:none; transform:none; }
.cal-pop .cal-day:hover:not(:disabled):not(.is-sel){ background:rgba(107,63,160,.10); transform:none; box-shadow:none; }
.cal-pop .cal-day.is-off{ color:#9089AA; background:#fff; cursor:default; opacity:.55; text-decoration:line-through; }
.cal-pop .cal-day--blank{ background:none; }
.cal-pop .cal-day.is-range{ background:rgba(107,63,160,.13); border-radius:0; box-shadow:0 0 0 2px rgba(107,63,160,.13); }
.cal-pop .cal-day.is-sel{ background:linear-gradient(130deg,#6B3FA0,#2E84D4); background-image:linear-gradient(130deg,#6B3FA0,#2E84D4); color:#fff; }
.cal-pop .cal-foot{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:14px; padding-top:12px; border-top:1px solid rgba(123,90,189,0.12); }
.cal-pop .cal-range{ font:600 11.5px 'Plus Jakarta Sans',system-ui,sans-serif; color:#4A4460; }
.cal-pop .cal-actions{ display:flex; gap:8px; }
.cal-pop .cal-btn{ width:auto; height:auto; min-width:0; border:none; cursor:pointer; border-radius:10px;
  font:700 10px 'JetBrains Mono',monospace; letter-spacing:.06em; text-transform:uppercase; padding:9px 14px; box-shadow:none; transform:none; }
.cal-pop .cal-btn--ghost{ background:#fff; background-image:none; border:1px solid rgba(123,90,189,0.22); color:#6B3FA0; }
.cal-pop .cal-btn--go{ background:linear-gradient(130deg,#6B3FA0,#2E84D4); background-image:linear-gradient(130deg,#6B3FA0,#2E84D4); color:#fff; }
.cal-pop .cal-btn--go:disabled{ opacity:.4; cursor:default; }
`;

// Popup calendrier (style Airbnb, DA violet/blanc) : sélection d'un intervalle
// de deux dates, borné aux mois où la donnée existe pour le pays.
function DateRangePopup({ entry, onApply, onClose }) {
  const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const MS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const lastDay = (y, m) => new Date(y, m, 0).getDate();
  const keys = ((entry && entry.months) || []).map(m => m.key).sort();
  const minKey = keys[0] || '2026-01';
  let maxKey = keys[keys.length - 1] || minKey;
  // Le calendrier va toujours au moins jusqu'au mois courant (calcule a l'execution :
  // s'etend tout seul chaque debut de mois, meme sans donnee encore arrivee).
  const _now = new Date();
  const nowKey = _now.getFullYear() + '-' + pad(_now.getMonth() + 1);
  if (nowKey > maxKey) maxKey = nowKey;
  const minDate = minKey + '-01';
  const [maxY, maxM] = maxKey.split('-').map(Number);
  // Dans le mois courant, on ne selectionne pas au-dela d'aujourd'hui.
  const maxDate = (maxKey === nowKey) ? nowKey + '-' + pad(_now.getDate()) : maxKey + '-' + pad(lastDay(maxY, maxM));

  // Ouvre sur le dernier mois AVEC donnees : un analyste cherche d'abord le
  // recent, et le premier mois (souvent croupion, ex. dec. 2025 = 1 seul jour
  // selectionnable) donnait l'impression d'un calendrier casse.
  const [view, setView] = React.useState(keys[keys.length - 1] || minKey);
  const [range, setRange] = React.useState({ from: null, to: null });
  const from = range.from, to = range.to;

  const [vy, vm] = view.split('-').map(Number);
  const lead = (new Date(vy, vm - 1, 1).getDay() + 6) % 7;
  const dim = lastDay(vy, vm);
  const cells = [];
  // Jours du mois precedent pour combler le debut de semaine (plus de cases vides).
  const pm = vm === 1 ? 12 : vm - 1, py = vm === 1 ? vy - 1 : vy, pdim = lastDay(py, pm);
  for (let i = lead; i > 0; i--) cells.push({ iso: py + '-' + pad(pm) + '-' + pad(pdim - i + 1), out: true });
  for (let d = 1; d <= dim; d++) cells.push({ iso: vy + '-' + pad(vm) + '-' + pad(d), out: false });
  // Jours du mois suivant pour completer la derniere semaine.
  const nm = vm === 12 ? 1 : vm + 1, ny = vm === 12 ? vy + 1 : vy;
  let nd = 1;
  while (cells.length % 7 !== 0) cells.push({ iso: ny + '-' + pad(nm) + '-' + pad(nd++), out: true });

  const shift = (delta) => {
    let y = vy, m = vm + delta;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    const nk = y + '-' + pad(m);
    if (nk >= minKey && nk <= maxKey) setView(nk);
  };
  const off = (iso) => !iso || iso < minDate || iso > maxDate;
  const clickDay = (iso) => {
    if (off(iso)) return;
    setRange(r => {
      if (!r.from || (r.from && r.to)) return { from: iso, to: null };
      if (iso >= r.from) return { from: r.from, to: iso };
      return { from: iso, to: null };
    });
  };
  const inRange = (iso) => from && to && iso > from && iso < to;
  const fmt = (iso) => { const p = iso.split('-'); return parseInt(p[2], 10) + ' ' + MS[parseInt(p[1], 10) - 1]; };
  const fmtFull = (iso) => fmt(iso) + ' ' + iso.split('-')[0];
  const label = from && to ? (fmt(from) + ' – ' + fmtFull(to)) : (from ? (fmt(from) + ' – …') : 'Sélectionnez deux dates');

  return (
    <div className="cal-pop" onMouseDown={(e) => e.stopPropagation()}>
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={() => shift(-1)} disabled={view <= minKey} aria-label="Mois précédent">‹</button>
        <span className="cal-title">{MOIS[vm - 1]} {vy}</span>
        <button type="button" className="cal-nav" onClick={() => shift(1)} disabled={view >= maxKey} aria-label="Mois suivant">›</button>
      </div>
      <div className="cal-grid cal-dow">{JOURS.map((j, i) => <span key={i} className="cal-dow__c">{j}</span>)}</div>
      <div className="cal-grid">
        {cells.map((c, i) => (
          <button type="button" key={i} disabled={off(c.iso)}
            className={'cal-day' + (off(c.iso) ? ' is-off' : '') + (c.iso === from || c.iso === to ? ' is-sel' : '') + (inRange(c.iso) ? ' is-range' : '')}
            onClick={() => clickDay(c.iso)}>{parseInt(c.iso.split('-')[2], 10)}</button>
        ))}
      </div>
      <div className="cal-foot">
        <span className="cal-range">{label}</span>
        <div className="cal-actions">
          <button type="button" className="cal-btn cal-btn--ghost" onClick={onClose}>Annuler</button>
          <button type="button" className="cal-btn cal-btn--go" disabled={!(from && to)}
            onClick={() => onApply({ from, to, label: fmt(from) + ' – ' + fmtFull(to) })}>Valider</button>
        </div>
      </div>
    </div>
  );
}

// Theatre du globe -> page de sa carte. Sert aussi a retrouver sa fiche
// (extrait de carte + epingles) dans window.ALGOR_THEATRES (sections.jsx).
const THEATRE_HREF = {
  'MO-01': '/moyen-orient/', 'SAHEL-02': '/sahel/', 'LACS-03': '/rdc/',
  'MDG-04': '/madagascar/', 'AFR-05': '/afrique/', 'ASIE-06': '/asie-sud/'
};
// Photos de terrain des theatres : les memes que la page Theatres en ligne.
const THEATRE_PHOTO = {
  '/moyen-orient/': { src: '/theatres/assets/moyen-orient.jpg',       alt: 'Théâtre Moyen-Orient : puits de pétrole en feu, désert irakien' },
  '/sahel/':        { src: '/theatres/assets/sahel.png',              alt: 'Théâtre Sahel : combattants armés dans le désert malien' },
  '/rdc/':          { src: '/theatres/assets/rdc.avif',               alt: 'Théâtre RDC : Oicha, Nord-Kivu' },
  '/madagascar/':   { src: '/theatres/assets/madagascar.webp',        alt: 'Théâtre Madagascar : manifestation à Antananarivo' },
  '/afrique/':      { src: '/theatres/assets/afrique-maritime.avif',  alt: 'Théâtre Afrique Maritime : détroits stratégiques' },
  '/asie-sud/':     { src: '/theatres/assets/asie-sud.jpg',           alt: 'Théâtre Asie du Sud : combattants armés afghans' }
};

// Fiche sans jargon : « 12.2025 → 05.2026 » devient « Suivi depuis décembre 2025 »,
// « 8 calques » devient « 8 couches d'analyse : ethnies, forces, mines… ».
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function fmtSuivi(periode) {
  const p = String(periode || '');
  if (/temps r/i.test(p)) return 'Suivi en temps réel (positions AIS des navires)';
  const m = p.match(/^(\d{2})\.(\d{4})/);
  if (m) return 'Suivi depuis ' + MOIS_LONGS[parseInt(m[1], 10) - 1] + ' ' + m[2];
  const y = p.match(/^(\d{4})/);
  if (y) return 'Suivi depuis ' + y[1];
  return p;
}
function fmtCouches(t) {
  const n = t.calques, all = String(t.calquesLbl || '').split(',').map(x => x.trim()).filter(Boolean);
  const head = all.slice(0, 3).join(', ') + (all.length > 3 ? '…' : '');
  return n + " couche" + (n > 1 ? 's' : '') + " d'analyse" + (head ? ' : ' + head : '');
}

function Globe() {
  const canvasRef = useRefGlobe(null);
  // Canvas WebGL de la Terre reelle (earth.js), sous le canvas D3.
  const earthRef = useRefGlobe(null);
  // Theatre survole : sa fiche (memes extraits de carte que la page Theatres)
  // surgit sur le globe, qui reste zoome dessus tant qu'elle est affichee.
  // Elle reste tant que le pointeur est sur le globe ou sur la fiche ; le
  // survol d'un autre theatre la remplace. Au doigt : 1er tap = fiche, 2e = carte.
  const [openTh, setOpenTh] = useStateGlobe(null);
  const shownRef = useRefGlobe(null);
  const overCardRef = useRefGlobe(false);
  const hideTimerRef = useRefGlobe(0);
  // Indice « Survolez un theatre » : apparait apres l'entree du hero, s'efface
  // a la premiere fiche ouverte, et ne revient plus dans la session.
  const [hint, setHint] = useStateGlobe(() => { try { return sessionStorage.getItem('algor-globe-hint') !== '1'; } catch (_) { return true; } });
  const [hintShown, setHintShown] = useStateGlobe(false);
  useEffectGlobe(() => {
    if (!hint) return;
    const t = setTimeout(() => setHintShown(true), 2200);
    return () => clearTimeout(t);
  }, [hint]);
  const dismissHint = () => { if (!hint) return; setHint(false); try { sessionStorage.setItem('algor-globe-hint', '1'); } catch (_) {} };
  const TOUCH_UI = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
  const showTh = (id) => { clearTimeout(hideTimerRef.current); dismissHint(); if (shownRef.current !== id) { shownRef.current = id; setOpenTh(id); } };
  const hideTh = () => { clearTimeout(hideTimerRef.current); shownRef.current = null; overCardRef.current = false; setOpenTh(null); };
  const scheduleHideTh = () => {
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => { if (!overCardRef.current) hideTh(); }, 320);
  };
  useEffectGlobe(() => {
    if (!openTh) return;
    const onKey = (e) => { if (e.key === 'Escape') hideTh(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openTh]);
  // Photos prechauffees des que le pointeur arrive sur le globe (pas au
  // chargement de la page) : la fiche surgit deja illustree au 1er survol.
  const photosWarmRef = useRefGlobe(false);
  const warmPhotos = () => {
    if (photosWarmRef.current) return;
    photosWarmRef.current = true;
    Object.values(THEATRE_PHOTO).forEach(p => { const im = new Image(); im.decoding = 'async'; im.src = p.src; });
  };
  useEffectGlobe(() => () => clearTimeout(hideTimerRef.current), []);
  const thCard = openTh ? (window.ALGOR_THEATRES || []).find(t => t.href === THEATRE_HREF[openTh]) : null;
  const thPhoto = thCard ? THEATRE_PHOTO[thCard.href] : null;
  const [query, setQuery] = useStateGlobe('');
  const [notFound, setNotFound] = useStateGlobe(false);
  const [phEx, setPhEx] = useStateGlobe(0);
  const [manifest, setManifest] = useStateGlobe([]);
  const [logged, setLogged] = useStateGlobe(false);
  // Etat de connexion lisible depuis les ecouteurs du canvas (effet monte une fois).
  const loggedRef = useRefGlobe(false);
  useEffectGlobe(() => { loggedRef.current = logged; }, [logged]);
  // Visiteur : la carte est reservee aux abonnes, on l'envoie vers les offres
  // (jamais vers le mur de connexion de /carte/). Abonne : la carte.
  const thTarget = thCard ? (logged ? thCard.href : '/offres/') : null;
  // `resolved` = l'état de connexion est connu. Tant qu'il ne l'est pas, on garde
  // la barre invisible (sinon flash de la version démo avant la version connectée).
  const [resolved, setResolved] = useStateGlobe(false);
  // Constructeur séquentiel (abonné) : pays → date → typologie → acteur,
  // tout dans cette barre. À la fin, ouvre /carte/ déjà filtrée.
  const [stage, setStage] = useStateGlobe(0);
  const [sel, setSel] = useStateGlobe({ entry: null, dateFrom: null, dateTo: null, dateLabel: null, event: null, actor: null });
  const [showCal, setShowCal] = useStateGlobe(false);

  // À l'étape date : ouvre le calendrier (sauf si une période est déjà posée).
  useEffectGlobe(() => {
    if (logged && stage === 1 && sel.entry && !sel.dateFrom) setShowCal(true);
    else if (stage !== 1) setShowCal(false);
  }, [logged, stage, sel.entry, sel.dateFrom]);

  const STAGES = ['pays', 'date', 'event', 'actor'];
  const PH = { pays: 'Indiquez un pays, comme', date: 'Indiquez une date, comme', event: 'Indiquez une typologie, comme', actor: 'Indiquez un acteur, comme' };
  const STAGE_EX = { pays: PAYS_EXAMPLES, date: ['Janvier 2026', 'Mars 2026'], event: ['Attaque', 'Embuscade', 'IED / Explosif'], actor: ['GSIM', 'EI-S', 'FAMA'] };
  const curStage = STAGES[stage] || 'actor';
  const examples = logged ? (STAGE_EX[curStage] || PAYS_EXAMPLES) : DEMO_EXAMPLES;

  useEffectGlobe(() => {
    const id = setInterval(() => setPhEx(i => (i + 1) % examples.length), 2400);
    return () => clearInterval(id);
  }, [logged, curStage]);

  // État de connexion (exposé par site-auth.js → window.algorAuthState).
  // `?apercu=1` force la vue abonné (outil pays) pour tester sans session,
  // ex. dans le preview intégré de Claude qui n'a pas de login.
  useEffectGlobe(() => {
    const preview = /[?&]apercu=1/.test(location.search);
    const sync = () => {
      setLogged(preview || !!(window.algorAuthState && window.algorAuthState.loggedIn));
      if (preview || window.algorAuthState) setResolved(true);
    };
    sync();
    window.addEventListener('algorAuthReady', sync);
    window.addEventListener('algorAuthStateChanged', sync);
    // Filet de sécurité : si l'auth ne signale jamais, on affiche quand même la barre.
    const t = setTimeout(() => setResolved(true), 1500);
    return () => { window.removeEventListener('algorAuthReady', sync); window.removeEventListener('algorAuthStateChanged', sync); clearTimeout(t); };
  }, []);

  // Manifeste pays (données HUMINT) — alimente toutes les étapes du constructeur.
  useEffectGlobe(() => {
    fetch('/carte/countries.json?v=20260617audit')
      .then(r => r.json())
      .then(d => setManifest(d.countries || []))
      .catch(() => {});
  }, []);

  function stageOptions(st) {
    const e = sel.entry;
    if (st === 'pays') return manifest.map(c => ({ value: c.name, label: c.name, meta: c.count + ' rens.' }));
    if (!e) return [];
    if (st === 'date')  return [{ value: '__all', label: 'Toutes les dates' }].concat((e.months || []).map(m => ({ value: m.key, label: m.label })));
    if (st === 'event') return [{ value: '__all', label: 'Toutes les typologies' }].concat((e.events || []).map(v => ({ value: v, label: v })));
    if (st === 'actor') return [{ value: '__all', label: 'Tous les acteurs' }].concat((e.actors || []).map(v => ({ value: v, label: v })));
    return [];
  }
  // Correspondance tolérante (accents/casse, partielle) — pas de menu, juste la saisie.
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function matchOption(q) {
    const real = stageOptions(curStage).filter(o => o.value !== '__all');
    const nq = norm(q.trim());
    if (!nq) return curStage === 'pays' ? null : { value: '__all' };
    return real.find(o => norm(o.label) === nq) || real.find(o => norm(o.label).indexOf(nq) !== -1) || null;
  }

  function goToMap(s) {
    s = s || sel;
    if (!s.entry) return;
    const p = new URLSearchParams();
    p.set('pays', s.entry.name);
    if (s.dateFrom && s.dateTo) { p.set('from', s.dateFrom); p.set('to', s.dateTo); }
    if (s.event) p.set('event', s.event);
    if (s.actor) p.set('actor', s.actor);
    window.location.href = '/carte/?' + p.toString();
  }

  // Validation du calendrier (intervalle de deux dates) → passe à la typologie.
  function applyDate(r) {
    setSel(s => ({ ...s, dateFrom: r.from, dateTo: r.to, dateLabel: r.label }));
    setShowCal(false);
    setStage(2);
  }

  function pick(opt) {
    if (!opt) return;
    setQuery(''); setNotFound(false);
    if (curStage === 'pays') {
      const e = manifest.find(c => c.name === opt.value) || null;
      setSel({ entry: e, dateFrom: null, dateTo: null, dateLabel: null, event: null, actor: null });
      setStage(1);
    } else if (curStage === 'event') {
      setSel(s => ({ ...s, event: opt.value === '__all' ? null : opt.value }));
      setStage(3);
    } else if (curStage === 'actor') {
      goToMap({ ...sel, actor: opt.value === '__all' ? null : opt.value });
    }
  }

  function removeChip(fromStage) {
    setQuery(''); setNotFound(false);
    if (fromStage === 0) { setSel({ entry: null, dateFrom: null, dateTo: null, dateLabel: null, event: null, actor: null }); setStage(0); return; }
    setSel(s => {
      const n = { ...s };
      if (fromStage <= 1) { n.dateFrom = null; n.dateTo = null; n.dateLabel = null; }
      if (fromStage <= 2) n.event = null;
      n.actor = null;
      return n;
    });
    setStage(fromStage);
  }

  // Tout se passe dans la barre : Entrée valide la saisie (ou « Tous » si vide),
  // ça se bloque en jeton à gauche et passe à l'étape suivante. Rien en dehors.
  const onSubmit = (e) => {
    if (e) e.preventDefault();
    if (!logged) {
      const q = query.trim();
      if (!q) { setNotFound(true); return; }
      setNotFound(false);
      window.location.href = '/demo/?q=' + encodeURIComponent(q);
      return;
    }
    // L'étape date passe par le calendrier, pas la saisie.
    if (curStage === 'date') { setShowCal(true); return; }
    const m = matchOption(query);
    if (!m) { setNotFound(true); return; }
    setNotFound(false);
    pick(m);
  };

  useEffectGlobe(() => {
    const canvas = canvasRef.current;
    if (!canvas || !window.d3 || !window.topojson) return;
    const ctx = canvas.getContext('2d');

    // Respect de prefers-reduced-motion : pas de rotation auto, flux figes.
    // Le zoom au survol (initie par l'utilisateur) reste actif.
    const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // — projection
    const proj = d3.geoOrthographic()
      .clipAngle(90)
      .rotate([-25, -10, 0])
      .translate([280, 280])
      .scale(260)
      .precision(0.4);
    const path = d3.geoPath(proj, ctx);

    // — sizing with DPR
    let W = 560, H = 560, baseScale = 260;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    // Canvas de la Terre reelle : deborde du globe (halo), decale par rapport a ce canvas.
    const earthCanvas = earthRef.current;
    let EW = 0, EH = 0, EOX = 0, EOY = 0;
    function resize() {
      const r = canvas.getBoundingClientRect();
      W = Math.max(120, r.width  || canvas.clientWidth  || 560);
      H = Math.max(120, r.height || canvas.clientHeight || 560);
      canvas.width  = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      baseScale = Math.max(40, Math.min(W, H) / 2 - 6);
      proj.translate([W / 2, H / 2]).scale(baseScale);
      if (earthCanvas) {
        EW = earthCanvas.clientWidth || W; EH = earthCanvas.clientHeight || H;
        EOX = canvas.offsetLeft - earthCanvas.offsetLeft; EOY = canvas.offsetTop - earthCanvas.offsetTop;
      }
    }
    resize();
    let ro = null;
    if (window.ResizeObserver) {
      try { ro = new ResizeObserver(resize); ro.observe(canvas); } catch (_) {}
    }
    window.addEventListener('resize', resize);

    // — load world topology asynchronously; sphere/graticule render immediately
    //   110m (leger) peint en premier, puis upgrade silencieux vers 50m :
    //   cotes plus fines et petites iles, surtout visibles au zoom hover.
    //   Si la machine rame en 50m, retour automatique et definitif au 110m.
    let land = null, borders = null;
    let topoLo = null, hiActive = false, hiLocked = false;
    function applyTopo(topo) {
      land    = topojson.feature(topo, topo.objects.countries);
      borders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
    }
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json')
      .then(r => r.json())
      .then(topo => { topoLo = topo; if (!hiActive) applyTopo(topo); })
      .catch(() => { /* sphere-only fallback is acceptable */ });
    // Sur la Terre reelle la photo porte deja les cotes fines : on garde les
    // frontieres 110m (legeres a projeter a chaque image) et on ne telecharge
    // ni le 50m ni les lacs.
    const EARTH_MODE = !!(canvas.closest && canvas.closest('.hero--night')
      && !(canvas.closest('.hero--sky') && !canvas.closest('.globe-nuit'))
      && window.AlgorEarth && !/[?&]terre=0/.test(location.search));
    if (!EARTH_MODE) fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json')
      .then(r => r.json())
      .then(topo => { if (hiLocked) return; hiActive = true; applyTopo(topo); })
      .catch(() => { /* on reste en 110m */ });
    // — lacs et plans d'eau (Natural Earth 50m, heberge en local) :
    //   remplis dans la teinte exacte de la mer, contour tres discret.
    let lakes = null;
    if (!EARTH_MODE) fetch('./shared/home/lakes-50m.json?v=20260610a')
      .then(r => r.json())
      .then(g => { lakes = g; })
      .catch(() => { /* sans lacs, rendu identique a avant */ });
    const graticule = d3.geoGraticule10();
    const sphere = { type: 'Sphere' };

    // — anchors (theaters)
    const anchors = [
      { id: 'MO-01',    lon:  44,   lat:  33,   label: 'Moyen-Orient' },
      { id: 'SAHEL-02', lon:   0,   lat:  16,   label: 'Sahel' },
      { id: 'LACS-03',  lon:  29,   lat:  -2,   label: 'Grands Lacs' },
      { id: 'MDG-04',   lon:  47,   lat: -19,   label: 'Madagascar' },
      { id: 'AFR-05',   lon:  43,   lat:  12,   label: 'Afrique Maritime' },
      { id: 'ASIE-06',  lon:  74,   lat:  30,   label: 'Asie du Sud' }
    ];

    // — flow definitions (50 terrestres + 35 maritimes)
    const T = (a, b) => ({ a, b, kind: 'land' });
    const M = (a, b) => ({ a, b, kind: 'sea'  });
    const arcs = [
      /* ───────────── TERRESTRES ───────────── */
      T([36.30, 33.50], [35.50, 33.90]),
      T([36.30, 33.50], [37.16, 36.20]),
      T([44.40, 33.30], [36.30, 33.50]),
      T([44.40, 33.30], [43.13, 36.34]),
      T([44.20, 15.40], [45.03, 12.78]),
      T([44.40, 33.30], [51.42, 35.70]),
      T([51.42, 35.70], [59.61, 36.30]),
      T([44.00, 36.20], [43.13, 36.34]),
      T([35.50, 33.90], [35.20, 33.27]),
      T([51.42, 35.70], [46.30, 38.08]),
      T([59.61, 36.30], [62.20, 34.34]),
      T([45.03, 12.78], [49.13, 14.55]),
      T([-8.00, 12.65], [-0.04, 16.27]),
      T([-8.00, 12.65], [-1.52, 12.37]),
      T([-1.52, 12.37], [ 2.11, 13.51]),
      T([ 2.11, 13.51], [ 7.99, 16.97]),
      T([ 7.99, 16.97], [15.05, 12.13]),
      T([-2.99, 16.77], [-0.04, 16.27]),
      T([-4.18, 14.50], [-8.00, 12.65]),
      T([12.61, 13.31], [13.16, 11.85]),
      T([ 2.11, 13.51], [12.61, 13.31]),
      T([-1.52, 12.37], [-4.30, 11.18]),
      T([-8.00, 12.65], [-4.18, 14.50]),
      T([ 1.41, 18.44], [ 1.05, 20.20]),
      T([15.31, -4.32], [29.22, -1.68]),
      T([29.22, -1.68], [28.86, -2.50]),
      T([29.22, -1.68], [29.47,  0.49]),
      T([29.47,  0.49], [30.25,  1.56]),
      T([30.06, -1.94], [29.22, -1.68]),
      T([29.36, -3.38], [28.86, -2.50]),
      T([32.58,  0.32], [30.25,  1.56]),
      T([28.86, -2.50], [29.13, -3.40]),
      T([29.47,  0.49], [29.28,  0.13]),
      T([15.31, -4.32], [27.49,-11.66]),
      T([47.51,-18.91], [49.40,-18.15]),
      T([47.51,-18.91], [46.32,-15.72]),
      T([47.51,-18.91], [43.68,-23.35]),
      T([47.51,-18.91], [47.08,-21.45]),
      T([43.68,-23.35], [46.99,-25.03]),
      T([46.32,-15.72], [49.29,-12.32]),
      T([49.40,-18.15], [50.17,-14.27]),
      T([43.68,-23.35], [47.08,-21.45]),
      T([67.00, 24.86], [74.36, 31.55]),
      T([74.36, 31.55], [73.05, 33.69]),
      T([73.05, 33.69], [69.18, 34.53]),
      T([69.18, 34.53], [65.71, 31.62]),
      T([74.79, 34.08], [77.21, 28.61]),
      T([77.21, 28.61], [72.83, 18.98]),
      T([65.71, 31.62], [66.99, 30.18]),
      T([66.99, 30.18], [67.00, 24.86]),
      /* ───────────── MARITIMES ───────────── */
      M([56.27, 27.18], [58.00, 24.00]),
      M([45.03, 12.78], [43.15, 11.60]),
      M([35.78, 35.52], [35.50, 33.90]),
      M([39.17, 21.49], [37.22, 19.62]),
      M([45.03, 12.78], [49.13, 14.55]),
      M([35.50, 33.90], [35.00, 32.83]),
      M([ 3.40,  6.50], [-4.00,  5.30]),
      M([-4.00,  5.30], [-17.40, 14.70]),
      M([-17.00, 20.90],[-15.40, 28.00]),
      M([-17.40, 14.70], [-7.59, 33.60]),
      M([-17.40, 14.70], [-23.51, 14.93]),
      M([29.20, -5.95], [29.13, -3.40]),
      M([29.22, -1.68], [28.86, -2.50]),
      M([29.63, -4.88], [31.10, -8.77]),
      M([18.42,-33.92], [39.28, -6.82]),
      M([ 3.40,  6.50], [11.85, -4.78]),
      M([32.55, 29.97], [33.04, 34.71]),
      M([39.66, -4.04], [43.15, 11.60]),
      M([31.04,-29.86], [57.50,-20.16]),
      M([18.42,-33.92], [14.51,-22.95]),
      M([ 3.40,  6.50], [13.23, -8.84]),
      M([45.32,  2.04], [39.66, -4.04]),
      M([49.40,-18.15], [49.29,-12.32]),
      M([46.32,-15.72], [43.27,-11.70]),
      M([49.40,-18.15], [57.50,-20.16]),
      M([49.40,-18.15], [55.45,-20.88]),
      M([43.68,-23.35], [32.57,-25.97]),
      M([67.00, 24.86], [72.83, 18.98]),
      M([72.83, 18.98], [79.85,  6.93]),
      M([67.00, 24.86], [62.32, 25.12]),
      M([62.32, 25.12], [56.27, 27.18]),
      M([72.83, 18.98], [73.51,  4.18]),
      M([79.85,  6.93], [91.81, 22.34]),
      M([72.83, 18.98], [55.27, 25.20]),
      M([67.00, 24.86], [55.27, 25.20])
    ];

    const RAD = Math.PI / 180;
    arcs.forEach((arc, i) => {
      arc.interp = d3.geoInterpolate(arc.a, arc.b);
      arc.dur    = (arc.kind === 'sea' ? 7200 : 5200) + (i % 5) * 380;
      arc.offset = (i * 730) % arc.dur;
      arc.np     = arc.kind === 'sea' ? 2 : 4;
      arc.trail  = arc.kind === 'sea' ? 0.06 : 0.10;
      // Arc en altitude : decolle de la surface, hauteur selon la distance
      // (en rayons terrestres), passe correctement derriere l'horizon.
      const dist = d3.geoDistance(arc.a, arc.b);
      arc.h = Math.min(0.22, Math.max(0.03, dist * 0.55));
      const n = Math.max(12, Math.min(40, Math.round(dist * 70)));
      arc.pts = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n, p = arc.interp(t);
        arc.pts.push([p[0] * RAD, p[1] * RAD, arc.h * Math.sin(Math.PI * t)]);
      }
    });

    // — visibility test against current rotation (orthographic back-face cull)
    function visible(coord) {
      const r = proj.rotate();
      const cl = -r[0] * Math.PI / 180, cp = -r[1] * Math.PI / 180;
      const lo = coord[0] * Math.PI / 180, la = coord[1] * Math.PI / 180;
      return Math.cos(la) * Math.cos(cp) * Math.cos(lo - cl) + Math.sin(la) * Math.sin(cp) > 0.02;
    }

    // — projection d'un point EN ALTITUDE (h en rayons terrestres) : memes
    //   maths que d3.geoOrthographic (rotation lambda puis phi), sans clip.
    //   Ecrit dans P3 = [x ecran, y ecran, profondeur vers le spectateur, visible].
    //   Un point derriere le plan median reste visible s'il depasse du disque.
    let RL = 0, RCP = 1, RSP = 0, SC = 260, CX = 280, CY = 280;
    function syncProj() {
      const r = proj.rotate(), ph = r[1] * RAD, tr = proj.translate();
      RL = r[0] * RAD; RCP = Math.cos(ph); RSP = Math.sin(ph);
      SC = proj.scale(); CX = tr[0]; CY = tr[1];
    }
    const P3 = [0, 0, 0, 0];
    function proj3(lon, lat, h) {
      const cl = Math.cos(lat), l = lon + RL;
      const x = Math.cos(l) * cl, y = Math.sin(l) * cl, z = Math.sin(lat);
      const xd = x * RCP - z * RSP, zs = z * RCP + x * RSP;
      const k = 1 + h;
      P3[0] = CX + SC * y * k; P3[1] = CY - SC * zs * k; P3[2] = xd * k;
      P3[3] = (xd >= 0 || (y * y + zs * zs) * k * k > 1) ? 1 : 0;
      return P3;
    }
    // Attenuation vers le limbe (profondeur), pour la ligne comme pour les particules.
    function depthFade(d) { const u = Math.max(0, Math.min(1, (d + 0.22) / 0.7)); return 0.30 + 0.70 * u * u * (3 - 2 * u); }

    // — palette : terres SABLE, mers BLEU CIEL doux (non agressif).
    //   Variante NUIT (hero sombre cinematique, .hero--night) : globe encre,
    //   terres graphite, flux violet lumineux, labels clairs.
    const NIGHT = !!(canvas.closest && canvas.closest('.hero--night'));
    //   Variante CIEL (page blanche etoilee, .hero--sky sans .globe-nuit) :
    //   globe clair lavande, flux violet/bleu de marque, labels encre.
    const SKY = !!(canvas.closest && canvas.closest('.hero--sky') && !canvas.closest('.globe-nuit'));
    const C = SKY ? {
      ocean:    '#F4F2FA',
      land:     '#D9D3E9',
      border:   'rgba(107,63,160,0.32)',
      grat:     'rgba(107,63,160,0.10)',
      rim:      'rgba(107,63,160,0.55)',
      fluxLand: '107,63,160',
      fluxSea:  '30,111,190',
      label:    '#2E1857', labelHover: '#181428', labelHalo: 'rgba(255,255,255,0.96)'
    } : NIGHT ? {
      ocean:    '#0A0913',
      land:     '#1C1929',
      border:   'rgba(200,180,255,0.14)',
      grat:     'rgba(255,255,255,0.05)',
      rim:      'rgba(181,150,224,0.35)',
      fluxLand: '196,160,255',
      fluxSea:  '96,206,232',
      label:    '#E9E2F6', labelHover: '#FFFFFF', labelHalo: 'rgba(6,5,12,0.95)'
    } : {
      ocean:    '#AEC9D7',                  // mer — bleu ciel desature
      land:     '#D9C9A3',                  // terre — sable
      border:   'rgba(92,74,42,0.30)',      // frontieres pays
      grat:     'rgba(255,255,255,0.45)',   // graticule
      rim:      'rgba(70,90,105,0.55)',     // bord du globe
      fluxLand: '246,162,84',               // flux terrestres — orange clair (glow holo)
      fluxSea:  '39,174,192',               // flux maritimes — cyan (glow holo)
      label:    '#4a4660', labelHover: '#2c2840', labelHalo: 'rgba(255,255,255,0.95)'
    };

    // — sprites de glow pre-rendus : avant, chaque particule recreait son
    //   createRadialGradient a chaque frame (~80 gradients/frame). Un sprite
    //   redessine via drawImage est identique a l'oeil et bien plus rapide.
    function glowSprite(rgb, stops) {
      const S = 64, c = document.createElement('canvas');
      c.width = S; c.height = S;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      stops.forEach(([o, a]) => grad.addColorStop(o, `rgba(${rgb},${a})`));
      g.fillStyle = grad; g.fillRect(0, 0, S, S);
      return c;
    }
    const SPRITES = {
      land:   glowSprite(C.fluxLand, [[0, 0.55], [0.4, 0.24], [1, 0]]),
      sea:    glowSprite(C.fluxSea,  [[0, 0.55], [0.4, 0.24], [1, 0]]),
      anchor: glowSprite(C.fluxLand, [[0, 1], [0.45, 0.333], [1, 0]])
    };

    // — Terre nocturne reelle (earth.js) : hero sombre uniquement. Rendu WebGL
    //   dans le canvas du dessous, meme rotation et meme echelle que ce globe ;
    //   ici on garde les couches vectorielles (frontieres, theatres, flux).
    //   Sans WebGL ou sans textures : globe plat inchange.
    let earth = null;
    // ?terre=0 : coupe la Terre reelle (controle du repli, ou secours en production).
    if (NIGHT && !SKY && earthCanvas && window.AlgorEarth && !/[?&]terre=0/.test(location.search)) {
      earth = window.AlgorEarth.create(earthCanvas, { hi: DPR > 1.25 || Math.min(W, H) > 520, version: '20260914c' });
      if (earth) {
        canvas.parentNode.classList.add('is-earth');
        // Controle visuel : ?soleil=2026-09-14T22:00Z fige le soleil a cette date.
        const sunParam = (location.search.match(/[?&]soleil=([^&]+)/) || [])[1];
        if (sunParam) earth.setSunDate(decodeURIComponent(sunParam));
      }
    }
    // Sur la Terre reelle : frontieres lavande lisibles sur la photo, pas de graticule appuye.
    const E = { border: 'rgba(214,200,255,0.34)', grat: 'rgba(255,255,255,0.045)' };
    // Famille des etiquettes = police de texte du site (--sans, posee par le systeme typo).
    const LABEL_FAMILY = ((getComputedStyle(document.documentElement).getPropertyValue('--sans') || '').trim())
      || '"Plus Jakarta Sans", system-ui, sans-serif';

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      syncProj();
      const er = earth ? earth.ready() : 0;   // 0 = globe plat, 1 = Terre reelle prete

      // Clip circulaire — le globe reste TOUJOURS rond, meme zoome (jamais un carre).
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, Math.min(W, H) / 2, 0, Math.PI * 2);
      ctx.clip();

      // sphere fill (ocean) — s'efface quand la Terre reelle apparait dessous
      if (er < 1) {
        ctx.globalAlpha = 1 - er;
        ctx.beginPath(); path(sphere);
        ctx.fillStyle = C.ocean; ctx.fill();
        ctx.globalAlpha = 1;
      }

      // graticule
      ctx.beginPath(); path(graticule);
      ctx.strokeStyle = er > 0.5 ? E.grat : C.grat; ctx.lineWidth = 0.55; ctx.stroke();

      // land — fill + borders
      if (land) {
        if (er < 1) {
          ctx.globalAlpha = 1 - er;
          ctx.beginPath(); path(land);
          ctx.fillStyle = C.land; ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath(); path(borders);
        ctx.strokeStyle = er > 0.5 ? E.border : C.border; ctx.lineWidth = er > 0.5 ? 0.55 : 0.45; ctx.stroke();
      }

      // lacs et plans d'eau — meme teinte que la mer, par-dessus les
      //   frontieres pour que celles-ci ne traversent pas les lacs.
      //   (la photo NASA les contient deja : inutiles sur la Terre reelle)
      if (lakes && er < 1) {
        ctx.globalAlpha = 1 - er;
        ctx.beginPath(); path(lakes);
        ctx.fillStyle = C.ocean; ctx.fill();
        ctx.globalAlpha = 0.6 * (1 - er);
        ctx.strokeStyle = C.border; ctx.lineWidth = 0.3; ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // sphere rim (l'atmosphere du shader le remplace sur la Terre reelle)
      if (er < 1) {
        ctx.globalAlpha = 1 - er;
        ctx.beginPath(); path(sphere);
        ctx.strokeStyle = C.rim; ctx.lineWidth = 0.75; ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // arc traces — arcs en altitude, segments visibles seulement,
      //   attenues vers le limbe (profondeur du sommet de l'arc)
      arcs.forEach(arc => {
        const isSea = arc.kind === 'sea';
        const mid = arc.pts[arc.pts.length >> 1];
        const pm = proj3(mid[0], mid[1], mid[2]);
        const fa = depthFade(pm[2]);
        ctx.beginPath();
        let open = false;
        for (let k = 0; k < arc.pts.length; k++) {
          const q = arc.pts[k], p = proj3(q[0], q[1], q[2]);
          if (!p[3]) { open = false; continue; }
          if (open) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); open = true; }
        }
        ctx.setLineDash(isSea ? [1.4, 2.6] : []);
        ctx.strokeStyle = isSea
          ? `rgba(${C.fluxSea},${(0.42 * fa).toFixed(3)})`
          : `rgba(${C.fluxLand},${(0.42 * fa).toFixed(3)})`;
        ctx.lineWidth = isSea ? 0.6 : 0.7;
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // endpoint pins (city dots)
      arcs.forEach(arc => {
        const isSea = arc.kind === 'sea';
        [arc.a, arc.b].forEach(pt => {
          if (!visible(pt)) return;
          const xy = proj(pt); if (!xy) return;
          ctx.beginPath();
          ctx.arc(xy[0], xy[1], isSea ? 0.9 : 1.1, 0, Math.PI * 2);
          ctx.fillStyle = isSea
            ? `rgba(${C.fluxSea},0.72)`
            : `rgba(${C.fluxLand},0.72)`;
          ctx.fill();
        });
      });

      // arc particles — points HOLOGRAPHIQUES futuristes
      //   bloom radial + anneaux HUD + coeur blanc lumineux (effet projection)
      arcs.forEach(arc => {
        const isSea = arc.kind === 'sea';
        const palette = isSea ? C.fluxSea : C.fluxLand;
        const heads = isSea ? 2 : 1;
        for (let h = 0; h < heads; h++) {
          const headPhase = (((t + arc.offset + h * arc.dur / heads) % arc.dur) + arc.dur) % arc.dur / arc.dur;
          for (let i = 0; i < arc.np; i++) {
            let phase = headPhase - i * arc.trail;
            if (phase < 0) continue;
            if (phase > 1) continue;
            const p = arc.interp(phase);
            // position sur l'arc en altitude (meme profil que la trace)
            const xy = proj3(p[0] * RAD, p[1] * RAD, arc.h * Math.sin(Math.PI * phase));
            if (!xy[3]) continue;

            const fade = Math.sin(phase * Math.PI);
            const decay = Math.pow(1 - i / arc.np, 1.8);
            const baseOp = (isSea ? 0.85 : 0.98) * fade * decay * depthFade(xy[2]);
            const baseR  = (isSea ? 1.0 : 1.6) * (i === 0 ? 1 : (1 - i * 0.18));
            const isHead = i === 0;

            // 1) glow — bloom radial degrade (sprite pre-rendu)
            const glowR = baseR * (isHead ? (isSea ? 7.5 : 8.5) : 4.5);
            ctx.globalAlpha = baseOp;
            ctx.drawImage(isSea ? SPRITES.sea : SPRITES.land,
              xy[0] - glowR, xy[1] - glowR, glowR * 2, glowR * 2);
            ctx.globalAlpha = 1;

            // 2) anneaux holographiques HUD (tete) — fines circonferences concentriques
            if (isHead) {
              ctx.lineWidth = 0.7;
              ctx.strokeStyle = `rgba(${palette},${(baseOp * 0.60).toFixed(3)})`;
              ctx.beginPath();
              ctx.arc(xy[0], xy[1], baseR * 2.6, 0, Math.PI * 2);
              ctx.stroke();
              ctx.strokeStyle = `rgba(${palette},${(baseOp * 0.30).toFixed(3)})`;
              ctx.beginPath();
              ctx.arc(xy[0], xy[1], baseR * 4.2, 0, Math.PI * 2);
              ctx.stroke();
            }

            // 3) halo colore serre autour du coeur
            ctx.beginPath();
            ctx.arc(xy[0], xy[1], Math.max(0.7, baseR * 1.7), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${palette},${(baseOp * 0.80).toFixed(3)})`;
            ctx.fill();

            // 4) coeur blanc lumineux — point holographique
            ctx.beginPath();
            ctx.arc(xy[0], xy[1], Math.max(0.4, baseR * 0.74), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${Math.min(1, baseOp * 0.95).toFixed(3)})`;
            ctx.fill();
          }
        }
      });

      // anchors (zones disponibles) — points orange, meme style que les flux.
      //   Titre affiche UNIQUEMENT au survol (hoverAnchor).
      const Rc = Math.min(W, H) / 2;
      const labelRects = [];   // etiquettes deja posees cette frame (anti-chevauchement)
      const insideDisc = (x, y) => Math.hypot(x - W / 2, y - H / 2) <= Rc - 4;
      // Le theatre survole est place en premier : son etiquette a la priorite.
      const ordered = hoverAnchor ? [hoverAnchor].concat(anchors.filter(x => x !== hoverAnchor)) : anchors;
      ordered.forEach((a) => {
        const i = anchors.indexOf(a);
        if (!visible([a.lon, a.lat])) return;
        const xy = proj([a.lon, a.lat]);
        if (!xy) return;
        // Hors du disque visible (zoom au survol) : rien a dessiner, ce serait coupe.
        if (!insideDisc(xy[0], xy[1])) return;
        const hovered = (hoverAnchor && hoverAnchor.id === a.id) || shownRef.current === a.id;
        const pulse = (Math.sin(t / 1100 + i * 1.7) + 1) / 2;
        const k = hovered ? 1.5 : 1;

        // glow bloom orange — meme teinte que les flux terrestres (sprite)
        const glowR = (10 + pulse * 4) * k;
        ctx.globalAlpha = 0.42 + pulse * 0.16;
        ctx.drawImage(SPRITES.anchor, xy[0] - glowR, xy[1] - glowR, glowR * 2, glowR * 2);
        ctx.globalAlpha = 1;

        // halo orange serre
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 3.4 * k, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${C.fluxLand},0.82)`;
        ctx.fill();

        // coeur blanc lumineux
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 1.7 * k, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.98)';
        ctx.fill();

        // label — toujours visible : annotation cartographique sobre,
        //   halo blanc doux pour la lisibilite, aucun cadre.
        ctx.save();
        // Meme voix que les autres labels du site (Host Grotesk 500 petit), pas de mono.
        ctx.font = (hovered ? '600 ' : '500 ') + '11.5px ' + LABEL_FAMILY;
        ctx.letterSpacing = '0.02em';
        ctx.textBaseline = 'middle';
        // Placement : a droite du point ; sinon a gauche, dessous, dessus.
        //   Une etiquette ne sort jamais du disque (elle serait coupee par le
        //   clip) et ne recouvre jamais une etiquette deja posee ; si aucune
        //   position ne convient (globe petit, zone dense), le point reste seul.
        const tw = ctx.measureText(a.label).width, th = 14, ty0 = xy[1] + 0.5;
        const cands = [[xy[0] + 12, ty0], [xy[0] - 12 - tw, ty0], [xy[0] - tw / 2, ty0 + 17], [xy[0] - tw / 2, ty0 - 17]];
        let tx = 0, ty = 0, placed = false;
        for (const c of cands) {
          const r = { x: c[0] - 3, y: c[1] - th / 2, w: tw + 6, h: th };
          const fits = insideDisc(r.x, r.y) && insideDisc(r.x + r.w, r.y) && insideDisc(r.x, r.y + r.h) && insideDisc(r.x + r.w, r.y + r.h);
          const free = !labelRects.some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
          if (fits && free) { tx = c[0]; ty = c[1]; labelRects.push(r); placed = true; break; }
        }
        if (!placed) { ctx.restore(); return; }
        // Halo de lisibilite : un contour trace une fois (avant : trois passes
        // avec flou d'ombre, le poste le plus couteux du dessin a chaque image).
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = C.labelHalo;
        ctx.strokeText(a.label, tx, ty);
        ctx.fillStyle = hovered ? C.labelHover : C.label;
        ctx.fillText(a.label, tx, ty);
        ctx.restore();
      });

      ctx.restore(); // fin du clip circulaire
    }

    // — animation loop, slow longitude rotation + zoom au hover des marqueurs
    let last = performance.now();
    const period = 30000;
    let zoomTarget = null;
    let hoverAnchor = null;
    // Inclinaison pilotee par le defilement (motion.js) : cible de latitude.
    let tiltLat = 0;
    window.__algorGlobe = {
      setTilt: (deg) => { tiltLat = Number(deg) || 0; },
      getScale: () => proj.scale(),
      getRadius: () => Math.min(W, H) / 2,
      hasEarth: !!earth,
      earth: earth,
      stats: () => ({ drawMs: Math.round(drawEma * 100) / 100, hi: hiActive, locked: hiLocked }),
      // Controle visuel (captures) : position ecran d'un theatre, null s'il est cache.
      anchorAt: (id) => {
        const a = anchors.find(x => x.id === id);
        if (!a || !visible([a.lon, a.lat])) return null;
        const xy = proj([a.lon, a.lat]), r = canvas.getBoundingClientRect();
        return xy ? [xy[0] + r.left, xy[1] + r.top] : null;
      }
    };

    // Hors ecran (hero defile) : on ne dessine plus rien, ni D3 ni WebGL.
    let inView = true, io = null;
    if ('IntersectionObserver' in window) {
      try { io = new IntersectionObserver((es) => { inView = es[0].isIntersecting; }, { threshold: 0 }); io.observe(canvas); } catch (_) {}
    }

    function step(now) {
      const dt = Math.min(now - last, 80); last = now;
      if (!inView) return;
      // Hors survol : le globe reste zoome sur le theatre dont la fiche est ouverte.
      if (!hoverAnchor) {
        const pid = shownRef.current;
        zoomTarget = pid && ANCHOR_META[pid] ? ANCHOR_META[pid].target : null;
      }
      const r = proj.rotate();
      if (zoomTarget) {
        const ease = 0.06;
        const targetLon = -zoomTarget.lon;
        const targetLat = -zoomTarget.lat;
        const dLon = ((targetLon - r[0] + 540) % 360) - 180;
        proj.rotate([ r[0] + dLon * ease, r[1] + (targetLat - r[1]) * ease, 0 ]);
        const targetScale = baseScale * zoomTarget.scaleMul;
        const cs = proj.scale();
        proj.scale(cs + (targetScale - cs) * ease);
      } else {
        proj.rotate([ r[0] + (REDUCED ? 0 : (dt / period) * 360), r[1] + (tiltLat - r[1]) * 0.04, 0 ]);
        const cs = proj.scale();
        if (Math.abs(cs - baseScale) > 0.4) {
          proj.scale(cs + (baseScale - cs) * 0.06);
        }
      }
      if (earth) earth.render({ w: EW, h: EH, dpr: Math.min(DPR, 1.5), cx: EOX + W / 2, cy: EOY + H / 2, scale: proj.scale(), clip: Math.min(W, H) / 2, rotate: proj.rotate(), t: now });
      draw(REDUCED ? 0 : now);
    }
    let rafId = 0;
    // — garde-fou perf : si le rendu 50m depasse durablement le budget frame,
    //   retour definitif au 110m (meme rendu qu'avant l'upgrade).
    let drawEma = 0, slowRun = 0;
    let lastFrame = 0;
    function frame(now) {
      // Cadence : 30 images/s en rotation libre (12 degres/s, largement fluide),
      // 60 pendant un zoom de theatre ou une inclinaison au defilement.
      const r0 = proj.rotate();
      const busy = !!zoomTarget || Math.abs(proj.scale() - baseScale) > 0.5 || Math.abs(r0[1] - tiltLat) > 0.05;
      if (!busy && now - lastFrame < 1000 / 30 - 1.5) { rafId = requestAnimationFrame(frame); return; }
      lastFrame = now;
      const t0 = performance.now();
      step(now);
      drawEma = drawEma * 0.9 + (performance.now() - t0) * 0.1;
      if (hiActive && !hiLocked) {
        slowRun = drawEma > 13 ? slowRun + 1 : 0;
        if (slowRun > 120 && topoLo) { hiLocked = true; hiActive = false; applyTopo(topoLo); }
      }
      rafId = requestAnimationFrame(frame);
    }

    // — Markers cliquables → ouvre la page de la zone (+ zoom au survol)
    const ZONE_TARGETS = {
      'moyen-orient': { lon: 44, lat: 33,  scaleMul: 1.55 },
      'sahel':        { lon:  0, lat: 16,  scaleMul: 1.45 },
      'rdc':          { lon: 29, lat: -2,  scaleMul: 1.55 },
      'madagascar':   { lon: 47, lat: -19, scaleMul: 1.65 },
      'afrique':      { lon: 18, lat: -2,  scaleMul: 1.05 },
      'asie-sud':     { lon: 74, lat: 30,  scaleMul: 1.55 }
    };
    const ANCHOR_META = {
      'MO-01':    { href: THEATRE_HREF['MO-01'],    target: ZONE_TARGETS['moyen-orient'] },
      'SAHEL-02': { href: THEATRE_HREF['SAHEL-02'], target: ZONE_TARGETS['sahel']        },
      'LACS-03':  { href: THEATRE_HREF['LACS-03'],  target: ZONE_TARGETS['rdc']          },
      'MDG-04':   { href: THEATRE_HREF['MDG-04'],   target: ZONE_TARGETS['madagascar']   },
      'AFR-05':   { href: THEATRE_HREF['AFR-05'],   target: ZONE_TARGETS['afrique']      },
      'ASIE-06':  { href: THEATRE_HREF['ASIE-06'],  target: ZONE_TARGETS['asie-sud']     }
    };

    function findAnchorAt(x, y, hitRadius) {
      const r = hitRadius || 22;
      for (const a of anchors) {
        if (!visible([a.lon, a.lat])) continue;
        const xy = proj([a.lon, a.lat]);
        if (!xy) continue;
        const dx = xy[0] - x, dy = xy[1] - y;
        if (Math.sqrt(dx * dx + dy * dy) <= r) return a;
      }
      return null;
    }

    canvas.style.cursor = 'default';
    // Fiche disponible pour ce theatre ? (sections.js expose ALGOR_THEATRES)
    const hasCard = (id) => !!ANCHOR_META[id] && !!THEATRE_PHOTO[ANCHOR_META[id].href] && (window.ALGOR_THEATRES || []).some(t => t.href === ANCHOR_META[id].href);
    let lastPointer = 'mouse';
    function onDown(e) { lastPointer = e.pointerType || 'mouse'; warmPhotos(); }
    function onMove(e) {
      // Le survol n'existe qu'a la souris ; au doigt, tout passe par le tap.
      if (e.pointerType && e.pointerType !== 'mouse') return;
      warmPhotos();
      const rect = canvas.getBoundingClientRect();
      const hit = findAnchorAt(e.clientX - rect.left, e.clientY - rect.top);
      // Pointeur sur le globe : la fiche en cours reste affichee.
      clearTimeout(hideTimerRef.current);
      if (hit) {
        canvas.style.cursor = 'pointer';
        hoverAnchor = hit;
        const meta = ANCHOR_META[hit.id];
        if (meta) zoomTarget = meta.target;
        // Survol d'un theatre : sa fiche surgit (ou remplace la precedente).
        if (hasCard(hit.id)) showTh(hit.id);
      } else {
        canvas.style.cursor = 'default';
        hoverAnchor = null;
        zoomTarget = null;
      }
    }
    function onLeave(e) {
      if (e && e.pointerType && e.pointerType !== 'mouse') return;
      canvas.style.cursor = 'default'; hoverAnchor = null; zoomTarget = null;
      // Sortie du globe : la fiche se retire, sauf si le pointeur passe dessus.
      if (shownRef.current) scheduleHideTh();
    }
    function onClick(e) {
      const rect = canvas.getBoundingClientRect();
      const hit = findAnchorAt(e.clientX - rect.left, e.clientY - rect.top);
      const touch = lastPointer !== 'mouse';
      if (hit && ANCHOR_META[hit.id]) {
        // Souris : la fiche est deja la depuis le survol, le clic ouvre la carte.
        // Doigt : 1er tap = fiche, 2e tap sur le meme theatre = carte.
        if (!touch || !hasCard(hit.id) || shownRef.current === hit.id) {
          // Visiteur : vers les offres, pas vers le mur de connexion de la carte.
          window.location.href = loggedRef.current ? ANCHOR_META[hit.id].href : '/offres/';
          return;
        }
        showTh(hit.id);
      } else if (touch && shownRef.current) {
        hideTh();
      }
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('click', onClick);

    // First paint synchronously
    draw(REDUCED ? 0 : performance.now());
    let topoPoll = 0;
    (function pollTopo() {
      if (land) { draw(REDUCED ? 0 : performance.now()); return; }
      topoPoll = setTimeout(pollTopo, 120);
    })();

    rafId = requestAnimationFrame(frame);
    // Onglet en arriere-plan : rien n'est dessine (le navigateur suspend deja les images).
    const hiddenTick = 0;

    return () => {
      if (window.__algorGlobe && window.__algorGlobe.setTilt) delete window.__algorGlobe;
      cancelAnimationFrame(rafId);
      clearInterval(hiddenTick);
      clearTimeout(topoPoll);
      window.removeEventListener('resize', resize);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      if (earth) { earth.destroy(); canvas.parentNode.classList.remove('is-earth'); }
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <div className="globe-wrap">
      <style dangerouslySetInnerHTML={{ __html: GS_BUILDER_CSS }} />
      <canvas ref={earthRef} className="globe-earth" aria-hidden="true" />
      <canvas ref={canvasRef} className="globe-canvas"
              role="img" aria-label="Globe interactif — six theatres OSINT" />

      {thCard && thPhoto && (
        <aside className="globe-th" key={thCard.id} aria-label={'Théâtre ' + thCard.name} aria-live="polite"
               onPointerEnter={() => { overCardRef.current = true; clearTimeout(hideTimerRef.current); }}
               onPointerLeave={(e) => { overCardRef.current = false; if (e.pointerType === 'mouse') scheduleHideTh(); }}>
          <a className="globe-th__frame" href={thTarget} aria-label={(logged ? 'Ouvrir la carte du théâtre ' : 'Voir les offres, théâtre ') + thCard.name}>
            <img className="globe-th__photo" src={thPhoto.src} alt={thPhoto.alt} />
          </a>
          <div className="globe-th__body">
            <h3 className="globe-th__name">{thCard.name}</h3>
            <p className="globe-th__pays">{thCard.pays}</p>
            <p className="globe-th__meta">{fmtSuivi(thCard.periode)}</p>
            <p className="globe-th__meta">{fmtCouches(thCard)}</p>
            {logged ? (
              <a className="globe-th__go" href={thCard.href}>
                Ouvrir la carte
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </a>
            ) : (
              <div className="globe-th__gate">
                <span className="globe-th__lock">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                  Carte réservée aux abonnés
                </span>
                <a className="globe-th__go" href="/offres/">
                  Voir les offres
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </a>
                <a className="globe-th__login" href="#" data-algor-login>Déjà abonné ? Se connecter</a>
              </div>
            )}
          </div>
          <button type="button" className="globe-th__close" aria-label="Fermer la fiche" onClick={hideTh}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </aside>
      )}

      {hint && (
        <p className={'globe-hint' + (hintShown ? ' is-on' : '')} aria-hidden={!hintShown}>
          <span className="globe-hint__dot" aria-hidden="true" />
          {TOUCH_UI ? 'Touchez un théâtre pour voir sa fiche' : 'Survolez un théâtre pour voir sa fiche'}
        </p>
      )}

      <form className={'globe-search' + (logged ? ' globe-search--builder' : '') + (logged && stage > 0 && sel.entry ? ' globe-search--chips' : '')} onSubmit={onSubmit} autoComplete="off"
            style={{ opacity: resolved ? 1 : 0, pointerEvents: resolved ? 'auto' : 'none', transition: 'opacity .18s ease' }}>
        {logged && stage > 0 && sel.entry && (
          <span className="gsb-val" onClick={() => removeChip(0)} title="Modifier" role="button">{sel.entry.name}</span>
        )}
        {logged && stage > 1 && (<>
          <span className="gsb-sep" aria-hidden="true">·</span>
          <span className="gsb-val" onClick={() => removeChip(1)} title="Modifier" role="button">{sel.dateLabel || 'Toute période'}</span>
        </>)}
        {logged && stage > 2 && (<>
          <span className="gsb-sep" aria-hidden="true">·</span>
          <span className="gsb-val" onClick={() => removeChip(2)} title="Modifier" role="button">{sel.event || 'Toutes les typologies'}</span>
        </>)}
        <span className="gsb-line">
        <span className="globe-search__field">
          {logged && curStage === 'date' ? (
            <span className="gsb-dateprompt" onClick={() => setShowCal(true)} role="button">Choisir une période…</span>
          ) : (<>
            <input type="text" value={query} aria-label="Rechercher" placeholder=""
                   onChange={(e) => { setQuery(e.target.value); setNotFound(false); }} />
            {!query && (
              <span className="globe-search__ph" aria-hidden="true">
                {(logged ? PH[curStage] : 'Indiquez une zone, comme')}&nbsp;<span className="globe-search__ph-zone" key={phEx}>{examples[phEx % examples.length]}</span>
              </span>
            )}
          </>)}
        </span>
        {logged && (curStage === 'event' || curStage === 'actor') && (
          <button type="button" className="gsb-skip"
                  onClick={() => { setNotFound(false); pick({ value: '__all' }); }}>
            Passer
          </button>
        )}
        <button type="submit" aria-label={logged ? 'Valider' : 'Lancer la démo'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        </span>
        {logged && curStage === 'date' && showCal && sel.entry && (
          <DateRangePopup entry={sel.entry} onApply={applyDate} onClose={() => setShowCal(false)} />
        )}
      </form>
      {!logged && resolved && (
        <p className="globe-search__note">
          Démo sur n'importe quelle zone du monde · <strong>données fictives</strong>
        </p>
      )}
      {notFound && (
        <div className="globe-search__hint">
          {logged
            ? 'Choisissez un pays suivi, puis affinez par date, typologie et acteur.'
            : 'Saisissez une ville, une région ou un pays, partout dans le monde.'}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Globe });
