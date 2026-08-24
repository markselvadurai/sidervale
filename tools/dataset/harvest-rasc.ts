// Harvest RASC's dark-sky sites: the Drupal table plus the Google My Maps KML it links.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchText } from './fetch';
import { buildRascSnapshot, parseKmlPlacemarks, parseRascTable } from './rasc';

const LIST = 'https://rasc.ca/lpa/dark-sky-sites';
const KML = 'https://www.google.com/maps/d/kml?mid=1qB2bhbT3xyCZ6r3W7xtNLUavuhTLP2qB&forcekml=1';

async function main() {
  const sites = parseRascTable(await fetchText(LIST));
  const pins = parseKmlPlacemarks(await fetchText(KML));

  const snapshot = buildRascSnapshot(sites, pins, new Date().toISOString());
  const out = join(import.meta.dirname, 'raw', 'rasc.json');
  mkdirSync(join(import.meta.dirname, 'raw'), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');

  console.log(
    `rasc: ${snapshot.sites.length} sites ` +
      `(${snapshot.sites.filter((s) => s.coordinates).length} with coordinates), ` +
      `${snapshot.quarantine.length} quarantined, ${snapshot.unmatchedPins.length} unmatched pins → ${out}`,
  );
}

main();
