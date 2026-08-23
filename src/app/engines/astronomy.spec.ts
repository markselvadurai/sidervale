import { describe, it, expect } from 'vitest';
import * as SunCalc from 'suncalc';
import { getDarknessWindow, getMoonOverlap, siteToday } from './astronomy';
import { Site } from '../models/site';
import { DateTime, Interval } from 'luxon';

// a minimal test site — only the fields the function uses
const manitoulin: Site = {
  id: 'manitoulin-eco-park',
  name: 'Manitoulin Eco Park',
  description: '',
  coordinates: { lat: 45.6621, lng: -81.9679 },
  nearestTown: { driveDistanceKm: 16, name: 'Manitowaning' },
  timezone: 'America/Toronto',
  bortle: 2,
};
  const augNight = new Date(Date.UTC(2026, 7, 12, 12, 0, 0)); // Aug 12 2026, noon UTC
  const augNight5 = new Date(Date.UTC(2026, 7, 5, 12, 0));
describe('getDarknessWindow', () => {
 
  // ── LAYER 1: property/invariant tests ──
 
  it('returns times in the site timezone', () => {
    const w = getDarknessWindow(manitoulin, augNight);
    if (!w.hasTrueDarkness) throw new Error('expected darkness');
    expect(w.start.zoneName).toBe('America/Toronto');
    expect(w.end.zoneName).toBe('America/Toronto');
    expect(w.dusk.zoneName).toBe('America/Toronto');
    expect(w.dawn.zoneName).toBe('America/Toronto');
  });
 
  it('darkness ends after it starts', () => {
    const w = getDarknessWindow(manitoulin, augNight);
    if (!w.hasTrueDarkness) throw new Error('expected darkness');
    expect(w.end > w.start).toBe(true);
  });
 
  // Civil twilight brackets true darkness: the sun passes −6° before −18°
  // in the evening, and −18° before −6° at dawn. This ordering is the axis
  // contract the Night Strip renders against.
  it('civil twilight brackets the darkness window', () => {
    const w = getDarknessWindow(manitoulin, augNight);
    if (!w.hasTrueDarkness) throw new Error('expected darkness');
    expect(w.dusk < w.start).toBe(true);
    expect(w.end < w.dawn).toBe(true);
  });
 
  it('darkness starts in the evening and ends before dawn', () => {
    const w = getDarknessWindow(manitoulin, augNight);
    if (!w.hasTrueDarkness) throw new Error('expected darkness');
    expect(w.start.hour).toBeGreaterThanOrEqual(21); // after 9pm site time
    expect(w.end.hour).toBeLessThanOrEqual(6);       // before 6am site time
  });
 
  // ── LAYER 2: accuracy against independent sources ──
 
  it('matches known astronomical twilight times for Manitoulin', () => {
    const w = getDarknessWindow(manitoulin, augNight5);
    if (!w.hasTrueDarkness) throw new Error('expected darkness');
 
    // From dqydj astronomical twilight calc for 45.6621,-81.9679 on Aug 5:
    //   night begins (PM astronomical band ENDS): ~10:58 PM
    //   night ends   (AM astronomical band STARTS): ~4:12 AM
    // Assert within a few minutes to absorb differing constants between tools.
    const expectedStart = DateTime.fromISO('2026-08-05T22:58', { zone: 'America/Toronto' });
    const expectedEnd = DateTime.fromISO('2026-08-06T04:14', { zone: 'America/Toronto' });
 
    expect(Math.abs(w.start.diff(expectedStart, 'minutes').minutes)).toBeLessThanOrEqual(5);
    expect(Math.abs(w.end.diff(expectedEnd, 'minutes').minutes)).toBeLessThanOrEqual(5);
  });
 
  // ── No-true-darkness branch ──
 
  it('reports no true darkness at high latitude in the summer', () => {
    const arcticSite: Site = { ...manitoulin, coordinates: { lat: 69, lng: 18 }, timezone: 'Europe/Oslo' };
    const midsummer = new Date(Date.UTC(2026, 5, 21, 12, 0));
    const w = getDarknessWindow(arcticSite, midsummer);
    expect(w.hasTrueDarkness).toBe(false);
    expect(w.start).toBeNull();
    expect(w.end).toBeNull();
    // At 69°N midsummer the sun never reaches −6° either — the current
    // all-or-nothing branch nulls the civil pair along with the astro pair.
    expect(w.dusk).toBeNull();
    expect(w.dawn).toBeNull();
  });

  // ── LAYER 3: regression — the UTC day-seam ──

  // Date.UTC, not a local-time constructor: that means a different instant per
  // machine and would pass on a UTC runner while the bug was live.

  it('resolves the same night from any time of day', () => {
    const noon = new Date(Date.UTC(2026, 7, 22, 16, 0)); // 12:00 EDT Aug 22
    const evening = new Date(Date.UTC(2026, 7, 23, 1, 0)); // 21:00 EDT Aug 22

    const fromNoon = getDarknessWindow(manitoulin, noon);
    const fromEvening = getDarknessWindow(manitoulin, evening);
    if (!fromNoon.hasTrueDarkness || !fromEvening.hasTrueDarkness) {
      throw new Error('expected darkness');
    }

    expect(fromEvening.start.toISO()).toBe(fromNoon.start.toISO());
    expect(fromEvening.dawn.toISO()).toBe(fromNoon.dawn.toISO());
  });

  // Consistency alone would pass with both answers wrong, so pin the real night.
  it('names the night that begins on the given local date', () => {
    const evening = new Date(Date.UTC(2026, 7, 23, 1, 0)); // 21:00 EDT Aug 22
    const w = getDarknessWindow(manitoulin, evening);
    if (!w.hasTrueDarkness) throw new Error('expected darkness');

    expect(w.start.toISODate()).toBe('2026-08-22');
    expect(w.end.toISODate()).toBe('2026-08-23');
  });

  // Toronto springs forward 2027-03-14. Guards the seam on a transition day; it
  // does not discriminate days:1 from hours:24 (mutation-checked, both pass).
  it('resolves the correct night on a DST transition day', () => {
    const evening = new Date(Date.UTC(2027, 2, 15, 1, 0)); // 21:00 EDT Mar 14
    const w = getDarknessWindow(manitoulin, evening);
    if (!w.hasTrueDarkness) throw new Error('expected darkness');

    expect(w.start.toISODate()).toBe('2027-03-14');
    expect(w.end.toISODate()).toBe('2027-03-15');
  });
});

/** Author a window on a given night, in the site's zone. */
const nightWindow = (isoStart: string, isoEnd: string) =>
  Interval.fromDateTimes(
    DateTime.fromISO(isoStart, { zone: manitoulin.timezone }) as DateTime<true>,
    DateTime.fromISO(isoEnd, { zone: manitoulin.timezone }) as DateTime<true>
  ) as Interval<true>;
 
// Six windows across a lunar month — same spread as before, but the bounds are
// ours, not the darkness engine's. Roughly plausible summer dark windows.
const testWindows = [
  nightWindow('2026-08-05T22:45', '2026-08-06T04:15'),
  nightWindow('2026-08-09T22:50', '2026-08-10T04:10'),
  nightWindow('2026-08-12T22:55', '2026-08-13T04:05'),
  nightWindow('2026-08-19T23:05', '2026-08-20T03:55'),
  nightWindow('2026-08-24T23:15', '2026-08-25T03:45'),
  nightWindow('2026-08-31T23:25', '2026-09-01T03:35'),
];

describe('getMoonOverlap', () => {
 
  // ── LAYER 1: invariants — hold for ANY window ──
 
  it.each(testWindows)('overlapFraction is a valid fraction for %s', (window) => {
    const w = getMoonOverlap(manitoulin, window);
    expect(w.overlapFraction).toBeGreaterThanOrEqual(0);
    expect(w.overlapFraction).toBeLessThanOrEqual(1);
  });
 
  it.each(testWindows)('overlapMinutes stays within the window for %s', (window) => {
    const w = getMoonOverlap(manitoulin, window);
    expect(w.overlapMinutes).toBeGreaterThanOrEqual(0);
    expect(w.overlapMinutes).toBeLessThanOrEqual(window.length('minutes'));
  });
 
  it.each(testWindows)('illuminationFraction is a valid fraction for %s', (window) => {
    const w = getMoonOverlap(manitoulin, window);
    expect(w.illuminationFraction).toBeGreaterThanOrEqual(0);
    expect(w.illuminationFraction).toBeLessThanOrEqual(1);
  });
 
  it.each(testWindows)('minutes and fraction agree for %s', (window) => {
    const w = getMoonOverlap(manitoulin, window);
    expect(w.overlapMinutes).toBeCloseTo(w.overlapFraction * window.length('minutes'), 5);
  });
 
  // ── Decoupling proof: nothing about this window is astronomical ──
 
  it('works on an arbitrary window that is not a darkness window', () => {
    const w = getMoonOverlap(manitoulin, nightWindow('2026-08-12T13:00', '2026-08-12T19:00'));
    expect(w.overlapFraction).toBeGreaterThanOrEqual(0);
    expect(w.overlapFraction).toBeLessThanOrEqual(1);
    expect(w.overlapMinutes).toBeCloseTo(w.overlapFraction * 360, 5); // 6h window
  });
 
  // ── LAYER 2: precision, against independent sources ──
 
  it('matches known moon overlap for Manitoulin, Apr 13 2027', () => {
    // Darkness window 22:00 → 03:41(+1) per dqydj; bounds hardcoded so this
    // test does not depend on the darkness engine.
    // Moonrise 11:37am day N, moonset 03:41am day N+1 (timeanddate.com).
    // Moon is already up at window open and sets at 03:41 → 22:00→03:41 = 341 min.
    const window = nightWindow('2027-04-13T22:00', '2027-04-14T04:57');
    const w = getMoonOverlap(manitoulin, window);
    expect(Math.abs(w.overlapMinutes - 341)).toBeLessThanOrEqual(5);
  });

  // ── LAYER 3: the initial-state probe ──

  // A probe at +0.133° disagrees with suncalc's own rise/set (≈ −0.35°) across a
  // ~0.48° band, inverting the parity of the whole walk.
  it('counts a moon that has already risen at window start', () => {
    // Moonrise ~21:58 EDT; at 22:00 the centre is −0.07° but the limb is up.
    // No rise/set falls inside the window, so the result rests on the probe.
    const w = getMoonOverlap(manitoulin, nightWindow('2026-07-31T22:00', '2026-08-01T01:00'));
    expect(w.overlapFraction).toBeCloseTo(1);
    expect(w.overlapMinutes).toBeCloseTo(180);
  });

  // Pins the probe to suncalc's own rise/set rather than to a magic number: 30s
  // after moonrise the centre is still 0.26° down but the limb is up, so this
  // offset also discriminates the semidiameter and refraction terms.
  it('agrees with suncalc rise/set moments after moonrise', () => {
    const times = SunCalc.getMoonTimes(
      new Date(Date.UTC(2026, 7, 1, 12, 0)),
      manitoulin.coordinates.lat,
      manitoulin.coordinates.lng,
    );
    if (!times.rise) throw new Error('expected a moonrise');

    const start = DateTime.fromJSDate(times.rise, { zone: manitoulin.timezone }).plus({
      seconds: 30,
    }) as DateTime<true>;
    const w = Interval.fromDateTimes(start, start.plus({ hours: 2 })) as Interval<true>;

    expect(getMoonOverlap(manitoulin, w).overlapFraction).toBeCloseTo(1);
  });

  // segments is what the Night Strip renders; nothing else asserts it.
  it('emits one segment spanning a window the moon is up for throughout', () => {
    const window = nightWindow('2026-07-31T22:00', '2026-08-01T01:00');
    const w = getMoonOverlap(manitoulin, window);
    expect(w.segments).toHaveLength(1);
    expect(w.segments[0].start.toISO()).toBe(window.start.toISO());
    expect(w.segments[0].end.toISO()).toBe(window.end.toISO());
  });
});

describe('siteToday', () => {

  it('resolves the site calendar day, not the caller clock', () => {
    // 03:00 UTC on Aug 22 is still Aug 21 in Toronto — 23:00 EDT, mid-session.
    const now = DateTime.fromISO('2026-08-22T03:00', { zone: 'utc' }) as DateTime<true>;
    expect(siteToday(manitoulin, now).toISODate()).toBe('2026-08-21');
    expect(siteToday(manitoulin, now).hour).toBe(12);
  });

  // The week row is built from this, so a reader in Tokyo must get the same
  // seven Ontario nights as a reader in Toronto.
  it.each(['UTC', 'Asia/Tokyo', 'Pacific/Auckland', 'America/Vancouver'])(
    'gives the same site day when called from %s',
    (callerZone) => {
      const now = DateTime.fromISO('2026-08-22T16:00Z', { zone: callerZone }) as DateTime<true>;
      expect(siteToday(manitoulin, now).toISODate()).toBe('2026-08-22');
    },
  );
});
