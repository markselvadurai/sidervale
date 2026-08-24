// Stage 3 entry: enrich merged.json into enriched.json. Offline — tz-lookup is a local dataset.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { enrichSites } from './enrich';
import { MergedDataset } from './merge';

const dir = import.meta.dirname;
const merged: MergedDataset = JSON.parse(readFileSync(join(dir, 'merged.json'), 'utf8'));

const enriched = enrichSites(merged, new Date().toISOString());
const out = join(dir, 'enriched.json');
writeFileSync(out, JSON.stringify(enriched, null, 2) + '\n');

const histogram = new Map<string, number>();
for (const s of enriched.sites) {
  if (s.timezone) histogram.set(s.timezone, (histogram.get(s.timezone) ?? 0) + 1);
}
const suspicious = enriched.quarantine.filter((q) => q.reason === 'suspicious-timezone');

console.log(
  `enriched: ${enriched.sites.length} sites, ` +
    `${enriched.sites.filter((s) => s.timezone).length} with timezones across ${histogram.size} zones, ` +
    `${suspicious.length} suspicious → ${out}`,
);
for (const [zone, n] of [...histogram.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(4)} ${zone}`);
}
for (const q of suspicious) console.log(`  SUSPICIOUS: ${q.id}`);
