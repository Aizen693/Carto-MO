# Inoreader Dashboard

Dashboard local Python/Streamlit pour lire, filtrer, scorer et exporter vos articles RSS depuis Inoreader.

---

## Fonctionnalités

| Catégorie | Détail |
|---|---|
| **Sources** | Tous les articles, non-lus, favoris, flux, dossier, tag |
| **Filtres** | Texte libre, source, dossier, tag, date, statut lu/favori, mots-clés requis/exclus, longueur |
| **Scoring** | Bonus titre/corps/source, malus mots-clés négatifs — configurable en live |
| **Sélection** | Checkboxes inline, tout/rien, paniers multiples, sélection par lot |
| **Export** | CSV, Excel, JSON, liste d'URLs |
| **Actions API** | Marquer lu/non-lu, ajouter/retirer favori, ajouter/retirer tag |
| **Dashboard** | Top sources, distribution temporelle, top tags, mots-clés fréquents |
| **Profils** | Sauvegarde/chargement/suppression de profils de filtre JSON |

---

## Installation

### 1. Prérequis

- Python 3.11+
- Un compte Inoreader (gratuit ou App)
- Une application enregistrée sur [https://www.inoreader.com/developers/](https://www.inoreader.com/developers/)

### 2. Cloner / copier le projet

```bash
cd inoreader_dashboard
```

### 3. Créer un environnement virtuel

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate
```

### 4. Installer les dépendances

```bash
pip install -r requirements.txt
```

### 5. Configurer les credentials

```bash
cp .env.example .env
# Éditez .env avec vos valeurs
```

---

## Obtenir les tokens OAuth2 (première fois)

### Étape 1 — Créer votre application Inoreader

1. Allez sur [https://www.inoreader.com/developers/](https://www.inoreader.com/developers/)
2. Créez une nouvelle application
3. Renseignez `http://localhost:8080` comme URL de redirection
4. Copiez `App ID`, `App Key`, `Client ID`, `Client Secret` dans `.env`

### Étape 2 — Lancer le script d'autorisation

```bash
python oauth_setup.py
```

Le script :
1. Affiche l'URL d'autorisation (et tente de l'ouvrir dans le navigateur)
2. Vous demande le code de redirection (paramètre `code=` dans l'URL)
3. Affiche `INOREADER_ACCESS_TOKEN` et `INOREADER_REFRESH_TOKEN` à copier dans `.env`

> **Note :** L'access_token est rafraîchi automatiquement à l'expiration via le refresh_token. Vous n'avez à faire cette étape qu'une seule fois.

---

## Lancement

```bash
streamlit run app.py
```

L'interface s'ouvre sur [http://localhost:8501](http://localhost:8501).

---

## Structure du projet

```
inoreader_dashboard/
├── app.py                # Interface Streamlit principale
├── inoreader_client.py   # Couche API Inoreader (OAuth2, retry, rate limit)
├── data_processing.py    # Normalisation articles → DataFrame
├── scoring.py            # Moteur de scoring local
├── filters.py            # Filtrage pandas + profils JSON
├── exports.py            # CSV / Excel / JSON / URLs
├── utils.py              # Logging, config, helpers
├── oauth_setup.py        # Script de premier lancement OAuth2
├── requirements.txt
├── .env.example
├── saved_filters/        # Profils de filtre (créé automatiquement)
└── exports/              # Fichiers exportés (créé automatiquement)
```

---

## Guide d'utilisation rapide

### Charger des articles

1. Dans la **sidebar gauche**, choisissez la source (tous / non-lus / favoris / dossier / tag / flux)
2. Réglez le nombre max d'articles (50–2000)
3. Cliquez **🔄 Charger**

### Filtrer

Les filtres s'appliquent **localement** (pas d'appel API supplémentaire) :
- Recherche texte libre : cherche dans titre + résumé + contenu
- Mots-clés requis : tous les articles doivent contenir au moins un des mots
- Mots-clés exclus : articles contenant ces mots sont masqués
- Cliquez **▶ Appliquer** pour voir le résultat

### Scorer

1. Allez dans **⚙️ Scoring**
2. Entrez vos mots-clés (un par ligne)
3. Ajustez les bonus/malus
4. Cliquez **✅ Appliquer** — le score se recalcule sur tous les articles

Triez ensuite par **Score (décroissant)** dans les filtres pour voir les articles les plus pertinents en tête.

### Sélectionner et exporter

- Cochez les cases dans le tableau (colonne **✓**)
- Utilisez **✅ Tout** pour sélectionner toute la page filtrée
- Créez plusieurs **paniers** pour organiser des thématiques différentes
- Exportez en **CSV / Excel / JSON** ou copiez la **liste d'URLs**

### Sauvegarder un filtre

Dans la sidebar, section **💾 Sauvegarder ce filtre** : donnez un nom, cliquez Sauvegarder.  
Rechargez-le depuis **💾 Filtres sauvegardés**.

---

## Hypothèses et limitations connues

| Sujet | Détail |
|---|---|
| **URL-encoding des stream_ids** | Les stream_ids sont encodés via `urllib.parse.quote(safe='')` avant insertion dans le chemin URL. Si vous obtenez des erreurs 404 sur certaines sources, vérifiez que l'encodage correspond à ce qu'attend votre instance Inoreader. |
| **Distinction dossier/tag** | Dans les catégories d'un article, dossiers et tags ont la même forme `user/-/label/{name}`. La distinction repose sur le champ `type='folder'` retourné par `/tag/list`. Si Inoreader ne retourne pas ce champ, tous les labels sont traités comme tags. |
| **Actions bulk** | Les actions (marquer lu, tagger…) font un appel API par article. Pour de grandes sélections (>100), cela peut prendre quelques secondes à cause du rate limiting (2 req/s). |
| **Contenu complet** | Inoreader retourne le contenu complet uniquement pour certains flux (selon votre abonnement et les settings du flux). Si `content` est vide, le `summary` est utilisé en fallback. |
| **Refresh token rotation** | Certaines configurations Inoreader retournent un nouveau refresh_token lors du refresh. L'app le met à jour en mémoire mais **ne l'écrit pas dans .env** automatiquement. Si la session expire, relancez `oauth_setup.py`. |
| **Pagination API** | Max ~1000 articles par stream selon les limits Inoreader. Au-delà, la pagination s'arrête si le champ `continuation` n'est plus retourné. |

---

## Dépendances

| Package | Usage |
|---|---|
| `streamlit` | Interface web |
| `httpx` | Client HTTP synchrone |
| `pandas` | Manipulation des données |
| `python-dotenv` | Chargement des variables .env |
| `openpyxl` | Export Excel |

---

## Variables d'environnement

| Variable | Obligatoire | Description |
|---|---|---|
| `INOREADER_APP_ID` | ✓ | ID de l'application Inoreader |
| `INOREADER_APP_KEY` | ✓ | Clé de l'application |
| `INOREADER_CLIENT_ID` | ✓ | Client ID OAuth2 |
| `INOREADER_CLIENT_SECRET` | ✓ | Client Secret OAuth2 |
| `INOREADER_REFRESH_TOKEN` | ✓ | Refresh token (obtenu via oauth_setup.py) |
| `INOREADER_ACCESS_TOKEN` | — | Access token (optionnel, rafraîchi automatiquement) |
