import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { SitesService } from './sites';
import { ScoresService } from './scores';
import { WeatherService } from './weather';
import { ScoresArtifact } from '../engines/artifact';
import { currentObservingNight } from '../engines/astronomy';
import { plusNights } from '../models/observing-night';
import { Site } from '../models/site';

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

function artifactNight(date: string, score: number) {
  return {
    date,
    dark: true as const,
    score,
    tier: 'wrong-on-purpose',
    cloudAvg: 20,
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
  const artifactSig = signal<ScoresArtifact | null>(null);

  beforeEach(async () => {
    artifactSig.set(null);
    TestBed.configureTestingModule({
      providers: [{ provide: ScoresService, useValue: { artifact: artifactSig.asReadonly() } }],
    });
    service = TestBed.inject(SitesService);
    weather = TestBed.inject(WeatherService);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ sites: [SITE] }))),
    );
    await service.load();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('tonight uses the artifact night matching the site-local date, re-deriving the tier', () => {
    const tonight = currentObservingNight(SITE).localDate;
    artifactSig.set({
      generatedAt: 't',
      sites: { [SITE.id]: { nights: [artifactNight(tonight, 55)] } },
    });

    const entry = service.tonightScores().get(SITE.id);
    expect(entry).toEqual({
      hasTrueDarkness: true,
      score: 55,
      tier: 'marginal', // 55 → marginal per the shared bands, artifact tier string ignored
      cloudDataAvailable: true,
    });
  });

  it('falls back to astronomy for artifact misses without ever touching the forecast map', () => {
    const cloudsSpy = vi.spyOn(weather, 'cloudsFor');
    artifactSig.set({ generatedAt: 't', sites: {} }); // artifact present, site missing

    const entry = service.tonightScores().get(SITE.id);
    if (!entry || !entry.hasTrueDarkness) throw new Error('expected a scored entry');
    expect(entry.cloudDataAvailable).toBe(false);
    expect(cloudsSpy).not.toHaveBeenCalled(); // the fan-out guard
  });

  it('weekScores resolves per night: 6 artifact hits + 1 live trailing night', () => {
    const start = currentObservingNight(SITE);
    const nights = Array.from({ length: 6 }, (_, i) =>
      artifactNight(plusNights(start, i).localDate, 40 + i),
    );
    artifactSig.set({ generatedAt: 't', sites: { [SITE.id]: { nights } } });
    service.selectSite(SITE.id);

    const week = service.weekScores();
    expect(week).toHaveLength(7);
    const scored = week.filter((e) => e.hasTrueDarkness);
    // first six carry the artifact's scores; the seventh is computed live without a forecast
    expect(scored.slice(0, 6).map((e) => e.score)).toEqual([40, 41, 42, 43, 44, 45]);
    expect(week[6].hasTrueDarkness && week[6].cloudDataAvailable).toBe(false);
  });

  it('selectSite triggers the single on-demand forecast fetch', () => {
    const loadSpy = vi.spyOn(weather, 'loadSite').mockResolvedValue();
    service.selectSite(SITE.id);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy).toHaveBeenCalledWith(SITE);
  });
});
