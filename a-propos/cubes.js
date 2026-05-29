// Cubes 3D — hero /a-propos/
// Animation : depart destructure (chaos), puis cubes s'assemblent en cluster
// structure. Apres assemblage, micro-derive lente + breathing forever.
// Canvas 2D + projection 3D maison (pas de Three.js).

(function () {
  if (window.__cubesCleanup) {
    try { window.__cubesCleanup(); } catch (_) {}
    window.__cubesCleanup = null;
  }

  function init() {
    const canvas = document.querySelector('.cubes-canvas');
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

    // ─── palette violet (cohérent avec design system Carto-MO)
    const COL = {
      bg:        '#0B0716',
      grid:      'rgba(138, 92, 245, 0.18)',
      gridGlow:  'rgba(168, 130, 255, 0.32)',
      cubeBase:  'rgba(139, 92, 246, 0.85)',
      cubeHi:    'rgba(196, 167, 255, 1.0)',
      cubeFill:  'rgba(96, 56, 200, 0.10)',
      cubeFillHi:'rgba(168, 130, 255, 0.22)',
      detail:    'rgba(200, 175, 255, 0.55)',
    };

    // ─── projection : monde 3D centre origine, camera regarde -Z
    // perspective simple : x' = cx + x * f / (z + d), y' = cy + y * f / (z + d)
    const CAMERA_D = 6.2;  // distance focale
    function project(x, y, z) {
      const f = Math.min(W, H) * 0.78;
      const zz = z + CAMERA_D;
      if (zz <= 0.05) return null;
      return {
        x: W * 0.5 + (x * f) / zz,
        y: H * 0.52 + (y * f) / zz,
        scale: f / zz,
      };
    }

    // rotation Y + X
    function rotY(p, a) {
      const c = Math.cos(a), s = Math.sin(a);
      return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
    }
    function rotX(p, a) {
      const c = Math.cos(a), s = Math.sin(a);
      return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
    }
    function rotZ(p, a) {
      const c = Math.cos(a), s = Math.sin(a);
      return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
    }

    // ─── definition des cubes : positions cibles structurees (cluster type image)
    // grille 3x3x3 partielle, certaines cases vides, tailles variables
    const targets = [
      // gros cube central + sa colonne
      { x:  0.0, y:  0.0, z:  0.0, s: 0.95 },
      { x:  0.0, y: -1.05, z:  0.0, s: 0.85 },
      // étage milieu
      { x:  1.15, y:  0.0, z:  0.1, s: 0.78 },
      { x: -1.15, y:  0.0, z:  0.1, s: 0.78 },
      { x:  0.0, y:  0.0, z:  1.15, s: 0.72 },
      { x:  0.0, y:  0.0, z: -1.15, s: 0.72 },
      // diagonales / haut
      { x:  1.05, y: -1.05, z:  1.0, s: 0.70 },
      { x: -1.05, y: -1.05, z:  1.0, s: 0.65 },
      { x:  1.0,  y: -1.05, z: -1.0, s: 0.62 },
      { x: -1.0,  y: -1.05, z: -1.0, s: 0.68 },
      // étage bas
      { x:  1.05, y:  1.05, z:  0.95, s: 0.66 },
      { x: -1.05, y:  1.05, z:  0.95, s: 0.60 },
      { x:  1.05, y:  1.05, z: -1.05, s: 0.62 },
      { x: -1.05, y:  1.05, z: -1.05, s: 0.58 },
      { x:  0.0,  y:  1.10, z:  0.0,  s: 0.72 },
      // satellites detache (style image)
      { x:  0.05, y: -2.05, z:  0.1, s: 0.55 },
      { x:  2.10, y: -0.20, z:  0.2, s: 0.50 },
      { x: -2.10, y:  0.20, z: -0.1, s: 0.48 },
      { x:  0.10, y:  2.15, z: -0.1, s: 0.50 },
    ];

    // Etat initial : chaos. Positions tres dispersees + grosse rotation aleatoire.
    function rand(seed) { let x = Math.sin(seed) * 10000; return x - Math.floor(x); }
    const cubes = targets.map((t, i) => {
      const r1 = rand(i * 12.9898 + 1);
      const r2 = rand(i * 78.233  + 2);
      const r3 = rand(i * 37.719  + 3);
      const r4 = rand(i * 91.421  + 4);
      const r5 = rand(i * 14.331  + 5);
      const r6 = rand(i * 53.711  + 6);
      // distance de scatter : entre 3.5 et 7
      const scatter = 4.2 + r4 * 2.8;
      const theta = r1 * Math.PI * 2;
      const phi   = (r2 - 0.5) * Math.PI;
      const startX = Math.cos(theta) * Math.cos(phi) * scatter;
      const startY = Math.sin(phi) * scatter * 0.7;
      const startZ = Math.sin(theta) * Math.cos(phi) * scatter;
      // rotation aleatoire de depart (full chaos)
      const rotStart = {
        x: (r3 - 0.5) * Math.PI * 4,
        y: (r5 - 0.5) * Math.PI * 4,
        z: (r6 - 0.5) * Math.PI * 4,
      };
      // delay echelonne pour effet cascade
      const delay = 0.05 + r1 * 0.55;
      return {
        target: t,
        startX, startY, startZ,
        rotStart,
        delay,
        // micro-jitter perpetuel apres assemblage
        jitterX: r3 * Math.PI * 2,
        jitterY: r5 * Math.PI * 2,
        jitterZ: r6 * Math.PI * 2,
        jitterScale: 0.6 + r4 * 0.6,
      };
    });

    // ─── easing
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeOutBack(t)  {
      const c1 = 1.20;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    function smoothstep(a, b, t) {
      const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
      return x * x * (3 - 2 * x);
    }

    // ─── arêtes du cube unitaire
    // 8 sommets en (+/-0.5, +/-0.5, +/-0.5)
    const VERTS = [];
    for (let i = 0; i < 8; i++) {
      VERTS.push({
        x: (i & 1) ? 0.5 : -0.5,
        y: (i & 2) ? 0.5 : -0.5,
        z: (i & 4) ? 0.5 : -0.5,
      });
    }
    // 12 arêtes (paires d'indices différant d'un seul bit)
    const EDGES = [];
    for (let i = 0; i < 8; i++) {
      for (let bit = 1; bit < 8; bit <<= 1) {
        const j = i ^ bit;
        if (j > i) EDGES.push([i, j]);
      }
    }
    // 6 faces (pour highlights subtils)
    const FACES = [
      [0,1,3,2], [4,6,7,5], // -z, +z
      [0,2,6,4], [1,5,7,3], // -x, +x
      [0,4,5,1], [2,3,7,6], // -y, +y
    ];

    // ─── grille de sol (perspective dots)
    const FLOOR_Y = 2.0;
    const FLOOR_RANGE = 5.5;
    const FLOOR_STEP = 0.45;
    function drawFloor(camRotY, camRotX) {
      // points repartis sur la grille y=FLOOR_Y
      ctx.save();
      for (let xi = -FLOOR_RANGE; xi <= FLOOR_RANGE; xi += FLOOR_STEP) {
        for (let zi = -FLOOR_RANGE; zi <= FLOOR_RANGE; zi += FLOOR_STEP) {
          let p = { x: xi, y: FLOOR_Y, z: zi };
          p = rotY(p, camRotY);
          p = rotX(p, camRotX);
          const pr = project(p.x, p.y, p.z);
          if (!pr) continue;
          // taille du point selon proximite + fade radial
          const distFromCenter = Math.hypot(xi, zi) / FLOOR_RANGE;
          const fade = Math.max(0, 1 - distFromCenter * 0.95);
          const r = Math.max(0.5, pr.scale * 0.008) * fade;
          if (r < 0.4) continue;
          ctx.fillStyle = `rgba(168, 130, 255, ${0.05 + 0.22 * fade})`;
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // lignes d'horizon discretes
      const lines = 4;
      for (let li = 0; li < lines; li++) {
        const yOff = FLOOR_Y - li * 0.9;
        ctx.beginPath();
        let first = true;
        for (let xi = -FLOOR_RANGE; xi <= FLOOR_RANGE; xi += 0.25) {
          let p = { x: xi, y: yOff, z: 0 };
          p = rotY(p, camRotY);
          p = rotX(p, camRotX);
          const pr = project(p.x, p.y, p.z);
          if (!pr) { first = true; continue; }
          if (first) { ctx.moveTo(pr.x, pr.y); first = false; }
          else ctx.lineTo(pr.x, pr.y);
        }
        ctx.strokeStyle = `rgba(138, 92, 245, ${0.06 + (lines - li) * 0.018})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // ─── dessin d'un cube
    function drawCube(cx, cy, cz, scale, rx, ry, rz, alpha, camRotY, camRotX) {
      // transforme les 8 sommets : echelle locale -> rotation locale -> translation -> rotation camera
      const transformed = VERTS.map(v => {
        let p = { x: v.x * scale, y: v.y * scale, z: v.z * scale };
        p = rotX(p, rx);
        p = rotY(p, ry);
        p = rotZ(p, rz);
        p.x += cx; p.y += cy; p.z += cz;
        // rotation camera
        p = rotY(p, camRotY);
        p = rotX(p, camRotX);
        return p;
      });
      const projected = transformed.map(p => project(p.x, p.y, p.z));
      if (projected.some(p => !p)) return;

      // remplissage tres leger (face arriere d'abord, faces avant ensuite)
      // calcul z-avg par face
      const facesWithZ = FACES.map(f => {
        const zAvg = (transformed[f[0]].z + transformed[f[1]].z + transformed[f[2]].z + transformed[f[3]].z) / 4;
        return { idx: f, zAvg };
      });
      facesWithZ.sort((a, b) => b.zAvg - a.zAvg); // far first

      for (const { idx, zAvg } of facesWithZ) {
        const depth = (zAvg + CAMERA_D);
        const lum = Math.max(0, Math.min(1, (CAMERA_D + 1.5 - depth) / 2.5));
        ctx.beginPath();
        ctx.moveTo(projected[idx[0]].x, projected[idx[0]].y);
        ctx.lineTo(projected[idx[1]].x, projected[idx[1]].y);
        ctx.lineTo(projected[idx[2]].x, projected[idx[2]].y);
        ctx.lineTo(projected[idx[3]].x, projected[idx[3]].y);
        ctx.closePath();
        // gradient violet : plus proche = plus clair
        ctx.fillStyle = `rgba(${110 + 80 * lum}, ${75 + 90 * lum}, ${230}, ${(0.06 + 0.18 * lum) * alpha})`;
        ctx.fill();

        // pattern interne : "texture de données" — fines lignes horizontales
        if (lum > 0.35) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(projected[idx[0]].x, projected[idx[0]].y);
          ctx.lineTo(projected[idx[1]].x, projected[idx[1]].y);
          ctx.lineTo(projected[idx[2]].x, projected[idx[2]].y);
          ctx.lineTo(projected[idx[3]].x, projected[idx[3]].y);
          ctx.closePath();
          ctx.clip();
          // calcule bbox
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const k of idx) {
            minX = Math.min(minX, projected[k].x); maxX = Math.max(maxX, projected[k].x);
            minY = Math.min(minY, projected[k].y); maxY = Math.max(maxY, projected[k].y);
          }
          ctx.strokeStyle = `rgba(200, 175, 255, ${0.10 * alpha * lum})`;
          ctx.lineWidth = 0.6;
          const step = Math.max(2, projected[0].scale ? 3 : 3);
          for (let yy = minY; yy <= maxY; yy += step) {
            ctx.beginPath();
            ctx.moveTo(minX - 4, yy);
            ctx.lineTo(maxX + 4, yy);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // arêtes — devant en lueur, derrière atténuées
      for (const [a, b] of EDGES) {
        const za = transformed[a].z;
        const zb = transformed[b].z;
        const zm = (za + zb) / 2;
        const depth = zm + CAMERA_D;
        const lum = Math.max(0, Math.min(1, (CAMERA_D + 1.6 - depth) / 2.8));
        ctx.beginPath();
        ctx.moveTo(projected[a].x, projected[a].y);
        ctx.lineTo(projected[b].x, projected[b].y);
        ctx.strokeStyle = `rgba(${165 + 50 * lum}, ${125 + 60 * lum}, 255, ${(0.40 + 0.55 * lum) * alpha})`;
        ctx.lineWidth = 0.9 + 0.7 * lum;
        ctx.stroke();
      }

      // sommets lumineux (subtils points blancs aux coins)
      for (let i = 0; i < 8; i++) {
        const depth = transformed[i].z + CAMERA_D;
        const lum = Math.max(0, Math.min(1, (CAMERA_D + 1.6 - depth) / 2.8));
        if (lum < 0.4) continue;
        const p = projected[i];
        ctx.fillStyle = `rgba(220, 200, 255, ${0.55 * alpha * lum})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.1 * lum, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ─── boucle d'animation
    const ASSEMBLY_DURATION = 3.6;   // secondes pour s'assembler
    const HOLD_BEFORE_RESCAN = 6.5;  // tient le cluster
    const RESCAN_DURATION = 2.0;     // re-scatter rapide
    const TOTAL_CYCLE = ASSEMBLY_DURATION + HOLD_BEFORE_RESCAN + RESCAN_DURATION;

    let t0 = performance.now();
    let raf = 0;

    function frame(now) {
      const t = (now - t0) / 1000;
      // cycle complet : assemblage -> hold -> rescan -> assemblage...
      const cycleT = t % TOTAL_CYCLE;

      // rotation lente de la caméra (toujours)
      const camRotY = Math.sin(t * 0.10) * 0.45 + t * 0.02;
      const camRotX = -0.18 + Math.sin(t * 0.07) * 0.05;

      // efface
      ctx.fillStyle = COL.bg;
      ctx.fillRect(0, 0, W, H);

      drawFloor(camRotY, camRotX);

      // collecte tous les cubes avec leur z pour tri (back-to-front)
      const drawList = [];
      for (let i = 0; i < cubes.length; i++) {
        const c = cubes[i];
        const tgt = c.target;
        let progress;
        // phases :
        //   [0 .. ASSEMBLY_DURATION] : start -> target (en respectant delay)
        //   [ASSEMBLY .. ASSEMBLY+HOLD] : tient
        //   [+HOLD .. +RESCAN] : target -> start (delay inverse)
        if (cycleT <= ASSEMBLY_DURATION) {
          const localT = (cycleT - c.delay) / (ASSEMBLY_DURATION - c.delay);
          progress = Math.max(0, Math.min(1, localT));
          progress = easeOutBack(progress);
        } else if (cycleT <= ASSEMBLY_DURATION + HOLD_BEFORE_RESCAN) {
          progress = 1;
        } else {
          const rt = (cycleT - ASSEMBLY_DURATION - HOLD_BEFORE_RESCAN) / RESCAN_DURATION;
          const localT = (rt - (1 - c.delay - 0.4)) / 0.4;
          const back = Math.max(0, Math.min(1, localT));
          progress = 1 - easeOutCubic(back);
        }

        const x = c.startX + (tgt.x - c.startX) * progress;
        const y = c.startY + (tgt.y - c.startY) * progress;
        const z = c.startZ + (tgt.z - c.startZ) * progress;

        // rotation propre : interpole entre rotation chaotique et alignement
        // une fois assemble, drift super lent
        const drift = (1 - progress) * 1.0 + progress * 0.04;
        const rx = c.rotStart.x * (1 - progress) + Math.sin(t * 0.18 + c.jitterX) * 0.04 * progress;
        const ry = c.rotStart.y * (1 - progress) + Math.cos(t * 0.21 + c.jitterY) * 0.04 * progress;
        const rz = c.rotStart.z * (1 - progress) + Math.sin(t * 0.15 + c.jitterZ) * 0.03 * progress;

        // alpha fade-in pendant assemblage
        const alpha = Math.max(0.15, progress);

        // breathing scale apres assemblage
        const breath = 1 + Math.sin(t * 0.6 + i * 0.4) * 0.012 * progress;
        const scale = tgt.s * breath;

        // calcule z final pour tri (apres rotation camera)
        let pivot = { x, y, z };
        pivot = rotY(pivot, camRotY);
        pivot = rotX(pivot, camRotX);

        drawList.push({ pivot, x, y, z, scale, rx, ry, rz, alpha });
      }

      drawList.sort((a, b) => b.pivot.z - a.pivot.z);

      for (const d of drawList) {
        drawCube(d.x, d.y, d.z, d.scale, d.rx, d.ry, d.rz, d.alpha, camRotY, camRotX);
      }

      // halo central tres subtil (au centre du cluster)
      const halo = ctx.createRadialGradient(W * 0.5, H * 0.52, 0, W * 0.5, H * 0.52, Math.min(W, H) * 0.45);
      halo.addColorStop(0, 'rgba(168, 130, 255, 0.10)');
      halo.addColorStop(1, 'rgba(168, 130, 255, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // cleanup
    window.__cubesCleanup = function () {
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
