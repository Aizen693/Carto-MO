#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Convertisseur Bulletin VEILLE (.docx) -> geojson HUMINT.

Lit un bulletin Word hebdomadaire et sort un geojson au format exact de la base
HUMINT du site (sahel/humint.geojson) : un point par couple (ville, coordonnees).

Le pays vient des titres de section "#N - PAYS".
Le tableau a 4 colonnes : Date | Ville(s) | Coordonnees | Acteur.
- Ville(s) et Coordonnees peuvent contenir plusieurs lignes empilees -> 1 point chacune.
- Coordonnees collees "LAT ; LON" -> separees.
- Date "08/06/26" (annee 2 chiffres) -> "2026-06-08".
- Acteur "GSIM - Mouvement" -> name="GSIM", type="Mouvement".

Usage :
    pip install python-docx
    python3 scripts/parse-veille-word.py "VEILLE - S24.docx"
    -> ecrit "VEILLE - S24.geojson" a cote, + un rapport dans le terminal.

Le fichier .docx reste sur ta machine, rien n'est envoye.
"""

import sys
import os
import re
import json
import datetime

try:
    from docx import Document
    from docx.document import Document as _Doc
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    from docx.oxml.ns import qn
except ImportError:
    sys.exit("Manque python-docx. Lance : pip install python-docx")


# Titre de section pays : "#1 – BURKINA FASO", "#2 - MALI", etc.
RE_PAYS = re.compile(r'^\s*#\s*\d+\s*[–\-—]\s*(.+?)\s*$')
# Un couple de coordonnees : "13.281611 ; -0.652850" (virgule ou point decimal accepte)
RE_COORD = re.compile(r'(-?\d{1,3}[.,]\d+)\s*[;,]\s*(-?\d{1,3}[.,]\d+)')
# Date jj/mm/aa ou jj/mm/aaaa (separateurs / . -)
RE_DATE = re.compile(r'(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})')


def iter_blocks(parent):
    """Itere paragraphes ET tableaux dans l'ordre du document."""
    body = parent.element.body
    for child in body.iterchildren():
        if child.tag == qn('w:p'):
            yield Paragraph(child, parent)
        elif child.tag == qn('w:tbl'):
            yield Table(child, parent)


def cell_lines(cell):
    """Lignes non vides d'une cellule (paragraphes + sauts de ligne internes)."""
    out = []
    for p in cell.paragraphs:
        for line in p.text.split('\n'):
            line = line.strip()
            if line:
                out.append(line)
    return out


def title_case_pays(s):
    """BURKINA FASO -> Burkina Faso ; garde RDC en majuscules."""
    s = s.strip()
    if not s:
        return s
    up = s.upper()
    if up in ('RDC', 'RCA'):
        return up
    # petits mots en minuscules
    small = {'de', 'du', 'des', 'la', 'le', 'et', "d'"}
    words = []
    for w in s.split():
        lw = w.lower()
        words.append(lw if lw in small else lw.capitalize())
    return ' '.join(words)


def to_iso(s):
    """'08/06/26' -> '2026-06-08'. Renvoie None si illisible."""
    m = RE_DATE.search(s or '')
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000
    try:
        return datetime.date(y, mo, d).isoformat()
    except ValueError:
        return None


def split_actor(s):
    """'GSIM - Mouvement' -> ('GSIM', 'Mouvement'). Sans tiret : name=s, type=''."""
    s = (s or '').strip()
    parts = re.split(r'\s+[–\-—]\s+', s, maxsplit=1)
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip()
    return s, ''


def parse_coord(line):
    """'13.281611 ; -0.652850' -> (lon, lat) ou None."""
    m = RE_COORD.search(line or '')
    if not m:
        return None
    lat = float(m.group(1).replace(',', '.'))
    lon = float(m.group(2).replace(',', '.'))
    # bornes plausibles Afrique de l'Ouest / centrale, mais on ne bloque pas
    return [lon, lat]


def parse_doc(path):
    doc = Document(path)
    pays = None
    features = []
    report = {}      # pays -> count
    warnings = []
    today = datetime.date.today().isoformat()

    for block in iter_blocks(doc):
        if isinstance(block, Paragraph):
            m = RE_PAYS.match(block.text)
            if m:
                pays = title_case_pays(m.group(1))
            continue

        # Tableau
        for ri, row in enumerate(block.rows):
            cells = row.cells
            if len(cells) < 4:
                continue
            date_raw = cells[0].text.strip()
            # ignore une eventuelle ligne d'en-tete
            if ri == 0 and not RE_DATE.search(date_raw):
                continue

            villes = cell_lines(cells[1])
            coord_lines = cell_lines(cells[2])
            acteur_raw = ' '.join(cell_lines(cells[3]))

            iso = to_iso(date_raw)
            name, etype = split_actor(acteur_raw)
            coords = [parse_coord(c) for c in coord_lines]
            coords = [c for c in coords if c]

            if not coords:
                if date_raw or acteur_raw:
                    warnings.append(f"{pays}: ligne sans coordonnees lisibles (date={date_raw!r}, acteur={acteur_raw!r})")
                continue
            if not iso:
                warnings.append(f"{pays}: date illisible {date_raw!r}")

            for i, coord in enumerate(coords):
                ville = villes[i] if i < len(villes) else (villes[-1] if villes else '')
                pays_ville = f"{pays} - {ville}" if ville else (pays or '')
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": coord},
                    "properties": {
                        "name": name,
                        "type": etype,
                        "date": iso,
                        "pays": pays_ville,
                        "description": "",
                        "sources": "HUMINT",
                        "added": today,
                    },
                })
                report[pays] = report.get(pays, 0) + 1

    return features, report, warnings


def main():
    if len(sys.argv) < 2:
        sys.exit('Usage : python3 scripts/parse-veille-word.py "fichier.docx"')
    src = sys.argv[1]
    if not os.path.isfile(src):
        sys.exit(f"Fichier introuvable : {src}")

    features, report, warnings = parse_doc(src)
    out = os.path.splitext(src)[0] + '.geojson'
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({"type": "FeatureCollection", "features": features},
                  f, ensure_ascii=False, indent=0)

    print(f"\n  {len(features)} points ecrits -> {out}")
    print("  Par pays :")
    for p, n in sorted(report.items(), key=lambda kv: -kv[1]):
        print(f"    {p or '(?)'} : {n}")
    if warnings:
        print(f"\n  {len(warnings)} avertissements :")
        for w in warnings[:30]:
            print(f"    - {w}")
        if len(warnings) > 30:
            print(f"    ... (+{len(warnings) - 30})")
    print()


if __name__ == '__main__':
    main()
