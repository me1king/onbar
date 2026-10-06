import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyMarketingUnsubscribeToken } from '@/lib/marketingUnsubscribe';

export async function POST(request: Request) {
    let body: { token?: unknown };
    try {
        body = await request.json() as typeof body;
    } catch {
        return NextResponse.json({ error: 'A valid unsubscribe request is required.' }, { status: 400 });
    }
    if (typeof body.token !== 'string' || body.token.length > 1200) {
        return NextResponse.json({ error: 'The unsubscribe link is invalid.' }, { status: 400 });
    }

    let email: string | null;
    try {
        email = verifyMarketingUnsubscribeToken(body.token);
    } catch (error) {
        console.error('[NewsletterUnsubscribe] Token verification is not configured:', error);
        return NextResponse.json({ error: 'Unsubscribe service is temporarily unavailable.' }, { status: 503 });
    }
    if (!email) return NextResponse.json({ error: 'The unsubscribe link is invalid.' }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceKey) {
        return NextResponse.json({ error: 'Newsletter database access is not configured.' }, { status: 503 });
    }
    const database = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    const { error } = await database
        .from('newsletter_subscribers')
        .update({ is_active: false, unsubscribed_at: new Date().toISOString() })
        .eq('email', email)
        .eq('is_active', true);
    if (error) {
        console.error('[NewsletterUnsubscribe] Could not update subscription:', error);
        return NextResponse.json({ error: 'Could not update this newsletter preference. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
