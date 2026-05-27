#!/usr/bin/env python3
"""
Génère cas-demo.json avec ~200 publications, ~100 comptes, 12 clusters.
Inspiration : campagne Doppelganger documentée par Viginum/DFRLab.
Données fictives mais propagation, géoloc et timestamps cohérents.
"""

import json
import random
import datetime as dt

random.seed(42)  # reproductibilité

# ─── Géographie ─────────────────────────────────────────────
CITIES = {
    "RU-SPB":  ("Saint-Pétersbourg", "RU", 59.9311, 30.3609),
    "RU-MSK":  ("Moscou",            "RU", 55.7558, 37.6173),
    "RO-BUC":  ("Bucarest",          "RO", 44.4268, 26.1025),
    "RO-CLJ":  ("Cluj-Napoca",       "RO", 46.7712, 23.6236),
    "HU-BUD":  ("Budapest",          "HU", 47.4979, 19.0402),
    "HU-DEB":  ("Debrecen",          "HU", 47.5316, 21.6273),
    "RS-BEG":  ("Belgrade",          "RS", 44.7866, 20.4489),
    "RS-NSD":  ("Novi Sad",          "RS", 45.2671, 19.8335),
    "BG-SOF":  ("Sofia",             "BG", 42.6977, 23.3219),
    "BG-PDV":  ("Plovdiv",           "BG", 42.1354, 24.7453),
    "CZ-PRA":  ("Prague",            "CZ", 50.0755, 14.4378),
    "SK-BTS":  ("Bratislava",        "SK", 48.1486, 17.1077),
    "MD-CHS":  ("Chișinău",          "MD", 47.0105, 28.8638),
    "BY-MSK":  ("Minsk",             "BY", 53.9006, 27.5590),
    "DE-BER":  ("Berlin",            "DE", 52.5200, 13.4050),
    "DE-MUN":  ("Munich",            "DE", 48.1351, 11.5820),
    "DE-FRA":  ("Francfort",         "DE", 50.1109,  8.6821),
    "DE-HAM":  ("Hambourg",          "DE", 53.5511,  9.9937),
    "FR-PAR":  ("Paris",             "FR", 48.8566,  2.3522),
    "FR-LYO":  ("Lyon",              "FR", 45.7640,  4.8357),
    "FR-MRS":  ("Marseille",         "FR", 43.2965,  5.3698),
    "FR-TLS":  ("Toulouse",          "FR", 43.6047,  1.4442),
    "FR-BDX":  ("Bordeaux",          "FR", 44.8378, -0.5792),
    "FR-NCE":  ("Nice",              "FR", 43.7102,  7.2620),
    "FR-NTS":  ("Nantes",            "FR", 47.2184, -1.5536),
    "FR-STR":  ("Strasbourg",        "FR", 48.5734,  7.7521),
    "FR-LIL":  ("Lille",             "FR", 50.6292,  3.0573),
    "FR-MTP":  ("Montpellier",       "FR", 43.6109,  3.8772),
    "FR-REN":  ("Rennes",            "FR", 48.1173, -1.6778),
    "IT-ROM":  ("Rome",              "IT", 41.9028, 12.4964),
    "IT-MIL":  ("Milan",             "IT", 45.4642,  9.1900),
    "IT-NAP":  ("Naples",            "IT", 40.8518, 14.2681),
    "ES-MAD":  ("Madrid",            "ES", 40.4168, -3.7038),
    "ES-BCN":  ("Barcelone",         "ES", 41.3851,  2.1734),
    "BE-BRU":  ("Bruxelles",         "BE", 50.8503,  4.3517),
    "CH-GVA":  ("Genève",            "CH", 46.2044,  6.1432),
    "AT-VIE":  ("Vienne",            "AT", 48.2082, 16.3738),
    "PT-LIS":  ("Lisbonne",          "PT", 38.7223, -9.1393),
    "HK-HK":   ("Hong Kong",         "HK", 22.3193, 114.1694),  # hébergeur sites copie
    "AE-DXB":  ("Dubaï",             "AE", 25.2048, 55.2708),   # hébergeur secondaire
}

def jitter(lat, lon, amount=0.04):
    """Légère variation autour de la ville pour éviter superposition exacte."""
    return (lat + random.uniform(-amount, amount), lon + random.uniform(-amount, amount))

# ─── Comptes par cluster ────────────────────────────────────
CLUSTERS = {
    "patient-zero": {
        "nom": "Patient zéro",
        "couleur": "#6B3FA0",
        "pays_estime": "Russie (forum russophone)",
        "niveau_confiance": "Élevé (timestamp + textuel)",
        "notes": "Premier post horodaté. Texte source de toutes les reprises ultérieures. Identité de l'auteur non attribuable individuellement.",
        "comptes": [("@anonyme_pivot", "anonyme_pivot (RU)", "forum")],
        "ville": "RU-SPB",
    },
    "cluster-russie-amorce": {
        "nom": "Amorce Russie",
        "couleur": "#6B3FA0",
        "pays_estime": "Russie",
        "niveau_confiance": "Modéré",
        "notes": "Comptes russophones d'amorce. Reprises immédiates dans les 30-90 minutes après le patient zéro.",
        "comptes": [
            ("@kanal_news_ru", "Канал News RU", "telegram"),
            ("@vesti_pravda", "Вести Правда", "telegram"),
            ("@anon_msk_2", "anon_msk_2", "forum"),
            ("@pravda_today_ru", "Pravda Today RU", "x"),
        ],
        "ville": "RU-MSK",
    },
    "cluster-bucarest": {
        "nom": "Cluster Bucarest",
        "couleur": "#8B5FBF",
        "pays_estime": "Roumanie",
        "niveau_confiance": "Élevé",
        "notes": "Cluster le mieux documenté. Comptes coordonnés, activité quotidienne, fuseau UTC+2/+3. Premiers relais hors RU.",
        "comptes": [
            ("@relai_news_ro", "Relais News RO", "telegram"),
            ("@info_ro_24", "Info RO 24", "telegram"),
            ("@news_ro_alt", "News RO Alternatif", "telegram"),
            ("@ro_patriot_news", "RO Patriot News", "telegram"),
            ("@bucuresti_today", "București Today", "x"),
            ("@adevarul_alt", "Adevărul Alt", "x"),
            ("@romania_libera_alt", "România Liberă Alt", "telegram"),
            ("@cluj_info_ro", "Cluj Info RO", "telegram"),
        ],
        "ville": "RO-BUC",
    },
    "cluster-budapest": {
        "nom": "Cluster Budapest",
        "couleur": "#2E84D4",
        "pays_estime": "Hongrie",
        "niveau_confiance": "Modéré",
        "notes": "Pont linguistique vers DE. Comptes pro-russes documentés par Atlatszo et Political Capital.",
        "comptes": [
            ("@vesti_hu_x", "Vesti HU", "x"),
            ("@hir_hu_24", "Hír HU 24", "x"),
            ("@magyar_news_alt", "Magyar News Alt", "telegram"),
            ("@budapest_post", "Budapest Post", "telegram"),
            ("@hu_patriot_24", "HU Patriot 24", "x"),
            ("@magyar_idok_alt", "Magyar Idők Alt", "telegram"),
        ],
        "ville": "HU-BUD",
    },
    "cluster-belgrade": {
        "nom": "Cluster Belgrade",
        "couleur": "#5650C6",
        "pays_estime": "Serbie",
        "niveau_confiance": "Modéré",
        "notes": "Cluster secondaire. Activé pour les narratifs N02 et N03. Lien possible avec écosystème SputnikSerbia.",
        "comptes": [
            ("@srpski_info", "Srpski Info", "telegram"),
            ("@srbija_news", "Srbija News", "telegram"),
            ("@beograd_24", "Beograd 24", "x"),
            ("@vesti_rs_alt", "Vesti RS Alt", "telegram"),
            ("@srpski_patriot", "Srpski Patriot", "x"),
            ("@novosti_rs_24", "Novosti RS 24", "telegram"),
            ("@novi_sad_news", "Novi Sad News", "telegram"),
        ],
        "ville": "RS-BEG",
    },
    "cluster-sofia": {
        "nom": "Cluster Sofia",
        "couleur": "#7180C8",
        "pays_estime": "Bulgarie",
        "niveau_confiance": "Modéré",
        "notes": "Cluster bulgare. Activité ralentie mais persistante. Recouvrement narratif avec Belgrade.",
        "comptes": [
            ("@bg_news_alt", "BG News Alt", "telegram"),
            ("@sofia_24", "Sofia 24", "telegram"),
            ("@bulgaria_today_alt", "Bulgaria Today Alt", "x"),
            ("@plovdiv_news", "Plovdiv News", "telegram"),
            ("@bg_patriot", "BG Patriot", "x"),
        ],
        "ville": "BG-SOF",
    },
    "cluster-prague": {
        "nom": "Cluster Prague",
        "couleur": "#4FA0A0",
        "pays_estime": "Tchéquie",
        "niveau_confiance": "Faible-Modéré",
        "notes": "Cluster tchèque émergent. Volume faible mais comptes coordonnés. Lien avec écosystème Aeronet documenté.",
        "comptes": [
            ("@cz_alt_news", "CZ Alt News", "telegram"),
            ("@praha_post_alt", "Praha Post Alt", "x"),
            ("@cesko_info", "Česko Info", "telegram"),
            ("@cz_patriot_24", "CZ Patriot 24", "x"),
        ],
        "ville": "CZ-PRA",
    },
    "cluster-bratislava": {
        "nom": "Cluster Bratislava",
        "couleur": "#3FA0A0",
        "pays_estime": "Slovaquie",
        "niveau_confiance": "Faible-Modéré",
        "notes": "Cluster slovaque. Faible volume. Active essentiellement pour le narratif N02.",
        "comptes": [
            ("@sk_news_alt", "SK News Alt", "telegram"),
            ("@bratislava_today", "Bratislava Today", "x"),
            ("@slovensko_24", "Slovensko 24", "telegram"),
        ],
        "ville": "SK-BTS",
    },
    "cluster-chisinau": {
        "nom": "Cluster Chișinău",
        "couleur": "#74C4C4",
        "pays_estime": "Moldavie",
        "niveau_confiance": "Modéré",
        "notes": "Cluster moldave (russophone). Reprises bilingues RU/RO. Documenté par WatchDog.MD.",
        "comptes": [
            ("@md_news_ru", "MD News RU", "telegram"),
            ("@chisinau_24", "Chișinău 24", "telegram"),
            ("@moldova_alt", "Moldova Alt", "x"),
            ("@md_patriot", "MD Patriot", "telegram"),
        ],
        "ville": "MD-CHS",
    },
    "cluster-minsk": {
        "nom": "Cluster Minsk",
        "couleur": "#A7B0E0",
        "pays_estime": "Bélarus",
        "niveau_confiance": "Modéré",
        "notes": "Cluster bélarusse. Reprises russophones, écho intra-CEI. Activité plus faible mais coordonnée.",
        "comptes": [
            ("@by_pravda", "BY Pravda", "telegram"),
            ("@minsk_news_alt", "Minsk News Alt", "telegram"),
            ("@belarus_24", "Belarus 24", "x"),
        ],
        "ville": "BY-MSK",
    },
    "sites-copie": {
        "nom": "Sites copie (faux médias)",
        "couleur": "#C94A4A",
        "pays_estime": "Hébergement RU/HK",
        "niveau_confiance": "Élevé (template identique × 12)",
        "notes": "Articles avec template CMS identique, polices et structure communes. Dispositif type Doppelganger documenté par Viginum.",
        "comptes": [
            ("site-copie-lemonde-faux", "Faux Le Monde", "site_copie", "RU-MSK"),
            ("site-copie-figaro-faux", "Faux Le Figaro", "site_copie", "RU-MSK"),
            ("site-copie-zeit-faux", "Faux Die Zeit", "site_copie", "RU-MSK"),
            ("site-copie-spiegel-faux", "Faux Der Spiegel", "site_copie", "HK-HK"),
            ("site-copie-bild-faux", "Faux Bild", "site_copie", "HK-HK"),
            ("site-copie-corriere-faux", "Faux Corriere", "site_copie", "HK-HK"),
            ("site-copie-elpais-faux", "Faux El País", "site_copie", "AE-DXB"),
            ("site-copie-guardian-faux", "Faux Guardian", "site_copie", "AE-DXB"),
        ],
        "ville": "RU-MSK",  # par défaut
    },
    "amplificateurs-fr": {
        "nom": "Amplificateurs francophones",
        "couleur": "#5A8FA8",
        "pays_estime": "France (audience cible)",
        "niveau_confiance": "Faible (origine réelle indéterminée)",
        "notes": "Comptes francophones, mix de bots et d'audiences relais convaincues. Pas de preuve directe de coordination avec les clusters Est ; comportement d'écho.",
        "comptes": [
            ("@actu_alternative_fr", "Actu Alternative FR", "x", "FR-PAR"),
            ("@info_libre_fr", "Info Libre FR", "x", "FR-LYO"),
            ("@canal_fr_libre", "Canal FR Libre", "telegram", "FR-MRS"),
            ("@verite_eu", "Vérité EU", "x", "FR-TLS"),
            ("@reveil_citoyen", "Réveil Citoyen", "x", "FR-BDX"),
            ("@fr_patriot_24", "FR Patriot 24", "x", "FR-NCE"),
            ("@actu_franco_alt", "Actu Franco Alt", "telegram", "FR-PAR"),
            ("@info_paris_libre", "Info Paris Libre", "x", "FR-PAR"),
            ("@lyon_news_alt", "Lyon News Alt", "telegram", "FR-LYO"),
            ("@marseille_post", "Marseille Post", "x", "FR-MRS"),
            ("@strasbourg_info_alt", "Strasbourg Info Alt", "telegram", "FR-STR"),
            ("@nantes_today", "Nantes Today", "x", "FR-NTS"),
            ("@lille_news_alt", "Lille News Alt", "telegram", "FR-LIL"),
            ("@montpellier_alt", "Montpellier Alt", "x", "FR-MTP"),
            ("@rennes_info_alt", "Rennes Info Alt", "telegram", "FR-REN"),
            ("@toulouse_post", "Toulouse Post", "x", "FR-TLS"),
            ("@bordeaux_alt", "Bordeaux Alt", "telegram", "FR-BDX"),
            ("@nice_news_alt", "Nice News Alt", "x", "FR-NCE"),
            ("@dissidence_fr", "Dissidence FR", "x", "FR-PAR"),
            ("@francophone_libre", "Francophone Libre", "telegram", "FR-PAR"),
            ("@hexagone_news", "Hexagone News", "x", "FR-LYO"),
            ("@info_souverain_fr", "Info Souverain FR", "x", "FR-MRS"),
            ("@geopolitique_fr_alt", "Géopolitique FR Alt", "telegram", "FR-PAR"),
            ("@actu_libre_fr_24", "Actu Libre FR 24", "x", "FR-BDX"),
            ("@medias_libres_fr", "Médias Libres FR", "telegram", "FR-TLS"),
            ("@info_resistante", "Info Résistante", "x", "FR-PAR"),
        ],
        "ville": "FR-PAR",  # par défaut
    },
    "amplificateurs-de": {
        "nom": "Amplificateurs DE",
        "couleur": "#8B5FBF",
        "pays_estime": "Allemagne",
        "niveau_confiance": "Faible-Modéré",
        "notes": "Pont germanophone. Quelques comptes documentés par CeMAS et Center for Monitoring, Analysis and Strategy.",
        "comptes": [
            ("@de_alt_news", "DE Alt News", "x", "DE-BER"),
            ("@deutschland_24", "Deutschland 24", "telegram", "DE-BER"),
            ("@berlin_post_alt", "Berlin Post Alt", "x", "DE-BER"),
            ("@muenchen_info", "München Info", "telegram", "DE-MUN"),
            ("@frankfurt_alt", "Frankfurt Alt", "x", "DE-FRA"),
            ("@hamburg_news_alt", "Hamburg News Alt", "telegram", "DE-HAM"),
            ("@de_patriot_24", "DE Patriot 24", "x", "DE-BER"),
            ("@dissidenz_de", "Dissidenz DE", "telegram", "DE-MUN"),
            ("@deutsche_stimme_alt", "Deutsche Stimme Alt", "x", "DE-BER"),
        ],
        "ville": "DE-BER",
    },
    "amplificateurs-it": {
        "nom": "Amplificateurs IT",
        "couleur": "#D4A672",
        "pays_estime": "Italie",
        "niveau_confiance": "Faible",
        "notes": "Quelques comptes italophones relais. Volume limité mais cohérent dans le temps.",
        "comptes": [
            ("@italia_alt", "Italia Alt", "x", "IT-ROM"),
            ("@roma_news_alt", "Roma News Alt", "telegram", "IT-ROM"),
            ("@milano_post", "Milano Post", "x", "IT-MIL"),
            ("@napoli_24_alt", "Napoli 24 Alt", "telegram", "IT-NAP"),
            ("@verita_it", "Verità IT", "x", "IT-MIL"),
        ],
        "ville": "IT-ROM",
    },
    "amplificateurs-es": {
        "nom": "Amplificateurs ES",
        "couleur": "#B57F4F",
        "pays_estime": "Espagne",
        "niveau_confiance": "Faible",
        "notes": "Petits comptes hispanophones de relais. Volume marginal.",
        "comptes": [
            ("@espana_alt", "España Alt", "x", "ES-MAD"),
            ("@madrid_news_alt", "Madrid News Alt", "telegram", "ES-MAD"),
            ("@barcelona_info_alt", "Barcelona Info Alt", "x", "ES-BCN"),
            ("@verdad_es", "Verdad ES", "telegram", "ES-MAD"),
        ],
        "ville": "ES-MAD",
    },
    "amplificateurs-divers": {
        "nom": "Amplificateurs divers",
        "couleur": "#3F4CA0",
        "pays_estime": "BE / CH / AT / PT",
        "niveau_confiance": "Faible",
        "notes": "Petits relais isolés en Belgique, Suisse, Autriche, Portugal. Faible coordination apparente.",
        "comptes": [
            ("@bruxelles_alt", "Bruxelles Alt", "x", "BE-BRU"),
            ("@geneva_info_alt", "Geneva Info Alt", "telegram", "CH-GVA"),
            ("@wien_post_alt", "Wien Post Alt", "x", "AT-VIE"),
            ("@lisboa_news_alt", "Lisboa News Alt", "telegram", "PT-LIS"),
        ],
        "ville": "BE-BRU",
    },
}

# ─── Narratifs ─────────────────────────────────────────────
NARRATIFS = [
    "Allégations sanitaires fabriquées sur les produits (contamination, ingrédient toxique inventé)",
    "Mise en cause personnelle d'un dirigeant via faux documents",
    "Lien fabriqué avec une commande publique européenne controversée",
    "Accusation de greenwashing et pratiques industrielles douteuses",
    "Mise en cause de la chaîne d'approvisionnement et travail forcé prétendu",
    "Narratif géopolitique : prétendus liens avec un Etat tiers",
]

EXCERPTS_TPL = [
    "Reprise mot-pour-mot du contenu source (similarité textuelle > 90%).",
    "Adaptation linguistique du message d'origine, structure narrative préservée.",
    "Citation du faux site comme source primaire. Audience moyenne pour le canal.",
    "Amplification en cascade dans la fenêtre d'activité quotidienne.",
    "Post de relai standard, image et caption identiques à la chaîne amont.",
    "Reprise tardive avec ajout d'une accusation secondaire.",
    "Variation du narratif principal pour cibler une audience locale.",
    "Continuation du fil de publications avec hashtags coordonnés.",
    "Volume habituel pour ce canal. Pas de pic anormal.",
    "Pic de visibilité pour le compte (top 5% de ses publications du mois).",
    "Citation explicite d'un compte amont du même cluster.",
    "Reprise après silence de 48h, signe possible d'une instruction coordonnée.",
]

PLATEFORMES_BY_TYPE = {
    "forum": ["forum-anon-redacted.example/thread/", "anon-board-redacted.example/post/"],
    "telegram": ["t.me/{handle}-redacted/"],
    "x": ["x.com/{handle}-redacted/status/"],
    "site_copie": ["{handle}.example/article/"],
}

# ─── Génération ────────────────────────────────────────────
def build():
    pubs = []
    pid = 0
    def next_id():
        nonlocal pid
        pid += 1
        return f"p{pid:03d}"

    # Patient zéro — 14 fév 03h12
    pz_compte = CLUSTERS["patient-zero"]["comptes"][0]
    pz_city = CITIES[CLUSTERS["patient-zero"]["ville"]]
    pz_lat, pz_lon = jitter(pz_city[2], pz_city[3])
    pz_id = next_id()
    pubs.append({
        "id": pz_id,
        "url": "https://forum-anon-redacted.example/thread/49823",
        "plateforme": pz_compte[2],
        "compte": pz_compte[0],
        "compte_display": pz_compte[1],
        "date": "2026-02-14T03:12:00Z",
        "lang": "ru", "pays": pz_city[1], "ville": pz_city[0],
        "lat": round(pz_lat, 4), "lon": round(pz_lon, 4),
        "type": "patient_zero", "parent_id": None,
        "audience_estimee": 1450,
        "content_excerpt": "Premier post du fil. Texte source de toutes les reprises ultérieures (matched n-gram 8/8). Allégation initiale élaborée.",
    })

    # ───── Cluster Russie amorce — 30 min à 4h après PZ ─────
    russie_pubs = []
    for i, compte in enumerate(CLUSTERS["cluster-russie-amorce"]["comptes"]):
        city = CITIES[CLUSTERS["cluster-russie-amorce"]["ville"]]
        lat, lon = jitter(city[2], city[3])
        minutes_offset = 35 + i * 50 + random.randint(-12, 18)
        date = dt.datetime(2026, 2, 14, 3, 12) + dt.timedelta(minutes=minutes_offset)
        pid_ = next_id()
        pubs.append({
            "id": pid_, "url": f"https://t.me/{compte[0].lstrip('@')}-redacted/{1000+i*23}",
            "plateforme": compte[2], "compte": compte[0], "compte_display": compte[1],
            "date": date.isoformat() + "Z",
            "lang": "ru", "pays": city[1], "ville": city[0],
            "lat": round(lat, 4), "lon": round(lon, 4),
            "type": "relai", "parent_id": pz_id,
            "audience_estimee": random.randint(4000, 35000),
            "content_excerpt": "Reprise russophone immédiate. Diffusion d'amorce.",
        })
        russie_pubs.append(pid_)

    # ───── Clusters Est (Bucarest, Budapest, Belgrade, Sofia, Prague, Bratislava, Chisinau, Minsk) ─────
    east_cluster_keys = [
        "cluster-bucarest", "cluster-budapest", "cluster-belgrade",
        "cluster-sofia", "cluster-prague", "cluster-bratislava",
        "cluster-chisinau", "cluster-minsk",
    ]
    cluster_first_id = {}
    cluster_pubs = {k: [] for k in east_cluster_keys}

    # Premier passage : chaque cluster crée ses premiers relais (jour 1)
    for k in east_cluster_keys:
        cluster = CLUSTERS[k]
        city = CITIES[cluster["ville"]]
        parent_pool = [pz_id] + russie_pubs
        for j, compte in enumerate(cluster["comptes"]):
            lat, lon = jitter(city[2], city[3])
            parent = random.choice(parent_pool)
            # Time spread on day 1 (hours 5-22)
            hour = 5 + random.randint(0, 17)
            minute = random.randint(0, 59)
            date = dt.datetime(2026, 2, 14, hour, minute)
            pid_ = next_id()
            lang_map = {"RO":"ro","HU":"hu","RS":"sr","BG":"bg","CZ":"cs","SK":"sk","MD":"ro","BY":"ru"}
            pub = {
                "id": pid_, "url": f"https://t.me/{compte[0].lstrip('@')}-redacted/{2000+j*17}",
                "plateforme": compte[2], "compte": compte[0], "compte_display": compte[1],
                "date": date.isoformat() + "Z",
                "lang": lang_map.get(city[1], "ru"), "pays": city[1], "ville": city[0],
                "lat": round(lat, 4), "lon": round(lon, 4),
                "type": "relai", "parent_id": parent,
                "audience_estimee": random.randint(3500, 25000),
                "content_excerpt": random.choice(EXCERPTS_TPL),
            }
            pubs.append(pub)
            cluster_pubs[k].append(pid_)
            if k not in cluster_first_id:
                cluster_first_id[k] = pid_

    # ───── Sites copie — jour 1-5, plusieurs articles par site ─────
    sc_cluster = CLUSTERS["sites-copie"]
    sc_pubs = []
    for j, compte in enumerate(sc_cluster["comptes"]):
        # 2 articles par site
        for k_art in range(2):
            ville_key = compte[3]
            city = CITIES[ville_key]
            lat, lon = jitter(city[2], city[3])
            day_offset = 2 + k_art * 7 + random.randint(0, 3)
            date = dt.datetime(2026, 2, 14, 9, 0) + dt.timedelta(days=day_offset, hours=random.randint(-3, 7))
            # parent : un relai aléatoire d'un cluster Est
            parent = random.choice(cluster_pubs[random.choice(east_cluster_keys)])
            lang_map = {"lemonde":"fr","figaro":"fr","zeit":"de","spiegel":"de","bild":"de","corriere":"it","elpais":"es","guardian":"en"}
            lang_pick = "fr"
            for key, lang in lang_map.items():
                if key in compte[0]:
                    lang_pick = lang
                    break
            pid_ = next_id()
            pubs.append({
                "id": pid_, "url": f"https://{compte[0]}.example/article/n{j*2+k_art:03d}",
                "plateforme": "site_copie", "compte": compte[0], "compte_display": compte[1],
                "date": date.isoformat() + "Z",
                "lang": lang_pick, "pays": city[1], "ville": city[0] + " (hébergement)",
                "lat": round(lat, 4), "lon": round(lon, 4),
                "type": "site_copie", "parent_id": parent,
                "audience_estimee": random.randint(3500, 14000),
                "content_excerpt": "Article fabriqué. Template CMS identique aux autres sites du dispositif. Mêmes signatures DNS et hébergement.",
            })
            sc_pubs.append(pid_)

    # ───── Amplificateurs (FR, DE, IT, ES, divers) — jour 2 à fin ─────
    amp_clusters = ["amplificateurs-fr", "amplificateurs-de", "amplificateurs-it", "amplificateurs-es", "amplificateurs-divers"]
    amp_pubs = []
    for k in amp_clusters:
        cluster = CLUSTERS[k]
        lang_map = {"amplificateurs-fr":"fr","amplificateurs-de":"de","amplificateurs-it":"it","amplificateurs-es":"es","amplificateurs-divers":"fr"}
        for j, compte in enumerate(cluster["comptes"]):
            # 1-3 publications par compte sur la période
            n_publis = random.choices([1, 2, 3], weights=[2, 3, 1])[0]
            for kp in range(n_publis):
                ville_key = compte[3] if len(compte) >= 4 else cluster["ville"]
                city = CITIES[ville_key]
                lat, lon = jitter(city[2], city[3])
                day_offset = 1 + random.randint(0, 50) + kp * random.randint(3, 10)
                day_offset = min(day_offset, 53)
                date = dt.datetime(2026, 2, 14, 9, 0) + dt.timedelta(days=day_offset, hours=random.randint(-7, 10), minutes=random.randint(0, 59))
                # parent : un relai Est, un site copie ou un autre amplificateur déjà créé
                parent_pool = sum(cluster_pubs.values(), []) + sc_pubs + amp_pubs[-20:]
                parent = random.choice(parent_pool)
                pid_ = next_id()
                pubs.append({
                    "id": pid_,
                    "url": f"https://x.com/{compte[0].lstrip('@')}-redacted/status/{1700000000+j*1000+kp}" if compte[2] == "x" else f"https://t.me/{compte[0].lstrip('@')}-redacted/{3000+j*7+kp}",
                    "plateforme": compte[2], "compte": compte[0], "compte_display": compte[1],
                    "date": date.isoformat() + "Z",
                    "lang": lang_map[k], "pays": city[1], "ville": city[0],
                    "lat": round(lat, 4), "lon": round(lon, 4),
                    "type": "amplificateur", "parent_id": parent,
                    "audience_estimee": random.randint(4000, 48000),
                    "content_excerpt": random.choice(EXCERPTS_TPL),
                })
                amp_pubs.append(pid_)

    # ───── Relances dans les clusters Est sur jours 5-50 ─────
    for k in east_cluster_keys:
        for compte in CLUSTERS[k]["comptes"]:
            # 0-3 relances par compte sur la période
            n_rel = random.choices([0, 1, 2, 3], weights=[3, 4, 3, 1])[0]
            for kp in range(n_rel):
                city = CITIES[CLUSTERS[k]["ville"]]
                lat, lon = jitter(city[2], city[3])
                day_offset = 5 + random.randint(0, 48)
                date = dt.datetime(2026, 2, 14, 7, 0) + dt.timedelta(days=day_offset, hours=random.randint(-3, 12), minutes=random.randint(0, 59))
                parent_pool = cluster_pubs[k] + sc_pubs
                parent = random.choice(parent_pool)
                lang_map = {"RO":"ro","HU":"hu","RS":"sr","BG":"bg","CZ":"cs","SK":"sk","MD":"ro","BY":"ru"}
                pid_ = next_id()
                pubs.append({
                    "id": pid_,
                    "url": f"https://t.me/{compte[0].lstrip('@')}-redacted/{4000+kp*13}",
                    "plateforme": compte[2], "compte": compte[0], "compte_display": compte[1],
                    "date": date.isoformat() + "Z",
                    "lang": lang_map.get(city[1], "ru"), "pays": city[1], "ville": city[0],
                    "lat": round(lat, 4), "lon": round(lon, 4),
                    "type": "relai", "parent_id": parent,
                    "audience_estimee": random.randint(2500, 18000),
                    "content_excerpt": "Relance. " + random.choice(EXCERPTS_TPL),
                })
                cluster_pubs[k].append(pid_)

    return pubs, cluster_pubs, sc_pubs, amp_pubs, russie_pubs, pz_id


def main():
    pubs, cluster_pubs, sc_pubs, amp_pubs, russie_pubs, pz_id = build()
    # tri par date pour timeline propre
    pubs.sort(key=lambda p: p["date"])

    # Comptes uniques
    comptes_uniques = set()
    pays_set = set()
    for p in pubs:
        comptes_uniques.add(p["compte"])
        pays_set.add(p["pays"])

    # Build reseaux
    reseaux = []
    for k, c in CLUSTERS.items():
        if k == "patient-zero":
            pub_ids = [pz_id]
            comptes_ids = [x[0] for x in c["comptes"]]
        elif k == "cluster-russie-amorce":
            pub_ids = russie_pubs
            comptes_ids = [x[0] for x in c["comptes"]]
        elif k.startswith("amplificateurs-"):
            comptes_in_cluster = [x[0] for x in c["comptes"]]
            pub_ids = [p["id"] for p in pubs if p["compte"] in comptes_in_cluster]
            comptes_ids = comptes_in_cluster
        elif k == "sites-copie":
            pub_ids = sc_pubs
            comptes_ids = [x[0] for x in c["comptes"]]
        else:  # clusters Est
            pub_ids = cluster_pubs.get(k, [])
            comptes_ids = [x[0] for x in c["comptes"]]
        reseaux.append({
            "id": k,
            "nom": c["nom"],
            "comptes": comptes_ids,
            "publications": pub_ids,
            "pays_estime": c["pays_estime"],
            "niveau_confiance": c["niveau_confiance"],
            "couleur": c["couleur"],
            "notes": c["notes"],
        })

    out = {
        "campagne": {
            "id": "demo-lumiere-2026",
            "nom": "Campagne anti-Société Lumière",
            "client": "Société Lumière (fictif — cas démo anonymisé)",
            "secteur": "Cosmétique / Grande consommation",
            "date_debut": "2026-02-14",
            "date_fin": "2026-04-10",
            "publications_total": len(pubs),
            "comptes_total": len(comptes_uniques),
            "pays_implique": sorted(pays_set),
            "resume": (
                "Vague de désinformation coordonnée alléguant la nocivité des produits du groupe, "
                "propagée par un réseau structuré originaire d'Europe de l'Est. Huit clusters géographiques "
                "identifiés (Bucarest, Budapest, Belgrade, Sofia, Prague, Bratislava, Chișinău, Minsk), "
                "douze sites copie (template Doppelganger) et près de cinquante comptes amplificateurs "
                "francophones. Patient zéro tracé à un forum russophone, 14 février 2026 à 03h12 UTC — "
                "soit environ quatre heures avant la première reprise francophone."
            ),
            "narratifs": NARRATIFS,
            "methodologie": (
                "Reconstruction de la chaîne par recoupement timestamp + n-grams 8 mots + traceback des "
                "reprises mot-pour-mot. Géolocalisation par fuseau d'activité, langue, mentions, bio, "
                "plateformes. Inspiration : Viginum (2023-2025), DFRLab, EU DisinfoLab, CeMAS, Atlatszo, "
                "Political Capital, WatchDog.MD."
            ),
            "niveau_confiance_attribution": "Élevé (clusters Bucarest, Belgrade, Sites copie), Modéré (Budapest, Sofia, Chișinău, Minsk), Faible (Prague, Bratislava, amplificateurs FR/DE/IT/ES)",
        },
        "publications": pubs,
        "patient_zero": pz_id,
        "reseaux": reseaux,
    }
    print(f"Publications: {len(pubs)}, Comptes uniques: {len(comptes_uniques)}, Pays: {len(pays_set)}, Clusters: {len(reseaux)}")
    with open("cas-demo.json", "w") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
