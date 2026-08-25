import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { SiteCore } from './site';
import { observingNightOf, noonOf, plusNights } from './observing-night';

function makeSite(overrides: Partial<SiteCore> & Pick<SiteCore, 'id' | 'timezone'>): SiteCore {
  return {
    coordinates: { lat: 43.65, lng: -79.38 },
    ...overrides,
  };
}

// UTC−4 in August (EDT), UTC−5 in January (EST)
const toronto = makeSite({ id: 'toronto-test', timezone: 'America/Toronto' });
// UTC+14 year-round — the far side of every day seam
const kiritimati = makeSite({
  id: 'kiritimati-test',
  timezone: 'Pacific/Kiritimati',
  coordinates: { lat: 1.87, lng: -157.43 },
});

function utcInstant(y: number, monthIndex: number, d: number, h: number, min = 0): DateTime {
  return DateTime.fromMillis(Date.UTC(y, monthIndex, d, h, min), { zone: 'utc' });
}

describe('observingNightOf', () => {
  // ── LAYER 1: the day seam the type exists to kill ──

  it('names the night by the site-local day, not the UTC day', () => {
    // 2026-08-23T02:30Z − 4h = 22:30 on Aug 22 in Toronto
    const night = observingNightOf(toronto, utcInstant(2026, 7, 23, 2, 30));
    expect(night).toEqual({ siteId: 'toronto-test', localDate: '2026-08-22' });
  });

  it('gives two sites different nights for the same instant', () => {
    // Same instant: 02:30Z. Kiritimati (+14) → 16:30 on Aug 23; Toronto (−4) → 22:30 on Aug 22.
    const at = utcInstant(2026, 7, 23, 2, 30);
    expect(observingNightOf(kiritimati, at).localDate).toBe('2026-08-23');
    expect(observingNightOf(toronto, at).localDate).toBe('2026-08-22');
  });

  it('names the night in progress before dawn: 03:30 local belongs to yesterday evening', () => {
    // 2026-08-23T07:30Z − 4h = 03:30 on Aug 23 in Toronto — inside the night that began Aug 22
    const night = observingNightOf(toronto, utcInstant(2026, 7, 23, 7, 30));
    expect(night.localDate).toBe('2026-08-22');
  });

  it('rolls over at site-local noon, like the astronomical Julian day', () => {
    // 15:59Z − 4h = 11:59 local → still yesterday's night; 16:00Z = 12:00 local → tonight's
    expect(observingNightOf(toronto, utcInstant(2026, 7, 23, 15, 59)).localDate).toBe('2026-08-22');
    expect(observingNightOf(toronto, utcInstant(2026, 7, 23, 16, 0)).localDate).toBe('2026-08-23');
  });
});

describe('noonOf', () => {
  // ── LAYER 1: anchor arithmetic, derived by hand from the UTC offset ──

  it('resolves to noon in the site zone (EDT: 12:00 −4 = 16:00Z)', () => {
    const noon = noonOf(toronto, { siteId: 'toronto-test', localDate: '2026-08-22' });
    expect(noon.toUTC().toISO()).toBe('2026-08-22T16:00:00.000Z');
  });

  it('tracks the winter offset (EST: 12:00 −5 = 17:00Z)', () => {
    const noon = noonOf(toronto, { siteId: 'toronto-test', localDate: '2026-01-15' });
    expect(noon.toUTC().toISO()).toBe('2026-01-15T17:00:00.000Z');
  });

  it('lands on the previous UTC day east of the date line (+14: 12:00 −14 = 22:00Z yesterday)', () => {
    const noon = noonOf(kiritimati, { siteId: 'kiritimati-test', localDate: '2026-08-23' });
    expect(noon.toUTC().toISO()).toBe('2026-08-22T22:00:00.000Z');
  });

  // ── LAYER 2: invariants ──

  it('round-trips: the night of its own noon is itself', () => {
    for (const [site, localDate] of [
      [toronto, '2026-08-22'],
      [kiritimati, '2026-12-13'],
    ] as const) {
      const night = { siteId: site.id, localDate };
      expect(observingNightOf(site, noonOf(site, night))).toEqual(night);
    }
  });

  it('throws when the night belongs to a different site', () => {
    expect(() => noonOf(toronto, { siteId: 'kiritimati-test', localDate: '2026-08-22' })).toThrow(
      /site/i,
    );
  });

  it('throws on a malformed or impossible local date', () => {
    for (const localDate of ['2026-8-3', '2026-02-30', 'tonight', '2026-08-22T23:00']) {
      expect(() => noonOf(toronto, { siteId: 'toronto-test', localDate })).toThrow(/localDate/);
    }
  });
});

describe('plusNights', () => {
  it('crosses a month boundary: Aug 30 + 3 = Sep 2', () => {
    expect(plusNights({ siteId: 's', localDate: '2026-08-30' }, 3)).toEqual({
      siteId: 's',
      localDate: '2026-09-02',
    });
  });

  it('steps backward: Dec 13 − 1 = Dec 12', () => {
    expect(plusNights({ siteId: 's', localDate: '2026-12-13' }, -1).localDate).toBe('2026-12-12');
  });

  it('respects leap years: Feb 28 2028 + 1 = Feb 29', () => {
    expect(plusNights({ siteId: 's', localDate: '2028-02-28' }, 1).localDate).toBe('2028-02-29');
  });

  it('throws on a malformed localDate', () => {
    expect(() => plusNights({ siteId: 's', localDate: 'tonight' }, 1)).toThrow(/localDate/);
  });
});

describe('observingNightOf on DST transition days', () => {
  // The noon rule is a wall-clock rule: exact-time minus-12h would roll over at
  // 11:00 on a 25-hour day and 13:00 on a 23-hour day.
  const iqaluit = makeSite({ id: 'iqaluit-test', timezone: 'America/Iqaluit' });

  it('11:30 local on a fall-back morning is still yesterday night', () => {
    // 2026-11-01T16:30Z = 11:30 EST after the clocks fell back — before noon
    const night = observingNightOf(iqaluit, utcInstant(2026, 10, 1, 16, 30));
    expect(night.localDate).toBe('2026-10-31');
  });

  it('12:30 local on a spring-forward day is already tonight', () => {
    // 2027-03-14T16:30Z = 12:30 EDT on the 23-hour day — past noon
    const night = observingNightOf(toronto, utcInstant(2027, 2, 14, 16, 30));
    expect(night.localDate).toBe('2027-03-14');
  });
});
