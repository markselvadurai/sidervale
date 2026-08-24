// Harvest DarkSky International's certified places: 4 requests, one JSON snapshot.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDarkskySnapshot, DarkskyPost, parseFwpMarkers } from './darksky';
import { fetchJson, fetchText } from './fetch';

const DIRECTORY = 'https://darksky.org/what-we-do/international-dark-sky-places/all-places/';
const REST =
  'https://darksky.org/wp-json/wp/v2/darksky_place?per_page=100&_fields=id,slug,link,title,content,class_list';

async function main() {
  const markers = parseFwpMarkers(await fetchText(DIRECTORY));

  const posts: DarkskyPost[] = [];
  for (let page = 1; ; page++) {
    const batch = await fetchJson<DarkskyPost[]>(`${REST}&page=${page}`);
    posts.push(...batch);
    if (batch.length < 100) break;
  }

  const snapshot = buildDarkskySnapshot(posts, markers, new Date().toISOString());
  const out = join(import.meta.dirname, 'raw', 'darksky.json');
  mkdirSync(join(import.meta.dirname, 'raw'), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');

  console.log(
    `darksky: ${snapshot.places.length} certified places ` +
      `(${snapshot.places.filter((p) => p.coordinates).length} with coordinates), ` +
      `${snapshot.excluded.length} excluded, ${snapshot.quarantine.length} quarantined → ${out}`,
  );
}

main();
