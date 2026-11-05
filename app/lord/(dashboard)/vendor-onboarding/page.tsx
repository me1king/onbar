'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
type OnboardingMode = 'admin_assisted' | 'shared' | 'merchant_self_serve';
type OnboardingStep = 'business' | 'contact_area' | 'operations' | 'goods_docs';
type StepOwners = Record<OnboardingStep, 'admin' | 'merchant'>;
const onboardingSteps: Array<{ id: OnboardingStep; label: string }> = [
  { id: 'business', label: 'Business details' },
  { id: 'contact_area', label: 'Outlet location & contact' },
  { id: 'operations', label: 'Hours & operations' },
  { id: 'goods_docs', label: 'Catalogue & documents' }
];
const modeOwners: Record<OnboardingMode, StepOwners> = {
  admin_assisted: { business: 'admin', contact_area: 'admin', operations: 'admin', goods_docs: 'admin' },
  shared: { business: 'admin', contact_area: 'admin', operations: 'merchant', goods_docs: 'merchant' },
  merchant_self_serve: { business: 'merchant', contact_area: 'merchant', operations: 'merchant', goods_docs: 'merchant' }
};

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
  launched_at: string | null;
  invite_expires_at?: string | null;
  invite_used_at?: string | null;
  invite_application_id?: string | null;
  onboarding_mode?: OnboardingMode;
  onboarding_step_owners?: StepOwners;
  created_at: string;
}

interface OnboardingDraftStatus {
  lead_id: string;
  current_step: number;
  updated_at: string;
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
const applicationStageLabel = (stage: string) => ({
  business: 'Business identity',
  contact_area: 'Contact & area',
  operations: 'Operations',
  goods_docs: 'Goods & documents'
}[stage] || stage);

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
  const [draftStatuses, setDraftStatuses] = useState<OnboardingDraftStatus[]>([]);
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
  const [sharedDraftsReady, setSharedDraftsReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteHref, setInviteHref] = useState('');
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode>('shared');
  const [stepOwners, setStepOwners] = useState<StepOwners>(modeOwners.shared);
  const selectedLead = leads.find(lead => lead.id === selectedId) || null;

  const loadPipeline = useCallback(async (keepSelection = true) => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestJson('/api/admin/vendor-onboarding') as {
        leads: Lead[];
        checklist: ChecklistItem[];
        drafts: OnboardingDraftStatus[];
        sharedDraftsReady: boolean;
      };
      setLeads(result.leads);
      setChecklists(result.checklist);
      setDraftStatuses(result.drafts || []);
      setSharedDraftsReady(result.sharedDraftsReady === true);
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
        draft: OnboardingDraftStatus | null;
        sharedDraftsReady: boolean;
      };
      setDetailChecklist(result.checklist);
      setEvents(result.events);
      setSharedDraftsReady(result.sharedDraftsReady === true);
      setDraftStatuses(current => [
        ...current.filter(item => item.lead_id !== id),
        ...(result.draft ? [{ ...result.draft, lead_id: id }] : [])
      ]);
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

  useEffect(() => {
    if (!selectedLead) return;
    const mode = selectedLead.onboarding_mode || 'merchant_self_serve';
    setOnboardingMode(mode);
    setStepOwners(selectedLead.onboarding_step_owners || modeOwners[mode]);
  }, [selectedId, selectedLead]);

  const journeyStats = useMemo(() => {
    const journeyEvents = events.filter(event =>
      event.event_type.startsWith('onboarding_')
      && typeof event.details.session_id === 'string'
    );
    const sessionId = journeyEvents[0]?.details.session_id;
    if (typeof sessionId !== 'string') return null;
    const sessionEvents = journeyEvents.filter(event => event.details.session_id === sessionId);
    const stageNames = [
      { id: 'business', label: 'Business identity' },
      { id: 'contact_area', label: 'Contact & area' },
      { id: 'operations', label: 'Operations' },
      { id: 'goods_docs', label: 'Goods & documents' }
    ];
    const durations = stageNames.map(stage => {
      const values = sessionEvents
        .filter(event => event.event_type === 'onboarding_stage_exited'
          && event.details.stage === stage.id
          && typeof event.details.duration_ms === 'number')
        .map(event => Number(event.details.duration_ms));
      return {
        ...stage,
        visits: values.length,
        averageMs: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
        rageClicks: sessionEvents.filter(event => event.event_type === 'onboarding_rage_click' && event.details.stage === stage.id).length
      };
    });
    const latestStageEntry = sessionEvents.find(event => event.event_type === 'onboarding_stage_entered');
    const completed = sessionEvents.some(event => event.event_type === 'onboarding_application_submitted');
    const mostRepeatedClicks = [...durations].sort((first, second) => second.rageClicks - first.rageClicks)[0];
    const longestStage = [...durations]
      .filter(stage => stage.averageMs !== null)
      .sort((first, second) => (second.averageMs || 0) - (first.averageMs || 0))[0];
    return {
      durations,
      rageClicks: sessionEvents.filter(event => event.event_type === 'onboarding_rage_click').length,
      improvementSignal: mostRepeatedClicks?.rageClicks
        ? `Review ${mostRepeatedClicks.label} first; it had the most repeated-click signals.`
        : longestStage
          ? `Review ${longestStage.label} first; it had the longest average completion time.`
          : 'More completed step visits are needed before we can identify a friction point.',
      latestStage: typeof latestStageEntry?.details.stage === 'string'
        ? stageNames.find(stage => stage.id === latestStageEntry.details.stage)?.label || String(latestStageEntry.details.stage)
        : 'Unknown',
      completed
    };
  }, [events]);
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

  const saveWorkflow = () => {
    if (!selectedId) return;
    if (!sharedDraftsReady) {
      setError('Apply MERCHANT_ONBOARDING_SHARED_DRAFTS_MIGRATION.sql after the vendor pipeline and invite migrations before configuring this workflow.');
      return;
    }
    void saveAction({
      action: 'configure_workflow',
      onboarding_mode: onboardingMode,
      onboarding_step_owners: stepOwners
    }, 'Onboarding mode and step owners saved.');
  };

  const createInvite = async (): Promise<string | null> => {
    if (!selectedLead || selectedLead.vendor_type === 'rider' || selectedLead.stage === 'live' || selectedLead.invite_application_id) return null;
    if (!sharedDraftsReady) {
      setError('Apply MERCHANT_ONBOARDING_SHARED_DRAFTS_MIGRATION.sql after the vendor pipeline and invite migrations before creating a shared onboarding link.');
      return null;
    }
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      await requestJson('/api/admin/vendor-onboarding', {
        method: 'PATCH',
        body: JSON.stringify({
          id: selectedLead.id,
          action: 'configure_workflow',
          onboarding_mode: onboardingMode,
          onboarding_step_owners: stepOwners
        })
      });
      const result = await requestJson('/api/admin/vendor-onboarding', {
        method: 'PATCH',
        body: JSON.stringify({ id: selectedLead.id, action: 'issue_invite' })
      }) as { token: string };
      const link = new URL('/merchant/onboarding', window.location.origin);
      link.searchParams.set('invite', result.token);
      setInviteHref(link.toString());
      setNotice(`A private 7-day Online Bar onboarding link was created for ${selectedLead.business_name}.`);
      await loadPipeline();
      await loadDetail(selectedLead.id);
      return link.toString();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Could not create the company onboarding link.');
      return null;
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

  const copySpecificOnboardingLink = async () => {
    const link = inviteHref || await createInvite();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setNotice(`Specific onboarding link copied for ${selectedLead?.business_name || 'this vendor'}.`);
    } catch (copyError) {
      console.error('[VendorOnboarding] Could not copy specific onboarding link:', copyError);
      setError('The link was created, but could not be copied. Select and copy it from the link box below.');
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

  const modeNames: Record<OnboardingMode, string> = {
    admin_assisted: 'OnBar prepares the application; you review and submit it.',
    shared: 'OnBar and your team will complete the assigned sections together.',
    merchant_self_serve: 'Complete the application yourself using the secure link.'
  };
  const messageHref = selectedLead
    ? `https://wa.me/${(selectedLead.whatsapp || selectedLead.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${selectedLead.owner_name}, here is the private Online Bar onboarding link for ${selectedLead.business_name}: ${inviteHref || 'Please contact our team to request your link.'} ${modeNames[onboardingMode]} You can save progress and return using this link. It expires after 7 days. Submitting an application does not activate the store; our team will review it and tell you the next steps.`)}`
    : '';
  const next = selectedLead ? nextStage(selectedLead.stage) : null;
  const stageBlocked = selectedLead?.stage === 'phone_approved' && !selectedLead.visit_scheduled_at;
  const selectedDraft = selectedLead
    ? draftStatuses.find(draft => draft.lead_id === selectedLead.id)
    : null;

  return (
    <div className="min-h-full space-y-6 bg-[#f8f6f1] p-4 text-slate-900 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-emerald-800">
            <ClipboardCheck className="h-4 w-4" /> Partner operations
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Vendor launch pipeline</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
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

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
        Launch requires one authorized admin to record a passed real test order. No second-person review is required.
      </div>
      {!loading && !sharedDraftsReady && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          Shared onboarding is not installed yet. Apply <strong>VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql</strong>, then <strong>ONBOARDING_INVITES_MIGRATION.sql</strong>, then <strong>MERCHANT_ONBOARDING_SHARED_DRAFTS_MIGRATION.sql</strong> in Supabase to enable saved drafts and work ownership. Existing pipeline records remain available.
        </div>
      )}

      {showAdd && <Card className="border-slate-200 bg-white p-5 text-slate-800 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">{bulkMode ? 'Add a batch of leads' : 'Add a lead'}</h2>
            <p className="mt-1 text-xs text-slate-600">This saves internal records only. No SMS or WhatsApp message is sent.</p>
          </div>
          <button type="button" className="text-sm font-semibold text-emerald-800 hover:text-emerald-950" onClick={() => setBulkMode(value => !value)}>
            Switch to {bulkMode ? 'single lead' : 'bulk entry'}
          </button>
        </div>
        <form onSubmit={submitLead} className="space-y-4">
          {bulkMode ? <>
            <label className="block text-sm text-slate-700">
              One lead per line: business name, owner, phone, area, type. Separate columns with commas, tabs, or |.
              <textarea
                required
                value={bulkText}
                onChange={event => setBulkText(event.target.value)}
                rows={5}
                placeholder={'The Corner Shop, Amina, +254700000000, Westlands, retailer\nFresh Bites | Peter | +254711111111 | Kilimani | street_food'}
                className="mt-2 w-full rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400"
              />
            </label>
            <Input placeholder="Assigned agent (optional)" value={form.agent} onChange={event => setForm(current => ({ ...current, agent: event.target.value }))} className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400" />
          </> : <>
            <div className="grid gap-3 md:grid-cols-3">
              <Input required placeholder="Business / rider name" value={form.business_name} onChange={event => setForm(current => ({ ...current, business_name: event.target.value }))} className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400" />
              <Input required placeholder="Owner / contact name" value={form.owner_name} onChange={event => setForm(current => ({ ...current, owner_name: event.target.value }))} className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400" />
              <Input required type="tel" placeholder="Phone" value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400" />
              <Input placeholder="WhatsApp number (optional)" value={form.whatsapp} onChange={event => setForm(current => ({ ...current, whatsapp: event.target.value }))} className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400" />
              <Input required placeholder="Area / town" value={form.area} onChange={event => setForm(current => ({ ...current, area: event.target.value }))} className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400" />
              <select value={form.vendor_type} onChange={event => setForm(current => ({ ...current, vendor_type: event.target.value as VendorType }))} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
                {types.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
              <Input placeholder="Assigned agent (optional)" value={form.agent} onChange={event => setForm(current => ({ ...current, agent: event.target.value }))} className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400" />
              <Input placeholder="Lead source (optional)" value={form.source || ''} onChange={event => setForm(current => ({ ...current, source: event.target.value }))} className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400" />
              <Input placeholder="Notes (optional)" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400" />
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

      <div className="flex gap-2 border-b border-slate-200">
        <TabButton active={tab === 'pipeline'} onClick={() => setTab('pipeline')}>Pipeline</TabButton>
        <TabButton active={tab === 'ledger'} onClick={() => setTab('ledger')}>Ledger & agent scorecard</TabButton>
      </div>

      {tab === 'pipeline' ? <>
        <div className="flex flex-wrap gap-3">
          <label className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, phone, area…" className="border-slate-300 bg-white text-slate-900 pl-9 placeholder:text-slate-400" />
          </label>
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
            <option value="">All partner types</option>
            {types.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
          <select value={agentFilter} onChange={event => setAgentFilter(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
            <option value="">All agents</option>
            {agents.map(agent => <option key={agent} value={agent}>{agent}</option>)}
          </select>
        </div>
        {loading ? <div className="py-12 text-center text-sm text-slate-600">Loading pipeline…</div> : <div className="grid gap-3 xl:grid-cols-6">
          {stages.map(stage => {
            const stageLeads = filtered.filter(lead => lead.stage === stage.id);
            return <section key={stage.id} className="min-w-0 rounded-xl border border-slate-200 bg-[#f1f4f0] p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-800">{stage.label}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 shadow-sm">{stageLeads.length}</span>
              </div>
              <div className="space-y-2">
                {stageLeads.map(lead => {
                  const checklist = checklists.filter(item => item.lead_id === lead.id);
                  const percent = progressFor(checklist);
                  const age = daysBetween(lead.first_call_at, null);
                  return <button key={lead.id} type="button" onClick={() => setSelectedId(lead.id)}
                    className={`w-full rounded-lg border p-3 text-left transition hover:border-emerald-500 ${selectedId === lead.id ? 'border-emerald-600 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:bg-emerald-50/50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-semibold text-slate-900">{lead.business_name}</span>
                      {age > 7 && lead.stage !== 'live' && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">Stuck</span>}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
                      {lead.vendor_type === 'rider' ? <Truck className="h-3.5 w-3.5" /> : lead.vendor_type === 'street_food' ? <Utensils className="h-3.5 w-3.5" /> : <Wine className="h-3.5 w-3.5" />}
                      {typeLabel(lead.vendor_type)} · {lead.area}
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                      <span>{lead.agent}</span><span>{percent}% checklist</span>
                    </div>
                    {lead.vendor_type !== 'rider' && <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      {lead.invite_used_at || lead.invite_application_id ? 'Link completed' : lead.invite_expires_at && new Date(lead.invite_expires_at).getTime() > Date.now() ? 'Link ready' : 'Create private link'}
                    </p>}
                  </button>;
                })}
                {!stageLeads.length && <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-4 text-center text-xs text-slate-500">No leads</div>}
              </div>
            </section>;
          })}
        </div>}
        {selectedLead && <Card className="border-slate-200 bg-white p-5 text-slate-800 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-800">{typeLabel(selectedLead.vendor_type)} · {stageLabel(selectedLead.stage)}</div>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">{selectedLead.business_name}</h2>
              <p className="mt-1 text-sm text-slate-600">{selectedLead.owner_name} · {selectedLead.phone} · {selectedLead.area}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={`tel:${selectedLead.phone}`} className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">Call</a>
              {selectedLead.vendor_type !== 'rider' && selectedLead.stage !== 'live' && !selectedLead.invite_application_id && (
                <Button type="button" disabled={working || !sharedDraftsReady} onClick={() => void createInvite()} className="h-9 bg-emerald-700 px-3 text-sm text-white hover:bg-emerald-800">
                  <Link2 className="mr-2 h-4 w-4" /> {selectedLead.invite_expires_at && new Date(selectedLead.invite_expires_at).getTime() > Date.now() ? 'Reissue private link' : 'Create private link'}
                </Button>
              )}
              {inviteHref && <a href={messageHref} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">Open WhatsApp</a>}
              {selectedLead.vendor_type !== 'rider' && selectedLead.stage !== 'live' && !selectedLead.invite_application_id && (
                <Button type="button" variant="outline" disabled={working || !sharedDraftsReady} onClick={() => void copySpecificOnboardingLink()} className="h-9 border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
                  <Copy className="mr-2 h-4 w-4" /> {inviteHref ? 'Copy onboarding link' : 'Create & copy link'}
                </Button>
              )}
              <button onClick={() => setSelectedId(null)} className="rounded-md border border-slate-300 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900" aria-label="Close lead detail"><X className="h-4 w-4" /></button>
            </div>
          </div>
          {inviteHref && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold text-emerald-900">Private Online Bar link for {selectedLead.business_name} · expires in 7 days · one application</p>
              <p className="mt-1 text-xs text-emerald-800">Use this same link to prepare the shared draft, then send it to the merchant to continue or review.</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input readOnly value={inviteHref} aria-label={`Private onboarding link for ${selectedLead.business_name}`}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800" />
                <a href={inviteHref} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
                  Open shared form
                </a>
                <Button type="button" variant="outline" onClick={() => void copyInvite()} className="h-9 border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
                  <Copy className="mr-2 h-4 w-4" /> Copy link
                </Button>
              </div>
            </div>
          )}
          {selectedLead.vendor_type !== 'rider' && (
            <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-slate-900">Who completes onboarding?</h3>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
                    Progress saves securely as the invited form is completed. Admin-assisted means your team prepares it; the merchant must still review, accept the privacy notice, and submit. No mode activates a store automatically.
                  </p>
                </div>
                {selectedDraft && (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                    Draft saved · step {selectedDraft.current_step + 1} of 4 · {formatDate(selectedDraft.updated_at)}
                  </span>
                )}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <label className="block space-y-1 text-sm font-semibold text-slate-800">
                  <span>Onboarding mode</span>
                  <select
                    value={onboardingMode}
                    disabled={working || !sharedDraftsReady || Boolean(selectedLead.invite_application_id)}
                    onChange={event => {
                      const mode = event.target.value as OnboardingMode;
                      setOnboardingMode(mode);
                      setStepOwners(modeOwners[mode]);
                    }}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  >
                    <option value="admin_assisted">We prepare it; merchant reviews and submits</option>
                    <option value="shared">We start; merchant finishes assigned steps</option>
                    <option value="merchant_self_serve">Merchant completes it themselves</option>
                  </select>
                </label>
                <Button type="button" variant="outline" disabled={working || !sharedDraftsReady || Boolean(selectedLead.invite_application_id)} onClick={saveWorkflow} className="self-end border-slate-300 text-slate-700">
                  Save workflow
                </Button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {onboardingSteps.map(step => (
                  <label key={step.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700">
                    <span>{step.label}</span>
                    <select
                      aria-label={`Who completes ${step.label}`}
                      value={stepOwners[step.id]}
                      disabled={working || !sharedDraftsReady || Boolean(selectedLead.invite_application_id)}
                      onChange={event => setStepOwners(current => ({
                        ...current,
                        [step.id]: event.target.value as 'admin' | 'merchant'
                      }))}
                      className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
                    >
                      <option value="admin">OnBar team</option>
                      <option value="merchant">Merchant</option>
                    </select>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                If Catalogue &amp; documents is assigned to OnBar, your team can choose the goods and enter each proposed merchant selling price. Customer-facing catalogue prices are managed separately in the <Link href="/lord/upload" className="font-bold text-primary underline">product catalogue</Link>; submitted offers still require merchant review and approval before activation.
              </p>
              {selectedLead.invite_application_id && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <strong>Application submitted.</strong> It is not automatically live. Review the application and documents in Merchant Onboarding; only verified applications can be approved.
                  <Link href="/lord/merchants" className="ml-1 font-bold underline">Open applications</Link>
                </div>
              )}
            </section>
          )}
          <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-slate-900">Applicant onboarding experience</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">Opt-in analytics show time per step and repeated clicks. Typed values and document contents are never recorded.</p>
              </div>
              {journeyStats && <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">{journeyStats.completed ? 'Application submitted' : `Last active step: ${journeyStats.latestStage}`}</span>}
            </div>
            {journeyStats ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {journeyStats.durations.map(stage => (
                    <div key={stage.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold text-slate-800">{stage.label}</p>
                      <p className="mt-2 text-sm font-bold text-slate-950">
                        {stage.averageMs === null ? '—' : stage.averageMs < 60_000
                          ? `${Math.max(1, Math.round(stage.averageMs / 1000))} sec`
                          : `${Math.round(stage.averageMs / 60_000)} min`}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">{stage.visits} completed visit(s) · {stage.rageClicks} repeated-click signal(s)</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-700">Repeated-click signals: {journeyStats.rageClicks}</p>
                <p className="mt-2 rounded-lg bg-white p-3 text-xs leading-5 text-slate-700"><strong>Suggested review:</strong> {journeyStats.improvementSignal}</p>
              </>
            ) : (
              <p className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600">
                No opt-in journey data yet. Applicants only share timing and repeated-click counts when they choose the optional analytics checkbox on their private onboarding link.
              </p>
            )}
          </section>
          <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-slate-900">Field visit checklist</h3>
                <span className="text-xs text-slate-600">{progressFor(detailChecklist)}% complete</span>
              </div>
              <div className="mt-3 space-y-2">
                {detailChecklist.map(item => <label key={item.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <input type="checkbox" checked={item.is_complete} disabled={working || selectedLead.stage !== 'visit_booked'}
                    onChange={event => void saveAction({ action: 'checklist', item_key: item.item_key, is_complete: event.target.checked }, 'Checklist updated.')}
                    className="mt-0.5 h-4 w-4 accent-emerald-500" />
                  <span className={item.is_complete ? 'text-slate-500 line-through' : 'text-slate-700'}>
                    {item.label}{item.is_required && <span className="ml-1 text-rose-600">*</span>}
                    {item.is_complete && item.completed_by && <span className="mt-1 block text-[11px] text-slate-500">Verified by {item.completed_by}</span>}
                  </span>
                </label>)}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" disabled={working || selectedLead.stage !== 'visit_booked'} onClick={recordCheckin}>
                  <MapPin className="mr-2 h-4 w-4" /> {selectedLead.check_in_at ? 'Record another check-in' : 'GPS check-in'}
                </Button>
                {selectedLead.check_in_at && <span className="self-center text-xs text-slate-600">
                  Checked in {formatDate(selectedLead.check_in_at)} · {selectedLead.check_in_lat}, {selectedLead.check_in_lng}
                </span>}
              </div>
              <p className="mt-2 text-xs text-slate-500">GPS is recorded only when an agent taps check-in during a booked visit.</p>
            </section>
            <section className="space-y-5">
              {selectedLead.stage === 'phone_approved' && <div>
                <h3 className="font-medium text-slate-900">Schedule the field visit</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="datetime-local"
                    min={formatDateTimeLocal(new Date().toISOString())}
                    value={visitDraft}
                    onChange={event => setVisitDraft(event.target.value)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
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
              {selectedLead.visit_scheduled_at && <div className="text-sm text-slate-700">
                Scheduled visit: <span className="font-medium text-slate-950">{new Date(selectedLead.visit_scheduled_at).toLocaleString()}</span>
              </div>}
              <div>
                <h3 className="font-medium text-slate-900">Launch gates</h3>
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={selectedLead.test_order_passed} disabled={working || selectedLead.stage !== 'test_order'}
                    onChange={event => void saveAction({ action: 'launch_check', check: 'test_order', passed: event.target.checked }, 'Test-order result updated.')}
                    className="h-4 w-4 accent-emerald-500" />
                  Test order accepted (record only after a real test)
                </label>
                <p className="mt-2 text-xs text-slate-500">One authorized admin can record the real test order and move the business live. This tracker does not create test orders or activate merchant accounts.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-medium text-slate-900">Agent & notes</h3>
                <div className="mt-3 space-y-2">
                  <Input value={agentDraft} onChange={event => setAgentDraft(event.target.value)} maxLength={160} aria-label="Assigned agent" className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400" />
                  <textarea value={notesDraft} onChange={event => setNotesDraft(event.target.value)} rows={3} maxLength={2000} placeholder="Call notes, visit details…"
                    className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900 placeholder:text-slate-400" />
                  <Button size="sm" variant="outline" disabled={working || !agentDraft.trim()} onClick={() => void saveAction({ action: 'edit', agent: agentDraft, notes: notesDraft }, 'Lead notes saved.')} className="border-slate-300 bg-white text-slate-700 hover:bg-slate-100">Save details</Button>
                </div>
              </div>
              <div>
                <Button disabled={working || !next || stageBlocked} onClick={() => {
                  if (next) void saveAction({ action: 'advance', stage: next }, `Moved to ${stageLabel(next)}.`);
                }}>
                  {next ? <>Move to {stageLabel(next)} <ArrowRight className="ml-2 h-4 w-4" /></> : <><Check className="mr-2 h-4 w-4" /> Live</>}
                </Button>
                <p className="mt-2 text-xs text-slate-500">Stage changes are sequential. A visit time, completed visit, and passed test order remain required; no second-person confirmation is needed.</p>
              </div>
            </section>
          </div>
          <section className="mt-6 border-t border-slate-200 pt-4">
            <h3 className="font-medium text-slate-900">Activity history</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {events.map(event => <div key={event.id} className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                <div className="flex justify-between gap-3 text-slate-700"><span>{event.event_type.replaceAll('_', ' ')}</span><span>{formatDate(event.created_at)}</span></div>
                <div className="mt-1 text-slate-500">
                  {event.actor}
                  {typeof event.details.stage === 'string' ? ` · ${event.event_type.startsWith('onboarding_') ? applicationStageLabel(event.details.stage) : stageLabel(event.details.stage as Stage)}` : ''}
                  {typeof event.details.duration_ms === 'number' ? ` · ${Math.max(1, Math.round(event.details.duration_ms / 1000))} sec` : ''}
                  {typeof event.details.control_type === 'string' ? ` · repeated ${event.details.control_type} clicks` : ''}
                </div>
              </div>)}
              {!events.length && <p className="text-xs text-slate-500">No activity recorded yet.</p>}
            </div>
          </section>
        </Card>}
      </> : <>
        <Card className="overflow-x-auto border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-950">Lead ledger</h2>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="p-2">Partner</th><th className="p-2">Type / area</th><th className="p-2">Agent</th><th className="p-2">Stage</th><th className="p-2">Checklist</th><th className="p-2">Days open</th><th className="p-2">Launched</th></tr>
            </thead>
            <tbody>{filtered.map(lead => {
              const checklist = checklists.filter(item => item.lead_id === lead.id);
              return <tr key={lead.id} onClick={() => { setSelectedId(lead.id); setTab('pipeline'); }} className="cursor-pointer border-t border-slate-200 hover:bg-emerald-50">
                <td className="p-2"><span className="block font-medium text-slate-900">{lead.business_name}</span><span className="text-xs text-slate-500">{lead.owner_name} · {lead.phone}</span></td>
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
            <div><h2 className="text-lg font-semibold text-slate-900">Agent scorecard</h2><p className="text-xs text-slate-600">Based on saved onboarding records; no unrecorded order volume or quality ratings are estimated.</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {agentStats.map(stat => <Card key={stat.agent} className="border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
              <h3 className="font-semibold text-slate-900">{stat.agent}</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xl font-semibold text-emerald-800">{stat.assigned}</div><div className="text-xs text-slate-500">Leads added</div></div>
                <div><div className="text-xl font-semibold text-slate-900">{stat.live}</div><div className="text-xs text-slate-500">Live</div></div>
                <div className="col-span-2"><div className="font-medium text-slate-900">{stat.avgDays === null ? '—' : `${stat.avgDays} days`}</div><div className="text-xs text-slate-500">Average call-to-launch (live leads)</div></div>
              </div>
            </Card>)}
            {!agentStats.length && <Card className="border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">Agent metrics will appear when leads are assigned.</Card>}
          </div>
        </section>
      </>}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <Card className="flex items-center gap-3 border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
    <span className="rounded-lg bg-emerald-100 p-2 text-emerald-800">{icon}</span>
    <span><span className="block text-xl font-semibold text-slate-950">{value}</span><span className="text-xs text-slate-600">{label}</span></span>
  </Card>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`border-b-2 px-3 py-2 text-sm font-medium ${active ? 'border-emerald-700 text-emerald-900' : 'border-transparent text-slate-600 hover:text-slate-950'}`}>{children}</button>;
}
