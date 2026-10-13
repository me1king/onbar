'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Download, RefreshCw, Save, Search, Users } from 'lucide-react';

const serviceOptions = [
  ['finding_outfit', 'Finding the outfit'],
  ['styling', 'Styling and coordination'],
  ['makeup_sfx', 'Makeup or special effects'],
  ['wig_hair', 'Wig or hair styling'],
  ['props_accessories', 'Props and accessories'],
  ['tailoring', 'Tailoring or alterations'],
  ['costume_maker', 'Costume makers'],
  ['inspiration_tutorials', 'Inspiration and tutorials']
] as const;
const statusOptions = [
  ['new', 'New'],
  ['reviewing', 'Reviewing'],
  ['matched', 'Matched'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
  ['closed', 'Closed']
] as const;
const budgetLabels: Record<string, string> = {
  under_2000: 'Under KSh 2,000',
  kes_2000_5000: 'KSh 2,000–5,000',
  kes_5000_10000: 'KSh 5,000–10,000',
  above_10000: 'Above KSh 10,000',
  need_ideas: 'Help me decide',
  not_specified: 'Not specified'
};
const readinessLabels: Record<string, string> = {
  fully_ready: 'Full outfit ready',
  idea_needs_help: 'Has an idea, needs help',
  source_most: 'Needs most of the outfit',
  finishing_touches: 'Needs finishing touches',
  undecided: 'Undecided'
};
type Provider = {
  id: string; name: string; service_key: string; contact_name: string | null;
  email: string | null; phone: string | null; notes: string; verified: boolean;
  available: boolean; updated_at: string;
};
type FitProfile = {
  id: string; member_id: string; concept: string; character_theme: string | null;
  outfit_status: string; budget_range: string | null; group_plan: string;
  status: string; provider_id: string | null; created_at: string; updated_at: string;
  member: { id: string; full_name: string | null; email: string; phone: string | null } | null;
  help: Array<{ service_key: string }> | null;
  provider: Pick<Provider, 'id' | 'name' | 'service_key' | 'verified' | 'available'> | null;
  consent: Array<{ purpose: string; channel: string; granted: boolean; capturedAt: string }>;
};
type FitSettings = { title: string; intro: string; merchant_notice: string };
type DashboardData = {
  profiles: FitProfile[];
  providers: Provider[];
  settings: FitSettings | null;
  audit: Array<{ id: number; actor_email: string; action: string; profile_id: string | null; created_at: string }>;
  metrics: {
    totalProfiles?: number; newRequests?: number; needingHelp?: number;
    matched?: number; followupOptIns?: number; byService?: Record<string, number>;
    byBudget?: Record<string, number>; byReadiness?: Record<string, number>;
    byStatus?: Record<string, number>;
  };
  page: number; pageSize: number; total: number; hasMore: boolean; error?: string;
};
type Props = { canView: boolean; canManage: boolean; canExport: boolean };

const emptyProvider = {
  id: '', name: '', service_key: 'finding_outfit', contact_name: '',
  email: '', phone: '', notes: '', verified: false, available: false
};

function count(value: number | undefined) {
  return new Intl.NumberFormat('en-KE').format(value || 0);
}

function date(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : '—';
}

export default function WaitlistFitStudioPanel({ canView, canManage, canExport }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [service, setService] = useState('all');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState('');
  const [savingProfile, setSavingProfile] = useState('');
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [providerDraft, setProviderDraft] = useState(emptyProvider);
  const [settingsDraft, setSettingsDraft] = useState<FitSettings | null>(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), search, status, service });
      const response = await fetch(`/api/admin/waitlist-fit-studio?${params}`, { cache: 'no-store' });
      const result = await response.json() as DashboardData;
      if (!response.ok) throw new Error(result.error || 'Fit Studio demand could not be loaded.');
      setData(result);
      if (result.settings) setSettingsDraft({
        title: result.settings.title,
        intro: result.settings.intro,
        merchant_notice: result.settings.merchant_notice
      });
    } catch (cause) {
      console.error('[AdminFitStudio] Could not load Fit Studio data:', cause);
      setError(cause instanceof Error ? cause.message : 'Fit Studio demand could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [canView, page, search, service, status]);

  useEffect(() => { void load(); }, [load]);

  const activeVerifiedProviders = useMemo(
    () => (data?.providers || []).filter(provider => provider.available && provider.verified),
    [data?.providers]
  );

  const updateProfile = async (profile: FitProfile, nextStatus: string, providerId: string) => {
    setSavingProfile(profile.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/waitlist-fit-studio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_profile', profileId: profile.id, status: nextStatus, providerId: providerId || null })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Request progress could not be saved.');
      setNotice('Fit Studio request updated and recorded in the audit trail.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request progress could not be saved.');
    } finally {
      setSavingProfile('');
    }
  };

  const saveProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingProvider(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/waitlist-fit-studio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_provider', provider: providerDraft })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Provider details could not be saved.');
      setNotice('Provider directory updated and audited. Only verified, available providers can be assigned.');
      setProviderDraft(emptyProvider);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Provider details could not be saved.');
    } finally {
      setSavingProvider(false);
    }
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settingsDraft) return;
    setSavingSettings(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/waitlist-fit-studio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_settings',
          title: settingsDraft.title,
          intro: settingsDraft.intro,
          merchantNotice: settingsDraft.merchant_notice
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Public Fit Studio copy could not be saved.');
      setNotice('Fit Studio public copy published and recorded in the audit trail.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Public Fit Studio copy could not be saved.');
    } finally {
      setSavingSettings(false);
    }
  };

  const exportSummary = async () => {
    setError('');
    try {
      const response = await fetch('/api/admin/waitlist-fit-studio?export=summary&purpose=service_planning', { cache: 'no-store' });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || 'The service-planning export could not be created.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fit-studio-service-planning.csv';
      link.click();
      URL.revokeObjectURL(url);
      setNotice('Anonymous service-planning summary exported and audited. No member contact details were included.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The service-planning export could not be created.');
    }
  };

  const expandProfile = async (profileId: string) => {
    setExpandedId(current => current === profileId ? '' : profileId);
    if (expandedId === profileId) return;
    try {
      const response = await fetch('/api/admin/waitlist-fit-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'view_profile', profileId })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Profile view could not be audited.');
      setData(current => current ? {
        ...current,
        audit: [{ id: Date.now(), actor_email: 'You', action: 'view_profile', profile_id: profileId, created_at: new Date().toISOString() }, ...current.audit].slice(0, 50)
      } : current);
    } catch (cause) {
      console.error('[AdminFitStudio] Could not record profile view:', cause);
      setError(cause instanceof Error ? cause.message : 'Profile view could not be audited.');
    }
  };

  if (!canView) return null;

  return (
    <section id="waitlist-fit-studio" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary"><Users size={14} /> Halloween demand · member-led planning</p>
          <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-slate-950">Midnight Fit Studio</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Optional waitlist-member outfit questionnaire, request queue, merchant/provider directory and consent-aware planning. No provider is promised until availability and terms are confirmed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExport && <button type="button" onClick={() => void exportSummary()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700"><Download size={15} /> Export anonymous summary</button>}
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {!data && loading && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Loading real Fit Studio demand from the shared waitlist database…</p>}
      {!data && error && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Dashboard data is unavailable; no sample or placeholder metrics are shown.</p>}

      {data && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Fit profiles', data.metrics.totalProfiles],
            ['New requests', data.metrics.newRequests],
            ['Outfits needing help', data.metrics.needingHelp],
            ['Valid follow-up opt-ins', data.metrics.followupOptIns],
            ['Matched to verified provider', data.metrics.matched]
          ].map(([label, value]) => (
            <article key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span><b className="mt-2 block text-2xl text-slate-950">{loading ? '—' : count(Number(value))}</b></article>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <article className="rounded-xl border border-slate-200 p-4 xl:col-span-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-900">Demand by requested service</h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">{serviceOptions.map(([key, label]) => (
              <li key={key} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{label}</span><b className="text-primary">{count(data.metrics.byService?.[key])}</b></li>
            ))}</ul>
          </article>
          <article className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-900">Budget range</h3>
            <ul className="mt-3 space-y-2">{Object.entries(data.metrics.byBudget || {}).map(([key, amount]) => (
              <li key={key} className="flex items-center justify-between gap-2 text-sm"><span className="text-slate-600">{budgetLabels[key] || key}</span><b>{count(amount)}</b></li>
            ))}</ul>
          </article>
        </div>

        <div className="rounded-xl border border-slate-200">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between">
            <div><h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Member request queue</h3><p className="mt-1 text-xs text-slate-500">{count(data.total)} matching profiles · member contact data is visible only to authorized Admin staff.</p></div>
            <form className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_170px_200px_auto]" onSubmit={event => { event.preventDefault(); setPage(0); setSearch(searchDraft.trim()); }}>
              <label className="relative"><span className="sr-only">Search Fit Studio members</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={searchDraft} onChange={event => setSearchDraft(event.target.value)} placeholder="Search name, email, phone" className="min-h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm" /></label>
              <select aria-label="Filter Fit Studio status" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="all">All request statuses</option>{statusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
              <select aria-label="Filter Fit Studio request type" value={service} onChange={event => { setService(event.target.value); setPage(0); }} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="all">All help requests</option>{serviceOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
              <button className="min-h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white">Search</button>
            </form>
          </div>
          {!data.profiles.length ? <p className="p-8 text-center text-sm text-slate-500">No Fit Studio profiles match these filters.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-xs">
                <thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500"><tr>{['Member / contact', 'Look & readiness', 'Requested help', 'Budget / group', 'Consent', 'Provider / progress'].map(label => <th key={label} className="px-3 py-3 font-black">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.profiles.map(profile => {
                    const requestedServices = (profile.help || []).map(item => item.service_key);
                    const matchingProviders = activeVerifiedProviders.filter(provider => requestedServices.includes(provider.service_key));
                    const member = profile.member;
                    const isExpanded = expandedId === profile.id;
                    return <tr key={profile.id} className="align-top">
                      <td className="max-w-[220px] px-3 py-4">
                        <button type="button" onClick={() => void expandProfile(profile.id)} className="text-left font-bold text-slate-900 underline decoration-dotted underline-offset-2">{member?.full_name || 'Name not provided'}</button>
                        <a className="mt-1 block break-all text-primary hover:underline" href={`mailto:${encodeURIComponent(member?.email || '')}`}>{member?.email || 'Email unavailable'}</a>
                        {member?.phone && <a className="mt-1 block text-slate-600 hover:underline" href={`tel:${encodeURIComponent(member.phone)}`}>{member.phone}</a>}
                        <span className="mt-1 block font-mono text-[9px] text-slate-400">{member?.id}</span>
                      </td>
                      <td className="max-w-[180px] px-3 py-4"><b className="block text-slate-800">{profile.concept.replaceAll('_', ' ')}</b>{profile.character_theme && <span className="mt-1 block break-words text-slate-600">{profile.character_theme}</span>}<span className="mt-1 block text-slate-500">{readinessLabels[profile.outfit_status] || profile.outfit_status}</span></td>
                      <td className="max-w-[220px] px-3 py-4"><ul className="space-y-1">{requestedServices.map(key => <li key={key} className="text-slate-700">{serviceOptions.find(([id]) => id === key)?.[1] || key}</li>)}</ul></td>
                      <td className="px-3 py-4"><b>{budgetLabels[profile.budget_range || 'not_specified'] || profile.budget_range}</b><span className="mt-1 block capitalize text-slate-500">{profile.group_plan.replaceAll('_', ' ')}</span></td>
                      <td className="min-w-[175px] px-3 py-4">
                        <b className="block text-slate-600">Fit updates</b>
                        {(['email', 'sms', 'whatsapp'] as const).map(channel => {
                          const consent = profile.consent?.find(item => item.purpose === 'fit_service_updates' && item.channel === channel);
                          return <p key={`update-${channel}`} className={consent?.granted ? 'mb-1 font-bold text-emerald-700' : 'mb-1 text-slate-400'}>{consent?.granted ? '✓' : '—'} {channel.toUpperCase()} <span className="font-normal text-slate-400">{consent ? date(consent.capturedAt) : ''}</span></p>;
                        })}
                        <b className="mt-2 block text-slate-600">Provider introduction</b>
                        {(['email', 'sms', 'whatsapp'] as const).map(channel => {
                          const consent = profile.consent?.find(item => item.purpose === 'provider_introduction' && item.channel === channel);
                          return <p key={`intro-${channel}`} className={consent?.granted ? 'mb-1 font-bold text-emerald-700' : 'mb-1 text-slate-400'}>{consent?.granted ? '✓' : '—'} {channel.toUpperCase()} <span className="font-normal text-slate-400">{consent ? date(consent.capturedAt) : ''}</span></p>;
                        })}
                      </td>
                      <td className="min-w-[230px] px-3 py-4">
                        <select aria-label={`Provider for ${member?.email || 'profile'}`} value={profile.provider_id || ''} disabled={!canManage || savingProfile === profile.id} onChange={event => void updateProfile(profile, profile.status, event.target.value)} className="mb-2 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[10px] disabled:opacity-50">
                          <option value="">No provider assigned</option>
                          {matchingProviders.map(provider => <option key={provider.id} value={provider.id}>{provider.name} · verified</option>)}
                        </select>
                        <select aria-label={`Progress for ${member?.email || 'profile'}`} value={profile.status} disabled={!canManage || savingProfile === profile.id} onChange={event => void updateProfile(profile, event.target.value, profile.provider_id || '')} className="min-h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold disabled:opacity-50">
                          {statusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                        </select>
                        {profile.provider && <span className="mt-1 block text-slate-500">{profile.provider.name} · {profile.provider.verified && profile.provider.available ? 'verified & available' : 'not assignable'}</span>}
                        {isExpanded && <div className="mt-2 rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600"><p>Member since: {date(profile.created_at)}</p><p>Last updated: {date(profile.updated_at)}</p><p>Consent is recorded for Fit Studio only; no message is sent by saving preferences.</p><p>Assigned provider introductions require separate member permission.</p></div>}
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs"><button type="button" onClick={() => setPage(current => Math.max(0, current - 1))} disabled={page === 0 || loading} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Previous</button><span>Page {page + 1}</span><button type="button" onClick={() => setPage(current => current + 1)} disabled={!data.hasMore || loading} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Next</button></div>
        </div>

        {canManage && <div className="grid gap-4 xl:grid-cols-2">
          <form onSubmit={saveProvider} className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-black uppercase tracking-wide text-slate-900">Vetted merchant / provider directory</h3><p className="mt-1 text-xs text-slate-500">Record prospective providers; mark availability and verification only after checks are complete.</p></div><button type="button" onClick={() => setProviderDraft(emptyProvider)} className="text-xs font-bold text-primary">New provider</button></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600">Business / provider name<input required maxLength={120} value={providerDraft.name} onChange={event => setProviderDraft({ ...providerDraft, name: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
              <label className="text-xs font-bold text-slate-600">Service<select value={providerDraft.service_key} onChange={event => setProviderDraft({ ...providerDraft, service_key: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal">{serviceOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-600">Contact name<input maxLength={120} value={providerDraft.contact_name} onChange={event => setProviderDraft({ ...providerDraft, contact_name: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
              <label className="text-xs font-bold text-slate-600">Email<input type="email" maxLength={254} value={providerDraft.email} onChange={event => setProviderDraft({ ...providerDraft, email: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
              <label className="text-xs font-bold text-slate-600">Phone<input type="tel" maxLength={32} value={providerDraft.phone} onChange={event => setProviderDraft({ ...providerDraft, phone: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
              <label className="text-xs font-bold text-slate-600">Notes<textarea maxLength={1000} value={providerDraft.notes} onChange={event => setProviderDraft({ ...providerDraft, notes: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal" /></label>
            </div>
            <div className="flex flex-wrap gap-4 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={providerDraft.verified} onChange={event => setProviderDraft({ ...providerDraft, verified: event.target.checked })} />Verified</label><label className="flex items-center gap-2"><input type="checkbox" checked={providerDraft.available} onChange={event => setProviderDraft({ ...providerDraft, available: event.target.checked })} />Available</label></div>
            <button disabled={savingProvider} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"><Save size={14} />{savingProvider ? 'Saving…' : providerDraft.id ? 'Update provider' : 'Add provider'}</button>
            <ul className="space-y-2 border-t border-slate-100 pt-3">{data.providers.map(provider => <li key={provider.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-xs"><span><b>{provider.name}</b><span className="ml-2 text-slate-500">{serviceOptions.find(([key]) => key === provider.service_key)?.[1]}</span><span className="ml-2 text-slate-500">{provider.verified ? 'Verified' : 'Unverified'} · {provider.available ? 'Available' : 'Unavailable'}</span></span><button type="button" onClick={() => setProviderDraft({ ...provider, id: provider.id, contact_name: provider.contact_name || '', email: provider.email || '', phone: provider.phone || '' })} className="font-bold text-primary">Edit</button></li>)}</ul>
          </form>

          <div className="space-y-4">
            {settingsDraft && <form onSubmit={saveSettings} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div><h3 className="text-xs font-black uppercase tracking-wide text-slate-900">Fit Studio public copy</h3><p className="mt-1 text-xs text-slate-500">This copy appears on the member questionnaire. Keep merchant availability claims accurate.</p></div>
              <label className="block text-xs font-bold text-slate-600">Title<input required maxLength={100} value={settingsDraft.title} onChange={event => setSettingsDraft({ ...settingsDraft, title: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
              <label className="block text-xs font-bold text-slate-600">Introduction<textarea required minLength={10} maxLength={500} value={settingsDraft.intro} onChange={event => setSettingsDraft({ ...settingsDraft, intro: event.target.value })} className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal" /></label>
              <label className="block text-xs font-bold text-slate-600">Merchant / availability message<textarea required minLength={10} maxLength={500} value={settingsDraft.merchant_notice} onChange={event => setSettingsDraft({ ...settingsDraft, merchant_notice: event.target.value })} className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal" /></label>
              <button disabled={savingSettings} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"><Save size={14} />{savingSettings ? 'Publishing…' : 'Publish Fit Studio copy'}</button>
            </form>}

            <article className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-xs font-black uppercase tracking-wide text-slate-900">Admin audit trail</h3>
              <p className="mt-1 text-xs text-slate-500">Queue and profile views, workflow updates, settings changes, exports and provider edits.</p>
              <div className="mt-3 max-h-72 space-y-2 overflow-auto">{data.audit.map(entry => <p key={entry.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-2 text-[10px]"><span><b>{entry.actor_email}</b> · {entry.action.replaceAll('_', ' ')}{entry.profile_id ? ` · ${entry.profile_id.slice(0, 8)}` : ''}</span><span className="text-slate-500">{date(entry.created_at)}</span></p>)}</div>
            </article>
          </div>
        </div>}

        {!canManage && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">You have permission to review Fit Studio demand. Editing request status, provider details and public copy requires owner/admin or <code>can_manage_settings</code> permission.</p>}
      </>}
    </section>
  );
}
