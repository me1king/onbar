'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock3, Copy, Loader2, RotateCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SpinCampaignPrize } from '@/lib/spinCampaign';

interface PublicCampaign {
  id: string;
  title: string;
  ends_at: string;
  terms_url: string;
  prizes: Pick<SpinCampaignPrize, 'id' | 'label' | 'weight'>[];
}

interface SpinResult {
  id: string;
  label: string;
  type: string;
  value: number;
  minimum_order: number;
  code: string;
  expires_at: string;
}

export default function SpinCampaignPage() {
  const [campaign, setCampaign] = React.useState<PublicCampaign | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [phone, setPhone] = React.useState('');
  const [ageConfirmed, setAgeConfirmed] = React.useState(false);
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [spinning, setSpinning] = React.useState(false);
  const [result, setResult] = React.useState<SpinResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [rotation, setRotation] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    fetch('/api/spin-campaign', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { campaign?: PublicCampaign | null; error?: string };
        if (!response.ok) throw new Error(data.error || 'Campaign details could not be loaded.');
        if (active) setCampaign(data.campaign || null);
      })
      .catch(loadError => {
        if (active) setError(
          loadError instanceof Error && loadError.name === 'AbortError'
            ? 'Campaign details took too long to load. Please try again.'
            : loadError instanceof Error
              ? loadError.message
              : 'Campaign details could not be loaded.'
        );
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const spin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!campaign || spinning || result) return;
    setSpinning(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch('/api/spin-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'spin', phone, ageConfirmed, termsAccepted }),
        signal: controller.signal
      });
      const data = await response.json() as { prize?: SpinResult; error?: string };
      window.clearTimeout(timeout);
      if (!response.ok || !data.prize) throw new Error(data.error || 'Your spin could not be completed.');
      const prizeIndex = campaign.prizes.findIndex(prize => prize.id === data.prize?.id);
      if (prizeIndex < 0) throw new Error('The winning prize is not available on the campaign wheel. Please contact support.');
      const prizeAngle = prizeIndex * (360 / campaign.prizes.length);
      setRotation(current => current + 6 * 360 + ((360 - prizeAngle - current % 360 + 360) % 360));
      await new Promise(resolve => window.setTimeout(resolve, 2600));
      setResult(data.prize);
    } catch (spinError) {
      setError(
        spinError instanceof Error && spinError.name === 'AbortError'
          ? 'The campaign server took too long to respond. Please check your connection and try again.'
          : spinError instanceof Error
            ? spinError.message
            : 'Your spin could not be completed.'
      );
    } finally {
      window.clearTimeout(timeout);
      controller.abort();
      setSpinning(false);
    }
  };

  const copyCode = async () => {
    if (!result) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.code);
      } else {
        const input = document.createElement('textarea');
        input.value = result.code;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const copiedSuccessfully = document.execCommand('copy');
        document.body.removeChild(input);
        if (!copiedSuccessfully) throw new Error('Clipboard copy was blocked.');
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (copyError) {
      console.error('[SpinCampaign] Could not copy prize code:', copyError);
      setError('Could not copy the code. Please select and copy it manually.');
    }
  };

  return (
    <main className="min-h-screen bg-[#14110e] px-4 py-10 text-[#fff8ed] sm:py-14">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-primary">Online Bar</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[0.96] tracking-tight sm:text-6xl">
          Spin the bottle.<br />Every spin wins.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
          {campaign?.title || 'Black November prizes'} for your next order. Enter your phone number, spin once, and get a code to use at checkout.
        </p>

        {loading ? (
          <div className="mt-12 flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : !campaign ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="font-bold">{error ? 'Campaign unavailable' : 'This campaign is not open right now.'}</p>
            <p className="mt-2 text-sm leading-6 text-white/65">{error || 'Check back during the promotion dates. Online ordering is open 24/7.'}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-xs font-black uppercase tracking-wide text-slate-950 hover:bg-amber-400"
            >
              Check again
            </button>
          </div>
        ) : (
          <>
            <div className="@container relative mx-auto mt-10 aspect-square w-full max-w-[34rem] rounded-full border-[5px] border-primary/80 bg-[#3b291a] shadow-[0_0_0_8px_rgba(255,255,255,0.06),0_20px_70px_rgba(0,0,0,0.3)]">
              <div className="absolute inset-3 rounded-full border border-primary/30" />
              <div className="absolute inset-0 transition-transform duration-[2500ms] ease-out" style={{ transform: `rotate(${rotation}deg)` }}>
                {campaign.prizes.map((prize, index) => {
                  const angle = index * (360 / campaign.prizes.length);
                  return (
                    <div key={prize.id} className="absolute left-1/2 top-1/2 flex h-[5.5rem] w-[5.5rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#fff7e9] px-2 text-center text-xs font-black leading-tight text-slate-950 shadow-lg sm:h-24 sm:w-24 sm:text-sm"
                      style={{ transform: `rotate(${angle}deg) translateY(-37cqw) rotate(-${angle}deg)` }}>
                      {prize.label}
                    </div>
                  );
                })}
              </div>
              <div className="absolute left-1/2 top-1/2 z-10 flex h-28 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2rem] border-4 border-[#236b4c] bg-[#2d805a] shadow-2xl sm:h-36 sm:w-24">
                <div className="h-20 w-12 -rotate-45 rounded-b-2xl rounded-t-md border-4 border-[#236b4c] bg-[#fff7e9] sm:h-24 sm:w-14">
                  <div className="mx-auto mt-6 h-6 w-6 rounded-full bg-primary sm:mt-8" />
                  <div className="mx-auto mt-2 h-5 w-3 border-x-[3px] border-slate-950 sm:h-7" />
                </div>
                <div className="absolute -bottom-5 right-0 h-12 w-6 rotate-[-42deg] rounded-b-lg bg-[#236b4c] sm:h-14" />
              </div>
              <div className="absolute left-1/2 top-0 z-20 h-0 w-0 -translate-x-1/2 -translate-y-1 border-x-[14px] border-b-[23px] border-x-transparent border-b-primary" />
              {spinning && <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-spin" />}
            </div>

            <form onSubmit={spin} className="mt-10 space-y-5">
              <label className="block space-y-2 text-sm font-bold">
                Phone number
                <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="07XXXXXXXX" required disabled={spinning || Boolean(result)} className="h-14 rounded-xl border-white/15 bg-slate-800 text-lg font-semibold text-white placeholder:text-white/40" />
              </label>
              <label className="flex items-start gap-3 text-sm leading-6 text-white/80">
                <input type="checkbox" checked={ageConfirmed} onChange={event => setAgeConfirmed(event.target.checked)} disabled={spinning || Boolean(result)} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
                <span>I confirm that I am 18 or older.</span>
              </label>
              <label className="flex items-start gap-3 text-sm leading-6 text-white/80">
                <input type="checkbox" checked={termsAccepted} onChange={event => setTermsAccepted(event.target.checked)} disabled={spinning || Boolean(result)} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
                <span>I agree to the <Link className="underline underline-offset-2 hover:text-primary" href={campaign.terms_url}>campaign terms</Link> and understand each phone number can spin once.</span>
              </label>
              {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-950/40 p-3 text-sm text-rose-100">{error}</p>}
              <Button type="submit" disabled={spinning || Boolean(result) || !ageConfirmed || !termsAccepted} className="h-16 w-full rounded-xl bg-primary text-base font-black text-slate-950 hover:bg-amber-400 disabled:opacity-60">
                {spinning ? <><RotateCw className="mr-2 h-5 w-5 animate-spin" /> Spinning…</> : result ? 'One spin per phone' : 'Spin the bottle'}
              </Button>
            </form>

            {result && (
              <section aria-live="polite" className="mt-8 rounded-2xl border border-primary bg-[#211910] p-5 sm:p-7">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary"><CheckCircle2 className="h-4 w-4" /> You won</p>
                <h2 className="mt-2 text-3xl font-black">{result.label}</h2>
                {result.minimum_order > 0 && <p className="mt-2 text-sm text-white/70">Minimum item subtotal: KSh {result.minimum_order.toLocaleString('en-KE')}</p>}
                <p className="mt-2 flex items-center gap-2 text-xs text-white/60"><Clock3 className="h-4 w-4" /> Expires {new Date(result.expires_at).toLocaleDateString('en-KE')}</p>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <code className="rounded-lg bg-slate-900 px-4 py-3 font-mono text-lg font-black tracking-widest text-primary">{result.code}</code>
                  <Button type="button" variant="outline" onClick={() => void copyCode()} className="h-11 rounded-lg border-white/20 bg-transparent text-white hover:bg-white/10"><Copy className="mr-2 h-4 w-4" />{copied ? 'Copied' : 'Copy code'}</Button>
                </div>
                {['free_bottle', 'free_mixers'].includes(result.type) && <p className="mt-4 text-sm leading-6 text-white/70">This prize needs staff fulfilment. Share your code with Online Bar after placing your eligible order.</p>}
                <Button asChild className="mt-5 h-12 w-full rounded-lg bg-primary font-bold text-slate-950 hover:bg-amber-400">
                  <Link href={`/checkout?coupon=${encodeURIComponent(result.code)}`}>
                    Order in the app <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </section>
            )}
          </>
        )}

        <p className="mt-8 flex items-start gap-2 text-xs leading-5 text-white/50"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> One result per entered phone number. Codes expire with the campaign and must be used with the same phone number at checkout. 18+ only.</p>
      </div>
    </main>
  );
}
