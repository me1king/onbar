import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function getDatabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    return url && serviceKey
        ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
        : null;
}

async function canManageMarketing() {
    const store = await cookies();
    const session = await verifySessionCookie(store.get('admin_session')?.value);
    return Boolean(session && (
        session.role === 'owner'
        || session.role === 'admin'
        || session.permissions?.can_manage_marketing === true
    ));
}

export async function GET() {
    if (!await canManageMarketing()) return NextResponse.json({ error: 'Marketing access required.' }, { status: 401 });
    const database = getDatabase();
    if (!database) return NextResponse.json({ error: 'Newsletter database access is not configured.' }, { status: 503 });

    const subscribers = [];
    for (let offset = 0; ; offset += 500) {
        const { data, error } = await database
            .from('newsletter_subscribers')
            .select('id, email, created_at, is_active, consented_at, unsubscribed_at, signup_source')
            .order('created_at', { ascending: false })
            .range(offset, offset + 499);
        if (error) {
            console.error('[NewsletterSubscribers] Could not load contacts:', error);
            return NextResponse.json({ error: 'Could not load newsletter contacts.' }, { status: 500 });
        }
        subscribers.push(...(data || []));
        if (!data || data.length < 500) break;
    }
    return NextResponse.json({ subscribers });
}

export async function DELETE(request: Request) {
    if (!await canManageMarketing()) return NextResponse.json({ error: 'Marketing access required.' }, { status: 401 });
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'A valid subscriber ID is required.' }, { status: 400 });

    const database = getDatabase();
    if (!database) return NextResponse.json({ error: 'Newsletter database access is not configured.' }, { status: 503 });
    const { data, error } = await database
        .from('newsletter_subscribers')
        .update({ is_active: false, unsubscribed_at: new Date().toISOString() })
        .eq('id', Number(id))
        .eq('is_active', true)
        .select('id, email, is_active, unsubscribed_at')
        .maybeSingle();
    if (error) {
        console.error('[NewsletterSubscribers] Could not unsubscribe contact:', error);
        return NextResponse.json({ error: 'Could not unsubscribe this contact.' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'This contact is missing or already unsubscribed.' }, { status: 404 });
    return NextResponse.json({ subscriber: data });
}
