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
  precision: 'neighborhood' | 'city' | 'unmapped';
}

const areaCoordinates: Record<string, [number, number]> = {
  westlands: [-1.2675, 36.8106],
  kilimani: [-1.2921, 36.7872],
  kileleshwa: [-1.2818, 36.7815],
  lavington: [-1.2815, 36.7688],
  parklands: [-1.2618, 36.817],
  karen: [-1.3195, 36.7073],
  langata: [-1.3602, 36.7478],
  kasarani: [-1.2217, 36.8976],
  ruaka: [-1.2037, 36.7782],
  rongai: [-1.3967, 36.7524],
  south_b: [-1.3133, 36.8312],
  south_c: [-1.3217, 36.8275],
  embakasi: [-1.3233, 36.9001],
  thika: [-1.0396, 37.09],
  juja: [-1.1014, 37.0144],
  limuru: [-1.1066, 36.6421],
  kiambu: [-1.1714, 36.8356],
  kikuyu: [-1.2451, 36.6621],
  nairobi: [-1.2864, 36.8172],
  mombasa: [-4.0435, 39.6682],
  kisumu: [-0.0917, 34.768],
  nakuru: [-0.3031, 36.08],
  eldoret: [0.5143, 35.2698],
  meru: [0.0463, 37.6559],
  nyeri: [-0.4167, 36.95],
  machakos: [-1.5177, 37.2634],
  naivasha: [-0.7172, 36.431],
  malindi: [-3.2175, 40.1169],
  kitengela: [-1.4707, 36.9611]
};

const countyCoordinates: Record<string, [number, number]> = {
  'nairobi county': [-1.2864, 36.8172],
  'kiambu county': [-1.1714, 36.8356],
  'machakos county': [-1.5177, 37.2634],
  'kajiado county': [-1.8524, 36.776],
  'mombasa county': [-4.0435, 39.6682],
  'kisumu county': [-0.0917, 34.768],
  'nakuru county': [-0.3031, 36.08],
  'uasin gishu county': [0.5143, 35.2698],
  'nyeri county': [-0.4167, 36.95],
  'meru county': [0.0463, 37.6559],
  'kilifi county': [-3.2175, 40.1169],
  'laikipia county': [0.0167, 37.0667]
};

function normalize(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function findCoordinates(area: WaitlistDemandArea): { point: [number, number]; precision: 'neighborhood' | 'city' } | null {
  const areaName = normalize(area.area);
  const cityName = normalize(area.city);
  for (const [name, coordinates] of Object.entries(areaCoordinates)) {
    if (areaName === name) return { point: coordinates, precision: areaName === cityName ? 'city' : 'neighborhood' };
  }
  for (const [name, coordinates] of Object.entries(areaCoordinates)) {
    if (cityName === name) return { point: coordinates, precision: 'city' };
  }
  const county = normalize(area.county);
  for (const [name, coordinates] of Object.entries(countyCoordinates)) {
    if (county === normalize(name) || county === normalize(name.replace(/ county$/, ''))) {
      return { point: coordinates, precision: 'city' };
    }
  }
  return null;
}

export function resolveWaitlistDemandArea(area: WaitlistDemandArea): WaitlistDemandArea {
  const location = findCoordinates(area);
  return location
    ? { ...area, latitude: location.point[0], longitude: location.point[1], precision: location.precision }
    : { ...area, latitude: null, longitude: null, precision: 'unmapped' };
}
