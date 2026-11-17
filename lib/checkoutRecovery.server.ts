import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

type EngravingFont = 'classic' | 'modern' | 'signature';
type EngravingFinish = 'matte_black' | 'brushed_steel';

export interface CheckoutRecoveryItem {
  id: number;
  name: string;
  price: number;
  base_price: number;
  image: string;
  quantity: number;
  category?: string;
  size?: string;
  addons?: Array<{ id: string; name: string; price: number }>;
  engraving?: {
    text: string;
    font: EngravingFont;
    finish: EngravingFinish;
    giftPackage: boolean;
    giftMessage: string | null;
    spellingApproved: true;
  };
  engraving_fee?: number;
  gift_packaging_fee?: number;
  wholesale_price?: number;
  wholesale_min_qty?: number;
  stock_snapshot?: number;
}

export function getCheckoutRecoveryDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export function isValidCheckoutEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedPrice(value: unknown) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 && price <= 5_000_000 ? price : null;
}

export function normalizeCheckoutRecoveryItems(value: unknown): CheckoutRecoveryItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) return null;
  const items: CheckoutRecoveryItem[] = [];

  for (const rawItem of value) {
    if (!isRecord(rawItem)) return null;
    const id = Number(rawItem.id);
    const quantity = Number(rawItem.quantity);
    const price = boundedPrice(rawItem.price);
    const basePrice = boundedPrice(rawItem.base_price ?? rawItem.price);
    if (!Number.isSafeInteger(id) || id < 1
      || typeof rawItem.name !== 'string' || !rawItem.name.trim() || rawItem.name.length > 200
      || typeof rawItem.image !== 'string' || rawItem.image.length > 2048
      || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50
      || price === null || basePrice === null) return null;

    let addons: CheckoutRecoveryItem['addons'];
    if (rawItem.addons !== undefined) {
      if (!Array.isArray(rawItem.addons) || rawItem.addons.length > 20) return null;
      addons = [];
      for (const rawAddon of rawItem.addons) {
        if (!isRecord(rawAddon)
          || typeof rawAddon.id !== 'string' || rawAddon.id.length > 120
          || typeof rawAddon.name !== 'string' || rawAddon.name.length > 200) return null;
        const addonPrice = boundedPrice(rawAddon.price);
        if (addonPrice === null) return null;
        addons.push({ id: rawAddon.id, name: rawAddon.name, price: addonPrice });
      }
    }

    let engraving: CheckoutRecoveryItem['engraving'];
    if (rawItem.engraving !== undefined && rawItem.engraving !== null) {
      const rawEngraving = rawItem.engraving;
      if (!isRecord(rawEngraving)
        || typeof rawEngraving.text !== 'string' || rawEngraving.text.length > 20
        || !['classic', 'modern', 'signature'].includes(String(rawEngraving.font))
        || !['matte_black', 'brushed_steel'].includes(String(rawEngraving.finish))
        || typeof rawEngraving.giftPackage !== 'boolean'
        || (rawEngraving.giftMessage !== null && typeof rawEngraving.giftMessage !== 'string')
        || rawEngraving.spellingApproved !== true) return null;
      engraving = {
        text: rawEngraving.text,
        font: rawEngraving.font as EngravingFont,
        finish: rawEngraving.finish as EngravingFinish,
        giftPackage: rawEngraving.giftPackage,
        giftMessage: rawEngraving.giftMessage as string | null,
        spellingApproved: true
      };
    }

    const engravingFee = rawItem.engraving_fee === undefined ? undefined : boundedPrice(rawItem.engraving_fee);
    const giftPackagingFee = rawItem.gift_packaging_fee === undefined ? undefined : boundedPrice(rawItem.gift_packaging_fee);
    const wholesalePrice = rawItem.wholesale_price === undefined ? undefined : boundedPrice(rawItem.wholesale_price);
    if (engravingFee === null || giftPackagingFee === null || wholesalePrice === null) return null;
    const stockSnapshot = rawItem.stock_snapshot === undefined
      ? undefined
      : Number.isSafeInteger(Number(rawItem.stock_snapshot)) && Number(rawItem.stock_snapshot) >= 0
        ? Number(rawItem.stock_snapshot)
        : null;
    if (stockSnapshot === null) return null;

    const item: CheckoutRecoveryItem = {
      id,
      name: rawItem.name.trim(),
      price,
      base_price: basePrice,
      image: rawItem.image,
      quantity,
      ...(typeof rawItem.category === 'string' ? { category: rawItem.category.slice(0, 100) } : {}),
      ...(typeof rawItem.size === 'string' ? { size: rawItem.size.slice(0, 80) } : {}),
      ...(addons ? { addons } : {}),
      ...(engraving ? { engraving } : {}),
      ...(typeof engravingFee === 'number' ? { engraving_fee: engravingFee } : {}),
      ...(typeof giftPackagingFee === 'number' ? { gift_packaging_fee: giftPackagingFee } : {}),
      ...(typeof wholesalePrice === 'number' ? { wholesale_price: wholesalePrice } : {}),
      ...(typeof stockSnapshot === 'number' ? { stock_snapshot: stockSnapshot } : {}),
      ...(Number.isSafeInteger(Number(rawItem.wholesale_min_qty)) && Number(rawItem.wholesale_min_qty) > 0
        ? { wholesale_min_qty: Number(rawItem.wholesale_min_qty) }
        : {})
    };
    items.push(item);
  }
  return items;
}

export function createCheckoutRecoveryToken() {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: createHash('sha256').update(token).digest('hex')
  };
}

export function hashCheckoutRecoveryToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function escapeRecoveryHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

export function renderRecoveryMessage(template: string, values: {
  firstName: string;
  items: string;
  checkoutUrl: string;
}) {
  return template
    .replaceAll('{{first_name}}', values.firstName)
    .replaceAll('{{items}}', values.items)
    .replaceAll('{{checkout_url}}', values.checkoutUrl);
}
