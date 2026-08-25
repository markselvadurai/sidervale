export type Designation = { authority: 'darksky' | 'rasc'; type: string; year: number | null };
export type Brightness = { ratio: number; mpsas: number; zone: string; atlasYear: number };

/** What the engines consume — everything beyond this is presentation. */
export interface SiteCore {
  id: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  timezone: string;
}

/** A dataset site — exactly the shape the pipeline emits (tools/dataset/emit.ts aliases this). */
export interface Site extends SiteCore {
  name: string;
  designations: Designation[];
  countries: string[];
  provinces: string[];
  brightness: Brightness;
  urls: { darksky?: string; rasc?: string };
}
