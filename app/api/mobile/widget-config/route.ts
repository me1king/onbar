import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * ONLINE BAR OS: MOBILE WIDGET API v2
 * Serves structured data for PWA Home Screen Widgets.
 */
export async function GET(request: Request) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        return NextResponse.json({ error: 'Mobile widget database access is not configured.' }, { status: 500 });
    }
    const database = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
        const now = new Date().toISOString();

        // 1. Fetch highest priority published widget
        const { data: widget, error } = await database
            .from('mobile_app_widgets')
            .select('*')
            .eq('status', 'PUBLISHED')
            .lte('start_at', now)
            .or(`expires_at.is.null,expires_at.gt.${now}`)
            .order('priority', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        // No configured widget is an explicit empty state, not an invented promotion.
        if (!widget) {
            return NextResponse.json({ available: false });
        }

        const baseUrl = new URL(request.url).origin;
        const configuredPath = widget.deep_link || (widget.product_id ? `/shop/${widget.product_id}` : '/shop');
        const deepLink = new URL(configuredPath, baseUrl);
        if (deepLink.origin !== baseUrl) {
            throw new Error('Widget deep links must remain on the storefront to preserve sales attribution.');
        }
        deepLink.searchParams.set('utm_source', 'mobile_widget');
        deepLink.searchParams.set('utm_campaign', 'home_widget');
        deepLink.searchParams.set('utm_id', String(widget.id));

        return NextResponse.json({
            available: true,
            id: widget.id,
            title: widget.title.toUpperCase(),
            description: widget.description,
            image_url: widget.image_url || null,
            cta_label: widget.cta_label || 'EXPLORE',
            deep_link: deepLink.toString(),
            content_type: widget.content_type
        });

    } catch (err) {
        console.error("Widget API Link Failure:", err);
        return NextResponse.json({ error: 'Internal Signal Failure' }, { status: 500 });
    }
}
