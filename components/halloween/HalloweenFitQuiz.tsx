'use client';

import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

interface QuizState {
  height: number;
  weight: number;
  build: 'slim' | 'average' | 'broad';
  style: 'fitted' | 'loose' | 'dramatic';
}

export function HalloweenFitQuiz({ onClose }: { onClose?: () => void }) {
  const [answers, setAnswers] = useState<QuizState>({
    height: 170,
    weight: 68,
    build: 'average',
    style: 'fitted'
  });
  const [submitted, setSubmitted] = useState(false);

  const recommendation = useMemo(() => {
    if (answers.height <= 160 || answers.weight <= 55) {
      return { size: 'XS / S', note: 'Tighter waist and shorter hem for a sharp silhouette.' };
    }
    if (answers.height <= 170 && answers.weight <= 75) {
      return { size: 'S / M', note: 'Balanced fit with room for layering and a comfortable waist.' };
    }
    if (answers.height <= 182 && answers.weight <= 90) {
      return { size: 'M / L', note: 'Classic party fit with enough room for a cape or layered accessory.' };
    }
    return { size: 'L / XL', note: 'Go roomy through the chest and shoulders for comfort and movement.' };
  }, [answers]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[2rem] border border-violet-400/20 bg-slate-950 p-6 text-white shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-violet-300">Checked fit</p>
            <h3 className="mt-2 text-2xl font-black uppercase tracking-tighter">Size recommender</h3>
          </div>
          {onClose && (
            <button onClick={onClose} className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
              Close
            </button>
          )}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
            Height (cm)
            <input
              type="number"
              value={answers.height}
              onChange={(event) => setAnswers((current) => ({ ...current, height: Number(event.target.value) || 170 }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-white outline-none ring-0"
            />
          </label>

          <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
            Weight (kg)
            <input
              type="number"
              value={answers.weight}
              onChange={(event) => setAnswers((current) => ({ ...current, weight: Number(event.target.value) || 68 }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-white outline-none ring-0"
            />
          </label>

          <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
            Build
            <select
              value={answers.build}
              onChange={(event) => setAnswers((current) => ({ ...current, build: event.target.value as QuizState['build'] }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-white outline-none"
            >
              <option value="slim" className="bg-slate-900">Slim</option>
              <option value="average" className="bg-slate-900">Average</option>
              <option value="broad" className="bg-slate-900">Broad</option>
            </select>
          </label>

          <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
            Style
            <select
              value={answers.style}
              onChange={(event) => setAnswers((current) => ({ ...current, style: event.target.value as QuizState['style'] }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-white outline-none"
            >
              <option value="fitted" className="bg-slate-900">Fitted</option>
              <option value="loose" className="bg-slate-900">Loose</option>
              <option value="dramatic" className="bg-slate-900">Dramatic</option>
            </select>
          </label>
        </div>

        <div className="mt-6 rounded-[1.5rem] border border-violet-400/20 bg-violet-500/5 p-4">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.28em] text-violet-200">
            <Sparkles size={12} /> Recommendation
          </div>
          {submitted ? (
            <div className="mt-3">
              <div className="text-3xl font-black uppercase tracking-tighter text-white">{recommendation.size}</div>
              <p className="mt-2 text-sm text-violet-100/80">{recommendation.note}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-300">Tell us your fit and we’ll suggest the best size before checkout.</p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            className="flex-1 rounded-2xl bg-violet-500 text-white hover:bg-violet-400 font-black uppercase tracking-[0.22em] text-[9px]"
            onClick={() => setSubmitted(true)}
          >
            See my fit
          </Button>
          {onClose && (
            <Button
              variant="outline"
              className="flex-1 rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10 font-black uppercase tracking-[0.22em] text-[9px]"
              onClick={onClose}
            >
              Keep browsing
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
