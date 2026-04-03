/**
 * firestore.js — CRUD Firestore (points, zones, activity log, users)
 */

import { db } from '../firebase-config.js';
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, setDoc,
  query, where, orderBy, limit as fbLimit, serverTimestamp, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getCurrentUser } from './auth.js';

// ── Points ──────────────────────────────────────────────

export async function getPoints(zone) {
  const q = query(
    collection(db, 'points'),
    where('zone', '==', zone),
    where('deleted', '==', false),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createPoint(zone, data) {
  const user = getCurrentUser();
  const docData = {
    zone,
    coordinates: data.coordinates,
    name: data.name,
    description: data.description,
    period: data.period,
    _color: data._color || '#888888',
    _casualties: data._casualties || 0,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedBy: user.uid,
    updatedAt: serverTimestamp(),
    deleted: false
  };
  const ref = await addDoc(collection(db, 'points'), docData);
  await logActivity(zone, 'create', ref.id, `Point "${data.name}" cree`);
  return ref.id;
}

export async function updatePoint(pointId, data) {
  const user = getCurrentUser();
  const update = { ...data, updatedBy: user.uid, updatedAt: serverTimestamp() };
  await updateDoc(doc(db, 'points', pointId), update);
  await logActivity(data.zone || '', 'update', pointId, `Point "${data.name || ''}" modifie`);
}

export async function softDeletePoint(pointId, zone, name) {
  const user = getCurrentUser();
  await updateDoc(doc(db, 'points', pointId), {
    deleted: true,
    updatedBy: user.uid,
    updatedAt: serverTimestamp()
  });
  await logActivity(zone, 'delete', pointId, `Point "${name}" supprime`);
}

// ── Zone config (actor overrides) ───────────────────────

export async function getZoneConfig(zone) {
  const snap = await getDoc(doc(db, 'zones', zone));
  return snap.exists() ? snap.data() : null;
}

export async function updateZoneConfig(zone, data) {
  await setDoc(doc(db, 'zones', zone), data, { merge: true });
}

// ── Activity log ────────────────────────────────────────

export async function logActivity(zone, action, pointId, details) {
  const user = getCurrentUser();
  if (!user) return;
  await addDoc(collection(db, 'activityLog'), {
    zone,
    action,
    pointId: pointId || null,
    userId: user.uid,
    userEmail: user.email,
    details,
    timestamp: serverTimestamp()
  });
}

export async function getActivityLog(zone, max = 50) {
  const constraints = [orderBy('timestamp', 'desc'), fbLimit(max)];
  if (zone !== 'all') constraints.unshift(where('zone', '==', zone));
  const q = query(collection(db, 'activityLog'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Users ───────────────────────────────────────────────

export async function getUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createUser(uid, data) {
  await setDoc(doc(db, 'users', uid), {
    email: data.email,
    displayName: data.displayName || '',
    role: data.role || 'viewer',
    createdAt: serverTimestamp(),
    lastLogin: null
  });
}

export async function updateUserRole(uid, role) {
  await updateDoc(doc(db, 'users', uid), { role });
}

export async function deleteUser(uid) {
  await deleteDoc(doc(db, 'users', uid));
}
