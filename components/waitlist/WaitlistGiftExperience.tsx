'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Gift, Sparkles, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export default function WaitlistGiftExperience() {
  const [eligible, setEligible] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const isAdminRoute = pathname?.startsWith('/lord') || pathname?.startsWith('/admin');

  const loadGiftStatus = useCallback(async (session: Session | null) => {
    if (!session) {
      setEligible(false);
      setWelcomeOpen(false);
      return;
    }

    const response = await fetch('/api/waitlist/gift-status', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store'
    });
    const result = await response.json() as {
      eligible?: boolean;
      shouldShowWelcome?: boolean;
      error?: string;
    };
    if (!response.ok) throw new Error(result.error || 'Mystery gift status could not be loaded.');
    setEligible(result.eligible === true);
    setWelcomeOpen(result.shouldShowWelcome === true);
  }, []);

  const refreshGiftStatus = useCallback(async (session: Session | null) => {
    if (!session) {
      await loadGiftStatus(null);
      return;
    }

    const conversionResponse = await fetch('/api/waitlist/account-conversion', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store'
    });
    if (!conversionResponse.ok) {
      const result = await conversionResponse.json() as { error?: string };
      throw new Error(result.error || 'Waitlist account conversion could not be recorded.');
    }
    await loadGiftStatus(session);
  }, [loadGiftStatus]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let activeUserId: string | null = null;

    const connect = async (session: Session | null) => {
      if (!active) return;
      const userId = session?.user.id || null;
      if (userId === activeUserId) return;
      activeUserId = userId;
      try {
        await refreshGiftStatus(session);
      } catch (error) {
        console.error('[WaitlistGiftExperience] Could not load the customer gift status:', error);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void connect(session);
    });
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        return connect(data.session);
      })
      .catch(error => console.error('[WaitlistGiftExperience] Could not initialize the customer gift status:', error));

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [refreshGiftStatus]);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    if (!supabase) return;

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        return loadGiftStatus(data.session);
      })
      .catch(error => console.error('[WaitlistGiftExperience] Could not refresh gift status after navigation:', error));
  }, [loadGiftStatus, pathname]);

  const dismissWelcome = async () => {
    setWelcomeOpen(false);
    if (!supabase) return;
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('[WaitlistGiftExperience] Could not confirm the customer session:', error);
      return;
    }
    if (!data.session) return;
    try {
      const response = await fetch('/api/waitlist/gift-status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: 'no-store'
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || 'The welcome message could not be marked as seen.');
      }
    } catch (error) {
      console.error('[WaitlistGiftExperience] Could not persist the welcome popup dismissal:', error);
    }
  };

  if (!eligible && !welcomeOpen) return null;

  return (
    <>
      {eligible && !isAdminRoute && (
        <div className="sticky top-0 z-[110] border-b border-amber-300 bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-100 px-4 py-2.5 text-slate-950 shadow-sm">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs sm:text-sm">
            <Gift size={16} className="shrink-0 text-amber-900" />
            <p className="font-bold">Your waitlist mystery gift is ready for your first paid order—no extra charge.</p>
            <Link href="/shop" className="inline-flex items-center gap-1 font-black underline underline-offset-2">
              Start shopping <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {welcomeOpen && (
        <div className="fixed inset-0 z-[2200] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="waitlist-gift-title"
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-amber-200 bg-white p-7 text-center shadow-2xl"
          >
            <button
              type="button"
              onClick={() => void dismissWelcome()}
              aria-label="Close welcome message"
              className="absolute right-4 top-4 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <X size={18} />
            </button>
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
              <Sparkles size={30} />
            </span>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-800">Welcome to Online Bar</p>
            <h2 id="waitlist-gift-title" className="mt-2 text-2xl font-black text-slate-950">Your mystery gift is waiting 🎁</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Thanks for joining the waitlist. Your first paid order will include a surprise gift at no extra charge.
            </p>
            <Link
              href="/shop"
              onClick={event => {
                event.preventDefault();
                void dismissWelcome().then(() => window.location.assign('/shop'));
              }}
              className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
            >
              Explore the store <ArrowRight size={16} />
            </Link>
          </section>
        </div>
      )}
    </>
  );
}
