import { Injectable, signal } from '@angular/core';
import {
  avgCloudDuring,
  CloudCoverResult,
  Forecast,
  ForecastPayload,
  forecastUrl,
  parseForecast,
} from '../engines/weather';
import { DateTime, Interval } from 'luxon';
import { SiteCore } from '../models/site';

// gem updates every 6 hours, 3 hour ttl keeps us within one model run without redundant fetching
const TTL_HOURS = 3;

export type StoredForecast = {
  siteId: string;
  savedAt: string;
  hours: { time: string; cloudCover: number }[];
};

@Injectable({ providedIn: 'root' })
export class WeatherService {
  private _siteForecast = signal<Map<string, Forecast>>(new Map());
  readonly siteForecast = this._siteForecast.asReadonly();
  // in-flight is not "unavailable": the panel must never claim a failure that is merely pending
  private _pending = signal<ReadonlySet<string>>(new Set());
  readonly pending = this._pending.asReadonly();

  private setPending(siteId: string, isPending: boolean) {
    const next = new Set(this._pending());
    if (isPending) next.add(siteId);
    else next.delete(siteId);
    this._pending.set(next);
  }

  private storeForecast(siteId: string, forecast: Forecast) {
    const next = new Map(this._siteForecast());
    next.set(siteId, forecast);
    this._siteForecast.set(next);
  }

  loadAll(sites: SiteCore[]) {
    sites.forEach((s) => void this.loadSite(s));
  }

  // one flight per site: overlapping calls (double-click, rapid reselection) share the same
  // promise, so no duplicate requests and no early pending-clear while a fetch is still live
  private inFlight = new Map<string, Promise<void>>();

  loadSite(site: SiteCore): Promise<void> {
    const existing = this.inFlight.get(site.id);
    if (existing) return existing;

    const cached = this.loadFromCache(site);
    if (cached) {
      this.storeForecast(site.id, cached);
      if (this.isFresh(cached)) {
        return Promise.resolve();
      }
    }

    this.setPending(site.id, true);
    const flight = (async () => {
      try {
        const fresh = await this.fetchForecast(site);
        localStorage.setItem(this.cacheKey(site.id), JSON.stringify(this.toStorage(fresh)));
        this.storeForecast(site.id, fresh);
      } catch (error) {
        console.warn(`forecast fetch failed for ${site.id}`);
      } finally {
        this.inFlight.delete(site.id);
        this.setPending(site.id, false);
      }
    })();
    this.inFlight.set(site.id, flight);
    return flight;
  }

  private async fetchForecast(site: SiteCore): Promise<Forecast> {
    const res = await fetch(forecastUrl(site));
    if (!res.ok) throw new Error(`Open-Meteo ${res.status} for ${site.id}`);
    return parseForecast(site, (await res.json()) as ForecastPayload, DateTime.now());
  }

  private cacheKey(siteId: string): string {
    return `sidervale:forecast:${siteId}`;
  }

  isFresh(forecast: Forecast): boolean {
    return Math.abs(forecast.savedAt.diffNow('hours').as('hours')) < TTL_HOURS;
  }

  loadFromCache(site: SiteCore): Forecast | null {
    const cachedSiteJSON = localStorage.getItem(this.cacheKey(site.id));
    if (!cachedSiteJSON) return null;
    try {
      return this.fromStorage(JSON.parse(cachedSiteJSON) as StoredForecast);
    } catch {
      localStorage.removeItem(this.cacheKey(site.id));
      return null;
    }
  }

  private toStorage(forecast: Forecast): StoredForecast {
    const savedAt = forecast.savedAt.toISO()!;
    const hours = forecast.hours.map((h) => ({
      time: h.time.toISO()!,
      cloudCover: h.cloudCover,
    }));
    return { siteId: forecast.siteId, savedAt, hours };
  }

  private fromStorage(forecast: StoredForecast): Forecast {
    const savedAt = DateTime.fromISO(forecast.savedAt);
    const hours = forecast.hours.map((h) => ({
      time: DateTime.fromISO(h.time, { setZone: true }),
      cloudCover: h.cloudCover,
    }));
    return { siteId: forecast.siteId, savedAt, hours };
  }

  cloudsFor(site: SiteCore, window: Interval): CloudCoverResult {
    const forecast = this._siteForecast().get(site.id);
    if (!forecast) return { available: false };
    return avgCloudDuring(forecast, window);
  }
}
