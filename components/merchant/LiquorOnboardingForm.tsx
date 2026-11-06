'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, ShieldCheck, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabaseClient';

type CatalogueProduct = {
  id: number;
  name: string;
  category: string;
  price: number;
  image_url: string | null;
  sizes: string[] | null;
};

type ProductDetails = {
  size: string;
  abv: string;
  exciseStampConfirmed: boolean;
  price: string;
};

const steps = ['Account', 'Identity', 'Location', 'Licences', 'Payments', 'Products', 'Rules', 'Review'];
const requiredRules = [
  'Do not sell or deliver alcohol to anyone below the configured legal minimum age.',
  'Ask for and verify an original government ID at the door.',
  'Do not complete a delivery when the customer appears intoxicated.',
  'Do not sell outside the approved terminal or alter product labels.',
  'Keep excise-stamp evidence and supplier invoices for every stock batch.',
  'Follow the approved county trading hours and platform delivery rules.'
];
const uploadTypes = [
  ['government_id', 'National ID document'],
  ['selfie_photo', 'Owner selfie for manual identity review'],
  ['shopfront_photo', 'Shopfront photo'],
  ['liquor_licence', 'County alcohol licence'],
  ['online_alcohol_licence', 'Nairobi online alcohol licence'],
  ['business_registration', 'Business registration'],
  ['county_license', 'County business permit'],
  ['business_permit', 'Business permit'],
  ['kra_pin', 'KRA PIN certificate'],
  ['premises_document', 'Lease or premises proof'],
  ['supplier_invoice', 'Supplier invoice']
] as const;

function readError(response: Response, body: { error?: string }) {
  return body.error || `Request failed (${response.status}).`;
}

export default function LiquorOnboardingForm({
  inviteToken = '',
  invitationBusinessName,
  invitationError,
  invitationLoaded = false,
  initialBusinessName = '',
  initialTradingName = ''
}: {
  inviteToken?: string;
  invitationBusinessName?: string;
  invitationError?: string | null;
  invitationLoaded?: boolean;
  initialBusinessName?: string;
  initialTradingName?: string;
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [session, setSession] = useState<{ token: string; email: string; verified: boolean } | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueProduct[]>([]);
  const [catalogueError, setCatalogueError] = useState('');
  const [files, setFiles] = useState<Record<string, File>>({});
  const [fileInputResetKey, setFileInputResetKey] = useState(0);
  const [expiryDates, setExpiryDates] = useState({ liquor_licence: '', online_alcohol_licence: '' });
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [form, setForm] = useState({
    businessName: initialBusinessName,
    tradingName: initialTradingName,
    email: '',
    phone: '',
    ownerName: '',
    ownerRole: 'Owner',
    idLast4: '',
    address: '',
    county: 'Nairobi',
    town: '',
    latitude: '',
    longitude: '',
    distanceToSchoolMeters: '',
    countyLicenceNumber: '',
    onlineLicenceNumber: '',
    mpesaTill: '',
    mpesaRegisteredName: '',
    minAge: '18',
    maxBottles: '12',
    schoolBufferMeters: '300',
    signature: ''
  });
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [productDetails, setProductDetails] = useState<Record<number, ProductDetails>>({});
  const [acceptedRules, setAcceptedRules] = useState<boolean[]>(requiredRules.map(() => false));
  const [documentUploadUrl, setDocumentUploadUrl] = useState('');
  const [documentUploadNotice, setDocumentUploadNotice] = useState('');
  const [invitationValidated, setInvitationValidated] = useState(!inviteToken);
  const onboardingReturnPath = `/merchant/onboarding?flow=liquor${inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ''}`;
  const signInHref = `/auth?mode=signin&next=${encodeURIComponent(onboardingReturnPath)}`;

  useEffect(() => {
    if (!inviteToken) {
      setInvitationValidated(true);
      return;
    }
    setInvitationValidated(invitationLoaded && Boolean(invitationBusinessName) && !invitationError);
    if (invitationBusinessName) {
      setForm(current => ({ ...current, businessName: invitationBusinessName }));
    }
    if (invitationError) setError(invitationError);
  }, [inviteToken, invitationBusinessName, invitationError, invitationLoaded]);

  const updateForm = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  useEffect(() => {
    let active = true;
    const client = supabase;
    if (!client) {
      setError('OnlineBar sign-in is not configured.');
      return;
    }
    const updateAccount = (current: Awaited<ReturnType<typeof client.auth.getSession>>['data']['session']) => {
      if (!current) {
        setSession(null);
        return;
      }
      setSession({
        token: current.access_token,
        email: current.user.email || '',
        verified: Boolean(current.user.email_confirmed_at || current.user.phone_confirmed_at)
      });
      setForm(value => ({ ...value, email: current.user.email || value.email }));
    };
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError('Your account session could not be checked. Sign in again before applying.');
        return;
      }
      updateAccount(data.session);
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, current) => {
      if (active) updateAccount(current);
    });
    const controller = new AbortController();
    void fetch('/api/catalog/products?limit=500', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await response.json() as { products?: CatalogueProduct[]; error?: string };
        if (!response.ok || !Array.isArray(payload.products)) throw new Error(payload.error || 'The product catalogue could not be loaded.');
        if (active) setCatalogue(payload.products.filter(item => Number.isSafeInteger(Number(item.id)) && item.id > 0));
      })
      .catch(loadError => {
        if (active && !controller.signal.aborted) setCatalogueError(loadError instanceof Error ? loadError.message : 'The product catalogue could not be loaded.');
      });
    return () => {
      active = false;
      controller.abort();
      subscription.unsubscribe();
    };
  }, []);

  const selectedProductRecords = useMemo(() => selectedProducts.map(id => ({
    productId: id,
    ...productDetails[id],
    abv: Number(productDetails[id]?.abv),
    price: Number(productDetails[id]?.price)
  })), [selectedProducts, productDetails]);

  const toggleProduct = (product: CatalogueProduct) => {
    setSelectedProducts(current => {
      if (current.includes(product.id)) {
        setProductDetails(details => {
          const next = { ...details };
          delete next[product.id];
          return next;
        });
        return current.filter(id => id !== product.id);
      }
      setProductDetails(details => ({
        ...details,
        [product.id]: {
          size: product.sizes?.[0] || '',
          abv: '',
          exciseStampConfirmed: false,
          price: String(product.price || '')
        }
      }));
      return [...current, product.id];
    });
  };

  const updateProduct = (id: number, patch: Partial<ProductDetails>) => {
    setProductDetails(current => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const getLicenceDetailsValidationError = () => {
    const countyLicenceNumber = form.countyLicenceNumber.trim();
    const onlineLicenceNumber = form.onlineLicenceNumber.trim();
    if (countyLicenceNumber && !/^NCC\/OFF\/\d{4}\/\d{5}$/.test(countyLicenceNumber)) {
      return 'Enter the county off-licence in the format NCC/OFF/YYYY/12345.';
    }
    if (onlineLicenceNumber && onlineLicenceNumber.length < 4) return 'Enter at least four characters for the Nairobi online alcohol licence reference.';
    return null;
  };

  const advanceStep = () => {
    const validationError = getStepValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setStep(value => value + 1);
  };

  const skipDocumentUploads = () => {
    setFiles({});
    setFileInputResetKey(value => value + 1);
    setExpiryDates({ liquor_licence: '', online_alcohol_licence: '' });
    setError('');
    setStep(value => value + 1);
  };

  const getStepValidationError = () => {
    if (step === 0) {
      if (form.businessName.trim().length < 2) return 'Enter the registered shop name.';
      if (form.ownerName.trim().length < 2) return 'Enter the owner or responsible person’s name.';
      if (form.phone.trim().length < 7) return 'Enter a valid business phone number.';
    }
    if (step === 1) {
      if (!/^\d{4}$/.test(form.idLast4)) return 'Enter the last four digits of the National ID.';
    }
    if (step === 2) {
      if (form.address.trim().length < 4) return 'Enter the shop street address or estate.';
      if (form.town.trim().length < 2) return 'Enter the town or city.';
      if (!/^\d+(\.\d+)?$/.test(form.distanceToSchoolMeters)) return 'Enter the approximate distance to the nearest school or place of worship.';
    }
    if (step === 3) {
      const licenceError = getLicenceDetailsValidationError();
      if (licenceError) return licenceError;
      if (files.liquor_licence && !expiryDates.liquor_licence) return 'Enter the county licence expiry date.';
      if (files.online_alcohol_licence && !expiryDates.online_alcohol_licence) return 'Enter the online licence expiry date.';
    }
    if (step === 4) {
      if (form.mpesaTill.trim().length < 5) return 'Enter the business M-Pesa till or paybill number.';
      if (form.mpesaRegisteredName.trim().length < 2) return 'Enter the name registered to the M-Pesa till.';
    }
    if (step === 5) {
      if (selectedProducts.length < 3) return 'Select at least three products from the catalogue.';
      if (selectedProductRecords.some(product => !product.size.trim())) return 'Enter the size for every selected product.';
      if (selectedProductRecords.some(product => !Number.isFinite(product.abv) || product.abv < 0 || product.abv > 100)) return 'Enter a valid ABV between 0 and 100 for every selected product.';
      if (selectedProductRecords.some(product => !Number.isFinite(product.price) || product.price <= 0)) return 'Enter a valid price for every selected product.';
      if (selectedProductRecords.some(product => !product.exciseStampConfirmed)) return 'Confirm the excise stamp declaration for every selected product.';
    }
    if (step === 6) {
      if (acceptedRules.some(accepted => !accepted)) return 'Accept all six selling rules before continuing.';
      if (form.signature.trim().length < 3) return 'Type your full name as the signature.';
    }
    return null;
  };

  const submitApplication = async () => {
    if (!session?.verified) {
      setError('Sign in with a verified OnlineBar account before submitting.');
      return;
    }
    if (!privacyAcknowledged) {
      setError('Read and accept the privacy notice before submitting identity and business documents.');
      return;
    }
    if (!invitationValidated) {
      setError('Verifying your company invitation. Please wait a moment and try again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const formData = new FormData();
      const fields: Record<string, string> = {
        businessType: 'bar',
        vendorType: 'retailer',
        businessName: form.businessName.trim(),
        tradingName: form.tradingName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        ownerName: form.ownerName.trim(),
        ownerRole: form.ownerRole.trim(),
        address: form.address.trim(),
        country: 'Kenya',
        county: form.county.trim(),
        town: form.town.trim(),
        latitude: form.latitude,
        longitude: form.longitude,
        operatingAreas: JSON.stringify([form.town.trim()]),
        operatingHours: JSON.stringify({
          monday: { enabled: true, open: '10:00', close: '22:00' },
          tuesday: { enabled: true, open: '10:00', close: '22:00' },
          wednesday: { enabled: true, open: '10:00', close: '22:00' },
          thursday: { enabled: true, open: '10:00', close: '22:00' },
          friday: { enabled: true, open: '10:00', close: '22:00' },
          saturday: { enabled: true, open: '10:00', close: '22:00' },
          sunday: { enabled: true, open: '10:00', close: '22:00' }
        }),
        cuisineOrCategory: 'Alcohol retail',
        preparationCapacity: '',
        deliveryRadiusKm: '',
        collectionAvailable: 'false',
        offeredGoods: JSON.stringify(selectedProducts),
        offeredGoodsPricing: JSON.stringify(selectedProductRecords.map(product => ({ productId: product.productId, price: product.price }))),
        ...(inviteToken ? { inviteToken } : {}),
        alcoholOnboarding: JSON.stringify({
          nationalIdLast4: form.idLast4,
          countyLicenceNumber: form.countyLicenceNumber.trim(),
          onlineLicenceNumber: form.onlineLicenceNumber.trim(),
          mpesaTill: form.mpesaTill.trim(),
          mpesaRegisteredName: form.mpesaRegisteredName.trim(),
          distanceToSchoolMeters: Number(form.distanceToSchoolMeters),
          distanceCheck: 'merchant_reported_pending_admin_measurement',
          schoolReviewRequired: Number(form.distanceToSchoolMeters) < 300,
          products: selectedProductRecords,
          rules: {
            minimumAge: Number(form.minAge),
            maximumBottlesPerOrder: Number(form.maxBottles),
            schoolBufferMeters: Number(form.schoolBufferMeters)
          },
          acceptedRules: requiredRules.map((rule, index) => ({ rule, accepted: acceptedRules[index] })),
          typedSignature: form.signature.trim(),
          identityCheck: 'pending_manual_review',
          licenceCheck: 'format_checked_pending_manual_review',
          tillNameCheck: 'pending_manual_review',
          submittedAt: new Date().toISOString()
        }),
        privacyAcknowledged: String(privacyAcknowledged)
      };
      for (const [key, value] of Object.entries(fields)) formData.set(key, value);
      for (const [type, file] of Object.entries(files)) formData.set(`document:${type}`, file);
      formData.set('expiry:liquor_licence', expiryDates.liquor_licence);
      formData.set('expiry:online_alcohol_licence', expiryDates.online_alcohol_licence);
      const response = await fetch('/api/merchant-applications', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        body: formData
      });
      const payload = await response.json() as {
        id?: string;
        error?: string;
        documentsUploadUrl?: string;
        documentsUploadEmailSent?: boolean;
        documentsUploadWarning?: string;
      };
      if (!response.ok || !payload.id) throw new Error(readError(response, payload));
      setDocumentUploadUrl(payload.documentsUploadUrl || '');
      const missingDocuments = uploadTypes.some(([type]) => !files[type]);
      if (missingDocuments) {
        setDocumentUploadNotice(payload.documentsUploadEmailSent
          ? 'Your secure upload link was emailed to you. Upload the remaining documents within seven days.'
          : payload.documentsUploadWarning || 'Your application was submitted. Contact OnBar if you do not receive a secure document upload link.');
      }
      setSubmitted(payload.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The application could not be submitted.');
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
      <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Application received</p>
        <h1 className="mt-2 text-3xl font-black">Your shop is in admin review</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Licence, identity, till-name and premises checks are not performed by an external provider here. OnBar must review the submitted documents and confirm these details before approval. Your shop is not live yet.</p>
        {documentUploadNotice && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm leading-6 text-amber-950">{documentUploadNotice}</p>}
        {documentUploadUrl && <a href={documentUploadUrl} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-400 px-5 text-sm font-bold text-amber-900 hover:bg-amber-50">Upload missing documents</a>}
        <p className="mt-4 text-xs text-slate-500">Application reference: {submitted}</p>
        <Link href="/merchant/network" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950">Track application status</Link>
      </section>
    </main>;
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
    <div className="mx-auto max-w-4xl">
      <Link href="/merchant/onboarding" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950"><ArrowLeft size={16} /> All partner applications</Link>
      <header className="mb-7 mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 text-slate-950"><Store /></span><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">OnBar alcohol retailer</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">Shop onboarding</h1></div></div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Eight steps to prepare a secure application. Submitted licence numbers are format-checked only; all identity, till, distance and licensing validation remains pending admin review.</p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {steps.map((label, index) => <button key={label} type="button" onClick={() => index < step && setStep(index)} className={`rounded-xl px-2 py-3 text-left text-[10px] font-black uppercase sm:text-xs ${step === index ? 'bg-amber-400 text-slate-950' : index < step ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}><span className="block opacity-70">Step {index + 1}</span>{label}</button>)}
        </div>
      </header>

      <section className="rounded-3xl bg-white p-5 text-slate-900 shadow-2xl sm:p-8">
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          You can skip any document uploads for now and continue your application. After you submit, we’ll email a secure upload link; complete the missing files within seven days. Your shop stays inactive until documents are received and verified.
        </div>
        {step === 0 && <div className="space-y-4">
          <h2 className="text-xl font-black">Account and shop</h2>
          <p className="text-sm text-slate-500">A verified OnBar account is used instead of a demo OTP. Check that the signed-in email is the one you want attached to this business.</p>
          <div className={`rounded-xl p-3 text-sm ${session?.verified ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}><ShieldCheck className="mr-2 inline h-4 w-4" />{session?.verified ? `Verified account: ${session.email}` : <>Sign in and verify your OnlineBar account before submission. <Link href={signInHref} className="font-bold underline">Sign in / create account</Link>.</>}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input required placeholder="Registered shop name *" value={form.businessName} onChange={event => updateForm('businessName', event.target.value)} />
            <Input placeholder="Trading name" value={form.tradingName} onChange={event => updateForm('tradingName', event.target.value)} />
            <Input required type="email" placeholder="Business email *" value={form.email} onChange={event => updateForm('email', event.target.value)} />
            <Input required type="tel" placeholder="Business phone *" value={form.phone} onChange={event => updateForm('phone', event.target.value)} />
            <Input required placeholder="Owner / responsible person's name *" value={form.ownerName} onChange={event => updateForm('ownerName', event.target.value)} />
            <Input required placeholder="Role" value={form.ownerRole} onChange={event => updateForm('ownerRole', event.target.value)} />
          </div>
        </div>}

        {step === 1 && <div className="space-y-4">
          <h2 className="text-xl font-black">Identity and owner documents</h2>
          <p className="text-sm text-slate-500">Only the last four ID digits are recorded in the application. The ID image and selfie go to a private document store for authorized admin review; no automatic face match is claimed.</p>
          <Input required inputMode="numeric" maxLength={4} placeholder="Last 4 digits of National ID" value={form.idLast4} onChange={event => updateForm('idLast4', event.target.value.replace(/\D/g, '').slice(0, 4))} />
          {uploadTypes.slice(0, 2).map(([type, label]) => <label key={type} className="block text-sm font-bold text-slate-700">{label} (optional for now)<Input key={`${type}-${fileInputResetKey}`} type="file" accept={type === 'selfie_photo' ? 'image/jpeg,image/png' : 'image/jpeg,image/png,application/pdf'} onChange={event => { const file = event.target.files?.[0]; if (file) setFiles(current => ({ ...current, [type]: file })); }} className="mt-2 h-auto min-h-11 py-2" /></label>)}
        </div>}

        {step === 2 && <div className="space-y-4">
          <h2 className="text-xl font-black">Shop location</h2>
          <p className="text-sm text-slate-500">The school / place-of-worship distance is self-reported and requires admin measurement. Under 300 m is flagged for review, not automatically blocked.</p>
          <Input required placeholder="Street address / estate *" value={form.address} onChange={event => updateForm('address', event.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2"><Input required placeholder="County" value={form.county} onChange={event => updateForm('county', event.target.value)} /><Input required placeholder="Town / city" value={form.town} onChange={event => updateForm('town', event.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><Input type="number" step="any" min="-90" max="90" placeholder="Latitude (optional)" value={form.latitude} onChange={event => updateForm('latitude', event.target.value)} /><Input type="number" step="any" min="-180" max="180" placeholder="Longitude (optional)" value={form.longitude} onChange={event => updateForm('longitude', event.target.value)} /></div>
          <Input required type="number" min="0" max="100000" placeholder="Approx. metres from nearest school / worship place" value={form.distanceToSchoolMeters} onChange={event => updateForm('distanceToSchoolMeters', event.target.value)} />
          {Number(form.distanceToSchoolMeters) < 300 && form.distanceToSchoolMeters !== '' && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">This self-reported distance will be flagged for manual review.</p>}
          {uploadTypes.slice(2, 3).map(([type, label]) => <label key={type} className="block text-sm font-bold text-slate-700">{label} (optional for now)<Input key={`${type}-${fileInputResetKey}`} type="file" accept="image/jpeg,image/png" onChange={event => { const file = event.target.files?.[0]; if (file) setFiles(current => ({ ...current, [type]: file })); }} className="mt-2 h-auto min-h-11 py-2" /></label>)}
        </div>}

        {step === 3 && <div className="space-y-4">
          <h2 className="text-xl font-black">Licences and documents</h2>
          <p className="text-sm text-slate-500">You can continue without licence references or file uploads. Add the references if you have them; otherwise, OnBar will review the application and required licence documents before approval.</p>
          <Input placeholder="County off-licence, e.g. NCC/OFF/2026/01482 (optional for now)" value={form.countyLicenceNumber} onChange={event => updateForm('countyLicenceNumber', event.target.value.toUpperCase())} />
          <p className="text-xs text-slate-500">If entered, format must be NCC/OFF/YYYY/12345. You can leave this blank and continue.</p>
          <Input placeholder="Nairobi online alcohol licence reference (optional for now)" value={form.onlineLicenceNumber} onChange={event => updateForm('onlineLicenceNumber', event.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            {uploadTypes.slice(3).map(([type, label]) => <label key={type} className="block text-sm font-bold text-slate-700">{label} (optional for now)<Input key={`${type}-${fileInputResetKey}`} type="file" accept="image/jpeg,image/png,application/pdf" onChange={event => { const file = event.target.files?.[0]; if (file) setFiles(current => ({ ...current, [type]: file })); }} className="mt-2 h-auto min-h-11 py-2" /></label>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['liquor_licence', 'online_alcohol_licence'] as const).map(type => <label key={type} className="block text-sm font-bold text-slate-700">{type === 'liquor_licence' ? 'County licence expiry' : 'Online licence expiry'}{files[type] ? ' *' : ' (optional until uploaded)'}<Input required={Boolean(files[type])} type="date" min={new Date().toISOString().slice(0, 10)} value={expiryDates[type]} onChange={event => setExpiryDates(current => ({ ...current, [type]: event.target.value }))} /></label>)}
          </div>
          <Button type="button" variant="outline" onClick={skipDocumentUploads} disabled={busy} className="w-full border-amber-300 text-amber-900">
            Skip all file uploads for now <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>}

        {step === 4 && <div className="space-y-4">
          <h2 className="text-xl font-black">M-Pesa till</h2>
          <p className="text-sm text-slate-500">We record this for admin review only. No M-Pesa name-match or payment verification provider is connected.</p>
          <Input required inputMode="numeric" maxLength={20} placeholder="Business till / paybill number" value={form.mpesaTill} onChange={event => updateForm('mpesaTill', event.target.value.replace(/\D/g, ''))} />
          <Input required placeholder="Name registered to the till" value={form.mpesaRegisteredName} onChange={event => updateForm('mpesaRegisteredName', event.target.value)} />
        </div>}

        {step === 5 && <div className="space-y-4">
          <div><h2 className="text-xl font-black">First products and excise stamps</h2><p className="mt-1 text-sm text-slate-500">Choose at least three products from the catalogue. Your stamp declaration is recorded for review; it is not an authenticity scan.</p></div>
          {catalogueError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{catalogueError}</p>}
          {!catalogue.length && !catalogueError && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Loading catalogue…</p>}
          <div className="space-y-3">{catalogue.map(product => {
            const selected = selectedProducts.includes(product.id);
            const details = productDetails[product.id];
            return <article key={product.id} className={`rounded-2xl border p-4 ${selected ? 'border-amber-400 bg-amber-50/50' : 'border-slate-200'}`}>
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={selected} onChange={() => toggleProduct(product)} className="mt-1 h-4 w-4 accent-amber-500" /><span><strong>{product.name}</strong><span className="ml-2 text-xs text-slate-500">{product.category}</span></span></label>
              {selected && details && <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input required placeholder="Pack / bottle size" value={details.size} onChange={event => updateProduct(product.id, { size: event.target.value })} />
                <Input required type="number" min="0" max="100" step="0.1" placeholder="ABV %" value={details.abv} onChange={event => updateProduct(product.id, { abv: event.target.value })} />
                <Input required type="number" min="1" step="0.01" placeholder="Your price (KSh)" value={details.price} onChange={event => updateProduct(product.id, { price: event.target.value })} />
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={details.exciseStampConfirmed} onChange={event => updateProduct(product.id, { exciseStampConfirmed: event.target.checked })} className="h-4 w-4 accent-amber-500" /> I confirm this stock carries KRA excise stamps</label>
              </div>}
            </article>;
          })}</div>
          <p className="text-xs font-bold text-slate-500">{selectedProducts.length} of at least 3 products selected</p>
        </div>}

        {step === 6 && <div className="space-y-4">
          <h2 className="text-xl font-black">Selling rules and signature</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold">Minimum age<select value={form.minAge} onChange={event => updateForm('minAge', event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"><option value="18">18</option><option value="21">21</option></select></label>
            <label className="text-xs font-bold">Max bottles / order<Input type="number" min="1" max="100" value={form.maxBottles} onChange={event => updateForm('maxBottles', event.target.value)} className="mt-2" /></label>
            <label className="text-xs font-bold">School buffer (metres)<Input type="number" min="0" max="5000" value={form.schoolBufferMeters} onChange={event => updateForm('schoolBufferMeters', event.target.value)} className="mt-2" /></label>
          </div>
          <div className="space-y-2">{requiredRules.map((rule, index) => <label key={rule} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm leading-5"><input type="checkbox" checked={acceptedRules[index]} onChange={event => setAcceptedRules(current => current.map((value, i) => i === index ? event.target.checked : value))} className="mt-1 h-4 w-4 shrink-0 accent-amber-500" />{rule}</label>)}</div>
          <Input required placeholder="Type your full name as signature" value={form.signature} onChange={event => updateForm('signature', event.target.value)} />
          <p className="text-xs leading-5 text-slate-500">Rule settings are recorded as your requested operating configuration; OnBar may adjust them after legal and compliance review.</p>
        </div>}

        {step === 7 && <div className="space-y-5">
          <div><h2 className="text-xl font-black">Review and submit</h2><p className="mt-1 text-sm text-slate-500">Submitting sends this application to the existing OnBar admin review queue. It does not publish your products or activate orders.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">{[
            ['Business', form.businessName],
            ['Owner', form.ownerName],
            ['Location', `${form.town}, ${form.county}`],
            ['County licence', form.countyLicenceNumber || 'To be provided for review'],
            ['Till', `ending ${form.mpesaTill.slice(-4)}`],
            ['Products', `${selectedProducts.length} selected`],
            ['School distance', `${form.distanceToSchoolMeters} m (self-reported)`],
            ['Rules signed', `${acceptedRules.filter(Boolean).length} / ${requiredRules.length}`]
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>)}</div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Manual review required: identity/selfie match, licence status, till-name ownership, premises distance and product stamp declarations are not verified automatically.</div>
          <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-700"><input type="checkbox" checked={privacyAcknowledged} onChange={event => setPrivacyAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-amber-500" /><span>I have read the <Link href="/privacy" target="_blank" className="font-bold underline">privacy notice</Link> and agree to submit these business details and documents for merchant verification. ID, selfie, till and licence information is private and is made available only to authorized reviewers and this business.</span></label>
          <Button type="button" disabled={busy || !session?.verified || !privacyAcknowledged || !invitationValidated} onClick={() => void submitApplication()} className="h-12 w-full rounded-xl bg-amber-400 font-black uppercase text-slate-950 hover:bg-amber-300">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</> : 'Submit application for review'}
          </Button>
        </div>}

        {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
        <div className="mt-7 flex justify-between border-t border-slate-100 pt-5">
          <Button type="button" variant="outline" disabled={step === 0 || busy} onClick={() => setStep(value => value - 1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
          {step < steps.length - 1 && <Button type="button" disabled={busy} onClick={advanceStep} className="bg-amber-400 font-black text-slate-950 hover:bg-amber-300">Continue<ArrowRight className="ml-2 h-4 w-4" /></Button>}
        </div>
      </section>
      <p className="mt-5 text-center text-xs text-slate-600">Licensing rules can change. Seek Kenyan legal advice before launch.</p>
    </div>
  </main>;
}
