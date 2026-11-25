'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCw, Search, ShieldCheck, XCircle } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';
import PublicLaunchGateControl from '@/components/admin/PublicLaunchGateControl';
import CheckoutLaunchOfferControl from '@/components/admin/CheckoutLaunchOfferControl';

type ChecklistStatus = 'not_started' | 'in_progress' | 'blocked' | 'verified' | 'not_applicable';

interface ReadinessItem {
  id: string;
  category: string;
  title: string;
  description: string;
  status: ChecklistStatus;
  is_critical: boolean;
  status_note: string;
  updated_by: string | null;
  updated_at: string;
}

interface SystemCheck {
  id: string;
  label: string;
  status: 'configured' | 'missing' | 'verified' | 'unavailable';
  detail: string;
  blocker: boolean;
}

interface SearchInsight {
  search_term: string;
  search_count: number;
  unique_sessions: number;
  zero_result_count: number;
  average_results: number | null;
  last_searched_at: string;
}

interface LaunchReadinessResponse {
  items: ReadinessItem[];
  checks: SystemCheck[];
  searchInsights: SearchInsight[];
  searchDays: number;
  setupErrors?: { checklist?: string; search?: string };
  warning?: string;
  error?: string;
}

const statusLabels: Record<ChecklistStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  verified: 'Verified',
  not_applicable: 'Not applicable'
};

const statusStyles: Record<ChecklistStatus, string> = {
  not_started: 'border-slate-200 bg-slate-50 text-slate-600',
  in_progress: 'border-sky-200 bg-sky-50 text-sky-800',
  blocked: 'border-rose-200 bg-rose-50 text-rose-800',
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  not_applicable: 'border-violet-200 bg-violet-50 text-violet-800'
};

function formatCount(value: number) {
  return new Intl.NumberFormat('en-KE').format(value || 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'No recorded searches';
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? 'Unknown' : timestamp.toLocaleString();
}

export default function LaunchReadinessPage() {
  const { role, permissions } = useAdmin();
  const [data, setData] = useState<LaunchReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { status: ChecklistStatus; note: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const canManage = role === 'owner' || role === 'admin' || permissions.can_manage_settings;

  const loadReadiness = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/launch-readiness?days=${days}`, { cache: 'no-store' });
      const result = await response.json() as LaunchReadinessResponse;
      if (!response.ok) throw new Error(result.error || 'Launch readiness could not be loaded.');
      setData(result);
      setDrafts({});
    } catch (cause) {
      console.error('[LaunchReadiness] Could not load launch board:', cause);
      setError(cause instanceof Error ? cause.message : 'Launch readiness could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void loadReadiness(); }, [loadReadiness]);

  const counts = useMemo(() => {
    const items = data?.items || [];
    const critical = items.filter(item => item.is_critical);
    const verified = critical.filter(item => item.status === 'verified' || item.status === 'not_applicable').length;
    const openBlockers = critical.filter(item => item.status !== 'verified' && item.status !== 'not_applicable').length;
    return {
      total: items.length,
      critical: critical.length,
      verified,
      openBlockers,
      inProgress: items.filter(item => item.status === 'in_progress').length,
      blocked: items.filter(item => item.status === 'blocked').length,
      completion: critical.length ? Math.round((verified / critical.length) * 100) : 0
    };
  }, [data]);

  const categories = useMemo(
    () => [...new Set((data?.items || []).map(item => item.category))].sort((a, b) => a.localeCompare(b)),
    [data]
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.items || []).filter(item => {
      const draft = drafts[item.id];
      const status = draft?.status || item.status;
      return (categoryFilter === 'all' || item.category === categoryFilter)
        && (statusFilter === 'all' || status === statusFilter)
        && (!normalizedQuery || `${item.title} ${item.description} ${item.category} ${item.status_note}`.toLowerCase().includes(normalizedQuery));
    });
  }, [categoryFilter, data, drafts, query, statusFilter]);

  const filteredSearches = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return (data?.searchInsights || []).filter(item =>
      !normalizedQuery || item.search_term.toLowerCase().includes(normalizedQuery)
    );
  }, [data, searchQuery]);

  const saveItem = async (item: ReadinessItem) => {
    const draft = drafts[item.id] || { status: item.status, note: item.status_note || '' };
    setSavingId(item.id);
    setSavedId(null);
    try {
      const response = await fetch('/api/admin/launch-readiness', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status: draft.status, status_note: draft.note })
      });
      const result = await response.json() as { item?: ReadinessItem; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error || 'Checklist update could not be saved.');
      setData(current => current
        ? { ...current, items: current.items.map(existing => existing.id === item.id ? result.item! : existing) }
        : current);
      setDrafts(current => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setSavedId(item.id);
      window.setTimeout(() => setSavedId(current => current === item.id ? null : current), 2500);
    } catch (cause) {
      console.error('[LaunchReadiness] Could not save checklist status:', cause);
      setError(cause instanceof Error ? cause.message : 'Checklist update could not be saved.');
    } finally {
      setSavingId(null);
    }
  };

  if (role !== 'owner' && role !== 'admin' && !permissions.can_manage_settings && !permissions.can_view_revenue) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
        <ShieldCheck className="h-12 w-12 text-rose-500" />
        <h1 className="mt-4 text-2xl font-black uppercase text-slate-950">Access required</h1>
        <p className="mt-2 text-sm text-slate-600">Launch readiness is restricted to administrators and authorized managers.</p>
      </main>
    );
  }

  const launchClear = Boolean(data && data.items.length > 0 && !data.setupErrors?.checklist)
    && counts.openBlockers === 0
    && (data?.checks || []).every(check =>
    !check.blocker || check.status === 'verified' || check.status === 'configured'
  );

  return (
    <main className="min-h-screen space-y-7 bg-slate-50 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-primary">
            <Activity size={14} /> Owner operations · evidence-led launch control
          </p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-950 sm:text-4xl">Launch readiness</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
            Track every launch requirement from the operations and public-launch reviews. A code/configuration check is not proof of a successful live business test.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="search-days" className="text-xs font-bold text-slate-600">Search window</label>
          <select id="search-days" value={days} onChange={event => setDays(Number(event.target.value))} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button type="button" onClick={() => void loadReadiness()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {(role === 'owner' || role === 'admin' || permissions.can_manage_settings) && <CheckoutLaunchOfferControl />}
      {(role === 'owner' || role === 'admin') && <PublicLaunchGateControl />}

      {(error || data?.warning) && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>{error || data?.warning}</div>
        </div>
      )}

      {data?.setupErrors?.checklist && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-black">The launch checklist database is not installed.</p>
          <p className="mt-1">{data.setupErrors.checklist}</p>
        </div>
      )}

      <section aria-label="Launch progress" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <article className={`rounded-2xl border p-4 shadow-sm ${launchClear ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">Launch gate</p>
          <p className={`mt-2 text-xl font-black uppercase ${launchClear ? 'text-emerald-800' : 'text-rose-800'}`}>
            {loading ? 'Checking…' : launchClear ? 'Checklist clear' : 'Not ready'}
          </p>
          <p className="mt-1 text-xs text-slate-600">Requires every critical task to be verified or formally marked not applicable.</p>
        </article>
        {[
          { label: 'Critical requirements cleared', value: `${counts.verified} / ${counts.critical}`, icon: CheckCircle2 },
          { label: 'Checklist progress', value: `${counts.completion}%`, icon: Activity },
          { label: 'In progress', value: formatCount(counts.inProgress), icon: Clock3 },
          { label: 'Blocked', value: formatCount(counts.blocked), icon: XCircle }
        ].map(metric => (
          <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{metric.label}</p>
              <metric.icon size={16} className="text-primary" />
            </div>
            <p className="mt-3 text-2xl font-black text-slate-950">{loading ? '—' : metric.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-950">System configuration checks</h2>
            <p className="mt-1 text-xs text-slate-500">Presence/connectivity only. Credentials are never shown; configured does not mean provider acceptance-tested.</p>
          </div>
          <span className="text-xs font-bold text-slate-500">{(data?.checks || []).filter(check => check.blocker && check.status !== 'verified' && check.status !== 'configured').length} required system checks need attention</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.checks || []).map(check => {
            const passed = check.status === 'verified' || check.status === 'configured';
            return (
              <article key={check.id} className={`rounded-xl border p-4 ${passed ? 'border-emerald-100 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-black text-slate-900">{check.label}</h3>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                    {check.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{check.detail}</p>
              </article>
            );
          })}
          {!loading && !data?.checks.length && <p className="text-sm text-slate-500">System checks are unavailable until server access is configured.</p>}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-950">Launch workboard</h2>
            <p className="mt-1 text-xs text-slate-500">
              Set Verified only after checking real evidence. Add the test result, provider reference or responsible owner in the evidence/next-action field.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="relative">
              <span className="sr-only">Search checklist</span>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find requirement" className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm" />
            </label>
            <select aria-label="Filter by category" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="all">All categories</option>
              {categories.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
            <select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="all">All statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        {loading ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading launch workboard…</p>
          : filteredItems.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No requirements match these filters.</p>
            : (
              <div className="space-y-3">
                {filteredItems.map(item => {
                  const draft = drafts[item.id] || { status: item.status, note: item.status_note || '' };
                  const changed = draft.status !== item.status || draft.note !== (item.status_note || '');
                  return (
                    <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-slate-600">{item.category}</span>
                            {item.is_critical && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[9px] font-black uppercase text-rose-700">Launch blocker</span>}
                            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${statusStyles[draft.status]}`}>{statusLabels[draft.status]}</span>
                          </div>
                          <h3 className="mt-3 text-base font-black text-slate-950">{item.title}</h3>
                          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-slate-600">{item.description}</p>
                          {item.updated_by && <p className="mt-2 text-[10px] text-slate-400">Last updated by {item.updated_by} · {formatDate(item.updated_at)}</p>}
                        </div>
                        {canManage && (
                          <div className="grid w-full gap-2 sm:grid-cols-[minmax(150px,0.65fr)_minmax(220px,1.35fr)_auto] xl:max-w-2xl">
                            <label className="space-y-1">
                              <span className="text-[9px] font-bold uppercase text-slate-500">Status</span>
                              <select
                                value={draft.status}
                                onChange={event => setDrafts(current => ({ ...current, [item.id]: { ...draft, status: event.target.value as ChecklistStatus } }))}
                                className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold"
                              >
                                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-[9px] font-bold uppercase text-slate-500">Evidence / next action</span>
                              <textarea
                                value={draft.note}
                                maxLength={2000}
                                onChange={event => setDrafts(current => ({ ...current, [item.id]: { ...draft, note: event.target.value } }))}
                                rows={2}
                                placeholder="What was checked? What is still needed?"
                                className="min-h-10 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                              />
                            </label>
                            <button type="button" disabled={!changed || savingId === item.id} onClick={() => void saveItem(item)} className="self-end rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40">
                              {savingId === item.id ? 'Saving…' : savedId === item.id ? 'Saved' : 'Save'}
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-950">What customers search for</h2>
            <p className="mt-1 text-xs text-slate-500">
              Consent-gated search terms, aggregated by phrase for the last {days} days. Email-like and phone-number-like queries are excluded.
            </p>
          </div>
          <label className="relative w-full sm:max-w-xs">
            <span className="sr-only">Filter search phrases</span>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Filter search phrases" className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm" />
          </label>
        </div>
        {data?.setupErrors?.search ? (
          <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{data.setupErrors.search}</p>
        ) : loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading search demand…</p>
        ) : filteredSearches.length === 0 ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-6 text-center">
            <Search className="mx-auto h-7 w-7 text-slate-400" />
            <p className="mt-2 text-sm font-bold text-slate-700">No consented search phrases in this period.</p>
            <p className="mt-1 text-xs text-slate-500">This can mean no traffic, analytics consent was declined, or search tracking is not yet exercised.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Search phrase</th>
                  <th className="px-3 py-3 text-right">Searches</th>
                  <th className="px-3 py-3 text-right">Sessions</th>
                  <th className="px-3 py-3 text-right">No results</th>
                  <th className="px-3 py-3 text-right">Avg. matches</th>
                  <th className="px-3 py-3 text-right">Last searched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSearches.map(item => (
                  <tr key={item.search_term} className="text-sm text-slate-700">
                    <td className="px-3 py-4 font-bold text-slate-950">{item.search_term}</td>
                    <td className="px-3 py-4 text-right">{formatCount(Number(item.search_count))}</td>
                    <td className="px-3 py-4 text-right">{formatCount(Number(item.unique_sessions))}</td>
                    <td className="px-3 py-4 text-right">{formatCount(Number(item.zero_result_count))}</td>
                    <td className="px-3 py-4 text-right">{item.average_results === null ? '—' : Number(item.average_results).toFixed(1)}</td>
                    <td className="px-3 py-4 text-right text-xs text-slate-500">{formatDate(item.last_searched_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!canManage && <p className="text-center text-xs text-slate-500">You have read-only access. Ask an owner/admin to update launch checklist items.</p>}
    </main>
  );
}
