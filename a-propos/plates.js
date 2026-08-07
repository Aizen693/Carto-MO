// Plates 3D — tour de plaques empilees avec faisceaux verticaux.
// Depart : plaques desserrees (Y eparpilles + tilt + drift X/Z).
// Animation : se recentrent pour former la tour stable.
// Meme palette + projection 3D que cubes.js.

(function () {
  if (window.__platesCleanup) {
    try { window.__platesCleanup(); } catch (_) {}
    window.__platesCleanup = null;
  }

  function init() {
    const canvas = document.querySelector('.plates-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let W = 600, H = 480;
    function resize() {
      const r = canvas.getBoundingClientRect();
      W = Math.max(120, r.width  || canvas.clientWidth  || 600);
      H = Math.max(120, r.height || canvas.clientHeight || 480);
      canvas.width  = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    let ro = null;
    if (window.ResizeObserver) {
      try { ro = new ResizeObserver(resize); ro.observe(canvas); } catch (_) {}
    }
    window.addEventListener('resize', resize);

    // — projection 3D (identique a cubes.js)
    const CAMERA_D = 5.6;
    function project(x, y, z) {
      const f = Math.min(W, H) * 1.05;
      const zz = z + CAMERA_D;
      if (zz <= 0.05) return null;
      return {
        x: W * 0.5 + (x * f) / zz,
        y: H * 0.50 + (y * f) / zz,
        scale: f / zz,
      };
    }
    function rotY(p, a) { const c = Math.cos(a), s = Math.sin(a); return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c }; }
    function rotX(p, a) { const c = Math.cos(a), s = Math.sin(a); return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }; }
    function rotZ(p, a) { const c = Math.cos(a), s = Math.sin(a); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z }; }

    function rand(seed) { let x = Math.sin(seed) * 10000; return x - Math.floor(x); }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeOutBack(t) { const c1 = 1.15; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

    // — plaques : positions cibles
    // 6 plaques + base, espacees verticalement
    const PLATE_COUNT = 6;
    const PLATE_SIZE = 1.10;   // demi-cote
    const PLATE_GAP = 0.55;    // ecart vertical (Y descend)
    // Centre la tour autour de y=0 (les plaques visibles, pas trop hautes)
    const TOWER_TOP_Y = -((PLATE_COUNT - 1) * PLATE_GAP) / 2; // ~ -1.375 pour 6 plaques
    const plates = [];
    for (let i = 0; i < PLATE_COUNT; i++) {
      const ty = TOWER_TOP_Y + i * PLATE_GAP;
      // taille legerement croissante vers le bas
      const sizeFactor = 1 + i * 0.045;
      // chaos start
      const r1 = rand(i * 12.9898 + 7);
      const r2 = rand(i * 78.233  + 11);
      const r3 = rand(i * 37.719  + 17);
      const r4 = rand(i * 91.421  + 23);
      const r5 = rand(i * 14.331  + 29);
      // Scatter : les plaques RESTENT horizontales, juste ecartees verticalement
      // (chacune flotte plus haut que sa position cible, en cascade).
      // La plaque du bas reste a sa position cible (a cote du socle).
      // L'animation = "les plaques tombent les unes sur les autres" pour se compresser.
      const stepUp = 0.42; // hauteur ajoutee a chaque plaque au-dessus
      const startY = ty - (PLATE_COUNT - 1 - i) * stepUp;
      const startX = (r4 - 0.5) * 0.35;      // micro decalage lateral
      const startZ = (r5 - 0.5) * 0.35;      // micro decalage profondeur
      // PAS DE TILT : plaques restent strictement horizontales pendant tout le mouvement
      const tiltStart = { x: 0, z: 0 };
      // Delay echelonne : bottom -> top. La tour se construit du bas vers le haut.
      // Plaque du bas (i=PLATE_COUNT-1) : delay 0. Plaque du haut (i=0) : delay max.
      const delay = (PLATE_COUNT - 1 - i) * 0.18;
      void r1; void r2; void r3;
      plates.push({
        ty, size: PLATE_SIZE * sizeFactor,
        startX, startY, startZ,
        tiltStart,
        delay,
        seedJitter: rand(i * 53.711 + 41),
      });
    }

    // — base : socle stratifie juste sous la plaque la plus basse
    const BASE_Y = TOWER_TOP_Y + (PLATE_COUNT - 1) * PLATE_GAP + 0.15;
    const BASE_LAYERS = [
      { size: 1.45, y: BASE_Y + 0.00, alpha: 0.55 },
      { size: 1.58, y: BASE_Y + 0.08, alpha: 0.70 },
      { size: 1.72, y: BASE_Y + 0.16, alpha: 0.85 },
      { size: 1.85, y: BASE_Y + 0.24, alpha: 1.00 },
    ];

    // — faisceaux verticaux (sparks qui montent dans la tour)
    const BEAM_COUNT = 28;
    const beams = [];
    for (let i = 0; i < BEAM_COUNT; i++) {
      const r1 = rand(i * 1.123 + 3);
      const r2 = rand(i * 2.456 + 5);
      const r3 = rand(i * 3.789 + 7);
      beams.push({
        x: (r1 - 0.5) * (PLATE_SIZE * 1.7),
        z: (r2 - 0.5) * (PLATE_SIZE * 1.7),
        phase: r3 * Math.PI * 2,
        speed: 0.45 + r1 * 0.55,
      });
    }

    // — sparks aleatoires qui montent au dessus de la tour
    const TOP_SPARKS = 18;
    const topSparks = [];
    for (let i = 0; i < TOP_SPARKS; i++) {
      const r1 = rand(i * 4.111 + 9);
      const r2 = rand(i * 5.222 + 11);
      const r3 = rand(i * 6.333 + 13);
      topSparks.push({
        x: (r1 - 0.5) * (PLATE_SIZE * 1.2),
        z: (r2 - 0.5) * (PLATE_SIZE * 1.2),
        phase: r3 * Math.PI * 2,
        height: 0.6 + r1 * 1.4,
        speed: 0.5 + r2 * 0.7,
      });
    }

    // — couleurs
    const COL = {
      bg: '#0B0716',
      plate: 'rgba(168, 130, 255, 0.85)',
      plateFill: 'rgba(139, 92, 246, 0.10)',
      plateFillHi: 'rgba(168, 130, 255, 0.18)',
      sparkBright: 'rgba(230, 215, 255, 1.0)',
      sparkSoft: 'rgba(168, 130, 255, 0.55)',
      base: 'rgba(110, 76, 220, 0.6)',
    };

    // — texture "data dots" interne (grille de points sur chaque plaque)
    // pre-calcule un pattern reutilise
    const PLATE_GRID_N = 14; // points par cote
    const plateGrid = [];
    for (let i = 0; i < PLATE_GRID_N; i++) {
      for (let j = 0; j < PLATE_GRID_N; j++) {
        const u = (i / (PLATE_GRID_N - 1)) - 0.5;
        const v = (j / (PLATE_GRID_N - 1)) - 0.5;
        const r = rand(i * 31.7 + j * 17.3);
        if (r < 0.55) continue; // dispersion sparse
        plateGrid.push({ u, v, brightness: 0.3 + r * 0.7 });
      }
    }

    // — quad helper : project 4 coins d'une plaque, dessine fill + stroke + data
    function drawPlate(cx, cy, cz, size, tiltX, tiltZ, alpha, camRotY, camRotX) {
      const corners = [
        { x: -size, y: 0, z: -size },
        { x:  size, y: 0, z: -size },
        { x:  size, y: 0, z:  size },
        { x: -size, y: 0, z:  size },
      ];
      const proj = corners.map(c => {
        let p = c;
        p = rotZ(p, tiltZ);
        p = rotX(p, tiltX);
        p = { x: p.x + cx, y: p.y + cy, z: p.z + cz };
        p = rotY(p, camRotY);
        p = rotX(p, camRotX);
        return project(p.x, p.y, p.z);
      });
      if (proj.some(p => !p)) return null;

      // luminosite : centre de la plaque
      const center = { x: cx, y: cy, z: cz };
      const centerR = rotX(rotY(center, camRotY), camRotX);
      const depth = centerR.z + CAMERA_D;
      const lum = Math.max(0, Math.min(1, (CAMERA_D + 1.2 - depth) / 3.2));

      // fill
      ctx.beginPath();
      ctx.moveTo(proj[0].x, proj[0].y);
      ctx.lineTo(proj[1].x, proj[1].y);
      ctx.lineTo(proj[2].x, proj[2].y);
      ctx.lineTo(proj[3].x, proj[3].y);
      ctx.closePath();
      const fillAlpha = (0.06 + 0.16 * lum) * alpha;
      ctx.fillStyle = `rgba(${130 + 50 * lum}, ${95 + 70 * lum}, 245, ${fillAlpha})`;
      ctx.fill();

      // data dots — projete les points du grille via bilinear sur les coins
      // bilinear : p = c0*(1-u-v+uv) + c1*(u+...) ; simplification utilisant u,v dans [-0.5..0.5]
      for (const dot of plateGrid) {
        // u, v dans [-0.5, 0.5]
        const u = dot.u + 0.5;
        const v = dot.v + 0.5;
        const px = (1 - u) * (1 - v) * proj[0].x + u * (1 - v) * proj[1].x + u * v * proj[2].x + (1 - u) * v * proj[3].x;
        const py = (1 - u) * (1 - v) * proj[0].y + u * (1 - v) * proj[1].y + u * v * proj[2].y + (1 - u) * v * proj[3].y;
        ctx.fillStyle = `rgba(190, 165, 255, ${0.18 * dot.brightness * lum * alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.6, 0.9 * lum), 0, Math.PI * 2);
        ctx.fill();
      }

      // stroke des aretes (4 cotes)
      ctx.beginPath();
      ctx.moveTo(proj[0].x, proj[0].y);
      ctx.lineTo(proj[1].x, proj[1].y);
      ctx.lineTo(proj[2].x, proj[2].y);
      ctx.lineTo(proj[3].x, proj[3].y);
      ctx.closePath();
      ctx.strokeStyle = `rgba(200, 175, 255, ${(0.55 + 0.40 * lum) * alpha})`;
      ctx.lineWidth = 0.9 + 0.6 * lum;
      ctx.stroke();

      // sparkles aux 4 coins
      for (const p of proj) {
        ctx.fillStyle = `rgba(235, 220, 255, ${0.7 * alpha * lum})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4 * lum, 0, Math.PI * 2);
        ctx.fill();
      }

      return { proj, lum };
    }

    // — beams verticaux (sparks qui montent entre TOWER_TOP_Y et BASE_Y)
    function drawBeams(t, camRotY, camRotX, progress) {
      // fade-in avec assembly progress
      if (progress < 0.4) return;
      const beamAlpha = Math.min(1, (progress - 0.4) / 0.6);
      for (const b of beams) {
        // ligne verticale de Y=BASE_Y - 0.3 -> Y=TOWER_TOP_Y - 0.4
        // anime un spark qui monte
        const yTop = TOWER_TOP_Y - 0.4;
        const yBot = BASE_Y + 0.1;
        // sparks multiples le long du beam
        for (let k = 0; k < 3; k++) {
          const u = ((t * b.speed + b.phase + k * 0.33) % 1.0);
          // u: 0 = bottom, 1 = top
          const y = yBot + (yTop - yBot) * u;
          let p = { x: b.x, y, z: b.z };
          p = rotY(p, camRotY);
          p = rotX(p, camRotX);
          const pr = project(p.x, p.y, p.z);
          if (!pr) continue;
          // fade au depart et a la fin du trajet
          const fade = Math.sin(u * Math.PI);
          const r = Math.max(0.5, pr.scale * 0.005) * fade;
          if (r < 0.3) continue;
          ctx.fillStyle = `rgba(220, 200, 255, ${0.85 * fade * beamAlpha})`;
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, r, 0, Math.PI * 2);
          ctx.fill();
          // halo
          ctx.fillStyle = `rgba(168, 130, 255, ${0.25 * fade * beamAlpha})`;
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, r * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        // ligne discrete du beam
        let pTop = { x: b.x, y: yTop, z: b.z };
        let pBot = { x: b.x, y: yBot, z: b.z };
        pTop = rotX(rotY(pTop, camRotY), camRotX);
        pBot = rotX(rotY(pBot, camRotY), camRotX);
        const prT = project(pTop.x, pTop.y, pTop.z);
        const prB = project(pBot.x, pBot.y, pBot.z);
        if (prT && prB) {
          const grad = ctx.createLinearGradient(prT.x, prT.y, prB.x, prB.y);
          grad.addColorStop(0, `rgba(168, 130, 255, 0)`);
          grad.addColorStop(0.4, `rgba(168, 130, 255, ${0.12 * beamAlpha})`);
          grad.addColorStop(1, `rgba(168, 130, 255, 0)`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(prT.x, prT.y);
          ctx.lineTo(prB.x, prB.y);
          ctx.stroke();
        }
      }
    }

    // — sparks au sommet de la tour
    function drawTopSparks(t, camRotY, camRotX, progress) {
      if (progress < 0.65) return;
      const a = Math.min(1, (progress - 0.65) / 0.35);
      const yTop = TOWER_TOP_Y - 0.3;
      for (const s of topSparks) {
        const u = ((t * s.speed + s.phase) % 1.0);
        const y = yTop - u * s.height;
        let p = { x: s.x, y, z: s.z };
        p = rotY(p, camRotY);
        p = rotX(p, camRotX);
        const pr = project(p.x, p.y, p.z);
        if (!pr) continue;
        const fade = (1 - u) * 0.9;
        const r = Math.max(0.4, pr.scale * 0.004) * fade;
        ctx.fillStyle = `rgba(230, 215, 255, ${0.85 * fade * a})`;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, r, 0, Math.PI * 2);
        ctx.fill();
        // trainee verticale subtile
        let pUp = { x: s.x, y: y - 0.15, z: s.z };
        pUp = rotX(rotY(pUp, camRotY), camRotX);
        const prU = project(pUp.x, pUp.y, pUp.z);
        if (prU) {
          ctx.strokeStyle = `rgba(200, 175, 255, ${0.35 * fade * a})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(pr.x, pr.y);
          ctx.lineTo(prU.x, prU.y);
          ctx.stroke();
        }
      }
    }

    // — base (socle stratifie)
    function drawBase(camRotY, camRotX, alpha) {
      // ordonne du plus haut (le moins large) au plus large
      for (const layer of BASE_LAYERS) {
        drawPlate(0, layer.y, 0, layer.size, 0, 0, alpha * layer.alpha, camRotY, camRotX);
      }
    }

    // — animation : play-once par entree dans le viewport (replay au re-entry)
    const ASSEMBLY_DURATION = 4.2; // un peu plus lent pour voir le resserage

    // started = false : on rend l'etat SCATTER fige
    // started = true  : on joue scatter -> assemble -> hold permanent
    let started = false;
    let t0 = performance.now();
    let raf = 0;

    function frame(now) {
      // Check viewport : declenche le resserage quand >= 25% de la frame est visible
      const rect = canvas.getBoundingClientRect();
      const vpH = window.innerHeight || document.documentElement.clientHeight;
      const visible = Math.max(0, Math.min(rect.bottom, vpH) - Math.max(rect.top, 0));
      const visibleRatio = rect.height > 0 ? visible / rect.height : 0;
      if (!started && visibleRatio > 0.25) {
        started = true;
        t0 = now;
      } else if (started && visibleRatio < 0.05) {
        // sort du viewport : reset pour rejouer au prochain re-entry
        started = false;
      }

      const t = started ? (now - t0) / 1000 : 0;
      // cycleT : 0 = scatter complet ; >= ASSEMBLY_DURATION = assemble
      const cycleT = started ? Math.min(t, ASSEMBLY_DURATION + 999999) : 0;

      // Camera : vue FRONTALE plongeante (comme la reference).
      // Pas de rotation laterale — on regarde la tour bien en face, juste depuis ~25° au-dessus.
      const camRotY = Math.sin(t * 0.06) * 0.025;   // micro-oscillation seulement
      const camRotX = -0.42 + Math.sin(t * 0.05) * 0.02;

      ctx.fillStyle = COL.bg;
      ctx.fillRect(0, 0, W, H);

      // progress global (pour fade-in beams/sparks)
      const globalProgress = Math.min(1, cycleT / ASSEMBLY_DURATION);

      // — base (toujours visible, fade leger pendant scatter)
      drawBase(camRotY, camRotX, 0.4 + globalProgress * 0.6);

      // — beams (entre les plaques)
      drawBeams(t, camRotY, camRotX, globalProgress);

      // — plaques avec interpolation
      // ordre back-to-front pour ce camera
      const drawList = [];
      for (let i = 0; i < plates.length; i++) {
        const pl = plates[i];
        let progress;
        if (cycleT < ASSEMBLY_DURATION) {
          // scatter -> assemble
          const localT = Math.max(0, (cycleT - pl.delay) / (ASSEMBLY_DURATION - pl.delay));
          progress = Math.max(0, Math.min(1, localT));
          progress = easeOutBack(progress);
        } else {
          // hold permanent
          progress = 1;
        }

        const x = pl.startX + (0 - pl.startX) * progress;
        const y = pl.startY + (pl.ty - pl.startY) * progress;
        const z = pl.startZ + (0 - pl.startZ) * progress;
        const tiltX = pl.tiltStart.x * (1 - progress);
        const tiltZ = pl.tiltStart.z * (1 - progress);

        // breathing apres assemblage
        const breath = 1 + Math.sin(t * 0.7 + pl.seedJitter * 6.28) * 0.008 * progress;

        // depth pour tri (Y projete)
        let center = rotX(rotY({ x, y, z }, camRotY), camRotX);
        // Alpha mini = 0.55 : meme desserrees, les plaques sont clairement visibles
        drawList.push({ depth: center.z, x, y, z, size: pl.size * breath, tiltX, tiltZ, alpha: Math.max(0.55, progress) });
      }
      drawList.sort((a, b) => b.depth - a.depth);
      for (const d of drawList) {
        drawPlate(d.x, d.y, d.z, d.size, d.tiltX, d.tiltZ, d.alpha, camRotY, camRotX);
      }

      // — top sparks (au dessus de la tour)
      drawTopSparks(t, camRotY, camRotX, globalProgress);

      // — halo central
      const halo = ctx.createRadialGradient(W * 0.5, H * 0.48, 0, W * 0.5, H * 0.48, Math.min(W, H) * 0.55);
      halo.addColorStop(0, 'rgba(168, 130, 255, 0.08)');
      halo.addColorStop(1, 'rgba(168, 130, 255, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(frame);
    }
    // Premier draw synchrone : evite un canvas vide si le browser throttle le RAF
    // avant que l'utilisateur scrolle (peut arriver pour les elements offscreen).
    frame(performance.now());
    raf = requestAnimationFrame(frame);

    window.__platesCleanup = function () {
      if (raf) cancelAnimationFrame(raf);
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
