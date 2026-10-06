import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getPublicBaseUrl } from "@/lib/utils";
import { recordVerifiedPaystackPayment } from "@/lib/paystackServer";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';

export async function POST(request: Request) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!PAYSTACK_SECRET_KEY || !supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: "Server-side payment processing is not configured" }, { status: 503 });
    }
    const database = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    try {
        const body = await request.text();
        const signature = request.headers.get('x-paystack-signature');

        // 1. Verify Signature
        const hash = createHmac('sha512', PAYSTACK_SECRET_KEY).update(body).digest('hex');

        if (
            !signature
            || !/^[a-f0-9]{128}$/i.test(signature)
            || !timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(signature, 'hex'))
        ) {
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }

        const event = JSON.parse(body);

        // 1.5 Log the event for Anomaly Detection
        if (event.data) {
            const { reference, amount, customer } = event.data;
            const { data: matchedOrder } = await database
                .from('orders')
                .select('id')
                .eq('checkout_request_id', reference)
                .maybeSingle();

            const { error: logError } = await database.from('payment_logs').insert([{
                reference,
                event_type: event.event,
                amount: (amount || 0) / 100, // Cents to KES
                customer_email: customer?.email,
                payload: event,
                order_id: matchedOrder?.id || null
            }]);

            if (logError) console.error("Payment log failed", logError);
        }

        // 2. Handle Event
        if (event.event === 'charge.success') {
            const data = event.data;
            const reference = data.reference;
            const status = data.status;

            if (status === 'success') {
                // Fetch the order first to see if it's already processed
                const { data: matchedOrder, error: orderLookupError } = await database
                    .from('orders')
                    .select('id, total_price, payment_method, status, payment_verified_at')
                    .eq('checkout_request_id', reference)
                    .maybeSingle();

                if (orderLookupError) {
                    console.error("Webhook Order Lookup Error:", orderLookupError);
                    return NextResponse.json({ error: "Database lookup failed" }, { status: 500 });
                }
                if (!matchedOrder) {
                    return NextResponse.json({ received: true, message: "No matching order" });
                }
                if (
                    data.currency !== 'KES'
                    || Number(data.amount) !== Math.round(Number(matchedOrder.total_price) * 100)
                    || matchedOrder.payment_method !== 'Paystack'
                ) {
                    console.error("Paystack transaction does not match the saved order.", reference);
                    return NextResponse.json({ received: true, message: "Transaction did not match order" });
                }
                try {
                    await recordVerifiedPaystackPayment(database, {
                        orderId: matchedOrder.id,
                        reference,
                        amountKobo: Number(data.amount),
                        source: 'webhook'
                    });
                } catch (error) {
                    console.error("Webhook payment proof write failed:", error);
                    return NextResponse.json({ error: "Payment confirmation record failed" }, { status: 500 });
                }
                if (matchedOrder.status === 'Paid' && matchedOrder.payment_verified_at) {
                    return NextResponse.json({ received: true, message: "Already processed" });
                }

                // Update Order in Supabase
                const updatePayload = {
                    status: 'Paid',
                    payment_verified_at: new Date().toISOString()
                };

                const { data: orderItems, error: updateError } = await database
                    .from('orders')
                    .update(updatePayload)
                    .eq('id', matchedOrder.id)
                    .in('status', ['Pending', 'Payment Failed'])
                    .select('*');

                if (updateError) {
                    console.error("Webhook Order Update Error:", updateError);
                    return NextResponse.json({ error: "Database update failed" }, { status: 500 });
                }
                if (!orderItems || orderItems.length === 0) {
                    return NextResponse.json({ received: true, message: "Order status already changed" });
                }

                // Post-Success Fulfillment Logic
                if (orderItems && orderItems.length > 0) {
                    const firstItem = orderItems[0];
                    const baseUrl = getPublicBaseUrl();

                    // 1. Deduct Stock for each item in the order
                    for (const item of orderItems) {
                        if (item.product_id) {
                            const { data: product } = await database
                                .from('products')
                                .select('stock')
                                .eq('id', item.product_id)
                                .single();

                            if (product) {
                                await database
                                    .from('products')
                                    .update({ stock: Math.max(0, (product.stock || 0) - (item.quantity || 1)) })
                                    .eq('id', item.product_id);
                            }
                        }
                    }

                    // 2. Notify Admin
                    fetch(`${baseUrl}/api/admin/notify-admin`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`
                        },
                        body: JSON.stringify({
                            type: 'NEW_ORDER',
                            details: {
                                orderId: firstItem.id,
                                customerName: firstItem.customer_name,
                                amount: orderItems.reduce((acc, curr) => acc + (curr.total_price || 0), 0),
                                paymentMethod: 'Paystack (M-Pesa/Card)'
                            }
                        })
                    }).catch(e => console.error("Admin Notify Error:", e));

                    // 3. Notify Customer
                    if (firstItem.customer_email) {
                        fetch(`${baseUrl}/api/admin/notify-customer`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`
                            },
                            body: JSON.stringify({
                                orderId: firstItem.id,
                                status: 'Paid'
                            })
                        }).catch(e => console.error("Customer Notify Error:", e));
                    }
                }
            }
        }

        if (event.event === 'charge.failed') {
            const data = event.data;
            const reference = data.reference;

            await database
                .from('orders')
                .update({
                    status: 'Payment Failed',
                    note: `Payment failed: ${data.gateway_response || 'Unknown Error'}`
                })
                .eq('checkout_request_id', reference)
                .eq('status', 'Pending');
        }

        return NextResponse.json({ received: true }, { status: 200 });

    } catch (error: unknown) {
        console.error("Paystack Webhook Error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
