'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, MessageSquareText, RefreshCcw, Save, Send, ShieldCheck, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  CUSTOMER_NOTIFICATION_STATUSES,
  DEFAULT_CUSTOMER_NOTIFICATION_CONFIG,
  type CustomerNotificationConfig,
  type CustomerNotificationStatus
} from '@/lib/customerMessaging';
import { getSmsSegments } from '@/lib/smsSegments';
import { cn } from '@/lib/utils';

interface SmsDelivery {
  id: number;
  order_id: number;
  notification_status: string;
  channel: 'sms';
  delivery_status: 'sending' | 'sent' | 'failed';
  error_message: string | null;
  created_at: string;
  customer?: { name: string; email: string; phone: string } | null;
}

const sampleVariables: Record<string, string> = {
  name: 'Amani',
  orderId: '1042',
  status: 'Out for Delivery',
  trackingUrl: 'https://onlinebar.co.ke/track?id=1042',
  customer_name: 'Amani',
  order_id: '1042',
  total: 'KES 2,450.00',
  rider_name: 'Kiptoo',
  rider_phone: '+254712345678',
  eta: '12 mins',
  tracking_link: 'https://onlinebar.co.ke/track?id=1042'
};

function renderSample(template: string) {
  return template.replace(/\{([a-zA-Z_]+)\}/g, (match, key: string) => sampleVariables[key] ?? match);
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? `••••${digits.slice(-4)}` : 'No phone recorded';
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function SmsControlCenter() {
  const [config, setConfig] = useState<CustomerNotificationConfig>(DEFAULT_CUSTOMER_NOTIFICATION_CONFIG);
  const [providerReady, setProviderReady] = useState(false);
  const [deliveries, setDeliveries] = useState<SmsDelivery[]>([]);
  const [testStatus, setTestStatus] = useState<CustomerNotificationStatus>('Out for Delivery');
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState(renderSample(DEFAULT_CUSTOMER_NOTIFICATION_CONFIG['Out for Delivery'].smsMessage));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/customer-messaging', { cache: 'no-store' });
      const result = await response.json() as {
        error?: string;
        config?: CustomerNotificationConfig;
        providers?: { sms?: boolean };
        deliveries?: SmsDelivery[];
      };
      if (!response.ok) throw new Error(result.error || 'Could not load SMS settings.');
      const loadedConfig = result.config || DEFAULT_CUSTOMER_NOTIFICATION_CONFIG;
      setConfig(loadedConfig);
      setProviderReady(Boolean(result.providers?.sms));
      setDeliveries((result.deliveries || []).filter(delivery => delivery.channel === 'sms'));
      setNotice(null);
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : 'Could not load SMS settings.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const segmentCount = useMemo(() => getSmsSegments(testMessage), [testMessage]);

  const toggleSms = (status: CustomerNotificationStatus, enabled: boolean) => {
    setConfig(current => ({
      ...current,
      [status]: {
        ...current[status],
        channels: enabled
          ? [...new Set([...current[status].channels, 'sms' as const])]
          : current[status].channels.filter(channel => channel !== 'sms')
      }
    }));
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/customer-messaging', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not save SMS settings.');
      setNotice({ error: false, text: 'SMS templates and status channel settings saved.' });
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : 'Could not save SMS settings.' });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setSending(true);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/customer-messaging/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'sms', phone: testPhone, message: testMessage })
      });
      const result = await response.json() as { error?: string; destination?: string };
      if (!response.ok) throw new Error(result.error || 'SMS test could not be sent.');
      setNotice({ error: false, text: `Test SMS submitted to ${result.destination || 'your number'}. Provider acceptance is not a delivery receipt.` });
      await load();
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : 'SMS test could not be sent.' });
    } finally {
      setSending(false);
    }
  };

  const retry = async (delivery: SmsDelivery) => {
    const status = CUSTOMER_NOTIFICATION_STATUSES.find(item => item === delivery.notification_status);
    if (!status) {
      setNotice({ error: true, text: 'This log entry has an unsupported order status and cannot be retried.' });
      return;
    }
    setRetrying(delivery.id);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/notify-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: delivery.order_id, status, retryChannel: 'sms' })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'SMS retry could not be sent.');
      setNotice({ error: false, text: `SMS retry requested for order #${delivery.order_id}.` });
      await load();
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : 'SMS retry could not be sent.' });
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="min-h-screen space-y-7 bg-slate-50 p-4 pb-40 text-left sm:p-8">
      <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-amber-700">
            <MessageSquareText className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.25em]">Transactional SMS · Twilio</span>
          </div>
          <h1 className="text-4xl font-black uppercase tracking-tighter text-foreground">SMS Control</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Manage order-status SMS templates, test your provider connection, and inspect recent SMS attempts.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="h-11 rounded-xl bg-white">
          <RefreshCcw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
        </Button>
      </header>

      {notice && (
        <div role={notice.error ? 'alert' : 'status'} className={cn(
          'rounded-xl border p-4 text-sm font-semibold',
          notice.error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        )}>{notice.text}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-start gap-4">
            {providerReady
              ? <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
              : <ShieldX className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />}
            <div>
              <h2 className="font-black uppercase tracking-tight">Twilio connection {providerReady ? 'configured' : 'not configured'}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {providerReady
                  ? 'Required server-side credentials are present. Send a test below to verify provider acceptance.'
                  : 'Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to your deployment environment to enable SMS.'}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                In Vercel, set these under Project Settings → Environment Variables, then redeploy. Secret values are never shown in this page.
              </p>
            </div>
          </div>
        </Card>
        <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">SMS provider</p>
          <p className="mt-2 text-2xl font-black">Twilio</p>
          <p className="mt-1 text-sm text-slate-500">Configured sender is held server-side</p>
        </Card>
      </div>

      <Card className="space-y-5 rounded-3xl border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">SMS connection test</h2>
          <p className="mt-1 text-sm text-slate-500">Test messages go only to the phone number you enter. Provider acceptance does not confirm delivery.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-xs font-bold text-slate-700">
            Test destination
            <Input value={testPhone} onChange={event => setTestPhone(event.target.value)} placeholder="+254712345678" className="mt-1.5" autoComplete="tel" />
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Sample order status
            <select
              value={testStatus}
              onChange={event => {
                const status = event.target.value as CustomerNotificationStatus;
                setTestStatus(status);
                setTestMessage(renderSample(config[status].smsMessage || config[status].message));
              }}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {CUSTOMER_NOTIFICATION_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
        </div>
        <Textarea value={testMessage} onChange={event => setTestMessage(event.target.value)} maxLength={2000} rows={3} aria-label="Test SMS message" />
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-xs font-semibold text-slate-500">
            Preview: {segmentCount.encoding} · {segmentCount.units} units · {segmentCount.segments} SMS segment{segmentCount.segments === 1 ? '' : 's'}
          </p>
          <Button onClick={() => void sendTest()} disabled={sending || !providerReady || !testPhone.trim() || !testMessage.trim()} className="rounded-xl">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send test to my phone
          </Button>
        </div>
      </Card>

      <Card className="space-y-5 rounded-3xl border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Order-status SMS</h2>
            <p className="mt-1 text-sm text-slate-500">
              SMS templates are independent from email and WhatsApp. Variables include {'{name}'}, {'{orderId}'}, {'{status}'}, {'{total}'}, {'{rider_name}'}, {'{rider_phone}'}, {'{eta}'}, and {'{tracking_link}'}.
            </p>
          </div>
          <Button onClick={() => void save()} disabled={saving || loading} className="rounded-xl">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save SMS settings
          </Button>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {CUSTOMER_NOTIFICATION_STATUSES.map(status => {
            const rule = config[status];
            const smsEnabled = rule.channels.includes('sms');
            const template = rule.smsMessage || rule.message;
            const preview = renderSample(template);
            const segments = getSmsSegments(preview);
            return (
              <section key={status} className="space-y-3 rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-black uppercase tracking-wide">{status}</h3>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={smsEnabled}
                      onChange={event => toggleSms(status, event.target.checked)}
                      aria-label={`Enable SMS for ${status}`}
                    />
                    SMS channel enabled
                  </label>
                </div>
                {!rule.enabled && <p className="rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-800">This order-status automation is disabled in Message Automation.</p>}
                <Textarea
                  aria-label={`${status} SMS template`}
                  value={template}
                  maxLength={2000}
                  rows={4}
                  onChange={event => setConfig(current => ({
                    ...current,
                    [status]: { ...current[status], smsMessage: event.target.value }
                  }))}
                />
                <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                  <span>{preview.length} characters · {segments.encoding} · {segments.segments} segment{segments.segments === 1 ? '' : 's'}</span>
                  <span>{smsEnabled ? 'SMS selected for this status' : 'SMS not selected for this status'}</span>
                </div>
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{preview}</p>
              </section>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-4 rounded-3xl border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Recent SMS attempts</h2>
            <p className="mt-1 text-sm text-slate-500">“Sent” means Twilio accepted the API request; delivery receipts are not currently connected.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{deliveries.length} records</span>
        </div>
        {deliveries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {loading ? 'Loading SMS attempts…' : 'No SMS attempts in the recent delivery log.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wider text-slate-500">
                  <th className="p-3">Order</th><th className="p-3">Recipient</th><th className="p-3">Status</th><th className="p-3">Attempt</th><th className="p-3">Time</th><th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map(delivery => (
                  <tr key={delivery.id} className="border-b border-slate-100 align-top">
                    <td className="p-3 font-bold">{delivery.order_id ? `#${delivery.order_id}` : 'Test'}</td>
                    <td className="p-3">
                      <span className="block font-semibold">{delivery.customer?.name || 'Customer'}</span>
                      <span className="text-xs text-slate-500">{maskPhone(delivery.customer?.phone || '')}</span>
                    </td>
                    <td className="p-3">
                      <span className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-bold uppercase',
                        delivery.delivery_status === 'sent' ? 'bg-emerald-50 text-emerald-700'
                          : delivery.delivery_status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                      )}>{delivery.delivery_status}</span>
                      {delivery.error_message && <p className="mt-2 max-w-xs text-xs text-rose-700">{delivery.error_message}</p>}
                    </td>
                    <td className="p-3">{delivery.notification_status}</td>
                    <td className="p-3 whitespace-nowrap text-xs text-slate-500">{formatTime(delivery.created_at)}</td>
                    <td className="p-3">
                      {delivery.delivery_status === 'failed' && delivery.order_id > 0 && (
                        <Button size="sm" variant="outline" onClick={() => void retry(delivery)} disabled={retrying === delivery.id}>
                          {retrying === delivery.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" /> Retry</>}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
