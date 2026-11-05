import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How Much Alcohol for a Party of 20, 30, 50 or 100?',
  description: 'Plan party drinks around adult guest preferences, event length, food and alcohol-free options. A practical guide for parties in Kenya. 18+.',
  alternates: { canonical: '/guides/how-much-alcohol-for-a-party' },
};

const guestCounts = [20, 30, 50, 100];

export default function HowMuchAlcoholForAPartyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <article>
        <header>
          <p className="text-sm font-bold uppercase tracking-wider text-primary">Online Bar party planning guide</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">How much alcohol do I need for a party of 20, 30, 50 or 100?</h1>
          <p className="mt-4 text-lg leading-8 text-slate-700">
            There is no dependable drinks-per-person-per-hour formula for alcohol: guests have different preferences, some do not drink, and alcohol affects people differently. Plan for the adults who choose to drink, offer appealing alcohol-free drinks and water, and never make finishing a drink or keeping pace part of the event.
          </p>
        </header>

        <section className="mt-9" aria-labelledby="planning-table">
          <h2 id="planning-table" className="text-2xl font-bold text-slate-950">Start with the guest list, not a fixed alcohol quota</h2>
          <p className="mt-3 leading-7 text-slate-600">Use this checklist for any event size. The headcount is a planning input, not a recommendation to serve alcohol to every guest.</p>
          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-slate-50 text-slate-800">
                <tr>
                  <th scope="col" className="p-3 font-bold">Guest list</th>
                  <th scope="col" className="p-3 font-bold">Confirm before buying</th>
                  <th scope="col" className="p-3 font-bold">Alcohol-free options</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {guestCounts.map(count => (
                  <tr key={count}>
                    <th scope="row" className="p-3 font-semibold">{count} guests</th>
                    <td className="p-3">Adult count, preferences, event length and food</td>
                    <td className="p-3">Water and appealing non-alcoholic drinks for everyone</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 leading-7 text-slate-600">For a rough non-alcoholic refreshment check, plan around one alcohol-free drink per guest per hour, then adjust for weather, food, venue access to water and what guests prefer. Keep drinking water readily available throughout.</p>
        </section>

        <section className="mt-9">
          <h2 className="text-2xl font-bold text-slate-950">A practical party-planning checklist</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-6 leading-7 text-slate-700">
            <li>Ask guests about drink preferences and include people who do not drink alcohol.</li>
            <li>Set a budget and compare the current catalog prices before you order.</li>
            <li>Plan food and water, arrange a safe way home, and avoid encouraging rapid or excessive drinking.</li>
            <li>Check delivery availability for the exact venue address and confirm timing before the event.</li>
            <li>Only serve alcohol to adults aged 18 and over; be prepared to check valid identification.</li>
          </ol>
        </section>

        <section className="mt-9 rounded-2xl bg-slate-50 p-6">
          <h2 className="text-2xl font-bold text-slate-950">Want help planning the list?</h2>
          <p className="mt-3 leading-7 text-slate-600">Share your adult guest count, event date, venue area and budget. Online Bar can help you review a drinks list using live product availability; coverage and the final total are confirmed before ordering.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/build-the-night" className="inline-flex min-h-11 items-center rounded-lg bg-slate-950 px-4 font-semibold text-white hover:bg-slate-800">Plan a house party</Link>
            <Link href="/concierge" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 font-semibold text-slate-800 hover:bg-white">Ask the event concierge</Link>
          </div>
        </section>
        <p className="mt-8 text-sm text-slate-500">Alcohol is for adults aged 18 and over. Drink responsibly; never drink and drive.</p>
      </article>
    </main>
  );
}
