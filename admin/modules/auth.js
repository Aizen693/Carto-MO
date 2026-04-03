/**
 * auth.js — Authentification Supabase (email/password) + gestion des roles
 */

import { supabase } from '../supabase-config.js';

let currentUser = null;

export function getCurrentUser() { return currentUser; }

export function initAuth(onLogin, onLogout) {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
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
