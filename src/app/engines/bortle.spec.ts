import { bortleFor } from './bortle';

// Expected classes below are read off the two published tables the engine names, by hand:
//   A (Wikipedia / Dark Skies Awareness): 21.76 | 21.6 | 21.3 | 20.3 | 19.25 | 18.5 | 18 | 17
//   B (widely-republished variant):       21.7  | 21.5 | 21.3 | 20.4 | 19.1  | 18.5 | 18 | 17
// A value between two tables' boundaries is genuinely ambiguous, and must say so.

describe('bortleFor', () => {
  // ── LAYER 1: where the sources agree, one class ──

  it('calls a pristine sky class 1', () => {
    // 21.99 is above both tables' class-1 floor (21.76 and 21.7)
    expect(bortleFor(21.99)).toEqual({ low: 1, high: 1, label: 'Excellent dark-sky site' });
  });

  it('reads the darkest value the atlas can produce', () => {
    // the Lorenz atlas pins a natural sky at exactly 22.0 — nothing is darker
    expect(bortleFor(22.0)).toMatchObject({ low: 1, high: 1 });
  });

  it('calls a mid-rural sky class 3, which both tables floor at 21.3', () => {
    expect(bortleFor(21.4)).toEqual({ low: 3, high: 3, label: 'Rural sky' });
  });

  it('classes a bright suburban sky the same way in both tables', () => {
    expect(bortleFor(18.7)).toEqual({ low: 6, high: 6, label: 'Bright suburban sky' });
  });

  // ── LAYER 2: where the sources disagree, a range ──

  it.each([
    [21.73, 1, 2], // above B's 21.7, below A's 21.76
    [21.55, 2, 3], // above B's 21.5, below A's 21.6
    [20.35, 4, 5], // above A's 20.3, below B's 20.4
    [19.2, 5, 6], // above B's 19.1, below A's 19.25
  ])('reports %s as an honest %i–%i, because the tables disagree there', (mpsas, low, high) => {
    expect(bortleFor(mpsas)).toMatchObject({ low, high });
  });

  it('labels the ambiguous reading with the WORSE sky of the pair', () => {
    // never promise the darker of two skies we cannot tell apart
    expect(bortleFor(21.73).label).toBe('Typical truly dark site');
  });

  // ── LAYER 3: the scale never inverts ──

  it('never gives a brighter sky a darker class, across the whole atlas range', () => {
    // walk 18.00 → 22.00 in hundredths: class must be non-increasing as sky darkens
    const classes: number[] = [];
    for (let m = 1800; m <= 2200; m++) classes.push(bortleFor(m / 100).low);
    for (let i = 1; i < classes.length; i++) {
      expect(classes[i]).toBeLessThanOrEqual(classes[i - 1]);
    }
    expect(classes[0]).toBe(7);
    expect(classes.at(-1)).toBe(1);
  });

  it('stays total past both ends of the real data', () => {
    expect(bortleFor(30)).toMatchObject({ low: 1, high: 1 });
    expect(bortleFor(5)).toMatchObject({ low: 9, high: 9, label: 'Inner-city sky' });
  });

  // ── LAYER 4: a missing brightness is a dataset defect, not a class ──

  it('throws on a non-finite reading rather than inventing a sky', () => {
    expect(() => bortleFor(NaN)).toThrow(/mpsas/i);
  });
});
