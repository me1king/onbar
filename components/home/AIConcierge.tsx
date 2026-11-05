'use client';

import * as React from 'react';
import {
    CircleUserRound,
    Headphones,
    Loader2,
    Send,
    ShieldCheck,
    ShoppingBag,
    Trash2,
    X,
    ChevronRight
} from 'lucide-react';
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
    category: string;
    stock: number;
}

interface ConciergeMessage {
    role: 'user' | 'assistant';
    text: string;
    suggestions?: Suggestion[];
    chips?: string[];
    action?: 'none' | 'support';
}

interface ConciergeResponse {
    response?: string;
    recommendations?: Suggestion[];
    chips?: string[];
    scenario?: { name: string; action: 'none' | 'support' } | null;
    action?: 'none' | 'support';
    ageNotice?: string;
    unmatchedLogged?: boolean;
    scenarioStorageReady?: boolean;
    error?: string;
}

const CONVERSATION_KEY = 'apex-concierge-conversation';

export default function AIConcierge({ suppressLauncher = false }: { suppressLauncher?: boolean }) {
    const pathname = usePathname();
    const { settings } = useSettings();
    const [isOpen, setIsOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [messages, setMessages] = React.useState<ConciergeMessage[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [ageConfirmed, setAgeConfirmed] = React.useState(false);
    const [logUnmatched, setLogUnmatched] = React.useState(false);
    const [statusMessage, setStatusMessage] = React.useState('');
    const [conversationLoaded, setConversationLoaded] = React.useState(false);
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

    React.useEffect(() => {
        try {
            const stored: unknown = JSON.parse(localStorage.getItem(CONVERSATION_KEY) || '[]');
            if (Array.isArray(stored)) {
                setMessages(stored.filter((message): message is ConciergeMessage =>
                    typeof message === 'object'
                    && message !== null
                    && 'role' in message
                    && (message.role === 'user' || message.role === 'assistant')
                    && 'text' in message
                    && typeof message.text === 'string'
                ).slice(-40));
            }
        } catch (error) {
            console.warn('[AIConcierge] Saved conversation could not be restored:', error);
        } finally {
            setConversationLoaded(true);
        }
    }, []);

    React.useEffect(() => {
        if (!conversationLoaded) return;
        try {
            localStorage.setItem(CONVERSATION_KEY, JSON.stringify(messages.slice(-40)));
        } catch (error) {
            console.warn('[AIConcierge] Conversation could not be saved on this device:', error);
        }
    }, [conversationLoaded, messages]);

    // Disable logic based on Admin settings
    if (settings?.features?.ai_concierge_enabled === false) return null;

    const handleAsk = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim() || isLoading) return;

        const userMsg = query.trim().slice(0, 500);
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setQuery('');
        setIsLoading(true);
        setStatusMessage('Checking what is currently in stock…');

        trackClick('ai-concierge-msg', 'AI Concierge Message', { query: userMsg, msg_count: messages.length + 1 });

        try {
            const response = await fetch('/api/concierge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMsg, ageConfirmed, logUnmatched }),
                cache: 'no-store'
            });
            const result = await response.json() as ConciergeResponse;
            if (!response.ok) throw new Error(result.error || 'The concierge could not check the live catalog.');
            setMessages(prev => [...prev, {
                role: 'assistant',
                text: result.response || 'I could not find a matching reply.',
                suggestions: result.recommendations || [],
                chips: result.chips || [],
                action: result.action || result.scenario?.action || 'none'
            }]);
            const notices = [result.ageNotice];
            if (logUnmatched && !result.scenario && !result.unmatchedLogged) {
                notices.push(result.scenarioStorageReady === false
                    ? 'Your question was not saved because the reply library is not installed yet.'
                    : 'Your question was not saved for review.');
            } else if (result.unmatchedLogged) {
                notices.push('Your question was saved for reply review after basic contact-detail redaction.');
            }
            setStatusMessage(notices.filter(Boolean).join(' '));
        } catch (error) {
            console.error('[AIConcierge] Could not prepare recommendations:', error);
            setStatusMessage('');
            setMessages(prev => [...prev, {
                role: 'assistant',
                text: error instanceof Error ? error.message : 'I could not reach the live catalog just now. Please try again.'
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
            category: i.category,
            quantity: 1
        }));
        addBundleToCart(cartItems);
        setMessages(prev => [...prev, { role: 'assistant', text: 'Added to your bag. Delivery options and the final total are confirmed at checkout.' }]);
    };

    const clearConversation = () => {
        setMessages([]);
        setStatusMessage('');
        try {
            localStorage.removeItem(CONVERSATION_KEY);
        } catch (error) {
            console.warn('[AIConcierge] Could not clear the saved conversation:', error);
        }
    };

    const supportNumber = settings.contact.whatsapp.replace(/\D/g, '');

    if (pathname === '/affiliate/agreement') return null;

    return (
        <>
            {!isOpen ? (
                suppressLauncher ? null : (
                <div className="fixed left-3 sm:left-8 bottom-[calc(6rem+env(safe-area-inset-bottom))] lg:bottom-28 z-[2100]">
                    <button
                        onClick={() => setIsOpen(true)}
                        aria-label="Open your night concierge"
                        className="relative flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-amber-500 text-slate-950 shadow-xl shadow-amber-900/20 transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2 active:scale-95 sm:h-14 sm:w-14"
                    >
                        <span className="text-sm font-black tracking-tighter">A</span>
                        <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
                    </button>
                </div>
                )
            ) : (
                <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/45 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-5">
                    <button
                        type="button"
                        aria-label="Close night concierge"
                        onClick={() => setIsOpen(false)}
                        className="absolute inset-0 h-full w-full cursor-default"
                    />
                    <Card
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="ai-concierge-title"
                        onClick={event => event.stopPropagation()}
                        className="relative z-10 flex h-[min(760px,88dvh)] w-full max-w-[440px] flex-col overflow-hidden rounded-t-[2rem] border border-slate-200 bg-white text-left shadow-[0_30px_100px_-15px_rgba(0,0,0,0.35)] animate-in slide-in-from-bottom-4 duration-200 motion-reduce:animate-none sm:h-[min(700px,calc(100dvh-2.5rem))] sm:rounded-[2rem]"
                    >
                    <div className="shrink-0 border-b border-slate-200 bg-white px-5 pb-4 pt-3 sm:px-6 sm:pt-5">
                        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-amber-400">A</span>
                                <div className="min-w-0">
                                    <h3 id="ai-concierge-title" className="truncate text-base font-black tracking-tight text-slate-950">Your night concierge</h3>
                                    <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Online · live catalog + saved replies</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {messages.length > 0 && <button type="button" onClick={clearConversation} aria-label="Delete this conversation" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"><Trash2 size={17} /></button>}
                                <button type="button" onClick={() => setIsOpen(false)} aria-label="Close night concierge" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"><X size={20} /></button>
                            </div>
                        </div>
                    </div>

                    <div ref={scrollRef} aria-live="polite" aria-relevant="additions text" className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-slate-50/70 p-4 sm:p-5">
                        {messages.length === 0 ? (
                            <div className="flex min-h-full flex-col justify-center gap-6 py-6">
                                <div className="space-y-2 px-2 text-center">
                                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-lg font-black text-amber-400">A</div>
                                    <h4 className="pt-2 text-2xl font-black tracking-tight text-slate-950">What’s the plan tonight?</h4>
                                    <p className="mx-auto max-w-xs text-sm leading-6 text-slate-700">Tell me the occasion, how many people, and your budget. I’ll check the live catalog and help you choose.</p>
                                    <p className="text-xs text-slate-500">Online Bar AI assistant · prices and stock come from the live catalog.</p>
                                </div>
                                <div className="grid gap-2 px-1">
                                    {['House party for 10', 'Something for two, KES 3,000', 'Under KES 5,000', 'No alcohol, add snacks'].map(option => (
                                        <button key={option} type="button" onClick={() => setQuery(option)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:border-amber-500 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            messages.map((message, index) => (
                                <div key={`${index}-${message.role}`} className={cn('flex flex-col gap-3', message.role === 'user' ? 'items-end' : 'items-start')}>
                                    <div className={cn(
                                        'max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm',
                                        message.role === 'user'
                                            ? 'rounded-br-md bg-slate-950 text-white'
                                            : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                                    )}>
                                        {message.text}
                                    </div>
                                    {message.suggestions && message.suggestions.length > 0 && (
                                        <div className="w-full space-y-2">
                                            {message.suggestions.map(product => (
                                                <article key={product.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-50">
                                                        <Image src={normalizeImage(product.image_url)} alt="" width={56} height={56} className="h-full w-full object-contain" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-bold text-slate-950">{product.name}</p>
                                                        <p className="mt-0.5 text-sm font-black text-amber-700">{formatPrice(product.price)}</p>
                                                        <p className="mt-0.5 text-[11px] text-slate-500">{product.category} · in stock</p>
                                                    </div>
                                                    <Link href={`/shop/${product.id}`} aria-label={`View ${product.name}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"><ChevronRight size={19} /></Link>
                                                </article>
                                            ))}
                                            <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs">
                                                <span className="font-semibold text-slate-700">Lowest listed price</span>
                                                <span className="font-black text-slate-950">{formatPrice(Math.min(...message.suggestions.map(product => product.price)))}</span>
                                            </div>
                                            <button type="button" onClick={() => handleAddAll(message.suggestions!)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700">
                                                <ShoppingBag size={16} /> Add these picks to my bag
                                            </button>
                                        </div>
                                    )}
                                    {message.action === 'support' && (
                                        <a href={supportNumber ? `https://wa.me/${supportNumber}?text=${encodeURIComponent('Hi Online Bar, I need help from the concierge. ')}` : '/contact'} target={supportNumber ? '_blank' : undefined} rel={supportNumber ? 'noopener noreferrer' : undefined} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">
                                            <Headphones size={16} /> Talk to a person
                                        </a>
                                    )}
                                    {message.chips && message.chips.length > 0 && (
                                        <div className="flex max-w-full flex-wrap gap-2">
                                            {message.chips.slice(0, 4).map(chip => (
                                                <button key={chip} type="button" onClick={() => setQuery(chip)} className="min-h-10 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-amber-500 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">{chip}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                        {isLoading && <div role="status" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700"><Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-700" />{statusMessage || 'One moment, I’m checking…'}</div>}
                        {statusMessage && !isLoading && <p role="status" className="text-xs text-slate-600">{statusMessage}</p>}
                    </div>

                    <form onSubmit={handleAsk} className="shrink-0 space-y-3 border-t border-slate-200 bg-white p-4 sm:p-5">
                        <label className="flex items-start gap-2 text-xs leading-5 text-slate-700">
                            <input type="checkbox" checked={ageConfirmed} onChange={event => setAgeConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600" />
                            <span><ShieldCheck size={14} className="mr-1 inline text-slate-600" />I self-confirm I am at least 18. This is not ID verification; ID may be checked at delivery.</span>
                        </label>
                        <label className="flex items-start gap-2 text-[11px] leading-4 text-slate-600">
                            <input type="checkbox" checked={logUnmatched} onChange={event => setLogUnmatched(event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600" />
                            <span>Share unmatched questions to improve replies. We redact common phone/email formats; avoid personal or payment details.</span>
                        </label>
                        <div className="flex gap-2">
                            <textarea
                                value={query}
                                onChange={event => setQuery(event.target.value.slice(0, 500))}
                                onKeyDown={event => {
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                        event.preventDefault();
                                        event.currentTarget.form?.requestSubmit();
                                    }
                                }}
                                maxLength={500}
                                rows={2}
                                aria-label="Message the Online Bar concierge"
                                placeholder="Tell me the occasion, guests, or budget…"
                                className="min-h-12 min-w-0 flex-1 resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-950 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                            />
                            <button
                                type="submit"
                                disabled={!query.trim() || isLoading}
                                aria-label="Send message"
                                className="inline-flex h-12 w-12 shrink-0 items-center justify-center self-end rounded-xl bg-amber-500 text-slate-950 shadow-sm transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
                            >
                                <Send size={19} />
                            </button>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                            <span><CircleUserRound size={12} className="mr-1 inline" />Conversation saved on this device · use the bin to delete</span>
                            <span>{query.length}/500</span>
                        </div>
                    </form>
                    </Card>
                </div>
            )}
        </>
    );
}
