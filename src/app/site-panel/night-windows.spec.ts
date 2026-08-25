import { DateTime, Interval } from 'luxon';
import { tonightWindows } from './night-windows';

// exact-hour UTC fixture: every expected string is derivable by eye
const utc = (day: number, hour: number, minute = 0) =>
  DateTime.fromMillis(Date.UTC(2026, 7, day, hour, minute), { zone: 'utc' });
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

  it('emits no twilight row when dark ends at civil dawn', () => {
    const rows = tonightWindows({ ...night([]), civilDawn: DARK.end });
    expect(rows).toEqual([{ range: '22:00 – 04:00', label: 'Moonless dark', tag: 'BEST' }]);
  });
});
