/* Carte d'ouverture : cadre les six théâtres à droite du titre (ou sur toute la largeur sur mobile)
   et affiche les coordonnées réelles sous le curseur. Requiert theatres/planisphere.js. */
(function () {
  var carte = document.querySelector('.v5-carte-fond'); if (!carte) return;
  var la = document.getElementById('lecture-lat'), lo = document.getElementById('lecture-lon');
  var R = Math.PI / 180;
  // Bord droit du texte d'ouverture (titre, chapeau, démo), mesuré sur les lignes réellement composées.
  function bordTexte() {
    var hero = carte.parentNode, x = 0;
    hero.querySelectorAll('h1:not(.hors-ecran), .v5-phero__lede, form').forEach(function (el) {
      var rg = document.createRange(); rg.selectNodeContents(el);
      [].forEach.call(rg.getClientRects(), function (r) { if (r.width) x = Math.max(x, r.right); });
    });
    return x - carte.getBoundingClientRect().left;
  }
  function cadrer() {
    var p = carte.__proj; if (!p) return requestAnimationFrame(cadrer);
    var w = carte.clientWidth, h = carte.clientHeight;
    var mobile = w < 820;
    // Les flux vont de l'Atlantique (-24°) au golfe du Bengale (92°) : on cale cette bande dans
    // l'espace libre à droite du texte (sur mobile, toute la largeur, sous le texte).
    var marge = parseFloat(getComputedStyle(carte.parentNode).paddingRight) || 32;
    var gauche = mobile ? marge : Math.min(bordTexte() + 32, w * 0.62), libre = w - marge - 64 - gauche; // 64 px : place de l’étiquette « Asie du Sud »
    // L'échelle couvre toujours la largeur (1,02 tour), pour qu'aucun bord du planisphère n'apparaisse.
    var k = mobile ? libre / (116 * R) : Math.min(Math.max(libre / (116 * R), 1.02 * w / (2 * Math.PI)), 1.8 * h / Math.PI);
    var droite = w - marge; // le golfe du Bengale (92°) et l'étiquette « Asie du Sud » (74°) restent dans le cadre
    var xc = Math.min(gauche + libre / 2, droite - 12 - 58 * R * k, droite - 92 - 40 * R * k), cy = h * (mobile ? 0.5 : 0.47) + k * 6 * R;
    p.scale(k).rotate([(xc - w / 2) / (k * R) - 34, 0, 0]).translate([w / 2, cy]);
    // Pôles hors cadre ou non : le masque efface le haut et le bas du planisphère en fondu.
    var nord = cy - k * 90 * R, sud = cy + k * 90 * R;
    carte.style.setProperty('--fondu-gauche', (mobile ? 0 : Math.max(0, gauche - 32)) + 'px');
    carte.style.setProperty('--fondu-haut', Math.max(0, nord) + 'px');
    carte.style.setProperty('--fondu-bas', Math.min(h, sud) + 'px');
  }
  cadrer();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { requestAnimationFrame(cadrer); });
  if (window.ResizeObserver) new ResizeObserver(function () { requestAnimationFrame(cadrer); }).observe(carte);
  else addEventListener('resize', function () { requestAnimationFrame(cadrer); });
  function fmt(v, pos, neg, pad) { var a = Math.abs(v).toFixed(2).replace('.', ','); while (a.split(',')[0].length < pad) a = '0' + a; return a + ' ' + (v >= 0 ? pos : neg); }
  if (la && lo) carte.addEventListener('pointermove', function (e) {
    var p = carte.__proj; if (!p) return;
    var r = carte.getBoundingClientRect(), g = p.invert([e.clientX - r.left, e.clientY - r.top]);
    if (!g || isNaN(g[0])) return;
    la.textContent = fmt(g[1], 'N', 'S', 2); lo.textContent = fmt(((g[0] + 540) % 360) - 180, 'E', 'O', 3);
  });
})();
