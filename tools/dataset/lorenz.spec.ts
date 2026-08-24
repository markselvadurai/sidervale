import { describe, expect, it } from 'vitest';
import { compressedToRatio, ratioToMpsas, ratioToZone, sampleTile, tileAddressFor } from './lorenz';

// Encode a 600×600 grid per Lorenz's scheme: bytes 0,1 are the first value as
// 128*b0 + b1; every later byte is a delta — column 1 of each row against the row
// below, other columns against their left neighbour. Built from the format spec,
// so the sampler under test must invert it.
function encodeTile(valueAt: (ix: number, iy: number) => number): Int8Array {
  const data = new Int8Array(600 * 600 + 1);
  const first = valueAt(1, 1);
  data[0] = Math.floor(first / 128);
  data[1] = first - 128 * data[0];
  for (let row = 1; row < 600; row++) {
    data[600 * row + 1] = valueAt(1, row + 1) - valueAt(1, row);
  }
  for (let row = 0; row < 600; row++) {
    for (let col = 1; col < 600; col++) {
      data[600 * row + 1 + col] = valueAt(col + 1, row + 1) - valueAt(col, row + 1);
    }
  }
  return data;
}

describe('tileAddressFor', () => {
  it('locates Toronto by hand-derived arithmetic', () => {
    // lonFromDateLine = −79.38+180 = 100.62 → tilex 21; lat+65 = 108.65 → tiley 22
    // ix = round(120·(0.62 + 1/240)) = 75; iy = round(120·(3.65 + 1/240)) = 439
    expect(tileAddressFor(43.65, -79.38)).toEqual({ tilex: 21, tiley: 22, ix: 75, iy: 439 });
  });

  it('returns null outside the atlas band (lat −65..75)', () => {
    expect(tileAddressFor(80, 0)).toBeNull();
    expect(tileAddressFor(-70, 0)).toBeNull();
  });
});

describe('sampleTile', () => {
  it('inverts the delta encoding at arbitrary grid points', () => {
    // small deltas so every one fits an int8: value = ix + 2·iy − 3
    const tile = encodeTile((ix, iy) => ix + 2 * iy - 3);
    expect(sampleTile(tile, 1, 1)).toBe(0);
    expect(sampleTile(tile, 75, 439)).toBe(75 + 2 * 439 - 3);
    expect(sampleTile(tile, 600, 600)).toBe(600 + 2 * 600 - 3);
    expect(sampleTile(tile, 600, 1)).toBe(599);
  });
});

describe('brightness conversions', () => {
  it('compressedToRatio matches Lorenz constants: 0 → 0, and his exponential form', () => {
    expect(compressedToRatio(0)).toBe(0);
    // (5/195)·(e^(0.0195·100) − 1) = 0.0256410…·(e^1.95 − 1) = 0.15426…
    expect(compressedToRatio(100)).toBeCloseTo((5 / 195) * (Math.exp(1.95) - 1), 10);
  });

  it('ratioToMpsas: pristine sky is 22.0; ratio 99 is exactly 5 magnitudes brighter', () => {
    expect(ratioToMpsas(0)).toBe(22.0);
    // 22 − 5·log100(1+99) = 22 − 5 = 17
    expect(ratioToMpsas(99)).toBeCloseTo(17.0, 10);
  });

  it('ratioToZone follows his thresholds, exclusive upper bounds', () => {
    expect(ratioToZone(0.005)).toBe('0');
    expect(ratioToZone(0.05)).toBe('1a');
    expect(ratioToZone(0.33)).toBe('3a'); // 0.33 is NOT < 0.33 — falls to the next class
    expect(ratioToZone(1.5)).toBe('4a');
    expect(ratioToZone(8.0)).toBe('5b');
    expect(ratioToZone(50)).toBe('7b');
  });
});
