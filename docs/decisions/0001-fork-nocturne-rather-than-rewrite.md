# 0001 — Fork Nocturne rather than rewrite

**Status:** accepted
**Date:** 2026-08-23

## Context

Nocturne v1 is a hand-built Angular 21 stargazing planner for 7 Ontario dark-sky sites, frozen at `v1.0`. Sidervale takes the same product thesis global (~300 certified sites). Two things were in tension: v1's value as _hand-built_ proof of authorship, and the desire to move fast on v2 with heavy AI assistance.

## Options

1. **Extend v1 in place.** Fastest to start. Destroys the authorship line — v1's git history would interleave hand-written and AI-directed commits, and the "I built this myself" claim becomes unverifiable.
2. **Rewrite from scratch.** Cleanest separation. Discards genuinely good, well-tested work: the engines are pure and correct, and the night strip is the product's signature element.
3. **Fork into a new repo with fresh history.** Chosen.

## Decision

Fork. v1 stays frozen at `v1.0` in its own repo with its own history and decision log. Sidervale starts with a fresh `git init` — no shared history, no shared remote — so every commit here is unambiguously part of the AI-directed project.

Ported as-is: the engines, the night strip, the design tokens, the light-pollution tile configuration. Dropped: an unreferenced helper, an unused dependency, a stale editor config.

## Consequences

- The two repos will drift. Bug fixes do not propagate automatically; v1 is frozen, so this is intended rather than a maintenance burden.
- Fresh history means the port's provenance is not visible in `git log`. That is what this file and the README's "Lineage" section are for.
- `suncalc` is pinned to exactly `2.0.1` on the way across: this build reports altitudes in **degrees** and `getMoonOverlap` reads that value directly, so a silent minor bump could reinterpret every moon calculation without failing loudly.
- The `localStorage` cache key was namespaced to `sidervale:forecast:*`. Without this, a browser that had visited Nocturne would serve stale seven-site data to the new app.
