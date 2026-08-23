import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DateTime, Interval } from 'luxon';

import { NightStrip } from './night-strip';
import { ScoredNight } from '../services/sites';

// ── Fixtures ──
// Percentages below are derived by hand from these times, not read off the code.

const ZONE = 'America/Toronto';
const t = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }) as DateTime<true>;

/** A night whose civil axis is exactly 8h, so every percentage is a clean eighth. */
const nightWith = (opts: {
  dusk: string;
  dawn: string;
  darkStart: string;
  darkEnd: string;
  moon?: [string, string][];
  clouds?: { at: string; cover: number }[];
}): ScoredNight => ({
  hasTrueDarkness: true,
  civilDusk: t(opts.dusk),
  civilDawn: t(opts.dawn),
  darknessWindow: { start: t(opts.darkStart), end: t(opts.darkEnd) },
  moonSegments: (opts.moon ?? []).map(
    ([a, b]) => Interval.fromDateTimes(t(a), t(b)) as Interval<true>,
  ),
  cloudHours: (opts.clouds ?? []).map((c) => ({ time: t(c.at), cloudCover: c.cover })),
  // Required by ScoredNight, never read by this component:
  darkDuration: '6h 0m',
  moonIllumination: 42,
  moonOverlapDisplay: '2h 0m',
  score: 71,
  tier: 'clear',
  cloudDataAvailable: true,
  cloudAvg: 80,
});

/** Civil 21:00 → 05:00 (480 min). Dark 22:00 → 04:00, i.e. 1/8 in and 7/8 along. */
const roomyNight = nightWith({
  dusk: '2026-08-22T21:00',
  dawn: '2026-08-23T05:00',
  darkStart: '2026-08-22T22:00',
  darkEnd: '2026-08-23T04:00',
  moon: [['2026-08-22T23:00', '2026-08-23T01:00']],
  clouds: [{ at: '2026-08-22T23:00', cover: 80 }],
});

describe('NightStrip', () => {
  let component: NightStrip;
  let fixture: ComponentFixture<NightStrip>;

  /** Required input must be set BEFORE the first change detection, or NG0950. */
  async function render(night: ScoredNight) {
    fixture = TestBed.createComponent(NightStrip);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('night', night);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [NightStrip] }).compileComponents();
    await render(roomyNight);
  });

  // ── LAYER 1: the axis contract ──

  it('spans civil dusk to civil dawn, not the darkness window', async () => {
    // Guards decision-log #4: the axis is the civil window, not the dark one.
    expect(component.duskPercent()).toBe(0);
    expect(component.dawnPercent()).toBe(100);
  });

  it('places the true-dark span at its share of the civil axis', () => {
    // 22:00 is 60 min into a 480 min axis = 12.5%; 04:00 is 420 min in = 87.5%.
    expect(component.darkStartPercent()).toBeCloseTo(12.5);
    expect(component.darkEndPercent()).toBeCloseTo(87.5);
  });

  // ── LAYER 2: moon bands ──

  it('maps each moon segment to its own left/width', async () => {
    // 23:00–01:00 → 25%–50%; 02:00–03:00 → 62.5%–75%.
    await render(
      nightWith({
        dusk: '2026-08-22T21:00',
        dawn: '2026-08-23T05:00',
        darkStart: '2026-08-22T22:00',
        darkEnd: '2026-08-23T04:00',
        moon: [
          ['2026-08-22T23:00', '2026-08-23T01:00'],
          ['2026-08-23T02:00', '2026-08-23T03:00'],
        ],
      }),
    );

    const bands = component.moonBands();
    expect(bands).toHaveLength(2);
    expect(bands[0].left).toBeCloseTo(25);
    expect(bands[0].width).toBeCloseTo(25);
    expect(bands[1].left).toBeCloseTo(62.5);
    expect(bands[1].width).toBeCloseTo(12.5);
  });

  it('renders no bands when the moon is out of the way', async () => {
    await render(
      nightWith({
        dusk: '2026-08-22T21:00',
        dawn: '2026-08-23T05:00',
        darkStart: '2026-08-22T22:00',
        darkEnd: '2026-08-23T04:00',
        moon: [],
      }),
    );
    expect(component.moonBands()).toEqual([]);
  });

  // ── LAYER 3: cloud cells ──

  it('sizes a cloud cell as one hour of the axis', () => {
    // 60 min of a 480 min axis = 12.5%, positioned at 23:00 = 120 min in = 25%.
    const cells = component.cloudCells();
    expect(cells).toHaveLength(1);
    expect(cells[0].width).toBeCloseTo(12.5);
    expect(cells[0].left).toBeCloseTo(25);
    expect(cells[0].cover).toBe(80);
  });

  it('drops hours below the render threshold and keeps the boundary value', async () => {
    // CLOUD_RENDER_THRESHOLD is 15 and the filter is `>=`, so 14 goes and 15 stays.
    await render(
      nightWith({
        dusk: '2026-08-22T21:00',
        dawn: '2026-08-23T05:00',
        darkStart: '2026-08-22T22:00',
        darkEnd: '2026-08-23T04:00',
        clouds: [
          { at: '2026-08-22T22:00', cover: 14 },
          { at: '2026-08-22T23:00', cover: 15 },
          { at: '2026-08-23T00:00', cover: 90 },
        ],
      }),
    );
    expect(component.cloudCells().map((c) => c.cover)).toEqual([15, 90]);
  });

  it.each([
    [15, 'cloud--light'],
    [44, 'cloud--light'],
    [45, 'cloud--mid'],
    [74, 'cloud--mid'],
    [75, 'cloud--heavy'],
    [100, 'cloud--heavy'],
  ])('classes cover %i as %s', (cover, expected) => {
    // Boundaries asserted on both sides — the thresholds are `>=`.
    expect(component.cloudClass(cover)).toBe(expected);
  });

  // ── LAYER 4: label collision suppression ──

  it('shows both edge labels when the darkness window leaves room', () => {
    // darkStart 12.5% > 10 and darkEnd 87.5% < 90, so neither label collides.
    expect(component.showDuskLabel()).toBe(true);
    expect(component.showDawnLabel()).toBe(true);
  });

  it('hides an edge label when the darkness window crowds it', async () => {
    // Dark 21:30–04:30 → 6.25% and 93.75%: both edges are inside the guard bands.
    await render(
      nightWith({
        dusk: '2026-08-22T21:00',
        dawn: '2026-08-23T05:00',
        darkStart: '2026-08-22T21:30',
        darkEnd: '2026-08-23T04:30',
      }),
    );
    expect(component.showDuskLabel()).toBe(false);
    expect(component.showDawnLabel()).toBe(false);
  });

  // ── LAYER 5: gradient stops stay ordered ──

  it('emits gradient stops in ascending order', () => {
    // Out-of-order stops render as hard bands; assert ordering, not the string.
    const stops = [...component.gradient().matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
    expect(stops).toHaveLength(6);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]).toBeGreaterThanOrEqual(stops[i - 1]);
    }
  });
});
