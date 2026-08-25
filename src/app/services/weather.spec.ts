import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { WeatherService } from './weather';
import { SiteCore } from '../models/site';

const SITE: SiteCore = {
  id: 'flight-test',
  coordinates: { lat: 45.66, lng: -81.97 },
  timezone: 'America/Toronto',
};

const PAYLOAD = { hourly: { time: ['2026-08-25T00:00'], cloud_cover: [10] } };

describe('WeatherService in-flight handling', () => {
  let service: WeatherService;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(WeatherService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('overlapping loadSite calls share one flight: one request, pending until it settles', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchSpy = vi.fn().mockReturnValue(new Promise<Response>((r) => (resolveFetch = r)));
    vi.stubGlobal('fetch', fetchSpy);

    const first = service.loadSite(SITE);
    const second = service.loadSite(SITE); // double-click
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(service.pending().has(SITE.id)).toBe(true);

    resolveFetch(new Response(JSON.stringify(PAYLOAD)));
    await Promise.all([first, second]);
    expect(service.pending().has(SITE.id)).toBe(false);
    expect(service.siteForecast().get(SITE.id)?.hours).toHaveLength(1);
  });

  it('clears pending only when the shared flight settles, even after an early failure path', async () => {
    // first flight rejects; a second call issued after settlement starts a NEW flight
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('blip')));
    await service.loadSite(SITE);
    expect(service.pending().has(SITE.id)).toBe(false);

    let resolveFetch!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise<Response>((r) => (resolveFetch = r))),
    );
    const retry = service.loadSite(SITE);
    expect(service.pending().has(SITE.id)).toBe(true); // the live flight owns pending
    resolveFetch(new Response(JSON.stringify(PAYLOAD)));
    await retry;
    expect(service.pending().has(SITE.id)).toBe(false);
  });
});
