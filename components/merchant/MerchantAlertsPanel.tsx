'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle2, Loader2, RefreshCw, ShieldAlert, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ensurePushServiceWorkerReady } from '@/lib/pushServiceWorker';

type Channel = 'push' | 'sms' | 'voice';
type Contact = {
  id: string;
  name: string;
  phone: string;
  role: string | null;
  channels: Channel[];
  shift_start: string;
  shift_end: string;
  language: 'en' | 'sw';
  active: boolean;
};
type AlertEntry = {
  id: number;
  order_id: number | null;
  channel: string;
  step: string;
  status: string;
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  accepted_at: string | null;
  created_at: string;
};
type AlertConfiguration = {
  pushConfigured: boolean;
  webPushPublicKey: string | null;
  smsConfigured: boolean;
  voiceConfigured: boolean;
  redisConfigured: boolean;
  workerRequired: boolean;
  workerLastSeenAt: string | null;
  workerHealthy: boolean;
};
type AlertData = {
  contacts: Contact[];
  devices: Array<{ id: string; contact_id: string; user_agent: string | null; last_seen_at: string }>;
  alerts: AlertEntry[];
  configuration: AlertConfiguration;
};

const channelLabels: Record<Channel, string> = { push: 'App alert', sms: 'SMS', voice: 'Phone call' };

function base64UrlToBytes(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const decoded = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

function displayTime(value: string | null) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

function healthClass(healthy: boolean) {
  return healthy ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-950';
}

function ContactEditor({
  contact,
  disabled,
  deviceCount,
  onSave,
  onRemove,
  onRegister,
  onTest
}: {
  contact: Contact;
  disabled: boolean;
  deviceCount: number;
  onSave: (contact: Contact) => Promise<void>;
  onRemove: (contact: Contact) => Promise<void>;
  onRegister: (contact: Contact) => Promise<void>;
  onTest: (contact: Contact) => Promise<void>;
}) {
  const [draft, setDraft] = useState(contact);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');
  const [localMessage, setLocalMessage] = useState('');

  useEffect(() => setDraft(contact), [contact]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setLocalError('');
    setLocalMessage('');
    try {
      await onSave(draft);
      setLocalMessage('Alert settings saved.');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Alert settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggleChannel = (channel: Channel) => {
    setDraft(current => ({
      ...current,
      channels: current.channels.includes(channel)
        ? current.channels.filter(item => item !== channel)
        : [...current.channels, channel]
    }));
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <form onSubmit={event => void submit(event)} className="space-y-4">
        <p className="text-sm font-bold text-slate-900">{contact.role || 'Alert contact'} · {deviceCount} registered device{deviceCount === 1 ? '' : 's'}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">Name
            <Input required maxLength={120} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} className="mt-1 h-10" />
          </label>
          <label className="text-xs font-bold text-slate-600">Phone number
            <Input required maxLength={40} type="tel" value={draft.phone} onChange={event => setDraft(current => ({ ...current, phone: event.target.value }))} className="mt-1 h-10" />
          </label>
          <label className="text-xs font-bold text-slate-600">Role (optional)
            <Input maxLength={120} value={draft.role || ''} onChange={event => setDraft(current => ({ ...current, role: event.target.value || null }))} className="mt-1 h-10" />
          </label>
          <label className="text-xs font-bold text-slate-600">Language
            <select value={draft.language} onChange={event => setDraft(current => ({ ...current, language: event.target.value as 'en' | 'sw' }))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="en">English</option>
              <option value="sw">Kiswahili</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">Shift starts (East Africa Time)
            <Input type="time" required value={draft.shift_start.slice(0, 5)} onChange={event => setDraft(current => ({ ...current, shift_start: event.target.value }))} className="mt-1 h-10" />
          </label>
          <label className="text-xs font-bold text-slate-600">Shift ends (East Africa Time)
            <Input type="time" required value={draft.shift_end.slice(0, 5)} onChange={event => setDraft(current => ({ ...current, shift_end: event.target.value }))} className="mt-1 h-10" />
          </label>
        </div>
        <fieldset>
          <legend className="text-xs font-black uppercase tracking-wide text-slate-500">Alert channels</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['push', 'sms', 'voice'] as const).map(channel => (
              <label key={channel} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={draft.channels.includes(channel)} onChange={() => toggleChannel(channel)} className="h-4 w-4 accent-primary" />
                {channelLabels[channel]}
              </label>
            ))}
          </div>
        </fieldset>
        {localError && <p role="alert" className="text-sm text-rose-700">{localError}</p>}
        {localMessage && <p role="status" className="text-sm text-emerald-700">{localMessage}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={disabled || saving || draft.channels.length === 0} className="rounded-xl">
            {saving && <Loader2 size={15} className="mr-2 animate-spin" />} Save settings
          </Button>
          {draft.channels.includes('push') && <>
            <Button type="button" variant="outline" disabled={disabled || saving} onClick={() => void onRegister(draft)} className="rounded-xl">
              <Smartphone size={15} className="mr-2" /> Register this device
            </Button>
            <Button type="button" variant="outline" disabled={disabled || saving} onClick={() => void onTest(draft)} className="rounded-xl">
              <BellRing size={15} className="mr-2" /> Send test alert
            </Button>
          </>}
          <Button type="button" variant="outline" disabled={disabled || saving} onClick={() => void onRemove(draft)} className="rounded-xl text-rose-700">
            Remove
          </Button>
        </div>
      </form>
    </article>
  );
}

export default function MerchantAlertsPanel({
  accessToken,
  applicationId,
  canOperate
}: {
  accessToken: string;
  applicationId: string;
  canOperate: boolean;
}) {
  const [data, setData] = useState<AlertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine);
  const [androidBrand, setAndroidBrand] = useState<'tecno-infinix' | 'samsung' | 'xiaomi'>('tecno-infinix');
  const [notificationPermission, setNotificationPermission] = useState<'unsupported' | NotificationPermission>('default');
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    role: '',
    phone: '',
    channels: ['push'] as Channel[],
    shift_start: '00:00',
    shift_end: '23:59',
    language: 'en' as 'en' | 'sw'
  });

  const load = useCallback(async () => {
    if (!accessToken || !applicationId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/merchant/alerts?applicationId=${encodeURIComponent(applicationId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const payload = await response.json() as AlertData & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Order alert settings could not be loaded.');
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Order alert settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, applicationId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    if ('Notification' in window) setNotificationPermission(Notification.permission);
    else setNotificationPermission('unsupported');
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration('/').then(registration => setServiceWorkerReady(Boolean(registration?.active)));
    }
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const api = useCallback(async (method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>) => {
    const response = await fetch('/api/merchant/alerts', {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, applicationId })
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || 'The alert setting could not be saved.');
  }, [accessToken, applicationId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!navigator.onLine || !('serviceWorker' in navigator)) return;
      void navigator.serviceWorker.getRegistration('/').then(async registration => {
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) await api('POST', { operation: 'heartbeat', endpoint: subscription.endpoint });
      }).catch(heartbeatError => {
        setError(heartbeatError instanceof Error ? heartbeatError.message : 'This device heartbeat could not be recorded.');
      });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [api]);

  const perform = async (action: () => Promise<void>, successMessage: string) => {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      await action();
      await load();
      setMessage(successMessage);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The alert action could not be completed.');
    } finally {
      setWorking(false);
    }
  };

  const addContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await perform(async () => {
      await api('POST', { operation: 'contact', contact: newContact });
      setNewContact(current => ({ ...current, name: '', role: '', phone: '' }));
    }, 'Alert person added.');
  };

  const registerDevice = async (contact: Contact) => {
    const publicKey = data?.configuration.webPushPublicKey;
    if (!publicKey) {
      setError('Web Push is not configured on the server. Add the VAPID public and private keys first.');
      return;
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setError('This browser does not support web push. Try an up-to-date Android browser or install the merchant app.');
      return;
    }
    await perform(async () => {
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== 'granted') throw new Error('Allow notifications in your browser settings, then register this device again.');
      const registration = await ensurePushServiceWorkerReady();
      setServiceWorkerReady(true);
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(publicKey)
        });
      }
      await api('POST', { operation: 'subscribe', contactId: contact.id, subscription: subscription.toJSON() });
    }, `This device is registered for ${contact.name}'s app alerts.`);
  };

  const sendTest = async (contact: Contact) => {
    await perform(async () => {
      await api('POST', { operation: 'test', contactId: contact.id });
    }, `Test app alert sent to ${contact.name}'s registered devices.`);
  };

  const healthItems = useMemo(() => {
    const deviceCount = data?.devices.length || 0;
    return [
      { label: 'Notifications allowed', good: notificationPermission === 'granted', detail: notificationPermission === 'granted' ? 'Browser permission is on.' : notificationPermission === 'denied' ? 'Notifications are blocked in browser settings.' : 'Allow notifications in the browser, then register this device.' },
      { label: 'Internet connection', good: online, detail: online ? 'This device reports an active connection.' : 'This device is offline; app acceptance will not work until it reconnects.' },
      { label: 'Service worker ready', good: serviceWorkerReady, detail: serviceWorkerReady ? 'Background push is available for this browser.' : 'Register a device below to install the notification service worker.' },
      { label: 'Push provider configured', good: Boolean(data?.configuration.pushConfigured), detail: data?.configuration.pushConfigured ? 'VAPID push configuration is present.' : 'Set WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, and WEB_PUSH_SUBJECT.' },
      { label: 'Registered devices', good: deviceCount > 0, detail: `${deviceCount} device${deviceCount === 1 ? '' : 's'} registered for this business.` },
      { label: 'Device heartbeat', good: Boolean(data?.devices.some(device => Date.now() - new Date(device.last_seen_at).getTime() < 90_000)), detail: data?.devices.length ? `Most recent registered-device check-in: ${displayTime([...data.devices].sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime())[0].last_seen_at)}.` : 'Register this browser to start device check-ins every 30 seconds.' },
      { label: 'SMS escalation', good: Boolean(data?.configuration.smsConfigured), detail: data?.configuration.smsConfigured ? 'Redis queue and Twilio are configured.' : 'Set REDIS_URL and Twilio SMS credentials to enable the 20-second SMS step.' },
      { label: 'Voice escalation worker', good: Boolean(data?.configuration.voiceConfigured && data.configuration.workerHealthy), detail: data?.configuration.workerHealthy ? `Worker heartbeat ${data.configuration.workerLastSeenAt ? displayTime(data.configuration.workerLastSeenAt) : 'recently received'}.` : 'The alert worker is not reporting a recent heartbeat, or voice credentials are incomplete.' }
    ];
  }, [data, notificationPermission, online, serviceWorkerReady]);

  if (loading && !data) return <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-3 animate-spin text-primary" />Loading alert settings...</div>;

  return (
    <section className="space-y-5">
      <header className="rounded-2xl bg-slate-950 p-5 text-white sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Merchant order alerts</p>
        <h2 className="mt-2 text-2xl font-black">Make sure your team can hear every order</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Push sends immediately, SMS is scheduled for 20 seconds, a voice call for 60 seconds, and unanswered orders are marked missed and offered to another merchant at 90 seconds. Alerts ignore quiet hours and only go to active contacts on shift.</p>
        <p className="mt-3 text-xs text-slate-300">Browser notifications use the phone’s normal notification sound and cannot reliably read volume or battery-optimization settings. A native Android app is needed for a dependable looping loud ring.</p>
      </header>

      {(error || message) && <div role={error ? 'alert' : 'status'} className={`rounded-xl p-4 text-sm ${error ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>{error || message}</div>}

      <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-lg font-black text-slate-900">Alerts health check</h3><p className="mt-1 text-sm text-slate-500">Checks available in this browser and on the server.</p></div>
          <Button type="button" variant="outline" disabled={working} onClick={() => void load()} className="rounded-xl"><RefreshCw size={15} className="mr-2" /> Refresh checks</Button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {healthItems.map(item => <article key={item.label} className={`rounded-xl border p-3 ${healthClass(item.good)}`}>
            <p className="flex items-center gap-2 text-sm font-black">{item.good ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}{item.label}</p>
            <p className="mt-1 text-xs leading-5">{item.detail}</p>
          </article>)}
          <article className={`rounded-xl border p-3 ${healthClass(false)}`}>
            <p className="flex items-center gap-2 text-sm font-black"><ShieldAlert size={16} /> Battery and volume</p>
            <p className="mt-1 text-xs leading-5">Browsers cannot verify volume or change battery settings. On Android, allow background activity and notifications for this app, disable battery restrictions, and raise notification volume.</p>
            <label className="mt-3 block text-xs font-bold">Android phone brand
              <select value={androidBrand} onChange={event => setAndroidBrand(event.target.value as typeof androidBrand)} className="mt-1 h-10 w-full rounded-lg border border-amber-300 bg-white px-3 text-sm text-slate-800">
                <option value="tecno-infinix">Tecno / Infinix</option>
                <option value="samsung">Samsung</option>
                <option value="xiaomi">Xiaomi</option>
              </select>
            </label>
            <p className="mt-2 text-xs leading-5">
              {androidBrand === 'tecno-infinix' && 'Settings → Apps → Online Bar → Battery usage: allow background activity. Also check Phone Master / Power Marathon and exclude Online Bar from cleanup.'}
              {androidBrand === 'samsung' && 'Settings → Apps → Online Bar → Battery: choose Unrestricted. Check Battery → Background usage limits and remove Online Bar from Sleeping apps.'}
              {androidBrand === 'xiaomi' && 'Settings → Apps → Manage apps → Online Bar → Battery saver: No restrictions. Enable Autostart and allow notifications.'}
            </p>
          </article>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <form onSubmit={event => void addContact(event)} className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
          <div><h3 className="text-lg font-black text-slate-900">Add alert person</h3><p className="mt-1 text-sm text-slate-500">Add the owner, manager, cashier or backup contact.</p></div>
          <Input required maxLength={120} placeholder="Name" value={newContact.name} onChange={event => setNewContact(current => ({ ...current, name: event.target.value }))} />
          <Input maxLength={120} placeholder="Role (e.g. Night cashier)" value={newContact.role} onChange={event => setNewContact(current => ({ ...current, role: event.target.value }))} />
          <Input required maxLength={40} type="tel" placeholder="Phone number (include country code)" value={newContact.phone} onChange={event => setNewContact(current => ({ ...current, phone: event.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-600">Shift starts<input type="time" required value={newContact.shift_start} onChange={event => setNewContact(current => ({ ...current, shift_start: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
            <label className="text-xs font-bold text-slate-600">Shift ends<input type="time" required value={newContact.shift_end} onChange={event => setNewContact(current => ({ ...current, shift_end: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
          </div>
          <label className="block text-xs font-bold text-slate-600">Language<select value={newContact.language} onChange={event => setNewContact(current => ({ ...current, language: event.target.value as 'en' | 'sw' }))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="en">English</option><option value="sw">Kiswahili</option></select></label>
          <fieldset><legend className="text-xs font-black uppercase tracking-wide text-slate-500">Channels</legend><div className="mt-2 flex flex-wrap gap-2">{(['push', 'sms', 'voice'] as const).map(channel => <label key={channel} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold"><input type="checkbox" checked={newContact.channels.includes(channel)} onChange={() => setNewContact(current => ({ ...current, channels: current.channels.includes(channel) ? current.channels.filter(item => item !== channel) : [...current.channels, channel] }))} className="h-4 w-4 accent-primary" />{channelLabels[channel]}</label>)}</div></fieldset>
          <Button type="submit" disabled={!canOperate || working || newContact.channels.length === 0} className="w-full rounded-xl">{working && <Loader2 size={15} className="mr-2 animate-spin" />} Add person</Button>
        </form>

        <div className="space-y-3">
          <h3 className="text-lg font-black text-slate-900">Who gets alerted</h3>
          {!data?.contacts.length && <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">No alert contacts yet. Add a person, then register their device for app alerts.</p>}
          {data?.contacts.map(contact => <ContactEditor
            key={contact.id}
            contact={contact}
            deviceCount={data.devices.filter(device => device.contact_id === contact.id).length}
            disabled={!canOperate || working}
            onSave={async updated => {
              await api('PATCH', { contact: updated });
              await load();
            }}
            onRemove={async removed => {
              if (!window.confirm(`Remove ${removed.name} from this business's alert list?`)) return;
              await perform(async () => {
                await api('DELETE', { contactId: removed.id });
              }, `${removed.name} removed from order alerts.`);
            }}
            onRegister={registerDevice}
            onTest={sendTest}
          />)}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-lg font-black text-slate-900">Alert ladder and delivery log</h3>
        <ol className="mt-3 grid gap-2 sm:grid-cols-4">
          {['0 sec · App push', '20 sec · SMS', '60 sec · Phone call', '90 sec · Missed and rerouted'].map(step => <li key={step} className="rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700">{step}</li>)}
        </ol>
        <div className="mt-5 divide-y divide-slate-100">
          {!data?.alerts.length && <p className="py-4 text-sm text-slate-500">No order alert deliveries recorded yet.</p>}
          {data?.alerts.map(alert => <div key={alert.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
            <div><p className="font-bold text-slate-800">{alert.order_id ? `Order #${alert.order_id}` : 'Alert test'} · {alert.channel} · {alert.step.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-slate-500">{displayTime(alert.sent_at || alert.created_at)}{alert.delivered_at ? ` · delivered ${displayTime(alert.delivered_at)}` : ''}{alert.accepted_at ? ` · accepted ${displayTime(alert.accepted_at)}` : ''}</p>{alert.error && <p className="mt-1 text-xs text-rose-700">{alert.error}</p>}</div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${alert.status === 'sent' || alert.status === 'delivered' || alert.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' : alert.status === 'failed' || alert.status === 'missed' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>{alert.status}</span>
          </div>)}
        </div>
      </div>
    </section>
  );
}
