# Veille sociale — dépôts GitHub de collecte (OSINT)

Note de cadrage outillage pour le calque **Veille IA** de Carto-MO.
État des dépôts : **20 septembre 2026** (étoiles arrondies, vérifier avant intégration).

Pipeline cible actuel :

```
sources sociales  ->  collecteur (scraper / API)  ->  n8n (filtrage, géocodage, validation)
                  ->  branche veille-data  ->  <zone>/veille.geojson  ->  calque Mapbox
```

---

## 0. Cadre juridique et opérationnel — à lire avant de coder

| Point | Conséquence pratique |
|---|---|
| Le scraping des plateformes Meta (Facebook, Instagram), LinkedIn et X viole leurs CGU | Risque de blocage de compte, de bannissement IP, et exposition contractuelle. Le scraping de **données publiques** est globalement toléré en jurisprudence US (*hiQ v. LinkedIn*), pas en Europe côté CGU. |
| RGPD | Les posts contiennent des données personnelles. Collecte à finalité déterminée (veille sécurité), minimisation, durée de conservation, pas de profilage d'individus non liés au sujet. Un registre de traitement est nécessaire si le projet est opéré depuis l'UE. |
| Comptes de collecte | Ne jamais utiliser de compte nominatif. Comptes dédiés + proxies résidentiels, rotation, quotas bas. |
| Fragilité | Un scraper non officiel casse en moyenne tous les 1 à 3 mois. Prévoir monitoring + fallback, jamais de dépendance unique. |
| Preuve | Pour un usage renseignement, archiver l'original (hash + horodatage + WACZ/média) en plus de la donnée extraite. Voir §8. |

**Voies officielles à privilégier quand elles existent** (stables, pas de risque CGU) :

- **X API** (tiers payants à partir de ~200 $/mois pour un volume exploitable)
- **TikTok Research API** (gratuit, réservé aux chercheurs académiques accrédités — critère bloquant pour un projet privé)
- **Meta Content Library** (accès chercheurs, via ICPSR — même limite)
- **YouTube Data API v3** (gratuit, quota 10 000 unités/jour)
- **Reddit API** (payante au-delà de 100 req/min)
- **Telegram MTProto** : officiel et ouvert, pas de restriction d'accès → **la voie la plus fiable pour les zones Sahel / Moyen-Orient / RDC**

---

## 1. TikTok

| Dépôt | ⭐ | Langage | Usage | État |
|---|---|---|---|---|
| [Evil0ctal/Douyin_TikTok_Download_API](https://github.com/Evil0ctal/Douyin_TikTok_Download_API) | ~20 200 | Python | API REST auto-hébergée : posts, profils, commentaires, playlists, vidéos sans filigrane. Docker, serveur MCP, archive PostgreSQL. | Très actif |
| [davidteather/TikTok-Api](https://github.com/davidteather/TikTok-Api) | ~6 600 | Python | Wrapper non officiel : hashtags, sons, profils, trending. Référence historique. | Actif |
| [drawrowfly/tiktok-scraper](https://github.com/drawrowfly/tiktok-scraper) | ~5 200 | TypeScript | CLI + lib : feeds user/hashtag/musique, métadonnées, signature d'URL. | Maintenance ralentie |
| [bellingcat/tiktok-hashtag-analysis](https://github.com/bellingcat/tiktok-hashtag-analysis) | ~375 | Python | Analyse d'occurrences de hashtags sur posts collectés. Orienté investigation. | Actif |
| [zerodytrash/TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector) | ~2 200 | TypeScript | Événements de live en temps réel (commentaires, cadeaux). Utile pour suivre une diffusion en direct. | Actif |
| [Russell-Newton/TikTokPy](https://github.com/Russell-Newton/TikTokPy) | ~240 | Python | Extraction via Playwright, sans clé ni login. | Modéré |

**Recommandation** : `Douyin_TikTok_Download_API` en service Docker (API REST → appelable directement depuis n8n via nœud HTTP), avec `TikTok-Api` en secours.

---

## 2. X / Twitter

| Dépôt | ⭐ | Langage | Usage | État |
|---|---|---|---|---|
| [vladkens/twscrape](https://github.com/vladkens/twscrape) | ~2 800 | Python | **Le plus solide aujourd'hui.** Rotation multi-comptes, gestion native du rate-limit, recherche, timelines, followers. | Très actif |
| [Altimis/Scweet](https://github.com/Altimis/Scweet) | ~1 600 | Python | Tweets, profils, followers/following. Pool de comptes, proxies, async, sans clé API. | Actif |
| [JustAnotherArchivist/snscrape](https://github.com/JustAnotherArchivist/snscrape) | ~5 400 | Python | Multi-réseaux (X, Facebook, Instagram, Reddit, Telegram, VK, Mastodon). **Le module X est cassé depuis la fermeture de l'API publique** — reste utile pour les autres modules. | Partiel |
| [ythx-101/x-tweet-fetcher](https://github.com/ythx-101/x-tweet-fetcher) | ~965 | Python | Tweets/réponses/timelines sans login ni clé, pensé pour agents IA. Récent → à tester avant de s'y fier. | Actif |
| [x0rz/tweets_analyzer](https://github.com/x0rz/tweets_analyzer) | ~3 000 | Python | Analyse de métadonnées et de rythme d'activité d'un compte (fuseau horaire, heures de post). Profilage d'acteur. | Stable |

**Recommandation** : `twscrape` + pool de 5 à 10 comptes jetables + proxies. C'est la brique la plus dépendante d'un entretien régulier.

---

## 3. Instagram

| Dépôt | ⭐ | Langage | Usage | État |
|---|---|---|---|---|
| [instaloader/instaloader](https://github.com/instaloader/instaloader) | ~13 400 | Python | **Référence.** Posts, stories, highlights, géotags, commentaires, métadonnées JSON complètes. Reprise de téléchargement, tagué `osint`. | Très actif |
| [postaddictme/instagram-php-scraper](https://github.com/postaddictme/instagram-php-scraper) | ~3 340 | PHP | Comptes, photos, vidéos, stories, commentaires. | Actif |
| [drawrowfly/instagram-scraper](https://github.com/drawrowfly/instagram-scraper) | ~894 | TypeScript | Pages utilisateur, hashtag et **lieu** — la recherche par lieu est directement pertinente pour un usage cartographique. | Modéré |
| [huaying/instagram-crawler](https://github.com/huaying/instagram-crawler) | ~1 356 | Python | Posts/profil/hashtag sans API, via webdriver. | Modéré |
| [th3unkn0n/osi.ig](https://github.com/th3unkn0n/osi.ig) | ~1 567 | Python | Collecte de renseignement sur un compte (recon ciblée). | Modéré |

**Recommandation** : `instaloader` uniquement. Le reste est redondant ou plus fragile.

---

## 4. Facebook / Meta

| Dépôt | ⭐ | Langage | Usage | État |
|---|---|---|---|---|
| [kevinzg/facebook-scraper](https://github.com/kevinzg/facebook-scraper) | ~3 290 | Python | Pages publiques sans clé API : posts, réactions, commentaires. | Actif mais ~445 issues ouvertes → casse fréquente |
| [harismuneer/Ultimate-Social-Scrapers](https://github.com/harismuneer/Ultimate-Social-Scrapers) | ~3 170 | — | Collection Facebook + Instagram + X : posts, photos/vidéos, followers, infos de contact. | Liste, qualité inégale |
| [shaikhsajid1111/facebook_page_scraper](https://github.com/shaikhsajid1111/facebook_page_scraper) | ~281 | Python | Front-end des pages → JSON/CSV structuré. | Actif |
| [floriandiud/facebook-group-members-scraper](https://github.com/floriandiud/facebook-group-members-scraper) | ~330 | TypeScript | Extension navigateur : membres de groupe → CSV. | Actif |

**Avertissement** : c'est la plateforme la plus verrouillée et la plus risquée. Le rapport effort/rendement est mauvais. Pour un besoin ponctuel, préférer **CrowdTangle successeur / Meta Content Library** ou, à défaut, l'archivage manuel via §8.

---

## 5. LinkedIn

| Dépôt | ⭐ | Langage | Usage | État |
|---|---|---|---|---|
| [joeyism/linkedin_scraper](https://github.com/joeyism/linkedin_scraper) | ~4 530 | Python | Profils, entreprises, postes. Selenium. | Actif |
| [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy) | ~4 320 | Python | Offres d'emploi LinkedIn + Indeed + Glassdoor + Google. Pertinent pour de l'analyse d'implantation d'acteurs (ONG, sociétés de sécurité, extractif). | Très actif |
| [josephlimtech/linkedin-profile-scraper-api](https://github.com/josephlimtech/linkedin-profile-scraper-api) | ~778 | TypeScript | Profil → JSON structuré, via Puppeteer. | Modéré |
| [austinoboyle/scrape-linkedin-selenium](https://github.com/austinoboyle/scrape-linkedin-selenium) | ~539 | Python | Profils personnels + pages entreprise → JSON. | Modéré |
| [linkedtales/scrapedin](https://github.com/linkedtales/scrapedin) | ~610 | JavaScript | Scraper historique. | Ancien |

**Avertissement** : LinkedIn bannit agressivement et détecte l'automatisation. Nécessite un cookie `li_at` de compte jetable. Intérêt limité pour la cartographie de conflits — surtout utile pour la cartographie d'acteurs institutionnels/économiques.

---

## 6. Telegram — priorité pour les zones couvertes

C'est le canal réel de diffusion pour les groupes armés au Sahel, au Moyen-Orient et en RDC. Contrairement aux autres plateformes, **l'API est officielle et ouverte** : pas de scraping fragile.

| Dépôt | ⭐ | Langage | Usage | État |
|---|---|---|---|---|
| [LonamiWebs/Telethon](https://github.com/LonamiWebs/Telethon) | ~12 000 | Python | Client MTProto complet : historique de canal, médias, métadonnées. **Dépôt GitHub archivé (fév. 2026) — le projet a migré sur [codeberg.org/Lonami/Telethon](https://codeberg.org/Lonami/Telethon)**, toujours maintenu. | Actif (Codeberg) |
| [kurigram-org/kurigram](https://github.com/kurigram-org/kurigram) | ~822 | Python | Fork maintenu de Pyrogram (Pyrogram lui-même est archivé). Alternative moderne à Telethon. | Actif |
| [gotd/td](https://github.com/gotd/td) | ~2 345 | Go | Client MTProto en Go, si la collecte doit être compilée/embarquée. | Actif |
| [prose-intelligence-ltd/Telepathy-Community](https://github.com/prose-intelligence-ltd/Telepathy-Community) | ~1 240 | Python | **Boîte à outils OSINT dédiée** : archivage de chats, cartographie de membres, export. | Actif |
| [ItIsMeCall911/Awesome-Telegram-OSINT](https://github.com/ItIsMeCall911/Awesome-Telegram-OSINT) | ~2 890 | — | Liste de référence d'outils, sites et ressources Telegram OSINT. | Maintenu |
| [The-Osint-Toolbox/Telegram-OSINT](https://github.com/The-Osint-Toolbox/Telegram-OSINT) | ~2 011 | — | Ressources, techniques et tradecraft Telegram. | Maintenu |
| [hamodywe/telegram-scraper-TeleGraphite](https://github.com/hamodywe/telegram-scraper-TeleGraphite) | ~290 | Python | Collecte de posts de canal → export JSON. Simple, directement branchable sur n8n. | Actif |

**Recommandation** : Telethon (Codeberg) ou Kurigram, en collecteur permanent sur une liste de canaux suivis → JSON → n8n. À mettre en place en premier.

---

## 7. Multi-plateformes et agrégation

| Dépôt | ⭐ | Langage | Usage |
|---|---|---|---|
| [DIYgod/RSSHub](https://github.com/DIYgod/RSSHub) | ~46 300 | TypeScript | **Convertit à peu près n'importe quoi en RSS** (X, Instagram, TikTok, Telegram, YouTube, Weibo…). Auto-hébergeable. La voie la plus simple pour brancher n8n sans écrire un seul scraper. |
| [NoblerWorks-HQ/IRONSIGHT](https://github.com/NoblerWorks-HQ/IRONSIGHT) | ~647 | TypeScript | Centre OSINT temps réel (théâtres Iran/Israël, Russie/Ukraine) : 50+ sources live — presse, Telegram, trafic aérien et naval, alertes missiles. **Très proche de l'usage Carto-MO : à étudier comme référence d'architecture.** |
| [shaikhsajid1111/social-media-profile-scrapers](https://github.com/shaikhsajid1111/social-media-profile-scrapers) | ~576 | Python | Profils sur Facebook, Instagram, TikTok, Twitter, Reddit, Quora, Pinterest — interface unique. |
| [kiryano/Scout](https://github.com/kiryano/Scout) | ~640 | Python | Instagram + TikTok + LinkedIn + Twitch → CSV. Orienté génération de leads (extraction d'e-mails) : **à éviter en l'état pour un usage OSINT conflit** (finalité RGPD incompatible). |
| [huginn/huginn](https://github.com/huginn/huginn) | ~50 000 | Ruby | Agents de surveillance et d'action. Alternative auto-hébergée à n8n, très éprouvée. |
| [n8n-io/n8n](https://github.com/n8n-io/n8n) | ~205 500 | TypeScript | Déjà en place dans le projet. |

---

## 8. Archivage et préservation de preuve

Indispensable dès lors que la donnée sert à un rapport analytique.

| Dépôt | ⭐ | Langage | Usage |
|---|---|---|---|
| [bellingcat/auto-archiver](https://github.com/bellingcat/auto-archiver) | ~1 120 | Python | **Le standard OSINT.** Archive automatiquement vidéos, images et contenus sociaux depuis une feuille Google Sheets ; hash, horodatage, stockage. Docker. |
| [bellingcat/auto-archiver-api](https://github.com/bellingcat/auto-archiver-api) | ~14 | Python | API (FastAPI + Celery) pour piloter l'auto-archiver en workers dédiés. |
| [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) | ~192 300 | Python | Téléchargement vidéo universel (TikTok, X, Instagram, Facebook, YouTube, Telegram…) avec métadonnées. Brique de base. |
| [mikf/gallery-dl](https://github.com/mikf/gallery-dl) | ~19 800 | Python | Équivalent pour les images et galeries, très large couverture de sites. |
| [imputnet/cobalt](https://github.com/imputnet/cobalt) | ~43 700 | Svelte | Service de récupération média multi-plateformes, auto-hébergeable, avec API. |
| [bellingcat/vk-url-scraper](https://github.com/bellingcat/vk-url-scraper) | ~54 | Python | VK — pertinent pour les sources russophones (Sahel, Wagner/Africa Corps). |

---

## 9. Frameworks génériques (sites de presse, communiqués, forums)

Pour tout ce qui n'est pas une plateforme sociale — et une bonne partie de la veille conflits passe par là.

| Dépôt | ⭐ | Langage | Usage |
|---|---|---|---|
| [firecrawl/firecrawl](https://github.com/firecrawl/firecrawl) | ~182 500 | TypeScript | Crawl + extraction structurée orientée LLM. Déjà disponible en MCP dans l'environnement de travail. |
| [unclecode/crawl4ai](https://github.com/unclecode/crawl4ai) | ~84 000 | Python | Crawler open source pensé pour alimenter un LLM. |
| [ScrapeGraphAI/Scrapegraph-ai](https://github.com/ScrapeGraphAI/Scrapegraph-ai) | ~31 200 | Python | Extraction pilotée par prompt — utile quand la structure des pages change souvent. |
| [apify/crawlee](https://github.com/apify/crawlee) | ~25 800 | TypeScript | Framework de crawl robuste : rotation de proxies, gestion de sessions, Playwright/Puppeteer. |
| [gocolly/colly](https://github.com/gocolly/colly) | ~25 500 | Go | Crawler performant et léger. |

---

## 10. Stack recommandée pour Carto-MO

Par ordre de mise en œuvre, du meilleur rapport valeur/risque au moins bon :

1. **Telegram — Telethon (Codeberg) ou Kurigram.** API officielle, source la plus riche pour Sahel / Moyen-Orient / RDC. Aucun risque de blocage. → à faire en premier.
2. **RSSHub auto-hébergé.** Couvre X, Instagram, TikTok, Telegram et YouTube en flux RSS normalisés, consommables directement par le nœud RSS de n8n. Un seul service à maintenir au lieu de cinq scrapers.
3. **yt-dlp + gallery-dl** en aval, pour figer les médias associés à chaque point validé.
4. **bellingcat/auto-archiver** pour la chaîne de preuve des points versés dans `veille.geojson`.
5. **twscrape** si X doit être couvert plus finement que ce que permet RSSHub.
6. **instaloader** si Instagram devient une source prioritaire (géotags exploitables en cartographie).
7. **TikTok** (`Douyin_TikTok_Download_API` en Docker) seulement si la zone suivie l'exige — coût de maintenance élevé.
8. **Facebook et LinkedIn** : ne pas industrialiser. Collecte manuelle ponctuelle + archivage.

### Point d'intégration

Le calque Veille lit `https://raw.githubusercontent.com/Aizen693/Carto-MO/veille-data/sahel/veille.geojson`
(voir `sahel/index.html`, constante `VEILLE_URL`).

Chaque collecteur doit donc produire un objet normalisé avant le passage n8n :

```json
{
  "source": "telegram|x|tiktok|instagram|facebook|web",
  "source_url": "https://t.me/<canal>/<id>",
  "author": "<canal ou compte>",
  "published_at": "2026-09-20T14:32:00Z",
  "collected_at": "2026-09-20T14:35:12Z",
  "text": "...",
  "media": ["<url ou chemin archivé>"],
  "lang": "fr",
  "geo_hint": "Ménaka, Mali",
  "content_hash": "sha256:..."
}
```

n8n se charge ensuite du géocodage (`geo_hint` → coordonnées), du scoring, de la validation humaine, puis de l'écriture en Feature GeoJSON sur la branche `veille-data`.

### Points d'attention techniques

- **Proxies résidentiels** obligatoires pour X, Instagram, TikTok et LinkedIn. Compter 50 à 200 $/mois selon le volume.
- **Pool de comptes jetables**, jamais nominatifs, créés sur des numéros dédiés.
- **Monitoring de casse** : une alerte si un collecteur renvoie 0 résultat sur 24 h (une casse silencieuse est le mode d'échec le plus courant).
- **Déduplication** par `content_hash` — le même événement est republié sur plusieurs canaux.
- **Détection de langue** avant traduction : arabe, français, haoussa, tamacheq, swahili, lingala selon la zone.

---

## 11. Alternatives commerciales

Si le coût de maintenance des scrapers dépasse le budget disponible :

- **Apify** — actors prêts à l'emploi pour toutes les plateformes citées, tarif à l'usage, API appelable depuis n8n.
- **Bright Data / Oxylabs** — jeux de données sociaux et API de scraping avec SLA.
- **Firecrawl** — déjà disponible en MCP dans ce projet, pour la partie web générique.

Le calcul est simple : un scraper non officiel coûte 2 à 5 h de maintenance par mois et par plateforme. Au-delà de trois plateformes, une offre commerciale revient généralement moins cher.
