import { DateTime } from 'luxon';
import { SiteCore } from './site';

/** The night that BEGINS on this local calendar date at this site. */
export type ObservingNight = { readonly siteId: string; readonly localDate: string }; // 'YYYY-MM-DD'

/** The night in progress at `now`, or the next to begin — rolls over at site-local noon. */
export function observingNightOf(site: SiteCore, now: DateTime = DateTime.now()): ObservingNight {
  // Observing days run noon-to-noon (why Julian dates roll at noon): pre-noon is yesterday's
  // night. A wall-clock rule, not minus-12-hours — exact-time math drifts on DST days.
  const local = now.setZone(site.timezone);
  const day = local.hour < 12 ? local.minus({ days: 1 }) : local;
  const localDate = day.toISODate();
  if (localDate === null) throw new Error(`cannot resolve a local date at site ${site.id}`);
  return { siteId: site.id, localDate };
}

/** The night `n` nights after this one (negative steps back). Pure calendar arithmetic. */
export function plusNights(night: ObservingNight, n: number): ObservingNight {
  // UTC keeps day-stepping free of DST; only the calendar date survives anyway.
  const localDate = calendarDate(night.localDate, 'utc').plus({ days: n }).toISODate();
  if (localDate === null) throw new Error(`invalid localDate '${night.localDate}'`);
  return { siteId: night.siteId, localDate };
}

/** Parses strictly 'YYYY-MM-DD' — fromISO alone would accept datetime strings, which are instants. */
function calendarDate(localDate: string, zone: string): DateTime {
  return /^\d{4}-\d{2}-\d{2}$/.test(localDate)
    ? DateTime.fromISO(localDate, { zone })
    : DateTime.invalid('not a calendar date');
}

/** Noon at the site on the night's local date — the unambiguous anchor instant. */
export function noonOf(site: SiteCore, night: ObservingNight): DateTime {
  if (night.siteId !== site.id) {
    throw new Error(`night belongs to site ${night.siteId}, not ${site.id}`);
  }
  const noon = calendarDate(night.localDate, site.timezone).set({ hour: 12 });
  if (!noon.isValid) throw new Error(`invalid localDate '${night.localDate}'`);
  return noon;
}
