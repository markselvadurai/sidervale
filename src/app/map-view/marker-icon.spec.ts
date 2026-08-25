import { markerIcon } from './marker-icon';
import { TonightScore } from '../services/sites';

const NAME = 'Torrance Barrens';

const dark = (
  over: Partial<Extract<TonightScore, { hasTrueDarkness: true }>> = {},
): TonightScore => ({
  hasTrueDarkness: true,
  score: 74,
  tier: 'clear',
  cloudDataAvailable: true,
  ...over,
});
const DARKLESS: TonightScore = { hasTrueDarkness: false };

describe('markerIcon', () => {
  it('marks a site whose score has not arrived as unknown rather than guessing a tier', () => {
    const icon = markerIcon(NAME, undefined, false);
    expect(icon.classes).toEqual(['site-marker']);
    expect(icon.label).toBe('Torrance Barrens, score unavailable');
  });

  it('shape-codes a darkless night instead of tier-coding it', () => {
    const icon = markerIcon(NAME, DARKLESS, false);
    expect(icon.classes).toEqual(['site-marker', 'site-marker--darkless']);
    expect(icon.label).toBe('Torrance Barrens, no astronomical darkness tonight');
  });

  it('carries the tier and the score for a cloud-aware night', () => {
    const icon = markerIcon(NAME, dark(), false);
    expect(icon.classes).toEqual(['site-marker', 'site-marker--clear']);
    expect(icon.label).toBe('Torrance Barrens, 74 clear');
  });

  it('flags a night scored without cloud data, in both the class and the words', () => {
    const icon = markerIcon(
      NAME,
      dark({ score: 58, tier: 'marginal', cloudDataAvailable: false }),
      false,
    );
    expect(icon.classes).toEqual(['site-marker', 'site-marker--marginal', 'site-marker--pending']);
    expect(icon.label).toBe('Torrance Barrens, 58 marginal, astronomy only');
  });

  it('haloes the selected site and says so', () => {
    const icon = markerIcon(NAME, dark(), true);
    expect(icon.classes).toEqual(['site-marker', 'site-marker--clear', 'site-marker--selected']);
    expect(icon.label).toBe('Torrance Barrens, 74 clear, selected');
  });

  it('haloes a selected darkless site too — darkness is not a precondition for selection', () => {
    const icon = markerIcon(NAME, DARKLESS, true);
    expect(icon.classes).toEqual(['site-marker', 'site-marker--darkless', 'site-marker--selected']);
    expect(icon.label).toBe('Torrance Barrens, no astronomical darkness tonight, selected');
  });

  it('haloes a selected site that has no score yet', () => {
    expect(markerIcon(NAME, undefined, true).classes).toEqual([
      'site-marker',
      'site-marker--selected',
    ]);
  });

  it('reads the site name out verbatim, punctuation and all', () => {
    // dataset names carry '&' — the label is an attribute value, never markup
    expect(markerIcon('Ann & Sandy Cross', dark(), false).label).toBe(
      'Ann & Sandy Cross, 74 clear',
    );
  });
});
