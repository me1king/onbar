'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BatteryMedium,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MapPin,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Truck,
  UserRound,
  Wallet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatPrice } from '@/lib/utils';
import { formatBatteryTelemetry } from '@/lib/riderTelemetry';

const LiveMap = dynamic(() => import('@/components/admin/dispatch/LiveDispatchMap'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-primary" /></div>
});

interface RiderOrder {
  id: number;
  status: string;
  total_price: number | null;
  created_at: string;
  delivered_at: string | null;
  delivery_eta_minutes: number | null;
}

interface RiderProfileData {
  rider: {
    id: number;
    rider_name: string;
    rider_phone: string;
    vehicle_type: string | null;
    vehicle_reg: string | null;
    plate_number: string | null;
    status: string | null;
    verification_status: string;
    battery_level: number | null;
    battery_updated_at: string | null;
    area_zone: string | null;
    created_at: string | null;
    updated_at: string | null;
    last_known_lat: number | null;
    last_known_lng: number | null;
    location_updated_at: string | null;
  };
  wallet: { balance: number; total_earned: number } | null;
  performance: {
    total_deliveries: number;
    deliveries_this_week: number;
    average_delivery_minutes: number | null;
    on_time_rate: number | null;
  };
  orders: RiderOrder[];
  activeOrders: RiderOrder[];
  documents: {
    id_number_last4: string | null;
    license_number: string | null;
    rider_photo_url: string | null;
  } | null;
  profileDetails: {
    whatsapp_number: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    guarantor_name: string | null;
    guarantor_phone: string | null;
    delivery_zones: string[];
    max_distance_km: number | null;
    shift_days: string[];
    shift_start_time: string | null;
    shift_end_time: string | null;
    mpesa_number: string | null;
    mpesa_registered_name: string | null;
    mpesa_name_verified_at: string | null;
    license_expiry_date: string | null;
    insurance_expiry_date: string | null;
    age_check_training_completed_at: string | null;
    rider_agreement_accepted_at: string | null;
    rider_agreement_version: string | null;
  } | null;
  profileDetailsRestricted: boolean;
  profileDetailsUnavailable: boolean;
}

function display(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? 'Not recorded' : String(value);
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (/^(?:254)?[17]\d{8}$/.test(digits)) {
    return `+254${digits.startsWith('254') ? digits.slice(3) : digits}`;
  }
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  return value;
}

function freshLocation(profile: RiderProfileData['rider']) {
  const lat = Number(profile.last_known_lat);
  const lng = Number(profile.last_known_lng);
  const updatedAt = profile.location_updated_at ? new Date(profile.location_updated_at).getTime() : 0;
  const heartbeatAt = profile.updated_at ? new Date(profile.updated_at).getTime() : 0;
  const now = Date.now();
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lng) && lng >= -180 && lng <= 180
    && ['idle', 'delivering'].includes((profile.status || '').toLowerCase())
    && updatedAt > 0 && now >= updatedAt && now - updatedAt <= 5 * 60 * 1000
    && heartbeatAt > 0 && now >= heartbeatAt && now - heartbeatAt <= 15 * 60 * 1000;
}

export default function RiderProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const [data, setData] = React.useState<RiderProfileData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [screenRefresh, setScreenRefresh] = React.useState(0);

  const loadProfile = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/riders/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const result = await response.json() as RiderProfileData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Rider profile could not be loaded.');
      setData(result);
    } catch (loadError) {
      console.error('[RiderProfile] Could not load rider profile:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Rider profile could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  if (loading) {
    return <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-500"><Loader2 className="animate-spin text-primary" /><p className="text-sm font-semibold">Loading rider profile…</p></main>;
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-800">{error || 'Rider profile is unavailable.'}</div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4" />Back to riders</Button>
          <Button onClick={() => void loadProfile()}>Try again</Button>
        </div>
      </main>
    );
  }

  const { rider, wallet, performance, orders, documents } = data;
  const hasFreshLocation = freshLocation(rider);
  const displayPhone = formatPhone(rider.rider_phone);
  const phoneDigits = displayPhone.replace(/[^\d]/g, '');
  const phoneLink = `tel:${displayPhone}`;
  const whatsappLink = `https://wa.me/${phoneDigits}`;
  const activeMission = data.activeOrders[0] || null;

  return (
    <main className="min-h-full space-y-6 bg-slate-50 p-4 text-slate-900 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-center">
        <Button onClick={() => router.back()} variant="outline" size="icon" aria-label="Back to riders" className="h-11 w-11 shrink-0 bg-white">
          <ArrowLeft size={18} />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {documents?.rider_photo_url
            ? <Image src={documents.rider_photo_url} alt="" width={64} height={64} unoptimized className="h-16 w-16 rounded-2xl object-cover" />
            : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-slate-500"><UserRound size={28} /></div>}
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-700">{display(rider.status)}</span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-800">{display(rider.verification_status)}</span>
            </div>
            <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">{rider.rider_name}</h1>
            <p className="mt-1 text-sm text-slate-500">{displayPhone}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="bg-white"><a href={phoneLink}><Phone className="mr-2 h-4 w-4" />Call</a></Button>
          <Button asChild className="bg-emerald-700 text-white hover:bg-emerald-800"><a href={whatsappLink} target="_blank" rel="noreferrer">WhatsApp</a></Button>
        </div>
      </header>

      <section aria-label="Rider overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Deliveries this week', value: performance.deliveries_this_week, icon: Truck },
          { label: 'Completed deliveries', value: performance.total_deliveries, icon: CheckCircle2 },
          { label: 'Average delivery time', value: performance.average_delivery_minutes === null ? 'Not tracked' : `${performance.average_delivery_minutes} min`, icon: Clock3 },
          { label: 'Wallet balance', value: wallet ? formatPrice(wallet.balance) : 'Not available', icon: Wallet }
        ].map(metric => (
          <Card key={metric.label} className="flex items-center gap-4 rounded-2xl p-5 shadow-sm">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><metric.icon size={20} /></span>
            <div><p className="text-xl font-black">{metric.value}</p><p className="text-xs font-semibold text-slate-500">{metric.label}</p></div>
          </Card>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-1">
          <Card className="rounded-2xl p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold">Rider account mirror · read only</h2>
            {data.profileDetailsRestricted
              ? <p className="text-sm leading-6 text-slate-600">Private contact and payout details are restricted. An owner or staff member with sensitive-data permission can view these fields.</p>
              : data.profileDetailsUnavailable
                ? <p className="text-sm leading-6 text-amber-800">Rider profile details are not available yet. Apply supabase/RIDER_PROFILE_DETAILS_MIGRATION.sql to enable this section.</p>
                : data.profileDetails
                  ? <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div><dt className="text-xs text-slate-500">WhatsApp</dt><dd className="font-semibold">{display(data.profileDetails.whatsapp_number)}</dd></div>
                      <div><dt className="text-xs text-slate-500">Emergency contact</dt><dd className="font-semibold">{display(data.profileDetails.emergency_contact_name)} · {display(data.profileDetails.emergency_contact_phone)}</dd></div>
                      <div><dt className="text-xs text-slate-500">Guarantor</dt><dd className="font-semibold">{display(data.profileDetails.guarantor_name)} · {display(data.profileDetails.guarantor_phone)}</dd></div>
                      <div><dt className="text-xs text-slate-500">M-Pesa payout</dt><dd className="font-semibold">{display(data.profileDetails.mpesa_number)} · {display(data.profileDetails.mpesa_registered_name)}{data.profileDetails.mpesa_name_verified_at ? ' · verified' : ' · not verified'}</dd></div>
                      <div><dt className="text-xs text-slate-500">Delivery zones</dt><dd className="font-semibold">{data.profileDetails.delivery_zones?.join(', ') || 'Not recorded'}</dd></div>
                      <div><dt className="text-xs text-slate-500">Max distance</dt><dd className="font-semibold">{data.profileDetails.max_distance_km === null ? 'Not recorded' : `${data.profileDetails.max_distance_km} km`}</dd></div>
                      <div><dt className="text-xs text-slate-500">Availability</dt><dd className="font-semibold">{data.profileDetails.shift_days?.join(', ') || 'Not recorded'}{data.profileDetails.shift_start_time && data.profileDetails.shift_end_time ? ` · ${data.profileDetails.shift_start_time.slice(0, 5)}–${data.profileDetails.shift_end_time.slice(0, 5)}` : ''}</dd></div>
                      <div><dt className="text-xs text-slate-500">Licence / insurance expiry</dt><dd className="font-semibold">{display(data.profileDetails.license_expiry_date)} / {display(data.profileDetails.insurance_expiry_date)}</dd></div>
                      <div><dt className="text-xs text-slate-500">Age-check training</dt><dd className="font-semibold">{data.profileDetails.age_check_training_completed_at ? new Date(data.profileDetails.age_check_training_completed_at).toLocaleDateString() : 'Not completed'}</dd></div>
                      <div><dt className="text-xs text-slate-500">Rider agreement</dt><dd className="font-semibold">{data.profileDetails.rider_agreement_accepted_at ? `${data.profileDetails.rider_agreement_version || 'Accepted'} · ${new Date(data.profileDetails.rider_agreement_accepted_at).toLocaleDateString()}` : 'Not accepted'}</dd></div>
                    </dl>
                  : <p className="text-sm leading-6 text-slate-600">No additional rider account details have been saved.</p>}
          </Card>
          <Card className="rounded-2xl p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold"><Truck size={18} />Identity & vehicle</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Phone</dt><dd className="text-right font-semibold">{displayPhone}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Vehicle</dt><dd className="text-right font-semibold">{display(rider.vehicle_type)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Registration</dt><dd className="text-right font-semibold">{display(rider.plate_number || rider.vehicle_reg)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Work area</dt><dd className="text-right font-semibold">{display(rider.area_zone)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Joined</dt><dd className="text-right font-semibold">{rider.created_at ? new Date(rider.created_at).toLocaleDateString() : 'Not recorded'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="flex items-center gap-1 text-slate-500"><BatteryMedium size={15} />Battery report</dt><dd className="text-right font-semibold">{formatBatteryTelemetry(rider.battery_level, rider.battery_updated_at)}</dd></div>
            </dl>
          </Card>

          <Card className="rounded-2xl p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold"><ShieldCheck size={18} />Verification documents</h2>
            {documents
              ? <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">National ID</dt><dd className="font-semibold">{documents.id_number_last4 ? `•••• ${documents.id_number_last4}` : 'Not recorded'}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Licence number</dt><dd className="text-right font-semibold">{display(documents.license_number)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">ID / rider photo</dt><dd className="font-semibold">{documents.rider_photo_url ? 'Available to authorized staff' : 'Not uploaded'}</dd></div>
                </dl>
              : <p className="text-sm text-slate-500">Restricted: your account is not permitted to view private rider verification details.</p>}
            <p className="mt-4 flex gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500"><FileText size={15} className="shrink-0" />Document expiry dates and training records have not been collected in the current system.</p>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-2">
          <Card className="space-y-4 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">Rider device view · read only</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                  View the rider app using the latest server-side rider and delivery data. Controls are disabled; this is not a physical phone screen mirror and cannot show device-only state.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setScreenRefresh(value => value + 1)}>
                  <RefreshCcw className="mr-2 h-4 w-4" />Refresh view
                </Button>
                <Button asChild size="sm">
                  <a href={`/rider/dashboard?supportRiderId=${encodeURIComponent(String(rider.id))}`} target="_blank" rel="noreferrer">Open full screen</a>
                </Button>
              </div>
            </div>
            <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[2rem] border-[8px] border-slate-900 bg-white shadow-xl">
              <iframe
                key={`${rider.id}-${activeMission?.id ?? 'idle'}-${screenRefresh}`}
                title={`Read-only rider dashboard for ${rider.rider_name}${activeMission ? `, order ${activeMission.id}` : ''}`}
                src={`/rider/dashboard?supportRiderId=${encodeURIComponent(String(rider.id))}`}
                className="h-[780px] w-full bg-[#f5f3ee]"
                referrerPolicy="same-origin"
              />
            </div>
          </Card>

          <Card className="overflow-hidden rounded-2xl p-1 shadow-sm">
            <div className="flex items-center justify-between p-4">
              <h2 className="flex items-center gap-2 font-bold"><MapPin size={18} />Rider location</h2>
              <span className="text-xs font-medium text-slate-500">{hasFreshLocation ? 'GPS updated within 5 minutes' : 'No fresh GPS fix'}</span>
            </div>
            <div className="h-[320px] overflow-hidden rounded-xl bg-slate-100">
              {hasFreshLocation
                ? <LiveMap riders={[{
                    id: rider.id,
                    rider_name: rider.rider_name,
                    status: rider.status || 'Offline',
                    battery_level: rider.battery_level,
                    battery_updated_at: rider.battery_updated_at,
                    lat: Number(rider.last_known_lat),
                    lng: Number(rider.last_known_lng),
                    location_updated_at: rider.location_updated_at
                  }]} showDemand={false} />
                : <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-500"><MapPin size={22} /><span>Location is shown only when the rider has a recent, valid GPS update.</span></div>}
            </div>
          </Card>

          <Card className="overflow-hidden rounded-2xl shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-5">
              <h2 className="font-bold">Recent delivery history</h2>
              <span className="text-xs text-slate-500">Last 10 recorded orders</span>
            </div>
            {orders.length
              ? <div className="divide-y divide-slate-100">
                  {orders.map(order => (
                    <div key={order.id} className="flex items-center justify-between gap-4 p-4">
                      <div><p className="font-semibold">Order #{order.id}</p><p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString()}</p></div>
                      <div className="text-right"><p className="font-semibold">{order.total_price === null ? '—' : formatPrice(order.total_price)}</p><p className="text-xs text-slate-500">{order.status}</p></div>
                    </div>
                  ))}
                </div>
              : <p className="p-8 text-center text-sm text-slate-500">No orders are linked to this rider phone number.</p>}
          </Card>

          <Card className="rounded-2xl p-5 shadow-sm">
            <h2 className="mb-3 font-bold">Other profile data</h2>
            <p className="text-sm leading-6 text-slate-600">
              Rating and customer compliments, equipment history, and a complete rider-visible delivery archive are not available in the admin profile yet. The delivery time, on-time rate, contact, payout, zones, shifts, training, and agreement fields above are drawn from saved records where available; missing fields are not estimated.
            </p>
          </Card>
        </div>
      </div>
    </main>
  );
}
