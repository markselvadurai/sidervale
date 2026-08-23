import { computed, inject, Injectable, signal } from '@angular/core';
import { Site } from '../models/site';
import { SITES } from '../data/sites';
import { getDarknessWindow, getMoonOverlap, siteToday } from '../engines/astronomy';
import { DateTime, Duration, Interval } from 'luxon';
import { WeatherService } from './weather';
import { computeScore, NightScore } from '../engines/scorer';
import { avgCloudDuring, CloudCoverResult, Forecast } from '../engines/weather';

type CloudData =
  | {
      cloudDataAvailable: true;
      cloudAvg: number;
    }
  | {
      cloudDataAvailable: false;
      cloudAvg: null;
    };

export type NightInfo =
  | { hasTrueDarkness: false }
  | ({
      hasTrueDarkness: true;

      darknessWindow: { start: DateTime; end: DateTime };
      civilDusk: DateTime;
      civilDawn: DateTime;
      moonSegments: Interval<true>[];
      darkDuration: string;
      moonIllumination: number;
      moonOverlapDisplay: string;
      score: number;
      tier: Tier;
      cloudHours : { time: DateTime; cloudCover: number }[]
    } & CloudData);

  export type ScoredNight = Extract<NightInfo, { hasTrueDarkness: true }>;

  type TonightScore =
  | { hasTrueDarkness: true; score: number; tier: Tier; cloudDataAvailable: boolean }
  | { hasTrueDarkness: false };

  type Tier = 'clear' | 'marginal' | 'poor';
  
  const TIER_CLEAR = 65;
  const TIER_MARGINAL = 35;


  function tierFor(score: number) : Tier {
    return(score >= TIER_CLEAR ? 'clear' : score >= TIER_MARGINAL ? 'marginal' : 'poor');
  }

  type WeekEntry = { date: Date; label: string } & (
    | { hasTrueDarkness: true; score: number; tier: Tier; cloudDataAvailable: boolean }
    | { hasTrueDarkness: false }
  );

  const dayLabels = ["M", "T", "W", "TH", "F", "S", "S"];

@Injectable({ providedIn: 'root' })
export class SitesService {
  readonly sites = signal<Site[]>(SITES);
  private weather = inject(WeatherService)
  private _selectedSiteId = signal<string | null>(null);
  readonly selectedSiteId = this._selectedSiteId.asReadonly();
  readonly selectedSite = computed(() => 
    this.sites().find(s => s.id === this.selectedSiteId()) ?? null
  );
  
  selectSite(id: string) {
    this._selectedSiteId.set(id);
    const site = this.sites().find(s => s.id === id);
    this.selectNight(site ? siteToday(site).toJSDate() : new Date());
  }
  private _selectedNight = signal<Date>(new Date());
  readonly selectedNight = this._selectedNight.asReadonly();
  selectNight(date: Date) { this._selectedNight.set(date);}

  readonly weekScores = computed<WeekEntry[]>(() => {
    const site = this.selectedSite();
    const entries: WeekEntry[] = [];
    if (!site) return [];
    const start = siteToday(site);
    for (let i = 0; i < 7; i++) {
      const date = start.plus({ days: i });
      const d = date.toJSDate();
      const label = dayLabels[date.weekday - 1];
      const darkness = getDarknessWindow(site, d);

      if (!darkness.hasTrueDarkness) {
        entries.push({
            date: d,
            label,
            hasTrueDarkness: false
        });
        continue;
      }

      const interval = Interval.fromDateTimes(darkness.start, darkness.end) as Interval<true>;
      const moon = getMoonOverlap(site, interval);

      const clouds = this.weather.cloudsFor(site, interval);

      const result = computeScore(interval.length('hours'), moon.overlapFraction, moon.illuminationFraction, clouds);
      const score = result.score;
      entries.push({
        date: d,
        label,
        hasTrueDarkness: true,
        score,
        tier: tierFor(score),
        cloudDataAvailable: clouds.available
      });
    }
    return entries;
  })

  readonly bestNight = computed<Date | null>(() => {
  const scores = this.weekScores();

  let bestDate: Date | null = null;
  let bestScore = -Infinity;

  for (const entry of scores) {
    if (!entry.hasTrueDarkness) continue;
    if (entry.score > bestScore) {
      bestScore = entry.score;
      bestDate = entry.date;
    }
  }
  return bestDate;
});
// get all sites scores from tonight and mapping them to siteid - order: darkwindow->moon->clouds->score
  readonly tonightScores = computed<Map<string, TonightScore>>(() => { 
    const m = new Map<string, TonightScore>();
    for (const site of this.sites()) {
      const darkness = getDarknessWindow(site, new Date());
      if (!darkness.hasTrueDarkness) {
        m.set(site.id, {hasTrueDarkness: false})
        continue;
      };
      const interval = Interval.fromDateTimes(darkness.start, darkness.end) as Interval<true>;
      const moon = getMoonOverlap(site, interval);

      const clouds = this.weather.cloudsFor(site, interval);

      const result = computeScore(interval.length('hours'), moon.overlapFraction, moon.illuminationFraction, clouds);
      const score = result.score;

      m.set(site.id, {
        hasTrueDarkness: true,
        score,
        tier: tierFor(score),
        cloudDataAvailable: clouds.available
      })
    }
    return m;
  });

  readonly selectedNightLabel = computed<string>(() => {
    const site = this.selectedSite();
    const dt = DateTime.fromJSDate(this.selectedNight());
    return (site ? dt.setZone(site.timezone) : dt).toFormat('ccc · LLL d');
  });

  readonly nightInfo = computed<NightInfo | null>(() => {
    const site = this.selectedSite();
    if (!site) return null;

    const forecast = this.weather.siteForecast().get(site.id);

    const date = this.selectedNight();
    const darkness = getDarknessWindow(site, date);

    if (!darkness.hasTrueDarkness) return { hasTrueDarkness: false };
    const interval = Interval.fromDateTimes(darkness.start, darkness.end) as Interval<true>;
    const civilInterval = Interval.fromDateTimes(darkness.dusk, darkness.dawn) as Interval<true>;

    const clouds = this.weather.cloudsFor(site, interval);
    // scratch — Wednesday diagnosis, in nightInfo right after the cloudsFor call:
    const cloudData: CloudData = clouds.available ? { cloudDataAvailable: true, cloudAvg: Math.round(clouds.avgCloud) } : { cloudDataAvailable: false, cloudAvg: null };

    const moon = getMoonOverlap(site, interval);
    const moonDisplay = getMoonOverlap(site, civilInterval);
    const moonOverlapDisplay = moon.overlapMinutes > 0 ? Duration.fromObject({ minutes: moon.overlapMinutes }).toFormat("h'h' m'm'") : 'Out of the way ✅';
    const result = computeScore(interval.length('hours'), moon.overlapFraction, moon.illuminationFraction, clouds);
    const score = result.score;

    return {
      hasTrueDarkness: true,
      darknessWindow: { start: darkness.start, end: darkness.end },
      civilDusk: darkness.dusk,
      civilDawn: darkness.dawn,
      moonSegments: moonDisplay.segments,
      darkDuration: darkness.end.diff(darkness.start).toFormat("h'h' m'm'"),
      moonIllumination: Math.round(moon.illuminationFraction * 100),
      moonOverlapDisplay,
      score,
      tier: tierFor(score),
       cloudHours: forecast?.hours.filter(h => civilInterval.contains(h.time)) ?? [],
      ...cloudData
    };
  });
}