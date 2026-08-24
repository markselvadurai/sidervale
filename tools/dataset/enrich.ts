// Stage 3: deterministic enrichment of the merged dataset. Timezone via tz-lookup — never inferred.

import tzLookup from 'tz-lookup';
import { MergedDataset, MergedSite } from './merge';

export type EnrichedSite = MergedSite & { timezone: string | null };

export type EnrichedDataset = {
  enrichedAt: string;
  sites: EnrichedSite[];
  quarantine: { id: string; reason: string }[];
};

/** Zones no certified dark-sky place can be in; hitting one means the coordinate is wrong. */
export function isSuspiciousZone(zone: string): boolean {
  return zone.startsWith('Etc/') || zone.startsWith('Antarctica/');
}

export function enrichSites(merged: MergedDataset, enrichedAt: string): EnrichedDataset {
  const quarantine = [...merged.quarantine];
  const sites = merged.sites.map((site): EnrichedSite => {
    if (!site.coordinates) return { ...site, timezone: null };
    const timezone = tzLookup(site.coordinates.lat, site.coordinates.lng);
    if (isSuspiciousZone(timezone)) {
      quarantine.push({ id: site.id, reason: 'suspicious-timezone' });
    }
    return { ...site, timezone };
  });
  return { enrichedAt, sites, quarantine };
}
