import {
  BASEMAP_STYLE_URL,
  GROUND,
  circleRadius,
  indigoOverrides,
  siteCirclePaint,
  TIER_ORDER,
  lpGradient,
  LP_AXIS,
} from './map-style';
import { markerSize } from './map-features';

describe('map style', () => {
  it('points at a keyless tile source — no API key can leak from a static bundle', () => {
    expect(BASEMAP_STYLE_URL).toMatch(/^https:\/\//);
    expect(BASEMAP_STYLE_URL).not.toMatch(/[?&](key|apikey|access_token)=/i);
  });

  it('grounds the map in the panel indigo rather than the style default', () => {
    // the old CSS filter tinted the light-pollution overlay too; paint does not
    expect(GROUND).toMatch(/^#[0-9a-f]{6}$/i);
    expect(indigoOverrides().length).toBeGreaterThan(0);
  });

  it('derives the circle radius from markerSize, so one rule owns marker scale', () => {
    // the expression is ['interpolate', ['linear'], ['zoom'], z, r, ...] — radius is half
    // the diameter markerSize reports, and must agree at every bucket edge
    const expr = circleRadius();
    const stops = new Map<number, number>();
    for (let i = 3; i < expr.length; i += 2) stops.set(expr[i] as number, expr[i + 1] as number);
    for (const [zoom, radius] of stops) {
      expect(radius * 2).toBe(markerSize(zoom));
    }
    expect(stops.size).toBeGreaterThanOrEqual(4);
  });

  it('assigns every tier a colour — an unmatched tier would render invisible', () => {
    const paint = siteCirclePaint();
    for (const key of ['circle-color', 'circle-stroke-color'] as const) {
      const expr = JSON.stringify(paint[key]);
      for (const tier of TIER_ORDER) expect(expr).toContain(tier);
    }
  });

  it('recedes poor and lifts clear — the map answers "where is it good"', () => {
    const stroke = JSON.stringify(siteCirclePaint()['circle-stroke-opacity']);
    const clear = JSON.parse(stroke).indexOf('clear');
    const poor = JSON.parse(stroke).indexOf('poor');
    const opacities = JSON.parse(stroke) as unknown[];
    expect(Number(opacities[clear + 1])).toBeGreaterThan(Number(opacities[poor + 1]));
  });
});

describe('lpGradient', () => {
  it('spans the full bar, darkest sky first', () => {
    const g = lpGradient();
    expect(g.startsWith('linear-gradient(90deg, #000000 0.0%')).toBe(true);
    expect(g.endsWith('#a0a0a0 100.0%)')).toBe(true);
  });

  it('places every sampled colour in ascending order along the axis', () => {
    // an out-of-order stop renders as a hard band and would misread the raster
    const percents = [...lpGradient().matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
    expect(percents).toHaveLength(11);
    for (let i = 1; i < percents.length; i++) {
      expect(percents[i]).toBeGreaterThan(percents[i - 1]);
    }
  });

  it('positions a stop by its measured brightness, not by its index', () => {
    // 21.5 sits (22.0 − 21.5) / (22.0 − 18.01) = 12.5% along; evenly spaced stops would put
    // this fourth of eleven colours at 30%
    expect(lpGradient()).toContain('#1fa12a 12.5%');
  });

  it('runs the axis from the darkest sky the atlas models to the brightest sampled', () => {
    expect(LP_AXIS).toEqual([22.0, 18.01]);
  });
});
