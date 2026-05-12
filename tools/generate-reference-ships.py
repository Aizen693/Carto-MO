#!/usr/bin/env python3
"""Genere un dataset de reference (~1000 navires) sur les zones a couverture
AISStream nulle : Cote Est Afrique, Madagascar, Indien Ouest, Mer Rouge,
Golfe d'Aden, Ormuz, Golfe Persique.

Couloirs maritimes serres (jitter perpendiculaire ~5km), caps alignes sur
le bearing du segment, espacement regulier. Positions plausibles autour des
ports. MMSI valide + pavillon coherent. Donnees fictives marquees
_source='reference' pour distinction visuelle cote frontend.
"""
import json
import math
import random
import sys
from pathlib import Path
from datetime import datetime

try:
    from global_land_mask import globe
except ImportError:
    sys.exit("pip3 install global-land-mask  (requis pour filtrer les positions terrestres)")

random.seed(42)

OUT_PATH = Path(__file__).resolve().parent.parent / 'afrique' / 'ais-reference.json'

# ============================================================================
# Ports : (nom, lat, lng, nb_navires, mid_local)
# ============================================================================
PORTS = [
    # Cote Est Afrique
    ('Mombasa',         -4.04,  39.66, 36, 634),
    ('Dar es Salaam',   -6.82,  39.30, 36, 674),
    ('Tanga',           -5.07,  39.10, 12, 674),
    ('Zanzibar',        -6.16,  39.20, 10, 674),
    ('Mtwara',          -10.27, 40.18, 12, 674),
    ('Maputo',          -25.97, 32.57, 28, 650),
    ('Beira',           -19.84, 34.85, 24, 650),
    ('Nacala',          -14.55, 40.66, 18, 650),
    ('Pemba MZ',        -12.97, 40.50, 12, 650),
    ('Quelimane',       -17.88, 36.89, 8,  650),
    # Madagascar
    ('Toamasina',       -18.16, 49.40, 26, 647),
    ('Mahajanga',       -15.72, 46.32, 16, 647),
    ('Antsiranana',     -12.27, 49.30, 16, 647),
    ('Toliara',         -23.35, 43.67, 12, 647),
    ('Fort Dauphin',    -25.04, 47.00, 8,  647),
    # Iles Indien
    ('Port Louis',      -20.16, 57.50, 22, 645),
    ('Saint-Denis',     -20.88, 55.45, 12, 660),  # Reunion (France)
    ('Victoria SC',     -4.62,  55.45, 16, 664),
    ('Moroni',          -11.70, 43.25, 12, 616),
    # Corne d'Afrique
    ('Djibouti',        11.59,  43.15, 34, 621),
    ('Berbera',         10.43,  45.02, 12, 666),
    ('Bossaso',         11.28,  49.18, 10, 666),
    ('Mogadiscio',      2.04,   45.34, 10, 666),
    ('Kismayo',         -0.36,  42.55, 8,  666),
    # Mer Rouge
    ('Massawa',         15.61,  39.45, 12, 625),
    ('Assab',           13.01,  42.74, 8,  625),
    ('Port Sudan',      19.62,  37.22, 20, 662),
    ('Suakin',          19.13,  37.34, 6,  662),
    ('Jeddah',          21.55,  39.17, 32, 403),
    ('Yanbu',           24.09,  38.04, 16, 403),
    ('Aqaba',           29.53,  35.00, 14, 622),  # Jordan
    ('Eilat',           29.55,  34.95, 8,  428),  # Israel
    ('Safaga',          26.74,  33.94, 8,  622),  # Egypt
    ('Quseir',          26.10,  34.28, 6,  622),
    ('Sokhna',          29.36,  32.34, 14, 622),  # Egypt - Suez Sud
    # Yemen
    ('Aden',            12.79,  44.99, 16, 473),
    ('Al Mukalla',      14.55,  49.13, 10, 473),
    ('Al Hodeida',      14.80,  42.96, 12, 473),
    # Oman
    ('Salalah',         17.02,  54.10, 28, 461),
    ('Sur',             22.57,  59.53, 8,  461),
    ('Sohar',           24.36,  56.74, 18, 461),
    ('Mascate',         23.61,  58.54, 22, 461),
    ('Khasab',          26.20,  56.25, 8,  461),
    # Detroit d'Ormuz + Iran
    ('Bandar Abbas',    27.18,  56.27, 36, 422),
    ('Bandar e-Jask',   25.65,  57.77, 8,  422),
    ('Bushehr',         28.96,  50.83, 10, 422),
    ('Khorramshahr',    30.43,  48.18, 8,  422),
    # Golfe Persique sud
    ('Khor Fakkan',     25.34,  56.36, 10, 470),
    ('Fujairah',        25.13,  56.34, 20, 470),  # Bunkering hub
    ('Dubai',           25.05,  55.07, 32, 470),
    ('Abu Dhabi',       24.45,  54.40, 14, 470),
    ('Doha',            25.29,  51.53, 14, 466),
    ('Dammam',          26.40,  50.10, 12, 403),
    ('Manama',          26.21,  50.58, 10, 408),
    ('Kuwait',          29.37,  47.94, 12, 447),
]

# ============================================================================
# Couloirs : waypoints strictement offshore (verifies avec global_land_mask).
# place_in_ocean_on_segment derive perpendiculairement de 5-30km supplementaires
# pour finir d'ajuster si le bbox terrestre Natural Earth est trop large.
# ============================================================================
CORRIDORS = [
    # Mer Rouge / Suez axis (mer Rouge centrale)
    ('Suez -> Jeddah',       [(29.5, 32.7), (27, 34.5), (24, 37), (21.7, 38.7)], 18),
    ('Jeddah -> Bab el-Mandeb', [(21.5, 38.5), (18, 40), (15, 41.8), (13.2, 43.3)], 16),
    # Bab el-Mandeb -> Ormuz (Gulf of Aden offshore : ~30km de la cote)
    ('Bab el-Mandeb -> Gulf Aden', [(12.5, 43.7), (12.7, 45), (12.7, 47)], 10),
    ('Gulf Aden -> Mukalla offshore', [(12.7, 47), (13, 49), (13.5, 51), (14, 53)], 18),
    ('Mukalla -> Salalah offshore',   [(14, 53), (14.5, 54), (15.5, 54), (16.5, 54.3)], 14),
    ('Salalah -> Mascate offshore',   [(16.5, 54.5), (18, 56), (20, 57.5), (22.5, 59.3)], 20),
    ('Mascate -> Bandar Abbas offshore', [(23.8, 59), (24.8, 58), (25.8, 57), (26.5, 56.5)], 14),
    # Mer d'Arabie / Indien
    ('Mascate -> Karachi',   [(24, 60), (23.5, 62), (23.5, 65), (24, 67)], 14),
    ('Salalah -> Mascate deep', [(16, 56), (18, 58), (20, 59.5), (22, 60)], 12),
    ('Salalah -> Sri Lanka', [(16, 56), (13, 60), (10, 65), (8, 70), (7, 75)], 14),
    ('Mascate -> Maldives',  [(23, 60), (18, 65), (12, 70), (5, 73)], 10),
    ('Salalah -> Maldives',  [(16, 56), (12, 60), (8, 65), (5, 72)], 8),
    # Persian Gulf interior (eaux centrales du Golfe)
    ('Bandar Abbas -> Kuwait', [(26.7, 56.4), (27.3, 53.5), (27.7, 51.5), (28.5, 50.2), (29, 48.7)], 16),
    ('Persian Gulf round',   [(25, 55.5), (25.3, 53.5), (25.5, 52), (25.8, 51), (26, 50.5)], 14),
    ('Strait of Hormuz crossing', [(26.6, 56.3), (26.4, 56.5), (26.2, 56.7)], 10),
    # Cote Est Africaine (offshore Somalie/Kenya/Tanzanie/Mozambique)
    ('Bab el-Mandeb -> Cape Guardafui', [(12.5, 44), (12, 48), (12, 51.5)], 14),
    ('Cape Guardafui -> Mombasa offshore', [(11.5, 52), (8, 51), (4, 49), (0, 44), (-3, 41), (-4.2, 40)], 22),
    ('Mombasa -> Maputo offshore',  [(-4.2, 40), (-8, 40.5), (-12, 41), (-16, 41), (-20, 38), (-25, 36), (-26.2, 33.5)], 24),
    ('Mombasa -> Salalah',   [(-3.5, 41), (1, 45), (5, 50), (9, 53), (13, 54), (16, 54.5)], 20),
    # Mozambique Channel (chenal large entre Mada et cote Mozambique)
    ('Mozambique Channel S->N', [(-25, 35), (-22, 37), (-18, 39), (-14, 41), (-10, 42)], 16),
    ('Channel interior',     [(-20, 39), (-17, 41), (-14, 42)], 10),
    # Cape route (Atlantique Sud / Indien Sud)
    ('Cape -> Mauritius',    [(-35, 22), (-33, 32), (-30, 42), (-25, 52), (-21, 57)], 16),
    ('Mauritius -> Mombasa', [(-20, 57), (-17, 53), (-13, 48), (-8, 44), (-4.5, 40)], 14),
    ('Mauritius -> Suez',    [(-20, 57.5), (-13, 55), (-5, 53), (3, 50), (10, 47), (12.8, 44)], 18),
    # Madagascar (offshore est et ouest, large)
    ('Madagascar Est offshore', [(-12, 50.5), (-16, 51), (-20, 50), (-23, 48), (-25.5, 46)], 14),
    ('Madagascar Ouest offshore', [(-13, 47), (-16, 45), (-19, 44), (-23, 43.5)], 10),
    # Sud Indien
    ('Karachi -> Sri Lanka', [(24, 66.5), (20, 69), (15, 73), (8, 76)], 10),
]

# ============================================================================
# Pavillons & types
# ============================================================================
LOCAL_FLAGS = [403, 408, 422, 461, 466, 470, 473, 616, 621, 622, 625, 634, 645, 647, 650,
               660, 662, 664, 666, 674]
FOC = [351, 352, 353, 354, 355, 356, 357, 538, 563, 564, 565, 566, 636, 637,
       209, 210, 212, 215, 229, 248, 249, 256, 477, 308, 309, 311, 412, 413, 414]
OTHERS = [232, 233, 234, 235, 237, 238, 239, 240, 241, 247, 226, 227, 228,
          244, 245, 246, 257, 258, 259, 219, 220, 224, 225, 263, 431, 432,
          440, 441, 419, 271, 211, 218]

# Pondere : cargo 40%, tanker 30%, fishing 12%, passenger 8%, autres 10%
TYPE_POOL = ([70]*8 + [71]*3 + [72]*2 + [73]*2 + [74]*3 + [79]*2 +
             [80]*8 + [81]*3 + [82]*3 + [85]*2 + [89]*4 +
             [30]*12 + [60]*5 + [61]*3 + [35]*4 + [55]*2 + [50]*4)

MID_NAMES = {
    211:'Allemagne', 218:'Allemagne', 219:'Danemark', 220:'Danemark', 224:'Espagne',
    225:'Espagne', 226:'France', 227:'France', 228:'France', 232:'Royaume-Uni',
    233:'Royaume-Uni', 234:'Royaume-Uni', 235:'Royaume-Uni', 237:'Grece', 238:'Croatie',
    239:'Grece', 240:'Grece', 241:'Grece', 244:'Pays-Bas', 245:'Pays-Bas', 246:'Pays-Bas',
    247:'Italie', 257:'Norvege', 258:'Norvege', 259:'Norvege', 263:'Portugal',
    271:'Turquie', 209:'Chypre', 210:'Chypre', 212:'Chypre', 215:'Malte', 229:'Malte',
    248:'Malte', 249:'Malte', 256:'Malte', 308:'Bahamas', 309:'Bahamas', 311:'Bahamas',
    351:'Panama', 352:'Panama', 353:'Panama', 354:'Panama', 355:'Panama', 356:'Panama',
    357:'Panama', 538:'Iles Marshall', 563:'Singapour', 564:'Singapour', 565:'Singapour',
    566:'Singapour', 636:'Liberia', 637:'Liberia', 412:'Chine', 413:'Chine', 414:'Chine',
    419:'Inde', 431:'Japon', 432:'Japon', 440:'Coree du Sud', 441:'Coree du Sud',
    477:'Hong Kong', 403:'Arabie Saoudite', 408:'Bahrein', 422:'Iran', 428:'Israel',
    447:'Koweit', 461:'Oman', 466:'Qatar', 470:'Emirats Arabes Unis', 473:'Yemen',
    616:'Comores', 621:'Djibouti', 622:'Egypte', 625:'Erythree', 634:'Kenya', 645:'Maurice',
    647:'Madagascar', 650:'Mozambique', 660:'Reunion', 662:'Soudan', 664:'Seychelles',
    666:'Somalie', 674:'Tanzanie'
}

PREFIX = ['STAR', 'OCEAN', 'PACIFIC', 'GLOBAL', 'MERIDIAN', 'ROYAL', 'BRIGHT', 'NORTHERN',
          'SOUTHERN', 'ATLANTIC', 'INDIAN', 'TRADER', 'EXPRESS', 'TROPIC', 'CRYSTAL', 'GOLDEN',
          'AMBER', 'SAPPHIRE', 'CORAL', 'AL HARAMAIN', 'AL', 'BIN', 'OMAR', 'SHARJAH', 'RAJA',
          'SAGAR', 'ASIATIC', 'KENYA', 'MOMBASA', 'NEPTUNE', 'POSEIDON', 'TANGA', 'MAPUTO',
          'GULF', 'AL JAZIRA', 'DJIBOUTI', 'SOMALIA', 'NACALA', 'INDIA STAR', 'EAST']
ROOT = ['SEA', 'TRADER', 'STAR', 'PIONEER', 'EXPRESS', 'HORIZON', 'BREEZE', 'PEARL',
        'VOYAGER', 'COURIER', 'NAVIGATOR', 'WARRIOR', 'SPIRIT', 'DAWN', 'PRIDE', 'GIANT',
        'TIGER', 'EAGLE', 'FALCON', 'DRAGON', 'SWALLOW', 'PETREL', 'CARRIER', 'PROGRESS',
        'STRONG', 'HARMONY', 'FORTUNE', 'JEWEL']
SUFFIX = ['', '', '', '', '', '', '', ' I', ' II', ' III', ' V', ' VII', ' 1', ' 2', ' 7', ' 11', ' XII']

def random_name():
    return f"{random.choice(PREFIX)} {random.choice(ROOT)}{random.choice(SUFFIX)}"

def gen_mmsi(mid):
    return f"{mid}{random.randint(100000, 999999)}"

def pick_flag(local_mid):
    r = random.random()
    if r < 0.45 and local_mid in MID_NAMES: return local_mid
    if r < 0.78:  return random.choice(FOC)
    return random.choice(OTHERS)

def random_destination(port_name=None):
    pool = ['SGSIN', 'CNNGB', 'AEDXB', 'OMSLL', 'INNSA', 'NLRTM', 'EGSUE',
            'KEMSA', 'TZDAR', 'MZMPM', 'MGTMM', 'YEADE', 'IRBND', 'OMSOH',
            'SAJED', 'JOAQB', 'KWKWI', 'AEFJR']
    if port_name and random.random() < 0.3:
        return port_name.upper()[:5].replace(' ', '').replace('-', '')
    return random.choice(pool) if random.random() < 0.72 else None

def jitter(lat, lng, km=4):
    dlat = (random.random() - 0.5) * 2 * (km / 111.0)
    dlng = (random.random() - 0.5) * 2 * (km / (111.0 * max(0.3, math.cos(math.radians(lat)))))
    return lat + dlat, lng + dlng

def find_ocean_near(center_lat, center_lng, max_km=20, max_tries=80):
    """Tirage aleatoire de positions a <= max_km du centre, jusqu'a en trouver une en mer."""
    for attempt in range(max_tries):
        # Distance progressive : commence pres du centre, elargit a chaque echec
        radius = (1.5 + (attempt / max_tries) * max_km)
        lat, lng = jitter(center_lat, center_lng, km=radius)
        if globe.is_ocean(lat, lng):
            return lat, lng
    return None  # Echec — sera filtre en aval

def place_in_ocean_on_segment(p1, p2, max_tries=40):
    """Place un navire sur le segment p1-p2 avec jitter perpendiculaire, en mer.
    Si la position tombe sur terre, decale perpendiculairement jusqu'a trouver l'eau."""
    for attempt in range(max_tries):
        t = random.random()
        lat = p1[0] + t * (p2[0] - p1[0])
        lng = p1[1] + t * (p2[1] - p1[1])
        dlat_seg = p2[0] - p1[0]
        dlng_seg = p2[1] - p1[1]
        norm = math.hypot(dlat_seg, dlng_seg) or 1
        perp_lat = -dlng_seg / norm
        perp_lng = dlat_seg / norm
        # Jitter perpendiculaire 5-25km — bias progressif vers max si echecs
        jitter_km = 5 + (attempt / max_tries) * 30
        j = (random.random() - 0.5) * 2 * (jitter_km / 111.0)
        cand_lat = lat + perp_lat * j
        cand_lng = lng + perp_lng * j
        if globe.is_ocean(cand_lat, cand_lng):
            return cand_lat, cand_lng, t
    return None  # Segment passe trop pres de la terre — sera filtre

def bearing(p1, p2):
    """Cap compass de p1 vers p2 (lat,lng)."""
    lat1 = math.radians(p1[0]); lat2 = math.radians(p2[0])
    dlng = math.radians(p2[1] - p1[1])
    x = math.sin(dlng) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlng)
    return (math.degrees(math.atan2(x, y)) + 360) % 360

def gen_port_ship(port_name, plat, plng, local_mid, now_ms):
    flag = pick_flag(local_mid)
    type_code = random.choice(TYPE_POOL)
    moving = random.random() < 0.40
    pos = find_ocean_near(plat, plng, max_km=15 if moving else 6)
    if pos is None: return None
    lat, lng = pos
    if moving:
        sog = round(random.uniform(5, 14), 1)
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
        'lastUpdate': now_ms - random.randint(60000, 1800000),
        '_source': 'reference'
    }

def gen_corridor_ships(waypoints, total, now_ms):
    """Distribue total navires sur le polyline waypoints, en mer uniquement.
    Pour chaque navire : tire un segment au prorata de sa longueur, place_in_ocean_on_segment
    decale perpendiculairement jusqu'a trouver l'eau, cap aligne sur le bearing."""
    ships = []
    seg_lengths = []
    for i in range(len(waypoints) - 1):
        dlat = waypoints[i+1][0] - waypoints[i][0]
        dlng = waypoints[i+1][1] - waypoints[i][1]
        seg_lengths.append(math.hypot(dlat, dlng))
    total_len = sum(seg_lengths)
    if total_len == 0: return ships
    for _ in range(total):
        # Tirage segment au prorata de sa longueur (couloir uniforme spatialement)
        r = random.random() * total_len
        acc = 0
        chosen_seg = 0
        for i, l in enumerate(seg_lengths):
            if acc + l >= r:
                chosen_seg = i
                break
            acc += l
        p1, p2 = waypoints[chosen_seg], waypoints[chosen_seg+1]
        result = place_in_ocean_on_segment(p1, p2)
        if result is None: continue
        lat, lng, _ = result
        cog = bearing(p1, p2) + (random.random() - 0.5) * 6
        cog = (cog + 360) % 360
        if random.random() < 0.5:
            cog = (cog + 180) % 360
        flag = pick_flag(random.choice(LOCAL_FLAGS))
        type_code = random.choice([70, 70, 70, 80, 80, 80, 71, 30, 60, 89])
        sog = round(random.uniform(10, 17), 1)
        ships.append({
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
        })
    return ships

def main():
    now_ms = int(datetime.now().timestamp() * 1000)
    ships = []
    for name, lat, lng, n, mid in PORTS:
        for _ in range(n):
            s = gen_port_ship(name, lat, lng, mid, now_ms)
            if s is not None:
                ships.append(s)
    port_count = len(ships)
    for name, waypoints, n in CORRIDORS:
        ships.extend(gen_corridor_ships(waypoints, n, now_ms))
    corridor_count = len(ships) - port_count
    # Verification finale : aucun navire ne doit etre sur terre
    valid = [s for s in ships if globe.is_ocean(s['lat'], s['lng'])]
    rejected = len(ships) - len(valid)
    if rejected > 0:
        print(f"   ATTENTION : {rejected} navires post-verification rejetes (encore terre)")
    ships = valid
    # Dedup MMSI (probabilite quasi-nulle mais filet)
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
    print(f"OK : {len(deduped)} navires reference")
    print(f"   Ports : {port_count} navires ({len(PORTS)} ports)")
    print(f"   Corridors : {corridor_count} navires ({len(CORRIDORS)} couloirs)")
    print(f"   Fichier : {OUT_PATH}")

if __name__ == '__main__':
    main()
