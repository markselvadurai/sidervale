export interface Site {
    id: string;
    name: string;
    description: string;
    coordinates: {
        lat: number,
        lng: number
    }
    nearestTown: {
        driveDistanceKm: number;
        name: string;
    }
    timezone: string;
    bortle: number;
    bortleNote?: string;
    elevationRange?: {
        min: number;
        max: number;
    }
}
