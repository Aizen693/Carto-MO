/* Ciel etoile « galaxie » commun au site public (accueil + rubriques).
   Reference : visuel GPT-6 Astra (galaxie spirale de particules, etoiles a
   quatre branches, poussiere lumineuse au coeur). Canvas fixe derriere le
   contenu ; la galaxie est ancree sur le globe du hero et tourne tres lentement,
   des etoiles eparses couvrent tout le site avec une parallaxe de profondeur.
   Deux palettes sur l'accueil : nuit (defaut, blanc/bleu/ambre sur noir, fidele
   a la reference) et clair (?ciel=clair : encre/violet/bleu/ambre sur blanc).
   Pose data-sky (+ data-sky-dark) sur <html>. prefers-reduced-motion : image fixe. */
(function () {
  'use strict';
  if (window.__algorSky) return;
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Accueil : hero noir fidele a la reference Astra par defaut (?ciel=clair = galaxie
  // violette sur blanc). Rubriques : toujours en clair, etoiles eparses seulement.
  var DARK = !/[?&]ciel=clair/.test(window.location.search);
  var root = document.documentElement;
  root.setAttribute('data-sky', '');
  // Systeme typographique : host (defaut, Host Grotesk + Plex Mono) ou familjen ; ?police=... pour comparer
  var FONT = (window.location.search.match(/[?&]police=([a-z]+)/) || [])[1] || 'host';
  root.setAttribute('data-font', FONT);
  if (DARK) root.setAttribute('data-sky-dark', '');

  var cv = document.createElement('canvas');
  cv.className = 'skyfield'; cv.setAttribute('aria-hidden', 'true');
  var ctx = cv.getContext('2d');
  if (!ctx) return;
  function insert() { document.body.insertBefore(cv, document.body.firstChild); }
  if (document.body) insert(); else document.addEventListener('DOMContentLoaded', insert);

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0, mx = 0, my = 0, tmx = 0, tmy = 0;
  var seed = 20260914;
  function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
  function gauss() { var u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }

  // Palettes : [couleur, poids]
  var PAL = DARK ? {
    stars: [[[255, 255, 255], 0.55], [[190, 214, 255], 0.30], [[255, 204, 165], 0.15]],
    bright: [[[255, 255, 255], 0.55], [[190, 214, 255], 0.30], [[255, 204, 165], 0.15]],
    dust: [200, 190, 255], core: [255, 250, 245], spike: [255, 255, 255],
    aStatic: [0.45, 1.0], aBg: [0.25, 0.8], glowK: 1.0, bgFill: '#05040B'
  } : {
    stars: [[[24, 20, 40], 0.40], [[107, 63, 160], 0.32], [[30, 111, 190], 0.16], [[201, 126, 42], 0.12]],
    bright: [[[107, 63, 160], 0.50], [[86, 80, 198], 0.22], [[30, 111, 190], 0.16], [[201, 126, 42], 0.12]],
    dust: [107, 63, 160], core: [86, 80, 198], spike: [86, 80, 198],
    aStatic: [0.28, 0.72], aBg: [0.14, 0.55], glowK: 0.7, bgFill: null
  };
  function pick(pal) { var u = rnd(), acc = 0; for (var i = 0; i < pal.length; i++) { acc += pal[i][1]; if (u <= acc) return pal[i][0]; } return pal[pal.length - 1][0]; }

  // ── Etoile a quatre branches (diffraction), utilisee pour les brillantes ──
  function spike(c, x, y, s, a, col) {
    var g = c.createRadialGradient(x, y, 0, x, y, s * 2.2);
    g.addColorStop(0, rgba(col, a * 0.55)); g.addColorStop(0.35, rgba(col, a * 0.18)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, s * 2.2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = rgba(col, a * 0.75); c.lineWidth = Math.max(0.6, s * 0.16); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - s * 3.2, y); c.lineTo(x + s * 3.2, y); c.moveTo(x, y - s * 3.2); c.lineTo(x, y + s * 3.2); c.stroke();
    c.lineWidth = Math.max(0.4, s * 0.08);
    c.beginPath(); c.moveTo(x - s * 1.3, y - s * 1.3); c.lineTo(x + s * 1.3, y + s * 1.3); c.moveTo(x + s * 1.3, y - s * 1.3); c.lineTo(x - s * 1.3, y + s * 1.3); c.stroke();
    c.beginPath(); c.arc(x, y, s * 0.55, 0, Math.PI * 2); c.fillStyle = rgba(col, a); c.fill();
  }

  // ── Voie lactee pre-rendue : bande diagonale de poussiere d'etoiles, nuages
  //    lumineux, chenaux sombres, teintes bleu/rose/ambre. Fine et diffuse. ──
  var gal = null; // { cv, w, h, bright }
  function buildBand(bw, bh) {
    seed = 424242;
    var k = Math.min(1.5, 2048 / bw), c = document.createElement('canvas');
    c.width = Math.round(bw * k); c.height = Math.round(bh * k);
    var g = c.getContext('2d'); g.scale(k, k);
    var bright = [];
    // axe de la bande : monte de la gauche vers la droite
    var x0 = -bw * 0.1, y0 = bh * 0.78, x1 = bw * 1.1, y1 = bh * 0.18;
    var ax = x1 - x0, ay = y1 - y0, L = Math.sqrt(ax * ax + ay * ay), ux = ax / L, uy = ay / L, nx = -uy, ny = ux;
    var core = bh * 0.085, wide = bh * 0.26;
    function at(t, off) { return [x0 + ux * t + nx * off, y0 + uy * t + ny * off]; }
    function blob(x, y, rad, col, a, sx) { g.save(); g.translate(x, y); g.rotate(Math.atan2(uy, ux)); g.scale(sx || 1, 1); var gg = g.createRadialGradient(0, 0, 0, 0, 0, rad); gg.addColorStop(0, rgba(col, a)); gg.addColorStop(0.5, rgba(col, a * 0.4)); gg.addColorStop(1, rgba(col, 0)); g.fillStyle = gg; g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.fill(); g.restore(); }
    var hazeA = DARK ? 1 : 0.5;
    if (DARK) g.globalCompositeOperation = 'lighter';
    // voile general de la bande
    function xfade(x) { var f = Math.max(0, Math.min(1, (x / bw - 0.22) / 0.38)); return 0.18 + 0.82 * f * f * (3 - 2 * f); }
    for (var v = 0; v < 90; v++) { var tv = rnd() * L, pv = at(tv, gauss() * core * 0.9); blob(pv[0], pv[1], bh * (0.10 + rnd() * 0.12), DARK ? [214, 205, 240] : PAL.dust, 0.045 * hazeA * xfade(pv[0]), 2.2); }
    // nuages lumineux plus denses et teintes
    var TINT = DARK ? [[[214, 205, 240], 0.5], [[150, 185, 255], 0.22], [[255, 205, 170], 0.18], [[235, 160, 210], 0.10]] : [[[107, 63, 160], 0.5], [[30, 111, 190], 0.3], [[201, 126, 42], 0.2]];
    for (var q = 0; q < 70; q++) { var tq = rnd() * L, pq = at(tq, gauss() * core * 0.7); blob(pq[0], pq[1], bh * (0.03 + rnd() * 0.07), pick(TINT), 0.09 * hazeA * xfade(pq[0]), 1.8); }
    g.globalCompositeOperation = 'source-over';
    // chenaux sombres le long de l'axe
    if (DARK) for (var d2 = 0; d2 < 140; d2++) { var td = rnd() * L, pd = at(td, gauss() * core * 0.55 - core * 0.15); blob(pd[0], pd[1], bh * (0.012 + rnd() * 0.035), [5, 4, 11], 0.55, 2.6); }
    if (DARK) g.globalCompositeOperation = 'lighter';
    // poussiere d'etoiles : tres fine, dense pres de l'axe
    var N = Math.round(bw * bh / 34);
    for (var i = 0; i < N; i++) {
      var t = rnd() * L, off = (rnd() < 0.62 ? gauss() * core : gauss() * wide), p = at(t, off);
      if (p[0] < -4 || p[0] > bw + 4 || p[1] < -4 || p[1] > bh + 4) continue;
      var near = Math.exp(-(off * off) / (2 * core * core));
      var xf = Math.max(0, Math.min(1, (p[0] / bw - 0.22) / 0.38)); xf = 0.18 + 0.82 * xf * xf * (3 - 2 * xf);
      var col = pick(PAL.stars), sz = rnd(), a = (PAL.aStatic[0] + rnd() * (PAL.aStatic[1] - PAL.aStatic[0])) * (0.35 + 0.65 * near) * xf;
      if (sz < 0.80) { g.fillStyle = rgba(col, a * 0.8); g.beginPath(); g.arc(p[0], p[1], 0.3 + rnd() * 0.45, 0, Math.PI * 2); g.fill(); }
      else if (sz < 0.96) { g.fillStyle = rgba(col, a); g.beginPath(); g.arc(p[0], p[1], 0.7 + rnd() * 0.6, 0, Math.PI * 2); g.fill(); }
      else if (sz < 0.996) { col = pick(PAL.bright); var rr = 1.1 + rnd() * 0.9; blob(p[0], p[1], rr * 3, col, a * 0.5 * PAL.glowK); g.fillStyle = rgba(col, Math.min(1, a * 1.1)); g.beginPath(); g.arc(p[0], p[1], rr, 0, Math.PI * 2); g.fill(); }
      else if (bright.length < 14) bright.push({ x: p[0], y: p[1], s: 2.2 + rnd() * 2.2, a: Math.min(1, a * 1.1), ph: rnd() * 6, sp: 0.4 + rnd() * 0.8, c: pick(PAL.bright) });
    }
    g.globalCompositeOperation = 'source-over';
    return { cv: c, w: bw, h: bh, bright: bright };
  }

  // ── Etoiles eparses de fond (3 profondeurs pre-rendues, parallaxe) ──
  var layers = [];
  function buildLayers() {
    seed = 20260914;
    layers = [];
    var span = Math.round(H * 1.6), area = W * span;
    [{ n: area / 4800, r: [0.4, 1.0], p: 0.02 }, { n: area / 14000, r: [0.9, 1.7], p: 0.05 }, { n: area / 45000, r: [1.5, 2.6], p: 0.10 }].forEach(function (d, li) {
      var c = document.createElement('canvas'); c.width = Math.round(W * DPR); c.height = Math.round(span * DPR);
      var g = c.getContext('2d'); g.scale(DPR, DPR);
      var live = [];
      for (var i = 0; i < d.n; i++) {
        var x = rnd() * W, y = rnd() * span, col = pick(li === 2 ? PAL.bright : PAL.stars), r = d.r[0] + rnd() * (d.r[1] - d.r[0]);
        var a = PAL.aBg[0] + rnd() * (PAL.aBg[1] - PAL.aBg[0]);
        if (li === 2 && rnd() < 0.16) { live.push({ x: x, y: y, s: r * 1.1, a: a * 0.9, ph: rnd() * 6, sp: 0.4 + rnd(), c: col }); continue; }
        if (li === 2) { var gg = g.createRadialGradient(x, y, 0, x, y, r * 3.5); gg.addColorStop(0, rgba(col, a * 0.35 * PAL.glowK)); gg.addColorStop(1, rgba(col, 0)); g.fillStyle = gg; g.beginPath(); g.arc(x, y, r * 3.5, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = rgba(col, a); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      layers.push({ cv: c, p: d.p, span: span, live: live });
    });
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildLayers();
    gal = null; // Voie lactee retiree (Gaspar 14/09) : etoiles eparses seulement
    draw(REDUCED ? 0 : performance.now());
  }

  // ancre de la galaxie : centre du globe du hero (accueil) ou haut de page (rubriques)
  function anchor() {
    var hero = document.querySelector('.hero--night') || document.querySelector('.page-hero');
    if (hero) { var r = hero.getBoundingClientRect(); return { top: r.top, h: Math.max(r.height, 400), hero: hero }; }
    return { top: -(window.scrollY || 0), h: Math.min(H, 900), hero: null };
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    var sy = window.scrollY || 0;
    mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04;
    var an = anchor();
    if (DARK) { ctx.fillStyle = PAL.bgFill; ctx.fillRect(0, 0, W, H); } // accueil entierement noir
    // etoiles eparses, trois profondeurs
    layers.forEach(function (L) {
      var off = (sy * L.p) % L.span, dx = mx * L.p * 220, dy = my * L.p * 140 - off;
      ctx.drawImage(L.cv, dx, dy, W, L.span);
      ctx.drawImage(L.cv, dx, dy + L.span, W, L.span);
      if (dy > 0) ctx.drawImage(L.cv, dx, dy - L.span, W, L.span);
      for (var i = 0; i < L.live.length; i++) {
        var s = L.live[i], y = s.y + dy; if (y < -20 || y > H + 20) { y += (y < 0 ? L.span : -L.span); if (y < -20 || y > H + 20) continue; }
        var tw = REDUCED ? 0.8 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.0013 * s.sp + s.ph));
        spike(ctx, s.x + dx, y, s.s, s.a * tw, s.c);
      }
    });
    // Voie lactee calee sur le hero : derive tres lente, parallaxe, fondu ensuite
    if (gal) {
      var gy = an.top + (an.h - gal.h) / 2 + sy * 0.22 + my * 10, gx = mx * 16 + (REDUCED ? 0 : Math.sin(t * 0.00004) * 24);
      var vis = Math.max(0, Math.min(1, 1.5 - Math.max(0, sy) / an.h));
      if (vis > 0.01 && gy + gal.h > 0 && gy < H) {
        ctx.save(); ctx.globalAlpha = vis * 0.85;
        if (DARK) ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(gal.cv, gx - 40, gy, gal.w + 80, gal.h);
        ctx.globalCompositeOperation = 'source-over';
        for (var b = 0; b < gal.bright.length; b++) {
          var st = gal.bright[b], tw2 = REDUCED ? 0.85 : 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.0011 * st.sp + st.ph));
          spike(ctx, st.x + gx - 40 + 40 * (gal.w + 80) / gal.w * 0, st.y + gy, st.s, st.a * tw2, st.c);
        }
        ctx.restore();
      }
    }
  }

  var raf = 0, running = false, last = 0;
  function loop(t) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    if (t - last < 1000 / 40) return;
    last = t; draw(t);
  }
  window.addEventListener('resize', resize);
  if (!REDUCED) {
    window.addEventListener('pointermove', function (e) { tmx = (e.clientX / W - 0.5); tmy = (e.clientY / H - 0.5); }, { passive: true });
    running = true; raf = requestAnimationFrame(loop);
  } else {
    window.addEventListener('scroll', function () { draw(0); }, { passive: true });
  }
  resize();
  // le hero React arrive apres le premier rendu : on se recale une fois monte
  var tries = 0, tm = setInterval(function () { if (document.querySelector('.hero__visual') || ++tries > 40) { clearInterval(tm); draw(REDUCED ? 0 : performance.now()); } }, 150);
  window.__algorSky = { redraw: function () { draw(performance.now()); }, dark: DARK };
})();
