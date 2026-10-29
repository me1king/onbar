export type HalloweenTheme = 'All' | 'Witch' | 'Vampire' | 'Space' | 'Masquerade' | 'Hero' | 'Classic';

export interface HalloweenProduct {
  id: number;
  name: string;
  category: string;
  theme: Exclude<HalloweenTheme, 'All'>;
  price: number;
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
export const halloweenCategories: HalloweenTheme[] = ['All', 'Witch', 'Vampire', 'Space', 'Masquerade', 'Hero', 'Classic'];

function isHalloweenMerchantListing(item: unknown): item is HalloweenMerchantListing {
  if (typeof item !== 'object' || item === null) return false;
  const listing = item as Record<string, unknown>;
  return Number.isSafeInteger(listing.id) && Number(listing.id) > 0
    && typeof listing.name === 'string' && listing.name.trim().length > 0
    && typeof listing.category === 'string'
    && typeof listing.size === 'string' && listing.size.trim().length > 0
    && typeof listing.price === 'number' && Number.isFinite(listing.price) && listing.price > 0
    && typeof listing.stock === 'number' && Number.isSafeInteger(listing.stock) && listing.stock >= 0
    && typeof listing.description === 'string'
    && typeof listing.image === 'string' && listing.image.length > 0
    && typeof listing.createdAt === 'string';
}

export function parseHalloweenMerchantListings(value: string | null): HalloweenMerchantListing[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isHalloweenMerchantListing) : [];
  } catch {
    return [];
  }
}

export function getVisibleHalloweenProducts(merchantListings: HalloweenMerchantListing[] = []): HalloweenProduct[] {
  return merchantListings
    .filter(item => item.stock > 0)
    .map(item => {
      const theme = getListingTheme(item.category);
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        theme,
        price: item.price,
        description: item.description,
        accent: '#a855f7',
        palette: ['#2a0b3d', '#a855f7', '#f5e7ff'],
        sizes: [item.size],
        fitNote: 'Preview only; sizing has not been verified.',
        badges: ['Browser preview'],
        tryOnLabel: `${theme} fit`,
        image: item.image,
        stock: item.stock
      };
    });
}

function getListingTheme(category: string): Exclude<HalloweenTheme, 'All'> {
  for (const theme of halloweenCategories) {
    if (theme !== 'All' && theme.toLowerCase() === category.trim().toLowerCase()) return theme;
  }
  return 'Classic';
}
