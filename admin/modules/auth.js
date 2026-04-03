/**
 * auth.js — Authentification Supabase (email/password) + gestion des roles
 */

import { supabase } from '../supabase-config.js';

let currentUser = null;
let _lastUid = null;       // avoid re-fetching profile for same user

export function getCurrentUser() { return currentUser; }

export function initAuth(onLogin, onLogout) {
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[auth] event:', event, 'user:', session?.user?.email ?? 'none');

    if (!session?.user) {
      currentUser = null;
      _lastUid = null;
      onLogout();
      return;
    }

    // Already set up for this user — skip duplicate events
    if (_lastUid === session.user.id && currentUser) {
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, role')
      .eq('id', session.user.id)
      .single();

    if (error) {
      console.error('[auth] profiles query failed:', error.message, '| status:', error.code);
      // Don't signOut — could be a transient error (expired token being refreshed)
      // Only block if this is a fresh login attempt (SIGNED_IN)
      if (event === 'SIGNED_IN') {
        await supabase.auth.signOut();
        onLogout('Compte non autorise. Contactez un administrateur.');
      }
      return;
    }

    _lastUid = session.user.id;
    currentUser = {
      uid: session.user.id,
      email: session.user.email,
      displayName: data.display_name,
      role: data.role
    };

    onLogin(currentUser);
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
