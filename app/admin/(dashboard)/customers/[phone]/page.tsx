'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    Phone,
    Mail,
    MapPin,
    ShoppingBag,
    Clock,
    History,
    Loader2,
    ArrowLeft,
    Smartphone,
    Bot,
    BarChart3,
    ShieldAlert,
    Gift,
    Coins,
    Ticket
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import CustomerCrmPanel from '@/components/admin/customers/CustomerCrmPanel';
import CustomerDrinkTargeting from '@/components/admin/customers/CustomerDrinkTargeting';
import CustomerDrinkOfDayEmail from '@/components/admin/customers/CustomerDrinkOfDayEmail';
import { logAuditAction } from '@/lib/auditService';

const SessionForensics = dynamic(() => import('@/components/admin/SessionForensics'), { ssr: false });

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
    return (
        <div className="min-w-0 rounded-xl bg-slate-50 p-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 break-words text-sm font-bold text-slate-900">{value}</p>
            {detail && <p className="mt-1 break-words text-[11px] leading-4 text-slate-500">{detail}</p>}
        </div>
    );
}

interface CustomerRewardOption {
    label: string;
    chance: number;
    value: number;
    type: string;
}

interface Customer360 {
    isRegistered: boolean;
    profile: {
        id: string;
        public_id: string;
        full_name: string;
        phone_number: string;
        email: string;
        address: string;
        latitude: number | null;
        longitude: number | null;
        created_at: string;
        status_flag: string;
        lifetime_value: number;
        total_orders: number;
        loyalty_points: number;
    };
    loyalty: {
        balance: number;
        totalEarned: number;
        totalRedeemed: number;
        ledger: { id: number; amount: number; description: string; created_at: string }[];
        dailyRewards: { id: number; reward_type: string; reward_label: string; reward_value: number; created_at: string }[];
        gifts: { id: number; code: string; discount_percent: number; discount_amount: number; is_active: boolean; created_at: string }[];
        rewardOptions: { box: CustomerRewardOption[]; spin: CustomerRewardOption[] };
    } | null;
    aggregate: {
        total_sessions: number;
        total_active_time_sec: number;
        total_pages_viewed: number;
        total_products_viewed: number;
        total_clicks: number;
        avg_scroll_depth: number;
        total_cart_additions: number;
        total_cart_removals: number;
        total_checkouts_started: number;
        total_rage_clicks: number;
        total_dead_clicks: number;
        top_traffic_source: string;
        preferred_device: string;
        most_visited_category?: string;
        most_searched_term?: string;
    };
    intelligence: {
        intent_score: number;
        churn_risk_score: number | null;
        predicted_next_action: string;
    };
    sessions: {
        id: string;
        created_at: string;
        source_channel: string;
        total_active_time_sec: number;
        pages_viewed: number;
        clicks_count: number;
    }[];
    orders: {
        id: number;
        created_at: string;
        status: string;
        total_price: number;
        payment_method: string | null;
        order_items: { id: number; product_name: string; quantity: number; size: string | null; unit_price: number }[];
    }[];
    preferences: {
        category_id: string;
        affinity_score: number;
    }[];
    interactions: unknown[];
    summary: {
        total_orders: number;
        lifetime_value: number;
        average_basket: number;
        last_order_at: string | null;
        days_since_last_order: number | null;
        average_gap_days: number | null;
        segment: string;
        churn_risk_available: boolean;
        usual_order: string;
        top_items: { name: string; quantity: number }[];
    };
    experience: {
        frustration_score: number | null;
        frustration_counts: { rage_clicks: number; dead_clicks: number; errors: number };
        last_session_issue: string | null;
        average_time_to_order_seconds: number | null;
        average_scroll_depth: number | null;
        top_search_terms: { term: string; count: number }[];
        zero_result_search_count: number;
        zero_result_search_terms: { term: string; count: number }[];
        checkout_drop_off_step: string | null;
        preferred_payment_method: string | null;
        payment_failure_count: number;
        consent: { analytics: boolean; marketing: boolean; in_app_marketing: boolean; personalization: boolean; updated_at: string | null } | null;
        age_verification_status: string;
        last_id_check_at: string | null;
        rider_rating_given: number | null;
        complaint_count: number | null;
        average_product_rating: number | null;
        discounted_order_count: number;
        promo_dependency_percent: number | null;
        referral_count: number | null;
    };
    warnings: string[];
}

export default function CustomerProfilePage() {
    const params = useParams();
    const phone = params?.phone as string;
    const router = useRouter();
    const [data, setData] = React.useState<Customer360 | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [notFound, setNotFound] = React.useState(false);
    const [loadError, setLoadError] = React.useState('');
    const [selectedSessionId, setSelectedSessionId] = React.useState<string | null>(null);
    const [loyaltyBusy, setLoyaltyBusy] = React.useState(false);
    const [loyaltyMessage, setLoyaltyMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [pointsAmount, setPointsAmount] = React.useState('100');
    const [pointsReason, setPointsReason] = React.useState('');
    const [giftType, setGiftType] = React.useState<'amount' | 'percent'>('amount');
    const [giftValue, setGiftValue] = React.useState('500');
    const [dailyRewardType, setDailyRewardType] = React.useState<'box' | 'spin'>('spin');
    const [dailyRewardIndex, setDailyRewardIndex] = React.useState('0');

    const fetchCustomerData = React.useCallback(async () => {
        if (!phone) return;
        setLoading(true);
        setNotFound(false);
        setLoadError('');

        try {
            const response = await fetch(`/api/admin/customers/${encodeURIComponent(phone)}/profile`, { cache: 'no-store' });
            const result = await response.json() as { customer?: Customer360; error?: string };
            if (response.status === 404) {
                setNotFound(true);
                return;
            }
            if (!response.ok || !result.customer) {
                throw new Error(result.error || 'Customer profile data could not be loaded.');
            }
            setData(result.customer);
            setSelectedSessionId(result.customer.sessions[0]?.id || null);
        } catch (err) {
            console.error('[CustomerProfile] Load failed:', err);
            setLoadError(err instanceof Error ? err.message : 'Customer profile data could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [phone]);

    React.useEffect(() => {
        fetchCustomerData();
    }, [fetchCustomerData]);

    const submitLoyaltyAction = async (payload: Record<string, unknown>, successMessage: string) => {
        setLoyaltyBusy(true);
        setLoyaltyMessage(null);
        try {
            const response = await fetch(`/api/admin/customers/${encodeURIComponent(phone)}/loyalty`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Customer reward update failed.');
            setLoyaltyMessage({ type: 'success', text: successMessage });
            await logAuditAction('', 'UPDATE_CUSTOMER_LOYALTY', payload, { type: 'customer', id: phone });
            await fetchCustomerData();
        } catch (error) {
            console.error('[CustomerProfile] Could not update customer rewards:', error);
            setLoyaltyMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'Customer reward update failed.'
            });
        } finally {
            setLoyaltyBusy(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Reconstructing Patron Profile...</p>
        </div>
    );

    if (notFound) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
            <div className="max-w-sm space-y-6 animate-in zoom-in-95 duration-700">
                <div className="h-20 w-20 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 mx-auto shadow-sm">
                    <ShieldAlert size={40} />
                </div>
                <div className="space-y-1">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">Identity Missing</h2>
                    <p className="text-slate-400 text-xs font-medium italic">&quot;Record associated with phone node {phone} not found on the grid.&quot;</p>
                </div>
                <Button onClick={() => router.push('/lord/customers')} className="h-12 px-10 rounded-xl bg-slate-900 text-white font-black uppercase text-[9px] tracking-widest shadow-xl active:scale-95 transition-all">
                    Return to Registry
                </Button>
            </div>
        </div>
    );

    if (loadError) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4 p-6 text-center">
            <ShieldAlert className="h-10 w-10 text-rose-500" />
            <p role="alert" className="max-w-lg text-sm font-semibold text-rose-800">{loadError}</p>
            <Button onClick={() => void fetchCustomerData()} variant="outline">Try again</Button>
        </div>
    );

    if (!data) return null;

    const { profile, aggregate, intelligence, sessions, orders, preferences } = data;
    const whatsappPhone = profile.phone_number.replace(/\D/g, '');
    const internationalPhone = whatsappPhone.startsWith('0') ? `254${whatsappPhone.slice(1)}` : whatsappPhone;
    const whatsappHref = `https://wa.me/${internationalPhone}?text=${encodeURIComponent('Hello, this is OnBar. We would like to follow up with you about your recent order.')}`;

    const formatDuration = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m ${sec % 60}s`;
    };
    const formatKes = (value: number) => `KSh ${new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(value || 0)}`;

    return (
        <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left selection:bg-primary/20 pb-40">
            <header className="flex items-center gap-6 border-b border-slate-200 pb-8">
                <Button onClick={() => router.back()} variant="outline" size="icon" className="h-12 w-12 rounded-xl bg-white border-slate-200">
                    <ArrowLeft size={20} />
                </Button>
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[7px] font-black uppercase tracking-widest">{profile.public_id || (data.isRegistered ? 'OB-OS-NODE' : 'GUEST')}</span>
                        <span className={cn(
                            "px-2 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest",
                            ['Active', 'VIP'].includes(profile.status_flag) ? "bg-emerald-500 text-white" :
                            profile.status_flag === 'At risk' ? "bg-amber-100 text-amber-800" :
                            profile.status_flag === 'Lapsed' ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-500"
                        )}>{profile.status_flag}</span>
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">{data.isRegistered ? 'Customer since' : 'First order'} {new Date(profile.created_at).toLocaleDateString()}</p>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">{profile.full_name || `Guest ${profile.phone_number}`}</h1>
                </div>
                <div className="flex flex-wrap gap-2">
                    <a href={`tel:${profile.phone_number}`} className="inline-flex h-12 items-center rounded-xl border border-slate-200 bg-white px-5 text-[10px] font-black uppercase tracking-widest text-slate-700">
                        Call
                    </a>
                    <a href={whatsappHref} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center rounded-xl bg-primary px-5 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-primary/20">
                        WhatsApp follow-up
                    </a>
                </div>
            </header>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label="Customer summary">
                {[
                    { label: 'Segment', value: data.summary.segment },
                    { label: 'Lifetime value', value: formatKes(data.summary.lifetime_value) },
                    { label: 'Completed orders', value: data.summary.total_orders.toLocaleString() },
                    { label: 'Last order', value: data.summary.last_order_at
                        ? `${new Date(data.summary.last_order_at).toLocaleDateString()} · ${data.summary.days_since_last_order}d ago`
                        : 'No purchases' },
                    { label: 'Average basket', value: data.summary.total_orders ? formatKes(data.summary.average_basket) : 'N/A' },
                    { label: 'Churn risk', value: data.summary.churn_risk_available ? `${intelligence.churn_risk_score ?? 0}%` : 'N/A' }
                ].map(item => (
                    <Card key={item.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{item.label}</p>
                        <p className="mt-1 truncate text-base font-black text-slate-900">{item.value}</p>
                    </Card>
                ))}
            </section>
            {data.warnings.length > 0 && (
                <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    {data.warnings.join(' ')} Order and customer records are still available.
                </p>
            )}

            <CustomerDrinkTargeting
                preferences={preferences}
                topItems={data.summary.top_items}
                consent={data.experience.consent ? {
                    marketing: data.experience.consent.marketing,
                    in_app_marketing: data.experience.consent.in_app_marketing,
                    personalization: data.experience.consent.personalization
                } : null}
                ageVerificationStatus={data.experience.age_verification_status}
            />
            <CustomerDrinkOfDayEmail phone={profile.phone_number || phone} />

            <Card className="space-y-6 rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-amber-50 p-3 text-amber-600"><Coins className="h-5 w-5" /></div>
                        <div>
                            <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">Loyalty &amp; customer gifts</h2>
                            <p className="mt-1 text-xs leading-5 text-slate-500">See points earned and redeemed, daily crate/spin history, and customer-owned vouchers. Bar Club Engine controls the shared reward odds.</p>
                        </div>
                    </div>
                    {data.loyalty && (
                        <div className="rounded-xl bg-slate-900 px-4 py-3 text-white">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-300">Current points</p>
                            <p className="text-2xl font-black">{data.loyalty.balance.toLocaleString()}</p>
                        </div>
                    )}
                </div>

                {!data.isRegistered ? (
                    <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">This customer has not created an account, so points, daily spins, and account-linked gift vouchers are not available yet.</p>
                ) : !data.loyalty ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Loyalty history is unavailable. Check that the loyalty migration is installed before managing this customer&apos;s rewards.</p>
                ) : (
                    <>
                        <div className="grid gap-3 sm:grid-cols-3">
                            {[
                                { label: 'Lifetime points earned', value: data.loyalty.totalEarned },
                                { label: 'Points redeemed', value: data.loyalty.totalRedeemed },
                                { label: 'Current balance', value: data.loyalty.balance }
                            ].map(metric => (
                                <div key={metric.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{metric.label}</p>
                                    <p className="mt-1 text-xl font-black text-slate-900">{metric.value.toLocaleString()}</p>
                                </div>
                            ))}
                        </div>

                        {loyaltyMessage && (
                            <p role={loyaltyMessage.type === 'error' ? 'alert' : 'status'} className={cn(
                                'rounded-xl border p-3 text-sm font-medium',
                                loyaltyMessage.type === 'success'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : 'border-rose-200 bg-rose-50 text-rose-800'
                            )}>{loyaltyMessage.text}</p>
                        )}

                        <div className="grid gap-6 xl:grid-cols-3">
                            <form
                                className="space-y-3 rounded-2xl border border-slate-100 p-4"
                                onSubmit={event => {
                                    event.preventDefault();
                                    void submitLoyaltyAction({
                                        action: 'adjust-points',
                                        amount: Number(pointsAmount),
                                        reason: pointsReason
                                    }, 'Customer points updated and recorded in the loyalty ledger.');
                                }}
                            >
                                <h3 className="flex items-center gap-2 text-xs font-black uppercase text-slate-800"><Coins className="h-4 w-4 text-amber-500" /> Adjust points</h3>
                                <input aria-label="Points to add or remove" type="number" step="1" min="-100000" max="100000" required value={pointsAmount} onChange={event => setPointsAmount(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
                                <input aria-label="Points adjustment reason" type="text" minLength={3} maxLength={160} required value={pointsReason} onChange={event => setPointsReason(event.target.value)} placeholder="Reason (required for audit)" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
                                <Button type="submit" disabled={loyaltyBusy} className="w-full">{loyaltyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save points adjustment'}</Button>
                            </form>

                            <form
                                className="space-y-3 rounded-2xl border border-slate-100 p-4"
                                onSubmit={event => {
                                    event.preventDefault();
                                    void submitLoyaltyAction({
                                        action: 'issue-gift',
                                        giftType,
                                        giftValue: Number(giftValue)
                                    }, 'Customer gift voucher issued and attached to their account.');
                                }}
                            >
                                <h3 className="flex items-center gap-2 text-xs font-black uppercase text-slate-800"><Gift className="h-4 w-4 text-primary" /> Give customer a voucher</h3>
                                <select aria-label="Gift voucher type" value={giftType} onChange={event => setGiftType(event.target.value as 'amount' | 'percent')} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                                    <option value="amount">Fixed amount (KSh)</option>
                                    <option value="percent">Percentage off</option>
                                </select>
                                <input aria-label="Gift voucher value" type="number" step="1" min="1" max={giftType === 'percent' ? 100 : 1000000} required value={giftValue} onChange={event => setGiftValue(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
                                <Button type="submit" variant="outline" disabled={loyaltyBusy} className="w-full"><Ticket className="mr-2 h-4 w-4" /> Issue customer gift</Button>
                            </form>

                            <form
                                className="space-y-3 rounded-2xl border border-slate-100 p-4"
                                onSubmit={event => {
                                    event.preventDefault();
                                    void submitLoyaltyAction({
                                        action: 'award-daily-reward',
                                        rewardType: dailyRewardType,
                                        rewardIndex: Number(dailyRewardIndex)
                                    }, 'Selected daily reward issued and recorded for this customer.');
                                }}
                            >
                                <h3 className="flex items-center gap-2 text-xs font-black uppercase text-slate-800"><Gift className="h-4 w-4 text-violet-600" /> Choose a crate / spin win</h3>
                                <select
                                    aria-label="Daily reward type"
                                    value={dailyRewardType}
                                    onChange={event => {
                                        setDailyRewardType(event.target.value as 'box' | 'spin');
                                        setDailyRewardIndex('0');
                                    }}
                                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                                >
                                    <option value="spin">Premium Spin</option>
                                    <option value="box">Daily Crate</option>
                                </select>
                                <select aria-label="Choose customer reward" value={dailyRewardIndex} onChange={event => setDailyRewardIndex(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                                    {(dailyRewardType === 'spin' ? data.loyalty.rewardOptions.spin : data.loyalty.rewardOptions.box)
                                        .map((option, index) => ({ option, index }))
                                        .filter(({ option }) => ['xp', 'voucher'].includes(option.type))
                                        .map(({ option, index }) => (
                                            <option key={`${option.label}-${index}`} value={index}>
                                                {option.label} · {option.chance}% chance
                                            </option>
                                        ))}
                                </select>
                                <p className="text-[11px] leading-4 text-slate-500">Issues a configured points prize or voucher immediately. Each customer can receive one crate and one spin reward every 24 hours.</p>
                                <Button type="submit" variant="outline" disabled={loyaltyBusy || !(dailyRewardType === 'spin' ? data.loyalty.rewardOptions.spin : data.loyalty.rewardOptions.box).some(option => ['xp', 'voucher'].includes(option.type))} className="w-full">Issue selected reward</Button>
                            </form>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-2">
                            <div className="space-y-3">
                                <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">Gift vouchers</h3>
                                {data.loyalty.gifts.length ? data.loyalty.gifts.map(gift => (
                                    <div key={gift.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                                        <div>
                                            <p className="font-mono text-sm font-black text-slate-900">{gift.code}</p>
                                            <p className="text-xs text-slate-500">
                                                {gift.discount_percent ? `${gift.discount_percent}% off` : `KSh ${gift.discount_amount.toLocaleString()} off`}
                                                {' · '}{gift.is_active ? 'Active' : 'Redeemed / inactive'}
                                            </p>
                                        </div>
                                        {gift.is_active && (
                                            <Button type="button" variant="outline" size="sm" disabled={loyaltyBusy} onClick={() => {
                                                if (window.confirm(`Deactivate gift voucher ${gift.code}?`)) {
                                                    void submitLoyaltyAction({ action: 'revoke-gift', giftId: gift.id }, 'Gift voucher deactivated.');
                                                }
                                            }}>Deactivate</Button>
                                        )}
                                    </div>
                                )) : <p className="text-sm text-slate-500">No customer gifts have been issued.</p>}
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">Daily crate &amp; spin history</h3>
                                {data.loyalty.dailyRewards.length ? (
                                    <div className="max-h-64 space-y-2 overflow-y-auto">
                                        {data.loyalty.dailyRewards.map(reward => (
                                            <div key={reward.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900">{reward.reward_label}</p>
                                                    <p className="text-[11px] text-slate-500">{reward.reward_type === 'spin' ? 'Premium Spin' : 'Daily Crate'} · {new Date(reward.created_at).toLocaleString()}</p>
                                                </div>
                                                <span className="text-xs font-black uppercase text-slate-600">{reward.reward_value ? reward.reward_value.toLocaleString() : 'Gift'}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-sm text-slate-500">No daily crate or spin wins recorded.</p>}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">Points history</h3>
                            {data.loyalty.ledger.length ? (
                                <div className="max-h-64 space-y-2 overflow-y-auto">
                                    {data.loyalty.ledger.map(entry => (
                                        <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                                            <div>
                                                <p className="text-sm font-semibold text-slate-800">{entry.description}</p>
                                                <p className="text-[11px] text-slate-500">{new Date(entry.created_at).toLocaleString()}</p>
                                            </div>
                                            <span className={cn('shrink-0 text-sm font-black', entry.amount >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                                                {entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-sm text-slate-500">No points transactions recorded yet.</p>}
                        </div>
                    </>
                )}
            </Card>

            <div className="grid lg:grid-cols-12 gap-10">

                {/* LEFT: 360 SUMMARY */}
                <div className="lg:col-span-4 space-y-8">
                    {/* TOTAL EXPERIENCE SUMMARY */}
                    <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-slate-900 text-white shadow-2xl space-y-10 relative overflow-hidden">
                        <div className="relative z-10 space-y-8">
                            <h3 className="text-sm font-black uppercase tracking-[0.4em] text-slate-500">Total Experience</h3>
                            <div className="grid grid-cols-2 gap-y-6 gap-x-6 sm:gap-x-10">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase text-slate-500">Sessions</p>
                                    <p className="text-xl sm:text-2xl font-black">{aggregate.total_sessions}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase text-slate-500">Active Time</p>
                                    <p className="text-xl sm:text-2xl font-black">{formatDuration(aggregate.total_active_time_sec)}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase text-slate-500">Pages viewed</p>
                                    <p className="text-xl sm:text-2xl font-black">{aggregate.total_pages_viewed}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase text-slate-500">Total Clicks</p>
                                    <p className="text-xl sm:text-2xl font-black">{aggregate.total_clicks.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                        <History className="absolute -bottom-10 -right-10 h-64 w-64 text-white/5 -rotate-12" />
                    </Card>

                    {/* ENGAGEMENT SUMMARY */}
                    <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-10">
                        <h3 className="text-sm font-black uppercase tracking-[0.4em] text-slate-400">Engagement Profile</h3>
                        <div className="space-y-6">
                            {[
                                { label: 'Top Page', val: aggregate.most_visited_category || 'N/A' },
                                { label: 'Top Search', val: aggregate.most_searched_term || 'N/A' },
                                { label: 'Preferred Device', val: aggregate.preferred_device || 'N/A' },
                                { label: 'Traffic Source', val: aggregate.top_traffic_source || 'N/A' },
                            ].map(item => (
                                <div key={item.label} className="flex justify-between items-center border-b border-slate-50 pb-4 last:border-0">
                                    <span className="text-[10px] font-black uppercase text-slate-400">{item.label}</span>
                                    <span className="text-sm font-black text-foreground uppercase truncate ml-4">{item.val}</span>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* CLICK RATE & TELEMETRY */}
                    <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-6">
                        <div className="flex items-center gap-3">
                            <BarChart3 className="h-5 w-5 text-primary" />
                            <h3 className="text-sm font-black uppercase tracking-[0.4em] text-slate-400">Click Rate Telemetry</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-[8px] font-black uppercase text-slate-400 mb-1">Clicks / Minute</p>
                                <p className="text-xl font-black text-primary">
                                    {aggregate.total_active_time_sec > 0 ? ((aggregate.total_clicks / aggregate.total_active_time_sec) * 60).toFixed(1) : '0'}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-[8px] font-black uppercase text-slate-400 mb-1">Clicks / Page</p>
                                <p className="text-xl font-black text-primary">
                                    {aggregate.total_pages_viewed > 0 ? (aggregate.total_clicks / aggregate.total_pages_viewed).toFixed(1) : '0'}
                                </p>
                            </div>
                        </div>
                    </Card>

                    {/* ONBOARDING DEMOGRAPHICS & PREFERENCES */}
                    <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-8">
                        <div className="flex items-center gap-3">
                            <MapPin className="h-5 w-5 text-primary" />
                            <h3 className="text-sm font-black uppercase tracking-[0.4em] text-slate-400">Demographics & Location</h3>
                        </div>
                        <div className="space-y-4 text-xs font-bold text-slate-600">
                            <div className="flex justify-between border-b border-slate-50 pb-3">
                                <span className="text-[9px] font-black text-slate-400 uppercase">Phone Node</span>
                                <span className="font-mono text-foreground">{profile.phone_number || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-50 pb-3">
                                <span className="text-[9px] font-black text-slate-400 uppercase">Email</span>
                                <span className="text-foreground truncate max-w-[180px]">{profile.email || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-50 pb-3">
                                <span className="text-[9px] font-black text-slate-400 uppercase">Delivery Address</span>
                                <span className="text-foreground uppercase truncate max-w-[180px]">{profile.address || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-50 pb-3">
                                <span className="text-[9px] font-black text-slate-400 uppercase">GPS Location</span>
                                <span className="font-mono text-primary">{profile.latitude !== null && profile.longitude !== null ? `${profile.latitude.toFixed(4)}, ${profile.longitude.toFixed(4)}` : 'Not Set'}</span>
                            </div>
                        </div>

                        {preferences.length > 0 && (
                            <div className="space-y-3 pt-4 border-t border-slate-100">
                                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Chosen Onboarding Preferences</p>
                                <div className="flex flex-wrap gap-2">
                                    {preferences.map((p, idx) => (
                                        <span key={idx} className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-[9px] font-black uppercase tracking-wider">
                                            {p.category_id} ({p.affinity_score}%)
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* FRICTION RADAR */}
                    <Card className="p-10 rounded-[3.5rem] bg-rose-50 border border-rose-100 shadow-sm space-y-8">
                        <div className="flex items-center gap-4">
                            <ShieldAlert className="h-6 w-6 text-rose-500" />
                            <h3 className="text-lg font-black uppercase tracking-tight text-rose-900">Friction Radar</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-white rounded-2xl border border-rose-100">
                                <p className="text-[8px] font-black uppercase text-slate-400 mb-1">Rage Clicks</p>
                                <p className="text-xl font-black text-rose-600">{aggregate.total_rage_clicks}</p>
                            </div>
                            <div className="p-4 bg-white rounded-2xl border border-rose-100">
                                <p className="text-[8px] font-black uppercase text-slate-400 mb-1">Dead Clicks</p>
                                <p className="text-xl font-black text-rose-600">{aggregate.total_dead_clicks}</p>
                            </div>
                        </div>
                    </Card>

                    {/* INTELLIGENCE SCORES */}
                    <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-10 relative overflow-hidden">
                        <div className="relative z-10 space-y-8">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-black uppercase tracking-[0.4em] text-slate-400">Derived Intel</h3>
                                <Bot className="h-5 w-5 text-primary" />
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                        <span>Purchase Intent</span>
                                        <span className="text-primary">{intelligence.intent_score}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${intelligence.intent_score}%` }} />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                        <span>Churn Risk</span>
                                        <span className="text-rose-500">{intelligence.churn_risk_score === null ? 'N/A' : `${intelligence.churn_risk_score}%`}</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                                        <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: `${intelligence.churn_risk_score ?? 0}%` }} />
                                    </div>
                                </div>
                            </div>

                            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                                <p className="text-[8px] font-black uppercase text-slate-400">Next likely order</p>
                                <p className="text-xs font-bold text-foreground italic leading-relaxed">
                                &quot;{intelligence.predicted_next_action}&quot;
                                </p>
                            </div>
                        </div>
                        <Bot className="absolute -bottom-10 -left-10 h-48 w-48 text-primary/5 -rotate-12" />
                    </Card>

                    {/* CONTACT & LOGISTICS */}
                    <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-8">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                                <Smartphone size={20} />
                            </div>
                            <h3 className="text-lg font-black uppercase tracking-tight">Identity Relay</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <Phone className="h-4 w-4 text-primary" />
                                <span className="text-sm font-bold text-foreground">{profile.phone_number}</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <Mail className="h-4 w-4 text-primary" />
                                <span className="text-sm font-bold text-foreground">{profile.email}</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <MapPin className="h-4 w-4 text-primary" />
                                <span className="text-sm font-bold text-foreground truncate">{profile.address || 'No Address Logged'}</span>
                            </div>
                        </div>
                    </Card>

                    {/* TOP INTERESTS */}
                    <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-8">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black uppercase tracking-tight">Category Affinity</h3>
                            <BarChart3 className="h-5 w-5 text-indigo-500" />
                        </div>
                        <div className="space-y-4">
                            {preferences.length > 0 ? preferences.map(pref => (
                                <div key={pref.category_id} className="space-y-2">
                                    <div className="flex justify-between items-center text-[8px] font-black uppercase">
                                        <span>{pref.category_id}</span>
                                        <span className="text-indigo-600">{pref.affinity_score}%</span>
                                    </div>
                                    <div className="h-1 w-full bg-slate-50 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500" style={{ width: `${pref.affinity_score}%` }} />
                                    </div>
                                </div>
                            )) : (
                                <p className="text-center py-6 text-[9px] font-bold text-slate-300 uppercase italic">Awaiting behavioral data...</p>
                            )}
                        </div>
                    </Card>
                </div>

                {/* RIGHT: TIMELINE & FORENSICS */}
                <div className="lg:col-span-8 space-y-8">
                    <CustomerCrmPanel phone={profile.phone_number || phone} />
                    <Card className="space-y-5 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-900">Experience, risk & compliance</h2>
                            <p className="mt-1 text-xs text-slate-500">Frustration uses the five most recent sessions (10 per rage click, 5 per dead click, 15 per form/payment error, capped at 100). Search and scroll use captured consented events.</p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            <Metric label="Frustration score · /100" value={data.experience.frustration_score === null ? 'Not recorded' : `${data.experience.frustration_score}`} detail={`${data.experience.frustration_counts.rage_clicks} rage · ${data.experience.frustration_counts.dead_clicks} dead · ${data.experience.frustration_counts.errors} errors`} />
                            <Metric label="Last session issue" value={data.experience.last_session_issue || 'None detected'} />
                            <Metric label="Average time to order" value={data.experience.average_time_to_order_seconds === null ? 'Not recorded' : formatDuration(data.experience.average_time_to_order_seconds)} detail="Session start to completed order." />
                            <Metric label="Average scroll depth" value={data.experience.average_scroll_depth === null ? 'Not recorded' : `${data.experience.average_scroll_depth}%`} />
                            <Metric label="Checkout drop-off" value={data.experience.checkout_drop_off_step || 'No abandoned checkout detected'} />
                            <Metric label="Preferred payment" value={data.experience.preferred_payment_method || 'Not recorded'} detail={`${data.experience.payment_failure_count} payment failures`} />
                            <Metric label="Zero-result searches" value={`${data.experience.zero_result_search_count}`} detail={data.experience.zero_result_search_terms.map(item => `${item.term} (${item.count})`).join(', ') || 'No zero-result queries'} />
                            <Metric label="Consent" value={data.experience.consent ? `Analytics ${data.experience.consent.analytics ? 'on' : 'off'} · Marketing ${data.experience.consent.marketing ? 'on' : 'off'} · Personalization ${data.experience.consent.personalization ? 'on' : 'off'}` : 'No consent record'} detail={data.experience.consent?.updated_at ? `Updated ${new Date(data.experience.consent.updated_at).toLocaleString()}` : undefined} />
                            <Metric label="Age verification" value={data.experience.age_verification_status} detail={data.experience.last_id_check_at ? `Last ID check ${new Date(data.experience.last_id_check_at).toLocaleString()}` : 'No ID-check timestamp'} />
                            <Metric label="Rider rating given" value={data.experience.rider_rating_given === null ? 'Not recorded' : `${data.experience.rider_rating_given}/5`} />
                            <Metric label="Order complaints" value={data.experience.complaint_count === null ? 'Unavailable' : `${data.experience.complaint_count}`} />
                            <Metric label="Average product rating" value={data.experience.average_product_rating === null ? 'Not recorded' : `${data.experience.average_product_rating.toFixed(1)}/5`} detail="Verified product reviews; not an NPS or rider score." />
                            <Metric label="Promo dependency" value={data.experience.promo_dependency_percent === null ? 'Not recorded' : `${data.experience.promo_dependency_percent}%`} detail={`${data.experience.discounted_order_count} completed orders used a coupon`} />
                            <Metric label="Direct referrals" value={data.experience.referral_count === null ? 'Not recorded' : `${data.experience.referral_count}`} />
                            <Metric label="Top searches" value={data.experience.top_search_terms.map(item => `${item.term} (${item.count})`).join(', ') || 'Not recorded'} />
                        </div>
                    </Card>
                    <Card className="grid gap-6 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm md:grid-cols-2">
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Usual order</p>
                            <p className="mt-2 text-sm font-bold text-slate-900">
                                {data.summary.usual_order || 'A repeat order pattern will appear after a customer repeats a completed order.'}
                            </p>
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Most ordered · all completed orders</p>
                            {data.summary.top_items.length ? (
                                <ul className="mt-2 flex flex-wrap gap-2">
                                    {data.summary.top_items.map(item => (
                                        <li key={item.name} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                                            {item.name} · {item.quantity}
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="mt-2 text-sm text-slate-500">Completed order items will appear here.</p>}
                        </div>
                    </Card>
                    {/* COMMERCIAL HISTORY */}
                    <Card className="rounded-[3rem] border border-slate-100 bg-white shadow-sm overflow-hidden">
                        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                            <div className="flex items-center gap-3">
                                <ShoppingBag className="h-6 w-6 text-primary" />
                                <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground">Mission History</h2>
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{orders.length} Recent Orders</span>
                        </div>
                        <div className="divide-y divide-slate-50 overflow-x-auto no-scrollbar">
                            <table className="w-full text-left min-w-[720px]">
                                <thead>
                                    <tr className="text-[8px] font-black uppercase text-slate-400 tracking-widest bg-slate-50/50">
                                        <th className="px-8 py-4">Unit #</th>
                                        <th className="px-8 py-4">Date</th>
                                        <th className="px-8 py-4">Payload</th>
                                        <th className="px-8 py-4">Status</th>
                                        <th className="px-8 py-4">Payment</th>
                                        <th className="px-8 py-4 text-right">Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.map(order => (
                                        <tr key={order.id} className="group hover:bg-slate-50/50 transition-colors">
                                            <td className="px-8 py-6 font-black text-xs text-foreground">#{order.id}</td>
                                            <td className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase">{new Date(order.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                                            <td className="px-8 py-6">
                                                <div className="flex flex-wrap gap-2">
                                                    {order.order_items.map(item => (
                                                        <span key={item.id} className="whitespace-nowrap rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 shadow-sm">
                                                            {item.quantity}x {item.product_name}{item.size ? ` · ${item.size}` : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <span className={cn(
                                                    "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest",
                                                    order.status === 'Delivered' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                                    order.status === 'Cancelled' ? "bg-rose-50 text-rose-600 border border-rose-100" :
                                                    "bg-slate-50 text-slate-500 border border-slate-100"
                                                )}>
                                                    {order.status}
                                                </span>
                                            </td>
                                            <td className="px-8 py-6 text-xs font-semibold text-slate-600">{order.payment_method || 'Not recorded'}</td>
                                            <td className="px-8 py-6 text-right font-black text-sm text-foreground">{formatKes(order.total_price)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* RECENT JOURNEY & FORENSICS */}
                    <div className="grid md:grid-cols-12 gap-8">
                        {/* Session Selector */}
                        <div className="md:col-span-4 space-y-6">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Recent Visits</h3>
                            <div className="space-y-3">
                                {sessions.map(sess => (
                                    <button
                                        key={sess.id}
                                        onClick={() => setSelectedSessionId(sess.id)}
                                        className={cn(
                                            "w-full p-6 rounded-3xl border text-left transition-all group relative overflow-hidden",
                                            selectedSessionId === sess.id ? "bg-primary text-white border-primary shadow-xl" : "bg-white border-slate-100 hover:border-primary/20"
                                        )}
                                    >
                                        <div className="relative z-10">
                                            <p className={cn("text-[8px] font-black uppercase tracking-widest mb-1", selectedSessionId === sess.id ? "text-white/60" : "text-slate-400")}>
                                                {new Date(sess.created_at).toLocaleDateString()} &bull; {new Date(sess.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                            <h4 className="font-black uppercase text-xs leading-none">{sess.source_channel} Source</h4>
                                            <p className={cn("text-[9px] font-bold mt-2", selectedSessionId === sess.id ? "text-white/80" : "text-slate-400")}>
                                                {formatDuration(sess.total_active_time_sec)} active · {sess.pages_viewed} pages · {sess.clicks_count} clicks
                                            </p>
                                        </div>
                                        <History className={cn("absolute -bottom-2 -right-2 h-12 w-12 opacity-5", selectedSessionId === sess.id ? "text-white" : "text-primary")} />
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Forensics Component Integration */}
                        <div className="md:col-span-8">
                            {selectedSessionId ? (
                                <SessionForensics sessionId={selectedSessionId} />
                            ) : (
                                <div className="h-full bg-slate-50 rounded-[3rem] border border-slate-100 border-dashed flex items-center justify-center opacity-40">
                                    <Clock className="h-10 w-10 text-slate-300" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
