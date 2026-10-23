'use client';

import * as React from 'react';
import { Check, Clock3, Plus, Save, Tag, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface CrmCustomer {
  isRegistered: boolean;
  profileId: string | null;
  phone: string;
  fullName: string;
  email: string;
  address: string;
  birthDate: string;
  createdAt: string | null;
}

interface CrmNote {
  id: number;
  body: string;
  author_email: string;
  created_at: string;
}

interface CrmFollowup {
  id: number;
  title: string;
  description: string | null;
  due_at: string;
  priority: 'low' | 'normal' | 'high';
  status: 'open' | 'completed';
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

interface CrmActivity {
  id: string;
  type: 'note' | 'followup' | 'update' | 'order' | 'communication';
  created_at: string;
  actor: string;
  summary: string;
  details?: { message?: string };
}

interface CrmConsent {
  marketing: boolean;
  inAppMarketing: boolean;
  updatedAt: string;
}

interface CrmResponse {
  customer: CrmCustomer;
  tags: string[];
  consent: CrmConsent | null;
  communications: { id: string; title: string; message: string; is_read: boolean; created_at: string }[];
  notes: CrmNote[];
  followups: CrmFollowup[];
  activity: CrmActivity[];
  error?: string;
}

function displayDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function CustomerCrmPanel({ phone }: { phone: string }) {
  const [data, setData] = React.useState<CrmResponse | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [tagInput, setTagInput] = React.useState('');
  const [noteInput, setNoteInput] = React.useState('');
  const [taskTitle, setTaskTitle] = React.useState('');
  const [taskDescription, setTaskDescription] = React.useState('');
  const [taskDueDate, setTaskDueDate] = React.useState('');
  const [taskPriority, setTaskPriority] = React.useState<'low' | 'normal' | 'high'>('normal');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(phone)}/crm`, { cache: 'no-store' });
      const result = await response.json() as CrmResponse;
      if (!response.ok) throw new Error(result.error || 'CRM data could not be loaded.');
      setData(result);
    } catch (loadError) {
      console.error('[CustomerCRM] Load failed:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'CRM data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [phone]);

  React.useEffect(() => { void load(); }, [load]);

  const send = async (method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(phone)}/crm`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const result = await response.json() as CrmResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || 'CRM update could not be saved.');
      await load();
      setNotice('Saved successfully.');
      return true;
    } catch (saveError) {
      console.error('[CustomerCRM] Save failed:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'CRM update could not be saved.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data) return;
    const formData = new FormData(event.currentTarget);
    await send('PATCH', {
      action: 'profile',
      fullName: formData.get('fullName'),
      email: formData.get('email'),
      address: formData.get('address'),
      birthDate: formData.get('birthDate')
    });
  };

  const saveTags = async () => {
    if (!data) return;
    const tags = [...data.tags, ...tagInput.split(',').map(tag => tag.trim()).filter(Boolean)];
    if (await send('PATCH', { action: 'tags', tags })) setTagInput('');
  };

  const addNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await send('POST', { action: 'note', body: noteInput })) setNoteInput('');
  };

  const addFollowup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskDueDate) {
      setError('Choose a due date for the follow-up.');
      return;
    }
    if (await send('POST', {
      action: 'followup',
      title: taskTitle,
      description: taskDescription,
      dueAt: new Date(`${taskDueDate}T12:00:00`).toISOString(),
      priority: taskPriority
    })) {
      setTaskTitle('');
      setTaskDescription('');
      setTaskDueDate('');
      setTaskPriority('normal');
    }
  };

  if (loading && !data) {
    return <section className="rounded-3xl border border-slate-100 bg-white p-8 text-sm font-semibold text-slate-500">Loading customer CRM…</section>;
  }
  if (error && !data) {
    return (
      <section className="space-y-4 rounded-3xl border border-rose-200 bg-rose-50 p-6">
        <p role="alert" className="text-sm font-semibold text-rose-800">{error}</p>
        <Button type="button" variant="outline" onClick={() => void load()}>Try again</Button>
      </section>
    );
  }
  if (!data) return null;

  const openFollowups = data.followups.filter(followup => followup.status === 'open');
  const completedFollowups = data.followups.filter(followup => followup.status === 'completed');

  return (
    <section className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Customer relationship workspace</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Customer CRM</h2>
          <p className="mt-1 text-xs text-slate-500">{data.customer.isRegistered ? 'Registered customer record' : 'Guest customer record'} · Private to senior management</p>
        </div>
        <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">{data.customer.phone}</span>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-slate-100 p-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Marketing consent</h3>
          <p className="mt-2 text-sm font-semibold text-slate-800">
            Marketing preference: {data.consent ? data.consent.marketing ? 'Opted in' : 'Not opted in' : 'No consent record'}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            In-app marketing: {data.consent ? data.consent.inAppMarketing ? 'Opted in' : 'Not opted in' : 'No consent record'}
          </p>
          {data.consent?.updatedAt && <p className="mt-2 text-[11px] text-slate-400">Preference last updated {displayDate(data.consent.updatedAt)}</p>}
        </article>
        <article className="rounded-2xl border border-slate-100 p-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Recorded in-app messages</h3>
          <p className="mt-2 text-2xl font-black text-slate-900">{data.communications.length}</p>
          <p className="mt-1 text-xs text-slate-500">Existing notification records only. CRM does not send messages.</p>
        </article>
      </div>

      <form onSubmit={saveProfile} className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900"><UserRound size={17} className="text-primary" /> Contact details</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-bold text-slate-600">Full name
            <Input name="fullName" defaultValue={data.customer.fullName} maxLength={120} />
          </label>
          <label className="space-y-1 text-xs font-bold text-slate-600">Email
            <Input name="email" type="email" defaultValue={data.customer.email} maxLength={254} />
          </label>
          <label className="space-y-1 text-xs font-bold text-slate-600">Birthday
            <Input name="birthDate" type="date" defaultValue={data.customer.birthDate || ''} />
          </label>
          <label className="space-y-1 text-xs font-bold text-slate-600 sm:col-span-2">Address
            <Input name="address" defaultValue={data.customer.address} maxLength={500} />
          </label>
        </div>
        <Button type="submit" disabled={saving} className="rounded-xl"><Save size={15} className="mr-2" /> Save contact details</Button>
      </form>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-slate-100 p-4 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-black text-slate-900"><Tag size={17} className="text-primary" /> Customer tags</div>
          <div className="flex flex-wrap gap-2">
            {data.tags.length ? data.tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                {tag}<button type="button" aria-label={`Remove ${tag} tag`} disabled={saving} onClick={() => void send('PATCH', { action: 'tags', tags: data.tags.filter(item => item !== tag) })}><X size={12} /></button>
              </span>
            )) : <span className="text-xs text-slate-400">No tags yet.</span>}
          </div>
          <div className="flex gap-2">
            <Input value={tagInput} onChange={event => setTagInput(event.target.value)} placeholder="VIP, wine-lover…" maxLength={256} />
            <Button type="button" variant="outline" disabled={saving || !tagInput.trim()} onClick={() => void saveTags()} aria-label="Add tags"><Plus size={16} /></Button>
          </div>
          <p className="text-[11px] text-slate-400">Separate multiple tags with commas. Up to 25 tags, 32 characters each.</p>
        </div>

        <form onSubmit={addNote} className="space-y-3 rounded-2xl border border-slate-100 p-4 sm:p-6">
          <h3 className="text-sm font-black text-slate-900">Internal note</h3>
          <Textarea value={noteInput} onChange={event => setNoteInput(event.target.value)} placeholder="Add a staff-only note about this customer…" maxLength={5000} required />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">Visible only to authorized staff.</span>
            <Button type="submit" disabled={saving || !noteInput.trim()} className="rounded-xl"><Plus size={15} className="mr-2" /> Add note</Button>
          </div>
        </form>
      </div>

      <form onSubmit={addFollowup} className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900"><Clock3 size={17} className="text-primary" /> Schedule a follow-up</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder="Follow-up title" maxLength={200} required />
          <Input type="date" value={taskDueDate} onChange={event => setTaskDueDate(event.target.value)} required aria-label="Follow-up due date" />
          <Textarea value={taskDescription} onChange={event => setTaskDescription(event.target.value)} placeholder="Details or next steps" maxLength={2000} className="sm:col-span-2" />
          <select value={taskPriority} onChange={event => setTaskPriority(event.target.value as 'low' | 'normal' | 'high')} className="h-10 rounded-md border border-input bg-white px-3 text-sm">
            <option value="low">Low priority</option>
            <option value="normal">Normal priority</option>
            <option value="high">High priority</option>
          </select>
        </div>
        <Button type="submit" disabled={saving || !taskTitle.trim()} className="rounded-xl"><Plus size={15} className="mr-2" /> Create follow-up</Button>
      </form>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">Open follow-ups ({openFollowups.length})</h3>
          {openFollowups.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No open follow-ups.</p>}
          {openFollowups.map(followup => {
            const overdue = new Date(followup.due_at).getTime() < Date.now();
            return (
              <article key={followup.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-4">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">{followup.title}</p>
                  {followup.description && <p className="mt-1 text-sm text-slate-600">{followup.description}</p>}
                  <p className={cn('mt-2 text-xs font-semibold', overdue ? 'text-rose-700' : 'text-slate-500')}>{overdue ? 'Overdue · ' : 'Due · '}{displayDate(followup.due_at)} · {followup.priority} priority</p>
                </div>
                <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void send('PATCH', { action: 'complete_followup', id: followup.id })}><Check size={14} className="mr-1" /> Done</Button>
              </article>
            );
          })}
          {completedFollowups.length > 0 && <p className="pt-2 text-xs text-slate-500">{completedFollowups.length} completed follow-up{completedFollowups.length === 1 ? '' : 's'}.</p>}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">Customer timeline</h3>
          <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
            {data.activity.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No activity recorded yet.</p>}
            {data.activity.map(item => (
              <article key={item.id} className="border-l-2 border-primary/20 pl-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{item.type}</span>
                  <time className="text-[11px] text-slate-400">{displayDate(item.created_at)}</time>
                </div>
                <p className="mt-1 break-words text-sm font-semibold text-slate-800">{item.summary}</p>
                {item.details?.message && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-600">{item.details.message}</p>}
                <p className="mt-1 text-[11px] text-slate-400">{item.actor}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
