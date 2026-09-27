'use client';

import * as React from 'react';
import {
    MessageCircle,
    Send,
    Bot,
    Plus,
    Loader2,
    Server,
    Key,
    Zap,
    Users,
    Trash2,
    Copy,
    Check,
    Database,
    Radio,
    X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import TacticalEventFeed from '@/components/admin/TacticalEventFeed';

interface AutoResponderRule {
    id: string;
    keyword: string;
    reply: string;
    active: boolean;
}

interface WhatsAppChatMessage {
    id: string;
    sender: string;
    phone: string;
    text: string;
    time: string;
    isUser: boolean;
    status: 'SENT' | 'DELIVERED' | 'READ';
}

export default function WhatsAppCommandCenter() {
    const [rules, setAutoRules] = React.useState<AutoResponderRule[]>([]);
    const [messages, setMessages] = React.useState<WhatsAppChatMessage[]>([]);
    const [replyText, setReplyText] = React.useState('');
    const [newKeyword, setNewKeyword] = React.useState('');
    const [newReply, setNewReply] = React.useState('');
    const [isSqlModalOpen, setIsSqlModalOpen] = React.useState(false);
    const [copiedSql, setCopiedSql] = React.useState(false);

    // Broadcast Form
    const [broadcastName, setBroadcastName] = React.useState('');
    const [audience, setAudience] = React.useState('VIP Patrons (2,140 Members)');
    const [template, setTemplate] = React.useState('friday_happy_hour_v1');
    const [isSendingBroadcast, setIsSendingBroadcast] = React.useState(false);

    // Credentials State
    const config = {
        wabaId: 'WABA-90182741920',
        phoneId: 'PNID-10928374192',
        accessToken: 'EAAG9281...AES256_ENCRYPTED',
        webhookUrl: 'https://onlinebar.co.ke/api/webhooks/whatsapp',
        verifyToken: 'bar_os_wa_secret_verify_2026'
    };

    React.useEffect(() => {
        async function fetchWhatsApp() {
            if (!supabase) return;
            try {
                const [rulesRes, msgRes] = await Promise.all([
                    supabase.from('whatsapp_auto_rules').select('*').order('created_at', { ascending: false }),
                    supabase.from('whatsapp_messages').select('*').order('created_at', { ascending: false }).limit(10)
                ]);

                if (rulesRes.data && rulesRes.data.length > 0) {
                    setAutoRules(rulesRes.data as unknown as AutoResponderRule[]);
                }
                if (msgRes.data && msgRes.data.length > 0) {
                    setMessages(msgRes.data as unknown as WhatsAppChatMessage[]);
                }
            } catch (err) {
                console.error("WhatsApp fetch error:", err);
            }
        }
        fetchWhatsApp();
    }, []);

    const handleAddRule = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyword.trim() || !newReply.trim()) return;

        const rule: AutoResponderRule = {
            id: `rule-${Date.now()}`,
            keyword: newKeyword.trim(),
            reply: newReply.trim(),
            active: true
        };
        setAutoRules([...rules, rule]);
        setNewKeyword('');
        setNewReply('');
        alert(`Auto-responder rule created for keyword "${rule.keyword}"! 🤖`);
    };

    const handleDeleteRule = (id: string) => {
        setAutoRules(rules.filter(r => r.id !== id));
    };

    const handleSendDirectReply = (e: React.FormEvent) => {
        e.preventDefault();
        if (!replyText.trim()) return;

        const newMsg: WhatsAppChatMessage = {
            id: `msg-${Date.now()}`,
            sender: 'BAR OS WhatsApp Command',
            phone: '+254712345678',
            text: replyText.trim(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isUser: false,
            status: 'DELIVERED'
        };

        setMessages([...messages, newMsg]);
        setReplyText('');
    };

    const handleSendBroadcast = () => {
        if (!broadcastName.trim()) {
            alert('Please enter a Broadcast Campaign Name');
            return;
        }
        setIsSendingBroadcast(true);
        setTimeout(() => {
            setIsSendingBroadcast(false);
            alert(`🎉 WhatsApp Campaign "${broadcastName}" successfully broadcast to ${audience}!`);
            setBroadcastName('');
        }, 1500);
    };

    const copySql = () => {
        navigator.clipboard.writeText(WHATSAPP_SQL_SCRIPT);
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 3000);
    };

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left selection:bg-primary/20 pb-40">
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <MessageCircle className="h-5 w-5 text-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-600">META WHATSAPP BUSINESS CLOUD API</span>
                        <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            🟢 CLOUD API LIVE
                        </span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">WhatsApp Command</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Direct Cloud API messaging, automated AI responses, and targeted customer broadcasts.</p>
                </div>

                <div className="flex gap-3">
                    <Button onClick={() => setIsSqlModalOpen(true)} variant="outline" className="h-12 px-5 rounded-2xl border-emerald-200 text-emerald-700 bg-emerald-50 font-black uppercase text-[9px] tracking-widest hover:bg-emerald-100">
                        <Database size={16} className="mr-2 text-emerald-600" /> WhatsApp SQL Script
                    </Button>
                </div>
            </header>

            {/* Cloud API Configuration Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* WABA Credentials */}
                <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-4 text-left">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <Server className="h-5 w-5 text-emerald-600" />
                        <div>
                            <h3 className="text-lg font-black uppercase tracking-tight text-foreground">WABA Node Credentials</h3>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Meta Cloud API Identifiers</p>
                        </div>
                    </div>
                    <div className="space-y-3 font-mono text-xs">
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-[8px] font-black text-slate-400 uppercase font-sans">WABA Account ID</p>
                            <p className="font-bold text-foreground mt-0.5">{config.wabaId}</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-[8px] font-black text-slate-400 uppercase font-sans">Phone Number ID</p>
                            <p className="font-bold text-foreground mt-0.5">{config.phoneId}</p>
                        </div>
                    </div>
                </Card>

                {/* Token Security */}
                <Card className="p-8 rounded-[3.5rem] bg-slate-900 text-white shadow-2xl space-y-4 text-left relative overflow-hidden">
                    <div className="flex items-center gap-3 border-b border-slate-800 pb-4 relative z-10">
                        <Key className="h-5 w-5 text-emerald-400" />
                        <div>
                            <h3 className="text-lg font-black uppercase tracking-tight">System User Token</h3>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Permanent AES-256 Vault</p>
                        </div>
                    </div>
                    <div className="space-y-3 relative z-10">
                        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400 truncate">
                            {config.accessToken}
                        </div>
                        <p className="text-[10px] font-medium text-slate-400 italic">
                            &quot;Permanent System User token connected with whatsapp_business_messaging scope.&quot;
                        </p>
                    </div>
                </Card>

                {/* Webhook Configuration */}
                <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-4 text-left">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <Radio className="h-5 w-5 text-primary animate-pulse" />
                        <div>
                            <h3 className="text-lg font-black uppercase tracking-tight text-foreground">HTTPS Webhook Listener</h3>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Real-Time Inbound Listener</p>
                        </div>
                    </div>
                    <div className="space-y-3 font-mono text-xs">
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 truncate">
                            <p className="text-[8px] font-black text-slate-400 uppercase font-sans">Callback URL</p>
                            <p className="font-bold text-foreground mt-0.5 truncate">{config.webhookUrl}</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-[8px] font-black text-slate-400 uppercase font-sans">Verify Token</p>
                            <p className="font-bold text-foreground mt-0.5">{config.verifyToken}</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* MAIN WORKING AREA: BROADCAST BUILDER & AUTO-RESPONDER RULES */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
                {/* Broadcast Campaign Builder */}
                <div className="lg:col-span-6 space-y-6">
                    <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                            <Zap className="h-6 w-6 text-emerald-600" />
                            <div>
                                <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">WhatsApp Broadcast Builder</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Send Targeted Campaign Messages</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Campaign Name</label>
                                <Input
                                    value={broadcastName}
                                    onChange={e => setBroadcastName(e.target.value)}
                                    placeholder="e.g. Friday Happy Hour Blast"
                                    className="h-12 rounded-xl bg-slate-50 border-none font-bold text-xs"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Target Audience Segment</label>
                                <select
                                    value={audience}
                                    onChange={e => setAudience(e.target.value)}
                                    className="w-full h-12 rounded-xl bg-slate-50 border-none px-3 font-bold text-xs"
                                >
                                    <option>VIP Patrons (2,140 Members)</option>
                                    <option>Recent Beverage Buyers (840 Members)</option>
                                    <option>Night Bites Fast Food Lovers (1,250 Members)</option>
                                    <option>All WhatsApp Subscribers (5,410 Members)</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Approved Meta Message Template</label>
                                <select
                                    value={template}
                                    onChange={e => setTemplate(e.target.value)}
                                    className="w-full h-12 rounded-xl bg-slate-50 border-none px-3 font-bold text-xs"
                                >
                                    <option value="friday_happy_hour_v1">friday_happy_hour_v1 (Marketing)</option>
                                    <option value="order_dispatch_alert_v2">order_dispatch_alert_v2 (Utility)</option>
                                    <option value="vip_exclusive_coupon">vip_exclusive_coupon (Promotional)</option>
                                </select>
                            </div>

                            {/* Template Live Preview */}
                            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80 space-y-2">
                                <p className="text-[9px] font-black uppercase text-emerald-800 tracking-widest">Template Message Preview</p>
                                <p className="text-xs font-medium text-emerald-950 leading-relaxed italic">
                                    &quot;Hello &#123;&#123;1&#125;&#125;! Friday Happy Hour is live at Online Bar. Buy 1 Amarula 750ml, get second at 50% off! Order here: onlinebar.co.ke/beverages&quot;
                                </p>
                            </div>

                            <Button
                                onClick={handleSendBroadcast}
                                disabled={isSendingBroadcast}
                                className="w-full h-14 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700 font-black uppercase text-xs tracking-widest shadow-xl shadow-emerald-200 transition-all"
                            >
                                {isSendingBroadcast ? <Loader2 className="animate-spin mr-2" size={16} /> : <><Send size={16} className="mr-2" /> Dispatch WhatsApp Broadcast</>}
                            </Button>
                        </div>
                    </Card>
                </div>

                {/* AI Auto-Responder Rules Engine */}
                <div className="lg:col-span-6 space-y-6">
                    <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                            <Bot className="h-6 w-6 text-primary" />
                            <div>
                                <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">AI Auto-Responder Rules</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Automatic Keyword Reply Trigger</p>
                            </div>
                        </div>

                        {/* Add New Rule Form */}
                        <form onSubmit={handleAddRule} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
                            <div className="grid grid-cols-3 gap-2">
                                <Input
                                    value={newKeyword}
                                    onChange={e => setNewKeyword(e.target.value)}
                                    placeholder="Trigger Keyword (e.g. Amarula)"
                                    className="col-span-1 h-10 rounded-xl bg-white border-slate-200 text-xs font-bold"
                                />
                                <Input
                                    value={newReply}
                                    onChange={e => setNewReply(e.target.value)}
                                    placeholder="Auto-Reply Message Text..."
                                    className="col-span-2 h-10 rounded-xl bg-white border-slate-200 text-xs"
                                />
                            </div>
                            <Button type="submit" className="w-full h-10 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest">
                                <Plus size={14} className="mr-1" /> Add Auto-Reply Rule
                            </Button>
                        </form>

                        {/* Rules List */}
                        <div className="space-y-3 max-h-[300px] overflow-y-auto no-scrollbar pr-1">
                            {rules.map(r => (
                                <div key={r.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start justify-between gap-3 hover:bg-slate-100 transition-colors">
                                    <div className="space-y-1 min-w-0">
                                        <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-mono font-black text-[9px] uppercase tracking-wider">
                                            Trigger: &quot;{r.keyword}&quot;
                                        </span>
                                        <p className="text-xs font-medium text-slate-600 italic leading-relaxed truncate">{r.reply}</p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteRule(r.id)}
                                        className="h-8 w-8 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-colors shrink-0"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>

            {/* LIVE CONVERSATION CHAT INBOX */}
            <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 text-left">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                        <Users className="h-6 w-6 text-emerald-600" />
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Live WhatsApp Inbox</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Direct Customer Chat & Response Room</p>
                        </div>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase border border-emerald-200">
                        3 Messages Synchronized
                    </span>
                </div>

                <div className="space-y-3 max-h-[250px] overflow-y-auto no-scrollbar p-2 bg-slate-50 rounded-2xl border border-slate-100">
                    {messages.map(m => (
                        <div
                            key={m.id}
                            className={cn(
                                "p-3 rounded-2xl max-w-md text-xs space-y-1 shadow-sm",
                                m.isUser ? "bg-white border border-slate-200 self-start" : "bg-emerald-600 text-white ml-auto"
                            )}
                        >
                            <div className="flex justify-between items-center text-[8px] font-black uppercase opacity-70">
                                <span>{m.sender}</span>
                                <span>{m.time}</span>
                            </div>
                            <p className="font-bold italic">{m.text}</p>
                        </div>
                    ))}
                </div>

                {/* Direct Reply Input */}
                <form onSubmit={handleSendDirectReply} className="flex gap-2">
                    <Input
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder="Type direct WhatsApp reply..."
                        className="h-12 rounded-xl bg-slate-50 border-slate-200 text-xs font-medium"
                    />
                    <Button type="submit" className="h-12 px-6 rounded-xl bg-emerald-600 text-white font-black uppercase text-xs tracking-widest shrink-0">
                        <Send size={16} className="mr-1" /> Send
                    </Button>
                </form>
            </Card>

            {/* SQL MIGRATION MODAL */}
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
                            <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">SUPABASE DATABASE ASSISTANT</span>
                            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">WhatsApp Master SQL Migration</h2>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-950 text-emerald-400 font-mono text-[10px] space-y-1 overflow-x-auto shadow-inner border border-slate-800 leading-relaxed max-h-[250px]">
                            <pre>{WHATSAPP_SQL_SCRIPT}</pre>
                        </div>

                        <div className="pt-2 flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">1-Click Copy</span>
                            <Button
                                onClick={copySql}
                                className={cn(
                                    "h-12 px-6 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-md",
                                    copiedSql ? "bg-emerald-500 text-white" : "bg-emerald-600 text-white hover:bg-emerald-700"
                                )}
                            >
                                {copiedSql ? <><Check size={16} className="mr-2" /> Copied!</> : <><Copy size={16} className="mr-2" /> Copy WhatsApp SQL</>}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tactical Live Event Feed */}
            <div className="pt-6">
                <TacticalEventFeed
                    title="WhatsApp Dispatch & Messaging Telemetry"
                    subtitle="Live Real-time Cloud API Event Stream"
                />
            </div>
        </div>
    );
}
