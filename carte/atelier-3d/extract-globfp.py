#!/usr/bin/env python3
"""
Extrait un sous-ensemble de 3D-GloBFP (emprises + hauteurs) en GeoJSON.

3D-GloBFP porte la geometrie ET la hauteur, donc aucune jointure avec Overture
n'est necessaire : on rend directement ses emprises. Zero erreur d'appariement.

Lecteur shapefile minimal (pas de GDAL sur la machine). Format ESRI :
  .shp  entete 100 o, puis enregistrements [num BE int32][longueur BE int32][contenu]
        contenu polygone (type 5) : box 4 doubles, numParts int32, numPoints int32,
        parts int32[], points (x,y) double[]
  .dbf  dBASE III : entete 32 o, descripteurs de champs 32 o jusqu'a 0x0D,
        puis enregistrements (1 o de suppression + champs a largeur fixe)

Usage :
  python3 extract_globfp.py <base_sans_extension> <lonmin> <latmin> <lonmax> <latmax> <sortie.geojson>
"""
import json
import struct
import sys


def lire_champs_dbf(f):
    """Retourne (nb_enregistrements, taille_entete, taille_enregistrement, champs)."""
    f.seek(0)
    entete = f.read(32)
    nb, taille_entete, taille_enr = struct.unpack('<I H H', entete[4:12])
    champs, pos = [], 32
    while True:
        f.seek(pos)
        d = f.read(32)
        if not d or d[0] == 0x0D:
            break
        nom = d[0:11].split(b'\x00')[0].decode('latin-1').strip()
        typ = chr(d[11])
        longueur = d[16]
        champs.append((nom, typ, longueur))
        pos += 32
    return nb, taille_entete, taille_enr, champs


def valeur_dbf(f, taille_entete, taille_enr, champs, index, voulu):
    """Lit un seul champ d'un enregistrement, sans charger tout le .dbf."""
    decalage = 1  # octet de suppression
    for nom, typ, longueur in champs:
        if nom == voulu:
            f.seek(taille_entete + index * taille_enr + decalage)
            return f.read(longueur).decode('latin-1').strip()
        decalage += longueur
    return None


def extraire(base, bbox, sortie, champ_hauteur='Height'):
    lonmin, latmin, lonmax, latmax = bbox
    dbf = open(base + '.dbf', 'rb')
    nb, taille_entete, taille_enr, champs = lire_champs_dbf(dbf)
    noms = [c[0] for c in champs]
    print('champs dbf :', noms, '| enregistrements :', nb)
    if champ_hauteur not in noms:
        # tolerance sur la casse
        for n in noms:
            if n.lower() == champ_hauteur.lower():
                champ_hauteur = n
                break
    features = []
    hauteurs = []
    total = 0

    with open(base + '.shp', 'rb') as shp:
        shp.seek(0, 2)
        taille = shp.tell()
        shp.seek(100)
        while shp.tell() < taille:
            tete = shp.read(8)
            if len(tete) < 8:
                break
            num, longueur_mots = struct.unpack('>I I', tete)
            contenu = shp.read(longueur_mots * 2)
            total += 1
            if len(contenu) < 44:
                continue
            typ = struct.unpack('<I', contenu[0:4])[0]
            if typ != 5:           # on ne traite que les polygones
                continue
            xmin, ymin, xmax, ymax = struct.unpack('<4d', contenu[4:36])
            # filtre bbox sur la boite de l'enregistrement : tres bon marche
            if xmax < lonmin or xmin > lonmax or ymax < latmin or ymin > latmax:
                continue
            n_parts, n_pts = struct.unpack('<II', contenu[36:44])
            parts = struct.unpack('<%dI' % n_parts, contenu[44:44 + 4 * n_parts])
            deb = 44 + 4 * n_parts
            pts = struct.unpack('<%dd' % (2 * n_pts), contenu[deb:deb + 16 * n_pts])

            anneaux = []
            for i in range(n_parts):
                d = parts[i]
                fin = parts[i + 1] if i + 1 < n_parts else n_pts
                anneau = [[round(pts[2 * j], 6), round(pts[2 * j + 1], 6)] for j in range(d, fin)]
                if len(anneau) >= 4:
                    anneaux.append(anneau)
            if not anneaux:
                continue

            brut = valeur_dbf(dbf, taille_entete, taille_enr, champs, num - 1, champ_hauteur)
            try:
                h = float(brut)
            except (TypeError, ValueError):
                continue
            if h <= 0:
                continue
            # le champ est stocke a 6 decimales : precision fictive, on arrondit
            h = round(h, 1)
            hauteurs.append(h)
            features.append({
                'type': 'Feature',
                'geometry': {'type': 'Polygon', 'coordinates': anneaux},
                'properties': {'h': h},
            })

    dbf.close()
    fc = {'type': 'FeatureCollection', 'features': features}
    with open(sortie, 'w') as f:
        json.dump(fc, f, separators=(',', ':'))

    hauteurs.sort()
    n = len(hauteurs)
    def pct(p):
        return hauteurs[min(n - 1, int(n * p))] if n else 0
    print('parcourus : %d | retenus : %d' % (total, n))
    if n:
        print('hauteur  mediane %.2f m | p25 %.2f | p90 %.2f | max %.2f | moyenne %.2f'
              % (pct(0.5), pct(0.25), pct(0.9), hauteurs[-1], sum(hauteurs) / n))


if __name__ == '__main__':
    base = sys.argv[1]
    bbox = tuple(float(x) for x in sys.argv[2:6])
    extraire(base, bbox, sys.argv[6])
