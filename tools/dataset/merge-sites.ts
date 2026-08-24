// Stage 2 entry: merge the committed raw snapshots into merged.json. No network.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DarkskySnapshot } from './darksky';
import { buildMergedDataset } from './merge';
import { RascSnapshot } from './rasc';

const dir = import.meta.dirname;
const darksky: DarkskySnapshot = JSON.parse(readFileSync(join(dir, 'raw', 'darksky.json'), 'utf8'));
const rasc: RascSnapshot = JSON.parse(readFileSync(join(dir, 'raw', 'rasc.json'), 'utf8'));

const merged = buildMergedDataset(darksky, rasc, new Date().toISOString());
const out = join(dir, 'merged.json');
writeFileSync(out, JSON.stringify(merged, null, 2) + '\n');

console.log(
  `merged: ${merged.sites.length} sites, ${merged.autoMerged.length} auto-merged, ` +
    `${merged.reviewPairs.length} review pairs, ${merged.quarantine.length} quarantined → ${out}`,
);
for (const p of merged.autoMerged) {
  console.log(`  merged: ${p.darkskySlug} ↔ ${p.rascName} (${p.distanceKm?.toFixed(2)} km)`);
}
for (const p of merged.reviewPairs) {
  console.log(`  REVIEW: ${p.darkskySlug} ↔ ${p.rascName} (${p.distanceKm?.toFixed(2) ?? '?'} km)`);
}
