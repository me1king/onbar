import { normalizePublicImageUrl } from '@/lib/marketingImageUrl';

export const GAME_BREAK_AD_SETTING_KEY = 'game_break_ad';
export const GAME_BREAK_GAMES = ['do-or-drink', 'hot-seat'] as const;

export type GameBreakGame = typeof GAME_BREAK_GAMES[number];

export type GameBreakAdConfig = {
  enabled: boolean;
  placements: Record<GameBreakGame, boolean>;
  productId: number | null;
  headline: string;
  message: string;
  imageUrl: string | null;
  showImage: boolean;
  showProductName: boolean;
  showPrice: boolean;
  showCatalogSuggestion: boolean;
  ctaLabel: string;
};

export type PublishedGameBreakAd = {
  productId: number;
  productName: string;
  price: number | null;
  imageUrl: string | null;
  headline: string;
  message: string;
  showImage: boolean;
  showProductName: boolean;
  ctaLabel: string;
};

export function createDefaultGameBreakAdConfig(): GameBreakAdConfig {
  return {
    enabled: false,
    placements: { 'do-or-drink': false, 'hot-seat': false },
    productId: null,
    headline: 'Hydration break pick',
    message: '',
    imageUrl: null,
    showImage: true,
    showProductName: true,
    showPrice: true,
    showCatalogSuggestion: true,
    ctaLabel: 'View drink'
  };
}

export function parseGameBreakAdConfig(value: unknown): GameBreakAdConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const config = value as Record<string, unknown>;
  const placements = config.placements;
  if (!placements || typeof placements !== 'object' || Array.isArray(placements)) return null;
  const placementValues = placements as Record<string, unknown>;
  const imageResult = normalizePublicImageUrl(config.imageUrl);
  const productId = config.productId;
  const selectedProductId = typeof productId === 'number' && Number.isSafeInteger(productId) && productId > 0
    ? productId
    : productId === null ? null : undefined;

  if (
    typeof config.enabled !== 'boolean'
    || typeof placementValues['do-or-drink'] !== 'boolean'
    || typeof placementValues['hot-seat'] !== 'boolean'
    || selectedProductId === undefined
    || typeof config.headline !== 'string'
    || config.headline.length > 120
    || typeof config.message !== 'string'
    || config.message.length > 500
    || !imageResult.valid
    || typeof config.showImage !== 'boolean'
    || typeof config.showProductName !== 'boolean'
    || typeof config.showPrice !== 'boolean'
    || (config.showCatalogSuggestion !== undefined && typeof config.showCatalogSuggestion !== 'boolean')
    || typeof config.ctaLabel !== 'string'
    || !config.ctaLabel.trim()
    || config.ctaLabel.length > 40
  ) return null;

  return {
    enabled: config.enabled,
    placements: {
      'do-or-drink': placementValues['do-or-drink'],
      'hot-seat': placementValues['hot-seat']
    },
    productId: selectedProductId,
    headline: config.headline.trim(),
    message: config.message.trim(),
    imageUrl: imageResult.imageUrl,
    showImage: config.showImage,
    showProductName: config.showProductName,
    showPrice: config.showPrice,
    showCatalogSuggestion: typeof config.showCatalogSuggestion === 'boolean' ? config.showCatalogSuggestion : true,
    ctaLabel: config.ctaLabel.trim()
  };
}

export function isPublishedGameBreakAd(value: unknown): value is PublishedGameBreakAd {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ad = value as Record<string, unknown>;
  return Number.isSafeInteger(ad.productId)
    && Number(ad.productId) > 0
    && typeof ad.productName === 'string'
    && (ad.price === null || (typeof ad.price === 'number' && Number.isFinite(ad.price) && ad.price >= 0))
    && (ad.imageUrl === null || typeof ad.imageUrl === 'string')
    && typeof ad.headline === 'string'
    && typeof ad.message === 'string'
    && typeof ad.showImage === 'boolean'
    && typeof ad.showProductName === 'boolean'
    && typeof ad.ctaLabel === 'string';
}
