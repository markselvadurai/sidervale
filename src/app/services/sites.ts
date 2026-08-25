import { computed, inject, Injectable, signal } from '@angular/core';
import { Site } from '../models/site';
import { parseSitesDataset } from '../data/parse-sites';
import { currentObservingNight, getDarknessWindow, getMoonOverlap } from '../engines/astronomy';
import { noonOf, ObservingNight, plusNights } from '../models/observing-night';
import { DateTime, Duration, Interval } from 'luxon';
import { WeatherService } from './weather';
import { computeScore, NightScore, Tier, tierFor } from '../engines/scorer';
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
      cloudHours: { time: DateTime; cloudCover: number }[];
    } & CloudData);

export type ScoredNight = Extract<NightInfo, { hasTrueDarkness: true }>;

type TonightScore =
  | { hasTrueDarkness: true; score: number; tier: Tier; cloudDataAvailable: boolean }
  | { hasTrueDarkness: false };

type WeekEntry = { night: ObservingNight; label: string } & (
  | { hasTrueDarkness: true; score: number; tier: Tier; cloudDataAvailable: boolean }
  | { hasTrueDarkness: false }
);

const dayLabels = ['M', 'T', 'W', 'TH', 'F', 'S', 'S'];

@Injectable({ providedIn: 'root' })
export class SitesService {
  private _sites = signal<Site[]>([]);
  readonly sites = this._sites.asReadonly();
  // the dataset IS the app: its failure must be visible state, not a devtools whisper
  private _datasetState = signal<'loading' | 'ready' | 'failed'>('loading');
  readonly datasetState = this._datasetState.asReadonly();
  private weather = inject(WeatherService);

  async load() {
    try {
      const res = await fetch('data/sites.json');
      if (!res.ok) throw new Error(`sites.json ${res.status}`);
      this._sites.set(parseSitesDataset(await res.json()));
      this._datasetState.set('ready');
    } catch (error) {
      this._datasetState.set('failed');
      console.warn('sites dataset failed to load', error);
    }
  }
  private _selectedSiteId = signal<string | null>(null);
  readonly selectedSiteId = this._selectedSiteId.asReadonly();
  readonly selectedSite = computed(
    () => this.sites().find((s) => s.id === this.selectedSiteId()) ?? null,
  );

  selectSite(id: string) {
    this._selectedSiteId.set(id);
    const site = this.sites().find((s) => s.id === id);
    if (site) {
      this.selectNight(currentObservingNight(site));
      void this.weather.loadSite(site); // the only weather trigger — one site, on demand
    }
  }
  private _selectedNight = signal<ObservingNight | null>(null);
  readonly selectedNight = this._selectedNight.asReadonly();
  selectNight(night: ObservingNight) {
    this._selectedNight.set(night);
  }

  readonly weekScores = computed<WeekEntry[]>(() => {
    const site = this.selectedSite();
    const entries: WeekEntry[] = [];
    if (!site) return [];
    const start = currentObservingNight(site);
    for (let i = 0; i < 7; i++) {
      const night = plusNights(start, i);
      const label = dayLabels[noonOf(site, night).weekday - 1];
      const darkness = getDarknessWindow(site, night);

      if (!darkness.hasTrueDarkness) {
        entries.push({
          night,
          label,
          hasTrueDarkness: false,
        });
        continue;
      }

      const interval = Interval.fromDateTimes(darkness.start, darkness.end) as Interval<true>;
      const moon = getMoonOverlap(site, interval);

      const clouds = this.weather.cloudsFor(site, interval);

      const result = computeScore(
        interval.length('hours'),
        moon.overlapFraction,
        moon.illuminationFraction,
        clouds,
      );
      const score = result.score;
      entries.push({
        night,
        label,
        hasTrueDarkness: true,
        score,
        tier: tierFor(score),
        cloudDataAvailable: clouds.available,
      });
    }
    return entries;
  });

  readonly bestNight = computed<ObservingNight | null>(() => {
    const scores = this.weekScores();

    let best: ObservingNight | null = null;
    let bestScore = -Infinity;

    for (const entry of scores) {
      if (!entry.hasTrueDarkness) continue;
      if (entry.score > bestScore) {
        bestScore = entry.score;
        best = entry.night;
      }
    }
    return best;
  });
  // get all sites scores from tonight and mapping them to siteid - order: darkwindow->moon->clouds->score
  readonly tonightScores = computed<Map<string, TonightScore>>(() => {
    const m = new Map<string, TonightScore>();
    for (const site of this.sites()) {
      const darkness = getDarknessWindow(site, currentObservingNight(site));
      if (!darkness.hasTrueDarkness) {
        m.set(site.id, { hasTrueDarkness: false });
        continue;
      }
      const interval = Interval.fromDateTimes(darkness.start, darkness.end) as Interval<true>;
      const moon = getMoonOverlap(site, interval);

      const clouds = this.weather.cloudsFor(site, interval);

      const result = computeScore(
        interval.length('hours'),
        moon.overlapFraction,
        moon.illuminationFraction,
        clouds,
      );
      const score = result.score;

      m.set(site.id, {
        hasTrueDarkness: true,
        score,
        tier: tierFor(score),
        cloudDataAvailable: clouds.available,
      });
    }
    return m;
  });

  readonly forecastPending = computed<boolean>(() => {
    const site = this.selectedSite();
    return !!site && this.weather.pending().has(site.id);
  });

  readonly selectedNightLabel = computed<string>(() => {
    const site = this.selectedSite();
    const night = this.selectedNight();
    if (!site || !night) return '';
    return noonOf(site, night).toFormat('ccc · LLL d');
  });

  readonly nightInfo = computed<NightInfo | null>(() => {
    const site = this.selectedSite();
    const night = this.selectedNight();
    if (!site || !night) return null;

    const forecast = this.weather.siteForecast().get(site.id);

    const darkness = getDarknessWindow(site, night);

    if (!darkness.hasTrueDarkness) return { hasTrueDarkness: false };
    const interval = Interval.fromDateTimes(darkness.start, darkness.end) as Interval<true>;
    const civilInterval = Interval.fromDateTimes(darkness.dusk, darkness.dawn) as Interval<true>;

    const clouds = this.weather.cloudsFor(site, interval);
    // scratch — Wednesday diagnosis, in nightInfo right after the cloudsFor call:
    const cloudData: CloudData = clouds.available
      ? { cloudDataAvailable: true, cloudAvg: Math.round(clouds.avgCloud) }
      : { cloudDataAvailable: false, cloudAvg: null };

    const moon = getMoonOverlap(site, interval);
    const moonDisplay = getMoonOverlap(site, civilInterval);
    const moonOverlapDisplay =
      moon.overlapMinutes > 0
        ? Duration.fromObject({ minutes: moon.overlapMinutes }).toFormat("h'h' m'm'")
        : 'Out of the way ✅';
    const result = computeScore(
      interval.length('hours'),
      moon.overlapFraction,
      moon.illuminationFraction,
      clouds,
    );
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
      cloudHours: forecast?.hours.filter((h) => civilInterval.contains(h.time)) ?? [],
      ...cloudData,
    };
  });
}
