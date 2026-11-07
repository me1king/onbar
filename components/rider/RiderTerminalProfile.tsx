'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  BadgeCheck,
  Phone,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/utils';

type TerminalTab = 'overview' | 'documents' | 'zones' | 'payments' | 'performance' | 'incidents';
type TerminalOrder = {
  id: number;
  status: string;
  total_price: number | null;
  payment_method: string | null;
  delivery_area: string | null;
  created_at: string;
  picked_up_at: string | null;
  delivered_at: string | null;
  delivery_eta_minutes: number | null;
};
type RiderDetails = {
  whatsappNumber: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  guarantorName: string | null;
  guarantorPhone: string | null;
  deliveryZones: string[];
  maxDistanceKm: number | null;
  shiftDays: string[];
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  mpesaNumber: string | null;
  mpesaRegisteredName: string | null;
  mpesaNameVerified: boolean;
  licenseExpiryDate: string | null;
  insuranceExpiryDate: string | null;
  ageCheckTrainingCompletedAt: string | null;
  riderAgreementAcceptedAt: string | null;
  riderAgreementVersion: string | null;
  updatedAt: string | null;
};
type RiderProfileResponse = {
  rider: {
    name: string;
    phone: string;
    vehicleType: string | null;
    vehicleRegistration: string | null;
    status: string;
    batteryLevel: number | null;
    areaZone: string | null;
    lastKnownLatitude: number | null;
    lastKnownLongitude: number | null;
    locationUpdatedAt: string | null;
  };
  details: RiderDetails | null;
  documents: {
    id_number_last4: string | null;
    license_number_last4: string | null;
    rider_photo_url: string | null;
    vehicle_photo_url: string | null;
  } | null;
  wallet: { balance: number; total_earned: number } | null;
  earnings: {
    thisWeek: number;
    daily: Array<{ day: string; date: string; amount: number }>;
    byOrder: Array<{ orderId: number; amount: number; creditedAt: string }>;
  };
  performance: {
    completedDeliveries: number;
    deliveriesThisWeek: number;
    averageDeliveryMinutes: number | null;
    onTimeRate: number | null;
    acceptanceRate: number | null;
    decidedOffers: number;
    rating: number | null;
    ratingCount: number;
    complaintsLast30Days: number | null;
  };
  orders: TerminalOrder[];
  incidents: Array<{
    id: number;
    order_id: number;
    to_status: string;
    metadata: { label?: string; issue?: string; details?: string } | null;
    created_at: string;
  }>;
  audit: Array<{ id: number; changed_fields: string[]; created_at: string }>;
  profileSetupRequired: boolean;
  warnings: string[];
};

const tabItems: Array<{ id: TerminalTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents' },
  { id: 'zones', label: 'Zones & shifts' },
  { id: 'payments', label: 'Payments' },
  { id: 'performance', label: 'Performance' },
  { id: 'incidents', label: 'Incidents' }
];
const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function valueOrMissing(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? 'Not recorded' : String(value);
}

function expiryLabel(date: string | null, label: string) {
  if (!date) return null;
  const days = Math.ceil((new Date(`${date}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days < 0) return { text: `${label} expired ${Math.abs(days)} day${days === -1 ? '' : 's'} ago.`, tone: 'rose' as const };
  if (days <= 30) return { text: `${label} expires in ${days} day${days === 1 ? '' : 's'}.`, tone: 'amber' as const };
  return null;
}

function elapsedMinutes(order: TerminalOrder) {
  if (!order.picked_up_at || !order.delivered_at) return null;
  const minutes = (new Date(order.delivered_at).getTime() - new Date(order.picked_up_at).getTime()) / 60_000;
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : null;
}

export default function RiderTerminalProfile({
  token,
  riderName,
  phone,
  isOnline,
  children
}: {
  token: string;
  riderName: string;
  phone: string;
  isOnline: boolean;
  children: React.ReactNode;
}) {
  const [tab, setTab] = React.useState<TerminalTab>('overview');
  const [data, setData] = React.useState<RiderProfileResponse | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [zoneInput, setZoneInput] = React.useState('');

  const loadProfile = React.useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch('/api/rider/profile', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const result = await response.json() as RiderProfileResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Rider profile could not be loaded.');
      setData(result);
      setZoneInput(result.details?.deliveryZones.join(', ') || '');
    } catch (error) {
      console.error('[RiderTerminalProfile] Could not load rider profile:', error);
      setLoadError(error instanceof Error ? error.message : 'Rider profile could not be loaded.');
    }
  }, [token]);

  React.useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const saveProfile = async (updates: Record<string, unknown>) => {
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const response = await fetch('/api/rider/profile', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        cache: 'no-store'
      });
      const result = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(result.error || 'Rider profile could not be saved.');
      await loadProfile();
      setSaveMessage(result.warning || 'Your profile has been saved.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Rider profile could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const details = data?.details;
  const performance = data?.performance;
  const errors = [loadError, saveError].filter(Boolean);
  const alerts = [
    expiryLabel(details?.insuranceExpiryDate || null, 'Insurance'),
    expiryLabel(details?.licenseExpiryDate || null, 'Driving licence')
  ].filter((alert): alert is NonNullable<typeof alert> => Boolean(alert));

  return (
    <div className="mx-auto max-w-7xl space-y-4 bg-[#f5f3ee] px-4 py-5 text-slate-900 sm:px-7">
      {alerts.map(alert => (
        <div key={alert.text} role="alert" className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${alert.tone === 'rose' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{alert.text} Update your document details and contact dispatch to upload a replacement.</span>
        </div>
      ))}
      {data?.profileSetupRequired && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Basic terminal data is available. To save your contacts, zones, shifts, payout preferences, and document dates, apply <strong>supabase/RIDER_PROFILE_DETAILS_MIGRATION.sql</strong>.
        </div>
      )}
      {errors.map(error => <div key={error} role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>)}
      {data?.warnings.map(warning => <div key={warning} role="status" className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">{warning}</div>)}

      <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
        <Card className="space-y-4 self-start rounded-2xl border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            {data?.documents?.rider_photo_url
              ? <Image src={data.documents.rider_photo_url} alt="" width={56} height={56} unoptimized className="h-14 w-14 rounded-full object-cover" />
              : <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-xl font-black text-white">{riderName.slice(0, 1).toUpperCase()}</div>}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black">{riderName}</h1>
              <p className="text-xs text-slate-500">{data?.performance.completedDeliveries ?? '—'} completed deliveries</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-bold">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800"><BadgeCheck className="mr-1 inline h-3 w-3" />Verified</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{details?.mpesaNameVerified ? 'M-Pesa verified' : 'M-Pesa not verified'}</span>
            <span className={`rounded-full px-2.5 py-1 ${isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{isOnline ? 'Online' : 'Offline'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a href={`tel:${phone}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-bold hover:bg-slate-50"><Phone size={15} />Call</a>
            <a href={`https://wa.me/${(details?.whatsappNumber || phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700">WhatsApp</a>
          </div>
          <div className="border-t border-slate-100 pt-4 text-sm">
            <p className="text-xs font-black uppercase tracking-wide">Details</p>
            <dl className="mt-3 space-y-2.5 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Phone</dt><dd className="text-right font-semibold">{phone}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Vehicle</dt><dd className="text-right font-semibold">{valueOrMissing(data?.rider.vehicleType)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Registration</dt><dd className="text-right font-semibold">{valueOrMissing(data?.rider.vehicleRegistration)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Emergency contact</dt><dd className="text-right font-semibold">{details?.emergencyContactName ? `${details.emergencyContactName} · ${valueOrMissing(details.emergencyContactPhone)}` : 'Not recorded'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Guarantor</dt><dd className="text-right font-semibold">{details?.guarantorName ? `${details.guarantorName} · ${valueOrMissing(details.guarantorPhone)}` : 'Not recorded'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Shifts</dt><dd className="text-right font-semibold">{details?.shiftDays.length ? `${details.shiftDays.map(day => day.slice(0, 3)).join(', ')}${details.shiftStartTime && details.shiftEndTime ? ` · ${details.shiftStartTime}–${details.shiftEndTime}` : ''}` : 'Not recorded'}</dd></div>
            </dl>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-black uppercase tracking-wide">Delivery zones</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(details?.deliveryZones.length ? details.deliveryZones : data?.rider.areaZone ? [data.rider.areaZone] : []).map(zone =>
                <span key={zone} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">{zone}</span>
              )}
              {!details?.deliveryZones.length && !data?.rider.areaZone && <span className="text-xs text-slate-500">No delivery zones recorded.</span>}
            </div>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-black uppercase tracking-wide">Documents</p>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Driving licence</dt><dd className="text-right font-semibold">{details?.licenseExpiryDate ? `Expires ${new Date(`${details.licenseExpiryDate}T00:00:00`).toLocaleDateString()}` : 'Expiry not recorded'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Insurance</dt><dd className="text-right font-semibold">{details?.insuranceExpiryDate ? `Expires ${new Date(`${details.insuranceExpiryDate}T00:00:00`).toLocaleDateString()}` : 'Expiry not recorded'}</dd></div>
            </dl>
          </div>
        </Card>

        <div className="space-y-4">
          <nav aria-label="Rider profile sections" className="flex gap-2 overflow-x-auto rounded-xl bg-transparent p-0.5">
            {tabItems.map(item => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}
                className={`shrink-0 rounded-lg border px-4 py-2.5 text-xs font-bold transition ${tab === item.id ? 'border-amber-500 bg-amber-500 text-slate-950 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                {item.label}
              </button>
            ))}
          </nav>

          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                {[
                  { label: 'Deliveries this week', value: performance?.deliveriesThisWeek ?? '—', note: performance ? 'Delivered orders' : 'Loading recorded orders' },
                  { label: 'Average delivery time', value: performance?.averageDeliveryMinutes === null || performance?.averageDeliveryMinutes === undefined ? 'Not tracked' : `${performance.averageDeliveryMinutes} min`, note: 'Pickup to handover · last 90 days' },
                  { label: 'On time (≤30 min)', value: performance?.onTimeRate === null || performance?.onTimeRate === undefined ? 'Not tracked' : `${performance.onTimeRate}%`, note: 'Only deliveries with both timestamps' },
                  { label: 'Balance owed', value: data?.wallet ? formatPrice(data.wallet.balance) : 'Not available', note: 'Recorded rider wallet balance' }
                ].map(metric => (
                  <Card key={metric.label} className="rounded-xl border-slate-100 bg-white p-4 shadow-sm">
                    <p className="text-[11px] font-semibold text-slate-500">{metric.label}</p>
                    <p className="mt-1 text-2xl font-black">{metric.value}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{metric.note}</p>
                  </Card>
                ))}
              </div>
              {!data && <Card className="p-5 text-sm text-slate-600">Loading rider profile and recorded metrics…</Card>}
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                <Card className="rounded-xl border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div><h2 className="font-bold">Earnings this week</h2><p className="mt-1 text-xs text-slate-500">Recorded delivery commissions</p></div>
                    <p className="text-lg font-black">{data ? formatPrice(data.earnings.thisWeek) : '—'}</p>
                  </div>
                  <div className="mt-5 grid h-32 grid-cols-7 items-end gap-3" aria-label="Daily rider commission earnings">
                    {(data?.earnings.daily || []).map(day => {
                      const highestEarning = Math.max(0, ...(data?.earnings.daily || []).map(item => item.amount));
                      const height = highestEarning > 0 ? Math.max(8, day.amount / highestEarning * 100) : 0;
                      return <div key={day.date} className="flex h-full flex-col items-center justify-end gap-2">
                        <div className="flex h-24 w-full items-end"><div title={`${day.day}: ${formatPrice(day.amount)}`} className={`w-full rounded-t-md ${day.amount ? 'bg-amber-500' : 'bg-slate-100'}`} style={{ height: `${height}%` }} /></div>
                        <span className="text-[10px] text-slate-500">{day.day}</span>
                      </div>;
                    })}
                    {!data && <span className="col-span-7 self-center text-center text-xs text-slate-500">Loading earnings…</span>}
                  </div>
                  {data && !data.earnings.byOrder.length && <p className="mt-2 text-xs text-slate-500">No rider commissions are recorded yet.</p>}
                </Card>
                <Card className="rounded-xl border-slate-100 bg-white p-5 shadow-sm">
                  <h2 className="font-bold">Performance</h2>
                  <dl className="mt-3 space-y-2.5 text-sm">
                    <div className="flex justify-between gap-3 border-b border-slate-100 pb-2"><dt className="text-slate-500">Acceptance rate</dt><dd className="font-bold">{performance?.acceptanceRate === null || performance?.acceptanceRate === undefined ? 'Not tracked' : `${performance.acceptanceRate}%`}</dd></div>
                    <div className="flex justify-between gap-3 border-b border-slate-100 pb-2"><dt className="text-slate-500">Cancellations</dt><dd className="font-bold">Not tracked</dd></div>
                    <div className="flex justify-between gap-3 border-b border-slate-100 pb-2"><dt className="text-slate-500">Late deliveries</dt><dd className="font-bold">{performance?.onTimeRate === null || performance?.onTimeRate === undefined ? 'Not tracked' : `${100 - performance.onTimeRate}%`}</dd></div>
                    <div className="flex justify-between gap-3 border-b border-slate-100 pb-2"><dt className="text-slate-500">Customer rating</dt><dd className="font-bold">{performance?.rating === null || performance?.rating === undefined ? 'Not tracked' : `${performance.rating.toFixed(1)} / 5`}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Complaints</dt><dd className="font-bold">{performance?.complaintsLast30Days ?? 'Not tracked'}</dd></div>
                  </dl>
                </Card>
              </div>
              <Card className="overflow-hidden rounded-xl border-slate-100 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-4"><h2 className="font-bold">Recent deliveries</h2></div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="text-slate-500"><tr><th className="px-4 py-3 font-semibold">Order</th><th className="px-4 py-3 font-semibold">Zone</th><th className="px-4 py-3 font-semibold">Time</th><th className="px-4 py-3 font-semibold">Result</th><th className="px-4 py-3 text-right font-semibold">Pay</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {(data?.orders || []).filter(order => order.status === 'Delivered').slice(0, 6).map(order => {
                        const duration = elapsedMinutes(order);
                        const commission = data?.earnings.byOrder.find(item => item.orderId === order.id);
                        return <tr key={order.id}>
                          <td className="px-4 py-3 font-semibold">#{order.id}</td>
                          <td className="px-4 py-3">{order.delivery_area || 'Not recorded'}</td>
                          <td className="px-4 py-3">{duration === null ? 'Not tracked' : `${duration} min`}</td>
                          <td className={`px-4 py-3 font-semibold ${duration !== null && duration > 30 ? 'text-rose-700' : 'text-emerald-700'}`}>{duration === null ? 'Not tracked' : duration > 30 ? 'Late' : 'On time'}</td>
                          <td className="px-4 py-3 text-right font-semibold">{commission ? formatPrice(commission.amount) : 'Not recorded'}</td>
                        </tr>;
                      })}
                      {data && !data.orders.some(order => order.status === 'Delivered') && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No completed deliveries are recorded yet.</td></tr>}
                      {!data && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Loading delivery records…</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>
              {children}
            </div>
          )}

          {tab === 'documents' && (
            <Card className="space-y-5 rounded-xl border-slate-200 bg-white p-5 shadow-sm">
              <div><h2 className="font-bold">Your documents & safety</h2><p className="mt-1 text-sm text-slate-500">Private document data is limited to your own signed-in rider account.</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['National ID', data?.documents?.id_number_last4 ? `Ending ${data.documents.id_number_last4}` : 'Not uploaded'],
                  ['Driving licence', data?.documents?.license_number_last4 ? `Ending ${data.documents.license_number_last4}` : 'Not uploaded'],
                  ['Vehicle', valueOrMissing(data?.rider.vehicleRegistration)],
                  ['Rider photo', data?.documents?.rider_photo_url ? 'Uploaded' : 'Not uploaded'],
                  ['Vehicle photo', data?.documents?.vehicle_photo_url ? 'Uploaded' : 'Not uploaded'],
                  ['Age-check training', details?.ageCheckTrainingCompletedAt ? `Completed ${new Date(details.ageCheckTrainingCompletedAt).toLocaleDateString()}` : 'Not recorded']
                ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm"><span className="text-slate-500">{label}</span><span className="text-right font-semibold">{value}</span></div>)}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">Licence expiry date<Input type="date" disabled={!details || saving} value={details?.licenseExpiryDate || ''} onChange={event => setData(current => current?.details ? { ...current, details: { ...current.details, licenseExpiryDate: event.target.value || null } } : current)} className="mt-2" /></label>
                <label className="text-sm font-semibold">Insurance expiry date<Input type="date" disabled={!details || saving} value={details?.insuranceExpiryDate || ''} onChange={event => setData(current => current?.details ? { ...current, details: { ...current.details, insuranceExpiryDate: event.target.value || null } } : current)} className="mt-2" /></label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4">
                <div>
                  <p className="text-sm font-semibold">Rider agreement v1</p>
                  {details?.riderAgreementAcceptedAt
                    ? <p className="text-xs text-slate-500">Accepted {new Date(details.riderAgreementAcceptedAt).toLocaleDateString()}</p>
                    : <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-600">
                        <li>Do not drink while on duty.</li>
                        <li>Do not open or tamper with customer orders.</li>
                        <li>Do not sell or arrange delivery outside the OnlineBar app.</li>
                        <li>Complete the required age and ID checks before handover.</li>
                      </ul>}
                </div>
                {!details?.riderAgreementAcceptedAt && <Button type="button" disabled={!details || saving} onClick={() => void saveProfile({ acceptAgreement: true })}>I agree to Rider Agreement v1</Button>}
              </div>
              <p className="text-xs text-slate-500">Document uploads and age-check training verification are not available in the current terminal. Expiry dates you enter are saved for dispatch visibility; they do not upload or renew certificates.</p>
              <Button type="button" disabled={!details || saving} onClick={() => void saveProfile({ licenseExpiryDate: details?.licenseExpiryDate || null, insuranceExpiryDate: details?.insuranceExpiryDate || null })}>{saving ? 'Saving…' : 'Save document dates'}</Button>
            </Card>
          )}

          {tab === 'zones' && (
            <Card className="space-y-5 rounded-xl border-slate-200 bg-white p-5 shadow-sm">
              <div><h2 className="font-bold">Delivery zones & shifts</h2><p className="mt-1 text-sm text-slate-500">These are your profile preferences. Dispatch must still confirm that zones are configured for order routing.</p></div>
              <label className="block text-sm font-semibold">Home / primary area<Input value={data?.rider.areaZone || ''} readOnly className="mt-2 bg-slate-50" /></label>
              <label className="block text-sm font-semibold">Delivery zones (comma separated)<Input disabled={!details || saving} value={zoneInput} onChange={event => setZoneInput(event.target.value)} placeholder="Westlands, Ngumo, Kilimani" className="mt-2" /></label>
              <label className="block max-w-xs text-sm font-semibold">Maximum distance (km)<Input type="number" min="1" max="100" step="1" disabled={!details || saving} value={details?.maxDistanceKm ?? ''} onChange={event => setData(current => current?.details ? { ...current, details: { ...current.details, maxDistanceKm: event.target.value ? Number(event.target.value) : null } } : current)} className="mt-2" /></label>
              <div>
                <p className="mb-2 text-sm font-semibold">Available days</p>
                <div className="flex flex-wrap gap-2">
                  {weekDays.map(day => {
                    const checked = Boolean(details?.shiftDays.includes(day));
                    return <label key={day} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${checked ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-500'}`}>
                      <input type="checkbox" className="sr-only" disabled={!details || saving} checked={checked} onChange={() => setData(current => current?.details ? { ...current, details: { ...current.details, shiftDays: checked ? current.details.shiftDays.filter(value => value !== day) : [...current.details.shiftDays, day] } } : current)} />
                      {day.slice(0, 3)}
                    </label>;
                  })}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">Shift starts<Input type="time" disabled={!details || saving} value={details?.shiftStartTime || ''} onChange={event => setData(current => current?.details ? { ...current, details: { ...current.details, shiftStartTime: event.target.value || null } } : current)} className="mt-2" /></label>
                <label className="text-sm font-semibold">Shift ends<Input type="time" disabled={!details || saving} value={details?.shiftEndTime || ''} onChange={event => setData(current => current?.details ? { ...current, details: { ...current.details, shiftEndTime: event.target.value || null } } : current)} className="mt-2" /></label>
              </div>
              <Button type="button" disabled={!details || saving} onClick={() => void saveProfile({ deliveryZones: zoneInput.split(',').map(zone => zone.trim()).filter(Boolean), maxDistanceKm: details?.maxDistanceKm ?? null, shiftDays: details?.shiftDays || [], shiftStartTime: details?.shiftStartTime || null, shiftEndTime: details?.shiftEndTime || null })}>{saving ? 'Saving…' : 'Save zones & shifts'}</Button>
            </Card>
          )}

          {tab === 'payments' && (
            <Card className="space-y-5 rounded-xl border-slate-200 bg-white p-5 shadow-sm">
              <div><h2 className="font-bold">Payments & wallet</h2><p className="mt-1 text-sm text-slate-500">Balances shown here come from your recorded rider wallet. They are not a payout confirmation.</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Recorded balance</p><p className="mt-1 text-2xl font-black">{data?.wallet ? formatPrice(data.wallet.balance) : 'Not available'}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Recorded total earned</p><p className="mt-1 text-2xl font-black">{data?.wallet ? formatPrice(data.wallet.total_earned) : 'Not available'}</p></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">M-Pesa payout number<Input type="tel" disabled={!details || saving} value={details?.mpesaNumber || ''} onChange={event => setData(current => current?.details ? { ...current, details: { ...current.details, mpesaNumber: event.target.value || null } } : current)} className="mt-2" /></label>
                <label className="text-sm font-semibold">Name registered on M-Pesa<Input disabled={!details || saving} value={details?.mpesaRegisteredName || ''} onChange={event => setData(current => current?.details ? { ...current, details: { ...current.details, mpesaRegisteredName: event.target.value || null } } : current)} className="mt-2" /></label>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 text-sm"><span className="text-slate-500">Name check: </span><span className="font-semibold">{details?.mpesaNameVerified ? 'Verified by admin' : 'Not verified'}</span></div>
              <Button type="button" disabled={!details || saving} onClick={() => void saveProfile({ mpesaNumber: details?.mpesaNumber || null, mpesaRegisteredName: details?.mpesaRegisteredName || null })}>{saving ? 'Saving…' : 'Save payout details'}</Button>
              <div className="grid gap-2 border-t border-slate-100 pt-4 text-sm">
                <p><strong>Payout history:</strong> Not tracked yet.</p>
                <p><strong>Cash held / amount to hand in:</strong> Not tracked yet.</p>
                <p><strong>Pay rate and next payout date:</strong> Not recorded yet.</p>
                <p className="text-xs text-slate-500">No withdrawal control is shown because rider payouts are not connected to a live payment operation.</p>
              </div>
            </Card>
          )}

          {tab === 'performance' && (
            <div className="space-y-4">
              <Card className="rounded-xl border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold">Recorded performance</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ['Completed deliveries', performance?.completedDeliveries ?? '—'],
                    ['Deliveries this week', performance?.deliveriesThisWeek ?? '—'],
                    ['Offer acceptance', performance?.acceptanceRate === null || performance?.acceptanceRate === undefined ? 'Not tracked' : `${performance.acceptanceRate}%`],
                    ['Average pickup-to-delivery', performance?.averageDeliveryMinutes === null || performance?.averageDeliveryMinutes === undefined ? 'Not tracked' : `${performance.averageDeliveryMinutes} min`],
                    ['Delivered within 30 minutes', performance?.onTimeRate === null || performance?.onTimeRate === undefined ? 'Not tracked' : `${performance.onTimeRate}%`],
                    ['Customer rating / complaints', 'No verified ratings tracked']
                  ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-100 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>)}
                </div>
              </Card>
              <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-4"><h2 className="font-bold">Recent delivery history</h2><p className="text-xs text-slate-500">Customer order totals are not rider pay and are not displayed as earnings.</p></div>
                <div className="divide-y divide-slate-100">
                  {(data?.orders || []).slice(0, 20).map(order => (
                    <div key={order.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 p-3 text-sm">
                      <div><p className="font-semibold">Order #{order.id}</p><p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString()}</p></div>
                      <span className="text-slate-600">{order.status}</span>
                      <span className="text-right text-slate-500">{elapsedMinutes(order) === null ? 'Duration not tracked' : `${elapsedMinutes(order)} min`}</span>
                    </div>
                  ))}
                  {!data?.orders.length && <p className="p-6 text-center text-sm text-slate-500">No delivery records available.</p>}
                </div>
              </Card>
            </div>
          )}

          {tab === 'incidents' && (
            <div className="space-y-4">
              <Card className="rounded-xl border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold">Incidents & delivery issues</h2>
                <p className="mt-1 text-sm text-slate-500">Incidents you reported through the terminal appear here from the delivery audit log.</p>
                <div className="mt-4 divide-y divide-slate-100">
                  {(data?.incidents || []).map(incident => (
                    <div key={incident.id} className="py-3">
                      <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{incident.metadata?.label || incident.to_status}</strong><span className="text-slate-500">{new Date(incident.created_at).toLocaleString()}</span></div>
                      <p className="mt-1 text-xs text-slate-500">Order #{incident.order_id}{incident.metadata?.details ? ` · ${incident.metadata.details}` : ''}</p>
                    </div>
                  ))}
                  {!data?.incidents.length && <p className="py-4 text-sm text-slate-500">{data ? 'No rider-reported delivery incidents are recorded.' : 'Loading incident log…'}</p>}
                </div>
              </Card>
              <Card className="rounded-xl border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold">Equipment & audit log</h2>
                <p className="mt-2 text-sm text-slate-500">Helmet, bag, jacket allocation and return tracking are not recorded yet.</p>
                <div className="mt-3 divide-y divide-slate-100">
                  {(data?.audit || []).map(event => <div key={event.id} className="py-2 text-sm"><span className="font-semibold">You updated: {event.changed_fields.join(', ') || 'profile'}</span><span className="block text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</span></div>)}
                  {!data?.audit.length && <p className="py-2 text-sm text-slate-500">{data ? 'No profile change history recorded yet.' : 'Loading profile audit…'}</p>}
                </div>
              </Card>
            </div>
          )}

          {saveMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{saveMessage}</p>}
        </div>
      </div>
      {loadError && <Button type="button" variant="outline" onClick={() => void loadProfile()}>Retry profile</Button>}
      <div className="sr-only" aria-live="polite">{saving ? 'Saving rider profile' : ''}</div>
    </div>
  );
}
