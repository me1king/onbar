'use client';

import { FormEvent } from 'react';

const WHATSAPP_NUMBER = '254769345599';

export default function EventRequestForm() {
  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const message = [
      'Hi Online Bar, I would like help planning drinks for an event.',
      `Event type: ${formData.get('eventType')}`,
      `Date: ${formData.get('date')}`,
      `Guests: ${formData.get('guests')}`,
      `Venue area: ${formData.get('area')}`,
      `Budget: ${formData.get('budget') || 'Please help me plan a budget'}`,
    ].join('\n');

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <form onSubmit={submitRequest} className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
        Event type
        <select name="eventType" required defaultValue="" className="min-h-12 rounded-lg border border-slate-300 bg-white px-3">
          <option value="" disabled>Select an event</option>
          <option>Birthday</option>
          <option>Wedding</option>
          <option>Corporate event</option>
          <option>Graduation</option>
          <option>Send-off</option>
          <option>Product launch</option>
          <option>Other</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
        Event date
        <input name="date" type="date" required min={new Date().toISOString().slice(0, 10)} className="min-h-12 rounded-lg border border-slate-300 bg-white px-3" />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
        Number of guests
        <input name="guests" type="number" min="1" max="10000" required inputMode="numeric" className="min-h-12 rounded-lg border border-slate-300 bg-white px-3" />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
        Venue area
        <input name="area" type="text" maxLength={120} required placeholder="e.g. neighbourhood or town" className="min-h-12 rounded-lg border border-slate-300 bg-white px-3" />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">
        Drinks budget (KSh)
        <input name="budget" type="number" min="1" max="100000000" inputMode="numeric" placeholder="Optional" className="min-h-12 rounded-lg border border-slate-300 bg-white px-3" />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className="min-h-12 rounded-lg bg-slate-950 px-5 font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">
          Continue to WhatsApp
        </button>
        <p className="mt-2 text-sm text-slate-500">Your details are added to a WhatsApp draft; review and send it there.</p>
      </div>
    </form>
  );
}
