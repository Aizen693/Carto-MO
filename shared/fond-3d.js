/**
 * fond-3d.js — Rendu satellite 3D pour la carte (/carte/), moteur de God's Eye View.
 *
 * Module IIFE autonome et ADDITIF, sur le modèle de basemap-toggle.js : n'édite ni
 * humint-engine.js ni basemap-toggle.js. En mode 3D, une vue CesiumJS (réglages de
 * rendu repris de God's Eye View, MIT) prend la place de la carte Mapbox, dans le même
 * conteneur, SOUS toute l'interface de /carte/ (filtres, analyse, nouveautés, frise).
 *
 *  - Points : lus dans la source Mapbox « humint-src » que humint-engine.js remplit
 *    (donc déjà filtrés), redessinés avec les mêmes trois couches (halo, anneau, point,
 *    humint-engine.js l.338-340) et posés au niveau du sol. Clic = même fiche.
 *  - Caméra : synchronisée dans les deux sens. Un changement de pays ou les boutons
 *    +/− déplacent la vue 3D ; revenir en Standard garde l'endroit regardé.
 *  - Filtre (28/09) : jeton « Rendu » dans la barre, Standard par défaut. En 3D, le fond
 *    Mapbox est mis au repos (plus aucune tuile téléchargée) ; hors 3D, Cesium est en pause.
 *    Maillage 3D Google, imagerie Esri sur relief en secours s'il est indisponible.
 *  - Fluidité : rendu à la demande, FXAA, précision réduite pendant les déplacements,
 *    noms de lieux limités à la zone regardée.
 *
 * Jeton d'accès : window.ALGOR_3D = { googleKey } (Map Tiles API, usage commercial) ou
 * { ionToken } (Cesium ion, usage personnel), lu dans /shared/v5/config-3d.js (en local,
 * /carte/globe-3d/_local/config.js d'abord). Sans jeton, la carte Mapbox reste telle quelle.
 */
(function () {
  'use strict';

  var CESIUM = 'https://cdn.jsdelivr.net/npm/cesium@1.138.0/Build/Cesium/';
  var DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var SRC = 'humint-src';
  var ICON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>';
  var MODES = ['standard', 'maillage'];
  var LIB = { standard: 'Standard', maillage: '3D photoréaliste' };
  var DEG = Math.PI / 180;
  // Safari tolère beaucoup moins de mémoire par onglet que Chrome (il recharge la page) :
  // réserve de tuiles et téléchargements simultanés réduits, sans toucher à la netteté.
  var SAFARI = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
  var SSE_REPOS = 16, SSE_MOUVEMENT = 32; // même netteté partout (Safari compris)
  var FOVY_MAPBOX = 0.6435011087932844; // champ vertical de Mapbox GL (≈ 36,87°)

  var map = null, chip = null, mode = 'standard', demarre = false;
  var C = null, viewer = null, vue = null, tileset = null, imagerie = null, pret = null;
  var points = null, items = [], cacheH = {}, popup = null, popupItem = null, gestionnaire = null;
  var depuisCesium = false, depuisMapbox = false;

  function cfg() { return window.ALGOR_3D || {}; }
  function chargerScript(src) {
    return new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = ok; s.onerror = function () { ko(new Error('chargement impossible : ' + src)); };
      document.head.appendChild(s);
    });
  }
  function chargerCss(href) {
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
  }
  // En ligne : /shared/v5/config-3d.js. En local : la config de développement (ignorée par git) d'abord.
  function chargerConfigLocale() {
    if (window.ALGOR_3D) return Promise.resolve();
    var enLigne = function () { return chargerScript('/shared/v5/config-3d.js?v=20260928a').catch(function () { /* pas de clé */ }); };
    if (!DEV) return enLigne();
    return chargerScript('/carte/globe-3d/_local/config.js').catch(function () { /* */ }).then(function () { if (!window.ALGOR_3D) return enLigne(); });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ─────────── Vue Cesium (réglages de God's Eye View, src/app/viewer.js) ─────────── */
  var NETTETE = 'uniform sampler2D colorTexture; uniform vec2 colorTextureDimensions; uniform float amount; in vec2 v_textureCoordinates;\n' +
    'void main(){ vec2 uv=v_textureCoordinates; vec2 t=1.0/colorTextureDimensions; vec4 c=texture(colorTexture,uv);\n' +
    ' vec4 b=(texture(colorTexture,uv+vec2(-t.x,-t.y))+texture(colorTexture,uv+vec2(0.0,-t.y))+texture(colorTexture,uv+vec2(t.x,-t.y))\n' +
    '  +texture(colorTexture,uv+vec2(-t.x,0.0))+c+texture(colorTexture,uv+vec2(t.x,0.0))\n' +
    '  +texture(colorTexture,uv+vec2(-t.x,t.y))+texture(colorTexture,uv+vec2(0.0,t.y))+texture(colorTexture,uv+vec2(t.x,t.y)))/9.0;\n' +
    ' out_FragColor=vec4(clamp((c+(c-b)*amount).rgb,0.0,1.0),c.a); }';

  function creerVue() {
    var cont = map.getContainer();
    vue = document.createElement('div');
    vue.id = 'fond-3d-vue';
    vue.style.cssText = 'position:absolute;inset:0;z-index:1;display:none;background:#0F1013';
    var ctrl = cont.querySelector('.mapboxgl-control-container');
    cont.insertBefore(vue, ctrl || null);
    var credits = document.createElement('div');
    credits.id = 'fond-3d-credits';
    credits.style.cssText = 'position:absolute;left:372px;bottom:8px;z-index:2;font:400 11px/1.4 "IBM Plex Mono",monospace;color:#e6e6e8;text-shadow:0 1px 2px rgba(0,0,0,.8)';
    vue.appendChild(credits);
    var css = document.getElementById('fond-3d-css') || document.createElement('style');
    css.id = 'fond-3d-css';
    css.textContent = '#fond-3d-credits *{display:inline!important;white-space:nowrap}#fond-3d-credits img{height:13px;vertical-align:middle}#fond-3d-credits a{color:#e6e6e8}';
    document.head.appendChild(css);

    if (cfg().ionToken) C.Ion.defaultAccessToken = cfg().ionToken;
    viewer = new C.Viewer(vue, {
      timeline: false, animation: false, baseLayerPicker: false, geocoder: false, homeButton: false,
      sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, vrButton: false,
      selectionIndicator: false, infoBox: false, baseLayer: false, creditContainer: credits,
      // Fluidité : rendu seulement quand quelque chose change (caméra, tuiles, points),
      // lissage FXAA au lieu du MSAA 4x (bien plus coûteux).
      requestRenderMode: true, maximumRenderTimeChange: Infinity, msaaSamples: 1,
    });
    viewer.scene.postProcessStages.fxaa.enabled = !SAFARI;
    // Moins de téléchargements simultanés : moins de tuiles décodées en même temps pendant un
    // zoom. Descente arrêtée à 250 m du maillage : plus bas, l'image ne gagne plus rien (la
    // caméra finit dans le maillage, écran noir) ; à 250 m, maisons, voitures, avions sont encore nets.
    C.RequestScheduler.maximumRequestsPerServer = 6;
    C.RequestScheduler.maximumRequests = SAFARI ? 12 : 24;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 250;
    var sc = viewer.scene;
    // God's Eye View (atmosphereCompat.js) : l'atmosphère par sommet des modèles ne se lie pas sous Metal.
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) sc.fog.renderable = false;
    sc.skyAtmosphere.show = true;
    sc.skyAtmosphere.atmosphereLightIntensity = 18;
    sc.skyAtmosphere.saturationShift = -0.12;
    sc.skyAtmosphere.brightnessShift = -0.08;
    sc.globe.baseColor = C.Color.fromCssColorString('#0F1013');
    // Lumière constante depuis la caméra : aucune zone plongée dans la nuit.
    var lum = new C.DirectionalLight({ direction: new C.Cartesian3(0, 0, -1), intensity: 2.2 });
    sc.light = lum;
    sc.preRender.addEventListener(function () { C.Cartesian3.clone(viewer.camera.directionWC, lum.direction); placerPopup(); horizon(); });
    var st = sc.postProcessStages.add(new C.PostProcessStage({ fragmentShader: NETTETE, uniforms: { amount: 1.08 } }));
    st.enabled = true;
    points = sc.primitives.add(new C.PointPrimitiveCollection());

    viewer.camera.percentageChanged = 0.05;
    viewer.camera.changed.addEventListener(tailles);
    viewer.camera.moveEnd.addEventListener(function () { if (!depuisMapbox) versMapbox(); depuisMapbox = false; });

    var h = gestionnaire = new C.ScreenSpaceEventHandler(sc.canvas);
    h.setInputAction(function (e) {
      var pk = sc.pick(e.position), id = pk && pk.primitive && pk.primitive.id;
      if (id && id.fond3d != null) ouvrirPopup(items[id.fond3d]); else fermerPopup();
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    h.setInputAction(function (e) {
      var pk = sc.pick(e.endPosition), id = pk && pk.primitive && pk.primitive.id;
      sc.canvas.style.cursor = id && id.fond3d != null ? 'pointer' : '';
    }, C.ScreenSpaceEventType.MOUSE_MOVE);
  }

  // Mémoire : God's Eye View réserve jusqu'à 2,5 Go de tuiles (poste de bureau), ce qui fait
  // recharger la page par Safari. Plafond à 128 Mo (64 Mo sous Safari), tuiles hors vue libérées.
  // Zoom : sans ces réglages, un zoom rapide charge tous les niveaux intermédiaires de centaines
  // de tuiles à la fois ; le pic de décodage dépasse la limite mémoire de Safari (page rechargée).
  var TUILES = {
    cacheBytes: (SAFARI ? 64 : 128) * 1024 * 1024, maximumCacheOverflowBytes: (SAFARI ? 16 : 32) * 1024 * 1024,
    asynchronouslyLoadImagery: true,
    enableCollision: true, // la caméra bute sur le maillage au lieu de passer sous le sol
    // Pas de saut de niveaux de détail : il mélangeait des tuiles de résolutions différentes
    // (échelle qui change d'une tuile à l'autre, ville floue).
    cullRequestsWhileMoving: true, cullRequestsWhileMovingMultiplier: 60, preloadWhenHidden: false, preloadFlightDestinations: false,
  };
  function chargerFonds() {
    var c = cfg(), v = viewer, sc = viewer.scene, attente = [];
    attente.push(C.ArcGisMapServerImageryProvider.fromUrl(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', { enablePickFeatures: false })
      .then(function (p) { if (viewer === v) imagerie = sc.imageryLayers.addImageryProvider(p); }).catch(function () { /* */ }));
    attente.push((c.ionToken ? C.CesiumTerrainProvider.fromIonAssetId(1, { requestVertexNormals: false })
      : C.CesiumTerrainProvider.fromUrl('https://terrain.reearth.land/cesium-mesh/ellipsoid'))
      .then(function (t) { if (viewer === v) sc.terrainProvider = t; }).catch(function () { /* ellipsoïde */ }));
    var g = c.googleKey
      ? C.createGooglePhotorealistic3DTileset({ key: c.googleKey, onlyUsingWithGoogleGeocoder: true }, TUILES)
      : C.IonResource.fromAssetId(2275207, { accessToken: c.ionToken }).then(function (r) {
        return C.Cesium3DTileset.fromUrl(r, TUILES);
      });
    attente.push(g.then(function (t) {
      if (viewer !== v) { t.destroy(); return; }
      tileset = t; sc.primitives.add(t);
      // Précision adaptée au mouvement : tuiles plus grossières pendant un déplacement,
      // pleine précision dès que la vue s'arrête.
      t.maximumScreenSpaceError = SSE_REPOS;
      t.preloadWhenHidden = false;
      viewer.camera.moveStart.addEventListener(function () { t.maximumScreenSpaceError = SSE_MOUVEMENT; });
      viewer.camera.moveEnd.addEventListener(function () { t.maximumScreenSpaceError = SSE_REPOS; sc.requestRender(); });
    }).catch(function (e) { console.warn('[fond-3d] maillage Google indisponible', e); }));
    return Promise.all(attente);
  }


  /* ─────────── Frontières et noms de lieux (dans la vue 3D, sans fond Mapbox) ───────────
   * Frontières : Natural Earth 1:10 M, frontières terrestres seules (/shared/v5/frontieres-3d.json,
   * domaine public, simplifiées à ~400 m), en lignes simples visibles à travers le relief.
   * Noms : villes et bourgs OpenStreetMap des pays des théâtres (/shared/v5/lieux-3d.json,
   * © OpenStreetMap contributors, ODbL). Les villes restent lisibles de loin, les bourgs
   * n'apparaissent qu'en s'approchant (pas d'empilement d'étiquettes). */
  var FRONTIERES_URL = '/shared/v5/frontieres-3d.json?v=20260928b';
  var LIEUX_URL = '/shared/v5/lieux-3d.json?v=20260928a';
  var etiquettes = null, reperes = null;

  // Frontières en lignes simples (vues même à travers le relief grâce à depthFailAppearance),
  // regroupées par cases de 10° et masquées derrière l'horizon. Les lignes plaquées au sol
  // (GroundPolylinePrimitive) coûtaient ~900 Mo sur le maillage 3D et faisaient recharger Safari.
  var paquetsFrontieres = [];
  function chargerFrontieres() {
    var v = viewer;
    return fetch(FRONTIERES_URL).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (d) {
      if (viewer !== v) return;
      var cases = {};
      (d.lignes || []).forEach(function (l) {
        var k = Math.floor(l[0] / 10) + ',' + Math.floor(l[1] / 10);
        (cases[k] = cases[k] || []).push(l);
      });
      var coul = C.Color.WHITE.withAlpha(0.8);
      var app = function () { return new C.PolylineMaterialAppearance({ material: C.Material.fromType('Color', { color: coul }) }); };
      paquetsFrontieres = Object.keys(cases).map(function (k) {
        var pts = [], inst = cases[k].map(function (l) {
          var pos = C.Cartesian3.fromDegreesArray(l); pts.push.apply(pts, pos);
          return new C.GeometryInstance({ geometry: new C.PolylineGeometry({ positions: pos, width: 2, vertexFormat: C.PolylineMaterialAppearance.VERTEX_FORMAT }) });
        });
        var prim = viewer.scene.primitives.add(new C.Primitive({ geometryInstances: inst, appearance: app(), depthFailAppearance: app(), asynchronous: true }));
        return { prim: prim, sphere: C.BoundingSphere.fromPoints(pts) };
      });
      dernierePos = null; viewer.scene.requestRender();
    }).catch(function (e) { console.warn('[fond-3d] frontières indisponibles', e); });
  }

  // Distance d'affichage selon l'importance du lieu (capitale, ville, bourg, population).
  function portee(l) {
    var rang = l[3], pop = l[4] || 0, cap = String(l[5] || '');
    if (cap === 'yes' || cap === '2') return 9e6;
    if (rang === 1) return pop > 1e6 ? 5e6 : pop > 2e5 ? 2.5e6 : 1.2e6;
    return pop > 50000 ? 6e5 : pop > 10000 ? 3e5 : 1.5e5;
  }
  var brutLieux = [], hauteursLieux = {}, MAX_LIEUX = 500;
  function chargerLieux() {
    return fetch(LIEUX_URL).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (d) {
      if (!viewer) return;
      etiquettes = viewer.scene.primitives.add(new C.LabelCollection({ scene: viewer.scene }));
      reperes = viewer.scene.primitives.add(new C.PointPrimitiveCollection());
      brutLieux = (d.lieux || []).map(function (l, i) { return { id: i, lon: l[0], lat: l[1], nom: l[2], ville: l[3] === 1, pop: l[4] || 0, loin: portee(l) }; });
      viewer.camera.moveEnd.addEventListener(majLieux);
      majLieux();
    }).catch(function (e) { console.warn('[fond-3d] noms de lieux indisponibles', e); });
  }
  // Ne garde en mémoire graphique que les noms de la zone regardée (au plus MAX_LIEUX,
  // les plus importants d'abord) au lieu des 12 700 en permanence.
  var affiches = {};
  var HALO_LIEU = null;
  function majLieux() {
    if (!brutLieux.length || mode === 'standard') return;
    var r = viewer.camera.computeViewRectangle();
    var carto = viewer.camera.positionCartographic, h = carto.height;
    var cands = [];
    for (var i = 0; i < brutLieux.length; i++) {
      var l = brutLieux[i], lo = l.lon * DEG, la = l.lat * DEG;
      if (r && (la < r.south || la > r.north || (r.west <= r.east ? (lo < r.west || lo > r.east) : (lo < r.west && lo > r.east)))) continue;
      var dSol = 6371000 * Math.acos(Math.min(1, Math.sin(la) * Math.sin(carto.latitude) + Math.cos(la) * Math.cos(carto.latitude) * Math.cos(lo - carto.longitude)));
      if (Math.sqrt(dSol * dSol + h * h) > l.loin) continue;
      cands.push(l);
    }
    cands.sort(function (a, b) { return (b.ville - a.ville) || (b.pop - a.pop); });
    cands = cands.slice(0, MAX_LIEUX);
    var garder = {};
    cands.forEach(function (l) { garder[l.id] = 1; });
    Object.keys(affiches).forEach(function (id) {
      if (garder[id]) return;
      etiquettes.remove(affiches[id].lab); reperes.remove(affiches[id].pt); delete affiches[id];
    });
    HALO_LIEU = HALO_LIEU || C.Color.fromCssColorString('rgba(0,0,0,0.75)');
    var aCaler = [];
    cands.forEach(function (l) {
      if (affiches[l.id]) return;
      var pos = C.Cartesian3.fromDegrees(l.lon, l.lat, hauteursLieux[l.id] != null ? hauteursLieux[l.id] + 3 : 0);
      var cond = new C.DistanceDisplayCondition(0, l.loin);
      affiches[l.id] = {
        l: l,
        lab: etiquettes.add({
          position: pos, text: l.nom, font: (l.ville ? '500 15px' : '400 12.5px') + ' "Host Grotesk", system-ui, sans-serif',
          fillColor: C.Color.WHITE, outlineColor: HALO_LIEU, outlineWidth: l.ville ? 3 : 2.5, style: C.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new C.Cartesian2(7, -1), horizontalOrigin: C.HorizontalOrigin.LEFT, verticalOrigin: C.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY, distanceDisplayCondition: cond,
        }),
        pt: reperes.add({ position: pos, pixelSize: l.ville ? 5 : 3.5, color: C.Color.WHITE, outlineColor: HALO_LIEU, outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY, distanceDisplayCondition: cond }),
      };
      if (hauteursLieux[l.id] == null) aCaler.push(affiches[l.id]);
    });
    dernierePos = null; // force le test d'horizon sur les nouveaux noms
    viewer.scene.requestRender();
    // Pose au sol (relief) des noms ajoutés, pour qu'ils ne glissent pas en vue inclinée.
    if (!aCaler.length || !(viewer.scene.terrainProvider instanceof C.CesiumTerrainProvider)) return;
    C.sampleTerrainMostDetailed(viewer.scene.terrainProvider, aCaler.map(function (a) { return C.Cartographic.fromDegrees(a.l.lon, a.l.lat); }))
      .then(function (res) {
        if (!viewer) return;
        res.forEach(function (c, i) {
          var a = aCaler[i]; hauteursLieux[a.l.id] = c.height || 0;
          if (!affiches[a.l.id]) return;
          var p = C.Cartesian3.fromDegrees(a.l.lon, a.l.lat, hauteursLieux[a.l.id] + 3); a.lab.position = p; a.pt.position = p;
        });
        dernierePos = null; viewer.scene.requestRender();
      }).catch(function () { /* */ });
  }

  function appliquerMode() {
    if (!viewer) return;
    var mail = mode === 'maillage' && tileset;
    if (tileset) tileset.show = !!mail;
    viewer.scene.globe.show = !mail;
  }

  /* ─────────── Caméra : Mapbox ⇄ Cesium ─────────── */
  function mppMapbox(lat, zoom) { return 2 * Math.PI * 6378137 * Math.cos(lat * DEG) / (512 * Math.pow(2, zoom)); }
  function distPxMapbox() { return 0.5 / Math.tan(FOVY_MAPBOX / 2) * map.getContainer().clientHeight; }
  function ratioFov() {
    // La vue vient d'être affichée : Cesium ne met l'aspect à jour qu'au rendu suivant.
    var cv = viewer.scene.canvas, f = viewer.camera.frustum;
    if (cv.clientWidth && cv.clientHeight) f.aspectRatio = cv.clientWidth / cv.clientHeight;
    return Math.tan(FOVY_MAPBOX / 2) / Math.tan(f.fovy / 2);
  }

  function depuisMapboxVersCesium(anime) {
    var c = map.getCenter(), z = map.getZoom();
    var d = distPxMapbox() * mppMapbox(c.lat, z) * ratioFov();
    var sol = C.Cartesian3.fromDegrees(c.lng, c.lat, hauteurSol(c.lng, c.lat));
    depuisMapbox = true;
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(sol, 1), {
      offset: new C.HeadingPitchRange(map.getBearing() * DEG, (map.getPitch() - 90) * DEG, d),
      duration: anime ? 1.2 : 0,
    });
  }
  function centreCesium() {
    var cv = viewer.scene.canvas, p = new C.Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2);
    var cart = viewer.camera.pickEllipsoid(p, viewer.scene.globe.ellipsoid);
    return cart;
  }
  function versMapbox() {
    var cart = centreCesium(); if (!cart) return;
    var g = C.Cartographic.fromCartesian(cart), lat = g.latitude / DEG, lon = g.longitude / DEG;
    var d = C.Cartesian3.distance(viewer.camera.positionWC, cart) / ratioFov();
    var z = Math.log2(2 * Math.PI * 6378137 * Math.cos(lat * DEG) * distPxMapbox() / (512 * d));
    var pitch = Math.max(0, Math.min(85, 90 + viewer.camera.pitch / DEG));
    depuisCesium = true;
    map.jumpTo({ center: [lon, lat], zoom: Math.max(0, Math.min(22, z)), bearing: viewer.camera.heading / DEG, pitch: pitch });
  }
  function zoomEquivalent() {
    var cart = centreCesium();
    var h = cart ? C.Cartesian3.distance(viewer.camera.positionWC, cart) : viewer.camera.positionCartographic.height;
    return Math.max(0, Math.log2(35200000 / Math.max(1, h)));
  }

  /* ─────────── Horizon ───────────
   * Étiquettes et points ignorent le test de profondeur (lisibles au-dessus du maillage) :
   * on masque donc à la main ce qui passe derrière la courbure de la Terre (God's Eye View :
   * EllipsoidalOccluder). Recalcul limité à ~7 fois par seconde et seulement si la caméra a bougé. */
  var occ = null, dernierHorizon = 0, dernierePos = null;
  function horizon() {
    var now = Date.now(); if (now - dernierHorizon < 150) return;
    var cam = viewer.camera.positionWC;
    if (dernierePos && C.Cartesian3.equalsEpsilon(cam, dernierePos, 0, 1)) return;
    dernierHorizon = now; dernierePos = C.Cartesian3.clone(cam, dernierePos);
    if (!occ) occ = new C.EllipsoidalOccluder(C.Ellipsoid.WGS84, cam); else occ.cameraPosition = cam;
    Object.keys(affiches).forEach(function (id) { var a = affiches[id], v = occ.isPointVisible(a.lab.position); a.lab.show = v; a.pt.show = v; });
    if (paquetsFrontieres.length) {
      var terre = new C.Occluder(new C.BoundingSphere(C.Cartesian3.ZERO, 6356000), cam);
      for (var f = 0; f < paquetsFrontieres.length; f++) { var q = paquetsFrontieres[f]; q.prim.show = terre.isBoundingSphereVisible(q.sphere); }
    }
    for (var j = 0; j < items.length; j++) { var it = items[j], w = occ.isPointVisible(it.pt.position); it.pt.show = w; it.halo.show = w; it.anneau.show = w; }
  }

  /* ─────────── Points (mêmes couches que humint-engine.js l.338-340) ─────────── */
  function hauteurSol(lon, lat) { var k = lon.toFixed(4) + ',' + lat.toFixed(4); return cacheH[k] || 0; }
  function interp(z, a, b, c) { return z <= 4 ? a : z >= 12 ? c : z <= 8 ? a + (b - a) * (z - 4) / 4 : b + (c - b) * (z - 8) / 4; }
  var zoomPts = -1;
  function tailles(force) {
    if (!viewer || !items.length) return;
    var z = zoomEquivalent();
    if (force !== true && Math.abs(z - zoomPts) < 0.1) return; zoomPts = z;
    var rh = interp(z, 6, 11, 16), ra = interp(z, 3, 5, 8), rp = interp(z, 1.8, 3, 4.5);
    items.forEach(function (it) { it.halo.pixelSize = rh * 2; it.anneau.pixelSize = ra * 2; it.pt.pixelSize = rp * 2; });
  }
  function lireDonnees() {
    var s = map.getSource(SRC);
    var d = s && (s._data || (s.serialize && s.serialize().data));
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
    return (d && d.features) || [];
  }
  function poserPoints() {
    if (!viewer || mode === 'standard') return;
    fermerPopup();
    points.removeAll(); items = [];
    var feats = lireDonnees();
    feats.forEach(function (f, i) {
      var xy = f.geometry && f.geometry.coordinates; if (!xy) return;
      var p = f.properties || {}, cc = C.Color.fromCssColorString(p._color || '#ff9800');
      var pos = C.Cartesian3.fromDegrees(xy[0], xy[1], hauteurSol(xy[0], xy[1]) + 2);
      var base = { position: pos, disableDepthTestDistance: Number.POSITIVE_INFINITY, id: { fond3d: items.length } };
      var it = {
        xy: xy, p: p,
        halo: points.add(Object.assign({}, base, { color: cc.withAlpha(0.06), pixelSize: 12 })),
        anneau: points.add(Object.assign({}, base, { color: C.Color.TRANSPARENT, outlineColor: cc.withAlpha(0.5), outlineWidth: 0.7, pixelSize: 6 })),
        pt: points.add(Object.assign({}, base, { color: cc, outlineColor: C.Color.fromCssColorString('#0d1117'), outlineWidth: 0.5, pixelSize: 3.6 })),
      };
      items.push(it);
    });
    tailles(true);
    calerAuSol();
    dernierePos = null; viewer.scene.requestRender();
  }
  // Hauteurs du sol (relief ion) pour que les points ne glissent pas quand on incline la vue.
  var calage = 0;
  function calerAuSol() {
    var jeton = ++calage, manquants = [];
    items.forEach(function (it) { var k = it.xy[0].toFixed(4) + ',' + it.xy[1].toFixed(4); if (cacheH[k] == null) manquants.push(it); });
    if (!manquants.length || !(viewer.scene.terrainProvider instanceof C.CesiumTerrainProvider)) return;
    var carts = manquants.map(function (it) { return C.Cartographic.fromDegrees(it.xy[0], it.xy[1]); });
    C.sampleTerrainMostDetailed(viewer.scene.terrainProvider, carts).then(function (res) {
        if (!viewer) return;
      res.forEach(function (c, i) { var it = manquants[i]; cacheH[it.xy[0].toFixed(4) + ',' + it.xy[1].toFixed(4)] = c.height || 0; });
      if (jeton !== calage) return;
      items.forEach(function (it) {
        var pos = C.Cartesian3.fromDegrees(it.xy[0], it.xy[1], hauteurSol(it.xy[0], it.xy[1]) + 2);
        it.halo.position = pos; it.anneau.position = pos; it.pt.position = pos;
      });
      dernierePos = null; viewer.scene.requestRender();
    }).catch(function () { /* relief indisponible : points à l'altitude 0 */ });
  }

  /* ─────────── Fiche (même contenu que makePopup de humint-engine.js) ─────────── */
  function contenuFiche(p) {
    var color = p._color || '#888';
    var head = '<div class="popup-header"><div class="popup-dot-bar" style="background:' + esc(color) + '"></div><div class="popup-actor">' + esc(p.acteur) + '</div></div>';
    var corr = !!p.corrobore, sColor = corr ? '#2e9e5b' : '#9aa0a6', sLabel = corr ? 'Corroboré' : 'Non corroboré';
    if (p.reference && !corr) { sColor = '#6b6c72'; sLabel = 'Donnée référencée'; }
    var rows = '<div class="popup-row"><span class="popup-key">Statut</span><span class="popup-val"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + sColor + ';margin-right:6px;vertical-align:middle"></span>' + sLabel + '</span></div>';
    if (p.type) rows += '<div class="popup-row"><span class="popup-key">Typologie d\'événement</span><span class="popup-val">' + esc(p.type) + '</span></div>';
    if (p.iso) rows += '<div class="popup-row"><span class="popup-key">Date</span><span class="popup-val popup-mono">' + esc(p.iso) + '</span></div>';
    if (p.description) rows += '<div class="popup-row popup-desc"><span class="popup-val">' + esc(p.description) + '</span></div>';
    return head + '<div class="popup-body">' + rows + '</div>';
  }
  function ouvrirPopup(it) {
    if (!it) return;
    fermerPopup();
    popup = document.createElement('div');
    popup.className = 'mapboxgl-popup humint-popup mapboxgl-popup-anchor-bottom';
    popup.style.cssText = 'position:absolute;top:0;left:0;max-width:320px;z-index:3';
    popup.innerHTML = '<div class="mapboxgl-popup-tip"></div><div class="mapboxgl-popup-content">' + contenuFiche(it.p) +
      '<button class="mapboxgl-popup-close-button" type="button" aria-label="Fermer">×</button></div>';
    popup.querySelector('.mapboxgl-popup-close-button').onclick = fermerPopup;
    vue.appendChild(popup);
    popupItem = it;
    placerPopup();
  }
  function fermerPopup() { if (popup) popup.remove(); popup = null; popupItem = null; }
  function placerPopup() {
    if (!popup || !popupItem) return;
    var w = C.SceneTransforms.worldToWindowCoordinates(viewer.scene, popupItem.pt.position);
    if (!w) { popup.style.display = 'none'; return; }
    popup.style.display = 'flex';
    popup.style.transform = 'translate(' + Math.round(w.x) + 'px,' + Math.round(w.y - 8) + 'px) translate(-50%,-100%)';
  }

  /* ─────────── Fond Mapbox mis au repos ───────────
   * Une source Mapbox n'est téléchargée que si l'un de ses calques est visible : on masque
   * tout le style de base (routes, noms, bâtiments 3D, sol), on garde les calques du moteur. */
  function reposMapbox() {
    var ls;
    try { ls = map.getStyle().layers || []; }
    catch (e) { map.once('idle', reposMapbox); return; } // style pas encore prêt : on réessaie
    ls.forEach(function (l) {
      if (/^(humint|region|th-|fond-3d)/.test(l.id)) return;
      if ((l.layout || {}).visibility === 'none') return;
      try { map.setLayoutProperty(l.id, 'visibility', 'none'); masques.push(l.id); } catch (e) { /* */ }
    });
  }

  var masques = [];
  function reveilMapbox() {
    masques.forEach(function (id) { try { map.setLayoutProperty(id, 'visibility', 'visible'); } catch (e) { /* */ } });
    masques = [];
  }

  /* ─────────── Bascule ─────────── */
  function preparer() {
    if (pret) return pret;
    pret = (window.Cesium ? Promise.resolve() : (window.CESIUM_BASE_URL = CESIUM, chargerCss(CESIUM + 'Widgets/widgets.css'), chargerScript(CESIUM + 'Cesium.js')))
      .then(function () { C = window.Cesium; creerVue(); chargerFrontieres(); chargerLieux(); return chargerFonds(); });
    pret.catch(function (e) { console.warn('[fond-3d]', e); pret = null; });
    return pret;
  }
  function entrer() {
    return preparer().then(function () {
      appliquerMode();
      vue.style.display = 'block';
      viewer.useDefaultRenderLoop = true;
      viewer.resize();
      depuisMapboxVersCesium(false);
      poserPoints();
      majLieux();
      reposMapbox();
      viewer.scene.requestRender();
    });
  }
  // Hors 3D : la vue Cesium est DÉTRUITE (toute sa mémoire graphique rendue au navigateur),
  // puis recréée au prochain passage en 3D ; fond Mapbox rétabli.
  function sortir() {
    fermerPopup();
    try {
      if (viewer && !viewer.isDestroyed()) {
        // Rend la mémoire graphique tout de suite (Safari la garde sinon jusqu'au ramasse-miettes).
        if (gestionnaire && !gestionnaire.isDestroyed()) gestionnaire.destroy();
        var gl = viewer.scene.context._gl, perte = gl && gl.getExtension('WEBGL_lose_context');
        viewer.destroy();
        if (perte) perte.loseContext();
      }
    } catch (e) { /* */ }
    if (vue) vue.remove();
    viewer = vue = tileset = imagerie = points = etiquettes = reperes = occ = dernierePos = gestionnaire = null;
    brutLieux = [];
    items = []; affiches = {}; paquetsFrontieres = []; zoomPts = -1; pret = null;
    reveilMapbox();
  }

  function render(etat) {
    var on = mode !== 'standard';
    chip.className = 'chip chip-edit chip-fond3d' + (on ? ' chip-pays' : '');
    chip.innerHTML = '<span class="chip-key">Rendu</span><span class="chip-val">' + esc(etat || LIB[mode]) + '</span><span class="chip-caret">' + ICON + '</span>';
    chip.title = on ? 'Revenir à la carte standard' : 'Afficher la vue 3D photoréaliste (clic droit et glisser pour incliner)';
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function makeChip() {
    chip = document.createElement('button');
    chip.type = 'button';
    chip.id = 'chip-fond3d';
    render();
    chip.onclick = function (e) {
      e.stopPropagation();
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      if (mode === 'standard') { sortir(); render(); return; }
      render('chargement…');
      entrer().then(function () { render(); }, function (err) {
        console.warn('[fond-3d]', err && err.message); mode = 'standard'; sortir(); render('indisponible');
        setTimeout(function () { render(); }, 2500);
      });
    };
  }
  function ensureInBar() {
    var bar = document.getElementById('chipbar');
    if (!bar || !chip) return;
    // Juste AVANT « Fond » : basemap-toggle.js exige d'être le dernier de la barre
    // (se placer après lui ferait boucler les deux MutationObserver).
    var fond = document.getElementById('chip-basemap');
    if (fond && fond.parentNode === bar) { if (chip.nextElementSibling !== fond) bar.insertBefore(chip, fond); }
    else if (chip.parentNode !== bar) bar.appendChild(chip);
  }

  function build() {
    // Garde posée AVANT l'attente de la config : algorMapReady et le minuteur de secours
    // appellent tous deux build().
    if (demarre) return;
    map = window.HumintMap && window.HumintMap.getMap && window.HumintMap.getMap();
    if (!map) return;
    demarre = true;
    chargerConfigLocale().then(function () {
      var c = cfg();
      if (!c.googleKey && !c.ionToken) return; // pas de jeton : pas de jeton de barre
      makeChip();
      ensureInBar();
      var bar = document.getElementById('chipbar');
      if (bar) new MutationObserver(ensureInBar).observe(bar, { childList: true });
      map.on('style.load', function () { if (mode !== 'standard') { masques = []; reposMapbox(); } });
      // Filtres changés : humint-engine.js réécrit la source → on redessine les points.
      var t = null;
      map.on('sourcedata', function (e) {
        if (e.sourceId !== SRC || mode === 'standard' || !viewer) return;
        clearTimeout(t); t = setTimeout(poserPoints, 150);
      });
      // Mouvements de la carte non issus de Cesium (pays choisi, +/−, liste) : la vue 3D suit.
      map.on('moveend', function () {
        if (depuisCesium) { depuisCesium = false; return; }
        if (mode !== 'standard' && viewer) depuisMapboxVersCesium(true);
      });
    });
  }

  function boot() {
    if (window.HumintMap && window.HumintMap.getMap && window.HumintMap.getMap()) { build(); return; }
    window.addEventListener('algorMapReady', build, { once: true });
    var n = 0, t = setInterval(function () {
      n++;
      if (window.HumintMap && window.HumintMap.getMap && window.HumintMap.getMap()) { clearInterval(t); build(); }
      else if (n > 60) clearInterval(t);
    }, 250);
  }

  // Accès de diagnostic (console) : AlgorFond3D.vue().scene…
  window.AlgorFond3D = { vue: function () { return viewer; }, tuiles: function () { return tileset; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
