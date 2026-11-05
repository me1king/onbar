import Link from 'next/link';
import BuildMyNightWidget from '@/components/widgets/concierge/BuildMyNightWidget';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'House Party Drinks Planning',
  description: 'Planning a house party? Share your guest count, budget, and vibe to start an Online Bar drinks plan. Delivery availability is confirmed by address.',
  alternates: { canonical: '/build-my-night' },
};

export default function BuildMyNightPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-12 sm:px-7">
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-7">
        <Link href="/shop" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          Back to shop
        </Link>
      </div>
      <header className="mx-auto max-w-4xl py-8">
        <p className="text-sm font-bold uppercase tracking-wider text-primary">Online Bar party planning</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Build the Night: start your party drinks plan</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          Tell us how many guests you expect, your budget, and what kind of gathering you are planning. Use the planner below to share the details and start choosing drinks for your event.
        </p>
        <p className="mt-3 leading-7 text-slate-600">
          Delivery eligibility and fees depend on your exact address. Check the <Link href="/delivery" className="font-semibold text-primary underline">mapped delivery areas</Link>; the final availability and total are confirmed at checkout.
        </p>
      </header>
      <BuildMyNightWidget />
      <section className="mx-auto mt-10 max-w-4xl">
        <h2 className="text-2xl font-bold text-slate-950">A simple way to plan</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-6 leading-7 text-slate-700">
          <li>Set the guest count, budget, and occasion in the planner.</li>
          <li>Review the suggested drinks and adjust your selection.</li>
          <li>Confirm your delivery address, current product availability, and total before ordering.</li>
        </ol>
        <p className="mt-5 text-sm text-slate-500">Alcohol is for adults aged 18 and over. Valid identification may be requested.</p>
      </section>
    </main>
  );
}
