import { DateTime } from 'luxon';
import { Site } from './site';

/** The night that BEGINS on this local calendar date at this site. */
export type ObservingNight = { readonly siteId: string; readonly localDate: string }; // 'YYYY-MM-DD'

/** The night beginning on the site-local calendar day containing `now`. */
export function observingNightOf(site: Site, now: DateTime = DateTime.now()): ObservingNight {
  const localDate = now.setZone(site.timezone).toISODate();
  if (localDate === null) throw new Error(`cannot resolve a local date at site ${site.id}`);
  return { siteId: site.id, localDate };
}

/** Noon at the site on the night's local date — the unambiguous anchor instant. */
export function noonOf(site: Site, night: ObservingNight): DateTime {
  if (night.siteId !== site.id) {
    throw new Error(`night belongs to site ${night.siteId}, not ${site.id}`);
  }
  // Shape check first: fromISO also accepts datetime strings, which are instants, not days.
  const noon = /^\d{4}-\d{2}-\d{2}$/.test(night.localDate)
    ? DateTime.fromISO(night.localDate, { zone: site.timezone }).set({ hour: 12 })
    : DateTime.invalid('not a calendar date');
  if (!noon.isValid) throw new Error(`invalid localDate '${night.localDate}'`);
  return noon;
}
