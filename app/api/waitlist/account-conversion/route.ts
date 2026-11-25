import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { recordWaitlistAccountConversion } from '@/lib/waitlistLifecycle.server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'A signed-in account is required.' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !publicKey) {
    return NextResponse.json({ error: 'Account conversion tracking is not configured.' }, { status: 503 });
  }

  const auth = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: 'Your sign-in session is invalid or expired.' }, { status: 401 });

  try {
    const result = await recordWaitlistAccountConversion(data.user, new URL(request.url).origin);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (conversionError) {
    console.error('[WaitlistAccountConversion] Could not record account conversion:', conversionError);
    return NextResponse.json({
      error: 'Your account is ready, but waitlist conversion could not be recorded. Please contact support if your gift does not appear.'
    }, { status: 503 });
  }
}
