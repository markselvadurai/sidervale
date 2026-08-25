// Stage 5 entry: validate and emit sites.json, the app-facing dataset. No network.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BrightnessDoc, buildAppDataset } from './emit';
import { EnrichedDataset } from './enrich';

const dir = import.meta.dirname;
const enriched: EnrichedDataset = JSON.parse(readFileSync(join(dir, 'enriched.json'), 'utf8'));
const doc: BrightnessDoc = JSON.parse(readFileSync(join(dir, 'brightness.json'), 'utf8'));

const dataset = buildAppDataset(enriched, doc, new Date().toISOString());
// the ONE committed copy — served by the app same-origin, read by the precompute
const out = join(dir, '..', '..', 'public', 'data', 'sites.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(dataset, null, 2) + '\n');

console.log(`emitted: ${dataset.sites.length} sites, ${dataset.excluded.length} excluded → ${out}`);
for (const e of dataset.excluded) console.log(`  excluded: ${e.id} (${e.reasons.join(', ')})`);
