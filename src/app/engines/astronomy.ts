import * as SunCalc from 'suncalc';
import { DateTime, Interval } from 'luxon';
import { Site } from '../models/site';

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
function isMoonUp(site: Site, at: Date): boolean {
    const p = SunCalc.getMoonPosition(at, site.coordinates.lat, site.coordinates.lng);
    const semidiameter = 0.2725 * Math.asin(EARTH_RADIUS_KM / p.distance) * (180 / Math.PI);
    return p.altitude + semidiameter + REFRACTION_DEG >= 0;
}

/** Noon on the site's current calendar day — the anchor for "tonight" *there*, not here. */
export function siteToday(site: Site, now: DateTime = DateTime.now()): DateTime {
    return now.setZone(site.timezone).set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
}

export function getDarknessWindow(site: Site, date: Date) : DarknessWindow {
    // Anchor to noon at the site: suncalc picks a night by the date's UTC day,
    // so an evening instant would name tomorrow's.
    const anchor = DateTime.fromJSDate(date)
        .setZone(site.timezone)
        .set({ hour: 12, minute: 0, second: 0, millisecond: 0 });

    const times = SunCalc.getTimes(anchor.toJSDate(), site.coordinates.lat, site.coordinates.lng);
    const nextDay = anchor.plus({ days: 1 }).toJSDate();

    const nextDayTimes = SunCalc.getTimes(nextDay, site.coordinates.lat, site.coordinates.lng)
    const nightStart = times.night;
    const nightEnd = nextDayTimes.nightEnd;
    const dusk = times.dusk;
    const dawn = nextDayTimes.dawn;
    const hasTrueDarkness = nightStart != null && nightEnd != null && dusk != null && dawn != null

    if (!hasTrueDarkness) {
        return { start: null, end: null, hasTrueDarkness: false, dusk: null, dawn: null };
    }

    return {
        start: DateTime.fromJSDate(nightStart).setZone(site.timezone),
        end: DateTime.fromJSDate(nightEnd).setZone(site.timezone),
        dusk: DateTime.fromJSDate(dusk).setZone(site.timezone),
        dawn: DateTime.fromJSDate(dawn).setZone(site.timezone),
        hasTrueDarkness: true
    };
}

export function getMoonOverlap(site: Site, window: Interval<true>) : MoonOverlap {
    let isUp = isMoonUp(site, window.start.toJSDate());
    let segmentStart = window.start;
    let overlapValue = 0;
    const segments: Interval[] = []
    const day1 = SunCalc.getMoonTimes(window.start.toJSDate(), site.coordinates.lat, site.coordinates.lng);
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
    };

    const windowMs = window.length('millisecond');

    const overlapMinutes = overlapValue / 60000;
    const overlapFraction = ( overlapValue / windowMs );

    return { overlapMinutes, overlapFraction, illuminationFraction: SunCalc.getMoonIllumination(window.start.toJSDate()).fraction, segments};
}