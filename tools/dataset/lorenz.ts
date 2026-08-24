// Sampling the Lorenz world atlas binary tiles — format reverse-read from his overlay page,
// constants are his, verbatim: https://djlorenz.github.io/astronomy/lp/overlay/dark.html

export type TileAddress = { tilex: number; tiley: number; ix: number; iy: number };

/** LP zone ids in Lorenz's own classification, darkest to brightest. */
export type LpZone =
  | '0'
  | '1a'
  | '1b'
  | '2a'
  | '2b'
  | '3a'
  | '3b'
  | '4a'
  | '4b'
  | '5a'
  | '5b'
  | '6a'
  | '6b'
  | '7a'
  | '7b';

// His zone table: [exclusive upper bound on ratio, zone].
const ZONES: [number, LpZone][] = [
  [0.01, '0'],
  [0.06, '1a'],
  [0.11, '1b'],
  [0.19, '2a'],
  [0.33, '2b'],
  [0.58, '3a'],
  [1.0, '3b'],
  [1.73, '4a'],
  [3.0, '4b'],
  [5.2, '5a'],
  [9.0, '5b'],
  [15.59, '6a'],
  [27.0, '6b'],
  [46.77, '7a'],
  [Infinity, '7b'],
];

/** Which 5°×5° tile holds this point, and the nearest 30″ grid indices inside it (1-based). */
export function tileAddressFor(lat: number, lng: number): TileAddress | null {
  const lonFromDateLine = (((lng + 180) % 360) + 360) % 360;
  const latFromStart = lat + 65;
  const tilex = Math.floor(lonFromDateLine / 5) + 1;
  const tiley = Math.floor(latFromStart / 5) + 1;
  if (tiley < 1 || tiley > 28) return null;
  return {
    tilex,
    tiley,
    ix: Math.round(120 * (lonFromDateLine - 5 * (tilex - 1) + 1 / 240)),
    iy: Math.round(120 * (latFromStart - 5 * (tiley - 1) + 1 / 240)),
  };
}

/** Walk the delta-compressed 600×600 grid to the compressed value at (ix, iy). */
export function sampleTile(data: Int8Array, ix: number, iy: number): number {
  // First point is 2 bytes (128·b0 + b1); every later byte is a delta, hence the +1 offsets.
  let value = 128 * data[0] + data[1];
  for (let i = 1; i < iy; i++) value += data[600 * i + 1];
  for (let i = 1; i < ix; i++) value += data[600 * (iy - 1) + 1 + i];
  return value;
}

/** Lorenz: artificial-to-natural brightness ratio from the compressed integer. */
export function compressedToRatio(compressed: number): number {
  return (5 / 195) * (Math.exp(0.0195 * compressed) - 1);
}

/** Total zenith sky brightness in mag/arcsec² (natural sky = 22.0). */
export function ratioToMpsas(ratio: number): number {
  return 22.0 - (5.0 * Math.log(1.0 + ratio)) / Math.log(100);
}

export function ratioToZone(ratio: number): LpZone {
  return ZONES.find(([bound]) => ratio < bound)![1];
}
