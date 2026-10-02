'use client';

import { ShieldAlert, Database } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface AuthenticityProps {
    productName?: string;
    batchNo?: string;
    origin?: string;
    abv?: string;
}

export default function AuthenticitySentinel({
    productName,
    batchNo,
    origin,
    abv
}: AuthenticityProps) {
    return (
        <Card className="p-8 rounded-[3rem] bg-amber-50 border border-amber-200 shadow-sm space-y-6 relative overflow-hidden text-left">
            <div className="relative z-10 flex items-start gap-5">
                <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center text-amber-700 shadow-sm shrink-0">
                    <ShieldAlert size={28} />
                </div>
                <div className="space-y-2">
                    <h3 className="text-lg font-black uppercase tracking-tight text-amber-950">Bottle verification unavailable</h3>
                    <p className="text-xs font-medium leading-relaxed text-amber-900">
                        Product catalog details are not proof of a specific bottle&apos;s authenticity. No registered bottle passport or laboratory report is available to verify here.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-amber-200 pt-5">
                <div className="min-w-0 space-y-1">
                    <p className="text-[8px] font-black uppercase text-amber-700">Catalog product</p>
                    <p className="truncate text-[11px] font-bold text-amber-950">{productName || 'Unavailable'}</p>
                </div>
                <div className="min-w-0 space-y-1">
                    <p className="text-[8px] font-black uppercase text-amber-700">Catalog batch / SKU</p>
                    <p className="truncate text-[11px] font-bold text-amber-950">{batchNo || 'Unavailable'}</p>
                </div>
                <div className="min-w-0 space-y-1">
                    <p className="text-[8px] font-black uppercase text-amber-700">Listed origin</p>
                    <p className="truncate text-[11px] font-bold text-amber-950">{origin || 'Unavailable'}</p>
                </div>
                <div className="min-w-0 space-y-1">
                    <p className="text-[8px] font-black uppercase text-amber-700">Listed ABV</p>
                    <p className="truncate text-[11px] font-bold text-amber-950">{abv || 'Unavailable'}</p>
                </div>
            </div>

            <div className="flex items-center gap-2 border-t border-amber-200 pt-4 text-[9px] font-black uppercase tracking-widest text-amber-800">
                <Database size={13} />
                No bottle-level verification record
            </div>
        </Card>
    );
}
