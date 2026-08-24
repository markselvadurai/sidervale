import { DateTime, Interval } from 'luxon';
import { Site } from '../models/site';

export type Forecast = {
  siteId: string;
  savedAt: DateTime;
  hours: { time: DateTime; cloudCover: number }[];
};

export type CloudCoverResult =
  { available: true; avgCloud: number; coverage: number } | { available: false };

export type ForecastPayload = { hourly: { time: string[]; cloud_cover: number[] } };

/** The Open-Meteo request for a site — pure so browser and precompute share one URL scheme. */
export function forecastUrl(site: Site): string {
  return `https://api.open-meteo.com/v1/forecast?latitude=${site.coordinates.lat}&longitude=${site.coordinates.lng}&hourly=cloud_cover&forecast_days=8`;
}

/** Decode an Open-Meteo payload into site-zoned hourly readings. */
export function parseForecast(site: Site, payload: ForecastPayload, savedAt: DateTime): Forecast {
  const hours: Forecast['hours'] = [];
  for (let i = 0; i < payload.hourly.time.length; i++) {
    hours.push({
      time: DateTime.fromISO(payload.hourly.time[i], { zone: 'utc' }).setZone(site.timezone),
      cloudCover: payload.hourly.cloud_cover[i],
    });
  }
  return { siteId: site.id, savedAt, hours };
}

export function avgCloudDuring(forecast: Forecast, window: Interval): CloudCoverResult {
  const hourOverlap = forecast.hours.filter((hour) => window.contains(hour.time));
  if (hourOverlap.length === 0) return { available: false };
  const coverage = Math.min(1, hourOverlap.length / window.length('hours'));
  let avgCloud = 0;
  hourOverlap.forEach((e) => {
    avgCloud += e.cloudCover;
  });
  avgCloud /= hourOverlap.length;

  return { available: true, avgCloud, coverage };
}
