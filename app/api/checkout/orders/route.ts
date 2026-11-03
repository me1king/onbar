import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { alertAllocatedMerchants } from '@/lib/merchantOrderAlerts.server';
import { findDeliveryZone, parseDeliveryAreas } from '@/lib/deliveryAreas';
import { getStoredVariantPrices } from '@/lib/productPricing';
import { getPublicBaseUrl } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type CheckoutItemInput = {
  productId: number;
  quantity: number;
  size: string;
  addonIds: string[];
  engraving?: {
    text: string;
    font: 'classic' | 'modern' | 'signature';
    finish: 'matte_black' | 'brushed_steel';
    giftPackage: boolean;
    giftMessage: string | null;
    spellingApproved: true;
  };
};

type CheckoutBody = {
  items: CheckoutItemInput[];
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  paymentMethod: 'Paystack' | 'COD';
  sessionId: string;
  shippingRegionId: string;
  coordinates: { lat: number; lng: number } | null;
  deliveryBuilding: string | null;
  deliveryLandmark: string | null;
  deliveryInstructions: string | null;
  notificationPreferences: {
    inApp: boolean;
    whatsapp: boolean;
    sms: boolean;
    email: boolean;
  } | null;
  couponCode: string | null;
  usePoints: boolean;
  referralCode: string | null;
  attributionId: string | null;
  isGift: boolean;
  giftMessage: string | null;
  giftRecipient: string | null;
  giftOccasion: string | null;
};

type ProductRow = {
  id: number;
  name: string;
  stock: number | null;
  variant_stock: Record<string, number> | null;
  price: number;
  old_price: number | null;
  variant_prices: Record<string, number> | null;
  beverage_specs: { variant_prices?: Record<string, number> | null } | null;
  cost_price: number | null;
  is_bite: boolean | null;
  is_snack: boolean | null;
  sizes: string[] | null;
  hide_product: boolean | null;
  is_available_now: boolean | null;
  status: string | null;
  engraving_enabled?: boolean | null;
  engraving_fee?: number | string | null;
  gift_packaging_fee?: number | string | null;
};

class StockUnavailableError extends Error {
  readonly stockIssue: {
    productId: number;
    productName: string;
    size: string;
    availableStock: number;
    requestedQuantity: number;
  };

  constructor(stockIssue: StockUnavailableError['stockIssue']) {
    super(`${stockIssue.productName} (${stockIssue.size}) is out of stock.`);
    this.name = 'StockUnavailableError';
    this.stockIssue = stockIssue;
  }
}

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) return null;

  return {
    url,
    publicKey,
    database: createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEngraving(value: unknown): CheckoutItemInput['engraving'] | null {
  if (!isRecord(value)
    || typeof value.text !== 'string'
    || value.text.trim().length < 1
    || value.text.trim().length > 20
    || !/^[A-Za-z0-9 .,'&-]+$/.test(value.text.trim())
    || !['classic', 'modern', 'signature'].includes(String(value.font))
    || !['matte_black', 'brushed_steel'].includes(String(value.finish))
    || typeof value.giftPackage !== 'boolean'
    || value.spellingApproved !== true
    || (value.giftMessage !== null && typeof value.giftMessage !== 'string')
    || (typeof value.giftMessage === 'string' && value.giftMessage.length > 150)
    || (!value.giftPackage && Boolean(value.giftMessage))
  ) return null;

  return {
    text: value.text.trim(),
    font: value.font as 'classic' | 'modern' | 'signature',
    finish: value.finish as 'matte_black' | 'brushed_steel',
    giftPackage: value.giftPackage,
    giftMessage: value.giftPackage && typeof value.giftMessage === 'string'
      ? value.giftMessage.trim() || null
      : null,
    spellingApproved: true
  };
}

function readBody(value: unknown): CheckoutBody | null {
  if (!isRecord(value)) return null;
  const {
    items,
    customerName,
    customerPhone,
    customerEmail,
    paymentMethod,
    sessionId,
    shippingRegionId,
    coordinates,
    deliveryBuilding,
    deliveryLandmark,
    deliveryInstructions,
    notificationPreferences,
    couponCode,
    usePoints,
    referralCode,
    attributionId,
    isGift,
    giftMessage,
    giftRecipient,
    giftOccasion
  } = value;

  if (!Array.isArray(items) || items.length < 1 || items.length > 50) return null;
  const normalizedItems: CheckoutItemInput[] = [];
  for (const item of items) {
    if (!isRecord(item)
      || !Number.isSafeInteger(item.productId)
      || Number(item.productId) <= 0
      || !Number.isSafeInteger(item.quantity)
      || Number(item.quantity) < 1
      || Number(item.quantity) > 100
      || typeof item.size !== 'string'
      || item.size.length > 80
      || !Array.isArray(item.addonIds)
      || item.addonIds.length > 20
      || item.addonIds.some((id) => typeof id !== 'string' || id.length > 80)
    ) return null;
    const engraving = item.engraving === undefined ? undefined : readEngraving(item.engraving);
    if (item.engraving !== undefined && !engraving) return null;
    normalizedItems.push({
      productId: Number(item.productId),
      quantity: Number(item.quantity),
      size: item.size.trim() || 'Standard',
      addonIds: [...new Set(item.addonIds as string[])],
      ...(engraving ? { engraving } : {})
    });
  }

  if (typeof customerName !== 'string' || !customerName.trim() || customerName.length > 160
    || typeof customerPhone !== 'string' || !customerPhone.trim() || customerPhone.length > 40
    || (customerEmail !== null && typeof customerEmail !== 'string')
    || (typeof customerEmail === 'string' && customerEmail.length > 254)
    || (paymentMethod !== 'Paystack' && paymentMethod !== 'COD')
    || typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 160
    || !['nairobi-cbd', 'nairobi-outskirts', 'upcountry'].includes(String(shippingRegionId))
    || typeof usePoints !== 'boolean'
    || typeof isGift !== 'boolean'
    || (couponCode !== null && typeof couponCode !== 'string')
    || (referralCode !== null && typeof referralCode !== 'string')
    || (attributionId !== null && typeof attributionId !== 'string')
    || (notificationPreferences !== undefined && !isRecord(notificationPreferences))
    || (isRecord(notificationPreferences)
      && ['inApp', 'whatsapp', 'sms', 'email'].some((key) => typeof notificationPreferences[key] !== 'boolean'))
  ) return null;

  const coordinate = coordinates === null
    ? null
    : isRecord(coordinates)
      && typeof coordinates.lat === 'number'
      && Number.isFinite(coordinates.lat)
      && coordinates.lat >= -90 && coordinates.lat <= 90
      && typeof coordinates.lng === 'number'
      && Number.isFinite(coordinates.lng)
      && coordinates.lng >= -180 && coordinates.lng <= 180
      ? { lat: coordinates.lat, lng: coordinates.lng }
      : undefined;
  if (coordinate === undefined) return null;

  const optionalText = (input: unknown, maxLength: number) => {
    if (input === null || input === undefined || input === '') return null;
    return typeof input === 'string' && input.length <= maxLength ? input.trim() || null : undefined;
  };
  const building = optionalText(deliveryBuilding, 160);
  const landmark = optionalText(deliveryLandmark, 240);
  const instructions = optionalText(deliveryInstructions, 500);
  const normalizedCoupon = optionalText(couponCode, 80);
  const normalizedReferral = optionalText(referralCode, 80);
  const normalizedAttribution = optionalText(attributionId, 160);
  const normalizedGiftMessage = optionalText(giftMessage, 500);
  const normalizedGiftRecipient = optionalText(giftRecipient, 160);
  const normalizedGiftOccasion = optionalText(giftOccasion, 120);
  if ([building, landmark, instructions, normalizedCoupon, normalizedReferral, normalizedAttribution,
    normalizedGiftMessage, normalizedGiftRecipient, normalizedGiftOccasion].includes(undefined)) return null;

  return {
    items: normalizedItems,
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim(),
    customerEmail: typeof customerEmail === 'string' ? customerEmail.trim() || null : null,
    paymentMethod,
    sessionId: sessionId.trim(),
    shippingRegionId: String(shippingRegionId),
    coordinates: coordinate,
    deliveryBuilding: building as string | null,
    deliveryLandmark: landmark as string | null,
    deliveryInstructions: instructions as string | null,
    notificationPreferences: isRecord(notificationPreferences)
      ? notificationPreferences as NonNullable<CheckoutBody['notificationPreferences']>
      : null,
    couponCode: normalizedCoupon as string | null,
    usePoints,
    referralCode: normalizedReferral as string | null,
    attributionId: normalizedAttribution as string | null,
    isGift,
    giftMessage: isGift ? normalizedGiftMessage as string | null : null,
    giftRecipient: isGift ? normalizedGiftRecipient as string | null : null,
    giftOccasion: isGift ? normalizedGiftOccasion as string | null : null
  };
}

function readNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
}

function isVisible(product: ProductRow) {
  const hiddenStatuses = new Set(['draft', 'hidden', 'inactive', 'archived', 'deleted']);
  return product.hide_product !== true
    && product.is_available_now !== false
    && !hiddenStatuses.has(String(product.status || '').trim().toLowerCase());
}

export async function POST(request: Request) {
  const configuration = getDatabase();
  if (!configuration) {
    return NextResponse.json({ error: 'Checkout is not configured on the server.' }, { status: 503 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid checkout request is required.' }, { status: 400 });
  }
  const body = readBody(rawBody);
  if (!body) {
    return NextResponse.json({ error: 'Checkout details are incomplete or invalid.' }, { status: 400 });
  }

  try {
    const authorization = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    let userId: string | null = null;
    if (authorization) {
      const auth = createClient(configuration.url, configuration.publicKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const { data, error } = await auth.auth.getUser(authorization);
      if (error || !data.user) {
        return NextResponse.json({ error: 'Your sign-in session expired. Sign in again before placing this order.' }, { status: 401 });
      }
      userId = data.user.id;
    }

    const { database } = configuration;
    const settingKeys = ['system_lockdown', 'shipping', 'free_delivery_areas'];
    const [settingsResult, customizedProductsResult] = await Promise.all([
      database.from('settings').select('key, value').in('key', settingKeys),
      database.from('products')
        .select('id, name, stock, variant_stock, price, old_price, variant_prices, beverage_specs, cost_price, is_bite, is_snack, sizes, hide_product, is_available_now, status, engraving_enabled, engraving_fee, gift_packaging_fee')
        .in('id', [...new Set(body.items.map((item) => item.productId))])
    ]);
    const { data: settings, error: settingsError } = settingsResult;
    let productsData: unknown[] | null = customizedProductsResult.data as unknown[] | null;
    let productsError = customizedProductsResult.error;
    const missingEngravingColumns = Boolean(productsError
      && ['42703', 'PGRST204'].includes(productsError.code || '')
      && /engraving_enabled|engraving_fee|gift_packaging_fee/i.test(productsError.message));
    if (missingEngravingColumns) {
      if (body.items.some((item) => item.engraving)) {
        return NextResponse.json({
          error: 'Engraving checkout is not ready. Apply supabase/ENGRAVING_PRODUCTION_MIGRATION.sql and try again.'
        }, { status: 503 });
      }
      console.error('[CheckoutOrder] Engraving migration is missing; continuing checkout without engraving products.');
      const standardProductsResult = await database.from('products')
        .select('id, name, stock, variant_stock, price, old_price, variant_prices, beverage_specs, cost_price, is_bite, is_snack, sizes, hide_product, is_available_now, status')
        .in('id', [...new Set(body.items.map((item) => item.productId))]);
      productsData = standardProductsResult.data as unknown[] | null;
      productsError = standardProductsResult.error;
    }
    if (settingsError || productsError) {
      console.error('[CheckoutOrder] Could not load checkout data:', settingsError || productsError);
      return NextResponse.json({ error: 'Checkout information could not be verified. Please try again.' }, { status: 503 });
    }
    const settingsByKey = new Map((settings || []).map((setting) => [setting.key, setting.value]));
    const lockdownValue = settingsByKey.get('system_lockdown');
    if (isRecord(lockdownValue) && lockdownValue.active === true) {
      return NextResponse.json({ error: 'Order intake is temporarily paused for system maintenance.' }, { status: 503 });
    }

    const shipping = isRecord(settingsByKey.get('shipping')) ? settingsByKey.get('shipping') as Record<string, unknown> : {};
    const regionSettings = {
      'nairobi-cbd': {
        fee: readNumber(shipping.nairobi_cbd, 0),
        label: typeof shipping.nairobi_cbd_label === 'string' ? shipping.nairobi_cbd_label : 'Local delivery'
      },
      'nairobi-outskirts': {
        fee: readNumber(shipping.nairobi_outskirts, 300),
        label: typeof shipping.nairobi_outskirts_label === 'string' ? shipping.nairobi_outskirts_label : 'Extended delivery'
      },
      upcountry: {
        fee: readNumber(shipping.upcountry, 500),
        label: typeof shipping.upcountry_label === 'string' ? shipping.upcountry_label : 'Outside local zones'
      }
    };
    const selectedRegion = regionSettings[body.shippingRegionId as keyof typeof regionSettings];
    const rawAreas = settingsByKey.get('free_delivery_areas') ?? [];
    let deliveryZones: ReturnType<typeof parseDeliveryAreas>;
    try {
      deliveryZones = parseDeliveryAreas(rawAreas);
    } catch (error) {
      console.error('[CheckoutOrder] Delivery zones are invalid:', error);
      return NextResponse.json({ error: 'Delivery coverage settings are invalid. Please contact support.' }, { status: 503 });
    }
    if (!body.coordinates) {
      return NextResponse.json({ error: 'Set and confirm your delivery location before placing the order.' }, { status: 400 });
    }
    const matchedZone = findDeliveryZone(body.coordinates.lat, body.coordinates.lng, deliveryZones);
    const deliveryFee = matchedZone
      ? matchedZone.fee ?? (matchedZone.free_delivery ? 0 : selectedRegion.fee)
      : selectedRegion.fee;
    const deliveryLabel = matchedZone?.name || selectedRegion.label;

    const products = (productsData || []) as ProductRow[];
    const productById = new Map(products.map((product) => [Number(product.id), product]));
    const normalizedLines = body.items.map((item) => {
      const product = productById.get(item.productId);
      if (!product || !isVisible(product)) {
        throw new Error(`A product in your cart is no longer available. Refresh your cart and try again.`);
      }
      if (product.sizes?.length && !product.sizes.includes(item.size)) {
        throw new Error(`${product.name} is not available in the selected size.`);
      }
      if (item.addonIds.length && !product.is_bite && !product.is_snack) {
        throw new Error(`${product.name} does not support selected extras.`);
      }
      if (item.engraving && product.engraving_enabled !== true) {
        throw new Error(`${product.name} is not currently available for engraving.`);
      }
      return { ...item, product };
    });

    const addonIds = [...new Set(normalizedLines.flatMap((item) => item.addonIds))];
    const addonsResult = addonIds.length
      ? await database.from('food_addons').select('id, name, price').eq('is_active', true).in('id', addonIds)
      : { data: [], error: null };
    if (addonsResult.error) {
      console.error('[CheckoutOrder] Could not verify food extras:', addonsResult.error);
      return NextResponse.json({ error: 'Selected extras could not be verified. Please try again.' }, { status: 503 });
    }
    const addonById = new Map((addonsResult.data || []).map((addon) => [String(addon.id), addon]));
    if (addonIds.some((id) => !addonById.has(id))) {
      return NextResponse.json({ error: 'One or more selected extras are no longer available. Refresh your cart.' }, { status: 409 });
    }

    let subtotal = 0;
    const orderItems = normalizedLines.map((item) => {
      const product = item.product;
      const availableStock = Number(product.variant_stock?.[item.size] ?? product.stock ?? 0);
      if (!Number.isFinite(availableStock) || availableStock < item.quantity) {
        throw new StockUnavailableError({
          productId: product.id,
          productName: product.name,
          size: item.size,
          availableStock: Number.isFinite(availableStock) ? Math.max(0, availableStock) : 0,
          requestedQuantity: item.quantity
        });
      }
      const variantPrices = getStoredVariantPrices(product.variant_prices, product.beverage_specs);
      const basePrice = Number(variantPrices?.[item.size] ?? product.price);
      const selectedAddons = item.addonIds.map((id) => {
        const addon = addonById.get(id)!;
        return { id: String(addon.id), name: addon.name, price: Number(addon.price) };
      });
      const addonPrice = selectedAddons.reduce((sum, addon) => sum + addon.price, 0);
      const engravingFee = item.engraving ? Number(product.engraving_fee) : 0;
      const packagingFee = item.engraving?.giftPackage ? Number(product.gift_packaging_fee) : 0;
      if (!Number.isFinite(engravingFee) || engravingFee < 0
        || !Number.isFinite(packagingFee) || packagingFee < 0) {
        throw new Error(`${product.name} has invalid engraving pricing. Please contact support.`);
      }
      const unitPrice = basePrice + addonPrice + engravingFee + packagingFee;
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error(`${product.name} has invalid pricing. Please contact support.`);
      }
      subtotal += unitPrice * item.quantity;
      return {
        order_id: 0,
        product_id: product.id,
        quantity: item.quantity,
        unit_price: unitPrice,
        unit_list_price: Math.max(Number(product.old_price) || 0, unitPrice),
        unit_cost: Number(product.cost_price) || 0,
        size: item.size,
        addons: selectedAddons,
        status: 'Pending'
      };
    });

    const requestedQuantities = new Map<string, number>();
    for (const item of normalizedLines) {
      const stockKey = `${item.product.id}:${item.size}`;
      requestedQuantities.set(stockKey, (requestedQuantities.get(stockKey) || 0) + item.quantity);
    }
    for (const [stockKey, quantity] of requestedQuantities) {
      const [productId, size] = stockKey.split(':');
      const product = productById.get(Number(productId))!;
      const availableStock = Number(product.variant_stock?.[size] ?? product.stock ?? 0);
      if (availableStock < quantity) {
        throw new StockUnavailableError({
          productId: product.id,
          productName: product.name,
          size,
          availableStock: Number.isFinite(availableStock) ? Math.max(0, availableStock) : 0,
          requestedQuantity: quantity
        });
      }
    }

    let couponDiscount = 0;
    let couponPercent = 0;
    let couponCode: string | null = null;
    if (body.couponCode) {
      couponCode = body.couponCode.toUpperCase();
      const { data: coupon, error: couponError } = await database
        .from('coupons')
        .select('*')
        .eq('code', couponCode)
        .eq('is_active', true)
        .maybeSingle();
      if (couponError) {
        console.error('[CheckoutOrder] Could not verify coupon:', couponError);
        return NextResponse.json({ error: 'The coupon could not be verified. Please try again.' }, { status: 503 });
      }
      if (!coupon || (coupon.owner_profile_id && coupon.owner_profile_id !== userId)) {
        return NextResponse.json({ error: 'This coupon is invalid or unavailable for this account.' }, { status: 400 });
      }
      couponPercent = Number(coupon.discount_percent) || 0;
      const fixedDiscount = Number(coupon.discount_amount) || 0;
      if (!Number.isFinite(couponPercent) || couponPercent < 0 || couponPercent > 100
        || !Number.isFinite(fixedDiscount) || fixedDiscount < 0) {
        return NextResponse.json({ error: 'This coupon has invalid discount settings. Please contact support.' }, { status: 503 });
      }
      couponDiscount = Math.min(subtotal, fixedDiscount || subtotal * couponPercent / 100);
    }

    let pointsDiscount = 0;
    let pointsRedeemed = 0;
    if (body.usePoints) {
      if (!userId) {
        return NextResponse.json({ error: 'Sign in to redeem loyalty points.' }, { status: 401 });
      }
      const [{ data: profile, error: profileError }, { data: loyalty, error: loyaltyError }] = await Promise.all([
        database.from('profiles').select('loyalty_points').eq('id', userId).single(),
        database.from('loyalty_config').select('value').eq('id', true).maybeSingle()
      ]);
      if (profileError || loyaltyError || !profile || !loyalty) {
        console.error('[CheckoutOrder] Could not verify loyalty balance:', profileError || loyaltyError);
        return NextResponse.json({ error: 'Loyalty points could not be verified. Please try again.' }, { status: 503 });
      }
      const pointRate = Number(loyalty.value?.points?.points_per_ksh || 10);
      const balance = Number(profile.loyalty_points || 0);
      if (!Number.isSafeInteger(pointRate) || pointRate <= 0 || !Number.isSafeInteger(balance) || balance < 0) {
        return NextResponse.json({ error: 'Loyalty settings are invalid. Please contact support.' }, { status: 503 });
      }
      pointsDiscount = Math.min(subtotal - couponDiscount, Math.floor(balance / pointRate));
      pointsRedeemed = Math.min(balance, Math.ceil(pointsDiscount * pointRate));
    }

    let referralCode = body.referralCode;
    if (referralCode) {
      const { data: referrer, error: referralError } = await database
        .from('profiles')
        .select('id')
        .eq('referral_code', referralCode)
        .maybeSingle();
      if (referralError) {
        console.error('[CheckoutOrder] Could not verify referral code:', referralError);
        return NextResponse.json({ error: 'The referral code could not be verified. Please try again.' }, { status: 503 });
      }
      if (!referrer || referrer.id === userId) referralCode = null;
    }

    const total = Math.max(0, subtotal + deliveryFee - couponDiscount - pointsDiscount);
    if (body.paymentMethod === 'Paystack' && total <= 0) {
      return NextResponse.json({ error: 'Online payment total must be greater than zero.' }, { status: 400 });
    }
    if (body.paymentMethod === 'Paystack'
      && (!body.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customerEmail))) {
      return NextResponse.json({ error: 'Enter a valid email address for Paystack.' }, { status: 400 });
    }

    const reference = body.paymentMethod === 'Paystack' ? `OB-${crypto.randomUUID()}` : null;
    const noteParts = [
      `Region: ${selectedRegion.label}`,
      matchedZone ? `Delivery zone: ${matchedZone.name}` : null,
      couponCode ? `Coupon: ${couponCode}` : null,
      pointsRedeemed > 0 ? `Used ${pointsRedeemed} points` : null,
      referralCode ? `Referred by ${referralCode}` : null,
      body.isGift ? `Gift: ${body.giftMessage || ''}` : null
    ].filter(Boolean);
    const orderPayload = {
      user_id: userId,
      session_id: body.sessionId,
      customer_name: body.customerName,
      customer_phone: body.customerPhone,
      customer_email: body.customerEmail,
      notification_in_app_opt_in: body.notificationPreferences?.inApp ?? true,
      notification_whatsapp_opt_in: body.notificationPreferences?.whatsapp ?? false,
      notification_sms_opt_in: body.notificationPreferences?.sms ?? false,
      notification_email_opt_in: body.notificationPreferences?.email ?? false,
      total_price: total,
      delivery_cost: deliveryFee,
      status: 'Pending',
      payment_method: body.paymentMethod,
      checkout_request_id: reference,
      referred_by_code: referralCode,
      loyalty_points_redeemed: pointsRedeemed,
      attribution_id: body.attributionId,
      captured_by: 'system',
      latitude: body.coordinates?.lat ?? null,
      longitude: body.coordinates?.lng ?? null,
      delivery_area: deliveryLabel,
      delivery_building: body.deliveryBuilding,
      delivery_landmark: body.deliveryLandmark,
      delivery_instructions: body.deliveryInstructions,
      is_gift: body.isGift,
      gift_message: body.giftMessage,
      gift_recipient: body.giftRecipient,
      gift_occasion: body.giftOccasion,
      note: noteParts.join(' | ')
    };
    const { data: order, error: orderError } = await database
      .from('orders')
      .insert(orderPayload)
      .select('id')
      .single();
    if (orderError || !order) {
      console.error('[CheckoutOrder] Could not create order:', orderError);
      return NextResponse.json({ error: 'The order could not be saved. Please try again.' }, { status: 503 });
    }

    const rows = orderItems.map((item) => ({ ...item, order_id: order.id }));
    let itemsError: { message: string; code?: string } | null = null;
    const rowsMissingListPrice = (error: { message: string; code?: string } | null) =>
      Boolean(error && /unit_list_price/i.test(error.message)
        && (error.code === '42703' || error.code === 'PGRST204'));
    const insertRows = async (rowsToInsert: typeof rows) => {
      const result = await database.from('order_items').insert(rowsToInsert);
      if (!rowsMissingListPrice(result.error)) return result.error;
      const legacyRows = rowsToInsert.map((row) => {
        const legacyRow = { ...row };
        Reflect.deleteProperty(legacyRow, 'unit_list_price');
        return legacyRow;
      });
      const legacyResult = await database.from('order_items').insert(legacyRows);
      if (!legacyResult.error) {
        console.error('[CheckoutOrder] Sold-item list-price migration is missing; list-price history was omitted.');
      }
      return legacyResult.error;
    };

    if (normalizedLines.some((item) => item.engraving)) {
      const standardRows = rows.filter((_, index) => !normalizedLines[index].engraving);
      if (standardRows.length) itemsError = await insertRows(standardRows);

      for (let index = 0; index < normalizedLines.length && !itemsError; index += 1) {
        const item = normalizedLines[index];
        if (!item.engraving) continue;

        let itemResult = await database.from('order_items')
          .insert(rows[index])
          .select('id')
          .single();
        if (rowsMissingListPrice(itemResult.error)) {
          const legacyRow = { ...rows[index] };
          Reflect.deleteProperty(legacyRow, 'unit_list_price');
          itemResult = await database.from('order_items')
            .insert(legacyRow)
            .select('id')
            .single();
          if (!itemResult.error) {
            console.error('[CheckoutOrder] Sold-item list-price migration is missing; list-price history was omitted.');
          }
        }
        if (itemResult.error || !itemResult.data) {
          itemsError = itemResult.error || { message: 'The customized order item was not returned.' };
          break;
        }

        const approvedAt = new Date().toISOString();
        const engravingFee = Number(item.product.engraving_fee);
        const packagingFee = item.engraving.giftPackage ? Number(item.product.gift_packaging_fee) : 0;
        const approvedSnapshot = {
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          engravingText: item.engraving.text,
          font: item.engraving.font,
          finish: item.engraving.finish,
          giftPackage: item.engraving.giftPackage,
          giftMessage: item.engraving.giftMessage,
          engravingFee,
          packagingFee,
          unitPrice: orderItems[index].unit_price,
          approvedAt
        };
        const snapshotHash = createHash('sha256')
          .update(JSON.stringify(approvedSnapshot))
          .digest('hex');
        const jobResult = await database.from('engraving_jobs').insert({
          order_item_id: itemResult.data.id,
          approved_snapshot: approvedSnapshot,
          snapshot_hash: snapshotHash,
          approved_at: approvedAt,
          status: 'queued'
        });
        if (jobResult.error) itemsError = jobResult.error;
      }
    } else {
      itemsError = await insertRows(rows);
    }

    if (itemsError) {
      const { error: cleanupError } = await database.from('orders').delete().eq('id', order.id);
      if (cleanupError) console.error('[CheckoutOrder] Could not remove incomplete order:', cleanupError);
      console.error('[CheckoutOrder] Could not persist order items or engraving jobs:', itemsError);
      if (normalizedLines.some((item) => item.engraving)
        && ['42P01', 'PGRST205'].includes(itemsError.code || '')) {
        return NextResponse.json({
          error: 'Engraving production is not installed yet. Run supabase/ENGRAVING_PRODUCTION_MIGRATION.sql and try again.'
        }, { status: 503 });
      }
      return NextResponse.json({ error: 'The order items could not be saved. Please try again.' }, { status: 503 });
    }

    if (body.paymentMethod === 'COD') {
      void alertAllocatedMerchants(database, Number(order.id))
        .then((alertResult) => {
          if (alertResult.applications === 0) {
            console.warn('[CheckoutOrder] COD order was created without an allocated merchant alert:', order.id);
          }
        })
        .catch((alertError: unknown) => {
          console.error('[CheckoutOrder] COD order was created, but merchant alerting failed:', alertError);
        });
    }

    if (pointsRedeemed > 0 && userId) {
      const { error: redemptionError } = await database.rpc('apply_loyalty_points', {
        profile_id_input: userId,
        amount_input: -pointsRedeemed,
        description_input: `Reserved at checkout for order #${order.id}`,
        event_key_input: `order:${order.id}:redeem`
      });
      if (redemptionError) {
        const { error: cleanupError } = await database.from('orders').delete().eq('id', order.id);
        if (cleanupError) {
          console.error('[CheckoutOrder] Could not remove order after points reservation failed:', cleanupError);
        }
        const pointsChanged = /insufficient loyalty points/i.test(redemptionError.message);
        if (!pointsChanged) {
          console.error('[CheckoutOrder] Could not reserve loyalty points:', redemptionError);
        }
        return NextResponse.json({
          error: pointsChanged
            ? 'Your loyalty balance changed during checkout. Refresh and try again.'
            : 'Loyalty points could not be reserved. Please try again.'
        }, { status: pointsChanged ? 409 : 503 });
      }
    }

    const notificationSecret = process.env.INTERNAL_API_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
    if (notificationSecret) {
      void fetch(new URL('/api/admin/notify-customer', getPublicBaseUrl()), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${notificationSecret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderId: order.id, status: 'Pending' }),
        cache: 'no-store'
      })
        .then((notificationResponse) => {
          if (!notificationResponse.ok) {
            console.error('[CheckoutOrder] Order was created, but its placed notification failed:', notificationResponse.status);
          }
        })
        .catch((notificationError: unknown) => {
          console.error('[CheckoutOrder] Order was created, but its placed notification could not be sent:', notificationError);
        });
    } else {
      console.error('[CheckoutOrder] Order was created, but INTERNAL_API_SECRET is not configured for placed notifications.');
    }

    return NextResponse.json({
      orderId: order.id,
      reference,
      total,
      currency: 'KES'
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof StockUnavailableError) {
      return NextResponse.json({
        error: error.message,
        code: 'STOCK_UNAVAILABLE',
        stockIssue: error.stockIssue
      }, { status: 409 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('[CheckoutOrder] Unexpected order creation failure:', error);
    return NextResponse.json({ error: 'The order could not be created. Please try again.' }, { status: 500 });
  }
}
