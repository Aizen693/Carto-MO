/**
 * firebase-config.js — Configuration Firebase partagee (admin + public)
 *
 * IMPORTANT : Remplacer les valeurs ci-dessous par celles de votre projet Firebase.
 * Console Firebase > Project settings > General > Your apps > Config
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth }       from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            'VOTRE_API_KEY',
  authDomain:        'VOTRE_PROJECT.firebaseapp.com',
  projectId:         'VOTRE_PROJECT_ID',
  storageBucket:     'VOTRE_PROJECT.appspot.com',
  messagingSenderId: '000000000000',
  appId:             '1:000000000000:web:xxxxxxxxxxxxxx'
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

export { app, auth, db, firebaseConfig };
