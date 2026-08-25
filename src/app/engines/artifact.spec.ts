import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { artifactNightFor, isArtifactFresh, parseScoresArtifact, toNightScore } from './artifact';

const NOW = DateTime.fromMillis(Date.UTC(2026, 7, 25, 12, 0), { zone: 'utc' });

function artifactAt(generatedAt: string) {
  return { generatedAt, sites: {} };
}

const DARK_NIGHT = {
  date: '2026-08-24',
  dark: true as const,
  score: 41,
  tier: 'marginal',
  cloudAvg: 10,
  coverage: 1,
  moonIllumination: 89,
  moonOverlapMinutes: 300,
  darkStart: '2026-08-24T21:30:00.000-04:00',
  darkEnd: '2026-08-25T05:00:00.000-04:00',
};

describe('parseScoresArtifact', () => {
  it('round-trips a valid document', () => {
    const doc = { generatedAt: '2026-08-25T09:00:00.000Z', sites: { a: { nights: [DARK_NIGHT] } } };
    const parsed = parseScoresArtifact(doc);
    expect(parsed.generatedAt).toBe('2026-08-25T09:00:00.000Z');
    expect(parsed.sites['a'].nights).toHaveLength(1);
  });

  it('rejects a malformed site record at the gate, naming the site', () => {
    const base = { generatedAt: 't' };
    expect(() => parseScoresArtifact({ ...base, sites: { bad: {} } })).toThrow(/bad/);
    expect(() => parseScoresArtifact({ ...base, sites: { bad: { nights: null } } })).toThrow(/bad/);
    expect(() =>
      parseScoresArtifact({ ...base, sites: { bad: { nights: [{ dark: true }] } } }),
    ).toThrow(/bad/);
    expect(() =>
      parseScoresArtifact({
        ...base,
        sites: { bad: { nights: [{ date: '2026-08-24', dark: true, score: NaN }] } },
      }),
    ).toThrow(/bad/);
  });

  it('throws on a document without generatedAt or without a sites object', () => {
    expect(() => parseScoresArtifact({ sites: {} })).toThrow(/generatedAt/);
    expect(() => parseScoresArtifact({ generatedAt: 'x' })).toThrow(/sites/);
    expect(() => parseScoresArtifact(null)).toThrow();
  });
});

describe('isArtifactFresh', () => {
  it('is fresh strictly inside the stale window and stale at the boundary', () => {
    // NOW is 12:00Z; ARTIFACT_STALE_HOURS is 6
    expect(isArtifactFresh(artifactAt('2026-08-25T06:01:00.000Z'), NOW)).toBe(true); // 5h59m
    expect(isArtifactFresh(artifactAt('2026-08-25T06:00:00.000Z'), NOW)).toBe(false); // exactly 6h
    expect(isArtifactFresh(artifactAt('2026-08-25T05:00:00.000Z'), NOW)).toBe(false); // 7h
  });

  it('treats small future skew as fresh (absolute difference)', () => {
    expect(isArtifactFresh(artifactAt('2026-08-25T13:00:00.000Z'), NOW)).toBe(true);
  });

  it('treats a far-future generatedAt as stale — the absolute value cuts both ways', () => {
    expect(isArtifactFresh(artifactAt('2026-08-26T12:00:00.000Z'), NOW)).toBe(false); // +24h
  });

  it('treats an unparseable generatedAt as stale', () => {
    expect(isArtifactFresh(artifactAt('not a timestamp'), NOW)).toBe(false);
  });
});

describe('artifactNightFor', () => {
  const record = {
    nights: [
      { ...DARK_NIGHT, date: '2026-08-23', score: 50 },
      { ...DARK_NIGHT, date: '2026-08-24', score: 41 },
    ],
  };

  it('finds the night matching the local date', () => {
    expect(artifactNightFor(record, '2026-08-23')).toMatchObject({ score: 50 });
  });

  it('aligns past the first night when the client tonight has advanced', () => {
    // artifact generated pre-sunrise (first night Aug 23), viewed post-sunrise (tonight Aug 24)
    expect(artifactNightFor(record, '2026-08-24')).toMatchObject({ score: 41 });
  });

  it('returns null for dates outside the artifact and for missing records', () => {
    expect(artifactNightFor(record, '2026-08-22')).toBeNull();
    expect(artifactNightFor(record, '2026-09-01')).toBeNull();
    expect(artifactNightFor(undefined, '2026-08-23')).toBeNull();
  });
});

describe('toNightScore', () => {
  it('maps darkless nights and missing cloud data', () => {
    expect(toNightScore({ date: '2026-06-21', dark: false })).toEqual({ hasTrueDarkness: false });
    const s = toNightScore({ ...DARK_NIGHT, cloudAvg: null, coverage: null });
    expect(s).toMatchObject({ hasTrueDarkness: true, cloudDataAvailable: false });
  });

  it('re-derives the tier from the score, ignoring the artifact tier string', () => {
    // deliberately wrong tier in the fixture — the client must not trust it
    const s = toNightScore({ ...DARK_NIGHT, score: 10, tier: 'clear' });
    expect(s).toMatchObject({ score: 10, tier: 'poor' });
  });
});
