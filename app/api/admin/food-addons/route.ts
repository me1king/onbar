import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function getDatabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key
        ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
        : null;
}

async function isAdmin() {
    const store = await cookies();
    const session = await verifySessionCookie(store.get('admin_session')?.value);
    return Boolean(session && (
        session.role === 'owner'
        || session.role === 'admin'
        || session.permissions?.can_manage_marketing === true
    ));
}

export async function GET() {
    if (!await isAdmin()) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    const database = getDatabase();
    if (!database) return NextResponse.json({ error: 'Food add-on database access is not configured.' }, { status: 500 });

    const { data, error } = await database.from('food_addons')
        .select('id, name, price, is_active, created_at')
        .order('name');
    if (error) {
        console.error('[FoodAddons] Could not load meal extras:', error);
        const missingTable = error.code === '42P01' || error.code === 'PGRST205';
        return NextResponse.json({
            error: missingTable
                ? 'Meal extras storage is missing. Run supabase/FOOD_ADDONS_MIGRATION.sql in Supabase.'
                : `Could not load meal extras: ${error.message}`
        }, { status: 500 });
    }
    return NextResponse.json({ addons: data || [] });
}

export async function POST(request: Request) {
    if (!await isAdmin()) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    let body: { id?: unknown; name?: unknown; price?: unknown; is_active?: unknown };
    try {
        body = await request.json() as typeof body;
    } catch {
        return NextResponse.json({ error: 'A valid meal extra is required.' }, { status: 400 });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const price = typeof body.price === 'number' ? body.price : Number(body.price);
    if (!name || name.length > 80 || !Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: 'Enter a name (up to 80 characters) and a valid non-negative price.' }, { status: 400 });
    }
    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
        return NextResponse.json({ error: 'The meal extra availability value is invalid.' }, { status: 400 });
    }

    const database = getDatabase();
    if (!database) return NextResponse.json({ error: 'Food add-on database access is not configured.' }, { status: 500 });
    const values = {
        ...(typeof body.id === 'string' ? { id: body.id } : {}),
        name,
        price,
        is_active: body.is_active !== false,
        updated_at: new Date().toISOString()
    };
    const { data, error } = await database.from('food_addons').upsert(values).select('id, name, price, is_active').single();
    if (error) {
        console.error('[FoodAddons] Could not save meal extra:', error);
        return NextResponse.json({ error: `Could not save meal extra: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ addon: data });
}

export async function DELETE(request: Request) {
    if (!await isAdmin()) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'A meal extra ID is required.' }, { status: 400 });
    const database = getDatabase();
    if (!database) return NextResponse.json({ error: 'Food add-on database access is not configured.' }, { status: 500 });

    const { data, error } = await database.from('food_addons').delete().eq('id', id).select('id').maybeSingle();
    if (error) {
        console.error('[FoodAddons] Could not delete meal extra:', error);
        return NextResponse.json({ error: `Could not delete meal extra: ${error.message}` }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Meal extra was not found.' }, { status: 404 });
    return NextResponse.json({ success: true });
}
