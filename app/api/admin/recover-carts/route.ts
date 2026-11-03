import { NextResponse } from "next/server";
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getPublicBaseUrl } from "@/lib/utils";
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';

function escapeHtml(value: string) {
    const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return value.replace(/[&<>"']/g, character => entities[character] || character);
}

/**
 * Ghost Worker 2.0: Advanced Recovery Engine
 * This route detects inactivity (15m+) and triggers recovery campaigns.
 */
export async function POST(request: Request) {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    if (!hasAdminPermission(session, 'can_manage_communications')) {
        return NextResponse.json({ error: "Communications permission required." }, { status: 403 });
    }
    if (!isSameOriginRequest(request)) {
        return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
    }
    const supabase = createServerSupabaseClient();
    if (!supabase) return NextResponse.json({ error: "Server database access is not configured." }, { status: 503 });

    try {
        // 1. Inactivity Threshold: 15 minutes
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // 2. Fetch carts that are 'Waiting' and older than 15 mins
        const { data: carts, error: fetchError } = await supabase
            .from('abandoned_carts')
            .select('*')
            .eq('recovery_status', 'Waiting')
            .lt('updated_at', fifteenMinsAgo)
            .gt('updated_at', oneDayAgo);

        if (fetchError) throw fetchError;
        if (!carts || carts.length === 0) return NextResponse.json({ message: "Ghost Worker: No idle bags found in pipeline." });

        let processed = 0;
        let skipped = 0;

        // Fetch Owner Name for email
        let ownerName = 'David';
        if (supabase) {
            const { data } = await supabase.from('settings').select('value').eq('key', 'branding').eq('is_published', true).maybeSingle();
            if (data?.value?.owner_name) {
                ownerName = data.value.owner_name.split(' ')[0];
            }
        }

        for (const cart of carts) {
            const email = typeof cart.customer_email === 'string' ? cart.customer_email.trim() : '';
            const items = Array.isArray(cart.cart_items) ? cart.cart_items : [];
            if (!getTransactionalEmailConfig().configured
                || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                || items.length === 0) {
                skipped++;
                continue;
            }

            const itemsList = items
                .map((item: { name?: unknown }) => typeof item.name === 'string' ? item.name : '')
                .filter(Boolean)
                .join(', ');
            if (!itemsList) {
                skipped++;
                continue;
            }
            const greetingName = typeof cart.customer_name === 'string' && cart.customer_name.trim()
                ? cart.customer_name.trim().split(/\s+/)[0]
                : ownerName;
            const safeName = escapeHtml(greetingName);
            const safeItems = escapeHtml(itemsList);
            const cartUrl = `${getPublicBaseUrl()}/cart`;
            try {
                await sendTransactionalEmail({
                    to: email,
                    subject: 'Your saved Online Bar cart',
                    html: `<div style="font-family:sans-serif;padding:20px;">
                        <h2 style="color:#ff6b00;">Hi ${safeName}, your saved cart is waiting.</h2>
                        <p>You left <b>${safeItems}</b> in your bag.</p>
                        <a href="${cartUrl}" style="background:#111;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;">RETURN TO BAG</a>
                    </div>`,
                    text: `Hi ${greetingName}, your saved cart with ${itemsList} is waiting. Return to your cart: ${cartUrl}`
                });
            } catch (emailError) {
                console.error('[CartRecovery] Could not send recovery email:', emailError);
                skipped++;
                continue;
            }

            const updatedJourney = [
                ...(Array.isArray(cart.journey_log) ? cart.journey_log : []),
                {
                    t: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    m: 'Automatic email recovery message sent',
                    c: 'emerald'
                }
            ];
            const { error: updateError } = await supabase
                .from('abandoned_carts')
                .update({
                    recovery_status: 'Contacted',
                    recovery_channel: 'Email',
                    last_contacted_at: new Date().toISOString(),
                    journey_log: updatedJourney
                })
                .eq('id', cart.id);
            if (updateError) {
                console.error('[CartRecovery] Email was sent but cart status could not be updated:', updateError);
            }
            processed++;
        }

        return NextResponse.json({
            success: true,
            processed,
            skipped,
            message: `Sent ${processed} recovery emails; skipped ${skipped} carts without a sendable email or valid saved items.`
        });

    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
