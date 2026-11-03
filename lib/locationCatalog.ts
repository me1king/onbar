export interface LocationArea {
  country: string;
  county: string;
  city: string;
  area: string;
  latitude: number;
  longitude: number;
}

export interface ConfiguredLocationArea extends Omit<LocationArea, 'latitude' | 'longitude'> {
  latitude?: number;
  longitude?: number;
}

export interface LocationWaitlistContent {
  heading: string;
  message: string;
  rewardTitle: string;
  rewardDetails: string;
}

export interface LocationCatalogConfig {
  areas: ConfiguredLocationArea[];
  waitlist: LocationWaitlistContent;
}

export const LOCATION_AREAS: LocationArea[] = [
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'CBD', latitude: -1.2864, longitude: 36.8172 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Westlands', latitude: -1.2673, longitude: 36.8101 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Kilimani', latitude: -1.2921, longitude: 36.7866 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Lavington', latitude: -1.2744, longitude: 36.7764 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Kileleshwa', latitude: -1.2741, longitude: 36.7878 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Karen', latitude: -1.3197, longitude: 36.7073 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Langata', latitude: -1.3612, longitude: 36.7506 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'South C', latitude: -1.3197, longitude: 36.8278 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'South B', latitude: -1.3233, longitude: 36.8460 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Embakasi', latitude: -1.3192, longitude: 36.8958 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Roysambu', latitude: -1.2118, longitude: 36.8871 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Kasarani', latitude: -1.2226, longitude: 36.9002 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Kahawa', latitude: -1.1802, longitude: 36.9106 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Githurai', latitude: -1.2011, longitude: 36.9157 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Zimmerman', latitude: -1.2173, longitude: 36.9082 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Utawala', latitude: -1.2797, longitude: 36.9704 },
  { country: 'Kenya', county: 'Machakos', city: 'Syokimau', area: 'Syokimau', latitude: -1.3610, longitude: 36.9303 },
  { country: 'Kenya', county: 'Kajiado', city: 'Kitengela', area: 'Kitengela', latitude: -1.4770, longitude: 36.9615 },
  { country: 'Kenya', county: 'Kajiado', city: 'Ongata Rongai', area: 'Rongai', latitude: -1.3960, longitude: 36.7590 },
  { country: 'Kenya', county: 'Kajiado', city: 'Ngong', area: 'Ngong', latitude: -1.3610, longitude: 36.6560 },
  { country: 'Kenya', county: 'Kiambu', city: 'Kikuyu', area: 'Kikuyu', latitude: -1.2450, longitude: 36.6620 },
  { country: 'Kenya', county: 'Kiambu', city: 'Thika', area: 'Thika Road', latitude: -1.0396, longitude: 37.0900 },
  { country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: 'Mombasa Road', latitude: -1.3300, longitude: 36.8600 },
  { country: 'Kenya', county: 'Mombasa', city: 'Mombasa', area: 'Nyali', latitude: -4.0435, longitude: 39.6682 },
  { country: 'Kenya', county: 'Mombasa', city: 'Mombasa', area: 'Mombasa Island', latitude: -4.0620, longitude: 39.6682 },
  { country: 'Kenya', county: 'Kisumu', city: 'Kisumu', area: 'Kisumu CBD', latitude: -0.0917, longitude: 34.7680 },
  { country: 'Kenya', county: 'Kisumu', city: 'Kisumu', area: 'Milimani', latitude: -0.1050, longitude: 34.7550 },
  { country: 'Kenya', county: 'Uasin Gishu', city: 'Eldoret', area: 'Eldoret CBD', latitude: 0.5143, longitude: 35.2698 },
  { country: 'Kenya', county: 'Nakuru', city: 'Nakuru', area: 'Nakuru CBD', latitude: -0.3031, longitude: 36.0800 },
  { country: 'Kenya', county: 'Trans Nzoia', city: 'Kitale', area: 'Kitale CBD', latitude: 1.0157, longitude: 35.0062 },
];

export const DEFAULT_LOCATION_WAITLIST_CONTENT: LocationWaitlistContent = {
  heading: 'Get notified when Onbar launches here',
  message: 'Join the area launch waitlist and we’ll let you know when service becomes available.',
  rewardTitle: '',
  rewardDetails: ''
};

export const DEFAULT_LOCATION_CATALOG: LocationCatalogConfig = {
  areas: LOCATION_AREAS,
  waitlist: DEFAULT_LOCATION_WAITLIST_CONTENT
};

export function normalizeLocationCatalogConfig(value: unknown): LocationCatalogConfig | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.areas) || record.areas.length > 500) return null;

  const areas: ConfiguredLocationArea[] = [];
  const keys = new Set<string>();
  for (const item of record.areas) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
    const area = item as Record<string, unknown>;
    if (
      typeof area.county !== 'string'
      || typeof area.city !== 'string'
      || typeof area.area !== 'string'
    ) return null;
    const county = area.county.trim().replace(/\s+/g, ' ').slice(0, 80);
    const city = area.city.trim().replace(/\s+/g, ' ').slice(0, 100);
    const areaName = area.area.trim().replace(/\s+/g, ' ').slice(0, 100);
    if (!county || !city || !areaName) return null;
    const key = `${county.toLowerCase()}|${city.toLowerCase()}|${areaName.toLowerCase()}`;
    if (keys.has(key)) return null;
    keys.add(key);

    const hasLatitude = area.latitude !== undefined && area.latitude !== null && area.latitude !== '';
    const hasLongitude = area.longitude !== undefined && area.longitude !== null && area.longitude !== '';
    if (hasLatitude !== hasLongitude) return null;
    const latitude = hasLatitude ? Number(area.latitude) : undefined;
    const longitude = hasLongitude ? Number(area.longitude) : undefined;
    if (hasLatitude && (
      latitude === undefined || longitude === undefined
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    )) return null;
    areas.push({
      country: typeof area.country === 'string' && area.country.trim()
        ? area.country.trim().replace(/\s+/g, ' ').slice(0, 80)
        : 'Kenya',
      county,
      city,
      area: areaName,
      ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {})
    });
  }
  if (areas.length === 0) return null;

  const waitlist = typeof record.waitlist === 'object' && record.waitlist !== null && !Array.isArray(record.waitlist)
    ? record.waitlist as Record<string, unknown>
    : {};
  const cleanContent = (key: keyof LocationWaitlistContent, maximum: number, fallback: string) =>
    typeof waitlist[key] === 'string'
      ? waitlist[key].trim().replace(/\s+/g, ' ').slice(0, maximum)
      : fallback;

  return {
    areas,
    waitlist: {
      heading: cleanContent('heading', 120, DEFAULT_LOCATION_WAITLIST_CONTENT.heading),
      message: cleanContent('message', 500, DEFAULT_LOCATION_WAITLIST_CONTENT.message),
      rewardTitle: cleanContent('rewardTitle', 100, ''),
      rewardDetails: cleanContent('rewardDetails', 500, '')
    }
  };
}

export function approximateArea(latitude: number, longitude: number, areas: ConfiguredLocationArea[] = LOCATION_AREAS): ConfiguredLocationArea | null {
  const geocodedAreas = areas.filter((area): area is ConfiguredLocationArea & { latitude: number; longitude: number } =>
    Number.isFinite(area.latitude) && Number.isFinite(area.longitude)
  );
  const distanceKm = (area: ConfiguredLocationArea & { latitude: number; longitude: number }) => {
    const radians = Math.PI / 180;
    const lat1 = latitude * radians;
    const lat2 = area.latitude * radians;
    const deltaLat = (area.latitude - latitude) * radians;
    const deltaLon = (area.longitude - longitude) * radians;
    const haversine = Math.sin(deltaLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  };

  const nearest = geocodedAreas
    .map(area => ({ area, distance: distanceKm(area) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearest) return null;

  const maximumDistance = nearest.area.city === 'Nairobi' ? 8 : 20;
  return nearest.distance <= maximumDistance ? nearest.area : null;
}
