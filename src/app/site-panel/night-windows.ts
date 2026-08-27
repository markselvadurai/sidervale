import { DateTime, Interval } from 'luxon';

export type NightWindowRow = { range: string; label: string; tag: string };

/** A stretch of the night, as instants — the strip positions from these, the rows format them. */
export type NightSpan = { start: DateTime; end: DateTime };

type MoonInput = {
  darknessWindow: NightSpan;
  moonDarkSegments: Interval<true>[];
};

type WindowsInput = MoonInput & {
  civilDawn: DateTime;
  moonIllumination: number;
};

const fmt = (a: DateTime, b: DateTime) => `${a.toFormat('HH:mm')} – ${b.toFormat('HH:mm')}`;

/** Moon segments clipped to the dark window, read left to right. */
// clip even though getMoonOverlap already does — a segment from the wrong source (the
// civil-axis set) must not paint moon time outside the window
function clippedMoonSegments(night: MoonInput): NightSpan[] {
  const { start, end } = night.darknessWindow;
  return night.moonDarkSegments
    .map((seg) => ({
      start: seg.start < start ? start : seg.start,
      end: seg.end > end ? end : seg.end,
    }))
    .filter((seg) => seg.start < seg.end)
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());
}

/** The gaps the moon leaves behind: true dark with nothing washing it out. */
export function moonlessDarkSegments(night: MoonInput): NightSpan[] {
  const { end } = night.darknessWindow;
  const gaps: NightSpan[] = [];
  let cursor = night.darknessWindow.start;
  for (const seg of clippedMoonSegments(night)) {
    if (cursor < seg.start) gaps.push({ start: cursor, end: seg.start });
    // overlapping segments must not walk the cursor backwards into a phantom gap
    if (seg.end > cursor) cursor = seg.end;
  }
  if (cursor < end) gaps.push({ start: cursor, end });
  return gaps;
}

// Rod adaptation takes ~20-30 min, so a shorter gap is not an observing window — it is a
// sliver that draws a 2px bracket and prints '04:53 – 04:53'. Judgement, not calibrated.
const MIN_BEST_WINDOW_MINUTES = 20;

/** One floor for every surface: the bracket and the rows must not disagree about BEST. */
function isPlannable(span: NightSpan): boolean {
  return span.end.toMillis() - span.start.toMillis() >= MIN_BEST_WINDOW_MINUTES * 60_000;
}

/** A sub-minute gap prints the same time twice ('04:53 – 04:53') — a row that says nothing. */
function printsNothing(span: NightSpan): boolean {
  return span.start.toFormat('HH:mm') === span.end.toFormat('HH:mm');
}

/** The longest moonless stretch worth planning around. Ties go to the earlier one. */
export function bestWindow(night: MoonInput): NightSpan | null {
  let best: NightSpan | null = null;
  let bestMs = 0;
  for (const gap of moonlessDarkSegments(night)) {
    const ms = gap.end.toMillis() - gap.start.toMillis();
    if (ms > bestMs) {
      bestMs = ms;
      best = gap;
    }
  }
  return best && isPlannable(best) ? best : null;
}

type MoonsetInput = {
  moonSegments: Interval<true>[];
  civilDusk: DateTime;
  civilDawn: DateTime;
};

/** When the moon gets out of the way — or why it never does. Reads the CIVIL-axis segments,
 *  which getMoonOverlap has already clipped to the axis, so "ends at dawn" means "never set". */
export function moonsetText(night: MoonsetInput): string {
  const segments = night.moonSegments;
  if (!segments.length) return 'Down all night';
  const last = segments[segments.length - 1];
  if (last.end < night.civilDawn) return last.end.toFormat('HH:mm');
  // still up when the axis runs out: distinguish owning the night from merely outlasting it
  return segments.length === 1 && segments[0].start <= night.civilDusk
    ? 'Up all night'
    : 'Up at dawn';
}

/** The night strip, said out loud: the dark window split at moonrise/set, plus the tail. */
export function tonightWindows(night: WindowsInput): NightWindowRow[] {
  const { start, end } = night.darknessWindow;
  // "lit" because the number is the moon's PHASE, not a share of the range beside it — read
  // without it, "Moon up · 99%" next to 21:53–04:46 says the moon owns 99% of those hours
  const moonLabel = `Moon up · ${night.moonIllumination}% lit`;
  const rows: NightWindowRow[] = [];

  // a dark gap keeps its row so the timeline stays whole; only the BEST verdict is earned
  const pushDark = (a: DateTime, b: DateTime) => {
    const span = { start: a, end: b };
    if (a >= b || printsNothing(span)) return;
    rows.push({
      range: fmt(a, b),
      label: 'Moonless dark',
      tag: isPlannable(span) ? 'BEST' : 'TOO SHORT',
    });
  };

  const moon = clippedMoonSegments(night);
  let cursor = start;
  for (const seg of moon) {
    pushDark(cursor, seg.start);
    rows.push({ range: fmt(seg.start, seg.end), label: moonLabel, tag: 'BRIGHT TARGETS' });
    cursor = seg.end;
  }
  pushDark(cursor, end);
  if (end < night.civilDawn) {
    rows.push({ range: fmt(end, night.civilDawn), label: 'Astronomical twilight', tag: 'PACK UP' });
  }
  return rows;
}
