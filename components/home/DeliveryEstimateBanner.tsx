'use client';

import Link from 'next/link';
import { ArrowRight, Clock3 } from 'lucide-react';
import { LOCAL_DELIVERY_ESTIMATE } from '@/lib/deliveryEstimate';

export default function DeliveryEstimateBanner() {
    return (
        <section aria-labelledby="delivery-estimate-title" className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-[#14120f] px-5 py-5 text-white shadow-lg sm:flex-row sm:items-center sm:px-8 sm:py-6 lg:px-10">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Online Bar</p>
                    <h2 id="delivery-estimate-title" className="mt-1.5 text-xl font-black uppercase leading-tight tracking-tight sm:mt-2 sm:text-3xl">
                        <span className="text-primary">{LOCAL_DELIVERY_ESTIMATE}</span> local delivery
                    </h2>
                    <p className="mt-1.5 max-w-2xl text-xs leading-5 text-white/70 sm:mt-2 sm:text-sm">
                        <Clock3 aria-hidden="true" className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
                        Eligible Nairobi addresses. Check coverage and timing at checkout. Open 24/7.
                    </p>
                </div>
                <Link
                    href="/shop"
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-slate-950 transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                    Order now <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
            </div>
        </section>
    );
}
