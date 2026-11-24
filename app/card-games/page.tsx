'use client';

import * as React from 'react';
import Link from 'next/link';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { CircleDot, Heart, RotateCcw, SkipForward, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OB_OS } from '@/lib/onlineBarOS';
import { supabase } from '@/lib/supabaseClient';

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
type GameMode = 'bottle' | 'truth-or-dare' | 'cards';
type ChallengeType = 'truth' | 'dare';

const challenges: Record<ChallengeType, string[]> = {
  truth: [
    'What song do you secretly know every word to?',
    'What small thing can instantly improve your day?',
    'What is a harmless skill you wish you had?',
    'What was your funniest first impression of someone here?',
    'What is your ideal way to spend a free evening?',
    'What is something you are proud of but rarely mention?'
  ],
  dare: [
    'Give a ten-second impression of a famous person.',
    'Make up a three-line toast to the group.',
    'Do a ten-second dance, or invite the group to join you.',
    'Give someone at the table a sincere, specific compliment.',
    'Draw your favourite snack with your eyes closed.',
    'Commentate on the next minute like a sports announcer.'
  ]
};

type GameAction =
  | { type: 'set-mode'; mode: GameMode }
  | { type: 'start-round'; deck: DeckId }
  | { type: 'spin-bottle' }
  | { type: 'draw-challenge'; challengeType: ChallengeType }
  | { type: 'next-challenge' }
  | { type: 'next-bottle-turn' }
  | { type: 'draw-card' }
  | { type: 'skip-card' }
  | { type: 'next-player' }
  | { type: 'end-game' };

interface GameSnapshot {
  confirmed: boolean;
  gameMode: GameMode;
  selectedDeck: DeckId;
  player: number;
  drawnPrompt: string | null;
  remainingPrompts: string[];
  playerNames: string;
  bottleRotation: number;
  bottleSpinning: boolean;
  bottleWinner: string | null;
  turnIndex: number;
  challenge: { type: ChallengeType; text: string } | null;
  usedChallenges: string[];
}

function isGameSnapshot(value: unknown): value is GameSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  const challenge = snapshot.challenge;
  return (
    typeof snapshot.confirmed === 'boolean'
    && (snapshot.gameMode === 'bottle' || snapshot.gameMode === 'truth-or-dare' || snapshot.gameMode === 'cards')
    && typeof snapshot.selectedDeck === 'string'
    && snapshot.selectedDeck in decks
    && Number.isInteger(snapshot.player)
    && (snapshot.player === 1 || snapshot.player === 2)
    && (snapshot.drawnPrompt === null || typeof snapshot.drawnPrompt === 'string')
    && Array.isArray(snapshot.remainingPrompts)
    && snapshot.remainingPrompts.length <= 100
    && snapshot.remainingPrompts.every(prompt => typeof prompt === 'string')
    && typeof snapshot.playerNames === 'string'
    && snapshot.playerNames.length <= 300
    && typeof snapshot.bottleRotation === 'number'
    && Number.isFinite(snapshot.bottleRotation)
    && typeof snapshot.bottleSpinning === 'boolean'
    && (snapshot.bottleWinner === null || typeof snapshot.bottleWinner === 'string')
    && Number.isInteger(snapshot.turnIndex)
    && Number(snapshot.turnIndex) >= 0
    && (challenge === null || (
      typeof challenge === 'object'
      && challenge !== null
      && ((challenge as Record<string, unknown>).type === 'truth' || (challenge as Record<string, unknown>).type === 'dare')
      && typeof (challenge as Record<string, unknown>).text === 'string'
    ))
    && Array.isArray(snapshot.usedChallenges)
    && snapshot.usedChallenges.length <= 100
    && snapshot.usedChallenges.every(prompt => typeof prompt === 'string')
  );
}

function isGameAction(value: unknown): value is GameAction {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  const action = value as Record<string, unknown>;
  if (action.type === 'set-mode') {
    return action.mode === 'bottle' || action.mode === 'truth-or-dare' || action.mode === 'cards';
  }
  if (action.type === 'start-round') {
    return typeof action.deck === 'string' && action.deck in decks;
  }
  if (action.type === 'draw-challenge') {
    return action.challengeType === 'truth' || action.challengeType === 'dare';
  }
  return [
    'spin-bottle',
    'next-challenge',
    'next-bottle-turn',
    'draw-card',
    'skip-card',
    'next-player',
    'end-game'
  ].includes(String(action.type));
}

export default function CardGamesPage() {
  const [gameMode, setGameMode] = React.useState<GameMode>('bottle');
  const [selectedDeck, setSelectedDeck] = React.useState<DeckId>('warmup');
  const [confirmed, setConfirmed] = React.useState(false);
  const [player, setPlayer] = React.useState(1);
  const [drawnPrompt, setDrawnPrompt] = React.useState<string | null>(null);
  const [remainingPrompts, setRemainingPrompts] = React.useState<string[]>([]);
  const [playerNames, setPlayerNames] = React.useState('Player 1\nPlayer 2');
  const [bottleRotation, setBottleRotation] = React.useState(0);
  const [bottleSpinning, setBottleSpinning] = React.useState(false);
  const [bottleWinner, setBottleWinner] = React.useState<string | null>(null);
  const [turnIndex, setTurnIndex] = React.useState(0);
  const [challenge, setChallenge] = React.useState<{ type: ChallengeType; text: string } | null>(null);
  const [usedChallenges, setUsedChallenges] = React.useState<string[]>([]);
  const [roomCode, setRoomCode] = React.useState('');
  const [roomInput, setRoomInput] = React.useState('');
  const [roomStatus, setRoomStatus] = React.useState('');
  const [roomChannel, setRoomChannel] = React.useState<RealtimeChannel | null>(null);
  const [isRoomHost, setIsRoomHost] = React.useState(false);
  const [onlineRoom, setOnlineRoom] = React.useState(false);
  const snapshotRef = React.useRef<GameSnapshot | null>(null);
  const applyActionRef = React.useRef<(action: GameAction) => void>(() => undefined);

  const players = React.useMemo(
    () => playerNames.split(/[\n,]/).map(name => name.trim()).filter(Boolean),
    [playerNames]
  );

  const startRoundNow = (deck: DeckId) => {
    setSelectedDeck(deck);
    setDrawnPrompt(null);
    setRemainingPrompts([...decks[deck].prompts]);
    setPlayer(1);
  };

  const spinBottleNow = () => {
    if (bottleSpinning || players.length < 2 || players.length > 8) return;
    const winnerIndex = Math.floor(Math.random() * players.length);
    const segmentAngle = 360 / players.length;
    const targetAngle = winnerIndex * segmentAngle;
    setBottleWinner(null);
    setChallenge(null);
    setBottleSpinning(true);
    setBottleRotation(current =>
      current + 5 * 360 + ((targetAngle - current % 360 + 360) % 360)
    );
    window.setTimeout(() => {
      setBottleWinner(players[winnerIndex]);
      setBottleSpinning(false);
    }, 3200);
  };

  const drawChallengeNow = (type: ChallengeType) => {
    const options = challenges[type].filter(prompt => !usedChallenges.includes(prompt));
    const pool = options.length ? options : challenges[type];
    const prompt = pool[Math.floor(Math.random() * pool.length)];
    setChallenge({ type, text: prompt });
    setUsedChallenges(current => options.length ? [...current, prompt] : [prompt]);
  };

  const nextChallengeTurnNow = () => {
    setChallenge(null);
    setTurnIndex(current => (current + 1) % Math.max(players.length, 1));
  };

  const nextBottleTurnNow = () => {
    setBottleWinner(null);
    setChallenge(null);
  };

  const drawCardNow = () => {
    const pool = remainingPrompts.length
      ? remainingPrompts
      : [...decks[selectedDeck].prompts];
    const available = pool.filter(prompt => prompt !== drawnPrompt);
    if (!available.length) {
      setDrawnPrompt(null);
      setRemainingPrompts([...decks[selectedDeck].prompts]);
      return;
    }
    const index = Math.floor(Math.random() * available.length);
    setDrawnPrompt(available[index]);
    setRemainingPrompts(available.filter((_, promptIndex) => promptIndex !== index));
  };

  const skipCardNow = () => {
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

  const nextTurnNow = () => {
    setDrawnPrompt(null);
    setPlayer(current => current === 1 ? 2 : 1);
  };

  const applyAction = (action: GameAction) => {
    switch (action.type) {
      case 'set-mode':
        setGameMode(action.mode);
        setChallenge(null);
        if (action.mode !== 'bottle') setBottleWinner(null);
        break;
      case 'start-round':
        startRoundNow(action.deck);
        break;
      case 'spin-bottle':
        spinBottleNow();
        break;
      case 'draw-challenge':
        drawChallengeNow(action.challengeType);
        break;
      case 'next-challenge':
        nextChallengeTurnNow();
        break;
      case 'next-bottle-turn':
        nextBottleTurnNow();
        break;
      case 'draw-card':
        drawCardNow();
        break;
      case 'skip-card':
        skipCardNow();
        break;
      case 'next-player':
        nextTurnNow();
        break;
      case 'end-game':
        setConfirmed(false);
        setGameMode('bottle');
        setSelectedDeck('warmup');
        setDrawnPrompt(null);
        setRemainingPrompts([]);
        setPlayer(1);
        setBottleWinner(null);
        setBottleSpinning(false);
        setChallenge(null);
        setTurnIndex(0);
        setUsedChallenges([]);
        break;
    }
  };
  applyActionRef.current = applyAction;

  const snapshot = React.useMemo<GameSnapshot>(() => ({
    confirmed,
    gameMode,
    selectedDeck,
    player,
    drawnPrompt,
    remainingPrompts,
    playerNames,
    bottleRotation,
    bottleSpinning,
    bottleWinner,
    turnIndex,
    challenge,
    usedChallenges
  }), [
    confirmed,
    gameMode,
    selectedDeck,
    player,
    drawnPrompt,
    remainingPrompts,
    playerNames,
    bottleRotation,
    bottleSpinning,
    bottleWinner,
    turnIndex,
    challenge,
    usedChallenges
  ]);
  snapshotRef.current = snapshot;

  const requestAction = (action: GameAction) => {
    if (action.type === 'spin-bottle' && (players.length < 2 || players.length > 8)) return;
    if (action.type === 'set-mode') {
      void OB_OS.track('GAME_NIGHT_MODE_SELECTED', { details: { mode: action.mode } });
    } else if (action.type === 'end-game') {
      void OB_OS.track('GAME_NIGHT_ENDED', { details: { mode: gameMode } });
    } else if (action.type !== 'start-round') {
      const actionName = action.type === 'draw-challenge'
        ? action.challengeType
        : action.type;
      const role = onlineRoom ? (isRoomHost ? 'host' : 'guest') : 'local';
      const trackAction = () => OB_OS.track('GAME_NIGHT_ACTION', {
        details: { action: actionName, mode: gameMode, play_context: role }
      });
      if (onlineRoom && !isRoomHost) {
        if (!roomChannel) {
          setRoomStatus('The room is disconnected. Rejoin using the invite link.');
          return;
        }
        void roomChannel.send({ type: 'broadcast', event: 'game-action', payload: action })
          .then(result => {
            if (result !== 'ok') {
              setRoomStatus('That move did not reach the host. Please try again.');
              return;
            }
            void trackAction();
          })
          .catch(() => setRoomStatus('That move did not reach the host. Please try again.'));
        return;
      }
      void trackAction();
    }

    if (onlineRoom && !isRoomHost) {
      if (!roomChannel) {
        setRoomStatus('The room is disconnected. Rejoin using the invite link.');
        return;
      }
      void roomChannel.send({ type: 'broadcast', event: 'game-action', payload: action })
        .then(result => {
          if (result !== 'ok') setRoomStatus('That move did not reach the host. Please try again.');
        })
        .catch(() => setRoomStatus('That move did not reach the host. Please try again.'));
      return;
    }
    applyActionRef.current(action);
  };

  const connectRoom = (code: string, host: boolean) => {
    if (!supabase) {
      setRoomStatus('Online games need Supabase configured. Local games still work.');
      return;
    }
    if (!/^[a-f\d]{32}$/i.test(code)) {
      setRoomStatus('That room link is invalid. Ask the host for a fresh invite link.');
      return;
    }

    if (roomChannel) void supabase.removeChannel(roomChannel);
    setRoomStatus('Connecting to the online room…');
    const channel = supabase.channel(`game-night:${code}`, { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'game-state' }, ({ payload }) => {
        if (!host && isGameSnapshot(payload)) {
          setConfirmed(payload.confirmed);
          setGameMode(payload.gameMode);
          setSelectedDeck(payload.selectedDeck);
          setPlayer(payload.player);
          setDrawnPrompt(payload.drawnPrompt);
          setRemainingPrompts(payload.remainingPrompts);
          setPlayerNames(payload.playerNames);
          setBottleRotation(payload.bottleRotation);
          setBottleSpinning(payload.bottleSpinning);
          setBottleWinner(payload.bottleWinner);
          setTurnIndex(payload.turnIndex);
          setChallenge(payload.challenge);
          setUsedChallenges(payload.usedChallenges);
        }
      })
      .on('broadcast', { event: 'request-state' }, () => {
        if (host && snapshotRef.current) {
          void channel.send({ type: 'broadcast', event: 'game-state', payload: snapshotRef.current });
        }
      })
      .on('broadcast', { event: 'game-action' }, ({ payload }) => {
        if (host && isGameAction(payload)) applyActionRef.current(payload);
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          setRoomChannel(channel);
          setRoomCode(code);
          setIsRoomHost(host);
          setOnlineRoom(true);
          setRoomStatus(host ? 'Room ready. Share the invite link with your players.' : 'Connected. Waiting for the host to sync the game…');
          void OB_OS.track(host ? 'GAME_NIGHT_ROOM_CREATED' : 'GAME_NIGHT_ROOM_JOINED', {
            details: { mode: gameMode, play_context: 'online', role: host ? 'host' : 'guest' }
          });
          if (!host) void channel.send({ type: 'broadcast', event: 'request-state', payload: {} });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRoomStatus('Could not connect to the room. Check your connection and try again.');
        } else if (status === 'CLOSED') {
          setOnlineRoom(false);
          setRoomStatus('The room connection closed. Rejoin using the invite link.');
        }
      });
  };

  const createOnlineRoom = () => {
    if (!confirmed) {
      setRoomStatus('Confirm everyone is 18+ before creating an online game.');
      return;
    }
    connectRoom(crypto.randomUUID().replace(/-/g, ''), true);
  };

  const joinOnlineRoom = (event: React.FormEvent) => {
    event.preventDefault();
    if (!confirmed) {
      setRoomStatus('Confirm everyone is 18+ before joining an online game.');
      return;
    }
    const enteredValue = roomInput.trim();
    let code = enteredValue.toLowerCase();
    try {
      if (enteredValue.includes('://')) {
        code = new URL(enteredValue).searchParams.get('room')?.toLowerCase() || '';
      }
    } catch {
      setRoomStatus('That invite link is invalid. Ask the host for a fresh invite link.');
      return;
    }
    connectRoom(code, false);
  };

  const leaveOnlineRoom = () => {
    if (supabase && roomChannel) void supabase.removeChannel(roomChannel);
    setRoomChannel(null);
    setOnlineRoom(false);
    setIsRoomHost(false);
    setRoomCode('');
    setRoomStatus('You left the online room. The local game is still available.');
  };

  React.useEffect(() => {
    const requestedRoom = new URLSearchParams(window.location.search).get('room');
    if (requestedRoom && /^[a-f\d]{32}$/i.test(requestedRoom)) setRoomInput(requestedRoom);
  }, []);

  React.useEffect(() => {
    if (!onlineRoom || !isRoomHost || !roomChannel) return;
    void roomChannel.send({ type: 'broadcast', event: 'game-state', payload: snapshot });
  }, [onlineRoom, isRoomHost, roomChannel, snapshot]);

  React.useEffect(() => () => {
    if (supabase && roomChannel) void supabase.removeChannel(roomChannel);
  }, [roomChannel]);

  const copyRoomLink = async () => {
    const link = `${window.location.origin}/card-games?room=${roomCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setRoomStatus('Invite link copied. Share it with your players.');
    } catch {
      setRoomStatus(`Copy this invite link: ${link}`);
    }
  };

  return (
    <main className="min-h-screen bg-[#15110f] px-4 py-10 text-[#fff8ed] sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-xs font-black uppercase tracking-[0.3em] text-primary hover:underline">
          Online Bar
        </Link>
        <div className="mt-8 flex items-center gap-3 text-primary">
          <Heart aria-hidden="true" className="h-5 w-5" />
          <p className="text-xs font-black uppercase tracking-[0.25em]">Game night · 18+</p>
        </div>
        <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">Game night, your way.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-white/70">
          Play together on one device, or create an online room and share its invite link. Online rooms sync game turns live; no account is needed.
        </p>

        {!confirmed ? (
          <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
            <h2 className="text-xl font-black">Set the ground rules together</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-white/75">
              <li>Everyone playing is 18 or older and freely chooses to join.</li>
              <li>No one owes a drink, touch, kiss, performance, or answer.</li>
              <li>Anyone can pass, pause, or stop at any time—no penalty and no explanation needed.</li>
              <li>The bottle picks a player, not a partner. Ask before any affection.</li>
            </ul>
            <label className="mt-6 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm font-semibold leading-6">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={event => setConfirmed(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-primary"
              />
              We are all 18+ and want to play. Passing is always okay.
            </label>
            <Button
              type="button"
              disabled={!confirmed}
              onClick={() => {
                void OB_OS.track('GAME_NIGHT_STARTED', { details: { mode: gameMode } });
                requestAction({ type: 'start-round', deck: selectedDeck });
              }}
              className="mt-5 h-12 w-full rounded-xl bg-primary font-black text-slate-950 hover:bg-amber-400"
            >
              <Sparkles className="mr-2 h-4 w-4" /> Start together
            </Button>
          </section>
        ) : (
          <>
            <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-black">Play online</h2>
                  <p className="mt-1 max-w-xl text-xs leading-5 text-white/60">
                    Create a room and share the invite link. Keep the host tab open while you play.
                  </p>
                </div>
                {onlineRoom && (
                  <Button type="button" variant="outline" onClick={leaveOnlineRoom} className="h-10 shrink-0 rounded-xl border-white/20 bg-transparent px-4 text-white hover:bg-white/10">
                    Leave room
                  </Button>
                )}
              </div>
              {onlineRoom ? (
                <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/10 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-primary">
                    {isRoomHost ? 'Host · online room' : 'Player · online room'}
                  </p>
                  <p className="mt-1 break-all font-mono text-sm text-white">{roomCode}</p>
                  <Button type="button" onClick={copyRoomLink} className="mt-3 h-10 rounded-xl bg-primary px-4 font-black text-slate-950 hover:bg-amber-400">
                    Copy invite link
                  </Button>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    disabled={!supabase}
                    onClick={createOnlineRoom}
                    className="h-11 rounded-xl bg-primary font-black text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Create online room
                  </Button>
                  <form onSubmit={joinOnlineRoom} className="flex gap-2">
                    <input
                      value={roomInput}
                      onChange={event => setRoomInput(event.target.value)}
                      maxLength={36}
                      placeholder="Paste an invite link or room code"
                      aria-label="Room invite link or code"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white placeholder:text-white/40 outline-none focus:border-primary"
                    />
                    <Button type="submit" disabled={!supabase} variant="outline" className="h-11 rounded-xl border-white/20 bg-transparent px-4 font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
                      Join
                    </Button>
                  </form>
                </div>
              )}
              {roomStatus && <p role="status" className="mt-3 break-words text-xs text-white/70">{roomStatus}</p>}
              {!supabase && <p role="alert" className="mt-3 text-xs font-semibold text-amber-200">Online rooms are unavailable because Supabase is not configured. Local games still work.</p>}
            </section>

            <div className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Choose a game">
              <button
                type="button"
                aria-pressed={gameMode === 'bottle'}
                onClick={() => requestAction({ type: 'set-mode', mode: 'bottle' })}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  gameMode === 'bottle' ? 'border-primary bg-primary/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <span className="flex items-center gap-2 font-black"><CircleDot className="h-4 w-4 text-primary" /> Spin the bottle</span>
                <span className="mt-1 block text-xs leading-5 text-white/60">Pick who goes next, then choose truth, dare, or pass.</span>
              </button>
              <button
                type="button"
                aria-pressed={gameMode === 'truth-or-dare'}
                onClick={() => requestAction({ type: 'set-mode', mode: 'truth-or-dare' })}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  gameMode === 'truth-or-dare' ? 'border-primary bg-primary/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <span className="block font-black">Truth or Dare</span>
                <span className="mt-1 block text-xs leading-5 text-white/60">Light-hearted prompts for the whole group.</span>
              </button>
              <button
                type="button"
                aria-pressed={gameMode === 'cards'}
                onClick={() => requestAction({ type: 'set-mode', mode: 'cards' })}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  gameMode === 'cards' ? 'border-primary bg-primary/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <span className="block font-black">Date-night cards</span>
                <span className="mt-1 block text-xs leading-5 text-white/60">Conversation decks for two.</span>
              </button>
            </div>

            {gameMode !== 'cards' && (
              <section className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                <label htmlFor="game-night-players" className="flex items-center gap-2 text-sm font-black">
                  <Users className="h-4 w-4 text-primary" /> Players
                </label>
                <textarea
                  id="game-night-players"
                  value={playerNames}
                  onChange={event => setPlayerNames(event.target.value)}
                  disabled={bottleSpinning || (onlineRoom && !isRoomHost)}
                  rows={3}
                  maxLength={300}
                  placeholder={'One name per line, or separate names with commas'}
                  className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-primary"
                />
                <p className="mt-2 text-xs text-white/50">
                  Enter 2–8 names, one per line or separated by commas.{onlineRoom && !isRoomHost ? ' Ask the host to edit the player list.' : ''}
                </p>
              </section>
            )}

            {gameMode === 'bottle' && (
              <section className="mt-6 rounded-3xl border border-white/10 bg-[#211b17] p-6 text-center shadow-2xl sm:p-8">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Spin to choose a player</p>
                {players.length >= 2 && players.length <= 8 ? (
                  <div
                    className="relative mx-auto mt-8 aspect-square w-full max-w-[26rem] overflow-hidden rounded-full border-4 border-primary/70 bg-[#38281d] shadow-[0_0_50px_rgba(245,160,0,0.12)]"
                    aria-label={`Player spinner with ${players.length} players`}
                  >
                    <div aria-hidden="true" className="absolute inset-0 rounded-full bg-[radial-gradient(circle,#241a14_0_38%,#49321f_39%_100%)]" />
                    {players.map((name, index) => {
                      const angle = index * 2 * Math.PI / players.length;
                      return (
                        <span
                          key={`${name}-${index}`}
                          className="absolute z-20 max-w-[5.5rem] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border border-white/20 bg-black/45 px-3 py-2 text-xs font-black text-white sm:max-w-24 sm:text-sm"
                          style={{
                            left: `${50 + 37 * Math.sin(angle)}%`,
                            top: `${50 - 37 * Math.cos(angle)}%`
                          }}
                        >
                          {name}
                        </span>
                      );
                    })}
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 transition-transform duration-[3200ms] ease-out"
                      style={{ transform: `rotate(${bottleRotation}deg)` }}
                    >
                      <div className="absolute left-1/2 top-[13%] h-[37%] w-[14%] -translate-x-1/2 rounded-[45%_45%_22%_22%] border-2 border-amber-100/80 bg-gradient-to-r from-amber-100 via-white to-amber-200 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
                        <div className="absolute -top-[13%] left-1/2 h-[17%] w-[44%] -translate-x-1/2 rounded-t-md border border-amber-100/80 bg-primary" />
                        <div className="absolute left-1/2 top-[42%] h-[3px] w-[80%] -translate-x-1/2 bg-amber-700/40" />
                      </div>
                    </div>
                    <div aria-hidden="true" className="absolute left-1/2 top-1/2 z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-primary bg-[#17110c] shadow-xl" />
                  </div>
                ) : (
                  <p role="alert" className="mt-6 rounded-xl border border-amber-400/30 bg-amber-950/30 p-4 text-sm text-amber-100">
                    Add between 2 and 8 player names to spin.
                  </p>
                )}
                {bottleWinner && (
                  <div aria-live="polite" className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-primary">The bottle picked</p>
                    <p className="mt-2 text-3xl font-black">{bottleWinner}</p>
                    <p className="mt-2 text-sm text-white/70">Your turn: choose truth, dare, or pass.</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-3">
                          <Button type="button" onClick={() => requestAction({ type: 'draw-challenge', challengeType: 'truth' })} className="h-11 rounded-xl bg-primary px-5 font-black text-slate-950 hover:bg-amber-400">Truth</Button>
                          <Button type="button" onClick={() => requestAction({ type: 'draw-challenge', challengeType: 'dare' })} className="h-11 rounded-xl bg-primary px-5 font-black text-slate-950 hover:bg-amber-400">Dare</Button>
                          <Button type="button" variant="outline" onClick={() => requestAction({ type: 'next-bottle-turn' })} className="h-11 rounded-xl border-white/20 bg-transparent px-5 font-bold text-white hover:bg-white/10">Pass</Button>
                    </div>
                  </div>
                )}
                {challenge && gameMode === 'bottle' && (
                  <div aria-live="polite" className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-primary">{challenge.type}</p>
                    <p className="mt-2 text-xl font-bold leading-relaxed">{challenge.text}</p>
                    <Button type="button" variant="outline" onClick={() => requestAction({ type: 'next-bottle-turn' })} className="mt-4 h-10 rounded-xl border-white/20 bg-transparent px-5 font-bold text-white hover:bg-white/10">Next turn</Button>
                  </div>
                )}
                <Button
                  type="button"
                  onClick={() => requestAction({ type: 'spin-bottle' })}
                  disabled={bottleSpinning || players.length < 2 || players.length > 8}
                  className="mt-6 h-12 w-full rounded-xl bg-primary font-black text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CircleDot className={`mr-2 h-4 w-4 ${bottleSpinning ? 'animate-spin' : ''}`} />
                  {bottleSpinning ? 'Spinning…' : 'Spin the bottle'}
                </Button>
              </section>
            )}

            {gameMode === 'truth-or-dare' && (
              <section className="mt-6 rounded-3xl border border-white/10 bg-[#211b17] p-6 text-center shadow-2xl sm:p-8">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
                  {players.length ? players[turnIndex % players.length] : 'Player'} · choose your turn
                </p>
                {challenge ? (
                  <div aria-live="polite" className="flex min-h-48 flex-col items-center justify-center">
                    <p className="text-xs font-black uppercase tracking-widest text-primary">{challenge.type}</p>
                    <p className="max-w-xl py-4 text-2xl font-bold leading-relaxed sm:text-3xl">{challenge.text}</p>
                  </div>
                ) : (
                  <p className="flex min-h-48 items-center justify-center text-lg text-white/65">Pick truth, dare, or pass. No penalties.</p>
                )}
                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                  <Button type="button" onClick={() => requestAction({ type: 'draw-challenge', challengeType: 'truth' })} className="h-12 rounded-xl bg-primary px-6 font-black text-slate-950 hover:bg-amber-400">Truth</Button>
                  <Button type="button" onClick={() => requestAction({ type: 'draw-challenge', challengeType: 'dare' })} className="h-12 rounded-xl bg-primary px-6 font-black text-slate-950 hover:bg-amber-400">Dare</Button>
                  <Button type="button" variant="outline" onClick={() => requestAction({ type: 'next-challenge' })} className="h-12 rounded-xl border-white/20 bg-transparent px-6 font-bold text-white hover:bg-white/10">{challenge ? 'Next turn' : 'Pass'}</Button>
                </div>
              </section>
            )}

            {gameMode === 'cards' && (
              <>
            <div className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Choose a prompt deck">
              {(Object.keys(decks) as DeckId[]).map(deckId => (
                <button
                  key={deckId}
                  type="button"
                  aria-pressed={selectedDeck === deckId}
                  onClick={() => requestAction({ type: 'start-round', deck: deckId })}
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
                <Button type="button" onClick={() => requestAction({ type: 'draw-card' })} className="h-12 rounded-xl bg-primary px-6 font-black text-slate-950 hover:bg-amber-400">
                  <Sparkles className="mr-2 h-4 w-4" /> {drawnPrompt ? 'Draw next card' : 'Draw a card'}
                </Button>
                <Button type="button" variant="outline" onClick={() => requestAction({ type: 'skip-card' })} className="h-12 rounded-xl border-white/20 bg-transparent px-6 font-bold text-white hover:bg-white/10">
                  <SkipForward className="mr-2 h-4 w-4" /> Pass / skip
                </Button>
                <Button type="button" variant="outline" onClick={() => requestAction({ type: 'next-player' })} className="h-12 rounded-xl border-white/20 bg-transparent px-6 font-bold text-white hover:bg-white/10">
                  Next player
                </Button>
              </div>
              <button
                type="button"
                onClick={() => requestAction({ type: 'end-game' })}
                className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-white/55 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" /> End game
              </button>
            </section>
              </>
            )}
            {gameMode !== 'cards' && (
              <button
                type="button"
                onClick={() => requestAction({ type: 'end-game' })}
                className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-white/55 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" /> End game
              </button>
            )}
          </>
        )}

        <p className="mt-6 text-center text-xs leading-5 text-white/45">
          18+ only. Keep it fun, kind, and mutual. This is a self-reported age check, not legal age verification.
        </p>
      </div>
    </main>
  );
}
