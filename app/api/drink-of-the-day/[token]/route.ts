import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { verifyDrinkOfDayToken, getNairobiAge } from '@/lib/drinkOfDayToken.server';
import { isStorefrontProductVisible } from '@/lib/productVisibility';

export const dynamic = 'force-dynamic';

function phoneVariants(value: string) {
  const digits = value.replace(/\D/g, '');
  const variants = new Set([value.trim(), digits]);
  if (digits.startsWith('0') && digits.length === 10) {
    variants.add(`254${digits.slice(1)}`);
    variants.add(`+254${digits.slice(1)}`);
  } else if (digits.startsWith('254') && digits.length === 12) {
    variants.add(`0${digits.slice(3)}`);
    variants.add(`+${digits}`);
  }
  return [...variants].filter(Boolean);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const link = verifyDrinkOfDayToken(token);
  if (!link) return NextResponse.json({ error: 'This personal Drink of the Day link is invalid or has expired.' }, { status: 410 });

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'The Drink of the Day is temporarily unavailable.' }, { status: 503 });

  const [
    { data: customer, error: customerError },
    { data: consent, error: consentError },
    { data: product, error: productError }
  ] = await Promise.all([
    database.from('profiles').select('full_name,email,birth_date,phone_number').eq('id', link.userId).maybeSingle(),
    database.from('user_consent').select('marketing,personalization').eq('user_id', link.userId).maybeSingle(),
    database.from('products').select('*').eq('id', Number(link.productId)).maybeSingle()
  ]);
  const databaseError = customerError || consentError || productError;
  if (databaseError) {
    console.error('[DrinkOfDayPage] Could not verify personal drink link:', databaseError);
    return NextResponse.json({ error: 'The Drink of the Day is temporarily unavailable.' }, { status: 503 });
  }
  if (!customer || !customer.phone_number || consent?.marketing !== true || consent.personalization !== true
    || !product || !isStorefrontProductVisible(product)) {
    return NextResponse.json({ error: 'This personal drink link is no longer available.' }, { status: 410 });
  }
  const email = String(customer.email || '').trim().toLowerCase();
  const [subscriberResult, suppressionResult, ageCheckResult] = await Promise.all([
    email
      ? database.from('newsletter_subscribers')
        .select('email,is_active,consented_at')
        .eq('email', email)
        .eq('is_active', true)
        .not('consented_at', 'is', null)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    email
      ? database.from('email_suppressions').select('email').eq('email', email).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    database.from('orders').select('id')
      .in('customer_phone', phoneVariants(customer.phone_number))
      .not('customer_id_checked_at', 'is', null)
      .limit(1)
      .maybeSingle()
  ]);
  const eligibilityError = subscriberResult.error || suppressionResult.error || ageCheckResult.error;
  if (eligibilityError) {
    console.error('[DrinkOfDayPage] Could not re-check customer eligibility:', eligibilityError);
    return NextResponse.json({ error: 'The Drink of the Day is temporarily unavailable.' }, { status: 503 });
  }
  const age = getNairobiAge(customer.birth_date);
  if (!email || !subscriberResult.data || suppressionResult.data || age === null || age < 18 || !ageCheckResult.data) {
    return NextResponse.json({ error: 'This personal drink link is no longer available.' }, { status: 410 });
  }

  const imageUrl = typeof product.image_url === 'string' ? product.image_url : '';
  return NextResponse.json({
    product: {
      id: String(product.id),
      name: String(product.name || 'Drink of the Day'),
      category: String(product.category || product.sub_category || 'Beverage'),
      brand: typeof product.brand === 'string' ? product.brand : '',
      description: typeof product.short_description === 'string' && product.short_description.trim()
        ? product.short_description
        : typeof product.description === 'string' ? product.description : '',
      price: Number.isFinite(Number(product.price)) ? Number(product.price) : null,
      imageUrl
    }
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
