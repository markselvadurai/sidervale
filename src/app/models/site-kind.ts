import { Site } from './site';

/** DarkSky certifies municipalities too. Those are places people live, not places to drive to. */
const URBAN_TYPES = new Set([
  'international-dark-sky-community',
  'community',
  'urban-night-sky-place',
  'urban-star-park',
]);

export type SiteKind = 'destination' | 'community';

/** Community only when EVERY designation is urban — one dataset site is both, and it is a park. */
export function siteKind(site: Pick<Site, 'designations'>): SiteKind {
  const { designations } = site;
  if (!designations.length) return 'destination';
  return designations.every((d) => URBAN_TYPES.has(d.type)) ? 'community' : 'destination';
}
