'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LoaderCircle, RotateCcw, Save } from 'lucide-react';
import {
  DEFAULT_TICKET_EMAIL_SETTINGS,
  type TicketEmailSettings,
  type TicketEmailSections
} from '@/lib/ticketing/emailSettings';

const textFields: Array<{
  key: keyof Omit<TicketEmailSettings, 'sections'>;
  label: string;
  help: string;
  multiline?: boolean;
  maxLength: number;
}> = [
  { key: 'brandTitle', label: 'Brand line', help: 'Displayed at the top of the ticket email.', maxLength: 100 },
  { key: 'brandSubtitle', label: 'Brand subtitle', help: 'A short supporting line displayed beneath the Online Bar ticket email brand.', maxLength: 180 },
  { key: 'subjectTemplate', label: 'Email subject', help: 'Supports {event_title}, {event_date}, {buyer_name}, {ticket_count}, {order_reference}, {amount_paid}, {venue}, {organizer_name}.', maxLength: 200 },
  { key: 'headingTemplate', label: 'Email heading', help: 'Main heading shown above the ticket details.', maxLength: 180 },
  { key: 'introTemplate', label: 'Introduction', help: 'Shown after payment confirmation. Plain text only; line breaks are kept.', multiline: true, maxLength: 1200 },
  { key: 'closingTemplate', label: 'Closing message', help: 'Shown after the order details. Plain text only; line breaks are kept.', multiline: true, maxLength: 1200 }
];

const sectionLabels: Array<{ key: keyof TicketEmailSections; label: string }> = [
  { key: 'showEventCover', label: 'Event cover image' },
  { key: 'showEventTiming', label: 'Event date and time' },
  { key: 'showVenue', label: 'Venue name and city' },
  { key: 'showDoors', label: 'Doors-open time' },
  { key: 'showVenueAddress', label: 'Venue address' },
  { key: 'showDirections', label: 'Map directions link' },
  { key: 'showFinancialSummary', label: 'Order, total, fees and payment summary' },
  { key: 'showBuyerContact', label: 'Buyer contact details' },
  { key: 'showOrganizer', label: 'Organizer name' },
  { key: 'showEventDescription', label: 'Event description' },
  { key: 'showArrivalGuides', label: 'Entrance, parking and transport guidance' },
  { key: 'showCancellationPolicy', label: 'Cancellation policy' },
  { key: 'showTicketType', label: 'Ticket type in email tickets' },
  { key: 'showAttendeeName', label: 'Attendee name in email tickets' }
];

export default function TicketEmailSettingsEditor({ initialSettings }: { initialSettings: TicketEmailSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  function updateText(key: keyof Omit<TicketEmailSettings, 'sections'>, value: string) {
    setSettings(current => ({ ...current, [key]: value }));
    setNotice('');
  }

  function updateSection(key: keyof TicketEmailSections, checked: boolean) {
    setSettings(current => ({ ...current, sections: { ...current.sections, [key]: checked } }));
    setNotice('');
  }

  async function saveSettings(nextSettings = settings) {
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/ticketing/email-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: nextSettings })
      });
      const result = await response.json() as { settings?: TicketEmailSettings; error?: string };
      if (!response.ok || !result.settings) throw new Error(result.error || 'Ticket email settings could not be saved.');
      setSettings(result.settings);
      setNotice('Saved. The preview and future paid-ticket emails now use these settings.');
      router.refresh();
    } catch (cause) {
      console.error('[TicketEmailSettingsEditor] Could not save ticket email settings:', cause);
      setError(cause instanceof Error ? cause.message : 'Ticket email settings could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function resetSettings() {
    setSettings(DEFAULT_TICKET_EMAIL_SETTINGS);
    void saveSettings(DEFAULT_TICKET_EMAIL_SETTINGS);
  }

  return (
    <section aria-labelledby="ticket-email-settings-title" className="space-y-5 rounded-2xl border border-white/10 bg-[#17121e] p-4 sm:p-6">
      <div>
        <h2 id="ticket-email-settings-title" className="text-xl font-black text-white">Control ticket confirmation emails</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
          Edit the subject, brand lines, heading, introduction and closing, then choose which optional details appear. Changes apply to the live paid-ticket email and its sample preview. HTML is safely escaped; use the supported placeholders shown below.
        </p>
        <p className="mt-2 text-xs font-bold text-emerald-300">Age is intentionally not displayed in the email or attached PDF. Event age limits and entry checks remain unchanged.</p>
        <p className="mt-1 text-[10px] leading-4 text-slate-500">The verified sender address and security-critical QR/PDF attachments stay server-controlled so email authentication and ticket validity are not weakened.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {textFields.map(field => (
          <label key={field.key} className="block text-xs font-bold text-slate-200">
            {field.label}
            {field.multiline ? (
              <textarea
                maxLength={field.maxLength}
                value={settings[field.key]}
                onChange={event => updateText(field.key, event.target.value)}
                rows={4}
                className="mt-1.5 min-h-24 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-normal text-white outline-none focus:border-amber-300/60"
              />
            ) : (
              <input
                maxLength={field.maxLength}
                value={settings[field.key]}
                onChange={event => updateText(field.key, event.target.value)}
                className="mt-1.5 min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-normal text-white outline-none focus:border-amber-300/60"
              />
            )}
            <span className="mt-1 block text-[10px] font-normal leading-4 text-slate-500">{field.help}</span>
          </label>
        ))}
      </div>

      <fieldset>
        <legend className="text-xs font-black uppercase tracking-wider text-slate-300">Optional email sections</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sectionLabels.map(section => (
            <label key={section.key} className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-black/10 px-3 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={settings.sections[section.key]}
                onChange={event => updateSection(section.key, event.target.checked)}
                className="h-4 w-4 accent-amber-300"
              />
              {section.label}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="rounded-xl border border-white/10 bg-black/10 p-3 text-[10px] leading-5 text-slate-400">
        Supported placeholders: <code>{'{event_title}'}</code>, <code>{'{event_date}'}</code>, <code>{'{buyer_name}'}</code>, <code>{'{ticket_count}'}</code>, <code>{'{order_reference}'}</code>, <code>{'{amount_paid}'}</code>, <code>{'{venue}'}</code>, <code>{'{organizer_name}'}</code>. Ticket QR codes, ticket references, payment amount and ticket PDF attachments remain system-generated so ticket delivery stays verifiable.
      </p>
      {error && <p role="alert" className="text-xs font-bold text-rose-300">{error}</p>}
      {notice && <p role="status" className="text-xs font-bold text-emerald-300">{notice}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void saveSettings()} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-300 px-4 text-xs font-black text-[#170d18] disabled:opacity-50">
          {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
          Save email settings
        </button>
        <button type="button" onClick={resetSettings} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-bold text-slate-300 disabled:opacity-50">
          <RotateCcw size={14} /> Restore defaults
        </button>
        {notice && <span className="inline-flex min-h-10 items-center gap-1 text-[10px] text-emerald-300"><Check size={14} /> Applied to preview and new ticket emails</span>}
      </div>
    </section>
  );
}
