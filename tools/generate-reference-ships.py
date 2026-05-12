#!/usr/bin/env python3
"""Genere un dataset de reference (~500 navires) sur les zones a couverture
AISStream nulle : Cote Est Afrique, Madagascar, Indien Ouest, Ormuz / Golfe Persique.

Positions plausibles autour des ports + couloirs maritimes. Donnees fictives
mais coherentes (MMSI valide, pavillon en accord avec le MID, type realiste).
Ecrit dans afrique/ais-reference.json. Marquage _source='reference' sur chaque
entree pour distinction visuelle cote frontend.
"""
import json
import math
import random
from pathlib import Path
from datetime import datetime

random.seed(42)  # determinisme : meme dataset entre runs

OUT_PATH = Path(__file__).resolve().parent.parent / 'afrique' / 'ais-reference.json'

# ============================================================================
# Ports : (nom, lat, lng, nb_navires, mid_local_principal)
# nb_navires = quantite cumulee a quai + en approche
# mid_local = pays "naturel" du port (40% des navires l'auront)
# ============================================================================
PORTS = [
    # Cote Est Afrique
    ('Mombasa',         -4.04,  39.66, 30, 634),  # Kenya
    ('Dar es Salaam',   -6.82,  39.30, 30, 674),  # Tanzania
    ('Tanga',           -5.07,  39.10, 10, 674),
    ('Mtwara',          -10.27, 40.18, 10, 674),
    ('Maputo',          -25.97, 32.57, 25, 650),  # Mozambique
    ('Beira',           -19.84, 34.85, 20, 650),
    ('Nacala',          -14.55, 40.66, 15, 650),
    ('Pemba MZ',        -12.97, 40.50, 10, 650),
    # Madagascar
    ('Toamasina',       -18.16, 49.40, 22, 647),
    ('Mahajanga',       -15.72, 46.32, 14, 647),
    ('Antsiranana',     -12.27, 49.30, 14, 647),
    ('Toliara',         -23.35, 43.67, 10, 647),
    # Iles Indien
    ('Port Louis',      -20.16, 57.50, 20, 645),  # Mauritius
    ('Victoria SC',     -4.62,  55.45, 14, 664),  # Seychelles
    ('Moroni',          -11.70, 43.25, 10, 616),  # Comoros
    # Corne d'Afrique + Mer Rouge sud
    ('Djibouti',        11.59,  43.15, 28, 621),
    ('Berbera',         10.43,  45.02, 10, 666),  # Somalia
    ('Bossaso',         11.28,  49.18, 8,  666),
    ('Mogadiscio',      2.04,   45.34, 8,  666),
    ('Massawa',         15.61,  39.45, 10, 625),  # Eritrea
    ('Port Sudan',      19.62,  37.22, 18, 662),  # Sudan
    ('Aden',            12.79,  44.99, 12, 473),  # Yemen
    ('Al Mukalla',      14.55,  49.13, 8,  473),
    # Golfe d'Aden + Oman ouest
    ('Salalah',         17.02,  54.10, 22, 461),  # Oman - hub transbordement
    # Detroit d'Ormuz + Golfe Persique
    ('Mascate',         23.61,  58.54, 18, 461),
    ('Sohar',           24.36,  56.74, 14, 461),
    ('Bandar Abbas',    27.18,  56.27, 28, 422),  # Iran
    ('Bandar e-Jask',   25.65,  57.77, 6,  422),
    ('Dubai',           25.05,  55.07, 28, 470),  # UAE (Jebel Ali)
    ('Abu Dhabi',       24.45,  54.40, 12, 470),
    ('Doha',            25.29,  51.53, 10, 466),  # Qatar
    ('Dammam',          26.40,  50.10, 8,  403),  # Saudi Arabia
    ('Khorramshahr',    30.43,  48.18, 6,  422),
    ('Manama',          26.21,  50.58, 6,  408),  # Bahrain
]

# Couloirs maritimes : liste de waypoints, nb_navires distribues le long
CORRIDORS = [
    ('Mozambique Channel S-N', [(-30, 35), (-25, 36), (-20, 38), (-15, 40), (-10, 41), (-5, 42)], 20),
    ('Mombasa -> Bab el-Mandeb', [(-4, 40), (0, 44), (4, 47), (8, 47), (11, 45)], 18),
    ('Bab el-Mandeb -> Ormuz', [(13, 48), (15, 51), (17, 54), (20, 57), (23, 58), (25, 57)], 18),
    ('Mascate -> Karachi', [(23, 60), (22, 63), (22, 65), (23, 67)], 10),
    ('Cape -> Mauritius -> Diego', [(-35, 30), (-30, 40), (-25, 50), (-20, 55), (-15, 60)], 14),
    ('Salalah -> Sri Lanka',  [(15, 60), (12, 65), (10, 70), (8, 75)], 10),
    ('Madagascar circumnav', [(-15, 50), (-19, 50), (-23, 47), (-22, 43), (-15, 45)], 12),
    ('Persian Gulf interior', [(28, 51), (28, 49), (27, 50), (29, 49), (26, 52)], 10),
]

# ============================================================================
# Pavillons : MID -> nom pays (sous-ensemble de la table ITU pertinente)
# ============================================================================
LOCAL_FLAGS = [403, 408, 422, 461, 466, 470, 473, 616, 621, 625, 634, 645, 647, 650, 662, 664, 666, 674]
# Pavillons de complaisance (forte presence dans ces eaux)
FOC = [351, 352, 353, 354, 355, 356, 357,  # Panama
       538,                                 # Marshall
       563, 564, 565, 566,                  # Singapore
       636, 637,                            # Liberia
       209, 210, 212,                       # Cyprus
       215, 229, 248, 249, 256,             # Malta
       477,                                 # Hong Kong
       308, 309, 311,                       # Bahamas
       412, 413, 414]                       # China
# Autres nations maritimes
OTHERS = [232, 233, 234, 235,   # UK
          237, 238, 239, 240, 241,  # Greece
          247,                      # Italy
          226, 227, 228,            # France
          244, 245, 246,            # Netherlands
          257, 258, 259,            # Norway
          219, 220,                 # Denmark
          224, 225,                 # Spain
          263,                      # Portugal
          431, 432,                 # Japan
          440, 441,                 # South Korea
          419,                      # India
          271,                      # Turkey
          211, 218]                 # Germany

# ============================================================================
# Types AIS realistes (avec ponderation)
# ============================================================================
TYPE_POOL = (
    [70, 70, 70, 71, 71, 73, 74, 79]    # cargo (40%)
    + [80, 80, 80, 81, 82, 89]          # tanker (25%)
    + [30, 30, 30]                       # fishing (15%)
    + [60, 60]                           # passenger (10%)
    + [35, 36]                           # military / other (10%)
)

# ============================================================================
# Generation de noms plausibles
# ============================================================================
PREFIX = ['STAR', 'OCEAN', 'PACIFIC', 'GLOBAL', 'MERIDIAN', 'ROYAL', 'BRIGHT', 'NORTHERN',
          'SOUTHERN', 'ATLANTIC', 'INDIAN', 'TRADER', 'EXPRESS', 'TROPIC', 'CRYSTAL', 'GOLDEN',
          'AMBER', 'SAPPHIRE', 'CORAL', 'ZAFIR', 'AL', 'BIN', 'OMAR', 'SHARJAH', 'RAJA',
          'SAGAR', 'ASIATIC', 'KENYA', 'MOMBASA', 'NEPTUNE', 'POSEIDON', 'TANGA', 'MAPUTO']
ROOT = ['SEA', 'TRADER', 'STAR', 'PIONEER', 'EXPRESS', 'HORIZON', 'BREEZE', 'PEARL',
        'VOYAGER', 'COURIER', 'NAVIGATOR', 'WARRIOR', 'SPIRIT', 'DAWN', 'PRIDE', 'GIANT',
        'TIGER', 'EAGLE', 'FALCON', 'DRAGON', 'SWALLOW', 'PETREL', 'CARRIER']
SUFFIX = ['', '', '', '', '', ' I', ' II', ' III', ' IV', ' V', ' 1', ' 2', ' 7', ' 8', ' 9', ' XII']

def random_name():
    p = random.choice(PREFIX)
    r = random.choice(ROOT)
    s = random.choice(SUFFIX)
    return f"{p} {r}{s}"

def random_destination(port_name=None):
    pool = ['SGSIN', 'CNNGB', 'AEDXB', 'OMSLL', 'INNSA', 'NLRTM', 'EGSUE',
            'KEMSA', 'TZDAR', 'MZMPM', 'MGTMM', 'YEADE', 'IRBND']
    if port_name and random.random() < 0.3:
        return port_name.upper()[:5]
    return random.choice(pool) if random.random() < 0.7 else None

# Pavillons -> nom (subset ITU)
MID_NAMES = {
    211:'Allemagne', 218:'Allemagne', 219:'Danemark', 220:'Danemark', 224:'Espagne', 225:'Espagne',
    226:'France', 227:'France', 228:'France', 232:'Royaume-Uni', 233:'Royaume-Uni',
    234:'Royaume-Uni', 235:'Royaume-Uni', 237:'Grece', 238:'Croatie', 239:'Grece', 240:'Grece',
    241:'Grece', 244:'Pays-Bas', 245:'Pays-Bas', 246:'Pays-Bas', 247:'Italie', 257:'Norvege',
    258:'Norvege', 259:'Norvege', 263:'Portugal', 271:'Turquie',
    209:'Chypre', 210:'Chypre', 212:'Chypre', 215:'Malte', 229:'Malte', 248:'Malte',
    249:'Malte', 256:'Malte',
    308:'Bahamas', 309:'Bahamas', 311:'Bahamas', 351:'Panama', 352:'Panama', 353:'Panama',
    354:'Panama', 355:'Panama', 356:'Panama', 357:'Panama', 538:'Iles Marshall',
    563:'Singapour', 564:'Singapour', 565:'Singapour', 566:'Singapour',
    636:'Liberia', 637:'Liberia',
    412:'Chine', 413:'Chine', 414:'Chine', 419:'Inde', 431:'Japon', 432:'Japon',
    440:'Coree du Sud', 441:'Coree du Sud', 477:'Hong Kong',
    403:'Arabie Saoudite', 408:'Bahrein', 422:'Iran', 461:'Oman', 466:'Qatar',
    470:'Emirats Arabes Unis', 473:'Yemen',
    616:'Comores', 621:'Djibouti', 625:'Erythree', 634:'Kenya', 645:'Maurice',
    647:'Madagascar', 650:'Mozambique', 662:'Soudan', 664:'Seychelles', 666:'Somalie',
    674:'Tanzanie'
}

def gen_mmsi(mid):
    # MMSI valide a 9 chiffres : MID + 6 chiffres serie
    return f"{mid}{random.randint(100000, 999999)}"

def pick_flag(local_mid):
    r = random.random()
    if r < 0.40 and local_mid in MID_NAMES: return local_mid
    if r < 0.75:  return random.choice(FOC)
    return random.choice(OTHERS)

def random_jitter(lat, lng, max_km=8):
    # Decalage aleatoire jusqu'a max_km en lat/lng
    dlat = (random.random() - 0.5) * 2 * (max_km / 111.0)
    dlng = (random.random() - 0.5) * 2 * (max_km / (111.0 * math.cos(math.radians(lat))))
    return lat + dlat, lng + dlng

def random_heading_for_corridor(p1, p2):
    # Cap depuis p1 vers p2 (bearing en degres compass)
    dlat = p2[0] - p1[0]
    dlng = p2[1] - p1[1]
    rad = math.atan2(dlng, dlat)
    deg = (math.degrees(rad) + 360) % 360
    return deg

def gen_port_ship(port_name, plat, plng, local_mid, now_ms):
    flag = pick_flag(local_mid)
    type_code = random.choice(TYPE_POOL)
    moving = random.random() < 0.45  # 45% en mouvement (approche / sortie)
    lat, lng = random_jitter(plat, plng, max_km=12 if moving else 4)
    if moving:
        sog = round(random.uniform(6, 16), 1)
        cog = round(random.uniform(0, 360), 1)
    else:
        sog = 0.0
        cog = round(random.uniform(0, 360), 1)
    return {
        'mmsi': gen_mmsi(flag),
        'lat': round(lat, 5),
        'lng': round(lng, 5),
        'cog': cog,
        'sog': sog,
        'heading': int(cog) if moving else 511,
        'name': random_name(),
        'type_code': type_code,
        'destination': random_destination(port_name),
        'callsign': None,
        'imo': random.randint(9000000, 9999999) if random.random() < 0.7 else None,
        'lastUpdate': now_ms - random.randint(60000, 1800000),  # 1-30 min anciennete
        '_source': 'reference'
    }

def gen_corridor_ship(p1, p2, local_mid_pool, now_ms):
    t = random.random()
    lat = p1[0] + t * (p2[0] - p1[0]) + (random.random() - 0.5) * 0.4
    lng = p1[1] + t * (p2[1] - p1[1]) + (random.random() - 0.5) * 0.4
    flag = pick_flag(random.choice(local_mid_pool))
    type_code = random.choice([70, 70, 80, 80, 71, 30, 60])  # cargo+tanker en majorite sur couloirs
    cog = random_heading_for_corridor(p1, p2) + (random.random() - 0.5) * 20
    cog = (cog + 360) % 360
    sog = round(random.uniform(10, 17), 1)
    return {
        'mmsi': gen_mmsi(flag),
        'lat': round(lat, 5),
        'lng': round(lng, 5),
        'cog': round(cog, 1),
        'sog': sog,
        'heading': int(cog),
        'name': random_name(),
        'type_code': type_code,
        'destination': random_destination(),
        'callsign': None,
        'imo': random.randint(9000000, 9999999) if random.random() < 0.7 else None,
        'lastUpdate': now_ms - random.randint(60000, 1800000),
        '_source': 'reference'
    }

def main():
    now_ms = int(datetime.now().timestamp() * 1000)
    ships = []
    for name, lat, lng, n, mid in PORTS:
        for _ in range(n):
            ships.append(gen_port_ship(name, lat, lng, mid, now_ms))
    local_mid_pool = list(set(p[4] for p in PORTS))
    for name, waypoints, n in CORRIDORS:
        for _ in range(n):
            # Choisit un segment aleatoire du couloir
            i = random.randint(0, len(waypoints) - 2)
            ships.append(gen_corridor_ship(waypoints[i], waypoints[i + 1], local_mid_pool, now_ms))
    # Dedup eventuel (probabilite quasi-nulle mais filet de securite)
    seen = set()
    deduped = []
    for s in ships:
        if s['mmsi'] in seen: continue
        seen.add(s['mmsi'])
        deduped.append(s)
    out = {
        'capturedAt': now_ms,
        'count': len(deduped),
        'source': 'reference_synthetic',
        'description': "Dataset reference (positions estimees) — zones a couverture AISStream nulle",
        'ships': deduped
    }
    with open(OUT_PATH, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f"OK : {len(deduped)} navires reference -> {OUT_PATH}")
    print(f"   Ports : {sum(n for *_,n,_ in PORTS)} navires")
    print(f"   Corridors : {sum(n for *_,n in CORRIDORS)} navires")

if __name__ == '__main__':
    main()
