'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

type EditableEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  doors_open_at: string | null;
  age_limit: number | null;
  capacity: number | null;
  cancellation_policy: string;
  cover_image_url: string | null;
  status: string;
};

const inputClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-[#17121e] px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/15';
const labelClass = 'block text-xs font-bold text-slate-300';

function dateTimeInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export default function TicketEventDetailsForm({
  event,
  onSaved,
  onCancel
}: {
  event: EditableEvent;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(formData: FormData) {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/ticketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_event_details',
          eventId: event.id,
          title: formData.get('title'),
          description: formData.get('description'),
          startsAt: formData.get('startsAt'),
          endsAt: formData.get('endsAt'),
          doorsOpenAt: formData.get('doorsOpenAt'),
          ageLimit: formData.get('ageLimit'),
          capacity: formData.get('capacity'),
          cancellationPolicy: formData.get('cancellationPolicy'),
          coverImageUrl: formData.get('coverImageUrl')
        })
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || `Ticketing request failed (${response.status}).`);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Event details could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form action={submit} className="mb-4 rounded-xl border border-orange-200/15 bg-[#100d17] p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-white">Edit event details</h4>
          <p className="mt-1 text-xs leading-5 text-slate-400">Changes update the public event page and event listing. Nairobi time (EAT) is used for dates.</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-400 hover:bg-white/5">Close</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${labelClass} sm:col-span-2`}>Event name
          <input className={inputClass} name="title" required minLength={3} maxLength={160} defaultValue={event.title} />
        </label>
        <label className={labelClass}>Event starts (EAT)
          <input className={inputClass} name="startsAt" type="datetime-local" required defaultValue={dateTimeInput(event.starts_at)} />
        </label>
        <label className={labelClass}>Event ends (EAT)
          <input className={inputClass} name="endsAt" type="datetime-local" required defaultValue={dateTimeInput(event.ends_at)} />
        </label>
        <label className={labelClass}>Doors open (EAT, optional)
          <input className={inputClass} name="doorsOpenAt" type="datetime-local" defaultValue={dateTimeInput(event.doors_open_at)} />
        </label>
        <label className={labelClass}>Minimum age (optional)
          <input className={inputClass} name="ageLimit" type="number" min="0" max="120" placeholder="No restriction" defaultValue={event.age_limit ?? ''} />
        </label>
        <label className={labelClass}>Event capacity (optional)
          <input className={inputClass} name="capacity" type="number" min="1" max="1000000" placeholder="No event-wide limit" defaultValue={event.capacity ?? ''} />
        </label>
        <label className={labelClass}>Cover image URL (HTTPS)
          <input className={inputClass} name="coverImageUrl" type="url" maxLength={2048} placeholder="https://…" defaultValue={event.cover_image_url || ''} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>Event description
          <textarea className={`${inputClass} min-h-24 py-3`} name="description" maxLength={10000} defaultValue={event.description} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>Cancellation policy
          <textarea className={`${inputClass} min-h-20 py-3`} name="cancellationPolicy" maxLength={5000} defaultValue={event.cancellation_policy} placeholder="Explain cancellation and refund terms." />
        </label>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-300/40 bg-red-950 p-3 text-xs font-medium text-red-100">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-400 px-4 text-xs font-black text-[#170d18] hover:bg-orange-300 disabled:opacity-50">
          <CheckCircle2 size={14} /> {saving ? 'Saving details…' : 'Save event details'}
        </button>
        {event.status === 'on_sale' && <p className="self-center text-[10px] leading-4 text-amber-100/70">Edits to a live listing are recorded in the ticketing audit log.</p>}
      </div>
    </form>
  );
}
