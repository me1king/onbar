"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, PackageCheck, Smartphone, MessageSquare, ArrowRight, Truck, ShieldCheck, Heart, Zap, Clock3, MapPin, RefreshCw } from "lucide-react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { useSettings } from "@/lib/useSettings";
import ReceiptPrintButton from "@/components/receipt/ReceiptPrintButton";
import { generateReceiptPDF } from "@/lib/receiptService";
import DeliveryCountdown from "@/components/tracking/DeliveryCountdown";
import LaunchOfferSignup from "@/components/checkout/LaunchOfferSignup";

interface Order {
    id: number;
    customer_name: string;
    customer_phone: string;
    customer_email?: string | null;
    total_price: number;
    status: string;
    created_at: string;
    note?: string | null;
    user_id: string | null;
    session_id: string | null;
    payment_method: string | null;
    checkout_request_id?: string | null;
    payment_receipt?: string | null;
    delivery_area?: string | null;
    order_items?: Array<{
        product_id: number | null;
        product_name?: string;
        quantity: number;
        unit_price: number;
        size?: string;
        is_mystery_gift?: boolean;
    }>;
    isAccountOrder?: boolean;
}

async function getSessionWithTimeout(client: NonNullable<typeof supabase>) {
    try {
        const result = await Promise.race([
            client.auth.getSession(),
            new Promise<null>(resolve => window.setTimeout(() => resolve(null), 800))
        ]);
        return result && 'data' in result ? result.data.session : null;
    } catch (error) {
        console.warn('Could not load the optional account session on the success page:', error);
        return null;
    }
}

function SuccessContent() {
    const searchParams = useSearchParams();
    const orderId = searchParams?.get("orderId");
    const [order, setOrder] = useState<Order | null>(null);
    const [receiptDetailsLoaded, setReceiptDetailsLoaded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loyaltyNotice, setLoyaltyNotice] = useState('');
    const [statusError, setStatusError] = useState('');
    const [isCheckingPayment, setIsCheckingPayment] = useState(false);
    const [showArrivalAnimation, setShowArrivalAnimation] = useState(false);
    const { settings } = useSettings();

    useEffect(() => {
        const timer = window.setTimeout(() => setShowArrivalAnimation(true), 250);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        const client = supabase;
        if (client) {
            const fetchData = async () => {
                const session = await getSessionWithTimeout(client);
                const browserSessionId = localStorage.getItem('ob_session_id');

                // 1. Fetch Order
                if (orderId) {
                    const { data: oData } = await client.from('orders').select('*').eq('id', orderId).single();

                    // SECURITY CHECK: Is this your order? (UID check or Session Check for guests)
                    const isOwner = oData && (
                        (session && oData.user_id === session.user.id) ||
                        (browserSessionId && oData.session_id === browserSessionId)
                    );

                    if (oData && !isOwner) {
                        alert("Unauthorized Payload Access");
                        window.location.href = '/';
                        return;
                    }

                    if (oData) {
                        setOrder(oData as unknown as Order);
                        if (session && oData.user_id === session.user.id && ['Paid', 'Delivered', 'Completed'].includes(oData.status)) {
                            try {
                                const loyaltyResponse = await fetch('/api/member/loyalty', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        Authorization: `Bearer ${session.access_token}`
                                    },
                                    body: JSON.stringify({ action: 'process-order', orderId: oData.id })
                                });
                                const loyaltyResult = await loyaltyResponse.json();
                                if (!loyaltyResponse.ok) throw new Error(loyaltyResult.error || 'Points could not be updated.');
                                if (loyaltyResult.earnedPoints > 0) {
                                    setLoyaltyNotice(`${loyaltyResult.earnedPoints} loyalty points added to your account.`);
                                }
                            } catch (loyaltyError) {
                                console.error('Order confirmed but loyalty points could not be processed:', loyaltyError);
                                setLoyaltyNotice('Your order is confirmed. Loyalty points are still syncing; refresh this page shortly.');
                            }
                        }
                    }
                }

                setLoading(false);
            };
            fetchData();
        }
    }, [orderId]);

    const inviteFriendToSpin = async () => {
        const url = new URL('/spin', window.location.origin).toString();
        const title = 'Black November Spin | Online Bar';
        const text = `Join Online Bar's Black November spin. If you are 18 or older, enter for a chance to win a free bottle and other campaign prizes. Terms apply: ${url}`;
        if (navigator.share) {
            try {
                await navigator.share({ title, text, url });
            } catch (error) {
                if (!(error instanceof Error && error.name === 'AbortError')) {
                    console.error('Could not open the share sheet:', error);
                }
            }
            return;
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    };

    useEffect(() => {
        let active = true;
        let pollTimer: ReturnType<typeof setTimeout> | undefined;
        let loyaltyProcessed = false;
        let statusPollCount = 0;

        const scheduleStatusPoll = (fetchStatus: () => Promise<void>, delay = 2500) => {
            if (!active) return;
            statusPollCount += 1;
            pollTimer = setTimeout(() => {
                fetchStatus().catch((error: unknown) => {
                    console.error('Could not refresh order status:', error);
                    if (active) setStatusError('Order status is still syncing. This page will keep checking automatically.');
                    scheduleStatusPoll(fetchStatus, 5000);
                });
            }, statusPollCount > 24 ? Math.max(delay, 10000) : delay);
        };

        const loadStatus = async () => {
            const client = supabase;
            if (!client || !orderId) {
                if (active) {
                    setStatusError('We could not find this order. Check your order link or contact support.');
                    setLoading(false);
                }
                return;
            }

            const session = await getSessionWithTimeout(client);
            const sessionId = localStorage.getItem('ob_session_id');
            const params = new URLSearchParams({ id: orderId });
            if (sessionId) params.set('sessionId', sessionId);

            const fetchStatus = async () => {
                const response = await fetch(`/api/orders/status?${params.toString()}`, {
                    cache: 'no-store',
                    headers: session?.access_token
                        ? { Authorization: `Bearer ${session.access_token}` }
                        : undefined
                });
                const result = await response.json() as { error?: string; order?: Order };
                if (!response.ok || !result.order) {
                    throw new Error(result.error || 'Order status could not be loaded.');
                }
                if (!active) return;

                setOrder(result.order);
                setReceiptDetailsLoaded(true);
                setStatusError('');
                if (
                    !loyaltyProcessed
                    && session
                    && result.order.isAccountOrder
                    && ['Paid', 'Delivered', 'Completed'].includes(result.order.status)
                ) {
                    loyaltyProcessed = true;
                    try {
                        const loyaltyResponse = await fetch('/api/member/loyalty', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${session.access_token}`
                            },
                            body: JSON.stringify({ action: 'process-order', orderId: result.order.id })
                        });
                        const loyaltyResult = await loyaltyResponse.json();
                        if (!loyaltyResponse.ok) throw new Error(loyaltyResult.error || 'Points could not be updated.');
                        if (loyaltyResult.earnedPoints > 0 && active) {
                            setLoyaltyNotice(`${loyaltyResult.earnedPoints} loyalty points added to your account.`);
                        }
                    } catch (loyaltyError) {
                        console.error('Order confirmed but loyalty points could not be processed:', loyaltyError);
                        if (active) setLoyaltyNotice('Your order is confirmed. Loyalty points are still syncing; refresh this page shortly.');
                    }
                }

                if (!['Delivered', 'Completed', 'Cancelled', 'Payment Failed', 'Refunded', 'Returned'].includes(result.order.status)) {
                    scheduleStatusPoll(fetchStatus);
                }
            };

            try {
                await fetchStatus();
            } catch (error) {
                console.error('Could not load order confirmation:', error);
                if (active) {
                    setStatusError('Order status could not be loaded. This page will keep checking; you can also refresh or contact support.');
                    scheduleStatusPoll(fetchStatus, 5000);
                }
            } finally {
                if (active) setLoading(false);
            }
        };

        void loadStatus();
        return () => {
            active = false;
            if (pollTimer) clearTimeout(pollTimer);
        };
    }, [orderId]);

    const shareToWhatsApp = () => {
        if (!order) return;
        const message = `Hello Online Bar Nairobi! I just placed an order.\n\n*Order ID:* #${order.id}\n*Customer:* ${order.customer_name}\n*Total:* ${formatPrice(order.total_price)}\n\nPlease confirm my dispatch status. Thanks!`;
        window.open(`https://wa.me/${settings.contact.whatsapp}?text=${encodeURIComponent(message)}`, '_blank');
    };

    const downloadReceipt = async () => {
        if (!order) throw new Error('Order details are not available yet.');
        const receipt = await generateReceiptPDF({
            id: order.id,
            customer_name: order.customer_name,
            customer_phone: order.customer_phone,
            created_at: order.created_at,
            payment_method: order.payment_method || 'Not specified',
            order_items: order.order_items?.map((item) => ({
                product_id: item.product_id ?? 0,
                product_name: item.product_name || (item.is_mystery_gift ? 'Mystery Gift' : `Product ${item.product_id ?? ''}`.trim()),
                quantity: item.quantity,
                unit_price: item.unit_price,
                size: item.size || undefined
            })),
            product_name: 'Online Bar order',
            quantity: 1,
            total_price: order.total_price,
            status: order.status
        });
        receipt.save(`Receipt_OnlineBar_${order.id}.pdf`);
    };

    if (loading) {
        return (
            <div className="flex min-h-[60dvh] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            </div>
        );
    }

    const isAccepted = order && ['Processing', 'Packed', 'Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered', 'Completed'].includes(order.status);
    const isPaymentPending = ['Paystack', 'PayHero', 'Daraja'].includes(order?.payment_method || '')
        && ['Pending', 'Payment Pending'].includes(order?.status || '');
    const isPaymentFailed = order?.status === 'Payment Failed';
    const payheroPromptUnknown = searchParams?.get('prompt') === 'unknown';
    const newsletterStatus = searchParams?.get('newsletter');
    const isPaymentReceived = order && ['Paid', 'Delivered', 'Completed'].includes(order.status);
    const isOnTheWay = order && ['Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered'].includes(order.status);

    const checkPaymentStatus = async () => {
        if (!orderId || !supabase) return;
        setIsCheckingPayment(true);
        setStatusError('');
        try {
            const session = await getSessionWithTimeout(supabase);
            const sessionId = localStorage.getItem('ob_session_id');
            const params = new URLSearchParams({ id: orderId });
            if (sessionId) params.set('sessionId', sessionId);
            const headers = session?.access_token
                ? { Authorization: `Bearer ${session.access_token}` }
                : undefined;
            const fetchOrder = async () => {
                const response = await fetch(`/api/orders/status?${params.toString()}`, {
                    cache: 'no-store',
                    headers
                });
                const result = await response.json() as { error?: string; order?: Order };
                if (!response.ok || !result.order) {
                    throw new Error(result.error || 'Order status could not be loaded.');
                }
                setOrder(result.order);
                setReceiptDetailsLoaded(true);
                return result.order;
            };

            let latestOrder = await fetchOrder();
            if (latestOrder.status === 'Pending' && latestOrder.payment_method === 'Paystack'
                && latestOrder.checkout_request_id) {
                const verification = await fetch('/api/paystack/verify-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reference: latestOrder.checkout_request_id })
                });
                const verificationResult = await verification.json() as {
                    error?: string;
                    paymentStatus?: string;
                };
                if (!verification.ok && verification.status !== 409) {
                    throw new Error(verificationResult.error || 'Payment status could not be verified.');
                }
                latestOrder = await fetchOrder();
                if (verification.ok && verificationResult.paymentStatus === 'awaiting_signed_webhook'
                    && latestOrder.status === 'Pending') {
                    setStatusError('Paystack confirms payment. The order status is syncing; do not pay again or place another order.');
                    return;
                }
            }

            if (['Pending', 'Payment Pending'].includes(latestOrder.status)
                && ['Paystack', 'PayHero', 'Daraja'].includes(latestOrder.payment_method || '')) {
                setStatusError('Payment is not confirmed yet. No new prompt was sent. Check your phone and keep this page open; contact support with your order number if money was deducted.');
            }
        } catch (error) {
            console.error('Could not manually check payment status:', error);
            setStatusError(error instanceof Error ? error.message : 'Payment status could not be checked. Please try again.');
        } finally {
            setIsCheckingPayment(false);
        }
    };

    return (
        <div className="container mx-auto px-4 py-12 max-w-2xl text-center">
            <div className="mb-12 flex flex-col items-center">
                <div className={`relative h-24 w-24 rounded-full ${isPaymentPending ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'} flex items-center justify-center mb-6`}>
                    {isPaymentPending ? <Clock3 className="h-12 w-12" /> : <CheckCircle2 className="h-12 w-12 animate-in zoom-in duration-500" />}
                </div>
                <h1 className="text-5xl font-black uppercase tracking-tighter text-foreground mb-2">
                    {isPaymentFailed ? 'Payment Not Completed' : isAccepted ? 'Order Accepted' : isPaymentReceived ? 'Payment Confirmed' : isPaymentPending ? 'Payment Pending' : order ? 'Order Received' : 'Order Status'}
                </h1>
                <p className="text-slate-500 font-medium italic">
                    {isPaymentFailed
                        ? 'Safaricom did not confirm this payment. Check your M-Pesa messages before trying again, and contact support if money was deducted.'
                        : isAccepted
                        ? isOnTheWay
                            ? 'Your order has been accepted and is on the way.'
                            : 'The merchant accepted your order and is preparing it.'
                        : isPaymentPending
                            ? payheroPromptUnknown
                                ? `Your order is saved, but we could not confirm whether ${order?.payment_method === 'Daraja' ? 'Safaricom' : 'PayHero'} started the M-Pesa prompt. Check your phone before trying to pay again.`
                                : order?.payment_method === 'PayHero'
                                    ? 'Your order is saved. Complete the PayHero M-Pesa prompt on your phone; we will update this page when payment is verified.'
                                    : order?.payment_method === 'Daraja'
                                        ? 'Your order is saved. Complete the Safaricom M-Pesa PIN prompt on your phone; we will update this page when payment is verified.'
                                        : 'Your order is saved. Complete the payment prompt; we will update this page when payment is verified.'
                            : order
                                ? 'Your order is saved and sent to the merchant. We are waiting for the merchant to accept it.'
                                : 'We could not load the order status.'}
                </p>
                {statusError && <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{statusError}</p>}
                {isPaymentPending && (
                    <div className="mt-5 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 text-left">
                        <p className="text-sm text-slate-600">
                            Checking status will not send another payment prompt. Please do not place a second order while this one is pending.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={checkPaymentStatus}
                            disabled={isCheckingPayment}
                            className="mt-3 min-h-11 w-full rounded-xl font-bold"
                        >
                            <RefreshCw className={`mr-2 h-4 w-4 ${isCheckingPayment ? 'animate-spin' : ''}`} />
                            {isCheckingPayment ? 'Checking payment…' : 'Check payment status'}
                        </Button>
                    </div>
                )}
                {isPaymentReceived && order?.payment_method === 'Daraja' && (
                    <div role="status" className="mt-5 w-full max-w-lg rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left text-emerald-950">
                        <p className="text-sm font-black uppercase">Safaricom payment confirmed</p>
                        <p className="mt-1 text-sm">
                            {order.payment_receipt
                                ? <>M-Pesa receipt: <span className="font-mono font-black">{order.payment_receipt}</span></>
                                : 'Safaricom confirmed the payment. Receipt details are still syncing.'}
                        </p>
                        <p className="mt-1 text-xs">Paid {formatPrice(order.total_price)} for order #{order.id}.</p>
                    </div>
                )}
                {order && newsletterStatus === 'joined' && (
                    <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                        You’re on the Online Bar offers email list. You can unsubscribe from any promotional email.
                    </p>
                )}
                {order && newsletterStatus === 'not-saved' && (
                    <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                        Your order is saved, but we couldn’t save your optional offers signup. Please try the newsletter signup on our homepage later.
                    </p>
                )}
            </div>

            {order && !isPaymentFailed && (
                <LaunchOfferSignup
                    orderEmail={order.customer_email}
                    phone={order.customer_phone}
                    deliveryArea={order.delivery_area}
                />
            )}

            {order && !isPaymentFailed && (
                <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left">
                    <DeliveryCountdown createdAt={order.created_at} status={order.status} deliveryArea={order.delivery_area} />
                </div>
            )}

            {order?.note?.includes('Waitlist early-access member') && (
                <div className="mb-8 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-amber-50 p-6 text-left shadow-sm">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Online Bar early crew</p>
                    <h2 className="mt-2 text-xl font-black text-slate-950">You were here before the doors opened.</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                        Your waitlist membership is linked to your account. Thanks for being one of the first to order with us.
                    </p>
                </div>
            )}

            {order && isOnTheWay && (
                <div className="mb-10 overflow-hidden rounded-[2.5rem] border border-primary/10 bg-gradient-to-r from-amber-50 via-white to-primary/5 p-6 shadow-lg">
                    <div className="relative h-24">
                        <div className="absolute left-4 right-4 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary/15" />
                        <div className={`absolute top-1/2 -translate-y-1/2 text-primary transition-all duration-[2500ms] ease-out ${showArrivalAnimation ? 'left-[82%]' : 'left-[5%]'}`}>
                            <Truck className="h-10 w-10 -rotate-6 drop-shadow-lg" />
                        </div>
                        <div className="absolute left-0 top-1/2 flex -translate-y-1/2 flex-col items-center text-[9px] font-black uppercase tracking-widest text-slate-400">
                            <CheckCircle2 className="mb-1 h-5 w-5 text-emerald-500" /> Order received
                        </div>
                        <div className="absolute right-0 top-1/2 flex -translate-y-1/2 flex-col items-center text-[9px] font-black uppercase tracking-widest text-primary">
                            <MapPin className="mb-1 h-5 w-5" /> On its way
                        </div>
                    </div>
                    <p className="mt-2 text-center text-xs font-bold text-slate-500">Your rider is moving toward your delivery location.</p>
                </div>
            )}

            <Card className="rounded-[2.5rem] border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden mb-10">
                <CardContent className="p-0">
                    <div className="bg-slate-50 p-8 border-b border-slate-100 flex items-center justify-between text-left">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Order ID</p>
                            <h3 className="text-xl font-black text-foreground">#{order?.id || 'Pending'}</h3>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</p>
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-[9px] font-bold text-primary uppercase tracking-wider">
                                {order?.status || 'Checking'}
                            </span>
                        </div>
                    </div>

                    <div className="p-8 space-y-8">
                        {/* Summary */}
                        <div className="flex items-center gap-4 text-left">
                            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                <Smartphone className="h-6 w-6" />
                            </div>
                            <div>
                                <h4 className="font-bold text-foreground">
                                    {isAccepted ? (isOnTheWay ? 'On the way' : 'Order accepted') : isPaymentPending ? 'Payment pending' : isPaymentReceived ? 'Payment received' : 'Order received'}
                                </h4>
                                <p className="text-sm text-slate-500">
                                    {isAccepted
                                        ? isOnTheWay
                                            ? 'Your order is on the way to your delivery location.'
                                            : 'The merchant accepted your order and is preparing it.'
                                        : isPaymentPending
                                            ? payheroPromptUnknown
                                                ? `Check your phone before retrying. If there is no ${order?.payment_method === 'Daraja' ? 'Safaricom ' : ''}prompt, contact support with your order number.`
                                                : order?.payment_method === 'PayHero'
                                                    ? 'Enter your M-Pesa PIN on the PayHero prompt. This page updates after the provider confirms payment.'
                                                    : order?.payment_method === 'Daraja'
                                                        ? 'Enter your M-Pesa PIN on the Safaricom prompt. This page updates after Safaricom confirms payment.'
                                                        : 'Complete the payment prompt. This page will show confirmation when payment is verified.'
                                            : isPaymentReceived
                                                ? 'Payment is verified. We are waiting for the merchant to accept your order.'
                                            : 'Your order has been saved. We will contact you to confirm delivery.'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 text-left">
                            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                <Truck className="h-6 w-6" />
                            </div>
                            <div>
                                <h4 className="font-bold text-foreground">Fast Dispatch</h4>
                                <p className="text-sm text-slate-500">Your drink or snack is on the way. Our rider will contact you with delivery updates.</p>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-dashed border-slate-200">
                            <div className="flex justify-between items-center mb-6">
                                <span className="text-slate-500 font-medium">{isPaymentReceived ? 'Total Amount Paid' : 'Order Total'}</span>
                                <span className="text-2xl font-black text-foreground">{formatPrice(order?.total_price || 0)}</span>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                                <ReceiptPrintButton
                                    orderId={order?.id || 'pending'}
                                    total={order?.total_price || 0}
                                    paymentMethod={order?.payment_method || 'Payment'}
                                    status={order?.status || 'Checking'}
                                    onPrint={downloadReceipt}
                                    autoStart={Boolean(isAccepted && receiptDetailsLoaded)}
                                    disabled={!isAccepted}
                                />
                                <Button
                                    onClick={shareToWhatsApp}
                                    variant="outline"
                                    disabled={!order}
                                    className="rounded-2xl h-14 border-slate-200 font-black uppercase tracking-widest text-[10px] gap-2 hover:bg-primary/5 hover:border-primary/20 hover:text-primary transition-all"
                                >
                                    <MessageSquare className="h-4 w-4" /> Get Receipt
                                </Button>
                                <Button
                                    asChild
                                    className={`rounded-2xl h-14 font-black uppercase tracking-widest text-[10px] gap-2 shadow-xl shadow-primary/20 ${!order ? 'pointer-events-none opacity-50' : ''}`}
                                >
                                    <Link href={`/track?id=${order?.id}`}>
                                        Track Order <ArrowRight className="h-4 w-4" />
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {loyaltyNotice && (
                <p aria-live="polite" className="mb-8 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                    {loyaltyNotice}
                </p>
            )}

            {/* Premium Invitation Section */}
            <Card className="rounded-[2.5rem] border-2 border-primary/10 bg-primary/5 shadow-2xl p-10 mb-10 overflow-hidden relative group">
                    <div className="relative z-10 text-center space-y-6">
                        <div className="h-16 w-16 bg-white rounded-2xl flex items-center justify-center mx-auto text-primary shadow-xl group-hover:scale-110 transition-transform">
                            <Zap className="h-8 w-8 fill-current" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-foreground leading-none mb-2">Invite a Friend, <br /> <span className="text-primary italic">Spin for Black November</span></h3>
                            <p className="text-slate-500 text-xs font-medium leading-relaxed">
                                Share the campaign with a friend. Participants aged 18+ can enter for a chance to win a free bottle and other configured prizes. Campaign dates, availability, and terms apply.
                            </p>
                        </div>
                        <Button
                            onClick={inviteFriendToSpin}
                            className="w-full h-16 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95"
                        >
                            Invite a friend to spin
                        </Button>
                        <Link href="/spin" className="inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-wide text-primary hover:underline">
                            Open Black November spin <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <Zap className="absolute -bottom-10 -right-10 h-48 w-48 text-primary/5 rotate-12 -z-0" />
            </Card>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" /> Secure Payment
                </div>
                <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-primary" /> Original Quality
                </div>
                <div className="flex items-center gap-2 text-foreground">
                    <Heart className="h-4 w-4 text-rose-500 fill-rose-500" /> Thanks for choosing Online Bar Nairobi
                </div>
            </div>

            <div className="mt-12">
                <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary" asChild>
                    <Link href="/">Return to Storefront</Link>
                </Button>
            </div>
        </div>
    );
}

export default function SuccessPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <SuccessContent />
        </Suspense>
    );
}
