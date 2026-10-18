'use client';

import { useState, useEffect } from 'react';
import { MessageCircle, X, Zap, ChevronRight, Package, ArrowLeft, Search, Loader2, CheckCircle, Send, Inbox } from 'lucide-react';
import { useSettings } from '@/lib/useSettings';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

import { usePathname } from 'next/navigation';

interface UserProfile {
    full_name: string;
}

interface CustomerSupportMessage {
    id: string | number;
    subject: string;
    message: string;
    admin_response: string | null;
    status: string;
    created_at: string;
}

const SUPPORT_TOKEN_KEY = 'onlinebar_support_access_token';

function makeSupportToken() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `support-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

async function getSupportHeaders(token: string, json = false) {
    const headers: Record<string, string> = { 'x-support-access-token': token };
    if (json) headers['Content-Type'] = 'application/json';
    if (supabase) {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session?.access_token) {
            headers.Authorization = 'Bearer ' + data.session.access_token;
        }
    }
    return headers;
}

export default function SupportBubble({ suppressLauncher = false }: { suppressLauncher?: boolean }) {
    const { settings } = useSettings();
    const pathname = usePathname();
    const [showLabel, setShowLabel] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<'menu' | 'track' | 'message' | 'ai' | 'inbox'>('menu');
    const [trackId, setTrackId] = useState('');
    const [trackResult, setTrackResult] = useState<{ id: string; status: string } | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    // AI Chat State
    const [aiInput, setAiInput] = useState('');
    const [aiChat, setAiChat] = useState<{ role: 'ai' | 'user', text: string }[]>([]);
    const [isAiTyping, setIsAiAiTyping] = useState(false);

    // Message Form State
    const [msgForm, setMsgForm] = useState({ name: '', email: '', body: '' });
    const [isSending, setIsSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [supportToken, setSupportToken] = useState('');
    const [supportMessages, setSupportMessages] = useState<CustomerSupportMessage[]>([]);
    const [supportError, setSupportError] = useState('');

    useEffect(() => {
        try {
            let token = localStorage.getItem(SUPPORT_TOKEN_KEY);
            if (!token) {
                token = makeSupportToken();
                localStorage.setItem(SUPPORT_TOKEN_KEY, token);
            }
            setSupportToken(token);
        } catch (error) {
            console.error('[CustomerSupport] Could not initialize secure support session:', error);
            setSupportError('This browser could not create a private support session.');
        }
    }, []);

    useEffect(() => {
        if (!supportToken) return;
        let active = true;
        const refreshMessages = async () => {
            try {
                const response = await fetch('/api/support/messages', {
                    headers: await getSupportHeaders(supportToken),
                    cache: 'no-store'
                });
                const result = await response.json() as {
                    messages?: CustomerSupportMessage[];
                    error?: string;
                };
                if (!response.ok) throw new Error(result.error || 'Could not load support messages.');
                if (active) {
                    setSupportMessages(result.messages || []);
                    setSupportError('');
                }
            } catch (error) {
                if (active) setSupportError(error instanceof Error ? error.message : 'Could not load support messages.');
            }
        };
        void refreshMessages();
        const interval = window.setInterval(refreshMessages, 20_000);
        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, [supportToken]);

    useEffect(() => {
        const handleOverlay = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.active && detail.active !== 'SUPPORT') {
                setIsOpen(false);
                setShowLabel(false);
            }
        };
        window.addEventListener('ob-overlay-state', handleOverlay);
        return () => window.removeEventListener('ob-overlay-state', handleOverlay);
    }, [pathname]);

    useEffect(() => {
        if (isOpen) {
            window.dispatchEvent(new CustomEvent('ob-overlay-state', { detail: { active: 'SUPPORT' } }));
        }
    }, [isOpen]);

    useEffect(() => {
        const handleModalActive = (e: Event) => {
            if ((e as CustomEvent).detail?.active) {
                setIsOpen(false);
                setShowLabel(false);
            }
        };
        window.addEventListener('ob-modal-active', handleModalActive);
        return () => window.removeEventListener('ob-modal-active', handleModalActive);
    }, [pathname]);

    useEffect(() => {
        async function checkUser() {
            if (!supabase) return;
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data } = await supabase.from('profiles').select('full_name').eq('id', session.user.id).single();
                if (data) setUserProfile(data);
            }
        }
        checkUser();

        // Persistent dismissal check
        const dismissed = localStorage.getItem('support_label_dismissed') === 'true';
        if (dismissed || pathname?.includes('/track')) return;

        const timer = setTimeout(() => setShowLabel(true), 5000);
        return () => clearTimeout(timer);
    }, [pathname]);

    const handleDismissLabel = () => {
        setShowLabel(false);
        localStorage.setItem('support_label_dismissed', 'true');
    };

    const handleChat = () => {
        const message = "Hello Online Bar Nairobi! I have a question about your products.";
        window.open(`https://wa.me/${settings.contact.whatsapp}?text=${encodeURIComponent(message)}`, '_blank');
    };

    const handleQuickTrack = async () => {
        if (!trackId.trim() || !supabase) return;
        setIsSearching(true);
        const { data } = await supabase.from('orders').select('status, id').eq('id', trackId.trim()).single();
        setTrackResult(data);
        setIsSearching(false);
    };

    const handleAiQuery = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!aiInput.trim()) return;

        const userMsg = aiInput.trim();
        setAiChat(prev => [...prev, { role: 'user', text: userMsg }]);
        setAiInput('');
        setIsAiAiTyping(true);

        try {
            const res = await fetch('/api/support/ai-concierge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMsg }),
            });
            const data = await res.json();
            if (data.response) {
                setAiChat(prev => [...prev, { role: 'ai', text: data.response }]);
            }
        } catch {
            setAiChat(prev => [...prev, { role: 'ai', text: "Sorry, my uplink is a bit unstable right now. Try again in a second!" }]);
        } finally {
            setIsAiAiTyping(false);
        }
    };

    const handleSubmitMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!msgForm.name || !msgForm.email || !msgForm.body || !supportToken) return;

        setIsSending(true);
        try {
            const response = await fetch('/api/support/messages', {
                method: 'POST',
                headers: await getSupportHeaders(supportToken, true),
                body: JSON.stringify({
                    name: msgForm.name.trim(),
                    email: msgForm.email.trim(),
                    message: msgForm.body.trim(),
                    token: supportToken
                })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Could not send your support message.');
            setSent(true);
            setMsgForm({ name: '', email: '', body: '' });
            setSupportError('');
            window.setTimeout(async () => {
                fetch('/api/support/messages', {
                    headers: await getSupportHeaders(supportToken),
                    cache: 'no-store'
                }).then(async inboxResponse => {
                    const inbox = await inboxResponse.json() as { messages?: CustomerSupportMessage[] };
                    if (inboxResponse.ok) setSupportMessages(inbox.messages || []);
                }).catch(error => console.error('[CustomerSupport] Could not refresh sent message:', error));
            }, 0);
            setTimeout(() => {
                setSent(false);
                setMode('menu');
            }, 3000);
        } catch (error) {
            setSupportError(error instanceof Error ? error.message : 'Could not send your support message.');
        } finally {
            setIsSending(false);
        }
    };

    if (pathname === '/affiliate/agreement') return null;

    return (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] lg:bottom-8 right-3 sm:right-8 z-[2100] flex flex-col items-end gap-4">

            {/* Greeting Label */}
            {!suppressLauncher && showLabel && !isOpen && (
                <div className="hidden sm:flex bg-white px-6 py-4 rounded-[1.8rem] border border-slate-100 shadow-2xl animate-in slide-in-from-right-4 duration-500 items-center gap-4 group max-w-[calc(100vw-48px)]">
                    <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white font-black text-xs shadow-lg shadow-primary/20">
                        {(userProfile?.full_name as string)?.substring(0, 1) || settings?.branding?.owner_name?.substring(0, 1) || 'A'}
                    </div>
                    <div className="text-left">
                        <p className="font-black text-foreground uppercase text-[10px] tracking-tight">{userProfile?.full_name || settings?.branding?.owner_name || 'Admin'}</p>
                        <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest mt-0.5">
                            {userProfile?.full_name ? `Need help with your order, ${userProfile.full_name.split(' ')[0]}?` : "Need help with an order?"}
                        </p>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDismissLabel(); }}
                        className="h-10 w-10 -mr-2 flex items-center justify-center text-slate-300 hover:text-primary hover:bg-orange-50 rounded-full transition-all active:scale-90"
                        title="Dismiss help bubble"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {/* Smart Dashboard */}
            {isOpen && (
                <div className="bg-white rounded-[2.5rem] w-[calc(100vw-32px)] sm:w-80 shadow-2xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-primary p-6 text-white flex justify-between items-center shadow-lg">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-xl bg-white/10 flex items-center justify-center text-white"><Zap className="h-4 w-4 fill-current" /></div>
                            <span className="text-[10px] font-black uppercase tracking-widest">Bar Support</span>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-white/70 hover:text-white transition-colors"><X className="h-5 w-5" /></button>
                    </div>

                    <div className="p-6 space-y-4">
                        {mode === 'menu' ? (
                            <>
                                <button onClick={() => setMode('ai')} className="w-full p-4 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all text-left flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-xl bg-white flex items-center justify-center text-primary shadow-sm"><Zap className="h-4 w-4" /></div>
                                        <span className="text-[10px] font-black uppercase text-foreground">Bar AI Finder</span>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-primary/30" />
                                </button>
                                <button onClick={() => setMode('track')} className="w-full p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-100 transition-all text-left flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-xl bg-white flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors shadow-sm"><Package className="h-4 w-4" /></div>
                                        <span className="text-[10px] font-black uppercase text-foreground">Track My Order</span>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-slate-300" />
                                </button>
                                <button onClick={() => setMode('inbox')} className="w-full p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-100 transition-all text-left flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-xl bg-white flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors shadow-sm"><Inbox className="h-4 w-4" /></div>
                                        <span className="text-[10px] font-black uppercase text-foreground">Support Replies {supportMessages.some(item => item.admin_response) ? `(${supportMessages.filter(item => item.admin_response).length})` : ''}</span>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-slate-300" />
                                </button>
                                <button onClick={handleChat} className="w-full p-4 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all text-left flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-xl bg-white flex items-center justify-center text-primary shadow-sm"><MessageCircle className="h-4 w-4" /></div>
                                        <span className="text-[10px] font-black uppercase text-foreground">Speak to Sales</span>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-primary/30" />
                                </button>
                            </>
                        ) : mode === 'ai' ? (
                            <div className="space-y-4 animate-in fade-in duration-300 flex flex-col h-[350px]">
                                <button onClick={() => setMode('menu')} className="text-[9px] font-black uppercase text-slate-400 hover:text-primary flex items-center gap-1 transition-colors">
                                    <ArrowLeft className="h-3 w-3" /> Back
                                </button>

                                <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide no-scrollbar">
                                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                        <p className="text-[9px] font-black uppercase text-primary mb-1">Bar AI</p>
                                        <p className="text-[10px] font-bold text-slate-600 leading-relaxed italic">&quot;Hello! I&apos;m your beverage assistant. What drink can I help you find today?&quot;</p>
                                    </div>

                                    {aiChat.map((chat, i) => (
                                        <div key={i} className={cn(
                                            "p-3 rounded-2xl border transition-all animate-in zoom-in-95",
                                            chat.role === 'user' ? "bg-white border-slate-100 ml-6" : "bg-primary/5 border-primary/10 mr-6"
                                        )}>
                                            <p className="text-[8px] font-black uppercase text-slate-400 mb-1">{chat.role === 'user' ? 'You' : 'Bar AI'}</p>
                                            <p className="text-[10px] font-medium text-foreground leading-relaxed whitespace-pre-wrap">{chat.text}</p>
                                        </div>
                                    ))}

                                    {isAiTyping && (
                                        <div className="flex gap-1.5 p-2 items-center">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"></div>
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-75"></div>
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-150"></div>
                                        </div>
                                    )}
                                </div>

                                <form onSubmit={handleAiQuery} className="relative mt-auto">
                                    <input
                                        value={aiInput}
                                        onChange={e => setAiInput(e.target.value)}
                                        placeholder="Ask about a beverage..."
                                        className="w-full h-12 px-4 pr-12 rounded-xl border border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-widest focus:ring-2 focus:ring-primary outline-none"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isAiTyping}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 bg-primary text-white rounded-lg flex items-center justify-center hover:bg-primary/90 transition-all disabled:opacity-30 shadow-lg shadow-primary/20"
                                    >
                                        <Send className="h-4 w-4" />
                                    </button>
                                </form>
                            </div>
                        ) : mode === 'inbox' ? (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                <button onClick={() => setMode('menu')} className="text-[9px] font-black uppercase text-slate-400 hover:text-primary flex items-center gap-1 transition-colors">
                                    <ArrowLeft className="h-3 w-3" /> Back
                                </button>
                                <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                                    {supportError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-[10px] font-bold text-rose-700">{supportError}</p>}
                                    {supportMessages.length === 0 ? (
                                        <div className="rounded-2xl bg-slate-50 p-6 text-center text-[10px] font-bold text-slate-500">
                                            No support messages on this device yet. Send a message and replies will appear here.
                                        </div>
                                    ) : supportMessages.map(item => (
                                        <article key={item.id} className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{item.subject} · {new Date(item.created_at).toLocaleString()}</p>
                                            <p className="whitespace-pre-wrap break-words text-[10px] font-medium leading-relaxed text-slate-600">{item.message}</p>
                                            {item.admin_response && (
                                                <div className="rounded-xl border-l-2 border-primary bg-primary/5 p-3">
                                                    <p className="mb-1 text-[8px] font-black uppercase text-primary">Online Bar Support</p>
                                                    <p className="whitespace-pre-wrap break-words text-[10px] font-semibold leading-relaxed text-foreground">{item.admin_response}</p>
                                                </div>
                                            )}
                                        </article>
                                    ))}
                                </div>
                            </div>
                        ) : mode === 'track' ? (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                <button onClick={() => { setMode('menu'); setTrackResult(null); }} className="text-[9px] font-black uppercase text-slate-400 hover:text-primary flex items-center gap-1 transition-colors">
                                    <ArrowLeft className="h-3 w-3" /> Back
                                </button>
                                <div className="relative">
                                    <input
                                        value={trackId}
                                        onChange={e => setTrackId(e.target.value)}
                                        placeholder="Order ID..."
                                        className="w-full h-12 px-4 rounded-xl border border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-widest focus:ring-2 focus:ring-primary outline-none"
                                    />
                                    <button
                                        onClick={handleQuickTrack}
                                        disabled={isSearching}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 bg-primary text-white rounded-lg flex items-center justify-center hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                                    >
                                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                    </button>
                                </div>
                                {trackResult && (
                                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 animate-in zoom-in-95">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Status</p>
                                        <p className="text-sm font-black text-foreground uppercase tracking-tight">{trackResult.status}</p>
                                        <Link href={`/track?id=${trackResult.id}`} className="text-[9px] font-black text-primary uppercase underline mt-2 block">Full Tracking Detail</Link>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                <button onClick={() => { setMode('menu'); setSent(false); }} className="text-[9px] font-black uppercase text-slate-400 hover:text-primary flex items-center gap-1 transition-colors">
                                    <ArrowLeft className="h-3 w-3" /> Back
                                </button>

                                {sent ? (
                                    <div className="py-10 text-center space-y-3 animate-in zoom-in-95">
                                        <div className="h-12 w-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center shadow-inner">
                                            <CheckCircle className="h-6 w-6" />
                                        </div>
                                        <p className="text-[10px] font-black uppercase text-foreground tracking-tight">Message Received!</p>
                                        <p className="text-[9px] text-slate-400 font-medium px-4 leading-relaxed">Our support team will reach out via email shortly.</p>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSubmitMessage} className="space-y-3">
                                        {supportError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-[10px] font-bold text-rose-700">{supportError}</p>}
                                        <input
                                            required
                                            value={msgForm.name}
                                            onChange={e => setMsgForm({...msgForm, name: e.target.value})}
                                            placeholder="Your Name"
                                            className="w-full h-10 px-4 rounded-xl border border-slate-100 bg-slate-50 text-[10px] font-bold uppercase outline-none focus:ring-1 focus:ring-primary"
                                        />
                                        <input
                                            required
                                            type="email"
                                            value={msgForm.email}
                                            onChange={e => setMsgForm({...msgForm, email: e.target.value})}
                                            placeholder="Email Address"
                                            className="w-full h-10 px-4 rounded-xl border border-slate-100 bg-slate-50 text-[10px] font-bold uppercase outline-none focus:ring-1 focus:ring-primary"
                                        />
                                        <textarea
                                            required
                                            value={msgForm.body}
                                            onChange={e => setMsgForm({...msgForm, body: e.target.value})}
                                            placeholder="How can we help?"
                                            rows={3}
                                            className="w-full p-4 rounded-xl border border-slate-100 bg-slate-50 text-[10px] font-bold uppercase outline-none focus:ring-1 focus:ring-primary resize-none"
                                        />
                                        <button
                                            disabled={isSending}
                                            className="w-full h-12 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
                                        >
                                            {isSending ? 'Sending...' : 'Send Message'}
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bubble Button */}
            {(!suppressLauncher || isOpen) && (
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    aria-label={isOpen ? 'Close customer support' : 'Open customer support'}
                    className="relative flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-primary text-white shadow-2xl transition-all hover:scale-110 active:scale-95 group sm:h-16 sm:w-16"
                >
                    {isOpen ? <X className="h-5 w-5 sm:h-7 sm:w-7" /> : <MessageCircle className="h-5 w-5 transition-transform group-hover:rotate-12 sm:h-7 sm:w-7" />}
                    {!isOpen && <span className="absolute right-0 top-0 h-4 w-4 animate-pulse rounded-full border-2 border-white bg-primary"></span>}
                    {!isOpen && supportMessages.some(item => item.admin_response) && (
                        <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 px-1 text-[9px] font-black text-white">
                            {supportMessages.filter(item => item.admin_response).length}
                        </span>
                    )}
                </button>
            )}
        </div>
    );
}
