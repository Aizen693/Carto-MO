/* Accueil : planisphère en points derrière la trame. Les six théâtres pulsent ; chaque case de veille qui s'ouvre
   se relie à son théâtre par un trait qui se dessine, puis une impulsion parcourt le trait jusqu'au théâtre.
   Requiert d3 et topojson-client (chargés par la page) et les événements v5:case / v5:case-fin de chrome.js. */
(function () {
  var hero = document.querySelector('[data-v5-reseau]'); if (!hero) return;
  var reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cv = document.createElement('canvas'); cv.className = 'v5-reseau'; cv.setAttribute('aria-hidden', 'true'); cv.setAttribute('data-trame-libre', '');
  hero.insertBefore(cv, hero.firstChild);
  var ctx = cv.getContext('2d'), DPR = Math.min(devicePixelRatio || 1, 2), W = 0, H = 0, proj = null, fond = null, terre = null;
  var THEATRES = {
    'sahel': [0, 16, 'Sahel'], 'moyen-orient': [44, 33, 'Moyen-Orient'], 'rdc': [29, -2, 'Grands Lacs'],
    'madagascar': [47, -19, 'Madagascar'], 'afrique': [43, 12, 'Afrique maritime'], 'asie-sud': [74, 30, 'Asie du Sud']
  };
  var liens = [], pings = [], actifs = [], etincelles = [], origine = [0, 0], debut = null;

  function points() {
    // planisphère en points, calé sur la moitié droite (le titre occupe la gauche)
    var x0 = W < 820 ? 12 : W * 0.4, y0 = 96, x1 = W - 16, y1 = H - 40;
    proj = d3.geoEquirectangular().fitExtent([[x0, y0], [x1, y1]], { type: 'MultiPoint', coordinates: [[-30, 50], [105, -38], [-30, -38], [105, 50]] });
    var off = document.createElement('canvas'); off.width = W; off.height = H;
    var o = off.getContext('2d'); o.fillStyle = '#000'; o.beginPath(); d3.geoPath(proj, o)(terre); o.fill();
    var px = o.getImageData(0, 0, W, H).data;
    fond = document.createElement('canvas'); fond.width = W * DPR; fond.height = H * DPR;
    var f = fond.getContext('2d'); f.scale(DPR, DPR);
    var pas = W < 700 ? 6 : 7, foyers = Object.keys(THEATRES).map(function (k) { return proj([THEATRES[k][0], THEATRES[k][1]]); }), R = Math.max(40, (x1 - x0) * 0.06);
    actifs = []; origine = foyers[0];
    for (var y = pas / 2; y < H; y += pas) for (var x = pas / 2; x < W; x += pas) {
      if (px[(Math.floor(y) * W + Math.floor(x)) * 4 + 3] < 128) continue;
      var a = W < 820 ? 1 : Math.max(0, Math.min(1, (x - W * 0.36) / (W * 0.16))); // fondu vers le titre
      if (a <= 0) continue;
      // foyers : les points proches d'un théâtre s'éclairent, ce qui dessine les zones suivies
      var dmin = Infinity; foyers.forEach(function (q) { var dd = Math.hypot(q[0] - x, q[1] - y); if (dd < dmin) dmin = dd; });
      var chaud = dmin < R ? 1 - dmin / R : 0;
      var al = (0.13 + 0.42 * chaud * chaud) * a;
      f.fillStyle = 'rgba(255,255,255,' + al.toFixed(3) + ')'; f.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
      if (chaud > 0.15) actifs.push([x, y, chaud]);
    }
  }
  function taille() {
    W = hero.clientWidth; H = hero.clientHeight; if (!W || !H) return;
    cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    if (terre) points();
  }
  // un point (coordonnées du bloc) est-il recouvert par une case de veille ouverte ?
  function sousCase(x, y) {
    var h = hero.getBoundingClientRect();
    return [].some.call(hero.querySelectorAll('.v5-case.is-in'), function (c) {
      var r = c.getBoundingClientRect(); return x >= r.left - h.left - 4 && x <= r.right - h.left + 4 && y >= r.top - h.top - 4 && y <= r.bottom - h.top + 4;
    });
  }
  function centre(el) {
    var r = el.getBoundingClientRect(), h = hero.getBoundingClientRect();
    return [r.left - h.left + r.width / 2, r.top - h.top + r.height / 2];
  }
  function dessiner(t) {
    if (!proj) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    if (debut === null) debut = t;
    var rev = reduit ? 1 : Math.min(1, (t - debut) / 1800), rayon = Math.hypot(W, H) * (1 - Math.pow(1 - rev, 3));
    if (rev < 1) {
      ctx.save(); ctx.beginPath(); ctx.arc(origine[0], origine[1], rayon, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(fond, 0, 0, W, H); ctx.restore();
      ctx.beginPath(); ctx.arc(origine[0], origine[1], rayon, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,' + (0.18 * (1 - rev)).toFixed(3) + ')'; ctx.stroke();
    } else ctx.drawImage(fond, 0, 0, W, H);
    // activité : des points des zones suivies s'allument puis s'éteignent
    if (!reduit && rev >= 1 && actifs.length) {
      if (Math.random() < 0.35) { var c = actifs[Math.floor(Math.random() * actifs.length)]; etincelles.push({ x: c[0], y: c[1], t0: t, v: 700 + Math.random() * 900 }); }
      etincelles = etincelles.filter(function (e) {
        var u = (t - e.t0) / e.v; if (u > 1) return false;
        var al = Math.sin(u * Math.PI);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.75 * al).toFixed(3) + ')'; ctx.fillRect(e.x - 1.1, e.y - 1.1, 2.2, 2.2);
        return true;
      });
    }
    // liens case → théâtre : trait qui se dessine, puis impulsion qui voyage
    liens.forEach(function (l) {
      var th = THEATRES[l.th]; if (!th || !l.el.isConnected) return;
      var a = centre(l.el), b = proj([th[0], th[1]]);
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.min(80, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.22);
      var at = function (u) { var v = 1 - u; return [v * v * a[0] + 2 * v * u * mx + u * u * b[0], v * v * a[1] + 2 * v * u * my + u * u * b[1]]; };
      var k = reduit ? 1 : Math.min(1, (t - l.t0) / 900), alpha = l.fin ? Math.max(0, 1 - (t - l.fin) / 600) : 1;
      if (alpha <= 0) { l.mort = true; return; }
      ctx.beginPath(); ctx.moveTo(a[0], a[1]);
      for (var i = 1; i <= 24; i++) { var p = at(k * i / 24); ctx.lineTo(p[0], p[1]); }
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.28 * alpha).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.stroke();
      if (k >= 1 && !l.arrive) { l.arrive = true; pings.push({ th: l.th, t0: t }); }
      if (k >= 1 && !reduit) {
        var u = ((t - l.t0 - 900) % 2600) / 2600, q = at(u);
        ctx.beginPath(); ctx.arc(q[0], q[1], 1.8, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * alpha).toFixed(3) + ')'; ctx.fill();
        if (u > 0.97 && t - (l.dernierPing || 0) > 1500) { l.dernierPing = t; pings.push({ th: l.th, t0: t }); }
      }
    });
    liens = liens.filter(function (l) { return !l.mort; });
    // théâtres : point, anneau qui pulse, impulsions d'arrivée, nom
    Object.keys(THEATRES).forEach(function (k, i) {
      var th = THEATRES[k], p = proj([th[0], th[1]]); if (Math.hypot(p[0] - origine[0], p[1] - origine[1]) > rayon) return;
      var ph = reduit ? 0 : ((t + i * 520) % 3000) / 3000, actif = liens.some(function (l) { return l.th === k; });
      ctx.beginPath(); ctx.arc(p[0], p[1], 4 + ph * 16, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,' + ((actif ? 0.4 : 0.2) * (1 - ph)).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0], p[1], actif ? 3.4 : 2.6, 0, Math.PI * 2); ctx.fillStyle = actif ? '#FFFFFF' : 'rgba(255,255,255,.6)'; ctx.fill();
      if (!sousCase(p[0] + 9, p[1])) {
        ctx.font = '400 11px "Host Grotesk", "Helvetica Neue", Arial, sans-serif'; ctx.fillStyle = actif ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.4)';
        ctx.fillText(window.AlgorI18n ? window.AlgorI18n.t(th[2]) : th[2], p[0] + 9, p[1] + 4);
      }
    });
    pings = pings.filter(function (g) {
      var u = (t - g.t0) / 1100; if (u > 1) return false;
      var th = THEATRES[g.th], p = proj([th[0], th[1]]);
      ctx.beginPath(); ctx.arc(p[0], p[1], 3 + u * 22, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * (1 - u)).toFixed(3) + ')'; ctx.stroke();
      return true;
    });
  }
  var visible = true;
  if (window.IntersectionObserver) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(hero);
  function boucle(t) { if (visible && !document.hidden) dessiner(t); requestAnimationFrame(boucle); }

  hero.addEventListener('v5:case', function (e) {
    var it = e.detail.it; if (!it || !THEATRES[it.theatre]) return;
    liens.push({ el: e.detail.el, th: it.theatre, t0: performance.now() });
  });
  hero.addEventListener('v5:case-fin', function (e) { liens.forEach(function (l) { if (l.el === e.detail.el) l.fin = performance.now(); }); });

  function demarrer() {
    if (!window.d3 || !window.topojson) return setTimeout(demarrer, 80);
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json').then(function (r) { return r.json(); }).then(function (topo) {
      terre = topojson.feature(topo, topo.objects.land); taille();
      if (window.ResizeObserver) new ResizeObserver(function () { taille(); }).observe(hero); else addEventListener('resize', taille);
      requestAnimationFrame(boucle);
    }).catch(function () {});
  }
  demarrer();
})();
