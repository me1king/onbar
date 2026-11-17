import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { email?: unknown; consent?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid marketing preference is required.' }, { status: 400 });
  }

  if (typeof body.email !== 'string'
    || body.email.trim().length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
    || typeof body.consent !== 'boolean') {
    return NextResponse.json({ error: 'Enter a valid email address and choose a marketing preference.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Checkout marketing preferences are not configured.' }, { status: 503 });
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const email = body.email.trim().toLowerCase();
  const timestamp = new Date().toISOString();

  if (body.consent) {
    const { error } = await database.from('newsletter_subscribers')
      .upsert({
        email,
        is_active: true,
        consented_at: timestamp,
        unsubscribed_at: null,
        signup_source: 'checkout'
      }, { onConflict: 'email' });
    if (error) {
      console.error('[CheckoutMarketingConsent] Could not save promotional email opt-in:', error);
      return NextResponse.json({
        error: 'Your order details are unaffected, but we could not save the email opt-in. Apply CHECKOUT_EMAIL_MARKETING_OPTIN_MIGRATION.sql and try again.'
      }, { status: 503 });
    }
    return NextResponse.json({ saved: true });
  }

  const { error } = await database.from('newsletter_subscribers')
    .update({ is_active: false, unsubscribed_at: timestamp })
    .eq('email', email)
    .eq('is_active', true);
  if (error) {
    console.error('[CheckoutMarketingConsent] Could not remove promotional email opt-in:', error);
    return NextResponse.json({ error: 'Your promotional email preference could not be updated. Please try again.' }, { status: 503 });
  }
  const { error: recoveryError } = await database
    .from('checkout_recovery_sessions')
    .update({
      status: 'opted_out',
      recovery_token_hash: null,
      recovery_token_expires_at: null,
      updated_at: timestamp
    })
    .eq('customer_email', email)
    .in('status', ['active', 'abandoned', 'sending', 'sent', 'failed']);
  if (recoveryError) {
    console.error('[CheckoutMarketingConsent] Could not suppress pending recovery reminders:', recoveryError);
  }
  return NextResponse.json({ saved: false });
}
