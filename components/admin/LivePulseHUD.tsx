'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Wine, Snowflake, PackageCheck, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function LivePulseHUD() {
    const metrics = [
        {
            label: 'Beverage Nodes',
            val: '248',
            sub: '↑ +12 added today',
            icon: Wine,
            color: 'text-amber-500 bg-amber-50'
        },
        {
            label: 'Chill Status',
            val: 'ACTIVE',
            sub: 'Last sync 4s ago • Live 🟢',
            icon: Snowflake,
            color: 'text-cyan-500 bg-cyan-50'
        },
        {
            label: 'In Stock Rate',
            val: '98.2%',
            sub: '↓ 0.4% today',
            icon: PackageCheck,
            color: 'text-emerald-500 bg-emerald-50'
        },
        {
            label: 'Storefront Status',
            val: 'LIVE',
            sub: '248 products synced • Connected 🟢',
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
