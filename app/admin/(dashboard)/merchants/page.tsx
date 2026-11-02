'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Store,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getMissingMerchantDocumentTypes, isFoodBusinessType, merchantBusinessTypes, type MerchantApplicationDocument, type MerchantApplicationStatus, type MerchantBusinessType } from '@/lib/merchantApplications';

interface Requirement {
  id: string;
  business_type: string;
  county: string;
  document_type: string;
  label: string;
  is_required: boolean;
  is_active: boolean;
}
interface ExpiringDocument {
  applicationId: string;
  merchantCode: string | null;
  businessName: string;
  businessType: string;
  county: string;
  town: string;
  documentId: string;
  documentType: string;
  documentName: string;
  expiresAt: string;
  expired: boolean;
}

interface Application {
  id: string;
  merchant_code: string | null;
  business_name: string;
  trading_name: string | null;
  business_type: MerchantBusinessType;
  email: string;
  phone: string;
  owner_name: string;
  owner_role: string;
  address: string;
  country: string;
  county: string;
  town: string;
  operating_areas: string[];
  operating_hours?: Record<string, string>;
  cuisine_or_category?: string | null;
  preparation_capacity?: number | null;
  delivery_radius_km?: number | null;
  collection_available?: boolean;
  offered_goods?: string[];
  offered_goods_pricing?: Array<{ product_id: number; product_name: string; price: number; currency: string }>;
  documents?: MerchantApplicationDocument[];
  documents_deferred?: boolean;
  requiredDocuments?: string[];
  status: MerchantApplicationStatus;
  review_note?: string | null;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

interface ApplicationEvent {
  id: number;
  event_type: string;
  actor: string;
  details: Record<string, unknown>;
  created_at: string;
}

const labels: Record<string, string> = {
  bar: 'Bar / venue',
  kitchen: 'Kitchen',
  restaurant: 'Restaurant',
  food_vendor: 'Food vendor',
  supplier: 'Supplier',
  delivery_partner: 'Delivery partner',
  business_registration: 'Business registration',
  county_license: 'County licence',
  liquor_licence: 'Alcohol retail licence',
  wholesale_licence: 'Alcohol wholesale licence',
  food_hygiene: 'Food hygiene',
  tax_document: 'Tax / business info',
  premises_document: 'Premises documentation',
  other_permit: 'Other permit',
  submitted: 'Submitted',
  under_review: 'Under review',
  information_requested: 'More information required',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
  expired: 'Expired',
  availability_updated: 'Availability updated'
};

function statusClass(status: MerchantApplicationStatus) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-800';
  if (status === 'rejected' || status === 'suspended' || status === 'expired') return 'bg-rose-100 text-rose-800';
  if (status === 'information_requested') return 'bg-amber-100 text-amber-800';
  return 'bg-sky-100 text-sky-800';
}

function requiredDocs(application: Application) {
  if (application.requiredDocuments) return application.requiredDocuments;
  return isFoodBusinessType(application.business_type)
    ? ['business_registration', 'county_license', 'food_hygiene']
    : ['business_registration', 'county_license'];
}

function missingRequiredDocs(application: Application) {
  return getMissingMerchantDocumentTypes(requiredDocs(application), application.documents || []);
}

export default function MerchantApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Application | null>(null);
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [requirementsLoading, setRequirementsLoading] = useState(false);
  const [expiries, setExpiries] = useState<ExpiringDocument[]>([]);
  const [newRequirement, setNewRequirement] = useState({
    businessType: '*',
    county: '*',
    documentType: 'other_permit',
    label: 'Other applicable permit',
    required: false,
    active: true
  });
  const [documentDeferralAllowed, setDocumentDeferralAllowed] = useState(false);
  const [documentPolicyLoading, setDocumentPolicyLoading] = useState(true);
  const [savingDocumentPolicy, setSavingDocumentPolicy] = useState(false);
  const [documentUploadUrl, setDocumentUploadUrl] = useState('');
  const [requestingDocumentLink, setRequestingDocumentLink] = useState(false);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/merchant-applications', { cache: 'no-store' });
      const result = await response.json() as { applications?: Application[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'Applications could not be loaded.');
      setApplications(result.applications || []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Applications could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setSelected(null);
    setDetailLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/merchant-applications?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const result = await response.json() as { application?: Application; events?: ApplicationEvent[]; error?: string };
      if (!response.ok || !result.application) throw new Error(result.error || 'Application detail could not be loaded.');
      setSelected(result.application);
      setEvents(result.events || []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Application detail could not be loaded.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void fetchApplications(); }, [fetchApplications]);

  const fetchDocumentPolicy = useCallback(async () => {
    setDocumentPolicyLoading(true);
    try {
      const response = await fetch('/api/admin/merchant-onboarding-controls', { cache: 'no-store' });
      const result = await response.json() as { controls?: { allow_document_deferral: boolean }; error?: string };
      if (!response.ok || !result.controls) throw new Error(result.error || 'Document upload policy could not be loaded.');
      setDocumentDeferralAllowed(result.controls.allow_document_deferral);
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : 'Document upload policy could not be loaded.');
    } finally {
      setDocumentPolicyLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocumentPolicy();
  }, [fetchDocumentPolicy]);

  useEffect(() => {
    fetch('/api/admin/merchant-applications?compliance=1', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json() as { documents?: ExpiringDocument[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Compliance expiry data could not be loaded.');
        setExpiries(payload.documents || []);
      })
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : 'Compliance expiry data could not be loaded.'));
  }, []);

  const updateDocumentPolicy = async (allowDocumentDeferral: boolean) => {
    setSavingDocumentPolicy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/merchant-onboarding-controls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowDocumentDeferral })
      });
      const result = await response.json() as { controls?: { allow_document_deferral: boolean }; error?: string };
      if (!response.ok || !result.controls) throw new Error(result.error || 'Document upload policy could not be saved.');
      setDocumentDeferralAllowed(result.controls.allow_document_deferral);
      setMessage(allowDocumentDeferral
        ? 'Applicants may now defer document uploads. Approval remains blocked until required documents are verified.'
        : 'Required document uploads are now enforced during application submission.');
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : 'Document upload policy could not be saved.');
    } finally {
      setSavingDocumentPolicy(false);
    }
  };

  const requestMissingDocuments = async () => {
    if (!selected) return;
    setRequestingDocumentLink(true);
    setDocumentUploadUrl('');
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/merchant-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_document_upload_link', id: selected.id })
      });
      const result = await response.json() as { url?: string; emailSent?: boolean; emailWarning?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || 'A secure document upload link could not be created.');
      setDocumentUploadUrl(result.url);
      setMessage(result.emailSent ? `Secure upload link emailed to ${selected.email}.` : result.emailWarning || 'Secure upload link created.');
      await fetchDetail(selected.id);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'A secure document upload link could not be created.');
    } finally {
      setRequestingDocumentLink(false);
    }
  };

  const filteredApplications = useMemo(() => {
    const term = search.trim().toLowerCase();
    return applications.filter(application => (!statusFilter || application.status === statusFilter) && (!term || [
      application.business_name,
      application.trading_name || '',
      application.email,
      application.phone,
      application.county,
      application.town,
      application.merchant_code || ''
    ].some(value => value.toLowerCase().includes(term))));
  }, [applications, search, statusFilter]);

  const openDocument = async (document: MerchantApplicationDocument) => {
    if (!selected) return;
    const newTab = window.open('about:blank', '_blank', 'noopener,noreferrer');
    if (!newTab) {
      setError('Allow pop-ups for this admin page to view private documents.');
      return;
    }
    try {
      const response = await fetch(`/api/admin/merchant-applications?id=${encodeURIComponent(selected.id)}&document=${encodeURIComponent(document.id)}`, { cache: 'no-store' });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || 'Document could not be opened.');
      newTab.location.href = result.url;
    } catch (openError) {
      newTab.close();
      setError(openError instanceof Error ? openError.message : 'Document could not be opened.');
    }
  };

  const changeStatus = async (status: MerchantApplicationStatus) => {
    if (!selected) return;
    if (status === 'approved') {
      const documents = selected.documents || [];
      const missing = requiredDocs(selected).filter(type => {
        const document = documents.find(candidate => candidate.type === type);
        return !document || (document.expiresAt !== null && document.expiresAt < new Date().toISOString().slice(0, 10));
      });
      if (missing.length) {
        setError(`Approval is blocked until required documents are present and current: ${missing.map(type => labels[type] || type).join(', ')}.`);
        return;
      }
    }
    if (['information_requested', 'rejected', 'suspended', 'expired'].includes(status) && note.trim().length < 5) {
      setError('Add a review note of at least 5 characters before this action.');
      return;
    }
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/merchant-applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, status, note })
      });
      const result = await response.json() as { application?: Application; error?: string };
      if (!response.ok || !result.application) throw new Error(result.error || 'Review decision could not be saved.');
      setMessage(`Application updated: ${labels[status]}.`);
      setNote('');
      await Promise.all([fetchApplications(), fetchDetail(selected.id)]);
      const complianceResponse = await fetch('/api/admin/merchant-applications?compliance=1', { cache: 'no-store' });
      const compliancePayload = await complianceResponse.json() as { documents?: ExpiringDocument[]; error?: string };
      if (!complianceResponse.ok) throw new Error(compliancePayload.error || 'Compliance expiry data could not be refreshed.');
      setExpiries(compliancePayload.documents || []);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Review decision could not be saved.');
    } finally {
      setWorking(false);
    }
  };

  const count = (status: MerchantApplicationStatus) => applications.filter(application => application.status === status).length;

  const fetchRequirements = async () => {
    setRequirementsLoading(true);
    try {
      const response = await fetch('/api/admin/merchant-document-requirements', { cache: 'no-store' });
      const payload = await response.json() as { requirements?: Requirement[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Document checklist configuration could not be loaded.');
      setRequirements(payload.requirements || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Document checklist configuration could not be loaded.');
    } finally {
      setRequirementsLoading(false);
    }
  };

  const updateRequirement = async (requirement: Requirement, patch: Partial<Pick<Requirement, 'is_required' | 'is_active'>>) => {
    setError(null);
    try {
      const response = await fetch('/api/admin/merchant-document-requirements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: requirement.id, ...patch })
      });
      const payload = await response.json() as { requirement?: Requirement; error?: string };
      if (!response.ok || !payload.requirement) throw new Error(payload.error || 'Checklist rule could not be updated.');
      setRequirements(current => current.map(item => item.id === requirement.id ? payload.requirement! : item));
      setMessage('Document checklist rule updated.');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Checklist rule could not be updated.');
    }
  };

  const addRequirement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch('/api/admin/merchant-document-requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRequirement)
      });
      const payload = await response.json() as { requirement?: Requirement; error?: string };
      if (!response.ok || !payload.requirement) throw new Error(payload.error || 'Checklist rule could not be created.');
      setRequirements(current => [...current, payload.requirement!].sort((left, right) =>
        `${left.county}:${left.business_type}:${left.document_type}`.localeCompare(`${right.county}:${right.business_type}:${right.document_type}`)
      ));
      setMessage('Document checklist rule created.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Checklist rule could not be created.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 text-left sm:p-8">
      <header className="mb-8 flex flex-col gap-5 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-primary">
            <Store size={15} /> Merchant network
          </p>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 sm:text-4xl">Onboarding & verification</h1>
          <p className="mt-2 text-sm text-slate-600">Review business documents, request information, and control activation.</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void fetchApplications()} disabled={loading} className="h-11 rounded-xl">
            <RefreshCcw size={15} className={`mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <a href="/lord/vendor-onboarding" className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase text-slate-700 hover:border-primary/40 hover:text-primary">
            Vendor pipeline
          </a>
          <a href="/merchant/onboarding" target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-xl bg-primary px-4 text-xs font-black uppercase text-white">
            Application link <ArrowUpRight size={15} className="ml-2" />
          </a>
        </div>
      </header>

      <Card className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-black uppercase text-amber-950">Compliance expiry watch</p>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-900">
            {expiries.filter(document => document.expired).length} expired · {expiries.filter(document => !document.expired).length} due within 30 days
          </span>
        </div>
        {expiries.length > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {expiries.slice(0, 20).map(document => (
              <button key={`${document.applicationId}:${document.documentId}`} onClick={() => void fetchDetail(document.applicationId)} className="rounded-xl border border-amber-200 bg-white p-3 text-left text-xs hover:bg-amber-100">
                <span className="font-black">{document.businessName}</span> · {labels[document.documentType] || document.documentName} · {document.expired ? <strong className="text-rose-700">EXPIRED</strong> : `expires ${document.expiresAt}`}<span className="block text-slate-500">{document.town}, {document.county}</span>
              </button>
            ))}
          </div>
        ) : <p className="mt-2 text-xs text-amber-900">No document expiry dates within the next 30 days are recorded.</p>}
      </Card>

      <Card className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Application document uploads</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            {documentDeferralAllowed
              ? 'Temporary deferral is on. Applicants can submit without documents; approval stays blocked until every required document is current and verified.'
              : 'Required documents must be uploaded before applicants can submit. You can turn on a temporary deferral when a merchant needs more time.'}
          </p>
        </div>
        <Button
          type="button"
          variant={documentDeferralAllowed ? 'outline' : 'default'}
          disabled={documentPolicyLoading || savingDocumentPolicy}
          onClick={() => void updateDocumentPolicy(!documentDeferralAllowed)}
          className="shrink-0 rounded-xl"
          aria-pressed={documentDeferralAllowed}
        >
          {savingDocumentPolicy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {documentPolicyLoading ? 'Loading policy...' : documentDeferralAllowed ? 'Turn deferral off' : 'Allow document deferral'}
        </Button>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'New', value: count('submitted'), Icon: Clock3 },
          { label: 'In review', value: count('under_review'), Icon: ShieldCheck },
          { label: 'Needs information', value: count('information_requested'), Icon: AlertCircle },
          { label: 'Approved', value: count('approved'), Icon: CheckCircle2 }
        ].map(({ label, value, Icon }) => (
          <Card key={label} className="rounded-2xl border-0 p-4 shadow-sm sm:p-5">
            <p className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
              <Icon size={15} /> {label}
            </p>
            <p className="mt-2 text-3xl font-black text-slate-900">{value}</p>
          </Card>
        ))}
      </div>

      {error && <div role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}
      {message && <div role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}

      <details className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" onToggle={event => { if (event.currentTarget.open && !requirements.length) void fetchRequirements(); }}>
        <summary className="cursor-pointer font-black uppercase text-slate-800">Configure document checklist by business type and county</summary>
        <div className="mt-5 space-y-5">
          <form onSubmit={addRequirement} className="grid gap-2 rounded-xl bg-slate-50 p-4 md:grid-cols-3">
            <select value={newRequirement.businessType} onChange={event => setNewRequirement(current => ({ ...current, businessType: event.target.value }))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="*">All business types</option>
              {merchantBusinessTypes.map(type => <option key={type} value={type}>{labels[type]}</option>)}
            </select>
            <Input value={newRequirement.county} onChange={event => setNewRequirement(current => ({ ...current, county: event.target.value }))} maxLength={100} placeholder="County name or *" className="h-10 rounded-lg" />
            <select value={newRequirement.documentType} onChange={event => setNewRequirement(current => ({ ...current, documentType: event.target.value }))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              {['business_registration', 'county_license', 'food_hygiene', 'tax_document', 'premises_document', 'other_permit'].map(type => <option key={type} value={type}>{labels[type]}</option>)}
            </select>
            <Input value={newRequirement.label} onChange={event => setNewRequirement(current => ({ ...current, label: event.target.value }))} maxLength={120} placeholder="Checklist label" className="h-10 rounded-lg md:col-span-2" />
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
              <label className="flex items-center gap-2"><input type="checkbox" checked={newRequirement.required} onChange={event => setNewRequirement(current => ({ ...current, required: event.target.checked }))} /> Required</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={newRequirement.active} onChange={event => setNewRequirement(current => ({ ...current, active: event.target.checked }))} /> Active</label>
              <Button className="ml-auto h-10 rounded-lg">Add rule</Button>
            </div>
          </form>
          {requirementsLoading && <p className="text-sm text-slate-500">Loading configured requirements...</p>}
          <div className="space-y-2">
            {requirements.map(requirement => (
              <div key={requirement.id} className="grid items-center gap-3 rounded-xl border border-slate-100 p-3 text-xs sm:grid-cols-[1fr_auto_auto]">
                <p className="font-bold text-slate-800">{requirement.label}<span className="ml-2 font-normal text-slate-500">{requirement.business_type === '*' ? 'All types' : labels[requirement.business_type]} · {requirement.county === '*' ? 'All counties' : requirement.county}</span></p>
                <label className="flex items-center gap-2"><input type="checkbox" checked={requirement.is_required} onChange={event => void updateRequirement(requirement, { is_required: event.target.checked })} /> Required</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={requirement.is_active} onChange={event => void updateRequirement(requirement, { is_active: event.target.checked })} /> Active</label>
              </div>
            ))}
            {!requirementsLoading && requirements.length === 0 && <p className="text-sm text-slate-500">No rules loaded yet.</p>}
          </div>
        </div>
      </details>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(440px,1.15fr)]">
        <Card className="overflow-hidden rounded-2xl border-0 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search business, location, contact..." className="h-11 rounded-xl" />
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
              <option value="">All statuses</option>
              {(['submitted', 'under_review', 'information_requested', 'approved', 'rejected', 'suspended', 'expired'] as MerchantApplicationStatus[]).map(status => (
                <option key={status} value={status}>{labels[status]}</option>
              ))}
            </select>
          </div>
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
            {loading && <div className="p-8 text-center text-sm text-slate-500"><Loader2 size={20} className="mx-auto mb-2 animate-spin" />Loading applications</div>}
            {!loading && filteredApplications.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No merchant applications found.</p>}
            {filteredApplications.map(application => (
              <div key={application.id} className={`flex items-center gap-3 p-4 transition hover:bg-slate-50 ${selectedId === application.id ? 'bg-primary/5' : ''}`}>
                <button onClick={() => void fetchDetail(application.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black text-slate-900">{application.business_name}</p>
                      <p className="mt-1 text-xs text-slate-500">{labels[application.business_type]} · {application.town}, {application.county}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{application.email}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusClass(application.status)}`}>{labels[application.status]}</span>
                  </div>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Submitted {new Date(application.submitted_at).toLocaleDateString()}</p>
                  {application.documents_deferred && <p className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black uppercase text-amber-900">Documents pending</p>}
                </button>
                <Link
                  href={`/lord/merchants/${encodeURIComponent(application.id)}`}
                  aria-label={`Open read-only store for ${application.business_name}`}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary"
                >
                  View store
                </Link>
              </div>
            ))}
          </div>
        </Card>

        <Card className="min-h-[500px] rounded-2xl border-0 p-5 shadow-sm sm:p-7">
          {!selectedId && <div className="flex h-full min-h-[440px] flex-col items-center justify-center text-center text-slate-400"><Store size={40} /><p className="mt-3 font-bold">Select an application to review</p></div>}
          {detailLoading && <div className="flex min-h-[440px] items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>}
          {!detailLoading && selected && (
            <div className="space-y-7">
              <section className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-primary">{selected.merchant_code || 'Application pending approval'}</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-900">{selected.business_name}</h2>
                  {selected.trading_name && <p className="text-sm text-slate-500">Trading as {selected.trading_name}</p>}
                </div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-black uppercase ${statusClass(selected.status)}`}>{labels[selected.status]}</span>
              </section>

              <section className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <p><span className="font-bold text-slate-500">Type:</span> {labels[selected.business_type]}</p>
                <p><span className="font-bold text-slate-500">Responsible:</span> {selected.owner_name} ({selected.owner_role})</p>
                <p><span className="font-bold text-slate-500">Email:</span> {selected.email}</p>
                <p><span className="font-bold text-slate-500">Phone:</span> {selected.phone}</p>
                <p><span className="font-bold text-slate-500">Location:</span> {selected.address}, {selected.town}, {selected.county}</p>
                <p><span className="font-bold text-slate-500">Areas:</span> {(selected.operating_areas || []).join(', ') || 'Not provided'}</p>
                {selected.cuisine_or_category && <p><span className="font-bold text-slate-500">Category:</span> {selected.cuisine_or_category}</p>}
                {selected.preparation_capacity && <p><span className="font-bold text-slate-500">Daily capacity:</span> {selected.preparation_capacity}</p>}
                {selected.delivery_radius_km && <p><span className="font-bold text-slate-500">Delivery radius:</span> {selected.delivery_radius_km} km</p>}
                <p><span className="font-bold text-slate-500">Collection:</span> {selected.collection_available ? 'Available' : 'Not listed'}</p>
              </section>

              <section className="rounded-2xl border border-slate-200 p-4">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Goods and proposed offer prices</h3>
                {selected.offered_goods_pricing?.length ? (
                  <ul className="mt-3 space-y-2">
                    {selected.offered_goods_pricing.map(good => (
                      <li key={good.product_id} className="flex items-center justify-between gap-3 rounded-xl bg-primary/5 px-3 py-2 text-sm">
                        <span className="font-semibold text-slate-800">{good.product_name}</span>
                        <span className="shrink-0 font-black text-primary">{good.currency} {Number(good.price).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">{selected.offered_goods?.length ? `${selected.offered_goods.join(', ')} · No proposed prices recorded.` : 'No goods were selected on this application.'}</p>
                )}
                <p className="mt-3 text-xs text-slate-500">Proposed prices are not customer-facing until the application and offer setup are approved.</p>
              </section>

              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Compliance checklist</h3>
                  {(selected.documents_deferred || missingRequiredDocs(selected).length > 0) && ['submitted', 'under_review', 'information_requested'].includes(selected.status) && (
                    <Button type="button" onClick={() => void requestMissingDocuments()} disabled={requestingDocumentLink} className="rounded-xl">
                      {requestingDocumentLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                      {requestingDocumentLink ? 'Preparing secure link...' : 'Request missing documents'}
                    </Button>
                  )}
                </div>
                {missingRequiredDocs(selected).length > 0 && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{selected.documents_deferred ? 'This application was submitted while document deferral was enabled.' : 'Required documents are missing or expired.'} It cannot be approved until required documents are uploaded and verified.</p>}
                {documentUploadUrl && (
                  <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-bold text-emerald-900">Secure upload link</p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input readOnly value={documentUploadUrl} aria-label="Secure merchant document upload link" className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs" />
                      <Button type="button" variant="outline" className="rounded-lg" onClick={() => {
                        void navigator.clipboard.writeText(documentUploadUrl).then(() => setMessage('Secure document upload link copied.')).catch(copyError => {
                          console.error('[MerchantOnboarding] Could not copy secure upload link:', copyError);
                          setError('Could not copy the link. Select and copy it manually.');
                        });
                      }}>Copy link</Button>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {requiredDocs(selected).map(type => {
                    const document = selected.documents?.find(item => item.type === type);
                    return (
                      <div key={type} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                        <span className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} /> {labels[type]}</span>
                        {document ? (
                          <button onClick={() => void openDocument(document)} className="text-xs font-black text-primary underline">View securely</button>
                        ) : <span className="text-xs font-black text-rose-600">Missing</span>}
                      </div>
                    );
                  })}
                  {(selected.documents || []).filter(document => !requiredDocs(selected).includes(document.type)).map(document => (
                    <div key={document.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                      <span className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} /> {labels[document.type] || document.type}</span>
                      <div className="flex items-center gap-3">
                        {document.expiresAt && <span className="text-[10px] text-slate-500">Expires {document.expiresAt}</span>}
                        <button onClick={() => void openDocument(document)} className="text-xs font-black text-primary underline">View</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {selected.review_note && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><strong>Latest review note:</strong> {selected.review_note}</div>}

              <section className="border-t border-slate-100 pt-5">
                <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">Review note</label>
                <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={3} placeholder="Required for information requests, rejection, and suspension." className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-primary" />
                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.status === 'submitted' && (
                    <Button disabled={working} onClick={() => void changeStatus('under_review')} variant="outline" className="rounded-xl">Start review</Button>
                  )}
                  {['submitted', 'under_review'].includes(selected.status) && (
                    <>
                      <Button disabled={working} onClick={() => void changeStatus('information_requested')} variant="outline" className="rounded-xl">Request information</Button>
                      <Button disabled={working} onClick={() => void changeStatus('rejected')} variant="outline" className="rounded-xl text-rose-700"><XCircle size={15} className="mr-1" /> Reject</Button>
                      <Button disabled={working} onClick={() => void changeStatus('approved')} className="rounded-xl"><ShieldCheck size={15} className="mr-1" /> Approve</Button>
                    </>
                  )}
                  {selected.status === 'information_requested' && (
                    <>
                      <Button disabled={working} onClick={() => void changeStatus('under_review')} variant="outline" className="rounded-xl">Resume review</Button>
                      <Button disabled={working} onClick={() => void changeStatus('approved')} className="rounded-xl"><ShieldCheck size={15} className="mr-1" /> Approve</Button>
                    </>
                  )}
                  {selected.status === 'approved' && <Button disabled={working} onClick={() => void changeStatus('suspended')} variant="outline" className="rounded-xl text-rose-700">Suspend merchant</Button>}
                          {selected.status === 'approved' && selected.documents?.some(document => document.expiresAt && document.expiresAt < new Date().toISOString().slice(0, 10)) && (
                            <Button disabled={working} onClick={() => void changeStatus('expired')} variant="outline" className="rounded-xl text-rose-700">Mark compliance expired</Button>
                          )}
                  {selected.status === 'suspended' && <Button disabled={working} onClick={() => void changeStatus('approved')} className="rounded-xl">Reinstate</Button>}
                  {working && <Loader2 size={18} className="animate-spin self-center text-primary" />}
                </div>
              </section>

              <section className="border-t border-slate-100 pt-5">
                <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-800">Audit history</h3>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {events.map(event => (
                    <div key={event.id} className="flex justify-between gap-3 text-xs">
                      <span className="font-semibold text-slate-700">{labels[event.event_type] || event.event_type} · {event.actor}</span>
                      <time className="shrink-0 text-slate-400">{new Date(event.created_at).toLocaleString()}</time>
                    </div>
                  ))}
                  {!events.length && <p className="text-xs text-slate-500">No audit events recorded.</p>}
                </div>
              </section>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
