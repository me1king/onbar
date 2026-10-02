'use client';

import { Card } from '@/components/ui/card';
import { Megaphone, AlertCircle } from 'lucide-react';

export default function MerchantPromo() {
    return (
        <Card className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm text-left">
            <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-700 shrink-0">
                    <Megaphone size={22} />
                </div>
                <div className="space-y-2">
                    <h2 className="text-xl font-black uppercase tracking-tight text-foreground">Merchant promotions unavailable</h2>
                    <p className="text-xs font-medium leading-relaxed text-slate-600">
                        Campaign publishing, promotion delivery, and budget billing are not connected. No campaign will be created or product placement changed from this screen.
                    </p>
                </div>
            </div>
            <div className="mt-6 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
                <AlertCircle size={16} className="shrink-0" />
                <span>Connect and verify a publishing provider before enabling merchant promotion controls.</span>
            </div>
        </Card>
    );
}
