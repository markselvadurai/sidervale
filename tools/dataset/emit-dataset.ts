// Stage 5 entry: validate and emit sites.json, the app-facing dataset. No network.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BrightnessDoc, buildAppDataset } from './emit';
import { EnrichedDataset } from './enrich';

const dir = import.meta.dirname;
const enriched: EnrichedDataset = JSON.parse(readFileSync(join(dir, 'enriched.json'), 'utf8'));
const doc: BrightnessDoc = JSON.parse(readFileSync(join(dir, 'brightness.json'), 'utf8'));

const dataset = buildAppDataset(enriched, doc, new Date().toISOString());
const out = join(dir, 'sites.json');
writeFileSync(out, JSON.stringify(dataset, null, 2) + '\n');

console.log(`emitted: ${dataset.sites.length} sites, ${dataset.excluded.length} excluded → ${out}`);
for (const e of dataset.excluded) console.log(`  excluded: ${e.id} (${e.reasons.join(', ')})`);
