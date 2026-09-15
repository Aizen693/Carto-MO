/* Accueil Algor Access, mouvement (DA 09-2026 v4).
   Defilement inertiel Lenis branche sur GSAP ScrollTrigger, revelations par
   masque, titres composes ligne par ligne, parallaxe des captures, empilement
   des calques, instrument de metadonnees, inclinaison du globe au defilement,
   atmosphere WebGL du globe et distorsion WebGL au survol des theatres.
   Script classique (pas de build) : window.AlgorMotion.mount() est appele par
   HomeView au montage, revert() au demontage. Sans JS ou avec
   prefers-reduced-motion, tout reste lisible : aucun etat initial cache en CSS. */
(function () {
  'use strict';
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FINE = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  var lenis = null, lenisReady = false;

  function hasGsap() { return !!(window.gsap && window.ScrollTrigger); }

  // ── Lenis : defilement inertiel, une seule instance pour la page ──
  function initLenis() {
    if (lenisReady || REDUCED || !window.Lenis || !hasGsap()) return;
    lenisReady = true;
    lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.95, touchMultiplier: 1.3 });
    lenis.on('scroll', window.ScrollTrigger.update);
    window.gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    window.gsap.ticker.lagSmoothing(0);
    // Ancres internes explicites (data-scroll) : les vues par hash (#console,
    // #comptes...) et les liens data-algor-login (href="#") ne sont pas touches.
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-scroll]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (!id || id.charAt(0) !== '#' || id.length < 2) return;
      var el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: -56, duration: 1.5, easing: function (t) { return 1 - Math.pow(1 - t, 3); } });
    });
    window.__algorLenis = lenis;
  }

  // ── Titres : mots regroupes par ligne, chaque ligne montee sous un masque ──
  function splitLines(el) {
    var original = el.innerHTML;
    var frag = document.createDocumentFragment();
    Array.prototype.slice.call(el.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          var s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.appendChild(s);
        });
      } else if (node.nodeType === 1 && node.tagName === 'BR') {
        frag.appendChild(node.cloneNode(false));
      } else if (node.nodeType === 1) {
        var w = document.createElement('span'); w.className = 'w'; w.appendChild(node.cloneNode(true)); frag.appendChild(w);
      }
    });
    el.innerHTML = ''; el.appendChild(frag);
    var words = Array.prototype.slice.call(el.querySelectorAll(':scope > .w'));
    if (!words.length) { el.innerHTML = original; return null; }
    // regroupement par ligne (offsetTop)
    var lines = [], cur = null, curTop = null;
    words.forEach(function (w) {
      var top = w.offsetTop;
      if (cur === null || Math.abs(top - curTop) > 4) { cur = []; lines.push(cur); curTop = top; }
      cur.push(w);
    });
    lines.forEach(function (ws) {
      var hl = document.createElement('span'); hl.className = 'hl';
      var inn = document.createElement('span'); inn.className = 'hl__in';
      hl.appendChild(inn);
      ws[0].parentNode.insertBefore(hl, ws[0]);
      ws.forEach(function (w, i) {
        if (i > 0 && w.previousSibling && w.previousSibling.nodeType === 3) inn.appendChild(w.previousSibling);
        inn.appendChild(w);
      });
    });
    return { restore: function () { el.innerHTML = original; }, inners: Array.prototype.slice.call(el.querySelectorAll('.hl__in')) };
  }

  // ── Instrument de metadonnees (section theatres) ──
  function fmtLat(v) { var a = Math.abs(v); return (a.toFixed(3)).padStart(6, '0') + (v < 0 ? ' S' : ' N'); }
  function fmtLon(v) { var a = Math.abs(v); return (a.toFixed(3)).padStart(7, '0') + (v < 0 ? ' O' : ' E'); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ── Atmosphere WebGL du globe (surcouche, aucun changement du rendu D3) ──
  function createAtmo(gsap, ScrollTrigger) {
    var wrap = document.querySelector('.hero--night .globe-wrap');
    var base = wrap && wrap.querySelector('.globe-canvas');
    if (!wrap || !base) return null;
    // Terre reelle active (earth.js) : son shader porte deja terminateur et atmosphere.
    if (window.__algorGlobe && window.__algorGlobe.hasEarth) return null;
    // page blanche : halo plus discret, pas de face nuit sur le globe clair
    var LIGHT = !!(wrap.closest('.hero--sky') && !wrap.closest('.globe-nuit')) ? 1 : 0;
    var cv = document.createElement('canvas');
    cv.className = 'globe-atmo'; cv.setAttribute('aria-hidden', 'true');
    wrap.insertBefore(cv, base.nextSibling);
    var gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) { cv.remove(); return null; }
    var VS = 'attribute vec2 p; varying vec2 v; void main(){ v = p; gl_Position = vec4(p, 0., 1.); }';
    var FS = [
      'precision highp float; varying vec2 v; uniform vec2 uRes; uniform float uR; uniform float uClip; uniform float uT; uniform float uLight;',
      'void main(){',
      '  vec2 px = (v * 0.5 + 0.5) * uRes; vec2 d = px - uRes * 0.5; float r = length(d);',
      '  float R = min(uR, uClip);',
      '  vec4 col = vec4(0.);',
      // halo atmospherique : fin anneau violet qui s'eteint vers l'exterieur
      '  float g = smoothstep(R * 1.11, R * 0.995, r) * step(R * 0.99, r);',
      '  g = g * g * (0.80 + 0.20 * sin(uT * 0.6));',
      '  vec3 atmo = vec3(0.60, 0.44, 0.92);',
      '  float ga = mix(0.55, 0.30, uLight);',
      '  col += vec4(atmo * g * ga, g * ga);',
      '  if (r < R) {',
      '    vec2 n2 = d / R; float z = sqrt(max(0., 1. - dot(n2, n2)));',
      '    vec3 n = normalize(vec3(n2.x, -n2.y, z));',
      '    vec3 L = normalize(vec3(-0.6, 0.5, 0.62));',
      '    float lam = dot(n, L);',
      '    float night = smoothstep(0.30, -0.45, lam);',      // 0 = eclaire, 1 = nuit
      '    float shade = night * mix(0.52, 0.10, uLight);',
      '    float rim = pow(1. - z, 3.2);',
      '    float lit = smoothstep(-0.25, 0.7, lam);',
      '    vec3 rimC = vec3(0.78, 0.68, 0.94) * rim * (0.30 + 0.70 * lit) * 0.85;',
      '    float a = shade + rim * mix(0.9, 0.5, uLight);',
      '    col += vec4(rimC, a);',
      '  }',
      '  gl_FragColor = col;',
      '}'].join('\n');
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { cv.remove(); return null; }
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uRes = gl.getUniformLocation(prog, 'uRes'), uR = gl.getUniformLocation(prog, 'uR'), uClip = gl.getUniformLocation(prog, 'uClip'), uT = gl.getUniformLocation(prog, 'uT');
    gl.uniform1f(gl.getUniformLocation(prog, 'uLight'), LIGHT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    var DPR = Math.min(window.devicePixelRatio || 1, 2), running = false, raf = 0, visible = true;
    // Le canvas d'atmosphere deborde du globe (CSS .globe-atmo, 128 %) pour que le halo ne soit pas coupe.
    function size() {
      var r = cv.getBoundingClientRect();
      var w = Math.max(2, Math.round(r.width * DPR)), h = Math.max(2, Math.round(r.height * DPR));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
      return [w, h];
    }
    function frame(t) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      var wh = size();
      var br = base.getBoundingClientRect();
      var g = window.__algorGlobe;
      var scale = g ? g.getScale() : Math.min(br.width, br.height) / 2 - 6;
      var clip = Math.min(br.width, br.height) / 2 * DPR;
      gl.uniform2f(uRes, wh[0], wh[1]);
      gl.uniform1f(uR, scale * DPR);
      gl.uniform1f(uClip, clip);
      gl.uniform1f(uT, REDUCED ? 0 : t / 1000);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    var io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }, { threshold: 0 });
      io.observe(wrap);
    }
    running = true; raf = requestAnimationFrame(frame);
    return { stop: function () { running = false; cancelAnimationFrame(raf); if (io) io.disconnect(); cv.remove(); } };
  }

  // ── Distorsion WebGL au survol des captures de theatres (un seul contexte) ──
  function createHover(gsap) {
    if (!FINE || REDUCED) return null;
    var frames = Array.prototype.slice.call(document.querySelectorAll('[data-gl-hover]'));
    if (!frames.length) return null;
    var cv = document.createElement('canvas'); cv.className = 'gl-hover'; cv.setAttribute('aria-hidden', 'true');
    var gl = cv.getContext('webgl', { premultipliedAlpha: false, alpha: false, antialias: false, depth: false });
    if (!gl) return null;
    var VS = 'attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0., 1.); }';
    var FS = [
      'precision highp float; varying vec2 v; uniform sampler2D uTex; uniform vec2 uMouse; uniform float uS; uniform float uT; uniform vec2 uScale; uniform vec2 uOff;',
      'void main(){',
      '  vec2 uv = vec2(v.x, 1. - v.y);',
      '  vec2 dir = uv - uMouse; float dist = length(dir);',
      '  float fall = exp(-dist * dist * 7.0);',
      '  float ripple = 0.5 + 0.5 * sin(dist * 26.0 - uT * 3.2);',
      '  vec2 disp = dir * fall * (0.030 + 0.018 * ripple) * uS;',
      '  vec2 tuv = (uv - disp) * uScale + uOff;',
      '  float ca = 0.0045 * fall * uS;',
      '  vec4 c = texture2D(uTex, tuv);',
      '  c.r = texture2D(uTex, tuv + vec2(ca, 0.)).r;',
      '  c.b = texture2D(uTex, tuv - vec2(ca, 0.)).b;',
      '  gl_FragColor = vec4(c.rgb, 1.);',
      '}'].join('\n');
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ['uTex', 'uMouse', 'uS', 'uT', 'uScale', 'uOff'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    var DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    var active = null, state = { s: 0, mx: 0.5, my: 0.5 }, raf = 0, tween = null, texImg = null;
    function upload(img) {
      if (texImg === img) return true;
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); texImg = img; return true; } catch (e) { return false; }
    }
    function render(t) {
      raf = 0;
      if (!active) return;
      var img = active.querySelector('img');
      var r = active.getBoundingClientRect();
      var w = Math.max(2, Math.round(r.width * DPR)), h = Math.max(2, Math.round(r.height * DPR));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
      var fa = r.width / r.height, ia = (img.naturalWidth || 16) / (img.naturalHeight || 10);
      var sx = 1, sy = 1, ox = 0, oy = 0;
      if (ia > fa) { sx = fa / ia; ox = (1 - sx) / 2; } else { sy = ia / fa; oy = (1 - sy) / 2; }
      gl.uniform2f(U.uScale, sx, sy); gl.uniform2f(U.uOff, ox, oy);
      gl.uniform2f(U.uMouse, state.mx, state.my); gl.uniform1f(U.uS, state.s); gl.uniform1f(U.uT, t / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (state.s > 0.001 || (tween && tween.isActive())) raf = requestAnimationFrame(render);
      else detach();
    }
    function attach(frame) {
      var img = frame.querySelector('img');
      if (!img || !img.complete || !img.naturalWidth || !upload(img)) return;
      if (active && active !== frame) detach();
      active = frame; frame.appendChild(cv); frame.classList.add('is-gl');
      if (!raf) raf = requestAnimationFrame(render);
    }
    function detach() {
      if (!active) return;
      active.classList.remove('is-gl'); if (cv.parentNode) cv.parentNode.removeChild(cv); active = null;
    }
    frames.forEach(function (frame) {
      frame.addEventListener('pointerenter', function (e) {
        var r = frame.getBoundingClientRect();
        state.mx = (e.clientX - r.left) / r.width; state.my = (e.clientY - r.top) / r.height;
        attach(frame);
        if (tween) tween.kill();
        tween = gsap.to(state, { s: 1, duration: 0.9, ease: 'expo.out' });
      });
      frame.addEventListener('pointermove', function (e) {
        if (active !== frame) return;
        var r = frame.getBoundingClientRect();
        gsap.to(state, { mx: (e.clientX - r.left) / r.width, my: (e.clientY - r.top) / r.height, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
      });
      frame.addEventListener('pointerleave', function () {
        if (active !== frame) return;
        if (tween) tween.kill();
        tween = gsap.to(state, { s: 0, duration: 0.7, ease: 'power2.out' });
        if (!raf) raf = requestAnimationFrame(render);
      });
    });
    return { destroy: function () { detach(); if (tween) tween.kill(); cancelAnimationFrame(raf); } };
  }

  // ── Montage principal ──
  var current = null;
  function mount() {
    if (!hasGsap()) return null;
    if (current) { current.revert(); current = null; }
    var gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    initLenis();
    var atmo = null, hover = null, restores = [];
    var ctx = gsap.context(function () {
      // Hero : titre ligne par ligne, kicker, lede, CTA, globe
      var hero = document.querySelector('.hero--night');
      if (hero) {
        var h1 = hero.querySelector('.hero__title');
        if (h1 && !REDUCED) {
          var sp = splitLines(h1);
          if (sp) {
            restores.push(sp.restore);
            gsap.fromTo(sp.inners, { yPercent: 108 }, { yPercent: 0, duration: 1.25, ease: 'expo.out', stagger: 0.1, delay: 0.1, onComplete: function () { sp.restore(); } });
          }
          gsap.fromTo(hero.querySelectorAll('.hero__kicker, .hero__lede, .hero__cta-row, .hero__demo'), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09, delay: 0.35 });
        }
        var visual = hero.querySelector('.hero__visual'), copy = hero.querySelector('.hero__copy');
        if (!REDUCED) {
          ScrollTrigger.create({
            trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6,
            onUpdate: function (self) {
              var p = self.progress;
              if (window.__algorGlobe) window.__algorGlobe.setTilt(-22 * p);
              if (visual) gsap.set(visual, { y: 110 * p, scale: 1 - 0.06 * p });
              if (copy) gsap.set(copy, { y: 60 * p, opacity: 1 - 0.9 * p });
            }
          });
        }
        // Atmosphere WebGL (anneau violet) retiree a la demande de Gaspar (14/09) : createAtmo conserve, inactif.
        atmo = null;
      }

      if (REDUCED) return; // tout reste visible, sans animation de defilement

      // Titres de sections : lignes masquees, une seule fois a l'entree
      gsap.utils.toArray('[data-split]').forEach(function (el) {
        if (el.closest('.hero--night')) return;
        var sp = splitLines(el);
        if (!sp) return;
        restores.push(sp.restore);
        gsap.fromTo(sp.inners, { yPercent: 105 }, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true }, onComplete: function () { sp.restore(); } });
      });

      // Apparitions au defilement, une fois
      gsap.utils.toArray('[data-reveal]').forEach(function (el) {
        var kind = el.getAttribute('data-reveal') || 'up';
        var from = { opacity: 0, y: kind === 'up' ? 26 : 0, filter: kind === 'fade' ? 'blur(0px)' : 'blur(5px)' };
        gsap.fromTo(el, from, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.0, ease: 'expo.out', clearProps: 'filter',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
      });

      // Captures : revelation par masque (inset) + leger de-zoom
      gsap.utils.toArray('[data-clip]').forEach(function (el, i) {
        var flip = !!el.closest('.th-row--flip');
        var from = flip ? 'inset(0 0 0 100%)' : (el.classList.contains('svc__media') || el.classList.contains('fiche') ? 'inset(0 0 100% 0)' : 'inset(0 100% 0 0)');
        var media = el.querySelector('img, video');
        var tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
        tl.fromTo(el, { clipPath: from }, { clipPath: 'inset(0 0 0 0)', duration: 1.3, ease: 'expo.out' }, 0);
        if (media) tl.fromTo(media, { scale: 1.14 }, { scale: 1, duration: 1.6, ease: 'expo.out' }, 0);
      });

      // Parallaxe douce des captures (l'image deborde de 12 % en hauteur)
      gsap.utils.toArray('[data-parallax]').forEach(function (el) {
        var amp = parseFloat(el.getAttribute('data-parallax')) || 6;
        gsap.fromTo(el, { yPercent: -amp }, { yPercent: amp, ease: 'none',
          scrollTrigger: { trigger: el.parentNode, start: 'top bottom', end: 'bottom top', scrub: 0.4 } });
      });

      // Instrument de metadonnees : valeurs interpolees au fil des theatres
      var instr = document.querySelector('[data-instr]');
      var rows = gsap.utils.toArray('[data-th]');
      if (instr && rows.length) {
        var vLat = instr.querySelector('[data-instr-lat]'), vLon = instr.querySelector('[data-instr-lon]'),
            vPer = instr.querySelector('[data-instr-per]'), vCal = instr.querySelector('[data-instr-cal]'), vTh = instr.querySelector('[data-instr-th]');
        var meta = rows.map(function (r) { return { lat: parseFloat(r.getAttribute('data-lat')), lon: parseFloat(r.getAttribute('data-lon')), per: r.getAttribute('data-per'), cal: r.getAttribute('data-cal'), n: r.getAttribute('data-n') }; });
        var cur = { i: 0, p: 1 };
        function write() {
          var a = meta[Math.max(0, cur.i - 1)], b = meta[cur.i], t = cur.i === 0 ? 1 : cur.p;
          vLat.textContent = fmtLat(lerp(a.lat, b.lat, t));
          vLon.textContent = fmtLon(lerp(a.lon, b.lon, t));
          var swap = t > 0.5 ? b : a;
          vPer.textContent = swap.per; vCal.textContent = swap.cal; vTh.textContent = swap.n + ' / 0' + meta.length;
        }
        rows.forEach(function (r, i) {
          ScrollTrigger.create({
            trigger: r, start: 'top 78%', end: 'top 32%', scrub: 0.5,
            onUpdate: function (self) { if (i === 0) return; cur.i = i; cur.p = self.progress; write(); },
            onLeaveBack: function () { if (i > 0) { cur.i = i - 1; cur.p = 1; write(); } }
          });
        });
        write();
      }

      // Empilement des calques : chaque etape revele son calque au defilement
      gsap.utils.toArray('[data-stack-step]').forEach(function (step) {
        var id = step.getAttribute('data-stack-step');
        var layer = document.querySelector('[data-stack-layer="' + id + '"]');
        var chip = document.querySelector('[data-stack-chip="' + id + '"]');
        if (id === 'base') {
          if (chip) chip.classList.add('is-on');
          ScrollTrigger.create({ trigger: step, start: 'top 70%', end: 'bottom 40%', onToggle: function (s) { step.classList.toggle('is-active', s.isActive); } });
          return;
        }
        ScrollTrigger.create({
          trigger: step, start: 'top 72%', end: 'top 38%', scrub: 0.35,
          onUpdate: function (self) {
            var p = self.progress;
            if (layer) gsap.set(layer, { clipPath: 'inset(0 0 ' + ((1 - p) * 100).toFixed(2) + '% 0)', opacity: Math.min(1, p * 1.6) });
            if (chip) chip.classList.toggle('is-on', p > 0.5);
            step.classList.toggle('is-active', p > 0.5);
          }
        });
      });

      hover = createHover(gsap);
    });

    // Rafraichissements : images, polices, contenu de veille charge apres coup
    var t1 = setTimeout(function () { ScrollTrigger.refresh(); }, 900);
    var t2 = setTimeout(function () { ScrollTrigger.refresh(); }, 3000);
    var onLoad = function () { ScrollTrigger.refresh(); };
    window.addEventListener('load', onLoad);
    var ro = null, roT = 0;
    if (window.ResizeObserver) {
      var main = document.querySelector('main');
      if (main) { ro = new ResizeObserver(function () { clearTimeout(roT); roT = setTimeout(function () { ScrollTrigger.refresh(); }, 250); }); ro.observe(main); }
    }

    current = {
      revert: function () {
        current = null;
        clearTimeout(t1); clearTimeout(t2); clearTimeout(roT);
        window.removeEventListener('load', onLoad);
        if (ro) ro.disconnect();
        if (atmo) atmo.stop();
        if (hover) hover.destroy();
        restores.forEach(function (f) { try { f(); } catch (e) {} });
        ctx.revert();
        if (window.__algorGlobe) window.__algorGlobe.setTilt(0);
      }
    };
    return current;
  }

  window.AlgorMotion = { mount: mount, reduced: REDUCED };
})();
