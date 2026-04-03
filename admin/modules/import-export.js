/**
 * import-export.js — Import/export GeoJSON
 */

import { createPoint, getPoints, logActivity } from './firestore.js';
import { getCurrentUser } from './auth.js';

export async function importGeoJSON(file, zone, zoneConfig) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const geojson = JSON.parse(e.target.result);
        if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
          throw new Error('Format invalide : FeatureCollection attendu');
        }

        let imported = 0;
        for (const f of geojson.features) {
          if (!f.geometry || !f.geometry.coordinates) continue;
          const coords = f.geometry.type === 'Point'
            ? f.geometry.coordinates
            : f.geometry.coordinates[0]; // first coord for non-point

          const props = f.properties || {};
          const actorName = props.name || props.Name || 'Inconnu';
          const color = zoneConfig.ACTOR_COLORS?.[actorName] || '#888888';

          await createPoint(zone, {
            coordinates: [coords[0], coords[1]],
            name: actorName,
            description: props.description || props.Description || '',
            period: props._period || props.period || '',
            _color: color,
            _casualties: parseInt(props._casualties || props.casualties || '0') || 0
          });
          imported++;
        }

        await logActivity(zone, 'import', null, `Import GeoJSON : ${imported} points depuis "${file.name}"`);
        resolve(imported);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Erreur lecture fichier'));
    reader.readAsText(file);
  });
}

export async function exportGeoJSON(zone) {
  const points = await getPoints(zone);
  const features = points.map(p => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: p.coordinates },
    properties: {
      name: p.name,
      description: p.description,
      _period: p.period,
      _color: p._color,
      _casualties: p._casualties
    }
  }));

  const geojson = { type: 'FeatureCollection', features };
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `carto-mo-${zone}-${new Date().toISOString().slice(0, 10)}.geojson`;
  a.click();
  URL.revokeObjectURL(url);

  await logActivity(zone, 'export', null, `Export GeoJSON : ${features.length} points`);
}
