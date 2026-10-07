'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Bot,
    Send,
    X,
    Sparkles,
    Loader2,
    ShoppingBag,
    ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import { useSettings } from '@/lib/useSettings';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useInteractionTracking } from '@/lib/utils/useInteractionTracking';

interface Suggestion {
    id: number;
    name: string;
    price: number;
    image_url: string;
}

export default function AIConcierge({ suppressLauncher = false }: { suppressLauncher?: boolean }) {
    const pathname = usePathname();
    const { settings } = useSettings();
    const [isOpen, setIsOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [messages, setMessages] = React.useState<{ role: 'user' | 'assistant', text: string, suggestions?: Suggestion[] }[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const { addBundleToCart } = useCart();
    const { trackClick } = useInteractionTracking();

    const scrollRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleOverlay = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.active && detail.active !== 'AI_CONCIERGE') {
                setIsOpen(false);
            }
        };
        window.addEventListener('ob-overlay-state', handleOverlay);
        return () => window.removeEventListener('ob-overlay-state', handleOverlay);
    }, []);

    React.useEffect(() => {
        if (isOpen) {
            window.dispatchEvent(new CustomEvent('ob-overlay-state', { detail: { active: 'AI_CONCIERGE' } }));
        }
    }, [isOpen]);

    React.useEffect(() => {
        if (!isOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsOpen(false);
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [isOpen]);

    React.useEffect(() => {
        const handleModalActive = (e: Event) => {
            if ((e as CustomEvent).detail?.active) setIsOpen(false);
        };
        window.addEventListener('ob-modal-active', handleModalActive);
        return () => window.removeEventListener('ob-modal-active', handleModalActive);
    }, []);

    React.useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    // Disable logic based on Admin settings
    if (settings?.features?.ai_concierge_enabled === false) return null;

    const handleAsk = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim() || isLoading) return;

        const userMsg = query.trim();
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setQuery('');
        setIsLoading(true);

        trackClick('ai-concierge-msg', 'AI Concierge Message', { query: userMsg, msg_count: messages.length + 1 });

        try {
            // Real Database Vector/Keyword Search Node
            const low = userMsg.toLowerCase();
            const config = settings?.ai_config || { build_setup_limit: 5000, assistant_name: 'Online Bar AI', response_style: 'Premium' };

            let reply = `I'm analyzing the cellar for your premium selection. As ${config.assistant_name}, I recommend these:`;
            let suggestions: Suggestion[] = [];

            if (low.includes('date night') || low.includes('couple') || low.includes('romantic')) {
                reply = "I've curated a refined selection for your evening. Our cellar recommends these pairings:";
                if (!supabase) throw new Error("Database offline");
                const { data: prods } = await supabase.from('products').select('*').in('category', ['wine', 'snacks', 'mixers']).limit(3);
                suggestions = (prods || []).map(p => ({ id: p.id, name: p.name, price: p.price, image_url: p.image_url }));
            } else if (low.includes('host') || low.includes('people') || low.includes('party')) {
                reply = "For your gathering, I recommend these essentials to keep the grid alive:";
                if (!supabase) throw new Error("Database offline");
                const { data: prods } = await supabase.from('products').select('*').in('category', ['spirits', 'snacks', 'mixers']).limit(4);
                suggestions = (prods || []).map(p => ({ id: p.id, name: p.name, price: p.price, image_url: p.image_url }));
            } else if (low.includes('setup') || low.includes('office') || low.includes('gaming')) {
                const limit = config.build_setup_limit || 5000;
                if (!supabase) throw new Error("Database offline");
                const { data: prods } = await supabase.from('products').select('*').lte('price', limit).limit(3);
                suggestions = (prods || []).map(p => ({ id: p.id, name: p.name, price: p.price, image_url: p.image_url }));
                if (suggestions.length === 0) {
                    reply = `I couldn't find a complete selection under ${formatPrice(limit)}. I've pulled our closest premium essentials instead:`;
                    const { data: alt } = await supabase.from('products').select('*').limit(2);
                    suggestions = (alt || []).map(p => ({ id: p.id, name: p.name, price: p.price, image_url: p.image_url }));
                }
            } else if (low.includes('cheap') || low.includes('budget') || low.includes('under')) {
                if (!supabase) throw new Error("Database offline");
                const { data: prods } = await supabase.from('products').select('*').order('price', { ascending: true }).limit(2);
                suggestions = (prods || []).map(p => ({ id: p.id, name: p.name, price: p.price, image_url: p.image_url }));
            } else {
                reply = "I recommend these premium essentials to upgrade your bar experience.";
                if (!supabase) throw new Error("Database offline");
                const { data: prods } = await supabase.from('products').select('*').limit(2);
                suggestions = (prods || []).map(p => ({ id: p.id, name: p.name, price: p.price, image_url: p.image_url }));
            }

            setMessages(prev => [...prev, { role: 'assistant', text: reply, suggestions }]);
        } catch (error) {
            console.error('[AIConcierge] Could not prepare recommendations:', error);
            setMessages(prev => [...prev, {
                role: 'assistant',
                text: 'I could not reach the live product catalog right now. Please try again shortly.'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddAll = (items: Suggestion[]) => {
        const cartItems = items.map(i => ({
            id: i.id,
            name: i.name,
            price: i.price,
            base_price: i.price,
            image: i.image_url,
            quantity: 1
        }));
        addBundleToCart(cartItems);
        setMessages(prev => [...prev, { role: 'assistant', text: "Selection added to bag. Ready for dispatch!" }]);
    };

    if (pathname === '/affiliate/agreement') return null;

    return (
        <>
            {!isOpen ? (
                suppressLauncher ? null : (
                <div className="fixed left-3 sm:left-8 bottom-[calc(6rem+env(safe-area-inset-bottom))] lg:bottom-28 z-[2100]">
                    <button
                        onClick={() => setIsOpen(true)}
                        aria-label="Open AI Concierge"
                        className="relative flex h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-primary text-white shadow-2xl shadow-primary/40 hover:scale-110 active:scale-95 transition-all items-center justify-center group border-4 border-white"
                    >
                        <Bot className="h-6 w-6 sm:h-8 sm:w-8 group-hover:rotate-12 transition-transform" />
                        <div className="absolute -top-1 -right-1 h-4 w-4 sm:h-5 sm:w-5 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
                    </button>
                </div>
                )
            ) : (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/45 p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:p-6">
                    <button
                        type="button"
                        aria-label="Close AI Concierge"
                        onClick={() => setIsOpen(false)}
                        className="absolute inset-0 h-full w-full cursor-default"
                    />
                    <Card
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="ai-concierge-title"
                        onClick={event => event.stopPropagation()}
                        className="relative z-10 flex h-[min(650px,calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] max-h-full w-full max-w-[400px] flex-col overflow-hidden rounded-[2rem] border border-slate-100 bg-white text-left shadow-[0_30px_100px_-15px_rgba(0,0,0,0.35)] animate-in zoom-in-95 duration-200 sm:rounded-[2.5rem]"
                    >
                    <div className="shrink-0 p-5 sm:p-6 bg-primary text-white relative overflow-hidden flex justify-between items-center shadow-lg">
                        <div className="relative z-10 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/20"><Bot size={24} /></div>
                            <div>
                                <h3 id="ai-concierge-title" className="text-xl font-black uppercase tracking-tighter">AI Concierge</h3>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Premium Shopping Agent</p>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} aria-label="Close AI Concierge" className="h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors relative z-10"><X size={24} /></button>
                        <Sparkles className="absolute -bottom-10 -right-10 h-48 w-48 text-white/5 -rotate-12" />
                    </div>

                    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50/50">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center space-y-10 py-10">
                                <div className="h-24 w-24 rounded-[3rem] bg-white flex items-center justify-center shadow-inner animate-pulse"><Sparkles className="h-10 w-10 text-primary" /></div>
                                <div className="space-y-4 px-10">
                                    <h4 className="text-2xl font-black uppercase tracking-tighter text-foreground">Mission Brief</h4>
                                    <p className="text-xs text-slate-400 font-medium leading-relaxed italic">
                                        &quot;I am your tactical sales agent. Tell me what setup you need or your budget, and I will bundle it for you.&quot;
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 w-full px-4">
                                    {['Date Night', 'Hosting 8 People', 'Sophisticated Mood', 'Under 5k'].map(opt => (
                                        <button key={opt} onClick={() => setQuery(opt)} className="p-4 rounded-2xl bg-white border border-slate-100 text-[9px] font-black uppercase text-slate-500 hover:border-primary hover:text-primary transition-all shadow-sm">
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            messages.map((m, idx) => (
                                <div key={idx} className={cn("flex flex-col gap-4", m.role === 'user' ? "items-end" : "items-start")}>
                                    <div className={cn(
                                        "max-w-[85%] p-5 rounded-[2rem] text-sm shadow-sm",
                                        m.role === 'user' ? "bg-primary text-white rounded-br-sm" : "bg-white text-slate-700 border border-slate-100 rounded-bl-sm font-medium italic"
                                    )}>
                                        {m.text}
                                    </div>
                                    {m.suggestions && m.suggestions.length > 0 && (
                                        <div className="w-full space-y-3 animate-in fade-in slide-in-from-left-4 duration-500">
                                            {m.suggestions.map(s => (
                                                <div key={s.id} className="p-4 rounded-3xl bg-white border border-slate-100 flex items-center gap-4 shadow-sm group hover:border-primary/20 transition-all">
                                                    <div className="h-14 w-14 rounded-2xl bg-slate-50 p-2 border border-slate-100 shrink-0">
                                                        <Image src={normalizeImage(s.image_url)} alt="" width={56} height={56} className="h-full w-full object-contain" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[10px] font-black uppercase truncate text-foreground">{s.name}</p>
                                                        <p className="text-sm font-black text-primary">{formatPrice(s.price)}</p>
                                                    </div>
                                                    <Link href={`/shop/${s.id}`}><ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-primary" /></Link>
                                                </div>
                                            ))}
                                            <Button onClick={() => handleAddAll(m.suggestions!)} className="w-full h-12 rounded-2xl bg-indigo-50 text-indigo-600 font-black uppercase text-[10px] tracking-widest border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                                                <ShoppingBag size={14} className="mr-2" /> Add Bundle to Bag
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                        {isLoading && <div className="flex justify-start"><div className="bg-white p-5 rounded-[2rem] rounded-bl-sm border border-slate-100 shadow-sm"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div></div>}
                    </div>

                    <form onSubmit={handleAsk} className="shrink-0 p-4 sm:p-5 bg-white border-t border-slate-50">
                        <div className="relative">
                            <Input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Type mission query..."
                                className="h-16 rounded-[1.5rem] bg-slate-50 border-slate-100 pr-16 font-bold text-sm text-foreground focus:ring-4 focus:ring-primary/5 transition-all"
                            />
                            <Button
                                type="submit"
                                disabled={!query.trim() || isLoading}
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-12 w-12 rounded-xl bg-primary text-white p-0 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20"
                            >
                                <Send className="h-5 w-5" />
                            </Button>
                        </div>
                    </form>
                    </Card>
                </div>
            )}
        </>
    );
}
