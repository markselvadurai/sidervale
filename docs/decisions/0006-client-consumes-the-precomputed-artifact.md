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
- **Fresh-or-null.** `ScoresService.load()` freshness-gates at load time
  (`ARTIFACT_STALE_HOURS = 6`, two missed runs, tuning constant) and publishes the artifact signal
  only when fresh. Downstream computeds never read a clock for freshness; `artifact() === null` is
  the single fallback trigger.
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

- Freshness is load-time only: a tab left open past 6 h keeps rendering the artifact it loaded.
  Matches the forecast TTL philosophy; revisit with a `visibilitychange` reload if it bites.
- The selected site's headline score uses live clouds while its marker uses the ≤3 h artifact —
  they can differ a few points and occasionally straddle a tier boundary. The panel's fresher data
  wins over cross-surface consistency.
- Alignment rests on date-string equality between client and precompute, guaranteed today because
  both import the same `currentObservingNight` (ADR 0005). If the precompute ever derived nights
  independently, every site would silently degrade to astronomy-only — the alignment mutation test
  and the deployed spot-check are the guards.
