import { describe, it, expect } from 'vitest';
import { avgCloudDuring, Forecast, forecastUrl, parseForecast } from './weather';
import { DateTime, Interval } from 'luxon';

// ── Fixture: four hourly readings, midnight–3am, cloud 10/20/30/40 ──
// One fixture, many windows: the function's behavior space is "which
// readings does the interval catch," so we vary the window, not the data.
export const fixtureHours = [
  { time: DateTime.fromISO('2026-01-15T00:00', { zone: 'America/Toronto' }), cloudCover: 10 },
  { time: DateTime.fromISO('2026-01-15T01:00', { zone: 'America/Toronto' }), cloudCover: 20 },
  { time: DateTime.fromISO('2026-01-15T02:00', { zone: 'America/Toronto' }), cloudCover: 30 },
  { time: DateTime.fromISO('2026-01-15T03:00', { zone: 'America/Toronto' }), cloudCover: 40 },
];

const fixtureForecast: Forecast = {
  siteId: 'test', // no real site involved — that's the point of a fixture
  savedAt: DateTime.fromISO('2026-01-15T00:00', { zone: 'America/Toronto' }),
  hours: fixtureHours,
};

// Helper: windows on the fixture's date without repeating the ISO boilerplate
const win = (startISO: string, endISO: string) =>
  Interval.fromDateTimes(
    DateTime.fromISO(startISO, { zone: 'America/Toronto' }),
    DateTime.fromISO(endISO, { zone: 'America/Toronto' }),
  );

describe('avgCloudDuring', () => {
  it('averages exactly over a fully-spanned window', () => {
    const result = avgCloudDuring(fixtureForecast, win('2026-01-15T00:00', '2026-01-15T04:00'));
    if (!result.available) throw new Error('expected available result');
    expect(result.avgCloud).toBe(25); // (10+20+30+40)/4
    expect(result.coverage).toBe(1); // 4 samples / 4.0 hours
  });

  it('averages only the readings the window catches', () => {
    // 01:30 → 03:30 catches 02:00 and 03:00 only (half-open [start, end))
    const result = avgCloudDuring(fixtureForecast, win('2026-01-15T01:30', '2026-01-15T03:30'));
    if (!result.available) throw new Error('expected available result');
    expect(result.avgCloud).toBe(35); // (30+40)/2
    expect(result.coverage).toBe(1); // 2 samples / 2.0 hours
  });

  it('reports partial coverage when the window outruns the data (night-7 shape)', () => {
    // 00:00 → 08:00 catches all 4 readings of an 8-hour window
    const result = avgCloudDuring(fixtureForecast, win('2026-01-15T00:00', '2026-01-15T08:00'));
    if (!result.available) throw new Error('expected available result');
    expect(result.avgCloud).toBe(25); // same 4 readings
    expect(result.coverage).toBe(0.5); // 4 samples / 8.0 hours
  });

  it('returns unavailable when the window misses all data', () => {
    const result = avgCloudDuring(fixtureForecast, win('1999-06-01T00:00', '1999-06-01T04:00'));
    expect(result.available).toBe(false); // branch IS the assertion — no guard
  });

  it('returns unavailable for a forecast with no hours', () => {
    const empty: Forecast = { ...fixtureForecast, hours: [] };
    const result = avgCloudDuring(empty, win('2026-01-15T00:00', '2026-01-15T04:00'));
    expect(result.available).toBe(false);
  });
});

describe('forecastUrl', () => {
  it('encodes the site coordinates and the 8-day hourly cloud request', () => {
    const site = {
      id: 't',
      coordinates: { lat: 45.6621, lng: -81.9679 },
      timezone: 'America/Toronto',
    };
    expect(forecastUrl(site)).toBe(
      'https://api.open-meteo.com/v1/forecast?latitude=45.6621&longitude=-81.9679&hourly=cloud_cover&forecast_days=8',
    );
  });
});

describe('parseForecast', () => {
  it('zones each UTC reading to the site timezone and carries savedAt through', () => {
    const site = { id: 't', coordinates: { lat: 0, lng: 0 }, timezone: 'America/Toronto' };
    const savedAt = DateTime.fromMillis(Date.UTC(2026, 0, 15, 6), { zone: 'utc' });
    // 05:00Z on Jan 15 = midnight EST (UTC−5)
    const f = parseForecast(
      site,
      { hourly: { time: ['2026-01-15T05:00', '2026-01-15T06:00'], cloud_cover: [10, 20] } },
      savedAt,
    );
    expect(f.siteId).toBe('t');
    expect(f.savedAt.toMillis()).toBe(savedAt.toMillis());
    expect(f.hours).toHaveLength(2);
    expect(f.hours[0].time.zoneName).toBe('America/Toronto');
    expect(f.hours[0].time.hour).toBe(0);
    expect(f.hours[0].cloudCover).toBe(10);
    expect(f.hours[1].time.hour).toBe(1);
  });
});
