import { DateTime, Interval } from 'luxon';
import { bestWindow, moonsetText, tonightWindows } from './night-windows';

// exact-hour UTC fixture: every expected string is derivable by eye
const utc = (day: number, hour: number, minute = 0, second = 0) =>
  DateTime.fromMillis(Date.UTC(2026, 7, day, hour, minute, second), { zone: 'utc' });
const seg = (a: DateTime, b: DateTime) => Interval.fromDateTimes(a, b) as Interval<true>;

const DARK = { start: utc(25, 22), end: utc(26, 4) };
const DAWN = utc(26, 5);

const night = (moonDarkSegments: Interval<true>[]) => ({
  darknessWindow: DARK,
  moonDarkSegments,
  civilDawn: DAWN,
  moonIllumination: 43,
});

describe('tonightWindows', () => {
  it('splits the dark window at moonrise and tags each segment honestly', () => {
    const rows = tonightWindows(night([seg(utc(26, 2), DARK.end)]));
    expect(rows).toEqual([
      { range: '22:00 – 02:00', label: 'Moonless dark', tag: 'BEST' },
      { range: '02:00 – 04:00', label: 'Moon up · 43%', tag: 'BRIGHT TARGETS' },
      { range: '04:00 – 05:00', label: 'Astronomical twilight', tag: 'PACK UP' },
    ]);
  });

  it('a moon-free night is one BEST window plus the twilight tail', () => {
    expect(tonightWindows(night([]))).toEqual([
      { range: '22:00 – 04:00', label: 'Moonless dark', tag: 'BEST' },
      { range: '04:00 – 05:00', label: 'Astronomical twilight', tag: 'PACK UP' },
    ]);
  });

  it('a moon up all night yields no BEST window at all — never invent one', () => {
    const rows = tonightWindows(night([seg(DARK.start, DARK.end)]));
    expect(rows).toEqual([
      { range: '22:00 – 04:00', label: 'Moon up · 43%', tag: 'BRIGHT TARGETS' },
      { range: '04:00 – 05:00', label: 'Astronomical twilight', tag: 'PACK UP' },
    ]);
  });

  it('a moonset mid-window puts the BEST dark AFTER the moon segment', () => {
    // the walk must resume from the segment end, not restart from the window start
    const rows = tonightWindows(night([seg(DARK.start, utc(26, 0))]));
    expect(rows).toEqual([
      { range: '22:00 – 00:00', label: 'Moon up · 43%', tag: 'BRIGHT TARGETS' },
      { range: '00:00 – 04:00', label: 'Moonless dark', tag: 'BEST' },
      { range: '04:00 – 05:00', label: 'Astronomical twilight', tag: 'PACK UP' },
    ]);
  });

  it('an interior moon segment yields moonless dark on BOTH sides', () => {
    const rows = tonightWindows(night([seg(utc(26, 0), utc(26, 1))]));
    expect(rows.map((r) => r.range)).toEqual([
      '22:00 – 00:00',
      '00:00 – 01:00',
      '01:00 – 04:00',
      '04:00 – 05:00',
    ]);
    // moon in the middle, BEST on both flanks
    expect(rows.map((r) => r.tag)).toEqual(['BEST', 'BRIGHT TARGETS', 'BEST', 'PACK UP']);
  });

  it('walks out-of-order segments in time order', () => {
    // two moon windows handed over reversed: the walk must still read left to right
    const rows = tonightWindows(night([seg(utc(26, 2), utc(26, 3)), seg(utc(25, 23), utc(26, 0))]));
    expect(rows.map((r) => r.range)).toEqual([
      '22:00 – 23:00',
      '23:00 – 00:00',
      '00:00 – 02:00',
      '02:00 – 03:00',
      '03:00 – 04:00',
      '04:00 – 05:00',
    ]);
    expect(rows.map((r) => r.tag)).toEqual([
      'BEST',
      'BRIGHT TARGETS',
      'BEST',
      'BRIGHT TARGETS',
      'BEST',
      'PACK UP',
    ]);
  });

  it('clips a segment that leaks past the dark window instead of drawing outside it', () => {
    // a civil-axis segment reaching to dawn: only its dark-window portion may render
    const rows = tonightWindows(night([seg(utc(26, 2), DAWN)]));
    expect(rows.map((r) => r.range)).toEqual(['22:00 – 02:00', '02:00 – 04:00', '04:00 – 05:00']);
  });

  it('never prints a row whose two times are identical', () => {
    // seen live at Lake Superior PP: a 30s gap inside one minute rendered '04:53 – 04:53'.
    // Dark runs to 04:00:40, the moon clears at 04:00:10 — both ends print '04:00'.
    const rows = tonightWindows({
      ...night([seg(DARK.start, utc(26, 4, 0, 10))]),
      darknessWindow: { start: DARK.start, end: utc(26, 4, 0, 40) },
    });
    expect(rows).toEqual([
      { range: '22:00 – 04:00', label: 'Moon up · 43%', tag: 'BRIGHT TARGETS' },
      { range: '04:00 – 05:00', label: 'Astronomical twilight', tag: 'PACK UP' },
    ]);
  });

  it('names a sub-floor gap rather than leaving a hole in the timeline', () => {
    // seen live at Kerry: dropping 8 min outright made the list jump 04:22 → 04:30.
    // The row stays and says what it is; only BEST is withheld.
    const rows = tonightWindows(night([seg(DARK.start, utc(26, 3, 52))]));
    expect(rows).toEqual([
      { range: '22:00 – 03:52', label: 'Moon up · 43%', tag: 'BRIGHT TARGETS' },
      { range: '03:52 – 04:00', label: 'Moonless dark', tag: 'TOO SHORT' },
      { range: '04:00 – 05:00', label: 'Astronomical twilight', tag: 'PACK UP' },
    ]);
  });

  it('keeps a moonless gap that reaches the plannable floor', () => {
    // 03:40 – 04:00 is 20 min: short, but long enough to be worth naming
    const rows = tonightWindows(night([seg(DARK.start, utc(26, 3, 40))]));
    expect(rows).toEqual([
      { range: '22:00 – 03:40', label: 'Moon up · 43%', tag: 'BRIGHT TARGETS' },
      { range: '03:40 – 04:00', label: 'Moonless dark', tag: 'BEST' },
      { range: '04:00 – 05:00', label: 'Astronomical twilight', tag: 'PACK UP' },
    ]);
  });

  it('emits no twilight row when dark ends at civil dawn', () => {
    const rows = tonightWindows({ ...night([]), civilDawn: DARK.end });
    expect(rows).toEqual([{ range: '22:00 – 04:00', label: 'Moonless dark', tag: 'BEST' }]);
  });
});

// ISO, not HH:mm — a window on the wrong calendar day would still format correctly
const iso = (w: { start: DateTime; end: DateTime } | null) =>
  w && { start: w.start.toISO(), end: w.end.toISO() };

describe('bestWindow', () => {
  it('is the whole dark window when no moon interrupts it', () => {
    expect(iso(bestWindow(night([])))).toEqual({
      start: utc(25, 22).toISO(),
      end: utc(26, 4).toISO(),
    });
  });

  it('picks the LONGEST moonless stretch, not the first one', () => {
    // moonless: 22:00–23:00 (1h), 00:00–01:00 (1h), 01:30–04:00 (2h30) — the last wins
    const rows = bestWindow(night([seg(utc(25, 23), utc(26, 0)), seg(utc(26, 1), utc(26, 1, 30))]));
    expect(iso(rows)).toEqual({ start: utc(26, 1, 30).toISO(), end: utc(26, 4).toISO() });
  });

  it('breaks a tie toward the earlier stretch — the one you can actually start on', () => {
    // moonless: 22:00–00:00 and 02:00–04:00, both exactly 2h
    const rows = bestWindow(night([seg(utc(26, 0), utc(26, 2))]));
    expect(iso(rows)).toEqual({ start: utc(25, 22).toISO(), end: utc(26, 0).toISO() });
  });

  it('is null when the moon is up all night — never invent a window', () => {
    expect(bestWindow(night([seg(DARK.start, DARK.end)]))).toBeNull();
  });

  it('ignores a gap too short to dark-adapt in — a sliver is not a window', () => {
    // moonless 03:45–04:00 = 15 min, under the 20 min floor
    expect(bestWindow(night([seg(DARK.start, utc(26, 3, 45))]))).toBeNull();
  });

  it('keeps a gap exactly at the floor', () => {
    // moonless 03:40–04:00 = 20 min
    expect(iso(bestWindow(night([seg(DARK.start, utc(26, 3, 40))])))).toEqual({
      start: utc(26, 3, 40).toISO(),
      end: utc(26, 4).toISO(),
    });
  });

  it('never measures past the dark window, however the moon segment lands', () => {
    // a moonrise in the twilight tail: a civil-axis segment that sits ENTIRELY outside the
    // dark window. Unclipped it would stretch the window to 04:30 and sell an extra half hour
    expect(iso(bestWindow(night([seg(utc(26, 4, 30), DAWN)])))).toEqual({
      start: utc(25, 22).toISO(),
      end: utc(26, 4).toISO(),
    });
  });

  it('measures out-of-order segments in time order', () => {
    // handed over reversed: moonless 22:00–23:00, 00:00–02:00 (longest), 03:00–04:00
    const rows = bestWindow(night([seg(utc(26, 2), utc(26, 3)), seg(utc(25, 23), utc(26, 0))]));
    expect(iso(rows)).toEqual({ start: utc(26, 0).toISO(), end: utc(26, 2).toISO() });
  });
});

describe('moonsetText', () => {
  // the strip's axis: civil dusk 21:00 → civil dawn 05:00
  const DUSK = utc(25, 21);
  const axis = (moonSegments: Interval<true>[]) => ({
    moonSegments,
    civilDusk: DUSK,
    civilDawn: DAWN,
  });

  it('names the time the moon drops below the horizon', () => {
    expect(moonsetText(axis([seg(DUSK, utc(26, 1))]))).toBe('01:00');
  });

  it('says the moon never rose rather than printing a blank', () => {
    expect(moonsetText(axis([]))).toBe('Down all night');
  });

  it('distinguishes a moon that owns the whole night from one that merely outlasts it', () => {
    expect(moonsetText(axis([seg(DUSK, DAWN)]))).toBe('Up all night');
    // rises mid-night and is still up at dawn — there is no moonset to name
    expect(moonsetText(axis([seg(utc(26, 2), DAWN)]))).toBe('Up at dawn');
  });

  it('reads the LAST segment, not the first, when the moon sets and rises again', () => {
    expect(moonsetText(axis([seg(DUSK, utc(25, 23)), seg(utc(26, 3), DAWN)]))).toBe('Up at dawn');
    expect(moonsetText(axis([seg(DUSK, utc(25, 23)), seg(utc(26, 3), utc(26, 4))]))).toBe('04:00');
  });
});
