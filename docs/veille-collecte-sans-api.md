# Collecte de veille — sans API ni cle

Implementation de la chaine de collecte decrite dans
[`veille-scrapers-osint.md`](veille-scrapers-osint.md), **sans aucune cle
d'API, aucun compte, aucun abonnement**.

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
  gazetteer.json         # toponymes -> coordonnees (seed manuel livre)
  build-gazetteer.mjs    # regenere le gazetteer depuis GeoNames
  lib/http.mjs           # fetch avec UA, timeout, retry
  lib/telegram.mjs       # lecture de t.me/s/<canal>
  lib/rss.mjs            # lecture RSS 2.0 / Atom
  lib/classify.mjs       # lexique conflit FR/EN/AR -> type + confiance
  lib/geocode.mjs        # geocodage hors-ligne par gazetteer
  lib/geojson.mjs        # Feature, dedoublonnage, retention
  test/run-tests.mjs     # 45 tests hors-ligne (aucun acces reseau)
.github/workflows/veille-collect.yml
```

Node >= 20, **aucune dependance npm**.

---

## Utilisation

```bash
# Verifier que les sources repondent (a faire en premier)
node tools/veille/collect.mjs --zone sahel --check

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
   non localisable est ecarte — le calque a besoin de coordonnees.
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
`--check` avant le premier passage** et retirer ce qui ne repond pas.

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

## Gazetteer

Le fichier livre est un **seed manuel de 178 lieux** (Sahel, Moyen-Orient,
RDC), coordonnees arrondies au centieme de degre, soit environ 1 km. Suffisant
pour un calque consulte entre les zooms 4 et 8, et chaque point porte le lien
vers sa source pour verification.

Pour des coordonnees exactes et une couverture complete :

```bash
node tools/veille/build-gazetteer.mjs            # toutes les zones
node tools/veille/build-gazetteer.mjs --min-pop 2000
```

Le script telecharge les jeux GeoNames par pays
(`download.geonames.org/export/dump/<CC>.zip`, donnees libres CC BY 4.0,
**sans cle**), les decompresse sans dependance et remplace `gazetteer.json`.
Il retient les localites au-dessus du seuil de population et les chefs-lieux
ADM1. Le fichier produit doit etre commite.

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
