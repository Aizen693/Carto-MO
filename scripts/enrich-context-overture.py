#!/usr/bin/env python3
"""Densifie les sites ruraux de zones-3d avec les bâtiments Google Open Buildings
(via Overture Maps). Comble les zones où OSM/Mapbox n'a rien (« map data not
available »). Une seule commande, à lancer sur une machine bien connectée :

    pip install duckdb
    python3 scripts/enrich-context-overture.py --commit

Sans --commit : dry-run (affiche le nombre de bâtiments par site, n'écrit rien).
Résultat écrit dans carte/zones-3d.enriched.json (bâtiments marqués _context,
damage=intact). Le module zones-3d.js les rend en contexte clair. Ensuite :
re-uploader le fichier dans le bucket (fonction edge sync-zones-3d ou admin).

Données : Google Open Buildings, licence CC BY 4.0 / ODbL, via Overture Maps.
"""
import json, math, os, sys, csv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'carte', 'zones-3d.enriched.json')
REL = '2026-06-17.0'            # release Overture (mettre à jour si besoin)
MARGIN = 0.006                  # ~500 m autour de l'emprise du site
CAP = 600                       # plafond de bâtiments contexte par site
DEFAULT_H = 7                   # hauteur par défaut (Overface sans hauteur ici)
COMMIT = '--commit' in sys.argv

# Aéroports déjà denses (OSM) : on ne les retraite pas
SKIP_NAMES = ('Niamey', 'Tahoua')

def bbox_of(site):
    pts = [p for b in site.get('structures', []) for p in b['footprint'][0]]
    if site.get('perimeter'):
        pts += [p for ring in site['perimeter'] for p in ring]
    if not pts:
        c = site['center']; pts = [[c[0], c[1]]]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return min(xs) - MARGIN, max(xs) + MARGIN, min(ys) - MARGIN, max(ys) + MARGIN

def parse_poly(wkt):
    if not wkt.startswith('POLYGON'):
        return None
    try:
        inner = wkt[wkt.index('((') + 2: wkt.index('))')]
        ring = [[round(float(a.split()[0]), 6), round(float(a.split()[1]), 6)] for a in inner.split(',')]
        return ring if len(ring) >= 4 else None
    except Exception:
        return None

def cen(ring):
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    return sum(xs) / len(xs), sum(ys) / len(ys)

def dm(a, b):
    dx = (a[0] - b[0]) * 111320 * math.cos(math.radians(a[1])); dy = (a[1] - b[1]) * 110540
    return math.hypot(dx, dy)

def main():
    import duckdb
    doc = json.load(open(SRC, encoding='utf-8'))
    sites = doc['zones']
    targets = [(i, s) for i, s in enumerate(sites)
               if s.get('structures') and not any(n in s['name'] for n in SKIP_NAMES)]
    boxes = {i: bbox_of(s) for i, s in targets}

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    con.execute("SET s3_region='us-west-2';")
    con.execute("CREATE SECRET ov (TYPE s3, PROVIDER config, REGION 'us-west-2');")
    conds = " or ".join(
        f"(bbox.xmin >= {b[0]} and bbox.xmax <= {b[1]} and bbox.ymin >= {b[2]} and bbox.ymax <= {b[3]})"
        for b in boxes.values())
    print('Requête Overture (peut prendre quelques minutes)...', file=sys.stderr)
    rows = con.execute(f"""
        select ST_AsText(geometry) as wkt, (bbox.xmin+bbox.xmax)/2 as clon, (bbox.ymin+bbox.ymax)/2 as clat
        from read_parquet('s3://overturemaps-us-west-2/release/{REL}/theme=buildings/type=building/*.parquet', hive_partitioning=1)
        where {conds}
    """).fetchall()
    print(f'{len(rows)} bâtiments récupérés', file=sys.stderr)

    total = 0
    for (i, s) in targets:
        b = boxes[i]; c = s['center']
        exist = [cen(st['footprint'][0]) for st in s['structures']]
        cand = []
        for (wkt, clon, clat) in rows:
            if not (b[0] <= clon <= b[1] and b[2] <= clat <= b[3]):
                continue
            ring = parse_poly(wkt)
            if ring:
                cand.append((clon, clat, ring))
        cand.sort(key=lambda x: dm((x[0], x[1]), (c[0], c[1])))
        n = 0
        for (lon, lat, ring) in cand:
            if n >= CAP:
                break
            if any(dm((lon, lat), e) < 12 for e in exist):
                continue
            if COMMIT:
                s['structures'].append({
                    'id': 'ob%d_%d' % (i, n), 'name': 'Bâtiment',
                    'function': s['structures'][0].get('function', ''),
                    'height': DEFAULT_H, 'damage': 'intact', 'footprint': [ring],
                    'key': False, '_context': True, 'incidents': []})
            n += 1
        total += n
        print('  %-42s +%d bâtiments contexte' % (s['name'], n))

    if COMMIT:
        doc['note'] = doc.get('note', '') + ' | Contexte Overture (Google Open Buildings) sur sites ruraux.'
        json.dump(doc, open(SRC, 'w', encoding='utf-8'), ensure_ascii=False)
        print('ÉCRIT :', SRC, '·', total, 'bâtiments ajoutés')
    else:
        print('DRY-RUN ·', total, 'bâtiments seraient ajoutés (relancer avec --commit)')

if __name__ == '__main__':
    main()
