# Collecte de veille — sans API ni cle

Implementation de la chaine de collecte decrite dans
[`veille-scrapers-osint.md`](veille-scrapers-osint.md). Le socle fonctionne
**sans aucune cle d'API, aucun compte, aucun abonnement**. Une seule source
fait exception et reste optionnelle, desactivee par defaut : TikTok via
TikNeuron, qui exige une cle payante (voir la section dediee).

```
Telegram public (t.me/s)  ┐
Flux RSS / Atom           ┘ ->  classification  ->  geocodage local
                                                      |
                              branche veille-data <- GeoJSON
                                                      |
                                  calque « Veille IA » de la carte
```

---

## Pourquoi ces deux sources seulement

| Voie | Cle requise | Pourquoi elle est retenue |
|---|---|---|
| **Apercu web Telegram** (`https://t.me/s/<canal>`) | aucune | C'est la page que Telegram sert aux moteurs de recherche pour tout canal public. Pas de compte, pas de `api_id`, pas de MTProto, rien a faire tourner. |
| **RSS / Atom** | aucune | Presse, ReliefWeb, et **toute instance RSSHub auto-hebergee** — ce qui ouvre X, Instagram, TikTok et YouTube sans cle, via un seul service a maintenir. |
| **TikTok via TikNeuron** | **cle requise** | Source optionnelle, branchee mais desactivee par defaut. Voir la section dediee plus bas. |

Les scrapers a compte (twscrape, instaloader, scrapers TikTok) ne sont pas
branches ici : ils exigent des comptes jetables et des proxies, donc une
maintenance humaine. Ils restent documentes dans la note de cadrage et
peuvent alimenter la meme chaine en produisant le meme format d'item.

---

## Fichiers

```
tools/veille/
  collect.mjs            # CLI de collecte (point d'entree)
  sources.json           # canaux Telegram et flux RSS, par zone
  gazetteer.json         # toponymes -> coordonnees (GeoNames + seed)
  gazetteer-seed.json    # lieux cures a la main, prioritaires
  build-gazetteer.mjs    # regenere le gazetteer depuis GeoNames
  lib/http.mjs           # fetch avec UA, timeout, retry
  lib/telegram.mjs       # lecture de t.me/s/<canal>
  lib/rss.mjs            # lecture RSS 2.0 / Atom
  lib/tiktok.mjs         # TikTok via API TikNeuron (optionnel, cle requise)
  lib/instagram.mjs      # Instagram via Instaloader (optionnel, session requise)
  instagram_fetch.py     # pont Python vers Instaloader
  lib/classify.mjs       # lexique conflit FR/EN/AR -> type + confiance
  lib/geocode.mjs        # geocodage hors-ligne par gazetteer
  lib/geojson.mjs        # Feature, dedoublonnage, retention
  lib/prune.mjs          # purge des sources mortes (--prune)
  test/run-tests.mjs     # 91 tests hors-ligne (aucun acces reseau)
.github/workflows/veille-collect.yml
```

Node >= 20, **aucune dependance npm**.

---

## Utilisation

```bash
# Verifier que les sources repondent (a faire en premier)
node tools/veille/collect.mjs --zone sahel --check

# Verifier ET retirer automatiquement les sources mortes de sources.json
node tools/veille/collect.mjs --all --prune

# Collecter sans rien ecrire
node tools/veille/collect.mjs --zone sahel --dry-run

# Collecter les trois zones
node tools/veille/collect.mjs --all

# Tests hors-ligne
node tools/veille/test/run-tests.mjs
```

| Option | Defaut | Role |
|---|---|---|
| `--zone <z>` / `--all` | — | Zone a traiter : `sahel`, `moyen-orient`, `rdc` |
| `--max-age <j>` | 3 | Age maximum d'un item collecte, en jours |
| `--days <j>` | 30 | Fenetre de retention du fichier de sortie |
| `--limit <n>` | 60 | Points maximum retenus par passage |
| `--out <chemin>` | `<zone>/veille.geojson` | Fichier de sortie |
| `--check` | — | Teste chaque source et sort |
| `--prune` | — | Comme `--check`, puis **retire de `sources.json`** les sources mortes (sauvegarde dans `sources.json.bak`) |
| `--dry-run` | — | N'ecrit pas le fichier |

---

## Chaine de traitement

1. **Collecte.** Chaque canal et chaque flux est lu independamment. Une
   source injoignable est signalee et la collecte continue.
2. **Fenetre temporelle.** Les items plus vieux que `--max-age` sont ecartes.
3. **Classification** (`lib/classify.mjs`). Un lexique conflit
   francais / anglais / arabe attribue l'un des huit types **exactement
   attendus par le calque** : `Attaque`, `Embuscades`, `Incursion`, `Siege`,
   `Incident frontalier`, `Crise diplomatique`, `Economique`, `Geopolitique`.
   Un item qui ne matche aucun type est rejete, de meme que le bruit
   identifie (sport, meteo, culture, publicite).
   La confiance est graduee : `faible` (lexique seul), `moyenne` (acteur
   connu identifie), `elevee` (acteur + bilan chiffre).
4. **Geocodage** (`lib/geocode.mjs`). Recherche des toponymes du gazetteer
   dans le texte, **sans appel reseau**. Regle de selection : le premier
   toponyme cite l'emporte ; a position egale, le plus long gagne
   (« Gorom-Gorom » plutot que « Gorom »). La recherche est cloisonnee par
   zone : un item Sahel ne peut pas tomber sur une ville syrienne. Un item
   non localisable est ecarte, le calque a besoin de coordonnees. Regles
   supplementaires pour les lieux GeoNames :
   - un lieu ne compte que s'il est ecrit avec une majuscule dans le texte ;
   - si le premier lieu cite est une region (« Kwilu : incendies a Bulungu »),
     la localite plus precise citee ensuite l'emporte ;
   - un village homonyme (deux « Dioura » au Mali, a 500 km) est tranche par
     les autres lieux du texte (a moins de 150 km), sinon par une resolution
     faite sur un autre texte du meme passage, sinon ignore ;
   - « la junte de Bamako », « les autorites de Kinshasa » : la capitale
     designe le pouvoir, elle n'est pas retenue comme lieu.
5. **Construction GeoJSON** (`lib/geojson.mjs`). Empreinte `Ref` (SHA-1 du
   texte normalise + lieu + jour) pour le dedoublonnage, fusion avec le
   fichier existant, purge glissante a `--days`.

### Format produit

Les cles de `properties` sont affichees telles quelles dans le popup
(`popupHTML` dans `sahel/index.html` : `name`, `type` et `sources` sont
traites a part, tout le reste devient une ligne).

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [-5.47, 15.29] },
  "properties": {
    "name": "Attaque — Nampala",
    "type": "Attaque",
    "Date": "2026-09-20 08:14 UTC",
    "Lieu": "Nampala",
    "Pays": "Mali",
    "Zone": "sahel",
    "Acteurs": "jnim",
    "Bilan": "12 (annonce, non verifie)",
    "Resume": "Attaque contre un poste des FAMa a Nampala…",
    "Mots-cles": "attaque",
    "Confiance": "elevee",
    "Precision": "ville (seed)",
    "Canal": "Telegram @zonewatch",
    "Statut": "a valider",
    "Ref": "8f2c1a9b40",
    "Collecte": "2026-09-21 12:00 UTC",
    "sources": "Telegram|https://t.me/zonewatch/1234"
  }
}
```

**`Statut: "a valider"`** : rien n'est presente comme verifie. Le calque est
OFF par defaut, et les bilans chiffres sont toujours suffixes
« (annonce, non verifie) ».

---

## Sources

`tools/veille/sources.json` porte deux listes par zone.

```json
{ "zones": { "sahel": {
  "telegram": ["nom_du_canal_public"],
  "rss": [{ "url": "https://…/rss", "label": "RFI Afrique" }]
} } }
```

**La liste Telegram est livree vide, volontairement.** Une liste de canaux
suivis est le produit du travail de l'analyste ; la deviner produirait des
sources fausses ou hors sujet. Ajouter les canaux publics deja suivis, puis
valider avec `--check`.

Les flux RSS livres sont des flux de presse generalistes, non verifies
depuis l'environnement de developpement (sortie reseau filtree). **Lancer
`--prune` avant le premier passage** : chaque source est sondee et celles
qui ne repondent pas, ou qui ne renvoient rien d'exploitable, sont retirees
du fichier automatiquement.

```
[check] zone sahel
  OK   rss RFI Afrique — 25 items (312 ms)
  KO   rss Le Monde Afrique — HTTP 404
  → 1 source(s) retiree(s) de sources.json :
      - rss Le Monde Afrique — HTTP 404
  → 1 conservee(s). Sauvegarde : sources.json.bak
```

Une source qui echoue est **retentee une fois** avant d'etre declaree morte :
un hoquet reseau ne supprime pas un bon flux. La source TikTok n'est jamais
purgee quand la cle est absente, puisqu'elle n'est alors pas testable.

### Brancher X, Instagram et TikTok sans cle

Deployer une instance [RSSHub](https://github.com/DIYgod/RSSHub) et ajouter
ses routes comme flux :

```json
{ "url": "https://rsshub.example.org/twitter/user/<compte>", "label": "X @compte" }
{ "url": "https://rsshub.example.org/instagram/user/<compte>", "label": "IG @compte" }
{ "url": "https://rsshub.example.org/tiktok/user/@<compte>",  "label": "TikTok @compte" }
```

Rien d'autre a changer : le collecteur les traite comme n'importe quel flux.

---

## TikTok via TikNeuron — source optionnelle, **avec cle**

Branchee a la demande, a partir de
[`seym0n/tiktok-mcp`](https://github.com/seym0n/tiktok-mcp).

> **Ce MCP n'est pas une voie sans API.** Son `index.ts` sort immediatement
> si `TIKNEURON_MCP_API_KEY` est absente, et ses trois outils appellent
> l'API hebergee `tikneuron.com/api/mcp/*`. C'est un service tiers payant
> avec une couche MCP, pas un scraper autonome. A la difference des autres
> sources de ce collecteur, celle-ci a un cout et une dependance externe.

### Dans le collecteur

`lib/tiktok.mjs` appelle directement les memes endpoints que le MCP, ce qui
evite de faire tourner un serveur MCP dans un cron :

| Endpoint | Usage ici |
|---|---|
| `GET /api/mcp/search` | Collecte : une requete par entree de `sources.json`, pagination suivie |
| `GET /api/mcp/post-detail` | `postDetails()`, pour l'enrichissement ponctuel |
| `GET /api/mcp/get-subtitles` | `subtitles()`, transcription ASR d'une video |

Les requetes se declarent par zone :

```json
"tiktok": {
  "queries": ["attaque Mali armee", "Burkina Faso attaque Djibo"],
  "pages": 2
}
```

Chaque video devient un item normalise : `description` + hashtags forment le
texte soumis au lexique et au geocodage, `created_at` est accepte en ISO
comme en epoch (secondes ou millisecondes), et l'URL est reconstruite en
`https://www.tiktok.com/@<createur>/video/<id>`. La suite du traitement est
identique aux autres sources.

**Sans la variable d'environnement `TIKNEURON_MCP_API_KEY`, la source est
ignoree** avec un message, et la collecte continue :

```bash
export TIKNEURON_MCP_API_KEY=xxxxxxxx
node tools/veille/collect.mjs --zone sahel --check    # teste aussi TikTok
node tools/veille/collect.mjs --zone sahel
```

En CI, definir le secret de depot `TIKNEURON_MCP_API_KEY` : le workflow le
passe a la collecte, et son absence ne casse rien. La cle n'est jamais
journalisee — le corps des reponses en erreur n'est pas remonte, seul le
code HTTP l'est.

### En analyse interactive (serveur MCP)

Pour interroger TikTok depuis Claude plutot que depuis le cron, utiliser le
MCP tel quel :

```bash
git clone https://github.com/Seym0n/tiktok-mcp.git
cd tiktok-mcp && npm install && npm run build
```

```json
{
  "mcpServers": {
    "tiktok-mcp": {
      "command": "node",
      "args": ["/chemin/vers/tiktok-mcp/build/index.js"],
      "env": { "TIKNEURON_MCP_API_KEY": "votre_cle" }
    }
  }
}
```

Les deux usages sont complementaires : le MCP pour explorer et qualifier a
la main, `lib/tiktok.mjs` pour la collecte automatisee.

---

## Instagram via Instaloader : source optionnelle, **avec compte**

[Instaloader](https://github.com/instaloader/instaloader) (Python, MIT) lit
les posts des comptes publics et des hashtags. **Instagram refuse tout acces
anonyme** : teste le 21/09/2026, erreur 401 « Please wait a few minutes » des
la premiere requete, quel que soit le compte vise. Il faut donc une session.

Atout pour la carte : un post geotague donne des **coordonnees exactes**. Le
collecteur les utilise a la place du gazetteer, apres avoir verifie que le
point tombe dans la zone (lieu du gazetteer a moins de 150 km, sinon rejete).
La precision affichee est alors `geotag (instagram)`.

### Mise en route (une fois, a la main)

```bash
pip install instaloader
instaloader --login <compte_veille>   # demande le mot de passe, enregistre la session
export IG_SESSION_USER=<compte_veille>
```

- **Compte dedie a la veille**, jamais un compte personnel : Instagram bloque
  ou suspend les comptes qui lisent en volume.
- Le collecteur ne voit jamais le mot de passe : il recharge seulement la
  session enregistree par Instaloader.
- `IG_PYTHON` permet de viser un Python precis (virtualenv) ; `python3` par defaut.

### Configuration

Dans `sources.json`, par zone :

```json
"instagram": { "profiles": ["compte_public"], "hashtags": ["motcle"], "per_source": 12 }
```

Listes vides par defaut : elles viennent de la liste de suivi de l'analyste.
`--check` teste chaque source ; `--prune` ne retire **jamais** une source
Instagram (un 401 vient le plus souvent d'un blocage du compte de veille, pas
du compte suivi).

### Limites

- **Local ou VPS uniquement.** La session est un identifiant : elle ne doit
  pas partir dans les secrets GitHub Actions. Dans le workflow, la source est
  simplement ignoree faute de session.
- Rythme volontairement lent (2 s entre sources, 12 posts par source) :
  au-dela, le compte de veille se fait bloquer.
- Les CGU d'Instagram interdisent la collecte automatisee : risque de
  suspension du compte, a traiter comme dans la note de cadrage (section
  cadre juridique). Donnees publiques seulement, pas de profil prive.

---

## Gazetteer

Le fichier livre est genere depuis GeoNames (donnees libres CC BY 4.0,
`download.geonames.org/export/dump/<CC>.zip`, **sans cle**) : environ
73 600 lieux, 11 Mo, une ligne par lieu.

| Couche | Contenu | Zones |
|---|---|---|
| Seed manuel | 178 lieux cures a la main (`gazetteer-seed.json`), prioritaires a nom egal | toutes |
| Villes | population >= seuil (5 000 par defaut), chefs-lieux PPLA/PPLC | toutes |
| Regions | ADM1 et ADM2 (provinces, territoires, cercles), sauf noms generiques d'un mot (« Centre », « Nord ») | toutes |
| Villages | toutes les localites, population 0 comprise, 5 lettres mini, hors mots courants | Sahel, RDC |

Garde-fous contre les faux positifs :
- les alias GeoNames ne sont gardes que pour les regions ADM1, les chefs-lieux
  et les villes de plus de 100 000 habitants (sur les petites villes, « Bank »
  pour Banak placait « West Bank » en Iran) ;
- les villages homonymes eloignes de plus de 40 km gardent leurs candidats
  (`amb`) pour etre tranches au geocodage ; au-dela de 4 homonymes, le nom est
  ecarte.

Pour regenerer :

```bash
node tools/veille/build-gazetteer.mjs            # toutes les zones
node tools/veille/build-gazetteer.mjs --min-pop 2000
```

Pour corriger un lieu a la main, l'ajouter dans `gazetteer-seed.json` puis
regenerer : le seed survit aux reconstructions. Le fichier produit doit etre
commite.

---

## Automatisation

`.github/workflows/veille-collect.yml` — toutes les 3 heures, plus
declenchement manuel.

1. Joue les tests hors-ligne (le job s'arrete si le parsing est casse).
2. Prepare la branche `veille-data` en worktree, en la creant en branche
   orpheline si elle n'existe pas encore.
3. Collecte les trois zones et ecrit `<zone>/veille.geojson`.
4. Commite et pousse uniquement s'il y a une difference, avec 4 tentatives
   en cas d'echec reseau.
5. Ecrit le nombre de points par zone dans le resume de run.

Filet de securite : si **toutes** les sources d'une zone echouent, le fichier
de cette zone est laisse intact — un incident reseau ne purge pas la
retention.

---

## Affichage sur la carte

Seule la zone **Sahel** possede aujourd'hui le calque Veille
(`sahel/index.html`, constante `VEILLE_URL`). Le collecteur produit deja
`moyen-orient/veille.geojson` et `rdc/veille.geojson` : pour les afficher,
copier dans la page de la zone le bloc `<!-- CALQUE VEILLE IA -->` de
`sahel/index.html` en changeant `sahel` par la zone dans `VEILLE_URL`, et
ajouter l'entree de menu correspondante (`sb-toggle-veille`).

---

## Limites connues

- **Apercu web Telegram** : ne couvre que les canaux publics dont l'apercu
  est active, et sert les derniers messages seulement (~20). A 3 h
  d'intervalle, un canal tres actif peut perdre des messages : reduire
  l'intervalle du cron pour ces canaux.
- **Parsing HTML** : Telegram peut changer son markup. Les tests hors-ligne
  detecteront la casse sur fixtures, mais pas un changement en production —
  surveiller une zone qui tombe durablement a 0 point collecte.
- **Geocodage par toponyme** : un article qui cite un lieu sans y localiser
  l'evenement produit un point faux. D'ou `Statut: "a valider"` et le calque
  OFF par defaut.
- **Lexique** : regles par mots-cles, pas de modele. Des faux positifs
  passeront ; c'est l'etape de validation humaine qui tranche.
- **Pas de detection de doublon inter-sources** : le meme evenement relaye
  par trois medias produit trois points distincts (le `Ref` ne dedoublonne
  que le meme texte). Un regroupement par lieu + jour + type serait
  l'amelioration suivante.
