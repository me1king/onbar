import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(request: Request) {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'ONLINEBAR_VERIFY_TOKEN';

    if (mode === 'subscribe' && token === verifyToken) {
        return new NextResponse(challenge, { status: 200 });
    }

    return new NextResponse('Verification failed: Token mismatch', { status: 403 });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const messageObj = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (messageObj && supabase) {
            const phone = messageObj.from;
            const text = messageObj?.text?.body || 'Media / Interactive message';

            // 1. Upsert customer
            let { data: customer } = await supabase.from('customers').select('*').eq('phone', phone).maybeSingle();
            if (!customer) {
                const { data: newCust } = await supabase.from('customers').insert([{ phone, name: `Patron-${phone.slice(-4)}` }]).select('*').single();
                customer = newCust;
            }

            // 2. Log inbound message
            if (customer) {
                await supabase.from('whatsapp_messages').insert([{
                    customer_id: customer.id,
                    direction: 'INBOUND',
                    message: text
                }]);
            }

            console.log(`[WhatsApp Webhook] Inbound from ${phone}: ${text}`);
        }

        return NextResponse.json({ received: true }, { status: 200 });
    } catch (err: unknown) {
        console.error("[WhatsApp Webhook] Processing error:", (err as Error).message || err);
        return NextResponse.json({ received: false, error: (err as Error).message }, { status: 500 });
    }
}
