// swarm-fx.js — particules brillantes qui glissent au-dessus de l'image hero.
//   Canvas en mix-blend-mode: screen → les particules s'ADDITIONNENT a l'image
//   sans la masquer. Donne l'impression que le reseau est vivant, traverse de
//   "data" qui circule.

(function () {
  if (window.__swarmFxCleanup) {
    try { window.__swarmFxCleanup(); } catch (_) {}
    window.__swarmFxCleanup = null;
  }

  function init() {
    // Respect de prefers-reduced-motion : pas de particules animees.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var canvas = document.querySelector('.swarm-fx');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var W = 600, H = 480;

    var streams = [];

    function rebuild() {
      streams.length = 0;
      // ~55 trajectoires : pairs de points + courbure aleatoire
      // Chaque trajectoire transporte 1-3 "particules" decalees en phase
      for (var i = 0; i < 55; i++) {
        var ax = Math.random() * W;
        var ay = Math.random() * H;
        var angle = Math.random() * Math.PI * 2;
        var length = (Math.random() * 0.5 + 0.3) * Math.max(W, H);
        var bx = ax + Math.cos(angle) * length;
        var by = ay + Math.sin(angle) * length;
        // Point de controle decale perpendiculairement (donne la courbure)
        var midX = (ax + bx) / 2 + Math.cos(angle + Math.PI / 2) * length * (Math.random() - 0.5) * 0.6;
        var midY = (ay + by) / 2 + Math.sin(angle + Math.PI / 2) * length * (Math.random() - 0.5) * 0.6;
        streams.push({
          ax: ax, ay: ay, bx: bx, by: by, mx: midX, my: midY,
          n: 1 + Math.floor(Math.random() * 3),       // 1-3 particules
          speed: 0.00012 + Math.random() * 0.00018,
          offset: Math.random(),
          hue: 250 + Math.random() * 50,             // violet -> bleu
          intensity: 0.55 + Math.random() * 0.45
        });
      }
    }

    function resize() {
      var r = canvas.getBoundingClientRect();
      W = Math.max(200, r.width  || canvas.clientWidth  || 600);
      H = Math.max(160, r.height || canvas.clientHeight || 480);
      canvas.width  = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      rebuild();
    }
    resize();
    var ro = null;
    if (window.ResizeObserver) {
      try { ro = new ResizeObserver(resize); ro.observe(canvas); } catch (_) {}
    }
    window.addEventListener('resize', resize);

    var t0 = performance.now();
    var rafId = 0;
    var stopped = false;

    function bezierAt(p, ax, ay, mx, my, bx, by) {
      var u = 1 - p;
      return [
        u * u * ax + 2 * u * p * mx + p * p * bx,
        u * u * ay + 2 * u * p * my + p * p * by
      ];
    }

    function draw(now) {
      if (stopped) return;
      var t = now - t0;
      ctx.clearRect(0, 0, W, H);

      streams.forEach(function (s) {
        for (var k = 0; k < s.n; k++) {
          var phase = ((s.offset + k / s.n + t * s.speed) % 1 + 1) % 1;
          var pt = bezierAt(phase, s.ax, s.ay, s.mx, s.my, s.bx, s.by);
          var fade = Math.sin(phase * Math.PI);                // 0 -> 1 -> 0
          var op = s.intensity * fade;
          // Halo additif (large, doux)
          var halo = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 10);
          halo.addColorStop(0,    'hsla(' + s.hue + ', 90%, 70%, ' + (op * 0.55).toFixed(3) + ')');
          halo.addColorStop(0.45, 'hsla(' + s.hue + ', 90%, 70%, ' + (op * 0.18).toFixed(3) + ')');
          halo.addColorStop(1,    'hsla(' + s.hue + ', 90%, 70%, 0)');
          ctx.fillStyle = halo;
          ctx.beginPath(); ctx.arc(pt[0], pt[1], 10, 0, Math.PI * 2); ctx.fill();
          // Coeur lumineux
          ctx.fillStyle = 'hsla(' + s.hue + ', 100%, 92%, ' + (op * 0.95).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(pt[0], pt[1], 1.4, 0, Math.PI * 2); ctx.fill();
        }
      });

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);

    window.__swarmFxCleanup = function () {
      stopped = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      if (ro) { try { ro.disconnect(); } catch (_) {} }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
