'use client';

import { useState } from 'react';
import SpinBottleRoomFrame from '@/components/games/SpinBottleRoomFrame';

export default function SpinTheBottlePage() {
  const [confirmed, setConfirmed] = useState(false);

  if (!confirmed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10 text-slate-950">
        <section className="w-full max-w-xl rounded-3xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-amber-800">Spin the Bottle Live · Adults 20+</p>
          <h1 className="mt-2 text-2xl font-black">Play by choice, and pass any time.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-700">Truths and dares are optional. Alcohol-free play is welcome; alcohol is only for adults 18+ and is always optional. Please drink responsibly and arrange a safe ride.</p>
          <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-slate-800">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-amber-600" onChange={event => setConfirmed(event.target.checked)} />
            <span>I confirm everyone playing is at least 20, agrees to participate, and can pass or stop at any time.</span>
          </label>
          <button type="button" disabled={!confirmed} onClick={() => setConfirmed(true)} className="mt-5 min-h-12 rounded-xl bg-slate-950 px-5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Continue to game</button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <SpinBottleRoomFrame className="h-screen min-h-[720px]" />
    </main>
  );
}
