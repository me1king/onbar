'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Gamepad2, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

const games = {
  never: {
    name: 'Never Have I Ever',
    description: 'Reveal a funny story, or simply pass.',
    howToPlay: 'Read the prompt aloud. Anyone who has done it can share a short story or pass. No one has to drink.',
    prompts: [
      'Never have I ever sent a message to the wrong group chat.',
      'Never have I ever laughed so hard that I cried.',
      'Never have I ever forgotten someone’s name right after meeting them.',
      'Never have I ever danced when I thought nobody was watching.',
      'Never have I ever watched an entire series in one weekend.',
      'Never have I ever made up an excuse to leave a party early.',
      'Never have I ever sung the wrong lyrics with complete confidence.',
      'Never have I ever taken a photo and immediately regretted the angle.',
      'Never have I ever stayed up late just to finish one more episode.',
      'Never have I ever tried to act cool and made the moment more awkward.'
    ]
  },
  rather: {
    name: 'Would You Rather?',
    description: 'Pick a side and make your case.',
    howToPlay: 'Everyone chooses one option, then give your reason. The group can vote on the most convincing explanation.',
    prompts: [
      'Would you rather have a personal chef or a personal driver for a month?',
      'Would you rather take a spontaneous road trip or plan the perfect staycation?',
      'Would you rather always arrive 20 minutes early or 10 minutes late?',
      'Would you rather give up music for a month or movies for a month?',
      'Would you rather host every game night or never have to clean up after one?',
      'Would you rather be able to speak every language or play every instrument?',
      'Would you rather revisit your best holiday or preview your next one?',
      'Would you rather have unlimited snacks or unlimited takeout for a week?',
      'Would you rather be great at karaoke or great at telling stories?',
      'Would you rather pick the playlist or pick the next game?'
    ]
  },
  mostLikely: {
    name: 'Most Likely To',
    description: 'Point, vote, and defend your choice.',
    howToPlay: 'Read the prompt. Count to three and point at the person who fits best. Let them share their side—or pass.',
    prompts: [
      'Who is most likely to plan a trip and forget to book the return?',
      'Who is most likely to know every word to a throwback song?',
      'Who is most likely to become friends with a stranger in five minutes?',
      'Who is most likely to bring snacks for everyone?',
      'Who is most likely to turn a small story into a full performance?',
      'Who is most likely to fall asleep during movie night?',
      'Who is most likely to suggest one more round of a board game?',
      'Who is most likely to remember everyone’s birthday?',
      'Who is most likely to make a playlist for the whole evening?',
      'Who is most likely to laugh at their own joke first?'
    ]
  },
  quickfire: {
    name: 'Quickfire Categories',
    description: 'Take turns naming things in a category.',
    howToPlay: 'Go around the group naming a new answer for the category. Take your time; skip a turn if you get stuck.',
    prompts: [
      'Name a song everyone knows the chorus to.',
      'Name a great late-night snack.',
      'Name a place you would love to visit.',
      'Name a movie you can watch more than once.',
      'Name something people always forget to pack.',
      'Name a song that gets people dancing.',
      'Name a food you would bring to a potluck.',
      'Name a fictional character you would invite to game night.',
      'Name a small thing that can make a bad day better.',
      'Name a game you loved as a kid.'
    ]
  },
  story: {
    name: 'Two Truths and a Story',
    description: 'Two true moments and one made-up tale.',
    howToPlay: 'A player shares two true statements and one invented story. Everyone guesses which story is made up. Passing is always fine.',
    prompts: [
      'Share two true things and one made-up story about a first job.',
      'Share two true things and one made-up story about a school day.',
      'Share two true things and one made-up story about a trip.',
      'Share two true things and one made-up story about a meal you cooked.',
      'Share two true things and one made-up story about a strange coincidence.',
      'Share two true things and one made-up story about a talent.',
      'Share two true things and one made-up story about a pet.',
      'Share two true things and one made-up story about a memorable party.'
    ]
  }
} as const;

type GameId = keyof typeof games;

export default function GameNightPage() {
  const [selectedGame, setSelectedGame] = React.useState<GameId>('never');
  const [confirmed, setConfirmed] = React.useState(false);
  const [drawnPrompt, setDrawnPrompt] = React.useState<string | null>(null);
  const [remainingPrompts, setRemainingPrompts] = React.useState<string[]>([]);

  const startGame = (gameId: GameId) => {
    setSelectedGame(gameId);
    setDrawnPrompt(null);
    setRemainingPrompts([...games[gameId].prompts]);
  };

  const drawPrompt = () => {
    const available = remainingPrompts.length ? remainingPrompts : [...games[selectedGame].prompts];
    const index = Math.floor(Math.random() * available.length);
    setDrawnPrompt(available[index]);
    setRemainingPrompts(available.filter((_, promptIndex) => promptIndex !== index));
  };

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-slate-950 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.25em] text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Online Bar
        </Link>

        <header className="mt-8 max-w-3xl">
          <div className="flex items-center gap-3 text-primary">
            <Gamepad2 aria-hidden="true" className="h-5 w-5" />
            <p className="text-xs font-black uppercase tracking-[0.25em]">Game night · 18+</p>
          </div>
          <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">Bring the games. Keep it easy.</h1>
          <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
            Pick a party game, draw an original prompt, and play your way. Drinking is never required; stories, water, or a pass are always valid.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            These games are for adults 18+. If anyone chooses to drink, keep it optional and within personal limits. Take breaks, drink water, eat, stop whenever you want, and never drink and drive.
          </p>
        </header>

        {!confirmed ? (
          <section className="mt-9 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-black">Make it a good night for everyone</h2>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-600">
              <li>Everyone chooses to play; no one owes a drink, story, or explanation.</li>
              <li>Any player can skip, pause, or stop at any time.</li>
              <li>Keep a safe ride home planned before the night starts.</li>
            </ul>
            <label className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={event => setConfirmed(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-primary"
              />
              We are all 18 or older, and we agree that passing is always okay.
            </label>
            <Button
              type="button"
              disabled={!confirmed}
              onClick={() => startGame(selectedGame)}
              className="mt-5 h-12 w-full rounded-xl bg-primary font-black text-slate-950 hover:bg-amber-400"
            >
              <Sparkles className="mr-2 h-4 w-4" /> Show the games
            </Button>
          </section>
        ) : (
          <>
            <section className="mt-9" aria-labelledby="choose-game">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Choose your game</p>
                  <h2 id="choose-game" className="mt-1 text-2xl font-black">Five ways to get the night going</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmed(false);
                    setDrawnPrompt(null);
                    setRemainingPrompts([]);
                  }}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-950"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Start over
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(Object.keys(games) as GameId[]).map(gameId => (
                  <button
                    key={gameId}
                    type="button"
                    aria-pressed={selectedGame === gameId}
                    onClick={() => startGame(gameId)}
                    className={`rounded-2xl border p-4 text-left transition-colors ${
                      selectedGame === gameId
                        ? 'border-primary bg-primary/15'
                        : 'border-slate-200 bg-white hover:bg-amber-50'
                    }`}
                  >
                    <span className="block font-black">{games[gameId].name}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">{games[gameId].description}</span>
                  </button>
                ))}
                <Link
                  href="/card-games"
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:bg-amber-50"
                >
                  <span className="block font-black">Date-night Cards</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">A separate two-player prompt game.</span>
                </Link>
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-amber-200 bg-[#fff8ec] p-6 shadow-lg sm:p-10" aria-live="polite">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">{games[selectedGame].name}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{games[selectedGame].howToPlay}</p>
              <div className="flex min-h-48 items-center justify-center text-center">
                <p className="max-w-3xl py-8 text-2xl font-bold leading-relaxed sm:text-3xl">
                  {drawnPrompt || 'Draw a prompt when everyone is ready.'}
                </p>
              </div>
              <div className="flex justify-center">
                <Button type="button" onClick={drawPrompt} className="h-12 rounded-xl bg-primary px-6 font-black text-slate-950 hover:bg-amber-400">
                  <Sparkles className="mr-2 h-4 w-4" /> {drawnPrompt ? 'Draw next prompt' : 'Draw a prompt'}
                </Button>
              </div>
            </section>
          </>
        )}

        <p className="mt-6 text-center text-xs leading-5 text-slate-500">
          Alcohol-free play is always welcome. 18+ only for alcohol. Please drink responsibly and arrange a safe ride.
        </p>
      </div>
    </main>
  );
}
