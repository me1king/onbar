'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

type DrinkOfDayData = {
  product: {
    id: string;
    name: string;
    category: string;
    brand: string;
    description: string;
    price: number | null;
    imageUrl: string;
  };
};

const confettiColors = ['#f59e0b', '#e11d48', '#10b981', '#6366f1', '#ec4899', '#06b6d4'];

export default function DrinkOfDayReveal({ token }: { token: string }) {
  const [data, setData] = React.useState<DrinkOfDayData | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [showReveal, setShowReveal] = React.useState(true);

  React.useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/drink-of-the-day/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      signal: controller.signal
    }).then(async response => {
      const result = await response.json() as DrinkOfDayData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'This Drink of the Day is unavailable.');
      setData(result);
    }).catch(loadError => {
      if (loadError instanceof Error && loadError.name === 'AbortError') return;
      setError(loadError instanceof Error ? loadError.message : 'This Drink of the Day is unavailable.');
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [token]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 text-sm font-semibold"><Loader2 className="h-5 w-5 animate-spin" /> Finding your drink…</div>
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center text-white">
        <section className="max-w-md space-y-3 rounded-3xl border border-white/10 bg-white/5 p-8">
          <Sparkles className="mx-auto h-8 w-8 text-amber-400" />
          <h1 className="text-2xl font-black">This reveal is unavailable</h1>
          <p role="alert" className="text-sm text-slate-300">{error || 'The link may have expired or the drink is no longer available.'}</p>
          <Link href="/" className="inline-flex text-sm font-bold text-amber-300 underline">Visit Online Bar</Link>
        </section>
      </main>
    );
  }

  const { product } = data;
  const safeImageUrl = (() => {
    if (product.imageUrl.startsWith('/') && !product.imageUrl.startsWith('//')) return product.imageUrl;
    try {
      const url = new URL(product.imageUrl);
      return url.protocol === 'https:' ? url.toString() : '';
    } catch {
      return '';
    }
  })();
  const formattedPrice = product.price === null
    ? null
    : `KSh ${new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(product.price)}`;

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 px-5 py-12 text-white">
      <style jsx>{`
        @keyframes drink-confetti-fall {
          0% { transform: translate3d(0, -20vh, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(30px, 110vh, 0) rotate(720deg); opacity: 0; }
        }
        .drink-confetti {
          position: fixed;
          top: -20px;
          z-index: 80;
          width: 9px;
          height: 15px;
          border-radius: 2px;
          pointer-events: none;
          animation: drink-confetti-fall 3.8s linear infinite;
        }
      `}</style>

      <div className="mx-auto max-w-3xl">
        <p className="text-center text-xs font-black uppercase tracking-[0.3em] text-amber-300">Online Bar · A personal pick</p>
        <section className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white text-slate-950 shadow-2xl">
          <div className="grid md:grid-cols-2">
            {safeImageUrl ? (
              <div className="relative min-h-72 bg-slate-100">
                <Image src={safeImageUrl} alt={product.name} fill unoptimized className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
              </div>
            ) : (
              <div className="flex min-h-56 items-center justify-center bg-gradient-to-br from-amber-100 to-rose-100 text-amber-800">
                <Sparkles className="h-16 w-16" />
              </div>
            )}
            <div className="flex flex-col justify-center p-7 sm:p-9">
              <p className="text-xs font-black uppercase tracking-widest text-amber-700">{product.category}{product.brand ? ` · ${product.brand}` : ''}</p>
              <h1 className="mt-3 text-3xl font-black leading-tight">{product.name}</h1>
              {product.description && <p className="mt-4 text-sm leading-6 text-slate-600">{product.description}</p>}
              {formattedPrice && <p className="mt-5 text-lg font-black text-slate-900">{formattedPrice}</p>}
              <Link
                href={`/product/${encodeURIComponent(product.id)}`}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-amber-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-400"
              >
                See this drink <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <p className="mt-4 text-xs leading-5 text-slate-500">Availability and age checks apply. Please enjoy responsibly.</p>
            </div>
          </div>
        </section>
      </div>

      {showReveal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-slate-950/85 p-5 backdrop-blur-sm">
          {Array.from({ length: 36 }, (_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className="drink-confetti"
              style={{
                left: `${(index * 37) % 100}%`,
                animationDelay: `${-((index % 12) * 0.29)}s`,
                backgroundColor: confettiColors[index % confettiColors.length]
              }}
            />
          ))}
          <section role="dialog" aria-modal="true" aria-labelledby="drink-reveal-title" className="relative z-[101] w-full max-w-md rounded-[2rem] border border-amber-200/30 bg-white p-7 text-center text-slate-950 shadow-2xl sm:p-9">
            <Sparkles className="mx-auto h-12 w-12 text-amber-500" />
            <p className="mt-4 text-xs font-black uppercase tracking-[0.25em] text-amber-700">A little surprise for you</p>
            <h2 id="drink-reveal-title" className="mt-2 text-3xl font-black">Your Drink of the Day</h2>
            <p className="mt-3 text-lg font-bold text-slate-800">{product.name}</p>
            <p className="mt-1 text-sm text-slate-500">{product.category}{formattedPrice ? ` · ${formattedPrice}` : ''}</p>
            <Button type="button" autoFocus className="mt-7 w-full bg-slate-950 font-bold text-white hover:bg-slate-800" onClick={() => setShowReveal(false)}>
              Let me see it
            </Button>
          </section>
        </div>
      )}
    </main>
  );
}
