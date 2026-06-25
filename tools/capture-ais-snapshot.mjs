#!/usr/bin/env node
/* Recapture AIS snapshot for afrique/ais-snapshot.json using the 5 focused bboxes.
   Usage: node tools/capture-ais-snapshot.mjs [duration_minutes]
   Default duration: 45 min. Writes to afrique/ais-snapshot.json on exit.

   Node >= 22 has native WebSocket — no npm dep required. */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(__dirname, '..', 'afrique', 'ais-snapshot.json');

const AIS_KEY = process.env.AISSTREAM_KEY;
if (!AIS_KEY) { console.error('AISSTREAM_KEY manquante : exporte la variable d\'environnement avant de lancer ce script.'); process.exit(1); }
const DURATION_MIN = Number(process.argv[2]) || 45;
const MERGE_EXISTING = process.argv.includes('--merge');

// 7 bboxes : 5 zones africaines focalisees etendues vers les couloirs maritimes
// + Atlantique mid-ocean (Cape route transatlantic) + cote Med Maghreb (Africa-side).
const BBOXES = [
  [[-50, -45], [38, -6]],   // 1. Atlantique mi-ocean (Cape route, transatlantique Afrique)
  [[-38, -22], [36, 16]],   // 2. Cote Ouest Afrique : Maroc -> Cap, Golfe de Guinee
  [[-50, 12],  [-20, 60]],  // 3. Cap + Sud Indien : Cape route + Mozambique Channel sud
  [[-30, 32],  [20, 78]],   // 4. Cote Est + Madagascar + Indien Ouest : Suez-Inde route
  [[10, 30],   [33, 55]],   // 5. Mer Rouge + Golfe Aden + Suez
  [[22, 48],   [30, 62]],   // 6. Detroit d'Ormuz + Golfe Persique
  [[30, -6],   [46, 36]]    // 7. Med entiere : Maghreb + Med Nord (couverture AISStream maximale)
];

const ZONE_LABELS = ['Atl-mid', 'Cote Ouest', 'Cap+S.Indien', 'Est+Mada+Indien', 'M.Rouge+Aden', 'Ormuz+G.Pers', 'Med Maghreb'];

function inBbox(lat, lng, box) {
  return lat >= box[0][0] && lat <= box[1][0] && lng >= box[0][1] && lng <= box[1][1];
}

function whichZone(lat, lng) {
  for (let i = 0; i < BBOXES.length; i++) if (inBbox(lat, lng, BBOXES[i])) return i;
  return -1;
}

const ships = new Map();
let positionCount = 0;
let staticCount = 0;
const startedAt = Date.now();

// Si --merge, charge le snapshot existant (filtre les positions deja hors-bbox des nouveaux bboxes).
if (MERGE_EXISTING && existsSync(SNAPSHOT_PATH)) {
  try {
    const prev = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    let kept = 0, dropped = 0;
    for (const s of (prev.ships || [])) {
      if (!s || !s.mmsi) continue;
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') continue;
      if (whichZone(s.lat, s.lng) < 0) { dropped++; continue; }
      ships.set(String(s.mmsi), s);
      kept++;
    }
    console.log(`[capture] merge snapshot existant: ${kept} navires conserves, ${dropped} hors nouvelles bboxes`);
  } catch (e) {
    console.warn('[capture] merge snapshot impossible:', e.message);
  }
}

function save() {
  const list = Array.from(ships.values()).filter(s => typeof s.lat === 'number');
  const out = {
    capturedAt: startedAt,
    capturedDurationMin: Math.round((Date.now() - startedAt) / 60000),
    count: list.length,
    bbox: BBOXES,
    ships: list
  };
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(out));
  return list.length;
}

function status() {
  const elapsed = ((Date.now() - startedAt) / 60000).toFixed(1);
  const zoneCounts = new Array(BBOXES.length).fill(0);
  for (const s of ships.values()) {
    if (typeof s.lat !== 'number') continue;
    const z = whichZone(s.lat, s.lng);
    if (z >= 0) zoneCounts[z]++;
  }
  console.log(
    `[${elapsed}min] ships=${ships.size} pos=${positionCount} static=${staticCount} | ` +
    zoneCounts.map((c, i) => `${ZONE_LABELS[i]}:${c}`).join(' ')
  );
}

function connect() {
  console.log(`[capture] connecting (duration=${DURATION_MIN}min, snapshot=${SNAPSHOT_PATH})`);
  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

  ws.addEventListener('open', () => {
    console.log(`[capture] connected, subscribing to ${BBOXES.length} bboxes`);
    ws.send(JSON.stringify({
      APIKey: AIS_KEY,
      BoundingBoxes: BBOXES,
      FilterMessageTypes: ['PositionReport', 'ShipStaticData']
    }));
  });

  ws.addEventListener('message', async (ev) => {
    let raw;
    if (typeof ev.data === 'string') raw = ev.data;
    else if (ev.data instanceof Blob) raw = await ev.data.text();
    else if (ev.data instanceof ArrayBuffer) raw = new TextDecoder().decode(ev.data);
    else return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.error) { console.error('[capture] err:', m.error); return; }
    if (m.MessageType === 'PositionReport') {
      const r = m.Message?.PositionReport;
      if (!r || typeof r.Latitude !== 'number' || typeof r.Longitude !== 'number') return;
      if (whichZone(r.Latitude, r.Longitude) < 0) return;
      const mmsi = String(r.UserID);
      const prev = ships.get(mmsi) || { mmsi };
      ships.set(mmsi, Object.assign(prev, {
        lat: r.Latitude,
        lng: r.Longitude,
        cog: typeof r.Cog === 'number' ? r.Cog : (prev.cog ?? 0),
        sog: typeof r.Sog === 'number' ? r.Sog : (prev.sog ?? 0),
        heading: r.TrueHeading,
        lastUpdate: Date.now()
      }));
      positionCount++;
    } else if (m.MessageType === 'ShipStaticData') {
      const r = m.Message?.ShipStaticData;
      if (!r) return;
      const mmsi = String(r.UserID);
      const prev = ships.get(mmsi) || { mmsi };
      const name = (r.Name || '').trim();
      const dest = (r.Destination || '').trim();
      const cs   = (r.CallSign || '').trim();
      ships.set(mmsi, Object.assign(prev, {
        name: name || prev.name || null,
        type_code: r.Type != null ? r.Type : prev.type_code,
        destination: dest || prev.destination || null,
        callsign: cs || prev.callsign || null,
        imo: r.ImoNumber || prev.imo || null
      }));
      staticCount++;
    }
  });

  ws.addEventListener('close', () => {
    console.log('[capture] WS closed, reconnecting in 3s');
    setTimeout(connect, 3000);
  });

  ws.addEventListener('error', (e) => {
    console.error('[capture] WS error', e?.message || e);
  });

  return ws;
}

const ws = connect();
const statusInterval = setInterval(status, 60000);
const saveInterval = setInterval(() => {
  const n = save();
  console.log(`[capture] partial save: ${n} ships`);
}, 300000);

setTimeout(() => {
  clearInterval(statusInterval);
  clearInterval(saveInterval);
  const n = save();
  console.log(`[capture] DONE — ${n} ships saved to ${SNAPSHOT_PATH}`);
  console.log(`[capture] totals: positionReports=${positionCount} staticData=${staticCount}`);
  status();
  try { ws.close(); } catch {}
  process.exit(0);
}, DURATION_MIN * 60 * 1000);

process.on('SIGINT', () => {
  const n = save();
  console.log(`\n[capture] interrupted — ${n} ships saved`);
  process.exit(0);
});
