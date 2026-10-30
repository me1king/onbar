'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  Clock3,
  Copy,
  Link2,
  MapPin,
  Plus,
  RefreshCcw,
  Search,
  Store,
  Truck,
  Users,
  Utensils,
  Wine,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const stages = [
  { id: 'called', label: 'Called' },
  { id: 'phone_approved', label: 'Phone approved' },
  { id: 'visit_booked', label: 'Visit booked' },
  { id: 'visited_verified', label: 'Visited & verified' },
  { id: 'test_order', label: 'Test order' },
  { id: 'live', label: 'Live' }
] as const;
const types = [
  { id: 'retailer', label: 'Retailer' },
  { id: 'wholesaler', label: 'Wholesaler' },
  { id: 'street_food', label: 'Street food' },
  { id: 'rider', label: 'Rider' }
] as const;

type Stage = typeof stages[number]['id'];
type VendorType = typeof types[number]['id'];

interface Lead {
  id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  whatsapp: string | null;
  area: string;
  vendor_type: VendorType;
  agent: string;
  stage: Stage;
  notes: string | null;
  first_call_at: string;
  approved_at: string | null;
  visit_scheduled_at: string | null;
  visit_at: string | null;
  check_in_at: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  test_order_passed: boolean;
  second_review_passed: boolean;
  launched_at: string | null;
  created_at: string;
}

interface ChecklistItem {
  id: number;
  lead_id: string;
  item_key: string;
  label: string;
  is_required: boolean;
  is_complete: boolean;
  completed_by: string | null;
  completed_at: string | null;
}

interface LeadEvent {
  id: number;
  event_type: string;
  actor: string;
  details: Record<string, unknown>;
  created_at: string;
}

const typeLabel = (type: VendorType) => types.find(item => item.id === type)?.label || type;
const stageLabel = (stage: Stage) => stages.find(item => item.id === stage)?.label || stage;

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function formatDateTimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function daysBetween(start: string, end: string | null) {
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

function progressFor(checklist: ChecklistItem[]) {
  if (!checklist.length) return 0;
  return Math.round(checklist.filter(item => item.is_complete).length / checklist.length * 100);
}

function nextStage(stage: Stage): Stage | null {
  const index = stages.findIndex(item => item.id === stage);
  return index >= 0 && index < stages.length - 1 ? stages[index + 1].id : null;
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers }
  });
  const result = await response.json() as { error?: string; [key: string]: unknown };
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

export default function VendorOnboardingPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [checklists, setChecklists] = useState<ChecklistItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [tab, setTab] = useState<'pipeline' | 'ledger'>('pipeline');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [agentDraft, setAgentDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [visitDraft, setVisitDraft] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [form, setForm] = useState({
    business_name: '',
    owner_name: '',
    phone: '',
    whatsapp: '',
    area: '',
    vendor_type: 'retailer' as VendorType,
    agent: '',
    source: '',
    notes: ''
  });
  const [detailChecklist, setDetailChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteHref, setInviteHref] = useState('');

  const loadPipeline = useCallback(async (keepSelection = true) => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestJson('/api/admin/vendor-onboarding') as {
        leads: Lead[];
        checklist: ChecklistItem[];
      };
      setLeads(result.leads);
      setChecklists(result.checklist);
      if (!keepSelection) {
        setSelectedId(current => current && result.leads.some(lead => lead.id === current) ? current : null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the onboarding pipeline.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const result = await requestJson(`/api/admin/vendor-onboarding?id=${encodeURIComponent(id)}`) as {
        lead: Lead;
        checklist: ChecklistItem[];
        events: LeadEvent[];
      };
      setDetailChecklist(result.checklist);
      setEvents(result.events);
      setAgentDraft(result.lead.agent);
      setNotesDraft(result.lead.notes || '');
      setVisitDraft(formatDateTimeLocal(result.lead.visit_scheduled_at));
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'Could not load the lead details.');
    }
  }, []);

  useEffect(() => { void loadPipeline(); }, [loadPipeline]);
  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else {
      setDetailChecklist([]);
      setEvents([]);
    }
    setInviteHref('');
  }, [selectedId, loadDetail]);

  const selectedLead = leads.find(lead => lead.id === selectedId) || null;
  const agents = useMemo(() => [...new Set(leads.map(lead => lead.agent).filter(Boolean))].sort(), [leads]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter(lead =>
      (!typeFilter || lead.vendor_type === typeFilter)
      && (!agentFilter || lead.agent === agentFilter)
      && (!term || [lead.business_name, lead.owner_name, lead.phone, lead.area, lead.agent]
        .some(value => value.toLowerCase().includes(term)))
    );
  }, [leads, typeFilter, agentFilter, search]);
  const liveCount = leads.filter(lead => lead.stage === 'live').length;
  const stuckCount = leads.filter(lead => lead.stage !== 'live' && daysBetween(lead.first_call_at, null) > 7).length;

  const saveAction = async (payload: Record<string, unknown>, successMessage: string) => {
    if (!selectedId) return;
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      await requestJson('/api/admin/vendor-onboarding', {
        method: 'PATCH',
        body: JSON.stringify({ id: selectedId, ...payload })
      });
      setNotice(successMessage);
      await loadPipeline();
      await loadDetail(selectedId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this update.');
    } finally {
      setWorking(false);
    }
  };

  const createInvite = async () => {
    if (!selectedLead || selectedLead.vendor_type === 'rider' || selectedLead.stage === 'live') return;
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestJson('/api/admin/vendor-onboarding', {
        method: 'PATCH',
        body: JSON.stringify({ id: selectedLead.id, action: 'issue_invite' })
      }) as { token: string };
      const link = new URL('/merchant/onboarding', window.location.origin);
      link.searchParams.set('invite', result.token);
      setInviteHref(link.toString());
      setNotice(`A private 7-day onboarding link was created for ${selectedLead.business_name}.`);
      await loadPipeline();
      await loadDetail(selectedLead.id);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Could not create the company onboarding link.');
    } finally {
      setWorking(false);
    }
  };

  const copyInvite = async () => {
    if (!inviteHref) return;
    try {
      await navigator.clipboard.writeText(inviteHref);
      setNotice('Company onboarding link copied.');
    } catch (copyError) {
      console.error('[VendorOnboarding] Could not copy private invite link:', copyError);
      setError('Could not copy the link. Select and copy the displayed URL instead.');
    }
  };

  const submitLead = async (event: React.FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      let payload: Record<string, unknown>;
      if (bulkMode) {
        const rows = bulkText.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
          const columns = line.split(/\t|\|/).length > 1 ? line.split(/\t|\|/) : line.split(',');
          return {
            business_name: columns[0]?.trim(),
            owner_name: columns[1]?.trim(),
            phone: columns[2]?.trim(),
            area: columns[3]?.trim(),
            vendor_type: columns[4]?.trim().toLowerCase().replace(/[\s-]+/g, '_')
          };
        });
        if (!rows.length) throw new Error('Paste at least one lead row first.');
        payload = { leads: rows.map(row => ({ ...row, agent: form.agent || 'Unassigned' })) };
      } else {
        payload = {
          ...form,
          agent: form.agent || 'Unassigned',
          whatsapp: form.whatsapp || form.phone
        };
      }
      const result = await requestJson('/api/admin/vendor-onboarding', {
        method: 'POST',
        body: JSON.stringify(payload)
      }) as { leads: Lead[] };
      setNotice(`${result.leads.length} lead${result.leads.length === 1 ? '' : 's'} added to the pipeline.`);
      setShowAdd(false);
      setBulkText('');
      setForm({ business_name: '', owner_name: '', phone: '', whatsapp: '', area: '', vendor_type: 'retailer', agent: '', source: '', notes: '' });
      await loadPipeline(false);
      if (result.leads.length === 1) setSelectedId(result.leads[0].id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not create the onboarding lead.');
    } finally {
      setWorking(false);
    }
  };

  const recordCheckin = () => {
    if (!navigator.geolocation) {
      setError('This device does not provide location access.');
      return;
    }
    setWorking(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async position => {
        await saveAction({
          action: 'checkin',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }, 'Field visit check-in recorded.');
        setWorking(false);
      },
      locationError => {
        setError(locationError.code === locationError.PERMISSION_DENIED
          ? 'Allow location access to record this field visit.'
          : 'Could not get the device location. Try again at the visit.');
        setWorking(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
    );
  };

  const agentStats = useMemo(() => agents.map(agent => {
    const assigned = leads.filter(lead => lead.agent === agent);
    const live = assigned.filter(lead => lead.stage === 'live');
    const launchDurations = live.filter(lead => lead.launched_at)
      .map(lead => daysBetween(lead.first_call_at, lead.launched_at));
    return {
      agent,
      assigned: assigned.length,
      live: live.length,
      avgDays: launchDurations.length
        ? Math.round(launchDurations.reduce((sum, days) => sum + days, 0) / launchDurations.length * 10) / 10
        : null
    };
  }), [agents, leads]);

  const messageHref = selectedLead
    ? `https://wa.me/${(selectedLead.whatsapp || selectedLead.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${selectedLead.owner_name}, here is the private onboarding link for ${selectedLead.business_name}: ${inviteHref || 'Please contact our team to request your link.'} OnBar will only use this link for your company's application. It expires after 7 days.`)}`
    : '';
  const next = selectedLead ? nextStage(selectedLead.stage) : null;
  const stageBlocked = selectedLead?.stage === 'phone_approved' && !selectedLead.visit_scheduled_at;

  return (
    <div className="min-h-full space-y-6 p-4 text-slate-100 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
            <ClipboardCheck className="h-4 w-4" /> Partner operations
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-white">Vendor launch pipeline</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Track outreach, field verification, launch gates, and agent progress. A tracked lead is not a live vendor account.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadPipeline()} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button onClick={() => { setShowAdd(value => !value); setError(null); }}>
            {showAdd ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {showAdd ? 'Close' : 'Add leads'}
          </Button>
        </div>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</div>}

      {showAdd && <Card className="border-slate-700 bg-slate-900 p-5 text-slate-100">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">{bulkMode ? 'Add a batch of leads' : 'Add a lead'}</h2>
            <p className="mt-1 text-xs text-slate-400">This saves internal records only. No SMS or WhatsApp message is sent.</p>
          </div>
          <button type="button" className="text-sm text-emerald-300 hover:text-emerald-200" onClick={() => setBulkMode(value => !value)}>
            Switch to {bulkMode ? 'single lead' : 'bulk entry'}
          </button>
        </div>
        <form onSubmit={submitLead} className="space-y-4">
          {bulkMode ? <>
            <label className="block text-sm text-slate-300">
              One lead per line: business name, owner, phone, area, type. Separate columns with commas, tabs, or |.
              <textarea
                required
                value={bulkText}
                onChange={event => setBulkText(event.target.value)}
                rows={5}
                placeholder={'The Corner Shop, Amina, +254700000000, Westlands, retailer\nFresh Bites | Peter | +254711111111 | Kilimani | street_food'}
                className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-sm text-white placeholder:text-slate-300"
              />
            </label>
            <Input placeholder="Assigned agent (optional)" value={form.agent} onChange={event => setForm(current => ({ ...current, agent: event.target.value }))} className="placeholder:text-slate-300" />
          </> : <>
            <div className="grid gap-3 md:grid-cols-3">
              <Input required placeholder="Business / rider name" value={form.business_name} onChange={event => setForm(current => ({ ...current, business_name: event.target.value }))} className="placeholder:text-slate-300" />
              <Input required placeholder="Owner / contact name" value={form.owner_name} onChange={event => setForm(current => ({ ...current, owner_name: event.target.value }))} className="placeholder:text-slate-300" />
              <Input required type="tel" placeholder="Phone" value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} className="placeholder:text-slate-300" />
              <Input placeholder="WhatsApp number (optional)" value={form.whatsapp} onChange={event => setForm(current => ({ ...current, whatsapp: event.target.value }))} className="placeholder:text-slate-300" />
              <Input required placeholder="Area / town" value={form.area} onChange={event => setForm(current => ({ ...current, area: event.target.value }))} className="placeholder:text-slate-300" />
              <select value={form.vendor_type} onChange={event => setForm(current => ({ ...current, vendor_type: event.target.value as VendorType }))} className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                {types.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
              <Input placeholder="Assigned agent (optional)" value={form.agent} onChange={event => setForm(current => ({ ...current, agent: event.target.value }))} className="placeholder:text-slate-300" />
              <Input placeholder="Lead source (optional)" value={form.source || ''} onChange={event => setForm(current => ({ ...current, source: event.target.value }))} className="placeholder:text-slate-300" />
              <Input placeholder="Notes (optional)" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} className="placeholder:text-slate-300" />
            </div>
          </>}
          <Button type="submit" disabled={working}>{working ? 'Saving…' : bulkMode ? 'Add batch' : 'Save lead'}</Button>
        </form>
      </Card>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={<Users className="h-4 w-4" />} label="Tracked leads" value={leads.length} />
        <Metric icon={<Store className="h-4 w-4" />} label="Pipeline launch gates complete" value={liveCount} />
        <Metric icon={<Clock3 className="h-4 w-4" />} label="Waiting over 7 days" value={stuckCount} />
      </div>

      <div className="flex gap-2 border-b border-slate-800">
        <TabButton active={tab === 'pipeline'} onClick={() => setTab('pipeline')}>Pipeline</TabButton>
        <TabButton active={tab === 'ledger'} onClick={() => setTab('ledger')}>Ledger & agent scorecard</TabButton>
      </div>

      {tab === 'pipeline' ? <>
        <div className="flex flex-wrap gap-3">
          <label className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, phone, area…" className="pl-9 placeholder:text-slate-300" />
          </label>
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
            <option value="">All partner types</option>
            {types.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
          <select value={agentFilter} onChange={event => setAgentFilter(event.target.value)} className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
            <option value="">All agents</option>
            {agents.map(agent => <option key={agent} value={agent}>{agent}</option>)}
          </select>
        </div>
        {loading ? <div className="py-12 text-center text-sm text-slate-400">Loading pipeline…</div> : <div className="grid gap-3 xl:grid-cols-6">
          {stages.map(stage => {
            const stageLeads = filtered.filter(lead => lead.stage === stage.id);
            return <section key={stage.id} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-200">{stage.label}</h2>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{stageLeads.length}</span>
              </div>
              <div className="space-y-2">
                {stageLeads.map(lead => {
                  const checklist = checklists.filter(item => item.lead_id === lead.id);
                  const percent = progressFor(checklist);
                  const age = daysBetween(lead.first_call_at, null);
                  return <button key={lead.id} type="button" onClick={() => setSelectedId(lead.id)}
                    className={`w-full rounded-lg border p-3 text-left transition hover:border-emerald-500/50 ${selectedId === lead.id ? 'border-emerald-500 bg-emerald-950/30' : 'border-slate-800 bg-slate-900'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-medium text-white">{lead.business_name}</span>
                      {age > 7 && lead.stage !== 'live' && <span className="shrink-0 rounded bg-amber-950 px-1.5 py-0.5 text-[10px] text-amber-200">Stuck</span>}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                      {lead.vendor_type === 'rider' ? <Truck className="h-3.5 w-3.5" /> : lead.vendor_type === 'street_food' ? <Utensils className="h-3.5 w-3.5" /> : <Wine className="h-3.5 w-3.5" />}
                      {typeLabel(lead.vendor_type)} · {lead.area}
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                      <span>{lead.agent}</span><span>{percent}% checklist</span>
                    </div>
                  </button>;
                })}
                {!stageLeads.length && <div className="rounded-lg border border-dashed border-slate-800 p-4 text-center text-xs text-slate-600">No leads</div>}
              </div>
            </section>;
          })}
        </div>}
        {selectedLead && <Card className="border-slate-700 bg-slate-900 p-5 text-slate-100">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-300">{typeLabel(selectedLead.vendor_type)} · {stageLabel(selectedLead.stage)}</div>
              <h2 className="mt-1 text-xl font-semibold text-white">{selectedLead.business_name}</h2>
              <p className="mt-1 text-sm text-slate-400">{selectedLead.owner_name} · {selectedLead.phone} · {selectedLead.area}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={`tel:${selectedLead.phone}`} className="inline-flex h-9 items-center rounded-md border border-slate-700 px-3 text-sm hover:bg-slate-800">Call</a>
              {selectedLead.vendor_type !== 'rider' && selectedLead.stage !== 'live' && (
                <Button type="button" disabled={working} onClick={() => void createInvite()} className="h-9 bg-emerald-700 px-3 text-sm text-white hover:bg-emerald-600">
                  <Link2 className="mr-2 h-4 w-4" /> Create private link
                </Button>
              )}
              <a href={messageHref} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-slate-700 px-3 text-sm hover:bg-slate-800">Open WhatsApp</a>
              <button onClick={() => setSelectedId(null)} className="rounded-md border border-slate-700 p-2 text-slate-400 hover:text-white" aria-label="Close lead detail"><X className="h-4 w-4" /></button>
            </div>
          </div>
          {inviteHref && (
            <div className="mt-4 rounded-lg border border-emerald-900 bg-emerald-950/40 p-3">
              <p className="text-xs font-semibold text-emerald-200">Private link for {selectedLead.business_name} · expires in 7 days · one application</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input readOnly value={inviteHref} aria-label={`Private onboarding link for ${selectedLead.business_name}`}
                  className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200" />
                <Button type="button" variant="outline" onClick={() => void copyInvite()} className="h-9 border-slate-700">
                  <Copy className="mr-2 h-4 w-4" /> Copy link
                </Button>
              </div>
            </div>
          )}
          <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-white">Field visit checklist</h3>
                <span className="text-xs text-slate-400">{progressFor(detailChecklist)}% complete</span>
              </div>
              <div className="mt-3 space-y-2">
                {detailChecklist.map(item => <label key={item.id} className="flex items-start gap-3 rounded-lg border border-slate-800 p-3 text-sm">
                  <input type="checkbox" checked={item.is_complete} disabled={working || selectedLead.stage !== 'visit_booked'}
                    onChange={event => void saveAction({ action: 'checklist', item_key: item.item_key, is_complete: event.target.checked }, 'Checklist updated.')}
                    className="mt-0.5 h-4 w-4 accent-emerald-500" />
                  <span className={item.is_complete ? 'text-slate-400 line-through' : 'text-slate-200'}>
                    {item.label}{item.is_required && <span className="ml-1 text-rose-300">*</span>}
                    {item.is_complete && item.completed_by && <span className="mt-1 block text-[11px] text-slate-500">Verified by {item.completed_by}</span>}
                  </span>
                </label>)}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" disabled={working || selectedLead.stage !== 'visit_booked'} onClick={recordCheckin}>
                  <MapPin className="mr-2 h-4 w-4" /> {selectedLead.check_in_at ? 'Record another check-in' : 'GPS check-in'}
                </Button>
                {selectedLead.check_in_at && <span className="self-center text-xs text-slate-400">
                  Checked in {formatDate(selectedLead.check_in_at)} · {selectedLead.check_in_lat}, {selectedLead.check_in_lng}
                </span>}
              </div>
              <p className="mt-2 text-xs text-slate-500">GPS is recorded only when an agent taps check-in during a booked visit.</p>
            </section>
            <section className="space-y-5">
              {selectedLead.stage === 'phone_approved' && <div>
                <h3 className="font-medium text-white">Schedule the field visit</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="datetime-local"
                    min={formatDateTimeLocal(new Date().toISOString())}
                    value={visitDraft}
                    onChange={event => setVisitDraft(event.target.value)}
                    className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white"
                  />
                  <Button variant="outline" disabled={working || !visitDraft} onClick={() => {
                    const scheduledAt = new Date(visitDraft);
                    if (!Number.isFinite(scheduledAt.getTime())) {
                      setError('Choose a valid visit date and time.');
                      return;
                    }
                    void saveAction({ action: 'schedule_visit', visit_scheduled_at: scheduledAt.toISOString() }, 'Field visit time saved.');
                  }}>Save visit time</Button>
                </div>
                <p className="mt-2 text-xs text-slate-500">A future visit time must be saved before moving this lead to Visit booked.</p>
              </div>}
              {selectedLead.visit_scheduled_at && <div className="text-sm text-slate-300">
                Scheduled visit: <span className="font-medium text-white">{new Date(selectedLead.visit_scheduled_at).toLocaleString()}</span>
              </div>}
              <div>
                <h3 className="font-medium text-white">Launch gates</h3>
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={selectedLead.test_order_passed} disabled={working || selectedLead.stage !== 'test_order'}
                    onChange={event => void saveAction({ action: 'launch_check', check: 'test_order', passed: event.target.checked }, 'Test-order result updated.')}
                    className="h-4 w-4 accent-emerald-500" />
                  Test order accepted (record only after a real test)
                </label>
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={selectedLead.second_review_passed} disabled={working || selectedLead.stage !== 'test_order' || !selectedLead.test_order_passed}
                    onChange={event => void saveAction({ action: 'launch_check', check: 'second_review', passed: event.target.checked }, 'Second review updated.')}
                    className="h-4 w-4 accent-emerald-500" />
                  Second-person review complete
                </label>
                <p className="mt-2 text-xs text-slate-500">These checks are audit records; this page does not create test orders or activate accounts.</p>
              </div>
              <div className="rounded-lg border border-slate-800 p-3">
                <h3 className="text-sm font-medium text-white">Agent & notes</h3>
                <div className="mt-3 space-y-2">
                  <Input value={agentDraft} onChange={event => setAgentDraft(event.target.value)} aria-label="Assigned agent" className="placeholder:text-slate-300" />
                  <textarea value={notesDraft} onChange={event => setNotesDraft(event.target.value)} rows={3} placeholder="Call notes, visit details…"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-sm text-white placeholder:text-slate-300" />
                  <Button size="sm" variant="outline" disabled={working} onClick={() => void saveAction({ action: 'edit', agent: agentDraft, notes: notesDraft }, 'Lead notes saved.')}>Save details</Button>
                </div>
              </div>
              <div>
                <Button disabled={working || !next || stageBlocked} onClick={() => {
                  if (next) void saveAction({ action: 'advance', stage: next }, `Moved to ${stageLabel(next)}.`);
                }}>
                  {next ? <>Move to {stageLabel(next)} <ArrowRight className="ml-2 h-4 w-4" /></> : <><Check className="mr-2 h-4 w-4" /> Live</>}
                </Button>
                <p className="mt-2 text-xs text-slate-500">Stage changes are sequential. A visit time, completed visit, passed test order, and second review are required at their respective steps.</p>
              </div>
            </section>
          </div>
          <section className="mt-6 border-t border-slate-800 pt-4">
            <h3 className="font-medium text-white">Activity history</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {events.map(event => <div key={event.id} className="rounded-md bg-slate-950 p-2 text-xs">
                <div className="flex justify-between gap-3 text-slate-300"><span>{event.event_type.replaceAll('_', ' ')}</span><span>{formatDate(event.created_at)}</span></div>
                <div className="mt-1 text-slate-500">{event.actor}{typeof event.details.stage === 'string' ? ` · ${stageLabel(event.details.stage as Stage)}` : ''}</div>
              </div>)}
              {!events.length && <p className="text-xs text-slate-500">No activity recorded yet.</p>}
            </div>
          </section>
        </Card>}
      </> : <>
        <Card className="overflow-x-auto border-slate-700 bg-slate-900 p-4 text-slate-100">
          <h2 className="mb-3 font-semibold text-white">Lead ledger</h2>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="p-2">Partner</th><th className="p-2">Type / area</th><th className="p-2">Agent</th><th className="p-2">Stage</th><th className="p-2">Checklist</th><th className="p-2">Days open</th><th className="p-2">Launched</th></tr>
            </thead>
            <tbody>{filtered.map(lead => {
              const checklist = checklists.filter(item => item.lead_id === lead.id);
              return <tr key={lead.id} onClick={() => { setSelectedId(lead.id); setTab('pipeline'); }} className="cursor-pointer border-t border-slate-800 hover:bg-slate-800/50">
                <td className="p-2"><span className="block font-medium text-white">{lead.business_name}</span><span className="text-xs text-slate-500">{lead.owner_name} · {lead.phone}</span></td>
                <td className="p-2">{typeLabel(lead.vendor_type)}<span className="block text-xs text-slate-500">{lead.area}</span></td>
                <td className="p-2">{lead.agent}</td><td className="p-2">{stageLabel(lead.stage)}</td>
                <td className="p-2">{progressFor(checklist)}%</td><td className="p-2">{daysBetween(lead.first_call_at, lead.launched_at)}d</td>
                <td className="p-2">{formatDate(lead.launched_at)}</td>
              </tr>;
            })}</tbody>
          </table>
          {!filtered.length && <p className="p-6 text-center text-sm text-slate-500">No leads match the current filters.</p>}
        </Card>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div><h2 className="text-lg font-semibold text-white">Agent scorecard</h2><p className="text-xs text-slate-400">Based on saved onboarding records; no unrecorded order volume or quality ratings are estimated.</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {agentStats.map(stat => <Card key={stat.agent} className="border-slate-700 bg-slate-900 p-4 text-slate-100">
              <h3 className="font-semibold text-white">{stat.agent}</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xl font-semibold text-emerald-300">{stat.assigned}</div><div className="text-xs text-slate-500">Leads added</div></div>
                <div><div className="text-xl font-semibold text-white">{stat.live}</div><div className="text-xs text-slate-500">Live</div></div>
                <div className="col-span-2"><div className="font-medium text-white">{stat.avgDays === null ? '—' : `${stat.avgDays} days`}</div><div className="text-xs text-slate-500">Average call-to-launch (live leads)</div></div>
              </div>
            </Card>)}
            {!agentStats.length && <Card className="border-slate-800 bg-slate-900 p-5 text-sm text-slate-500">Agent metrics will appear when leads are assigned.</Card>}
          </div>
        </section>
      </>}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <Card className="flex items-center gap-3 border-slate-800 bg-slate-900 p-4 text-slate-100">
    <span className="rounded-lg bg-emerald-950 p-2 text-emerald-300">{icon}</span>
    <span><span className="block text-xl font-semibold text-white">{value}</span><span className="text-xs text-slate-400">{label}</span></span>
  </Card>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`border-b-2 px-3 py-2 text-sm font-medium ${active ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-slate-400 hover:text-slate-100'}`}>{children}</button>;
}
