'use client';

import { useEffect, useState } from 'react';
import { defaultTicketTheme, isTicketThemeId, ticketThemes, type TicketThemeId } from '@/lib/ticketing/theme';

export default function TicketThemePicker() {
  const [selected, setSelected] = useState<TicketThemeId>(defaultTicketTheme);
  const [published, setPublished] = useState<TicketThemeId>(defaultTicketTheme);
  const [status, setStatus] = useState('Loading the published customer theme…');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadPublishedTheme() {
      try {
        const response = await fetch('/api/ticketing/theme', { cache: 'no-store' });
        const result = await response.json() as { theme?: unknown; error?: string };
        if (!response.ok) throw new Error(result.error || `Ticketing theme request failed (${response.status}).`);
        if (!isTicketThemeId(result.theme)) throw new Error('The saved customer theme is not supported.');
        if (!active) return;
        setSelected(result.theme);
        setPublished(result.theme);
        document.documentElement.dataset.ticketTheme = result.theme;
        setStatus('Current customer theme loaded.');
        setLoaded(true);
      } catch (error) {
        console.error('[TicketingTheme] Could not load the customer theme:', error);
        if (active) setStatus(error instanceof Error ? error.message : 'The customer theme could not be loaded.');
      }
    }

    void loadPublishedTheme();
    return () => { active = false; };
  }, []);

  function selectTheme(theme: TicketThemeId) {
    setSelected(theme);
    document.documentElement.dataset.ticketTheme = theme;
    setStatus(theme === published ? 'This is the published customer theme.' : 'Preview only. Publish to update customer ticket pages.');
  }

  async function publishTheme() {
    setSaving(true);
    setStatus('Publishing customer theme…');
    try {
      const response = await fetch('/api/ticketing/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: selected })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || `Ticketing theme publish failed (${response.status}).`);
      setPublished(selected);
      setStatus('Published to customer event pages, ticket wallet, and ticket emails.');
    } catch (error) {
      console.error('[TicketingTheme] Could not publish customer theme:', error);
      setStatus(error instanceof Error ? error.message : 'The customer theme could not be published.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-right text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-left">
        Customer ticket colors
      </legend>
      <div className="flex flex-wrap justify-end gap-1.5 sm:justify-start">
        {ticketThemes.map(theme => (
          <button
            key={theme.id}
            type="button"
            aria-pressed={selected === theme.id}
            aria-label={`Use ${theme.label} color mode`}
            title={theme.label}
            onClick={() => selectTheme(theme.id)}
            disabled={!loaded || saving}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[9px] font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-50 ${
              selected === theme.id
                ? 'border-orange-500 bg-orange-50 text-orange-900'
                : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-slate-900'
            }`}
          >
            <span aria-hidden="true" className={`h-3 w-3 rounded-full border border-black/10 ${theme.swatch}`} />
            <span className="hidden sm:inline">{theme.label}</span>
            <span className="sm:hidden">{theme.id === 'official-white' ? 'White' : theme.id === 'sapphire-blue' ? 'Blue' : theme.id === 'royal-violet' ? 'Violet' : theme.id === 'emerald' ? 'Emerald' : 'Black'}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 sm:justify-start">
        <button
          type="button"
          onClick={() => void publishTheme()}
          disabled={!loaded || saving || selected === published}
          className="inline-flex min-h-8 items-center rounded-lg bg-amber-300 px-3 text-[9px] font-black uppercase tracking-wider text-[#170d18] transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Publishing…' : selected === published ? 'Published to customers' : 'Publish to customer site'}
        </button>
        <p role="status" aria-live="polite" className="text-[9px] font-semibold text-slate-400">{status}</p>
      </div>
    </fieldset>
  );
}
