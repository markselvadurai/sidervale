import { describe, expect, it } from 'vitest';
import { BrightnessDoc, buildAppDataset, validationFailures } from './emit';
import { EnrichedDataset, EnrichedSite } from './enrich';

function enrichedSite(overrides: Partial<EnrichedSite> & Pick<EnrichedSite, 'id'>): EnrichedSite {
  return {
    name: overrides.id,
    coordinates: { lat: 45.42, lng: -71.12 },
    coordinateDeltaKm: null,
    designations: [{ authority: 'darksky', type: 'international-dark-sky-reserve', year: 2007 }],
    countries: ['canada'],
    provinces: [],
    sources: { darksky: { postId: 1, slug: 'x', url: 'https://darksky.org/places/x/' } },
    timezone: 'America/Toronto',
    ...overrides,
  };
}

function doc(ids: string[]): BrightnessDoc {
  return {
    sampledAt: 't',
    brightness: Object.fromEntries(
      ids.map((id) => [id, { ratio: 0.05, mpsas: 21.95, zone: '1a', atlasYear: 2024 }]),
    ),
    quarantine: [],
  };
}

function dataset(sites: EnrichedSite[]): EnrichedDataset {
  return { enrichedAt: 't', sites, quarantine: [] };
}

describe('validationFailures', () => {
  it('passes a complete site with no failures', () => {
    expect(validationFailures(enrichedSite({ id: 'a' }), doc(['a']))).toEqual([]);
  });

  it('names every missing requirement, not just the first', () => {
    const bad = enrichedSite({ id: 'b', coordinates: null, timezone: null, designations: [] });
    const failures = validationFailures(bad, doc([]));
    expect(failures).toContain('no-coordinates');
    expect(failures).toContain('no-timezone');
    expect(failures).toContain('no-designations');
    expect(failures).toContain('no-brightness');
  });

  it('rejects out-of-range coordinates and suspicious timezones', () => {
    const swapped = enrichedSite({
      id: 'c',
      coordinates: { lat: -120, lng: 45 },
      timezone: 'Etc/GMT+8',
    });
    const failures = validationFailures(swapped, doc(['c']));
    expect(failures).toContain('coordinates-out-of-range');
    expect(failures).toContain('suspicious-timezone');
  });
});

describe('buildAppDataset', () => {
  it('emits valid sites sorted by id and lists exclusions with reasons', () => {
    const sites = [
      enrichedSite({ id: 'zulu' }),
      enrichedSite({ id: 'alpha' }),
      enrichedSite({ id: 'broken', coordinates: null }),
    ];
    const out = buildAppDataset(dataset(sites), doc(['zulu', 'alpha']), 'now');

    expect(out.sites.map((s) => s.id)).toEqual(['alpha', 'zulu']);
    expect(out.sites[0].brightness.zone).toBe('1a');
    expect(out.sites[0].urls.darksky).toBe('https://darksky.org/places/x/');
    expect(out.excluded).toEqual([{ id: 'broken', reasons: ['no-coordinates', 'no-brightness'] }]);
  });

  it('throws loudly on duplicate ids rather than emitting a corrupt dataset', () => {
    const sites = [enrichedSite({ id: 'dup' }), enrichedSite({ id: 'dup' })];
    expect(() => buildAppDataset(dataset(sites), doc(['dup']), 'now')).toThrow(/duplicate/i);
  });
});
