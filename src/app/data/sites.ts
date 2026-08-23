import { Site } from '../models/site';

export const SITES: Site[] = [
    {
        id: 'manitoulin-eco-park',
        name: 'Manitoulin Eco Park',
        description: "Manitoulin Eco Park (formerly Gordon's Park), a 268-acre RASC Dark-Sky Preserve on Manitoulin Island, ~15 min from the Chi-Cheemaun ferry",
        coordinates: {
            lat: 45.6621,
            lng: -81.9679
        },
        nearestTown: {
            driveDistanceKm: 16.2,
            name: 'Manitouwaning'
        },
        timezone: 'America/Toronto',
        bortle: 2,
        bortleNote: 'SQM 21.45, ~Bortle 2, per RASC'
    },
    {
        id: 'lennox-addington-dsva',
        name: 'Lennox & Addington Dark Sky Viewing Area',
        description: 'The most southerly unimpeded dark-sky site in Ontario, featuring the Terence Dickinson Observation Deck — a concrete viewing pad with headlight-blocking berms and solar power for equipment. Opened during the 2013 Perseid meteor shower.',
        coordinates: {
            lat: 44.55935,
            lng: -77.11686
        },
        nearestTown: {
            driveDistanceKm: 40,
            name: 'Napanee'
        },
        timezone: 'America/Toronto',
        bortle: 3,
        bortleNote: 'Bortle ~2.5 per L&A County; minor sky glow on southern horizon from Napanee'
    },
    {
        id: 'torrance-barrens',
        name: 'Torrance Barrens Dark-Sky Preserve',
        description: 'Canada\'s first dark-sky preserve, designated in 1997 (RASC-designated 1999). A 1,900-hectare Crown land conservation reserve in Muskoka cottage country, set on exposed Canadian Shield granite outcrops that make a striking foreground for the Milky Way. No amenities — day-use only, limited cell reception.',
        coordinates: {
            lat: 44.9517,
            lng: -79.5031
        },
        nearestTown: {
            driveDistanceKm: 30,
            name: 'Gravenhurst'
        },
        timezone: 'America/Toronto',
        bortle: 3,
        bortleNote: 'Popular, accessible preserve; darker than surrounding region but sky glow from the Muskoka cottage corridor and its popularity on clear weekends make it brighter than the northern sites',
    },
    {
        id: 'killarney-observatory',
        name: 'Killarney Provincial Park',
        description: 'The first Ontario provincial park designated a RASC Dark-Sky Preserve (2018). Home to a public observatory at the George Lake Campground with a 16" automated telescope and Astronomer-in-Residence programs Wednesdays, Fridays, and Saturdays through summer. Set in the La Cloche Mountains with white quartzite ridges and pristine skies.',
        coordinates: { lat: 46.01247, lng: -81.39933 },
        nearestTown: { driveDistanceKm: 100, name: 'Sudbury' },
        timezone: 'America/Toronto',
        bortle: 2,
        bortleNote: 'RASC Dark-Sky Preserve; ~Bortle 2 per light pollution atlas, remote from major population'
        // elevation 266m single value — omit range
    },
    {
        id: 'mont-megantic',
        name: 'Mont-Mégantic National Park',
        description: 'The world\'s first International Dark-Sky Reserve (designated 2007). Home to the ASTROLab and the Observatoire populaire du Mont-Mégantic — a 61cm public telescope, one of the largest built for public use. Programs run in French and English. East of Sherbrooke, Quebec.',
        coordinates: { lat: 45.4558, lng: -71.1522 },  
        nearestTown: { driveDistanceKm: 84.5, name: 'Sherbrooke' },
        timezone: 'America/Toronto',  // Quebec Eastern — same IANA zone
        bortle: 3,
        bortleNote: 'International Dark-Sky Reserve; summit ~Bortle 3 with some sky glow from Sherbrooke to the west'
    },
    {
        id: 'bruce-peninsula',
        name: 'Bruce Peninsula National Park',
        description: 'A certified RASC Dark-Sky Preserve on the tip of the Bruce Peninsula between Lake Huron and Georgian Bay, giving exceptionally clean horizons on three sides. The Northern Bruce Peninsula is a designated Dark Sky Community. Free Bayside Astronomy program runs at the Lion\'s Head harbour viewing platform on summer weekends.',
        coordinates: { lat: 45.19050243108614, lng: -81.57674358561789},  
        nearestTown: { driveDistanceKm: 21, name: 'Tobermory' },
        timezone: 'America/Toronto',
        bortle: 2,
        bortleNote: 'Bortle 2-3 per multiple sources; water on three sides yields very clean dark horizons'
    },
    {
        id: 'lake-superior-pp',
        name: 'Lake Superior Provincial Park',
        description: 'A RASC Dark-Sky Preserve (2018) on the TransCanada Highway, considered one of the darkest Dark-Sky Preserves in the world due to its remoteness. The designated stargazing site is at Agawa Bay Beach near the Visitor Centre, with open north, west, and south views over Lake Superior. High latitude makes it prime for aurora. Open   May-September.',
        coordinates: { lat: 47.3333, lng: -84.6333 },  
        nearestTown: { driveDistanceKm: 190, name: 'Sault Ste. Marie' },
        timezone: 'America/Toronto',
        bortle: 1,
        bortleNote: 'Among the darkest preserves in the world; ~Bortle 1-2, extremely remote. Aurora-prone at this latitude'
    },
]