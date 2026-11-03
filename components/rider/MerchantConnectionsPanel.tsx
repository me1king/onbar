'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Store, X } from 'lucide-react';

type Connection = {
  id: string;
  status: 'pending' | 'accepted';
  businessName: string;
  town: string;
  county: string;
};

export default function MerchantConnectionsPanel({
  sessionToken,
  accentColor
}: {
  sessionToken: string;
  accentColor: string;
}) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadConnections = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/rider/merchant-invites', {
        headers: { Authorization: `Bearer ${sessionToken}` },
        cache: 'no-store'
      });
      const result = await response.json() as { connections?: Connection[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'Merchant connections could not be loaded.');
      setConnections(result.connections || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Merchant connections could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void loadConnections();
    const refresh = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadConnections();
    }, 30_000);
    window.addEventListener('focus', loadConnections);
    return () => {
      window.clearInterval(refresh);
      window.removeEventListener('focus', loadConnections);
    };
  }, [loadConnections]);

  async function respond(connectionId: string, decision: 'accept' | 'decline') {
    setWorkingId(connectionId);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/rider/merchant-invites', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inviteId: connectionId, decision })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Your response could not be saved.');
      setMessage(decision === 'accept' ? 'Merchant connection accepted.' : 'Merchant connection declined.');
      await loadConnections();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your response could not be saved.');
    } finally {
      setWorkingId('');
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-[#101614] p-5">
      <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/70">
        <Store className="h-4 w-4" /> Merchant connections
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-white/45">
        A merchant invitation only connects your verified rider account after you accept it here.
      </p>
      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Checking invitations…</p>
      ) : connections.length ? (
        <div className="mt-4 space-y-3">
          {connections.map(connection => (
            <article key={connection.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="font-bold">{connection.businessName}</p>
              <p className="mt-1 text-[11px] text-white/45">{[connection.town, connection.county].filter(Boolean).join(', ') || 'OnBar merchant'}</p>
              {connection.status === 'accepted' ? (
                <p className="mt-3 text-[10px] font-black uppercase tracking-wide" style={{ color: accentColor }}>Connected</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => void respond(connection.id, 'accept')} disabled={Boolean(workingId)}
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg px-2 text-xs font-black text-[#08100c] disabled:opacity-50"
                    style={{ backgroundColor: accentColor }}>
                    {workingId === connection.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept
                  </button>
                  <button type="button" onClick={() => void respond(connection.id, 'decline')} disabled={Boolean(workingId)}
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-white/10 text-xs font-bold text-white/70 disabled:opacity-50">
                    <X className="h-4 w-4" /> Decline
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-black/20 p-3 text-xs text-white/45">No merchant invitations yet. Accepted connections will appear here.</p>
      )}
      {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
      {message && <p role="status" className="mt-3 text-xs text-emerald-300">{message}</p>}
      {!loading && <button type="button" onClick={() => void loadConnections()} className="mt-3 text-[11px] font-bold text-white/45 underline hover:text-white">Refresh connections</button>}
    </section>
  );
}
