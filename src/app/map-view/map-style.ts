import { markerSize } from './map-features';

/** OpenFreeMap: keyless, no registration, one host for style, tiles, glyphs and sprites.
 *  Swappable in one line — Protomaps PMTiles on R2 is the documented fallback (ADR 0008). */
export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

/** The ground the mockups asked for. Paint, not a CSS filter — a filter over the canvas
 *  would tint the light-pollution overlay, which encodes its data in colour. */
export const GROUND = '#0d1226';
const LAND = '#141b33';
const WATER = '#090d1c';

export const TIER_ORDER = ['clear', 'marginal', 'poor', 'darkless', 'unknown'] as const;

/** Zoom → radius, derived from markerSize so marker scale has exactly one owner. */
export function circleRadius(): unknown[] {
  const stops = [2, 4, 6, 8].flatMap((z) => [z, markerSize(z) / 2]);
  return ['interpolate', ['linear'], ['zoom'], ...stops];
}

/** Recede/glow expressed as paint: bad nights fade, good nights carry a core and a halo. */
export function siteCirclePaint(): Record<string, unknown> {
  return {
    'circle-radius': circleRadius(),
    'circle-color': [
      'match',
      ['get', 'tier'],
      'clear',
      '#7fd1a8',
      'marginal',
      '#e2b857',
      'poor',
      'rgba(0,0,0,0)', // hollow: the least ink for the least promising night
      'darkless',
      'rgba(0,0,0,0)',
      'unknown',
      'rgba(0,0,0,0)',
      'rgba(0,0,0,0)',
    ],
    // fill level is the colour-blind-safe channel: wide core / small core / hollow
    'circle-opacity': [
      'match',
      ['get', 'tier'],
      'clear',
      0.9,
      'marginal',
      0.45,
      'poor',
      0,
      'darkless',
      0,
      'unknown',
      0,
      0,
    ],
    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 6, 2],
    'circle-stroke-color': [
      'match',
      ['get', 'tier'],
      'clear',
      '#7fd1a8',
      'marginal',
      '#e2b857',
      'poor',
      '#a0524d',
      'darkless',
      '#1c2b45',
      'unknown',
      '#8fa3c4',
      '#8fa3c4',
    ],
    'circle-stroke-opacity': [
      'match',
      ['get', 'tier'],
      'clear',
      1,
      'marginal',
      0.9,
      'poor',
      0.45, // on a moon-dominated night the whole planet is poor — it must recede
      'darkless',
      0.5,
      'unknown',
      0.6,
      0.6,
    ],
  };
}

/** The selection halo, drawn beneath the sites so it reads as a ring around them. */
export function selectionPaint(): Record<string, unknown> {
  return {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 9, 8, 18],
    'circle-color': 'rgba(0,0,0,0)',
    'circle-stroke-width': 2,
    'circle-stroke-color': '#9184d9', // the accent; red stays reserved for errors
    'circle-stroke-opacity': 0.9,
  };
}

/** Site names, collision-managed by MapLibre — the thing Leaflet could not do. */
export function labelLayout(): Record<string, unknown> {
  return {
    'text-field': ['get', 'name'],
    'text-font': ['Noto Sans Regular'],
    'text-size': 11,
    'text-offset': [0, 1.4],
    'text-anchor': 'top',
    'text-optional': true,
    'text-allow-overlap': false, // declutter: the whole point of the migration
    'text-max-width': 9,
  };
}

/** Repaint the vendor style's grounds to ours, matched by layer id/type at runtime. */
export function indigoOverrides(): { match: RegExp; prop: string; value: string }[] {
  return [
    { match: /^background$/, prop: 'background-color', value: GROUND },
    { match: /water|ocean|sea/i, prop: 'fill-color', value: WATER },
    { match: /landcover|landuse|park|wood|forest|grass/i, prop: 'fill-color', value: LAND },
  ];
}
