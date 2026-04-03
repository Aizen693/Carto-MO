/**
 * auth.js — Authentification Firebase (email/password) + gestion des roles
 */

import { auth, db } from '../firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  doc, getDoc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let currentUser = null;

export function getCurrentUser() { return currentUser; }

export function initAuth(onLogin, onLogout) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists()) {
        await signOut(auth);
        onLogout('Compte non autorise. Contactez un administrateur.');
        return;
      }
      const data = snap.data();
      currentUser = { uid: user.uid, email: user.email, ...data };
      await updateDoc(doc(db, 'users', user.uid), { lastLogin: serverTimestamp() });
      onLogin(currentUser);
    } else {
      currentUser = null;
      onLogout();
    }
  });
}

export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  currentUser = null;
  return signOut(auth);
}

export function requireRole(minRole) {
  if (!currentUser) return false;
  const hierarchy = { viewer: 0, editor: 1, admin: 2 };
  return (hierarchy[currentUser.role] || 0) >= (hierarchy[minRole] || 0);
}
