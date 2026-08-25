import { describe, expect, it } from 'vitest';
import { parseSitesDataset } from './parse-sites';

const VALID_SITE = {
  id: 'aoraki-mackenzie',
  name: 'Aoraki Mackenzie',
  coordinates: { lat: -43.73, lng: 170.1 },
  timezone: 'Pacific/Auckland',
  designations: [{ authority: 'darksky', type: 'international-dark-sky-reserve', year: 2012 }],
  countries: ['new-zealand'],
  provinces: [],
  brightness: { ratio: 0.05, mpsas: 21.95, zone: '1a', atlasYear: 2024 },
  urls: { darksky: 'https://darksky.org/places/aoraki/' },
};

describe('parseSitesDataset', () => {
  it('returns the sites of a valid document with fields intact', () => {
    const sites = parseSitesDataset({ sites: [VALID_SITE, { ...VALID_SITE, id: 'other' }] });
    expect(sites).toHaveLength(2);
    expect(sites[0].id).toBe('aoraki-mackenzie');
    expect(sites[0].timezone).toBe('Pacific/Auckland');
    expect(sites[0].brightness.mpsas).toBe(21.95);
    expect(sites[0].designations[0].type).toBe('international-dark-sky-reserve');
  });

  it('throws when the document has no sites array', () => {
    expect(() => parseSitesDataset({})).toThrow(/sites/);
    expect(() => parseSitesDataset(null)).toThrow(/sites/);
  });

  it('throws naming the site that lacks a timezone', () => {
    const broken = { ...VALID_SITE, timezone: undefined };
    expect(() => parseSitesDataset({ sites: [broken] })).toThrow(/aoraki-mackenzie/);
  });

  it('throws on out-of-range coordinates', () => {
    const broken = { ...VALID_SITE, coordinates: { lat: 91, lng: 0 } };
    expect(() => parseSitesDataset({ sites: [broken] })).toThrow(/aoraki-mackenzie/);
  });
});
