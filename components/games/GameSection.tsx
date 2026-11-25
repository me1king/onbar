'use client';

import { useState } from 'react';
import SpinBottleRoomFrame from '@/components/games/SpinBottleRoomFrame';

type Game = {
  id: string;
  title: string;
  audience: string;
  description: string;
  src: string;
  minimumAge?: number;
  consentRequired?: boolean;
  note?: string;
};

const GAMES: Game[] = [
  {
    id: 'do-or-drink',
    title: 'Do or Drink',
    audience: '2–12 players',
    description: 'A mix of dares, truths, group prompts, and forfeits, with shot, soft-drink, and no-alcohol options.',
    src: '/games/do-or-drink.html',
    minimumAge: 18,
    consentRequired: true,
    note: 'Shots are optional and limited to two per player. Select soft drinks before the game starts.',
  },
  {
    id: 'hot-seat',
    title: 'Hot Seat',
    audience: 'Adults 18+',
    description: 'Take turns answering the group’s question, or use a pass and move on.',
    src: '/games/hot-seat-18-plus.html',
    minimumAge: 18,
    consentRequired: true,
    note: 'Contains flirty and sexual-themed questions. Every player must be an adult and agree to play.',
  },
  {
    id: 'spin-the-bottle',
    title: 'Spin the Bottle Live',
    audience: 'Adults 20+',
    description: 'Spin for truths and dares with generated music, reactions, twists, streaks, and an optional group-vote mode.',
    src: '/games/spin-the-bottle-live.html',
    minimumAge: 20,
    consentRequired: true,
    note: 'Host or join a live room from separate phones, or choose One phone for local play. Alcohol-free play is welcome.',
  },
];

export default function GameSection() {
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [started, setStarted] = useState(false);

  function chooseGame(game: Game) {
    setSelectedGame(game);
    setConfirmed(false);
    setStarted(false);
  }

  function returnToGames() {
    setSelectedGame(null);
    setConfirmed(false);
    setStarted(false);
  }

  const needsConfirmation = Boolean(
    selectedGame?.minimumAge && selectedGame.consentRequired && !started
  );

  return (
    <section className="mx-auto max-w-4xl" aria-label="Choose a party game">
      {selectedGame ? (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-primary">{selectedGame.audience}</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">{selectedGame.title}</h2>
            </div>
            <button
              type="button"
              onClick={returnToGames}
              className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              All games
            </button>
          </div>

          {needsConfirmation ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-6">
              <h3 className="text-lg font-bold text-slate-950">Adults-only game</h3>
              <p className="mt-2 leading-6 text-slate-700">{selectedGame.note}</p>
              <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-slate-800">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={event => setConfirmed(event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-amber-600"
                />
                <span>
                  I confirm everyone playing is at least {selectedGame.minimumAge}, agrees to participate, and can pass or stop at any time.
                </span>
              </label>
              <button
                type="button"
                disabled={!confirmed}
                onClick={() => setStarted(true)}
                className="mt-4 min-h-12 rounded-xl bg-primary px-5 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl">
              {selectedGame.id === 'spin-the-bottle' ? (
                <SpinBottleRoomFrame className="h-[min(1000px,calc(100dvh-180px))]" />
              ) : (
                <iframe
                  key={selectedGame.id}
                  title={selectedGame.title}
                  src={selectedGame.src}
                  className="block h-[min(1000px,calc(100dvh-180px))] min-h-[720px] w-full border-0"
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
          )}

          {selectedGame.note && !needsConfirmation && (
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">{selectedGame.note}</p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {GAMES.map(game => (
            <button
              key={game.id}
              type="button"
              onClick={() => chooseGame(game)}
              className="min-h-40 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
            >
              <span className="text-xs font-black uppercase tracking-wider text-primary">{game.audience}</span>
              <span className="mt-2 block text-xl font-black text-slate-950">{game.title}</span>
              <span className="mt-2 block text-sm leading-6 text-slate-600">{game.description}</span>
              <span className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-primary px-4 text-sm font-bold text-slate-950">Choose game</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
