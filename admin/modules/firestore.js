/**
 * firestore.js — CRUD Supabase (points, zones, activity log, users)
 * Note: le nom du fichier est conserve pour compatibilite des imports
 */

import { supabase } from '../supabase-config.js';
import { getCurrentUser } from './auth.js';

// ── Points ──────────────────────────────────────────────

export async function getPoints(zone) {
  const { data, error } = await supabase
    .from('points')
    .select('*')
    .eq('zone', zone)
    .eq('deleted', false)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(formatPoint);
}

export async function createPoint(zone, data) {
  const user = getCurrentUser();
  const row = {
    zone,
    coordinates: data.coordinates,
    name: data.name,
    description: data.description,
    period: data.period,
    color: data._color || '#888888',
    casualties: data._casualties || 0,
    created_by: user.uid,
    updated_by: user.uid,
    deleted: false
  };

  const { data: inserted, error } = await supabase
    .from('points')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  await logActivity(zone, 'create', inserted.id, `Point "${data.name}" cree`);
  return inserted.id;
}

export async function bulkCreatePoints(zone, pointsArray) {
  const user = getCurrentUser();
  const rows = pointsArray.map(data => ({
    zone,
    coordinates: data.coordinates,
    name: data.name,
    description: data.description,
    period: data.period,
    color: data._color || '#888888',
    casualties: data._casualties || 0,
    created_by: user.uid,
    updated_by: user.uid,
    deleted: false
  }));

  const { data: inserted, error } = await supabase
    .from('points')
    .insert(rows)
    .select('id');

  if (error) throw error;
  return (inserted || []).length;
}

export async function updatePoint(pointId, data) {
  const user = getCurrentUser();
  const update = {
    updated_by: user.uid,
    updated_at: new Date().toISOString()
  };
  if (data.coordinates) update.coordinates = data.coordinates;
  if (data.name) update.name = data.name;
  if (data.description !== undefined) update.description = data.description;
  if (data.period) update.period = data.period;
  if (data._color) update.color = data._color;
  if (data._casualties !== undefined) update.casualties = data._casualties;
  if (data.zone) update.zone = data.zone;

  const { error } = await supabase
    .from('points')
    .update(update)
    .eq('id', pointId);

  if (error) throw error;
  await logActivity(data.zone || '', 'update', pointId, `Point "${data.name || ''}" modifie`);
}

export async function softDeletePoint(pointId, zone, name) {
  const user = getCurrentUser();
  const { error } = await supabase
    .from('points')
    .update({ deleted: true, updated_by: user.uid, updated_at: new Date().toISOString() })
    .eq('id', pointId);

  if (error) throw error;
  await logActivity(zone, 'delete', pointId, `Point "${name}" supprime`);
}

export async function bulkSoftDeletePoints(pointIds, zone) {
  if (!pointIds || !pointIds.length) return 0;
  const user = getCurrentUser();
  for (let i = 0; i < pointIds.length; i += 100) {
    const batch = pointIds.slice(i, i + 100);
    const { error } = await supabase
      .from('points')
      .update({ deleted: true, updated_by: user.uid, updated_at: new Date().toISOString() })
      .in('id', batch);
    if (error) throw error;
  }
  await logActivity(zone, 'delete', null, `Suppression en masse : ${pointIds.length} points`);
  return pointIds.length;
}

export async function restorePoints(pointIds, zone) {
  if (!pointIds || !pointIds.length) return 0;
  const user = getCurrentUser();
  const { error } = await supabase
    .from('points')
    .update({ deleted: false, updated_by: user.uid, updated_at: new Date().toISOString() })
    .in('id', pointIds);
  if (error) throw error;
  await logActivity(zone, 'restore', null, `Restauration : ${pointIds.length} point(s)`);
  return pointIds.length;
}

export async function purgeEmptyPoints(zone) {
  const user = getCurrentUser();
  // Find all points with no name or empty name (orphan puits)
  const { data: orphans, error: fetchErr } = await supabase
    .from('points')
    .select('id')
    .eq('zone', zone)
    .eq('deleted', false)
    .or('name.is.null,name.eq.,period.is.null,period.eq.');

  if (fetchErr) throw fetchErr;
  if (!orphans || !orphans.length) return 0;

  const ids = orphans.map(p => p.id);
  // Soft-delete in batches of 100
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { error } = await supabase
      .from('points')
      .update({ deleted: true, updated_by: user.uid, updated_at: new Date().toISOString() })
      .in('id', batch);
    if (error) throw error;
  }

  await logActivity(zone, 'delete', null, `Purge : ${ids.length} points sans nom/periode supprimes`);
  return ids.length;
}

// ── Zone config (actor overrides) ───────────────────────

export async function getZoneConfig(zone) {
  const { data, error } = await supabase
    .from('zone_configs')
    .select('*')
    .eq('zone', zone)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data || null;
}

export async function updateZoneConfig(zone, configData) {
  const { data: existing } = await supabase
    .from('zone_configs')
    .select('id')
    .eq('zone', zone)
    .single();

  if (existing) {
    await supabase.from('zone_configs').update(configData).eq('zone', zone);
  } else {
    await supabase.from('zone_configs').insert({ zone, ...configData });
  }
}

// ── Activity log ────────────────────────────────────────

export async function logActivity(zone, action, pointId, details) {
  const user = getCurrentUser();
  if (!user) return;
  await supabase.from('activity_log').insert({
    zone,
    action,
    point_id: pointId || null,
    user_id: user.uid,
    user_email: user.email,
    details
  });
}

export async function getActivityLog(zone, max = 50) {
  let q = supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(max);

  if (zone !== 'all') q = q.eq('zone', zone);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(d => ({
    id: d.id,
    zone: d.zone,
    action: d.action,
    pointId: d.point_id,
    userId: d.user_id,
    userEmail: d.user_email,
    details: d.details,
    timestamp: { toDate: () => new Date(d.created_at) }
  }));
}

// ── Users ───────────────────────────────────────────────

export async function getUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(d => ({
    id: d.id,
    email: d.email,
    displayName: d.display_name,
    role: d.role,
    lastLogin: d.last_login ? { toDate: () => new Date(d.last_login) } : null,
    createdAt: d.created_at
  }));
}

export async function createUser(uid, data) {
  await supabase.from('profiles').insert({
    id: uid,
    email: data.email,
    display_name: data.displayName || '',
    role: data.role || 'viewer'
  });
}

export async function updateUserRole(uid, role) {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', uid);
  if (error) throw error;
}

export async function deleteUser(uid) {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', uid);
  if (error) throw error;
}

// ── Helpers ─────────────────────────────────────────────

function formatPoint(d) {
  return {
    id: d.id,
    zone: d.zone,
    coordinates: d.coordinates,
    name: d.name,
    description: d.description,
    period: d.period,
    _color: d.color,
    _casualties: d.casualties,
    createdBy: d.created_by,
    createdAt: d.created_at,
    updatedBy: d.updated_by,
    updatedAt: d.updated_at,
    deleted: d.deleted
  };
}
