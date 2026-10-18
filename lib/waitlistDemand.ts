import { LOCATION_AREAS } from '@/lib/locationCatalog';

export interface WaitlistDemandArea {
  id: string;
  country: string;
  county: string;
  city: string;
  area: string;
  signups: number;
  serviceableSignups: number;
  referralSignups: number;
  referralTurnover: number;
  pointsCredited: number;
  latitude: number | null;
  longitude: number | null;
  precision: 'area' | 'city' | 'county' | 'unmapped';
}

const countyCoordinates: Record<string, [number, number]> = {
  nairobi: [-1.2864, 36.8172],
  kiambu: [-1.1714, 36.8356],
  machakos: [-1.5177, 37.2634],
  kajiado: [-1.8524, 36.776],
  mombasa: [-4.0435, 39.6682],
  kisumu: [-0.0917, 34.768],
  nakuru: [-0.3031, 36.08],
  'uasin gishu': [0.5143, 35.2698],
  nyeri: [-0.4167, 36.95],
  meru: [0.0463, 37.6559],
  kilifi: [-3.2175, 40.1169],
  laikipia: [0.0167, 37.0667]
};

function normalize(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function findArea(area: WaitlistDemandArea) {
  const country = normalize(area.country);
  const county = normalize(area.county).replace(/\s+county$/, '');
  const city = normalize(area.city);
  const areaName = normalize(area.area);
  if (country && country !== 'kenya') return null;

  return LOCATION_AREAS.find(location =>
    normalize(location.area) === areaName
    && (!city || normalize(location.city) === city)
    && (!county || normalize(location.county) === county)
  ) || null;
}

function findCity(area: WaitlistDemandArea) {
  const city = normalize(area.city);
  const county = normalize(area.county).replace(/\s+county$/, '');
  if (!city) return null;

  const locations = LOCATION_AREAS.filter(location =>
    normalize(location.city) === city
    && (!county || normalize(location.county) === county)
  );
  return locations.find(location => normalize(location.area) === 'cbd')
    || locations.find(location => normalize(location.area) === 'mombasa island')
    || locations[0]
    || null;
}

export function resolveWaitlistDemandArea(area: WaitlistDemandArea): WaitlistDemandArea {
  const locality = findArea(area);
  if (locality) {
    return {
      ...area,
      latitude: locality.latitude,
      longitude: locality.longitude,
      precision: 'area'
    };
  }

  const city = findCity(area);
  if (city) {
    return {
      ...area,
      latitude: city.latitude,
      longitude: city.longitude,
      precision: 'city'
    };
  }

  const county = normalize(area.county).replace(/\s+county$/, '');
  const countyPoint = countyCoordinates[county];
  if (countyPoint && (!area.country.trim() || normalize(area.country) === 'kenya')) {
    return {
      ...area,
      latitude: countyPoint[0],
      longitude: countyPoint[1],
      precision: 'county'
    };
  }

  return { ...area, latitude: null, longitude: null, precision: 'unmapped' };
}
