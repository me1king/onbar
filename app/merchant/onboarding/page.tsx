'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  ShieldCheck,
  Store,
  Truck,
  Utensils
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { isFoodBusinessType, merchantBusinessTypes, type MerchantBusinessType } from '@/lib/merchantApplications';

type DocumentType =
  | 'business_registration'
  | 'county_license'
  | 'food_hygiene'
  | 'tax_document'
  | 'premises_document'
  | 'other_permit';

const businessTypeLabels: Record<MerchantBusinessType, string> = {
  bar: 'Bar / Venue',
  kitchen: 'Kitchen',
  restaurant: 'Restaurant',
  food_vendor: 'Food Vendor',
  supplier: 'Supplier',
  delivery_partner: 'Delivery Partner'
};

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const documentLabels: Record<DocumentType, string> = {
  business_registration: 'Business registration',
  county_license: 'County business licence',
  food_hygiene: 'Food hygiene documentation',
  tax_document: 'Tax / business information',
  premises_document: 'Premises documentation',
  other_permit: 'Other applicable permit'
};
interface DocumentRequirement {
  type: DocumentType;
  label: string;
  required: boolean;
}

export default function MerchantOnboarding() {
  const [step, setStep] = useState(0);
  const [businessType, setBusinessType] = useState<MerchantBusinessType>('bar');
  const [businessName, setBusinessName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerRole, setOwnerRole] = useState('');
  const [address, setAddress] = useState('');
  const [county, setCounty] = useState('');
  const [town, setTown] = useState('');
  const [operatingAreas, setOperatingAreas] = useState('');
  const [cuisineOrCategory, setCuisineOrCategory] = useState('');
  const [preparationCapacity, setPreparationCapacity] = useState('');
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState('');
  const [collectionAvailable, setCollectionAvailable] = useState(false);
  const [hours, setHours] = useState<Record<string, string>>({
    monday: '09:00-22:00',
    tuesday: '09:00-22:00',
    wednesday: '09:00-22:00',
    thursday: '09:00-22:00',
    friday: '09:00-23:00',
    saturday: '10:00-23:00',
    sunday: '10:00-20:00'
  });
  const [documents, setDocuments] = useState<Partial<Record<DocumentType, File>>>({});
  const [expiryDates, setExpiryDates] = useState<Partial<Record<DocumentType, string>>>({});
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([]);
  const [requirementsLoading, setRequirementsLoading] = useState(false);
  const [requirementsLoaded, setRequirementsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredDocumentTypes = useMemo(
    () => requirements.filter(requirement => requirement.required).map(requirement => requirement.type),
    [requirements]
  );

  useEffect(() => {
    if (step !== 3) return;
    const controller = new AbortController();
    setRequirementsLoading(true);
    setRequirementsLoaded(false);
    setError(null);
    const params = new URLSearchParams({ businessType, county });
    fetch(`/api/merchant-applications?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await response.json() as { requirements?: Array<{ type: string; label: string; required: boolean }>; error?: string };
        if (!response.ok || !payload.requirements) throw new Error(payload.error || 'Document checklist could not be loaded.');
        const configured = payload.requirements.filter((requirement): requirement is DocumentRequirement =>
          Object.prototype.hasOwnProperty.call(documentLabels, requirement.type)
          && typeof requirement.label === 'string'
          && typeof requirement.required === 'boolean'
        ).map(requirement => ({ ...requirement, type: requirement.type as DocumentType }));
        setRequirements(configured);
        setRequirementsLoaded(true);
      })
      .catch(loadError => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Document checklist could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setRequirementsLoading(false);
      });
    return () => controller.abort();
  }, [step, businessType, county]);

  const contactAndLocationValid = email.trim().length > 3
    && phone.trim().length >= 7
    && ownerName.trim().length >= 2
    && ownerRole.trim().length >= 2
    && address.trim().length >= 4
    && county.trim().length >= 2
    && town.trim().length >= 2;

  const submitApplication = async () => {
    if (!requirementsLoaded || requirementsLoading) {
      setError('Wait for the current document checklist to load before submitting.');
      return;
    }
    if (requiredDocumentTypes.some(type => !documents[type])) {
      setError('Upload all required documents before submitting.');
      return;
    }

    setLoading(true);
    setError(null);
    const payload = new FormData();
    payload.set('businessType', businessType);
    payload.set('businessName', businessName.trim());
    payload.set('tradingName', tradingName.trim());
    payload.set('email', email.trim());
    payload.set('phone', phone.trim());
    payload.set('ownerName', ownerName.trim());
    payload.set('ownerRole', ownerRole.trim());
    payload.set('address', address.trim());
    payload.set('country', 'Kenya');
    payload.set('county', county.trim());
    payload.set('town', town.trim());
    payload.set('operatingAreas', JSON.stringify(operatingAreas.split(',').map(area => area.trim()).filter(Boolean)));
    payload.set('operatingHours', JSON.stringify(hours));
    payload.set('cuisineOrCategory', cuisineOrCategory.trim());
    payload.set('preparationCapacity', preparationCapacity);
    payload.set('deliveryRadiusKm', deliveryRadiusKm);
    payload.set('collectionAvailable', String(collectionAvailable));
    payload.set('privacyAcknowledged', String(privacyAcknowledged));
    for (const [type, file] of Object.entries(documents)) {
      if (!file) continue;
      payload.set(`document:${type}`, file);
      if (expiryDates[type as DocumentType]) payload.set(`expiry:${type}`, expiryDates[type as DocumentType] || '');
    }

    try {
      const response = await fetch('/api/merchant-applications', { method: 'POST', body: payload });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Your application could not be submitted.');
      setSubmitted(true);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Your application could not be submitted.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-xl rounded-[2rem] border-0 p-8 text-center shadow-xl sm:p-12">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={42} />
          </div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-emerald-700">Application received</p>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">Review is now in progress</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600">
            OnBar will review your business details and documents. A merchant ID is assigned after approval. Your business will not become active automatically.
          </p>
          <Link href="/" className="mt-8 inline-flex text-sm font-bold text-primary hover:underline">Return to OnBar</Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
            <Store size={30} />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-primary">OnBar Merchant Network</p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-900 sm:text-4xl">Partner application</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600">
            Submit your business for verification. Requirements vary by business type; approval and activation require an OnBar review.
          </p>
        </header>

        <div className="mb-5 grid grid-cols-4 gap-2" aria-label="Application progress">
          {['Business', 'Contact & area', 'Operations', 'Documents'].map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => index < step && setStep(index)}
              className={`rounded-xl px-2 py-3 text-[10px] font-black uppercase tracking-wide sm:text-xs ${
                index === step ? 'bg-primary text-white' : index < step ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-slate-400'
              }`}
            >
              {index + 1}. {label}
            </button>
          ))}
        </div>

        <Card className="rounded-[2rem] border-0 p-5 shadow-xl sm:p-9">
          {step === 0 && (
            <section className="space-y-6">
              <div>
                <h2 className="text-xl font-black uppercase text-slate-900">Business identity</h2>
                <p className="mt-1 text-sm text-slate-500">Tell us what kind of partner you are.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {merchantBusinessTypes.map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setBusinessType(type)}
                    className={`flex min-h-16 items-center gap-3 rounded-2xl border p-4 text-left text-sm font-bold transition ${
                      businessType === type ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 hover:border-primary/50'
                    }`}
                  >
                    {isFoodBusinessType(type) ? <Utensils size={18} /> : type === 'delivery_partner' ? <Truck size={18} /> : <Store size={18} />}
                    {businessTypeLabels[type]}
                  </button>
                ))}
              </div>
              <Input value={businessName} onChange={event => setBusinessName(event.target.value)} maxLength={160} placeholder="Registered business name *" className="h-12 rounded-xl" />
              <Input value={tradingName} onChange={event => setTradingName(event.target.value)} maxLength={160} placeholder="Trading name (if different)" className="h-12 rounded-xl" />
              <Button disabled={businessName.trim().length < 2} onClick={() => setStep(1)} className="h-12 w-full rounded-xl font-black uppercase">
                Continue <ArrowRight size={16} className="ml-2" />
              </Button>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-5">
              <div>
                <h2 className="text-xl font-black uppercase text-slate-900">Responsible person & location</h2>
                <p className="mt-1 text-sm text-slate-500">Provide a business contact and service area. Do not enter customer data here.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} placeholder="Business email *" className="h-12 rounded-xl" />
                <Input value={phone} onChange={event => setPhone(event.target.value)} maxLength={40} placeholder="Business phone *" className="h-12 rounded-xl" />
                <Input value={ownerName} onChange={event => setOwnerName(event.target.value)} maxLength={120} placeholder="Responsible person's full name *" className="h-12 rounded-xl" />
                <Input value={ownerRole} onChange={event => setOwnerRole(event.target.value)} maxLength={80} placeholder="Role (owner, manager...) *" className="h-12 rounded-xl" />
                <Input value={county} onChange={event => setCounty(event.target.value)} maxLength={100} placeholder="County *" className="h-12 rounded-xl" />
                <Input value={town} onChange={event => setTown(event.target.value)} maxLength={100} placeholder="Town / city *" className="h-12 rounded-xl" />
              </div>
              <Input value={address} onChange={event => setAddress(event.target.value)} maxLength={240} placeholder="Physical business address *" className="h-12 rounded-xl" />
              <Input value={operatingAreas} onChange={event => setOperatingAreas(event.target.value)} maxLength={2000} placeholder="Areas served, comma-separated (e.g. Westlands, Kilimani)" className="h-12 rounded-xl" />
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(0)} className="h-12 rounded-xl"><ArrowLeft size={16} className="mr-2" /> Back</Button>
                <Button disabled={!contactAndLocationValid} onClick={() => setStep(2)} className="h-12 flex-1 rounded-xl font-black uppercase">
                  Continue <ArrowRight size={16} className="ml-2" />
                </Button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-5">
              <div>
                <h2 className="text-xl font-black uppercase text-slate-900">Operations profile</h2>
                <p className="mt-1 text-sm text-slate-500">Kitchen and food businesses must provide accurate preparation and food information.</p>
              </div>
              <Input value={cuisineOrCategory} onChange={event => setCuisineOrCategory(event.target.value)} maxLength={120} placeholder={isFoodBusinessType(businessType) ? 'Cuisine / food category' : 'Product or service category'} className="h-12 rounded-xl" />
              {businessType === 'kitchen' && (
                <Input type="number" min="1" max="100000" value={preparationCapacity} onChange={event => setPreparationCapacity(event.target.value)} placeholder="Orders / portions per day" className="h-12 rounded-xl" />
              )}
              <Input type="number" min="0" max="500" step="0.5" value={deliveryRadiusKm} onChange={event => setDeliveryRadiusKm(event.target.value)} placeholder="Delivery radius in km (if applicable)" className="h-12 rounded-xl" />
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-medium">
                <input type="checkbox" checked={collectionAvailable} onChange={event => setCollectionAvailable(event.target.checked)} className="h-4 w-4 accent-primary" />
                Customer collection is available
              </label>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-slate-700"><MapPin size={15} /> Operating hours by day</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {days.map(day => {
                    const key = day.toLowerCase();
                    return (
                      <label key={key} className="grid grid-cols-[90px_1fr] items-center gap-2 text-xs font-bold text-slate-500">
                        {day}
                        <Input value={hours[key] || ''} onChange={event => setHours(current => ({ ...current, [key]: event.target.value.slice(0, 40) }))} placeholder="Closed or 09:00-22:00" className="h-10 rounded-lg text-sm" />
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="h-12 rounded-xl"><ArrowLeft size={16} className="mr-2" /> Back</Button>
                <Button onClick={() => setStep(3)} className="h-12 flex-1 rounded-xl font-black uppercase">
                  Continue <ArrowRight size={16} className="ml-2" />
                </Button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-5">
              <div>
                <h2 className="text-xl font-black uppercase text-slate-900">Documents & compliance</h2>
                <p className="mt-1 text-sm text-slate-500">The exact checklist depends on business type and county. Documents are private and only shared with authorized reviewers.</p>
              </div>
              {requirementsLoading && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Loading the checklist for this business type and county...</p>}
              {!requirementsLoading && requirementsLoaded && requirements.length === 0 && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No documents are configured for this application. Contact OnBar before submitting.</p>}
              {requirements.map(requirement => {
                const type = requirement.type;
                return (
                  <div key={type} className="rounded-2xl border border-slate-200 p-4">
                    <label className="flex cursor-pointer items-center justify-between gap-4">
                      <span className="flex items-center gap-3">
                        <FileText size={19} className={documents[type] ? 'text-emerald-600' : 'text-slate-400'} />
                        <span>
                          <span className="block text-sm font-bold text-slate-800">{requirement.label}{requirement.required ? ' *' : ''}</span>
                          <span className="block text-xs text-slate-500">{documents[type]?.name || 'PDF, JPG or PNG; maximum 5 MB'}</span>
                        </span>
                      </span>
                      {documents[type] && <CheckCircle2 size={19} className="text-emerald-600" />}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        className="sr-only"
                        onChange={event => setDocuments(current => ({ ...current, [type]: event.target.files?.[0] }))}
                      />
                    </label>
                    {documents[type] && (
                      <label className="mt-3 block text-xs font-semibold text-slate-500">
                        Expiry date (if applicable)
                        <Input type="date" value={expiryDates[type] || ''} onChange={event => setExpiryDates(current => ({ ...current, [type]: event.target.value }))} className="mt-1 h-10 rounded-lg" />
                      </label>
                    )}
                  </div>
                );
              })}
              <div className="rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                Payout details are collected only after verification through an approved settlement workflow. Submitting an application does not activate a merchant account or publish products.
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-xs leading-5 text-slate-600">
                <input type="checkbox" checked={privacyAcknowledged} onChange={event => setPrivacyAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
                <span>I have read the <Link href="/privacy" target="_blank" className="font-bold underline">privacy notice</Link> and understand that OnBar will use these business details and documents to assess this application, communicate about verification, and maintain necessary compliance records. This is not consent to marketing.</span>
              </label>
              {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
              <div className="flex gap-3">
                <Button variant="outline" disabled={loading} onClick={() => setStep(2)} className="h-12 rounded-xl"><ArrowLeft size={16} className="mr-2" /> Back</Button>
                <Button disabled={loading || requirementsLoading || !requirementsLoaded || !requirements.length || !privacyAcknowledged || requiredDocumentTypes.some(type => !documents[type])} onClick={submitApplication} className="h-12 flex-1 rounded-xl font-black uppercase">
                  {loading ? <Loader2 size={17} className="mr-2 animate-spin" /> : <ShieldCheck size={17} className="mr-2" />}
                  Submit for review
                </Button>
              </div>
            </section>
          )}
        </Card>

        <p className="mt-5 text-center text-xs text-slate-500">
          Need help? Contact OnBar support. <span className="mx-1">•</span> <Link className="font-bold underline" href="/privacy">Privacy information</Link>
        </p>
        <div className="mt-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
          <Building2 className="mr-1 inline h-3 w-3" /> Applications are reviewed before activation
        </div>
      </div>
    </main>
  );
}
