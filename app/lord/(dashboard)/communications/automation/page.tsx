'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, Check, Loader2, Mail, MessageCircle, MessageSquareText, RefreshCcw, Save, Search, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  CUSTOMER_NOTIFICATION_CHANNELS,
  CUSTOMER_NOTIFICATION_STATUSES,
  DEFAULT_CUSTOMER_NOTIFICATION_CONFIG,
  type CustomerNotificationChannel,
  type CustomerNotificationConfig
} from '@/lib/customerMessaging';
import { cn } from '@/lib/utils';

interface MessagingCustomer {
  key: string;
  name: string;
  email: string;
  phone: string;
  latestOrderId: number;
  channels: CustomerNotificationChannel[] | null;
}

const channelLabels: Record<CustomerNotificationChannel, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  push: 'Web Push'
};
const channelIcons: Record<CustomerNotificationChannel, typeof Bell> = {
  email: Mail,
  whatsapp: MessageCircle,
  sms: MessageSquareText,
  push: Bell
};

function getDefaultChannels(config: CustomerNotificationConfig) {
  return CUSTOMER_NOTIFICATION_CHANNELS.filter(channel =>
    CUSTOMER_NOTIFICATION_STATUSES.some(status => config[status].enabled && config[status].channels.includes(channel))
  );
}

export default function CustomerMessagingAutomationPage() {
  const [config, setConfig] = useState<CustomerNotificationConfig>(DEFAULT_CUSTOMER_NOTIFICATION_CONFIG);
  const [customers, setCustomers] = useState<MessagingCustomer[]>([]);
  const [draftChannels, setDraftChannels] = useState<Record<string, CustomerNotificationChannel[]>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/customer-messaging', { cache: 'no-store' });
      const result = await response.json() as {
        error?: string;
        config?: CustomerNotificationConfig;
        customers?: MessagingCustomer[];
      };
      if (!response.ok) throw new Error(result.error || 'Could not load messaging settings.');
      const loadedConfig = result.config || DEFAULT_CUSTOMER_NOTIFICATION_CONFIG;
      const defaultChannels = getDefaultChannels(loadedConfig);
      setConfig(loadedConfig);
      setCustomers(result.customers || []);
      setDraftChannels(Object.fromEntries((result.customers || []).map(customer => [
        customer.key,
        customer.channels || defaultChannels
      ])));
      setNotice(null);
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : 'Could not load messaging settings.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter(customer =>
      customer.name.toLowerCase().includes(query)
      || customer.email.toLowerCase().includes(query)
      || customer.phone.toLowerCase().includes(query)
    );
  }, [customers, search]);

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const response = await fetch('/api/admin/customer-messaging', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not save message templates.');
      const defaultChannels = getDefaultChannels(config);
      setDraftChannels(current => Object.fromEntries(customers.map(customer => [
        customer.key,
        customer.channels || defaultChannels || current[customer.key]
      ])));
      setNotice({ error: false, text: 'Automation rules and message templates saved.' });
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : 'Could not save message templates.' });
    } finally {
      setSavingConfig(false);
    }
  };

  const saveCustomer = async (customer: MessagingCustomer) => {
    setSavingCustomer(customer.key);
    try {
      const response = await fetch('/api/admin/customer-messaging', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: customer.email,
          phone: customer.phone,
          channels: draftChannels[customer.key] || []
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not save this customer’s channels.');
      setCustomers(current => current.map(item => item.key === customer.key
        ? { ...item, channels: draftChannels[customer.key] || [] }
        : item));
      setNotice({ error: false, text: `Channels saved for ${customer.name}.` });
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : 'Could not save customer channels.' });
    } finally {
      setSavingCustomer(null);
    }
  };

  const toggleCustomerChannel = (key: string, channel: CustomerNotificationChannel) => {
    setDraftChannels(current => {
      const selected = current[key] || [];
      return {
        ...current,
        [key]: selected.includes(channel)
          ? selected.filter(item => item !== channel)
          : [...selected, channel]
      };
    });
  };

  return (
    <div className="min-h-screen space-y-8 bg-slate-50 p-4 pb-40 text-left sm:p-8">
      <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-amber-700">
            <Send className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.25em]">Order communications</span>
          </div>
          <h1 className="text-4xl font-black uppercase tracking-tighter text-foreground">Message Automation</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Set what customers receive after payment, dispatch and delivery, then choose each customer’s channels.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="h-11 rounded-xl bg-white">
          <RefreshCcw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
        </Button>
      </header>

      {notice && (
        <div className={cn(
          'rounded-xl border p-4 text-sm font-semibold',
          notice.error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        )}>{notice.text}</div>
      )}

      <Card className="space-y-5 rounded-3xl border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Order status messages</h2>
          <p className="mt-1 text-sm text-slate-500">
            Templates support <code>{'{name}'}</code>, <code>{'{orderId}'}</code>, <code>{'{status}'}</code>, and <code>{'{trackingUrl}'}</code>.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {CUSTOMER_NOTIFICATION_STATUSES.map(status => {
            const rule = config[status];
            return (
              <section key={status} className="space-y-4 rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-black uppercase tracking-wide">{status}</h3>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={event => setConfig(current => ({
                        ...current,
                        [status]: { ...current[status], enabled: event.target.checked }
                      }))}
                    />
                    Automated
                  </label>
                </div>
                <Input
                  aria-label={`${status} email subject`}
                  value={rule.subject}
                  maxLength={180}
                  onChange={event => setConfig(current => ({
                    ...current, [status]: { ...current[status], subject: event.target.value }
                  }))}
                  placeholder="Email subject"
                />
                <Textarea
                  aria-label={`${status} message`}
                  value={rule.message}
                  maxLength={2000}
                  rows={5}
                  onChange={event => setConfig(current => ({
                    ...current, [status]: { ...current[status], message: event.target.value }
                  }))}
                  placeholder="Message customers receive"
                />
                <fieldset className="space-y-2">
                  <legend className="text-[10px] font-black uppercase tracking-widest text-slate-500">Default channels</legend>
                  <div className="flex flex-wrap gap-3">
                    {CUSTOMER_NOTIFICATION_CHANNELS.map(channel => {
                      const Icon = channelIcons[channel];
                      return (
                        <label key={channel} className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold">
                          <input
                            type="checkbox"
                            checked={rule.channels.includes(channel)}
                            onChange={event => setConfig(current => ({
                              ...current,
                              [status]: {
                                ...current[status],
                                channels: event.target.checked
                                  ? [...current[status].channels, channel]
                                  : current[status].channels.filter(item => item !== channel)
                              }
                            }))}
                          />
                          <Icon className="h-3.5 w-3.5" /> {channelLabels[channel]}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </section>
            );
          })}
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-xs text-slate-500">
            Email uses Resend, WhatsApp uses Meta Cloud API, SMS uses Twilio, and Web Push uses VAPID. Push only reaches signed-in customers who opt in on their device.
          </p>
          <Button onClick={() => void saveConfig()} disabled={savingConfig || loading} className="rounded-xl font-bold">
            {savingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save automation
          </Button>
        </div>
      </Card>

      <Card className="space-y-5 rounded-3xl border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Customer channel preferences</h2>
            <p className="mt-1 text-sm text-slate-500">
              A customer’s selection overrides the default channels for every enabled order update. Clear every box to opt them out.
            </p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={event => setSearch(event.target.value)} className="pl-9" placeholder="Find a customer" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm font-semibold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading recent order customers...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
            No order customers found. Customers appear here after placing an order.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredCustomers.map(customer => (
              <div key={customer.key} className="flex flex-col gap-4 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">{customer.name}</p>
                  <p className="mt-1 break-all text-xs text-slate-500">
                    {[customer.email, customer.phone].filter(Boolean).join(' · ') || 'No delivery contact'}
                  </p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Latest order #{customer.latestOrderId}
                    {customer.channels === null && ' · Using defaults'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {CUSTOMER_NOTIFICATION_CHANNELS.map(channel => {
                    const Icon = channelIcons[channel];
                    return (
                      <label key={channel} className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold">
                        <input
                          type="checkbox"
                          checked={(draftChannels[customer.key] || []).includes(channel)}
                          onChange={() => toggleCustomerChannel(customer.key, channel)}
                        />
                        <Icon className="h-4 w-4" /> {channelLabels[channel]}
                      </label>
                    );
                  })}
                  <Button
                    size="sm"
                    variant={customer.channels && JSON.stringify(customer.channels) === JSON.stringify(draftChannels[customer.key]) ? 'outline' : 'default'}
                    onClick={() => void saveCustomer(customer)}
                    disabled={savingCustomer === customer.key}
                    className="rounded-lg"
                  >
                    {savingCustomer === customer.key
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : customer.channels && JSON.stringify(customer.channels) === JSON.stringify(draftChannels[customer.key])
                        ? <><Check className="mr-1 h-4 w-4" /> Saved</>
                        : <><Save className="mr-1 h-4 w-4" /> Save</>}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="border-t border-slate-100 pt-4 text-xs text-slate-500">
          Customer directory is built from the latest 1,000 orders. Phone numbers are normalized to Kenya’s +254 format when sent.
        </p>
      </Card>
    </div>
  );
}
