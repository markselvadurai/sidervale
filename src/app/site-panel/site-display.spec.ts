import { describe, expect, it } from 'vitest';
import { Site } from '../models/site';
import { designationsLabel, regionLabel } from './site-display';

function site(overrides: Partial<Site>): Site {
  return {
    id: 's',
    name: 'S',
    coordinates: { lat: 0, lng: 0 },
    timezone: 'UTC',
    designations: [],
    countries: [],
    provinces: [],
    brightness: { ratio: 0, mpsas: 22, zone: '0', atlasYear: 2024 },
    urls: {},
    ...overrides,
  };
}

describe('designationsLabel', () => {
  it('titlecases the slug', () => {
    expect(
      designationsLabel([
        { authority: 'darksky', type: 'international-dark-sky-reserve', year: 2012 },
      ]),
    ).toBe('International Dark Sky Reserve');
  });

  it('joins multiple designations with a middle dot', () => {
    expect(
      designationsLabel([
        { authority: 'darksky', type: 'international-dark-sky-reserve', year: 2007 },
        { authority: 'rasc', type: 'dark-sky-preserve', year: 2007 },
      ]),
    ).toBe('International Dark Sky Reserve · Dark Sky Preserve');
  });
});

describe('regionLabel', () => {
  it('prefers the province code, uppercased', () => {
    expect(regionLabel(site({ provinces: ['ON'], countries: ['canada'] }))).toBe('ON');
  });

  it('falls back to the titlecased country slug', () => {
    expect(regionLabel(site({ countries: ['south-africa'] }))).toBe('South Africa');
  });

  it('uppercases acronym-length country slugs', () => {
    expect(regionLabel(site({ countries: ['usa'] }))).toBe('USA');
  });

  it('is empty when no region data exists', () => {
    expect(regionLabel(site({}))).toBe('');
  });
});
