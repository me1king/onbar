import type { Metadata } from 'next';
import Link from 'next/link';
import BuildMyNightWidget from '@/components/widgets/concierge/BuildMyNightWidget';
import { getServiceHoursSchema, loadPublishedDispatchHours } from '@/lib/publicStoreInfo.server';

export const metadata: Metadata = {
  title: 'House Party Drinks Setup | Build the Night',
  description: 'Planning a house party? Share your guest count, budget and vibe. Build a drinks list from the live catalog, check delivery coverage and pay with M-Pesa. 18+.',
  alternates: { canonical: '/build-the-night' },
};

export const dynamic = 'force-dynamic';

export default async function BuildTheNightPage() {
  const hours = await loadPublishedDispatchHours();
  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Build the Night: house party drinks setup',
    serviceType: 'Party drinks planning and delivery',
    provider: { '@id': 'https://www.onlinebar.co.ke/#org' },
    description: hours
      ? `Published dispatch hours: ${hours}. Delivery availability is confirmed for the customer's address.`
      : 'Dispatch hours are not currently published. Confirm delivery availability and timing for your address.',
    ...getServiceHoursSchema(hours),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'KES',
      description: 'A personalized drinks plan using live catalog products and prices; confirm delivery coverage and total before ordering.',
    },
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-12 sm:px-7">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema).replace(/</g, '\\u003c') }} />
      <header className="mx-auto max-w-4xl py-12">
        <p className="text-sm font-bold uppercase tracking-wider text-primary">Online Bar party planning</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Build the Night: your house party drinks, sorted</h1>
        <p className="mt-4 text-lg leading-8 text-slate-700">
          Build the Night is Online Bar&apos;s house party planning service. Tell us how many guests you expect, your budget and the kind of night you want. Build a drinks list from our current catalog, then confirm your address, delivery availability and total before you order. We accept M-Pesa at checkout. Alcohol is for adults aged 18 and over.
        </p>
        <p className="mt-3 leading-7 text-slate-600">
          {hours ? <>Published dispatch hours: <strong>{hours}</strong>. Delivery coverage and timing are confirmed for your exact address.</> : 'Dispatch hours are not currently published. Confirm delivery availability and timing for your address at checkout or with Online Bar.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#planner" className="inline-flex min-h-12 items-center rounded-lg bg-slate-950 px-5 font-semibold text-white hover:bg-slate-800">Start my plan</a>
          <a href="https://wa.me/254769345599?text=Hi%20Online%20Bar%2C%20I%27d%20like%20help%20planning%20drinks%20for%20a%20house%20party." target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-lg border border-slate-300 px-5 font-semibold text-slate-800 hover:bg-slate-50">WhatsApp</a>
          <a href="tel:+254769345599" className="inline-flex min-h-12 items-center rounded-lg border border-slate-300 px-5 font-semibold text-slate-800 hover:bg-slate-50">Call</a>
        </div>
      </header>

      <section className="mx-auto max-w-4xl" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-2xl font-bold text-slate-950">How it works</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            ['1. Tell us about the night', 'Set your guest count, budget and occasion in the planner.'],
            ['2. Build your drinks list', 'Review the suggestions and change the products to suit your guests.'],
            ['3. Confirm before ordering', 'Check live availability, delivery coverage and the final total at checkout.'],
          ].map(([title, description]) => (
            <li key={title} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold text-slate-950">{title}</h3>
              <p className="mt-2 leading-6 text-slate-600">{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-10 max-w-4xl" aria-labelledby="party-options">
        <h2 id="party-options" className="text-2xl font-bold text-slate-950">Choose your guest count and budget</h2>
        <p className="mt-3 leading-7 text-slate-600">
          We do not advertise fixed Chill, Full House or Big Night packages because package prices and inclusions are not configured. Use the planner to set your own budget and guest count; it uses available catalog selections and current prices.
        </p>
      </section>

      <section className="mx-auto mt-10 max-w-4xl" aria-labelledby="included">
        <h2 id="included" className="text-2xl font-bold text-slate-950">What is included?</h2>
        <p className="mt-3 leading-7 text-slate-600">
          Your plan is based on the products you select from the live catalog. Ice, cups, glassware, bar staff and returns for unopened bottles are not listed as standard inclusions; ask Online Bar to confirm any event-specific request before you order.
        </p>
      </section>

      <section className="mx-auto mt-10 max-w-4xl" aria-labelledby="party-delivery">
        <h2 id="party-delivery" className="text-2xl font-bold text-slate-950">Where we deliver</h2>
        <p className="mt-3 leading-7 text-slate-600">
          Delivery coverage is limited to the currently mapped service areas, and availability depends on your exact address. Review the <Link href="/delivery" className="font-semibold text-primary underline">delivery areas and fees</Link>; if your area is not listed, contact Online Bar before planning delivery.
        </p>
      </section>

      <section className="mx-auto mt-10 max-w-4xl" aria-labelledby="party-faq">
        <h2 id="party-faq" className="text-2xl font-bold text-slate-950">House party drinks: questions and answers</h2>
        <div className="mt-4 divide-y divide-slate-200">
          <details className="py-4">
            <summary className="cursor-pointer font-semibold text-slate-900">How much alcohol do I need for 30 guests?</summary>
            <p className="mt-3 leading-7 text-slate-600">There is no reliable one-size-fits-all quantity. Guest preferences, event duration, food and alcohol-free options all matter. Use our <Link className="font-semibold text-primary underline" href="/guides/how-much-alcohol-for-a-party">party drinks planning guide</Link> and make a plan that does not pressure anyone to drink.</p>
          </details>
          <details className="py-4">
            <summary className="cursor-pointer font-semibold text-slate-900">Can I change the drinks list?</summary>
            <p className="mt-3 leading-7 text-slate-600">Yes. Review the planner suggestions and adjust your selection before checkout. Stock and prices are confirmed against the live catalog.</p>
          </details>
          <details className="py-4">
            <summary className="cursor-pointer font-semibold text-slate-900">How late do you deliver?</summary>
            <p className="mt-3 leading-7 text-slate-600">Delivery timing depends on the service area and current operations. Confirm the available delivery time for your address at checkout or <Link className="font-semibold text-primary underline" href="/contact">contact Online Bar</Link>.</p>
          </details>
          <details className="py-4">
            <summary className="cursor-pointer font-semibold text-slate-900">Do you need ID?</summary>
            <p className="mt-3 leading-7 text-slate-600">Alcohol is only for adults aged 18 and over. Valid identification may be requested when an order is delivered.</p>
          </details>
        </div>
      </section>

      <section id="planner" className="mx-auto mt-10 max-w-4xl scroll-mt-24">
        <h2 className="mb-4 text-2xl font-bold text-slate-950">Start your party plan</h2>
        <BuildMyNightWidget />
      </section>

      <p className="mx-auto mt-8 max-w-4xl text-sm text-slate-500">Alcohol is for adults aged 18 and over. Please drink responsibly. Valid identification may be requested.</p>
    </main>
  );
}
