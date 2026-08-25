import * as SunCalc from 'suncalc';
import { DateTime, Interval } from 'luxon';
import { SiteCore } from '../models/site';
import { noonOf, ObservingNight, observingNightOf, plusNights } from '../models/observing-night';

export type DarknessWindow =
  | {
      hasTrueDarkness: true;
      start: DateTime;
      end: DateTime;
      dusk: DateTime;
      dawn: DateTime;
    }
  | {
      hasTrueDarkness: false;
      start: null;
      end: null;
      dusk: null;
      dawn: null;
    };

export type MoonOverlap = {
  overlapMinutes: number;
  overlapFraction: number;
  illuminationFraction: number;
  segments: Interval<true>[];
};

/** Moon semidiameter + refraction constants, matching suncalc's own rise/set test. */
const EARTH_RADIUS_KM = 6378.14;
const REFRACTION_DEG = 0.09;

/** The moon is up once its upper limb clears the horizon — centre altitude ≈ −0.35°. */
function isMoonUp(site: SiteCore, at: Date): boolean {
  const p = SunCalc.getMoonPosition(at, site.coordinates.lat, site.coordinates.lng);
  const semidiameter = 0.2725 * Math.asin(EARTH_RADIUS_KM / p.distance) * (180 / Math.PI);
  return p.altitude + semidiameter + REFRACTION_DEG >= 0;
}

const DAY_MS = 86_400_000;

/** The mean-solar-transit instant nearest the site's civil noon on this night's date. */
// suncalc resolves "which day" from its Date's UTC calendar day plus the longitude, so
// the anchor must sit on the night's own solar day. Civil noon is NOT safe: past UTC+12
// at east longitude (Pacific/Auckland in NZDT) it lands a whole solar day early.
function solarAnchor(site: SiteCore, night: ObservingNight): Date {
  const civilNoonMs = noonOf(site, night).toMillis();
  const transitPhaseMs =
    ((((12 - site.coordinates.lng / 15) * 3_600_000) % DAY_MS) + DAY_MS) % DAY_MS;
  const solarDay = Math.round((civilNoonMs - transitPhaseMs) / DAY_MS);
  return new Date(solarDay * DAY_MS + transitPhaseMs);
}

/** The night a user means by "tonight": in progress until sunrise, else the next to begin. */
export function currentObservingNight(
  site: SiteCore,
  now: DateTime = DateTime.now(),
): ObservingNight {
  const local = now.setZone(site.timezone);
  const localDate = local.toISODate();
  if (localDate === null) throw new Error(`cannot resolve a local date at site ${site.id}`);
  const tonight: ObservingNight = { siteId: site.id, localDate };

  // This morning's sunrise ends the night that began yesterday.
  const sunrise = SunCalc.getTimes(
    solarAnchor(site, tonight),
    site.coordinates.lat,
    site.coordinates.lng,
  ).sunrise;

  // No sunrise event (polar day or night, suncalc returns null): fall back to the noon rule.
  if (!sunrise) return observingNightOf(site, now);

  return now.toMillis() < sunrise.getTime() ? plusNights(tonight, -1) : tonight;
}

export function getDarknessWindow(site: SiteCore, night: ObservingNight): DarknessWindow {
  const anchor = solarAnchor(site, night);

  const times = SunCalc.getTimes(anchor, site.coordinates.lat, site.coordinates.lng);
  const nextDay = solarAnchor(site, plusNights(night, 1));

  const nextDayTimes = SunCalc.getTimes(nextDay, site.coordinates.lat, site.coordinates.lng);
  const nightStart = times.night;
  const nightEnd = nextDayTimes.nightEnd;
  const dusk = times.dusk;
  const dawn = nextDayTimes.dawn;
  const hasTrueDarkness = nightStart != null && nightEnd != null && dusk != null && dawn != null;

  if (!hasTrueDarkness) {
    return { start: null, end: null, hasTrueDarkness: false, dusk: null, dawn: null };
  }

  return {
    start: DateTime.fromJSDate(nightStart).setZone(site.timezone),
    end: DateTime.fromJSDate(nightEnd).setZone(site.timezone),
    dusk: DateTime.fromJSDate(dusk).setZone(site.timezone),
    dawn: DateTime.fromJSDate(dawn).setZone(site.timezone),
    hasTrueDarkness: true,
  };
}

export function getMoonOverlap(site: SiteCore, window: Interval<true>): MoonOverlap {
  let isUp = isMoonUp(site, window.start.toJSDate());
  let segmentStart = window.start;
  let overlapValue = 0;
  const segments: Interval[] = [];
  const day1 = SunCalc.getMoonTimes(
    window.start.toJSDate(),
    site.coordinates.lat,
    site.coordinates.lng,
  );
  const nextDay = new Date(window.start.toJSDate());
  nextDay.setDate(nextDay.getDate() + 1);
  const day2 = SunCalc.getMoonTimes(nextDay, site.coordinates.lat, site.coordinates.lng);
  const tz = site.timezone;
  const overlapEvents: DateTime<true>[] = [];

  const addIfInWindow = (d: Date | undefined) => {
    if (!d) return;
    const dt = DateTime.fromJSDate(d, { zone: tz }) as DateTime<true>;
    if (window.contains(dt)) overlapEvents.push(dt);
  };

  addIfInWindow(day1.rise);
  addIfInWindow(day1.set);
  addIfInWindow(day2.rise);
  addIfInWindow(day2.set);

  overlapEvents.sort((a, b) => a.toMillis() - b.toMillis());

  for (const transition of overlapEvents) {
    if (isUp) {
      segments.push(Interval.fromDateTimes(segmentStart, transition));
      overlapValue += transition.toMillis() - segmentStart.toMillis();
    }
    isUp = !isUp;
    segmentStart = transition;
  }
  if (isUp) {
    overlapValue = overlapValue + window.end.toMillis() - segmentStart.toMillis();
    segments.push(Interval.fromDateTimes(segmentStart, window.end));
  }

  const windowMs = window.length('millisecond');

  const overlapMinutes = overlapValue / 60000;
  const overlapFraction = overlapValue / windowMs;

  return {
    overlapMinutes,
    overlapFraction,
    illuminationFraction: SunCalc.getMoonIllumination(window.start.toJSDate()).fraction,
    segments,
  };
}
