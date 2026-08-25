import { DateTime, Interval } from 'luxon';

export type NightWindowRow = { range: string; label: string; tag: string };

type WindowsInput = {
  darknessWindow: { start: DateTime; end: DateTime };
  moonDarkSegments: Interval<true>[];
  civilDawn: DateTime;
  moonIllumination: number;
};

const fmt = (a: DateTime, b: DateTime) => `${a.toFormat('HH:mm')} – ${b.toFormat('HH:mm')}`;

/** The night strip, said out loud: the dark window split at moonrise/set, plus the tail. */
export function tonightWindows(night: WindowsInput): NightWindowRow[] {
  const { start, end } = night.darknessWindow;
  const moonLabel = `Moon up · ${night.moonIllumination}%`;
  const rows: NightWindowRow[] = [];

  // clip to the dark window even though getMoonOverlap already does — a segment from the
  // wrong source (the civil-axis set) must not paint moon time outside the window
  const moon = night.moonDarkSegments
    .map((seg) => ({
      start: seg.start < start ? start : seg.start,
      end: seg.end > end ? end : seg.end,
    }))
    .filter((seg) => seg.start < seg.end)
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());
  let cursor = start;
  for (const seg of moon) {
    if (cursor < seg.start) {
      rows.push({ range: fmt(cursor, seg.start), label: 'Moonless dark', tag: 'BEST' });
    }
    rows.push({ range: fmt(seg.start, seg.end), label: moonLabel, tag: 'BRIGHT TARGETS' });
    cursor = seg.end;
  }
  if (cursor < end) rows.push({ range: fmt(cursor, end), label: 'Moonless dark', tag: 'BEST' });
  if (end < night.civilDawn) {
    rows.push({ range: fmt(end, night.civilDawn), label: 'Astronomical twilight', tag: 'PACK UP' });
  }
  return rows;
}
