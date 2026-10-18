'use client';

import Link from 'next/link';
import { ExternalLink, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function AbTestingPage() {
    return (
        <div className="min-h-screen space-y-8 bg-slate-50 p-4 pb-40 text-left sm:p-8">
            <header className="space-y-2 border-b border-slate-200 pb-6">
                <div className="flex items-center gap-3 text-primary">
                    <FlaskConical className="h-5 w-5" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">Experiment tracking</span>
                </div>
                <h1 className="text-3xl font-black uppercase tracking-tighter text-foreground sm:text-4xl">A/B testing</h1>
                <p className="text-sm text-muted-foreground">
                    No experiments are reported because visitor assignments, variant exposures, and attributed conversions are not currently recorded.
                </p>
            </header>

            <Card className="space-y-4 p-5 sm:p-8">
                <h2 className="text-lg font-black uppercase text-foreground">Experiment tracking is not configured</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    Campaign records are drafts only and do not create storefront variants.
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    To report A/B results reliably, the storefront needs variant assignment, event capture for each variant, and a defined conversion event before experiment metrics can be calculated.
                </p>
                <Button asChild variant="outline" className="w-full justify-between sm:w-auto">
                    <Link href="/lord/marketing/create">
                        Manage campaign drafts <ExternalLink className="h-4 w-4" />
                    </Link>
                </Button>
            </Card>
        </div>
    );
}
