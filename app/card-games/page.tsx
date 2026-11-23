'use client';

import * as React from 'react';
import Link from 'next/link';
import { Heart, RotateCcw, SkipForward, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

const decks = {
  warmup: {
    label: 'Warm-up',
    description: 'Easy questions to get the smiles going.',
    prompts: [
      'What was the first thing you noticed about each other?',
      'Pick a song that would make this moment feel like a movie. Why that one?',
      'What small gesture makes you feel especially appreciated?',
      'Take turns sharing your ideal relaxed evening together.',
      'What is one compliment you secretly love hearing?',
      'Choose a drink or snack you would make part of your perfect date.',
      'What is a quality in the other person that makes you feel at ease?',
      'If you could revisit one fun memory together, which one would you pick?'
    ]
  },
  flirty: {
    label: 'Flirty',
    description: 'Turn up the chemistry, one card at a time.',
    prompts: [
      'Give your partner a sincere compliment about something beyond their appearance.',
      'Hold eye contact for ten seconds. Either person can look away whenever they like.',
      'Tell your partner what you find charming about the way they move or speak.',
      'Take turns describing the kind of date-night atmosphere that makes you feel irresistible.',
      'Ask your partner what kind of affectionate gesture they enjoy. Listen without assuming.',
      'Whisper one thing you find captivating about your partner. Keep it as sweet or bold as you both like.',
      'Choose a song for a slow dance. Your partner gets to say yes, choose another, or pass.',
      'Share a playful, romantic invitation for later. The answer can be yes, maybe, or no.'
    ]
  },
  intimate: {
    label: 'Intimate',
    description: 'Closer questions for adults who both want to go there.',
    prompts: [
      'Tell your partner what about them is distracting in the best way. Keep it as bold as you both enjoy.',
      'Describe a slow, romantic kiss you would enjoy together. Ask before making it real.',
      'Share a sensual moment you would feel comfortable building toward tonight. “Not tonight” is always okay.',
      'Ask if your partner would like you to move closer. Wait for a clear yes before doing so.',
      'Take turns naming one boundary and one thing that helps you feel desired.',
      'Whisper an invitation for a private moment later. Any answer—including “no”—is welcome.',
      'Name a kind of affectionate touch you enjoy or are curious about. Ask before trying anything.',
      'Share a private fantasy you are comfortable discussing, or pass without explaining why.'
    ]
  }
} as const;

type DeckId = keyof typeof decks;

export default function CardGamesPage() {
  const [selectedDeck, setSelectedDeck] = React.useState<DeckId>('warmup');
  const [confirmed, setConfirmed] = React.useState(false);
  const [player, setPlayer] = React.useState(1);
  const [drawnPrompt, setDrawnPrompt] = React.useState<string | null>(null);
  const [remainingPrompts, setRemainingPrompts] = React.useState<string[]>([]);

  const startRound = (deck: DeckId) => {
    setSelectedDeck(deck);
    setDrawnPrompt(null);
    setRemainingPrompts([...decks[deck].prompts]);
    setPlayer(1);
  };

  const drawCard = () => {
    const available = remainingPrompts.length ? remainingPrompts : [...decks[selectedDeck].prompts];
    if (!available.length) return;
    const index = Math.floor(Math.random() * available.length);
    setDrawnPrompt(available[index]);
    setRemainingPrompts(available.filter((_, promptIndex) => promptIndex !== index));
  };

  const skipCard = () => {
    const pool = (remainingPrompts.length
      ? remainingPrompts
      : [...decks[selectedDeck].prompts]
    ).filter(prompt => prompt !== drawnPrompt);
    const available = pool.length
      ? pool
      : [...decks[selectedDeck].prompts].filter(prompt => prompt !== drawnPrompt);
    if (!available.length) return;
    const index = Math.floor(Math.random() * available.length);
    setDrawnPrompt(available[index]);
    setRemainingPrompts(available.filter((_, promptIndex) => promptIndex !== index));
    setPlayer(current => current === 1 ? 2 : 1);
  };

  const nextTurn = () => {
    setDrawnPrompt(null);
    setPlayer(current => current === 1 ? 2 : 1);
  };

  return (
    <main className="min-h-screen bg-[#15110f] px-4 py-10 text-[#fff8ed] sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-xs font-black uppercase tracking-[0.3em] text-primary hover:underline">
          Online Bar
        </Link>
        <div className="mt-8 flex items-center gap-3 text-primary">
          <Heart aria-hidden="true" className="h-5 w-5" />
          <p className="text-xs font-black uppercase tracking-[0.25em]">Date-night card game · 18+</p>
        </div>
        <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">Closer, at your pace.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-white/70">
          Original prompts for two adults. Start light, turn up the chemistry only if you both want to, and skip anything without explanation.
        </p>

        {!confirmed ? (
          <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
            <h2 className="text-xl font-black">Set the ground rules together</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-white/75">
              <li>Everyone playing must be 18 or older and freely choose to join.</li>
              <li>Play sober; nobody owes a drink, a touch, a kiss, or an answer.</li>
              <li>Either person can pass, pause, or stop at any time—no penalty and no explanation needed.</li>
              <li>Ask before any real-world affection. A prompt is never permission by itself.</li>
            </ul>
            <label className="mt-6 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm font-semibold leading-6">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={event => setConfirmed(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-primary"
              />
              We are both 18+ and want to play. We agree that “pass” always means pass.
            </label>
            <Button
              type="button"
              disabled={!confirmed}
              onClick={() => startRound(selectedDeck)}
              className="mt-5 h-12 w-full rounded-xl bg-primary font-black text-slate-950 hover:bg-amber-400"
            >
              <Sparkles className="mr-2 h-4 w-4" /> Start together
            </Button>
          </section>
        ) : (
          <>
            <div className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Choose a prompt deck">
              {(Object.keys(decks) as DeckId[]).map(deckId => (
                <button
                  key={deckId}
                  type="button"
                  aria-pressed={selectedDeck === deckId}
                  onClick={() => startRound(deckId)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    selectedDeck === deckId
                      ? 'border-primary bg-primary/15'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <span className="block font-black">{decks[deckId].label}</span>
                  <span className="mt-1 block text-xs leading-5 text-white/60">{decks[deckId].description}</span>
                </button>
              ))}
            </div>

            <section className="mt-6 rounded-3xl border border-white/10 bg-[#211b17] p-6 text-center shadow-2xl sm:p-10">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
                {decks[selectedDeck].label} · Player {player}
              </p>
              <div aria-live="polite" className="flex min-h-48 items-center justify-center">
                <p className="max-w-xl py-8 text-2xl font-bold leading-relaxed sm:text-3xl">
                  {drawnPrompt || 'Draw a card when you’re both ready.'}
                </p>
              </div>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Button type="button" onClick={drawCard} className="h-12 rounded-xl bg-primary px-6 font-black text-slate-950 hover:bg-amber-400">
                  <Sparkles className="mr-2 h-4 w-4" /> {drawnPrompt ? 'Draw next card' : 'Draw a card'}
                </Button>
                <Button type="button" variant="outline" onClick={skipCard} className="h-12 rounded-xl border-white/20 bg-transparent px-6 font-bold text-white hover:bg-white/10">
                  <SkipForward className="mr-2 h-4 w-4" /> Pass / skip
                </Button>
                <Button type="button" variant="outline" onClick={nextTurn} className="h-12 rounded-xl border-white/20 bg-transparent px-6 font-bold text-white hover:bg-white/10">
                  Next player
                </Button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfirmed(false);
                  setDrawnPrompt(null);
                  setRemainingPrompts([]);
                  setPlayer(1);
                }}
                className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-white/55 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" /> End game
              </button>
            </section>
          </>
        )}

        <p className="mt-6 text-center text-xs leading-5 text-white/45">
          18+ only. Keep it fun, kind, and mutual. This is a self-reported age check, not legal age verification.
        </p>
      </div>
    </main>
  );
}
