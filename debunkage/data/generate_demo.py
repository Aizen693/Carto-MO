#!/usr/bin/env python3
"""
Génère cas-demo.json — campagne de désinformation fictive visant un groupe de
boissons présent sur cinq marchés africains (Sénégal, Gabon, Angola, Éthiopie,
Madagascar), amplifiée par la diaspora francophone et lusophone.
Cadrage défensif : on cartographie/débunke la campagne pour le compte de la cible.
Données fictives mais propagation, géoloc et timestamps cohérents.
Inspiration méthodologique : Viginum, DFRLab, EU DisinfoLab, Code for Africa, Africa Check.
"""

import json
import random
import datetime as dt

random.seed(42)  # reproductibilité

# ─── Géographie ─────────────────────────────────────────────
CITIES = {
    # Marchés africains ciblés
    "SN-DKR":  ("Dakar",            "SN", 14.7167, -17.4677),
    "SN-THS":  ("Thiès",            "SN", 14.7910, -16.9359),
    "GA-LBV":  ("Libreville",       "GA",  0.4162,   9.4673),
    "GA-POG":  ("Port-Gentil",      "GA", -0.7193,   8.7815),
    "AO-LAD":  ("Luanda",           "AO", -8.8390,  13.2894),
    "AO-HBO":  ("Huambo",           "AO", -12.7761, 15.7392),
    "ET-ADD":  ("Addis-Abeba",      "ET",  9.0320,  38.7469),
    "ET-DRE":  ("Dire Dawa",        "ET",  9.5931,  41.8661),
    "MG-TNR":  ("Antananarivo",     "MG", -18.8792, 47.5079),
    "MG-TMM":  ("Toamasina",        "MG", -18.1492, 49.4023),
    # Diaspora francophone (audience cible)
    "FR-PAR":  ("Paris",            "FR", 48.8566,   2.3522),
    "FR-LYO":  ("Lyon",             "FR", 45.7640,   4.8357),
    "FR-MRS":  ("Marseille",        "FR", 43.2965,   5.3698),
    "FR-BDX":  ("Bordeaux",         "FR", 44.8378,  -0.5792),
    "FR-LIL":  ("Lille",            "FR", 50.6292,   3.0573),
    "BE-BRU":  ("Bruxelles",        "BE", 50.8503,   4.3517),
    # Diaspora lusophone (relais Angola)
    "PT-LIS":  ("Lisbonne",         "PT", 38.7223,  -9.1393),
    "BR-SAO":  ("São Paulo",        "BR", -23.5505, -46.6333),
    # Hébergeurs des faux médias (offshore)
    "NL-AMS":  ("Amsterdam",        "NL", 52.3676,   4.9041),
    "HK-HK":   ("Hong Kong",        "HK", 22.3193, 114.1694),
    "AE-DXB":  ("Dubaï",            "AE", 25.2048,  55.2708),
}

def jitter(lat, lon, amount=0.12):
    """Variation autour de la ville pour former un essaim visible quand on dézoome.
    Distribution gaussienne pour densifier le centre."""
    return (
        lat + random.gauss(0, amount * 0.55),
        lon + random.gauss(0, amount * 0.55)
    )

# Langue dominante par pays
LANG_PAYS = {
    "SN": "fr", "GA": "fr", "AO": "pt", "ET": "am", "MG": "mg",
    "FR": "fr", "BE": "fr", "PT": "pt", "BR": "pt",
    "NL": "fr", "HK": "fr", "AE": "fr",
}

# ─── Comptes par cluster ────────────────────────────────────
CLUSTERS = {
    "patient-zero": {
        "nom": "Patient zéro",
        "couleur": "#6B3FA0",
        "pays_estime": "Signaux ambigus (compte anonyme)",
        "niveau_confiance": "Faible (origine réelle indéterminée)",
        "notes": "Premier post horodaté. Texte source de toutes les reprises ultérieures (matched n-gram 8/8). Identité de l'auteur non attribuable individuellement ; signaux d'activité ambigus.",
        "comptes": [("@veille_conso_afrique", "Veille Conso Afrique", "facebook")],
        "ville": "SN-DKR",
    },
    "cluster-dakar": {
        "nom": "Cluster Dakar",
        "couleur": "#8B5FBF",
        "pays_estime": "Sénégal",
        "niveau_confiance": "Élevé",
        "notes": "Cluster le mieux documenté et plaque tournante de la diffusion : alimente les autres marchés et porte les relances. Comptes coordonnés, activité quotidienne, fuseau UTC+0.",
        "comptes": [
            ("@actu_dakar_alt", "Actu Dakar Alt", "facebook"),
            ("@senego_buzz", "Senego Buzz", "x"),
            ("@teranga_news_alt", "Teranga News Alt", "facebook"),
            ("@dakar_info_24", "Dakar Info 24", "telegram"),
            ("@wolof_news_tv", "Wolof News TV", "tiktok"),
            ("@senenews_alt", "SeneNews Alt", "facebook"),
            ("@sn_patriote_24", "SN Patriote 24", "x"),
        ],
        "ville": "SN-DKR",
    },
    "cluster-libreville": {
        "nom": "Cluster Libreville",
        "couleur": "#2E84D4",
        "pays_estime": "Gabon",
        "niveau_confiance": "Élevé",
        "notes": "Relais gabonais, diffusion mixte Facebook + chaînes de messagerie (WhatsApp). Porte la variante sociale du narratif.",
        "comptes": [
            ("@gabon_infos_24", "Gabon Infos 24", "facebook"),
            ("@241_alerte", "241 Alerte", "whatsapp"),
            ("@libreville_post", "Libreville Post", "x"),
            ("@gabon_actu_alt", "Gabon Actu Alt", "facebook"),
            ("@info_241_libre", "Info 241 Libre", "telegram"),
        ],
        "ville": "GA-LBV",
    },
    "cluster-luanda": {
        "nom": "Cluster Luanda",
        "couleur": "#5650C6",
        "pays_estime": "Angola",
        "niveau_confiance": "Modéré",
        "notes": "Premier saut linguistique (portugais). Reprend aussi le faux communiqué de la deuxième vague. Lien possible avec écosystème lusophone.",
        "comptes": [
            ("@angola_noticias_alt", "Angola Notícias Alt", "facebook"),
            ("@luanda_24h", "Luanda 24h", "x"),
            ("@ao_verdade", "AO Verdade", "telegram"),
            ("@angola_hoje_alt", "Angola Hoje Alt", "facebook"),
            ("@kwanza_news", "Kwanza News", "x"),
        ],
        "ville": "AO-LAD",
    },
    "cluster-addis": {
        "nom": "Cluster Addis-Abeba",
        "couleur": "#7180C8",
        "pays_estime": "Éthiopie",
        "niveau_confiance": "Modéré",
        "notes": "Saut linguistique vers l'amharique. Porte le narratif environnemental. Forte composante Telegram/TikTok.",
        "comptes": [
            ("@addis_voice", "Addis Voice", "facebook"),
            ("@ethio_trend", "Ethio Trend", "telegram"),
            ("@addis_zena_alt", "Addis Zena Alt", "facebook"),
            ("@ethio_news_24", "Ethio News 24", "x"),
            ("@habesha_info_tv", "Habesha Info TV", "tiktok"),
        ],
        "ville": "ET-ADD",
    },
    "cluster-antananarivo": {
        "nom": "Cluster Antananarivo",
        "couleur": "#4FA0A0",
        "pays_estime": "Madagascar",
        "niveau_confiance": "Faible-Modéré",
        "notes": "Saut linguistique vers le malgache. Audience plus restreinte, coordination interne partielle.",
        "comptes": [
            ("@gasy_actu", "Gasy Actu", "facebook"),
            ("@madagascar_news_alt", "Madagascar News Alt", "facebook"),
            ("@tana_buzz", "Tana Buzz", "x"),
            ("@gasy_info_24", "Gasy Info 24", "telegram"),
        ],
        "ville": "MG-TNR",
    },
    "sites-copie": {
        "nom": "Sites copie (faux médias)",
        "couleur": "#C94A4A",
        "pays_estime": "Hébergement offshore (NL/HK/AE)",
        "niveau_confiance": "Élevé (template identique)",
        "notes": "Articles au template CMS identique, polices et structure communes, mêmes signatures DNS et hébergement. Faux médias panafricains + faux site d'autorité sanitaire. Dispositif type Doppelganger.",
        "comptes": [
            ("site-copie-jeuneafrique-faux", "Faux Jeune Afrique", "site_copie", "NL-AMS"),
            ("site-copie-rfiafrique-faux", "Faux RFI Afrique", "site_copie", "NL-AMS"),
            ("site-copie-africanews-faux", "Faux Africanews", "site_copie", "AE-DXB"),
            ("site-copie-autorite-faux", "Faux site d'autorité sanitaire", "site_copie", "NL-AMS"),
            ("site-copie-lusa-faux", "Faux Lusa (Angola)", "site_copie", "AE-DXB"),
            ("site-copie-ena-faux", "Faux ENA (Éthiopie)", "site_copie", "NL-AMS"),
        ],
        "ville": "NL-AMS",  # par défaut
    },
    "amplificateurs-diaspora-fr": {
        "nom": "Amplificateurs diaspora francophone",
        "couleur": "#5A8FA8",
        "pays_estime": "France / Belgique (diaspora — audience cible)",
        "niveau_confiance": "Faible (origine réelle indéterminée)",
        "notes": "Comptes francophones de la diaspora, mix de relais convaincus et de comptes à comportement d'écho. Pas de preuve directe de coordination avec les clusters africains.",
        "comptes": [
            ("@afrique_verite_fr", "Afrique Vérité FR", "x", "FR-PAR"),
            ("@diaspora_news_fr", "Diaspora News FR", "facebook", "FR-MRS"),
            ("@panafrique_libre", "Panafrique Libre", "x", "FR-PAR"),
            ("@afrik_alerte", "Afrik Alerte", "x", "FR-LYO"),
            ("@afrique_media_alt", "Afrique Média Alt", "telegram", "FR-PAR"),
            ("@diaspo_dakar_paris", "Diaspo Dakar-Paris", "facebook", "FR-PAR"),
            ("@kemet_news_24", "Kemet News 24", "x", "FR-BDX"),
            ("@afro_souverain", "Afro Souverain", "x", "FR-LYO"),
            ("@panaf_resistance", "Panaf Résistance", "telegram", "BE-BRU"),
            ("@afrique_libre_24", "Afrique Libre 24", "facebook", "FR-LIL"),
            ("@continent_news_fr", "Continent News FR", "x", "FR-PAR"),
            ("@diaspora_gabon_fr", "Diaspora Gabon FR", "facebook", "FR-MRS"),
            ("@afrique_debout", "Afrique Debout", "x", "FR-PAR"),
            ("@sahel_info_fr", "Sahel Info FR", "telegram", "FR-LYO"),
            ("@afro_verite_24", "Afro Vérité 24", "x", "FR-BDX"),
        ],
        "ville": "FR-PAR",  # par défaut
    },
    "amplificateurs-lusophone": {
        "nom": "Amplificateurs lusophones",
        "couleur": "#D4A672",
        "pays_estime": "Portugal / Brésil (diaspora lusophone)",
        "niveau_confiance": "Faible",
        "notes": "Relais lusophones reprenant la variante angolaise du narratif. Volume limité mais cohérent.",
        "comptes": [
            ("@angola_diaspora_pt", "Angola Diáspora PT", "facebook", "PT-LIS"),
            ("@lusofonia_news", "Lusofonia News", "x", "PT-LIS"),
            ("@verdade_angola_pt", "Verdade Angola PT", "telegram", "PT-LIS"),
            ("@brasil_africa_alt", "Brasil África Alt", "x", "PT-LIS"),
            ("@luanda_lisboa", "Luanda-Lisboa", "facebook", "PT-LIS"),
        ],
        "ville": "PT-LIS",  # par défaut
    },
}

# ─── Narratifs ─────────────────────────────────────────────
NARRATIFS = [
    "Allégations sanitaires fabriquées : contamination d'un lot, ingrédient nocif inventé (faux rapport de laboratoire)",
    "Faux communiqué d'une autorité sanitaire annonçant un retrait de produit (PDF officiel fabriqué)",
    "Accusations environnementales montées de toutes pièces (pollution d'un site de production)",
    "Mise en cause sociale fabriquée (faux licenciements, conditions de travail inventées)",
    "Faux lien avec une affaire de corruption autour d'un marché public",
    "Rumeur de pénurie et de hausse de prix orchestrée pour nuire à l'image",
]

# ─── Victimes (cibles de la campagne) ──────────────────────
VICTIMES = [
    {"type": "marque", "nom": "Groupe Baobab Boissons", "subtitle": "Cible primaire · 5 marchés africains", "narratifs": "N01 · N02 · N06", "impact": "Fausses allégations de contamination et faux retrait de produit ; érosion de confiance sur le Sénégal, le Gabon, l'Angola, l'Éthiopie et Madagascar.", "icon": "building"},
    {"type": "dirigeant", "nom": "Direction générale (anonymisée)", "subtitle": "Mise en cause · documents falsifiés", "narratifs": "N05", "impact": "Faux lien fabriqué avec une affaire de corruption autour d'un marché public.", "icon": "user"},
    {"type": "employes", "nom": "Cadres et salariés locaux", "subtitle": "Cibles indirectes", "narratifs": "N04", "impact": "Fausses rumeurs de licenciements et de conditions de travail, pression sur les sites de production.", "icon": "users"},
    {"type": "partenaires", "nom": "Distributeurs et embouteilleurs", "subtitle": "Réseaux locaux · sous-traitants", "narratifs": "N03 · N06", "impact": "Risque de rupture de contrats, accusations environnementales sur les sites, rumeurs de pénurie.", "icon": "link"},
    {"type": "indirect", "nom": "Consommateurs africains", "subtitle": "Cibles informationnelles", "narratifs": "Tous narratifs", "impact": "Désinformation sur la sécurité des boissons, défiance entretenue sur les marchés ciblés.", "icon": "eye"},
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
    "Diffusion par capture d'écran relayée en chaîne de messagerie.",
]

# Date de départ de la campagne
T0 = dt.datetime(2026, 3, 2, 3, 12)
DATE_DEBUT = "2026-03-02"
DATE_FIN = "2026-04-22"
MAX_DAY = 51

def lang_for(compte, pays):
    if "wolof" in compte[0]:
        return "wo"
    return LANG_PAYS.get(pays, "fr")

# ─── Génération ────────────────────────────────────────────
def build():
    pubs = []
    pid = 0
    def next_id():
        nonlocal pid
        pid += 1
        return f"p{pid:03d}"

    # Patient zéro — 2 mars 03h12
    pz_compte = CLUSTERS["patient-zero"]["comptes"][0]
    pz_city = CITIES[CLUSTERS["patient-zero"]["ville"]]
    pz_lat, pz_lon = jitter(pz_city[2], pz_city[3])
    pz_id = next_id()
    pubs.append({
        "id": pz_id,
        "url": "https://facebook.com/redacted-pz-afrique/posts/49823",
        "plateforme": pz_compte[2],
        "compte": pz_compte[0],
        "compte_display": pz_compte[1],
        "date": T0.isoformat() + "Z",
        "lang": "fr", "pays": pz_city[1], "ville": pz_city[0],
        "lat": round(pz_lat, 4), "lon": round(pz_lon, 4),
        "type": "patient_zero", "parent_id": None,
        "audience_estimee": 1450,
        "content_excerpt": "Premier post horodaté — fausse alerte de contamination, accompagnée d'un faux rapport de laboratoire. Texte source de toutes les reprises ultérieures (matched n-gram 8/8).",
    })

    african_cluster_keys = [
        "cluster-dakar", "cluster-libreville", "cluster-luanda",
        "cluster-addis", "cluster-antananarivo",
    ]
    cluster_first_id = {}
    cluster_pubs = {k: [] for k in african_cluster_keys}

    # ───── Clusters africains — premier passage, jours 0-10 ─────
    # Dakar est traité en premier : il sert d'amorce/plaque tournante.
    for k in african_cluster_keys:
        cluster = CLUSTERS[k]
        city = CITIES[cluster["ville"]]
        for j, compte in enumerate(cluster["comptes"]):
            n_posts = random.randint(6, 14)
            for kp in range(n_posts):
                lat, lon = jitter(city[2], city[3], amount=0.10)
                # Dakar branche sur le PZ + ses propres posts ; les autres sur PZ + hub Dakar + eux-mêmes
                if k == "cluster-dakar":
                    pool = [pz_id] + cluster_pubs["cluster-dakar"]
                else:
                    pool = [pz_id] + cluster_pubs["cluster-dakar"] + cluster_pubs[k]
                parent = random.choice(pool) if pool else pz_id
                day_offset = random.choices(
                    [0, 0, 1, 1, 2, 3, 4, 5, 7, 9],
                    weights=[3, 3, 3, 2, 2, 2, 2, 1, 1, 1]
                )[0]
                hour = 5 + random.randint(0, 17)
                minute = random.randint(0, 59)
                date = T0.replace(hour=0, minute=0) + dt.timedelta(days=day_offset, hours=hour, minutes=minute)
                pid_ = next_id()
                pub = {
                    "id": pid_,
                    "url": f"https://t.me/{compte[0].lstrip('@')}-redacted/{2000+j*17+kp}" if compte[2] == "telegram" else f"https://x.com/{compte[0].lstrip('@')}-redacted/status/{1700000000+j*31+kp}",
                    "plateforme": compte[2], "compte": compte[0], "compte_display": compte[1],
                    "date": date.isoformat() + "Z",
                    "lang": lang_for(compte, city[1]), "pays": city[1], "ville": city[0],
                    "lat": round(lat, 4), "lon": round(lon, 4),
                    "type": "relai", "parent_id": parent,
                    "audience_estimee": random.randint(2500, 25000),
                    "content_excerpt": random.choice(EXCERPTS_TPL),
                }
                pubs.append(pub)
                cluster_pubs[k].append(pid_)
                if k not in cluster_first_id:
                    cluster_first_id[k] = pid_

    # ───── Sites copie — jours 2-40, 6-12 articles par site ─────
    sc_cluster = CLUSTERS["sites-copie"]
    sc_pubs = []
    sc_lang_map = {"lusa": "pt", "ena": "am"}  # les autres → fr
    for j, compte in enumerate(sc_cluster["comptes"]):
        n_art = random.randint(6, 12)
        for k_art in range(n_art):
            city = CITIES[compte[3]]
            lat, lon = jitter(city[2], city[3], amount=0.18)
            day_offset = min(2 + k_art * 3 + random.randint(0, 4), MAX_DAY)
            date = T0.replace(hour=9, minute=0) + dt.timedelta(days=day_offset, hours=random.randint(-6, 12))
            parent = random.choice(cluster_pubs[random.choice(african_cluster_keys)])
            lang_pick = "fr"
            for key, lang in sc_lang_map.items():
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
                "content_excerpt": "Article fabriqué. Template CMS identique aux autres sites du dispositif. Mêmes signatures DNS et hébergement offshore.",
            })
            sc_pubs.append(pid_)

    # ───── Amplificateurs (diaspora fr, lusophone) — jour 2 à fin ─────
    amp_clusters = ["amplificateurs-diaspora-fr", "amplificateurs-lusophone"]
    amp_pubs = []
    for k in amp_clusters:
        cluster = CLUSTERS[k]
        amp_lang = "pt" if k == "amplificateurs-lusophone" else "fr"
        for j, compte in enumerate(cluster["comptes"]):
            n_publis = random.randint(8, 22)
            for kp in range(n_publis):
                ville_key = compte[3] if len(compte) >= 4 else cluster["ville"]
                city = CITIES[ville_key]
                lat, lon = jitter(city[2], city[3], amount=0.15)
                day_offset = min(2 + random.randint(0, 46) + kp * random.randint(2, 8), MAX_DAY)
                date = T0.replace(hour=9, minute=0) + dt.timedelta(days=day_offset, hours=random.randint(-7, 10), minutes=random.randint(0, 59))
                parent_pool = sum(cluster_pubs.values(), []) + sc_pubs + amp_pubs[-20:]
                parent = random.choice(parent_pool)
                pid_ = next_id()
                pubs.append({
                    "id": pid_,
                    "url": f"https://x.com/{compte[0].lstrip('@')}-redacted/status/{1700000000+j*1000+kp}" if compte[2] == "x" else f"https://t.me/{compte[0].lstrip('@')}-redacted/{3000+j*7+kp}",
                    "plateforme": compte[2], "compte": compte[0], "compte_display": compte[1],
                    "date": date.isoformat() + "Z",
                    "lang": amp_lang, "pays": city[1], "ville": city[0],
                    "lat": round(lat, 4), "lon": round(lon, 4),
                    "type": "amplificateur", "parent_id": parent,
                    "audience_estimee": random.randint(4000, 48000),
                    "content_excerpt": random.choice(EXCERPTS_TPL),
                })
                amp_pubs.append(pid_)

    # ───── Relances dans les clusters africains, jours 5-50 ─────
    for k in african_cluster_keys:
        cluster = CLUSTERS[k]
        city = CITIES[cluster["ville"]]
        for compte in cluster["comptes"]:
            n_rel = random.randint(4, 10)
            for kp in range(n_rel):
                lat, lon = jitter(city[2], city[3], amount=0.10)
                day_offset = min(5 + random.randint(0, 45), MAX_DAY)
                date = T0.replace(hour=7, minute=0) + dt.timedelta(days=day_offset, hours=random.randint(-3, 12), minutes=random.randint(0, 59))
                parent_pool = cluster_pubs[k] + sc_pubs
                parent = random.choice(parent_pool)
                pid_ = next_id()
                pubs.append({
                    "id": pid_,
                    "url": f"https://t.me/{compte[0].lstrip('@')}-redacted/{4000+kp*13}" if compte[2] == "telegram" else f"https://x.com/{compte[0].lstrip('@')}-redacted/status/{1700500000+kp*13}",
                    "plateforme": compte[2], "compte": compte[0], "compte_display": compte[1],
                    "date": date.isoformat() + "Z",
                    "lang": lang_for(compte, city[1]), "pays": city[1], "ville": city[0],
                    "lat": round(lat, 4), "lon": round(lon, 4),
                    "type": "relai", "parent_id": parent,
                    "audience_estimee": random.randint(2500, 18000),
                    "content_excerpt": "Relance. " + random.choice(EXCERPTS_TPL),
                })
                cluster_pubs[k].append(pid_)

    return pubs, cluster_pubs, sc_pubs, amp_pubs, pz_id


def main():
    pubs, cluster_pubs, sc_pubs, amp_pubs, pz_id = build()
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
        elif k.startswith("amplificateurs-"):
            comptes_in_cluster = [x[0] for x in c["comptes"]]
            pub_ids = [p["id"] for p in pubs if p["compte"] in comptes_in_cluster]
            comptes_ids = comptes_in_cluster
        elif k == "sites-copie":
            pub_ids = sc_pubs
            comptes_ids = [x[0] for x in c["comptes"]]
        else:  # clusters africains
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
            "id": "demo-baobab-2026",
            "nom": "Campagne anti-Baobab Boissons",
            "client": "Groupe Baobab Boissons (fictif — cas démo anonymisé)",
            "secteur": "Boissons / Grande consommation",
            "date_debut": DATE_DEBUT,
            "date_fin": DATE_FIN,
            "publications_total": len(pubs),
            "comptes_total": len(comptes_uniques),
            "pays_implique": sorted(pays_set),
            "resume": (
                "Vague de désinformation coordonnée alléguant la nocivité des produits du groupe, "
                "propagée sur cinq marchés africains — Sénégal, Gabon, Angola, Éthiopie, Madagascar — "
                "puis amplifiée par la diaspora francophone et un relais lusophone. Cinq clusters locaux "
                "identifiés (Dakar plaque tournante, Libreville, Luanda, Addis-Abeba, Antananarivo), "
                "plusieurs faux médias (template Doppelganger, hébergement offshore) et une nébuleuse de "
                "comptes amplificateurs. Patient zéro tracé à un compte anonyme, 2 mars 2026 à 03h12 UTC — "
                "soit environ cinq heures avant la première reprise organique."
            ),
            "narratifs": NARRATIFS,
            "methodologie": (
                "Reconstruction de la chaîne par recoupement timestamp + n-grams 8 mots + traceback des "
                "reprises mot-pour-mot, y compris à travers les sauts linguistiques (fr → pt, am, mg). "
                "Géolocalisation par fuseau d'activité, langue, mentions, bio, plateformes. Détection des "
                "faux médias par empreinte de template (CMS, signatures HTML, hébergement). Inspiration : "
                "Viginum, DFRLab, EU DisinfoLab, Code for Africa, Africa Check."
            ),
            "niveau_confiance_attribution": "Élevé (clusters Dakar, Libreville, sites copie), Modéré (Luanda, Addis-Abeba), Faible (Antananarivo, amplificateurs diaspora, origine réelle du patient zéro)",
        },
        "publications": pubs,
        "patient_zero": pz_id,
        "reseaux": reseaux,
        "victimes": VICTIMES,
    }
    print(f"Publications: {len(pubs)}, Comptes uniques: {len(comptes_uniques)}, Pays: {len(pays_set)}, Clusters: {len(reseaux)}")
    with open("cas-demo.json", "w") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
