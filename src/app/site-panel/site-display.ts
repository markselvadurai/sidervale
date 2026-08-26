import { Designation, Site } from '../models/site';
import { Tier } from '../engines/scorer';
import { bortleFor } from '../engines/bortle';

function titlecaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** 'international-dark-sky-reserve' → 'International Dark Sky Reserve', joined with ' · '.
 *  The sentinel type 'other' is omitted — a meaningless label is worse than a shorter one. */
export function designationsLabel(designations: Designation[]): string {
  return designations
    .filter((d) => d.type !== 'other')
    .map((d) => titlecaseSlug(d.type))
    .join(' · ');
}

/** 'Bortle 1', or 'Bortle 1–2' where the published mappings cannot separate the two. */
export function bortleText(mpsas: number): string {
  const { low, high } = bortleFor(mpsas);
  return low === high ? `Bortle ${low}` : `Bortle ${low}–${high}`;
}

/** Where the site is, from the data we have: province code, else titlecased country slug. */
export function regionLabel(site: Site): string {
  const province = site.provinces[0];
  if (province) return province.toUpperCase();
  // strip WordPress disambiguation suffixes ('niue-2' → 'niue') before rendering
  const country = site.countries[0]?.replace(/-\d+$/, '');
  if (!country) return '';
  return country.length <= 3 ? country.toUpperCase() : titlecaseSlug(country);
}

/** The word beside the dial. Hue alone cannot carry the verdict, so this is never dropped. */
export function verdictWord(tier: Tier, cloudDataAvailable: boolean): string {
  if (!cloudDataAvailable) return 'Astronomy only';
  return tier[0].toUpperCase() + tier.slice(1);
}
