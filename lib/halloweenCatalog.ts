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
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isHalloweenMerchantListing) : [];
  } catch {
    return [];
  }
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
  },
  {
    id: 9107,
    name: 'Moonlit Enchantress',
    category: 'Witch',
    theme: 'Witch',
    price: 3400,
    oldPrice: 4400,
    description: 'Silk-lined robe, layered sleeves, and luminous accessories for an enchanted night out.',
    accent: '#a855f7',
    palette: ['#2a0b3d', '#c084fc', '#f5e7ff'],
    sizes: ['S', 'M', 'L', 'XL'],
    fitNote: 'Flattering for a soft waist and roomy movement in the sleeves.',
    badges: ['New', 'Glow detail'],
    tryOnLabel: 'Enchantress fit'
  },
  {
    id: 9108,
    name: 'Cemetery Queen',
    category: 'Vampire',
    theme: 'Vampire',
    price: 4200,
    oldPrice: 5400,
    description: 'Tailored velvet gown with dramatic collar and statement mossy accents.',
    accent: '#7f1d1d',
    palette: ['#111827', '#b91c1c', '#f5d0d0'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    fitNote: 'Designed to sit close at the waist with a flowing dramatic skirt.',
    badges: ['Luxury', 'Sold out soon'],
    tryOnLabel: 'Queen fit'
  },
  {
    id: 9109,
    name: 'Neon Outlaw',
    category: 'Space',
    theme: 'Space',
    price: 3800,
    oldPrice: 5000,
    description: 'Reflective bodysuit with utility harness and a runway-ready metallic finish.',
    accent: '#22d3ee',
    palette: ['#0f172a', '#06b6d4', '#cffafe'],
    sizes: ['XS', 'S', 'M', 'L'],
    fitNote: 'Graceful through the torso with flexible movement in the arms.',
    badges: ['Party favorite'],
    tryOnLabel: 'Outlaw fit'
  },
  {
    id: 9110,
    name: 'Velvet Masquerade',
    category: 'Masquerade',
    theme: 'Masquerade',
    price: 4300,
    oldPrice: 5600,
    description: 'Rich jewel tones, feathered trim, and expressive mask details for premium events.',
    accent: '#fbbf24',
    palette: ['#1f2937', '#d97706', '#fef3c7'],
    sizes: ['S', 'M', 'L', 'XL'],
    fitNote: 'A flattering fitted shape with a soft stretch lining.',
    badges: ['Premium'],
    tryOnLabel: 'Masquerade fit'
  },
  {
    id: 9111,
    name: 'Skyblade Guardian',
    category: 'Hero',
    theme: 'Hero',
    price: 3600,
    oldPrice: 4700,
    description: 'Crisp armor-style outfit with layered cape and costume-ready utility accents.',
    accent: '#f97316',
    palette: ['#111827', '#f97316', '#ffedd5'],
    sizes: ['M', 'L', 'XL'],
    fitNote: 'Relaxed structure for movement and layered jackets.',
    badges: ['Fast ship'],
    tryOnLabel: 'Guardian fit'
  },
  {
    id: 9112,
    name: 'Pearl Phantom',
    category: 'Classic',
    theme: 'Classic',
    price: 3900,
    oldPrice: 5000,
    description: 'A pearlescent, floating silhouette and soft lace finish with a vintage ghost story feel.',
    accent: '#cbd5e1',
    palette: ['#e2e8f0', '#cbd5e1', '#f8fafc'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    fitNote: 'Loose and elegant with a forgiving waist and soft drape.',
    badges: ['Classic', 'Vintage'],
    tryOnLabel: 'Phantom fit'
  }
];

export const seededMerchantShowcase: HalloweenMerchantListing[] = [
  {
    id: 9201,
    name: 'Moon Phase Sorcerer',
    category: 'Witch',
    size: 'M',
    price: 3100,
    stock: 8,
    description: 'Handcrafted robe, moonstone trim, and a dramatic layered witch look from a local seller.',
    image: 'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=1200&q=80',
    createdAt: '2025-10-01T12:00:00.000Z'
  },
  {
    id: 9202,
    name: 'Red Velvet Coven',
    category: 'Vampire',
    size: 'L',
    price: 3950,
    stock: 5,
    description: 'Vintage-inspired vampire outfit with rich velvet and a dramatic cape from an approved merchant.',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80',
    createdAt: '2025-10-03T12:00:00.000Z'
  },
  {
    id: 9203,
    name: 'Aurora Pirate Captain',
    category: 'Space',
    size: 'XL',
    price: 4200,
    stock: 7,
    description: 'Futuristic captain look with metallic trim and layered accessories for nightlife energy.',
    image: 'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=1200&q=80',
    createdAt: '2025-10-04T12:00:00.000Z'
  },
  {
    id: 9204,
    name: 'Kingdom Masquerade',
    category: 'Masquerade',
    size: 'S',
    price: 4700,
    stock: 3,
    description: 'Gold-accented masquerade set with layered feathers and elegant evening styling.',
    image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1200&q=80',
    createdAt: '2025-10-07T12:00:00.000Z'
  }
];

export function getVisibleHalloweenProducts(merchantListings: HalloweenMerchantListing[] = []): HalloweenProduct[] {
  const seen = new Map<number, HalloweenProduct>();
  const merged = [...halloweenCatalog, ...seededMerchantShowcase, ...merchantListings.filter(item => item.stock > 0)];
  for (const product of merged) {
    const id = typeof product === 'number' ? product : (product as { id?: number }).id;
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.set(id, {
      id,
      name: product.name,
      category: product.category,
      theme: getListingTheme(product.category),
      price: product.price,
      oldPrice: 'oldPrice' in product ? product.oldPrice : undefined,
      description: product.description,
      accent: typeof product === 'object' && 'accent' in product ? product.accent : '#a855f7',
      palette: typeof product === 'object' && 'palette' in product && Array.isArray(product.palette) ? product.palette as [string, string, string] : ['#2a0b3d', '#a855f7', '#f5e7ff'],
      sizes: 'sizes' in product && Array.isArray(product.sizes)
        ? product.sizes
        : 'size' in product ? [product.size] : [],
      fitNote: 'Check the merchant listing for sizing details.',
      badges: typeof product === 'object' && 'badges' in product && Array.isArray(product.badges) ? product.badges : ['Merchant listing'],
      tryOnLabel: `${getListingTheme(product.category)} fit`,
      image: typeof product === 'object' && 'image' in product ? String(product.image) : undefined,
      stock: product.stock
    });
  }
  return [...seen.values()];
}

function getListingTheme(category: string): Exclude<HalloweenTheme, 'All'> {
  for (const theme of halloweenCategories) {
    if (theme !== 'All' && theme.toLowerCase() === category.trim().toLowerCase()) return theme;
  }
  return 'Classic';
}
