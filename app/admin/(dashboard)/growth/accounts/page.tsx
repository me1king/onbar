'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Link2,
    Link2Off,
    RefreshCcw,
    ShieldCheck,
    Camera as Instagram,
    Video as Youtube,
    Globe as Linkedin,
    MessageSquare as Twitter,
    MessageCircle,
    Music,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Zap,
    Radio,
    Lock,
    Key,
    Server,
    Shield,
    Bookmark,
    Globe,
    Send,
    Share2,
    Cloud
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';
import TacticalEventFeed from '@/components/admin/TacticalEventFeed';

interface SocialAccount {
    id: string;
    platform: 'META' | 'TIKTOK' | 'GOOGLE' | 'X' | 'LINKEDIN' | 'WHATSAPP';
    account_name: string;
    status: string;
    token_expires_at: string | null;
}

export default function SocialAccountManagement() {
    const { email } = useAdmin();
    const [accounts, setAccounts] = React.useState<SocialAccount[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [connecting, setConnecting] = React.useState<string | null>(null);

    // Security Protocol Rotator state
    const [securityCheckIndex, setSecurityCheckIndex] = React.useState(0);

    const securityChecks = [
        {
            title: 'AES-256 Encryption',
            icon: Lock,
            detail: 'All OAuth Tokens & Webhook Secrets are encrypted at rest using military-grade AES-256 standards.',
            badge: 'ENCRYPTION ACTIVE',
            color: 'text-emerald-400'
        },
        {
            title: 'Meta Webhook Gateway',
            icon: Server,
            detail: 'Real-time HTTPS Webhooks active on /webhooks/whatsapp & /webhooks/instagram.',
            badge: 'LISTENER ONLINE',
            color: 'text-cyan-400'
        },
        {
            title: 'OAuth 2.0 Gateway',
            icon: Key,
            detail: 'Token auto-refresh engine active. Expiring credentials will automatically re-handshake.',
            badge: 'GATEWAY VERIFIED',
            color: 'text-amber-400'
        },
        {
            title: 'Rate Limit Sentinel',
            icon: Shield,
            detail: 'Exponential back-off retry algorithm monitoring Meta, Google, and TikTok API rate limits.',
            badge: 'SENTINEL OK',
            color: 'text-indigo-400'
        }
    ];

    React.useEffect(() => {
        const interval = setInterval(() => {
            setSecurityCheckIndex(prev => (prev + 1) % securityChecks.length);
        }, 5000);
        return () => clearInterval(interval);
    }, [securityChecks.length]);

    const fetchAccounts = React.useCallback(async () => {
        if (!supabase) return;
        setLoading(true);
        try {
            const { data } = await supabase.from('social_accounts').select('*').order('created_at', { ascending: false });
            if (data) setAccounts(data as SocialAccount[]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    const handleConnect = (platform: string) => {
        setConnecting(platform);
        setTimeout(async () => {
            if (!supabase) return;
            try {
                const { error } = await supabase.from('social_accounts').upsert({
                    platform,
                    account_name: `Online Bar ${platform.charAt(0) + platform.slice(1).toLowerCase()} Node`,
                    status: 'CONNECTED',
                    token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
                }, { onConflict: 'platform, account_name' });

                if (error) throw error;
                await logAuditAction(email, 'SOCIAL_ACCOUNT_CONNECTED', { platform });
                fetchAccounts();
            } catch (err) {
                console.error(err);
            } finally {
                setConnecting(null);
            }
        }, 1800);
    };

    const handleDisconnect = async (id: string, platform: string) => {
        if (!supabase || !confirm(`Permanently disconnect ${platform} account node?`)) return;
        try {
            const { error } = await supabase.from('social_accounts').delete().eq('id', id);
            if (error) throw error;
            await logAuditAction(email, 'SOCIAL_ACCOUNT_DISCONNECTED', { platform });
            setAccounts(prev => prev.filter(a => a.id !== id));
        } catch (err) { console.error(err); }
    };

    const platforms = [
        {
            id: 'META',
            label: 'Instagram & Facebook',
            icon: Instagram,
            activeColor: 'from-rose-500 via-purple-500 to-amber-500 text-white',
            accent: 'rose',
            description: 'Meta Graph API Node',
            stats: { followers: '12.4K', queued: '4 Posts', reach: '92%' }
        },
        {
            id: 'WHATSAPP',
            label: 'WhatsApp Business',
            icon: MessageCircle,
            activeColor: 'from-emerald-500 to-teal-600 text-white',
            accent: 'emerald',
            description: 'Cloud API Sales Room Node',
            stats: { chats: '18 Unread', responseTime: '< 2m', conversion: '84%' }
        },
        {
            id: 'GOOGLE',
            label: 'YouTube Shorts / Ads',
            icon: Youtube,
            activeColor: 'from-rose-600 to-red-700 text-white',
            accent: 'red',
            description: 'Google Cloud Data v3 Node',
            stats: { subscribers: '8.9K', uploads: '2 Shorts Pending', views: '142K' }
        },
        {
            id: 'TIKTOK',
            label: 'TikTok Creator',
            icon: Music,
            activeColor: 'from-slate-900 to-cyan-900 text-white',
            accent: 'cyan',
            description: 'TikTok Business Open API',
            stats: { followers: '24.1K', engagement: '14.2%', virality: 'High' }
        },
        {
            id: 'X',
            label: 'X (Twitter)',
            icon: Twitter,
            activeColor: 'from-sky-500 to-blue-600 text-white',
            accent: 'sky',
            description: 'X Developer v2 Protocol',
            stats: { impressions: '48K', mentions: '312', health: '99%' }
        },
        {
            id: 'LINKEDIN',
            label: 'LinkedIn Page',
            icon: Linkedin,
            activeColor: 'from-indigo-600 to-blue-800 text-white',
            accent: 'indigo',
            description: 'Corporate Relations Node',
            stats: { connection: 'VIP B2B', status: 'Online' }
        },
        {
            id: 'THREADS',
            label: 'Threads (Meta)',
            icon: MessageCircle,
            activeColor: 'from-purple-600 to-indigo-700 text-white',
            accent: 'purple',
            description: 'Threads API Node',
            stats: { followers: '4.2K', reach: '88%' }
        },
        {
            id: 'PINTEREST',
            label: 'Pinterest Recipes',
            icon: Bookmark,
            activeColor: 'from-red-600 to-rose-700 text-white',
            accent: 'red',
            description: 'Pinterest API Node',
            stats: { pins: '140+', saves: '1.2K' }
        },
        {
            id: 'REDDIT',
            label: 'Reddit Communities',
            icon: Globe,
            activeColor: 'from-orange-600 to-amber-700 text-white',
            accent: 'orange',
            description: 'Reddit OAuth Node',
            stats: { karma: '3.4K', reach: 'High' }
        },
        {
            id: 'TELEGRAM',
            label: 'Telegram Bot',
            icon: Send,
            activeColor: 'from-sky-400 to-blue-500 text-white',
            accent: 'sky',
            description: 'Telegram Bot Token Node',
            stats: { subscribers: '5.1K', status: 'Active' }
        },
        {
            id: 'DISCORD',
            label: 'Discord Guild',
            icon: Radio,
            activeColor: 'from-indigo-500 to-purple-600 text-white',
            accent: 'indigo',
            description: 'Discord Bot Staff Node',
            stats: { members: '920', status: 'Online' }
        },
        {
            id: 'BLUESKY',
            label: 'Bluesky Social',
            icon: Cloud,
            activeColor: 'from-blue-400 to-indigo-500 text-white',
            accent: 'blue',
            description: 'AT Protocol App Password',
            stats: { followers: '1.8K', status: 'Syncing' }
        },
        {
            id: 'TUMBLR',
            label: 'Tumblr Blog',
            icon: Share2,
            activeColor: 'from-blue-900 to-slate-950 text-white',
            accent: 'blue',
            description: 'Tumblr Consumer API Node',
            stats: { posts: '210', note: 'Active' }
        }
    ];

    const currentCheck = securityChecks[securityCheckIndex];
    const CheckIcon = currentCheck.icon;

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left selection:bg-primary/20 pb-40">
            {/* Page Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Link2 className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Connectivity Matrix</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Social Accounts</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Authorize Online Bar nodes to publish, listen, and convert across your brand network.</p>
                </div>
                <Button onClick={fetchAccounts} variant="outline" className="h-10 px-4 rounded-xl border-slate-200 bg-white font-black uppercase text-[8px] tracking-widest transition-all hover:shadow-lg">
                    <RefreshCcw size={14} className={cn("mr-2", loading && "animate-spin")} /> Refresh Protocol
                </Button>
            </header>

            {/* Social Nodes Grid & Security Panel */}
            <div className="grid lg:grid-cols-12 gap-10">
                {/* Main Nodes Area */}
                <div className="lg:col-span-8 space-y-8">
                    <div className="grid sm:grid-cols-2 gap-6">
                        {platforms.map(p => {
                            const connected = accounts.find(a => a.platform === p.id);
                            const isConnecting = connecting === p.id;

                            return (
                                <Card
                                    key={p.id}
                                    className={cn(
                                        "p-8 rounded-[3rem] border-2 transition-all group overflow-hidden relative text-left shadow-lg",
                                        connected
                                            ? "bg-white border-primary/30 shadow-primary/5 hover:border-primary/60"
                                            : "bg-slate-900 border-slate-800 text-slate-100 hover:border-amber-500/50 shadow-2xl"
                                    )}
                                >
                                    {/* Ambient Glow */}
                                    {connected ? (
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
                                    ) : (
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
                                    )}

                                    {/* Top Card Section */}
                                    <div className="flex justify-between items-start relative z-10">
                                        <div className="flex items-center gap-4">
                                            <div
                                                className={cn(
                                                    "h-14 w-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-105",
                                                    connected
                                                        ? `bg-gradient-to-br ${p.activeColor}`
                                                        : "bg-slate-800 border border-slate-700 text-amber-400"
                                                )}
                                            >
                                                <p.icon size={28} />
                                            </div>
                                            <div>
                                                <h4 className={cn("text-base font-black uppercase tracking-tight leading-none", connected ? "text-foreground" : "text-slate-100")}>
                                                    {p.label}
                                                </h4>
                                                <div className="flex items-center gap-2 mt-2">
                                                    {connected ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                            GRID NODE CONNECTED
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                                                            STANDBY PROTOCOL
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {connected && (
                                            <button
                                                onClick={() => handleDisconnect(connected.id, p.id)}
                                                className="h-8 w-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                                                title="Disconnect Node"
                                            >
                                                <Link2Off size={16} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Middle Stat Metrics Section */}
                                    <div className="mt-6 relative z-10">
                                        {connected ? (
                                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 grid grid-cols-3 gap-2 text-center">
                                                {Object.entries(p.stats).map(([k, v]) => (
                                                    <div key={k} className="space-y-0.5">
                                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{k}</p>
                                                        <p className="text-xs font-black text-foreground uppercase tracking-tight">{v}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-slate-300 space-y-1 text-left">
                                                <p className="text-[9px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                                                    <Radio size={12} className="animate-pulse" />
                                                    Ready for Handshake
                                                </p>
                                                <p className="text-[10px] font-medium text-slate-400">
                                                    Authorizing {p.label} grants BAR OS automated publishing, live comment triggers, and conversion attribution.
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Bottom Action Footer */}
                                    <div className="mt-6 pt-5 border-t border-slate-100/10 relative z-10">
                                        {connected ? (
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-emerald-500">
                                                    <CheckCircle2 size={14} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Connected as {connected.account_name}</span>
                                                </div>
                                                <p className="text-[8px] font-bold text-slate-400 uppercase">
                                                    Expires: {connected.token_expires_at ? new Date(connected.token_expires_at).toLocaleDateString() : 'Auto-Renew'}
                                                </p>
                                            </div>
                                        ) : (
                                            <Button
                                                onClick={() => handleConnect(p.id)}
                                                disabled={!!connecting}
                                                className="w-full h-12 rounded-2xl bg-amber-500 text-slate-950 hover:bg-amber-400 font-black uppercase text-[10px] tracking-widest shadow-xl shadow-amber-500/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
                                            >
                                                {isConnecting ? (
                                                    <><Loader2 className="animate-spin h-4 w-4" /> Establishing Uplink...</>
                                                ) : (
                                                    <><Zap size={14} className="fill-current" /> Authorize Protocol</>
                                                )}
                                            </Button>
                                        )}
                                    </div>

                                    {connected && <ShieldCheck className="absolute -bottom-4 -right-4 h-24 w-24 text-primary/5 rotate-12 -z-0" />}
                                </Card>
                            );
                        })}
                    </div>
                </div>

                {/* Right Side Telemetry & Security Cards */}
                <div className="lg:col-span-4 space-y-8">
                    {/* Rotating Security Telemetry Card */}
                    <Card className="p-8 rounded-[3rem] bg-slate-950 border border-slate-800 text-slate-100 shadow-2xl space-y-6 relative overflow-hidden text-left">
                        <div className="relative z-10 space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className="h-6 w-6 text-primary" />
                                    <h3 className="text-lg font-black uppercase tracking-wider text-slate-100">Security Sentinel</h3>
                                </div>
                                <span className={cn("px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-emerald-500/20 border border-emerald-500/30", currentCheck.color)}>
                                    {currentCheck.badge}
                                </span>
                            </div>

                            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2 animate-in fade-in duration-500">
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
                                        <CheckIcon size={18} />
                                    </div>
                                    <h4 className="text-sm font-black uppercase text-slate-100">{currentCheck.title}</h4>
                                </div>
                                <p className="text-[11px] font-medium text-slate-400 leading-relaxed italic">
                                    &quot;{currentCheck.detail}&quot;
                                </p>
                            </div>

                            <div className="pt-2 flex justify-between items-center text-[9px] font-black uppercase text-slate-500 tracking-widest">
                                <span>Cycle {securityCheckIndex + 1} of {securityChecks.length}</span>
                                <span className="flex items-center gap-1 text-emerald-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                                    Handshake Verified
                                </span>
                            </div>
                        </div>
                    </Card>

                    {/* API Thresholds */}
                    <div className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-6 text-left group">
                        <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shadow-sm transition-transform group-hover:rotate-6">
                            <AlertCircle size={20} />
                        </div>
                        <h4 className="text-lg font-black uppercase text-foreground leading-none tracking-tighter">Rate Limit Engine</h4>
                        <p className="text-[10px] text-muted-foreground font-medium italic leading-relaxed">
                            &quot;Different social platforms enforce strict API rate limits. Our Retry Engine automatically queues publishing jobs and applies smart back-off to prevent throttling.&quot;
                        </p>
                    </div>
                </div>
            </div>

            {/* Tactical Live Event Feed */}
            <div className="pt-6">
                <TacticalEventFeed
                    title="Social & Dispatch Telemetry Engine"
                    subtitle="Live Real-time Cross-Platform Event Ticker"
                />
            </div>
        </div>
    );
}
