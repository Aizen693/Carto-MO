// Stub local de site-auth.js pour inventorier les textes des vues abonné (aucun identifiant, aucun réseau Supabase)
const user = { id: 'apercu', email: 'apercu@algoracces.fr' };
const err = () => Promise.reject(new Error('aperçu local'));
const q = new Proxy({}, { get: (_, k) => k === 'then' ? (res) => Promise.resolve({ data: [], error: null }).then(res)
  : k === 'single' || k === 'maybeSingle' ? async () => ({ data: { role: 'admin', plan: 'premium' }, error: null }) : () => q });
const supabase = {
  auth: { getSession: async () => ({ data: { session: { user } } }), getUser: async () => ({ data: { user } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => {} },
  from: () => q, rpc: async () => ({ data: null, error: null }),
  storage: { from: () => ({ download: async () => ({ error: new Error('aperçu') }), createSignedUrl: async () => ({ error: new Error('aperçu') }), list: async () => ({ data: [] }) }) },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}, functions: { invoke: async () => ({ error: new Error('aperçu') }) },
};
window.algorAuth = { supabase, logout() {}, ready: Promise.resolve(), openLogin() {}, loadZoneRaw: err,
  loadZoneFile: async (p) => (String(p).includes('veille-cyber') ? (await fetch('/__snapshot.json')).json() : err()) };
window.algorAuthState = { loggedIn: true, email: user.email };
window.__algorAuthGranted = true;
const go = () => { window.dispatchEvent(new CustomEvent('algorAuthReady')); window.dispatchEvent(new CustomEvent('algorAuthStateChanged', { detail: { loggedIn: true, email: user.email } })); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else setTimeout(go, 0);
setTimeout(go, 900);
