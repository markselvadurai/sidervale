import { describe, expect, it } from 'vitest';
import { DarkskySnapshot } from './darksky';
import { buildMergedDataset, findMergePairs, haversineKm } from './merge';
import { RascSnapshot } from './rasc';
import { slugify } from './naming';

type DarkskyRecord = DarkskySnapshot['places'][number];
type RascRecord = RascSnapshot['sites'][number];

function darkskyPlace(overrides: Partial<DarkskyRecord>): DarkskyRecord {
  return {
    postId: 1,
    slug: 'mont-megantic-dark-sky-reserve',
    name: 'Mont-Mégantic',
    url: 'https://darksky.org/places/mont-megantic-dark-sky-reserve/',
    categories: ['international-dark-sky-reserve'],
    countries: ['canada'],
    designatedYear: 2007,
    categoryText: 'International Dark Sky Reserve',
    areaText: null,
    coordinates: { lat: 45.45543, lng: -71.1625 },
    ...overrides,
  };
}

function rascSite(overrides: Partial<RascRecord>): RascRecord {
  return {
    name: 'Mont-Mégantic',
    orgUrl: null,
    provinces: ['QC'],
    year: 2007,
    program: 'other',
    typeText: 'IDA International Dark Sky Reserve & RASC Certificate of Merit',
    rascUrl: 'https://rasc.ca/lpa/mont-megantic-national-park',
    parcels: [{ name: 'Mont-Mégantic National Park', lat: 45.423978, lng: -71.124764 }],
    coordinates: { lat: 45.423978, lng: -71.124764 },
    ...overrides,
  };
}

function snapshots(darksky: DarkskyRecord[], rasc: RascRecord[]) {
  return {
    ds: {
      source: 'darksky.org',
      harvestedAt: 't',
      places: darksky,
      excluded: [],
      quarantine: [],
    } as DarkskySnapshot,
    ra: {
      source: 'rasc.ca',
      harvestedAt: 't',
      sites: rasc,
      unmatchedPins: [],
      quarantine: [],
    } as RascSnapshot,
  };
}

describe('haversineKm', () => {
  it('matches the known Toronto–Ottawa great-circle distance (~352 km)', () => {
    // Toronto city hall to Ottawa parliament, ~352 km per any geodesic calculator
    const d = haversineKm({ lat: 43.6532, lng: -79.3832 }, { lat: 45.4215, lng: -75.6972 });
    expect(d).toBeGreaterThan(348);
    expect(d).toBeLessThan(356);
  });

  it('is zero for identical points', () => {
    expect(haversineKm({ lat: 45, lng: -71 }, { lat: 45, lng: -71 })).toBe(0);
  });
});

describe('findMergePairs', () => {
  it('auto-merges when name and proximity both agree (Mont-Mégantic, ~4.6 km apart)', () => {
    const { auto, review } = findMergePairs([darkskyPlace({})], [rascSite({})]);
    expect(auto).toHaveLength(1);
    expect(review).toHaveLength(0);
    expect(auto[0].distanceKm).toBeGreaterThan(4.4);
    expect(auto[0].distanceKm).toBeLessThan(4.8);
  });

  it('sends name-match without proximity to review, never auto', () => {
    // same name, 300+ km apart — a rename or a data error, a human decides
    const far = rascSite({ coordinates: { lat: 48.5, lng: -71.1 }, parcels: [] });
    const { auto, review } = findMergePairs([darkskyPlace({})], [far]);
    expect(auto).toHaveLength(0);
    expect(review).toHaveLength(1);
  });

  it('sends proximity without name-match to review, never auto', () => {
    // 1 km apart but different names — two parks can share a valley
    const neighbour = rascSite({
      name: 'Scotch Creek Provincial Park',
      coordinates: { lat: 45.4645, lng: -71.1625 },
    });
    const { auto, review } = findMergePairs([darkskyPlace({})], [neighbour]);
    expect(auto).toHaveLength(0);
    expect(review).toHaveLength(1);
  });

  it('ignores unrelated pairs entirely', () => {
    const unrelated = rascSite({
      name: 'Wood Buffalo National Park',
      coordinates: { lat: 59.439503, lng: -112.876402 },
    });
    const { auto, review } = findMergePairs([darkskyPlace({})], [unrelated]);
    expect(auto).toHaveLength(0);
    expect(review).toHaveLength(0);
  });
});

describe('buildMergedDataset', () => {
  it('merges the duplicate into one site carrying both designations and sources', () => {
    const { ds, ra } = snapshots(
      [darkskyPlace({})],
      [
        rascSite({}),
        rascSite({
          name: 'Jasper National Park',
          coordinates: { lat: 52.869405, lng: -118.075993 },
          program: 'dark-sky-preserve',
          typeText: 'Dark-Sky Preserve',
          year: 2011,
        }),
      ],
    );
    const merged = buildMergedDataset(ds, ra, '2026-08-24T00:00:00Z');

    expect(merged.sites).toHaveLength(2);
    const mm = merged.sites.find((s) => s.id === 'mont-megantic-dark-sky-reserve');
    if (!mm) throw new Error('expected merged Mont-Mégantic');
    // canonical coordinates come from darksky; the delta is recorded, not hidden
    expect(mm.coordinates).toEqual({ lat: 45.45543, lng: -71.1625 });
    expect(mm.coordinateDeltaKm).toBeGreaterThan(4.4);
    expect(mm.designations).toEqual([
      { authority: 'darksky', type: 'international-dark-sky-reserve', year: 2007 },
      { authority: 'rasc', type: 'other', year: 2007 },
    ]);
    expect(mm.provinces).toEqual(['QC']);
    expect(mm.sources.darksky?.postId).toBe(1);
    expect(mm.sources.rasc?.rascUrl).toBe('https://rasc.ca/lpa/mont-megantic-national-park');

    const jasper = merged.sites.find((s) => s.id === slugify('Jasper National Park'));
    if (!jasper) throw new Error('expected rasc-only Jasper');
    expect(jasper.coordinates).toEqual({ lat: 52.869405, lng: -118.075993 });
    expect(jasper.designations).toEqual([
      { authority: 'rasc', type: 'dark-sky-preserve', year: 2011 },
    ]);
    expect(jasper.sources.darksky).toBeUndefined();
  });

  it('quarantines a merged pair whose coordinates disagree past the threshold', () => {
    // name matches, 9 km apart: inside the 30 km merge radius, outside the 5 km trust radius
    const drifted = rascSite({ coordinates: { lat: 45.5364, lng: -71.1625 }, parcels: [] });
    const { ds, ra } = snapshots([darkskyPlace({})], [drifted]);
    const merged = buildMergedDataset(ds, ra, 't');
    expect(merged.quarantine).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'mont-megantic-dark-sky-reserve',
          reason: 'coordinate-disagreement',
        }),
      ]),
    );
  });

  it('carries coordinate-less sites through with null, preserving source quarantines', () => {
    const { ds, ra } = snapshots(
      [
        darkskyPlace({
          slug: 'kerry',
          name: 'Kerry International Dark-Sky Reserve',
          coordinates: null,
        }),
      ],
      [],
    );
    ds.quarantine = [{ slug: 'kerry', reason: 'no-coordinates' }];
    const merged = buildMergedDataset(ds, ra, 't');
    expect(merged.sites[0].coordinates).toBeNull();
    expect(merged.quarantine).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'kerry', reason: 'no-coordinates' })]),
    );
  });
});
