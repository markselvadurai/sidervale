import { describe, expect, it } from 'vitest';
import { enrichSites, isSuspiciousZone } from './enrich';
import { MergedDataset, MergedSite } from './merge';

function site(overrides: Partial<MergedSite> & Pick<MergedSite, 'id'>): MergedSite {
  return {
    name: overrides.id,
    coordinates: { lat: 45.42, lng: -71.12 },
    coordinateDeltaKm: null,
    designations: [],
    countries: [],
    provinces: [],
    sources: {},
    ...overrides,
  };
}

function dataset(sites: MergedSite[], quarantine: MergedDataset['quarantine'] = []): MergedDataset {
  return { mergedAt: 't', sites, autoMerged: [], reviewPairs: [], quarantine };
}

describe('enrichSites', () => {
  it('assigns IANA zones from coordinates — including the +14 zone tz databases get wrong', () => {
    const enriched = enrichSites(
      dataset([
        site({ id: 'mont-megantic', coordinates: { lat: 45.42, lng: -71.12 } }),
        site({ id: 'jasper', coordinates: { lat: 52.87, lng: -118.08 } }),
        site({ id: 'aoraki', coordinates: { lat: -43.73, lng: 170.1 } }),
        site({ id: 'kiritimati', coordinates: { lat: 1.87, lng: -157.43 } }),
      ]),
      't',
    );
    const zones = Object.fromEntries(enriched.sites.map((s) => [s.id, s.timezone]));
    expect(zones).toEqual({
      'mont-megantic': 'America/Toronto',
      jasper: 'America/Edmonton',
      aoraki: 'Pacific/Auckland',
      kiritimati: 'Pacific/Kiritimati',
    });
    expect(enriched.quarantine).toEqual([]);
  });

  it('quarantines ocean and Antarctic zones as coordinate errors, keeping the zone visible', () => {
    // 40°S 120°W is open South Pacific, far from any territory's tz catchment
    const enriched = enrichSites(
      dataset([site({ id: 'swapped', coordinates: { lat: -40, lng: -120 } })]),
      't',
    );
    expect(enriched.sites[0].timezone).toMatch(/^Etc\//);
    expect(enriched.quarantine).toEqual([{ id: 'swapped', reason: 'suspicious-timezone' }]);
  });

  it('passes null-coordinate sites through untouched without double-quarantining', () => {
    const enriched = enrichSites(
      dataset(
        [site({ id: 'kerry', coordinates: null })],
        [{ id: 'kerry', reason: 'no-coordinates' }],
      ),
      't',
    );
    expect(enriched.sites[0].timezone).toBeNull();
    expect(enriched.quarantine).toEqual([{ id: 'kerry', reason: 'no-coordinates' }]);
  });
});

describe('isSuspiciousZone', () => {
  it('flags Etc and Antarctica, accepts real zones', () => {
    expect(isSuspiciousZone('Etc/GMT+10')).toBe(true);
    expect(isSuspiciousZone('Antarctica/Syowa')).toBe(true);
    expect(isSuspiciousZone('America/Toronto')).toBe(false);
    expect(isSuspiciousZone('Pacific/Kiritimati')).toBe(false);
  });
});
