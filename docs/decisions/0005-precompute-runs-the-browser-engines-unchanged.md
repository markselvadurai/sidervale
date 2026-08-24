# 0005 — The precompute imports the browser's engines, unchanged

**Status:** accepted
**Date:** 2026-08-25

## Context

Client-side forecast fetching caps out around 50 users/day at ~200 sites on Open-Meteo's free
tier. A server-side precompute every 3 hours makes the API cost a function of _site count_, not
user count (~2,300 calls/day at 293 sites, 8 runs — inside the 10k/day tier). The precompute must
produce the same scores the browser would, or the two surfaces drift.

## Decision

`tools/precompute/precompute.ts` imports the engines **directly from `src/app/engines/`** — the
same files the browser bundles, no copies, no adapters beyond a minimal `Site` shim. This is what
the "engines stay pure" invariant was _for_; the fork decision (ADR 0001) preserved it on purpose.

One violation had to be repaired to get there: `engines/weather.ts` carried `fetch` and a clock
read from v1. The engine now owns only the pure halves (`forecastUrl`, `parseForecast`); the fetch
lives in `WeatherService` (browser) and the precompute shell (Node), each injecting its own clock.
`tierFor` moved from the service into the scorer engine for the same reason — the artifact carries
tiers, and thresholds defined in an Angular service would have needed duplicating.

## Consequences

- One source of truth for scoring: an engine change propagates to browser and artifact in the same
  commit, and the same test suite covers both surfaces.
- The dead `WeatherService` constructor (non-null-asserted a specific Ontario site; would throw at
  boot when the site list changes) was deleted on the way, per the long-standing plan note.
- The artifact is regenerated every run and is not committed; a stale or missing artifact degrades
  to the client's astronomy-only mode rather than breaking.
- First full run validated the fusion globally: full-moon week yielded zero "clear" nights at all
  293 sites — the correct answer, delivered by the same code that scored 7 Ontario sites in v1.
