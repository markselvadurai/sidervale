// The precomputed scores artifact — parsing, freshness, and per-night alignment.
// Engine-pure: no fetch, no clock reads that aren't injected.

import { DateTime } from 'luxon';
import { Tier, tierFor } from './scorer';

export type ArtifactNight =
  | { date: string; dark: false }
  | {
      date: string;
      dark: true;
      score: number;
      tier: string;
      cloudAvg: number | null;
      coverage: number | null;
      moonIllumination: number;
      moonOverlapMinutes: number;
      darkStart: string;
      darkEnd: string;
    };

export type ScoresArtifact = {
  generatedAt: string;
  sites: Record<string, { nights: ArtifactNight[] }>;
};

export type ArtifactNightScore =
  | { hasTrueDarkness: false }
  | { hasTrueDarkness: true; score: number; tier: Tier; cloudDataAvailable: boolean };

/** Two missed 3-hour precompute runs. TUNING CANDIDATE. */
export const ARTIFACT_STALE_HOURS = 6;

export function parseScoresArtifact(json: unknown): ScoresArtifact {
  const doc = json as Partial<ScoresArtifact> | null;
  if (!doc || typeof doc.generatedAt !== 'string') {
    throw new Error('scores artifact: missing generatedAt');
  }
  if (!doc.sites || typeof doc.sites !== 'object' || Array.isArray(doc.sites)) {
    throw new Error('scores artifact: missing sites object');
  }
  return { generatedAt: doc.generatedAt, sites: doc.sites };
}

export function isArtifactFresh(artifact: ScoresArtifact, now: DateTime): boolean {
  const generatedAt = DateTime.fromISO(artifact.generatedAt);
  if (!generatedAt.isValid) return false;
  // absolute difference, mirroring the forecast TTL — small clock skew must not read as stale
  return Math.abs(now.diff(generatedAt, 'hours').hours) < ARTIFACT_STALE_HOURS;
}

/** The artifact night for a local calendar date — alignment is a lookup, never an index. */
export function artifactNightFor(
  record: { nights: ArtifactNight[] } | undefined,
  localDate: string,
): ArtifactNight | null {
  return record?.nights.find((n) => n.date === localDate) ?? null;
}

/** Artifact night → store shape. Tier is re-derived so the scorer stays the bands' one owner. */
export function toNightScore(night: ArtifactNight): ArtifactNightScore {
  if (!night.dark) return { hasTrueDarkness: false };
  return {
    hasTrueDarkness: true,
    score: night.score,
    tier: tierFor(night.score),
    cloudDataAvailable: night.cloudAvg !== null,
  };
}
