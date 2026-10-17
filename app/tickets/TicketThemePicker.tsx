'use client';

import { useEffect, useState } from 'react';

const themes = [
  { id: 'midnight', label: 'Midnight black', swatch: 'bg-[#17121e]' },
  { id: 'official-white', label: 'Official white', swatch: 'bg-white' },
  { id: 'royal-violet', label: 'Royal violet', swatch: 'bg-violet-600' },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-600' }
] as const;

type ThemeId = typeof themes[number]['id'];
const storageKey = 'onlinebar-ticketing-theme';

function isThemeId(value: string | null): value is ThemeId {
  return themes.some(theme => theme.id === value);
}

function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.ticketTheme = theme;
}

export default function TicketThemePicker() {
  const [selected, setSelected] = useState<ThemeId>('midnight');

  useEffect(() => {
    let theme: ThemeId = 'midnight';
    try {
      const savedTheme = window.localStorage.getItem(storageKey);
      if (isThemeId(savedTheme)) theme = savedTheme;
    } catch (error) {
      console.warn('Ticketing color mode preference could not be read.', error);
    }
    applyTheme(theme);
    setSelected(theme);
  }, []);

  function selectTheme(theme: ThemeId) {
    applyTheme(theme);
    setSelected(theme);
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch (error) {
      console.warn('Ticketing color mode preference could not be saved.', error);
    }
  }

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-right text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-left">
        Try a color mode
      </legend>
      <div className="flex flex-wrap justify-end gap-1.5 sm:justify-start">
        {themes.map(theme => (
          <button
            key={theme.id}
            type="button"
            aria-pressed={selected === theme.id}
            aria-label={`Use ${theme.label} color mode`}
            title={theme.label}
            onClick={() => selectTheme(theme.id)}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[9px] font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${
              selected === theme.id
                ? 'border-orange-500 bg-orange-50 text-orange-900'
                : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-slate-900'
            }`}
          >
            <span aria-hidden="true" className={`h-3 w-3 rounded-full border border-black/10 ${theme.swatch}`} />
            <span className="hidden sm:inline">{theme.label}</span>
            <span className="sm:hidden">{theme.id === 'official-white' ? 'White' : theme.id === 'royal-violet' ? 'Violet' : theme.id === 'emerald' ? 'Emerald' : 'Black'}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
