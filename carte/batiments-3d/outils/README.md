# Maquette bâtiments 3D · Gao · hauteurs par source

Page : `/carte/batiments-3d/` (locale, non gatée, non déployée).

## Fichiers de données (GeoJSON WGS84, un polygone par bâtiment)
- `globfp-gao.geojson` : 3D-GloBFP (CC BY 4.0), prop `h` en m. Extraction de juillet (atelier-3d).
- `gba-gao.geojson` : GlobalBuildingAtlas TUM (CC BY-NC 4.0), prop `height` + `var`. Tuile `w005_n20_e000_n15` (LoD1 JSON + Polygon + ODbLPolygon), jointure clé `source+id+region`.
- `google-gao.geojson` : hauteur Google Open Buildings 2.5D Temporal 2023 (CC BY 4.0) moyennée sur chaque emprise GBA/OSM, prop `height` + `presence`.

## Recette
1. `gba-jointure-gao.py` : lit les tuiles GBA (EPSG:3857), filtre la bbox Gao, joint la hauteur, reprojette en WGS84.
2. `google-2p5d-echantillon-gao.py` : lit les GeoTIFF Google (UTM 30N, 0,5 m, bandes fractional_count / height / presence) décimés à 2 m, rasterise les emprises, moyenne la hauteur par bâtiment. Dépend de `rasterio` (installé avec `pip install --user rasterio`).
   Tuiles Google : bucket public `open-buildings-temporal-data/v1`, manifeste `0f_EPSG_32630_2023_06_30.json`, tuiles `0e204_2023_06_30/tile_X4d5-zw2GmQ.tif` et `tile_K8ubsaPUFbw.tif`.

## Résultat sur Gao (42 525 emprises)
| Source | Médiane | Max | ≥ 2 m | Licence |
|---|---|---|---|---|
| 3D-GloBFP | 3,8 m | 18,4 m | 100 % | CC BY |
| GlobalBuildingAtlas | 0,2 m | 7,1 m | 2 % | CC BY-NC |
| Google 2.5D | 2,5 m | 11,1 m | 63 % | CC BY |

GBA écrase le bâti bas sahélien : inutilisable tel quel sur ce théâtre.

## Rendu réaliste (Sat3DGen) · `realiste/`
- Entrée : `realiste/gao_z20_640.png`, mosaïque 3x3 de tuiles satellite zoom 20 (endpoint Google `mt1.google.com/vt/lyrs=s`, non officiel, test local seulement), recadrée 640x640 (0,14 m/px, 92 m de côté), centre -0.0445 / 16.2685.
- Génération : Space Hugging Face `qian43/Sat3DGen` (ZeroGPU A10G), endpoint `generate_mesh_gpu`, résolution voxel 256, réponse en 5 s, sortie `.glb` (200 k sommets, couleur par sommet, sans texture).
- Appel HTTP brut (gradio_client 1.3 incompatible avec Gradio 5 sous Python 3.9) : `POST /gradio_api/upload` puis `POST /gradio_api/call/generate_mesh_gpu` et lecture SSE de `/gradio_api/call/generate_mesh_gpu/{event_id}`.
- Visionneuse : `realiste/index.html`, three.js 0.160 (jsDelivr), ombres, vues Orbite / Aérienne / Niveau rue.
- Pour un quartier entier : découper la ville en tuiles 640 px, appeler l'endpoint par tuile, assembler les .glb avec l'offset géographique de chaque tuile.

## Contrôle Niamey (imagerie nette, netteté 490 contre 165 à Gao)
`realiste/niamey_sat3dgen.glb` : même pipeline, endpoint CPU (le GPU ZeroGPU refuse après quelques appels anonymes). Résultat plus propre mais toujours un maillage lissé sans façades lisibles. Verdict : la classe de modèle (mono-image) plafonne, pas seulement l'imagerie.

## Couverture Vantor (ex-Maxar) Precision3D 50 cm (couche Esri, requête du 09/09)
Niamey, Ouagadougou, Goma, Kinshasa, Dakar : oui. Gao, Bamako : non référencés dans cette couche.
Service : `services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/VantorP3D_Coverage_Map/FeatureServer/0`

## Ville 3D texturée · `ville/` (maquette retenue)
Page three.js autonome : 342 tuiles satellite Mapbox z18 (0,57 m/px) assemblées en une texture unique de 7,3 km², posée au sol ET projetée sur les toits ; 12 266 bâtiments extrudés (emprises OSM/Microsoft, hauteurs Google 2.5D, min 2 m, max 22 m) ; façades teintées depuis le toit ; soleil matin/midi/soir avec ombres portées suivant la caméra ; 3 incidents HUMINT de `sahel/humint.geojson` en repères cliquables. Emprise : lon -0,0495 à -0,0265, lat 16,2605 à 16,2835.
Branchement au site : le token Mapbox restreint par URL fonctionne car la page est servie sur une origine autorisée ; les données viennent de `google-gao.geojson` (à déposer dans le bucket `zones`) et des points HUMINT existants. Pour une autre ville : changer BBOX, régénérer le GeoJSON de hauteurs, rien d'autre.

## Vantor Precision3D · `vantor/`
Page ArcGIS Maps SDK JS 4.30 (sans clé : fond `satellite` et relief `world-elevation` hérités) chargeant des maillages intégrés I3S publics sur ArcGIS Online :
- San Diego · `San_Diego_Vantor_Satellite_Reality_Mesh` (compte bconnolly_IVT5, marque Vantor 2025)
- Boulder · `221018_Precision3D_Boulder` (compte Richard.Holdbrook_Maxar)
- Santiago · `santiago_vricon_i3s` (compte dylan.molnar_digitalglobe)
Trouvés via `arcgis.com/sharing/rest/search?q=(Precision3D OR Vricon OR Vantor) type:"Scene Service"`. Rio et Kota Kinabalu répondent sans couche (retirés). Vues Oblique / Niveau rue / Orbite. Le produit licencié se diffuse pareil (I3S ou 3D Tiles), donc la page est prête pour un échantillon Niamey ou Goma.
