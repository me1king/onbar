'use client';

import { Button } from '@/components/ui/button';
import { ShieldAlert, RefreshCcw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center antialiased font-sans">
        <div className="space-y-8 max-w-lg animate-in fade-in zoom-in-95 duration-700">

          <div className="relative mx-auto h-24 w-24">
              <div className="absolute inset-0 bg-rose-500/10 rounded-3xl animate-ping opacity-20" />
              <div className="relative h-full w-full bg-white border-4 border-rose-500 rounded-3xl flex items-center justify-center text-rose-500 shadow-2xl shadow-rose-500/20">
                  <ShieldAlert size={48} />
              </div>
          </div>

          <div className="space-y-3">
              <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                  Fatal <span className="text-rose-600">Sync Failure.</span>
              </h1>
              <p className="text-slate-400 font-black uppercase text-[10px] tracking-[0.3em]">Critical Protocol Error</p>
          </div>

          <div className="bg-slate-50 border-l-4 border-rose-600 p-8 rounded-r-3xl text-left shadow-inner">
              <p className="text-sm font-medium text-slate-600 leading-relaxed italic">
                  &quot;The core application node has encountered an unrecoverable exception. This indicates a major disruption in the data stream.&quot;
              </p>
              <p className="mt-4 font-mono text-[8px] text-slate-300 uppercase tracking-widest">ERR_GLOBAL_HALT: {error.digest || 'UNIDENTIFIED'}</p>
          </div>

          <Button
              onClick={() => reset()}
              className="h-16 w-full rounded-2xl bg-rose-600 text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-rose-500/20 hover:bg-rose-700 transition-all active:scale-95"
          >
              <RefreshCcw className="mr-3 h-5 w-5" /> Re-Initialize Grid
          </Button>

          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest animate-pulse">
              Online Bar service recovery active • Nairobi
          </p>

        </div>
      </body>
    </html>
  );
}
