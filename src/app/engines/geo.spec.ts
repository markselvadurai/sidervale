import { distanceKm } from './geo';

// derived independently: R=6371 km → one degree of a great circle = 2π·6371/360 = 111.19 km
const TORONTO = { lat: 43.6532, lng: -79.3832 };

describe('distanceKm', () => {
  it('measures one degree of latitude as 111.19 km', () => {
    expect(distanceKm(TORONTO, { lat: 44.6532, lng: -79.3832 })).toBeCloseTo(111.19, 1);
  });

  it('measures one degree of longitude at the equator as 111.19 km', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.19, 1);
  });

  it('shrinks a longitude degree by cos(latitude) away from the equator', () => {
    // at 60°N a longitude degree spans half its equatorial width
    expect(distanceKm({ lat: 60, lng: 0 }, { lat: 60, lng: 1 })).toBeCloseTo(111.19 / 2, 0);
  });

  it('matches a named external fix: Toronto to Ottawa is ~352 km', () => {
    // greatcirclemapper-style published figure for YYZ-area to Ottawa centre
    expect(distanceKm(TORONTO, { lat: 45.4215, lng: -75.6972 })).toBeCloseTo(352, -1);
  });

  it('is symmetric and zero on itself', () => {
    const ottawa = { lat: 45.4215, lng: -75.6972 };
    expect(distanceKm(TORONTO, ottawa)).toBeCloseTo(distanceKm(ottawa, TORONTO), 6);
    expect(distanceKm(TORONTO, TORONTO)).toBe(0);
  });
});
