/*
 * Mise en page anti-chevauchement de /carte/.
 *
 * Les panneaux (#analysis, #news, #timeline) et les contrôles Mapbox étaient
 * posés en pixels fixes : sur une fenêtre de ~1000 px, la barre de jetons passait
 * sous « Nouveauté cette semaine », l'analyse recouvrait le curseur temporel et
 * le sélecteur FR / EN recouvrait le zoom. Ce module mesure les éléments RÉELS
 * et les place les uns par rapport aux autres, à chaque changement de taille,
 * d'affichage ou de contenu. Additif : humint-engine.js n'est pas modifié.
 */
(function () {
  'use strict';
  var GAP = 8, EDGE = 18, MOBILE = 680;
  var $ = function (id) { return document.getElementById(id); };
  var queued = false, observers = [];

  // N'écrit que si la valeur change : sinon le MutationObserver reboucle.
  function set(el, prop, val) { if (el && el.style[prop] !== val) el.style[prop] = val; }
  function shown(el) { return !!el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none'; }

  function layout() {
    queued = false;
    var hdr = $('header'), bar = $('chipbar'), ana = $('analysis'), news = $('news'), tl = $('timeline');
    if (!hdr) return;
    var W = window.innerWidth, H = window.innerHeight, mobile = W <= MOBILE;
    var anaOn = shown(ana), newsOn = shown(news), tlOn = shown(tl);
    var lang = document.querySelector('.lang-toggle--float');
    var langH = lang ? lang.offsetHeight + 14 : 0;
    var ctrl = document.querySelector('.mapboxgl-ctrl-bottom-right');

    // ── 1. Barre de jetons : « Nouveauté » reste dans la rangée du haut si les
    //    jetons tiennent sur une ligne à côté ; sinon il descend sous la barre.
    var newsInRow = false;
    if (!mobile && newsOn) {
      set(hdr, 'paddingRight', (news.offsetWidth + EDGE + 14) + 'px');
      var chip = bar && bar.firstElementChild;
      newsInRow = !chip || bar.offsetHeight <= chip.offsetHeight + 6;
    }
    if (!newsInRow) set(hdr, 'paddingRight', mobile ? '' : EDGE + 'px');
    var top = hdr.offsetHeight + GAP;

    // ── 2. Curseur temporel (bas) : centré s'il a la place, sinon décalé à
    //    droite du panneau d'analyse, jamais sous FR / EN ni le zoom.
    var tlTop = H;
    if (tlOn) {
      if (mobile) {
        set(tl, 'left', '10px'); set(tl, 'right', '10px'); set(tl, 'transform', 'none');
        set(tl, 'width', 'auto'); set(tl, 'maxWidth', 'none'); set(tl, 'marginInline', '0');
        set(tl, 'bottom', (langH + GAP) + 'px');
      } else {
        var minL = anaOn ? ana.getBoundingClientRect().right + 14 : EDGE;
        var maxR = W - 132; // FR / EN + zoom
        set(tl, 'bottom', '20px'); set(tl, 'maxWidth', 'none');
        // Largeur naturelle mesurée hors contrainte (sinon bascule centré/décalé en boucle).
        tl.style.left = '0'; tl.style.right = 'auto'; tl.style.transform = 'none'; tl.style.width = 'max-content';
        var natural = tl.offsetWidth;
        var centred = (W - natural) / 2;
        if (centred >= minL && centred + natural <= maxR) {
          set(tl, 'left', '50%'); set(tl, 'right', 'auto'); set(tl, 'transform', 'translateX(-50%)');
          set(tl, 'width', 'auto'); set(tl, 'marginInline', '0');
        } else {
          // Largeur explicite : le slider (flex-shrink) se resserre, le libellé garde sa place.
          var avail = Math.max(0, maxR - minL), w = Math.min(natural, avail);
          set(tl, 'left', Math.round(minL + (avail - w) / 2) + 'px'); set(tl, 'right', 'auto'); set(tl, 'transform', 'none');
          set(tl, 'width', Math.round(w) + 'px'); set(tl, 'marginInline', '0');
        }
      }
      tlTop = tl.getBoundingClientRect().top;
    }

    // ── 3. Contrôles Mapbox bas-droite : au-dessus de FR / EN (et du curseur en mobile).
    if (ctrl) {
      var cb = mobile && tlOn ? (H - tlTop + GAP) : langH + 4;
      set(ctrl, 'bottom', Math.max(0, cb - 10) + 'px'); // le contrôle a déjà 10 px de marge
    }
    var ctrlTop = ctrl ? ctrl.getBoundingClientRect().top : H - langH;

    // ── 4. Panneau d'analyse (gauche) : sous la barre, au-dessus du logo Mapbox
    //    (desktop) ou du curseur (mobile).
    if (anaOn) {
      var anaBottom = mobile ? (tlOn ? tlTop - GAP : H - langH - GAP) : H - 44;
      set(ana, 'top', top + 'px');
      set(ana, 'maxHeight', Math.max(48, Math.min(mobile ? H * 0.52 : 1e5, anaBottom - top)) + 'px');
    }

    // ── 5. Nouveauté (droite) : dans la rangée du haut ou sous la barre ; en
    //    mobile, sous le panneau d'analyse (même largeur d'écran).
    if (newsOn) {
      var nTop = newsInRow ? 10 : top;
      if (mobile && anaOn) nTop = ana.getBoundingClientRect().bottom + GAP;
      var nBottom = mobile ? (tlOn ? tlTop - GAP : H - langH - GAP) : ctrlTop - GAP;
      if (!mobile && tlOn && W - news.offsetWidth - EDGE < tl.getBoundingClientRect().right) nBottom = Math.min(nBottom, tlTop - GAP);
      set(news, 'top', nTop + 'px');
      set(news, 'maxHeight', Math.max(44, nBottom - nTop) + 'px');
    }
    // Nos propres écritures de style ne doivent pas relancer un calcul.
    observers.forEach(function (o) { o.takeRecords(); });
  }

  function schedule() { if (!queued) { queued = true; requestAnimationFrame(layout); } }

  function start() {
    var ro = window.ResizeObserver ? new ResizeObserver(schedule) : null;
    var mo = new MutationObserver(schedule);
    observers.push(mo);
    ['header', 'chipbar', 'analysis', 'news', 'timeline'].forEach(function (id) {
      var el = $(id); if (!el) return;
      if (ro) ro.observe(el);
      mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'], childList: true });
    });
    // Contrôles Mapbox et pastille FR / EN arrivent après coup.
    var bo = new MutationObserver(schedule); observers.push(bo);
    bo.observe(document.body, { childList: true });
    var map = $('map'); if (map) bo.observe(map, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
