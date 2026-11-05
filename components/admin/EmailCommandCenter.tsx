'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, ExternalLink, Mail, RefreshCw, Search, Send, ShieldCheck, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Contact = { email: string; name: string; sources: string[] };
type MessageLog = {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  category: string;
  status: string;
  error_message: string | null;
  sent_by: string | null;
  created_at: string;
};
type CenterData = {
  provider: { provider: string | null; from: string; configured: boolean };
  contacts: Contact[];
  messages: MessageLog[];
  webhookEvents: { event_id: string; event_type: string; received_at: string }[];
  suppressions: { email: string; reason: string; created_at: string }[];
  migrationRequired: boolean;
  migrationFiles: string[];
  canSend: boolean;
  sourceErrors: string[];
  sourceStatus: { orders: boolean; newsletter: boolean; waitlist: boolean };
  domainHealth: {
    domain: string;
    spf: string;
    dmarc: string;
    dkim: string;
    dkimSelector: string | null;
    error: string | null;
  };
};

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function EmailCommandCenter() {
  const [data, setData] = useState<CenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'operational' | 'driver_invite'>('operational');
  const [recipient, setRecipient] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/email-center', { cache: 'no-store' });
      const result = await response.json() as CenterData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Email Command Center could not load.');
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Email Command Center could not load.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const contacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.contacts || []).filter(contact =>
      !query || contact.email.includes(query) || contact.name.toLowerCase().includes(query)
      || contact.sources.some(source => source.toLowerCase().includes(query))
    );
  }, [data?.contacts, search]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/email-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: mode,
          email: recipient,
          name: recipientName,
          subject,
          message
        })
      });
      const result = await response.json() as { error?: string; sent?: boolean };
      if (!response.ok) throw new Error(result.error || 'Email could not be sent.');
      setNotice(mode === 'driver_invite' ? 'Secure onboarding email sent.' : 'Email sent and recorded.');
      setRecipient('');
      setRecipientName('');
      setSubject('');
      setMessage('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Email could not be sent.');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen space-y-6 bg-slate-50 p-4 text-slate-900 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Online Bar Kenya · onlinebar.co.ke</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Email Command Center</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Manage transactional email, secure driver onboarding, opted-in offers, and delivery activity in one place.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading} className="rounded-xl">
          <RefreshCw size={15} className={`mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}

      {data?.migrationRequired && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Email activity or provider event storage is not installed. Run <code className="font-bold">{data.migrationFiles.join(' and ')}</code> in the Supabase SQL Editor, then refresh.
        </div>
      )}
      {data?.sourceErrors.map((sourceError) => (
        <div key={sourceError} role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{sourceError}</div>
      ))}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-2xl p-5">
          <p className="text-xs font-bold uppercase text-slate-500">Provider</p>
          <p className="mt-2 text-lg font-black">{data?.provider.configured ? data.provider.provider : 'Not configured'}</p>
          <p className="mt-1 break-all text-xs text-slate-500">{data?.provider.from || 'Set JMSURF_MAIL_KEY and JMSURF_FROM_EMAIL in Vercel.'}</p>
        </Card>
        <Card className="rounded-2xl p-5">
          <p className="text-xs font-bold uppercase text-slate-500">Known email contacts</p>
          <p className="mt-2 text-2xl font-black">{data?.contacts.length ?? '—'}</p>
          <p className="mt-1 text-xs text-slate-500">Orders and available opted-in lists</p>
        </Card>
        <Card className="rounded-2xl p-5">
          <p className="text-xs font-bold uppercase text-slate-500">Recent messages</p>
          <p className="mt-2 text-2xl font-black">{data?.messages.length ?? '—'}</p>
          <p className="mt-1 text-xs text-slate-500">Direct, order, campaign and ticket email logs</p>
        </Card>
        <Card className="rounded-2xl p-5">
          <p className="text-xs font-bold uppercase text-slate-500">Suppressed addresses</p>
          <p className="mt-2 text-2xl font-black">{data?.suppressions.length ?? '—'}</p>
          <p className="mt-1 text-xs text-slate-500">Bounces and complaints recorded</p>
        </Card>
      </section>

      {data && (
        <Card className="rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-black">Domain authentication · {data.domainHealth.domain}</h2><p className="mt-1 text-xs text-slate-500">Public TXT records; this does not prove sender alignment with your mail provider.</p></div>
            <ShieldCheck className="text-amber-700" size={20} aria-hidden="true" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <DnsStatus label="SPF" status={data.domainHealth.spf} />
            <DnsStatus label="DMARC" status={data.domainHealth.dmarc} />
            <DnsStatus label={`DKIM${data.domainHealth.dkimSelector ? ` · ${data.domainHealth.dkimSelector}` : ''}`} status={data.domainHealth.dkim} />
          </div>
          {data.domainHealth.error && <p role="status" className="mt-3 text-xs text-amber-800">{data.domainHealth.error}</p>}
          {data.domainHealth.dkim === 'selector_required' && <p className="mt-3 text-xs text-slate-500">Set the provider’s selector as server-only <code>JMSURF_DKIM_SELECTOR</code> in Vercel to check the DKIM record.</p>}
        </Card>
      )}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
        <Card className="rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Automated email workflows</h2>
              <p className="mt-1 text-sm text-slate-500">Existing app automations; provider credentials are configured separately in Vercel.</p>
            </div>
            <ShieldCheck className="text-emerald-700" size={20} aria-hidden="true" />
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            <Workflow title="Order receipts and delivery updates" detail="Paid, dispatched, out-for-delivery and delivered notices" href="/lord/communications/automation" />
            <Workflow title="Driver onboarding one-time link" detail="Issue a secure Supabase invitation and email the sign-in link" href="#compose" />
            <Workflow title="Abandoned-cart recovery" detail="Review carts and trigger recovery emails from the recovery workspace" href="/lord/abandoned" />
            <Workflow title="Offers and newsletters" detail="Only send to active newsletter or waitlist email-consent audiences" href="/lord/broadcast" />
            <Workflow title="Customer support" detail="Website support requests are available in the support inbox; inbound email forwarding is not connected here." href="/lord/messages" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:underline" href="/lord/communications/automation">Edit automations <ExternalLink size={12} /></Link>
            <Link className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:underline" href="/lord/broadcast">Create opted-in offer <ExternalLink size={12} /></Link>
            <Link className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:underline" href="/lord/ticketing/email-preview">Ticket email templates <ExternalLink size={12} /></Link>
          </div>
        </Card>

        <Card id="compose" className="scroll-mt-24 rounded-2xl p-5 sm:p-6">
          <div className="flex gap-2">
            <Button type="button" variant={mode === 'operational' ? 'default' : 'outline'} onClick={() => setMode('operational')} className="rounded-xl">
              <Mail size={15} className="mr-2" /> Direct email
            </Button>
            <Button type="button" variant={mode === 'driver_invite' ? 'default' : 'outline'} onClick={() => setMode('driver_invite')} className="rounded-xl">
              <UserPlus size={15} className="mr-2" /> Driver invite
            </Button>
          </div>
          <h2 className="mt-5 text-lg font-black">{mode === 'driver_invite' ? 'Invite a driver' : 'Send an operational email'}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {mode === 'driver_invite'
              ? 'Creates a Supabase invitation and sends its one-time onboarding link. No custom OTP is exposed or stored.'
              : 'One recipient at a time for instructions and service communication. For promotions, use consent-based campaigns.'}
          </p>
          <form onSubmit={send} className="mt-4 space-y-3">
            <Input required type="email" maxLength={254} value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="recipient@example.com" />
            {mode === 'operational' && <>
              <Input maxLength={120} value={recipientName} onChange={event => setRecipientName(event.target.value)} placeholder="Recipient name (optional)" />
              <Input required maxLength={180} value={subject} onChange={event => setSubject(event.target.value)} placeholder="Subject" />
              <Textarea required maxLength={5000} rows={5} value={message} onChange={event => setMessage(event.target.value)} placeholder="Write service instructions or a direct communication..." />
            </>}
            <Button type="submit" disabled={sending || !data?.provider.configured || data?.canSend === false} className="w-full rounded-xl">
              <Send size={15} className="mr-2" /> {sending ? 'Sending…' : mode === 'driver_invite' ? 'Send secure onboarding link' : 'Send email'}
            </Button>
            {!data?.provider.configured && <p className="text-xs text-rose-700">Email sending is disabled until a provider and verified sender are configured.</p>}
          </form>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-black">Email directory</h2><p className="text-xs text-slate-500">Order contacts are not marketing opt-ins. Source labels show list consent.</p></div>
            <div className="relative w-full sm:w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} className="pl-9" placeholder="Search emails..." /></div>
          </div>
          <div className="mt-4 max-h-[440px] overflow-auto">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="sticky top-0 bg-white text-slate-500"><tr><th className="py-2">Name</th><th>Email</th><th>Source / consent</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.map(contact => <tr key={contact.email}>
                  <td className="py-3 pr-3 font-semibold">{contact.name}</td>
                  <td className="pr-3">{contact.email}</td>
                  <td className="pr-3 text-slate-500">{contact.sources.join(', ')}</td>
                  <td><button type="button" onClick={() => { setMode('operational'); setRecipient(contact.email); setRecipientName(contact.name); }} className="font-bold text-amber-800 hover:underline">Use</button></td>
                </tr>)}
                {!loading && contacts.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-500">No matching email contacts.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="rounded-2xl p-5 sm:p-6">
          <h2 className="text-lg font-black">Recent outbound email</h2>
          <p className="mt-1 text-xs text-slate-500">Provider delivery and engagement status is updated by the signed JMSURF webhook.</p>
          <div className="mt-4 max-h-[440px] space-y-2 overflow-auto">
            {data?.messages.map(item => (
              <div key={item.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="break-all text-xs font-bold">{item.recipient_email}</p>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${item.status === 'failed' || item.status === 'bounced' || item.status === 'complained' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'}`}>{item.status}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{item.subject}</p>
                <p className="mt-1 text-[10px] text-slate-400">{item.category.replace('_', ' ')} · {formatDate(item.created_at)}{item.sent_by ? ` · ${item.sent_by}` : ''}</p>
                {item.error_message && <p className="mt-1 text-xs text-rose-700">{item.error_message}</p>}
              </div>
            ))}
            {!loading && !data?.messages.length && <p className="py-8 text-center text-sm text-slate-500">No direct emails have been sent yet.</p>}
          </div>
          {data?.webhookEvents.length ? <p className="mt-3 flex items-center gap-1 text-xs text-emerald-800"><CheckCircle2 size={14} /> {data.webhookEvents.length} recent provider status events received</p> : null}
          {data?.suppressions.length ? <p className="mt-2 flex items-center gap-1 text-xs text-amber-800"><AlertCircle size={14} /> Bounced or complained addresses are blocked from direct sends.</p> : null}
        </Card>
      </section>

      <Card className="rounded-2xl p-5 sm:p-6">
        <h2 className="text-lg font-black">Suppression list</h2>
        <p className="mt-1 text-xs text-slate-500">Addresses with a bounce or complaint are excluded from direct sends, transactional order email, and marketing campaigns.</p>
        <div className="mt-4 max-h-64 overflow-auto">
          <table className="w-full min-w-[400px] text-left text-xs">
            <thead className="sticky top-0 bg-white text-slate-500"><tr><th className="py-2">Email</th><th>Reason</th><th>Recorded</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data?.suppressions.map(item => (
                <tr key={item.email}>
                  <td className="py-2 pr-3">{item.email}</td>
                  <td className="pr-3 capitalize">{item.reason}</td>
                  <td className="text-slate-500">{formatDate(item.created_at)}</td>
                </tr>
              ))}
              {!data?.suppressions.length && <tr><td colSpan={3} className="py-6 text-center text-slate-500">No addresses are currently suppressed.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs leading-5 text-slate-500">
        SPF and DMARC can be checked in your DNS host. DKIM selectors and inbound email parsing depend on your mail provider configuration and are not represented as verified here. Set up provider webhooks at <code>/api/webhooks/jmsurf-mail</code>; keep the webhook secret only in Vercel.
      </p>
    </main>
  );
}

function Workflow({ title, detail, href }: { title: string; detail: string; href: string }) {
  return (
    <Link href={href} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0 hover:bg-slate-50">
      <span><span className="block text-sm font-bold">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span></span>
      <ExternalLink size={14} className="mt-1 shrink-0 text-slate-400" />
    </Link>
  );
}

function DnsStatus({ label, status }: { label: string; status: string }) {
  const configured = status === 'configured';
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
      <span className="text-sm font-bold">{label}</span>
      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${configured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
        {status.replace('_', ' ')}
      </span>
    </div>
  );
}
