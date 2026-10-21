"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, PackageCheck, Smartphone, MessageSquare, ArrowRight, Truck, ShieldCheck, Heart, Zap, Clock3 } from "lucide-react";
import Link from "next/link";
import { formatPrice, getReferralLink } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { useSettings } from "@/lib/useSettings";

interface Order {
    id: number;
    customer_name: string;
    total_price: number;
    status: string;
    user_id: string | null;
    session_id: string | null;
    payment_method: string | null;
    isAccountOrder?: boolean;
}

function SuccessContent() {
    const searchParams = useSearchParams();
    const orderId = searchParams?.get("orderId");
    const [order, setOrder] = useState<Order | null>(null);
    const [referralCode, setReferralCode] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loyaltyNotice, setLoyaltyNotice] = useState('');
    const [statusError, setStatusError] = useState('');
    const { settings } = useSettings();

    useEffect(() => {
        const client = supabase;
        if (client) {
            const fetchData = async () => {
                const { data: { session } } = await client.auth.getSession();
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

                // 2. Fetch User Referral Code
                if (session) {
                    const { data: pData } = await client.from('profiles').select('referral_code').eq('id', session.user.id).single();
                    if (pData) setReferralCode(pData.referral_code);
                }

                setLoading(false);
            };
            fetchData();
        }
    }, [orderId]);

    useEffect(() => {
        let active = true;
        let pollTimer: ReturnType<typeof setTimeout> | undefined;
        let loyaltyProcessed = false;

        const loadStatus = async () => {
            const client = supabase;
            if (!client || !orderId) {
                if (active) {
                    setStatusError('We could not find this order. Check your order link or contact support.');
                    setLoading(false);
                }
                return;
            }

            const { data: { session } } = await client.auth.getSession();
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

                if (result.order.payment_method === 'Paystack' && result.order.status === 'Pending') {
                    pollTimer = setTimeout(() => {
                        fetchStatus().catch((error: unknown) => {
                            console.error('Could not refresh Paystack order status:', error);
                            if (active) {
                                setStatusError('Payment confirmation is still processing. This page will keep checking automatically.');
                            }
                            pollTimer = setTimeout(() => {
                                fetchStatus().catch((retryError: unknown) => {
                                    console.error('Could not refresh Paystack order status:', retryError);
                                });
                            }, 5000);
                        });
                    }, 2500);
                }
            };

            try {
                await fetchStatus();
            } catch (error) {
                console.error('Could not load order confirmation:', error);
                if (active) setStatusError('Order status could not be loaded. Please refresh this page or contact support.');
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

    if (loading) {
        return (
            <div className="flex min-h-[60dvh] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            </div>
        );
    }

    const isConfirmed = order && ['Paid', 'Delivered', 'Completed'].includes(order.status);
    const isPaymentPending = order?.payment_method === 'Paystack' && order.status === 'Pending';

    return (
        <div className="container mx-auto px-4 py-12 max-w-2xl text-center">
            <div className="mb-12 flex flex-col items-center">
                <div className={`h-24 w-24 rounded-full ${isPaymentPending ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'} flex items-center justify-center mb-6`}>
                    {isPaymentPending ? <Clock3 className="h-12 w-12" /> : <CheckCircle2 className="h-12 w-12" />}
                </div>
                <h1 className="text-5xl font-black uppercase tracking-tighter text-foreground mb-2">
                    {isConfirmed ? 'Order Confirmed' : isPaymentPending ? 'Confirming Payment' : order ? 'Order Received' : 'Order Status'}
                </h1>
                <p className="text-slate-500 font-medium italic">
                    {isConfirmed
                        ? 'Your payment is confirmed and your order is preparing for dispatch.'
                        : isPaymentPending
                            ? 'Paystack verified your payment. We are waiting for the order confirmation to finish.'
                            : order
                                ? 'We received your order and will contact you shortly to confirm delivery.'
                                : 'We could not load the order status.'}
                </p>
                {statusError && <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{statusError}</p>}
            </div>

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
                                    {isConfirmed ? 'Payment Confirmed' : isPaymentPending ? 'Payment Received' : 'Order Received'}
                                </h4>
                                <p className="text-sm text-slate-500">
                                    {isConfirmed
                                        ? 'Your payment is confirmed and the order is being prepared.'
                                        : isPaymentPending
                                            ? 'Your payment is verified. We are finishing the order confirmation.'
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
                                <p className="text-sm text-slate-500">Our rider will contact you within 1-3 hours for delivery.</p>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-dashed border-slate-200">
                            <div className="flex justify-between items-center mb-6">
                                <span className="text-slate-500 font-medium">{isConfirmed ? 'Total Amount Paid' : 'Order Total'}</span>
                                <span className="text-2xl font-black text-foreground">{formatPrice(order?.total_price || 0)}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
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
            {referralCode && (
                <Card className="rounded-[2.5rem] border-2 border-primary/10 bg-primary/5 shadow-2xl p-10 mb-10 overflow-hidden relative group">
                    <div className="relative z-10 text-center space-y-6">
                        <div className="h-16 w-16 bg-white rounded-2xl flex items-center justify-center mx-auto text-primary shadow-xl group-hover:scale-110 transition-transform">
                            <Zap className="h-8 w-8 fill-current" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-foreground leading-none mb-2">Invite Friends, <br /> <span className="text-primary italic">Earn Ksh 200</span></h3>
                            <p className="text-slate-500 text-xs font-medium leading-relaxed italic">&quot;Help your squad level up. Both of you get Ksh 200 credit upon their first mission.&quot;</p>
                        </div>
                        <Button
                            onClick={() => {
                                const text = `Yo! I just secured premium drinks from Online Bar Nairobi. Use my link to get a member discount: ${getReferralLink(referralCode)}`;
                                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                            }}
                            className="w-full h-16 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95"
                        >
                            WhatsApp Invitation
                        </Button>
                    </div>
                    <Zap className="absolute -bottom-10 -right-10 h-48 w-48 text-primary/5 rotate-12 -z-0" />
                </Card>
            )}

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
