/**
 * auth.js — Authentification Supabase (email/password) + gestion des roles
 *
 * IMPORTANT : ne PAS appeler supabase.from() a l'interieur de
 * onAuthStateChange — ca deadlock car le SDK attend getSession()
 * qui est bloque par le callback auth en cours.
 * On utilise fetch() direct avec le token de la session.
 */

import { supabase } from '../supabase-config.js';

const SUPABASE_URL = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xxnL12zd9o5N30y1-Oi-0Q_YGYKMjh2';

let currentUser = null;

export function getCurrentUser() { return currentUser; }

async function fetchProfile(userId, accessToken) {
  const url = `${SUPABASE_URL}/rest/v1/profiles?select=display_name,role&id=eq.${userId}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.pgrst.object+json'
    }
  });
  if (!res.ok) return null;
  return res.json();
}

export function initAuth(onLogin, onLogout) {
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('[auth] event:', event, 'user:', session?.user?.email ?? 'none');

    if (!session?.user) {
      currentUser = null;
      onLogout();
      return;
    }

    // Already logged in as this user — skip duplicates
    if (currentUser?.uid === session.user.id) return;

    // Fetch profile OUTSIDE the callback stack via setTimeout
    // to avoid deadlocking on getSession()
    const uid = session.user.id;
    const email = session.user.email;
    const token = session.access_token;

    fetchProfile(uid, token).then(profile => {
      console.log('[auth] profile:', profile);

      if (!profile) {
        if (event === 'SIGNED_IN') {
          supabase.auth.signOut();
          onLogout('Compte non autorise. Contactez un administrateur.');
        }
        return;
      }

      currentUser = {
        uid,
        email,
        displayName: profile.display_name,
        role: profile.role
      };

      onLogin(currentUser);
    }).catch(e => {
      console.error('[auth] profile fetch error:', e);
    });
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
