import { describe, it, expect } from 'vitest';
import { computeScore } from './scorer';

// ─────────────────────────────────────────────────────────────────
// Signature under test:
//   computeScore(
//     darknessHours: number,
//     moonOverlapFraction: number,       // 0–1: fraction of dark window moon is up
//     moonIlluminationFraction: number,  // 0–1: how lit the moon is
//     clouds: CloudCoverResult,
//   ): NightScore                        // { score, cloudDataAvailable } — not a union:
//                                        // darkless nights are fenced by the caller.
//
// Clouds is the only union input — absence is a real state there.
// ─────────────────────────────────────────────────────────────────

const clouds = (avgCloud: number) => ({
  available: true as const,
  avgCloud,
  coverage: 1,
});

const noClouds = { available: false as const };

describe('computeScore — calibration scenarios', () => {

  it('S1: ceiling night — long darkness, no moon, clear sky → 90s', () => {
    // 7h+ saturates f; overlap 0 → g = 1 regardless of illumination; clear → h ≈ 1.
    const s = computeScore(7.5, 0, 0.02, clouds(3));
    expect(s.score).toBeGreaterThanOrEqual(90);
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.cloudDataAvailable).toBe(true);
  });

  it('S2: 89% moon up the entire dark window, clear sky → 35–40', () => {
    // g floors the damage: 1 − 0.7·(1.0·0.89) ≈ 0.377 → ~37.
    // Bright moon costs the faint targets, not the sky.
    const s = computeScore(7.5, 1.0, 0.89, clouds(3));
    expect(s.score).toBeGreaterThanOrEqual(33);
    expect(s.score).toBeLessThanOrEqual(42);
  });

  it('S3: perfect astronomy, 100% cloud → exactly 0 (the gate)', () => {
    // Opaque sky = worthless regardless of everything else.
    // Forbids any additive term surviving the product.
    const s = computeScore(7.5, 0, 0.02, clouds(100));
    expect(s.score).toBe(0);
  });

  it('S4: perfect astronomy, 50% cloud → ~40s', () => {
    // k = 1.25: (1−0.5)^1.25 ≈ 0.42 → ~42.
    // Cover ≈ blocked sightlines + mild gap-hunting surcharge.
    // CALIBRATION CANDIDATE — field test Aug 12.
    const s = computeScore(7.5, 0, 0.02, clouds(50));
    expect(s.score).toBeGreaterThanOrEqual(38);
    expect(s.score).toBeLessThanOrEqual(46);
  });

  it('S5: good night, forecast unavailable → astronomy-only score, flagged', () => {
    // Mockup's degraded state: score what we know, confess what we don't.
    const s = computeScore(7.5, 0.3, 0.4, noClouds);
    expect(s.cloudDataAvailable).toBe(false);
    expect(s.score).toBeGreaterThan(0); // f·g alone, no h applied
  });

  it('S6: duration ramp — 4h night scores below 7h night, all else equal', () => {
    // f is a modest multiplier: short nights shave the score, never zero it.
    // RATIO BAND DEPENDS ON YOUR CALIBRATED FLOOR:
    //   floor 0.7  → f(4)/f(7.5) ≈ 0.775 → band [0.70, 0.85] holds
    //   floor 0.85 → ratio ≈ 0.89        → widen upper bound to ~0.93
    // Sync this band to the constant you chose — a red here after retuning
    // is the suite catching drift, not a bug.
    const short = computeScore(4, 0, 0.02, clouds(3));
    const long = computeScore(7.5, 0, 0.02, clouds(3));
    expect(short.score).toBeLessThan(long.score);
    expect(short.score / long.score).toBeGreaterThanOrEqual(0.70);
    expect(short.score / long.score).toBeLessThanOrEqual(0.8875);
  });
});