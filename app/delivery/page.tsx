import Link from 'next/link';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { supabase } from '@/lib/supabaseClient';
import { parseDeliveryAreas, type DeliveryArea } from '@/lib/deliveryAreas';
import { LOCAL_DELIVERY_ESTIMATE } from '@/lib/deliveryEstimate';
import { loadPublicLocationAreas } from '@/lib/locationCatalog.server';
import type { ConfiguredLocationArea } from '@/lib/locationCatalog';
import { getServiceHoursSchema, PUBLIC_DISPATCH_HOURS } from '@/lib/publicStoreInfo.server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Alcohol Delivery in Kenya | Service Areas',
  description: `Online ordering is open 24/7. Find Online Bar delivery locations across Kenya; eligible local Nairobi delivery is estimated at ${LOCAL_DELIVERY_ESTIMATE}. Confirm address and timing at checkout.`,
  alternates: { canonical: '/delivery' },
};

async function loadDeliveryAreas(): Promise<(DeliveryArea & { fee: number })[] | null> {
  const database = createServerSupabaseClient() || supabase;
  if (!database) {
    console.error('[Delivery] Server-side settings are not configured.');
    return null;
  }

  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', 'free_delivery_areas')
    .eq('is_published', true)
    .abortSignal(AbortSignal.timeout(8_000))
    .maybeSingle();
  if (error) {
    console.error('[Delivery] Could not load configured delivery areas:', error.message);
    return null;
  }

  try {
    return parseDeliveryAreas(data?.value ?? [])
      .filter((area): area is DeliveryArea & { fee: number } => area.points.length >= 3 && typeof area.fee === 'number');
  } catch (error) {
    console.error('[Delivery] Saved delivery area settings are invalid:', error);
    return null;
  }
}

export default async function DeliveryPage() {
  const [areas, locations] = await Promise.all([loadDeliveryAreas(), loadPublicLocationAreas()]);
  const serviceSchema = locations ? {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Online Bar delivery service',
    serviceType: 'Online drinks and grocery delivery',
    provider: { '@id': 'https://www.onlinebar.co.ke/#org' },
    description: `Online ordering is open 24/7. Eligible local Nairobi delivery is estimated at ${LOCAL_DELIVERY_ESTIMATE}; delivery timing and availability for other locations are confirmed at checkout.`,
    areaServed: locations.map(location => ({
      '@type': 'Place',
      name: `${location.area}, ${location.city}, ${location.county}, ${location.country}`,
    })),
    ...getServiceHoursSchema(PUBLIC_DISPATCH_HOURS),
  } : null;
  const locationsByCounty = new Map<string, ConfiguredLocationArea[]>();
  for (const location of locations || []) {
    const group = locationsByCounty.get(location.county) || [];
    group.push(location);
    locationsByCounty.set(location.county, group);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      {serviceSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema).replace(/</g, '\\u003c') }} />
      )}
      <header className="max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-wider text-primary">Online Bar delivery</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Delivery areas and fees</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          Online Bar is a delivery service, not a walk-in bar. Online ordering is open <strong>24/7</strong>. Eligible local Nairobi deliveries are estimated at <strong>{LOCAL_DELIVERY_ESTIMATE}</strong>, depending on your exact address and availability. Delivery timing for other locations is confirmed at checkout.
        </p>
      </header>

      {locations ? (
        <section aria-labelledby="delivery-locations" className="mt-8">
          <h2 id="delivery-locations" className="text-2xl font-bold text-slate-950">Delivery locations</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            These are the locations in Online Bar&apos;s published location directory. Confirm your exact pin, delivery option, fee and estimated timing at checkout.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...locationsByCounty.entries()].map(([county, countyLocations]) => (
              <section key={county} className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="font-bold text-slate-950">{county} County</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {countyLocations.map(location => (
                    <li key={`${location.city}-${location.area}`}>
                      {location.area}{location.city !== location.area ? `, ${location.city}` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>
      ) : (
        <p role="status" className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5 text-slate-800">
          The delivery location list could not be loaded. Confirm your address with Online Bar before ordering.
        </p>
      )}

      {areas === null ? (
        <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5 text-slate-800">
          Current delivery coverage could not be loaded. Please check your address at checkout or contact Online Bar before ordering.
        </p>
      ) : areas.length === 0 ? (
        <p className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5 text-slate-700">
          No mapped delivery areas are currently published. Please contact Online Bar to check service availability.
        </p>
      ) : (
        <section aria-labelledby="mapped-areas" className="mt-8">
          <h2 id="mapped-areas" className="text-2xl font-bold text-slate-950">Currently mapped areas</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map(area => (
              <li key={area.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-bold text-slate-950">{area.name}</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Delivery fee: <strong className="text-slate-950">KSh {area.fee.toLocaleString('en-KE')}</strong>
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-slate-600">
            A qualifying order may receive free delivery if it meets the current checkout threshold. The final fee is confirmed when you place your order.
          </p>
        </section>
      )}

      <p className="mt-6 text-sm text-slate-600">
        Online ordering is open <strong>24/7</strong>. Eligible local Nairobi delivery is estimated at {LOCAL_DELIVERY_ESTIMATE}; check your address at checkout for current availability and timing.
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/shop" className="rounded-lg bg-slate-950 px-5 py-3 font-semibold text-white hover:bg-slate-800">Browse the shop</Link>
        <Link href="/contact" className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50">Ask about your area</Link>
        <Link href="/build-the-night" className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50">Plan house party drinks</Link>
        <Link href="/concierge" className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50">Plan event drinks</Link>
      </div>
      <p className="mt-6 text-sm text-slate-500">Alcohol is for adults aged 18 and over. Valid identification may be requested.</p>
    </main>
  );
}
