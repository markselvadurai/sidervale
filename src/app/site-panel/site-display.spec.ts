import { describe, expect, it } from 'vitest';
import { Site } from '../models/site';
import { designationsLabel, regionLabel, verdictWord } from './site-display';

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

  it("omits the sentinel 'other' type instead of rendering a meaningless label", () => {
    expect(
      designationsLabel([
        { authority: 'darksky', type: 'international-dark-sky-reserve', year: 2007 },
        { authority: 'rasc', type: 'other', year: 2007 },
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
    // lowercase fixture on purpose: an already-uppercase one cannot catch a dropped toUpperCase
    expect(regionLabel(site({ provinces: ['on'], countries: ['canada'] }))).toBe('ON');
  });

  it('falls back to the titlecased country slug', () => {
    expect(regionLabel(site({ countries: ['south-africa'] }))).toBe('South Africa');
  });

  it('uppercases acronym-length country slugs', () => {
    expect(regionLabel(site({ countries: ['usa'] }))).toBe('USA');
  });

  it('strips WordPress disambiguation suffixes from country slugs', () => {
    // the dataset really contains countries: ['niue-2'] — must render 'Niue', never 'Niue 2'
    expect(regionLabel(site({ countries: ['niue-2'] }))).toBe('Niue');
  });

  it('is empty when no region data exists', () => {
    expect(regionLabel(site({}))).toBe('');
  });
});

describe('verdictWord', () => {
  it('names the tier in words, so the dial never carries the verdict in hue alone', () => {
    expect(verdictWord('clear', true)).toBe('Clear');
    expect(verdictWord('marginal', true)).toBe('Marginal');
    expect(verdictWord('poor', true)).toBe('Poor');
  });

  it('says astronomy-only instead of a tier when the score has no cloud data behind it', () => {
    // the tier is still computed, but naming it would overstate what the number knows
    expect(verdictWord('clear', false)).toBe('Astronomy only');
    expect(verdictWord('poor', false)).toBe('Astronomy only');
  });
});
