'use client';

import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import TicketThemeSync from '@/app/tickets/TicketThemeSync';

type ScannerEvent = {
  id: string;
  title: string;
  venue_name: string;
  city: string;
  starts_at: string;
  ends_at: string;
  doors_open_at: string | null;
  status: string;
  gate_name: string;
};
type ScanOutcome = {
  result: 'accepted' | 'already_used' | 'invalid' | 'refunded' | 'revoked' | 'wrong_event' | 'unpaid' | 'event_closed' | 'rate_limited';
  ticketReference: string | null;
  status: 'valid' | 'used' | 'invalid';
  message: string;
  ticket: { reference: string; type: string | null; gate: string } | null;
};
type ScanHistoryEntry = {
  id: string;
  eventName: string;
  gateName: string;
  deviceId: string | null;
  scannerName: string | null;
  method: 'qr' | 'manual' | null;
  result: ScanOutcome['result'];
  scannedAt: string;
};

const SCANNER_DEVICE_ID_KEY = 'onlinebar_ticket_scanner_device_id';
const SCANNER_DEVICE_NAME_KEY = 'onlinebar_ticket_scanner_device_name';

const panelClass = 'rounded-3xl border border-white/10 bg-[#111016]/90 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur';
const inputClass = 'mt-1.5 min-h-11 w-full rounded-2xl border border-white/10 bg-[#17121e] px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/15';
const actionClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50';

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || `Scanner request failed (${response.status}).`);
  return payload as T;
}

async function hashCredential(value: string) {
  const bytes = new TextEncoder().encode(value.trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function createScannerDeviceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return `scanner-${Date.now()}-${Math.random().toString(16).slice(2, 12)}`;
}

function outcomeStyle(result: ScanOutcome['result']) {
  if (result === 'accepted') return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100';
  if (result === 'already_used') return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
  return 'border-red-300/30 bg-red-300/10 text-red-100';
}

function outcomeLabel(result: ScanOutcome['result']) {
  const labels: Record<ScanOutcome['result'], string> = {
    accepted: 'ADMIT · VALID TICKET',
    already_used: 'DENY · ALREADY CHECKED IN',
    rate_limited: 'PAUSE · SCAN RATE LIMITED',
    invalid: 'DENY · INVALID TICKET',
    refunded: 'DENY · REFUNDED',
    revoked: 'DENY · REVOKED OR TRANSFERRED',
    wrong_event: 'DENY · WRONG EVENT',
    unpaid: 'DENY · PAYMENT NOT CONFIRMED',
    event_closed: 'DENY · EVENT NOT OPEN FOR ADMISSION'
  };
  return labels[result];
}

export default function TicketScannerPage() {
  const [accessToken, setAccessToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [events, setEvents] = useState<ScannerEvent[]>([]);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [eventId, setEventId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [scannerName, setScannerName] = useState('Gate scanner');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [manualCredential, setManualCredential] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scanBusyRef = useRef(false);

  const loadEvents = useCallback(async (token: string) => {
    setLoading(true);
    setError('');
    try {
      const payload = await readResponse<{ events: ScannerEvent[]; history: ScanHistoryEntry[] }>(await fetch('/api/ticketing/scanner', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      }));
      setEvents(payload.events);
      setHistory(payload.history);
      setEventId(current => payload.events.some(event => event.id === current) ? current : payload.events[0]?.id || '');
    } catch (cause) {
      setEvents([]);
      setError(cause instanceof Error ? cause.message : 'Assigned events could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshHistory = useCallback(async (token: string) => {
    setHistoryError('');
    try {
      const payload = await readResponse<{ history: ScanHistoryEntry[] }>(await fetch('/api/ticketing/scanner', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      }));
      setHistory(payload.history);
    } catch (cause) {
      console.error('[TicketingScanner] Could not refresh scan history:', cause);
      setHistoryError(cause instanceof Error ? cause.message : 'Scan history could not be refreshed.');
    }
  }, []);

  useEffect(() => {
    try {
      let id = localStorage.getItem(SCANNER_DEVICE_ID_KEY);
      if (!id) {
        id = createScannerDeviceId();
        localStorage.setItem(SCANNER_DEVICE_ID_KEY, id);
      }
      setDeviceId(id);
      const savedName = localStorage.getItem(SCANNER_DEVICE_NAME_KEY);
      if (savedName?.trim()) setScannerName(savedName.trim().slice(0, 120));
    } catch (cause) {
      console.error('[TicketingScanner] Could not persist scanner identity:', cause);
      setDeviceId(createScannerDeviceId());
      setHistoryError('This browser cannot save its scanner ID. Its identity may change if you reload.');
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoginError('The OnBar sign-in service is not configured.');
      setLoading(false);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active || !data.session) {
        if (active) setLoading(false);
        return;
      }
      setAccessToken(data.session.access_token);
      setEmail(data.session.user.email || '');
      void loadEvents(data.session.access_token);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT' || !session) {
        setAccessToken('');
        setEvents([]);
        setEventId('');
        setLoading(false);
      } else {
        setAccessToken(session.access_token);
        setEmail(session.user.email || '');
      }
    });
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      controlsRef.current?.stop();
    };
  }, [loadEvents]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError('');
    if (!supabase) {
      setLoginError('The OnBar sign-in service is not configured.');
      return;
    }
    setWorking(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
      if (!data.session) throw new Error('The staff sign-in did not create an active session.');
      setAccessToken(data.session.access_token);
      setEmail(data.user.email || email.trim());
      setPassword('');
      await loadEvents(data.session.access_token);
    } catch (cause) {
      setLoginError(cause instanceof Error ? cause.message : 'Staff sign-in failed.');
    } finally {
      setWorking(false);
    }
  };

  const submitCredential = useCallback(async (credential: string, scanMethod: 'qr' | 'manual') => {
    if (!eventId || !accessToken || scanBusyRef.current) return;
    if (!deviceId || !scannerName.trim()) {
      setError('Set a scanner name and wait for the device ID to initialize.');
      return;
    }
    const token = credential.trim();
    setOutcome(null);
    setError('');
    if (!token || token.length > 2048) {
      setError('The scanned QR does not contain a supported ticket credential.');
      return;
    }
    scanBusyRef.current = true;
    setWorking(true);
    try {
      const credentialHash = await hashCredential(token);
      const response = await fetch('/api/ticketing/scanner', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, credentialHash, deviceId, scannerName: scannerName.trim(), scanMethod })
      });
      const payload = await readResponse<ScanOutcome>(response);
      setOutcome(payload);
      setManualCredential('');
      void refreshHistory(accessToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The ticket could not be checked in.');
    } finally {
      scanBusyRef.current = false;
      setWorking(false);
    }
  }, [accessToken, deviceId, eventId, refreshHistory, scannerName]);

  const startCamera = async () => {
    if (!videoRef.current || !eventId || cameraActive || !accessToken) return;
    setError('');
    setOutcome(null);
    const reader = new BrowserMultiFormatReader();
    scannerRef.current = reader;
    setCameraActive(true);
    try {
      controlsRef.current = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        (result, _error, controls) => {
          if (!result || scanBusyRef.current) return;
          controls.stop();
          controlsRef.current = null;
          setCameraActive(false);
          void submitCredential(result.getText(), 'qr');
        }
      );
    } catch (cause) {
      controlsRef.current?.stop();
      setCameraActive(false);
      setError(cause instanceof Error
        ? `Camera could not start: ${cause.message}`
        : 'Camera permission or video input is unavailable. Use manual credential entry instead.');
    }
  };

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraActive(false);
  };

  const signOut = async () => {
    stopCamera();
    if (supabase) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError('The staff session could not be signed out. Check the connection and try again.');
        return;
      }
    }
    setAccessToken('');
    setEvents([]);
    setEventId('');
    setOutcome(null);
  };

  const currentEvent = events.find(event => event.id === eventId);
  const updateScannerName = (name: string) => {
    const nextName = name.slice(0, 120);
    setScannerName(nextName);
    try {
      localStorage.setItem(SCANNER_DEVICE_NAME_KEY, nextName);
    } catch (cause) {
      console.error('[TicketingScanner] Could not save scanner name:', cause);
      setHistoryError('Scanner name could not be saved on this device.');
    }
  };

  if (!accessToken) {
    return (
      <>
      <TicketThemeSync />
      <main className="ticket-admin-theme relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0a0f] px-4 py-10 text-white sm:px-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(157,92,255,0.15),transparent_40%)]" />
        <form onSubmit={signIn} className="relative w-full max-w-md space-y-5 rounded-[28px] border border-amber-200/15 bg-[#111016]/90 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur sm:p-8">
          <div className="text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] border border-amber-200/25 bg-gradient-to-br from-amber-200/20 via-amber-100/5 to-transparent text-amber-200 shadow-[0_0_40px_rgba(251,191,36,0.18)]"><span className="text-xl font-black">OB</span></div>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.25em] text-amber-200">OnBar · Gate operations</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Staff scanner</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">Sign in with the verified account assigned to your event. Do not use or share an admin login.</p>
          </div>

          {loginError && <p role="alert" className="rounded-2xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-200">{loginError}</p>}

          <label className="block text-xs font-bold text-slate-300">
            Staff email
            <input required type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className={inputClass} />
          </label>
          <label className="block text-xs font-bold text-slate-300">
            Password
            <input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className={inputClass} />
          </label>

          <button type="submit" disabled={working} className={`${actionClass} w-full bg-gradient-to-r from-amber-200 to-orange-300 text-[#171018] hover:brightness-110 disabled:opacity-50`}>
            {working ? 'Signing in…' : 'Sign in to scanner'}
          </button>

          <p className="text-center text-[11px] leading-5 text-slate-500">If you do not have access, ask the event admin to assign your verified account.</p>
        </form>
      </main>
      </>
    );
  }

  return (
    <>
    <TicketThemeSync />
    <main className="ticket-admin-theme min-h-screen bg-[#0b0a0f] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(17,16,22,0.96),rgba(26,22,31,0.92),rgba(13,10,17,0.96))] p-4 shadow-[0_25px_70px_rgba(0,0,0,0.35)] sm:p-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">OnBar · Isolated ticketing</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Gate scanner</h1>
            <p className="mt-1 text-xs text-slate-400">{email}</p>
          </div>
          <button type="button" onClick={() => void signOut()} className="min-h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-slate-300 transition hover:bg-white/10">Sign out</button>
        </header>

        {error && <p role="alert" className="rounded-2xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-200">{error}</p>}

        <section className={`${panelClass} p-4 sm:p-5`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-200/20 bg-amber-100/5 text-amber-200"><span className="text-lg font-black">▣</span></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Assigned event</p>
                <p className="mt-1 text-sm font-bold text-white">Live admissions desk</p>
              </div>
            </div>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">online</span>
          </div>

          <label className="mt-4 block text-xs font-bold text-slate-300">
            Select event
            <select value={eventId} onChange={event => { setEventId(event.target.value); setOutcome(null); }} disabled={loading || events.length === 0 || cameraActive} className={`${inputClass} mt-2`}>
              {events.length === 0 && <option value="">No active event assignments</option>}
              {events.map(event => <option key={event.id} value={event.id}>{event.title} · {event.gate_name || 'Assigned gate'}</option>)}
            </select>
          </label>
          {currentEvent && <p className="mt-3 text-xs leading-5 text-slate-400">{currentEvent.venue_name}, {currentEvent.city} · {new Date(currentEvent.starts_at).toLocaleString('en-KE')}</p>}
        </section>

        <section className={`${panelClass} grid gap-3 p-4 sm:grid-cols-2 sm:p-5`}>
          <label className="block text-xs font-bold text-slate-300">
            Scanner name
            <input value={scannerName} onChange={event => updateScannerName(event.target.value)} maxLength={120} className={`${inputClass} mt-2`} placeholder="e.g. Main Gate Tablet" />
          </label>
          <div className="text-xs font-bold text-slate-300">
            Device ID
            <p className="mt-2 flex min-h-11 items-center break-all rounded-2xl border border-white/10 bg-[#17121e] px-3 font-mono text-[11px] text-slate-400">{deviceId || 'Creating device ID…'}</p>
            <p className="mt-1 text-[10px] font-normal text-slate-500">For scan records only; it does not grant access.</p>
          </div>
        </section>

        {loading ? <div className={`${panelClass} py-12 text-center text-sm text-slate-400`}>Loading event access…</div>
          : !events.length ? <div className={`${panelClass} border-amber-200/15 bg-amber-100/[0.03] p-6 text-center`}><p className="font-bold text-amber-100">No event access assigned</p><p className="mt-2 text-sm leading-6 text-slate-400">An event administrator must assign your verified account to an event and gate before you can scan.</p></div>
            : <section className={`${panelClass} space-y-4 p-4 sm:p-5`}>
              <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[#07080b]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(251,191,36,0.18),transparent_45%)]" />
                <video ref={videoRef} className={`relative z-10 aspect-[4/3] w-full object-cover ${cameraActive ? '' : 'hidden'}`} muted playsInline />

                {!cameraActive && (
                  <div className="relative z-10 grid aspect-[4/3] place-items-center px-6 text-center">
                    <div>
                      <div className="mx-auto grid h-16 w-16 place-items-center rounded-[26px] border border-amber-200/20 bg-[#121219] text-amber-200 shadow-[0_0_40px_rgba(251,191,36,0.12)]">
                        <span className="text-2xl">◫</span>
                      </div>
                      <p className="mt-4 text-base font-black">Camera is off</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">Allow camera access, then point it at the ticket QR.</p>
                    </div>
                  </div>
                )}

                {cameraActive && (
                  <div className="pointer-events-none absolute inset-4 rounded-[20px] border border-amber-200/70 shadow-[inset_0_0_0_2px_rgba(251,191,36,0.12)]">
                    <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-[24px] border-2 border-amber-200/80" />
                    <div className="absolute left-6 top-6 h-5 w-5 rounded-tl-xl border-l-2 border-t-2 border-amber-200/80" />
                    <div className="absolute right-6 top-6 h-5 w-5 rounded-tr-xl border-r-2 border-t-2 border-amber-200/80" />
                    <div className="absolute bottom-6 left-6 h-5 w-5 rounded-bl-xl border-b-2 border-l-2 border-amber-200/80" />
                    <div className="absolute bottom-6 right-6 h-5 w-5 rounded-br-xl border-b-2 border-r-2 border-amber-200/80" />
                  </div>
                )}
              </div>

              {cameraActive
                ? <button type="button" onClick={stopCamera} className={`${actionClass} w-full border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10`}>Stop camera</button>
                : <button type="button" onClick={() => void startCamera()} disabled={!eventId || working} className={`${actionClass} w-full bg-gradient-to-r from-amber-200 via-orange-300 to-yellow-200 text-[#171018] hover:brightness-110 disabled:opacity-50`}>
                    {working ? 'Checking ticket…' : 'Start camera scanner'}
                  </button>}

              <form onSubmit={event => { event.preventDefault(); void submitCredential(manualCredential, 'manual'); }} className="space-y-2 border-t border-white/5 pt-4">
                <label className="block text-xs font-bold text-slate-300">
                  Manual credential entry
                  <input value={manualCredential} onChange={event => setManualCredential(event.target.value)} maxLength={2048} autoComplete="off" autoCapitalize="none" spellCheck={false} className={`${inputClass} mt-2 font-mono`} placeholder="Use only if camera access is unavailable" />
                </label>
                <button type="submit" disabled={!manualCredential.trim() || working} className={`${actionClass} border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 disabled:opacity-40`}>{working ? 'Checking…' : 'Validate credential'}</button>
              </form>
            </section>}

        {outcome && <section role="status" aria-live="assertive" className={`rounded-[26px] border p-5 text-center shadow-[0_20px_40px_rgba(0,0,0,0.22)] ${outcomeStyle(outcome.result)}`}>
          <p className="text-xs font-black uppercase tracking-[0.16em]">{outcomeLabel(outcome.result)}</p>
          {outcome.ticketReference && <p className="mt-2 font-mono text-sm font-bold">Ticket {outcome.ticketReference}</p>}
          {outcome.ticket?.gate && <p className="mt-1 text-xs opacity-80">Gate: {outcome.ticket.gate}</p>}
          <p className="mt-2 text-xs opacity-80">{outcome.message}</p>
          <p className="mt-1 text-[10px] opacity-65">{outcome.status.toUpperCase()} · {outcome.result === 'accepted' ? 'Admission recorded by the server.' : 'Do not admit the guest. Refer them to the event help desk.'}</p>
        </section>}

        <section className={`${panelClass} p-4 sm:p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">Recent scan history</h2>
              <p className="mt-1 text-[11px] text-slate-500">Latest 30 scans made by your account on assigned events.</p>
            </div>
            <button type="button" onClick={() => void refreshHistory(accessToken)} className="min-h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-[11px] font-bold text-slate-300 transition hover:bg-white/10">Refresh</button>
          </div>
          {historyError && <p role="alert" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-100/5 p-2 text-xs text-amber-100">{historyError}</p>}
          {history.length === 0
            ? <p className="mt-4 text-xs text-slate-500">No scans recorded for this account yet.</p>
            : <ol className="mt-4 divide-y divide-white/5">
              {history.map(scan => (
                <li key={scan.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-200">{scan.eventName} · {scan.gateName || 'Assigned gate'}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{scan.scannerName || 'Scanner'} · {scan.method || 'scan'} · {new Date(scan.scannedAt).toLocaleString('en-KE')}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${scan.result === 'accepted' ? 'border-emerald-300/20 bg-emerald-300/5 text-emerald-200' : 'border-amber-300/20 bg-amber-300/5 text-amber-100'}`}>{scan.result.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ol>}
        </section>

        <p className="text-center text-[11px] leading-5 text-slate-500">Online verification only. Never admit from a screenshot or if the scanner cannot reach the server.</p>
      </div>
    </main>
    </>
  );
}
