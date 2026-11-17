'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Clock3, Mail, RefreshCcw, Send, ShoppingBag, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatPrice } from '@/lib/utils';

interface RecoverySession {
  id: string;
  customer_name: string;
  customer_email: string;
  cart_items: Array<{ id: number; name: string; quantity: number; price: number }>;
  total_price: number;
  status: 'active' | 'abandoned' | 'sending' | 'sent' | 'converted' | 'failed' | 'opted_out' | 'suppressed' | 'expired';
  suppression_reason: string | null;
  consent_active: boolean;
  last_activity_at: string;
  sent_at: string | null;
  recovered_order_id: number | null;
  recovered_revenue: number | null;
  failure_reason: string | null;
}

interface RecoveryDraft {
  subject: string;
  message: string;
}

const DEFAULT_SUBJECT = 'Your Online Bar cart is saved, {{first_name}}';
const DEFAULT_MESSAGE = 'Hi {{first_name}}, you left {{items}} in your cart. Pick up where you left off: {{checkout_url}}. Need help? Reply to this email.';

function formatPreview(template: string, session: RecoverySession) {
  const firstName = session.customer_name.trim().split(/\s+/)[0] || 'there';
  const items = session.cart_items.map(item => `${item.quantity} × ${item.name}`).join(', ');
  return template
    .replaceAll('{{first_name}}', firstName)
    .replaceAll('{{items}}', items)
    .replaceAll('{{checkout_url}}', 'https://your-store/checkout?recover=secure-link');
}

function statusLabel(session: RecoverySession) {
  if (session.status === 'abandoned') return 'Ready to review';
  if (session.status === 'suppressed' && session.suppression_reason === 'order_placed') return 'Suppressed · order placed';
  if (session.status === 'suppressed' && session.suppression_reason === 'stock_or_availability_changed') return 'Suppressed · stock changed';
  return session.status.replaceAll('_', ' ');
}

export default function AbandonedCheckoutsPage() {
  const [sessions, setSessions] = React.useState<RecoverySession[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, RecoveryDraft>>({});
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sendingId, setSendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/abandoned-checkouts', { cache: 'no-store' });
      const result = await response.json() as { sessions?: RecoverySession[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not load abandoned checkouts.');
      const rows = result.sessions || [];
      setSessions(rows);
      setDrafts(current => {
        const next = { ...current };
        for (const row of rows) {
          if (!next[row.id]) next[row.id] = { subject: DEFAULT_SUBJECT, message: DEFAULT_MESSAGE };
        }
        return next;
      });
    } catch (loadError) {
      console.error('[AbandonedCheckouts] Could not load recovery queue:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Could not load abandoned checkouts.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const sendReminder = async (session: RecoverySession) => {
    const draft = drafts[session.id];
    if (!draft || sendingId) return;
    setSendingId(session.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/abandoned-checkouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.id, ...draft })
      });
      const result = await response.json() as { sent?: boolean; warning?: string; error?: string };
      if (!response.ok || !result.sent) throw new Error(result.error || 'The reminder could not be sent.');
      setNotice(result.warning || `Recovery reminder sent to ${session.customer_email}.`);
      setEditingId(null);
      await refresh();
    } catch (sendError) {
      console.error('[AbandonedCheckouts] Could not send recovery reminder:', sendError);
      setError(sendError instanceof Error ? sendError.message : 'The reminder could not be sent.');
    } finally {
      setSendingId(null);
    }
  };

  const eligible = sessions.filter(session => ['abandoned', 'failed'].includes(session.status) && session.consent_active);
  const recovered = sessions.filter(session => session.status === 'converted');
  const recoveredRevenue = recovered.reduce((sum, session) => sum + Number(session.recovered_revenue || 0), 0);

  return (
    <div className="min-h-screen space-y-8 bg-slate-50 p-4 pb-32 text-left sm:p-8">
      <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-amber-700">
            <Mail className="h-4 w-4" /> Consent-based email recovery
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-950 sm:text-4xl">Abandoned checkouts</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Review a personalized reminder after 60 minutes of inactivity. Only customers with active email-marketing consent appear here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/lord/marketing"><Button variant="outline" className="h-11 rounded-xl">Marketing overview</Button></Link>
          <Button onClick={() => void refresh()} disabled={loading} variant="outline" className="h-11 rounded-xl">
            <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh queue
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl border-slate-200 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Eligible to review</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{eligible.length}</p>
        </Card>
        <Card className="rounded-2xl border-slate-200 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Recovered orders</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{recovered.length}</p>
        </Card>
        <Card className="rounded-2xl border-slate-200 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Recovered revenue</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{formatPrice(recoveredRevenue)}</p>
        </Card>
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
        Messages are manual: preview, edit, then send. The system checks consent, recent orders, and current stock again before sending. Each saved checkout gets one reminder; no discount is added automatically.
      </div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">Recovery queue</h2>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{sessions.length} records</span>
        </div>
        {loading && sessions.length === 0 ? (
          <Card className="p-10 text-center text-sm text-slate-500">Loading consented checkouts…</Card>
        ) : sessions.length === 0 ? (
          <Card className="p-10 text-center">
            <ShoppingBag className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-bold text-slate-800">No consented checkouts yet</p>
            <p className="mt-1 text-sm text-slate-500">Visitors without explicit email-marketing consent are not added to this queue.</p>
          </Card>
        ) : sessions.map(session => {
          const draft = drafts[session.id] || { subject: DEFAULT_SUBJECT, message: DEFAULT_MESSAGE };
          const canReview = ['abandoned', 'failed'].includes(session.status) && session.consent_active;
          const isEditing = editingId === session.id;
          return (
            <Card key={session.id} className="overflow-hidden rounded-2xl border-slate-200">
              <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-slate-950">{session.customer_name}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                      session.status === 'abandoned' ? 'bg-amber-100 text-amber-800'
                        : session.status === 'converted' ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                    }`}>{statusLabel(session)}</span>
                    {!session.consent_active && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-black uppercase text-rose-800">Opted out</span>}
                  </div>
                  <p className="mt-1 break-all text-sm text-slate-600">{session.customer_email}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> Last active {new Date(session.last_activity_at).toLocaleString()}</span>
                    <span className="inline-flex items-center gap-1"><ShoppingBag className="h-3.5 w-3.5" /> {session.cart_items.map(item => `${item.quantity} × ${item.name}`).join(', ')}</span>
                  </div>
                  <p className="mt-2 text-sm font-black text-slate-900">Estimated cart: {formatPrice(Number(session.total_price || 0))}</p>
                  {session.status === 'converted' && session.recovered_order_id && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <TrendingUp className="h-3.5 w-3.5" /> Order #{session.recovered_order_id} · {formatPrice(Number(session.recovered_revenue || 0))}
                    </p>
                  )}
                  {session.failure_reason && <p className="mt-2 text-xs font-semibold text-rose-700">Last send issue: {session.failure_reason}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {canReview && (
                    <Button
                      onClick={() => setEditingId(isEditing ? null : session.id)}
                      variant={isEditing ? 'outline' : 'default'}
                      className="rounded-xl"
                    >
                      {isEditing ? 'Close editor' : 'Preview & edit'}
                    </Button>
                  )}
                </div>
              </div>

              {isEditing && canReview && (
                <div className="grid gap-5 border-t border-slate-200 bg-slate-50 p-5 xl:grid-cols-2">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor={`recovery-subject-${session.id}`} className="text-xs font-black uppercase tracking-wider text-slate-600">Email subject</label>
                      <Input
                        id={`recovery-subject-${session.id}`}
                        maxLength={180}
                        value={draft.subject}
                        onChange={event => setDrafts(current => ({
                          ...current,
                          [session.id]: { ...draft, subject: event.target.value }
                        }))}
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor={`recovery-message-${session.id}`} className="text-xs font-black uppercase tracking-wider text-slate-600">Message</label>
                      <textarea
                        id={`recovery-message-${session.id}`}
                        maxLength={2000}
                        rows={7}
                        value={draft.message}
                        onChange={event => setDrafts(current => ({
                          ...current,
                          [session.id]: { ...draft, message: event.target.value }
                        }))}
                        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                      />
                      <p className="text-xs text-slate-500">Available placeholders: {'{{first_name}}'}, {'{{items}}'}, {'{{checkout_url}}'}.</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-600">Preview</p>
                    <div className="mt-1 flex-1 rounded-xl border border-slate-200 bg-white p-4">
                      <p className="break-words font-bold text-slate-900">{formatPreview(draft.subject, session)}</p>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{formatPreview(draft.message, session)}</p>
                      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">A marketing unsubscribe link will be included automatically.</p>
                    </div>
                    <Button
                      onClick={() => void sendReminder(session)}
                      disabled={sendingId !== null || !draft.subject.trim() || !draft.message.trim()}
                      className="mt-4 h-11 rounded-xl"
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {sendingId === session.id ? 'Sending…' : `Send to ${session.customer_email}`}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </section>
    </div>
  );
}
