import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getPublicBaseUrl } from "@/lib/utils";
import { recordVerifiedPaystackPayment } from "@/lib/paystackServer";
import { createTicketCredentials } from "@/lib/ticketing/credentials.server";
import { logTicketNotificationFailures, sendTicketOrderNotifications } from "@/lib/ticketing/notifications.server";
import { verifyPaystackTicketTransaction } from "@/lib/ticketing/paystack.server";

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
        const ticketReference = typeof event.data?.reference === 'string' ? event.data.reference : '';
        if (ticketReference && ['charge.success', 'charge.failed'].includes(event.event)) {
            const { data: ticketAttempt, error: ticketAttemptError } = await database
                .from('ticketing_payment_attempts')
                .select('id,order_id,amount_minor,status')
                .eq('provider', 'paystack')
                .eq('provider_reference', ticketReference)
                .maybeSingle();

            if (ticketAttemptError && !['42P01', 'PGRST205'].includes(ticketAttemptError.code || '')) {
                console.error('[TicketingPaystack] Could not look up payment attempt:', ticketAttemptError);
                return NextResponse.json({ error: 'Ticketing payment lookup failed.' }, { status: 500 });
            }
            if (ticketAttemptError) {
                console.warn('[TicketingPaystack] Commerce migration is not installed; continuing with existing shop-order processing.');
            }

            if (!ticketAttemptError && ticketAttempt) {
                if (event.event === 'charge.failed') {
                    const { data: failureResult, error: failureError } = await database.rpc('ticketing_fail_checkout', {
                        p_payment_reference: ticketReference
                    });
                    if (failureError) {
                        console.error('[TicketingPaystack] Could not record failed ticket payment:', failureError);
                        return NextResponse.json({ error: 'Ticket payment failure could not be recorded.' }, { status: 500 });
                    }
                    if (!failureResult || !['payment_failed', 'paid', 'reconciliation_required'].includes(failureResult.status)) {
                        console.error('[TicketingPaystack] Failed ticket payment returned an invalid status.');
                        return NextResponse.json({ error: 'Ticket payment failure could not be confirmed.' }, { status: 500 });
                    }
                    return NextResponse.json({ received: true, message: 'Ticketing payment failure recorded.' });
                }
                if (ticketAttempt.status === 'succeeded' || ticketAttempt.status === 'reconciliation_required') {
                    if (ticketAttempt.status === 'succeeded') {
                        const delivery = await sendTicketOrderNotifications(database, ticketAttempt.order_id);
                        logTicketNotificationFailures('[TicketingPaystack] Duplicate callback notification retry.', delivery);
                        if (delivery.email.status === 'failed' || delivery.whatsapp.status === 'failed'
                            || delivery.email.value === 'busy' || delivery.whatsapp.value === 'busy') {
                            return NextResponse.json({ error: 'Ticket notification delivery failed and will be retried.' }, { status: 503 });
                        }
                    }
                    return NextResponse.json({
                        received: true,
                        message: ticketAttempt.status === 'succeeded'
                            ? 'Ticketing payment already processed; ticket email is delivered.'
                            : 'Ticketing payment awaits manual reconciliation.'
                    });
                }

                try {
                    const transaction = await verifyPaystackTicketTransaction(ticketReference);
                    const { data: ticketOrder, error: ticketOrderError } = await database
                        .from('ticketing_orders')
                        .select('id,status,total_minor,buyer_email,event_id')
                        .eq('id', ticketAttempt.order_id)
                        .maybeSingle();
                    if (ticketOrderError) throw ticketOrderError;
                    if (!ticketOrder) throw new Error('The ticket order for this payment could not be found.');

                    const providerStatusMismatch = transaction.status !== 'success';
                    const transactionDetailsMismatch = transaction.reference !== ticketReference
                        || transaction.currency !== 'KES'
                        || transaction.amount !== Number(ticketAttempt.amount_minor)
                        || transaction.amount !== Number(ticketOrder.total_minor)
                        || transaction.customer?.email?.toLowerCase() !== ticketOrder.buyer_email.toLowerCase();
                    if (providerStatusMismatch || transactionDetailsMismatch) {
                        const { error: reviewError } = await database.rpc('ticketing_flag_payment_for_review', {
                            p_payment_reference: ticketReference,
                            p_reason: providerStatusMismatch ? 'provider_status_mismatch' : 'transaction_details_mismatch'
                        });
                        if (reviewError) throw reviewError;
                        console.error('[TicketingPaystack] Verified callback requires manual payment review.', ticketReference);
                        return NextResponse.json({ received: true, message: 'Payment requires manual reconciliation.' });
                    }

                    const { data: orderItems, error: itemsError } = await database
                        .from('ticketing_order_items')
                        .select('quantity')
                        .eq('order_id', ticketOrder.id);
                    if (itemsError) throw itemsError;
                    const quantity = (orderItems || []).reduce((total, item) => total + Number(item.quantity), 0);
                    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
                        throw new Error('Ticket order quantity is outside the supported range.');
                    }
                    const credentials = createTicketCredentials(quantity);
                    const { data: confirmation, error: confirmationError } = await database.rpc('ticketing_confirm_checkout', {
                        p_payment_reference: ticketReference,
                        p_amount_minor: transaction.amount,
                        p_currency: transaction.currency,
                        p_credentials: credentials.map(({ credential_hash, credential_ciphertext }) => ({
                            credential_hash,
                            credential_ciphertext
                        }))
                    });
                    if (confirmationError) throw confirmationError;
                    const confirmationResult = confirmation as { status?: string } | null;
                    if (!confirmationResult || !['paid', 'reconciliation_required'].includes(confirmationResult.status || '')) {
                        throw new Error('Ticketing payment confirmation returned an invalid status.');
                    }
                    if (confirmationResult.status === 'paid') {
                        const delivery = await sendTicketOrderNotifications(database, ticketOrder.id);
                        logTicketNotificationFailures('[TicketingPaystack] Confirmed order notification.', delivery);
                        if (delivery.email.status === 'failed' || delivery.whatsapp.status === 'failed'
                            || delivery.email.value === 'busy' || delivery.whatsapp.value === 'busy') {
                            return NextResponse.json({ error: 'Ticket notification delivery failed and will be retried.' }, { status: 503 });
                        }
                    }
                    return NextResponse.json({
                        received: true,
                        message: confirmationResult.status === 'paid'
                            ? 'Ticket payment verified and tickets issued.'
                            : 'Payment verified; order requires manual reconciliation.'
                    });
                } catch (ticketPaymentError) {
                    console.error('[TicketingPaystack] Could not verify and fulfill ticket payment:', ticketPaymentError);
                    return NextResponse.json({ error: 'Ticket payment confirmation failed.' }, { status: 500 });
                }
            }
        }

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
                    .select('id, customer_name, total_price, payment_method, status, payment_verified_at')
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
                    const { error: inventoryError } = await database.rpc('deduct_paid_order_inventory', {
                        order_id_input: matchedOrder.id
                    });
                    if (inventoryError) {
                        console.error("Webhook inventory fulfillment retry failed:", inventoryError);
                        return NextResponse.json({ error: "Inventory fulfillment failed" }, { status: 500 });
                    }
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
                    const { data: currentOrder, error: currentOrderError } = await database
                        .from('orders')
                        .select('status, payment_verified_at')
                        .eq('id', matchedOrder.id)
                        .maybeSingle();
                    if (currentOrderError) {
                        console.error("Webhook Order Status Lookup Error:", currentOrderError);
                        return NextResponse.json({ error: "Database lookup failed" }, { status: 500 });
                    }
                    if (currentOrder?.status === 'Paid' && currentOrder.payment_verified_at) {
                        const { error: inventoryError } = await database.rpc('deduct_paid_order_inventory', {
                            order_id_input: matchedOrder.id
                        });
                        if (inventoryError) {
                            console.error("Webhook inventory fulfillment retry failed:", inventoryError);
                            return NextResponse.json({ error: "Inventory fulfillment failed" }, { status: 500 });
                        }
                    }
                    return NextResponse.json({ received: true, message: "Order status already changed" });
                }

                const { error: inventoryError } = await database.rpc('deduct_paid_order_inventory', {
                    order_id_input: matchedOrder.id
                });
                if (inventoryError) {
                    console.error("Webhook inventory fulfillment failed:", inventoryError);
                    return NextResponse.json({ error: "Inventory fulfillment failed" }, { status: 500 });
                }

                // Post-Success Fulfillment Logic
                if (orderItems && orderItems.length > 0) {
                    const baseUrl = getPublicBaseUrl();

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
                                orderId: matchedOrder.id,
                                customerName: matchedOrder.customer_name,
                                amount: Number(matchedOrder.total_price),
                                paymentMethod: 'Paystack (M-Pesa/Card)'
                            }
                        })
                    }).catch(e => console.error("Admin Notify Error:", e));

                    // 3. Notify Customer
                    try {
                        const customerNotification = await fetch(`${baseUrl}/api/admin/notify-customer`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`
                            },
                            body: JSON.stringify({
                                orderId: firstItem.id,
                                status: 'Paid'
                            })
                        });
                        if (!customerNotification.ok) {
                            console.error("Customer Notify Error:", await customerNotification.text());
                        }
                    } catch (notificationError) {
                        console.error("Customer Notify Error:", notificationError);
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
