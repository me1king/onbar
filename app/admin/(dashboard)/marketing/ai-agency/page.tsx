'use client';

import Link from 'next/link';
import { BarChart3, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function AIAdAgency() {
    return (
        <div className="min-h-screen space-y-8 bg-slate-50 p-4 pb-40 text-left sm:p-8">
            <header className="space-y-2 border-b border-slate-200 pb-6">
                <div className="flex items-center gap-3 text-primary">
                    <BarChart3 className="h-5 w-5" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">Advertising integrations</span>
                </div>
                <h1 className="text-3xl font-black uppercase tracking-tighter text-foreground sm:text-4xl">Ad performance</h1>
                <p className="text-sm text-muted-foreground">
                    No Meta, Google, or other advertising account is connected to this dashboard.
                </p>
            </header>

            <Card className="space-y-4 p-5 sm:p-8">
                <h2 className="text-lg font-black uppercase text-foreground">Spend management unavailable</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    Spend, clicks, conversions, and return on ad spend cannot be reported without verified advertising-platform data. This dashboard will not change or reallocate an ad budget.
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    Connect an advertising provider and its reporting API before enabling campaign performance metrics or spend controls.
                </p>
                <Button asChild variant="outline" className="w-full justify-between sm:w-auto">
                    <Link href="/admin/marketing/create">
                        Manage campaign drafts <ExternalLink className="h-4 w-4" />
                    </Link>
                </Button>
            </Card>
        </div>
    );
}
