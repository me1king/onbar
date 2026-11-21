'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Gamepad2, Gift, PartyPopper, Sparkles, Utensils } from 'lucide-react';
import { chooseVisitorExperience, type VisitorExperienceSignals } from '@/lib/visitorExperience';

const experienceContent = {
  'build-night': {
    label: 'Build the Night',
    headline: 'Plan the party, your way.',
    detail: 'Set your guest count and budget, then build a drinks list from the live menu.',
    href: '/build-the-night',
    action: 'Plan a party',
    icon: PartyPopper
  },
  'game-night': {
    label: 'Game Night',
    headline: 'Make tonight a game night.',
    detail: 'Pick a group game and get the prompts going. Drinking is optional.',
    href: '/games',
    action: 'See the games',
    icon: Gamepad2
  },
  snacks: {
    label: 'Snacks',
    headline: 'Sort the munchies.',
    detail: 'Browse snacks for a night in, a watch party, or a get-together.',
    href: '/shop/snacks',
    action: 'Browse snacks',
    icon: Utensils
  },
  souvenirs: {
    label: 'Gifts',
    headline: 'Find a gift worth sending.',
    detail: 'Explore souvenirs and gifting options from the Online Bar menu.',
    href: '/souvenirs',
    action: 'Explore gifts',
    icon: Gift
  },
  home: {
    label: 'Explore Online Bar',
    headline: 'Make tonight a good one.',
    detail: 'Browse the full menu and find something for the occasion.',
    href: '/shop',
    action: 'Explore the menu',
    icon: Sparkles
  }
} as const;

function getSignals(): VisitorExperienceSignals {
  const params = new URLSearchParams(window.location.search);
  const campaign = `${params.get('utm_campaign') || ''} ${params.get('utm_content') || ''} ${params.get('ref') || ''}`.toLowerCase();
  const sourceValue = `${params.get('utm_source') || ''} ${params.get('source') || ''}`.toLowerCase();
  const source: VisitorExperienceSignals['source'] = /game|match/.test(campaign)
    ? 'game-night'
    : /snack|munch/.test(campaign) || (/facebook|instagram|meta/.test(sourceValue) && /snack|munch/.test(campaign))
      ? 'snacks'
      : /gift|souvenir/.test(campaign)
        ? 'gifts'
        : /whisky|whiskey|party|build-night/.test(campaign)
          ? 'whisky'
          : 'direct';

  const now = new Date();
  const hour = now.getHours();
  const time: VisitorExperienceSignals['time'] = hour < 11
    ? 'morning'
    : hour < 16
      ? 'afternoon'
      : hour < 22
        ? 'evening'
        : 'late';
  const dayIndex = now.getDay();
  const day: VisitorExperienceSignals['day'] = dayIndex === 0
    ? 'sunday'
    : dayIndex === 5 || dayIndex === 6
      ? 'weekend'
      : 'weekday';

  let returning = false;
  try {
    returning = window.sessionStorage.getItem('ob-home-visited') === '1';
    window.sessionStorage.setItem('ob-home-visited', '1');
  } catch {
    console.warn('[Home] Session storage is unavailable; skipping the returning-visit signal.');
  }

  return { source, time, day, returning };
}

export default function VisitorExperienceCard() {
  const [experienceId, setExperienceId] = useState<keyof typeof experienceContent>('home');
  const [reason, setReason] = useState('');

  useEffect(() => {
    const result = chooseVisitorExperience(getSignals());
    setExperienceId(result.id);
    setReason(result.reason);
  }, []);

  const experience = experienceContent[experienceId];
  const Icon = experience.icon;

  return (
    <section aria-labelledby="visitor-experience-title" className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-8 lg:px-12">
      <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-[#fff8ec] p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-primary shadow-sm">
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{experience.label} · picked for now</p>
            <h2 id="visitor-experience-title" className="mt-1 text-lg font-black text-slate-950 sm:text-xl">{experience.headline}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{experience.detail}</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">{reason}</p>
          </div>
        </div>
        <Link
          href={experience.href}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-primary hover:text-slate-950"
        >
          {experience.action} <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
