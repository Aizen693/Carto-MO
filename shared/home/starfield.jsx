/* global React */
// Starfield léger — particules très subtiles + quelques diamants violets en orbite.
// Effet : “fond cosmique tamisé”, beaucoup moins agressif que ciel étoilé noir.

const { useEffect: useEffectS, useRef: useRefS } = React;

function Starfield() {
  const canvasRef = useRefS(null);
  const rafRef = useRefS(0);

  useEffectS(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    // Respect de prefers-reduced-motion : une seule frame statique, pas de boucle.
    const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    let stars = [];
    let diamonds = [];
    let t = 0; // declared early: resize() calls draw() which reads `t`

    function colors() {
      const s = getComputedStyle(document.documentElement);
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      return {
        v: s.getPropertyValue('--violet').trim() || '#B596E0',
        v2: s.getPropertyValue('--violet-2').trim() || '#8B5FBF',
        gold: s.getPropertyValue('--gold').trim() || '#c49a3c',
        ink: s.getPropertyValue('--ink').trim() || '#F3EFFB',
        muted: s.getPropertyValue('--muted').trim() || '#9089AA',
        isLight,
      };
    }

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const density = (W * H) / 12000;
      stars = Array.from({ length: Math.floor(density) }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.0 + 0.2,
        a: Math.random() * 0.4 + 0.08,
        ph: Math.random() * Math.PI * 2,
        sp: 0.3 + Math.random() * 0.7,
      }));
      diamonds = Array.from({ length: Math.floor(W * H / 60000) }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: 1.5 + Math.random() * 2.2,
        a: 0.18 + Math.random() * 0.22,
        ph: Math.random() * Math.PI * 2,
      }));
      // Draw at least one frame so canvas isn't blank when tab is hidden
      if (W > 0 && H > 0 && typeof draw === 'function') draw();
    }
    resize();
    window.addEventListener('resize', resize);

    function draw() {
      const c = colors();
      ctx.clearRect(0, 0, W, H);

      // Stars
      for (const s of stars) {
        const a = s.a * (0.5 + 0.5 * Math.sin(t * 0.0008 * s.sp + s.ph));
        ctx.fillStyle = c.isLight ? hex(c.muted, a * 0.6) : hex(c.ink, a);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      // Diamants — accent or, clin d'oeil a la mosaique du logo Algor
      for (const d of diamonds) {
        const a = d.a * (0.6 + 0.4 * Math.sin(t * 0.0006 + d.ph));
        ctx.save();
        ctx.translate(d.x, d.y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = hex(c.gold, a * (c.isLight ? 0.7 : 1));
        ctx.fillRect(-d.r, -d.r, d.r * 2, d.r * 2);
        ctx.restore();
      }
      if (REDUCED) return;
      t += 16.67;
      rafRef.current = requestAnimationFrame(draw);
    }
    // Initial sync draw + re-draw on visibility change
    draw();
    const onVis = () => { if (!document.hidden) draw(); };
    document.addEventListener('visibilitychange', onVis);
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  return <canvas ref={canvasRef} />;
}

function hex(h, a) {
  h = (h || '').replace('#','').trim();
  if (!h) return `rgba(255,255,255,${a})`;
  const n = parseInt(h.length === 3 ? h.split('').map(c => c+c).join('') : h, 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

Object.assign(window, { Starfield });
