import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { verifySessionCookie } from '@/lib/adminAuth';
import {
  isMerchantBusinessType,
  isMerchantVendorType,
  merchantVendorTypeForBusinessType,
  getMissingMerchantDocumentTypes,
  resolveMerchantDocumentRequirements,
  type MerchantDocumentRequirement,
  type MerchantApplicationDocument
} from '@/lib/merchantApplications';
import { isStorefrontProductVisible } from '@/lib/productVisibility';
import {
  isValidMerchantOperatingHours,
  normalizeMerchantOperatingHours,
  type MerchantOperatingHours
} from '@/lib/merchantAvailability';
import { isBeverageInventoryProduct, isKitchenFoodProduct } from '@/lib/productDepartment';
import { getPublicBaseUrl } from '@/lib/utils';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';
import { renderVendorApplicationEmail } from '@/lib/lifecycleEmailPreviews';

export const dynamic = 'force-dynamic';

const DOCUMENT_BUCKET = 'merchant-application-documents';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_TOTAL_FILE_SIZE = 15 * 1024 * 1024;
const allowedDocuments = new Set([
  'business_registration',
  'county_license',
  'liquor_licence',
  'online_alcohol_licence',
  'wholesale_licence',
  'government_id',
  'selfie_photo',
  'shopfront_photo',
  'business_permit',
  'supplier_invoice',
  'kra_pin',
  'medical_cert',
  'food_hygiene',
  'tax_document',
  'premises_document',
  'other_permit'
]);
const alcoholRetailerRules = [
  'Do not sell or deliver alcohol to anyone below the configured legal minimum age.',
  'Ask for and verify an original government ID at the door.',
  'Do not complete a delivery when the customer appears intoxicated.',
  'Do not sell outside the approved terminal or alter product labels.',
  'Keep excise-stamp evidence and supplier invoices for every stock batch.',
  'Follow the approved county trading hours and platform delivery rules.'
];
const applicationAttempts = new Map<string, { count: number; resetAt: number }>();

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function value(form: FormData, key: string, maxLength: number): string {
  const candidate = form.get(key);
  return typeof candidate === 'string' ? candidate.trim().slice(0, maxLength) : '';
}

function validateFileSignature(file: File): boolean {
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return false;
  return true;
}

function getExtension(type: string): string {
  if (type === 'application/pdf') return 'pdf';
  if (type === 'image/jpeg') return 'jpg';
  return 'png';
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const businessType = params.get('businessType');
  const county = (params.get('county') || '').trim().slice(0, 100);
  const vendorType = params.get('vendorType');
  if (!isMerchantBusinessType(businessType)) {
    return NextResponse.json({ error: 'Choose a supported business type.' }, { status: 400 });
  }
  const expectedVendorType = merchantVendorTypeForBusinessType(businessType);
  if (vendorType && (!isMerchantVendorType(vendorType) || vendorType !== expectedVendorType)) {
    return NextResponse.json({ error: 'Choose a supported vendor category.' }, { status: 400 });
  }
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Merchant requirements are temporarily unavailable.' }, { status: 503 });
  const { data, error } = await database.from('merchant_document_requirements')
    .select('id, business_type, county, document_type, label, is_required, is_active')
    .in('business_type', ['*', businessType])
    .in('county', ['*', county.toLowerCase() || '*']);
  if (error) {
    console.error('[MerchantApplications] Could not load document requirements:', error);
    return NextResponse.json({ error: 'Document requirements are unavailable. Confirm the merchant operations migration is installed.' }, { status: 503 });
  }
  const { data: onboardingControls, error: controlsError } = await database
    .from('merchant_onboarding_controls')
    .select('allow_document_deferral')
    .eq('id', true)
    .maybeSingle();
  if (controlsError || !onboardingControls) {
    console.error('[MerchantApplications] Could not load onboarding controls:', controlsError);
    return NextResponse.json({ error: 'Merchant onboarding is unavailable. Run supabase/MERCHANT_ONBOARDING_EXPERIENCE_MIGRATION.sql after MERCHANT_OPERATIONS_MIGRATION.sql.' }, { status: 503 });
  }
  const requirements = resolveMerchantDocumentRequirements(
    (data || []) as MerchantDocumentRequirement[],
    businessType,
    county
  ).map(({ document_type, label, is_required }) => ({ type: document_type, label, required: is_required }));
  const categoryDocument = expectedVendorType === 'retailer'
    ? { type: 'liquor_licence', label: 'Alcohol retail licence', required: true }
    : expectedVendorType === 'wholesaler'
      ? { type: 'wholesale_licence', label: 'Alcohol wholesale licence', required: true }
      : null;
  if (categoryDocument) {
    const existing = requirements.find(requirement => requirement.type === categoryDocument.type);
    if (existing) {
      existing.label = categoryDocument.label;
      existing.required = true;
    } else {
      requirements.push(categoryDocument);
    }
  }
  return NextResponse.json({
    requirements,
    documentsMayBeDeferred: onboardingControls.allow_document_deferral
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  const accountToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!supabaseUrl || !publicKey || !accountToken) {
    return NextResponse.json({ error: 'Sign in with a verified OnlineBar account before submitting your merchant application.' }, { status: 401 });
  }
  const authClient = createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: accountData, error: accountError } = await authClient.auth.getUser(accountToken);
  const accountUser = accountData.user;
  if (accountError || !accountUser
    || !(accountUser.email_confirmed_at || accountUser.phone_confirmed_at)) {
    return NextResponse.json({ error: 'Verify your OnlineBar account, then return here and submit again.' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
  const now = Date.now();
  if (applicationAttempts.size > 5_000) {
    for (const [address, attempt] of applicationAttempts) {
      if (attempt.resetAt <= now) applicationAttempts.delete(address);
      if (applicationAttempts.size <= 2_500) break;
    }
  }
  const prior = applicationAttempts.get(ip);
  if (prior && prior.resetAt > now && prior.count >= 5) {
    return NextResponse.json({ error: 'Too many applications from this network. Please try again later.' }, { status: 429 });
  }
  applicationAttempts.set(ip, prior && prior.resetAt > now
    ? { count: prior.count + 1, resetAt: prior.resetAt }
    : { count: 1, resetAt: now + 60 * 60 * 1000 });

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_TOTAL_FILE_SIZE + 256_000) {
    return NextResponse.json({ error: 'Application files exceed the 15 MB total upload limit.' }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'A valid multipart application is required.' }, { status: 400 });
  }

  const businessTypeValue = value(form, 'businessType', 40);
  if (!isMerchantBusinessType(businessTypeValue)) {
    return NextResponse.json({ error: 'Choose a supported business type.' }, { status: 400 });
  }
  const expectedVendorType = merchantVendorTypeForBusinessType(businessTypeValue);
  const vendorTypeInput = value(form, 'vendorType', 40);
  if (businessTypeValue !== 'delivery_partner' && !expectedVendorType) {
    return NextResponse.json({ error: 'Choose a supported vendor category.' }, { status: 400 });
  }
  if (vendorTypeInput && (!isMerchantVendorType(vendorTypeInput) || vendorTypeInput !== expectedVendorType)) {
    return NextResponse.json({ error: 'The vendor category must match the selected business type.' }, { status: 400 });
  }
  const vendorTypeValue = expectedVendorType;
  let alcoholOnboarding: Record<string, unknown> | null = null;
  const alcoholOnboardingRaw = value(form, 'alcoholOnboarding', 16_000);
  if (businessTypeValue === 'bar' && vendorTypeValue === 'retailer') {
    try {
      const parsed = JSON.parse(alcoholOnboardingRaw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid alcohol profile.');
      alcoholOnboarding = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Complete the alcohol retailer onboarding checklist before submitting.' }, { status: 400 });
    }
  } else if (alcoholOnboardingRaw) {
    return NextResponse.json({ error: 'Alcohol retailer details can only be submitted by a bar / retailer application.' }, { status: 400 });
  }
  const businessName = value(form, 'businessName', 160);
  const inviteToken = value(form, 'inviteToken', 128);
  const tradingName = value(form, 'tradingName', 160);
  let offeredGoodsIds: number[] = [];
  let offeredGoodsPrices: Array<{ productId: number; price: number }> = [];
  try {
    const offeredGoodsValue = value(form, 'offeredGoods', 2000);
    const offeredGoodsPricingValue = value(form, 'offeredGoodsPricing', 5000);
    if (offeredGoodsValue) {
      const parsedGoods = JSON.parse(offeredGoodsValue) as unknown;
      if (!Array.isArray(parsedGoods) || parsedGoods.length > 50
        || !parsedGoods.every(item => Number.isSafeInteger(item) && Number(item) > 0)
        || new Set(parsedGoods).size !== parsedGoods.length) {
        throw new Error('Invalid offered goods selection.');
      }
      offeredGoodsIds = parsedGoods as number[];
    }
    if (offeredGoodsPricingValue) {
      const parsedPricing = JSON.parse(offeredGoodsPricingValue) as unknown;
      if (!Array.isArray(parsedPricing) || parsedPricing.length > 50
        || !parsedPricing.every(item => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
          const offer = item as Record<string, unknown>;
          return typeof offer.productId === 'number'
            && Number.isSafeInteger(offer.productId)
            && Number(offer.productId) > 0
            && typeof offer.price === 'number'
            && Number.isFinite(offer.price)
            && offer.price > 0
            && offer.price <= 10_000_000
            && Number(offer.price.toFixed(2)) === offer.price;
        })) {
        throw new Error('Invalid offered goods prices.');
      }
      offeredGoodsPrices = parsedPricing as Array<{ productId: number; price: number }>;
      if (offeredGoodsPrices.length !== offeredGoodsIds.length
        || offeredGoodsPrices.some(offer => !offeredGoodsIds.includes(offer.productId))
        || new Set(offeredGoodsPrices.map(offer => offer.productId)).size !== offeredGoodsPrices.length) {
        throw new Error('Every selected product needs exactly one valid offer price.');
      }
    } else if (offeredGoodsIds.length) {
      throw new Error('Every selected product needs an offer price.');
    }
  } catch {
    return NextResponse.json({ error: 'Choose available goods and enter a valid offer price for each selected product.' }, { status: 400 });
  }
  if (alcoholOnboarding) {
    const products = alcoholOnboarding.products;
    const rules = alcoholOnboarding.rules;
    const acceptedRules = alcoholOnboarding.acceptedRules;
    const distance = alcoholOnboarding.distanceToSchoolMeters;
    const invalidProducts = !Array.isArray(products)
      || products.length < 3
      || products.length !== offeredGoodsIds.length
      || !products.every(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const product = item as Record<string, unknown>;
        return typeof product.productId === 'number'
          && Number.isSafeInteger(product.productId)
          && offeredGoodsIds.includes(Number(product.productId))
          && typeof product.size === 'string'
          && product.size.trim().length > 0
          && typeof product.abv === 'number'
          && Number.isFinite(product.abv)
          && product.abv >= 0
          && product.abv <= 100
          && typeof product.price === 'number'
          && Number.isFinite(product.price)
          && product.price > 0
          && product.exciseStampConfirmed === true;
      });
    const invalidRules = !rules || typeof rules !== 'object' || Array.isArray(rules)
      || ![18, 21].includes(Number((rules as Record<string, unknown>).minimumAge))
      || !Number.isInteger((rules as Record<string, unknown>).maximumBottlesPerOrder)
      || Number((rules as Record<string, unknown>).maximumBottlesPerOrder) < 1
      || Number((rules as Record<string, unknown>).maximumBottlesPerOrder) > 100
      || !Number.isInteger((rules as Record<string, unknown>).schoolBufferMeters)
      || Number((rules as Record<string, unknown>).schoolBufferMeters) < 0
      || Number((rules as Record<string, unknown>).schoolBufferMeters) > 5000;
    const rulesAreAccepted = Array.isArray(acceptedRules)
      && acceptedRules.length === 6
      && acceptedRules.every(item => item && typeof item === 'object'
        && !Array.isArray(item)
        && (item as Record<string, unknown>).accepted === true
        && typeof (item as Record<string, unknown>).rule === 'string')
      && acceptedRules.every((item, index) =>
        (item as Record<string, unknown>).rule === alcoholRetailerRules[index]);
    const distinctProducts = Array.isArray(products)
      && products.every(item => Boolean(item) && typeof item === 'object'
        && !Array.isArray(item)
        && typeof (item as Record<string, unknown>).productId === 'number')
      && new Set(products.map(item => Number((item as Record<string, unknown>).productId))).size === offeredGoodsIds.length
      && offeredGoodsIds.every(id => products.some(item =>
        Number((item as Record<string, unknown>).productId) === id));
    const countyLicenceNumber = String(alcoholOnboarding.countyLicenceNumber || '').trim();
    const onlineLicenceNumber = String(alcoholOnboarding.onlineLicenceNumber || '').trim();
    if (!/^\d{4}$/.test(String(alcoholOnboarding.nationalIdLast4 || ''))
      || (countyLicenceNumber && !/^NCC\/OFF\/\d{4}\/\d{5}$/.test(countyLicenceNumber))
      || (onlineLicenceNumber && onlineLicenceNumber.length < 4)
      || !/^\d{5,20}$/.test(String(alcoholOnboarding.mpesaTill || ''))
      || String(alcoholOnboarding.mpesaRegisteredName || '').trim().length < 2
      || typeof distance !== 'number'
      || !Number.isFinite(distance)
      || distance < 0
      || distance > 100_000
      || invalidProducts
      || !distinctProducts
      || invalidRules
      || !rulesAreAccepted
      || String(alcoholOnboarding.typedSignature || '').trim().length < 3) {
      return NextResponse.json({ error: 'Complete all required alcohol retailer details, at least three stamped products, and the six signed operating rules.' }, { status: 400 });
    }
    alcoholOnboarding = {
      ...alcoholOnboarding,
      distanceCheck: 'merchant_reported_pending_admin_measurement',
      schoolReviewRequired: distance < 300,
      identityCheck: 'pending_manual_review',
      licenceCheck: countyLicenceNumber && onlineLicenceNumber
        ? 'format_checked_pending_manual_review'
        : 'pending_reference_and_document_review',
      tillNameCheck: 'pending_manual_review',
      productStampCheck: 'merchant_attestation_pending_manual_review',
      submittedAt: new Date().toISOString()
    };
  }
  const email = value(form, 'email', 254).toLowerCase();
  const phone = value(form, 'phone', 40);
  const ownerName = value(form, 'ownerName', 120);
  const ownerRole = value(form, 'ownerRole', 80);
  const address = value(form, 'address', 240);
  const country = value(form, 'country', 80) || 'Kenya';
  const county = value(form, 'county', 100);
  const town = value(form, 'town', 100);
  const latitudeRaw = value(form, 'latitude', 30);
  const longitudeRaw = value(form, 'longitude', 30);
  const cuisineOrCategory = value(form, 'cuisineOrCategory', 120);
  const capacityRaw = value(form, 'preparationCapacity', 10);
  const radiusRaw = value(form, 'deliveryRadiusKm', 10);
  const collectionAvailable = value(form, 'collectionAvailable', 5) === 'true';
  let operatingAreas: string[];
  let operatingHours: MerchantOperatingHours;

  try {
    const areasValue = JSON.parse(value(form, 'operatingAreas', 2_000)) as unknown;
    const hoursValue = JSON.parse(value(form, 'operatingHours', 2_000)) as unknown;
    if (!Array.isArray(areasValue) || areasValue.length > 30
      || !areasValue.every(area => typeof area === 'string' && area.trim().length > 0 && area.length <= 100)) {
      throw new Error('Invalid service areas.');
    }
    if (typeof hoursValue !== 'object' || hoursValue === null || Array.isArray(hoursValue)) {
      throw new Error('Invalid operating hours.');
    }
    operatingAreas = [...new Set(areasValue.map(area => area.trim()))];
    operatingHours = normalizeMerchantOperatingHours(hoursValue);
    if (!isValidMerchantOperatingHours(operatingHours)) {
      throw new Error('Invalid operating hours.');
    }
  } catch {
    return NextResponse.json({ error: 'Provide valid operating areas and hours.' }, { status: 400 });
  }

  const preparationCapacity = capacityRaw ? Number(capacityRaw) : null;
  const deliveryRadiusKm = radiusRaw ? Number(radiusRaw) : null;
  const latitude = latitudeRaw ? Number(latitudeRaw) : null;
  const longitude = longitudeRaw ? Number(longitudeRaw) : null;
  const hasCoordinates = latitude !== null && longitude !== null;
  if (value(form, 'privacyAcknowledged', 5) !== 'true') {
    return NextResponse.json({ error: 'Confirm the application privacy notice before submission.' }, { status: 400 });
  }
  if (
    businessName.length < 2
    || !validateEmail(email)
    || phone.length < 7
    || ownerName.length < 2
    || ownerRole.length < 2
    || address.length < 4
    || county.length < 2
    || town.length < 2
    || (capacityRaw && (!Number.isInteger(preparationCapacity) || Number(preparationCapacity) < 1 || Number(preparationCapacity) > 100_000))
    || (radiusRaw && (!Number.isFinite(deliveryRadiusKm) || Number(deliveryRadiusKm) < 0 || Number(deliveryRadiusKm) > 500))
    || (Boolean(latitudeRaw) !== Boolean(longitudeRaw))
    || (hasCoordinates && (
      !Number.isFinite(latitude) || latitude! < -90 || latitude! > 90
      || !Number.isFinite(longitude) || longitude! < -180 || longitude! > 180
    ))
  ) {
    return NextResponse.json({ error: 'Complete the required business, contact, location, and operations fields with valid values.' }, { status: 400 });
  }

  const database = getDatabase();
  if (!database) {
    return NextResponse.json({ error: 'Merchant applications are temporarily unavailable. Please try again later.' }, { status: 503 });
  }
  const { data: onboardingControls, error: controlsError } = await database
    .from('merchant_onboarding_controls')
    .select('allow_document_deferral')
    .eq('id', true)
    .maybeSingle();
  if (controlsError || !onboardingControls) {
    console.error('[MerchantApplications] Could not load onboarding controls:', controlsError);
    return NextResponse.json({ error: 'Merchant onboarding is unavailable. Run supabase/MERCHANT_ONBOARDING_EXPERIENCE_MIGRATION.sql after MERCHANT_OPERATIONS_MIGRATION.sql.' }, { status: 503 });
  }
  let offeredGoods: string[] = [];
  let verifiedOffers: Array<{ product_id: number; product_name: string; price: number; currency: 'KES' }> = [];
  if (offeredGoodsIds.length) {
    const { data: selectedProducts, error: selectedProductsError } = await database
      .from('products')
      .select('id, name, status, hide_product, is_available_now, category, sub_category, is_bite, is_snack, is_souvenir')
      .in('id', offeredGoodsIds);
    if (selectedProductsError) {
      console.error('[MerchantApplications] Could not verify offered goods:', selectedProductsError);
      return NextResponse.json({ error: 'The available goods list could not be verified. Refresh the application and try again.' }, { status: 503 });
    }
    const visibleProducts = (selectedProducts || []).filter(isStorefrontProductVisible);
    if (visibleProducts.length !== offeredGoodsIds.length) {
      return NextResponse.json({ error: 'One or more selected goods are no longer available. Refresh the list and submit again.' }, { status: 400 });
    }
    if (businessTypeValue === 'kitchen' || businessTypeValue === 'restaurant' || businessTypeValue === 'food_vendor') {
      if (visibleProducts.some(product => !isKitchenFoodProduct(product))) {
        return NextResponse.json({ error: 'Food businesses can only add food or snack items from the catalogue.' }, { status: 400 });
      }
    } else if ((businessTypeValue === 'bar' || businessTypeValue === 'supplier')
      && visibleProducts.some(product => !isBeverageInventoryProduct(product))) {
      return NextResponse.json({ error: 'Retailers and suppliers can only add beverage items from the catalogue.' }, { status: 400 });
    }
    offeredGoods = visibleProducts
      .map(product => String(product.name || '').trim())
      .filter(name => name.length > 1 && name.length <= 120);
    if (offeredGoods.length !== offeredGoodsIds.length) {
      return NextResponse.json({ error: 'One or more selected goods could not be verified. Refresh the list and submit again.' }, { status: 400 });
    }
    verifiedOffers = offeredGoodsPrices.map(offer => {
      const product = visibleProducts.find(candidate => Number(candidate.id) === offer.productId);
      return {
        product_id: offer.productId,
        product_name: String(product?.name || '').trim(),
        price: offer.price,
        currency: 'KES'
      };
    });
  }
  let invitationLead: { id: string; business_name: string; vendor_type: string } | null = null;
  let branchInvite: { business_id: string; business_name: string; business_type: string } | null = null;
  let invitationTokenHash: string | null = null;
  if (inviteToken) {
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(inviteToken)) {
      return NextResponse.json({ error: 'This company onboarding link is invalid or expired.' }, { status: 410 });
    }
    invitationTokenHash = createHash('sha256').update(inviteToken).digest('hex');
    const { data: lead, error: inviteError } = await database.from('vendor_onboarding_leads')
      .select('id,business_name,vendor_type')
      .eq('invite_token_hash', invitationTokenHash)
      .gt('invite_expires_at', new Date().toISOString())
      .is('invite_used_at', null)
      .is('invite_application_id', null)
      .maybeSingle();
    if (inviteError) {
      if (inviteError.code === '42P01' || inviteError.code === 'PGRST205' || /invite_token_hash/i.test(inviteError.message)) {
        return NextResponse.json({
          error: 'Private onboarding links are not configured. Ask the OnBar team to apply the vendor pipeline, invite, and shared-draft migrations in order.'
        }, { status: 503 });
      }
      console.error('[MerchantApplications] Could not verify the company invitation:', inviteError);
      return NextResponse.json({ error: 'The company invitation could not be verified.' }, { status: 503 });
    }
    if (lead && ['retailer', 'wholesaler', 'street_food'].includes(lead.vendor_type)) {
      const invitedBusinessType = lead.vendor_type === 'retailer'
        ? 'bar'
        : lead.vendor_type === 'wholesaler'
          ? 'supplier'
          : 'food_vendor';
      if (businessTypeValue !== invitedBusinessType
        || businessName.trim().toLowerCase() !== lead.business_name.trim().toLowerCase()) {
        return NextResponse.json({
          error: 'This invitation is limited to the named company and its assigned partner category.'
        }, { status: 400 });
      }
      invitationLead = lead;
      const cookieStore = await cookies();
      const adminSession = await verifySessionCookie(cookieStore.get('admin_session')?.value);
      if (adminSession) {
        return NextResponse.json({
          error: 'Your team can prepare and save this application, but the merchant must open the link, review the details, accept the privacy notice, and submit it themselves.'
        }, { status: 403 });
      }
    } else {
      const { data: branch, error: branchError } = await database
        .from('merchant_business_branch_invites')
        .select('business_id,business:merchant_businesses(business_name,business_type)')
        .eq('token_hash', invitationTokenHash)
        .gt('expires_at', new Date().toISOString())
        .is('used_application_id', null)
        .maybeSingle();
      if (branchError) {
        console.error('[MerchantApplications] Could not verify business branch link:', branchError);
        return NextResponse.json({
          error: 'Branch onboarding is not configured. Contact the business owner or OnBar support.'
        }, { status: 503 });
      }
      const branchBusiness = Array.isArray(branch?.business) ? branch.business[0] : branch?.business;
      if (!branch || !branchBusiness
        || branchBusiness.business_type !== businessTypeValue
        || branchBusiness.business_name.trim().toLowerCase() !== businessName.trim().toLowerCase()) {
        return NextResponse.json({ error: 'This branch link is invalid, expired, or not for this business.' }, { status: 410 });
      }
      branchInvite = {
        business_id: branch.business_id,
        business_name: branchBusiness.business_name,
        business_type: branchBusiness.business_type
      };
    }
  }
  const { data: configuredRequirements, error: requirementsError } = await database
    .from('merchant_document_requirements')
    .select('id, business_type, county, document_type, label, is_required, is_active')
    .in('business_type', ['*', businessTypeValue])
    .in('county', ['*', county.toLowerCase()]);
  if (requirementsError) {
    console.error('[MerchantApplications] Could not validate configured documents:', requirementsError);
    return NextResponse.json({ error: 'Application document requirements are unavailable. Please try again later.' }, { status: 503 });
  }
  const requiredTypes = resolveMerchantDocumentRequirements(
    (configuredRequirements || []) as MerchantDocumentRequirement[],
    businessTypeValue,
    county
  ).filter(requirement => requirement.is_required).map(requirement => requirement.document_type);
  const categoryDocumentType = vendorTypeValue === 'retailer'
    ? 'liquor_licence'
    : vendorTypeValue === 'wholesaler'
      ? 'wholesale_licence'
      : null;
  if (categoryDocumentType && !requiredTypes.includes(categoryDocumentType)) {
    requiredTypes.push(categoryDocumentType);
  }
  if (alcoholOnboarding) {
    for (const type of [
      'government_id',
      'selfie_photo',
      'shopfront_photo',
      'online_alcohol_licence',
      'business_permit',
      'kra_pin',
      'premises_document',
      'supplier_invoice'
    ]) {
      if (!requiredTypes.includes(type)) requiredTypes.push(type);
    }
  }

  const fileEntries: { type: string; file: File; expiresAt: string | null }[] = [];
  const seenDocumentTypes = new Set<string>();
  let totalBytes = 0;
  for (const [key, entry] of form.entries()) {
    if (!key.startsWith('document:') || !(entry instanceof File) || entry.size === 0) continue;
    const type = key.slice('document:'.length);
    if (!allowedDocuments.has(type)) {
      return NextResponse.json({ error: 'One or more document categories are not supported.' }, { status: 400 });
    }
    if ((type === 'selfie_photo' || type === 'shopfront_photo') && !['image/jpeg', 'image/png'].includes(entry.type)) {
      return NextResponse.json({ error: 'The selfie and shopfront uploads must be JPEG or PNG images.' }, { status: 400 });
    }
    if (seenDocumentTypes.has(type)) {
      return NextResponse.json({ error: 'Upload only one file for each document category.' }, { status: 400 });
    }
    seenDocumentTypes.add(type);
    if (entry.size > MAX_FILE_SIZE || !validateFileSignature(entry)) {
      return NextResponse.json({ error: 'Documents must be PDF, JPG, or PNG files no larger than 5 MB each.' }, { status: 400 });
    }
    const bytes = new Uint8Array(await entry.slice(0, 8).arrayBuffer());
    const hasValidSignature = entry.type === 'application/pdf'
      ? bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
      : entry.type === 'image/png'
        ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!hasValidSignature) {
      return NextResponse.json({ error: 'A document file does not match its declared file format.' }, { status: 400 });
    }
    totalBytes += entry.size;
    if (totalBytes > MAX_TOTAL_FILE_SIZE) {
      return NextResponse.json({ error: 'Application files exceed the 15 MB total upload limit.' }, { status: 413 });
    }
    const expiryValue = value(form, `expiry:${type}`, 10);
    if ((type === 'liquor_licence' || type === 'wholesale_licence' || type === 'online_alcohol_licence') && !expiryValue) {
      return NextResponse.json({ error: 'Alcohol licence documents must include their expiry date.' }, { status: 400 });
    }
    if (expiryValue) {
      const expiryDate = new Date(`${expiryValue}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryValue)
        || !Number.isFinite(expiryDate.getTime())
        || expiryDate.toISOString().slice(0, 10) !== expiryValue) {
        return NextResponse.json({ error: 'Document expiry dates must use YYYY-MM-DD.' }, { status: 400 });
      }
    }
    fileEntries.push({ type, file: entry, expiresAt: expiryValue || null });
  }

  const missingRequiredTypes = getMissingMerchantDocumentTypes(requiredTypes, fileEntries);
  const isLiquorRetailerApplication = businessTypeValue === 'bar' && vendorTypeValue === 'retailer' && Boolean(alcoholOnboarding);
  if (missingRequiredTypes.length && !onboardingControls.allow_document_deferral && !isLiquorRetailerApplication) {
    const applicableRequirements = resolveMerchantDocumentRequirements(
      (configuredRequirements || []) as MerchantDocumentRequirement[],
      businessTypeValue,
      county
    );
    const missingLabels = missingRequiredTypes
      .map(type => {
        const requirement = applicableRequirements.find(item => item.document_type === type);
        if (type === 'liquor_licence') return 'Alcohol retail licence';
        if (type === 'wholesale_licence') return 'Alcohol wholesale licence';
        return requirement?.label || type.replace(/_/g, ' ');
      });
    return NextResponse.json({
      error: `Upload all required documents: ${missingLabels.join(', ')}.`
    }, { status: 400 });
  }

  const applicationId = crypto.randomUUID();
  const documentsDueAt = missingRequiredTypes.length
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const uploadedPaths: string[] = [];
  try {
    const documents: MerchantApplicationDocument[] = [];
    for (const entry of fileEntries) {
      const documentId = crypto.randomUUID();
      const objectPath = `${applicationId}/${documentId}.${getExtension(entry.file.type)}`;
      const { error: uploadError } = await database.storage
        .from(DOCUMENT_BUCKET)
        .upload(objectPath, entry.file, {
          contentType: entry.file.type,
          cacheControl: '0',
          upsert: false
        });
      if (uploadError) throw new Error(`Could not securely store ${entry.type}: ${uploadError.message}`);
      uploadedPaths.push(objectPath);
      documents.push({
        id: documentId,
        type: entry.type,
        name: entry.file.name.replace(/[^\w.\- ()]/g, '_').slice(0, 160),
        contentType: entry.file.type,
        objectPath,
        uploadedAt: new Date().toISOString(),
        expiresAt: entry.expiresAt
      });
    }

    const applicationPayload = {
      id: applicationId,
      account_user_id: accountUser.id,
      business_name: businessName,
      trading_name: tradingName || null,
      business_type: businessTypeValue,
      vendor_type: vendorTypeValue,
      email,
      phone,
      owner_name: ownerName,
      owner_role: ownerRole,
      address,
      country,
      county,
      town,
      latitude,
      longitude,
      operating_areas: operatingAreas,
      operating_hours: operatingHours,
      cuisine_or_category: cuisineOrCategory || null,
      preparation_capacity: preparationCapacity,
      delivery_radius_km: deliveryRadiusKm,
      collection_available: collectionAvailable,
      offered_goods: offeredGoods,
      offered_goods_pricing: verifiedOffers,
      ...(alcoholOnboarding ? { accepting_orders: false } : {}),
      ...(alcoholOnboarding ? { alcohol_onboarding: alcoholOnboarding } : {}),
      documents,
      documents_deferred: missingRequiredTypes.length > 0,
      ...(documentsDueAt ? { documents_due_at: documentsDueAt } : {}),
      privacy_notice_version: 'merchant-application-v1',
      privacy_acknowledged_at: new Date().toISOString(),
      status: 'submitted'
    };
    const { error: applicationError } = await database.from('merchant_applications').insert({
      ...applicationPayload,
      ...(invitationLead ? { onboarding_lead_id: invitationLead.id } : {})
    });
    if (applicationError) throw new Error(`Could not save the merchant application: ${applicationError.message}`);

    const { error: eventError } = await database.from('merchant_application_events').insert({
      application_id: applicationId,
      event_type: 'submitted',
      actor: 'applicant',
      details: {
        business_type: businessTypeValue,
        document_count: documents.length,
        documents_deferred: missingRequiredTypes.length > 0,
        deferred_document_types: missingRequiredTypes
      }
    });
    if (eventError) throw new Error(`Could not record application audit history: ${eventError.message}`);
    if (invitationLead && invitationTokenHash) {
      const { error: completionError } = await database.rpc('complete_vendor_onboarding_invite', {
        p_token_hash: invitationTokenHash,
        p_application_id: applicationId
      });
      if (completionError) throw new Error(`Could not complete the company invitation: ${completionError.message}`);
    }
    if (branchInvite && invitationTokenHash) {
      const { error: completionError } = await database.rpc('complete_merchant_business_branch_invite', {
        p_token_hash: invitationTokenHash,
        p_application_id: applicationId
      });
      if (completionError) throw new Error(`Could not link the branch application to its business account: ${completionError.message}`);
    }

    let documentsUploadUrl: string | undefined;
    let documentsUploadEmailSent = false;
    let documentsUploadWarning: string | undefined;
    if (missingRequiredTypes.length) {
      const uploadToken = randomBytes(32).toString('base64url');
      const uploadTokenHash = createHash('sha256').update(uploadToken).digest('hex');
      const { error: linkError } = await database.from('merchant_document_upload_links').insert({
        application_id: applicationId,
        token_hash: uploadTokenHash,
        expires_at: documentsDueAt,
        created_by: 'applicant_submission'
      });
      if (linkError) {
        console.error('[MerchantApplications] Could not create the applicant document upload link:', linkError);
        documentsUploadWarning = 'Your application was submitted, but we could not create the document link. Contact OnBar support to finish uploading your documents.';
      } else {
        const { error: linkEventError } = await database.from('merchant_application_events').insert({
          application_id: applicationId,
          event_type: 'document_upload_link_issued',
          actor: 'system',
          details: { expires_at: documentsDueAt, source: 'application_submission' }
        });
        if (linkEventError) {
          console.error('[MerchantApplications] Could not audit the applicant document upload link:', linkEventError);
          const { error: revokeError } = await database.from('merchant_document_upload_links')
            .update({ revoked_at: new Date().toISOString() })
            .eq('token_hash', uploadTokenHash);
          if (revokeError) console.error('[MerchantApplications] Could not revoke unaudited applicant upload link:', revokeError);
          documentsUploadWarning = 'Your application was submitted, but we could not safely issue the document link. Contact OnBar support to finish uploading your documents.';
        } else {
          documentsUploadUrl = `${getPublicBaseUrl()}/merchant/documents?token=${encodeURIComponent(uploadToken)}`;
          const emailConfig = getTransactionalEmailConfig();
          if (!emailConfig.configured) {
            documentsUploadWarning = 'Your application was submitted. Email delivery is not configured, so use the secure link below to upload your documents within seven days.';
          } else {
            try {
              const emailContent = renderVendorApplicationEmail({ businessName, uploadUrl: documentsUploadUrl });
              await sendTransactionalEmail({
                from: emailConfig.from,
                to: email,
                subject: emailContent.subject,
                text: emailContent.text,
                html: emailContent.html,
                idempotencyKey: `merchant-document-upload-${applicationId}-${uploadTokenHash.slice(0, 16)}`
              });
              documentsUploadEmailSent = true;
            } catch (emailError) {
              console.error('[MerchantApplications] Could not email the applicant document upload link:', emailError);
              documentsUploadWarning = 'Your application was submitted, but the email could not be sent. Use the secure link below to upload your documents within seven days.';
            }
          }
        }
      }
    }

    return NextResponse.json({
      id: applicationId,
      status: 'submitted',
      documentsUploadUrl,
      documentsUploadEmailSent,
      documentsUploadWarning
    }, { status: 201 });
  } catch (error) {
    console.error('[MerchantApplications] Submission failed:', error);
    if (uploadedPaths.length) {
      const { error: cleanupError } = await database.storage.from(DOCUMENT_BUCKET).remove(uploadedPaths);
      if (cleanupError) console.error('[MerchantApplications] Could not remove unlinked application documents:', cleanupError);
    }
    const { error: applicationCleanupError } = await database.from('merchant_applications').delete().eq('id', applicationId);
    if (applicationCleanupError) console.error('[MerchantApplications] Could not remove incomplete application:', applicationCleanupError);
    if (error instanceof Error && /account_user_id/i.test(error.message)) {
      return NextResponse.json({
        error: 'Merchant account linking is not installed yet. Run supabase/MERCHANT_APPLICATION_ACCOUNT_LINK_MIGRATION.sql, then retry your application.'
      }, { status: 503 });
    }
    if (error instanceof Error && /alcohol_onboarding|online_alcohol_licence|government_id|selfie_photo|shopfront_photo|business_permit|supplier_invoice/i.test(error.message)) {
      return NextResponse.json({
        error: 'Liquor retailer onboarding is not installed yet. Run supabase/MERCHANT_LIQUOR_ONBOARDING_MIGRATION.sql after supabase/MERCHANT_OPERATIONS_MIGRATION.sql, then retry.'
      }, { status: 503 });
    }
    if (error instanceof Error && /documents_due_at/i.test(error.message)) {
      return NextResponse.json({
        error: 'The seven-day document upload setup is not installed yet. Run supabase/MERCHANT_DOCUMENT_COMPLETION_WINDOW_MIGRATION.sql in Supabase, then try again.'
      }, { status: 503 });
    }
    if (error instanceof Error && /onboarding_lead_id|complete_vendor_onboarding_invite|vendor_onboarding_leads|complete_merchant_business_branch_invite|merchant_business_branch_invites/i.test(error.message)) {
      return NextResponse.json({
        error: 'Private onboarding setup is incomplete. Apply supabase/ONBOARDING_INVITES_MIGRATION.sql, then retry with a newly issued company link.'
      }, { status: 503 });
    }
    return NextResponse.json({
      error: 'The application could not be safely saved. Confirm the merchant operations migration and private document storage are configured, then retry.'
    }, { status: 500 });
  }
}
