import type { Metadata } from 'next';
import Link from 'next/link';
import EventRequestForm from '@/components/concierge/EventRequestForm';
import { getServiceHoursSchema, loadPublishedDispatchHours } from '@/lib/publicStoreInfo.server';

export const metadata: Metadata = {
  title: 'Event Drinks Concierge | Personal Event Planning',
  description: 'Planning a wedding, birthday, graduation or corporate event? Share your guest count, date, venue area and budget to start an Online Bar drinks plan.',
  alternates: { canonical: '/concierge' },
};

const eventTypes = ['Birthdays', 'Weddings', 'Corporate events', 'Graduations', 'Send-offs', 'Product launches'];

export const dynamic = 'force-dynamic';

export default async function ConciergePage() {
  const hours = await loadPublishedDispatchHours();
  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Online Bar event drinks concierge',
    serviceType: 'Event drinks planning concierge',
    provider: { '@id': 'https://www.onlinebar.co.ke/#org' },
    description: hours
      ? `Published dispatch hours: ${hours}. Event delivery availability is confirmed for the venue address.`
      : 'Dispatch hours are not currently published. Confirm delivery availability and timing for the venue address.',
    ...getServiceHoursSchema(hours),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'KES',
      description: 'Event drinks planning based on guest count, budget, current catalog and confirmed delivery availability.',
    },
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema).replace(/</g, '\\u003c') }} />
      <header className="max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-wider text-primary">Online Bar event planning</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Your personal drinks concierge for events</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          Not sure what to serve at your event? Tell our concierge your guest count, date, venue area and budget. We can help you plan a drinks list from the current catalog and check delivery availability for your address, so you can review the options and total before ordering.
        </p>
        <p className="mt-3 leading-7 text-slate-600">
          {hours ? <>Published dispatch hours: <strong>{hours}</strong>. Delivery coverage and timing are confirmed for the venue address.</> : 'Dispatch hours are not currently published. Confirm delivery availability and timing for the venue address before booking.'}
        </p>
      </header>

      <section className="mt-9">
        <h2 className="text-2xl font-bold text-slate-950">Events to plan for</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {eventTypes.map(type => <li key={type} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">{type}</li>)}
        </ul>
      </section>

      <section className="mt-9 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-950">What the concierge helps with</h2>
          <ul className="mt-4 list-disc space-y-2 pl-6 leading-7 text-slate-700">
            <li>Suggesting a drinks list from available products and your budget.</li>
            <li>Adjusting the selection for guest preferences and alcohol-free options.</li>
            <li>Checking delivery coverage and discussing timing for the venue.</li>
          </ul>
          <p className="mt-4 leading-7 text-slate-600">
            Event staff, glassware, ice and other add-ons are not standard inclusions. Ask us to confirm any specific request before ordering.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-xl font-bold text-slate-950">Example planning brief</h2>
          <p className="mt-3 leading-7 text-slate-700">
            For a 40-person, five-hour event, start with the adult guest count, the mix of guests who want alcoholic and alcohol-free options, food plans, venue area and budget. The concierge can then help shape a list from live products and prices; it is not a fixed package or a promise of stock or delivery.
          </p>
        </div>
      </section>

      <section className="mt-10 max-w-3xl" aria-labelledby="book-concierge">
        <h2 id="book-concierge" className="text-2xl font-bold text-slate-950">Tell us about your event</h2>
        <p className="mt-3 leading-7 text-slate-600">
          Add your event date, guest count, venue area and budget. The form opens a WhatsApp draft for you to review and send.
        </p>
        <EventRequestForm />
        <p className="mt-4 leading-7 text-slate-600">
          Coverage and fees depend on the exact address. See the <Link className="font-semibold text-primary underline" href="/delivery">delivery area information</Link>; if your area is not listed, contact Online Bar to confirm before planning.
        </p>
      </section>

      <div className="mt-9 flex flex-wrap gap-3">
        <Link href="/build-the-night" className="rounded-lg bg-slate-950 px-5 py-3 font-semibold text-white hover:bg-slate-800">Plan house party drinks</Link>
        <a href="https://wa.me/254769345599?text=Hi%20Online%20Bar%2C%20I%27d%20like%20help%20planning%20drinks%20for%20an%20event." target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50">WhatsApp</a>
        <a href="tel:+254769345599" className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50">Call</a>
      </div>
      <p className="mt-8 text-sm text-slate-500">Alcohol is for adults aged 18 and over. Valid identification may be requested.</p>
    </main>
  );
}
