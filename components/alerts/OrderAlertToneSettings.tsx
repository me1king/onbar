'use client';

import { useState, type FormEvent } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useOrderAlertTone } from '@/hooks/useOrderAlertTone';

type Controller = ReturnType<typeof useOrderAlertTone>;

export default function OrderAlertToneSettings({
  controller,
  dark = false
}: {
  controller: Controller;
  dark?: boolean;
}) {
  const [name, setName] = useState('');
  const [frequencies, setFrequencies] = useState('');
  const [error, setError] = useState('');
  const palette = dark
    ? 'border-white/10 bg-[#101614] text-white'
    : 'border-slate-200 bg-white text-slate-900 text-slate-500';
  const outlineButtonClass = dark ? 'border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white' : '';

  const addTone = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      controller.addCustomTone(name, frequencies);
      setName('');
      setFrequencies('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Custom tone could not be added.');
    }
  };

  const toggleSound = async () => {
    setError('');
    try {
      await controller.toggle();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sound alerts could not be enabled.');
    }
  };

  const previewTone = async () => {
    setError('');
    try {
      await controller.preview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This tone could not be previewed.');
    }
  };

  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${palette}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
            {controller.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />} Order alert tones
          </h2>
          <p className="mt-1 text-xs leading-5 opacity-70">Choose a built-in chime or add a custom tone. Preferences are saved on this device.</p>
        </div>
        <Button type="button" variant={controller.enabled ? 'outline' : 'default'} className={controller.enabled ? outlineButtonClass : ''} aria-pressed={controller.enabled} onClick={() => void toggleSound()}>
          {controller.enabled ? 'Turn sound off' : 'Enable and test sound'}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="block text-xs font-bold">
          Tone
          <select
            value={controller.toneId}
            onChange={event => controller.setTone(event.target.value)}
            className={`mt-1 h-11 w-full rounded-lg border px-3 text-sm ${dark ? 'border-white/10 bg-black/20 text-white' : 'border-slate-200 bg-white text-slate-900'}`}
          >
            {controller.tones.map(tone => <option key={tone.id} value={tone.id}>{tone.name}</option>)}
          </select>
        </label>
        <Button type="button" variant="outline" onClick={() => void previewTone()} className={`min-h-11 ${outlineButtonClass}`}>
          Preview tone
        </Button>
        {controller.tones.some(tone => tone.id === controller.toneId && tone.id.startsWith('custom-')) && (
          <Button type="button" variant="outline" onClick={() => controller.removeCustomTone(controller.toneId)} className={`min-h-11 ${outlineButtonClass}`}>
            Remove custom
          </Button>
        )}
      </div>

      {controller.enabled && (
        <label className="mt-4 flex max-w-sm items-center gap-3 text-xs font-bold">
          Volume
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={controller.volume}
            aria-label="Order alert tone volume"
            onChange={event => controller.setVolume(Number(event.target.value))}
            className="min-w-0 flex-1 accent-primary"
          />
        </label>
      )}

      <form onSubmit={addTone} className={`mt-4 grid gap-2 border-t pt-4 sm:grid-cols-[1fr_1.2fr_auto] ${dark ? 'border-white/10' : 'border-slate-100'}`}>
        <label className="text-[11px] font-bold">
          Add a tone name
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            maxLength={40}
            placeholder="My delivery chime"
            className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm ${dark ? 'border-white/10 bg-black/20 text-white placeholder:text-white/30' : 'border-slate-200 bg-white text-slate-900'}`}
          />
        </label>
        <label className="text-[11px] font-bold">
          Notes (Hz, comma separated)
          <input
            value={frequencies}
            onChange={event => setFrequencies(event.target.value)}
            placeholder="660, 880, 1046"
            className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm ${dark ? 'border-white/10 bg-black/20 text-white placeholder:text-white/30' : 'border-slate-200 bg-white text-slate-900'}`}
          />
        </label>
        <Button type="submit" variant="outline" className={`min-h-10 self-end ${outlineButtonClass}`}>Add tone</Button>
        {error && <p role="alert" className={`text-xs sm:col-span-3 ${dark ? 'text-rose-300' : 'text-rose-600'}`}>{error}</p>}
      </form>
      <p className="mt-2 text-[10px] leading-4 opacity-60">Custom tones use generated notes (250-1800 Hz), not uploaded music. The browser may silence tones when this app is closed or suspended.</p>
    </section>
  );
}
