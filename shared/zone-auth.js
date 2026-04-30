/**
 * zone-auth.js — Auth gate for restricted zones (Sahel, RDC)
 *
 * Reuses Supabase auth + profiles table from admin.
 * Import as ES module, call initZoneAuth() to gate the page.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const SUPABASE_URL = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xxnL12zd9o5N30y1-Oi-0Q_YGYKMjh2';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storageKey: 'carto-zone-auth',
    flowType: 'implicit',
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true
  }
});

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

/**
 * Initialize zone auth gate.
 * @param {Function} onGranted - called when user is authenticated & authorized
 * @param {Function} onDenied  - called with error message string
 */
export function initZoneAuth(onGranted, onDenied) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (!session?.user) {
      onDenied(null); // no session, just show login
      return;
    }

    fetchProfile(session.user.id, session.access_token).then(profile => {
      if (!profile) {
        supabase.auth.signOut();
        onDenied('Acces refuse · profil non autorise · contacter admin');
        return;
      }
      onGranted({ email: session.user.email, role: profile.role });
    }).catch(err => {
      var code = (err && (err.status || err.code)) || 'network';
      onDenied('Verification · code ' + code + ' · reessayer');
    });
  });
}

export async function zoneLogin(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function zoneLogout() {
  await supabase.auth.signOut();
}
