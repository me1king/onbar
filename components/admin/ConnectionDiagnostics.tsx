'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, Clock3, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type CheckStatus = 'connected' | 'slow' | 'down' | 'configured' | 'not_configured' | 'disabled';

interface ConnectionCheck {
  id: string;
  label: string;
  status: CheckStatus;
  latencyMs: number | null;
  detail: string;
}

interface HealthResponse {
  checkedAt: string;
  checks: ConnectionCheck[];
  error?: string;
}

const STATUS_LABELS: Record<CheckStatus, string> = {
  connected: 'Connected',
  slow: 'Slow',
  down: 'Down',
  configured: 'Configured',
  not_configured: 'Not configured',
  disabled: 'Disabled'
};

function statusStyles(status: CheckStatus) {
  if (status === 'connected') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'slow') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'down') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'connected') return <CheckCircle2 size={16} aria-hidden="true" />;
  if (status === 'slow') return <Clock3 size={16} aria-hidden="true" />;
  if (status === 'down') return <XCircle size={16} aria-hidden="true" />;
  return <Activity size={16} aria-hidden="true" />;
}

export default function ConnectionDiagnostics() {
  const [report, setReport] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/connection-health', {
        cache: 'no-store',
        signal: AbortSignal.timeout(25_000)
      });
      const result = await response.json() as HealthResponse;
      if (!response.ok) throw new Error(result.error || 'Connection diagnostics could not be loaded.');
      setReport(result);
    } catch (cause) {
      console.error('[ConnectionDiagnostics] Health checks failed:', cause);
      setError(cause instanceof Error && cause.name === 'TimeoutError'
        ? 'The diagnostics request timed out. Check the app server connection.'
        : cause instanceof Error ? cause.message : 'Connection diagnostics could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <Card className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-primary" aria-hidden="true" />
            <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">Live connection checks</h2>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Safe, read-only probes for the database and configured provider APIs. Secrets and provider response bodies are never shown.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading} className="shrink-0 rounded-xl">
          <RefreshCw size={15} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Checking…' : 'Check connections'}
        </Button>
      </div>

      {error && (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <ShieldAlert size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !report ? (
        <p className="mt-6 animate-pulse text-sm font-medium text-slate-500">Checking configured connections (maximum 8 seconds per provider)…</p>
      ) : report && (
        <>
          <p className="mt-5 text-xs text-slate-500">
            Last checked: {new Date(report.checkedAt).toLocaleString()}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {report.checks.map(check => (
              <div key={check.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{check.label}</h3>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusStyles(check.status)}`}>
                    <StatusIcon status={check.status} />
                    {STATUS_LABELS[check.status]}
                    {check.latencyMs !== null && ` · ${check.latencyMs} ms`}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{check.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            “Configured” means credentials or a selection exist, not that delivery is proven. Vercel Analytics is browser-side; verify ingestion and project setup in Vercel. This page never sends test payments, emails, or WhatsApp messages.
          </p>
        </>
      )}
    </Card>
  );
}
