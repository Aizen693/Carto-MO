/**
 * auth.js — Authentification Supabase (email/password) + gestion des roles
 */

import { supabase } from '../supabase-config.js';

let currentUser = null;
let _settingUp = false;   // guard against concurrent profile fetches

export function getCurrentUser() { return currentUser; }

async function _setupUser(session, onLogin, onLogout) {
  if (_settingUp) return;          // skip if already running
  _settingUp = true;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, role')
      .eq('id', session.user.id)
      .single();

    if (error || !data) {
      await supabase.auth.signOut();
      onLogout('Compte non autorise. Contactez un administrateur.');
      return;
    }

    currentUser = {
      uid: session.user.id,
      email: session.user.email,
      displayName: data.display_name,
      role: data.role
    };

    onLogin(currentUser);
  } finally {
    _settingUp = false;
  }
}

export function initAuth(onLogin, onLogout) {
  // 1. Restore existing session (handles token refresh properly)
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      _setupUser(session, onLogin, onLogout);
    } else {
      onLogout();
    }
  });

  // 2. Listen for future auth changes (login, logout, token refresh)
  supabase.auth.onAuthStateChange(async (event, session) => {
    // Skip INITIAL_SESSION — already handled by getSession() above
    if (event === 'INITIAL_SESSION') return;

    if (session?.user) {
      await _setupUser(session, onLogin, onLogout);
    } else {
      currentUser = null;
      onLogout();
    }
  });
}

export async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function logout() {
  currentUser = null;
  await supabase.auth.signOut();
}

export function requireRole(minRole) {
  if (!currentUser) return false;
  const hierarchy = { viewer: 0, editor: 1, admin: 2 };
  return (hierarchy[currentUser.role] || 0) >= (hierarchy[minRole] || 0);
}
