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
from pathlib import Path
from datetime import datetime

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
# Couloirs : liste de waypoints + nb_navires distribues
# Densite : ships spaced evenly along, ~5km lateral perpendicular jitter
# ============================================================================
CORRIDORS = [
    # Mer Rouge / Suez axis
    ('Suez -> Jeddah',       [(29.5, 32.6), (27, 34), (24, 36.5), (21.5, 39)], 18),
    ('Jeddah -> Bab el-Mandeb', [(21, 39.2), (18, 40), (15, 41.5), (13, 43)], 16),
    # Bab el-Mandeb -> Ormuz (Gulf of Aden + Oman coast)
    ('Bab el-Mandeb -> Aden',   [(12.5, 43.5), (12.7, 44), (12.8, 45)], 8),
    ('Aden -> Mukalla -> Salalah', [(12.8, 45), (13.5, 47), (14.5, 49), (15.5, 51), (16.5, 53), (17, 54)], 24),
    ('Salalah -> Mascate',   [(17, 54), (19, 55.5), (21, 57), (23, 58.5)], 18),
    ('Mascate -> Bandar Abbas', [(23.6, 58.5), (24.5, 57.5), (25.5, 57), (26.5, 56.5), (27, 56.3)], 16),
    # Cote Sud arabe / Mer d'Arabie
    ('Mascate -> Karachi',   [(23.5, 58.7), (23, 61), (23, 64), (24, 67)], 14),
    ('Mascate -> Salalah deep', [(23, 60), (20, 60), (17, 58), (15, 56)], 12),
    ('Salalah -> Sri Lanka', [(15, 58), (12, 64), (10, 70), (8, 76)], 14),
    # Persian Gulf interior
    ('Bandar Abbas -> Kuwait', [(27, 56), (27.5, 53), (28, 51), (28.5, 49), (29, 48)], 16),
    ('Dubai -> Doha -> Manama -> Dammam', [(25, 55), (25, 54), (25.3, 52), (25.5, 51), (26, 50.5), (26.4, 50.2)], 14),
    ('Strait of Hormuz crossing', [(26.5, 56.3), (26.3, 56.4), (26.1, 56.5), (25.9, 56.6)], 10),
    # Cote Est Africaine
    ('Suez -> Mombasa',      [(13, 43), (10, 45), (5, 46), (0, 45), (-4, 40)], 22),
    ('Mombasa -> Maputo',    [(-4, 40), (-8, 40), (-12, 40), (-15, 40), (-18, 37), (-22, 35), (-26, 33)], 24),
    ('Mombasa -> Salalah',   [(-4, 41), (0, 46), (4, 50), (8, 53), (12, 54), (15, 54)], 20),
    # Mozambique Channel
    ('Maputo -> Suez via Mozambique', [(-25, 33), (-20, 36), (-15, 39), (-10, 41), (-5, 43), (0, 44)], 20),
    ('Mozambique interior',  [(-22, 38), (-19, 39), (-16, 41), (-13, 42)], 12),
    # Cape route
    ('Cape -> Mauritius',    [(-34, 25), (-32, 35), (-28, 45), (-22, 55)], 16),
    ('Mauritius -> Reunion -> Diego', [(-20, 57.5), (-19, 56), (-17, 53), (-15, 50), (-13, 49)], 12),
    ('Mauritius -> Suez',    [(-20, 57.5), (-15, 55), (-8, 52), (0, 48), (8, 45), (12, 44)], 18),
    # Madagascar
    ('Madagascar Est',       [(-12, 49.5), (-16, 50.5), (-20, 49), (-23, 47), (-25, 45)], 14),
    ('Madagascar Ouest',     [(-13, 48), (-16, 46), (-19, 44), (-22, 43)], 10),
    # Indien profond
    ('Mascate -> Maldives',  [(23, 60), (18, 65), (12, 70), (5, 73)], 10),
    ('Salalah -> Maldives',  [(17, 55), (13, 60), (8, 68), (5, 73)], 8),
    # Sud Inde
    ('Karachi -> Sri Lanka', [(24, 67), (20, 70), (15, 73), (10, 77)], 10),
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
    lat, lng = jitter(plat, plng, km=10 if moving else 3.5)
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
    """Distribue total navires le long du polyline waypoints.
    Espacement regulier, jitter perpendiculaire ~5km, cap aligne sur le segment."""
    ships = []
    # Total longueur (approx en degres)
    seg_lengths = []
    for i in range(len(waypoints) - 1):
        dlat = waypoints[i+1][0] - waypoints[i][0]
        dlng = waypoints[i+1][1] - waypoints[i][1]
        seg_lengths.append(math.hypot(dlat, dlng))
    total_len = sum(seg_lengths)
    if total_len == 0: return ships
    for k in range(total):
        # Position parametrique 0..1 le long du polyline
        t_global = (k + 0.5 + random.uniform(-0.3, 0.3)) / total
        t_global = max(0, min(1, t_global))
        target_len = t_global * total_len
        # Trouve le segment
        acc = 0
        for i, l in enumerate(seg_lengths):
            if acc + l >= target_len or i == len(seg_lengths) - 1:
                local_t = (target_len - acc) / l if l > 0 else 0
                p1, p2 = waypoints[i], waypoints[i+1]
                lat = p1[0] + local_t * (p2[0] - p1[0])
                lng = p1[1] + local_t * (p2[1] - p1[1])
                # Jitter perpendiculaire (~5km lateral)
                dlat_seg = p2[0] - p1[0]
                dlng_seg = p2[1] - p1[1]
                norm = math.hypot(dlat_seg, dlng_seg)
                if norm > 0:
                    perp_lat = -dlng_seg / norm
                    perp_lng = dlat_seg / norm
                    j = (random.random() - 0.5) * 2 * (5 / 111.0)
                    lat += perp_lat * j
                    lng += perp_lng * j
                # Cap aligne sur le segment + bruit faible
                cog = bearing(p1, p2) + (random.random() - 0.5) * 6
                cog = (cog + 360) % 360
                # 50% en sens inverse (trafic bidirectionnel)
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
                break
            acc += l
    return ships

def main():
    now_ms = int(datetime.now().timestamp() * 1000)
    ships = []
    for name, lat, lng, n, mid in PORTS:
        for _ in range(n):
            ships.append(gen_port_ship(name, lat, lng, mid, now_ms))
    port_count = len(ships)
    for name, waypoints, n in CORRIDORS:
        ships.extend(gen_corridor_ships(waypoints, n, now_ms))
    corridor_count = len(ships) - port_count
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
