import { markerLabel, markerSize, sitesToFeatures } from './map-features';
import { TonightScore } from '../services/sites';
import { Site } from '../models/site';

const site = (id: string, over: Partial<Site> = {}): Site => ({
  id,
  name: id,
  coordinates: { lat: 45, lng: -79 },
  timezone: 'America/Toronto',
  designations: [],
  countries: ['canada'],
  provinces: ['on'],
  brightness: { ratio: 0.05, mpsas: 21.5, zone: '2', atlasYear: 2024 },
  urls: {},
  ...over,
});

const dark = (over: Partial<Extract<TonightScore, { hasTrueDarkness: true }>> = {}): TonightScore =>
  ({
    hasTrueDarkness: true,
    score: 74,
    tier: 'clear',
    cloudDataAvailable: true,
    ...over,
  }) as TonightScore;

const TOWN = site('town', {
  designations: [{ authority: 'darksky', type: 'international-dark-sky-community', year: null }],
});

describe('sitesToFeatures', () => {
  it('writes coordinates as [lng, lat] — GeoJSON order, not lat/lng', () => {
    // this project has already shipped one lat/lng transposition (the RASC KML harvest);
    // a swap here would silently place every site in the wrong hemisphere
    const fc = sitesToFeatures(
      [site('a', { coordinates: { lat: 45.5, lng: -79.25 } })],
      new Map(),
      null,
    );
    expect(fc.features[0].geometry.coordinates).toEqual([-79.25, 45.5]);
  });

  it('emits one feature per site, in order, tagged with its id', () => {
    const fc = sitesToFeatures([site('a'), site('b'), site('c')], new Map(), null);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.map((f) => f.properties.id)).toEqual(['a', 'b', 'c']);
  });

  it('carries tier and score through for a cloud-aware night', () => {
    const fc = sitesToFeatures([site('a')], new Map([['a', dark({ score: 81 })]]), null);
    expect(fc.features[0].properties).toMatchObject({
      tier: 'clear',
      score: 81,
      pending: false,
      selected: false,
      kind: 'destination',
    });
  });

  it('flags a night scored without cloud data as pending, keeping its tier', () => {
    const fc = sitesToFeatures(
      [site('a')],
      new Map([['a', dark({ score: 58, tier: 'marginal', cloudDataAvailable: false })]]),
      null,
    );
    expect(fc.features[0].properties).toMatchObject({ tier: 'marginal', pending: true, score: 58 });
  });

  it('gives a darkless night its own tier and no score to draw', () => {
    const fc = sitesToFeatures([site('a')], new Map([['a', { hasTrueDarkness: false }]]), null);
    expect(fc.features[0].properties).toMatchObject({ tier: 'darkless', score: null });
  });

  it('marks a site with no score yet as unknown rather than guessing a tier', () => {
    const fc = sitesToFeatures([site('a')], new Map(), null);
    expect(fc.features[0].properties).toMatchObject({ tier: 'unknown', score: null });
  });

  it('selects exactly the site whose id matches, and no other', () => {
    const fc = sitesToFeatures([site('a'), site('b')], new Map(), 'b');
    expect(fc.features.map((f) => f.properties.selected)).toEqual([false, true]);
  });

  it('distinguishes a certified town from a destination', () => {
    const fc = sitesToFeatures([site('a'), TOWN], new Map(), null);
    expect(fc.features.map((f) => f.properties.kind)).toEqual(['destination', 'community']);
  });

  it('carries an accessible label per feature — the canvas has no DOM to name', () => {
    const fc = sitesToFeatures(
      [site('a', { name: 'Torrance Barrens' })],
      new Map([['a', dark({ score: 74 })]]),
      'a',
    );
    expect(fc.features[0].properties.label).toBe('Torrance Barrens, 74 clear, selected');
  });
});

describe('markerLabel', () => {
  it('names an unscored site as unknown rather than guessing', () => {
    expect(markerLabel('Torrance Barrens', undefined, false)).toBe(
      'Torrance Barrens, score unavailable',
    );
  });

  it('says a darkless night out loud', () => {
    expect(markerLabel('Torrance Barrens', { hasTrueDarkness: false }, false)).toBe(
      'Torrance Barrens, no astronomical darkness tonight',
    );
  });

  it('states the score and tier, and flags a cloudless one', () => {
    expect(markerLabel('X', dark({ score: 74 }), false)).toBe('X, 74 clear');
    expect(
      markerLabel('X', dark({ score: 58, tier: 'marginal', cloudDataAvailable: false }), false),
    ).toBe('X, 58 marginal, astronomy only');
  });

  it('appends selection to any state, darkness or not', () => {
    expect(markerLabel('X', dark(), true)).toBe('X, 74 clear, selected');
    expect(markerLabel('X', { hasTrueDarkness: false }, true)).toBe(
      'X, no astronomical darkness tonight, selected',
    );
    expect(markerLabel('X', undefined, true)).toBe('X, score unavailable, selected');
  });

  it('reads the site name verbatim, punctuation and all', () => {
    expect(markerLabel('Ann & Sandy Cross', dark(), false)).toBe('Ann & Sandy Cross, 74 clear');
  });
});

describe('markerSize', () => {
  it('shrinks markers at world zoom, where 293 of them would otherwise fuse', () => {
    expect(markerSize(2)).toBe(12);
    expect(markerSize(3)).toBe(12);
  });

  it('grows in steps as the map zooms in, up to the detail size', () => {
    expect(markerSize(4)).toBe(18);
    expect(markerSize(5)).toBe(18);
    expect(markerSize(6)).toBe(24);
    expect(markerSize(7)).toBe(24);
    expect(markerSize(8)).toBe(28);
  });

  it('never shrinks as zoom increases, at any zoom the map can report', () => {
    const sizes = Array.from({ length: 21 }, (_, z) => markerSize(z));
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(sizes.at(-1)).toBe(28);
  });
});
