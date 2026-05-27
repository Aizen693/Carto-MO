/* sitenav.js — menu burger mobile + prefetch des rubriques au survol.
   - Injecte le bouton burger et gère l'ouverture/fermeture du menu.
   - Pre-charge les pages internes au survol/touch pour une nav quasi-instantanee
     (le browser met la page en cache HTTP avant le clic). */

// Nav cote client : Safari-compatible (zero rechargement entre rubriques).
//   1) Au load, fetch() de toutes les rubriques -> HTML en cache JS.
//   2) Au clic sur un lien interne, on intercepte : fetch -> parse -> swap <main>
//      -> update history. Le header/footer ne bougent pas du DOM.
//   3) View Transitions API si dispo (Chrome/Safari TP) pour cross-fade smooth.
(function () {
  if (!window.fetch || !window.history || !window.history.pushState || !window.DOMParser) return;

  var pageCache = new Map(); // path -> Promise<{ main, title, bodyScripts }>

  function fetchPage(target) {
    if (pageCache.has(target)) return pageCache.get(target);
    var p = fetch(target, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (html) {
        if (!html) return null;
        var doc = new DOMParser().parseFromString(html, 'text/html');
        return {
          main: doc.querySelector('main'),
          title: doc.title || document.title,
          bodyScripts: Array.from(doc.querySelectorAll('body > script')),
          // Styles specifiques de la nouvelle page (link + inline) — injectes en SPA
          headStyles: Array.from(doc.querySelectorAll('head style, head link[rel="stylesheet"]'))
        };
      })
      .catch(function () { return null; });
    pageCache.set(target, p);
    return p;
  }

  function eagerWarm() {
    var pages = ['/', '/methodologie/', '/theatres/', '/offres/', '/debunkage/', '/a-propos/', '/contact/'];
    pages.forEach(function (p) {
      if (p !== location.pathname) fetchPage(p);
    });
  }
  if (document.readyState === 'complete') {
    setTimeout(eagerWarm, 500);
  } else {
    window.addEventListener('load', function () { setTimeout(eagerWarm, 500); });
  }

  function shouldHandle(a, e) {
    if (e.defaultPrevented) return null;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return null;
    if (a.hasAttribute('download')) return null;
    if (a.target && a.target !== '_self') return null;
    var href = a.getAttribute('href');
    if (!href || href[0] === '#' || /^(mailto:|tel:|javascript:)/i.test(href)) return null;
    var url;
    try { url = new URL(href, location.href); } catch (_) { return null; }
    if (url.origin !== location.origin) return null;
    if (url.pathname === location.pathname && url.search === location.search) return null;
    return url;
  }

  function swap(url, isPop) {
    var target = url.pathname + url.search;
    fetchPage(target).then(function (data) {
      if (!data || !data.main) { location.href = url.href; return; }
      var oldMain = document.querySelector('main');
      if (!oldMain) { location.href = url.href; return; }

      function doSwap() {
        document.title = data.title;
        var newMain = data.main;
        document.adoptNode(newMain);
        oldMain.replaceWith(newMain);

        // Inject head styles specifiques de la nouvelle page si pas deja la
        (data.headStyles || []).forEach(function (s) {
          if (s.tagName === 'LINK') {
            var href = s.getAttribute('href');
            if (!href) return;
            try {
              var abs = new URL(href, url.href).href;
              if (document.querySelector('head link[rel="stylesheet"][href]')) {
                // dedupe : compare href absolu
                var existing = Array.from(document.querySelectorAll('head link[rel="stylesheet"]'))
                  .some(function (l) { return l.href === abs; });
                if (existing) return;
              }
              var nl = document.createElement('link');
              nl.rel = 'stylesheet'; nl.href = abs;
              nl.setAttribute('data-spa-injected', '1');
              document.head.appendChild(nl);
            } catch (_) {}
          } else if (s.tagName === 'STYLE') {
            var content = s.textContent || '';
            if (!content.trim()) return;
            // dedupe : empreinte simple (taille + 64 premiers chars)
            var key = 'k' + content.length + '_' + content.replace(/\s+/g, '').slice(0, 64);
            if (document.querySelector('head style[data-spa-key="' + CSS.escape(key) + '"]')) return;
            var ns = document.createElement('style');
            ns.setAttribute('data-spa-key', key);
            ns.setAttribute('data-spa-injected', '1');
            ns.textContent = content;
            document.head.appendChild(ns);
          }
        });

        // Re-execute body scripts (idempotent grace au cleanup dans chaque script)
        // EXCEPT sitenav lui-meme — il tourne deja.
        data.bodyScripts.forEach(function (s) {
          var src = s.getAttribute('src') || '';
          if (src.indexOf('sitenav.js') !== -1) return;
          var ns = document.createElement('script');
          // Maintenir l'ordre d'exec : externes en async=false pour qu'un script
          // qui depend du precedent (ex: code inline depend de mapbox-gl.js) marche.
          ns.async = false;
          if (s.src) {
            ns.src = new URL(s.getAttribute('src'), url.href).href;
          } else if (s.textContent && s.textContent.trim()) {
            ns.textContent = s.textContent;
          } else {
            return;
          }
          for (var i = 0; i < s.attributes.length; i++) {
            var attr = s.attributes[i];
            if (attr.name !== 'src') ns.setAttribute(attr.name, attr.value);
          }
          document.body.appendChild(ns);
        });

        if (!isPop) window.scrollTo(0, 0);
        document.dispatchEvent(new CustomEvent('pagenav', { detail: { path: target } }));
      }

      if (!isPop) history.pushState({}, '', url.pathname + url.search + url.hash);

      if (document.startViewTransition) {
        document.startViewTransition(doSwap);
      } else {
        doSwap();
      }
    });
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var url = shouldHandle(a, e);
    if (!url) return;
    e.preventDefault();
    swap(url, false);
  });

  window.addEventListener('popstate', function () {
    swap(new URL(location.href), true);
  });

  // Prefetch au survol/mousedown — filet de secu pour les pages non encore warm.
  function onPointer(e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href[0] === '#') return;
    try {
      var u = new URL(href, location.href);
      if (u.origin === location.origin) fetchPage(u.pathname + u.search);
    } catch (_) {}
  }
  document.addEventListener('mouseover', onPointer, { capture: true });
  document.addEventListener('mousedown', onPointer, { capture: true });
  document.addEventListener('touchstart', onPointer, { capture: true, passive: true });
})();

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
