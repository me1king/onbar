import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createMarketingUnsubscribeToken } from '@/lib/marketingUnsubscribe';
import { createDrinkOfDayToken, getNairobiAge } from '@/lib/drinkOfDayToken.server';
import { getPublicBaseUrl } from '@/lib/utils';
import { isStorefrontProductVisible } from '@/lib/productVisibility';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CustomerProfile = {
  id: string;
  phone_number: string | null;
  full_name: string | null;
  email: string | null;
  birth_date: string | null;
};

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return `0${digits.slice(3)}`;
  return digits;
}

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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

function canManageDrinkMarketing(session: NonNullable<Awaited<ReturnType<typeof getAdminSession>>>) {
  return ['owner', 'admin'].includes(session.role.toLowerCase())
    || hasAdminPermission(session, 'can_manage_marketing')
    || hasAdminPermission(session, 'can_manage_communications');
}

async function authorize(request?: Request) {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  if (!canManageDrinkMarketing(session)) {
    return { response: NextResponse.json({ error: 'Marketing permission is required to send this email.' }, { status: 403 }) };
  }
  if (request && !isSameOriginRequest(request)) {
    return { response: NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 }) };
  }
  const database = createServerSupabaseClient();
  if (!database) return { response: NextResponse.json({ error: 'Marketing database access is not configured.' }, { status: 503 }) };
  return { database, session };
}

async function loadCustomerContext(database: NonNullable<ReturnType<typeof createServerSupabaseClient>>, phone: string) {
  const phoneKey = normalizePhone(phone);
  if (phoneKey.length < 7 || phoneKey.length > 15) {
    return { error: 'A valid customer phone number is required.', status: 400 as const };
  }
  const { data: profiles, error: profileError } = await database.from('profiles')
    .select('id,phone_number,full_name,email,birth_date')
    .in('phone_number', phoneVariants(phone));
  if (profileError) throw profileError;
  const customer = ((profiles || []) as CustomerProfile[]).find(profile =>
    profile.phone_number && normalizePhone(profile.phone_number) === phoneKey
  );
  if (!customer) {
    return { error: 'A registered customer profile is required for a personalized drink email.', status: 404 as const };
  }

  const email = customer.email?.trim().toLowerCase() || '';
  const customerPhones = phoneVariants(customer.phone_number || phone);
  const [consentResult, newsletterResult, suppressionResult, ageCheckResult] = await Promise.all([
    database.from('user_consent').select('marketing,personalization').eq('user_id', customer.id).maybeSingle(),
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
      .in('customer_phone', customerPhones)
      .not('customer_id_checked_at', 'is', null)
      .limit(1)
      .maybeSingle()
  ]);
  const accessError = consentResult.error || newsletterResult.error || suppressionResult.error || ageCheckResult.error;
  if (accessError) throw accessError;

  const age = getNairobiAge(customer.birth_date);
  const hasAgeCheck = Boolean(ageCheckResult.data);
  const consent = consentResult.data;
  const reasons = [
    !email && 'Customer has no email address on their registered profile.',
    email && !newsletterResult.data && 'Customer has not opted into promotional email.',
    Boolean(suppressionResult.data) && 'This email is suppressed because of an unsubscribe, bounce, or complaint.',
    consent?.marketing !== true && 'Customer marketing consent is off.',
    consent?.personalization !== true && 'Customer personalization consent is off.',
    (age === null || age < 18 || !hasAgeCheck) && 'A recorded date of birth showing age 18+ and a delivery ID check are required.'
  ].filter((reason): reason is string => Boolean(reason));

  return {
    customer,
    email,
    age,
    hasAgeCheck,
    consent,
    eligible: reasons.length === 0,
    reasons
  };
}

async function loadProducts(database: NonNullable<ReturnType<typeof createServerSupabaseClient>>) {
  const { data, error } = await database.from('products').select('*').order('name').limit(500);
  if (error) throw error;
  return (data || [])
    .filter(product => isStorefrontProductVisible(product))
    .map(product => ({
      id: String(product.id),
      name: String(product.name || 'Drink'),
      category: String(product.category || product.sub_category || 'Beverage'),
      brand: typeof product.brand === 'string' ? product.brand : '',
      description: typeof product.short_description === 'string' && product.short_description.trim()
        ? product.short_description
        : typeof product.description === 'string' ? product.description : '',
      price: Number.isFinite(Number(product.price)) ? Number(product.price) : null,
      imageUrl: typeof product.image_url === 'string' ? product.image_url : ''
    }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  const access = await authorize();
  if ('response' in access) return access.response;
  try {
    const { phone } = await params;
    const context = await loadCustomerContext(access.database, phone);
    if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
    const products = context.eligible ? await loadProducts(access.database) : [];
    let suggestedProductId: string | null = null;
    if (products.length && context.consent?.personalization) {
      const { data: preferences, error } = await access.database.from('customer_product_preferences')
        .select('category_id,affinity_score')
        .eq('user_id', context.customer.id)
        .order('affinity_score', { ascending: false })
        .limit(5);
      if (error) throw error;
      const category = preferences?.[0]?.category_id?.toLowerCase();
      suggestedProductId = products.find(product => product.category.toLowerCase() === category)?.id || null;
    }
    return NextResponse.json({
      customer: {
        name: context.customer.full_name || 'Customer',
        email: context.email,
        eligible: context.eligible,
        reasons: context.reasons,
        ageCheckRecorded: context.hasAgeCheck
      },
      emailConfigured: getTransactionalEmailConfig().configured,
      products,
      suggestedProductId
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('[DrinkOfDayEmail] Could not load the customer campaign:', error);
    return NextResponse.json({ error: 'Drink of the Day email options could not be loaded.' }, { status: 503 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  const access = await authorize(request);
  if ('response' in access) return access.response;

  let body: { productId?: unknown; customMessage?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Choose a drink and enter a valid email message.' }, { status: 400 });
  }
  const productId = typeof body.productId === 'string' ? body.productId : '';
  const customMessage = typeof body.customMessage === 'string' ? body.customMessage.trim() : '';
  if (!/^[1-9]\d{0,17}$/.test(productId) || !Number.isSafeInteger(Number(productId))
    || customMessage.length > 500) {
    return NextResponse.json({ error: 'Choose a listed drink and keep your personal note under 500 characters.' }, { status: 400 });
  }

  let campaignId: string | null = null;
  try {
    const { phone } = await params;
    const context = await loadCustomerContext(access.database, phone);
    if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
    if (!context.eligible) {
      return NextResponse.json({
        error: 'This customer is not eligible for a personalized drink email.',
        reasons: context.reasons
      }, { status: 409 });
    }
    const products = await loadProducts(access.database);
    const product = products.find(item => item.id === productId);
    if (!product) {
      return NextResponse.json({ error: 'That drink is no longer available for a campaign.' }, { status: 409 });
    }
    const emailConfig = getTransactionalEmailConfig();
    if (!emailConfig.configured) {
      return NextResponse.json({ error: 'Marketing email is not configured on the server.' }, { status: 503 });
    }

    const token = createDrinkOfDayToken(context.customer.id, productId);
    const origin = getPublicBaseUrl();
    const drinkUrl = `${origin}/drink-of-the-day/${encodeURIComponent(token)}`;
    const unsubscribeUrl = `${origin}/newsletter/unsubscribe?token=${encodeURIComponent(createMarketingUnsubscribeToken(context.email))}`;
    const firstName = context.customer.full_name?.trim().split(/\s+/)[0] || 'there';
    const subject = `${firstName}, your Drink of the Day is here`;
    const greeting = `Hello ${firstName},`;
    const productDescription = product.description.trim()
      ? `<p style="color:#475569;font-size:15px;line-height:1.6">${escapeHtml(product.description)}</p>`
      : '';
    const note = customMessage
      ? `<p style="color:#334155;font-size:15px;line-height:1.6">${escapeHtml(customMessage).replace(/\r?\n/g, '<br>')}</p>`
      : '';
    const price = product.price === null
      ? ''
      : `<p style="color:#92400e;font-size:16px;font-weight:700">KSh ${Math.round(product.price).toLocaleString('en-KE')}</p>`;
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:28px 12px;background:#f8fafc"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#fff;border-radius:20px;overflow:hidden">
      <tr><td style="padding:26px;background:#1c140d;color:#fff"><p style="margin:0;font-size:12px;font-weight:700;letter-spacing:2px">ONLINE BAR · YOUR DAILY PICK</p></td></tr>
      <tr><td style="padding:30px">
        <p style="margin:0 0 16px;color:#334155">${escapeHtml(greeting)}</p>
        <h1 style="margin:0 0 12px;color:#1c140d;font-size:28px">${escapeHtml(product.name)}</h1>
        <p style="margin:0;color:#a16207;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px">${escapeHtml(product.category)}${product.brand ? ` · ${escapeHtml(product.brand)}` : ''}</p>
        ${productDescription}${price}${note}
        <p style="margin:24px 0"><a href="${escapeHtml(drinkUrl)}" style="display:inline-block;border-radius:12px;background:#f59e0b;padding:15px 24px;color:#1c140d;text-decoration:none;font-weight:700">Reveal your Drink of the Day</a></p>
        <p style="color:#64748b;font-size:12px;line-height:1.6">This personal link expires in 30 days. Age and product availability rules apply.</p>
      </td></tr>
      <tr><td style="border-top:1px solid #e2e8f0;padding:20px 30px">
        <p style="margin:0;color:#64748b;font-size:12px">You received this promotional email because you opted in.</p>
        <p style="margin:8px 0 0;font-size:12px"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#475569">Unsubscribe from marketing emails</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
    const text = `${greeting}\n\nYour Drink of the Day: ${product.name} (${product.category}).${product.description ? `\n${product.description}` : ''}${customMessage ? `\n\n${customMessage}` : ''}${product.price === null ? '' : `\nKSh ${Math.round(product.price).toLocaleString('en-KE')}`}\n\nReveal your Drink of the Day: ${drinkUrl}\n\nYou received this promotional email because you opted in. Unsubscribe: ${unsubscribeUrl}`;

    const { data: campaign, error: campaignError } = await access.database.from('message_campaigns')
      .insert({
        name: `Drink of the Day · ${product.name}`.slice(0, 160),
        status: 'Sending',
        sent_count: 0,
        open_count: 0,
        attributed_revenue: 0,
        channel: 'email',
        message: customMessage || `Personalized Drink of the Day: ${product.name}`,
        sent_by: access.session.email || access.session.role
      })
      .select('id')
      .single();
    if (campaignError) throw campaignError;
    campaignId = campaign.id;

    try {
      await sendTransactionalEmail({
        from: emailConfig.from,
        to: context.email,
        subject,
        html,
        text,
        idempotencyKey: `drink-of-day-${campaign.id}`
      });
    } catch (sendError) {
      console.error('[DrinkOfDayEmail] Provider rejected the personalized email:', sendError);
      const errorMessage = sendError instanceof Error ? sendError.message : 'Email provider rejected the message.';
      const { error: deliveryError } = await access.database.from('message_campaign_deliveries').insert({
        campaign_id: campaign.id,
        user_id: context.customer.id,
        recipient_email: context.email,
        status: 'failed',
        error_message: errorMessage.slice(0, 1000)
      });
      if (deliveryError) console.error('[DrinkOfDayEmail] Failed email delivery could not be recorded:', deliveryError);
      const { error: updateError } = await access.database.from('message_campaigns')
        .update({ status: 'Failed', failed_count: 1, sent_at: new Date().toISOString() })
        .eq('id', campaign.id);
      if (updateError) console.error('[DrinkOfDayEmail] Failed campaign status could not be saved:', updateError);
      return NextResponse.json({ error: 'The email provider did not send the message. Check the Email Center and retry only after reviewing its status.' }, { status: 502 });
    }

    const { error: deliveryError } = await access.database.from('message_campaign_deliveries').insert({
      campaign_id: campaign.id,
      user_id: context.customer.id,
      recipient_email: context.email,
      status: 'sent'
    });
    const { error: campaignUpdateError } = await access.database.from('message_campaigns')
      .update({ status: 'Sent', sent_count: 1, failed_count: 0, sent_at: new Date().toISOString() })
      .eq('id', campaign.id);
    if (deliveryError || campaignUpdateError) {
      console.error('[DrinkOfDayEmail] Email sent, but campaign tracking failed:', deliveryError || campaignUpdateError);
      return NextResponse.json({
        sent: true,
        campaignId,
        error: 'The email was sent, but its campaign tracking record could not be fully saved. Check the Email Center before retrying.'
      }, { status: 502 });
    }
    return NextResponse.json({ sent: true, campaignId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[DrinkOfDayEmail] Could not send personalized campaign:', error);
    return NextResponse.json({
      error: campaignId
        ? 'The campaign could not be completed. Check the Email Center before retrying.'
        : 'Drink of the Day email could not be sent.'
    }, { status: 503 });
  }
}
