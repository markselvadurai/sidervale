import { Site } from '../models/site';
import { SiteKind, siteKind } from '../models/site-kind';
import { TonightScore } from '../services/sites';
import { Tier } from '../engines/scorer';

/** What the map draws per site. A GL canvas has no DOM, so state travels as data. */
export type SiteFeatureProps = {
  id: string;
  name: string;
  tier: Tier | 'darkless' | 'unknown';
  score: number | null;
  kind: SiteKind;
  selected: boolean;
  pending: boolean; // scored without cloud data
  label: string; // the accessible name, for the hidden site list
};

export type SiteFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: SiteFeatureProps;
};

export type SiteFeatureCollection = { type: 'FeatureCollection'; features: SiteFeature[] };

/** The accessible name for one marker. Unchanged wording from the DOM-marker era. */
export function markerLabel(
  name: string,
  score: TonightScore | undefined,
  selected: boolean,
): string {
  let label: string;
  if (!score) label = `${name}, score unavailable`;
  else if (!score.hasTrueDarkness) label = `${name}, no astronomical darkness tonight`;
  else {
    label = `${name}, ${score.score} ${score.tier}`;
    if (!score.cloudDataAvailable) label += ', astronomy only';
  }
  // selection is orthogonal to darkness — any state can be the selected one
  return selected ? `${label}, selected` : label;
}

/** Marker diameter by zoom: 293 markers at detail size fuse into a mass at world zoom. */
export function markerSize(zoom: number): number {
  if (zoom <= 3) return 12;
  if (zoom <= 5) return 18;
  if (zoom <= 7) return 24;
  return 28;
}

/** Pure: sites + tonight's scores + the selection become the map's whole source of truth. */
export function sitesToFeatures(
  sites: Site[],
  scores: Map<string, TonightScore>,
  selectedId: string | null,
): SiteFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: sites.map((site) => {
      const s = scores.get(site.id);
      const dark = s?.hasTrueDarkness === true;
      return {
        type: 'Feature' as const,
        // GeoJSON is [lng, lat] — the opposite of how the dataset reads
        geometry: {
          type: 'Point' as const,
          coordinates: [site.coordinates.lng, site.coordinates.lat] as [number, number],
        },
        properties: {
          id: site.id,
          name: site.name,
          tier: !s ? 'unknown' : dark ? s.tier : 'darkless',
          score: dark ? s.score : null,
          kind: siteKind(site),
          selected: selectedId === site.id,
          pending: dark ? !s.cloudDataAvailable : false,
          label: markerLabel(site.name, s, selectedId === site.id),
        },
      };
    }),
  };
}
