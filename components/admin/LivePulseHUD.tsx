'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Wine, Snowflake, PackageCheck, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function LivePulseHUD() {
    const [hud, setHud] = React.useState({
        beverageNodes: 0,
        inStockRate: '100.0%',
        storefrontStatus: 'LIVE & SYNCED'
    });

    React.useEffect(() => {
        async function fetchHudStats() {
            if (!supabase) return;
            try {
                const { data: products } = await supabase.from('products').select('id, stock');
                if (products && products.length > 0) {
                    const totalProds = products.length;
                    const inStockCount = products.filter(p => (Number(p.stock) || 0) > 0).length;
                    const rate = ((inStockCount / totalProds) * 100).toFixed(1) + '%';

                    setHud({
                        beverageNodes: totalProds,
                        inStockRate: rate,
                        storefrontStatus: 'LIVE & SYNCED'
                    });
                }
            } catch (err) {
                console.error("LivePulseHUD fetch error:", err);
            }
        }
        fetchHudStats();
    }, []);

    const metrics = [
        {
            label: 'Beverage Nodes',
            val: hud.beverageNodes.toString(),
            sub: 'Live Catalog Items',
            icon: Wine,
            color: 'text-amber-500 bg-amber-50'
        },
        {
            label: 'Chill Status',
            val: 'ACTIVE',
            sub: '4°C Cellar Grid 🟢',
            icon: Snowflake,
            color: 'text-cyan-500 bg-cyan-50'
        },
        {
            label: 'In Stock Rate',
            val: hud.inStockRate,
            sub: 'Live Inventory Level',
            icon: PackageCheck,
            color: 'text-emerald-500 bg-emerald-50'
        },
        {
            label: 'Storefront Status',
            val: 'LIVE',
            sub: `${hud.beverageNodes} Products Synced 🟢`,
            icon: Globe,
            color: 'text-indigo-500 bg-indigo-50'
        }
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {metrics.map((m) => (
                <Card key={m.label} className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm flex flex-col justify-between text-left group hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{m.label}</span>
                        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", m.color)}>
                            <m.icon size={18} />
                        </div>
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-foreground uppercase tracking-tight tabular-nums">{m.val}</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mt-1 truncate">{m.sub}</p>
                    </div>
                </Card>
            ))}
        </div>
    );
}
