/* global d3, topojson */
// Planisphere — version aplatie du globe d'accueil (shared/home/globe.jsx).
// Meme palette, memes 6 ancres, memes flux animes. Projection equirectangulaire
// centree sur 25°E pour cadrer Afrique / Moyen-Orient / Asie du Sud.

(function () {
  // Nettoie l'instance precedente (re-exec apres nav cote client).
  if (window.__planisphereCleanup) {
    try { window.__planisphereCleanup(); } catch (_) {}
    window.__planisphereCleanup = null;
  }

  function init() {
    const canvas = document.querySelector('.planisphere-canvas');
    if (!canvas) return;
    if (!window.d3 || !window.topojson) { setTimeout(init, 80); return; }
    const ctx = canvas.getContext('2d');

    // — projection equirectangulaire centree Afrique/MO
    const proj = d3.geoEquirectangular()
      .rotate([-25, 0, 0])
      .translate([280, 224])
      .scale(120);
    const path = d3.geoPath(proj, ctx);
    canvas.__proj = proj; // v5 : lecture des coordonnées sous le curseur (proj.invert)

    // — sizing with DPR
    let W = 560, H = 448;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const sphere = { type: 'Sphere' };
    function resize() {
      const r = canvas.getBoundingClientRect();
      W = Math.max(120, r.width  || canvas.clientWidth  || 560);
      H = Math.max(120, r.height || canvas.clientHeight || 448);
      canvas.width  = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      // Remplit la HAUTEUR du cadre (les bords est/ouest sont crops)
      const scaleH = H / Math.PI;
      const scaleW = W / (2 * Math.PI);
      proj.scale(Math.max(scaleH, scaleW * 1.05))
          .translate([W / 2, H / 2]);
    }
    resize();
    let ro = null;
    if (window.ResizeObserver) {
      try { ro = new ResizeObserver(resize); ro.observe(canvas); } catch (_) {}
    }
    window.addEventListener('resize', resize);

    // — world topology (async)
    let land = null, borders = null;
    // 110m d'abord (léger, affiché tout de suite), puis 50m pour des côtes nettes en grand écran.
    const charger = (res) => fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-' + res + '.json')
      .then(r => r.json())
      .then(topo => {
        land    = topojson.feature(topo, topo.objects.countries);
        borders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
      });
    charger('110m').then(() => { if (window.PLANISPHERE_DETAIL) return charger('50m'); }).catch(() => {});
    const graticule = d3.geoGraticule10();

    // — anchors (theaters) — identiques au globe
    const anchors = [
      { id: 'MO-01',    lon:  44,   lat:  33,   label: 'Moyen-Orient', pos: 'haut' },
      { id: 'SAHEL-02', lon:   0,   lat:  16,   label: 'Sahel', pos: 'haut' },
      { id: 'LACS-03',  lon:  29,   lat:  -2,   label: 'Grands Lacs' },
      { id: 'MDG-04',   lon:  47,   lat: -19,   label: 'Madagascar' },
      { id: 'AFR-05',   lon:  43,   lat:  12,   label: 'Afrique Maritime' },
      { id: 'ASIE-06',  lon:  74,   lat:  30,   label: 'Asie du Sud' }
    ];

    // — flux (memes definitions que le globe)
    const T = (a, b) => ({ a, b, kind: 'land' });
    const M = (a, b) => ({ a, b, kind: 'sea'  });
    const arcs = [
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
      // Detroits / mer Rouge / Golfe persique
      M([56.27, 27.18], [58.00, 24.00]),   // Ormuz
      M([62.32, 25.12], [56.27, 27.18]),   // Iran coast -> Ormuz
      M([67.00, 24.86], [62.32, 25.12]),   // Karachi -> Iran coast
      M([45.03, 12.78], [43.15, 11.60]),   // Bab el-Mandeb
      M([45.03, 12.78], [49.13, 14.55]),   // Aden -> Mukalla (mer)
      M([39.17, 21.49], [37.22, 19.62]),   // Mer Rouge
      M([32.55, 29.97], [33.04, 34.71]),   // Suez -> Mediterranee
      // Mediterranee
      M([35.78, 35.52], [35.50, 33.90]),
      M([35.50, 33.90], [35.00, 32.83]),
      // Cote ouest Afrique (golfe de Guinee + Atlantique)
      M([ 3.40,  6.50], [-4.00,  5.30]),
      M([-4.00,  5.30], [-17.40, 14.70]),
      M([-17.40, 14.70], [-23.51, 14.93]),  // -> Cabo Verde
      M([-17.00, 20.90],[-15.40, 28.00]),   // cote mauritanienne/saharienne
      M([ 3.40,  6.50], [11.85, -4.78]),    // Lagos -> Cabinda (golfe de Guinee)
      M([ 3.40,  6.50], [13.23, -8.84]),    // Lagos -> Luanda
      // Cote est Afrique + Madagascar
      M([45.32,  2.04], [39.66, -4.04]),    // Somalie sud -> Mombasa
      M([46.32,-15.72], [43.27,-11.70]),    // Comores
      M([49.40,-18.15], [49.29,-12.32]),    // cote est Madagascar
      M([49.40,-18.15], [57.50,-20.16]),    // Madagascar -> Maurice
      M([49.40,-18.15], [55.45,-20.88]),    // Madagascar -> Reunion
      M([43.68,-23.35], [32.57,-25.97]),    // Madagascar sud -> Maputo
      M([31.04,-29.86], [57.50,-20.16]),    // Durban -> Maurice (ocean Indien)
      M([18.42,-33.92], [14.51,-22.95]),    // Cape Town -> Walvis Bay (Atlantique sud)
      // Ocean Indien Asie du Sud
      M([67.00, 24.86], [72.83, 18.98]),    // Karachi -> Mumbai
      M([72.83, 18.98], [79.85,  6.93]),    // Mumbai -> Colombo
      M([72.83, 18.98], [73.51,  4.18]),    // Mumbai -> Maldives
      M([79.85,  6.93], [91.81, 22.34]),    // Colombo -> Bangladesh
      M([72.83, 18.98], [55.27, 25.20]),    // Mumbai -> Dubai
      M([67.00, 24.86], [55.27, 25.20])     // Karachi -> Dubai
    ];

    arcs.forEach((arc, i) => {
      arc.interp = d3.geoInterpolate(arc.a, arc.b);
      arc.dur    = (arc.kind === 'sea' ? 7800 : 4800) + (i % 5) * 380;
      arc.offset = (i * 730) % arc.dur;
      arc.np     = arc.kind === 'sea' ? 3 : 7;
      arc.trail  = arc.kind === 'sea' ? 0.07 : 0.06;
    });

    // — palette identique au globe
    const C = Object.assign({
      ocean:    '#AEC9D7',
      land:     '#D9C9A3',
      border:   'rgba(92,74,42,0.30)',
      grat:     'rgba(255,255,255,0.45)',
      rim:      'rgba(70,90,105,0.55)',
      fluxLand: '246,162,84',
      fluxSea:  '39,174,192',
      label:    '#4a4660',
      labelOn:  '#2c2840',
      halo:     'rgba(255,255,255,0.95)',
      font:     '"JetBrains Mono", ui-monospace, Menlo, monospace'
    }, window.PLANISPHERE_PALETTE || {}); // palette surchargeable par la page (v5 : monochrome nuit)

    let hoverAnchor = null;

    function draw(t) {
      ctx.clearRect(0, 0, W, H);

      // fond ocean (rectangle = projection equirect remplit le cadre)
      ctx.beginPath(); path(sphere);
      ctx.fillStyle = C.ocean; ctx.fill();

      // graticule
      ctx.beginPath(); path(graticule);
      ctx.strokeStyle = C.grat; ctx.lineWidth = 0.55; ctx.stroke();

      // terres + frontieres
      if (land) {
        ctx.beginPath(); path(land);
        ctx.fillStyle = C.land; ctx.fill();
        ctx.beginPath(); path(borders);
        ctx.strokeStyle = C.border; ctx.lineWidth = 0.45; ctx.stroke();
      }

      // Flux en arcs courbes, comme les arcs d'attaque de la veille cyber : ligne de base très
      // discrète, comète à tête lumineuse et queue effilée, impulsion à l'arrivée.
      const courbe = (arc) => {
        const pa = proj(arc.a), pb = proj(arc.b); if (!pa || !pb) return null;
        const dx = pb[0] - pa[0], dy = pb[1] - pa[1], len = Math.hypot(dx, dy) || 1;
        const lift = Math.min(46, len * 0.28);
        const c = [(pa[0] + pb[0]) / 2 + (dy / len) * lift, (pa[1] + pb[1]) / 2 - (dx / len) * lift];
        return { pa, pb, c, at: (u) => { const v = 1 - u; return [v * v * pa[0] + 2 * v * u * c[0] + u * u * pb[0], v * v * pa[1] + 2 * v * u * c[1] + u * u * pb[1]]; } };
      };
      arcs.forEach(arc => {
        const isSea = arc.kind === 'sea', pal = isSea ? C.fluxSea : C.fluxLand, q = courbe(arc); if (!q) return;
        // ligne de base
        ctx.beginPath(); ctx.moveTo(q.pa[0], q.pa[1]); ctx.quadraticCurveTo(q.c[0], q.c[1], q.pb[0], q.pb[1]);
        ctx.setLineDash(isSea ? [2, 4] : []);
        ctx.strokeStyle = `rgba(${pal},${isSea ? 0.16 : 0.24})`; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
        // extrémités
        [q.pa, q.pb].forEach(xy => { ctx.beginPath(); ctx.arc(xy[0], xy[1], isSea ? 1 : 1.4, 0, Math.PI * 2); ctx.fillStyle = `rgba(${pal},0.5)`; ctx.fill(); });
        // comète : la tête parcourt l'arc, la queue la suit sur 22 % de sa longueur
        const cycle = arc.dur * 1.25, ph = ((t + arc.offset) % cycle) / cycle, voyage = 0.8;
        const tete = ph / voyage, queue = isSea ? 0.16 : 0.22, N = 16;
        if (tete <= 1 + queue) {
          const h = Math.min(1, tete), t0 = Math.max(0, tete - queue);
          if (h > t0) {
            let prev = q.at(t0);
            for (let k = 1; k <= N; k++) {
              const u = t0 + (h - t0) * (k / N), pt = q.at(u), f = k / N;
              ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(pt[0], pt[1]);
              ctx.strokeStyle = `rgba(${pal},${(Math.pow(f, 1.6) * (isSea ? 0.7 : 0.95)).toFixed(3)})`;
              ctx.lineWidth = (isSea ? 0.5 : 0.7) + f * (isSea ? 0.9 : 1.5); ctx.lineCap = 'round'; ctx.stroke();
              prev = pt;
            }
            if (tete <= 1) {
              const hp = q.at(h);
              ctx.beginPath(); ctx.arc(hp[0], hp[1], isSea ? 1.3 : 2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.98)'; ctx.fill();
            }
          }
        }
        // impulsion à l'arrivée : un anneau qui s'ouvre et s'efface
        if (ph >= voyage) {
          const k = (ph - voyage) / (1 - voyage);
          ctx.beginPath(); ctx.arc(q.pb[0], q.pb[1], 2 + k * (isSea ? 7 : 10), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${pal},${(0.55 * (1 - k)).toFixed(3)})`; ctx.lineWidth = 1; ctx.stroke();
        }
      });

      // ancres (théâtres) : point net, anneau qui pulse, anneau fixe au survol
      anchors.forEach((a, i) => {
        const xy = proj([a.lon, a.lat]); if (!xy) return;
        const hovered = hoverAnchor && hoverAnchor.id === a.id;
        const ph = ((t + i * 640) % 2400) / 2400;
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 5 + ph * 18, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${C.fluxLand},${(0.45 * (1 - ph)).toFixed(3)})`; ctx.lineWidth = 1; ctx.stroke();
        if (hovered) { ctx.beginPath(); ctx.arc(xy[0], xy[1], 10, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(xy[0], xy[1], hovered ? 4.2 : 3.4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.98)'; ctx.fill();
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 1.4, 0, Math.PI * 2); ctx.fillStyle = C.ocean === 'rgba(0,0,0,0)' ? '#0F1013' : C.ocean; ctx.fill();

        ctx.save();
        ctx.font = (hovered ? '500 ' : '400 ') + '12px ' + C.font;
        ctx.textBaseline = 'middle';
        const lbl = window.AlgorI18n ? window.AlgorI18n.t(a.label) : a.label; // étiquette traduite en anglais (i18n.js)
        const haut = a.pos === 'haut';
        ctx.textAlign = haut ? 'center' : 'left';
        const tx = haut ? xy[0] : xy[0] + 12, ty = haut ? xy[1] - 15 : xy[1] + 0.5;
        if (C.detoure) {
          // détourage net dans la couleur du fond : l'étiquette reste lisible quand un flux la croise
          ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = C.halo; ctx.strokeText(lbl, tx, ty);
          ctx.fillStyle = hovered ? C.labelOn : C.label; ctx.fillText(lbl, tx, ty);
        } else {
          ctx.fillStyle = hovered ? C.labelOn : C.label;
          ctx.shadowColor = C.halo;
          ctx.shadowBlur = 5;
          ctx.fillText(lbl, tx, ty);
          ctx.fillText(lbl, tx, ty);
          ctx.shadowBlur = 0;
          ctx.fillText(lbl, tx, ty);
        }
        ctx.restore();
      });
    }

    // — interactions : hover + clic theatre (meme cibles que le globe)
    const ANCHOR_HREF = {
      'MO-01':    '/moyen-orient/',
      'SAHEL-02': '/sahel/',
      'LACS-03':  '/rdc/',
      'MDG-04':   '/madagascar/',
      'AFR-05':   '/afrique/',
      'ASIE-06':  '/asie-sud/'
    };
    function findAnchorAt(x, y) {
      for (const a of anchors) {
        const xy = proj([a.lon, a.lat]); if (!xy) continue;
        const dx = xy[0] - x, dy = xy[1] - y;
        if (Math.sqrt(dx * dx + dy * dy) <= 18) return a;
      }
      return null;
    }
    canvas.style.cursor = 'default';
    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      const hit = findAnchorAt(e.clientX - rect.left, e.clientY - rect.top);
      if (hit) { canvas.style.cursor = 'pointer'; hoverAnchor = hit; }
      else { canvas.style.cursor = 'default'; hoverAnchor = null; }
    }
    function onLeave() { canvas.style.cursor = 'default'; hoverAnchor = null; }
    function onClick(e) {
      const rect = canvas.getBoundingClientRect();
      const hit = findAnchorAt(e.clientX - rect.left, e.clientY - rect.top);
      if (hit && ANCHOR_HREF[hit.id]) window.location.href = ANCHOR_HREF[hit.id];
    }
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', onClick);

    // — boucle d'animation (statique : aucune rotation, juste les flux qui defilent)
    let rafId = 0;
    let stopped = false;
    function frame(now) { if (stopped) return; draw(now); rafId = requestAnimationFrame(frame); }
    draw(performance.now());
    let topoPoll = 0;
    (function pollTopo() {
      if (land) { draw(performance.now()); return; }
      topoPoll = setTimeout(pollTopo, 120);
    })();
    rafId = requestAnimationFrame(frame);

    // Cleanup expose pour la nav cote client (sitenav.js).
    window.__planisphereCleanup = function () {
      stopped = true;
      cancelAnimationFrame(rafId);
      clearTimeout(topoPoll);
      window.removeEventListener('resize', resize);
      if (ro) { try { ro.disconnect(); } catch (_) {} }
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('click', onClick);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
