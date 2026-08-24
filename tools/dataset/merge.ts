// Stage 2: merge the DarkSky and RASC snapshots into one deduplicated site list.

import { DarkskySnapshot, LatLng } from './darksky';
import { commonPrefixLength, normKey, slugify } from './naming';
import { RascSnapshot } from './rasc';

type DarkskyRecord = DarkskySnapshot['places'][number];
type RascRecord = RascSnapshot['sites'][number];

export type Designation = {
  authority: 'darksky' | 'rasc';
  type: string;
  year: number | null;
};

export type MergedSite = {
  id: string;
  name: string;
  coordinates: LatLng | null;
  coordinateDeltaKm: number | null;
  designations: Designation[];
  countries: string[];
  provinces: string[];
  sources: {
    darksky?: { postId: number; slug: string; url: string };
    rasc?: { rascUrl: string | null };
  };
};

export type MergePair = {
  darkskySlug: string;
  rascName: string;
  distanceKm: number | null;
  namePrefixLength: number;
};

export type MergedDataset = {
  mergedAt: string;
  sites: MergedSite[];
  autoMerged: MergePair[];
  reviewPairs: MergePair[];
  quarantine: { id: string; reason: string }[];
};

const EARTH_RADIUS_KM = 6371;
// Both signals must agree for an auto-merge; either alone is only a review candidate.
const NAME_MATCH = 8; // shared normalized-prefix chars
const MERGE_RADIUS_KM = 30; // reserves are large; pins for one site can sit far apart
const TRUST_RADIUS_KM = 5; // merged coordinates further apart than this need a human

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function findMergePairs(
  darksky: DarkskyRecord[],
  rasc: RascRecord[],
): { auto: MergePair[]; review: MergePair[] } {
  const auto: MergePair[] = [];
  const review: MergePair[] = [];

  for (const d of darksky) {
    for (const r of rasc) {
      const namePrefixLength = commonPrefixLength(normKey(d.name), normKey(r.name));
      const distanceKm =
        d.coordinates && r.coordinates ? haversineKm(d.coordinates, r.coordinates) : null;
      const nameAgrees = namePrefixLength >= NAME_MATCH;
      const nearby = distanceKm !== null && distanceKm <= MERGE_RADIUS_KM;
      if (!nameAgrees && !nearby) continue;

      const pair = { darkskySlug: d.slug, rascName: r.name, distanceKm, namePrefixLength };
      (nameAgrees && nearby ? auto : review).push(pair);
    }
  }
  return { auto, review };
}

function darkskyDesignations(d: DarkskyRecord): Designation[] {
  return d.categories.map((type) => ({ authority: 'darksky', type, year: d.designatedYear }));
}

function rascDesignation(r: RascRecord): Designation {
  return { authority: 'rasc', type: r.program, year: r.year };
}

export function buildMergedDataset(
  darksky: DarkskySnapshot,
  rasc: RascSnapshot,
  mergedAt: string,
): MergedDataset {
  const { auto, review } = findMergePairs(darksky.places, rasc.sites);
  const rascBySlug = new Map(
    auto.map((p) => [p.darkskySlug, rasc.sites.find((r) => r.name === p.rascName)!]),
  );
  const mergedRascNames = new Set(auto.map((p) => p.rascName));
  const quarantine: MergedDataset['quarantine'] = [];

  const sites: MergedSite[] = darksky.places.map((d) => {
    const r = rascBySlug.get(d.slug);
    const deltaKm =
      r?.coordinates && d.coordinates ? haversineKm(d.coordinates, r.coordinates) : null;
    if (deltaKm !== null && deltaKm > TRUST_RADIUS_KM) {
      quarantine.push({ id: d.slug, reason: 'coordinate-disagreement' });
    }
    return {
      id: d.slug,
      name: d.name,
      coordinates: d.coordinates ?? r?.coordinates ?? null,
      coordinateDeltaKm: deltaKm,
      designations: [...darkskyDesignations(d), ...(r ? [rascDesignation(r)] : [])],
      countries: d.countries,
      provinces: r?.provinces ?? [],
      sources: {
        darksky: { postId: d.postId, slug: d.slug, url: d.url },
        ...(r ? { rasc: { rascUrl: r.rascUrl } } : {}),
      },
    };
  });

  for (const r of rasc.sites) {
    if (mergedRascNames.has(r.name)) continue;
    sites.push({
      id: slugify(r.name),
      name: r.name,
      coordinates: r.coordinates,
      coordinateDeltaKm: null,
      designations: [rascDesignation(r)],
      countries: ['canada'],
      provinces: r.provinces,
      sources: { rasc: { rascUrl: r.rascUrl } },
    });
  }

  for (const q of darksky.quarantine) quarantine.push({ id: q.slug, reason: q.reason });
  for (const q of rasc.quarantine) {
    if (!mergedRascNames.has(q.name)) quarantine.push({ id: slugify(q.name), reason: q.reason });
  }

  return {
    mergedAt,
    sites: sites.sort((a, b) => a.id.localeCompare(b.id)),
    autoMerged: auto,
    reviewPairs: review,
    quarantine,
  };
}
