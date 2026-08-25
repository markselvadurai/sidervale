// Phase 4: run the pure engines server-side over the emitted dataset and write the
// score artifact. The engines are imported from src/ UNCHANGED — that is the point.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DateTime, Interval } from 'luxon';
import {
  currentObservingNight,
  getDarknessWindow,
  getMoonOverlap,
} from '../../src/app/engines/astronomy';
import {
  avgCloudDuring,
  Forecast,
  ForecastPayload,
  forecastUrl,
  parseForecast,
} from '../../src/app/engines/weather';
import { computeScore, tierFor } from '../../src/app/engines/scorer';
import { ObservingNight, plusNights } from '../../src/app/models/observing-night';
import { Site, SiteCore } from '../../src/app/models/site';

const UA = 'SidervalePrecompute/0.1 (github.com/markselvadurai/sidervale)';
const NIGHTS = 7;

type NightRecord =
  | { date: string; dark: false }
  | {
      date: string;
      dark: true;
      score: number;
      tier: string;
      cloudAvg: number | null;
      coverage: number | null;
      moonIllumination: number;
      moonOverlapMinutes: number;
      darkStart: string;
      darkEnd: string;
    };

function scoreNight(site: SiteCore, night: ObservingNight, forecast: Forecast | null): NightRecord {
  const darkness = getDarknessWindow(site, night);
  if (!darkness.hasTrueDarkness) return { date: night.localDate, dark: false };

  const window = Interval.fromDateTimes(darkness.start, darkness.end) as Interval<true>;
  const moon = getMoonOverlap(site, window);
  const clouds = forecast ? avgCloudDuring(forecast, window) : { available: false as const };
  const { score } = computeScore(
    window.length('hours'),
    moon.overlapFraction,
    moon.illuminationFraction,
    clouds,
  );
  if (score < 0 || score > 100) throw new Error(`score ${score} out of range for ${site.id}`);

  return {
    date: night.localDate,
    dark: true,
    score,
    tier: tierFor(score),
    cloudAvg: clouds.available ? Math.round(clouds.avgCloud) : null,
    coverage: clouds.available ? Number(clouds.coverage.toFixed(2)) : null,
    moonIllumination: Math.round(moon.illuminationFraction * 100),
    moonOverlapMinutes: Math.round(moon.overlapMinutes),
    darkStart: darkness.start.toISO()!,
    darkEnd: darkness.end.toISO()!,
  };
}

async function main() {
  const dataset = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', 'public', 'data', 'sites.json'), 'utf8'),
  ) as { sites: Site[] };
  const limit = process.env['LIMIT'] ? Number(process.env['LIMIT']) : Infinity;
  const sites = dataset.sites.slice(0, limit);

  const now = DateTime.now();
  const out: Record<string, { nights: NightRecord[] }> = {};
  let fetchFailures = 0;

  for (const site of sites) {
    let forecast: Forecast | null = null;
    try {
      const res = await fetch(forecastUrl(site), { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`${res.status}`);
      forecast = parseForecast(site, (await res.json()) as ForecastPayload, now);
    } catch {
      fetchFailures++; // astronomy-only degradation, same as the client's fallback
    }

    const start = currentObservingNight(site, now);
    const nights = Array.from({ length: NIGHTS }, (_, i) =>
      scoreNight(site, plusNights(start, i), forecast),
    );
    if (nights.length !== NIGHTS) throw new Error(`expected ${NIGHTS} nights for ${site.id}`);
    out[site.id] = { nights };

    await new Promise((r) => setTimeout(r, 50));
  }

  const artifact = { generatedAt: now.toUTC().toISO(), sites: out };
  const path = join(import.meta.dirname, 'scores.json');
  writeFileSync(path, JSON.stringify(artifact) + '\n');

  const all = Object.values(out).flatMap((s) => s.nights);
  const scored = all.filter((n): n is Extract<NightRecord, { dark: true }> => n.dark);
  const withCloud = scored.filter((n) => n.cloudAvg !== null);
  console.log(
    `precompute: ${Object.keys(out).length} sites × ${NIGHTS} nights, ` +
      `${scored.length} scored (${withCloud.length} with cloud data), ` +
      `${all.length - scored.length} darkless, ${fetchFailures} fetch failures → ${path}`,
  );
}

main();
