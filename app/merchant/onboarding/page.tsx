'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileText,
  ImageIcon,
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
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
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
import {
  compressMerchantDocumentIfNeeded,
  MAX_MERCHANT_DOCUMENT_FILE_SIZE,
  MAX_MERCHANT_DOCUMENT_TOTAL_SIZE
} from '@/lib/merchantDocuments';
import { isBeverageInventoryProduct, isKitchenFoodProduct } from '@/lib/productDepartment';

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
  bar: 'Alcohol seller / venue',
  kitchen: 'Kitchen / prepared food',
  restaurant: 'Restaurant',
  food_vendor: 'Street-food vendor',
  supplier: 'Alcohol supplier / wholesaler',
  delivery_partner: 'Delivery partner'
};

const businessTypeDescriptions: Record<MerchantBusinessType, string> = {
  bar: 'Bars, lounges, bottle shops, and licensed alcohol retailers.',
  kitchen: 'Prepared meals, bites, snacks, and ready-to-serve food.',
  restaurant: 'Restaurants offering a full food menu for delivery or collection.',
  food_vendor: 'Street-food sellers, food trucks, grills, and pop-up vendors.',
  supplier: 'Wholesale alcohol and beverage supply partners.',
  delivery_partner: 'Approved delivery operators supporting order fulfilment.'
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
  onboardingMode?: 'admin_assisted' | 'shared' | 'merchant_self_serve';
  stepOwners?: Partial<Record<'business' | 'contact_area' | 'operations' | 'goods_docs', 'admin' | 'merchant'>>;
  editorRole?: 'admin' | 'merchant';
  draft?: {
    formData: Record<string, unknown>;
    currentStep: number;
    updatedAt: string;
  } | null;
}

type SharedDraftForm = {
  businessName: string;
  tradingName: string;
  email: string;
  phone: string;
  ownerName: string;
  ownerRole: string;
  address: string;
  county: string;
  town: string;
  latitude: string;
  longitude: string;
  operatingAreas: string;
  cuisineOrCategory: string;
  preparationCapacity: string;
  deliveryRadiusKm: string;
  collectionAvailable: boolean;
  hours: MerchantOperatingHours;
  selectedGoods: number[];
  offeredGoodsPrices: Record<number, string>;
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.trim() || 'The server returned an unexpected response.');
  }
}

const onboardingStages = ['business', 'contact_area', 'operations', 'goods_docs'] as const;

function formatFriendlyUploadError(message: string | null | undefined): string {
  const fallback = 'Your application could not be submitted.';
  const normalized = (message || fallback).toLowerCase();

  if (normalized.includes('request entity too large') || normalized.includes('payload too large') || normalized.includes('413')) {
    return 'One or more documents are too large for this submission. Compress each file to 5 MB or less and keep the total under 15 MB before sending.';
  }

  return message || fallback;
}

export default function MerchantOnboarding() {
  const [accountSession, setAccountSession] = useState<{ userId: string; email: string; accessToken: string; verified: boolean } | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
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
  const [documentsMayBeDeferred, setDocumentsMayBeDeferred] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedApplicationId, setSubmittedApplicationId] = useState('');
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [draftPrivacyAcknowledged, setDraftPrivacyAcknowledged] = useState(false);
  const [catalogOptions, setCatalogOptions] = useState<Array<{
    id: number;
    name: string;
    category: string;
    imageUrl: string;
    brand: string;
    cataloguePrice: number;
    stock: number;
    sizes: string[];
    is_bite?: boolean | null;
    is_snack?: boolean | null;
    is_souvenir?: boolean | null;
    sub_category?: string | null;
  }>>([]);
  const [selectedGoods, setSelectedGoods] = useState<number[]>([]);
  const [offeredGoodsPrices, setOfferedGoodsPrices] = useState<Record<number, string>>({});
  const [goodsSearch, setGoodsSearch] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState('');
  const [journeyAnalyticsEnabled, setJourneyAnalyticsEnabled] = useState(false);
  const [journeySessionId, setJourneySessionId] = useState('');
  const [invitation, setInvitation] = useState<CompanyInvitation | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const draftUpdatedAtRef = useRef<string | null>(null);
  const draftSaveRunningRef = useRef(false);
  const draftSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const latestDraftRef = useRef<{ formData: SharedDraftForm; currentStep: number } | null>(null);
  const saveDraftNowRef = useRef<() => Promise<boolean>>(async () => true);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setAccountLoading(false);
      return;
    }
    let active = true;
    const syncAccount = async () => {
      const { data, error } = await client.auth.getSession();
      if (!active) return;
      if (error) {
        console.error('[MerchantOnboarding] Could not load the signed-in account:', error);
        setError('Your OnlineBar account could not be checked. Refresh the page or sign in again.');
      }
      const user = data.session?.user;
      setAccountSession(user && data.session ? {
        userId: user.id,
        email: user.email || '',
        accessToken: data.session.access_token,
        verified: Boolean(user.email_confirmed_at || user.phone_confirmed_at)
      } : null);
      setAccountLoading(false);
    };
    void syncAccount();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const user = session?.user;
      setAccountSession(user && session ? {
        userId: user.id,
        email: user.email || '',
        accessToken: session.access_token,
        verified: Boolean(user.email_confirmed_at || user.phone_confirmed_at)
      } : null);
    });
    window.addEventListener('focus', syncAccount);
    return () => {
      active = false;
      window.removeEventListener('focus', syncAccount);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('invite');
    if (!token) {
      setDraftLoaded(true);
      return;
    }

    setInviteToken(token);
    setDraftLoaded(false);
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
        const draft = payload.invitation.draft;
        if (draft && draft.formData && typeof draft.formData === 'object') {
          const saved = draft.formData;
          const readText = (key: string, fallback = '') =>
            typeof saved[key] === 'string' ? saved[key] as string : fallback;
          setBusinessName(readText('businessName', payload.invitation.businessName));
          setTradingName(readText('tradingName'));
          setEmail(readText('email'));
          setPhone(readText('phone'));
          setOwnerName(readText('ownerName'));
          setOwnerRole(readText('ownerRole'));
          setAddress(readText('address'));
          setCounty(readText('county'));
          setTown(readText('town'));
          setLatitude(readText('latitude'));
          setLongitude(readText('longitude'));
          setOperatingAreas(readText('operatingAreas'));
          setCuisineOrCategory(readText('cuisineOrCategory'));
          setPreparationCapacity(readText('preparationCapacity'));
          setDeliveryRadiusKm(readText('deliveryRadiusKm'));
          setCollectionAvailable(saved.collectionAvailable === true);
          if (saved.hours && typeof saved.hours === 'object' && !Array.isArray(saved.hours)) {
            setHours(normalizeMerchantOperatingHours(saved.hours));
          }
          if (Array.isArray(saved.selectedGoods)) {
            setSelectedGoods(saved.selectedGoods.filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0));
          }
          if (saved.offeredGoodsPrices && typeof saved.offeredGoodsPrices === 'object' && !Array.isArray(saved.offeredGoodsPrices)) {
            setOfferedGoodsPrices(Object.fromEntries(
              Object.entries(saved.offeredGoodsPrices).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
            ) as Record<number, string>);
          }
          if (Number.isInteger(draft.currentStep) && draft.currentStep >= 0 && draft.currentStep < onboardingStages.length) {
            setStep(draft.currentStep);
          }
          draftUpdatedAtRef.current = draft.updatedAt;
          setDraftSavedAt(draft.updatedAt);
        }
        setDraftLoaded(true);
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

  const sendJourneyEvent = useCallback(async (
    eventType: 'onboarding_link_opened' | 'onboarding_step_started' | 'onboarding_step_completed' | 'onboarding_document_selected' | 'onboarding_stage_entered' | 'onboarding_stage_exited' | 'onboarding_rage_click' | 'onboarding_application_submitted' | 'onboarding_analytics_consent',
    stage: typeof onboardingStages[number],
    details: { durationMs?: number; controlType?: string } = {}
  ) => {
    const operationalEvent = eventType.startsWith('onboarding_') && [
      'onboarding_link_opened',
      'onboarding_step_started',
      'onboarding_step_completed',
      'onboarding_application_submitted',
      'onboarding_document_selected'
    ].includes(eventType);
    if ((!journeyAnalyticsEnabled && !operationalEvent) || !inviteToken || !journeySessionId) return;
    try {
      const response = await fetch('/api/merchant-applications/onboarding-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken,
          sessionId: journeySessionId,
          eventType,
          stage,
          ...details
        }),
        keepalive: true
      });
      if (!response.ok) {
        const result = await readJsonResponse<{ error?: string }>(response);
        console.warn('[MerchantOnboarding] Journey analytics were not saved:', result.error || response.statusText);
      }
    } catch (analyticsError) {
      console.warn('[MerchantOnboarding] Journey analytics could not be sent:', analyticsError);
    }
  }, [inviteToken, journeyAnalyticsEnabled, journeySessionId]);

  useEffect(() => {
    if (journeySessionId) {
      void sendJourneyEvent('onboarding_analytics_consent', onboardingStages[0]);
    }
  }, [journeyAnalyticsEnabled, journeySessionId, sendJourneyEvent]);

  useEffect(() => {
    if (!inviteToken) {
      setJourneySessionId('');
      return;
    }
    setJourneySessionId(crypto.randomUUID());
  }, [journeyAnalyticsEnabled, inviteToken]);

  const lastStageRef = useRef<number | null>(null);
  const stageEnteredAtRef = useRef(0);
  useEffect(() => {
    if (!journeyAnalyticsEnabled || !inviteToken || !journeySessionId) {
      lastStageRef.current = null;
      return;
    }
    const now = Date.now();
    const previousStep = lastStageRef.current;
    if (previousStep !== null && previousStep !== step && stageEnteredAtRef.current > 0) {
      void sendJourneyEvent('onboarding_stage_exited', onboardingStages[previousStep], {
        durationMs: Math.max(0, now - stageEnteredAtRef.current)
      });
    }
    lastStageRef.current = step;
    stageEnteredAtRef.current = now;
    void sendJourneyEvent('onboarding_step_started', onboardingStages[step]);
    if (journeyAnalyticsEnabled) void sendJourneyEvent('onboarding_stage_entered', onboardingStages[step]);
  }, [step, inviteToken, journeyAnalyticsEnabled, journeySessionId, sendJourneyEvent]);

  useEffect(() => {
    if (!journeyAnalyticsEnabled || !inviteToken || !journeySessionId) return;
    const recordLastStep = () => {
      if (stageEnteredAtRef.current <= 0) return;
      const currentStage = onboardingStages[lastStageRef.current ?? step];
      void sendJourneyEvent('onboarding_stage_exited', currentStage, {
        durationMs: Math.max(0, Date.now() - stageEnteredAtRef.current)
      });
      stageEnteredAtRef.current = 0;
    };
    window.addEventListener('pagehide', recordLastStep);
    return () => window.removeEventListener('pagehide', recordLastStep);
  }, [inviteToken, journeyAnalyticsEnabled, journeySessionId, sendJourneyEvent, step]);

  useEffect(() => {
    if (!journeyAnalyticsEnabled || !inviteToken || !journeySessionId) return;
    let lastTarget: Element | null = null;
    let clickCount = 0;
    let firstClickAt = 0;
    const trackRepeatedClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest('button,input,select,textarea')
        : null;
      if (!target) return;
      const now = Date.now();
      if (target !== lastTarget || now - firstClickAt > 2_000) {
        lastTarget = target;
        firstClickAt = now;
        clickCount = 1;
        return;
      }
      clickCount += 1;
      if (clickCount >= 5) {
        const tag = target.tagName.toLowerCase();
        if (['button', 'input', 'select', 'textarea'].includes(tag)) {
          void sendJourneyEvent('onboarding_rage_click', onboardingStages[step], { controlType: tag });
        }
        clickCount = 0;
        firstClickAt = now;
      }
    };
    document.addEventListener('click', trackRepeatedClick, true);
    return () => document.removeEventListener('click', trackRepeatedClick, true);
  }, [inviteToken, journeyAnalyticsEnabled, journeySessionId, sendJourneyEvent, step]);

  const handleDocumentSelect = async (type: DocumentType, file?: File) => {
    if (!file) {
      setDocuments(current => ({ ...current, [type]: undefined }));
      return;
    }

    const candidate = await compressMerchantDocumentIfNeeded(file);
    const totalBytes = Object.values({ ...documents, [type]: candidate })
      .filter((item): item is File => Boolean(item) && item instanceof File)
      .reduce((sum, item) => sum + item.size, 0);

    if (candidate.size > MAX_MERCHANT_DOCUMENT_FILE_SIZE || totalBytes > MAX_MERCHANT_DOCUMENT_TOTAL_SIZE) {
      setError('Each document must be 5 MB or smaller and the total upload must stay under 15 MB. Please compress the files and try again.');
      return;
    }

    setError(null);
    setDocuments(current => ({ ...current, [type]: candidate }));
    void sendJourneyEvent('onboarding_document_selected', onboardingStages[3], { controlType: type });
  };

  const moveToStep = async (nextStep: number) => {
    if (nextStep > step) {
      if (invitation?.onboardingMode && !(await saveDraftNowRef.current())) return;
      void sendJourneyEvent('onboarding_step_completed', onboardingStages[step]);
    }
    setStep(nextStep);
  };

  useEffect(() => {
    let active = true;
    async function loadCatalogOptions() {
      setCatalogLoading(true);
      try {
        const response = await fetch('/api/catalog/products?limit=500', { cache: 'no-store' });
        const payload = await readJsonResponse<{
          products?: Array<{
            id: number;
            name: string;
            category?: string | null;
            brand?: string | null;
            image_url?: string | null;
            price?: number | string | null;
            stock?: number | null;
            sizes?: string[] | null;
            is_bite?: boolean | null;
            is_snack?: boolean | null;
            is_souvenir?: boolean | null;
            sub_category?: string | null;
          }>
        }>(response);
        if (!response.ok || !payload.products) throw new Error('Could not load the available goods list.');
        if (!active) return;
        setCatalogError(null);
        setCatalogOptions(payload.products.map(product => ({
          id: Number(product.id),
          name: String(product.name),
          category: product.category || 'General',
          imageUrl: product.image_url || '',
          brand: product.brand || '',
          cataloguePrice: Number(product.price || 0),
          stock: Number(product.stock || 0),
          sizes: Array.isArray(product.sizes) ? product.sizes : [],
          is_bite: product.is_bite,
          is_snack: product.is_snack,
          is_souvenir: product.is_souvenir,
          sub_category: product.sub_category
        })).filter(product => product.id > 0 && product.name.trim().length > 0)
          .filter(product => businessType === 'delivery_partner'
            || (businessType === 'kitchen' || businessType === 'restaurant' || businessType === 'food_vendor'
              ? isKitchenFoodProduct(product)
              : businessType === 'bar' || businessType === 'supplier'
                ? isBeverageInventoryProduct(product)
                : true)));
      } catch {
        if (active) {
          setCatalogOptions([]);
          setCatalogError('The goods list could not be loaded. You can still submit your application and update your goods with OnBar later.');
        }
      } finally {
        if (active) setCatalogLoading(false);
      }
    }
    loadCatalogOptions();
    return () => {
      active = false;
    };
  }, [businessType]);

  const sharedDraftForm = useMemo<SharedDraftForm>(() => ({
    businessName,
    tradingName,
    email,
    phone,
    ownerName,
    ownerRole,
    address,
    county,
    town,
    latitude,
    longitude,
    operatingAreas,
    cuisineOrCategory,
    preparationCapacity,
    deliveryRadiusKm,
    collectionAvailable,
    hours,
    selectedGoods,
    offeredGoodsPrices
  }), [
    businessName, tradingName, email, phone, ownerName, ownerRole, address,
    county, town, latitude, longitude, operatingAreas, cuisineOrCategory,
    preparationCapacity, deliveryRadiusKm, collectionAvailable, hours,
    selectedGoods, offeredGoodsPrices
  ]);

  const saveDraftNow = useCallback(async (): Promise<boolean> => {
    if (!inviteToken || !invitation?.onboardingMode || submitted) return true;
    if (!draftLoaded) return false;
    if (!draftPrivacyAcknowledged) {
      setDraftSaveError('Accept the private draft notice before moving on so this section can be resumed.');
      return false;
    }
    const snapshot = latestDraftRef.current;
    if (!snapshot) return false;
    if (draftSaveRunningRef.current) {
      const saved = await draftSavePromiseRef.current;
      if (!saved) return false;
      return latestDraftRef.current !== snapshot ? await saveDraftNowRef.current() : true;
    }
    const stageKey = onboardingStages[snapshot.currentStep];
    if (invitation.stepOwners?.[stageKey] !== invitation.editorRole) return true;
    draftSaveRunningRef.current = true;
    const operation = (async () => {
      let failed = false;
      try {
      const response = await fetch('/api/merchant-onboarding-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({
          token: inviteToken,
          formData: snapshot.formData,
          currentStep: snapshot.currentStep,
          privacyAcknowledged: true,
          expectedUpdatedAt: draftUpdatedAtRef.current
        })
      });
      const result = await readJsonResponse<{ saved?: boolean; savedAt?: string; error?: string }>(response);
      if (!response.ok || !result.saved || !result.savedAt) {
        throw new Error(result.error || 'Your onboarding progress could not be saved.');
      }
      draftUpdatedAtRef.current = result.savedAt;
      setDraftSavedAt(result.savedAt);
      setDraftSaveError(null);
    } catch (saveError) {
      failed = true;
      setDraftSaveError(saveError instanceof Error ? saveError.message : 'Your onboarding progress could not be saved.');
    } finally {
      draftSaveRunningRef.current = false;
      draftSavePromiseRef.current = null;
    }
    return !failed;
    })();
    draftSavePromiseRef.current = operation;
    const saved = await operation;
    if (!saved) return false;
    return latestDraftRef.current !== snapshot ? await saveDraftNowRef.current() : true;
  }, [inviteToken, invitation, draftLoaded, draftPrivacyAcknowledged, submitted]);
  useEffect(() => {
    saveDraftNowRef.current = saveDraftNow;
  }, [saveDraftNow]);

  useEffect(() => {
    const snapshot = { formData: sharedDraftForm, currentStep: step };
    latestDraftRef.current = snapshot;
    if (!inviteToken || !invitation?.onboardingMode || !draftLoaded || !draftPrivacyAcknowledged || submitted
      || invitation.stepOwners?.[onboardingStages[step]] !== invitation.editorRole) return;
    const timer = window.setTimeout(() => { void saveDraftNow(); }, 900);
    return () => window.clearTimeout(timer);
  }, [sharedDraftForm, step, inviteToken, invitation, draftLoaded, draftPrivacyAcknowledged, submitted, saveDraftNow]);

  const requiredDocumentTypes = useMemo(
    () => requirements.filter(requirement => requirement.required).map(requirement => requirement.type),
    [requirements]
  );
  const filteredCatalogOptions = useMemo(() => {
    const term = goodsSearch.trim().toLowerCase();
    return catalogOptions.filter(option => !term
      || option.name.toLowerCase().includes(term)
      || option.category.toLowerCase().includes(term));
  }, [catalogOptions, goodsSearch]);

  useEffect(() => {
    if (step !== 3) return;
    const controller = new AbortController();
    setRequirementsLoading(true);
    setRequirementsLoaded(false);
    setError(null);
    const params = new URLSearchParams({ businessType, county, vendorType: businessType === 'delivery_partner' ? '' : vendorType });
    fetch(`/api/merchant-applications?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await readJsonResponse<{
          requirements?: Array<{ type: string; label: string; required: boolean }>;
          documentsMayBeDeferred?: boolean;
          error?: string;
        }>(response);
        if (!response.ok || !payload.requirements) throw new Error(payload.error || 'Document checklist could not be loaded.');
        const configured = payload.requirements.filter((requirement): requirement is DocumentRequirement =>
          Object.prototype.hasOwnProperty.call(documentLabels, requirement.type)
          && typeof requirement.label === 'string'
          && typeof requirement.required === 'boolean'
        ).map(requirement => ({ ...requirement, type: requirement.type as DocumentType }));
        setRequirements(configured);
        setDocumentsMayBeDeferred(payload.documentsMayBeDeferred === true);
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

  const toggleSelectedGood = (productId: number) => {
    setSelectedGoods(current => {
      if (current.includes(productId)) {
        setOfferedGoodsPrices(prices => {
          const next = { ...prices };
          delete next[productId];
          return next;
        });
        return current.filter(id => id !== productId);
      }
      return [...current, productId];
    });
  };

  const submitApplication = async () => {
    if (accountLoading) {
      setError('Checking your OnlineBar account. Please wait a moment and try again.');
      return;
    }
    if (!accountSession || !accountSession.verified) {
      setError('Sign in or create a verified OnlineBar account before submitting. Your account will be linked to this application so you can track its status from your profile.');
      return;
    }
    if (!requirementsLoaded || requirementsLoading) {
      setError('Wait for the current document checklist to load before submitting.');
      return;
    }
    if (selectedGoods.some(productId => {
      const price = offeredGoodsPrices[productId] || '';
      return !/^\d{1,8}(\.\d{1,2})?$/.test(price) || Number(price) <= 0 || Number(price) > 10_000_000;
    })) {
      setError('Enter a valid KSh offer price (more than 0 and no more than 10,000,000) for every selected item.');
      return;
    }
    if (!documentsMayBeDeferred && requiredDocumentTypes.some(type => !documents[type])) {
      setError('Upload all required documents before submitting.');
      return;
    }
    if (Object.keys(documents).some(type =>
      (type === 'liquor_licence' || type === 'wholesale_licence')
      && !expiryDates[type as DocumentType]
    )) {
      setError('Enter the expiry date for your alcohol licence before submitting.');
      return;
    }

    const totalDocumentBytes = Object.values(documents)
      .filter((item): item is File => Boolean(item) && item instanceof File)
      .reduce((sum, item) => sum + item.size, 0);

    if (totalDocumentBytes > MAX_MERCHANT_DOCUMENT_TOTAL_SIZE) {
      setError('The combined document upload is too large. Please compress the files or upload smaller documents before submitting.');
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
    payload.set('offeredGoods', JSON.stringify(selectedGoods));
    payload.set('offeredGoodsPricing', JSON.stringify(selectedGoods.map(productId => ({
      productId,
      price: Number(offeredGoodsPrices[productId])
    }))));
    payload.set('privacyAcknowledged', String(privacyAcknowledged));
    if (inviteToken) payload.set('inviteToken', inviteToken);
    for (const [type, file] of Object.entries(documents)) {
      if (!file) continue;
      payload.set(`document:${type}`, file);
      if (expiryDates[type as DocumentType]) payload.set(`expiry:${type}`, expiryDates[type as DocumentType] || '');
    }

    try {
      const response = await fetch('/api/merchant-applications', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accountSession.accessToken}` },
        body: payload
      });
      const result = await readJsonResponse<{ id?: string; error?: string }>(response);
      if (!response.ok) throw new Error(result.error || 'Your application could not be submitted.');
      if (journeySessionId) {
        if (journeyAnalyticsEnabled) {
          await sendJourneyEvent('onboarding_stage_exited', onboardingStages[step], {
            durationMs: Math.max(0, Date.now() - stageEnteredAtRef.current)
          });
          stageEnteredAtRef.current = 0;
        }
        await sendJourneyEvent('onboarding_application_submitted', onboardingStages[step]);
      }
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete('invite');
      window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      setSubmittedApplicationId(result.id || '');
      setSubmitted(true);
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : 'Your application could not be submitted.';
      setError(formatFriendlyUploadError(message));
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
            {documentsMayBeDeferred && requiredDocumentTypes.some(type => !documents[type])
              ? 'Your business details are with OnBar. The team will send you a secure link to upload the remaining documents; approval and activation wait until verification is complete.'
              : 'OnBar will review your business details and documents. A merchant ID is assigned after approval. Your business will not become active automatically.'}
          </p>
          {submittedApplicationId && <p className="mt-4 text-xs font-semibold text-slate-500">Application reference: {submittedApplicationId}</p>}
          {invitation ? (
            <div className="mx-auto mt-4 max-w-md rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left">
              <p className="text-sm font-bold text-slate-900">What happens next</p>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
                <li>The OnBar team reviews the business details, proposed goods and required documents.</li>
                <li>If anything is missing or needs correction, the team contacts you and can send a secure document-upload link.</li>
                <li>Approval is only possible after required compliance documents are present and current. An approved application receives a merchant ID and can access the Partner Workspace.</li>
              </ol>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                This application is linked to {invitation.businessName}. Submission is not approval, and does not publish products or automatically make the store live.
              </p>
            </div>
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
          {invitation && (
            <Link href="/profile#workspaces" className="mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-black uppercase text-white hover:opacity-90">
              Track from my OnlineBar account
            </Link>
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
          <p className="text-xs font-black uppercase tracking-[0.3em] text-primary">OnBar Partner Network</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Apply to sell or fulfil with OnBar</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600">
            Choose the partner lane that matches what you actually offer: alcohol, prepared food, street food, wholesale supply, or delivery. We review your documents before activation.
          </p>
          {!invitation && (
            <div className="mt-3 space-y-1 text-xs text-slate-500">
              <p>Opening an alcohol shop? <Link href="/merchant/liquor-onboarding" className="font-bold text-primary underline">Use the eight-step liquor retailer application</Link></p>
              <p>Already approved and adding branches? <Link href="/merchant/business" className="font-bold text-primary underline">Manage business locations</Link></p>
            </div>
          )}
        </header>

        <section className={`mb-5 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
          accountSession?.verified ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
        }`}>
          <div className="flex items-start gap-3">
            <ShieldCheck className={`mt-0.5 h-5 w-5 shrink-0 ${accountSession?.verified ? 'text-emerald-700' : 'text-amber-700'}`} />
            <div>
              <p className={`text-sm font-bold ${accountSession?.verified ? 'text-emerald-950' : 'text-amber-950'}`}>
                {accountLoading
                  ? 'Checking OnlineBar account…'
                  : accountSession?.verified
                    ? `Application tracking linked to ${accountSession.email || 'your verified account'}`
                    : 'Link this application to your OnlineBar account'}
              </p>
              <p className={`mt-1 text-xs leading-5 ${accountSession?.verified ? 'text-emerald-900' : 'text-amber-900'}`}>
                {accountSession?.verified
                  ? 'After submission, you can track its review and approval from your profile.'
                  : 'Sign in or create an account in a new tab. Return here when you are done; your application stays open.'}
              </p>
            </div>
          </div>
          {!accountSession?.verified && (
            <Button
              type="button"
              variant="outline"
              disabled={accountLoading}
              onClick={() => window.open('/auth?mode=signup', '_blank', 'noopener,noreferrer')}
              className="shrink-0 border-amber-300 bg-white text-amber-950"
            >
              Open account sign-in
            </Button>
          )}
        </section>

        <div className="mb-5 grid grid-cols-4 gap-2" aria-label="Application progress">
          {['Business', 'Contact & area', 'Operations', 'Goods & docs'].map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                const stageOwner = invitation?.stepOwners?.[onboardingStages[index]];
                const assignedHere = invitation?.onboardingMode && stageOwner === invitation.editorRole;
                const merchantFinalReview = invitation?.onboardingMode && index === onboardingStages.length - 1
                  && invitation.editorRole === 'merchant';
                if (index < step || assignedHere || merchantFinalReview) setStep(index);
              }}
              className={`rounded-xl px-2 py-3 text-[10px] font-black uppercase tracking-wide sm:text-xs ${
                index === step ? 'bg-primary text-white' : index < step ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-slate-400'
              }`}
            >
              {index + 1}. {label}
            </button>
          ))}
        </div>

        {invitation?.onboardingMode && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
            <div>
              <p className="font-bold text-emerald-950">
                Step owner: {invitation.stepOwners?.[onboardingStages[step]] === 'admin' ? 'OnBar team' : 'Merchant'}
              </p>
              <p className="mt-1 text-xs leading-5 text-emerald-900">
                {invitation.stepOwners?.[onboardingStages[step]] === invitation.editorRole
                  ? 'Draft progress autosaves after you accept the draft notice. For reliable shared editing, only one person should edit at a time. Documents must be selected again if you leave before submitting.'
                  : step === onboardingStages.length - 1 && invitation.editorRole === 'merchant'
                    ? 'Your team prepared this section. Review it, upload any outstanding documents, accept the privacy notice, and submit when it is accurate.'
                    : `This section is assigned to ${invitation.stepOwners?.[onboardingStages[step]] === 'admin' ? 'the OnBar team' : 'the merchant'}. Open the link using that person's account to edit it.`}
              </p>
              {draftSaveError ? (
                <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{draftSaveError}</p>
              ) : draftSavedAt ? (
                <p role="status" className="mt-2 text-xs font-semibold text-emerald-800">Saved {new Date(draftSavedAt).toLocaleTimeString()}</p>
              ) : draftPrivacyAcknowledged ? (
                <p role="status" className="mt-2 text-xs text-emerald-800">Saving your private draft…</p>
              ) : null}
              <label className="mt-3 flex max-w-2xl items-start gap-2 text-xs leading-5 text-emerald-950">
                <input
                  type="checkbox"
                  checked={draftPrivacyAcknowledged}
                  onChange={event => setDraftPrivacyAcknowledged(event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span>
                  I understand that this private application saves business details and selected goods so the merchant and authorized OnBar onboarding staff can resume it. Uploaded files are not saved as draft attachments; they must be selected again before submission. The merchant must still review the privacy notice and personally confirm before submission.
                </span>
              </label>
            </div>
            <Button type="button" variant="outline" disabled={!draftPrivacyAcknowledged || !draftLoaded || invitation.stepOwners?.[onboardingStages[step]] !== invitation.editorRole} onClick={() => void saveDraftNow()} className="border-emerald-300 bg-white text-emerald-900">
              Save progress
            </Button>
          </div>
        )}

        <fieldset
          disabled={Boolean(invitation?.onboardingMode
            && invitation.stepOwners?.[onboardingStages[step]] !== invitation.editorRole
            && !(step === onboardingStages.length - 1 && invitation.editorRole === 'merchant'))}
          className="contents"
        >
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
                      className={`flex min-h-20 items-start gap-3 rounded-2xl border p-4 text-left transition ${
                        businessType === type ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 hover:border-primary/50'
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">{isFoodBusinessType(type) ? <Utensils size={18} /> : type === 'delivery_partner' ? <Truck size={18} /> : <Store size={18} />}</span>
                      <span><strong className="block text-sm font-extrabold">{businessTypeLabels[type]}</strong><small className="mt-1 block text-xs font-medium leading-5 text-slate-500">{businessTypeDescriptions[type]}</small></span>
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
                  {invitation.onboardingMode && (
                    <div className="mt-4 border-t border-emerald-200 pt-3">
                      <p className="text-xs font-bold text-emerald-900">
                        {invitation.onboardingMode === 'admin_assisted'
                          ? 'OnBar prepares the details; the merchant reviews and submits.'
                          : invitation.onboardingMode === 'shared'
                            ? 'OnBar and the merchant complete the assigned sections together.'
                            : 'The merchant completes the application themselves.'}
                      </p>
                      {invitation.stepOwners && (
                        <ul className="mt-2 grid gap-1 text-xs text-emerald-900 sm:grid-cols-2">
                          {onboardingStages.map((stage, index) => (
                            <li key={stage}>
                              {['Business details', 'Contact & location', 'Operations', 'Goods & documents'][index]}: {
                                invitation.stepOwners?.[stage] === 'admin' ? 'OnBar team' : 'Merchant'
                              }
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ) : businessType !== 'delivery_partner' && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-800">
                Marketplace partner lane: {vendorTypeLabels[vendorType]}
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
              {!invitation && businessType === 'bar' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  Alcohol retailers need the dedicated licensing, product-stamp, identity and manual-review checklist.
                  <Link href="/merchant/liquor-onboarding" className="ml-1 font-black underline">Continue to the eight-step application</Link>
                </div>
              )}
              {invitation && (
                <>
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                    <input
                      type="checkbox"
                      checked={journeyAnalyticsEnabled}
                      onChange={event => setJourneyAnalyticsEnabled(event.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 accent-primary"
                    />
                    <span>
                      Help us improve this form by sharing step timing and repeated-click counts with the OnBar team. We do not record what you type. This is optional and does not affect your application.
                    </span>
                  </label>
                  {invitation.onboardingMode && draftSaveError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{draftSaveError}</p>}
                  {invitation.onboardingMode && !draftSaveError && draftSavedAt && <p role="status" className="text-xs font-semibold text-emerald-700">Progress saved securely at {new Date(draftSavedAt).toLocaleTimeString()}.</p>}
                </>
              )}
              {businessType === 'bar' && !invitation
                ? <Link href="/merchant/liquor-onboarding" className="flex h-12 w-full items-center justify-center rounded-xl bg-primary font-black uppercase text-white">Continue to liquor onboarding <ArrowRight size={16} className="ml-2" /></Link>
                : <Button disabled={(!invitation && businessName.trim().length < 2) || (Boolean(invitation?.onboardingMode) && !draftPrivacyAcknowledged)} onClick={() => moveToStep(1)} className="h-12 w-full rounded-xl font-black uppercase">
                  Continue <ArrowRight size={16} className="ml-2" />
                </Button>}
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
                <Button disabled={!contactAndLocationValid} onClick={() => moveToStep(2)} className="h-12 flex-1 rounded-xl font-black uppercase">
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
                  onClick={() => moveToStep(3)}
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
                <h2 className="text-xl font-black uppercase text-slate-900">Goods you can offer</h2>
                <p className="mt-1 text-sm text-slate-500">Choose the items you stock or are willing to sell through OnBar. This helps the review team understand your product mix.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Selected goods</p>
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black uppercase text-primary">{selectedGoods.length} chosen</span>
                </div>
                {catalogLoading ? (
                  <p className="text-sm text-slate-600">Loading your available product mix...</p>
                ) : catalogOptions.length === 0 ? (
                  <p role={catalogError ? 'alert' : undefined} className="text-sm text-slate-600">
                    {catalogError || 'There are no goods in the product list right now. You can continue with the rest of the application and update this later.'}
                  </p>
                ) : (
                  <>
                    <Input
                      value={goodsSearch}
                      onChange={event => setGoodsSearch(event.target.value)}
                      placeholder="Search products or categories"
                      aria-label="Search goods to offer"
                      className="mb-3 h-11 rounded-xl bg-white"
                    />
                    {filteredCatalogOptions.length ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {filteredCatalogOptions.map(option => {
                          const selected = selectedGoods.includes(option.id);
                          return (
                            <div key={option.id} className={`overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all ${selected ? 'border-primary ring-2 ring-primary/15 shadow-primary/10' : 'border-slate-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md'}`}>
                              <div role="button" tabIndex={0} onClick={() => toggleSelectedGood(option.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') toggleSelectedGood(option.id); }} className="block w-full cursor-pointer text-left">
                                <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-slate-100 via-white to-amber-50">
                                  {option.imageUrl ? (
                                    <Image src={option.imageUrl} alt={option.name} fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover transition-transform duration-500 hover:scale-105" unoptimized />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-slate-300"><ImageIcon className="h-10 w-10" /></div>
                                  )}
                                  <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${selected ? 'bg-primary text-white' : 'bg-white/90 text-slate-600'}`}>
                                    {selected ? 'Selected' : 'Choose item'}
                                  </span>
                                  <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/75 px-3 py-1 text-[10px] font-black text-white">
                                    {option.stock > 0 ? `${option.stock} in catalogue` : 'Stock to be confirmed'}
                                  </span>
                                </div>
                                <div className="space-y-2 p-4">
                                  <div className="flex items-start gap-3">
                                    <input type="checkbox" checked={selected} onChange={() => toggleSelectedGood(option.id)} onClick={event => event.stopPropagation()} className="mt-1 h-4 w-4 shrink-0 accent-primary" aria-label={`Select ${option.name}`} />
                                    <span className="min-w-0">
                                      <span className="block font-black text-slate-900">{option.name}</span>
                                      <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">{option.brand || option.category}</span>
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                                    <span className="rounded-lg bg-slate-50 px-3 py-2 font-bold text-slate-600">Catalogue {option.cataloguePrice > 0 ? `KSh ${option.cataloguePrice.toLocaleString()}` : 'Price on review'}</span>
                                    <span className="rounded-lg bg-slate-50 px-3 py-2 font-bold text-slate-600">{option.sizes.length ? option.sizes.join(' · ') : 'Standard size'}</span>
                                  </div>
                                </div>
                              </div>
                              {selected && (
                                <label className="block border-t border-primary/10 bg-primary/[0.03] p-4 text-xs font-black uppercase tracking-widest text-slate-600">
                                  Your offer price (KSh)
                                  <Input type="number" min="0.01" max="10000000" step="0.01" required value={offeredGoodsPrices[option.id] || ''} onChange={event => setOfferedGoodsPrices(current => ({ ...current, [option.id]: event.target.value }))} placeholder="e.g. 1,500" className="mt-2 h-11 rounded-xl bg-white text-base font-bold normal-case tracking-normal" />
                                </label>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-600">No products match that search. Selected goods stay saved.</p>
                    )}
                  </>
                )}
              </div>
              <p className="text-xs leading-5 text-slate-500">These are your proposed selling prices. OnBar can complete this step when it is assigned to the admin team. The customer-facing catalogue price is managed separately by OnBar in the product catalogue. Neither goods nor prices go live until review and approval; actual available stock is recorded in your inventory after approval.</p>
              <div>
                <h2 className="text-xl font-black uppercase text-slate-900">Documents & compliance</h2>
                <p className="mt-1 text-sm text-slate-500">The exact checklist depends on business type and county. Documents are private and only shared with authorized reviewers.</p>
              </div>
              {documentsMayBeDeferred && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  Document upload is temporarily optional. You can submit now and upload outstanding documents later using a secure link from the OnBar team. Your merchant account cannot be approved or activated until all required documents are verified.
                </div>
              )}
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
                          <span className="block text-sm font-bold text-slate-800">{requirement.label}{requirement.required && !documentsMayBeDeferred ? ' *' : ''}</span>
                          <span className="block text-xs text-slate-500">{documents[type]?.name || 'PDF, JPG or PNG; maximum 5 MB'}</span>
                        </span>
                      </span>
                      {documents[type] && <CheckCircle2 size={19} className="text-emerald-600" />}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        className="sr-only"
                        onChange={async event => {
                          const file = event.target.files?.[0];
                          await handleDocumentSelect(type, file);
                        }}
                      />
                    </label>
                    {documents[type] && (
                      <label className="mt-3 block text-xs font-semibold text-slate-500">
                        Expiry date {type === 'liquor_licence' || type === 'wholesale_licence' ? '*' : '(if applicable)'}
                        <Input
                          type="date"
                          min={new Date().toISOString().slice(0, 10)}
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
                <span>I have read the <Link href="/privacy" target="_blank" className="font-bold underline">privacy notice</Link> and understand that OnBar will use these business details and documents to assess this application, communicate about verification, and maintain necessary compliance records. {journeyAnalyticsEnabled && invitation ? 'I also chose to share onboarding step timing and repeated-click counts; field values are not recorded. ' : ''}This is not consent to marketing.</span>
              </label>
              {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
              <div className="sticky bottom-3 z-20 -mx-2 rounded-2xl border border-primary/15 bg-white/95 p-3 shadow-xl shadow-slate-900/10 backdrop-blur sm:-mx-0 sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Final step</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">Submit your application for review.</p>
                  </div>
                  <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" disabled={loading} onClick={() => setStep(2)} className="h-12 rounded-xl"><ArrowLeft size={16} className="mr-2" /> Back</Button>
                  <Button disabled={loading || requirementsLoading || !requirementsLoaded || !requirements.length || !privacyAcknowledged || (!documentsMayBeDeferred && requiredDocumentTypes.some(type => !documents[type]))} onClick={submitApplication} className="h-12 flex-1 rounded-xl font-black uppercase shadow-lg shadow-primary/20">
                    {loading ? <Loader2 size={17} className="mr-2 animate-spin" /> : <ShieldCheck size={17} className="mr-2" />}
                    Submit application
                  </Button>
                </div>
                {!privacyAcknowledged && <p className="mt-2 text-center text-[10px] font-semibold text-amber-700">Accept the privacy notice above to submit.</p>}
              </div>
            </section>
          )}
        </Card>
        </fieldset>

        <p className="mt-5 text-center text-xs text-slate-500">
          Need help? <Link className="font-bold underline" href="/contact">Contact OnBar support</Link>
          <span className="mx-1">•</span> <Link className="font-bold underline" href="/privacy">Privacy information</Link>
        </p>
        <div className="mt-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
          <Building2 className="mr-1 inline h-3 w-3" /> Applications are reviewed before activation
        </div>
      </div>
    </main>
  );
}
