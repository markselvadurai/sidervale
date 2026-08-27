# 0010 — Site photos come from Wikimedia, verified by coordinates, not from DarkSky

**Status:** accepted
**Date:** 2026-08-27

## Context

Both design returns put a photograph on every ranked row and at the head of the site card, and
the app looks unfinished without one. The obvious source is DarkSky International, since we
already harvest their registry: every certified place has a featured image, and their WordPress
API exposes ready-made `16x9_thumbnail` (240×135) and `4x3_thumbnail` (240×180) renditions.

Their terms of use forbid it. Quoted from
`https://darksky.org/about/legal/terms-of-use/`, read 2026-08-27:

> "Images on this website may only be used for **noncommercial, educational purposes** and must
> complement DarkSky's mission… Images attributed to DarkSky must be credited as such. **Images
> credited to others may not be used without the consent of the photographer / illustrator /
> creator.**… It is prohibited to use any DarkSky image for **commercial use**."

Probing the API made it worse rather than better. Of a twelve-place sample every image was
distinct — these are genuine per-site photographs, not a shared banner set — but **caption,
credit and alt text were empty on eight of them**, so we cannot tell which images DarkSky may
grant and which belong to a photographer whose consent we would need. The four that _were_
credited belonged to third parties (Red Sea Global, Sun Valley Resort, Kosmos), which the terms
place squarely out of reach.

Open-Meteo's free tier already makes Sidervale noncommercial, so the commercial clause is not
binding _today_. Building a visible product feature on a licence that a future price change
would break is a trap, and the consent clause blocks most of the images regardless.

## Options

- **Use DarkSky's images anyway.** Rejected: the terms forbid commercial use outright, and most
  images carry no credit line, so "which of these are theirs to grant" is unanswerable.
- **Email DarkSky for permission.** Real, and still open — their terms invite it. Not a code
  decision, and it would leave monetisation dependent on someone else's goodwill.
- **Generate a thumbnail from our own data** — a sky rendered from Bortle class and tonight's
  moon. Zero licensing risk and unique to us, but it is not a photograph and the mockup's
  polish comes from photographs.
- **Wikimedia, matched by NAME.** Rejected on measurement, which is the important part of this
  record. A live search for "Cherry Springs State Park" returns _Cherry Creek State Park_ in
  Colorado as its second hit, 1,900 km away. Searching "!Ae!Hai Kalahari Heritage Park" returns
  _Tourism in Botswana_; "Minami-Rokuroshi" returns the generic _Dark-sky preserve_ article.
  Name similarity is not evidence.
- **Wikimedia, verified by COORDINATES.** Chosen.

## Decision

**A candidate is believed only when its own coordinates place it at the site, and only when its
licence is free for commercial use.** `tools/dataset/commons.ts` holds both rules and is tested;
`harvest-images.ts` is the I/O shell around them.

- **Coordinate verification.** Wikipedia search supplies candidates; `nearestVerifiedPage` keeps
  only those whose article coordinates fall within **25 km** of our site and picks the nearest,
  ignoring search rank entirely. A candidate with no coordinates is not "probably fine" — it is
  unverifiable, therefore unusable. The radius is judgement: parks are large enough that a lead
  image may sit some way inside one, and 25 km still refuses the next valley over.
- **Licence filtering.** CC0, public domain, CC BY and CC BY-SA only. NC, ND, fair-use, GFDL-only
  and blank are quarantined, so a paid tier later cannot strand the dataset. The rejection is a
  substring test, not a prefix test — "CC BY-NC 4.0" _starts_ like an accepted licence, and a
  prefix check waves through four non-free licences (mutation-tested).
- **Attribution is stored, not derived at render time.** Every accepted image carries artist,
  licence name, licence URL and its Commons file page.
- **Anything uncertain is quarantined with a reason,** the same discipline the rest of the
  pipeline uses. A site with no confident match simply has no photo.

The governing principle is the one already in CLAUDE.md: a model must never produce a fact. **A
photograph of the wrong place is a wrong fact in visual form** — it does not error, it just lies
confidently, exactly like a wrong coordinate.

## Consequences

- **Coverage is partial, and that is the point.** Verification costs matches: remote sites
  (Kalahari, AlUla, Alpes-Azur Mercantour) have no article within 25 km and get no photo. The UI
  must treat a missing image as the normal case, not an error state.
- **Attribution becomes a rendering obligation.** CC BY and CC BY-SA both require credit. The
  photographer's name must appear wherever the image does, or be one interaction away.
- **CC BY-SA's share-alike binds derivative works, not display.** Showing a photo with credit
  creates no derivative — the same reading recorded for ORS data in ADR 0008.
- **The harvest is slow on purpose.** Wikimedia rate-limited a 200 ms cadence within a dozen
  requests; the runner now waits 1.1 s between calls and backs off exponentially on 429. Roughly
  six minutes for 293 sites, run rarely, writing a static file.
- **Two defects the trial run caught, both silent.** MediaWiki accepts underscored titles and
  answers with spaced ones, so keying the lookup on the requested form lost every file with a
  space in its name — three of the first four sites. And Commons wraps unattributed uploads in
  "No machine-readable author provided. _X_ assumed (based on copyright claims)", which would
  have been printed at readers verbatim as the credit.
- **Not closed: asking DarkSky.** If they grant use of the images they hold, those are better
  photographs of exactly the right places. That is Mark's email to send, and this decision does
  not depend on the answer.
