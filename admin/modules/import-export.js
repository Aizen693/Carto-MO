/**
 * import-export.js — Import/export GeoJSON
 */

import { createPoint, bulkCreatePoints, getPoints, logActivity } from './firestore.js';
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

/**
 * Import all static GeoJSON/KML files for a zone into Supabase.
 * Parses descriptions to extract actor name, assigns correct colors.
 * Returns { total, perPeriod: [{label, count}], skipped }
 */
export async function importStaticFiles(zone, zoneConfig, onProgress) {
  const normalize = zoneConfig.normalizeName || (n => n ? n.trim() : null);
  const dataPath = zoneConfig.DATA_PATH;
  if (!dataPath) throw new Error('Pas de DATA_PATH configure pour cette zone');

  // Get existing points to check duplicates
  const existing = await getPoints(zone);
  const existingSet = new Set(existing.map(p =>
    `${p.period}|${p.name}|${p.coordinates[0].toFixed(4)}|${p.coordinates[1].toFixed(4)}`
  ));

  let total = 0, skipped = 0;
  const perPeriod = [];
  const periods = zoneConfig.PERIODS.filter(p => p.file);

  for (let pi = 0; pi < periods.length; pi++) {
    const period = periods[pi];
    if (onProgress) onProgress(pi + 1, periods.length, period.label);

    try {
      const res = await fetch(dataPath + period.file);
      if (!res.ok) { perPeriod.push({ label: period.label, count: 0 }); continue; }

      let geo;
      if (period.file.endsWith('.geojson')) {
        geo = await res.json();
      } else {
        const text = await res.text();
        const dom = new DOMParser().parseFromString(text, 'text/xml');
        geo = toGeoJSON.kml(dom);
      }
      if (!geo || !geo.features) { perPeriod.push({ label: period.label, count: 0 }); continue; }

      const batch = [];
      for (const f of geo.features) {
        if (!f.geometry || f.geometry.type !== 'Point') continue;

        const rawDesc = (f.properties?.description || '')
          .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

        // Extract actor name: from name property or from description
        let actorName = normalize(f.properties?.name);
        if (!actorName && rawDesc) {
          const m = rawDesc.match(/Nom acteurs?\s*:\s*(.+)/i);
          if (m) actorName = normalize(m[1].trim());
        }
        if (!actorName) { skipped++; continue; }

        const coords = [f.geometry.coordinates[0], f.geometry.coordinates[1]];

        // Duplicate check
        const key = `${period.label}|${actorName}|${coords[0].toFixed(4)}|${coords[1].toFixed(4)}`;
        if (existingSet.has(key)) { skipped++; continue; }
        existingSet.add(key);

        // Extract casualties from description
        let casualties = 0;
        const cm = rawDesc.match(/([0-9][0-9 ]*)\s*(?:tués?|morts?|victimes?|blessés?|hommes)/gi);
        if (cm) {
          const vals = cm.map(n => parseInt(n.replace(/\s/g, ''))).filter(n => !isNaN(n) && n > 0);
          if (vals.length) casualties = Math.max(...vals);
        }

        batch.push({
          coordinates: coords,
          name: actorName,
          description: rawDesc,
          period: period.label,
          _color: zoneConfig.ACTOR_COLORS[actorName] || '#888888',
          _casualties: casualties
        });
      }

      // Bulk insert by batches of 50
      let periodCount = 0;
      for (let i = 0; i < batch.length; i += 50) {
        const chunk = batch.slice(i, i + 50);
        const inserted = await bulkCreatePoints(zone, chunk);
        periodCount += inserted;
      }
      total += periodCount;
      perPeriod.push({ label: period.label, count: periodCount });

    } catch (e) {
      console.warn('Import skip:', period.file, e.message);
      perPeriod.push({ label: period.label, count: 0 });
    }
  }

  await logActivity(zone, 'import', null, `Import fichiers statiques : ${total} points importes`);
  return { total, perPeriod, skipped };
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

export async function exportCSV(zone) {
  const points = await getPoints(zone);
  const headers = ['id','name','period','lng','lat','casualties','color','description','created_at','updated_at'];
  const escape = v => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const rows = points.map(p => [
    p.id, p.name, p.period,
    p.coordinates?.[0] ?? '', p.coordinates?.[1] ?? '',
    p._casualties ?? 0, p._color ?? '',
    (p.description || '').replace(/\n/g, ' | '),
    p.createdAt || '', p.updatedAt || ''
  ].map(escape).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `carto-mo-${zone}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  await logActivity(zone, 'export', null, `Export CSV : ${points.length} points`);
}

// ── PUITS MANAGER ───────────────────────────────────────

let puitsFeatures = [];
let puitsFilteredIndices = null; // null = show all

export function getPuitsFeatures() { return puitsFeatures; }

export async function loadPuitsGeoJSON() {
  try {
    const res = await fetch('../sahel/puits-mali.geojson');
    if (!res.ok) throw new Error('Fichier introuvable');
    const data = await res.json();
    puitsFeatures = data.features || [];
    return puitsFeatures;
  } catch (e) {
    console.warn('Puits GeoJSON not loaded:', e);
    puitsFeatures = [];
    return puitsFeatures;
  }
}

export function renderPuitsTable(container, filter) {
  const tbody = container;
  tbody.innerHTML = '';
  const empty = document.getElementById('puits-empty');
  const count = document.getElementById('puits-count');

  const term = (filter || '').toLowerCase().trim();
  puitsFilteredIndices = [];

  puitsFeatures.forEach((f, i) => {
    const p = f.properties || {};
    const nom = p.nom || p.Nom || p.name || '';
    const region = p.region || p.Région || '';
    if (term && !nom.toLowerCase().includes(term) && !region.toLowerCase().includes(term)) return;

    puitsFilteredIndices.push(i);
    const coords = f.geometry?.coordinates;
    const coordStr = coords ? `${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}` : '—';

    const tr = document.createElement('tr');
    tr.dataset.index = i;
    tr.innerHTML = `<td><input type="checkbox" class="puits-cb" data-index="${i}"></td><td>${nom}</td><td>${region}</td><td>${coordStr}</td>`;
    tbody.appendChild(tr);
  });

  if (empty) empty.style.display = puitsFeatures.length === 0 ? '' : 'none';
  if (count) count.textContent = puitsFeatures.length;
}

export function deleteSelectedPuits() {
  const checked = document.querySelectorAll('.puits-cb:checked');
  if (!checked.length) return 0;
  const indices = [...checked].map(cb => parseInt(cb.dataset.index)).sort((a, b) => b - a);
  indices.forEach(i => puitsFeatures.splice(i, 1));
  return indices.length;
}

export function exportPuitsGeoJSON() {
  const geojson = { type: 'FeatureCollection', features: puitsFeatures };
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `puits-sahel-${new Date().toISOString().slice(0, 10)}.geojson`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importPuitsFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'geojson' || ext === 'json') {
    const text = await file.text();
    const data = JSON.parse(text);
    const features = data.features || [];
    puitsFeatures.push(...features);
    return features.length;
  }

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    let added = 0;
    for (const row of rows) {
      const gps = row['Coordonnées GPS'] || row['Coordonnees GPS'] || row['GPS'] || '';
      const parts = String(gps).split(',');
      if (parts.length < 2) continue;
      const lat = parseFloat(parts[0].trim());
      const lng = parseFloat(parts[1].trim());
      if (isNaN(lat) || isNaN(lng)) continue;
      puitsFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          nom: row['Nom'] || row['nom'] || '',
          region: row['Région'] || row['Region'] || row['region'] || '',
          source: row['Source'] || row['source'] || ''
        }
      });
      added++;
    }
    return added;
  }

  throw new Error('Format non supporte. Utilisez .geojson, .xlsx ou .csv');
}
