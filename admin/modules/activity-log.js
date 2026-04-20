/**
 * activity-log.js — Journal d'activite
 */

import { getActivityLog } from './firestore.js?v=20260420a';

export async function renderActivityLog(container, zone) {
  container.innerHTML = '<div class="log-loading">Chargement...</div>';
  try {
    const logs = await getActivityLog(zone, 100);
    if (!logs.length) {
      container.innerHTML = '<div class="log-empty">Aucune activite enregistree</div>';
      return;
    }

    container.innerHTML = '';
    logs.forEach(entry => {
      const el = document.createElement('div');
      el.className = 'log-entry';

      const ts = entry.timestamp?.toDate?.() || new Date();
      const date = ts.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const time = ts.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

      const actionClass = {
        create: 'log-action-create',
        update: 'log-action-update',
        delete: 'log-action-delete',
        import: 'log-action-import',
        export: 'log-action-export',
        login:  'log-action-login'
      }[entry.action] || '';

      el.innerHTML = `
        <div class="log-meta">
          <span class="log-date">${date} ${time}</span>
          <span class="log-action ${actionClass}">${entry.action.toUpperCase()}</span>
          <span class="log-zone">${entry.zone || ''}</span>
        </div>
        <div class="log-details">${entry.details || ''}</div>
        <div class="log-user">${entry.userEmail || ''}</div>
      `;
      container.appendChild(el);
    });
  } catch (e) {
    container.innerHTML = `<div class="log-error">Erreur: ${e.message}</div>`;
  }
}
