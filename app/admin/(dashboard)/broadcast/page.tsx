'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Send,
  Mail,
  Activity as Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Phone,
  BarChart3,
  Calendar,
  MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatPrice, getPublicBaseUrl } from '@/lib/utils';

export default function AdminBroadcastPage() {
    const [newsletterCount, setNewsletterCount] = React.useState(0);
    const [campaignOrders, setCampaignOrders] = React.useState<{ total_price: number }[]>([]);
    const [sending, setSending] = React.useState(false);
    const [channel, setChannel] = React.useState<'email' | 'whatsapp' | 'in_app'>('in_app');
    const [audiences, setAudiences] = React.useState<{ id: string; name: string; estimated_reach: number }[]>([]);
    const [audience, setAudience] = React.useState('all');
    const [emailAudience, setEmailAudience] = React.useState<'newsletter' | 'waitlist'>('newsletter');
    const [audiencesLoading, setAudiencesLoading] = React.useState(true);
    const [audiencesError, setAudiencesError] = React.useState<string | null>(null);
    const [waitlistEmailCount, setWaitlistEmailCount] = React.useState(0);
    const schedule = 'now' as const;
    const [subject, setSubject] = React.useState('');
    const [message, setMessage] = React.useState('');
    const [status, setStatus] = React.useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [resendActive, setResendActive] = React.useState<boolean | null>(null);

    const CAMPAIGN_TEMPLATES = [
        { id: 'flash', label: 'Flash Sale', content: `ALERT: Premium Flash Sale active now! Get 20% OFF all premium vintages for the next 4 hours only. Secure yours: ${getPublicBaseUrl()}/shop` },
        { id: 'weekend', label: 'Weekend Drop', content: `Hello! Our Weekend Drop is live. Restocked premium selections are ready for chilled dispatch. Nairobi fast dispatch active until 6 PM. Shop: ${getPublicBaseUrl()}` },
        { id: 'loyalty', label: 'Reward Boost', content: `Sparkle your bar! ✨ VIP rewards just boosted. Complete your profile to unlock a KSh 500 voucher instantly. Link: ${getPublicBaseUrl()}/profile` },
        { id: 'tickets', label: 'Soul Fest ticket invitation', content: `Hello! Soul Fest ticket and winner updates are now available from Online Bar. Check the latest event details and ticket availability here: https://onlinebar.co.ke/tickets\n\nWe hope to see you there!` },
    ];

    const applyTemplate = (content: string) => {
        setMessage(content);
        if (channel !== 'whatsapp') setSubject("Online Bar Nairobi Update");
    };

    React.useEffect(() => {
        async function fetchAudiences() {
            try {
                const response = await fetch('/api/admin/broadcast', { cache: 'no-store' });
                const data = await response.json() as {
                    audiences?: { id: string; name: string; estimated_reach: number }[];
                    newsletter_count?: number;
                    waitlist_email_count?: number;
                    error?: string;
                };
                if (!response.ok) throw new Error(data.error || 'Unable to load opted-in audiences.');
                setAudiences(data.audiences || []);
                setNewsletterCount(Number(data.newsletter_count) || 0);
                setWaitlistEmailCount(Number(data.waitlist_email_count) || 0);
            } catch (error) {
                console.error('[AdminBroadcast] Audience load failed:', error);
                setAudiencesError(error instanceof Error ? error.message : 'Unable to load opted-in audiences.');
            } finally {
                setAudiencesLoading(false);
            }
        }

        async function fetchCampaignROI() {
            if (!supabase) return;
            // Fetch orders attributed to referrals/campaigns
            const { data } = await supabase
                .from('orders')
                .select('total_price')
                .not('referred_by_code', 'is', null)
                .eq('status', 'Delivered');
            setCampaignOrders(data || []);
        }

        async function checkResend() {
            try {
                const res = await fetch('/api/health');
                const data = await res.json();
                setResendActive(data.email === 'Configured');
            } catch {
                setResendActive(false);
            }
        }

        void fetchAudiences();
        fetchCampaignROI();
        checkResend();
    }, []);

    const totalCampaignRevenue = React.useMemo(() => {
        return campaignOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
    }, [campaignOrders]);
    const eligibleReach = channel === 'in_app'
        ? audiences.find(item => item.id === audience)?.estimated_reach ?? 0
        : emailAudience === 'waitlist' ? waitlistEmailCount : newsletterCount;

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        setSending(true);
        setStatus(null);

        try {
            const response = await fetch('/api/admin/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel,
                    subject,
                    message,
                    audience: channel === 'in_app' ? audience : 'all',
                    emailAudience: channel === 'email' ? emailAudience : undefined,
                    schedule
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to initiate campaign.");

            setStatus({
                type: 'success',
                text: channel === 'in_app'
                    ? `Delivered to ${data.count} opted-in customers in their Onbar inbox.`
                    : `Email campaign delivered to ${data.count} ${emailAudience === 'waitlist' ? 'consented waitlist members' : 'newsletter subscribers'}.`
            });
            setMessage('');
            setSubject('');
        } catch (err: unknown) {
            const error = err as Error;
            setStatus({ type: 'error', text: error.message || "Uplink failed." });
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="p-8 space-y-10 bg-background min-h-screen text-left">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-border pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Marketing Hub</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter">Campaign Builder</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Design and deploy high-impact tactical messages to your audience.</p>
                </div>
            </header>

            <div className="grid lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 space-y-8">
                    <div className="bg-card rounded-[3rem] border border-border p-10 shadow-sm space-y-10 relative overflow-hidden">

                        {/* 1. Launchpad Templates */}
                        <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">Campaign Launchpad</p>
                            <div className="flex flex-wrap gap-2">
                                {CAMPAIGN_TEMPLATES.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => applyTemplate(t.content)}
                                        className="px-5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[9px] font-black uppercase text-slate-400 hover:border-primary hover:text-primary transition-all active:scale-95"
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2. Configuration Grid */}
                        <div className="grid sm:grid-cols-2 gap-8">
                            {/* Audience Select */}
                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Target Audience</label>
                                {channel === 'in_app' ? (
                                    <select
                                        value={audience}
                                        onChange={event => setAudience(event.target.value)}
                                        disabled={audiencesLoading || audiences.length === 0}
                                        className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-foreground disabled:opacity-60"
                                    >
                                        {audiences.map(item => (
                                        <option key={item.id} value={item.id}>
                                            {item.name} ({item.estimated_reach} opted in)
                                        </option>
                                        ))}
                                    </select>
                                ) : (
                                    <select
                                        value={emailAudience}
                                        onChange={event => {
                                            if (event.target.value === 'newsletter' || event.target.value === 'waitlist') {
                                                setEmailAudience(event.target.value);
                                            }
                                        }}
                                        className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-foreground"
                                    >
                                        <option value="newsletter">Opted-in newsletter subscribers ({newsletterCount})</option>
                                        <option value="waitlist">Waitlist members who opted in to email ({waitlistEmailCount})</option>
                                    </select>
                                )}
                                {audiencesLoading && channel === 'in_app' && <p className="text-xs font-semibold text-slate-400">Loading consented audiences…</p>}
                                {audiencesError && channel === 'in_app' && <p role="alert" className="text-xs font-semibold text-rose-600">{audiencesError}</p>}
                            </div>

                            {/* Channel & Schedule */}
                            <div className="space-y-8">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Dispatch Channel</label>
                                    <div className="flex p-1 bg-slate-50 rounded-2xl border border-slate-200">
                                        <button onClick={() => setChannel('in_app')} className={cn("flex-1 py-3 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all", channel === 'in_app' ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground")}><MessageSquare size={14} /> Store</button>
                                        <button onClick={() => setChannel('email')} className={cn("flex-1 py-3 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all", channel === 'email' ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground")}><Mail size={14} /> Email</button>
                                        <button type="button" disabled title="WhatsApp delivery is not configured" className="flex-1 cursor-not-allowed rounded-xl py-3 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-300 opacity-60"><Phone size={14} /> WhatsApp unavailable</button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Schedule Timing</label>
                                    <div className="flex p-1 bg-slate-50 rounded-2xl border border-slate-200">
                                        <button type="button" disabled className={cn("flex-1 py-3 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all", schedule === 'now' ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground")}><Zap size={14} /> Instant</button>
                                        <button type="button" disabled title="Scheduled campaigns are not available yet" className="flex-1 cursor-not-allowed rounded-xl py-3 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-300 opacity-60"><Calendar size={14} /> Scheduled unavailable</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 3. Composer */}
                        <form onSubmit={handleSend} className="space-y-6 pt-6 border-t border-border">
                            {channel !== 'whatsapp' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">{channel === 'in_app' ? 'Announcement Title' : 'Email Subject'}</label>
                                    <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder={channel === 'in_app' ? 'Store announcement' : 'Flash Sale: 20% OFF Everything!'} className="h-14 rounded-2xl bg-slate-50 border-slate-200 text-sm font-bold text-foreground" />
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Payload Narrative (Message)</label>
                                <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Write your announcement here..." rows={8} className="rounded-[2rem] bg-slate-50 border-slate-200 text-sm font-medium resize-none p-8 text-foreground" />
                            </div>

                            <Button disabled={sending || !message.trim() || (channel === 'email' && (eligibleReach === 0 || resendActive === false || audiencesLoading || Boolean(audiencesError))) || (channel === 'in_app' && (audiencesLoading || eligibleReach === 0 || Boolean(audiencesError))) || channel === 'whatsapp'} className="w-full h-20 rounded-[1.5rem] bg-primary text-white font-black uppercase text-sm tracking-[0.3em] shadow-2xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                                {sending ? <><Loader2 className="h-5 w-5 animate-spin mr-3" /> Engaging...</> : <><Send className="h-5 w-5 mr-3" /> {channel === 'in_app' ? 'Publish to Store' : 'Launch Campaign'}</>}
                            </Button>
                        </form>

                        {channel === 'email' && resendActive === false && (
                            <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 text-rose-700 animate-in slide-in-from-top-2">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                <p className="text-[10px] font-black uppercase tracking-widest">Email service unavailable: configure JMSURF_MAIL_KEY and a verified JMSURF_FROM_EMAIL, or RESEND_API_KEY and RESEND_FROM_EMAIL.</p>
                            </div>
                        )}

                        {status && (
                            <div className={cn("p-6 rounded-[2rem] border-2 flex items-center gap-4 animate-in fade-in zoom-in-95", status.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-rose-50 border-rose-100 text-rose-600")}>
                                {status.type === 'success' ? <CheckCircle2 className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
                                <p className="text-[11px] font-black uppercase tracking-widest">{status.text}</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-8">
                    {/* Marketing Reach Summary */}
                    <Card className="p-10 rounded-[3rem] bg-white border border-slate-100 shadow-sm relative overflow-hidden group">
                        <div className="relative z-10">
                            <Zap className="h-8 w-8 mb-8 text-primary animate-pulse" />
                            <h3 className="text-2xl font-black uppercase tracking-tighter leading-none mb-6 text-foreground">Audience Intel</h3>
                            <div className="space-y-6">
                                <div className="flex justify-between items-center py-4 border-b border-slate-50">
                                    <span className="text-[10px] font-black uppercase text-slate-400">Eligible Reach</span>
                                    <span className="text-4xl font-black text-foreground tracking-tighter leading-none">{eligibleReach}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                        <p className="text-[8px] font-black uppercase text-slate-400 mb-1">Channel</p>
                                        <p className="text-sm font-black text-foreground tracking-tighter">{channel === 'in_app' ? 'In-app' : channel === 'email' ? 'Email' : 'Unavailable'}</p>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                        <p className="text-[8px] font-black uppercase text-slate-400 mb-1">Consent</p>
                                        <p className="text-sm font-black text-emerald-700 tracking-tighter">Required</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-primary/5 rounded-full blur-3xl"></div>
                    </Card>

                    {/* Campaign Performance Pulse */}
                    <div className="bg-card rounded-[3rem] border border-border p-10 shadow-sm space-y-8">
                        <div className="flex items-center gap-3">
                            <BarChart3 className="h-6 w-6 text-primary" />
                            <h3 className="text-xl font-black uppercase tracking-tighter text-foreground">Referral Revenue</h3>
                        </div>
                        <div className="space-y-6">
                            <div className="flex justify-between items-center text-left">
                                <span className="text-[10px] font-black uppercase text-muted-foreground">Revenue Generated</span>
                                <span className="text-lg font-black text-foreground">{formatPrice(totalCampaignRevenue)}</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                                <div className="h-full bg-primary" style={{ width: `${Math.min(100, (totalCampaignRevenue / 50000) * 100)}%` }}></div>
                            </div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase italic">Delivered orders attributed to referrals; this is not campaign-attributed revenue.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
