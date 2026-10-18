'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Clock, RefreshCcw, Search, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatPrice, cn } from '@/lib/utils';

interface CartSession {
    id: string;
    cart_value: number;
    last_active_at: string;
    current_page: string | null;
}

export default function AbandonedCartEngine() {
    const [carts, setCarts] = React.useState<CartSession[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);

    const fetchCarts = React.useCallback(async () => {
        if (!supabase) {
            setError('Supabase is not configured. Saved cart activity is unavailable.');
            setCarts([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { data, error: queryError } = await supabase
                .from('customer_sessions')
                .select('id, cart_value, last_seen_at, current_page')
                .gt('cart_value', 0)
                .order('last_seen_at', { ascending: false })
                .limit(100);

            if (queryError) throw queryError;
            setCarts((data || []).flatMap(session => {
                const cartValue = Number(session.cart_value);
                if (
                    typeof session.id !== 'string' ||
                    typeof session.last_seen_at !== 'string' ||
                    !Number.isFinite(Date.parse(session.last_seen_at)) ||
                    !Number.isFinite(cartValue) ||
                    cartValue <= 0
                ) return [];
                return [{
                    id: session.id,
                    cart_value: cartValue,
                    last_active_at: session.last_seen_at,
                    current_page: typeof session.current_page === 'string' ? session.current_page : null
                }];
            }));
        } catch (fetchError) {
            console.error('Saved cart activity could not be loaded:', fetchError);
            setCarts([]);
            setError(fetchError instanceof Error ? fetchError.message : 'Unable to load saved cart activity.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        void fetchCarts();
    }, [fetchCarts]);

    const displayedCarts = carts.filter(session =>
        session.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (session.current_page || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
    const displayedCartValue = displayedCarts.reduce((total, session) => total + session.cart_value, 0);
    const averageCartValue = displayedCarts.length ? displayedCartValue / displayedCarts.length : 0;

    return (
        <div className="min-h-screen space-y-8 bg-background p-4 pb-40 text-left sm:p-8">
            <header className="flex flex-col items-start justify-between gap-5 border-b border-border pb-6 sm:flex-row sm:items-end">
                <div>
                    <div className="mb-2 flex items-center gap-3">
                        <ShoppingBag className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Saved cart activity</span>
                    </div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter text-foreground sm:text-4xl">Cart sessions</h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                        Shows up to 100 recent sessions with a saved cart value. These records do not confirm abandonment, list cart items, or include contact details.
                    </p>
                </div>
                <Button onClick={() => void fetchCarts()} disabled={loading} variant="outline" className="w-full sm:w-auto">
                    <RefreshCcw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh sessions
                </Button>
            </header>

            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="min-w-0 space-y-2 p-5 sm:p-6">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Loaded sessions (maximum 100)</p>
                    <p className="text-2xl font-black text-foreground">{loading ? 'Loading' : carts.length.toLocaleString()}</p>
                </Card>
                <Card className="min-w-0 space-y-2 p-5 sm:p-6">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Cart value in loaded sessions</p>
                    <p className="break-words text-2xl font-black text-foreground">{loading ? 'Loading' : formatPrice(displayedCartValue)}</p>
                </Card>
                <Card className="min-w-0 space-y-2 p-5 sm:p-6">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Contact / recovery messages</p>
                    <p className="text-xl font-black text-foreground">Not connected</p>
                </Card>
            </div>

            <Card className="overflow-hidden">
                <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-foreground">Recorded cart values</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Average value among the currently shown sessions: {formatPrice(averageCartValue)}.
                        </p>
                    </div>
                    <div className="relative w-full sm:max-w-sm">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={event => setSearchQuery(event.target.value)}
                            placeholder="Search session ID or page"
                            aria-label="Search session ID or page"
                            className="pl-10"
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left">
                        <thead>
                            <tr className="bg-secondary text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                                <th className="px-5 py-4">Session</th>
                                <th className="px-5 py-4">Last activity</th>
                                <th className="px-5 py-4">Last page</th>
                                <th className="px-5 py-4 text-right">Recorded cart value</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                <tr><td colSpan={4} className="p-12 text-center text-sm text-muted-foreground">Loading saved sessions…</td></tr>
                            ) : displayedCarts.length === 0 ? (
                                <tr><td colSpan={4} className="p-12 text-center text-sm text-muted-foreground">
                                    {error ? 'Cart sessions could not be loaded.' : 'No saved cart sessions match this search.'}
                                </td></tr>
                            ) : displayedCarts.map(session => (
                                <tr key={session.id} className="hover:bg-secondary/50">
                                    <td className="px-5 py-4 font-mono text-xs text-foreground">{session.id}</td>
                                    <td className="px-5 py-4 text-xs text-foreground">
                                        <span className="inline-flex items-center gap-2">
                                            <Clock className="h-3 w-3 text-muted-foreground" />
                                            {new Date(session.last_active_at).toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="max-w-xs truncate px-5 py-4 text-xs text-muted-foreground" title={session.current_page || undefined}>
                                        {session.current_page || 'Unavailable'}
                                    </td>
                                    <td className="px-5 py-4 text-right text-sm font-bold text-foreground">{formatPrice(session.cart_value)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
                Recovery outreach is disabled because the saved session data has no cart item list or confirmed contact channel, and no messaging provider is connected.
            </p>
        </div>
    );
}
