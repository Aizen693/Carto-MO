/**
 * build-regions.mjs — Contours des régions administratives (ADM1) des 7 pays
 * couverts par le HUMINT, pour l'analyse « par région ».
 *
 * Source : geoBoundaries (gbOpen, simplifié) → carte/regions.geojson
 * Props sorties : { name (région), pays (notre libellé), iso3 }
 *
 * Lancer : node scripts/build-regions.mjs
 */
import { writeFileSync } from 'node:fs';

const COUNTRIES = [
  ['MLI', 'Mali'], ['NER', 'Niger'], ['BFA', 'Burkina Faso'],
  ['NGA', 'Nigeria'], ['BEN', 'Bénin'], ['TGO', 'Togo'], ['COD', 'RDC'],
];

// Corrections d'accent / orthographe sur les noms de régions (gbHumanitarian
// est déjà propre, restent quelques sans-accent).
const NAME_FIX = {
  'Tillaberi': 'Tillabéri', 'Menaka': 'Ménaka', 'Oueme': 'Ouémé',
  'Segou': 'Ségou', 'Koulikouro': 'Koulikoro',
};

// On préfère la version HUMANITAIRE (OCHA, noms propres + bons découpages),
// repli sur gbOpen si absente.
async function fetchADM1(iso3) {
  for (const rel of ['gbHumanitarian', 'gbOpen']) {
    try {
      const api = await fetch(`https://www.geoboundaries.org/api/current/${rel}/${iso3}/ADM1/`).then((r) => r.json());
      const url = api.simplifiedGeometryGeoJSON || api.gjDownloadURL;
      if (!url) continue;
      const gj = await fetch(url).then((r) => r.json());
      if (gj && gj.features && gj.features.length) { console.log(`  ${iso3} ← ${rel}`); return gj; }
    } catch (e) { /* tente la source suivante */ }
  }
  throw new Error('Pas d\'ADM1 pour ' + iso3);
}

// Pour un test point-dans-région, une précision ~100 m suffit largement.
// On arrondit à 3 décimales PUIS on simplifie chaque anneau (Douglas-Peucker)
// pour alléger fortement le fichier (un contour de région n'a pas besoin de
// milliers de points pour dire « ce point est dedans »).
function r3(v) { return Math.round(v * 1e3) / 1e3; }

function perpDist(p, a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1];
  var l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  var dmax = 0, idx = 0;
  for (var i = 1; i < pts.length - 1; i++) {
    var d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > tol) {
    var l = dp(pts.slice(0, idx + 1), tol), r = dp(pts.slice(idx), tol);
    return l.slice(0, -1).concat(r);
  }
  return [pts[0], pts[pts.length - 1]];
}
function simplifyRing(ring) {
  var pts = ring.map(function (c) { return [r3(c[0]), r3(c[1])]; });
  var s = dp(pts, 0.01); // ~1.1 km
  if (s.length < 4) return pts; // garde l'anneau si trop dégénéré
  // referme proprement
  if (s[0][0] !== s[s.length - 1][0] || s[0][1] !== s[s.length - 1][1]) s.push(s[0]);
  return s;
}
function simplifyGeom(type, coords) {
  if (type === 'Polygon') return coords.map(simplifyRing);
  return coords.map(function (poly) { return poly.map(simplifyRing); }); // MultiPolygon
}

const out = { type: 'FeatureCollection', features: [] };

for (const [iso3, pays] of COUNTRIES) {
  const gj = await fetchADM1(iso3);
  const names = [];
  for (const f of gj.features || []) {
    const p = f.properties || {};
    let name = (p.shapeName || p.shapeName_en || p.name || '').trim();
    if (!name) continue; // on ignore les entrées sans nom (glitch source)
    name = NAME_FIX[name] || name;
    names.push(name);
    out.features.push({
      type: 'Feature',
      properties: { name, pays, iso3 },
      geometry: { type: f.geometry.type, coordinates: simplifyGeom(f.geometry.type, f.geometry.coordinates) },
    });
  }
  console.log(`${pays} (${iso3}) : ${names.length} régions → ${names.sort().join(', ')}`);
}

writeFileSync(new URL('../carte/regions.geojson', import.meta.url), JSON.stringify(out));
console.log(`\nTotal : ${out.features.length} régions → carte/regions.geojson`);
