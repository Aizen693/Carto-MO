/* Algor Access · comportement commun v5 : navigation, menu, recherche, bandeau de veille,
   typographie française. Aucune dépendance. */
(function () {
  'use strict';
  var d = document;
  var reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  /* Espace fine insécable avant : ; ? ! */
  var fr = function (s) { return String(s == null ? '' : s).replace(/[  ]([:;?!])(?=\s|$)/g, ' $1'); };
  window.V5 = { esc: esc, fr: fr, reduit: reduit };

  function typo(root) {
    var w = d.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode && n.parentNode.nodeName;
        if (p === 'SCRIPT' || p === 'STYLE' || p === 'TEXTAREA' || p === 'CODE' || p === 'PRE') return NodeFilter.FILTER_REJECT;
        return /[  ][:;?!]/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var n, todo = [];
    while ((n = w.nextNode())) todo.push(n);
    todo.forEach(function (t) { t.nodeValue = fr(t.nodeValue); });
  }
  window.V5.typo = typo;


  /* Trame de plan (fond des surfaces de nuit) : cellules sur un module fixe, intersections
     cerclées, quelques cellules hachurées, règle graduée en pixels sur le bord gauche. */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function trame(host) {
    var svg = d.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'v5-trame'); svg.setAttribute('aria-hidden', 'true');
    host.insertBefore(svg, host.firstChild);
    var hach = (host.getAttribute('data-hachures') || '3,1;4,1;2,3').split(';').map(function (c) { return c.split(',').map(Number); });
    function dessiner() {
      var w = host.clientWidth, H = host.clientHeight, h = H; if (!w || !H) return;
      var cell = w < 700 ? 124 : 200, ox = w < 700 ? 16 : 24, oy = (host.getAttribute('data-trame-top') | 0) || (w < 700 ? 88 : 104);
      /* La trame s'arrête au-dessus d'une carte ([data-trame-stop]) : jamais de cases sur une carte */
      var stop = host.querySelector('[data-trame-stop]'), rows;
      if (stop) {
        rows = Math.max(0, Math.floor((stop.getBoundingClientRect().top - host.getBoundingClientRect().top - 16 - oy) / cell));
        h = oy + rows * cell + 1;
      } else rows = Math.ceil((h - oy) / cell);
      var cols = Math.ceil((w - ox) / cell), o = [];
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + H); svg.setAttribute('width', w); svg.setAttribute('height', H);
      o.push('<defs><pattern id="v5h" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,.07)" stroke-width="1"/></pattern></defs>');
      hach.forEach(function (c) { if (c[0] < cols && c[1] < rows) o.push('<rect x="' + (ox + c[0] * cell) + '" y="' + (oy + c[1] * cell) + '" width="' + cell + '" height="' + cell + '" fill="url(#v5h)"/>'); });
      for (var i = 0; i <= cols; i++) { var x = ox + i * cell + .5; o.push('<line x1="' + x + '" y1="' + (oy - 20) + '" x2="' + x + '" y2="' + h + '" class="l"/>'); }
      for (var j = 0; j <= rows; j++) { var y = oy + j * cell + .5; o.push('<line x1="0" y1="' + y + '" x2="' + w + '" y2="' + y + '" class="l"/>');
        if (j > 0) o.push('<text x="4" y="' + (y - 6) + '" class="t">' + (j * 100) + '</text>'); }
      for (i = 0; i <= cols; i++) for (j = 0; j <= rows; j++) o.push('<circle cx="' + (ox + i * cell + .5) + '" cy="' + (oy + j * cell + .5) + '" r="3.2" class="n"/>');
      svg.innerHTML = o.join('');
      host.__trame = { cell: cell, ox: ox, oy: oy, cols: cols, rows: rows, w: w, h: h + 4 };
    }
    dessiner();
    if (window.ResizeObserver) new ResizeObserver(dessiner).observe(host); else addEventListener('resize', dessiner);
    cases(host);
    var anim = host.getAttribute('data-trame-anim');
    if (anim === 'balayage') balayage(host); else if (anim && !reduit) motifs(host, anim);
  }

  /* Animations propres à chaque page, dessinées sur un calque SVG sous le texte :
     « recoupement » (méthodologie) : des nœuds se relient par des traits qui se dessinent, comme des sources croisées ;
     « niveaux » (offres) : des colonnes de cases hachurées montent par paliers, comme les niveaux d'offre ;
     « signal » (contact) : des ondes partent d'un nœud, comme une prise de contact. */
  function motifs(host, type) {
    var svg = d.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', 'v5-motif v5-motif--' + type); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<defs><pattern id="v5m-h" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,.22)" stroke-width="1"/></pattern></defs>';
    host.insertBefore(svg, host.firstChild.nextSibling);
    function taille() { var w = host.clientWidth, h = host.clientHeight; svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('width', w); svg.setAttribute('height', h); }
    taille(); if (window.ResizeObserver) new ResizeObserver(taille).observe(host);
    function el(n, a) { var e = d.createElementNS(SVGNS, n); for (var k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; }
    function retirer(e, ms) { setTimeout(function () { e.classList.add('is-out'); setTimeout(function () { e.remove(); }, 900); }, ms); }
    // nœuds de la moitié droite de la trame, là où il n'y a pas de texte
    function noeuds() {
      var g = host.__trame; if (!g) return [];
      var l = [], i0 = Math.ceil(g.cols * (g.w < 700 ? 0 : 0.5));
      for (var i = i0; i <= g.cols; i++) for (var j = 0; j <= g.rows; j++) {
        var x = g.ox + i * g.cell + .5, y = g.oy + j * g.cell + .5;
        if (x < g.w - 8 && y < Math.min(g.h, host.clientHeight) - 8) l.push({ i: i, j: j, x: x, y: y });
      }
      return l;
    }
    function hasard(l) { return l[Math.floor(Math.random() * l.length)]; }

    function recoupement() {
      var l = noeuds(); if (!l.length) return;
      var a = hasard(l), voisins = l.filter(function (n) { var di = Math.abs(n.i - a.i), dj = Math.abs(n.j - a.j); return (di || dj) && di <= 2 && dj <= 2; })
        .sort(function () { return Math.random() - .5; }).slice(0, 2 + Math.floor(Math.random() * 2));
      voisins.forEach(function (b, k) {
        var ln = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': 'trait' }), len = Math.hypot(b.x - a.x, b.y - a.y);
        ln.style.strokeDasharray = len; ln.style.strokeDashoffset = len;
        setTimeout(function () { ln.style.strokeDashoffset = 0; }, 60 + k * 260);
        var nb = el('circle', { cx: b.x, cy: b.y, r: 3.4, 'class': 'point' });
        setTimeout(function () { nb.classList.add('is-on'); }, 700 + k * 260);
        retirer(ln, 3200); retirer(nb, 3200);
      });
      var na = el('circle', { cx: a.x, cy: a.y, r: 4.2, 'class': 'point point--a is-on' }); retirer(na, 3200);
    }

    function niveaux() {
      var g = host.__trame; if (!g) return;
      var rows = Math.max(1, Math.min(g.rows, Math.floor((Math.min(g.h, host.clientHeight) - g.oy) / g.cell)));
      var i0 = Math.max(Math.ceil(g.cols * (g.w < 700 ? 0 : 0.5)), 0), cols = [];
      for (var i = i0; i < g.cols && cols.length < 3; i++) if (g.ox + (i + 1) * g.cell <= g.w) cols.push(i);
      cols.forEach(function (c, k) {
        var haut = Math.min(rows, k + 1);
        for (var n = 0; n < haut; n++) (function (n) {
          var r = el('rect', { x: g.ox + c * g.cell + 1, y: g.oy + (rows - 1 - n) * g.cell + 1, width: g.cell - 1, height: g.cell - 1, fill: 'url(#v5m-h)', 'class': 'palier' });
          setTimeout(function () { r.classList.add('is-on'); }, 250 + k * 700 + n * 260);
          retirer(r, 4600);
        })(n);
      });
    }

    function signal() {
      var l = noeuds(); if (!l.length) return;
      var a = hasard(l), g = host.__trame;
      el('circle', { cx: a.x, cy: a.y, r: 3.4, 'class': 'point point--a is-on' }).classList.add('ephemere');
      for (var k = 0; k < 3; k++) (function (k) {
        var o = el('circle', { cx: a.x, cy: a.y, r: g.cell * 0.9, 'class': 'onde' });
        o.style.animationDelay = (k * 0.55) + 's';
        setTimeout(function () { o.remove(); }, 3400 + k * 550);
      })(k);
      setTimeout(function () { [].forEach.call(svg.querySelectorAll('.ephemere'), function (e) { e.remove(); }); }, 3200);
    }

    var f = { recoupement: [recoupement, 1500], niveaux: [niveaux, 6200], signal: [signal, 2200] }[type]; if (!f) return;
    function tour() { if (!d.hidden) f[0](); }
    setTimeout(tour, 600); setInterval(tour, f[1]);
  }

  /* Balayage (à propos) : une ligne d'analyse traverse la trame de gauche à droite,
     avec sa coordonnée, et les nœuds de la trame s'allument à son passage. Les cases de veille restent réservées
     à l'accueil et à la page Veille. */
  function balayage(host) {
    if (reduit) return;
    var ligne = d.createElement('span'); ligne.className = 'v5-balayage'; ligne.setAttribute('aria-hidden', 'true'); ligne.innerHTML = '<i></i>';
    host.insertBefore(ligne, host.firstChild.nextSibling);
    var DUREE = 7200, PAUSE = 2400, t0 = null, derniere = -1;
    function allumer(col) {
      var g = host.__trame, svg = host.querySelector('.v5-trame'); if (!g || !svg) return;
      var cx = String(g.ox + col * g.cell + .5);
      [].forEach.call(svg.querySelectorAll('circle.n'), function (c) {
        if (c.getAttribute('cx') !== cx) return;
        c.classList.add('is-on'); setTimeout(function () { c.classList.remove('is-on'); }, 1100);
      });
    }
    function pas(t) {
      var g = host.__trame;
      if (g && !d.hidden) {
        if (t0 === null) t0 = t;
        var p = ((t - t0) % (DUREE + PAUSE)) / DUREE;
        if (p > 1) { ligne.style.opacity = 0; derniere = -1; }
        else {
          var x = g.ox + (g.w - g.ox) * p;
          ligne.style.opacity = 1;
          ligne.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
          ligne.style.top = (g.oy - 20) + 'px'; ligne.style.height = (Math.min(g.h, host.clientHeight) - g.oy + 20) + 'px';
          ligne.firstChild.textContent = 'x ' + String(Math.round(x)).padStart(4, '0');
          var col = Math.round((x - g.ox) / g.cell);
          if (col !== derniere) { derniere = col; allumer(col); }
        }
      }
      requestAnimationFrame(pas);
    }
    requestAnimationFrame(pas);
  }

  /* Cases vivantes : la case sous le pointeur s'éclaire, et des images de la veille s'ouvrent
     dans les cases libres (jamais sous le texte). Clic : ouvre la veille. */
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function cases(host) {
    var calque = d.createElement('div'); calque.className = 'v5-cases'; calque.setAttribute('aria-hidden', 'false');
    host.insertBefore(calque, host.firstChild.nextSibling);
    var survol = d.createElement('span'); survol.className = 'v5-survol'; calque.appendChild(survol);
    var fin = matchMedia('(hover: hover) and (pointer: fine)').matches;

    function caseSous(x, y) {
      var g = host.__trame; if (!g) return null;
      var i = Math.floor((x - g.ox) / g.cell), j = Math.floor((y - g.oy) / g.cell);
      if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return null;
      return [i, j];
    }
    if (fin) {
      host.addEventListener('pointermove', function (e) {
        var r = host.getBoundingClientRect(), c = caseSous(e.clientX - r.left, e.clientY - r.top), g = host.__trame;
        if (!c) { survol.classList.remove('is-on'); return; }
        survol.style.cssText = 'left:' + (g.ox + c[0] * g.cell) + 'px;top:' + (g.oy + c[1] * g.cell) + 'px;width:' + g.cell + 'px;height:' + g.cell + 'px';
        survol.classList.add('is-on');
      });
      host.addEventListener('pointerleave', function () { survol.classList.remove('is-on'); });
    }

    if (!host.hasAttribute('data-trame-veille')) return;
    var items = [], vivantes = [], minuteur = null, visible = true;
    function libres() {
      var g = host.__trame; if (!g) return [];
      var hr = host.getBoundingClientRect(), bloque = [];
      /* On bloque le contenu réel (lignes de texte, boutons, médias), pas les boîtes pleine largeur */
      var ajoute = function (r) { if (r.width && r.height) bloque.push([r.left - hr.left - 12, r.top - hr.top - 12, r.right - hr.left + 12, r.bottom - hr.top + 12]); };
      [].forEach.call(host.children, function (el) {
        if (el === calque || el.classList.contains('v5-trame') || el.hasAttribute('data-trame-libre')) return;
        if (/^(CANVAS|IMG|VIDEO|FIGURE|UL|OL|DL|FORM)$/.test(el.tagName)) { ajoute(el.getBoundingClientRect()); return; }
        var rg = d.createRange(); rg.selectNodeContents(el);
        [].forEach.call(rg.getClientRects(), ajoute);
        [].forEach.call(el.querySelectorAll('a, button, input, img, canvas, video'), function (x) { ajoute(x.getBoundingClientRect()); });
      });
      /* La barre de navigation (collante) et le bandeau passent au-dessus des premières cases */
      ['nav', 'annonce'].forEach(function (id) { var el = d.getElementById(id); if (el && !el.hidden) { var r = el.getBoundingClientRect(); bloque.push([-1e4, r.top - hr.top - 12, 1e4, r.bottom - hr.top + 12]); } });
      [].forEach.call(host.querySelectorAll('[data-trame-bloque]'), function (el) {
        var r = el.getBoundingClientRect(); bloque.push([r.left - hr.left - 12, r.top - hr.top - 12, r.right - hr.left + 12, r.bottom - hr.top + 12]);
      });
      var out = [];
      for (var i = 0; i < g.cols; i++) for (var j = 0; j < g.rows; j++) {
        var x0 = g.ox + i * g.cell, y0 = g.oy + j * g.cell, x1 = x0 + g.cell, y1 = y0 + g.cell;
        if (x1 > g.w - 4 || y1 > g.h - 4) continue;
        var ok = !bloque.some(function (b) { return x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]; })
          && !vivantes.some(function (v) { return v.i === i && v.j === j; });
        if (ok) out.push([i, j]);
      }
      /* Écarte les cases voisines d'une image déjà ouverte, pour garder de l'air */
      var aere = out.filter(function (c) { return !vivantes.some(function (v) { return Math.abs(v.i - c[0]) <= 1 && Math.abs(v.j - c[1]) <= 1; }); });
      return aere.length ? aere : out;
    }
    function date(dt) { var p = String(dt || '').split('-'); return p.length === 3 ? (+p[2]) + ' ' + MOIS[+p[1] - 1] : ''; }
    function ouvrir() {
      if (!visible || d.hidden || !items.length) return;
      var l = libres(); if (!l.length) return;
      /* Note tirée au hasard parmi celles qui ne sont pas déjà affichées */
      var dispo = items.filter(function (x) { return !vivantes.some(function (v) { return v.it === x; }); });
      if (!dispo.length) return;
      var c = l[Math.floor(Math.random() * l.length)], g = host.__trame, it = dispo[Math.floor(Math.random() * dispo.length)];
      var a = d.createElement('a');
      a.className = 'v5-case' + (it.image ? '' : ' v5-case--lieu');
      a.href = '/veille/?onglet=geo';
      a.style.cssText = 'left:' + (g.ox + c[0] * g.cell + 1) + 'px;top:' + (g.oy + c[1] * g.cell + 1) + 'px;width:' + (g.cell - 1) + 'px;height:' + (g.cell - 1) + 'px';
      a.innerHTML = (it.image ? '<img src="' + esc(it.image) + '" alt="" referrerpolicy="no-referrer" loading="eager">' : '<b>' + esc(it.lieu || it.theatre || '') + '</b>') +
        '<span class="v5-case__t"><i>' + esc(date(it.date)) + (it.lieu && it.image ? ' · ' + esc(it.lieu) : '') + '</i><em>' + esc(fr(it.titre)) + '</em></span>';
      a.setAttribute('aria-label', 'Note de veille : ' + (it.titre || ''));
      var img = a.querySelector('img'); if (img) img.onerror = function () { a.remove(); };
      calque.appendChild(a);
      var v = { i: c[0], j: c[1], el: a, it: it }; vivantes.push(v);
      host.dispatchEvent(new CustomEvent('v5:case', { detail: { el: a, it: it } }));
      requestAnimationFrame(function () { requestAnimationFrame(function () { a.classList.add('is-in'); }); });
      setTimeout(function () {
        if (a.matches(':hover')) { a.addEventListener('pointerleave', function () { fermer(v); }, { once: true }); return; }
        fermer(v);
      }, reduit ? 20000 : 6000 + Math.random() * 4000);
    }
    function fermer(v) {
      v.el.classList.remove('is-in'); v.el.classList.add('is-out');
      host.dispatchEvent(new CustomEvent('v5:case-fin', { detail: { el: v.el } }));
      setTimeout(function () { v.el.remove(); vivantes = vivantes.filter(function (x) { return x !== v; }); }, 700);
    }
    function lancer(data) {
      /* Les notes de la semaine (7 jours avant la plus récente, 14 si la semaine est maigre) */
      var toutes = (data || []).filter(function (it) { return it && it.titre && it.date; });
      if (!toutes.length) return;
      var der = toutes.reduce(function (m, it) { return it.date > m ? it.date : m; }, '');
      var jours = function (n) { var t = new Date(der + 'T00:00:00'); t.setDate(t.getDate() - n); return t.toISOString().slice(0, 10); };
      items = toutes.filter(function (it) { return it.date >= jours(7); });
      if (items.length < 8) items = toutes.filter(function (it) { return it.date >= jours(14); });
      if (!items.length) return;
      var petit = host.clientWidth < 700, max = petit ? 3 : 7;
      var n = reduit ? 2 : (petit ? 2 : 4); for (var q = 0; q < n; q++) setTimeout(ouvrir, 400 + q * 450);
      if (!reduit) minuteur = setInterval(function () { if (vivantes.length < max) ouvrir(); }, 1400);
    }
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(host);
    if (window.V5.veille) lancer(window.V5.veille); else d.addEventListener('v5:veille', function (e) { lancer(e.detail); });
  }
  window.V5.trame = trame;

  /* Cloche de veille (reprise du système de l'accueil React, retiré par la refonte v5 du 22/09) :
     case du header + pastille des notes non lues (propre au navigateur, clé algor-veille-seen)
     + panneau des dernières notes. Titres publics uniquement, jamais l'analyse. */
  var FEED = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co/functions/v1/veille-feed/notifications.json';
  var SEV = { info: ['Signal', '#8C8D93'], alerte: ['Alerte', '#C28A2E'], critique: ['Critique', '#B4323F'] };
  var TH = { sahel: 'Sahel', 'moyen-orient': 'Moyen-Orient', rdc: 'RDC', afrique: 'Afrique Maritime', 'afrique-maritime': 'Afrique Maritime', madagascar: 'Madagascar', 'asie-sud': 'Asie du Sud' };
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  /* Veille personnalisée (23/09/2026) : critères du compte (table veille_preferences,
     RLS chacun sa ligne) appliqués au fil de la cloche. Logique pure, réutilisée par
     /compte/veille/ pour l'aperçu. Théâtres = périmètre ; mots-clés, s'il y en a,
     doivent apparaître dans le titre, le résumé ou le lieu ; gravité minimale. */
  var RANG = { info: 0, alerte: 1, critique: 2 };
  var sansAccent = function (s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); };
  var MaVeille = {
    correspond: function (it, p) {
      if (!p) return true;
      if (p.theatres && p.theatres.length && p.theatres.indexOf(it.theatre) < 0) return false;
      if ((RANG[it.severite] || 0) < (RANG[p.severite_min] || 0)) return false;
      if (p.mots && p.mots.length) {
        var txt = ' ' + sansAccent([it.titre, it.resume, it.lieu].join(' ')).replace(/[^a-z0-9]+/g, ' ') + ' ';
        return p.mots.some(function (m) { var k = sansAccent(m).replace(/[^a-z0-9]+/g, ' ').trim(); return k && txt.indexOf(' ' + k) >= 0; });
      }
      return true;
    },
    resume: function (p) {
      if (!p) return 'OSINT · six théâtres';
      var t = (p.theatres || []).map(function (x) { return TH[x] || x; });
      var bouts = [t.length ? t.join(', ') : 'six théâtres'];
      if (p.mots && p.mots.length) bouts.push(p.mots.length + ' mot' + (p.mots.length > 1 ? 's' : '') + '-clé' + (p.mots.length > 1 ? 's' : ''));
      return bouts.join(' · ');
    },
    /* Points de la synthèse Radio Sahel (bucket privé, premium) en éléments de cloche :
       gravité « alerte » si un fait de sécurité les fonde, sinon « info ». */
    radio: function (d) {
      var sy = d && d.synthese, cat = {};
      ((d && d.bulletins) || []).forEach(function (b) { (b.faits || []).forEach(function (f) { cat[f.id] = f.categorie; }); });
      return ((sy && sy.points) || []).map(function (pt) {
        return { id: 'radio-' + (pt.faits || []).join('-'), theatre: 'sahel', date: String(sy.date || ''), titre: pt.texte, resume: '', lieu: '',
          severite: (pt.faits || []).some(function (id) { return cat[id] === 'securite'; }) ? 'alerte' : 'info', source: 'radio' };
      });
    }
  };
  window.V5.maVeille = MaVeille;

  /* Session, préférences et plan du compte, si site-auth.js est présent sur la page. */
  function compteVeille() {
    return new Promise(function (ok) {
      var essais = 0;
      (function attendre() {
        var c = window.algorAuth && window.algorAuth.supabase;
        if (!c) { if (++essais < 32) return setTimeout(attendre, 250); return ok(null); }
        c.auth.getSession().then(function (r) {
          var u = r && r.data && r.data.session && r.data.session.user;
          if (!u) return ok(null);
          Promise.all([
            c.from('veille_preferences').select('theatres, mots, severite_min, sources').eq('user_id', u.id).maybeSingle(),
            c.from('profiles').select('role, plan').eq('id', u.id).maybeSingle()
          ]).then(function (res) {
            var pr = res[1] && res[1].data;
            ok({ client: c, session: r.data.session, prefs: (res[0] && res[0].data) || null,
              premium: !!pr && (pr.plan === 'premium' || pr.role === 'admin' || pr.role === 'editor') });
          }, function () { ok(null); });
        }, function () { ok(null); });
      })();
    });
  }
  window.V5.compteVeille = compteVeille;

  function cloche() {
    var sq = d.querySelector('.nav .sq');
    if (!sq || sq.querySelector('.sq__cloche')) return;
    var lire = function () { try { return localStorage.getItem('algor-veille-seen') || ''; } catch (e) { return ''; } };
    var btn = d.createElement('button');
    btn.type = 'button'; btn.className = 'sq__cloche'; btn.setAttribute('aria-label', 'Fil de veille');
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'cloche-panneau');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span class="sq__pastille" hidden></span>';
    var rech = d.getElementById('ouvrir-recherche');
    sq.insertBefore(btn, rech && rech.parentNode === sq ? rech : null);
    var pan = d.createElement('aside');
    pan.id = 'cloche-panneau'; pan.className = 'cloche'; pan.setAttribute('aria-label', 'Fil de veille'); pan.hidden = true;
    pan.innerHTML = '<div class="cloche__tete"><span>Fil de veille</span><span class="cloche__s">OSINT · six théâtres</span></div><ol class="cloche__liste" data-lenis-prevent><li class="cloche__vide">Chargement…</li></ol><a class="cloche__pied" href="/veille/?onglet=geo">Toute la veille <span aria-hidden="true">→</span></a>';
    d.body.appendChild(pan);
    var items = [], pastille = btn.querySelector('.sq__pastille');
    var compter = function () {
      var vu = lire(), n = items.filter(function (it) { return String(it.date || '') > vu; }).length;
      pastille.hidden = !n; pastille.textContent = n > 9 ? '9+' : String(n);
      btn.setAttribute('aria-label', n ? 'Fil de veille, ' + n + ' note' + (n > 1 ? 's' : '') + ' non lue' + (n > 1 ? 's' : '') : 'Fil de veille');
    };
    var date = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? (+m[3]) + ' ' + MOIS[+m[2] - 1] : ''; };
    var remplir = function () {
      var vu = lire(), ol = pan.querySelector('.cloche__liste');
      if (!items.length) { ol.innerHTML = '<li class="cloche__vide">' + (prefs ? 'Aucune note ne correspond à votre veille pour le moment.' : 'Aucune note pour le moment.') + '</li>'; return; }
      ol.innerHTML = items.slice(0, 12).map(function (it) {
        var sv = SEV[it.severite] || SEV.info, neuf = String(it.date || '') > vu;
        var lien = it.source === 'radio' ? '/veille/?onglet=radio' : '/veille/?onglet=geo';
        return '<li><a href="' + lien + '"' + (neuf ? ' class="is-neuf"' : '') + '><span class="cloche__meta"><i style="background:' + sv[1] + '" title="' + sv[0] + '"></i>' +
          esc(TH[it.theatre] || it.theatre || '') + (it.source === 'radio' ? ' · Radio' : '') + ' · ' + esc(date(it.date)) + (neuf ? '<b>Nouveau</b>' : '') + '</span><span class="cloche__t">' + esc(fr(it.titre)) + '</span></a></li>';
      }).join('');
    };
    var ouvert = false;
    var basculer = function (o) {
      ouvert = o; pan.hidden = !o; btn.setAttribute('aria-expanded', String(o)); btn.classList.toggle('is-on', o);
      if (o) {
        remplir();
        var latest = items.reduce(function (m, it) { return String(it.date || '') > m ? String(it.date) : m; }, '');
        if (latest) { try { localStorage.setItem('algor-veille-seen', latest); } catch (e) {} }
        pastille.hidden = true;
      } else compter();
    };
    btn.addEventListener('click', function (e) { e.stopPropagation(); basculer(!ouvert); });
    d.addEventListener('click', function (e) { if (ouvert && !pan.contains(e.target)) basculer(false); });
    d.addEventListener('keydown', function (e) { if (ouvert && e.key === 'Escape') { basculer(false); btn.focus(); } });
    var brut = [], radio = [], prefs = null, connecte = false;
    var appliquer = function () {
      items = brut.concat(radio).filter(function (it) { return it && it.titre && MaVeille.correspond(it, prefs); })
        .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      pan.querySelector('.cloche__tete span').textContent = prefs ? 'Ma veille' : 'Fil de veille';
      pan.querySelector('.cloche__s').textContent = MaVeille.resume(prefs);
      var perso = pan.querySelector('.cloche__perso');
      if (connecte && !perso) {
        perso = d.createElement('a'); perso.className = 'cloche__perso'; perso.href = '/compte/veille/';
        pan.appendChild(perso);
      }
      if (perso) perso.textContent = prefs ? 'Modifier ma veille' : 'Personnaliser ma veille';
      compter(); if (ouvert) remplir();
    };
    var charger = function (liste) { brut = liste || []; appliquer(); };
    compteVeille().then(function (cpt) {
      if (!cpt) return;
      connecte = true; prefs = cpt.prefs; appliquer();
      if (!cpt.premium || !prefs || (prefs.sources || []).indexOf('radio') < 0) return;
      // Radio Sahel : bucket privé lu avec la session du compte (la RLS refuse sans premium).
      cpt.client.storage.from('zones').download('sahel/radio.json')
        .then(function (r) { if (r.error || !r.data) throw r.error; return r.data.text(); })
        .then(function (t) { radio = MaVeille.radio(JSON.parse(t)); appliquer(); })
        .catch(function () {});
    });
    if (window.V5.veille) charger(window.V5.veille);
    else if (d.getElementById('annonce')) d.addEventListener('v5:veille', function (e) { charger(e.detail); });
    else fetch(FEED, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) { charger(Array.isArray(data) ? data : data.items); })
      .catch(function () { charger([]); });
  }

  function init() {
    typo(d.body);
    [].forEach.call(d.querySelectorAll('[data-v5-trame]'), trame);

    cloche();

    /* Navigation : claire au-dessus du papier, s'efface quand on lit, revient quand on remonte */
    var nav = d.getElementById('nav');
    if (nav) {
      var zones = [].slice.call(d.querySelectorAll('[data-nav]'));
      var dernierY = scrollY, attente = false;
      var teinte = function () {
        var y = nav.getBoundingClientRect().bottom - 30, clair = true;
        for (var k = 0; k < zones.length; k++) {
          if (zones[k].hasAttribute('data-nav-skip')) continue;
          var r = zones[k].getBoundingClientRect();
          if (r.top <= y && r.bottom > y) { clair = zones[k].getAttribute('data-nav') !== 'dark'; break; }
        }
        nav.classList.toggle('is-light', clair);
      };
      var image = function () {
        attente = false;
        var y = scrollY, h = innerHeight;
        var desc = y > dernierY + 4, monte = y < dernierY - 4;
        if (y > h * .9 && desc && !d.querySelector('.veil.is-open')) nav.classList.add('is-hidden');
        else if (monte || y < h * .5) nav.classList.remove('is-hidden');
        dernierY = y;
        teinte();
      };
      addEventListener('scroll', function () { if (!attente) { attente = true; requestAnimationFrame(image); } }, { passive: true });
      addEventListener('resize', teinte);
      nav.addEventListener('focusin', function () { nav.classList.remove('is-hidden'); });
      window.V5.teinte = teinte;
      image();
    }

    /* Flèche de défilement : descend à la section qui suit l'ouverture */
    [].forEach.call(d.querySelectorAll('.v5-defiler'), function (a) {
      a.addEventListener('click', function (e) {
        var sec = a.closest('section'), suite = sec && sec.nextElementSibling;
        if (!suite) return; e.preventDefault();
        scrollTo({ top: suite.getBoundingClientRect().top + scrollY - 8, behavior: reduit ? 'auto' : 'smooth' });
      });
    });

    /* Sections épinglées : l'étape au centre de l'écran allume sa couche (mode « empile » : les couches
       précédentes restent, mode « remplace » : une seule couche visible) et sa puce de légende */
    [].forEach.call(d.querySelectorAll('[data-v5-scene]'), function (sc) {
      var mode = sc.getAttribute('data-v5-scene'), etapes = [].slice.call(sc.querySelectorAll('[data-etape]'));
      var couches = [].slice.call(sc.querySelectorAll('[data-couche]')), puces = [].slice.call(sc.querySelectorAll('[data-puce]'));
      var actif = -1, attente = false;
      function maj() {
        attente = false;
        var ligne = innerHeight * 0.55, i = 0;
        etapes.forEach(function (e, k) { if (e.getBoundingClientRect().top < ligne) i = k; });
        if (i === actif) return; actif = i;
        var on = function (n) { return mode === 'empile' ? n <= i : n === i; };
        etapes.forEach(function (e, k) { e.classList.toggle('is-on', k === i); });
        couches.forEach(function (c) { c.classList.toggle('is-on', on(+c.getAttribute('data-couche'))); });
        puces.forEach(function (p) { p.classList.toggle('is-on', on(+p.getAttribute('data-puce'))); });
      }
      addEventListener('scroll', function () { if (!attente) { attente = true; requestAnimationFrame(maj); } }, { passive: true });
      addEventListener('resize', maj); maj();
    });

    /* Menu et recherche plein écran */
    var ouvert = null, retour = null;
    var ouvrir = function (id, from) {
      ouvert = d.getElementById(id); if (!ouvert) return;
      retour = from; ouvert.classList.add('is-open'); d.body.style.overflow = 'hidden';
      setTimeout(function () { var f = ouvert.querySelector('input') || ouvert.querySelector('a, button'); if (f) f.focus(); }, 60);
    };
    var fermer = function () { if (!ouvert) return; ouvert.classList.remove('is-open'); d.body.style.overflow = ''; ouvert = null; if (retour) retour.focus(); };
    var bm = d.getElementById('ouvrir-menu'), br = d.getElementById('ouvrir-recherche');
    if (bm) bm.addEventListener('click', function (e) { ouvrir('menu', e.currentTarget); });
    if (br) br.addEventListener('click', function (e) { ouvrir('recherche', e.currentTarget); });
    [].forEach.call(d.querySelectorAll('[data-fermer]'), function (b) { b.addEventListener('click', fermer); });
    addEventListener('keydown', function (e) {
      if (e.key === 'Escape') fermer();
      if (e.key === 'Tab' && ouvert) {
        var f = [].slice.call(ouvert.querySelectorAll('a, button, input, select, textarea')).filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && d.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && d.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });

    /* Vidéos de capture : lecture seulement à l'écran */
    if ('IntersectionObserver' in window && !reduit) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { var v = en.target; if (en.isIntersecting) { v.preload = 'auto'; v.play().catch(function () {}); } else v.pause(); });
      }, { threshold: .35 });
      [].forEach.call(d.querySelectorAll('video[data-v5-play]'), function (v) { io.observe(v); });
    }

    /* Sommaire latéral : section en cours */
    var som = d.querySelector('.v5-aside__nav');
    if (som && 'IntersectionObserver' in window) {
      var liens = [].slice.call(som.querySelectorAll('a[href^="#"]'));
      var cibles = liens.map(function (a) { return d.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); }).filter(Boolean);
      var so = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          if (!en.isIntersecting) return;
          liens.forEach(function (a) { a.classList.toggle('is-on', a.getAttribute('href') === '#' + en.target.id); });
        });
      }, { rootMargin: '-20% 0px -70% 0px' });
      cibles.forEach(function (c) { so.observe(c); });
    }

    /* Fil de veille public (titres seulement, jamais l'analyse) : alimente les cases de la trame */
    var an = d.getElementById('annonce');
    if (an) {
      fetch('https://lwgrjdpuagnvvzmdbyzb.supabase.co/functions/v1/veille-feed/notifications.json', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (data) {
          var items = (Array.isArray(data) ? data : data.items || []).filter(function (it) { return it && it.titre; })
            .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
          window.V5.veille = items;
          d.dispatchEvent(new CustomEvent('v5:veille', { detail: items }));
          /* Bandeau retiré le 22/09 (le menu remonte en haut de page) : le fil reste chargé pour les cases de veille.
             Pour le remettre, reprendre l'affichage de #annonce ici (titre items[0], croix de fermeture, --annonce-h). */
        })
        .catch(function () { d.dispatchEvent(new CustomEvent('v5:veille', { detail: null })); });
    }
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
