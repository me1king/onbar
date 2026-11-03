import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !serviceKey || !publicKey) {
    return NextResponse.json({ error: 'Saved cart recovery is not configured.' }, { status: 503 });
  }
  if (!token) return NextResponse.json({ error: 'Sign in to restore your saved cart.' }, { status: 401 });

  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const auth = createClient(url, publicKey, options);
  const { data: { user }, error: authError } = await auth.auth.getUser(token);
  if (authError || !user?.email) {
    return NextResponse.json({ error: 'Your sign-in has expired. Sign in again.' }, { status: 401 });
  }

  const database = createClient(url, serviceKey, options);
  const { data, error } = await database
    .from('abandoned_carts')
    .select('cart_items, updated_at')
    .eq('customer_email', user.email.toLowerCase())
    .in('recovery_status', ['Waiting', 'Contacted'])
    .gt('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[AbandonedCart] Could not load customer saved cart:', error);
    return NextResponse.json({ error: 'Saved cart could not be loaded.' }, { status: 503 });
  }

  return NextResponse.json(
    { cart: data && Array.isArray(data.cart_items) && data.cart_items.length > 0 ? data : null },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
  );
}
