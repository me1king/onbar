import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function getAdminDatabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return null;
    return createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

async function authorizeAdmin() {
    const cookieStore = await cookies();
    const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
    return session && (
        session.role === 'owner'
        || session.role === 'admin'
        || session.permissions?.can_manage_marketing === true
    );
}

export async function GET() {
    if (!await authorizeAdmin()) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }

    const database = getAdminDatabase();
    if (!database) {
        return NextResponse.json({ error: 'Mobile widget database access is not configured on the server.' }, { status: 500 });
    }

    const { data: widgets, error: widgetsError } = await database
        .from('mobile_app_widgets')
        .select('*')
        .order('priority', { ascending: false });
    if (widgetsError) {
        console.error('[MobileWidgets] Could not load widgets:', widgetsError);
        const missingTable = widgetsError.code === '42P01' || widgetsError.code === 'PGRST205';
        return NextResponse.json({
            error: missingTable
                ? 'Mobile widget storage is missing. Run supabase/MOBILE_WIDGETS_MIGRATION.sql in Supabase.'
                : `Could not load mobile widgets: ${widgetsError.message}`
        }, { status: 500 });
    }

    const widgetIds = (widgets || []).map(widget => String(widget.id));
    const [productsResult, ordersResult] = await Promise.all([
        database.from('products').select('id, name, image_url').limit(100),
        widgetIds.length
            ? database.from('orders')
                .select('attribution_id, total_price')
                .in('attribution_id', widgetIds)
                .in('status', ['Paid', 'Delivered', 'Completed'])
            : Promise.resolve({ data: [], error: null })
    ]);

    if (productsResult.error) {
        console.error('[MobileWidgets] Could not load products:', productsResult.error);
        return NextResponse.json({ error: `Could not load products: ${productsResult.error.message}` }, { status: 500 });
    }

    const conversions: Record<string, { orders: number; revenue: number }> = {};
    let conversionError: string | null = null;
    if (ordersResult.error) {
        console.error('[MobileWidgets] Could not load attributed orders:', ordersResult.error);
        conversionError = ordersResult.error.message;
    } else {
        for (const order of ordersResult.data || []) {
            if (!order.attribution_id) continue;
            const total = conversions[order.attribution_id] || { orders: 0, revenue: 0 };
            total.orders += 1;
            total.revenue += Number(order.total_price) || 0;
            conversions[order.attribution_id] = total;
        }
    }

    return NextResponse.json({
        widgets: widgets || [],
        products: productsResult.data || [],
        conversions,
        conversionError
    });
}

export async function POST(request: Request) {
    if (!await authorizeAdmin()) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json() as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'A valid mobile widget is required.' }, { status: 400 });
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const contentType = body.content_type;
    const status = body.status;
    const priority = body.priority;
    const targetSegment = body.target_segment;
    const startAt = typeof body.start_at === 'string' ? new Date(body.start_at) : null;
    const allowedContentTypes = ['PRODUCT', 'TRENDING', 'ANNOUNCEMENT', 'ORDER'];
    const allowedStatuses = ['DRAFT', 'PUBLISHED', 'SCHEDULED', 'INACTIVE'];
    if (!title || !allowedContentTypes.includes(String(contentType))
        || !allowedStatuses.includes(String(status))
        || typeof priority !== 'number' || !Number.isInteger(priority)
        || typeof targetSegment !== 'string'
        || !startAt || !Number.isFinite(startAt.getTime())) {
        return NextResponse.json({ error: 'Enter a title, valid content type, status, priority, audience, and start time.' }, { status: 400 });
    }

    const expiresAt = body.expires_at === null || body.expires_at === ''
        ? null
        : typeof body.expires_at === 'string' && Number.isFinite(new Date(body.expires_at).getTime())
            ? new Date(body.expires_at).toISOString()
            : undefined;
    if (expiresAt === undefined) {
        return NextResponse.json({ error: 'Enter a valid expiry time or leave it empty.' }, { status: 400 });
    }

    const database = getAdminDatabase();
    if (!database) {
        return NextResponse.json({ error: 'Mobile widget database access is not configured on the server.' }, { status: 500 });
    }

    const payload = {
        ...(typeof body.id === 'string' ? { id: body.id } : {}),
        title,
        description: typeof body.description === 'string' ? body.description : '',
        content_type: contentType,
        image_url: typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : null,
        product_id: typeof body.product_id === 'string' && body.product_id ? body.product_id : null,
        cta_label: typeof body.cta_label === 'string' && body.cta_label.trim() ? body.cta_label.trim() : 'EXPLORE',
        deep_link: typeof body.deep_link === 'string' && body.deep_link.trim() ? body.deep_link.trim() : null,
        status,
        priority,
        target_segment: targetSegment,
        start_at: startAt.toISOString(),
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
    };

    const { data, error } = await database
        .from('mobile_app_widgets')
        .upsert(payload)
        .select('*')
        .single();
    if (error) {
        console.error('[MobileWidgets] Could not save widget:', error);
        return NextResponse.json({ error: `Could not save mobile widget: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ widget: data });
}

export async function DELETE(request: Request) {
    if (!await authorizeAdmin()) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'A widget ID is required.' }, { status: 400 });

    const database = getAdminDatabase();
    if (!database) {
        return NextResponse.json({ error: 'Mobile widget database access is not configured on the server.' }, { status: 500 });
    }

    const { data, error } = await database
        .from('mobile_app_widgets')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();
    if (error) {
        console.error('[MobileWidgets] Could not delete widget:', error);
        return NextResponse.json({ error: `Could not delete mobile widget: ${error.message}` }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Mobile widget was not found.' }, { status: 404 });

    return NextResponse.json({ success: true });
}
