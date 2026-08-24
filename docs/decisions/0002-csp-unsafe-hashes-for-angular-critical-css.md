# 0002 — CSP allows Angular's critical-CSS handler by hash, not `unsafe-inline`

**Status:** accepted
**Date:** 2026-08-24

## Context

The first deploy shipped `script-src 'self'`, which broke the live site in a non-obvious way. Angular's
production build inlines above-the-fold CSS and defers the full stylesheet as
`<link media="print" onload="this.media='all'">`. The CSP blocked that inline handler, so the app's
only stylesheet — which bundles `styles.scss` _and_ `leaflet.css` — stayed print-only. The page
rendered with no global CSS and the map collapsed to a single tile. One root cause, two symptoms.

## Options

1. **`script-src 'unsafe-inline'`.** Fixes it by disabling inline-script protection entirely. Rejected.
2. **Disable the optimization** (`optimization.styles.inlineCritical: false`). Keeps the strict CSP but
   makes the stylesheet render-blocking for every visitor, and couples the deploy config to a build flag
   someone could later re-enable without knowing why it was off.
3. **Allow exactly this handler by hash:** `'unsafe-hashes' 'sha256-MhtPZXr7+LpJUY5qtMutB+qWfQtMaPccfe7QXtCcEYc='`. Chosen.

## Decision

Option 3. The hash is the SHA-256 of the exact string `this.media='all'`, so the policy admits that one
handler and nothing else; arbitrary inline scripts and other handlers stay blocked. `'unsafe-hashes'` is
required because plain hashes apply only to `<script>` bodies, not event handlers — the name is scarier
than the scope.

Also allowed: `https://static.cloudflareinsights.com` (script-src) and `https://cloudflareinsights.com`
(connect-src) for Cloudflare Web Analytics, which Pages injects at the edge. Cookieless, and it is the
source of the user-count number. Disabling Web Analytics in the dashboard is the way to remove it —
not editing the CSP first.

## Consequences

- If Angular ever changes the emitted handler string, the hash stops matching and the site breaks the
  same way again. The failure is loud in the console and this record is the map back.
- The hash was verified against the deployed DOM, not copied from documentation.
- Local CSP verification exists: serve `dist/` with the header from `public/_headers` and check the
  stylesheet's `media` flips to `all` (this is how the fix was tested before pushing).
