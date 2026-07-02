#!/usr/bin/env python3
"""Enrichit carte/zones-3d.json avec les VRAIS types OSM de chaque bâtiment.

Le générateur d'origine a réduit tous les bâtiments à « Bâtiment / <catégorie> ».
Ici on réinterroge OpenStreetMap (Overpass) sur l'emprise de chaque site, puis on
associe chaque empreinte curée au bâtiment OSM le plus proche (centroïde) pour
récupérer sa fonction réelle (terminal, hangar, tour de contrôle, commissariat,
caserne, nom propre...). Aucune donnée inventée : si OSM ne dit rien, on garde
« Bâtiment ». Sortie : carte/zones-3d.enriched.json (le live n'est pas modifié).
"""
import json, time, urllib.request, urllib.parse, math, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'carte', 'zones-3d.json')
OUT = os.path.join(ROOT, 'carte', 'zones-3d.enriched.json')
OVERPASS = 'https://overpass-api.de/api/interpreter'

# Traduction tag OSM -> libellé français. Ordre = priorité (le plus spécifique gagne).
def label_from_tags(t):
    name = (t.get('name') or '').strip()
    aw = t.get('building') and t.get('building') or ''
    ay = t.get('aeroway') or ''
    amenity = t.get('amenity') or ''
    mil = t.get('military') or ''
    office = t.get('office') or ''
    man = t.get('man_made') or ''
    # Fonction déduite du tag le plus parlant
    fn = None
    if ay == 'terminal' or t.get('building') == 'terminal': fn = 'Aérogare / terminal'
    elif ay == 'tower' or man == 'tower': fn = 'Tour de contrôle'
    elif ay == 'hangar' or t.get('building') == 'hangar': fn = 'Hangar'
    elif mil in ('barracks',): fn = 'Caserne'
    elif mil in ('bunker',): fn = 'Bunker'
    elif mil: fn = 'Emprise militaire'
    elif amenity == 'police' or t.get('building') == 'police': fn = 'Poste de police / gendarmerie'
    elif amenity == 'hospital' or t.get('building') == 'hospital': fn = 'Hôpital'
    elif amenity in ('marketplace',) or t.get('building') == 'marketplace': fn = 'Marché'
    elif amenity == 'fuel' or t.get('building') == 'fuel': fn = 'Station / dépôt carburant'
    elif t.get('building') == 'warehouse': fn = 'Entrepôt'
    elif t.get('building') == 'roof': fn = 'Auvent / structure couverte'
    elif t.get('building') in ('house', 'residential'): fn = 'Bâtiment résidentiel'
    elif t.get('building') == 'garage': fn = 'Garage / atelier'
    elif t.get('building') == 'commercial' or office: fn = 'Bâtiment administratif'
    elif t.get('building') == 'construction' or ay == 'construction': fn = 'En construction'
    return fn, name

def centroid(ring):
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    return sum(xs) / len(xs), sum(ys) / len(ys)

def dist_m(a, b):
    dx = (a[0] - b[0]) * 111320 * math.cos(math.radians(a[1]))
    dy = (a[1] - b[1]) * 110540
    return math.hypot(dx, dy)

def bbox_of(site):
    pts = [p for b in site.get('structures', []) for p in b['footprint'][0]]
    if not pts:
        c = site['center']; return (c[1] - 0.004, c[0] - 0.004, c[1] + 0.004, c[0] + 0.004)
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return (min(ys) - 0.0006, min(xs) - 0.0006, max(ys) + 0.0006, max(xs) + 0.0006)

def overpass(bbox):
    s, w, n, e = bbox
    q = ('[out:json][timeout:60];('
         'way["building"](%f,%f,%f,%f);'
         'way["aeroway"](%f,%f,%f,%f);'
         ');out tags center;') % (s, w, n, e, s, w, n, e)
    data = urllib.parse.urlencode({'data': q}).encode()
    req = urllib.request.Request(OVERPASS, data=data,
                                 headers={'User-Agent': 'AlgoraAccess/1.0 (intel research)'})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r).get('elements', [])

def main():
    doc = json.load(open(SRC, encoding='utf-8'))
    sites = doc['zones']
    total_enriched = 0
    for si, site in enumerate(sites):
        structs = site.get('structures', [])
        if not structs:
            continue
        try:
            els = overpass(bbox_of(site))
        except Exception as ex:
            print('  ! Overpass échec sur', site['name'], ':', ex, file=sys.stderr)
            continue
        osm = []
        for el in els:
            c = el.get('center')
            if not c:
                continue
            fn, name = label_from_tags(el.get('tags', {}))
            if fn or name:
                osm.append(((c['lon'], c['lat']), fn, name))
        n_site = 0
        for b in structs:
            cen = centroid(b['footprint'][0])
            best = None; bestd = 1e9
            for (pos, fn, name) in osm:
                d = dist_m(cen, pos)
                if d < bestd:
                    bestd = d; best = (fn, name)
            # match fiable si < 35 m (nos empreintes viennent d'OSM à l'origine)
            if best and bestd < 35:
                fn, name = best
                label = name or fn
                if label and label != b.get('name'):
                    b['name'] = label
                    if fn:
                        b['function'] = fn
                    b['osm_type'] = True
                    n_site += 1
        total_enriched += n_site
        print('  %-42s %3d/%3d bâtiments typés (OSM %d)' % (site['name'], n_site, len(structs), len(osm)))
        time.sleep(2)
    doc['note'] = (doc.get('note', '') + ' | Enrichi OSM ' +
                   time.strftime('%Y-%m-%d') + ' : fonctions réelles des bâtiments (terminal/hangar/tour...).')
    json.dump(doc, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
    print('OK ->', OUT, '|', total_enriched, 'bâtiments enrichis au total')

if __name__ == '__main__':
    main()
