/* sites3d-premium.js — surcouche de qualité 3D pour la scène Mapbox existante.
   Ne change AUCUNE couleur : tout vient de TOKENS repris de la charte.
   API :  Sites3DPremium.enhance(map, opts)   // lumières + matériaux + hover
          Sites3DPremium.focus(map, lngLat)    // halo cible (pulse auto-stop)
          Sites3DPremium.flyTo(map, target)    // caméra easeOutCubic */
(function (global) {
  'use strict';

  var C = {
    violet: '#6B3FA0', violetMid: '#5650C6', blue: '#2E84D4',
    detruit: '#B22828', endommage: '#C45A3C',
    contexte: '#E7E1D5', contexteHi: '#F3EEE4', sun: '#fff6e8'
  };

  var STRUCT = 'structures-3d', STRUCT_SRC = 'structures';

  function has(map, id) { return !!map.getLayer(id); }
  function firstSymbol(map) {
    var ls = map.getStyle().layers || [];
    for (var i = 0; i < ls.length; i++) if (ls[i].type === 'symbol') return ls[i].id;
  }
  function safe(fn) { try { fn(); } catch (e) { /* propriété v3 absente → ignore */ } }

  function applyLights(map) {
    if (map.setLights) map.setLights([
      { id: 'key', type: 'directional', properties: {
        color: C.sun, intensity: 0.85, direction: [210, 32],
        'cast-shadows': true, 'shadow-intensity': 0.85 } },
      { id: 'fill', type: 'ambient', properties: { color: '#eef0f6', intensity: 0.55 } }
    ]);
    map.setFog({
      color: 'rgb(244,242,248)', 'high-color': 'rgb(214,205,236)',
      'horizon-blend': 0.04, 'space-color': 'rgb(233,230,242)', 'star-intensity': 0
    });
  }

  function upgradeBuildings(map, opts) {
    if (!has(map, STRUCT)) return;
    var hp = (opts && opts.heightProp) || 'h';
    var dmg = (opts && opts.damageProp) || 'damage';
    var P = map.setPaintProperty.bind(map);
    safe(function () { P(STRUCT, 'fill-extrusion-edge-radius', 0.55); });
    safe(function () { P(STRUCT, 'fill-extrusion-rounded-roof', true); });
    P(STRUCT, 'fill-extrusion-vertical-gradient', true);
    safe(function () { P(STRUCT, 'fill-extrusion-ambient-occlusion-intensity', 0.5); });
    safe(function () { P(STRUCT, 'fill-extrusion-ambient-occlusion-radius', 4); });
    safe(function () { P(STRUCT, 'fill-extrusion-cutoff-fade-range', 0.6); });
    P(STRUCT, 'fill-extrusion-emissive-strength', [
      'case',
      ['boolean', ['feature-state', 'hover'], false], 0.6,
      ['==', ['get', dmg], 'detruit'], 0.5,
      ['==', ['get', dmg], 'endommage'], 0.4,
      0
    ]);
    P(STRUCT, 'fill-extrusion-opacity', 1);

    if (!has(map, 'premium-edges')) {
      map.addLayer({
        id: 'premium-edges', type: 'line', source: STRUCT_SRC,
        paint: {
          'line-color': ['case', ['==', ['get', dmg], 'intact'], '#ffffff', C.violetMid],
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.3, 17, 1.1],
          'line-opacity': 0.35
        }
      });
    }
  }

  function circlePoly(center, radiusM, steps) {
    steps = steps || 64;
    var lng = center[0], lat = center[1];
    var dx = radiusM / (111320 * Math.cos(lat * Math.PI / 180)), dy = radiusM / 110540, ring = [];
    for (var i = 0; i <= steps; i++) {
      var a = (i / steps) * 2 * Math.PI;
      ring.push([lng + dx * Math.cos(a), lat + dy * Math.sin(a)]);
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} };
  }

  var _pulse = { raf: null };
  function stopPulse() { if (_pulse.raf) cancelAnimationFrame(_pulse.raf); _pulse.raf = null; }
  function focus(map, lngLat, opts) {
    opts = opts || {};
    var radius = opts.radiusM || 90, before = firstSymbol(map);
    if (!map.getSource('premium-focus')) {
      map.addSource('premium-focus', { type: 'geojson', data: circlePoly(lngLat, radius) });
      map.addLayer({ id: 'premium-reticle-fill', type: 'fill', source: 'premium-focus',
        paint: { 'fill-color': C.violet, 'fill-opacity': 0.10 } }, before);
      map.addLayer({ id: 'premium-reticle-line', type: 'line', source: 'premium-focus',
        paint: { 'line-color': C.violet, 'line-width': 2, 'line-opacity': 0.7, 'line-dasharray': [2, 1.4] } }, before);
    } else { map.getSource('premium-focus').setData(circlePoly(lngLat, radius)); }
    stopPulse();
    var t0 = performance.now(), last = 0;
    (function step(now) {
      if (now - last > 42) {
        last = now;
        var k = (Math.sin((now - t0) / 700) + 1) / 2, r = radius * (1 + 0.12 * k);
        map.getSource('premium-focus').setData(circlePoly(lngLat, r));
        safe(function () { map.setPaintProperty('premium-reticle-line', 'line-opacity', 0.45 + 0.35 * k); });
      }
      if (now - t0 < 6000) _pulse.raf = requestAnimationFrame(step);
    })(t0);
  }

  function flyTo(map, target) {
    stopPulse();
    map.easeTo(Object.assign({
      duration: 2200, curve: 1.42, essential: true,
      easing: function (t) { return 1 - Math.pow(1 - t, 3); }
    }, target));
  }

  function wireHover(map) {
    var hover = null;
    map.on('mousemove', STRUCT, function (e) {
      var id = e.features[0].id; if (id == null) return;
      if (hover !== null && hover !== id) map.setFeatureState({ source: STRUCT_SRC, id: hover }, { hover: false });
      hover = id; map.setFeatureState({ source: STRUCT_SRC, id: id }, { hover: true });
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', STRUCT, function () {
      if (hover !== null) map.setFeatureState({ source: STRUCT_SRC, id: hover }, { hover: false });
      hover = null; map.getCanvas().style.cursor = '';
    });
  }

  function enhance(map, opts) {
    var run = function () { applyLights(map); upgradeBuildings(map, opts); wireHover(map); };
    if (map.isStyleLoaded()) run(); else map.once('idle', run);
  }

  global.Sites3DPremium = { enhance: enhance, focus: focus, flyTo: flyTo, stopPulse: stopPulse, tokens: C };
})(window);
