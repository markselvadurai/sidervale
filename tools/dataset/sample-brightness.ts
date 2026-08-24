// Stage 4 entry: sample zenith sky brightness for every located site from the Lorenz
// 2024 atlas binary tiles. Tiles are cached locally (gitignored); output is small.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { EnrichedDataset } from './enrich';
import { fetchBytes } from './fetch';
import { compressedToRatio, ratioToMpsas, ratioToZone, sampleTile, tileAddressFor } from './lorenz';

const ATLAS_YEAR = 2024; // matches the overlay tiles the app displays
const TILE_URL = (x: number, y: number) =>
  `https://djlorenz.github.io/astronomy/binary_tiles/${ATLAS_YEAR}/binary_tile_${x}_${y}.dat.gz`;

const dir = import.meta.dirname;
const cacheDir = join(dir, '.tile-cache');
mkdirSync(cacheDir, { recursive: true });

async function tileData(x: number, y: number): Promise<Int8Array> {
  const cached = join(cacheDir, `${ATLAS_YEAR}_${x}_${y}.dat.gz`);
  if (!existsSync(cached)) {
    writeFileSync(cached, await fetchBytes(TILE_URL(x, y)));
    await new Promise((r) => setTimeout(r, 150)); // be polite to a personal site
  }
  return new Int8Array(gunzipSync(readFileSync(cached)));
}

async function main() {
  const enriched: EnrichedDataset = JSON.parse(readFileSync(join(dir, 'enriched.json'), 'utf8'));
  const located = enriched.sites.filter((s) => s.coordinates);

  const brightness: Record<
    string,
    { ratio: number; mpsas: number; zone: string; atlasYear: number }
  > = {};
  const quarantine: { id: string; reason: string }[] = [];
  const tiles = new Map<string, Int8Array>();

  for (const site of located) {
    const addr = tileAddressFor(site.coordinates!.lat, site.coordinates!.lng);
    if (!addr) {
      quarantine.push({ id: site.id, reason: 'outside-atlas' });
      continue;
    }
    const key = `${addr.tilex}_${addr.tiley}`;
    if (!tiles.has(key)) tiles.set(key, await tileData(addr.tilex, addr.tiley));
    const ratio = compressedToRatio(sampleTile(tiles.get(key)!, addr.ix, addr.iy));
    brightness[site.id] = {
      ratio: Number(ratio.toFixed(4)),
      mpsas: Number(ratioToMpsas(ratio).toFixed(2)),
      zone: ratioToZone(ratio),
      atlasYear: ATLAS_YEAR,
    };
  }

  const out = join(dir, 'brightness.json');
  writeFileSync(
    out,
    JSON.stringify({ sampledAt: new Date().toISOString(), brightness, quarantine }, null, 2) + '\n',
  );

  const zones = new Map<string, number>();
  for (const b of Object.values(brightness)) zones.set(b.zone, (zones.get(b.zone) ?? 0) + 1);
  console.log(
    `brightness: ${Object.keys(brightness).length} sites sampled from ${tiles.size} tiles, ` +
      `${quarantine.length} outside atlas → ${out}`,
  );
  console.log(
    '  zones:',
    [...zones.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([z, n]) => `${z}:${n}`)
      .join(' '),
  );
  // gross-error alarms: a Park/Reserve/Sanctuary/Preserve in a bright zone is suspect
  for (const site of located) {
    const b = brightness[site.id];
    if (!b) continue;
    const protectedPlace = site.designations.some((d) =>
      /park|reserve|sanctuary|preserve/.test(d.type),
    );
    if (protectedPlace && b.ratio >= 5.2) {
      console.log(
        `  SUSPECT: ${site.id} (${site.designations.map((d) => d.type).join(',')}) zone ${b.zone}, mpsas ${b.mpsas}`,
      );
    }
  }
}

main();
