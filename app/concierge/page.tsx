import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Event Drinks Planning | Online Bar',
  description: 'Planning drinks for a birthday, wedding, graduation, or work event? Share your guest count, budget, date, and area with Online Bar.',
  alternates: { canonical: '/concierge' },
};

const eventTypes = ['Birthdays', 'Weddings', 'Corporate events', 'Graduations', 'Send-offs', 'House parties'];

export default function ConciergePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <header className="max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-wider text-primary">Online Bar event planning</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Event drinks planning, made easier</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          Tell us the kind of event you are hosting, your guest count, budget, date, and venue area. Online Bar can help you start a drinks plan and check delivery availability for your address.
        </p>
      </header>

      <section className="mt-9">
        <h2 className="text-2xl font-bold text-slate-950">Events we can help you plan for</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {eventTypes.map(type => <li key={type} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">{type}</li>)}
        </ul>
      </section>

      <section className="mt-9 max-w-3xl">
        <h2 className="text-2xl font-bold text-slate-950">How to get started</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-6 leading-7 text-slate-700">
          <li>Share your guest count, event date, budget, and delivery area.</li>
          <li>Use the party-planning request to describe the drinks and occasion you have in mind.</li>
          <li>Confirm products, delivery coverage, and the final total before placing an order.</li>
        </ol>
        <p className="mt-4 leading-7 text-slate-600">
          Delivery coverage and fees depend on the address. See the <Link className="font-semibold text-primary underline" href="/delivery">currently mapped areas</Link>; the checkout location check confirms whether a specific address is covered.
        </p>
      </section>

      <div className="mt-9 flex flex-wrap gap-3">
        <Link href="/build-my-night" className="rounded-lg bg-slate-950 px-5 py-3 font-semibold text-white hover:bg-slate-800">Start a party drinks plan</Link>
        <Link href="/contact" className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50">Contact Online Bar</Link>
      </div>
      <p className="mt-8 text-sm text-slate-500">Alcohol is for adults aged 18 and over. Valid identification may be requested.</p>
    </main>
  );
}
