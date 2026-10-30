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
import {
  isFoodBusinessType,
  merchantVendorTypeForBusinessType,
  merchantBusinessTypes,
  type MerchantBusinessType,
  type MerchantVendorType
} from '@/lib/merchantApplications';
import {
  merchantWeekdays,
  normalizeMerchantOperatingHours,
  type MerchantOperatingHours,
  type MerchantWeekday
} from '@/lib/merchantAvailability';

type DocumentType =
  | 'business_registration'
  | 'county_license'
  | 'liquor_licence'
  | 'wholesale_licence'
  | 'kra_pin'
  | 'medical_cert'
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

const vendorTypeLabels: Record<MerchantVendorType, string> = {
  retailer: 'Alcohol retailer',
  wholesaler: 'Alcohol wholesaler',
  street_food: 'Street food vendor'
};

const weekdayLabels: Record<MerchantWeekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday'
};
const documentLabels: Record<DocumentType, string> = {
  business_registration: 'Business registration',
  county_license: 'County business licence',
  liquor_licence: 'Alcohol retail licence',
  wholesale_licence: 'Alcohol wholesale licence',
  kra_pin: 'KRA PIN certificate',
  medical_cert: 'Food handler medical certificate',
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

interface CompanyInvitation {
  businessName: string;
  vendorType: MerchantVendorType;
  businessType: MerchantBusinessType;
  expiresAt: string;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.trim() || 'The server returned an unexpected response.');
  }
}

export default function MerchantOnboarding() {
  const [step, setStep] = useState(0);
  const [businessType, setBusinessType] = useState<MerchantBusinessType>('bar');
  const [vendorType, setVendorType] = useState<MerchantVendorType>('retailer');
  const [businessName, setBusinessName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerRole, setOwnerRole] = useState('');
  const [address, setAddress] = useState('');
  const [county, setCounty] = useState('');
  const [town, setTown] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [operatingAreas, setOperatingAreas] = useState('');
  const [cuisineOrCategory, setCuisineOrCategory] = useState('');
  const [preparationCapacity, setPreparationCapacity] = useState('');
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState('');
  const [collectionAvailable, setCollectionAvailable] = useState(false);
  const [hours, setHours] = useState<MerchantOperatingHours>(() => normalizeMerchantOperatingHours({
    monday: { enabled: true, open: '09:00', close: '22:00' },
    tuesday: { enabled: true, open: '09:00', close: '22:00' },
    wednesday: { enabled: true, open: '09:00', close: '22:00' },
    thursday: { enabled: true, open: '09:00', close: '22:00' },
    friday: { enabled: true, open: '09:00', close: '23:00' },
    saturday: { enabled: true, open: '10:00', close: '23:00' },
    sunday: { enabled: true, open: '10:00', close: '20:00' }
  }));
  const [documents, setDocuments] = useState<Partial<Record<DocumentType, File>>>({});
  const [expiryDates, setExpiryDates] = useState<Partial<Record<DocumentType, string>>>({});
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([]);
  const [requirementsLoading, setRequirementsLoading] = useState(false);
  const [requirementsLoaded, setRequirementsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedApplicationId, setSubmittedApplicationId] = useState('');
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState('');
  const [invitation, setInvitation] = useState<CompanyInvitation | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('invite');
    if (!token) return;

    setInviteToken(token);
    setInviteLoading(true);
    setInviteError(null);
    const controller = new AbortController();
    fetch(`/api/merchant-onboarding-invite?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
      signal: controller.signal,
      referrerPolicy: 'no-referrer'
    })
      .then(async response => {
        const payload = await readJsonResponse<{ invitation?: CompanyInvitation; error?: string }>(response);
        if (!response.ok || !payload.invitation) throw new Error(payload.error || 'This company link could not be verified.');
        setInvitation(payload.invitation);
        setBusinessType(payload.invitation.businessType);
        setVendorType(payload.invitation.vendorType);
        setBusinessName(payload.invitation.businessName);
        setPhone('');
      })
      .catch(loadError => {
        if (!controller.signal.aborted) {
          setInviteError(loadError instanceof Error ? loadError.message : 'This company link could not be verified.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setInviteLoading(false);
      });
    return () => controller.abort();
  }, []);

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
    const params = new URLSearchParams({ businessType, county, vendorType: businessType === 'delivery_partner' ? '' : vendorType });
    fetch(`/api/merchant-applications?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await readJsonResponse<{ requirements?: Array<{ type: string; label: string; required: boolean }>; error?: string }>(response);
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
  }, [step, businessType, vendorType, county]);

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
    if (requiredDocumentTypes.some(type =>
      (type === 'liquor_licence' || type === 'wholesale_licence')
      && !expiryDates[type]
    )) {
      setError('Enter the expiry date for your alcohol licence before submitting.');
      return;
    }

    setLoading(true);
    setError(null);
    const payload = new FormData();
    payload.set('businessType', businessType);
    payload.set('vendorType', businessType === 'delivery_partner' ? '' : vendorType);
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
    payload.set('latitude', latitude);
    payload.set('longitude', longitude);
    payload.set('operatingAreas', JSON.stringify(operatingAreas.split(',').map(area => area.trim()).filter(Boolean)));
    payload.set('operatingHours', JSON.stringify(hours));
    payload.set('cuisineOrCategory', cuisineOrCategory.trim());
    payload.set('preparationCapacity', preparationCapacity);
    payload.set('deliveryRadiusKm', deliveryRadiusKm);
    payload.set('collectionAvailable', String(collectionAvailable));
    payload.set('privacyAcknowledged', String(privacyAcknowledged));
    if (inviteToken) payload.set('inviteToken', inviteToken);
    for (const [type, file] of Object.entries(documents)) {
      if (!file) continue;
      payload.set(`document:${type}`, file);
      if (expiryDates[type as DocumentType]) payload.set(`expiry:${type}`, expiryDates[type as DocumentType] || '');
    }

    try {
      const response = await fetch('/api/merchant-applications', { method: 'POST', body: payload });
      const result = await readJsonResponse<{ id?: string; error?: string }>(response);
      if (!response.ok) throw new Error(result.error || 'Your application could not be submitted.');
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete('invite');
      window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      setSubmittedApplicationId(result.id || '');
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
        <meta name="referrer" content="no-referrer" />
        <Card className="w-full max-w-xl rounded-[2rem] border-0 p-8 text-center shadow-xl sm:p-12">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={42} />
          </div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-emerald-700">Application received</p>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">Review is now in progress</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600">
            OnBar will review your business details and documents. A merchant ID is assigned after approval. Your business will not become active automatically.
          </p>
          {submittedApplicationId && <p className="mt-4 text-xs font-semibold text-slate-500">Application reference: {submittedApplicationId}</p>}
          {invitation ? (
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600">
              This application is linked to {invitation.businessName}. The OnBar team will contact the details you provided about next steps.
            </p>
          ) : (
            <>
              <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600">
                Track your application from your profile. Once approved, the Partner Workspace button will appear there for the verified account using the email address you submitted.
              </p>
              <Link href="/profile#workspaces" className="mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-black uppercase text-white hover:opacity-90">
                Go to my profile
              </Link>
            </>
          )}
          <Link href="/" className="mt-8 inline-flex text-sm font-bold text-primary hover:underline">Return to OnBar</Link>
        </Card>
      </main>
    );
  }

  if (inviteLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <meta name="referrer" content="no-referrer" />
        <Card className="flex items-center gap-3 rounded-2xl border-0 p-6 text-sm font-semibold text-slate-700 shadow-xl">
          <Loader2 className="animate-spin text-primary" /> Opening your company&apos;s private onboarding…
        </Card>
      </main>
    );
  }

  if (inviteToken && (inviteError || !invitation)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <meta name="referrer" content="no-referrer" />
        <Card className="w-full max-w-lg rounded-2xl border-0 p-8 text-center shadow-xl">
          <h1 className="text-xl font-black text-slate-900">Private link unavailable</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-slate-600">
            {inviteError || 'This company onboarding link could not be verified.'}
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      {inviteToken && <meta name="referrer" content="no-referrer" />}
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
                <h2 className="text-xl font-black uppercase text-slate-900">
                  {invitation ? 'Your company invitation' : 'Business identity'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {invitation
                    ? 'This private link is set up for this company only. Its business identity and partner category cannot be changed.'
                    : 'Tell us what kind of partner you are.'}
                </p>
              </div>
              {!invitation && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {merchantBusinessTypes.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setBusinessType(type);
                        const category = merchantVendorTypeForBusinessType(type);
                        if (category) setVendorType(category);
                      }}
                      className={`flex min-h-16 items-center gap-3 rounded-2xl border p-4 text-left text-sm font-bold transition ${
                        businessType === type ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 hover:border-primary/50'
                      }`}
                    >
                      {isFoodBusinessType(type) ? <Utensils size={18} /> : type === 'delivery_partner' ? <Truck size={18} /> : <Store size={18} />}
                      {businessTypeLabels[type]}
                    </button>
                  ))}
                </div>
              )}
              {invitation ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-800">Private application for</p>
                  <p className="mt-2 text-xl font-black text-slate-900">{invitation.businessName}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {businessTypeLabels[invitation.businessType]} · {vendorTypeLabels[invitation.vendorType]}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    Link expires {new Date(invitation.expiresAt).toLocaleString()} and accepts one application.
                  </p>
                </div>
              ) : businessType !== 'delivery_partner' && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-800">
                  Vendor category: {vendorTypeLabels[vendorType]}
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    This category matches your business type and determines its performance targets and compliance checks.
                  </span>
                </p>
              )}
              {!invitation && (
                <>
                  <Input value={businessName} onChange={event => setBusinessName(event.target.value)} maxLength={160} placeholder="Registered business name *" className="h-12 rounded-xl" />
                  <Input value={tradingName} onChange={event => setTradingName(event.target.value)} maxLength={160} placeholder="Trading name (if different)" className="h-12 rounded-xl" />
                </>
              )}
              <Button disabled={!invitation && businessName.trim().length < 2} onClick={() => setStep(1)} className="h-12 w-full rounded-xl font-black uppercase">
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
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <p className="text-sm font-bold text-slate-800">Business coordinates (recommended for delivery)</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Used to check service radius and estimate rider pickup distance. Enter the pin for your business, not a customer location.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input type="number" min="-90" max="90" step="any" value={latitude} onChange={event => setLatitude(event.target.value)} placeholder="Latitude, e.g. -1.2864" className="h-12 rounded-xl" />
                  <Input type="number" min="-180" max="180" step="any" value={longitude} onChange={event => setLongitude(event.target.value)} placeholder="Longitude, e.g. 36.8172" className="h-12 rounded-xl" />
                </div>
              </div>
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
                <p className="mb-1 flex items-center gap-2 text-xs font-black uppercase text-slate-700"><MapPin size={15} /> Operating hours by day</p>
                <p className="mb-3 text-xs text-slate-500">Use East Africa Time (Nairobi). Closed days will not receive new order allocations.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {merchantWeekdays.map(day => {
                    const dayHours = hours[day];
                    return <div key={day} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <input
                          type="checkbox"
                          checked={dayHours.enabled}
                          onChange={event => setHours(current => ({
                            ...current,
                            [day]: { ...current[day], enabled: event.target.checked }
                          }))}
                          className="h-4 w-4 accent-primary"
                        />
                        {weekdayLabels[day]}
                        {!dayHours.enabled && <span className="ml-auto text-slate-400">Closed</span>}
                      </label>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Opens
                          <Input
                            type="time"
                            required={dayHours.enabled}
                            disabled={!dayHours.enabled}
                            value={dayHours.open}
                            onChange={event => setHours(current => ({
                              ...current,
                              [day]: { ...current[day], open: event.target.value }
                            }))}
                            className="mt-1 h-10 rounded-lg px-2 text-sm"
                          />
                        </label>
                        <span className="pt-4 text-xs text-slate-400">to</span>
                        <label className="text-[10px] font-bold uppercase text-slate-400">Closes
                          <Input
                            type="time"
                            required={dayHours.enabled}
                            disabled={!dayHours.enabled}
                            value={dayHours.close}
                            onChange={event => setHours(current => ({
                              ...current,
                              [day]: { ...current[day], close: event.target.value }
                            }))}
                            className="mt-1 h-10 rounded-lg px-2 text-sm"
                          />
                        </label>
                      </div>
                    </div>;
                  })}
                </div>
                {merchantWeekdays.some(day => hours[day].enabled && hours[day].open === hours[day].close) && <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">For an open day, opening and closing times must be different.</p>}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="h-12 rounded-xl"><ArrowLeft size={16} className="mr-2" /> Back</Button>
                <Button
                  disabled={merchantWeekdays.some(day => hours[day].enabled && hours[day].open === hours[day].close)}
                  onClick={() => setStep(3)}
                  className="h-12 flex-1 rounded-xl font-black uppercase"
                >
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
                        Expiry date {type === 'liquor_licence' || type === 'wholesale_licence' ? '*' : '(if applicable)'}
                        <Input
                          type="date"
                          required={type === 'liquor_licence' || type === 'wholesale_licence'}
                          value={expiryDates[type] || ''}
                          onChange={event => setExpiryDates(current => ({ ...current, [type]: event.target.value }))}
                          className="mt-1 h-10 rounded-lg"
                        />
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
