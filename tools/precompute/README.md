# Precompute

Runs the browser's pure engines (imported from `src/app/engines/` — unchanged, see ADR 0005)
over `public/data/sites.json`, fetching Open-Meteo cloud cover once per site, and writes
`scores.json`: 7 scored nights per site, each night resolved per-site by `currentObservingNight`.

```bash
npm run precompute          # all 293 sites (~293 API calls, one per site)
LIMIT=3 npm run precompute  # polite dev runs
```

`scores.json` is a regenerated artifact — gitignored, never committed. A failed forecast fetch
degrades that site to astronomy-only scoring (`cloudAvg: null`), mirroring the client's fallback.

Scheduled every 3 hours from CI (next increment); 8 runs/day × 293 sites ≈ 2,300 Open-Meteo
calls/day — the inversion that makes site count, not user count, the API cost driver.
