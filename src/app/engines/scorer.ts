import { CloudCoverResult } from './weather';

export type NightScore = { score: number; cloudDataAvailable: boolean };

// Duration of darkness can only affect up to 15% of the score.
const DARKNESS_FLOOR = 0.85;
// minimum hours - while hours <= minimum, the score will be on the darkness floor.
const DARKNESS_MIN_HRS = 3;
// saturation hours - where hours have diminishing returns
const DARKNESS_SAT_HRS = 7;

/** Max fraction of the score a moon can cost — full moon up all night
 *  leaves 30%: bright targets survive moonlight, faint fuzzies don't. */
const MOON_PENALTY_WEIGHT = 0.7;

/** Cloud curve exponent: cover ≈ blocked sightlines with a mild surcharge
 *  for gap-hunting. k=1.25 solved from the 50%-cover ≈ 40s scenario.
 *  CALIBRATION CANDIDATE — field test, Manitoulin, Aug 12. */
const CLOUD_EXPONENT = 1.25;

export function computeScore(
  darknessHours: number,
  moonOverlapFraction: number,
  moonIlluminationFraction: number,
  clouds: CloudCoverResult,
): NightScore {
  const progress = Math.min(
    1,
    Math.max(0, (darknessHours - DARKNESS_MIN_HRS) / (DARKNESS_SAT_HRS - DARKNESS_MIN_HRS)),
  );
  const f = DARKNESS_FLOOR + (1 - DARKNESS_FLOOR) * progress;

  const g = 1 - MOON_PENALTY_WEIGHT * moonOverlapFraction * moonIlluminationFraction;
  if (!clouds.available) {
    return { score: Math.round(f * g * 100), cloudDataAvailable: false };
  }
  const h = Math.pow(1 - clouds.avgCloud / 100, CLOUD_EXPONENT);
  return { score: Math.round(f * g * h * 100), cloudDataAvailable: true };
}

export type Tier = 'clear' | 'marginal' | 'poor';

// Shared by every consumer — markers, chips, week dots — so the bands can never disagree.
const TIER_CLEAR = 65;
const TIER_MARGINAL = 35;

export function tierFor(score: number): Tier {
  return score >= TIER_CLEAR ? 'clear' : score >= TIER_MARGINAL ? 'marginal' : 'poor';
}
