/**
 * actor-manager.js — Gestion des acteurs (couleurs, groupes)
 */

import { getZoneConfig, updateZoneConfig } from './firestore.js?v=20260420a';
import { requireRole } from './auth.js?v=20260420a';

let currentZone = null;
let localConfig = null;

export function init(zone, zoneConfig) {
  currentZone = zone;
  localConfig = zoneConfig;
}

export function updateZone(zone, zoneConfig) {
  currentZone = zone;
  localConfig = zoneConfig;
}

export async function renderActorList(container) {
  container.innerHTML = '';
  if (!localConfig || !localConfig.ACTOR_GROUPS) return;

  const fsConfig = await getZoneConfig(currentZone);
  const colorOverrides = fsConfig?.actorColors || {};

  for (const [group, actors] of Object.entries(localConfig.ACTOR_GROUPS)) {
    const groupEl = document.createElement('div');
    groupEl.className = 'actor-group';
    groupEl.innerHTML = `<div class="actor-group-title">${group}</div>`;

    actors.forEach(actor => {
      const color = colorOverrides[actor] || localConfig.ACTOR_COLORS[actor] || '#888888';
      const row = document.createElement('div');
      row.className = 'actor-row';
      row.innerHTML = `
        <span class="actor-dot" style="background:${color}"></span>
        <span class="actor-name">${actor}</span>
        <input type="color" class="actor-color-input" value="${color}"
               data-actor="${actor}" title="Modifier la couleur">
      `;
      const input = row.querySelector('.actor-color-input');
      input.addEventListener('change', (e) => onColorChange(actor, e.target.value));
      groupEl.appendChild(row);
    });

    container.appendChild(groupEl);
  }
}

async function onColorChange(actor, color) {
  if (!requireRole('admin')) {
    alert('Seul un admin peut modifier les couleurs.');
    return;
  }
  try {
    const fsConfig = await getZoneConfig(currentZone) || {};
    const colors = fsConfig.actorColors || {};
    colors[actor] = color;
    await updateZoneConfig(currentZone, { actorColors: colors });
  } catch (e) {
    console.error('Erreur mise a jour couleur:', e);
  }
}
