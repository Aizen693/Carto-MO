/**
 * user-manager.js — Gestion des utilisateurs (admin only)
 */

import { getUsers, createUser, updateUserRole, deleteUser } from './firestore.js';
import { requireRole } from './auth.js';
import { auth } from '../firebase-config.js';
import {
  createUserWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

export async function renderUserList(container) {
  if (!requireRole('admin')) {
    container.innerHTML = '<div class="log-empty">Acces reserve aux administrateurs</div>';
    return;
  }

  container.innerHTML = '<div class="log-loading">Chargement...</div>';
  try {
    const users = await getUsers();
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'users-header';
    header.innerHTML = `
      <span class="users-title">Utilisateurs</span>
      <button id="btn-add-user" class="admin-btn admin-btn-sm">+ Ajouter</button>
    `;
    container.appendChild(header);

    header.querySelector('#btn-add-user').addEventListener('click', () => showAddUserForm(container));

    const list = document.createElement('div');
    list.id = 'users-list';
    container.appendChild(list);

    users.forEach(u => {
      const row = document.createElement('div');
      row.className = 'user-row';

      const lastLogin = u.lastLogin?.toDate?.()
        ? u.lastLogin.toDate().toLocaleDateString('fr-FR')
        : 'Jamais';

      row.innerHTML = `
        <div class="user-info">
          <span class="user-email">${u.email}</span>
          <span class="user-name">${u.displayName || ''}</span>
          <span class="user-last-login">Dernier login: ${lastLogin}</span>
        </div>
        <div class="user-actions">
          <select class="user-role-select" data-uid="${u.id}">
            <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>Viewer</option>
            <option value="editor" ${u.role === 'editor' ? 'selected' : ''}>Editor</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
      `;

      const select = row.querySelector('.user-role-select');
      select.addEventListener('change', async (e) => {
        try {
          await updateUserRole(u.id, e.target.value);
        } catch (err) {
          alert('Erreur: ' + err.message);
          e.target.value = u.role;
        }
      });

      list.appendChild(row);
    });
  } catch (e) {
    container.innerHTML = `<div class="log-error">Erreur: ${e.message}</div>`;
  }
}

function showAddUserForm(container) {
  if (document.getElementById('add-user-form')) return;

  const form = document.createElement('div');
  form.id = 'add-user-form';
  form.className = 'add-user-form';
  form.innerHTML = `
    <input type="email" id="new-user-email" placeholder="Email" class="admin-input">
    <input type="text" id="new-user-name" placeholder="Nom (optionnel)" class="admin-input">
    <input type="password" id="new-user-password" placeholder="Mot de passe" class="admin-input">
    <select id="new-user-role" class="admin-input">
      <option value="viewer">Viewer</option>
      <option value="editor">Editor</option>
      <option value="admin">Admin</option>
    </select>
    <div class="form-actions-inline">
      <button id="btn-create-user" class="admin-btn">Creer</button>
      <button id="btn-cancel-user" class="admin-btn admin-btn-ghost">Annuler</button>
    </div>
    <div id="add-user-error" class="form-error" style="display:none"></div>
  `;

  const listEl = document.getElementById('users-list');
  container.insertBefore(form, listEl);

  form.querySelector('#btn-cancel-user').addEventListener('click', () => form.remove());
  form.querySelector('#btn-create-user').addEventListener('click', async () => {
    const email = document.getElementById('new-user-email').value.trim();
    const name = document.getElementById('new-user-name').value.trim();
    const password = document.getElementById('new-user-password').value;
    const role = document.getElementById('new-user-role').value;
    const errEl = document.getElementById('add-user-error');

    if (!email || !password) {
      errEl.textContent = 'Email et mot de passe requis';
      errEl.style.display = 'block';
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await createUser(cred.user.uid, { email, displayName: name, role });
      form.remove();
      renderUserList(container);
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    }
  });
}
