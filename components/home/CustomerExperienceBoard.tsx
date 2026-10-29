'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BellRing, Clock3, Coins, Gift, MapPin, RefreshCw, ShieldCheck, Sparkles, Star, TrendingUp, Zap } from 'lucide-react';
import Link from 'next/link';

const tonightPicks = [
  { name: 'Match Night Pack', price: 1900, note: '6 beers + ice + chips', eta: '12 min', accent: 'from-amber-500/20 via-orange-100 to-white' },
  { name: 'Rainy Night Comfort', price: 1500, note: 'Hot bites + cozy duo', eta: '17 min', accent: 'from-sky-500/20 via-cyan-100 to-white' },
  { name: 'Payday Reset', price: 2200, note: 'Mini bar + mixers', eta: '11 min', accent: 'from-emerald-500/20 via-lime-100 to-white' },
];

const quickReorders = [
  { name: 'Tusker 6-pack', detail: 'Your usual · 6 min', points: '+210 pts' },
  { name: 'Coke + mixers', detail: 'Add ice tonight', points: '+80 pts' },
  { name: 'Gordon’s gin', detail: 'Weekend favorite', points: '+280 pts' },
];

const flashDeals = [
  { label: 'Free ice', detail: 'with any 6-pack before 11pm', endsIn: 2 * 60 * 60 + 38 * 60 + 17 },
  { label: 'Double points', detail: 'on pizza + beer bundles', endsIn: 4 * 60 * 60 + 10 * 60 + 9 },
];

const eventsFeed = [
  { title: 'Gor Mahia vs AFC', subtitle: 'Tonight, 8:30 PM · 3 stops nearby', tag: 'Match night' },
  { title: 'Friday social drop', subtitle: '2-for-1 mixer bundle · 7 PM', tag: 'New drop' },
];

function formatCountdown(secondsLeft: number) {
  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function CustomerExperienceBoard() {
  const [now, setNow] = useState(() => Date.now());
  const startAtMs = useMemo(() => Date.now(), []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const renderFlashDeals = useMemo(
    () =>
      flashDeals.map((deal) => {
        const remaining = Math.max(0, Math.ceil((startAtMs + deal.endsIn * 1000 - now) / 1000));
        return { ...deal, countdown: formatCountdown(remaining) };
      }),
    [now, startAtMs],
  );

  return (
    <section className="mx-auto w-full max-w-7xl px-3 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Built for repeat nights</p>
          <h2 className="mt-2 text-2xl font-black uppercase tracking-tighter text-slate-950 sm:text-3xl">The experience keeps customers coming back</h2>
        </div>
        <Link href="/shop" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700 shadow-sm transition hover:border-primary hover:text-primary">
          Open menu <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Tonight&apos;s picks</p>
                <h3 className="mt-2 text-xl font-black uppercase tracking-tighter text-slate-950">Built for match nights and payday</h3>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-700">
                <Sparkles className="h-3.5 w-3.5" /> Fresh tonight
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {tonightPicks.map((item) => (
                <div key={item.name} className={`rounded-[1.5rem] border border-slate-200 bg-gradient-to-br ${item.accent} p-4`}>
                  <div className="mb-5 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">
                    <span>{item.eta}</span>
                    <span className="rounded-full bg-white/80 px-2 py-1 text-amber-700">Hot</span>
                  </div>
                  <div className="h-24 rounded-[1.25rem] bg-white/60 shadow-inner" />
                  <h4 className="mt-4 text-lg font-black uppercase tracking-tight text-slate-900">{item.name}</h4>
                  <p className="mt-1 text-sm text-slate-600">{item.note}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xl font-black text-slate-950">KSh {item.price.toLocaleString()}</span>
                    <button className="rounded-full bg-slate-950 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white">Add</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Quick reorder</p>
                  <h3 className="mt-2 text-xl font-black uppercase tracking-tighter text-slate-950">The usual, in two taps</h3>
                </div>
                <RefreshCw className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-3">
                {quickReorders.map((item) => (
                  <button key={item.name} className="flex w-full items-center justify-between rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-primary/60 hover:bg-primary/5">
                    <div>
                      <p className="text-sm font-black uppercase tracking-tight text-slate-900">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-emerald-700">{item.points}</span>
                      <ArrowRight className="h-4 w-4 text-slate-500" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-300">Loyalty</p>
                  <h3 className="mt-2 text-xl font-black uppercase tracking-tighter text-white">Your reward level</h3>
                </div>
                <div className="rounded-full bg-white/10 p-2"><Coins className="h-5 w-5 text-amber-300" /></div>
              </div>

              <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-[0.22em] text-slate-300">
                  <span>Balance</span>
                  <span>Gold</span>
                </div>
                <p className="mt-3 text-3xl font-black tracking-tighter text-white">1,240</p>
                <p className="mt-1 text-sm text-slate-300">points ready for drinks, snacks, and delivery credits</p>
              </div>

              <div className="mt-5 flex items-center justify-between rounded-full bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-300">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Verified</span>
                <span>Next tier: 760 pts</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Flash deals</p>
                <h3 className="mt-2 text-xl font-black uppercase tracking-tighter text-slate-950">Happening now</h3>
              </div>
              <Zap className="h-5 w-5 text-amber-500" />
            </div>

            <div className="mt-5 space-y-3">
              {renderFlashDeals.map((deal) => (
                <div key={deal.label} className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black uppercase tracking-tight text-slate-900">{deal.label}</p>
                      <p className="mt-1 text-xs text-slate-600">{deal.detail}</p>
                    </div>
                    <div className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-amber-700">{deal.countdown}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Local events</p>
                <h3 className="mt-2 text-xl font-black uppercase tracking-tighter text-slate-950">This weekend</h3>
              </div>
              <MapPin className="h-5 w-5 text-primary" />
            </div>

            <div className="mt-5 space-y-3">
              {eventsFeed.map((event) => (
                <div key={event.title} className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-sky-700">{event.tag}</span>
                    <Star className="h-4 w-4 text-amber-500" />
                  </div>
                  <p className="mt-3 text-base font-black uppercase tracking-tight text-slate-900">{event.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{event.subtitle}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-primary/10 to-amber-50 p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">Smart messaging</p>
                <h3 className="mt-2 text-xl font-black uppercase tracking-tighter text-slate-950">Keep customers in the loop</h3>
              </div>
              <BellRing className="h-5 w-5 text-primary" />
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-700">
              Trigger real moments: payday, rain, match night, favorite item back in stock, and quiet hours that respect consent.
            </p>
            <div className="mt-5 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-[0.22em] text-slate-700">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Message frequency capped · age-aware campaigns
            </div>
          </div>
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-primary" />
          <span>Real ETAs, accurate stock, and no fake delivery promises.</span>
        </div>
        <div className="hidden items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 sm:flex">
          <Gift className="h-3.5 w-3.5 text-amber-500" /> repeat retention loop
        </div>
      </div>
    </section>
  );
}
