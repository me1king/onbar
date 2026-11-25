'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Gamepad2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

const games = [
  {
    id: 'spin-the-bottle',
    name: 'Spin the Bottle Live',
    detail: 'Truths and dares with a local pass-the-phone mode.',
    age: '20+'
  },
  {
    id: 'do-or-drink',
    name: 'Do or Drink',
    detail: 'Dares, truths, group prompts, and forfeits.',
    age: '18+'
  }
] as const;

type GameId = (typeof games)[number]['id'];
type DrinkMode = 'shots' | 'soft';

const gameUrls: Record<GameId, string> = {
  'spin-the-bottle': '/games/spin-the-bottle-live.html',
  'do-or-drink': '/games/do-or-drink.html'
};

export default function GameNightManagerPage() {
  const [game, setGame] = React.useState<GameId>('spin-the-bottle');
  const [drinkMode, setDrinkMode] = React.useState<DrinkMode>('shots');
  const [confirmed, setConfirmed] = React.useState(false);
  const selectedGame = games.find(option => option.id === game) ?? games[0];

  const startGame = () => {
    if (!confirmed) return;
    const url = new URL(gameUrls[game], window.location.origin);
    url.searchParams.set('drinkMode', drinkMode);
    window.location.assign(url.toString());
  };

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-slate-950 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/games" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to Game Night
        </Link>

        <header className="mt-8">
          <div className="flex items-center gap-3 text-primary">
            <Gamepad2 aria-hidden="true" className="h-5 w-5" />
            <p className="text-xs font-black uppercase tracking-[0.2em]">Game night manager</p>
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Set up the game before you start</h1>
          <p className="mt-3 leading-7 text-slate-600">
            Pick a game and decide the drink mode with the group. Shot mode is selected by default; soft drinks only appear in the game if you choose them here.
          </p>
        </header>

        <div className="mt-8 space-y-6">
          <fieldset>
            <legend className="text-lg font-black">1. Choose a game</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {games.map(option => (
                <label
                  key={option.id}
                  className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${
                    game === option.id ? 'border-primary bg-amber-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="game"
                    value={option.id}
                    checked={game === option.id}
                    onChange={() => {
                      setGame(option.id);
                      setConfirmed(false);
                    }}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block font-black">{option.name}</span>
                    <span className="mt-1 block text-sm leading-5 text-slate-600">{option.detail}</span>
                    <span className="mt-2 block text-xs font-bold text-slate-500">Minimum age: {option.age}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-lg font-black">2. Choose the drink mode</legend>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              You can change this for each game night. Passing never requires a drink.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${drinkMode === 'shots' ? 'border-primary bg-amber-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input
                  type="radio"
                  name="drinkMode"
                  value="shots"
                  checked={drinkMode === 'shots'}
                  onChange={() => setDrinkMode('shots')}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block font-black">Take a shot</span>
                  <span className="mt-1 block text-sm leading-5 text-slate-600">Optional. The games cap shots per player, and anyone may pass.</span>
                </span>
              </label>
              <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${drinkMode === 'soft' ? 'border-primary bg-amber-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input
                  type="radio"
                  name="drinkMode"
                  value="soft"
                  checked={drinkMode === 'soft'}
                  onChange={() => setDrinkMode('soft')}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block font-black">Take a soft drink</span>
                  <span className="mt-1 block text-sm leading-5 text-slate-600">Select this before starting to use soft drinks instead of shots.</span>
                </span>
              </label>
            </div>
          </fieldset>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="font-black">Before you launch</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {selectedGame.name} is for players aged {selectedGame.age}. Alcohol is optional; never pressure anyone, and never drink and drive.
            </p>
            <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-slate-700">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={event => setConfirmed(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-primary"
              />
              <span>Everyone meets the age requirement, agrees to play, and knows they can pass or stop at any time.</span>
            </label>
          </section>

          <Button
            type="button"
            disabled={!confirmed}
            onClick={startGame}
            className="h-12 w-full rounded-xl bg-primary font-black text-slate-950 hover:bg-amber-400"
          >
            <Play aria-hidden="true" className="mr-2 h-4 w-4" /> Start {selectedGame.name}
          </Button>
          <p className="text-center text-xs text-slate-500" aria-live="polite">
            Selected: {selectedGame.name} · {drinkMode === 'shots' ? 'Take a shot (optional)' : 'Soft drinks'}
          </p>
        </div>
      </div>
    </main>
  );
}
