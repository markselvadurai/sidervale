import { Designation, Site } from '../models/site';

function titlecaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** 'international-dark-sky-reserve' → 'International Dark Sky Reserve', joined with ' · '. */
export function designationsLabel(designations: Designation[]): string {
  return designations.map((d) => titlecaseSlug(d.type)).join(' · ');
}

/** Where the site is, from the data we have: province code, else titlecased country slug. */
export function regionLabel(site: Site): string {
  const province = site.provinces[0];
  if (province) return province.toUpperCase();
  const country = site.countries[0];
  if (!country) return '';
  return country.length <= 3 ? country.toUpperCase() : titlecaseSlug(country);
}
