/** What the engines consume — everything beyond this is presentation. */
export interface SiteCore {
  id: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  timezone: string;
}

export interface Site extends SiteCore {
  name: string;
  description: string;
  nearestTown: {
    driveDistanceKm: number;
    name: string;
  };
  bortle: number;
  bortleNote?: string;
  elevationRange?: {
    min: number;
    max: number;
  };
}
