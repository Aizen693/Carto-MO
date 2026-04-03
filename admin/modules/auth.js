/**
 * auth.js — Authentification Supabase (email/password) + gestion des roles
 */

import { supabase } from '../supabase-config.js';

let currentUser = null;
let _busy = false;         // prevent concurrent profile fetches

export function getCurrentUser() { return currentUser; }

export function initAuth(onLogin, onLogout) {
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[auth] event:', event, 'user:', session?.user?.email ?? 'none');

    if (!session?.user) {
      currentUser = null;
      _busy = false;
      onLogout();
      return;
    }

    // Already logged in as this user — skip
    if (currentUser?.uid === session.user.id) return;
    // Another callback is already fetching the profile — skip
    if (_busy) return;
    _busy = true;

    try {
      console.log('[auth] fetching profile for', session.user.id);
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, role')
        .eq('id', session.user.id)
        .single();

      console.log('[auth] profile result:', { data, error: error?.message });

      if (error || !data) {
        if (event === 'SIGNED_IN') {
          await supabase.auth.signOut();
          onLogout('Compte non autorise. Contactez un administrateur.');
        }
        return;
      }

      currentUser = {
        uid: session.user.id,
        email: session.user.email,
        displayName: data.display_name,
        role: data.role
      };

      console.log('[auth] calling onLogin');
      onLogin(currentUser);
    } catch (e) {
      console.error('[auth] unexpected error:', e);
    } finally {
      _busy = false;
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
