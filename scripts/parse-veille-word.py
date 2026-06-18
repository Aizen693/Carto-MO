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
# Un couple de coordonnees : "13.281611 ; -0.652850" OU "12.060840 -0.359208" (separateur ; , ou espace)
RE_COORD = re.compile(r'(-?\d{1,3}[.,]\d+)(?:\s*[;,]\s*|\s+)(-?\d{1,3}[.,]\d+)')
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

    last = []  # features de la derniere ligne de donnees (pour rattacher la description)
    pays_re = re.compile(r'#\s*\d+\s*[–\-—]\s*([^\d#]+)')

    for block in iter_blocks(doc):
        if isinstance(block, Paragraph):
            m = pays_re.search(block.text)
            if m:
                pays = title_case_pays(m.group(1).strip())
                last = []
            continue

        # Tableau-titre "#N - PAYS" (1 ligne) -> definit le pays, pas de donnees.
        full = ' '.join(c.text for r in block.rows for c in r.cells)
        mp = pays_re.search(full)
        if mp and len(block.rows) <= 1:
            pays = title_case_pays(mp.group(1).strip())
            last = []
            continue

        # Tableau de donnees : alterne ligne data (date en col 0) et ligne description (cellule fusionnee).
        for row in block.rows:
            cells = row.cells
            c0 = cells[0].text.strip()
            c1 = cells[1].text.strip() if len(cells) > 1 else ''
            is_data = len(cells) >= 4 and bool(RE_DATE.search(c0)) and c0 != c1

            if not is_data:
                # Ligne description (cellule fusionnee) -> rattachee a la ligne data precedente.
                desc = c0
                if desc and last:
                    for f in last:
                        f["properties"]["description"] = desc
                continue

            villes = cell_lines(cells[1])
            coord_lines = cell_lines(cells[2])
            acteur_raw = ' '.join(cell_lines(cells[3]))
            iso = to_iso(c0)
            name, etype = split_actor(acteur_raw)
            coords = [c for c in (parse_coord(x) for x in coord_lines) if c]
            last = []

            if not coords:
                if c0 or acteur_raw:
                    warnings.append(f"{pays}: ligne sans coordonnees lisibles (date={c0!r}, acteur={acteur_raw!r})")
                continue
            if not iso:
                warnings.append(f"{pays}: date illisible {c0!r}")

            for i, coord in enumerate(coords):
                ville = villes[i] if i < len(villes) else (villes[-1] if villes else '')
                pays_ville = f"{pays} - {ville}" if ville else (pays or '')
                feat = {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": coord},
                    "properties": {
                        "name": name, "type": etype, "date": iso, "pays": pays_ville,
                        "description": "", "sources": "HUMINT", "added": today,
                    },
                }
                features.append(feat)
                last.append(feat)
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
