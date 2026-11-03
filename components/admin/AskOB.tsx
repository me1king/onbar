'use client';

import * as React from 'react';
import {
    Sparkles,
    Send,
    Loader2,
    X,
    Bot,
    TrendingUp,
    Users,
    Package,
    DollarSign,
    Mic,
    MicOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn, formatPrice } from '@/lib/utils';

type AskObIntent = 'top_customers' | 'revenue' | 'low_stock' | 'orders';
type AskObResponse = {
    intent: AskObIntent;
    count?: number;
    products?: Array<{ id: number; name: string; stock: number }>;
    truncated?: boolean;
    customers?: Array<{ name: string; total: number }>;
    sampleSize?: number;
    total?: number;
    complete?: boolean;
    error?: string;
};

function getAskObIntent(query: string): AskObIntent | null {
    const normalized = query.toLowerCase();
    if (normalized.includes('best customer') || normalized.includes('top customer')) return 'top_customers';
    if (normalized.includes('profit') || normalized.includes('revenue')) return 'revenue';
    if (normalized.includes('stock') || normalized.includes('inventory')) return 'low_stock';
    if (normalized.includes('orders') || normalized.includes('sales')) return 'orders';
    return null;
}

export default function AskOB() {
    const [isOpen, setIsOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [messages, setMessages] = React.useState<{ role: 'user' | 'assistant', text: string | React.ReactNode }[]>([]);
    const [isListening, setIsListening] = React.useState(false);

    const scrollRef = React.useRef<HTMLDivElement>(null);

    const startVoiceCommand = () => {
        // @ts-expect-error - SpeechRecognition is experimental
        const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
        if (!SpeechRecognition) {
            alert("Voice Protocol not supported in this browser.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (event: { results: { transcript: string }[][] }) => {
            const transcript = event.results[0][0].transcript;
            setQuery(transcript);
            // Auto-submit after voice
            setTimeout(() => {
                const fakeEvent = { preventDefault: () => {} } as unknown as React.FormEvent;
                handleAsk(fakeEvent, transcript);
            }, 500);
        };
        recognition.start();
    };

    React.useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleAsk = async (e: React.FormEvent, voiceQuery?: string) => {
        e.preventDefault();
        const textToAsk = voiceQuery || query;
        if (!textToAsk.trim() || isLoading) return;

        const userQuery = textToAsk.trim();
        setMessages(prev => [...prev, { role: 'user', text: userQuery }]);
        setQuery('');
        setIsLoading(true);
        const controller = new AbortController();
        let timeoutId: number | undefined;

        try {
            const timeout = new Promise<never>((_, reject) => {
                timeoutId = window.setTimeout(() => {
                    controller.abort();
                    reject(new Error('The operations request timed out. Check your connection and retry.'));
                }, 10_000);
            });
            const response = await Promise.race([
                processQuery(userQuery, controller.signal),
                timeout
            ]);
            setMessages(prev => [...prev, { role: 'assistant', text: response }]);
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : 'The operations data could not be loaded. Please retry.';
            setMessages(prev => [...prev, { role: 'assistant', text: message }]);
        } finally {
            if (timeoutId !== undefined) window.clearTimeout(timeoutId);
            controller.abort();
            setIsLoading(false);
        }
    };

    const processQuery = async (q: string, signal: AbortSignal): Promise<string | React.ReactNode> => {
        const intent = getAskObIntent(q);
        if (!intent) {
            return "I can report low stock, order counts, delivered revenue, or top customers. Choose one of those topics.";
        }

        const response = await fetch('/api/admin/ask-ob', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ intent }),
            signal,
            cache: 'no-store'
        });
        const result = await response.json() as AskObResponse & { error?: string };
        if (!response.ok) throw new Error(result.error || 'The operations data could not be loaded. Please retry.');

        if (result.intent === 'low_stock') {
            const products = result.products || [];
            return (
                <div className="space-y-2">
                    <p className="font-bold text-xs uppercase">
                        {result.count || 0} products have stock at or below 5
                        {result.truncated ? ' (showing the first 10)' : ''}:
                    </p>
                    {products.map(product => (
                        <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 shadow-sm">
                            <span className="truncate text-[10px] font-black text-foreground">{product.name}</span>
                            <span className="shrink-0 text-[10px] font-black text-primary">{product.stock} left</span>
                        </div>
                    ))}
                    {products.length === 0 && <p className="text-xs">No products currently meet this threshold.</p>}
                </div>
            );
        }

        if (result.intent === 'top_customers') {
            const customers = result.customers || [];
            return (
                <div className="space-y-2">
                    <p className="font-bold text-xs uppercase">Highest spend in the latest {result.sampleSize || 0} delivered orders:</p>
                    {customers.map((customer, index) => (
                        <div key={customer.name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 shadow-sm">
                            <span className="truncate text-[10px] font-black text-foreground">{index + 1}. {customer.name}</span>
                            <span className="shrink-0 text-[10px] font-black text-primary">{formatPrice(customer.total)}</span>
                        </div>
                    ))}
                    {customers.length === 0 && <p className="text-xs">No delivered customer orders were found in this sample.</p>}
                </div>
            );
        }

        if (result.intent === 'revenue') {
            if (result.complete === false) {
                return `Recognized delivered gross revenue is at least ${formatPrice(result.total || 0)}; this report reached its 10,000-entry limit.`;
            }
            return `Recognized delivered gross revenue in the financial ledger is ${formatPrice(result.total || 0)}. This is not net profit and excludes unrecorded fees and taxes.`;
        }

        return `There are ${result.count || 0} orders recorded in the system.`;
    };

    return (
        <div className="fixed bottom-4 right-4 z-[200] sm:bottom-10 sm:right-10">
            {!isOpen ? (
                <Button
                    onClick={() => setIsOpen(true)}
                    className="h-16 w-16 rounded-full bg-primary text-white shadow-2xl shadow-primary/40 hover:scale-110 active:scale-95 transition-all p-0 flex items-center justify-center animate-bounce"
                >
                    <Sparkles className="h-8 w-8" />
                </Button>
            ) : (
                <Card className="h-[min(600px,calc(100dvh-2rem))] w-[min(400px,calc(100vw-2rem))] rounded-[2rem] border border-slate-100 bg-white shadow-[0_30px_100px_-15px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 sm:rounded-[3rem]">
                    {/* Header */}
                    <div className="relative flex items-center justify-between overflow-hidden bg-primary p-5 text-white shadow-lg sm:p-8">
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/20">
                                <Bot className="h-6 w-6" />
                            </div>
                            <div className="text-left">
                                <h3 className="text-xl font-black uppercase tracking-tighter">Ask OB</h3>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Operations Intelligence</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors relative z-10"
                        >
                            <X size={24} />
                        </button>
                        <Sparkles className="absolute -bottom-10 -right-10 h-48 w-48 text-white/5 -rotate-12 z-0" />
                    </div>

                    {/* Chat Area */}
                    <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto bg-slate-50/50 p-4 no-scrollbar sm:p-8">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center space-y-8 py-10">
                                <div className="h-24 w-24 rounded-[2.5rem] bg-white flex items-center justify-center shadow-inner">
                                    <Sparkles className="h-10 w-10 text-primary animate-pulse" />
                                </div>
                                <div className="space-y-3">
                                    <h4 className="text-xl font-black text-foreground uppercase tracking-tight">Mission Briefing</h4>
                                    <p className="text-xs text-slate-400 font-medium leading-relaxed italic px-10">
                                        &quot;I am your operational co-pilot. Ask me anything about your revenue, customers, or logistics status.&quot;
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 w-full px-4">
                                    {[
                                        { label: 'Top Customers', icon: Users },
                                        { label: 'Total Revenue', icon: DollarSign },
                                        { label: 'Low Stock', icon: Package },
                                        { label: 'Profit Analysis', icon: TrendingUp },
                                    ].map(suggest => (
                                        <button
                                            key={suggest.label}
                                            onClick={() => setQuery(suggest.label)}
                                            className="p-4 rounded-2xl bg-white border border-slate-100 text-[9px] font-black uppercase text-slate-500 hover:border-primary hover:text-primary transition-all shadow-sm flex items-center gap-2"
                                        >
                                            <suggest.icon size={12} />
                                            {suggest.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            messages.map((m, idx) => (
                                <div key={idx} className={cn(
                                    "flex",
                                    m.role === 'user' ? "justify-end" : "justify-start"
                                )}>
                                    <div className={cn(
                                        "max-w-[85%] p-5 rounded-[1.8rem] text-sm shadow-sm transition-all",
                                        m.role === 'user'
                                            ? "bg-primary text-white rounded-br-sm"
                                            : "bg-white text-slate-700 border border-slate-100 rounded-bl-sm font-medium leading-relaxed italic"
                                    )}>
                                        {m.text}
                                    </div>
                                </div>
                            ))
                        )}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white p-5 rounded-[1.8rem] rounded-bl-sm border border-slate-100 shadow-sm">
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <form onSubmit={handleAsk} className="border-t border-slate-50 bg-white p-4 sm:p-6">
                        <div className="relative flex gap-2">
                            <div className="relative flex-1">
                                <Input
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder={isListening ? "Listening..." : "Type mission query..."}
                                    className={cn(
                                        "h-16 rounded-2xl bg-slate-50 border-slate-100 pr-16 font-bold text-sm text-foreground focus:ring-4 focus:ring-primary/5 transition-all",
                                        isListening && "animate-pulse border-primary/50 ring-4 ring-primary/5"
                                    )}
                                />
                                <Button
                                    type="submit"
                                    disabled={!query.trim() || isLoading}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-12 w-12 rounded-xl bg-primary text-white p-0 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20"
                                >
                                    <Send className="h-5 w-5" />
                                </Button>
                            </div>
                            <Button
                                type="button"
                                onClick={startVoiceCommand}
                                className={cn(
                                    "h-16 w-16 rounded-2xl transition-all shadow-xl flex items-center justify-center p-0",
                                    isListening ? "bg-rose-500 text-white animate-pulse" : "bg-slate-50 text-slate-400 hover:text-primary border border-slate-100"
                                )}
                            >
                                {isListening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                            </Button>
                        </div>
                    </form>
                </Card>
            )}
        </div>
    );
}
