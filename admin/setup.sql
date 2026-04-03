-- ═══════════════════════════════════════════════════════════════════
-- Carto-MO — Script SQL Supabase
--
-- Coller ce script dans : Supabase Dashboard > SQL Editor > New query
-- Puis cliquer "Run"
-- ═══════════════════════════════════════════════════════════════════

-- ── Table profiles (utilisateurs) ───────────────────────────────

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  display_name text default '',
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  last_login timestamptz,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- Tout le monde authentifie peut lire les profils
create policy "profiles_read" on profiles for select to authenticated using (true);
-- Seuls les admins peuvent modifier les profils
create policy "profiles_admin_write" on profiles for all to authenticated
  using ((select role from profiles where id = auth.uid()) = 'admin');
-- Un user peut mettre a jour son propre last_login
create policy "profiles_self_update" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Trigger : creer automatiquement un profil quand un user s'inscrit
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'viewer')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ── Table points ────────────────────────────────────────────────

create table if not exists points (
  id uuid default gen_random_uuid() primary key,
  zone text not null check (zone in ('moyen-orient', 'sahel', 'rdc')),
  coordinates jsonb not null,  -- [lng, lat]
  name text not null default '',
  description text default '',
  period text default '',
  color text default '#888888',
  casualties integer default 0,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table points enable row level security;

-- Lecture publique (cartes publiques)
create policy "points_public_read" on points for select using (true);
-- Editors et admins peuvent creer
create policy "points_editor_insert" on points for insert to authenticated
  with check ((select role from profiles where id = auth.uid()) in ('admin', 'editor'));
-- Editors et admins peuvent modifier
create policy "points_editor_update" on points for update to authenticated
  using ((select role from profiles where id = auth.uid()) in ('admin', 'editor'));
-- Seuls les admins peuvent supprimer (hard delete)
create policy "points_admin_delete" on points for delete to authenticated
  using ((select role from profiles where id = auth.uid()) = 'admin');

-- Index pour accelerer les requetes par zone
create index if not exists idx_points_zone on points(zone);
create index if not exists idx_points_zone_deleted on points(zone, deleted);


-- ── Table zone_configs (overrides acteurs/couleurs) ─────────────

create table if not exists zone_configs (
  id uuid default gen_random_uuid() primary key,
  zone text unique not null check (zone in ('moyen-orient', 'sahel', 'rdc')),
  actor_colors jsonb default '{}',
  actor_groups jsonb default '{}',
  updated_at timestamptz default now()
);

alter table zone_configs enable row level security;

-- Lecture publique
create policy "zone_configs_public_read" on zone_configs for select using (true);
-- Seuls les admins peuvent modifier
create policy "zone_configs_admin_write" on zone_configs for all to authenticated
  using ((select role from profiles where id = auth.uid()) = 'admin');


-- ── Table activity_log ──────────────────────────────────────────

create table if not exists activity_log (
  id uuid default gen_random_uuid() primary key,
  zone text default '',
  action text not null,
  point_id uuid,
  user_id uuid references auth.users,
  user_email text default '',
  details text default '',
  created_at timestamptz default now()
);

alter table activity_log enable row level security;

-- Authentifies peuvent lire et ecrire
create policy "log_auth_read" on activity_log for select to authenticated using (true);
create policy "log_auth_insert" on activity_log for insert to authenticated with check (true);
-- Personne ne peut modifier ou supprimer (immutable)


-- ═══════════════════════════════════════════════════════════════════
-- FIN — Toutes les tables sont creees.
--
-- Etape suivante : creer votre premier admin dans Authentication,
-- puis ajouter manuellement son profil dans la table profiles
-- avec role = 'admin'
-- ═══════════════════════════════════════════════════════════════════
