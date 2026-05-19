/**
 * base-styles.js — Specs de style Mapbox utilisant des tilesets PUBLICS
 *
 * Permet de faire fonctionner la demo locale (sans token Mapbox autorise sur
 * localhost) et reste utile pour les exports HTML autonomes.
 *
 * Couvre 3 fonds :
 *   - cartodb-dark    : CartoDB Dark Matter (sombre, frontieres/labels)
 *   - cartodb-voyager : CartoDB Voyager (legerement plus contraste)
 *   - esri-imagery    : ESRI World Imagery (satellite)
 *
 * Tous gratuits, sans token, attribution requise.
 */

export const STYLE_CARTODB_DARK = {
  version: 8,
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
  sources: {
    'cartodb-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap, © CARTO',
      minzoom: 0,
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'bg',
      type: 'background',
      paint: { 'background-color': '#0a0d10' },
    },
    {
      id: 'cartodb-base',
      type: 'raster',
      source: 'cartodb-dark',
      paint: {
        'raster-opacity': 1,
        'raster-saturation': -0.1,
        'raster-contrast': 0.05,
      },
    },
  ],
};

export const STYLE_CARTODB_VOYAGER = {
  ...STYLE_CARTODB_DARK,
  sources: {
    'cartodb-voyager': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap, © CARTO',
      minzoom: 0,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#1b1d1f' } },
    { id: 'cartodb-base', type: 'raster', source: 'cartodb-voyager',
      paint: { 'raster-opacity': 1, 'raster-saturation': -0.3, 'raster-contrast': 0, 'raster-brightness-max': 0.85 } },
  ],
};

export const STYLE_ESRI_IMAGERY = {
  version: 8,
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
  sources: {
    'esri-imagery': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '© Esri, Maxar, Earthstar',
      minzoom: 0,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0a0d10' } },
    { id: 'esri-base', type: 'raster', source: 'esri-imagery' },
  ],
};

export const BASE_STYLES = {
  'cartodb-dark': STYLE_CARTODB_DARK,
  'cartodb-voyager': STYLE_CARTODB_VOYAGER,
  'esri-imagery': STYLE_ESRI_IMAGERY,
};

/**
 * Resout une cle de style : si c'est une URL Mapbox, retourne tel quel ;
 * si c'est une cle de base style locale, retourne le spec object.
 */
export function resolveStyle(keyOrUrl) {
  if (!keyOrUrl) return BASE_STYLES['cartodb-dark'];
  if (typeof keyOrUrl === 'object') return keyOrUrl;
  if (BASE_STYLES[keyOrUrl]) return BASE_STYLES[keyOrUrl];
  return keyOrUrl; // assume Mapbox style URL
}
