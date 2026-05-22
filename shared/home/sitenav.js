/* sitenav.js — menu burger mobile pour les pages rubriques (header statique).
   Injecte le bouton burger et gère l'ouverture/fermeture du menu. */
(function () {
  var header = document.querySelector('.site-header');
  if (!header) return;
  var inner = header.querySelector('.site-header__inner');
  if (!inner) return;

  var burger = document.createElement('button');
  burger.className = 'site-burger';
  burger.setAttribute('aria-label', 'Menu');
  burger.setAttribute('aria-expanded', 'false');
  burger.innerHTML = '<span></span><span></span><span></span>';
  inner.appendChild(burger);

  function setOpen(open) {
    header.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  burger.addEventListener('click', function () {
    setOpen(!header.classList.contains('is-open'));
  });

  // Fermer le menu quand on clique un lien
  header.querySelectorAll('.site-nav a').forEach(function (a) {
    a.addEventListener('click', function () { setOpen(false); });
  });

  // Refermer si on repasse en vue large
  window.addEventListener('resize', function () {
    if (window.innerWidth > 1080) setOpen(false);
  });
})();
