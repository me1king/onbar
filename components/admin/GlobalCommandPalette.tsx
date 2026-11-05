'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, ShoppingBag, Truck, Users, Package, ArrowRight, X, Loader2, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { formatPrice, cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface CommandPaletteProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    pages: NavigationPage[];
}

interface NavigationPage {
    name: string;
    href: string;
    group: string;
}

interface SearchResult {
    id: string | number;
    title: string;
    subtitle: string;
    type: 'order' | 'product' | 'customer' | 'rider' | 'action' | 'page';
    url: string;
    image?: string;
    meta?: string;
}

const STATIC_ACTIONS: SearchResult[] = [
    { id: 'act-1', title: 'Add Inventory', subtitle: 'Global Cellar Hub', type: 'action', url: '/lord/upload' },
    { id: 'act-2', title: 'Dispatch Runner', subtitle: 'Logistics Deployment', type: 'action', url: '/lord/dispatch' },
    { id: 'act-3', title: 'Create Coupon', subtitle: 'Marketing Promotions', type: 'action', url: '/lord/coupons' },
    { id: 'act-4', title: 'Financial Audit', subtitle: 'Finance Vault', type: 'action', url: '/lord/finance' },
    { id: 'act-5', title: 'Staff Control', subtitle: 'Identity Grid', type: 'action', url: '/lord/staff' },
    { id: 'act-6', title: 'Security Scan', subtitle: 'Threat Analysis', type: 'action', url: '/lord/security' },
];

const PAGE_SEARCH_ALIASES: Record<string, string> = {
    '/lord/leads': 'lead leads acquisition prospects campaigns traffic sources',
    '/lord/demand': 'location map areas zones coverage demand',
    '/lord/operations': 'customer location map delivery operations control',
    '/lord/waitlist': 'leads lead locations launch early access customers',
    '/lord/customers': 'customer customers patrons directory profiles'
};

function matchesPage(page: NavigationPage, query: string) {
    const searchableText = [
        page.name,
        page.href,
        page.group,
        PAGE_SEARCH_ALIASES[page.href] || ''
    ].join(' ').toLowerCase();
    const ignoredTerms = new Set(['page', 'pages', 'go', 'find', 'open', 'the']);
    const terms = query.toLowerCase().trim().split(/\s+/).filter(term => !ignoredTerms.has(term));
    return terms.every(term => searchableText.includes(term));
}

export default function GlobalCommandPalette({ isOpen, setIsOpen, pages }: CommandPaletteProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
            setQuery('');
            setResults([]);
        }
    }, [isOpen]);

    useEffect(() => {
        if (query.length < 2) {
            const quickPages = pages.slice(0, 6).map(page => ({
                id: `page-${page.href}`,
                title: page.name,
                subtitle: page.group,
                type: 'page' as const,
                url: page.href
            }));
            setResults([...quickPages, ...STATIC_ACTIONS]);
            setActiveIndex(0);
            return;
        }

        const controller = new AbortController();
        let active = true;
        const delayDebounceFn = setTimeout(async () => {
            setLoading(true);
            const timeoutId = window.setTimeout(() => controller.abort(), 5000);
            const pageResults: SearchResult[] = pages
                .filter(page => matchesPage(page, query))
                .slice(0, 8)
                .map(page => ({
                    id: `page-${page.href}`,
                    title: page.name,
                    subtitle: `${page.group} · Open page`,
                    type: 'page',
                    url: page.href
                }));
            try {
                const entityResults: SearchResult[] = [];
                if (supabase) {
                    const [orders, products, ridersResponse] = await Promise.all([
                        supabase.from('orders').select('id, customer_name, total_price')
                            .ilike('customer_name', `%${query}%`).order('created_at', { ascending: false }).limit(3)
                            .abortSignal(controller.signal),
                        supabase.from('products').select('id, name, price, image_url')
                            .ilike('name', `%${query}%`).limit(3).abortSignal(controller.signal),
                        fetch(`/api/admin/dispatch/riders?q=${encodeURIComponent(query)}`, {
                            cache: 'no-store',
                            signal: controller.signal
                        })
                    ]);
                    if (orders.error) console.error('[AdminSearch] Could not search orders:', orders.error);
                    if (products.error) console.error('[AdminSearch] Could not search products:', products.error);
                    if (!ridersResponse.ok) {
                        console.error('[AdminSearch] Could not search riders:', ridersResponse.status);
                    } else {
                        const riders = await ridersResponse.json() as { riders?: { rider_name: string; rider_phone: string }[] };
                        riders.riders?.forEach(rider => entityResults.push({
                            id: rider.rider_phone,
                            title: rider.rider_name,
                            subtitle: 'Delivery Fleet',
                            type: 'rider',
                            url: '/lord/dispatch',
                            meta: rider.rider_phone
                        }));
                    }

                    products.data?.forEach(product => entityResults.push({
                        id: product.id,
                        title: product.name,
                        subtitle: 'Product Inventory',
                        type: 'product',
                        url: `/lord/upload?edit=${product.id}`,
                        image: product.image_url,
                        meta: formatPrice(product.price)
                    }));

                    orders.data?.forEach(order => entityResults.push({
                        id: order.id,
                        title: `Order #${order.id}`,
                        subtitle: order.customer_name || 'Customer not recorded',
                        type: 'order',
                        url: '/lord/orders',
                        meta: formatPrice(order.total_price)
                    }));
                }

                if (active) {
                    setResults([...pageResults, ...entityResults]);
                    setActiveIndex(0);
                }
            } catch (err) {
                if (active) {
                    if (!controller.signal.aborted) {
                        console.error('[AdminSearch] Search failed:', err);
                    }
                    setResults(pageResults);
                    setActiveIndex(0);
                }
            } finally {
                window.clearTimeout(timeoutId);
                if (active) setLoading(false);
            }
        }, 300);

        return () => {
            active = false;
            clearTimeout(delayDebounceFn);
            controller.abort();
        };
    }, [query, pages]);

    const handleSelect = (result: SearchResult) => {
        router.push(result.url);
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => results.length ? (prev + 1) % results.length : 0);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => results.length ? (prev - 1 + results.length) % results.length : 0);
        } else if (e.key === 'Enter' && results[activeIndex]) {
            handleSelect(results[activeIndex]);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4 bg-background/50 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="max-w-2xl w-full bg-card rounded-[2.5rem] shadow-2xl border border-border overflow-hidden animate-in slide-in-from-top-4 duration-500">

                <div className="p-6 border-b border-border flex items-center gap-4">
                    <Search className="h-5 w-5 text-muted-foreground" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search pages, leads, orders, products, riders..."
                        className="flex-1 bg-transparent border-none outline-none text-sm font-black uppercase tracking-widest text-foreground placeholder:text-muted"
                    />
                    <div className="flex items-center gap-2">
                        {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                        <button onClick={() => setIsOpen(false)} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="max-h-[400px] overflow-y-auto p-4 no-scrollbar">
                    {results.length === 0 ? (
                        <div className="py-12 text-center space-y-4">
                            <Zap className="h-10 w-10 text-secondary mx-auto" />
                            <p className="text-[10px] font-black uppercase text-muted tracking-[0.3em]">
                                {query.length < 2 ? "Awaiting Tactical Query..." : "No matches found in grid."}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {results.map((result, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleSelect(result)}
                                    onMouseEnter={() => setActiveIndex(idx)}
                                    className={cn(
                                        "w-full flex items-center gap-6 p-4 rounded-[1.8rem] transition-all text-left group",
                                        activeIndex === idx ? "bg-primary text-primary-foreground shadow-xl shadow-primary/20 scale-[1.02]" : "hover:bg-secondary"
                                    )}
                                >
                                    <div className={cn(
                                        "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-sm",
                                        activeIndex === idx
                                            ? "bg-background/20 border-background/20 text-primary-foreground"
                                            : "bg-background border-border text-slate-500"
                                    )}>
                                        {result.type === 'order' ? <ShoppingBag className="h-5 w-5" /> :
                                         result.type === 'rider' ? <Truck className="h-5 w-5" /> :
                                         result.type === 'action' ? <Zap className="h-5 w-5" /> :
                                         result.type === 'page' ? <Search className="h-5 w-5" /> :
                                         result.type === 'product' ? (
                                             result.image ? <div className="h-8 w-8 relative"><Image src={result.image} fill className="object-contain" alt={result.title || ""} /></div> : <Package className="h-5 w-5" />
                                         ) : <Users className="h-5 w-5" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn(
                                            "text-[11px] font-black uppercase tracking-tight truncate",
                                            activeIndex === idx ? "text-primary-foreground" : "text-slate-700"
                                        )}>{result.title}</p>
                                        <p className={cn(
                                            "text-[8px] font-black uppercase tracking-widest mt-1",
                                            activeIndex === idx ? "text-primary-foreground/70" : "text-slate-500"
                                        )}>{result.subtitle}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        {result.meta && (
                                            <p className={cn(
                                                "text-[10px] font-black",
                                                activeIndex === idx ? "text-primary-foreground" : "text-slate-700"
                                            )}>{result.meta}</p>
                                        )}
                                        <ArrowRight className={cn(
                                            "h-4 w-4 ml-auto mt-1 transition-transform group-hover:translate-x-1",
                                            activeIndex === idx ? "text-primary-foreground" : "text-slate-400"
                                        )} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {results.length > 0 && (
                    <div className="p-4 bg-secondary border-t border-border flex justify-between items-center text-[8px] font-black uppercase text-muted-foreground tracking-widest px-8">
                        <span>↑↓ Navigate</span>
                        <span>Enter Select</span>
                        <span>Esc Close</span>
                    </div>
                )}
            </div>
        </div>
    );
}
