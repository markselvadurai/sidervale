# 0006 — The client consumes the precomputed artifact, fresh-or-null

**Status:** accepted
**Date:** 2026-08-25

## Context

Phase 4 put a scores artifact on the `data` branch, regenerated every 3 hours. The client still
computed everything itself and, worse, eagerly fetched weather for every site at boot — the
50-users/day API ceiling, plus the known quadratic re-score on every forecast arrival.

## Decision

- **Scores come from the artifact; geometry stays live.** Marker tiers, week dots, and headline
  scores read the artifact. The night strip's civil window, moon segments, and hourly clouds are
  client-computed from the engines plus ONE on-demand forecast fetch for the selected site.
  `WeatherService.loadAll` is deleted; nothing fetches 293 forecasts, ever.
- **Fresh-or-null, judged at read time.** `ScoresService.usable` is a computed gating the loaded
  artifact against a reactive `ClockService` (minute tick + visibility refresh): the moment the
  artifact ages past `ARTIFACT_STALE_HOURS = 6` (two missed runs, tuning constant), every consumer
  falls back to astronomy — the gate holds for the tab's whole life, not just at load. The same
  clock signal drives `currentObservingNight` in the store computeds, so "tonight" advances past
  each site's sunrise in an open tab. (Both were adversarial-review findings: the original design
  gated only at load time and froze "tonight" at the last dependency change.)
- **Alignment is a per-date lookup.** The artifact's first night may be yesterday's by the time a
  user loads it (generated pre-sunrise, viewed post-sunrise). `artifactNightFor(record, localDate)`
  looks the client's `currentObservingNight` date up in the artifact's nights — absent, stale,
  missing-site, and advanced-night all collapse to the same miss → astronomy-only for that entry.
- **Tier is re-derived client-side** via `tierFor(score)`; the artifact's tier string is ignored,
  so the scorer stays the one owner of the bands even across artifact/client version skew.
- **The astronomy fallback never touches weather.** `astronomyTonight` scores with clouds
  unavailable — `tonightScores` has no dependency on the forecast Map at all, which is what makes
  the old fan-out structurally impossible rather than merely avoided.

## Accepted risks

- The gate expires without auto-refetch: a tab open past 6 h degrades to astronomy-only until
  reload. Honest but conservative; a stale-triggered re-`load()` is the natural follow-up.
- The selected site's headline prefers live clouds, falls back to the artifact's cloud-aware score
  when the forecast fetch fails (so the headline can never contradict the marker), and shows
  astronomy-only only when both sources are out. In the happy path the headline and marker can
  still differ a few points (live vs ≤3 h-old clouds) — fresher data wins.
- `bestNight` compares only cloud-aware nights when any exist: an astronomy-only score is
  systematically unpenalized and may never take the crown from a cloud-scored night.
- Alignment rests on date-string equality between client and precompute, guaranteed today because
  both import the same `currentObservingNight` (ADR 0005). If the precompute ever derived nights
  independently, every site would silently degrade to astronomy-only — the alignment mutation test
  and the deployed spot-check are the guards.
