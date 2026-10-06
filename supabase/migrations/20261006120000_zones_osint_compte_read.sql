-- Cartes OSINT ouvertes aux comptes gratuits (décision du 06/10/2026).
-- Additif : la politique zones_premium_read (tout le bucket pour le premium) reste inchangée.
-- Un compte connecté, quel que soit son plan, peut lire ces TROIS fichiers exacts et rien d'autre :
-- Sahel et RDC (remontées terrain) et tous les autres fichiers du bucket restent premium.
create policy zones_osint_compte_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'zones'
    and name in (
      'moyen-orient/reference-2026.geojson',
      'asie-sud/reference-2026.geojson',
      'madagascar/reference-2026.geojson'
    )
  );
