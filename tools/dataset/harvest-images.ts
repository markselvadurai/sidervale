// Harvest a verified, freely-licensed photo for each site from Wikipedia/Wikimedia Commons.
//
// DarkSky's own images cannot be used: their terms permit noncommercial educational use only,
// forbid commercial use outright, and require the creator's consent for anything credited to
// someone else — which is most of them, and their API returns no credit line at all. See
// ADR 0010.
//
// The matching rule lives in commons.ts and is tested there. This file is the I/O shell:
// one search per site, one batched imageinfo lookup per 40 files, throttled, loud on failure.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  corroboratesName,
  ExtMetadata,
  fileKey,
  ImageInfo,
  nearestVerifiedPage,
  SiteImage,
  toSiteImage,
  WikiPage,
} from './commons';
import { fetchJson } from './fetch';

/** A candidate must sit within this of the site to be believed. Parks are large; 25 km keeps
 *  a lead image of the far end of a reserve while still refusing the next valley over. */
const MATCH_RADIUS_KM = 25;

// Wikimedia asks for courtesy over speed on unauthenticated reads, and enforces it: 200ms
// earned a 429 within a dozen requests. This is a harvest that writes a static file once, so
// slow is free — roughly six minutes for the full 293.
const THROTTLE_MS = 2500;
const MAX_RETRIES = 6;
const IMAGEINFO_BATCH = 40;
const THUMB_WIDTH = 480;

const API = 'https://en.wikipedia.org/w/api.php';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch.ts is deliberately retry-free; backing off belongs to the caller that knows the
 *  request is idempotent and cheap to repeat. Honours Retry-After when the server sends one. */
async function politeJson<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchJson<T>(url);
    } catch (error) {
      const message = (error as Error).message;
      // Wikimedia rate-limits two ways: a 429, and a 200 whose body is the plain sentence
      // "You are making too many requests" — which only shows up as a JSON parse failure.
      const retryable =
        /^(429|5\d\d) /.test(message) || /is not valid JSON|Unexpected token/.test(message);
      if (!retryable || attempt >= MAX_RETRIES) throw error;
      const wait = 2000 * 2 ** attempt;
      console.log(`    backing off ${wait}ms (${message.slice(0, 24)}…)`);
      await sleep(wait);
    }
  }
}

type Site = { id: string; name: string; coordinates: { lat: number; lng: number } };
type SearchResponse = { query?: { pages?: Record<string, WikiPage> } };
type InfoResponse = {
  query?: {
    pages?: Record<
      string,
      { title: string; imageinfo?: (ImageInfo & { extmetadata?: ExtMetadata })[] }
    >;
  };
};

async function candidatesFor(site: Site): Promise<WikiPage[]> {
  const url =
    `${API}?action=query&format=json&generator=search&gsrlimit=5` +
    `&gsrsearch=${encodeURIComponent(site.name)}` +
    `&prop=coordinates|pageimages&piprop=name&colimit=5`;
  const json = await politeJson<SearchResponse>(url);
  return Object.values(json.query?.pages ?? {});
}

async function imageInfo(
  files: string[],
): Promise<Map<string, ImageInfo & { extmetadata?: ExtMetadata }>> {
  const out = new Map<string, ImageInfo & { extmetadata?: ExtMetadata }>();
  for (let i = 0; i < files.length; i += IMAGEINFO_BATCH) {
    const batch = files.slice(i, i + IMAGEINFO_BATCH);
    const url =
      `${API}?action=query&format=json&prop=imageinfo` +
      `&iiprop=url|extmetadata&iiurlwidth=${THUMB_WIDTH}` +
      `&titles=${encodeURIComponent(batch.join('|'))}`;
    const json = await politeJson<InfoResponse>(url);
    for (const page of Object.values(json.query?.pages ?? {})) {
      if (page.imageinfo?.[0]) out.set(fileKey(page.title), page.imageinfo[0]);
    }
    await sleep(THROTTLE_MS);
  }
  return out;
}

/** Reasons a re-run would only reproduce: the site simply has no verifiable free photo. */
const PERMANENT = /^(no candidate within|licence not free|no thumbnail|name uncorroborated)/;

type Previous = {
  images: Record<string, SiteImage & { matchedPage: string; matchedKm: number }>;
  quarantine: { id: string; reason: string }[];
};

function readPrevious(path: string, names: Map<string, string>): Previous {
  try {
    const j = JSON.parse(readFileSync(path, 'utf8')) as Partial<Previous>;
    const images: Previous['images'] = {};
    const quarantine = [...(j.quarantine ?? [])];
    // re-gate what an earlier run accepted: matchedPage is stored, so tightening the rule
    // costs no requests at all
    for (const [id, v] of Object.entries(j.images ?? {})) {
      const name = names.get(id);
      if (name && !corroboratesName(name, v.matchedPage)) {
        quarantine.push({ id, reason: `name uncorroborated: ${v.matchedPage}` });
      } else {
        images[id] = v;
      }
    }
    return { images, quarantine };
  } catch {
    return { images: {}, quarantine: [] };
  }
}

async function main() {
  const datasetPath = join(import.meta.dirname, '..', '..', 'public', 'data', 'sites.json');
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as { sites: Site[] };
  // `npm run harvest:images -- 15` samples the first N, for validating a change without
  // spending 293 requests on someone else's servers
  const limit = Number(process.argv[2]) || Infinity;
  const sites = dataset.sites.slice(0, limit);

  // Resume: a rate-limited run must not throw away what it already resolved. Settled sites —
  // accepted, or rejected for a reason that will not change — are skipped on the next pass.
  const outPath = join(import.meta.dirname, 'raw', 'images.json');
  const previous = readPrevious(outPath, new Map(dataset.sites.map((s) => [s.id, s.name])));
  const settled = new Set([
    ...Object.keys(previous.images),
    ...previous.quarantine.filter((q) => PERMANENT.test(q.reason)).map((q) => q.id),
  ]);
  const todo = sites.filter((s) => !settled.has(s.id));
  if (settled.size) console.log(`resuming: ${settled.size} settled, ${todo.length} to go`);

  const matched: { site: Site; file: string; km: number; page: string }[] = [];
  const quarantine: { id: string; reason: string }[] = previous.quarantine.filter((q) =>
    PERMANENT.test(q.reason),
  );

  for (const [i, site] of todo.entries()) {
    try {
      const hit = nearestVerifiedPage(site.coordinates, await candidatesFor(site), MATCH_RADIUS_KM);
      if (!hit) {
        quarantine.push({ id: site.id, reason: `no candidate within ${MATCH_RADIUS_KM} km` });
      } else if (!corroboratesName(site.name, hit.page.title)) {
        // located correctly, but of something else: a town, a ranch, a manor house
        quarantine.push({ id: site.id, reason: `name uncorroborated: ${hit.page.title}` });
      } else {
        matched.push({
          site,
          file: `File:${hit.page.pageimage}`,
          km: hit.km,
          page: hit.page.title,
        });
      }
    } catch (error) {
      quarantine.push({ id: site.id, reason: `search failed: ${(error as Error).message}` });
    }
    if ((i + 1) % 20 === 0) console.log(`  …${i + 1}/${todo.length} searched`);
    await sleep(THROTTLE_MS);
  }

  console.log(`matched ${matched.length} pages; fetching licences…`);
  const info = await imageInfo([...new Set(matched.map((m) => m.file))]);

  const images: Record<string, SiteImage & { matchedPage: string; matchedKm: number }> =
    previous.images;
  for (const m of matched) {
    const found = info.get(fileKey(m.file));
    if (!found) {
      quarantine.push({ id: m.site.id, reason: `no imageinfo for ${m.file}` });
      continue;
    }
    const result = toSiteImage(m.file, found, found.extmetadata ?? {});
    if ('reason' in result) {
      quarantine.push({ id: m.site.id, reason: result.reason });
      continue;
    }
    images[m.site.id] = { ...result, matchedPage: m.page, matchedKm: Number(m.km.toFixed(1)) };
  }

  const out = outPath;
  mkdirSync(join(import.meta.dirname, 'raw'), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        source: 'en.wikipedia.org + commons.wikimedia.org',
        harvestedAt: new Date().toISOString(),
        radiusKm: MATCH_RADIUS_KM,
        images,
        quarantine,
      },
      null,
      2,
    ) + '\n',
  );

  const licences = new Map<string, number>();
  for (const v of Object.values(images))
    licences.set(v.licence, (licences.get(v.licence) ?? 0) + 1);
  console.log(
    `images: ${Object.keys(images).length}/${sites.length} sites, ${quarantine.length} quarantined → ${out}`,
  );
  console.log('licences:', [...licences].map(([l, n]) => `${l}×${n}`).join(', '));
}

main();
