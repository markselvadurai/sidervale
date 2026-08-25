import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DateTime } from 'luxon';
import { vi } from 'vitest';
import { SitesService } from './sites';
import { ScoresService } from './scores';
import { WeatherService } from './weather';
import { ClockService } from './clock';
import { ScoresArtifact } from '../engines/artifact';
import { currentObservingNight } from '../engines/astronomy';
import { plusNights } from '../models/observing-night';
import { Site } from '../models/site';

// 16:00 EDT Aug 25 — after any sunrise, before midnight: "tonight" is unambiguous
const NOW = DateTime.fromMillis(Date.UTC(2026, 7, 25, 20, 0), { zone: 'utc' });

const SITE: Site = {
  id: 'test-site',
  name: 'Test Site',
  coordinates: { lat: 45.6621, lng: -81.9679 },
  timezone: 'America/Toronto',
  designations: [],
  countries: ['canada'],
  provinces: [],
  brightness: { ratio: 0.05, mpsas: 21.95, zone: '1a', atlasYear: 2024 },
  urls: {},
};
// a second site so "fetch the selected site" and "fan out to every site" are distinguishable
const SITE_B: Site = { ...SITE, id: 'other-site', coordinates: { lat: 52.87, lng: -118.08 } };

function artifactNight(date: string, score: number, cloudAvg: number | null = 20) {
  return {
    date,
    dark: true as const,
    score,
    tier: 'wrong-on-purpose',
    cloudAvg,
    coverage: 1,
    moonIllumination: 50,
    moonOverlapMinutes: 100,
    darkStart: 'x',
    darkEnd: 'y',
  };
}

describe('SitesService with the scores artifact', () => {
  let service: SitesService;
  let weather: WeatherService;
  let clock: ClockService;
  const artifactSig = signal<ScoresArtifact | null>(null);

  beforeEach(async () => {
    artifactSig.set(null);
    TestBed.configureTestingModule({
      providers: [{ provide: ScoresService, useValue: { usable: artifactSig.asReadonly() } }],
    });
    service = TestBed.inject(SitesService);
    weather = TestBed.inject(WeatherService);
    clock = TestBed.inject(ClockService);
    clock.refresh(NOW);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ sites: [SITE, SITE_B] }))),
    );
    await service.load();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('tonight uses the artifact night matching the site-local date, re-deriving the tier', () => {
    const tonight = currentObservingNight(SITE, NOW);
    // decoy FIRST night dated yesterday: an index-based "take nights[0]" must fail here
    artifactSig.set({
      generatedAt: 't',
      sites: {
        [SITE.id]: {
          nights: [
            artifactNight(plusNights(tonight, -1).localDate, 99),
            artifactNight(tonight.localDate, 55),
          ],
        },
      },
    });

    const entry = service.tonightScores().get(SITE.id);
    expect(entry).toEqual({
      hasTrueDarkness: true,
      score: 55,
      tier: 'marginal', // 55 → marginal per the shared bands, artifact tier string ignored
      cloudDataAvailable: true,
    });
  });

  it('advances "tonight" when the clock crosses into the next observing day', () => {
    const tonight = currentObservingNight(SITE, NOW);
    const tomorrow = plusNights(tonight, 1);
    artifactSig.set({
      generatedAt: 't',
      sites: {
        [SITE.id]: {
          nights: [artifactNight(tonight.localDate, 55), artifactNight(tomorrow.localDate, 60)],
        },
      },
    });

    expect(service.tonightScores().get(SITE.id)).toMatchObject({ score: 55 });
    clock.refresh(NOW.plus({ days: 1 })); // 16:00 EDT next day — well past sunrise
    expect(service.tonightScores().get(SITE.id)).toMatchObject({ score: 60 });
  });

  it('falls back to astronomy for artifact misses without ever touching the forecast map', () => {
    const cloudsSpy = vi.spyOn(weather, 'cloudsFor');
    artifactSig.set({ generatedAt: 't', sites: {} }); // artifact present, sites missing

    const entry = service.tonightScores().get(SITE.id);
    if (!entry || !entry.hasTrueDarkness) throw new Error('expected a scored entry');
    expect(entry.cloudDataAvailable).toBe(false);
    expect(cloudsSpy).not.toHaveBeenCalled(); // the fan-out guard
  });

  it('weekScores resolves per night by DATE: decoy night, 6 hits, 1 live trailing night', () => {
    const start = currentObservingNight(SITE, NOW);
    const nights = [
      artifactNight(plusNights(start, -1).localDate, 99), // decoy: index i ≠ date start+i
      ...Array.from({ length: 6 }, (_, i) => artifactNight(plusNights(start, i).localDate, 40 + i)),
    ];
    artifactSig.set({ generatedAt: 't', sites: { [SITE.id]: { nights } } });
    service.selectSite(SITE.id);

    const week = service.weekScores();
    expect(week).toHaveLength(7);
    const scored = week.filter((e) => e.hasTrueDarkness);
    expect(scored.slice(0, 6).map((e) => e.score)).toEqual([40, 41, 42, 43, 44, 45]);
    // the trailing night is genuinely live-scored dark — not darkless, not an artifact hit
    const trailing = week[6];
    expect(trailing.hasTrueDarkness).toBe(true);
    if (!trailing.hasTrueDarkness) throw new Error('unreachable');
    expect(trailing.cloudDataAvailable).toBe(false);
  });

  it('bestNight never crowns an unpenalized astronomy-only night over cloud-aware ones', () => {
    const start = currentObservingNight(SITE, NOW);
    // artifact scores are LOW on purpose: any astronomy-only score (≥ ~26 by construction of
    // the scoring floors) would beat them numerically — the crown must still stay cloud-aware
    const nights = Array.from({ length: 6 }, (_, i) =>
      artifactNight(plusNights(start, i).localDate, 1 + i),
    );
    artifactSig.set({ generatedAt: 't', sites: { [SITE.id]: { nights } } });
    service.selectSite(SITE.id);

    const best = service.bestNight();
    if (!best) throw new Error('expected a best night');
    const crowned = service.weekScores().find((e) => e.night.localDate === best.localDate);
    if (!crowned || !crowned.hasTrueDarkness) throw new Error('expected a scored crowned night');
    expect(crowned.cloudDataAvailable).toBe(true);
    expect(crowned.score).toBe(6); // the best of the cloud-aware pool, not the trailing ~26+
  });

  it('the headline falls back to the artifact score when live clouds are unavailable', () => {
    const tonight = currentObservingNight(SITE, NOW);
    artifactSig.set({
      generatedAt: 't',
      sites: { [SITE.id]: { nights: [artifactNight(tonight.localDate, 2, 89)] } },
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('meteo down'))); // forecast fails
    service.selectSite(SITE.id);

    const info = service.nightInfo();
    if (!info || !info.hasTrueDarkness) throw new Error('expected a scored night');
    // the marker shows the artifact's 2 — the headline must not contradict it with a 30-something
    expect(info.score).toBe(2);
    expect(info.cloudDataAvailable).toBe(true);
    expect(info.cloudAvg).toBe(89);
  });

  it('selectSite triggers exactly one on-demand forecast fetch, for the selected site only', () => {
    const loadSpy = vi.spyOn(weather, 'loadSite').mockResolvedValue();
    service.selectSite(SITE.id);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy).toHaveBeenCalledWith(SITE);
  });
});
