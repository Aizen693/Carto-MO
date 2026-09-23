/* i18n.js : bascule FR / EN de tout le site Algor Access (15/09/2026).
 *
 * Principe : le site est écrit en français. En anglais, ce script remplace à la volée
 * chaque texte visible (nœuds texte + placeholder, title, aria-label, alt, data-tip)
 * par sa traduction lue dans /shared/i18n/en.json, y compris ce que React ou les
 * scripts des pages ajoutent ensuite (MutationObserver). Les nombres sont gérés par
 * modèles : « 45 rapports » est cherché sous la clé « {0} rapports ».
 *
 * À charger tôt dans <head>, en script classique :
 *   <script src="/shared/i18n.js?v=20260915a"></script>
 * Le sélecteur FR | EN se monte dans tout élément .lang-slot (vide), sinon en pastille flottante.
 * Choix mémorisé dans localStorage « algor-lang » ; ?lang=en ou ?lang=fr dans l'URL le force.
 * Contenus non traduits volontairement : tout ce qui est sous [data-i18n-skip]
 * (notes d'analyse, extraits de sources, noms propres).
 *
 * API : window.AlgorI18n = { lang, t(texte), cle(texte), set(lang), manquants() }
 */
(function () {
  'use strict';
  var CLE_STOCKAGE = 'algor-lang';
  var VERSION_DICO = '20260923radio';
  var root = document.documentElement;

  var lang = null;
  try { lang = new URLSearchParams(location.search).get('lang'); } catch (e) {}
  if (lang === 'fr' || lang === 'en') { try { localStorage.setItem(CLE_STOCKAGE, lang); } catch (e) {} }
  else { try { lang = localStorage.getItem(CLE_STOCKAGE); } catch (e) { lang = null; } }
  if (lang !== 'en') lang = 'fr';
  root.lang = lang;
  root.setAttribute('data-lang', lang);

  var dico = null;
  var manquants = new Set();

  // Nombres : « 38 305 », « 7,8 », « 2026 », « 14:07 » → {0}, {1}…
  var RE_NOMBRE = /\d+(?:[   ]\d{3})*(?:,\d+)?/g;
  function cle(texte) {
    var nombres = [];
    var c = texte.replace(RE_NOMBRE, function (m) { nombres.push(m); return '{' + (nombres.length - 1) + '}'; });
    return { cle: c, nombres: nombres };
  }
  function nombreEn(n) {
    if (/[   ]/.test(n)) return n.replace(/[   ]/g, ',');
    return n.replace(',', '.');
  }
  function t(texte) {
    if (!dico || lang !== 'en' || texte == null) return texte;
    var s = String(texte);
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    var coeur = m[2].replace(/\s+/g, ' ');
    if (!coeur) return s;
    var trad = dico[coeur];
    if (trad == null && /\d/.test(coeur)) {
      var k = cle(coeur);
      var modele = dico[k.cle];
      if (modele != null) trad = modele.replace(/\{(\d+)\}/g, function (_, i) { return k.nombres[+i] != null ? nombreEn(k.nombres[+i]) : ''; });
    }
    if (trad == null) {
      if (/[A-Za-zÀ-ÿ]{3}/.test(coeur) && manquants.size < 3000) manquants.add(coeur);
      return s;
    }
    return m[1] + trad + m[3];
  }

  function setLang(l) {
    try { localStorage.setItem(CLE_STOCKAGE, l); } catch (e) {}
    try { var u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.href); }
    catch (e) { location.reload(); }
  }

  window.AlgorI18n = {
    lang: lang, t: t, cle: function (s) { return cle(String(s).replace(/\s+/g, ' ').trim()).cle; }, set: setLang,
    manquants: function () { return Array.from(manquants); }, pret: false,
  };

  /* ── Notes de veille géopolitique en anglais ──
     Le fil (edge function veille-feed) reste en français. En anglais, toute page qui le télécharge
     (accueil, Veilles, carte de veille) reçoit les notes fusionnées avec leur version anglaise,
     produite sur le VPS (vps/veille-cyber/traduire-notes.mjs). Le texte français reste dans champ_fr.
     Sans traduction disponible pour une note, elle s'affiche en français. */
  if (lang === 'en' && window.fetch && window.Response) {
    var fetchOrigine = window.fetch.bind(window);
    var NOTES_EN = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co/storage/v1/object/public/veille-public/veille-geo/notes-en.json';
    var notesEn = null;
    var chargerNotesEn = function () {
      if (!notesEn) {
        notesEn = fetchOrigine(NOTES_EN + '?h=' + Math.floor(Date.now() / 3.6e6), { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : {}; })
          .then(function (d) { return (d && d.notes) || {}; })
          .catch(function () { return {}; });
      }
      return notesEn;
    };
    window.fetch = function (entree, init) {
      var url = typeof entree === 'string' ? entree : (entree && entree.url) || String(entree || '');
      var promesse = fetchOrigine(entree, init);
      if (url.indexOf('veille-feed/notifications.json') === -1) return promesse;
      return Promise.all([promesse, chargerNotesEn()]).then(function (res) {
        var rep = res[0], trad = res[1];
        if (!rep.ok) return rep;
        return rep.clone().json().then(function (d) {
          var liste = Array.isArray(d) ? d : (d && d.items) || [];
          liste.forEach(function (it) {
            var e = it && trad[it.id];
            if (!e) return;
            Object.keys(e).forEach(function (k) { if (e[k] != null && e[k] !== '') { it[k + '_fr'] = it[k]; it[k] = e[k]; } });
          });
          return new Response(JSON.stringify(d), { status: rep.status, statusText: rep.statusText, headers: { 'Content-Type': 'application/json' } });
        }).catch(function () { return rep; });
      });
    };
  }

  /* ── Sélecteur FR | EN ── */
  var css = document.createElement('style');
  css.textContent =
    '.lang-toggle{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:999px;border:1px solid rgba(128,120,160,.38);background:rgba(20,16,36,.06);font:600 11px/1 "Host Grotesk","Plus Jakarta Sans",system-ui,sans-serif;letter-spacing:.04em;vertical-align:middle}' +
    'html[data-sky-dark] .lang-toggle,.lang-toggle--float{background:rgba(10,9,20,.72);border-color:rgba(255,255,255,.16)}' +
    '.lang-toggle button{border:0;background:transparent;color:inherit;opacity:.72;cursor:pointer;padding:5px 8px;border-radius:999px;font:inherit;letter-spacing:inherit}' +
    '.lang-toggle button:hover{opacity:1}' +
    '.lang-toggle button[aria-pressed="true"]{background:#6B3FA0 linear-gradient(130deg,#6B3FA0 0%,#5650C6 48%,#1E6FBE 100%);color:#fff;opacity:1}' +
    '.lang-toggle button:focus-visible{outline:2px solid #C8B0EA;outline-offset:1px}' +
    '.lang-toggle--float{position:fixed;right:14px;bottom:14px;z-index:2147483000;color:#F3EFFB;box-shadow:0 8px 24px -10px rgba(0,0,0,.6)}' +
    '.lang-slot{display:inline-flex;align-items:center}' +
    'html.i18n-attente body{visibility:hidden}';
  (document.head || root).appendChild(css);

  function toggle(flottant) {
    var el = document.createElement('div');
    el.className = 'lang-toggle' + (flottant ? ' lang-toggle--float' : '');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Langue / Language');
    el.setAttribute('data-i18n-skip', '');
    [['fr', 'FR', 'Français'], ['en', 'EN', 'English']].forEach(function (x) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = x[1]; b.title = x[2]; b.lang = x[0];
      b.setAttribute('aria-pressed', String(lang === x[0]));
      b.addEventListener('click', function () { if (lang !== x[0]) setLang(x[0]); });
      el.appendChild(b);
    });
    return el;
  }
  function monterSelecteurs() {
    var slots = document.querySelectorAll('.lang-slot');
    for (var i = 0; i < slots.length; i++) if (!slots[i].firstChild) slots[i].appendChild(toggle(false));
    var flottant = document.querySelector('.lang-toggle--float');
    var ancre = document.querySelector('.lang-slot .lang-toggle');
    if (ancre && flottant) flottant.remove();
    return !!ancre;
  }

  /* ── Traduction du DOM ── */
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-tip'];
  var REFUS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1 };
  function ignore(el) {
    if (!el || el.nodeType !== 1) return false;
    if (REFUS[el.tagName]) return true;
    return !!(el.closest && el.closest('[data-i18n-skip],[contenteditable="true"],.mapboxgl-ctrl-attrib'));
  }
  function traduireTexte(n) {
    var v = n.nodeValue;
    // Nombres seuls formatés à la française (« 17 042 ») : séparateur de milliers anglais (« 17,042 »)
    if (v && /^\s*\d{1,3}(?:[   ]\d{3})+\s*$/.test(v)) {
      if (!ignore(n.parentElement)) { var e = v.replace(/(\d)[   ](?=\d{3})/g, '$1,'); if (e !== v) n.nodeValue = e; }
      return;
    }
    if (!v || !/[A-Za-zÀ-ÿ]/.test(v) || ignore(n.parentElement)) return;
    var r = t(v);
    if (r !== v) n.nodeValue = r;
  }
  function traduireAttributs(el) {
    if (ignore(el)) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = el.getAttribute(ATTRS[i]);
      if (a && /[A-Za-zÀ-ÿ]/.test(a)) { var r = t(a); if (r !== a) el.setAttribute(ATTRS[i], r); }
    }
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value) { var v = t(el.value); if (v !== el.value) el.value = v; }
  }
  function traduireArbre(noeud) {
    if (!noeud) return;
    if (noeud.nodeType === 3) { traduireTexte(noeud); return; }
    if (noeud.nodeType !== 1 && noeud.nodeType !== 9 && noeud.nodeType !== 11) return;
    if (noeud.nodeType === 1) { if (ignore(noeud)) return; traduireAttributs(noeud); }
    var w = document.createTreeWalker(noeud, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (x) { return x.nodeType === 1 && (REFUS[x.tagName] || x.hasAttribute('data-i18n-skip')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; },
    });
    var x;
    while ((x = w.nextNode())) { if (x.nodeType === 3) traduireTexte(x); else traduireAttributs(x); }
  }
  function traduireTitre() { var tt = document.title, r = t(tt); if (r !== tt) document.title = r; }

  var enCours = false;
  var observateur = new MutationObserver(function (liste) {
    if (enCours) return;
    enCours = true;
    try {
      for (var i = 0; i < liste.length; i++) {
        var m = liste[i];
        if (m.type === 'characterData') traduireTexte(m.target);
        else if (m.type === 'attributes') traduireAttributs(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) traduireArbre(m.addedNodes[j]);
        if (m.target && m.target.nodeName === 'TITLE') traduireTitre();
      }
      monterSelecteurs();
    } finally { enCours = false; }
  });

  function reveler() { root.classList.remove('i18n-attente'); }

  function demarrer() {
    if (lang === 'en' && dico) {
      traduireArbre(document.body);
      traduireTitre();
      observateur.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
      window.AlgorI18n.pret = true;
      window.dispatchEvent(new CustomEvent('algorI18nReady', { detail: { lang: lang } }));
    } else {
      // Français : seul le sélecteur est à monter (et à remonter si un rendu React le recrée)
      new MutationObserver(monterSelecteurs).observe(document.body, { childList: true, subtree: true });
    }
    monterSelecteurs();
    setTimeout(function () { if (!monterSelecteurs() && !document.querySelector('.lang-toggle')) document.body.appendChild(toggle(true)); }, 1800);
    reveler();
  }

  function quandDomPret(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true }); else fn();
  }

  if (lang === 'en') {
    root.classList.add('i18n-attente');
    setTimeout(reveler, 1500); // jamais de page blanche si le dictionnaire tarde
    fetch('/shared/i18n/en.json?v=' + VERSION_DICO)
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { dico = d || {}; quandDomPret(demarrer); })
      .catch(function () { dico = {}; quandDomPret(demarrer); });
  } else {
    quandDomPret(demarrer);
  }
})();
