// Stage 5: validate and emit the app-facing dataset. Anything that fails validation is
// excluded WITH its reasons — silence is the one thing this stage is not allowed to do.

import { EnrichedDataset, EnrichedSite } from './enrich';
import { isSuspiciousZone } from './enrich';
import { Site } from '../../src/app/models/site';

export type BrightnessDoc = {
  sampledAt: string;
  brightness: Record<string, { ratio: number; mpsas: number; zone: string; atlasYear: number }>;
  quarantine: { id: string; reason: string }[];
};

// The app model IS the emitted shape — pipeline/app drift becomes a compile error here.
export type DatasetSite = Site;

export type AppDataset = {
  generatedAt: string;
  sites: DatasetSite[];
  excluded: { id: string; reasons: string[] }[];
};

export function validationFailures(site: EnrichedSite, doc: BrightnessDoc): string[] {
  const failures: string[] = [];
  if (!site.name.trim()) failures.push('no-name');
  if (!site.coordinates) failures.push('no-coordinates');
  else if (
    Math.abs(site.coordinates.lat) > 90 ||
    site.coordinates.lng < -180 ||
    site.coordinates.lng > 180
  ) {
    failures.push('coordinates-out-of-range');
  }
  if (!site.timezone) failures.push('no-timezone');
  else if (isSuspiciousZone(site.timezone)) failures.push('suspicious-timezone');
  if (site.designations.length === 0) failures.push('no-designations');
  if (!doc.brightness[site.id]) failures.push('no-brightness');
  return failures;
}

export function buildAppDataset(
  enriched: EnrichedDataset,
  doc: BrightnessDoc,
  generatedAt: string,
): AppDataset {
  const seen = new Set<string>();
  for (const site of enriched.sites) {
    if (seen.has(site.id)) throw new Error(`duplicate site id '${site.id}'`);
    seen.add(site.id);
  }

  const sites: DatasetSite[] = [];
  const excluded: AppDataset['excluded'] = [];

  for (const site of enriched.sites) {
    const reasons = validationFailures(site, doc);
    if (reasons.length > 0) {
      excluded.push({ id: site.id, reasons });
      continue;
    }
    sites.push({
      id: site.id,
      name: site.name,
      coordinates: site.coordinates!,
      timezone: site.timezone!,
      designations: site.designations,
      countries: site.countries,
      provinces: site.provinces,
      brightness: doc.brightness[site.id],
      urls: {
        ...(site.sources.darksky ? { darksky: site.sources.darksky.url } : {}),
        ...(site.sources.rasc?.rascUrl ? { rasc: site.sources.rasc.rascUrl } : {}),
      },
    });
  }

  return {
    generatedAt,
    sites: sites.sort((a, b) => a.id.localeCompare(b.id)),
    excluded: excluded.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
