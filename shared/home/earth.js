/* Terre nocturne reelle du globe d'accueil (09-2026).
   Rendu WebGL par pixel sous le canvas D3 : chaque pixel du disque est lance
   sur la sphere (projection orthographique identique a d3.geoOrthographic,
   meme rotation, meme echelle), puis eclaire par la VRAIE position du soleil a
   l'heure de la visite. Face jour : NASA Blue Marble (relief + bathymetrie)
   assombrie pour le noir du site ; face nuit : NASA Black Marble 2016 (terres
   lunaires lavande, lumieres des villes) ; reflet du soleil sur les oceans ;
   atmosphere violet vers bleu de marque. Images NASA, domaine public.
   Script classique (pas de build) : window.AlgorEarth.create(canvas, opts). */
(function () {
  'use strict';
  var RAD = Math.PI / 180;

  var VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

  var FS = [
    '#ifdef DERIV',
    '#extension GL_OES_standard_derivatives : enable',
    '#endif',
    'precision highp float;',
    'uniform vec2 uCenter;',   // centre du globe, pixels device (origine en bas)
    'uniform float uR;',       // rayon de la sphere, pixels device
    'uniform float uClip;',    // rayon de la loupe (disque visible), pixels device
    'uniform vec3 uRot;',      // (delta lambda rad, cos delta phi, sin delta phi)
    'uniform vec3 uSun;',      // soleil, repere sphere
    'uniform vec3 uSunV;',     // soleil, repere ecran (x, y, profondeur)
    'uniform vec3 uView;',     // direction de vue, repere sphere
    'uniform sampler2D uDay;',
    'uniform sampler2D uNight;',
    'uniform float uReady;',   // fondu d'apparition de la surface
    'void main(){',
    '  vec2 d = gl_FragCoord.xy - uCenter;',
    '  float rpx = length(d);',
    '  vec2 q = d / uR;',
    '  float z = sqrt(max(0.0, 1.0 - dot(q, q)));',
    // point vu -> repere de la sphere (inverse de la rotation phi de d3)
    '  vec3 N = normalize(vec3(z * uRot.y + q.y * uRot.z, q.x, -z * uRot.z + q.y * uRot.y) + 1e-6);',
    '  float lon = atan(N.y, N.x) - uRot.x;',
    '  float lat = asin(clamp(N.z, -1.0, 1.0));',
    // couture a 180 degres : on garde la coordonnee u la plus continue (mipmaps propres)
    '  float u1 = fract(lon / 6.2831853 + 0.5);',
    '  float u2 = fract(u1 + 0.5) - 0.5;',
    '#ifdef DERIV',
    '  float u = fwidth(u1) <= fwidth(u2) + 1e-6 ? u1 : u2;',
    '#else',
    '  float u = u1;',
    '#endif',
    '  vec2 uv = vec2(u, 0.5 - lat / 3.14159265);',
    '  vec3 dayC = texture2D(uDay, uv).rgb;',
    '  vec3 nightC = texture2D(uNight, uv).rgb;',

    '  float mu = dot(N, uSun);',
    '  float dayK = smoothstep(-0.10, 0.22, mu);',
    // face jour : Blue Marble etalonnee (desaturee, plus sombre, oceans froids)
    '  float water = smoothstep(0.03, 0.15, dayC.b - dayC.r);',
    '  float lum = dot(dayC, vec3(0.299, 0.587, 0.114));',
    '  vec3 g = mix(vec3(lum), dayC, 0.58);',
    '  g = pow(max(g, vec3(0.0)), vec3(1.28));',
    '  g *= mix(vec3(1.0, 0.95, 0.90), vec3(0.50, 0.66, 1.02), water);',
    '  vec3 dayLit = g * (0.05 + 0.74 * pow(max(mu, 0.0), 0.8));',
    // face nuit : Black Marble, lumieres des villes rehaussees
    '  float lightK = smoothstep(0.16, 0.55, nightC.r - nightC.b * 0.6);',
    '  vec3 lights = nightC * lightK * vec3(1.45, 1.22, 0.95) * 1.85;',
    '  vec3 moon = nightC * (1.0 - lightK) * 0.9 + vec3(0.012, 0.009, 0.03);',
    '  vec3 surf = mix(moon + lights, dayLit, dayK);',
    // crepuscule : liseré rose ambre le long du terminateur
    '  float tw = exp(-mu * mu * 70.0);',
    '  surf += vec3(0.50, 0.24, 0.30) * tw * 0.09;',
    // reflet du soleil sur l'eau
    '  vec3 H = normalize(uSun + uView);',
    '  float nh = max(dot(N, H), 0.0);',
    '  float lit = smoothstep(-0.02, 0.25, mu);',
    '  float spec = (pow(nh, 260.0) * 0.55 + pow(nh, 28.0) * 0.045) * water * lit * pow(z, 0.6);',
    '  surf += vec3(1.0, 0.92, 0.82) * spec;',
    // atmosphere sur le limbe : violet cote nuit, bleu cote jour
    '  float fres = pow(1.0 - z, 2.4);',
    '  vec3 atmoC = mix(vec3(0.44, 0.31, 0.86), vec3(0.38, 0.63, 1.0), smoothstep(-0.15, 0.6, mu));',
    '  float atmoK = fres * (0.18 + 0.72 * smoothstep(-0.35, 0.55, mu));',
    '  surf = mix(surf, atmoC, clamp(atmoK * 0.7, 0.0, 0.8)) + atmoC * atmoK * 0.18;',
    '  surf = clamp(surf, 0.0, 1.0);',

    // couverture : bord de sphere et bord de loupe anti-crenelés
    '  float cover = clamp(uR - rpx + 0.5, 0.0, 1.0) * clamp(uClip - rpx + 0.5, 0.0, 1.0) * uReady;',
    // halo exterieur : colle au disque visible, plus fort cote soleil
    '  float Rv = min(uR, uClip);',
    '  float x = max(rpx - Rv, 0.0) / Rv;',
    '  float outside = clamp(rpx - Rv + 0.5, 0.0, 1.0);',
    '  vec2 dir = d / max(rpx, 1.0);',
    '  float litH = smoothstep(-0.45, 0.7, dot(dir, uSunV.xy) + uSunV.z * 0.35);',
    '  vec3 haloC = mix(vec3(0.42, 0.28, 0.82), vec3(0.42, 0.64, 1.0), litH);',
    '  float haloA = (exp(-x * 20.0) * (0.34 + 0.56 * litH) + exp(-x * 4.2) * 0.09) * outside;',

    '  float a = cover + haloA * (1.0 - cover);',
    '  vec3 rgb = surf * cover + haloC * haloA * (1.0 - cover);',
    // tramage : pas de bandes dans les degrades sur fond noir
    '  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);',
    '  rgb += (n - 0.5) / 255.0 * a;',
    '  gl_FragColor = vec4(max(rgb, vec3(0.0)), clamp(a, 0.0, 1.0));',
    '}'
  ].join('\n');

  // Point subsolaire (formules NOAA) : [longitude, latitude] en degres.
  function subsolar(date) {
    var y0 = Date.UTC(date.getUTCFullYear(), 0, 1);
    var doy = (date.getTime() - y0) / 864e5;
    var g = 2 * Math.PI / 365 * (doy - 0.5);
    var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
      0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
    var lon = -(utcMin + eqt - 720) / 4;
    lon = ((lon + 540) % 360) - 180;
    return [lon, decl / RAD];
  }

  function create(canvas, opts) {
    opts = opts || {};
    var gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    } catch (e) { gl = null; }
    if (!gl) return null;
    var deriv = gl.getExtension('OES_standard_derivatives');
    var aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;

    function shader(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { if (window.console) console.warn('[terre]', gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    var vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, (deriv ? '#define DERIV\n' : '') + FS);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ['uCenter', 'uR', 'uClip', 'uRot', 'uSun', 'uSunV', 'uView', 'uDay', 'uNight', 'uReady'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.uniform1i(U.uDay, 0); gl.uniform1i(U.uNight, 1);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);

    // Textures : pixel noir en attendant les images.
    function makeTex(unit) {
      var t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      return t;
    }
    var tex = [makeTex(0), makeTex(1)];
    function upload(unit, img) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex[unit]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1));
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    function loadImg(url) {
      return new Promise(function (res, rej) {
        var img = new Image();
        img.decoding = 'async';
        img.onload = function () { (img.decode ? img.decode() : Promise.resolve()).then(function () { res(img); }, function () { res(img); }); };
        img.onerror = rej;
        img.src = url;
      });
    }

    var alive = true, lost = false, ready = 0, readyTarget = 0, lastT = 0;
    var base = opts.base || './shared/home/assets/earth/';
    var v = opts.version ? '?v=' + opts.version : '';
    function loadSet(size) {
      return Promise.all([loadImg(base + 'jour-' + size + '.jpg' + v), loadImg(base + 'nuit-' + size + '.jpg' + v)]).then(function (imgs) {
        if (!alive || lost) return;
        upload(0, imgs[0]); upload(1, imgs[1]);
        readyTarget = 1;
      });
    }
    // 2k d'abord (apparition rapide), puis 4k en silence si l'ecran et le GPU le meritent.
    var wantHi = !!opts.hi && maxTex >= 4096;
    loadSet('2k').then(function () { if (wantHi && alive) return loadSet('4k'); }).catch(function () { /* repli : globe plat */ });

    var sunDate = null, sun = subsolar(new Date()), sunAt = 0;
    function onLost(e) { e.preventDefault(); lost = true; ready = 0; readyTarget = 0; }
    canvas.addEventListener('webglcontextlost', onLost);

    function render(o) {
      if (!alive || lost) return;
      var now = o.t || performance.now();
      if (!sunDate && now - sunAt > 20000) { sun = subsolar(new Date()); sunAt = now; }
      var dt = lastT ? Math.min(100, now - lastT) : 16; lastT = now;
      ready += (readyTarget - ready) * (1 - Math.exp(-dt / 320));
      if (Math.abs(readyTarget - ready) < 0.002) ready = readyTarget;

      var dpr = o.dpr || 1;
      var w = Math.max(2, Math.round(o.w * dpr)), h = Math.max(2, Math.round(o.h * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);

      var lam = o.rotate[0] * RAD, phi = o.rotate[1] * RAD, cp = Math.cos(phi), sp = Math.sin(phi);
      var ls = sun[0] * RAD + lam, bs = sun[1] * RAD;
      var Sx = Math.cos(bs) * Math.cos(ls), Sy = Math.cos(bs) * Math.sin(ls), Sz = Math.sin(bs);
      gl.uniform3f(U.uRot, lam, cp, sp);
      gl.uniform3f(U.uSun, Sx, Sy, Sz);
      gl.uniform3f(U.uSunV, Sy, Sx * sp + Sz * cp, Sx * cp - Sz * sp);
      gl.uniform3f(U.uView, cp, 0, -sp);
      gl.uniform2f(U.uCenter, o.cx * dpr, h - o.cy * dpr);
      gl.uniform1f(U.uR, o.scale * dpr);
      gl.uniform1f(U.uClip, o.clip * dpr);
      gl.uniform1f(U.uReady, ready);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    return {
      render: render,
      ready: function () { return ready; },
      // Controle visuel : fige le soleil a une date donnee (null = heure reelle).
      setSunDate: function (d) { sunDate = d ? new Date(d) : null; sun = subsolar(sunDate || new Date()); sunAt = performance.now(); },
      sun: function () { return sun.slice(); },
      destroy: function () {
        alive = false;
        canvas.removeEventListener('webglcontextlost', onLost);
        var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
      }
    };
  }

  window.AlgorEarth = { create: create, subsolar: subsolar };
})();
