'use client';

import { useEffect, useState } from 'react';
import { ShoppingBag, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface Sale {
    item: string;
    time: string;
}

export default function SalesPopup() {
    const [currentSale, setCurrentSale] = useState<Sale | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (!supabase) return;
        const client = supabase;

        let showTimer: ReturnType<typeof setTimeout> | undefined;
        let hideTimer: ReturnType<typeof setTimeout> | undefined;

        const showSale = (sale: Sale, delay = 0) => {
            if (showTimer) clearTimeout(showTimer);
            if (hideTimer) clearTimeout(hideTimer);
            showTimer = setTimeout(() => {
                setCurrentSale(sale);
                setIsVisible(true);
                hideTimer = setTimeout(() => setIsVisible(false), 6000);
            }, delay);
        };

        const loadSale = async (order: { product_id: number | null; created_at: string }) => {
            if (order.product_id === null) return;
            const { data: product, error } = await client
                .from('products')
                .select('name')
                .eq('id', order.product_id)
                .maybeSingle();
            if (error) {
                console.error('Unable to load product for paid-order popup:', error);
                return;
            }
            if (!product?.name) return;
            showSale({
                item: product.name,
                time: getTimeAgo(order.created_at)
            });
        };

        const fetchLatestPaidOrder = async () => {
            const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data, error } = await client
                .from('orders')
                .select('product_id, created_at')
                .in('status', ['Paid', 'Delivered'])
                .gte('created_at', recentCutoff)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) {
                console.error('Unable to load recent paid orders for popup:', error);
                return;
            }
            if (data) await loadSale(data);
        };

        const channel = client
            .channel('realtime-paid-sales-popup')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
                const order = payload.new as { product_id?: number | null; created_at?: string; status?: string };
                if (
                    (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') &&
                    order.product_id !== undefined &&
                    order.created_at &&
                    ['paid', 'delivered'].includes((order.status || '').toLowerCase())
                ) {
                    loadSale({ product_id: order.product_id, created_at: order.created_at });
                }
            })
            .subscribe();

        fetchLatestPaidOrder();

        return () => {
            if (showTimer) clearTimeout(showTimer);
            if (hideTimer) clearTimeout(hideTimer);
            client.removeChannel(channel);
        };
    }, []);

    const getTimeAgo = (dateStr: string) => {
        const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins} mins ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} hours ago`;
        return `${Math.floor(hours / 24)} days ago`;
    };

    if (!currentSale) return null;

    return (
        <div className={`fixed bottom-6 left-6 z-[100] max-w-[280px] w-full transition-all duration-700 ease-out ${
            isVisible ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
        }`}>
            <div className="bg-white rounded-2xl p-4 shadow-2xl border border-slate-100 flex items-center gap-4 relative overflow-hidden">
                <div className={`absolute bottom-0 left-0 h-1 bg-primary/20 transition-all duration-[6000ms] ease-linear ${isVisible ? 'w-full' : 'w-0'}`}></div>

                <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center text-primary shrink-0 border border-slate-100 shadow-inner">
                    <ShoppingBag className="h-6 w-6" />
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-foreground uppercase tracking-tight leading-none mb-1">Recent paid order</p>
                    <p className="text-[10px] text-slate-500 font-medium leading-tight">
                        A customer bought <span className="text-primary font-black uppercase italic">{currentSale.item}</span>
                    </p>
                    <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mt-1.5">{currentSale.time}</p>
                </div>

                <button
                    onClick={() => setIsVisible(false)}
                    aria-label="Dismiss recent order notification"
                    className="absolute top-2 right-2 text-slate-200 hover:text-slate-400 transition-colors"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>
        </div>
    );
}
