/**
 * firebase-loader.js — Chargeur Firestore read-only pour les cartes publiques
 *
 * Charge les points admin depuis Firestore et les rend disponibles
 * au moteur engine.js via window.loadFirestorePoints(zone).
 *
 * Inclus dans chaque page de zone avec :
 *   <script type="module" src="../shared/firebase-loader.js"></script>
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, query, where, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Meme config que admin/firebase-config.js
const firebaseConfig = {
  apiKey:            'VOTRE_API_KEY',
  authDomain:        'VOTRE_PROJECT.firebaseapp.com',
  projectId:         'VOTRE_PROJECT_ID',
  storageBucket:     'VOTRE_PROJECT.appspot.com',
  messagingSenderId: '000000000000',
  appId:             '1:000000000000:web:xxxxxxxxxxxxxx'
};

let app, db;
try {
  app = initializeApp(firebaseConfig, 'public-reader');
  db = getFirestore(app);
} catch (e) {
  // Firebase deja initialise ou config manquante
  console.warn('Firebase loader: init skipped', e.message);
}

// Cache local pour eviter des requetes repetees
const cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadFirestorePoints(zone) {
  if (!db) return { type: 'FeatureCollection', features: [] };

  // Verifier le cache
  const cached = cache[zone];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const q = query(
      collection(db, 'points'),
      where('zone', '==', zone),
      where('deleted', '==', false)
    );
    const snap = await getDocs(q);

    const features = snap.docs.map(doc => {
      const d = doc.data();
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: d.coordinates },
        properties: {
          name: d.name || '',
          description: d.description || '',
          _period: d.period || '',
          _color: d._color || '#888888',
          _casualties: d._casualties || 0,
          _desc: d.description || '',
          _source: 'firestore'
        }
      };
    });

    const result = { type: 'FeatureCollection', features };
    cache[zone] = { data: result, ts: Date.now() };
    return result;
  } catch (e) {
    console.warn('Firebase loader: erreur chargement points', e.message);
    return { type: 'FeatureCollection', features: [] };
  }
}

// Exposer en global pour engine.js (qui n'est pas un module ES)
window.loadFirestorePoints = loadFirestorePoints;
