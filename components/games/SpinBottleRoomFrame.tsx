'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

const BRIDGE_SOURCE = 'onlinebar-spin-bottle';

type RoomPresence = Record<string, unknown> & { g?: string | null };

export default function SpinBottleRoomFrame({ className = '' }: { className?: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [gameUrl, setGameUrl] = useState('/games/spin-the-bottle-live.html?embedded=1');

  useEffect(() => {
    const drinkMode = new URLSearchParams(window.location.search).get('drinkMode');
    if (drinkMode === 'soft' || drinkMode === 'shots') {
      setGameUrl(`/games/spin-the-bottle-live.html?embedded=1&drinkMode=${drinkMode}`);
    }

    const peerKey = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `player-${Date.now()}-${Math.random()}`;
    let activeChannel: RealtimeChannel | null = null;
    let activeCode = '';
    let currentPresence: RoomPresence = {};
    let connected = false;

    const postToGame = (message: Record<string, unknown>) => {
      frameRef.current?.contentWindow?.postMessage({ source: BRIDGE_SOURCE, ...message }, '*');
    };

    const setConnected = (value: boolean) => {
      connected = value;
      postToGame({ type: 'connection', connected });
    };

    const publishPeers = (channel: RealtimeChannel) => {
      const peers = Object.entries(channel.presenceState()).flatMap(([peer, values]) =>
        (values as Array<Record<string, unknown>>).map(presence => ({
          peer,
          kind: 'viewer',
          presence,
          isMe: peer === peerKey,
          sameTab: peer === peerKey
        }))
      );
      postToGame({ type: 'peers', peers });
    };

    const closeChannel = async () => {
      const channel = activeChannel;
      activeChannel = null;
      activeCode = '';
      setConnected(false);
      if (channel && supabase) {
        await supabase.removeChannel(channel);
      }
      postToGame({ type: 'peers', peers: [] });
    };

    const updatePresence = async (patch: RoomPresence) => {
      currentPresence = { ...currentPresence, ...patch };
      if (patch.g === null) {
        currentPresence = {};
        await closeChannel();
        return;
      }

      const code = typeof currentPresence.g === 'string' ? currentPresence.g : '';
      if (!/^[A-Z0-9]{6}$/.test(code)) {
        postToGame({ type: 'room-error', message: 'Room codes must contain six characters.' });
        return;
      }
      if (!supabase) {
        postToGame({ type: 'unavailable' });
        return;
      }
      if (activeChannel && activeCode === code) {
        const status = await activeChannel.track(currentPresence);
        if (status !== 'ok') console.error('[SpinBottleRoom] Presence update failed:', status);
        return;
      }

      await closeChannel();
      activeCode = code;
      const channel = supabase.channel(`spin-bottle:${code}`, {
        config: {
          broadcast: { self: false },
          presence: { key: peerKey }
        }
      });
      activeChannel = channel;
      channel.on('presence', { event: 'sync' }, () => publishPeers(channel));
      channel.on('presence', { event: 'join' }, () => publishPeers(channel));
      channel.on('presence', { event: 'leave' }, () => publishPeers(channel));
      channel.subscribe(status => {
        if (activeChannel !== channel) return;
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          void channel.track(currentPresence).then(result => {
            if (result !== 'ok') console.error('[SpinBottleRoom] Could not publish room presence:', result);
          }).catch(error => console.error('[SpinBottleRoom] Could not publish room presence:', error));
          publishPeers(channel);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnected(false);
          postToGame({ type: 'room-error', message: 'Realtime connection failed. Check Supabase Realtime or choose One phone to play locally.' });
        }
      });
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || !event.data || event.data.source !== BRIDGE_SOURCE) return;
      if (event.data.type === 'ready') {
        postToGame({ type: supabase ? 'available' : 'unavailable' });
        setConnected(Boolean(activeChannel && connected));
      } else if (event.data.type === 'presence' && typeof event.data.patch === 'object' && event.data.patch !== null) {
        void updatePresence(event.data.patch as RoomPresence).catch(error => {
          console.error('[SpinBottleRoom] Could not update room presence:', error);
          postToGame({ type: 'room-error', message: 'The room connection was interrupted. Check your connection and try again.' });
        });
      } else if (event.data.type === 'leave') {
        currentPresence = {};
        void closeChannel().catch(error => console.error('[SpinBottleRoom] Could not leave room:', error));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (activeChannel && supabase) void supabase.removeChannel(activeChannel);
    };
  }, []);

  return (
    <iframe
      ref={frameRef}
      title="Spin the Bottle Live"
      src={gameUrl}
      className={`block min-h-[720px] w-full border-0 ${className}`}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
    />
  );
}
