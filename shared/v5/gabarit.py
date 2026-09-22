#!/usr/bin/env python3
"""Gabarit v5 : insère la navigation, le menu, la recherche, les appels de fin et le pied de page
dans les pages, entre des balises de repère. Idempotent : relancer réécrit le contenu entre repères.

  python3 shared/v5/gabarit.py theatres/index.html offres/index.html ...

Repères reconnus dans une page :
  <!-- v5:nav -->   <!-- /v5:nav -->     navigation + menu + recherche (+ bandeau de veille)
  <!-- v5:appels --> <!-- /v5:appels -->  les deux grands appels de fin
  <!-- v5:foot -->  <!-- /v5:foot -->    pied de page
Un repère seul (sans fermeture) est accepté la première fois.
La rubrique active est lue dans <body data-rubrique="...">.
"""
import re, sys, pathlib

X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>'
FL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M3 12h18M14 5l7 7-7 7"/></svg>'
# Marque « recoupement » (logo/recoupement-blanc.svg), en currentColor : blanche sur la nuit, encre sur le papier
BRAND = '<a class="brand" href="/" aria-label="Algor Access, accueil"><svg class="marque" viewBox="0 0 100 100" width="28" height="28" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16 90 L28 90 L46.4 40 L34.4 40 Z M74 90 L86 90 L75 62 L63 62 Z M50 5 L59 14 L50 23 L41 14 Z"/></svg><span>Algor Access</span></a>'

# Débunkage : page désactivée depuis le pivot de juin 2026 (redirige vers l'accueil). Pour la réactiver,
# retirer le bloc PIVOT de debunkage/index.html puis rajouter ('debunkage', '/debunkage/', 'Débunkage') ici.
LIENS = [('theatres', '/theatres/', 'Théâtres'), ('veille', '/veille/', 'Veille'), ('methodologie', '/methodologie/', 'Méthodologie'),
         ('offres', '/offres/', 'Offres'), ('a-propos', '/a-propos/', 'À propos'), ('contact', '/contact/', 'Contact')]
THEATRES = [('/moyen-orient/', 'Moyen-Orient'), ('/sahel/', 'Sahel'), ('/rdc/', 'RDC, Grands Lacs'), ('/madagascar/', 'Madagascar'),
            ('/afrique/', 'Afrique maritime'), ('/asie-sud/', 'Asie du Sud')]


def cur(rub, key):
    return ' aria-current="page"' if rub == key else ''


def nav(rub, annonce=True):
    liens = ''.join(f'<a href="{h}"{cur(rub, k)}>{t}</a>' for k, h, t in LIENS)
    menu_main = ''.join(f'<a href="{h}"{cur(rub, k)}>{t}</a>' for k, h, t in [('accueil', '/', 'Plateforme')] + LIENS[:3])
    th = ''.join(f'<a href="{h}">{t}</a>' for h, t in THEATRES)
    ann = f'''<div class="annonce" id="annonce" hidden>
  <div class="annonce__in">
    <p>Dernière note de veille : <a id="annonce-lien" href="/veille/"></a></p>
    <button class="annonce__x" id="annonce-x" aria-label="Fermer le bandeau">{X}</button>
  </div>
</div>
''' if annonce else ''
    return f'''{ann}<header class="nav" id="nav">
  <div class="nav__bar">
    {BRAND}
    <nav class="nav__links" aria-label="Rubriques">{liens}</nav>
    <div class="nav__right">
      <span class="lang-slot"></span>
      <button class="btn-login site-login" type="button">Connexion</button>
      <a class="btn-rect" href="/offres/">Demander un accès</a>
      <div class="sq">
        <button type="button" id="ouvrir-recherche" aria-label="Rechercher une zone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg></button>
        <button type="button" id="ouvrir-menu" aria-label="Ouvrir le menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18"/></svg></button>
      </div>
    </div>
  </div>
</header>

<div class="veil" id="menu" role="dialog" aria-modal="true" aria-label="Menu">
  <div class="veil__top">
    {BRAND}
    <button class="veil__x" data-fermer aria-label="Fermer le menu">{X}</button>
  </div>
  <nav class="veil__body">
    <div class="veil__main">{menu_main}</div>
    <div class="veil__col"><h3>Théâtres</h3>{th}</div>
    <div class="veil__col"><h3>Algor Access</h3><a href="/offres/">Offres</a><a href="/a-propos/">À propos</a><a href="/contact/">Contact</a><a href="/demo/">Démo sur une zone</a></div>
  </nav>
</div>

<div class="veil veil--search" id="recherche" role="dialog" aria-modal="true" aria-label="Recherche">
  <div class="veil__top">
    {BRAND}
    <button class="veil__x" data-fermer aria-label="Fermer la recherche">{X}</button>
  </div>
  <div class="veil__body">
    <form class="search-form" action="/demo/">
      <label for="q">Essayez la démo sur n'importe quelle zone du monde</label>
      <input id="q" name="q" type="search" placeholder="Bogotá" autocomplete="off" required>
      <p>Indiquez une ville, une région ou un pays : vous verrez le rendu de nos cartes sur des données fictives.</p>
    </form>
  </div>
</div>'''


def appels():
    return f'''<section class="appels" data-nav="light" aria-label="Accès">
  <div class="appels__grid">
    <a class="appel appel--clair" href="/offres/"><span>Demander un accès</span>{FL}</a>
    <a class="appel appel--nuit" href="/contact/"><span>Nous écrire</span>{FL}</a>
  </div>
</section>'''


def foot():
    th = ''.join(f'<a href="{h}">{t}</a>' for h, t in THEATRES)
    return f'''<footer class="foot" data-nav="light">
  <div class="foot__id">
    <p>© 2026 Algor Access</p>
    <p>Solution souveraine française, données hébergées en Europe.</p>
    <hr>
    <div class="foot__pills">
      <button class="pill site-login" type="button">Connexion</button>
      <a class="pill" href="/offres/">Les offres</a>
      <a class="pill" href="/demo/">La démo</a>
    </div>
  </div>
  <div class="foot__col"><h3>Théâtres</h3>{th}</div>
  <div class="foot__col"><h3>Plateforme</h3><a href="/">Plateforme</a><a href="/veille/">Veille</a><a href="/methodologie/">Méthodologie</a></div>
  <div class="foot__col"><h3>Société</h3><a href="/a-propos/">À propos</a><a href="/offres/">Offres</a><a href="/contact/">Contact</a></div>
  <div class="foot__col"><h3>Informations</h3><a href="/mentions-legales/">Mentions légales</a><a href="/confidentialite/">Confidentialité</a></div>
</footer>'''


def remplir(texte):
    rub = (re.search(r'<body[^>]*data-rubrique="([^"]+)"', texte) or [None, ''])[1]
    sans_annonce = 'data-v5-sans-annonce' in texte
    blocs = {'nav': nav(rub, not sans_annonce), 'appels': appels(), 'foot': foot()}
    for nom, contenu in blocs.items():
        ouvert, ferme = f'<!-- v5:{nom} -->', f'<!-- /v5:{nom} -->'
        if ouvert not in texte:
            continue
        if ferme in texte:
            texte = re.sub(re.escape(ouvert) + r'.*?' + re.escape(ferme), lambda m: f'{ouvert}\n{contenu}\n{ferme}', texte, count=1, flags=re.S)
        else:
            texte = texte.replace(ouvert, f'{ouvert}\n{contenu}\n{ferme}', 1)
    return texte


if __name__ == '__main__':
    for chemin in sys.argv[1:]:
        p = pathlib.Path(chemin)
        avant = p.read_text(encoding='utf-8')
        apres = remplir(avant)
        if apres != avant:
            p.write_text(apres, encoding='utf-8')
            print('gabarit appliqué :', chemin)
        else:
            print('inchangé :', chemin)
