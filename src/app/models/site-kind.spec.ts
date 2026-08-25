import { Designation } from './site';
import { siteKind } from './site-kind';

const d = (type: string, authority: Designation['authority'] = 'darksky'): Designation => ({
  authority,
  type,
  year: null,
});

describe('siteKind', () => {
  it('treats parks, reserves, sanctuaries and preserves as destinations', () => {
    expect(siteKind({ designations: [d('international-dark-sky-park')] })).toBe('destination');
    expect(siteKind({ designations: [d('international-dark-sky-reserve')] })).toBe('destination');
    expect(siteKind({ designations: [d('international-dark-sky-sanctuary')] })).toBe('destination');
    expect(siteKind({ designations: [d('dark-sky-preserve', 'rasc')] })).toBe('destination');
  });

  it('treats certified municipalities as communities — places people live, not drive to', () => {
    expect(siteKind({ designations: [d('international-dark-sky-community')] })).toBe('community');
    expect(siteKind({ designations: [d('community')] })).toBe('community');
    expect(siteKind({ designations: [d('urban-night-sky-place')] })).toBe('community');
    expect(siteKind({ designations: [d('urban-star-park', 'rasc')] })).toBe('community');
  });

  it('keeps a site that is BOTH a park and a municipality as a destination', () => {
    // Weissbach is the one dual case in the dataset: it really is a nature park, so an
    // "any urban designation wins" rule would wrongly demote it
    expect(
      siteKind({ designations: [d('international-dark-sky-community'), d('nature-park')] }),
    ).toBe('destination');
  });

  it('defaults an unrecognised or missing designation to destination', () => {
    // the dataset carries one rasc:other; never hide a site because we failed to classify it
    expect(siteKind({ designations: [d('other', 'rasc')] })).toBe('destination');
    expect(siteKind({ designations: [] })).toBe('destination');
  });
});
