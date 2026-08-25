import { computed, inject, Injectable, signal } from '@angular/core';
import { Site } from '../models/site';
import { parseSitesDataset } from '../data/parse-sites';
import { artifactNightFor, toNightScore } from '../engines/artifact';
import { currentObservingNight, getDarknessWindow, getMoonOverlap } from '../engines/astronomy';
import { ScoresService } from './scores';
import { ClockService } from './clock';
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
  private scoresService = inject(ScoresService);
  private clock = inject(ClockService);

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
      this.selectNight(currentObservingNight(site, this.clock.now()));
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
    const record = this.scoresService.usable()?.sites[site.id];
    const start = currentObservingNight(site, this.clock.now());
    for (let i = 0; i < 7; i++) {
      const night = plusNights(start, i);
      const label = dayLabels[noonOf(site, night).weekday - 1];

      const hit = record ? artifactNightFor(record, night.localDate) : null;
      if (hit) {
        const ns = toNightScore(hit);
        entries.push(
          ns.hasTrueDarkness ? { night, label, ...ns } : { night, label, hasTrueDarkness: false },
        );
        continue;
      }

      // artifact miss (absent, stale, or a trailing night past its horizon): live compute,
      // selected site only - its forecast is on demand, so no fan-out is possible here
      const darkness = getDarknessWindow(site, night);
      if (!darkness.hasTrueDarkness) {
        entries.push({ night, label, hasTrueDarkness: false });
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
      entries.push({
        night,
        label,
        hasTrueDarkness: true,
        score: result.score,
        tier: tierFor(result.score),
        cloudDataAvailable: clouds.available,
      });
    }
    return entries;
  });

  readonly bestNight = computed<ObservingNight | null>(() => {
    const scores = this.weekScores().filter((e) => e.hasTrueDarkness);
    // dropping the cloud term can only RAISE a score, so an astronomy-only night may never
    // outrank cloud-aware ones; compare like with like, fall back only when nothing has clouds
    const cloudAware = scores.filter((e) => e.cloudDataAvailable);
    const pool = cloudAware.length > 0 ? cloudAware : scores;

    let best: ObservingNight | null = null;
    let bestScore = -Infinity;
    for (const entry of pool) {
      if (entry.score > bestScore) {
        bestScore = entry.score;
        best = entry.night;
      }
    }
    return best;
  });
  // artifact-first: marker tiers come from the precompute; misses degrade to astronomy-only
  readonly tonightScores = computed<Map<string, TonightScore>>(() => {
    const artifact = this.scoresService.usable();
    const now = this.clock.now(); // reactive: "tonight" must advance past sunrise in an open tab
    const m = new Map<string, TonightScore>();
    for (const site of this.sites()) {
      const hit = artifact
        ? artifactNightFor(artifact.sites[site.id], currentObservingNight(site, now).localDate)
        : null;
      m.set(site.id, hit ? toNightScore(hit) : this.astronomyTonight(site, now));
    }
    return m;
  });

  // deliberately no cloudsFor: with zero forecast-map dependency here, a forecast arriving
  // for one site can never re-score all 293 - the v1 fan-out is structurally impossible
  private astronomyTonight(site: Site, now: DateTime): TonightScore {
    const darkness = getDarknessWindow(site, currentObservingNight(site, now));
    if (!darkness.hasTrueDarkness) return { hasTrueDarkness: false };
    const interval = Interval.fromDateTimes(darkness.start, darkness.end) as Interval<true>;
    const moon = getMoonOverlap(site, interval);
    const { score } = computeScore(
      interval.length('hours'),
      moon.overlapFraction,
      moon.illuminationFraction,
      { available: false },
    );
    return { hasTrueDarkness: true, score, tier: tierFor(score), cloudDataAvailable: false };
  }

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
    // live clouds first (freshest); artifact second (its cloud knowledge is already on the
    // marker — the headline must not contradict it); astronomy-only last
    const artifactHit = clouds.available
      ? null
      : artifactNightFor(this.scoresService.usable()?.sites[site.id], night.localDate);
    const artifactScore = artifactHit && artifactHit.dark ? toNightScore(artifactHit) : null;
    const cloudData: CloudData =
      clouds.available || (artifactScore?.hasTrueDarkness && artifactScore.cloudDataAvailable)
        ? {
            cloudDataAvailable: true,
            cloudAvg: clouds.available
              ? Math.round(clouds.avgCloud)
              : (artifactHit as Extract<typeof artifactHit, { dark: true }>).cloudAvg!,
          }
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
    const score =
      !clouds.available && artifactScore?.hasTrueDarkness ? artifactScore.score : result.score;

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
