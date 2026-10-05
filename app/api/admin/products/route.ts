import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

type ProductPayload = Record<string, unknown>;
type AuthorizedDatabase = { database: SupabaseClient } | { response: NextResponse };

async function getAuthorizedDatabase(): Promise<AuthorizedDatabase> {
    const cookieStore = await cookies();
    const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
    if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
    if (!['owner', 'admin'].includes(session.role) && session.permissions.can_manage_inventory !== true) {
        return { response: NextResponse.json({ error: 'Inventory management access required.' }, { status: 403 }) };
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        return { response: NextResponse.json({ error: 'Product database access is not configured on the server.' }, { status: 500 }) };
    }

    return {
        database: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    };
}

function isProductPayload(value: unknown): value is ProductPayload {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function saveProduct(database: SupabaseClient, id: number | null, product: ProductPayload) {
    const payload = { ...product };

    while (true) {
        const result = id === null
            ? await database.from('products').insert(payload).select('id').single()
            : await database.from('products').update(payload).eq('id', id).select('id').single();

        if (!result.error && result.data) return { id: Number(result.data.id) };

        const message = result.error?.message || 'Product could not be saved.';
        const missingColumn = message.match(/Could not find the '([^']+)' column of 'products'/i);
        if (missingColumn?.[1] && missingColumn[1] in payload) {
            console.warn(`[ProductAdmin] Ignoring unavailable products column "${missingColumn[1]}" and retrying.`);
            delete payload[missingColumn[1]];
            continue;
        }
        throw new Error(message);
    }
}

export async function POST(request: Request) {
    const access = await getAuthorizedDatabase();
    if ('response' in access) return access.response;

    let body: { product?: unknown };
    try {
        body = await request.json() as typeof body;
    } catch {
        return NextResponse.json({ error: 'A valid product payload is required.' }, { status: 400 });
    }
    if (!isProductPayload(body.product) || typeof body.product.name !== 'string' || !body.product.name.trim()) {
        return NextResponse.json({ error: 'A product name and valid product payload are required.' }, { status: 400 });
    }

    try {
        const result = await saveProduct(access.database, null, body.product);
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        console.error('[ProductAdmin] Could not create product:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Product could not be created.' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    const access = await getAuthorizedDatabase();
    if ('response' in access) return access.response;

    let body: { id?: unknown; product?: unknown };
    try {
        body = await request.json() as typeof body;
    } catch {
        return NextResponse.json({ error: 'A valid product payload is required.' }, { status: 400 });
    }
    if (!Number.isSafeInteger(body.id) || Number(body.id) < 1 || !isProductPayload(body.product)) {
        return NextResponse.json({ error: 'A valid product ID and payload are required.' }, { status: 400 });
    }

    try {
        const result = await saveProduct(access.database, Number(body.id), body.product);
        return NextResponse.json(result);
    } catch (error) {
        console.error('[ProductAdmin] Could not update product:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Product could not be updated.' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const access = await getAuthorizedDatabase();
    if ('response' in access) return access.response;

    let body: { id?: unknown };
    try {
        body = await request.json() as typeof body;
    } catch {
        return NextResponse.json({ error: 'A valid product ID is required.' }, { status: 400 });
    }
    if (!Number.isSafeInteger(body.id) || Number(body.id) < 1) {
        return NextResponse.json({ error: 'A valid product ID is required.' }, { status: 400 });
    }

    const { data, error } = await access.database.from('products').delete().eq('id', Number(body.id)).select('id').maybeSingle();
    if (error) {
        console.error('[ProductAdmin] Could not delete product:', error);
        return NextResponse.json({ error: `Product could not be deleted: ${error.message}` }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    return NextResponse.json({ success: true });
}
