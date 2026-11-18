'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCcw, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { reportClientRuntimeError } from '@/lib/posthogClient';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ONLINE_BAR] Application page failed to render:', error);
    reportClientRuntimeError(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <section aria-labelledby="page-error-title" className="w-full max-w-lg space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl sm:p-10">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border-4 border-primary/20 bg-primary/5 text-primary">
          <ShieldAlert size={40} aria-hidden="true" />
        </div>

        <div className="space-y-3">
          <h1 id="page-error-title" className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            This page couldn&apos;t load
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            An unexpected error stopped this page from rendering. Retry it, or return to the home page.
          </p>
        </div>

        {error.digest && (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-left font-mono text-xs text-slate-500">
            Share this reference with support: {error.digest}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            onClick={() => reset()}
            className="h-12 rounded-xl bg-primary font-bold text-white"
          >
            <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Retry page
          </Button>
          <Button asChild variant="outline" className="h-12 rounded-xl font-bold">
            <Link href="/">
              Return home
            </Link>
          </Button>
        </div>

        <p className="text-xs text-slate-500">
          Your saved browser data has not been cleared.
        </p>
      </section>
    </main>
  );
}
