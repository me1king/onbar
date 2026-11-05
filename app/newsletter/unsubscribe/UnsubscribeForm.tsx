'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, MailX } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function UnsubscribeForm({ token }: { token: string }) {
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');

    const unsubscribe = async () => {
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/marketing/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            const result = await response.json() as { success?: boolean; error?: string };
            if (!response.ok || !result.success) throw new Error(result.error || 'Unable to update your preference.');
            setDone(true);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Unable to update your preference.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="flex min-h-[70dvh] items-center justify-center bg-slate-50 px-5 py-16">
            <section className="w-full max-w-lg space-y-6 rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-sm sm:p-10">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    {done ? <CheckCircle2 size={26} /> : <MailX size={26} />}
                </div>
                <div className="space-y-2">
                    <h1 className="text-2xl font-black uppercase tracking-tight text-foreground">
                        {done ? 'You are unsubscribed' : 'Email preferences'}
                    </h1>
                    <p className="text-sm leading-relaxed text-slate-500">
                        {done
                            ? 'You will no longer receive Onbar marketing emails. Essential order and account updates are unchanged.'
                            : 'Confirm to stop receiving Online Bar marketing emails. Essential order and account updates are unchanged.'}
                    </p>
                </div>
                {!done && (
                    <Button onClick={() => void unsubscribe()} disabled={busy || !token} className="h-12 w-full rounded-xl bg-primary font-black uppercase tracking-wider text-white">
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Unsubscribe
                    </Button>
                )}
                {!token && <p role="alert" className="text-sm font-semibold text-rose-600">This unsubscribe link is invalid or incomplete.</p>}
                {error && <p role="alert" className="text-sm font-semibold text-rose-600">{error}</p>}
            </section>
        </main>
    );
}
