'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';

export default function TicketingMfaEnrollment() {
  const [active, setActive] = useState<boolean | null>(null);
  const [uri, setUri] = useState('');
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [visible, setVisible] = useState(true);

  async function readResponse(response: Response) {
    const result = await response.json().catch(() => ({})) as { error?: string; active?: boolean; provisioningUri?: string; secret?: string };
    if (!response.ok) throw new Error(result.error || `Ticketing authenticator request failed (${response.status}).`);
    return result;
  }

  useEffect(() => {
    void fetch('/api/admin/ticketing/mfa', { cache: 'no-store' })
      .then(readResponse)
      .then(result => setActive(result.active === true))
      .catch(cause => {
        const message = cause instanceof Error ? cause.message : 'Ticketing authenticator status could not be loaded.';
        if (message.includes('Only the Online Bar platform owner') || message.includes('signed-in owner must match')) {
          setVisible(false);
          return;
        }
        setError(message);
      });
  }, []);

  async function setup() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await readResponse(await fetch('/api/admin/ticketing/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup' })
      }));
      if (!result.provisioningUri || !result.secret) throw new Error('Authenticator setup response was incomplete.');
      setUri(result.provisioningUri);
      setSecret(result.secret);
      setQr(await QRCode.toDataURL(result.provisioningUri, { width: 220, margin: 1 }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ticketing authenticator setup failed.');
    } finally {
      setBusy(false);
    }
  }

  async function activate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await readResponse(await fetch('/api/admin/ticketing/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', code })
      }));
      setActive(result.active === true);
      setUri('');
      setSecret('');
      setQr('');
      setCode('');
      setNotice('Ticketing authenticator is active. Checkout readiness can now verify the enrolled admin record.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ticketing authenticator could not be activated.');
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;
  return (
    <section className="rounded-2xl border border-white/10 bg-[#17121e] p-5 sm:p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">Owner security</p>
      <h2 className="mt-1 text-lg font-black text-white">Ticketing authenticator</h2>
      <p className="mt-1 text-xs leading-5 text-slate-400">Enroll or confirm the authenticator record used by Ticketing checkout release checks. Only the matching platform owner can manage it.</p>
      {active === true && <p className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-950/20 p-3 text-sm text-emerald-100">Ticketing authenticator is active.</p>}
      {active === false && !uri && <button type="button" onClick={() => void setup()} disabled={busy} className="mt-4 min-h-10 rounded-lg bg-amber-300 px-4 text-xs font-black text-[#170d18] disabled:opacity-50">{busy ? 'Preparing…' : 'Set up authenticator'}</button>}
      {qr && <form onSubmit={event => void activate(event)} className="mt-4 grid gap-3 sm:max-w-sm">
        <p className="text-xs text-slate-300">Scan this code in an authenticator app. Keep the setup secret private.</p>
        <Image src={qr} alt="Ticketing authenticator QR code" width={220} height={220} unoptimized className="rounded-lg bg-white p-2" />
        <code className="break-all rounded-lg bg-black/20 p-3 text-xs text-amber-100">{secret}</code>
        <label className="text-xs font-bold text-slate-300">Six-digit code
          <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1.5 min-h-11 w-full rounded-lg border border-white/10 bg-[#0d0a12] px-3 text-center font-mono text-lg tracking-[0.4em] text-white" />
        </label>
        <button disabled={busy || code.length !== 6} className="min-h-10 rounded-lg bg-amber-300 px-4 text-xs font-black text-[#170d18] disabled:opacity-50">{busy ? 'Activating…' : 'Verify and activate'}</button>
        <p className="break-all text-[10px] text-slate-500">Manual setup URI: {uri}</p>
      </form>}
      {notice && <p role="status" className="mt-3 text-xs text-emerald-200">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-xs text-red-200">{error}</p>}
    </section>
  );
}
