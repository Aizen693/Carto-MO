/**
 * admin.js — Orchestrateur principal du panneau admin
 *
 * Gere l'etat d'authentification, le routage sidebar,
 * le changement de zone et la coordination des modules.
 */

import { initAuth, login, logout, getCurrentUser, requireRole } from './modules/auth.js';
import { getPoints } from './modules/firestore.js';
import { logActivity } from './modules/firestore.js';
import {
  initEditorMap, whenReady, renderAdminPoints, renderStaticPoints, onMapClick, onPointClick,
  flyToPoint, selectPoint, switchZone, destroy as destroyMap
} from './modules/map-editor.js';
import { init as initForm, openCreateForm, openEditForm, updateZone as updateFormZone } from './modules/point-form.js';
import { init as initActors, renderActorList, updateZone as updateActorZone } from './modules/actor-manager.js';
import { importGeoJSON, importStaticFiles, exportGeoJSON } from './modules/import-export.js';
import { purgeEmptyPoints } from './modules/firestore.js';
import { renderActivityLog } from './modules/activity-log.js';
import { renderUserList } from './modules/user-manager.js';

// ── Zone configs (mirrored from each zone's index.html) ─────────────

const ZONE_CONFIGS = {
  'moyen-orient': {
    ACTOR_GROUPS: {
      'Milices chiites': ['Hezbollah','Asaib Ahl al-Haq','IRGC-Qods Force','Kataib Hezbollah','Basij','Kataib Sayyid al-Shuhada','Harakat Hezbollah al-Nujaba','Fatemiyoun Brigade','Zainebiyoun Brigade','PMF / Hashd al-Shaabi','IRGC Ground Forces','Houthis'],
      'Groupes sunnites': ['Daesh','Jabhat al-Nusra','Ahrar al-Sham','Jaysh al-Islam','HTS','Hayat Tahrir al-Sham','Jund al-Aqsa'],
      'Forces etatiques': ['SAA','IDF','TSK','Coalition USA','Coalition arabe','Armee irakienne','Peshmerga','SDF / FDS','YPG / YPJ'],
      'Autres': ['Al-Qaeda','PKK','PFLP','Hamas','Jihad Islamique']
    },
    ACTOR_COLORS: {
      'Hezbollah':'#e63946','Asaib Ahl al-Haq':'#ff6b35','IRGC-Qods Force':'#c1121f',
      'IRGC-Qods Force+Basij':'#9d0208','Kataib Hezbollah':'#ff4d6d','Basij':'#dc2f02',
      'Kataib Sayyid al-Shuhada':'#f48c06','Harakat Hezbollah al-Nujaba':'#e85d04',
      'Fatemiyoun Brigade':'#faa307','PMF / Hashd al-Shaabi':'#ffba08',
      'PMF / Hashd al-Shaabi+Kataib Hezbollah':'#e76f51','IRGC Ground Forces':'#ae2012',
      'Zainebiyoun Brigade':'#bb3e03','Houthis':'#7b2d8b','Daesh':'#555555',
      'Daesh + Armées Irakiennes':'#777777','Coalition Internationale':'#1d7ed8',
      'USA, Force Delta':'#0077b6','Peshmergas':'#ccaa00','Armées Irakiennes':'#2d6a4f',
      'Armées Irakiennes + Peshmergas vs. Daesh':'#40916c','Forces Démocratiques Syriennes':'#48cae4',
      'Harakat Kataib Hezbollah':'#ff4d6d',
      'Jabhat al-Nusra':'#6d023a','Ahrar al-Sham':'#9b2c9b','Jaysh al-Islam':'#4a0e4e',
      'HTS':'#5a189a','Hayat Tahrir al-Sham':'#5a189a','Jund al-Aqsa':'#3c096c',
      'SAA':'#1d7ed8','IDF':'#0077b6','TSK':'#48cae4',
      'SDF / FDS':'#74c69d','YPG / YPJ':'#95d5b2',
      'Al-Qaeda':'#ccaa00','PKK':'#b5a300','PFLP':'#9c8b00','Hamas':'#d4a017','Jihad Islamique':'#c9a227'
    },
    normalizeName: function(raw) {
      if (!raw) return null;
      const n = raw.trim();
      if (!n || /^\d{4}-\d{4}$/.test(n)) return null;
      const M = {
        'Asaib Ahl al-Haq ':'Asaib Ahl al-Haq','Basij ':'Basij',
        'Coalition':'Coalition Internationale','Coalition Int.':'Coalition Internationale',
        'Daesh-Armées Irakiennes':'Daesh + Armées Irakiennes',
        'Force Démocratiques Syriennes':'Forces Démocratiques Syriennes',
        'Hezbollah ':'Hezbollah','IRGC-Qods':'IRGC-Qods Force',
        'IRGC-Qods Force ':'IRGC-Qods Force','IRGC-Qods Force+Basij ':'IRGC-Qods Force+Basij',
        'Kataib Hezbollah ':'Kataib Hezbollah',
        'PMF / Hashd al-Shaabi ':'PMF / Hashd al-Shaabi',
        ' PMF / Hashd al-Shaabi':'PMF / Hashd al-Shaabi',
        'Houthis ':'Houthis','Harakat Hezbollah al-Nujaba ':'Harakat Hezbollah al-Nujaba',
        'Harakat Kataib Hezbollah ':'Harakat Kataib Hezbollah'
      };
      return M[n] !== undefined ? M[n] : n;
    },
    PERIODS: [
      { label: '2005-2006', file: '2005-2006.geojson' },
      { label: '2007-2008', file: '2007-2008.geojson' },
      { label: '2009-2010', file: '2009-2010.geojson' },
      { label: '2011-2012', file: '2011-2012.geojson' },
      { label: '2013-2014', file: '2013-2014.geojson' },
      { label: '2015-2016', file: '2015-2016.geojson' },
      { label: '2017-2018', file: '2017-2018.geojson' },
      { label: '2019-2020', file: '2019-2020.geojson' },
      { label: '2021-2022', file: '2021-2022.geojson' },
      { label: '2023-2026', file: '2023-2026.geojson' }
    ],
    OVERLAY_LAYERS: [
      { id: 'zones-daesh', label: 'Zones Daesh (2013-2016)', file: 'map-zones.json', cat: 'Territoires' }
    ],
    DATA_PATH: '../moyen-orient/',
    STYLES: { standard: 'mapbox://styles/mapbox/standard', satellite: 'mapbox://styles/mapbox/satellite-streets-v12', dark: 'mapbox://styles/mapbox/dark-v11' },
    MAP_CENTER: [43, 30], MAP_ZOOM: 4.5, MAP_BEARING: 0
  },
  'sahel': {
    ACTOR_GROUPS: {
      'Groupes jihadistes': ['JNIM','GSIM','AQMI','Ansar Dine','MUJAO','Al-Mourabitoun','Katiba Macina','Katiba Serma','Ansarul Islam','ISWAP','ISGS','Boko Haram'],
      'Forces etatiques & coalitions': ['Armee malienne (FAMA)','Armee burkinabe (ANA)','Armee nigerienne (FAN)','Armee tchadienne (ANT)','Force Barkhane','G5 Sahel','MINUSMA','Wagner / Africa Corps'],
      'Milices & groupes armes': ['GATIA','MSA','Dan Nan Ambassagou','VDP / Dozos','Milices Koglweogo','Milices Peules'],
      'Mouvements politico-militaires': ['MNLA','CMA','Plateforme','HCUA','MAA','CMFPR']
    },
    ACTOR_COLORS: {
      'JNIM':'#e63946','GSIM':'#c1121f','AQMI':'#9d0208','Ansar Dine':'#dc2f02',
      'MUJAO':'#e85d04','Al-Mourabitoun':'#f48c06','Katiba Macina':'#ff4d6d',
      'Katiba Serma':'#ff6b35','Ansarul Islam':'#faa307','ISWAP':'#6d023a',
      'ISGS':'#7b2d8b','Boko Haram':'#4a0e4e',
      'Armee malienne (FAMA)':'#1d7ed8','Armee burkinabe (ANA)':'#0077b6',
      'Armee nigerienne (FAN)':'#0096c7','Armee tchadienne (ANT)':'#48cae4',
      'Force Barkhane':'#2d6a4f','G5 Sahel':'#52b788','MINUSMA':'#74c69d','Wagner / Africa Corps':'#6c757d',
      'GATIA':'#ccaa00','MSA':'#b5a300','Dan Nan Ambassagou':'#d4a017',
      'VDP / Dozos':'#c9a227','Milices Koglweogo':'#a07800','Milices Peules':'#8b6914',
      'MNLA':'#7b68ee','CMA':'#6a5acd','Plateforme':'#483d8b','HCUA':'#9370db','MAA':'#8a6bb1','CMFPR':'#7a5c9e'
    },
    PERIODS: [
      { label: 'Jan 01-15', file: '2026-jan-01-15.geojson' },
      { label: 'Jan 16-31', file: '2026-jan-16-31.geojson' },
      { label: 'Fev 01-14', file: '2026-fev-01-14.geojson' },
      { label: 'Fev 15-28', file: '2026-fev-15-28.geojson' },
      { label: 'Mars 01-15', file: '2026-mars-01-15.geojson' },
      { label: 'Mars 16-31', file: '2026-mars-16-31.geojson' }
    ],
    OVERLAY_LAYERS: [
      { id: 'ethnies',          label: 'Ethnies & sous-groupes',        file: 'ethnies.geojson',         cat: 'Populations' },
      { id: 'forces',           label: 'Forces en presence',            file: 'forces.geojson',          cat: 'Securite' },
      { id: 'points-eau',       label: 'Points d\'eau',                 file: 'points-eau.geojson',      cat: 'Terrain & Ressources' },
      { id: 'population',       label: 'Population & mobilites',        file: 'population.geojson',      cat: 'Populations' },
      { id: 'mines',            label: 'Ressources minieres',           file: 'mines.geojson',           cat: 'Terrain & Ressources' },
      { id: 'infrastructures',  label: 'Infrastructures & axes',        file: 'infrastructures.geojson', cat: 'Terrain & Ressources' },
      { id: 'evenements',       label: 'Evenements securitaires',       file: 'evenements.geojson',      cat: 'Securite' },
      { id: 'flux',             label: 'Flux & trafics',                file: 'flux.geojson',            cat: 'Reseaux illicites' }
    ],
    DATA_PATH: '../sahel/',
    STYLES: { standard: 'mapbox://styles/mapbox/standard', satellite: 'mapbox://styles/mapbox/satellite-streets-v12', dark: 'mapbox://styles/mapbox/dark-v11' },
    MAP_CENTER: [1.5, 15.5], MAP_ZOOM: 4.8, MAP_BEARING: -10
  },
  'rdc': {
    ACTOR_GROUPS: {
      'Groupes armes': ['M23','ADF / MTM','CODECO','FDLR','Mai-Mai','Nyatura','NDC-R','APCLS','Twirwaneho'],
      'Forces etatiques': ['FARDC','MONUSCO','Force EAC','SADC / SAMIDRC','Armee ougandaise (UPDF)','Armee rwandaise (RDF)','Armee burundaise (FDNB)'],
      'Milices locales': ['Wazalendo','Raia Mutomboki','Mai-Mai Yakutumba','FPIC','FRPI']
    },
    ACTOR_COLORS: {
      'M23':'#e63946','ADF / MTM':'#9d0208','CODECO':'#dc2f02','FDLR':'#c1121f',
      'Mai-Mai':'#e85d04','Nyatura':'#f48c06','NDC-R':'#ff4d6d','APCLS':'#ff6b35','Twirwaneho':'#faa307',
      'FARDC':'#1d7ed8','MONUSCO':'#74c69d','Force EAC':'#52b788','SADC / SAMIDRC':'#40916c',
      'Armee ougandaise (UPDF)':'#0096c7','Armee rwandaise (RDF)':'#48cae4','Armee burundaise (FDNB)':'#90e0ef',
      'Wazalendo':'#ccaa00','Raia Mutomboki':'#b5a300','Mai-Mai Yakutumba':'#d4a017','FPIC':'#c9a227','FRPI':'#a07800'
    },
    PERIODS: [
      { label: '2023' }, { label: '2024-S1' }, { label: '2024-S2' },
      { label: '2025-S1' }, { label: '2025-S2' }, { label: '2026' }
    ],
    OVERLAY_LAYERS: [],
    DATA_PATH: '../rdc/',
    STYLES: { standard: 'mapbox://styles/mapbox/standard', satellite: 'mapbox://styles/mapbox/satellite-streets-v12', dark: 'mapbox://styles/mapbox/dark-v11' },
    MAP_CENTER: [28.5, -1.5], MAP_ZOOM: 6, MAP_BEARING: 0
  }
};

// ── State ───────────────────────────────────────────────

let currentZone = 'moyen-orient';
let points = [];

// ── Init ────────────────────────────────────────────────

initAuth(onLogin, onLogout);

function onLogin(user) {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('user-badge').textContent = user.email;
  document.getElementById('role-badge').textContent = user.role;

  logActivity('', 'login', null, `Connexion de ${user.email}`);
  setupApp();
}

function onLogout(errorMsg) {
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  if (errorMsg) {
    const el = document.getElementById('login-error');
    el.textContent = errorMsg;
    el.style.display = 'block';
  }
}

// ── Login form ──────────────────────────────────────────

document.getElementById('login-btn').addEventListener('click', doLogin);
document.getElementById('login-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = 'Email et mot de passe requis';
    errEl.style.display = 'block';
    return;
  }

  try {
    await login(email, password);
  } catch (e) {
    errEl.textContent = 'Identifiants invalides';
    errEl.style.display = 'block';
  }
}

document.getElementById('btn-logout').addEventListener('click', logout);

// ── App setup ───────────────────────────────────────────

async function setupApp() {
  const config = ZONE_CONFIGS[currentZone];
  initEditorMap('admin-map', config);
  initForm(currentZone, config, refreshPoints);
  initActors(currentZone, config);

  onMapClick((lngLat) => {
    if (requireRole('editor')) openCreateForm(lngLat);
  });

  onPointClick((pointId) => {
    const p = points.find(pt => pt.id === pointId);
    if (p) openEditForm(p);
  });

  setupSidebarTabs();
  setupZoneSelect();
  setupImportExport();
  setupCalquesManager();
  setupConverter();
  setupMapCoords();

  // Wait for map to be fully loaded before rendering points
  await whenReady();
  refreshPoints();
  loadStaticFiles();
}

// ── Sidebar tabs ────────────────────────────────────────

function setupSidebarTabs() {
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');

      if (tab.dataset.tab === 'actors') {
        renderActorList(document.getElementById('actors-list'));
      } else if (tab.dataset.tab === 'io') {
        refreshCalquesList();
      } else if (tab.dataset.tab === 'logs') {
        refreshLogs();
      } else if (tab.dataset.tab === 'users') {
        renderUserList(document.getElementById('users-container'));
      }
    });
  });

  // Hide users tab for non-admins
  if (!requireRole('admin')) {
    const usersTab = document.querySelector('[data-tab="users"]');
    if (usersTab) usersTab.style.display = 'none';
  }
}

// ── Zone select ─────────────────────────────────────────

function setupZoneSelect() {
  const select = document.getElementById('zone-select');
  select.value = currentZone;
  select.addEventListener('change', (e) => {
    currentZone = e.target.value;
    const config = ZONE_CONFIGS[currentZone];
    switchZone(config);
    updateFormZone(currentZone, config);
    updateActorZone(currentZone, config);
    updateIOZoneBadge();
    refreshPoints();
    loadStaticFiles();
  });
}

// ── Import/Export ────────────────────────────────────────

function updateIOZoneBadge() {
  const badge = document.getElementById('io-zone-badge');
  if (badge) {
    const labels = { 'moyen-orient': 'Moyen-Orient', 'sahel': 'Sahel', 'rdc': 'RDC' };
    badge.textContent = labels[currentZone] || currentZone;
  }
  // Rafraichir la liste des calques
  refreshCalquesList();
}

function setIOStatus(elId, msg, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = 'io-status' + (type === 'ok' ? ' io-status-ok' : type === 'err' ? ' io-status-err' : '');
}

function setupImportExport() {
  updateIOZoneBadge();

  // ── Import GeoJSON ──
  document.getElementById('btn-import').addEventListener('click', async () => {
    const fileInput = document.getElementById('import-file');
    if (!fileInput.files.length) { setIOStatus('import-status', 'Selectionnez un fichier GeoJSON.', 'err'); return; }
    if (!requireRole('editor')) { setIOStatus('import-status', 'Permission insuffisante.', 'err'); return; }

    const btn = document.getElementById('btn-import');
    const fileName = fileInput.files[0].name;
    btn.disabled = true;
    setIOStatus('import-status', `Import de "${fileName}" en cours...`);

    try {
      const count = await importGeoJSON(fileInput.files[0], currentZone, ZONE_CONFIGS[currentZone]);
      setIOStatus('import-status', `${count} points importes depuis "${fileName}".`, 'ok');
      fileInput.value = '';
      refreshPoints();
      loadStaticFiles();
    } catch (e) {
      setIOStatus('import-status', 'Erreur : ' + e.message, 'err');
    }
    btn.disabled = false;
  });

  // ── Export GeoJSON ──
  document.getElementById('btn-export').addEventListener('click', async () => {
    const btn = document.getElementById('btn-export');
    btn.disabled = true;
    try {
      await exportGeoJSON(currentZone);
    } catch (e) {
      alert('Erreur export : ' + e.message);
    }
    btn.disabled = false;
  });

  // ── Migration batch vers Supabase ──
  const batchBtn = document.getElementById('btn-batch-import');
  if (batchBtn) {
    batchBtn.addEventListener('click', async () => {
      if (!requireRole('admin')) { setIOStatus('batch-import-status', 'Reserve aux administrateurs.', 'err'); return; }
      const config = ZONE_CONFIGS[currentZone];
      if (!config.DATA_PATH) { setIOStatus('batch-import-status', 'Pas de fichiers statiques pour cette zone.', 'err'); return; }
      if (!confirm(`Migrer tous les fichiers statiques de la zone "${currentZone}" vers Supabase ?\nLes doublons seront ignores.`)) return;

      batchBtn.disabled = true;
      const progressWrap = document.getElementById('batch-import-progress');
      const progressFill = document.getElementById('batch-progress-fill');
      const progressLabel = document.getElementById('batch-progress-label');
      if (progressWrap) progressWrap.style.display = 'flex';

      try {
        const result = await importStaticFiles(currentZone, config, (current, total, label) => {
          const pct = Math.round((current / total) * 100);
          if (progressFill) progressFill.style.width = pct + '%';
          if (progressLabel) progressLabel.textContent = `${current}/${total} — ${label}`;
          setIOStatus('batch-import-status', `Periode ${current}/${total} : ${label}...`);
        });

        if (progressFill) progressFill.style.width = '100%';
        const summary = result.perPeriod.filter(p => p.count > 0).map(p => `${p.label}: ${p.count}`).join(', ');
        setIOStatus('batch-import-status', `${result.total} points importes, ${result.skipped} ignores.${summary ? ' (' + summary + ')' : ''}`, 'ok');
        refreshPoints();
        loadStaticFiles();
      } catch (e) {
        setIOStatus('batch-import-status', 'Erreur : ' + e.message, 'err');
      }

      batchBtn.disabled = false;
      setTimeout(() => { if (progressWrap) progressWrap.style.display = 'none'; }, 4000);
    });
  }

  // ── Purge empty points (orphan puits) ──
  const purgeBtn = document.getElementById('btn-purge-empty');
  if (purgeBtn) {
    purgeBtn.addEventListener('click', async () => {
      if (!requireRole('admin')) { setIOStatus('purge-status', 'Reserve aux administrateurs.', 'err'); return; }
      if (!confirm(`Supprimer tous les points SANS NOM ou SANS PERIODE de la zone "${currentZone}" ?\nCette action est irreversible.`)) return;

      purgeBtn.disabled = true;
      setIOStatus('purge-status', 'Purge en cours...');
      try {
        const count = await purgeEmptyPoints(currentZone);
        setIOStatus('purge-status', `${count} points vides supprimes.`, count > 0 ? 'ok' : '');
        if (count > 0) refreshPoints();
      } catch (e) {
        setIOStatus('purge-status', 'Erreur : ' + e.message, 'err');
      }
      purgeBtn.disabled = false;
    });
  }
}

// ── Calques manager ────────────────────────────────────

let calqueImportTarget = null; // which overlay id is being imported
const calquePurgedAt = {}; // zone:id → "dd/mm/yyyy hh:mm" when purged

// ── Helpers: CSV/rows → GeoJSON ────────────────────────

function parseCSVtoGeoJSON(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV: au moins un en-tete + une ligne');
  const sep = text.includes('\t') ? '\t' : text.includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, j) => { if (h) row[h] = vals[j] || ''; });
    rows.push(row);
  }
  return rowsToGeoJSON(rows);
}

function rowsToGeoJSON(rows) {
  const allKeys = rows[0] ? Object.keys(rows[0]) : [];
  const latAliases = ['lat', 'latitude', 'y'];
  const lngAliases = ['lng', 'lon', 'longitude', 'long', 'x'];
  const latCol = allKeys.find(k => latAliases.includes(k.toLowerCase().trim()));
  const lngCol = allKeys.find(k => lngAliases.includes(k.toLowerCase().trim()));

  const features = [];
  for (const row of rows) {
    const vals = Object.values(row).filter(v => v && v.toString().trim());
    if (!vals.length) continue;

    let lat = latCol ? parseFloat(row[latCol]) : 0;
    let lng = lngCol ? parseFloat(row[lngCol]) : 0;
    if (isNaN(lat)) lat = 0;
    if (isNaN(lng)) lng = 0;

    const props = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === latCol || k === lngCol) continue;
      const s = (v || '').toString().trim();
      if (s) props[k] = s;
    }
    if (!props.name && !props.Name && !props.nom && !props.Nom) {
      const firstKey = Object.keys(props)[0];
      if (firstKey) props.name = props[firstKey];
    }

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: props
    });
  }
  return { type: 'FeatureCollection', features };
}

function setupCalquesManager() {
  const fileInput = document.getElementById('calque-import-file');
  fileInput.addEventListener('change', async () => {
    if (!fileInput.files.length || !calqueImportTarget) return;
    const config = ZONE_CONFIGS[currentZone];
    const overlay = config.OVERLAY_LAYERS?.find(o => o.id === calqueImportTarget);
    if (!overlay) return;

    const statusEl = document.getElementById('calque-status-msg');

    try {
      const file = fileInput.files[0];
      const text = await file.text();
      let data;

      // ── Detect file type and parse accordingly ──
      const isCSV = file.name.endsWith('.csv') || file.name.endsWith('.tsv');
      if (isCSV) {
        data = parseCSVtoGeoJSON(text);
      } else {
        data = JSON.parse(text);
        // Auto-convert JSON array to GeoJSON
        if (Array.isArray(data)) {
          data = rowsToGeoJSON(data);
        }
      }

      // Post-process: fix [0,0] coords from 'Coordonnée'/'Coordonnee'/'coords' column
      if (data && data.features) {
        data.features.forEach(ft => {
          const c = ft.geometry && ft.geometry.coordinates;
          if (c && c[0] === 0 && c[1] === 0) {
            const p = ft.properties || {};
            const raw = p['Coordonnée'] || p['Coordonnee'] || p['coordonnee'] || p['coords'] || p['coordinates'] || '';
            if (raw && raw.includes(',')) {
              const parts = raw.split(',');
              const a = parseFloat(parts[0].trim()), b = parseFloat(parts[1].trim());
              if (!isNaN(a) && !isNaN(b)) {
                // Detect which is lat vs lng (lat is typically < 90)
                if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
                  ft.geometry.coordinates = [b, a]; // lat,lng → [lng,lat]
                } else {
                  ft.geometry.coordinates = [a, b]; // already lng,lat
                }
              }
            }
          }
        });
      }

      if (!data || !data.type || !data.features) {
        throw new Error('Format invalide — GeoJSON, JSON array ou CSV attendu');
      }

      // Push to GitHub repo directly
      let GH_TOKEN = localStorage.getItem('carto_gh_token');
      if (!GH_TOKEN) {
        GH_TOKEN = prompt('Token GitHub requis pour push les calques.\nCollez votre Personal Access Token :');
        if (!GH_TOKEN) throw new Error('Token GitHub requis');
        localStorage.setItem('carto_gh_token', GH_TOKEN);
      }
      const GH_REPO  = 'Aizen693/Carto-MO';
      const zonePath  = config.DATA_PATH.replace('../', '');
      const ghPath    = `${zonePath}${overlay.file}`;
      const content   = JSON.stringify(data, null, 2);
      const b64       = btoa(unescape(encodeURIComponent(content)));

      // Get current file SHA (needed for update)
      let sha = null;
      try {
        const existing = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${ghPath}`, {
          headers: { Authorization: `token ${GH_TOKEN}` }
        });
        if (existing.ok) {
          const meta = await existing.json();
          sha = meta.sha;
        }
      } catch (_) {}

      const body = {
        message: `[admin] Import calque ${overlay.label} (${data.features.length} features)`,
        content: b64
      };
      if (sha) body.sha = sha;

      const resp = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${ghPath}`, {
        method: 'PUT',
        headers: {
          Authorization: `token ${GH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error('GitHub: ' + (err.message || resp.statusText));
      }

      // Clear purged flag on successful import
      delete calquePurgedAt[currentZone + ':' + overlay.id];
      if (statusEl) {
        statusEl.textContent = `${data.features.length} features pushees dans "${overlay.file}". Deploiement en cours...`;
        statusEl.className = 'calque-import-status io-status-ok';
      }
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = 'Erreur : ' + e.message;
        statusEl.className = 'calque-import-status io-status-err';
      }
    }

    fileInput.value = '';
    calqueImportTarget = null;
    // Re-check statuses after a moment
    setTimeout(refreshCalquesList, 1000);
  });

  refreshCalquesList();
}

async function refreshCalquesList() {
  const container = document.getElementById('calques-list');
  const emptyEl = document.getElementById('calques-empty');
  if (!container) return;

  const config = ZONE_CONFIGS[currentZone];
  const overlays = config.OVERLAY_LAYERS || [];

  if (!overlays.length) {
    container.innerHTML = '';
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Check file status + last modified for each overlay
  const statuses = {};
  await Promise.all(overlays.map(async (o) => {
    try {
      const res = await fetch(config.DATA_PATH + o.file + '?v=' + Date.now(), { method: 'GET' });
      if (!res.ok) { statuses[o.id] = 'absent'; return; }
      const lastMod = res.headers.get('Last-Modified');
      const data = await res.json();
      let dateStr = '';
      if (lastMod) {
        const d = new Date(lastMod);
        dateStr = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
      }
      if (data.features && data.features.length > 0) {
        statuses[o.id] = { status: 'ok', count: data.features.length, date: dateStr };
      } else {
        statuses[o.id] = { status: 'vide', count: 0, date: dateStr };
      }
    } catch {
      statuses[o.id] = 'absent';
    }
  }));

  // Render in exact config order, numbered
  let html = '';
  overlays.forEach((o, i) => {
      const s = statuses[o.id];
      const purged = calquePurgedAt[currentZone + ':' + o.id];
      let statusHTML, countLabel, fileLabel, dateLabel;
      if (purged) {
        // Calque was purged this session — show "Supprime" + purge time
        statusHTML = '<span class="calque-status calque-status-vide">Supprime</span>';
        countLabel = '';
        fileLabel = '';
        dateLabel = `<span class="calque-date">${purged}</span>`;
      } else if (s === 'absent') {
        statusHTML = '<span class="calque-status calque-status-absent">Absent</span>';
        countLabel = '';
        fileLabel = '';
        dateLabel = '';
      } else if (s.status === 'vide') {
        statusHTML = '<span class="calque-status calque-status-vide">Vide</span>';
        countLabel = '<span class="calque-count calque-count--empty">0 pts</span>';
        fileLabel = `<span class="calque-file">${o.file}</span>`;
        dateLabel = s.date ? `<span class="calque-date">${s.date}</span>` : '';
      } else {
        statusHTML = '<span class="calque-status calque-status-ok">OK</span>';
        countLabel = `<span class="calque-count">${s.count} pts</span>`;
        fileLabel = `<span class="calque-file">${o.file}</span>`;
        dateLabel = s.date ? `<span class="calque-date">${s.date}</span>` : '';
      }
      html += `<div class="calque-row">
        <div class="calque-row-top">
          <span class="calque-name">${i + 1}. ${o.label}</span>
          <div class="calque-row-meta">
            ${countLabel}
            ${statusHTML}
          </div>
        </div>
        <div class="calque-row-info">
          ${fileLabel}
          ${dateLabel}
        </div>
        <div class="calque-row-actions">
          <button class="calque-btn" data-calque-id="${o.id}">Importer</button>
          <button class="calque-btn calque-btn-del" data-calque-id="${o.id}" data-calque-file="${o.file}" title="Vider ce calque">Vider</button>
        </div>
      </div>`;
  });
  html += '<div id="calque-status-msg" class="calque-import-status"></div>';
  container.innerHTML = html;

  // Bind import buttons
  container.querySelectorAll('.calque-btn:not(.calque-btn-del)').forEach(btn => {
    btn.addEventListener('click', () => {
      calqueImportTarget = btn.dataset.calqueId;
      document.getElementById('calque-import-file').click();
    });
  });

  // Bind delete buttons
  container.querySelectorAll('.calque-btn-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const file = btn.dataset.calqueFile;
      const id = btn.dataset.calqueId;
      if (!confirm(`Vider le calque "${file}" ? Le fichier sera remplace par un GeoJSON vide.`)) return;
      const statusEl = document.getElementById('calque-status-msg');
      try {
        let GH_TOKEN = localStorage.getItem('carto_gh_token');
        if (!GH_TOKEN) {
          GH_TOKEN = prompt('Token GitHub requis.\nCollez votre Personal Access Token :');
          if (!GH_TOKEN) throw new Error('Token GitHub requis');
          localStorage.setItem('carto_gh_token', GH_TOKEN);
        }
        const GH_REPO = 'Aizen693/Carto-MO';
        const emptyGeo = { type: 'FeatureCollection', features: [] };
        const config = ZONE_CONFIGS[currentZone];
        const path = config.DATA_PATH.replace('../', '') + file;
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(emptyGeo))));
        // Get current SHA
        const getRes = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${path}?ref=main`, {
          headers: { 'Authorization': 'token ' + GH_TOKEN }
        });
        if (getRes.ok) {
          const getData = await getRes.json();
          const putRes = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${path}`, {
            method: 'PUT',
            headers: { 'Authorization': 'token ' + GH_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `Vider calque ${file}`, content: content, sha: getData.sha, branch: 'main' })
          });
          if (putRes.ok) {
            const now = new Date();
            calquePurgedAt[currentZone + ':' + id] = now.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' }) + ' ' + now.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
            if (statusEl) { statusEl.textContent = `Calque "${file}" vide avec succes.`; statusEl.className = 'calque-import-status io-status-ok'; }
            refreshCalquesList();
          } else {
            if (statusEl) { statusEl.textContent = 'Erreur GitHub: ' + putRes.status; statusEl.className = 'calque-import-status io-status-err'; }
          }
        } else {
          if (statusEl) { statusEl.textContent = 'Fichier introuvable sur GitHub: ' + getRes.status; statusEl.className = 'calque-import-status io-status-err'; }
        }
      } catch (e) {
        if (statusEl) { statusEl.textContent = 'Erreur: ' + e.message; statusEl.className = 'calque-import-status io-status-err'; }
      }
    });
  });
}

// ── Convertisseur HTML/CSV → GeoJSON ────────────────────

function setupConverter() {
  const btnConvert = document.getElementById('btn-convert');
  const btnDownload = document.getElementById('btn-convert-download');
  const statusEl = document.getElementById('converter-status');
  const inputEl = document.getElementById('converter-input');
  const outputEl = document.getElementById('converter-output');
  if (!btnConvert) return;

  let lastGeoJSON = null;

  btnConvert.addEventListener('click', () => {
    try {
      const raw = inputEl.value.trim();
      if (!raw) throw new Error('Collez du contenu a convertir');

      let rows = [];

      // ── Detect HTML table ──
      if (raw.includes('<table') || raw.includes('<tr')) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${raw}</div>`, 'text/html');
        const table = doc.querySelector('table');
        if (!table) throw new Error('Aucun <table> detecte dans le HTML');

        const trs = table.querySelectorAll('tr');
        if (trs.length < 2) throw new Error('Le tableau doit avoir au moins un en-tete et une ligne');

        // Extract headers from first row
        const headers = [];
        trs[0].querySelectorAll('th, td').forEach(cell => {
          headers.push(cell.textContent.trim());
        });

        // Extract data rows
        for (let i = 1; i < trs.length; i++) {
          const cells = trs[i].querySelectorAll('td, th');
          const row = {};
          cells.forEach((cell, j) => {
            if (headers[j]) row[headers[j]] = cell.textContent.trim();
          });
          rows.push(row);
        }

      // ── Detect CSV ──
      } else if (raw.includes(',') || raw.includes(';') || raw.includes('\t')) {
        const sep = raw.includes('\t') ? '\t' : raw.includes(';') ? ';' : ',';
        const lines = raw.split('\n').filter(l => l.trim());
        if (lines.length < 2) throw new Error('CSV: au moins un en-tete + une ligne');

        const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
          const row = {};
          headers.forEach((h, j) => { if (h) row[h] = vals[j] || ''; });
          rows.push(row);
        }

      // ── Try JSON ──
      } else {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) rows = parsed;
        else throw new Error('Format non reconnu — collez un tableau HTML, du CSV ou un JSON array');
      }

      if (!rows.length) throw new Error('Aucune donnee extraite');

      lastGeoJSON = rowsToGeoJSON(rows);

      // Post-process: fix [0,0] coords from combined coordinate columns
      lastGeoJSON.features.forEach(ft => {
        const c = ft.geometry && ft.geometry.coordinates;
        if (c && c[0] === 0 && c[1] === 0) {
          const p = ft.properties || {};
          const raw = p['Coordonnée'] || p['Coordonnee'] || p['coordonnee'] || p['coords'] || p['coordinates'] || '';
          if (raw && raw.includes(',')) {
            const parts = raw.split(',');
            const a = parseFloat(parts[0].trim()), b = parseFloat(parts[1].trim());
            if (!isNaN(a) && !isNaN(b)) {
              if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
                ft.geometry.coordinates = [b, a];
              } else {
                ft.geometry.coordinates = [a, b];
              }
            }
          }
        }
      });

      const json = JSON.stringify(lastGeoJSON, null, 2);
      outputEl.value = json;
      outputEl.style.display = 'block';
      btnDownload.style.display = 'inline-block';

      const hasZeroCoords = lastGeoJSON.features.some(f => f.geometry.coordinates[0] === 0 && f.geometry.coordinates[1] === 0);
      statusEl.textContent = `${lastGeoJSON.features.length} features converties.${hasZeroCoords ? ' Certaines coordonnees a [0,0] — verifiez vos colonnes lat/lng.' : ''}`;
      statusEl.className = 'io-status io-status-ok';

    } catch (e) {
      statusEl.textContent = 'Erreur : ' + e.message;
      statusEl.className = 'io-status io-status-err';
      outputEl.style.display = 'none';
      btnDownload.style.display = 'none';
    }
  });

  btnDownload.addEventListener('click', () => {
    if (!lastGeoJSON) return;
    const blob = new Blob([JSON.stringify(lastGeoJSON, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'converted.geojson';
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ── Map coordinates display ─────────────────────────────

function setupMapCoords() {
  // Updated on mousemove in map-editor after map loads
  const coordsEl = document.getElementById('map-coords');
  const checkMap = setInterval(() => {
    const { getMap } = { getMap: () => document.getElementById('admin-map')?._mapInstance };
    // We'll use a simpler approach: listen to the map container
    const mapEl = document.getElementById('admin-map');
    if (mapEl && mapEl.querySelector('canvas')) {
      clearInterval(checkMap);
      mapEl.addEventListener('mousemove', (e) => {
        const rect = mapEl.getBoundingClientRect();
        // Use mapbox map instance if available via import
        import('./modules/map-editor.js').then(mod => {
          const m = mod.getMap();
          if (m) {
            const lngLat = m.unproject([e.clientX - rect.left, e.clientY - rect.top]);
            coordsEl.textContent = `${lngLat.lng.toFixed(4)}, ${lngLat.lat.toFixed(4)}`;
          }
        });
      });
    }
  }, 500);
}

// ── Load static GeoJSON/KML files (same data as public map) ────

async function loadStaticFiles() {
  const config = ZONE_CONFIGS[currentZone];
  if (!config.DATA_PATH) return;

  const normalize = config.normalizeName || (n => n ? n.trim() : null);
  const allFeatures = [];

  for (const period of config.PERIODS) {
    if (!period.file) continue;
    try {
      const res = await fetch(config.DATA_PATH + period.file);
      if (!res.ok) continue;
      let geo;
      if (period.file.endsWith('.geojson')) {
        geo = await res.json();
      } else {
        const text = await res.text();
        const dom = new DOMParser().parseFromString(text, 'text/xml');
        geo = toGeoJSON.kml(dom);
      }
      if (geo && geo.features) {
        geo.features.forEach(f => {
          if (!f.geometry || !f.properties) return;

          // Parse description to extract structured fields
          const rawDesc = (f.properties.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
          let actorName = normalize(f.properties.name);

          // Extract actor name from description if name is empty
          if (!actorName && rawDesc) {
            const m = rawDesc.match(/Nom acteurs?\s*:\s*(.+)/i);
            if (m) actorName = normalize(m[1].trim());
          }
          if (!actorName) return;

          f.properties.name = actorName;
          f.properties._period = period.label;
          f.properties._color = config.ACTOR_COLORS[actorName] || '#888888';
          f.properties._desc = rawDesc || null;

          // Extract casualties from description (same logic as import-export.js)
          if (!f.properties._casualties && rawDesc) {
            const cm = rawDesc.match(/([0-9][0-9 ]*)\s*(?:tués?|morts?|victimes?|blessés?|hommes)/gi);
            if (cm) {
              const vals = cm.map(n => parseInt(n.replace(/\s/g, ''))).filter(n => !isNaN(n) && n > 0);
              if (vals.length) f.properties._casualties = Math.max(...vals);
            }
          }
          if (!f.properties._casualties) f.properties._casualties = 0;

          if (f.geometry.type === 'Point') {
            f.geometry.coordinates = [f.geometry.coordinates[0], f.geometry.coordinates[1]];
          }
          allFeatures.push(f);
        });
      }
    } catch (e) {
      console.warn('Static file skipped:', period.file, e.message);
    }
  }

  const pointFeatures = allFeatures.filter(f => f.geometry && f.geometry.type === 'Point');
  renderStaticPoints(pointFeatures);
  document.getElementById('points-count').textContent =
    points.length + ' admin / ' + pointFeatures.length + ' fichiers';
}

// ── Refresh functions ───────────────────────────────────

async function refreshPoints() {
  try {
    points = await getPoints(currentZone);
    renderAdminPoints(points);
    renderPointsList(points);
    document.getElementById('points-count').textContent = points.length;
  } catch (e) {
    console.error('Erreur chargement points:', e);
  }
}

function renderPointsList(pts) {
  const container = document.getElementById('points-list');
  container.innerHTML = '';

  if (!pts.length) {
    container.innerHTML = '<div style="font:400 9px/1.4 var(--m);color:var(--tx2);padding:12px;text-align:center">Aucun point admin pour cette zone.<br>Cliquez sur la carte pour ajouter.</div>';
    return;
  }

  pts.forEach(p => {
    const row = document.createElement('div');
    row.className = 'point-row';
    row.dataset.id = p.id;

    const desc = p.description?.split('\n')[0] || '';
    row.innerHTML = `
      <span class="point-dot" style="background:${p._color || '#888'}"></span>
      <div class="point-info">
        <div class="point-name">${p.name || 'Sans nom'}</div>
        <div class="point-meta">${p.period || ''} ${desc ? '— ' + desc : ''}</div>
      </div>
    `;

    row.addEventListener('click', () => {
      document.querySelectorAll('.point-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      selectPoint(p.id);
      flyToPoint(p.coordinates);
      openEditForm(p);
    });

    container.appendChild(row);
  });
}

function refreshLogs() {
  const zone = document.getElementById('log-zone-filter').value;
  renderActivityLog(document.getElementById('logs-list'), zone);
}

document.getElementById('log-zone-filter').addEventListener('change', refreshLogs);
