'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCcw, ShieldAlert, Home } from 'lucide-react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to your analytics engine
    console.error("[APEX_OS] Global Node Failure:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
      <div className="space-y-8 max-w-lg animate-in fade-in zoom-in-95 duration-700">

        {/* Visual Warning Node */}
        <div className="relative mx-auto h-24 w-24">
            <div className="absolute inset-0 bg-primary/10 rounded-3xl animate-ping opacity-20" />
            <div className="relative h-full w-full bg-white border-4 border-primary rounded-3xl flex items-center justify-center text-primary shadow-2xl shadow-primary/20">
                <ShieldAlert size={48} />
            </div>
        </div>

        <div className="space-y-3 text-left sm:text-center">
            <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                System <span className="text-primary">Stall.</span>
            </h1>
            <p className="text-slate-400 font-black uppercase text-[10px] tracking-[0.3em] ml-1">Grid Integrity Interrupted</p>
        </div>

        <div className="bg-slate-50 border-l-4 border-rose-500 p-8 rounded-r-3xl text-left shadow-inner">
            <p className="text-sm font-medium text-slate-600 leading-relaxed italic">
                &quot;The client-side interface has encountered an unhandled exception. This usually indicates a synchronization delay between the local cache and the master grid.&quot;
            </p>
            {error.digest && (
                <p className="mt-4 font-mono text-[8px] text-slate-300 uppercase tracking-widest">Error Digest: {error.digest}</p>
            )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button
                onClick={() => reset()}
                className="h-16 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
            >
                <RefreshCcw className="mr-3 h-5 w-5" /> Re-Sync Interface
            </Button>

            <Link href="/" className="w-full">
                <Button
                    variant="outline"
                    className="w-full h-16 rounded-2xl border-2 border-slate-100 bg-white text-foreground font-black uppercase text-xs tracking-widest hover:bg-slate-50 transition-all active:scale-95"
                >
                    <Home className="mr-3 h-5 w-5 text-primary" /> Return Home
                </Button>
            </Link>
        </div>

        <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest animate-pulse">
            Secure recovery node active • Online Bar Nairobi
        </p>

      </div>
    </div>
  );
}
