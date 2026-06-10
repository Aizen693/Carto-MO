(function () {
/* global React, d3, topojson */
// Globe interactif D3 orthographique — repris a l'identique du site Algor Int.
// Geometrie reelle (topojson world-atlas countries-110m), 6 theatres, flux animes.
// Seule difference vs le site : palette recoloree — terres sable, mers bleu ciel doux.

const {
  useEffect: useEffectGlobe,
  useRef: useRefGlobe,
  useState: useStateGlobe
} = React;

// ═══════════════════════════════════════════════════════
//  MODE DÉMO — recherche d'une zone → zoom + points fictifs + cartes HUD
//  100 % fictif, aucune donnée client. Design aligné sur le reste du site.
// ═══════════════════════════════════════════════════════

// — normalisation (minuscules, sans accents, sans ponctuation)
function normZone(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// — gazetteer FR : nom → centre [lon, lat] + multiplicateur de zoom (s)
const GAZETTEER = [
// ── continents / grandes régions (zoom large)
{
  k: ['afrique'],
  lon: 18,
  lat: 2,
  s: 1.05,
  label: 'Afrique'
}, {
  k: ['europe'],
  lon: 12,
  lat: 50,
  s: 1.2,
  label: 'Europe'
}, {
  k: ['asie'],
  lon: 90,
  lat: 40,
  s: 0.95,
  label: 'Asie'
}, {
  k: ['amerique du nord', 'amerique nord'],
  lon: -100,
  lat: 45,
  s: 1.0,
  label: 'Amérique du Nord'
}, {
  k: ['amerique latine', 'amerique du sud', 'amerique sud'],
  lon: -62,
  lat: -15,
  s: 1.0,
  label: 'Amérique latine'
}, {
  k: ['amerique centrale'],
  lon: -86,
  lat: 14,
  s: 1.5,
  label: 'Amérique centrale'
}, {
  k: ['moyen orient', 'proche orient'],
  lon: 44,
  lat: 30,
  s: 1.3,
  label: 'Moyen-Orient'
}, {
  k: ['maghreb'],
  lon: 5,
  lat: 31,
  s: 1.4,
  label: 'Maghreb'
}, {
  k: ['sahel'],
  lon: 2,
  lat: 16,
  s: 1.35,
  label: 'Sahel'
}, {
  k: ['corne de l afrique', 'corne afrique'],
  lon: 45,
  lat: 8,
  s: 1.4,
  label: "Corne de l'Afrique"
}, {
  k: ['afrique de l ouest', 'afrique ouest'],
  lon: -4,
  lat: 13,
  s: 1.4,
  label: "Afrique de l'Ouest"
}, {
  k: ['afrique centrale'],
  lon: 19,
  lat: 2,
  s: 1.3,
  label: 'Afrique centrale'
}, {
  k: ['afrique de l est', 'afrique est'],
  lon: 38,
  lat: 0,
  s: 1.3,
  label: "Afrique de l'Est"
}, {
  k: ['afrique australe', 'afrique du sud region'],
  lon: 26,
  lat: -26,
  s: 1.3,
  label: 'Afrique australe'
}, {
  k: ['grands lacs'],
  lon: 29,
  lat: -2,
  s: 1.55,
  label: 'Grands Lacs'
}, {
  k: ['balkans'],
  lon: 20,
  lat: 43,
  s: 1.6,
  label: 'Balkans'
}, {
  k: ['caucase'],
  lon: 45,
  lat: 42,
  s: 1.7,
  label: 'Caucase'
}, {
  k: ['asie centrale'],
  lon: 65,
  lat: 42,
  s: 1.3,
  label: 'Asie centrale'
}, {
  k: ['asie du sud', 'asie sud'],
  lon: 78,
  lat: 22,
  s: 1.25,
  label: 'Asie du Sud'
}, {
  k: ['asie du sud est', 'asie sud est'],
  lon: 105,
  lat: 10,
  s: 1.2,
  label: 'Asie du Sud-Est'
}, {
  k: ['peninsule arabique', 'golfe persique', 'golfe', 'arabie'],
  lon: 48,
  lat: 24,
  s: 1.4,
  label: 'Péninsule arabique'
},
// ── pays
{
  k: ['mali'],
  lon: -3,
  lat: 17,
  s: 1.6,
  label: 'Mali'
}, {
  k: ['niger'],
  lon: 9,
  lat: 17,
  s: 1.6,
  label: 'Niger'
}, {
  k: ['burkina faso', 'burkina'],
  lon: -1.5,
  lat: 12,
  s: 1.7,
  label: 'Burkina Faso'
}, {
  k: ['tchad'],
  lon: 19,
  lat: 15,
  s: 1.5,
  label: 'Tchad'
}, {
  k: ['mauritanie'],
  lon: -10,
  lat: 20,
  s: 1.5,
  label: 'Mauritanie'
}, {
  k: ['nigeria', 'nigéria'],
  lon: 8,
  lat: 9,
  s: 1.6,
  label: 'Nigeria'
}, {
  k: ['soudan'],
  lon: 30,
  lat: 15,
  s: 1.4,
  label: 'Soudan'
}, {
  k: ['soudan du sud'],
  lon: 31,
  lat: 7,
  s: 1.6,
  label: 'Soudan du Sud'
}, {
  k: ['somalie'],
  lon: 46,
  lat: 5,
  s: 1.5,
  label: 'Somalie'
}, {
  k: ['ethiopie', 'éthiopie'],
  lon: 39,
  lat: 8,
  s: 1.5,
  label: 'Éthiopie'
}, {
  k: ['kenya'],
  lon: 38,
  lat: 1,
  s: 1.6,
  label: 'Kenya'
}, {
  k: ['rdc', 'congo', 'republique democratique du congo', 'republique democratique'],
  lon: 23,
  lat: -2,
  s: 1.25,
  label: 'RDC'
}, {
  k: ['rwanda'],
  lon: 30,
  lat: -2,
  s: 1.95,
  label: 'Rwanda'
}, {
  k: ['centrafrique', 'republique centrafricaine'],
  lon: 21,
  lat: 7,
  s: 1.6,
  label: 'Centrafrique'
}, {
  k: ['cameroun'],
  lon: 12,
  lat: 6,
  s: 1.6,
  label: 'Cameroun'
}, {
  k: ['libye'],
  lon: 17,
  lat: 27,
  s: 1.4,
  label: 'Libye'
}, {
  k: ['algerie', 'algérie'],
  lon: 3,
  lat: 28,
  s: 1.2,
  label: 'Algérie'
}, {
  k: ['tunisie'],
  lon: 9,
  lat: 34,
  s: 1.7,
  label: 'Tunisie'
}, {
  k: ['maroc'],
  lon: -6,
  lat: 32,
  s: 1.5,
  label: 'Maroc'
}, {
  k: ['egypte', 'égypte'],
  lon: 30,
  lat: 27,
  s: 1.4,
  label: 'Égypte'
}, {
  k: ['syrie'],
  lon: 38,
  lat: 35,
  s: 1.6,
  label: 'Syrie'
}, {
  k: ['liban'],
  lon: 35.8,
  lat: 33.9,
  s: 1.95,
  label: 'Liban'
}, {
  k: ['irak', 'iraq'],
  lon: 44,
  lat: 33,
  s: 1.5,
  label: 'Irak'
}, {
  k: ['iran'],
  lon: 54,
  lat: 32,
  s: 1.2,
  label: 'Iran'
}, {
  k: ['yemen', 'yémen'],
  lon: 47,
  lat: 15,
  s: 1.5,
  label: 'Yémen'
}, {
  k: ['arabie saoudite'],
  lon: 45,
  lat: 24,
  s: 1.2,
  label: 'Arabie saoudite'
}, {
  k: ['israel', 'israël'],
  lon: 35,
  lat: 31,
  s: 1.9,
  label: 'Israël'
}, {
  k: ['palestine', 'gaza', 'cisjordanie'],
  lon: 34.5,
  lat: 31.5,
  s: 2.0,
  label: 'Palestine'
}, {
  k: ['jordanie'],
  lon: 36,
  lat: 31,
  s: 1.7,
  label: 'Jordanie'
}, {
  k: ['turquie'],
  lon: 35,
  lat: 39,
  s: 1.3,
  label: 'Turquie'
}, {
  k: ['afghanistan'],
  lon: 66,
  lat: 34,
  s: 1.4,
  label: 'Afghanistan'
}, {
  k: ['pakistan'],
  lon: 70,
  lat: 30,
  s: 1.3,
  label: 'Pakistan'
}, {
  k: ['inde'],
  lon: 79,
  lat: 22,
  s: 1.0,
  label: 'Inde'
}, {
  k: ['ukraine'],
  lon: 32,
  lat: 49,
  s: 1.3,
  label: 'Ukraine'
}, {
  k: ['russie'],
  lon: 90,
  lat: 60,
  s: 0.85,
  label: 'Russie'
}, {
  k: ['venezuela'],
  lon: -66,
  lat: 7,
  s: 1.5,
  label: 'Venezuela'
}, {
  k: ['colombie'],
  lon: -74,
  lat: 4,
  s: 1.5,
  label: 'Colombie'
}, {
  k: ['mexique'],
  lon: -102,
  lat: 23,
  s: 1.2,
  label: 'Mexique'
}, {
  k: ['haiti', 'haïti'],
  lon: -72,
  lat: 19,
  s: 1.95,
  label: 'Haïti'
}, {
  k: ['bresil', 'brésil'],
  lon: -52,
  lat: -10,
  s: 0.95,
  label: 'Brésil'
}, {
  k: ['madagascar'],
  lon: 47,
  lat: -19,
  s: 1.4,
  label: 'Madagascar'
}, {
  k: ['mozambique'],
  lon: 36,
  lat: -18,
  s: 1.4,
  label: 'Mozambique'
},
// ── villes
{
  k: ['bamako'],
  lon: -8,
  lat: 12.6,
  s: 2.0,
  label: 'Bamako'
}, {
  k: ['beyrouth'],
  lon: 35.5,
  lat: 33.9,
  s: 2.1,
  label: 'Beyrouth'
}, {
  k: ['bagdad'],
  lon: 44.4,
  lat: 33.3,
  s: 2.0,
  label: 'Bagdad'
}, {
  k: ['damas'],
  lon: 36.3,
  lat: 33.5,
  s: 2.0,
  label: 'Damas'
}, {
  k: ['kinshasa'],
  lon: 15.3,
  lat: -4.3,
  s: 2.0,
  label: 'Kinshasa'
}, {
  k: ['goma'],
  lon: 29.2,
  lat: -1.7,
  s: 2.1,
  label: 'Goma'
}, {
  k: ['tripoli'],
  lon: 13.2,
  lat: 32.9,
  s: 2.0,
  label: 'Tripoli'
}, {
  k: ['sanaa', 'sana a'],
  lon: 44.2,
  lat: 15.4,
  s: 2.0,
  label: 'Sanaa'
}];
function resolveZone(raw) {
  const q = normZone(raw);
  if (!q) return null;
  let best = null,
    bestLen = 0;
  for (const e of GAZETTEER) {
    for (const key of e.k) {
      if (q === key) return e;
      if ((q.includes(key) || key.includes(q)) && key.length > bestLen) {
        best = e;
        bestLen = key.length;
      }
    }
  }
  return best;
}

// — convertit l'échelle orthographique du gazetteer en niveau de zoom Mapbox
function zoneZoom(z) {
  return Math.round((2.2 + z.s * 1.9) * 10) / 10; // continent ~4.1, pays ~5, ville ~6.2
}

// — zones des 4 coins du globe : défilent en dégradé dans la barre (faux placeholder)
const SEARCH_EXAMPLES = ['Tokyo', 'Bogotá', 'Kinshasa', 'Ukraine', 'Alaska', 'Beyrouth', 'Mexico', 'Sahel', 'Cachemire', 'Somalie', 'Caracas', 'Mali'];
function Globe() {
  const canvasRef = useRefGlobe(null);
  const [query, setQuery] = useStateGlobe('');
  const [notFound, setNotFound] = useStateGlobe(false);
  const [phEx, setPhEx] = useStateGlobe(0);
  useEffectGlobe(() => {
    const id = setInterval(() => setPhEx(i => (i + 1) % SEARCH_EXAMPLES.length), 2400);
    return () => clearInterval(id);
  }, []);
  const onSubmit = e => {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) {
      setNotFound(true);
      return;
    }
    setNotFound(false);
    // La recherche ouvre la démo : géocodage mondial côté /demo/.
    window.location.href = '/demo/?q=' + encodeURIComponent(q);
  };
  useEffectGlobe(() => {
    const canvas = canvasRef.current;
    if (!canvas || !window.d3 || !window.topojson) return;
    const ctx = canvas.getContext('2d');

    // — projection
    const proj = d3.geoOrthographic().clipAngle(90).rotate([-25, -10, 0]).translate([280, 280]).scale(260).precision(0.4);
    const path = d3.geoPath(proj, ctx);

    // — sizing with DPR
    let W = 560,
      H = 560,
      baseScale = 260;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      const r = canvas.getBoundingClientRect();
      W = Math.max(120, r.width || canvas.clientWidth || 560);
      H = Math.max(120, r.height || canvas.clientHeight || 560);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      baseScale = Math.max(40, Math.min(W, H) / 2 - 6);
      proj.translate([W / 2, H / 2]).scale(baseScale);
    }
    resize();
    let ro = null;
    if (window.ResizeObserver) {
      try {
        ro = new ResizeObserver(resize);
        ro.observe(canvas);
      } catch (_) {}
    }
    window.addEventListener('resize', resize);

    // — load world topology asynchronously; sphere/graticule render immediately
    //   110m (leger) peint en premier, puis upgrade silencieux vers 50m :
    //   cotes plus fines et petites iles, surtout visibles au zoom hover.
    //   Si la machine rame en 50m, retour automatique et definitif au 110m.
    let land = null,
      borders = null;
    let topoLo = null,
      hiActive = false,
      hiLocked = false;
    function applyTopo(topo) {
      land = topojson.feature(topo, topo.objects.countries);
      borders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
    }
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json').then(r => r.json()).then(topo => {
      topoLo = topo;
      if (!hiActive) applyTopo(topo);
    }).catch(() => {/* sphere-only fallback is acceptable */});
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json').then(r => r.json()).then(topo => {
      if (hiLocked) return;
      hiActive = true;
      applyTopo(topo);
    }).catch(() => {/* on reste en 110m */});
    // — lacs et plans d'eau (Natural Earth 50m, heberge en local) :
    //   remplis dans la teinte exacte de la mer, contour tres discret.
    let lakes = null;
    fetch('./shared/home/lakes-50m.json?v=20260610a').then(r => r.json()).then(g => {
      lakes = g;
    }).catch(() => {/* sans lacs, rendu identique a avant */});
    const graticule = d3.geoGraticule10();
    const sphere = {
      type: 'Sphere'
    };

    // — anchors (theaters)
    const anchors = [{
      id: 'MO-01',
      lon: 44,
      lat: 33,
      label: 'Moyen-Orient'
    }, {
      id: 'SAHEL-02',
      lon: 0,
      lat: 16,
      label: 'Sahel'
    }, {
      id: 'LACS-03',
      lon: 29,
      lat: -2,
      label: 'Grands Lacs'
    }, {
      id: 'MDG-04',
      lon: 47,
      lat: -19,
      label: 'Madagascar'
    }, {
      id: 'AFR-05',
      lon: 43,
      lat: 12,
      label: 'Afrique Maritime'
    }, {
      id: 'ASIE-06',
      lon: 74,
      lat: 30,
      label: 'Asie du Sud'
    }];

    // — flow definitions (50 terrestres + 35 maritimes)
    const T = (a, b) => ({
      a,
      b,
      kind: 'land'
    });
    const M = (a, b) => ({
      a,
      b,
      kind: 'sea'
    });
    const arcs = [/* ───────────── TERRESTRES ───────────── */
    T([36.30, 33.50], [35.50, 33.90]), T([36.30, 33.50], [37.16, 36.20]), T([44.40, 33.30], [36.30, 33.50]), T([44.40, 33.30], [43.13, 36.34]), T([44.20, 15.40], [45.03, 12.78]), T([44.40, 33.30], [51.42, 35.70]), T([51.42, 35.70], [59.61, 36.30]), T([44.00, 36.20], [43.13, 36.34]), T([35.50, 33.90], [35.20, 33.27]), T([51.42, 35.70], [46.30, 38.08]), T([59.61, 36.30], [62.20, 34.34]), T([45.03, 12.78], [49.13, 14.55]), T([-8.00, 12.65], [-0.04, 16.27]), T([-8.00, 12.65], [-1.52, 12.37]), T([-1.52, 12.37], [2.11, 13.51]), T([2.11, 13.51], [7.99, 16.97]), T([7.99, 16.97], [15.05, 12.13]), T([-2.99, 16.77], [-0.04, 16.27]), T([-4.18, 14.50], [-8.00, 12.65]), T([12.61, 13.31], [13.16, 11.85]), T([2.11, 13.51], [12.61, 13.31]), T([-1.52, 12.37], [-4.30, 11.18]), T([-8.00, 12.65], [-4.18, 14.50]), T([1.41, 18.44], [1.05, 20.20]), T([15.31, -4.32], [29.22, -1.68]), T([29.22, -1.68], [28.86, -2.50]), T([29.22, -1.68], [29.47, 0.49]), T([29.47, 0.49], [30.25, 1.56]), T([30.06, -1.94], [29.22, -1.68]), T([29.36, -3.38], [28.86, -2.50]), T([32.58, 0.32], [30.25, 1.56]), T([28.86, -2.50], [29.13, -3.40]), T([29.47, 0.49], [29.28, 0.13]), T([15.31, -4.32], [27.49, -11.66]), T([47.51, -18.91], [49.40, -18.15]), T([47.51, -18.91], [46.32, -15.72]), T([47.51, -18.91], [43.68, -23.35]), T([47.51, -18.91], [47.08, -21.45]), T([43.68, -23.35], [46.99, -25.03]), T([46.32, -15.72], [49.29, -12.32]), T([49.40, -18.15], [50.17, -14.27]), T([43.68, -23.35], [47.08, -21.45]), T([67.00, 24.86], [74.36, 31.55]), T([74.36, 31.55], [73.05, 33.69]), T([73.05, 33.69], [69.18, 34.53]), T([69.18, 34.53], [65.71, 31.62]), T([74.79, 34.08], [77.21, 28.61]), T([77.21, 28.61], [72.83, 18.98]), T([65.71, 31.62], [66.99, 30.18]), T([66.99, 30.18], [67.00, 24.86]), /* ───────────── MARITIMES ───────────── */
    M([56.27, 27.18], [58.00, 24.00]), M([45.03, 12.78], [43.15, 11.60]), M([35.78, 35.52], [35.50, 33.90]), M([39.17, 21.49], [37.22, 19.62]), M([45.03, 12.78], [49.13, 14.55]), M([35.50, 33.90], [35.00, 32.83]), M([3.40, 6.50], [-4.00, 5.30]), M([-4.00, 5.30], [-17.40, 14.70]), M([-17.00, 20.90], [-15.40, 28.00]), M([-17.40, 14.70], [-7.59, 33.60]), M([-17.40, 14.70], [-23.51, 14.93]), M([29.20, -5.95], [29.13, -3.40]), M([29.22, -1.68], [28.86, -2.50]), M([29.63, -4.88], [31.10, -8.77]), M([18.42, -33.92], [39.28, -6.82]), M([3.40, 6.50], [11.85, -4.78]), M([32.55, 29.97], [33.04, 34.71]), M([39.66, -4.04], [43.15, 11.60]), M([31.04, -29.86], [57.50, -20.16]), M([18.42, -33.92], [14.51, -22.95]), M([3.40, 6.50], [13.23, -8.84]), M([45.32, 2.04], [39.66, -4.04]), M([49.40, -18.15], [49.29, -12.32]), M([46.32, -15.72], [43.27, -11.70]), M([49.40, -18.15], [57.50, -20.16]), M([49.40, -18.15], [55.45, -20.88]), M([43.68, -23.35], [32.57, -25.97]), M([67.00, 24.86], [72.83, 18.98]), M([72.83, 18.98], [79.85, 6.93]), M([67.00, 24.86], [62.32, 25.12]), M([62.32, 25.12], [56.27, 27.18]), M([72.83, 18.98], [73.51, 4.18]), M([79.85, 6.93], [91.81, 22.34]), M([72.83, 18.98], [55.27, 25.20]), M([67.00, 24.86], [55.27, 25.20])];
    arcs.forEach((arc, i) => {
      arc.interp = d3.geoInterpolate(arc.a, arc.b);
      arc.dur = (arc.kind === 'sea' ? 7200 : 5200) + i % 5 * 380;
      arc.offset = i * 730 % arc.dur;
      arc.np = arc.kind === 'sea' ? 2 : 4;
      arc.trail = arc.kind === 'sea' ? 0.06 : 0.10;
    });

    // — visibility test against current rotation (orthographic back-face cull)
    function visible(coord) {
      const r = proj.rotate();
      const cl = -r[0] * Math.PI / 180,
        cp = -r[1] * Math.PI / 180;
      const lo = coord[0] * Math.PI / 180,
        la = coord[1] * Math.PI / 180;
      return Math.cos(la) * Math.cos(cp) * Math.cos(lo - cl) + Math.sin(la) * Math.sin(cp) > 0.02;
    }

    // — palette : terres SABLE, mers BLEU CIEL doux (non agressif).
    const C = {
      ocean: '#AEC9D7',
      // mer — bleu ciel desature
      land: '#D9C9A3',
      // terre — sable
      border: 'rgba(92,74,42,0.30)',
      // frontieres pays
      grat: 'rgba(255,255,255,0.45)',
      // graticule
      rim: 'rgba(70,90,105,0.55)',
      // bord du globe
      fluxLand: '246,162,84',
      // flux terrestres — orange clair (glow holo)
      fluxSea: '39,174,192' // flux maritimes — cyan (glow holo)
    };

    // — sprites de glow pre-rendus : avant, chaque particule recreait son
    //   createRadialGradient a chaque frame (~80 gradients/frame). Un sprite
    //   redessine via drawImage est identique a l'oeil et bien plus rapide.
    function glowSprite(rgb, stops) {
      const S = 64,
        c = document.createElement('canvas');
      c.width = S;
      c.height = S;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      stops.forEach(([o, a]) => grad.addColorStop(o, `rgba(${rgb},${a})`));
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      return c;
    }
    const SPRITES = {
      land: glowSprite(C.fluxLand, [[0, 0.55], [0.4, 0.24], [1, 0]]),
      sea: glowSprite(C.fluxSea, [[0, 0.55], [0.4, 0.24], [1, 0]]),
      anchor: glowSprite(C.fluxLand, [[0, 1], [0.45, 0.333], [1, 0]])
    };
    function draw(t) {
      ctx.clearRect(0, 0, W, H);

      // Clip circulaire — le globe reste TOUJOURS rond, meme zoome (jamais un carre).
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, Math.min(W, H) / 2, 0, Math.PI * 2);
      ctx.clip();

      // sphere fill (ocean)
      ctx.beginPath();
      path(sphere);
      ctx.fillStyle = C.ocean;
      ctx.fill();

      // graticule
      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = C.grat;
      ctx.lineWidth = 0.55;
      ctx.stroke();

      // land — fill + borders
      if (land) {
        ctx.beginPath();
        path(land);
        ctx.fillStyle = C.land;
        ctx.fill();
        ctx.beginPath();
        path(borders);
        ctx.strokeStyle = C.border;
        ctx.lineWidth = 0.45;
        ctx.stroke();
      }

      // lacs et plans d'eau — meme teinte que la mer, par-dessus les
      //   frontieres pour que celles-ci ne traversent pas les lacs.
      if (lakes) {
        ctx.beginPath();
        path(lakes);
        ctx.fillStyle = C.ocean;
        ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = C.border;
        ctx.lineWidth = 0.3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // sphere rim
      ctx.beginPath();
      path(sphere);
      ctx.strokeStyle = C.rim;
      ctx.lineWidth = 0.75;
      ctx.stroke();

      // arc traces (back drop, very fine)
      arcs.forEach(arc => {
        if (!visible(arc.a) && !visible(arc.b)) return;
        const isSea = arc.kind === 'sea';
        ctx.beginPath();
        path({
          type: 'LineString',
          coordinates: [arc.a, arc.b]
        });
        ctx.setLineDash(isSea ? [1.4, 2.6] : []);
        ctx.strokeStyle = isSea ? `rgba(${C.fluxSea},0.42)` : `rgba(${C.fluxLand},0.42)`;
        ctx.lineWidth = isSea ? 0.6 : 0.7;
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // endpoint pins (city dots)
      arcs.forEach(arc => {
        const isSea = arc.kind === 'sea';
        [arc.a, arc.b].forEach(pt => {
          if (!visible(pt)) return;
          const xy = proj(pt);
          if (!xy) return;
          ctx.beginPath();
          ctx.arc(xy[0], xy[1], isSea ? 0.9 : 1.1, 0, Math.PI * 2);
          ctx.fillStyle = isSea ? `rgba(${C.fluxSea},0.72)` : `rgba(${C.fluxLand},0.72)`;
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
          const headPhase = ((t + arc.offset + h * arc.dur / heads) % arc.dur + arc.dur) % arc.dur / arc.dur;
          for (let i = 0; i < arc.np; i++) {
            let phase = headPhase - i * arc.trail;
            if (phase < 0) continue;
            if (phase > 1) continue;
            const p = arc.interp(phase);
            if (!visible(p)) continue;
            const xy = proj(p);
            if (!xy) continue;
            const fade = Math.sin(phase * Math.PI);
            const decay = Math.pow(1 - i / arc.np, 1.8);
            const baseOp = (isSea ? 0.85 : 0.98) * fade * decay;
            const baseR = (isSea ? 1.0 : 1.6) * (i === 0 ? 1 : 1 - i * 0.18);
            const isHead = i === 0;

            // 1) glow — bloom radial degrade (sprite pre-rendu)
            const glowR = baseR * (isHead ? isSea ? 7.5 : 8.5 : 4.5);
            ctx.globalAlpha = baseOp;
            ctx.drawImage(isSea ? SPRITES.sea : SPRITES.land, xy[0] - glowR, xy[1] - glowR, glowR * 2, glowR * 2);
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
      anchors.forEach((a, i) => {
        if (!visible([a.lon, a.lat])) return;
        const xy = proj([a.lon, a.lat]);
        if (!xy) return;
        const hovered = hoverAnchor && hoverAnchor.id === a.id;
        const pulse = (Math.sin(t / 1100 + i * 1.7) + 1) / 2;
        const k = hovered ? 1.5 : 1;

        // glow bloom orange — meme teinte que les flux terrestres (sprite)
        const glowR = (10 + pulse * 4) * k;
        ctx.globalAlpha = 0.42 + pulse * 0.16;
        ctx.drawImage(SPRITES.anchor, xy[0] - glowR, xy[1] - glowR, glowR * 2, glowR * 2);
        ctx.globalAlpha = 1;

        // halo orange serre
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], 3.4 * k, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${C.fluxLand},0.82)`;
        ctx.fill();

        // coeur blanc lumineux
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], 1.7 * k, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.98)';
        ctx.fill();

        // label — toujours visible : annotation cartographique sobre,
        //   halo blanc doux pour la lisibilite, aucun cadre.
        ctx.save();
        ctx.font = (hovered ? '500 ' : '400 ') + '11px "JetBrains Mono", ui-monospace, Menlo, monospace';
        ctx.letterSpacing = '0.03em';
        ctx.textBaseline = 'middle';
        const tx = xy[0] + 12,
          ty = xy[1] + 0.5;
        ctx.fillStyle = hovered ? '#2c2840' : '#4a4660';
        ctx.shadowColor = 'rgba(255,255,255,0.95)';
        ctx.shadowBlur = 5;
        ctx.fillText(a.label, tx, ty); // passes empilees -> halo blanc
        ctx.fillText(a.label, tx, ty);
        ctx.shadowBlur = 0;
        ctx.fillText(a.label, tx, ty); // passe nette finale
        ctx.restore();
      });
      ctx.restore(); // fin du clip circulaire
    }

    // — animation loop, slow longitude rotation + zoom au hover des marqueurs
    let last = performance.now();
    const period = 30000;
    let zoomTarget = null;
    let hoverAnchor = null;
    function step(now) {
      const dt = Math.min(now - last, 80);
      last = now;
      const r = proj.rotate();
      if (zoomTarget) {
        const ease = 0.06;
        const targetLon = -zoomTarget.lon;
        const targetLat = -zoomTarget.lat;
        const dLon = (targetLon - r[0] + 540) % 360 - 180;
        proj.rotate([r[0] + dLon * ease, r[1] + (targetLat - r[1]) * ease, 0]);
        const targetScale = baseScale * zoomTarget.scaleMul;
        const cs = proj.scale();
        proj.scale(cs + (targetScale - cs) * ease);
      } else {
        proj.rotate([r[0] + dt / period * 360, r[1] + (0 - r[1]) * 0.04, 0]);
        const cs = proj.scale();
        if (Math.abs(cs - baseScale) > 0.4) {
          proj.scale(cs + (baseScale - cs) * 0.06);
        }
      }
      draw(now);
    }
    let rafId = 0;
    // — garde-fou perf : si le rendu 50m depasse durablement le budget frame,
    //   retour definitif au 110m (meme rendu qu'avant l'upgrade).
    let drawEma = 0,
      slowRun = 0;
    function frame(now) {
      const t0 = performance.now();
      step(now);
      drawEma = drawEma * 0.9 + (performance.now() - t0) * 0.1;
      if (hiActive && !hiLocked) {
        slowRun = drawEma > 13 ? slowRun + 1 : 0;
        if (slowRun > 120 && topoLo) {
          hiLocked = true;
          hiActive = false;
          applyTopo(topoLo);
        }
      }
      rafId = requestAnimationFrame(frame);
    }

    // — Markers cliquables → ouvre la page de la zone (+ zoom au survol)
    const ZONE_TARGETS = {
      'moyen-orient': {
        lon: 44,
        lat: 33,
        scaleMul: 1.55
      },
      'sahel': {
        lon: 0,
        lat: 16,
        scaleMul: 1.45
      },
      'rdc': {
        lon: 29,
        lat: -2,
        scaleMul: 1.55
      },
      'madagascar': {
        lon: 47,
        lat: -19,
        scaleMul: 1.65
      },
      'afrique': {
        lon: 18,
        lat: -2,
        scaleMul: 1.05
      },
      'asie-sud': {
        lon: 74,
        lat: 30,
        scaleMul: 1.55
      }
    };
    const ANCHOR_META = {
      'MO-01': {
        href: '/moyen-orient/',
        target: ZONE_TARGETS['moyen-orient']
      },
      'SAHEL-02': {
        href: '/sahel/',
        target: ZONE_TARGETS['sahel']
      },
      'LACS-03': {
        href: '/rdc/',
        target: ZONE_TARGETS['rdc']
      },
      'MDG-04': {
        href: '/madagascar/',
        target: ZONE_TARGETS['madagascar']
      },
      'AFR-05': {
        href: '/afrique/',
        target: ZONE_TARGETS['afrique']
      },
      'ASIE-06': {
        href: '/asie-sud/',
        target: ZONE_TARGETS['asie-sud']
      }
    };
    function findAnchorAt(x, y, hitRadius) {
      const r = hitRadius || 22;
      for (const a of anchors) {
        if (!visible([a.lon, a.lat])) continue;
        const xy = proj([a.lon, a.lat]);
        if (!xy) continue;
        const dx = xy[0] - x,
          dy = xy[1] - y;
        if (Math.sqrt(dx * dx + dy * dy) <= r) return a;
      }
      return null;
    }
    canvas.style.cursor = 'default';
    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      const hit = findAnchorAt(e.clientX - rect.left, e.clientY - rect.top);
      if (hit) {
        canvas.style.cursor = 'pointer';
        hoverAnchor = hit;
        const meta = ANCHOR_META[hit.id];
        if (meta) zoomTarget = meta.target;
      } else {
        canvas.style.cursor = 'default';
        hoverAnchor = null;
        zoomTarget = null;
      }
    }
    function onLeave() {
      canvas.style.cursor = 'default';
      hoverAnchor = null;
      zoomTarget = null;
    }
    function onClick(e) {
      const rect = canvas.getBoundingClientRect();
      const hit = findAnchorAt(e.clientX - rect.left, e.clientY - rect.top);
      if (hit && ANCHOR_META[hit.id]) window.location.href = ANCHOR_META[hit.id].href;
    }
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', onClick);

    // First paint synchronously
    draw(performance.now());
    let topoPoll = 0;
    (function pollTopo() {
      if (land) {
        draw(performance.now());
        return;
      }
      topoPoll = setTimeout(pollTopo, 120);
    })();
    rafId = requestAnimationFrame(frame);
    const hiddenTick = setInterval(() => {
      if (document.hidden) step(performance.now());
    }, 1000 / 24);
    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(hiddenTick);
      clearTimeout(topoPoll);
      window.removeEventListener('resize', resize);
      if (ro) ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('click', onClick);
    };
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    className: "globe-wrap"
  }, /*#__PURE__*/React.createElement("canvas", {
    ref: canvasRef,
    className: "globe-canvas",
    role: "img",
    "aria-label": "Globe interactif \u2014 six theatres OSINT"
  }), /*#__PURE__*/React.createElement("form", {
    className: "globe-search",
    onSubmit: onSubmit
  }, /*#__PURE__*/React.createElement("span", {
    className: "globe-search__field"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: query,
    "aria-label": "Rechercher une zone",
    placeholder: "",
    onChange: e => {
      setQuery(e.target.value);
      setNotFound(false);
    }
  }), !query && /*#__PURE__*/React.createElement("span", {
    className: "globe-search__ph",
    "aria-hidden": "true"
  }, "Tapez une zone, comme\xA0", /*#__PURE__*/React.createElement("span", {
    className: "globe-search__ph-zone",
    key: phEx
  }, SEARCH_EXAMPLES[phEx]))), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    "aria-label": "Lancer la d\xE9mo"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "21",
    y1: "21",
    x2: "16.65",
    y2: "16.65"
  })))), notFound && /*#__PURE__*/React.createElement("div", {
    className: "globe-search__hint"
  }, "Saisissez une ville, une r\xE9gion ou un pays, partout dans le monde."));
}
Object.assign(window, {
  Globe
});
})();
