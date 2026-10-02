'use client';

import Link from 'next/link';
import { ArrowRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function AudienceBuilder() {
    return (
        <Card className="space-y-4 p-5 sm:p-8">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Users className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-black uppercase text-foreground">Customer audiences</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
                Create and review customer segments using recorded order totals, order counts, and purchase recency. Audience reach is calculated from saved customer and order data.
            </p>
            <Button asChild variant="outline" className="w-full justify-between">
                <Link href="/admin/marketing/audiences">
                    Manage customer audiences <ArrowRight className="h-4 w-4" />
                </Link>
            </Button>
        </Card>
    );
}
