import { TonightScore } from '../services/sites';

/** What one marker looks like and announces tonight. Pure — the map layer only applies it. */
export type MarkerIcon = { classes: string[]; label: string };

/** Tier is never hue-alone: every state carries a class the CSS shape-codes (ADR 0007, spec 1f). */
export function markerIcon(
  name: string,
  score: TonightScore | undefined,
  selected: boolean,
): MarkerIcon {
  const classes = ['site-marker'];
  let label: string;

  if (!score) {
    label = `${name}, score unavailable`;
  } else if (!score.hasTrueDarkness) {
    classes.push('site-marker--darkless');
    label = `${name}, no astronomical darkness tonight`;
  } else {
    classes.push(`site-marker--${score.tier}`);
    label = `${name}, ${score.score} ${score.tier}`;
    if (!score.cloudDataAvailable) {
      classes.push('site-marker--pending');
      label += ', astronomy only';
    }
  }

  // selection is orthogonal to darkness — any state can be the selected one
  if (selected) {
    classes.push('site-marker--selected');
    label += ', selected';
  }
  return { classes, label };
}

/** Marker diameter by zoom: 293 markers at detail size fuse into a mass at world zoom. */
export function markerSize(zoom: number): number {
  if (zoom <= 3) return 12;
  if (zoom <= 5) return 18;
  if (zoom <= 7) return 24;
  return 28;
}
