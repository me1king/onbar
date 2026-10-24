export type HalloweenTheme = 'All' | 'Witch' | 'Vampire' | 'Space' | 'Masquerade' | 'Hero' | 'Classic';

export interface HalloweenProduct {
  id: number;
  name: string;
  category: string;
  theme: Exclude<HalloweenTheme, 'All'>;
  price: number;
  oldPrice?: number;
  description: string;
  accent: string;
  palette: [string, string, string];
  sizes: string[];
  fitNote: string;
  badges: string[];
  tryOnLabel: string;
  image?: string;
  stock?: number;
}

export interface HalloweenMerchantListing {
  id: number;
  name: string;
  category: string;
  size: string;
  price: number;
  stock: number;
  description: string;
  image: string;
  createdAt: string;
}

export const HALLOWEEN_LISTINGS_STORAGE_KEY = 'halloween_merchant_listings';
export const HALLOWEEN_LISTINGS_UPDATED_EVENT = 'halloween-merchant-listings-updated';

function isHalloweenMerchantListing(item: unknown): item is HalloweenMerchantListing {
  if (typeof item !== 'object' || item === null) return false;
  const listing = item as Record<string, unknown>;
  return Number.isSafeInteger(listing.id) && Number(listing.id) > 0
    && typeof listing.name === 'string' && listing.name.trim().length > 0
    && typeof listing.category === 'string'
    && typeof listing.size === 'string'
    && typeof listing.price === 'number' && Number.isFinite(listing.price) && listing.price > 0
    && typeof listing.stock === 'number' && Number.isSafeInteger(listing.stock) && listing.stock >= 0
    && typeof listing.description === 'string'
    && typeof listing.image === 'string'
    && typeof listing.createdAt === 'string';
}

export function parseHalloweenMerchantListings(value: string | null): HalloweenMerchantListing[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed.filter(isHalloweenMerchantListing) : [];
}

export const halloweenCategories: HalloweenTheme[] = ['All', 'Witch', 'Vampire', 'Space', 'Masquerade', 'Hero', 'Classic'];

export const halloweenCatalog: HalloweenProduct[] = [
  {
    id: 9101,
    name: 'Midnight Witch Set',
    category: 'Witch',
    theme: 'Witch',
    price: 3200,
    oldPrice: 4200,
    description: 'High-coverage velvet dress, oversized hat, and layered cape for dramatic party energy.',
    accent: '#7c3aed',
    palette: ['#2f1b52', '#8b5cf6', '#f5d0fe'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    fitNote: 'Best for slim-to-average builds and a slightly oversized silhouette.',
    badges: ['3D view', 'Best seller'],
    tryOnLabel: 'Witch fit'
  },
  {
    id: 9102,
    name: 'Blood Moon Vampire',
    category: 'Vampire',
    theme: 'Vampire',
    price: 3600,
    oldPrice: 4700,
    description: 'Dark satin cape with velvet collar and arched details for a sleek, night-ready look.',
    accent: '#b91c1c',
    palette: ['#1f2937', '#dc2626', '#fca5a5'],
    sizes: ['S', 'M', 'L', 'XL'],
    fitNote: 'Designed for a fitted waist with a long cape for movement.',
    badges: ['Try-on ready', 'VIP'],
    tryOnLabel: 'Vampire fit'
  },
  {
    id: 9103,
    name: 'Cosmic Ranger',
    category: 'Space',
    theme: 'Space',
    price: 3900,
    oldPrice: 5100,
    description: 'Futuristic suit with metallic trims and reflective shoulder plating for bold club looks.',
    accent: '#0ea5e9',
    palette: ['#0f172a', '#38bdf8', '#dbeafe'],
    sizes: ['S', 'M', 'L', 'XL'],
    fitNote: 'Roomy in the shoulders and slightly tapered at the waist.',
    badges: ['New drop', '3D view'],
    tryOnLabel: 'Space fit'
  },
  {
    id: 9104,
    name: 'Masquerade Elegance',
    category: 'Masquerade',
    theme: 'Masquerade',
    price: 4100,
    oldPrice: 5300,
    description: 'Gold embroidery, sleek silhouette, and layered mask details for elegant costume nights.',
    accent: '#f59e0b',
    palette: ['#1f2937', '#fbbf24', '#fef3c7'],
    sizes: ['XS', 'S', 'M', 'L'],
    fitNote: 'A fitted statement piece with a stretch lining for comfort.',
    badges: ['Limited'],
    tryOnLabel: 'Masquerade fit'
  },
  {
    id: 9105,
    name: 'Urban Hero',
    category: 'Hero',
    theme: 'Hero',
    price: 3500,
    oldPrice: 4500,
    description: 'Comfy hero outfit with utility panels, cape accents, and padded chest detailing.',
    accent: '#ef4444',
    palette: ['#111827', '#f97316', '#fef2f2'],
    sizes: ['M', 'L', 'XL', 'XXL'],
    fitNote: 'Relaxed through the torso and arm for movement and layering.',
    badges: ['Quick ship', 'Popular'],
    tryOnLabel: 'Hero fit'
  },
  {
    id: 9106,
    name: 'Classic Ghost Bride',
    category: 'Classic',
    theme: 'Classic',
    price: 3700,
    oldPrice: 4900,
    description: 'A sheer layered dress with lace trim and soft ivory finish for a dramatic ghostly look.',
    accent: '#e2e8f0',
    palette: ['#f8fafc', '#cbd5e1', '#e2e8f0'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    fitNote: 'Soft drape with a flattering waist line and floating skirt shape.',
    badges: ['Classic favorite'],
    tryOnLabel: 'Bride fit'
  }
];
