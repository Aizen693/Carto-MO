/**
 * point-form.js — Formulaire creation/edition de point (drawer bas)
 */

import { createPoint, updatePoint, softDeletePoint } from './firestore.js';
import { getCurrentUser, requireRole } from './auth.js';
import { renderAdminPoints, selectPoint, clearSelection, flyToPoint } from './map-editor.js';

let currentPoint = null;
let currentZone = null;
let zoneConfig = null;
let refreshCb = null;

export function init(zone, config, onRefresh) {
  currentZone = zone;
  zoneConfig = config;
  refreshCb = onRefresh;
  setupFormEvents();
}

export function updateZone(zone, config) {
  currentZone = zone;
  zoneConfig = config;
  closeForm();
}

function setupFormEvents() {
  document.getElementById('form-save').addEventListener('click', savePoint);
  document.getElementById('form-cancel').addEventListener('click', closeForm);
  document.getElementById('form-delete').addEventListener('click', deletePoint);
}

export function openCreateForm(lngLat) {
  if (!requireRole('editor')) return;
  currentPoint = null;
  const drawer = document.getElementById('point-drawer');
  drawer.classList.add('open');
  document.getElementById('drawer-title').textContent = 'Nouveau point';
  document.getElementById('form-delete').style.display = 'none';

  document.getElementById('field-lng').value = lngLat[0].toFixed(5);
  document.getElementById('field-lat').value = lngLat[1].toFixed(5);
  document.getElementById('field-actor').value = '';
  document.getElementById('field-period').value = '';
  document.getElementById('field-date').value = '';
  document.getElementById('field-country').value = '';
  document.getElementById('field-event').value = '';
  document.getElementById('field-detail').value = '';
  document.getElementById('field-casualties').value = '0';

  populateDropdowns();
}

export function openEditForm(point) {
  if (!requireRole('editor')) return;
  currentPoint = point;
  const drawer = document.getElementById('point-drawer');
  drawer.classList.add('open');
  document.getElementById('drawer-title').textContent = 'Modifier point';
  document.getElementById('form-delete').style.display = requireRole('admin') ? 'inline-flex' : 'none';

  document.getElementById('field-lng').value = point.coordinates[0].toFixed(5);
  document.getElementById('field-lat').value = point.coordinates[1].toFixed(5);
  document.getElementById('field-casualties').value = point._casualties || 0;

  populateDropdowns();
  document.getElementById('field-actor').value = point.name || '';
  document.getElementById('field-period').value = point.period || '';

  const desc = parseDescription(point.description);
  document.getElementById('field-date').value = desc.date || '';
  document.getElementById('field-country').value = desc.pays || '';
  document.getElementById('field-event').value = desc.evenement || '';
  document.getElementById('field-detail').value = desc.detail || '';
}

export function closeForm() {
  document.getElementById('point-drawer').classList.remove('open');
  currentPoint = null;
  clearSelection();
}

function populateDropdowns() {
  const actorSelect = document.getElementById('field-actor');
  const periodSelect = document.getElementById('field-period');

  if (actorSelect.options.length <= 1) {
    actorSelect.innerHTML = '<option value="">-- Acteur --</option>';
    if (zoneConfig && zoneConfig.ACTOR_GROUPS) {
      for (const [group, actors] of Object.entries(zoneConfig.ACTOR_GROUPS)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group;
        actors.forEach(a => {
          const opt = document.createElement('option');
          opt.value = a; opt.textContent = a;
          optgroup.appendChild(opt);
        });
        actorSelect.appendChild(optgroup);
      }
    }
  }

  if (periodSelect.options.length <= 1) {
    periodSelect.innerHTML = '<option value="">-- Periode --</option>';
    if (zoneConfig && zoneConfig.PERIODS) {
      zoneConfig.PERIODS.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.label; opt.textContent = p.label;
        periodSelect.appendChild(opt);
      });
    }
  }
}

function buildDescription() {
  const date = document.getElementById('field-date').value.trim();
  const pays = document.getElementById('field-country').value.trim();
  const evt  = document.getElementById('field-event').value.trim();
  const det  = document.getElementById('field-detail').value.trim();
  const parts = [];
  if (date) parts.push(`Date: ${date}`);
  if (pays) parts.push(`Pays: ${pays}`);
  if (evt)  parts.push(`Evenement: ${evt}`);
  if (det)  parts.push(`Detail: ${det}`);
  return parts.join('\n');
}

function parseDescription(desc) {
  const r = {};
  if (!desc) return r;
  desc.split('\n').forEach(line => {
    const m = line.match(/^([^:]+):\s*(.+)$/);
    if (m) {
      const k = m[1].trim().toLowerCase();
      const v = m[2].trim();
      if (k === 'date') r.date = v;
      else if (k === 'pays') r.pays = v;
      else if (k.startsWith('ev') || k.startsWith('év')) r.evenement = v;
      else if (k.startsWith('det') || k.startsWith('dét')) r.detail = v;
    }
  });
  return r;
}

function getActorColor(actorName) {
  if (zoneConfig && zoneConfig.ACTOR_COLORS && zoneConfig.ACTOR_COLORS[actorName]) {
    return zoneConfig.ACTOR_COLORS[actorName];
  }
  return '#888888';
}

function validate() {
  const actor = document.getElementById('field-actor').value;
  const period = document.getElementById('field-period').value;
  const lng = document.getElementById('field-lng').value;
  const lat = document.getElementById('field-lat').value;
  if (!actor || !period || !lng || !lat) {
    showFormError('Acteur, periode et coordonnees sont requis.');
    return false;
  }
  return true;
}

function showFormError(msg) {
  const el = document.getElementById('form-error');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

async function savePoint() {
  if (!validate()) return;
  const actor = document.getElementById('field-actor').value;
  const data = {
    coordinates: [
      parseFloat(document.getElementById('field-lng').value),
      parseFloat(document.getElementById('field-lat').value)
    ],
    name: actor,
    description: buildDescription(),
    period: document.getElementById('field-period').value,
    _color: getActorColor(actor),
    _casualties: parseInt(document.getElementById('field-casualties').value) || 0,
    zone: currentZone
  };

  try {
    if (currentPoint) {
      await updatePoint(currentPoint.id, data);
    } else {
      await createPoint(currentZone, data);
    }
    closeForm();
    if (refreshCb) refreshCb();
  } catch (e) {
    showFormError('Erreur: ' + e.message);
  }
}

async function deletePoint() {
  if (!currentPoint) return;
  if (!confirm('Supprimer ce point ?')) return;
  try {
    await softDeletePoint(currentPoint.id, currentZone, currentPoint.name);
    closeForm();
    if (refreshCb) refreshCb();
  } catch (e) {
    showFormError('Erreur: ' + e.message);
  }
}
