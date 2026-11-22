'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, Send } from 'lucide-react';

export default function MerchantWeeklyDigestSettings({
  applicationId,
  accessToken
}: {
  applicationId: string;
  accessToken: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadPreference = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/merchant/weekly-digest?applicationId=${encodeURIComponent(applicationId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const result = await response.json() as { enabled?: boolean; recipientEmail?: string; error?: string };
      if (!response.ok || typeof result.enabled !== 'boolean') {
        throw new Error(result.error || 'Weekly summary preferences could not be loaded.');
      }
      setEnabled(result.enabled);
      setRecipientEmail(result.recipientEmail || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Weekly summary preferences could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, applicationId]);

  useEffect(() => {
    void loadPreference();
  }, [loadPreference]);

  async function savePreference(nextEnabled: boolean) {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/merchant/weekly-digest', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, enabled: nextEnabled })
      });
      const result = await response.json() as { enabled?: boolean; recipientEmail?: string; error?: string };
      if (!response.ok || typeof result.enabled !== 'boolean') {
        throw new Error(result.error || 'Weekly summary preference could not be saved.');
      }
      setEnabled(result.enabled);
      setRecipientEmail(result.recipientEmail || '');
      setMessage(result.enabled ? 'Weekly email summary enabled.' : 'Weekly email summary turned off.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Weekly summary preference could not be saved.');
    } finally {
      setWorking(false);
    }
  }

  return <section aria-labelledby="merchant-weekly-digest" className="space-y-4 rounded-2xl border border-white/10 bg-[#1a1b1e] p-5 text-zinc-100">
    <div>
      <h2 id="merchant-weekly-digest" className="flex items-center gap-2 font-black text-white"><Mail size={18} className="text-amber-400" aria-hidden="true" /> Weekly business summary</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">Opt in to one email each Monday with delivered order counts, recorded item values, and paid payouts when the verified settlement ledger is available. Tips are not recorded in the current merchant ledger.</p>
    </div>
    {recipientEmail && <p className="text-xs text-zinc-300">Sent to your verified sign-in email: <strong>{recipientEmail}</strong></p>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
    <button
      type="button"
      disabled={loading || working}
      onClick={() => void savePreference(!enabled)}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-xs font-black uppercase text-zinc-950 disabled:opacity-50"
    >
      <Send size={14} aria-hidden="true" />
      {loading ? 'Loading preference…' : working ? 'Saving…' : enabled ? 'Turn weekly email off' : 'Email me each week'}
    </button>
    <p className="text-xs leading-5 text-zinc-500">The weekly sender runs in the merchant alert worker. Email delivery also requires the digest migration, a running worker, and configured transactional email credentials.</p>
  </section>;
}
