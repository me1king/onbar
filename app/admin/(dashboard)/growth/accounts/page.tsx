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
    Radio,
    Lock,
    Key,
    Server,
    Shield,
    Bookmark,
    Database,
    Copy,
    Check,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';
import TacticalEventFeed from '@/components/admin/TacticalEventFeed';

interface SocialAccount {
    id: string;
    platform: string;
    account_name?: string;
    status?: string;
    token_expires_at?: string | null;
    connected?: boolean;
}

interface PlatformConfig {
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number }>;
    activeColor: string;
    accent: string;
    description: string;
    scopes: string[];
}

const SQL_MIGRATION_QUERY = `-- BAR OS Complete Master Migration
CREATE TABLE IF NOT EXISTS social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL,
    account_name TEXT,
    account_id TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    status TEXT DEFAULT 'DISCONNECTED',
    connected BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS connected BOOLEAN DEFAULT FALSE;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`;

export default function SocialAccountManagement() {
    const { email } = useAdmin();
    const [accounts, setAccounts] = React.useState<SocialAccount[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isSqlModalOpen, setIsSqlModalOpen] = React.useState(false);
    const [copiedSql, setCopiedSql] = React.useState(false);

    // OAuth Handshake Modal State
    // Security Protocol Rotator state
    const [securityCheckIndex, setSecurityCheckIndex] = React.useState(0);

    const securityChecks = [
        {
            title: 'AES-256 Token Vault',
            icon: Lock,
            detail: 'Token storage encryption status is not available from the configured backend.',
            badge: 'STATUS UNAVAILABLE',
            color: 'text-slate-400'
        },
        {
            title: 'Meta Webhook Gateway',
            icon: Server,
            detail: 'Webhook listener status is not available from the configured backend.',
            badge: 'STATUS UNAVAILABLE',
            color: 'text-slate-400'
        },
        {
            title: 'OAuth 2.0 Token Renewal',
            icon: Key,
            detail: 'OAuth token renewal is not configured in this dashboard.',
            badge: 'NOT CONFIGURED',
            color: 'text-slate-400'
        },
        {
            title: 'Rate Limit Sentinel',
            icon: Shield,
            detail: 'Provider rate-limit monitoring is not available from the configured backend.',
            badge: 'STATUS UNAVAILABLE',
            color: 'text-slate-400'
        }
    ];

    React.useEffect(() => {
        const interval = setInterval(() => {
            setSecurityCheckIndex(prev => (prev + 1) % securityChecks.length);
        }, 5000);
        return () => clearInterval(interval);
    }, [securityChecks.length]);

    const fetchAccounts = React.useCallback(async () => {
        if (!supabase) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase.from('social_accounts').select('*').order('created_at', { ascending: false });
            if (!error && data) {
                setAccounts(data as SocialAccount[]);
            }
        } catch (err) {
            console.error('Error fetching social accounts:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    const handleDisconnect = async (id: string, platform: string) => {
        if (!supabase || !confirm(`Permanently disconnect ${platform} account node?`)) return;
        try {
            const { error } = await supabase.from('social_accounts').delete().eq('id', id);
            if (!error) {
                await logAuditAction(email, 'SOCIAL_ACCOUNT_DISCONNECTED', { platform });
                setAccounts(prev => prev.filter(a => a.id !== id));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const copySqlToClipboard = () => {
        navigator.clipboard.writeText(SQL_MIGRATION_QUERY);
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 3000);
    };

    const platforms: PlatformConfig[] = [
        {
            id: 'META',
            label: 'Instagram & Facebook',
            icon: Instagram,
            activeColor: 'from-rose-500 via-purple-500 to-amber-500 text-white',
            accent: 'rose',
            description: 'Meta Graph API Node (Reels, Stories, Feed)',
            scopes: ['instagram_basic', 'pages_show_list', 'pages_read_engagement', 'instagram_content_publish'],
        },
        {
            id: 'WHATSAPP',
            label: 'WhatsApp Business',
            icon: MessageCircle,
            activeColor: 'from-emerald-500 to-teal-600 text-white',
            accent: 'emerald',
            description: 'Cloud API Sales Room Node (Automated Messages)',
            scopes: ['whatsapp_business_messaging', 'whatsapp_business_management'],
        },
        {
            id: 'GOOGLE',
            label: 'YouTube Shorts / Ads',
            icon: Youtube,
            activeColor: 'from-rose-600 to-red-700 text-white',
            accent: 'red',
            description: 'Google Cloud Data v3 Node',
            scopes: ['youtube.upload', 'youtube.readonly'],
        },
        {
            id: 'TIKTOK',
            label: 'TikTok Creator',
            icon: Music,
            activeColor: 'from-slate-900 to-cyan-900 text-white',
            accent: 'cyan',
            description: 'TikTok Business Open API',
            scopes: ['user.info.basic', 'video.upload', 'video.list'],
        },
        {
            id: 'X',
            label: 'X (Twitter)',
            icon: Twitter,
            activeColor: 'from-sky-500 to-blue-600 text-white',
            accent: 'sky',
            description: 'X Developer v2 Protocol',
            scopes: ['tweet.read', 'tweet.write', 'users.read'],
        },
        {
            id: 'LINKEDIN',
            label: 'LinkedIn Page',
            icon: Linkedin,
            activeColor: 'from-indigo-600 to-blue-800 text-white',
            accent: 'indigo',
            description: 'Corporate Relations Node',
            scopes: ['w_member_social', 'r_organization_social'],
        },
        {
            id: 'THREADS',
            label: 'Threads (Meta)',
            icon: MessageCircle,
            activeColor: 'from-purple-600 to-indigo-700 text-white',
            accent: 'purple',
            description: 'Threads API Node',
            scopes: ['threads_basic', 'threads_content_publish'],
        },
        {
            id: 'PINTEREST',
            label: 'Pinterest Recipes',
            icon: Bookmark,
            activeColor: 'from-red-600 to-rose-700 text-white',
            accent: 'red',
            description: 'Pinterest API Node',
            scopes: ['boards:read', 'pins:write'],
        }
    ];

    const activeNodesCount = accounts.filter(a => a.status === 'CONNECTED' || a.connected).length;
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
                <div className="flex gap-3">
                    <Button onClick={() => setIsSqlModalOpen(true)} variant="outline" className="h-10 px-4 rounded-xl border-amber-200 text-amber-700 bg-amber-50 font-black uppercase text-[8px] tracking-widest hover:bg-amber-100">
                        <Database size={14} className="mr-2 text-amber-600" /> SQL Assistant
                    </Button>
                    <Button onClick={fetchAccounts} variant="outline" className="h-10 px-4 rounded-xl border-slate-200 bg-white font-black uppercase text-[8px] tracking-widest transition-all hover:shadow-lg">
                        <RefreshCcw size={14} className={cn("mr-2", loading && "animate-spin")} /> Refresh Protocol
                    </Button>
                </div>
            </header>

            {/* Social Nodes Grid & Security Panel */}
            <div className="grid lg:grid-cols-12 gap-10">
                {/* Main Nodes Area */}
                <div className="lg:col-span-8 space-y-8">
                    <div className="grid sm:grid-cols-2 gap-6">
                        {platforms.map(p => {
                            const connected = accounts.find(a => a.platform === p.id);

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
                                                            🔵 CONNECTED
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                            ⚪ NOT CONNECTED
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
                                                <div className="col-span-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                                    Provider metrics unavailable
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-slate-300 space-y-1 text-left">
                                                <p className="text-[9px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                                                    <Radio size={12} className="animate-pulse" />
                                                    No Token In Database
                                                </p>
                                                <p className="text-[10px] font-medium text-slate-400 leading-relaxed">
                                                    Provider OAuth is not configured. Authorization and token storage are unavailable.
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
                                                    <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[120px]">
                                                        {connected.account_name || p.label}
                                                    </span>
                                                </div>
                                                <span
                                                    title="OAuth token renewal is not configured."
                                                    className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-slate-500"
                                                >
                                                    <RefreshCcw size={10} /> Renewal unavailable
                                                </span>
                                            </div>
                                        ) : (
                                            <Button
                                                disabled
                                                title="Provider OAuth credentials and callback routes are not configured."
                                                className="w-full h-12 cursor-not-allowed rounded-2xl bg-slate-700 text-slate-200 font-black uppercase text-[10px] tracking-widest opacity-80 shadow-none"
                                            >
                                                <Lock size={14} /> OAuth Setup Required
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
                    {/* Security Telemetry Card */}
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
                                <span>{activeNodesCount} of {platforms.length} Nodes Connected</span>
                                <span className="flex items-center gap-1 text-amber-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                    Setup Required
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
                            &quot;Provider rate limits apply after OAuth is configured. Automated publishing, queueing, and retry handling are not configured yet.&quot;
                        </p>
                    </div>
                </div>
            </div>

            {/* SQL MIGRATION ASSISTANT MODAL */}
            {isSqlModalOpen && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] p-8 sm:p-10 max-w-lg w-full space-y-6 shadow-2xl relative border border-slate-100 text-left">
                        <button
                            onClick={() => setIsSqlModalOpen(false)}
                            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-slate-100 text-slate-500 hover:text-foreground flex items-center justify-center transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-amber-600 tracking-widest">SUPABASE DATABASE ASSISTANT</span>
                            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Social Accounts Schema Migration</h2>
                        </div>

                        <p className="text-xs font-medium text-slate-500 italic">
                            Run this query in your <span className="font-bold text-foreground">Supabase → SQL Editor</span> to add missing OAuth columns (`token_expires_at`, `connected`, `metadata`).
                        </p>

                        <div className="p-4 rounded-2xl bg-slate-950 text-amber-400 font-mono text-[10px] space-y-1 overflow-x-auto shadow-inner border border-slate-800 leading-relaxed">
                            <pre>{SQL_MIGRATION_QUERY}</pre>
                        </div>

                        <div className="pt-2 flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">1-Click Clipboard Copy</span>
                            <Button
                                onClick={copySqlToClipboard}
                                className={cn(
                                    "h-12 px-6 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-md",
                                    copiedSql ? "bg-emerald-500 text-white" : "bg-amber-500 text-white hover:bg-amber-600"
                                )}
                            >
                                {copiedSql ? <><Check size={16} className="mr-2" /> Copied to Clipboard!</> : <><Copy size={16} className="mr-2" /> Copy SQL Migration</>}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tactical Live Event Feed */}
            <div className="pt-6">
                <TacticalEventFeed
                    title="Social & Dispatch Telemetry Engine"
                    subtitle="Provider event availability depends on configured integrations"
                />
            </div>
        </div>
    );
}
