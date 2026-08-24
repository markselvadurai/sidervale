import { DateTime, Interval } from 'luxon';
import { Site } from '../models/site';

export type Forecast = {
  siteId: string;
  savedAt: DateTime;
  hours: { time: DateTime; cloudCover: number }[];
};

export type CloudCoverResult =
  { available: true; avgCloud: number; coverage: number } | { available: false };

export async function getForecast(site: Site): Promise<Forecast> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${site.coordinates.lat}&longitude=${site.coordinates.lng}&hourly=cloud_cover&forecast_days=8`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status} for ${site.id}`);
  const data = await res.json();
  const hours: Forecast['hours'] = [];
  for (let i = 0; i < data.hourly.time.length; i++) {
    hours.push({
      time: DateTime.fromISO(data.hourly.time[i], { zone: 'utc' }).setZone(site.timezone),
      cloudCover: data.hourly.cloud_cover[i],
    });
  }

  return { siteId: site.id, savedAt: DateTime.now(), hours };
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
