'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { ensurePushServiceWorkerReady } from '@/lib/pushServiceWorker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

function decodeVapidKey(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes.buffer;
}

export default function DeliveryPushPreferences() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [pushConfigured, setPushConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const browserSupported = 'Notification' in window
        && 'serviceWorker' in navigator
        && 'PushManager' in window;
      if (!active) return;
      setSupported(browserSupported);
      if (!browserSupported) return;
      if (!supabase) {
        setSignedIn(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      setSignedIn(Boolean(session));

      const configResponse = await fetch('/api/push/config', { cache: 'no-store' });
      const config = await configResponse.json() as { configured?: boolean; publicKey?: string | null; error?: string };
      if (!configResponse.ok) throw new Error(config.error || 'Push alert setup could not be checked.');
      if (!active) return;
      const configured = config.configured === true && Boolean(config.publicKey);
      setPushConfigured(configured);
      if (!configured || !session) return;

      const response = await fetch('/api/push/subscriptions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });
      if (!active) return;
      if (response.ok) {
        const result = await response.json() as { enabled?: boolean };
        setEnabled(result.enabled === true);
      } else {
        const result = await response.json() as { error?: string };
        setError(result.error || 'Push preference could not be loaded.');
      }
    }
    void load().catch(loadError => {
      console.error('[DeliveryPushPreferences] Could not load push status:', loadError);
      if (active) {
        setError(loadError instanceof Error ? loadError.message : 'Delivery alert setup could not be checked.');
      }
    });
    return () => { active = false; };
  }, []);

  const toggle = async () => {
    if (!supported || !supabase) {
      setError('Sign in on a supported browser to manage delivery alerts.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in again to manage delivery alerts.');
      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      };

      if (enabled) {
        const registration = await navigator.serviceWorker.getRegistration('/sw.js');
        const subscription = await registration?.pushManager.getSubscription();
        const response = await fetch('/api/push/subscriptions', {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ endpoint: subscription?.endpoint })
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || 'Push alerts could not be disabled.');
        await subscription?.unsubscribe();
        setEnabled(false);
        return;
      }

      const configResponse = await fetch('/api/push/config', { cache: 'no-store' });
      const config = await configResponse.json() as { configured?: boolean; publicKey?: string | null; error?: string };
      if (!configResponse.ok || !config.configured || !config.publicKey) {
        setPushConfigured(false);
        throw new Error(config.error || 'Delivery alerts are not set up yet. The store needs to configure web-push keys on its server.');
      }
      setPushConfigured(true);

      if (Notification.permission === 'denied') {
        throw new Error('Notifications are blocked in browser settings. Allow them there, then try again.');
      }
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');

      const registration = await ensurePushServiceWorkerReady();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(config.publicKey)
      });
      const response = await fetch('/api/push/subscriptions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ subscription: subscription.toJSON() })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        await subscription.unsubscribe();
        throw new Error(result.error || 'Push alerts could not be enabled.');
      }
      setEnabled(true);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Delivery alerts could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (!supabase) return;
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in again to test delivery alerts.');
      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });
      const result = await response.json() as { sent?: boolean; partialFailure?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || 'Test alert could not be sent.');
      setNotice(result.partialFailure
        ? 'Test alert was accepted for some subscribed devices; another device failed.'
        : 'Test alert sent. Provider acceptance does not guarantee the device displayed it.');
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Test alert could not be sent.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="mb-10 flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </div>
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-foreground">Delivery push alerts</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Get private, generic order-status alerts on this device. You can turn them off here or in browser settings.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            On iPhone or iPad, add this site to your Home Screen before enabling web push. Native widgets and lock-screen live tracking require a separate native app.
          </p>
          {supported && signedIn === false && (
            <p className="mt-2 text-xs font-semibold text-amber-700">Sign in to your Online Bar account to enable alerts for your orders.</p>
          )}
          {supported && signedIn && pushConfigured === false && (
            <p className="mt-2 text-xs font-semibold text-amber-700">Delivery alerts are temporarily unavailable because the store has not finished server setup.</p>
          )}
          {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
          {notice && <p role="status" className="mt-2 text-xs font-semibold text-emerald-700">{notice}</p>}
          {!supported && <p className="mt-2 text-xs text-amber-700">This browser does not support web push notifications.</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {enabled && (
          <Button type="button" onClick={() => void sendTest()} disabled={testing || busy} variant="outline" className="h-11 rounded-xl">
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send test
          </Button>
        )}
        <Button
          type="button"
          onClick={() => void toggle()}
          disabled={!supported || busy || testing || signedIn === false || (!enabled && pushConfigured === false)}
          variant={enabled ? 'outline' : 'default'}
          className="h-11 rounded-xl"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {enabled ? 'Turn off alerts' : 'Enable alerts'}
        </Button>
      </div>
    </Card>
  );
}
