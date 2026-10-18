'use client';

import * as React from 'react';
import {
    Users,
    DollarSign,
    RefreshCcw,
    Search,
    TrendingUp,
    ChevronRight,
    Target,
    MousePointer2,
    ShieldCheck,
    MessageSquare,
    Zap,
    AlertCircle,
    Camera,
    FileText,
    CreditCard,
    XCircle,
    Rocket,
    User,
    ShieldAlert,
    LayoutGrid,
    ExternalLink,
    Mail,
    Copy,
    Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { formatPrice, cn } from '@/lib/utils';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';
import Link from 'next/link';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';

interface AffiliateSummary {
    affiliate_id: string;
    full_name: string;
    email: string;
    referral_code: string;
    affiliate_tier: string;
    status: string;
    clicks: number;
    conversions: number;
    total_revenue: number;
    available_earnings: number;
    pending_earnings: number;
    last_conversion_at: string | null;
    business_name: string;
    bio: string;
    audience_size: number;
    primary_channels: string[];
    preferred_payout_method: string;
    payout_details: string;
    created_at: string;
}

interface AffiliateInvitation {
    id: string;
    email: string;
    business_name: string;
    commission_rate: number;
    created_at: string;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
    status: 'Invited' | 'Accepted' | 'Expired' | 'Revoked';
}

type TabId = 'pulse' | 'directory' | 'applications' | 'finance' | 'risk' | 'invitations';

export default function AdminAffiliateCommandCenter() {
    const { email: adminEmail } = useAdmin();
    const [activeTab, setActiveTab] = React.useState<TabId>('pulse');
    const [affiliates, setAffiliates] = React.useState<AffiliateSummary[]>([]);
    const [invitations, setInvitations] = React.useState<AffiliateInvitation[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [selectedAffiliate, setSelectedAffiliate] = React.useState<AffiliateSummary | null>(null);
    const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [inviteEmail, setInviteEmail] = React.useState('');
    const [inviteBusinessName, setInviteBusinessName] = React.useState('');
    const [inviteCommissionRate, setInviteCommissionRate] = React.useState('5');
    const [inviteLink, setInviteLink] = React.useState('');
    const [creatingInvite, setCreatingInvite] = React.useState(false);

    const fetchAffiliateNetwork = React.useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/admin/affiliates', { cache: 'no-store' });
            const result = await response.json() as {
                affiliates?: AffiliateSummary[];
                invitations?: AffiliateInvitation[];
                error?: string;
            };
            if (!response.ok) throw new Error(result.error || 'Could not load affiliate applications.');
            setAffiliates(result.affiliates || []);
            setInvitations(result.invitations || []);
            setMessage(null);
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not load affiliate applications.' });
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchAffiliateNetwork();
    }, [fetchAffiliateNetwork]);

    const handleUpdateStatus = async (id: string, status: string) => {
        try {
            const response = await fetch('/api/admin/affiliates', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ affiliateId: id, status })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not update affiliate status.');
            await logAuditAction(adminEmail, 'UPDATE_AFFILIATE_STATUS', { id, status });
            setMessage({ type: 'success', text: `Protocol set to ${status}.` });
            await fetchAffiliateNetwork();
        } catch (err: unknown) {
            const error = err as Error;
            setMessage({ type: 'error', text: error.message });
        }
    };

    const createInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setCreatingInvite(true);
        setInviteLink('');
        try {
            const response = await fetch('/api/admin/affiliates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: inviteEmail,
                    businessName: inviteBusinessName,
                    commissionRate: Number(inviteCommissionRate)
                })
            });
            const result = await response.json() as {
                error?: string;
                invitation?: { id: string; email: string; business_name: string; commission_rate: number };
                inviteUrl?: string;
                emailSent?: boolean;
                emailError?: string;
            };
            if (!response.ok) throw new Error(result.error || 'Could not create affiliate invitation.');
            if (!result.inviteUrl) throw new Error('Invitation was created without returning its link. Refresh the invitations list.');
            setInviteLink(result.inviteUrl);
            if (result.invitation) {
                await logAuditAction(adminEmail, 'CREATE_AFFILIATE_INVITATION', {
                    id: result.invitation.id,
                    businessName: result.invitation.business_name,
                    commissionRate: result.invitation.commission_rate
                });
            }
            setInviteEmail('');
            setInviteBusinessName('');
            setMessage({
                type: result.emailSent ? 'success' : 'error',
                text: result.emailSent
                    ? 'Invitation created and emailed. Copy the link below if you also need to share it.'
                    : result.emailError || 'Invitation created; share the link manually.'
            });
            await fetchAffiliateNetwork();
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not create affiliate invitation.' });
        } finally {
            setCreatingInvite(false);
        }
    };

    const revokeInvitation = async (invitationId: string) => {
        try {
            const response = await fetch('/api/admin/affiliates', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'revoke_invitation', invitationId })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Could not revoke invitation.');
            await logAuditAction(adminEmail, 'REVOKE_AFFILIATE_INVITATION', { invitationId });
            setMessage({ type: 'success', text: 'Affiliate invitation revoked.' });
            await fetchAffiliateNetwork();
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not revoke invitation.' });
        }
    };

    const copyInviteLink = async () => {
        try {
            await navigator.clipboard.writeText(inviteLink);
            setMessage({ type: 'success', text: 'Invitation link copied.' });
        } catch (error) {
            console.error('[AdminAffiliates] Could not copy invitation link:', error);
            setMessage({ type: 'error', text: 'Could not copy the link. Select and copy it manually.' });
        }
    };

    const stats = React.useMemo(() => {
        const active = affiliates.filter(a => a.status === 'Verified');
        return {
            totalRevenue: affiliates.reduce((s, a) => s + a.total_revenue, 0),
            totalClicks: affiliates.reduce((s, a) => s + a.clicks, 0),
            totalOrders: affiliates.reduce((s, a) => s + a.conversions, 0),
            activeCount: active.length,
            pendingApps: affiliates.filter(a => a.status === 'Pending').length,
            totalPayoutsPending: affiliates.reduce((s, a) => s + a.available_earnings, 0)
        };
    }, [affiliates]);

    const filteredAffiliates = affiliates.filter(a =>
        a.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.referral_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
            <RefreshCcw className="h-10 w-10 text-primary animate-spin" />
            <p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Accessing Creator Grid...</p>
        </div>
    );

    return (
        <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20">
            {/* EXECUTIVE HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2 text-left">
                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Affiliate Command Node</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none italic">Partner <span className="text-primary">Intelligence.</span></h1>
                    <p className="text-slate-500 text-sm font-medium mt-2 italic">Scale reach through authentic creator alignment.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={fetchAffiliateNetwork} variant="outline" className="rounded-xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest hover:bg-slate-50">
                        <RefreshCcw className="h-4 w-4 mr-2" /> Sync Grid
                    </Button>
                    <Link href="/lord/payouts">
                        <Button className="rounded-xl h-12 px-8 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                            <DollarSign className="h-4 w-4 mr-2" /> Payout Queue
                        </Button>
                    </Link>
                </div>
            </header>

            {message && (
                <div className={cn(
                    "p-6 rounded-[2.5rem] border-2 flex items-center gap-4 animate-in slide-in-from-top-4",
                    message.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-rose-50 border-rose-100 text-rose-600"
                )}>
                    {message.type === 'success' ? <ShieldCheck size={24} /> : <AlertCircle size={24} />}
                    <p className="text-sm font-black uppercase tracking-widest">{message.text}</p>
                </div>
            )}

            {/* TAB NAVIGATION */}
            <div className="flex gap-2 p-1 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto no-scrollbar max-w-4xl">
                {[
                    { id: 'pulse', label: 'Network Pulse', icon: Target },
                    { id: 'directory', label: 'Partner Directory', icon: Users },
                    { id: 'applications', label: 'Applications', icon: User, count: stats.pendingApps },
                    { id: 'finance', label: 'Financial Hub', icon: CreditCard },
                    { id: 'risk', label: 'Risk Radar', icon: ShieldAlert },
                    { id: 'invitations', label: 'Invitations', icon: Mail, count: invitations.filter(invitation => invitation.status === 'Invited').length },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabId)}
                        className={cn(
                            "flex items-center gap-3 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
                            activeTab === tab.id ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-slate-400 hover:bg-slate-50 hover:text-foreground"
                        )}
                    >
                        <tab.icon className="h-4 w-4" />
                        {tab.label}
                        {tab.count ? <span className="ml-1 bg-rose-500 text-white px-1.5 py-0.5 rounded text-[8px]">{tab.count}</span> : null}
                    </button>
                ))}
            </div>

            {activeTab === 'invitations' && (
                <div className="grid gap-8 xl:grid-cols-[0.8fr_1.2fr]">
                    <Card className="h-fit rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-sm">
                        <div className="mb-6 flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Send size={20} /></div>
                            <div>
                                <h2 className="text-xl font-black uppercase tracking-tight">Invite a partner</h2>
                                <p className="text-xs text-slate-500">Only accepted invitations unlock the affiliate catalog.</p>
                            </div>
                        </div>
                        <form onSubmit={createInvitation} className="space-y-5">
                            <label className="block space-y-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                Partner email
                                <Input required type="email" maxLength={320} autoComplete="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="partner@example.com" />
                            </label>
                            <label className="block space-y-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                Business / display name
                                <Input required minLength={2} maxLength={120} value={inviteBusinessName} onChange={event => setInviteBusinessName(event.target.value)} placeholder="Creator or partner name" />
                            </label>
                            <label className="block space-y-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                Commission rate (%)
                                <Input required type="number" min="0.01" max="100" step="0.01" value={inviteCommissionRate} onChange={event => setInviteCommissionRate(event.target.value)} />
                            </label>
                            <Button type="submit" disabled={creatingInvite} className="h-12 w-full rounded-xl font-black uppercase tracking-widest">
                                {creatingInvite ? <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                                {creatingInvite ? 'Creating invite...' : 'Create invitation'}
                            </Button>
                            <p className="text-xs leading-5 text-slate-500">
                                Invitations expire after 7 days and are locked to this email address. If email delivery is not configured, copy the one-time invite link and send it yourself.
                            </p>
                        </form>
                        {inviteLink && (
                            <div className="mt-6 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                                <p className="text-xs font-black uppercase tracking-wider text-emerald-800">One-time invitation link</p>
                                <Input readOnly value={inviteLink} aria-label="New affiliate invitation link" className="bg-white font-mono text-xs" />
                                <Button type="button" variant="outline" onClick={copyInviteLink} className="w-full bg-white">
                                    <Copy className="mr-2 h-4 w-4" /> Copy invitation link
                                </Button>
                            </div>
                        )}
                    </Card>

                    <Card className="overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white shadow-sm">
                        <div className="border-b border-slate-100 p-7">
                            <h2 className="text-xl font-black uppercase tracking-tight">Invitation register</h2>
                            <p className="mt-1 text-xs text-slate-500">Only invite status is shown; invitation tokens are never listed after creation.</p>
                        </div>
                        {!invitations.length ? (
                            <p className="p-8 text-center text-sm text-slate-500">No invitations have been created.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[650px] text-left text-sm">
                                    <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400">
                                        <tr>
                                            <th className="px-6 py-4">Recipient</th>
                                            <th className="px-6 py-4">Commission</th>
                                            <th className="px-6 py-4">Expires</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {invitations.map(invitation => (
                                            <tr key={invitation.id}>
                                                <td className="px-6 py-4">
                                                    <p className="font-bold">{invitation.business_name}</p>
                                                    <p className="text-xs text-slate-500">{invitation.email}</p>
                                                </td>
                                                <td className="px-6 py-4">{Number(invitation.commission_rate)}%</td>
                                                <td className="px-6 py-4">{new Date(invitation.expires_at).toLocaleDateString()}</td>
                                                <td className="px-6 py-4">
                                                    <span className={cn(
                                                        'rounded-full px-3 py-1 text-[9px] font-black uppercase',
                                                        invitation.status === 'Accepted' ? 'bg-emerald-50 text-emerald-700'
                                                            : invitation.status === 'Invited' ? 'bg-amber-50 text-amber-700'
                                                                : 'bg-slate-100 text-slate-500'
                                                    )}>{invitation.status}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {invitation.status === 'Invited' && (
                                                        <Button type="button" size="sm" variant="outline" onClick={() => void revokeInvitation(invitation.id)} className="border-rose-200 text-rose-700 hover:bg-rose-50">
                                                            <XCircle className="mr-1 h-3.5 w-3.5" /> Revoke
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {activeTab === 'pulse' && (
                <div className="space-y-10 animate-in fade-in duration-700 text-left">
                    {/* GLOBAL KPIS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { label: 'Active Network', val: stats.activeCount, icon: Users, color: 'indigo', sub: 'Verified Partners' },
                            { label: 'Total Clicks', val: stats.totalClicks.toLocaleString(), icon: MousePointer2, color: 'primary', sub: 'Incoming Traffic' },
                            { label: 'Conversions', val: stats.totalOrders, icon: Target, color: 'emerald', sub: 'Successful Sales' },
                            { label: 'Network Value', val: formatPrice(stats.totalRevenue), icon: TrendingUp, color: 'primary', sub: 'Gross Revenue' },
                        ].map((item) => (
                            <Card key={item.label} className="p-8 rounded-[3rem] border border-slate-100 bg-white shadow-sm flex flex-col justify-between group hover:shadow-xl transition-all relative overflow-hidden">
                                <div className="relative z-10 text-left">
                                    <div className={cn(
                                        "h-12 w-12 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110",
                                        item.color === 'indigo' ? "bg-indigo-50 text-indigo-500" :
                                        item.color === 'emerald' ? "bg-emerald-50 text-emerald-500" :
                                        "bg-primary/10 text-primary"
                                    )}>
                                        <item.icon size={24} />
                                    </div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 text-left">{item.label}</p>
                                    <h3 className="text-3xl font-black text-foreground tracking-tighter uppercase text-left">{item.val}</h3>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase mt-4 text-left">{item.sub}</p>
                                </div>
                            </Card>
                        ))}
                    </div>

                    <div className="grid lg:grid-cols-12 gap-10">
                        <Card className="lg:col-span-8 rounded-[3.5rem] border border-slate-100 p-10 bg-white shadow-sm flex flex-col min-h-[500px]">
                            <div className="flex justify-between items-center mb-12">
                                <div className="text-left">
                                    <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter leading-none">Partner Revenue</h2>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Current totals from affiliate summary</p>
                                </div>
                            </div>
                            <div className="flex-1 w-full min-h-[350px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={affiliates.map(a => ({ name: a.full_name, val: a.total_revenue }))}>
                                        <defs>
                                            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ff6b00" stopOpacity={0.1}/>
                                                <stop offset="95%" stopColor="#ff6b00" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-100" />
                                        <XAxis dataKey="name" hide />
                                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 900, fill: 'currentColor'}} className="text-slate-400" />
                                        <Tooltip
                                            contentStyle={{backgroundColor: '#fff', borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.1)'}}
                                            itemStyle={{fontSize: '10px', fontWeight: 900, textTransform: 'uppercase'}}
                                        />
                                        <Area type="monotone" dataKey="val" stroke="#ff6b00" strokeWidth={4} fillOpacity={1} fill="url(#colorRev)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>

                        <div className="lg:col-span-4 flex flex-col gap-10">
                            <Card className="rounded-[3rem] border border-slate-100 p-10 bg-white shadow-sm space-y-8 flex flex-col text-left">
                                <h2 className="text-xl font-black text-foreground uppercase tracking-tighter flex items-center gap-3"><Zap className="h-5 w-5 text-primary" /> Tactical Tasks</h2>
                                <div className="space-y-4">
                                    {[
                                        { label: 'Review Applications', icon: User, href: '#', count: stats.pendingApps },
                                        { label: 'Manage Creatives', icon: Camera, href: '/lord/media?tab=posters' },
                                        { label: 'Finance Review', icon: CreditCard, href: '/lord/payouts' },
                                    ].map(task => (
                                        <button key={task.label} className="w-full p-6 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between group hover:bg-white hover:shadow-xl transition-all text-left">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors"><task.icon size={20} /></div>
                                                <span className="text-[10px] font-black uppercase text-slate-600">{task.label}</span>
                                            </div>
                                            {task.count ? <span className="bg-rose-500 text-white text-[8px] px-1.5 py-0.5 rounded-full">{task.count}</span> : <ChevronRight size={16} className="text-slate-200 group-hover:text-primary transition-all" />}
                                        </button>
                                    ))}
                                </div>
                            </Card>

                            <Card className="rounded-[3rem] border border-slate-100 p-10 bg-primary text-white shadow-xl space-y-6 relative overflow-hidden group text-left">
                                <div className="relative z-10 space-y-4">
                                    <h3 className="text-2xl font-black uppercase tracking-tighter leading-none">Export Network <br /> Intelligence</h3>
                                    <p className="text-primary-foreground/80 text-[10px] font-medium leading-relaxed italic">&quot;Generate a comprehensive PDF ledger of all partner performance and payouts for the current cycle.&quot;</p>
                                    <Button className="w-full h-12 rounded-xl bg-white text-primary font-black uppercase text-[9px] tracking-widest shadow-xl active:scale-95 transition-all">
                                        <FileText className="h-4 w-4 mr-2" /> Compile Report
                                    </Button>
                                </div>
                                <LayoutGrid className="absolute -bottom-10 -right-10 h-48 w-48 text-white/10 rotate-12" />
                            </Card>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'directory' && (
                <div className="animate-in fade-in duration-500 text-left">
                    <Card className="rounded-[3.5rem] border border-slate-100 bg-white shadow-sm overflow-hidden text-left">
                        <div className="p-10 border-b border-slate-50 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-6 text-left">
                            <div className="text-left">
                                <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter">Partner Directory</h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-widest">{affiliates.length} Total Registered Nodes</p>
                            </div>
                            <div className="relative w-full lg:w-96">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                                <Input
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search by name, email or code..."
                                    className="h-14 rounded-2xl bg-slate-50 border-slate-100 pl-12 text-sm font-bold shadow-inner w-full"
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-400 font-black uppercase text-[9px] tracking-[0.2em]">
                                        <th className="px-10 py-6">Partner Identity</th>
                                        <th className="px-10 py-6 text-center">Referral Key</th>
                                        <th className="px-10 py-6 text-center">Performance</th>
                                        <th className="px-10 py-6 text-center">Wallet</th>
                                        <th className="px-10 py-6 text-center">Status</th>
                                        <th className="px-10 py-6 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredAffiliates.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-10 py-12 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                No affiliate performance records available
                                            </td>
                                        </tr>
                                    ) : filteredAffiliates.map(aff => (
                                        <tr key={aff.affiliate_id} className="hover:bg-slate-50/50 transition-all group">
                                            <td className="px-10 py-8">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-12 w-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-foreground font-black text-[10px] uppercase shadow-inner group-hover:scale-105 transition-transform">
                                                        {aff.full_name?.substring(0, 2) || '??'}
                                                    </div>
                                                    <div>
                                                        <span className="font-black text-foreground uppercase text-xs tracking-tight block">{aff.full_name || 'Anonymous'}</span>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{aff.email}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-10 py-8 text-center">
                                                <span className="font-mono text-[10px] font-black text-primary bg-primary/5 px-4 py-2 rounded-xl border border-primary/10">
                                                    {aff.referral_code}
                                                </span>
                                            </td>
                                            <td className="px-10 py-8 text-center">
                                                <div className="inline-flex flex-col items-center">
                                                    <p className="font-black text-foreground text-sm leading-none">{aff.conversions} Sales</p>
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mt-1.5">{aff.clicks} Clicks</p>
                                                </div>
                                            </td>
                                            <td className="px-10 py-8 text-center">
                                                <div className="inline-flex flex-col items-center">
                                                    <p className="font-black text-emerald-600 text-sm leading-none">{formatPrice(aff.available_earnings)}</p>
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mt-1.5">{formatPrice(aff.pending_earnings)} Pending</p>
                                                </div>
                                            </td>
                                            <td className="px-10 py-8 text-center">
                                                <span className={cn(
                                                    "px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border",
                                                    aff.status === 'Verified' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                                    aff.status === 'Flagged' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                                    "bg-amber-50 text-amber-600 border-amber-100"
                                                )}>
                                                    {aff.status}
                                                </span>
                                            </td>
                                            <td className="px-10 py-8 text-right">
                                                <Button
                                                    onClick={() => setSelectedAffiliate(aff)}
                                                    variant="ghost"
                                                    className="h-10 w-10 rounded-xl hover:text-primary hover:bg-white transition-all shadow-sm"
                                                >
                                                    <ChevronRight size={18} />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* APPLICATION DESK */}
            {activeTab === 'applications' && (
                <div className="animate-in fade-in duration-500 space-y-8 text-left">
                    <div className="grid gap-6">
                        {affiliates.filter(a => a.status === 'Pending').length === 0 ? (
                            <Card className="p-20 text-center rounded-[3rem] border-2 border-dashed border-slate-100 bg-white">
                                <User size={48} className="mx-auto text-slate-100 mb-6" />
                                <h3 className="text-xl font-black text-slate-300 uppercase italic">Application Queue Clear.</h3>
                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-2">No pending partner requests identified.</p>
                            </Card>
                        ) : affiliates.filter(a => a.status === 'Pending').map(aff => (
                            <Card key={aff.affiliate_id} className="p-8 rounded-[3rem] border border-slate-100 bg-white shadow-sm flex flex-col lg:flex-row justify-between items-center gap-10 group hover:shadow-2xl transition-all">
                                <div className="flex items-center gap-8 flex-1">
                                    <div className="h-20 w-20 rounded-[2rem] bg-slate-50 border border-slate-100 flex items-center justify-center text-foreground font-black text-2xl uppercase shadow-inner group-hover:scale-105 transition-transform">
                                        {aff.full_name?.substring(0, 2)}
                                    </div>
                                    <div className="space-y-2 text-left">
                                        <h3 className="text-2xl font-black text-foreground uppercase tracking-tighter leading-none">{aff.full_name}</h3>
                                        <p className="text-xs font-bold text-slate-400">{aff.email} &bull; Applied {new Date(aff.created_at).toLocaleDateString()} &bull; Audience: {aff.audience_size.toLocaleString()}</p>
                                        <p className="max-w-xl text-sm text-slate-600">{aff.bio}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {aff.primary_channels.map(channel => (
                                                <span key={channel} className="px-2 py-0.5 rounded bg-slate-100 text-[8px] font-black uppercase text-slate-500">{channel}</span>
                                            ))}
                                        </div>
                                        <p className="text-xs font-semibold text-slate-500">Payout: {aff.preferred_payout_method} · {aff.payout_details}</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <Button onClick={() => handleUpdateStatus(aff.affiliate_id, 'Verified')} className="h-14 px-8 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-emerald-100 hover:scale-105 active:scale-95 transition-all">
                                        Approve Access
                                    </Button>
                                    <Button onClick={() => handleUpdateStatus(aff.affiliate_id, 'Rejected')} variant="ghost" className="h-14 px-8 rounded-2xl text-rose-500 bg-rose-50 hover:bg-rose-100 font-black uppercase text-[10px] tracking-widest transition-all">
                                        Reject
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* 360° AFFILIATE PROFILE DRAWER */}
            {selectedAffiliate && (
                <div
                    className="fixed inset-0 z-[500] flex justify-end bg-slate-900/10 backdrop-blur-md animate-in fade-in duration-300"
                    onClick={() => setSelectedAffiliate(null)}
                >
                    <aside
                        className="w-full max-w-2xl h-full bg-white border-l border-slate-100 shadow-2xl animate-in slide-in-from-right duration-500 overflow-y-auto no-scrollbar"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-12 space-y-12 text-left">
                            <header className="flex justify-between items-start">
                                <div className="flex items-center gap-8">
                                    <div className="h-24 w-24 rounded-[2.5rem] bg-slate-50 border border-slate-100 flex items-center justify-center text-foreground text-3xl font-black relative">
                                        {selectedAffiliate.full_name?.substring(0, 2).toUpperCase()}
                                        <div className={cn(
                                            "absolute -top-1 -right-1 h-6 w-6 rounded-full border-4 border-white",
                                            selectedAffiliate.status === 'Verified' ? "bg-emerald-500" : "bg-amber-500"
                                        )} />
                                    </div>
                                    <div className="space-y-3">
                                        <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">{selectedAffiliate.full_name}</h2>
                                        <div className="flex items-center gap-4">
                                            <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">{selectedAffiliate.affiliate_tier} TIER</p>
                                            <div className="h-1 w-1 rounded-full bg-slate-200" />
                                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[8px] font-black uppercase">ID: {selectedAffiliate.affiliate_id.substring(0,8)}</span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedAffiliate(null)} className="h-12 w-12 rounded-2xl hover:bg-slate-50 flex items-center justify-center text-slate-300 transition-colors border border-slate-100"><XCircle size={28} /></button>
                            </header>

                            {/* PERF CHIP HUD */}
                            <div className="grid grid-cols-3 gap-4 text-left">
                                <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 space-y-2 text-left">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Sales</p>
                                    <p className="text-2xl font-black text-foreground">{selectedAffiliate.conversions}</p>
                                </div>
                                <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 space-y-2 text-left">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Revenue</p>
                                    <p className="text-2xl font-black text-foreground">{formatPrice(selectedAffiliate.total_revenue)}</p>
                                </div>
                                <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 space-y-2 text-left">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Earnings</p>
                                    <p className="text-2xl font-black text-emerald-600">{formatPrice(selectedAffiliate.available_earnings)}</p>
                                </div>
                            </div>

                            {/* TACTICAL CONTROLS */}
                            <section className="space-y-6 text-left">
                                <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.4em] ml-2">Grid Controls</h3>
                                <div className="grid sm:grid-cols-2 gap-4 text-left">
                                    <div className="p-6 rounded-3xl border border-slate-100 bg-white space-y-6 text-left">
                                        <div className="space-y-1 text-left">
                                            <p className="text-[10px] font-black uppercase text-foreground">Commission Override</p>
                                            <p className="text-[8px] font-medium text-slate-400 italic leading-relaxed">Commission settings are unavailable because no persisted rate is configured.</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <Input placeholder="Unavailable" disabled className="h-12 w-32 rounded-xl bg-slate-50 border-slate-100 font-black text-sm text-primary text-center" />
                                            <span className="font-black text-slate-300">%</span>
                                            <Button size="sm" disabled className="h-10 rounded-xl bg-slate-900 text-white font-black uppercase text-[8px] px-4">Unavailable</Button>
                                        </div>
                                    </div>
                                    <div className="p-6 rounded-3xl border border-slate-100 bg-white space-y-6 text-left">
                                        <div className="space-y-1 text-left">
                                            <p className="text-[10px] font-black uppercase text-foreground">Network Status</p>
                                            <p className="text-[8px] font-medium text-slate-400 italic leading-relaxed">Instantly revoke or restore access.</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button onClick={() => handleUpdateStatus(selectedAffiliate.affiliate_id, 'Flagged')} variant="outline" className="flex-1 h-10 rounded-xl border-rose-100 text-rose-500 font-black uppercase text-[8px]">Suspend</Button>
                                            <Button onClick={() => handleUpdateStatus(selectedAffiliate.affiliate_id, 'Verified')} className="flex-1 h-10 rounded-xl bg-primary text-white font-black uppercase text-[8px]">Active</Button>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* TACTICAL NODES (LINKS & CODES) */}
                            <section className="space-y-6 text-left">
                                <div className="flex items-center justify-between ml-2">
                                    <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.4em]">Tactical Nodes</h3>
                                    <Button variant="ghost" className="text-[8px] font-black text-primary uppercase h-auto p-0">Configure New Node</Button>
                                </div>
                                <div className="space-y-4">
                                    <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between group transition-all hover:bg-white text-left">
                                        <div className="flex items-center gap-6">
                                            <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-primary shadow-sm"><Rocket size={18} /></div>
                                            <div className="text-left">
                                                <p className="text-[11px] font-black uppercase text-foreground">Global Referral Hub</p>
                                                <p className="text-[8px] font-mono text-slate-400">/shop?ref={selectedAffiliate.referral_code}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-[8px] font-black text-slate-300 uppercase">{selectedAffiliate.clicks} Loads</span>
                                            <ExternalLink size={14} className="text-slate-200 group-hover:text-primary transition-all cursor-pointer" />
                                        </div>
                                    </div>
                                    <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between group transition-all hover:bg-white text-left opacity-60">
                                        <div className="flex items-center gap-6">
                                            <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-indigo-500 shadow-sm"><Zap size={18} /></div>
                                            <div className="text-left">
                                                <p className="text-[11px] font-black uppercase text-foreground">Personal Coupon</p>
                                                <p className="text-[8px] font-mono text-slate-400">{selectedAffiliate.full_name?.split(' ')[0].toUpperCase()}10</p>
                                            </div>
                                        </div>
                                        <span className="text-[8px] font-black text-slate-400 uppercase">Inactive</span>
                                    </div>
                                </div>
                            </section>

                            <div className="pt-8 border-t border-slate-100 flex flex-col gap-4">
                                <Button
                                    onClick={() => window.open(`https://wa.me/${selectedAffiliate.email}`, '_blank')}
                                    className="w-full h-14 rounded-2xl bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all"
                                >
                                    <MessageSquare size={18} className="mr-2" /> Dispatch Intel to Partner
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setSelectedAffiliate(null)}
                                    className="w-full h-14 rounded-2xl border-slate-100 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all"
                                >
                                    Close Intelligence Profile
                                </Button>
                            </div>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}
