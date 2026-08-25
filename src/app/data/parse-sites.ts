import { Site } from '../models/site';

/** Decode and validate the served dataset. Throws naming the offending site — a malformed
 *  document means a corrupt deploy, and silence is the one thing this parser must not do. */
export function parseSitesDataset(json: unknown): Site[] {
  const doc = json as { sites?: unknown } | null;
  if (!doc || !Array.isArray(doc.sites)) throw new Error('sites dataset: no sites array');

  return doc.sites.map((raw) => {
    const s = raw as Partial<Site>;
    const id = typeof s.id === 'string' && s.id ? s.id : null;
    if (!id) throw new Error('sites dataset: site without id');
    const missing = (what: string) => new Error(`sites dataset: '${id}' has no valid ${what}`);

    if (typeof s.name !== 'string' || !s.name) throw missing('name');
    if (typeof s.timezone !== 'string' || !s.timezone) throw missing('timezone');
    const c = s.coordinates;
    if (
      !c ||
      typeof c.lat !== 'number' ||
      typeof c.lng !== 'number' ||
      Math.abs(c.lat) > 90 ||
      Math.abs(c.lng) > 180
    ) {
      throw missing('coordinates');
    }
    if (!Array.isArray(s.designations)) throw missing('designations');
    if (!s.brightness || typeof s.brightness.mpsas !== 'number') throw missing('brightness');

    return {
      id,
      name: s.name,
      coordinates: { lat: c.lat, lng: c.lng },
      timezone: s.timezone,
      designations: s.designations,
      countries: s.countries ?? [],
      provinces: s.provinces ?? [],
      brightness: s.brightness,
      urls: s.urls ?? {},
    };
  });
}
