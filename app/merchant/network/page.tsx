'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  BellRing,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  LogOut,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Store,
  TrendingUp,
  Truck,
  UserRound
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  isMerchantOpenAt,
  merchantWeekdays,
  normalizeMerchantOperatingHours,
  type MerchantOperatingHours,
  type MerchantWeekday
} from '@/lib/merchantAvailability';
import { supabase } from '@/lib/supabaseClient';
import MerchantAlertsPanel from '@/components/merchant/MerchantAlertsPanel';

type PartnerEvent = { event_type: string; details: Record<string, unknown> | null; created_at: string };
type PartnerDocument = { id: string; type: string; name: string; uploadedAt: string; expiresAt: string | null };
type PartnerBatch = {
  id: string;
  product_id: number;
  lot_code: string;
  supplier_name: string | null;
  received_at: string;
  expiry_at: string | null;
  quantity_received: number;
  available_quantity: number;
  on_hold: boolean;
  product: { id: number; name: string; sku: string | null; category: string | null } | null;
  movements: Array<{ movement_type: string; quantity_delta: number; note: string | null; created_at: string }>;
};
type FulfillmentEvent = { id: number; event_type: string; details: Record<string, unknown> | null; occurred_at: string };
type PartnerOrder = {
  id: number;
  status: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  created_at: string;
  items: Array<{ product_name: string; quantity: number; merchant_quantity: number; unit_price: number; listed_price: number; selling_price: number; spread: number; size: string | null }>;
  fulfillment: FulfillmentEvent[];
};
type PartnerIncident = {
  id: string;
  incident_code: string;
  order_id: number | null;
  batch_id: string | null;
  category: string;
  description: string;
  status: string;
  severity: string;
  resolution_note: string | null;
  created_at: string;
};
type PartnerApplication = {
  application: {
    id: string;
    merchant_code: string | null;
    business_name: string;
    trading_name: string | null;
    business_type: string;
    vendor_type: 'retailer' | 'wholesaler' | 'street_food' | null;
    prep_target_minutes: number | null;
    email: string;
    phone: string;
    owner_name: string;
    owner_role: string;
    address: string;
    country: string;
    county: string;
    town: string;
    latitude: number | null;
    longitude: number | null;
    operating_areas: string[];
    operating_hours: Record<string, unknown>;
    accepting_orders: boolean;
    availability_updated_at: string;
    cuisine_or_category: string | null;
    preparation_capacity: number | null;
    delivery_radius_km: number | null;
    collection_available: boolean;
    offered_goods: string[];
    offered_goods_pricing: Array<{ product_id: number; product_name: string; price: number; currency: string; listed_price: number; selling_price: number; spread: number; margin_percent: number | null }>;
    documents: PartnerDocument[];
    status: string;
    review_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
    updated_at: string;
  };
  events: PartnerEvent[];
  batches: PartnerBatch[];
  orders: PartnerOrder[];
  incidents: PartnerIncident[];
};

type MerchantPerformanceWindow = {
  decisions: number;
  accepted: number;
  rejected: number;
  acceptanceRate: number | null;
  averageResponseSeconds: number | null;
  delivered: number;
  exceptions: number;
  averagePrepMinutes: number | null;
  onTimePercent: number | null;
  averageRating: number | null;
  vendorComplaints: number;
  complaintsPer100: number | null;
  score: number | null;
  rank: number | null;
  zoneSize: number;
  grade: string | null;
};

type MerchantPerformance = {
  vendor: {
    applicationId: string;
    name: string;
    type: 'retailer' | 'wholesaler' | 'street_food';
    town: string;
    acceptingOrders: boolean;
    prepTargetMinutes: number;
  };
  targets: {
    replySeconds: number;
    prepMinutes: number;
    minimumDecisions: number;
    acceptancePercent: number;
    onTimePercent: number;
    rating: number;
    complaintsPer100: number;
    weights: {
      response: number;
      acceptance: number;
      onTime: number;
      rating: number;
      vendorFaultComplaints: number;
    };
  };
  complianceScore: number | null;
  windows: Record<7 | 30, MerchantPerformanceWindow>;
  limitations: { responseTime: string; timeouts: string; ratingsAndComplaints: string };
};

type Section = 'overview' | 'orders' | 'inventory' | 'performance' | 'incidents' | 'business' | 'alerts' | 'riders';
type RiderConnection = {
  id: string;
  phone: string;
  name: string | null;
  verificationStatus: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  createdAt: string;
  acceptedAt: string | null;
};

const businessLabels: Record<string, string> = {
  bar: 'Bar / Venue',
  kitchen: 'Kitchen',
  restaurant: 'Restaurant',
  food_vendor: 'Food Vendor',
  supplier: 'Supplier',
  delivery_partner: 'Delivery Partner'
};
const vendorTypeLabels: Record<NonNullable<PartnerApplication['application']['vendor_type']>, string> = {
  retailer: 'Alcohol retailer',
  wholesaler: 'Alcohol wholesaler',
  street_food: 'Street food vendor'
};
const statusLabels: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  information_requested: 'Information requested',
  approved: 'Approved',
  rejected: 'Not approved',
  suspended: 'Suspended',
  expired: 'Compliance expired'
};
const documentLabels: Record<string, string> = {
  business_registration: 'Business registration',
  county_license: 'County business licence',
  liquor_licence: 'Alcohol retail licence',
  wholesale_licence: 'Alcohol wholesale licence',
  kra_pin: 'KRA PIN certificate',
  medical_cert: 'Food handler medical certificate',
  food_hygiene: 'Food hygiene documentation',
  tax_document: 'Tax / business information',
  premises_document: 'Premises documentation',
  other_permit: 'Other permit'
};
const fulfillmentLabels: Record<string, string> = {
  accepted: 'Accepted',
  rejected: 'Rejected',
  preparing: 'Preparing',
  ready: 'Ready',
  handed_to_rider: 'Handed to rider',
  collected: 'Collected',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  exception: 'Needs attention'
};
const incidentLabels: Record<string, string> = {
  product_quality: 'Product quality',
  food_safety: 'Food safety',
  delivery: 'Delivery',
  conduct: 'Conduct',
  other: 'Other'
};
const fulfillmentNext: Record<string, string[]> = {
  '': ['accepted', 'rejected'],
  accepted: ['preparing', 'cancelled', 'exception'],
  preparing: ['ready', 'cancelled', 'exception'],
  ready: ['handed_to_rider', 'collected', 'cancelled', 'exception'],
  handed_to_rider: ['delivered', 'exception'],
  collected: ['delivered'],
  exception: ['preparing', 'ready', 'cancelled']
};
const sections: Array<{ id: Section; label: string; icon: typeof Store }> = [
  { id: 'overview', label: 'Overview', icon: Store },
  { id: 'orders', label: 'Orders', icon: Truck },
  { id: 'inventory', label: 'Inventory', icon: Box },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'riders', label: 'Riders', icon: UserRound },
  { id: 'alerts', label: 'Order alerts', icon: BellRing },
  { id: 'incidents', label: 'Reports', icon: AlertTriangle },
  { id: 'business', label: 'Business profile', icon: Building2 }
];
const weekdayLabels: Record<MerchantWeekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday'
};

function dateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleString();
}

function statusClass(status: string): string {
  if (status === 'approved' || status === 'delivered' || status === 'resolved') return 'bg-emerald-100 text-emerald-800';
  if (['rejected', 'suspended', 'expired', 'critical', 'action_required'].includes(status)) return 'bg-rose-100 text-rose-800';
  if (['information_requested', 'exception', 'investigating'].includes(status)) return 'bg-amber-100 text-amber-900';
  return 'bg-slate-100 text-slate-700';
}

function latestFulfillment(events: FulfillmentEvent[]): string {
  return [...events].sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime())[0]?.event_type || '';
}

function formatSeconds(seconds: number | null): string {
  if (seconds === null) return 'Not recorded';
  return seconds < 60 ? `${seconds} sec` : `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
}

function PerformanceMetricCard({
  label,
  value,
  target,
  meetsTarget
}: {
  label: string;
  value: string;
  target: string;
  meetsTarget: boolean | null;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Target: {target}</p>
        {meetsTarget !== null && <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${meetsTarget ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{meetsTarget ? 'On target' : 'Improve'}</span>}
      </div>
    </article>
  );
}

export default function OnBarPartnerNetworkPage() {
  const [accessToken, setAccessToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspace, setWorkspace] = useState<PartnerApplication[]>([]);
  const [performance, setPerformance] = useState<MerchantPerformance | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState('');
  const [performanceDays, setPerformanceDays] = useState<7 | 30>(7);
  const [selectedId, setSelectedId] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [deepLinkApplicationId, setDeepLinkApplicationId] = useState('');
  const [deepLinkOrderId, setDeepLinkOrderId] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loginError, setLoginError] = useState('');
  const [batchForm, setBatchForm] = useState({ productId: '', lotCode: '', supplierName: '', quantity: '', expiryAt: '', notes: '' });
  const [incidentForm, setIncidentForm] = useState({ link: '', category: 'other', description: '' });
  const [scheduleDraft, setScheduleDraft] = useState<MerchantOperatingHours>(() => normalizeMerchantOperatingHours(null));
  const [acceptingOrdersDraft, setAcceptingOrdersDraft] = useState(false);
  const [riderConnections, setRiderConnections] = useState<RiderConnection[]>([]);
  const [riderPhone, setRiderPhone] = useState('');
  const [ridersLoading, setRidersLoading] = useState(false);
  const [riderActionId, setRiderActionId] = useState('');

  const selected = workspace.find(item => item.application.id === selectedId) || workspace[0] || null;
  const canOperate = selected?.application.status === 'approved';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedSection = params.get('section');
    const validSections: Section[] = ['overview', 'orders', 'inventory', 'performance', 'incidents', 'business', 'alerts', 'riders'];
    if (requestedSection && validSections.includes(requestedSection as Section)) setSection(requestedSection as Section);
    setDeepLinkApplicationId(params.get('applicationId') || '');
    setDeepLinkOrderId(params.get('orderId') || '');
  }, []);

  useEffect(() => {
    if (!deepLinkApplicationId || !workspace.length) return;
    if (workspace.some(item => item.application.id === deepLinkApplicationId)) {
      setSelectedId(deepLinkApplicationId);
      setSection('orders');
    }
  }, [deepLinkApplicationId, workspace]);

  useEffect(() => {
    if (!deepLinkOrderId || section !== 'orders' || !selected?.orders.some(order => String(order.id) === deepLinkOrderId)) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`merchant-order-${deepLinkOrderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [deepLinkOrderId, section, selected?.orders]);

  useEffect(() => {
    if (!selected) return;
    setScheduleDraft(normalizeMerchantOperatingHours(selected.application.operating_hours));
    setAcceptingOrdersDraft(selected.application.accepting_orders);
  }, [selectedId, selected]);

  const loadWorkspace = useCallback(async (token: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/merchant/network', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const payload = await response.json() as { applications?: PartnerApplication[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Partner workspace could not be loaded.');
      const applications = payload.applications || [];
      setWorkspace(applications);
      setSelectedId(current => applications.some(item => item.application.id === current)
        ? current
        : applications[0]?.application.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Partner workspace could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setError('The OnBar sign-in service is not configured.');
      setLoading(false);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) {
        setLoginError('Your sign-in session could not be checked. Please sign in again.');
        setLoading(false);
        return;
      }
      const session = data.session;
      setAccessToken(session?.access_token || '');
      setEmail(session?.user.email || '');
      if (new URLSearchParams(window.location.search).get('recovery') === 'true' && session) {
        setIsRecovering(true);
      }
      if (session?.access_token) void loadWorkspace(session.access_token);
      else setLoading(false);
    }).catch(sessionError => {
      console.error('[MerchantNetwork] Could not read browser session:', sessionError);
      if (mounted) {
        setLoginError('Your sign-in session could not be checked. Please sign in again.');
        setLoading(false);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const token = session?.access_token || '';
      setAccessToken(token);
      setEmail(session?.user.email || '');
      if (event === 'PASSWORD_RECOVERY') setIsRecovering(true);
      if (token && event === 'SIGNED_IN') void loadWorkspace(token);
      if (!token) {
        setWorkspace([]);
        setSelectedId('');
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadWorkspace]);

  useEffect(() => {
    const applicationId = selected?.application.id;
    if (section !== 'performance' || !accessToken || !applicationId || selected?.application.status !== 'approved') {
      setPerformance(null);
      setPerformanceError('');
      setPerformanceLoading(false);
      return;
    }

    let active = true;
    const loadPerformance = async (silent: boolean) => {
      if (!silent) setPerformanceLoading(true);
      setPerformanceError('');
      try {
        const response = await fetch(`/api/merchant/scorecard?applicationId=${encodeURIComponent(applicationId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store'
        });
        const result = await response.json() as MerchantPerformance & { error?: string };
        if (!response.ok || !result.vendor || !result.windows) {
          throw new Error(result.error || 'Your performance records could not be loaded.');
        }
        if (active) setPerformance(result);
      } catch (loadError) {
        if (active) {
          setPerformanceError(loadError instanceof Error ? loadError.message : 'Your performance records could not be loaded.');
        }
      } finally {
        if (active) setPerformanceLoading(false);
      }
    };

    void loadPerformance(false);
    const interval = window.setInterval(() => void loadPerformance(true), 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [accessToken, section, selected?.application.id, selected?.application.status]);

  const loadRiderConnections = useCallback(async () => {
    const applicationId = selected?.application.id;
    if (!accessToken || !applicationId || selected?.application.status !== 'approved') return;
    setRidersLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/merchant/riders?applicationId=${encodeURIComponent(applicationId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const result = await response.json() as { riders?: RiderConnection[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'Rider connections could not be loaded.');
      setRiderConnections(result.riders || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Rider connections could not be loaded.');
    } finally {
      setRidersLoading(false);
    }
  }, [accessToken, selected?.application.id, selected?.application.status]);

  useEffect(() => {
    if (section === 'riders') void loadRiderConnections();
  }, [section, loadRiderConnections]);

  const addRider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !accessToken) return;
    setRiderActionId('new');
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/merchant/riders?applicationId=${encodeURIComponent(selected.application.id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: riderPhone })
      });
      const result = await response.json() as {
        rider?: RiderConnection;
        notificationSent?: boolean;
        notificationWarning?: string;
        error?: string;
      };
      if (!response.ok || !result.rider) throw new Error(result.error || 'The rider invitation could not be saved.');
      setRiderPhone('');
      setMessage(result.rider.verificationStatus === 'Verified'
        ? result.notificationWarning
          || (result.notificationSent
            ? `Push invitation sent to ${result.rider.name || result.rider.phone}. They must accept it in the rider app before connecting.`
            : `Invitation saved for ${result.rider.name || result.rider.phone}. Ask them to open Rider Terminal and accept it before connecting.`)
        : 'Invitation saved. Ask this rider to apply or sign in with this phone number, finish verification, then accept the invitation in the rider app.');
      await loadRiderConnections();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The rider invitation could not be saved.');
    } finally {
      setRiderActionId('');
    }
  };

  const removeRider = async (connection: RiderConnection) => {
    if (!selected || !accessToken) return;
    setRiderActionId(connection.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/merchant/riders?applicationId=${encodeURIComponent(selected.application.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId: connection.id })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The rider connection could not be removed.');
      setMessage(`${connection.name || connection.phone} is no longer connected to this business.`);
      await loadRiderConnections();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The rider connection could not be removed.');
    } finally {
      setRiderActionId('');
    }
  };

  const apiAction = async (body: Record<string, unknown>, successMessage: string) => {
    if (!accessToken) {
      setError('Your sign-in session has expired. Sign in again to continue.');
      return false;
    }
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/merchant/network', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Your update could not be saved.');
      setMessage(successMessage);
      await loadWorkspace(accessToken);
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Your update could not be saved.');
      return false;
    } finally {
      setWorking(false);
    }
  };

  const productOptions = useMemo(() => {
    if (!selected) return [];
    const products = new Map<number, NonNullable<PartnerBatch['product']>>();
    for (const batch of selected.batches) {
      if (batch.product) products.set(batch.product.id, batch.product);
    }
    return [...products.values()];
  }, [selected]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError('');
    if (!supabase) {
      setLoginError('The OnBar sign-in service is not configured.');
      return;
    }
    setWorking(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setLoginError(signInError.message);
        return;
      }
      if (data.session?.access_token) {
        setAccessToken(data.session.access_token);
        setEmail(data.user.email || email.trim());
        await loadWorkspace(data.session.access_token);
      }
    } catch (signInError) {
      console.error('[MerchantNetwork] Sign-in request failed:', signInError);
      setLoginError('Sign-in could not reach OnBar. Check your connection and try again.');
    } finally {
      setWorking(false);
    }
  };

  const requestPasswordReset = async () => {
    if (!supabase || !email.trim()) {
      setLoginError('Enter your account email address first.');
      return;
    }
    setResettingPassword(true);
    setLoginError('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/merchant/network?recovery=true`
      });
      if (resetError) setLoginError(resetError.message);
      else setMessage('If that account exists, OnBar has sent a password reset link to the email address.');
    } catch (resetError) {
      console.error('[MerchantNetwork] Password reset request failed:', resetError);
      setLoginError('The password reset request could not reach OnBar. Try again later.');
    } finally {
      setResettingPassword(false);
    }
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      setLoginError('The OnBar sign-in service is not configured.');
      return;
    }
    if (newPassword.length < 8) {
      setLoginError('Choose a password with at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setLoginError('The passwords do not match.');
      return;
    }
    setWorking(true);
    setLoginError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setLoginError(updateError.message);
        return;
      }
      setIsRecovering(false);
      setNewPassword('');
      setConfirmPassword('');
      window.history.replaceState({}, '', '/merchant/network');
      setMessage('Your password was updated successfully.');
      if (accessToken) await loadWorkspace(accessToken);
    } catch (updateError) {
      console.error('[MerchantNetwork] Password update failed:', updateError);
      setLoginError('Your password could not be updated. Request another reset link and try again.');
    } finally {
      setWorking(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) setError('Could not safely end your session. Please try again.');
      else {
        setAccessToken('');
        setWorkspace([]);
        setSelectedId('');
        setMessage('');
      }
    } catch (signOutError) {
      console.error('[MerchantNetwork] Sign-out request failed:', signOutError);
      setError('Could not safely end your session. Please try again.');
    }
  };

  const submitBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const saved = await apiAction({
      operation: 'receive_batch',
      applicationId: selected.application.id,
      productId: batchForm.productId,
      lotCode: batchForm.lotCode,
      supplierName: batchForm.supplierName,
      quantity: batchForm.quantity,
      expiryAt: batchForm.expiryAt || null,
      notes: batchForm.notes
    }, 'Inventory receipt recorded.');
    if (saved) setBatchForm({ productId: '', lotCode: '', supplierName: '', quantity: '', expiryAt: '', notes: '' });
  };

  const submitIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const [type, id] = incidentForm.link.split(':');
    const saved = await apiAction({
      operation: 'report_incident',
      applicationId: selected.application.id,
      category: incidentForm.category,
      description: incidentForm.description,
      batchId: type === 'batch' ? id : null,
      orderId: type === 'order' ? id : null
    }, 'Incident report submitted to OnBar.');
    if (saved) setIncidentForm({ link: '', category: 'other', description: '' });
  };

  const submitAvailability = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    await apiAction({
      operation: 'update_availability',
      applicationId: selected.application.id,
      operatingHours: scheduleDraft,
      acceptingOrders: acceptingOrdersDraft
    }, acceptingOrdersDraft
      ? 'Hours saved. New paid orders can route here only while you are open and accepting orders.'
      : 'Hours saved. This business is offline for new orders; existing assigned orders remain visible.');
  };

  if (isRecovering) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
        <section className="mx-auto max-w-xl rounded-[2rem] bg-white p-6 shadow-xl sm:p-10">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Store size={27} /></div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">OnBar Merchant Network</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Set a new password</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Choose a new password for your verified OnBar account.</p>
          <form onSubmit={updatePassword} className="mt-7 space-y-4">
            <label className="block text-sm font-bold text-slate-700">New password
              <Input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={event => setNewPassword(event.target.value)} className="mt-2 h-12 rounded-xl" />
            </label>
            <label className="block text-sm font-bold text-slate-700">Confirm new password
              <Input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="mt-2 h-12 rounded-xl" />
            </label>
            {loginError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{loginError}</p>}
            <Button type="submit" disabled={working} className="h-12 w-full rounded-xl font-black uppercase">
              {working && <Loader2 size={16} className="mr-2 animate-spin" />} Save new password
            </Button>
          </form>
        </section>
      </main>
    );
  }

  if (!accessToken) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-xl">
          <Link href="/merchant/onboarding" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-primary"><ArrowLeft size={16} /> Apply to join OnBar</Link>
          <section className="mt-6 rounded-[2rem] bg-white p-6 shadow-xl sm:p-10">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Store size={27} /></div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">OnBar Merchant Network</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Partner Workspace</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">Sign in with a verified OnBar account using the same email address listed on your merchant application.</p>
            <form onSubmit={signIn} className="mt-7 space-y-4">
              <label className="block text-sm font-bold text-slate-700">Email address
                <Input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-2 h-12 rounded-xl" />
              </label>
              <label className="block text-sm font-bold text-slate-700">Password
                <Input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 h-12 rounded-xl" />
              </label>
              {loginError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{loginError}</p>}
              {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
              <Button type="submit" disabled={working} className="h-12 w-full rounded-xl font-black uppercase">
                {working && <Loader2 size={16} className="mr-2 animate-spin" />} Sign in securely
              </Button>
              <button type="button" disabled={resettingPassword} onClick={() => void requestPasswordReset()} className="w-full text-center text-sm font-bold text-primary underline">
                {resettingPassword ? 'Sending reset link...' : 'Forgot your password?'}
              </button>
            </form>
            <p className="mt-7 border-t border-slate-100 pt-5 text-sm text-slate-600">
              New to OnBar? <Link href="/auth" className="font-bold text-primary underline">Create a verified OnBar account</Link>, then return here to track your application.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const application = selected?.application;
  const overview = selected;
  const performanceWindow = performance?.windows[performanceDays];
  const coachingTips = performance && performanceWindow ? [
    performanceWindow.averageResponseSeconds !== null
      && performanceWindow.averageResponseSeconds > performance.targets.replySeconds
      ? `Try to answer new order requests within ${performance.targets.replySeconds} seconds.`
      : null,
    performanceWindow.acceptanceRate !== null
      && performanceWindow.acceptanceRate < performance.targets.acceptancePercent
      ? `Keep your acceptance rate at or above ${performance.targets.acceptancePercent}% by keeping stock and opening hours current.`
      : null,
    performanceWindow.averagePrepMinutes !== null
      && performanceWindow.averagePrepMinutes > performance.targets.prepMinutes
      ? `Your recorded prep time is above the ${performance.targets.prepMinutes}-minute target.`
      : null,
    performanceWindow.onTimePercent !== null
      && performanceWindow.onTimePercent < performance.targets.onTimePercent
      ? `Mark orders ready on time to reach the ${performance.targets.onTimePercent}% preparation target.`
      : null,
    performanceWindow.averageRating !== null
      && performanceWindow.averageRating < performance.targets.rating
      ? 'Review product accuracy and customer feedback to improve your recorded rating.'
      : null,
    performanceWindow.complaintsPer100 !== null
      && performanceWindow.complaintsPer100 > performance.targets.complaintsPer100
      ? 'Check order packing and item accuracy to reduce complaints formally attributed to the business.'
      : null,
    performance.complianceScore !== null && performance.complianceScore < 100
      ? 'Review your submitted business documents and renew any expired or missing licence.'
      : null
  ].filter((tip): tip is string => tip !== null).slice(0, 3) : [];
  const performanceMetrics = performance && performanceWindow ? [
      {
        label: 'Reply time',
        value: formatSeconds(performanceWindow.averageResponseSeconds),
        target: `Under ${performance.targets.replySeconds} sec`,
        meetsTarget: performanceWindow.averageResponseSeconds === null ? null : performanceWindow.averageResponseSeconds <= performance.targets.replySeconds
      },
      {
        label: 'Acceptance',
        value: performanceWindow.acceptanceRate === null ? 'Not recorded' : `${performanceWindow.acceptanceRate}%`,
        target: `At least ${performance.targets.acceptancePercent}%`,
        meetsTarget: performanceWindow.acceptanceRate === null ? null : performanceWindow.acceptanceRate >= performance.targets.acceptancePercent
      },
      {
        label: 'Prep time',
        value: performanceWindow.averagePrepMinutes === null ? 'Not recorded' : `${performanceWindow.averagePrepMinutes} min`,
        target: `Under ${performance.targets.prepMinutes} min`,
        meetsTarget: performanceWindow.averagePrepMinutes === null ? null : performanceWindow.averagePrepMinutes <= performance.targets.prepMinutes
      },
      {
        label: 'Ready on time',
        value: performanceWindow.onTimePercent === null ? 'Not recorded' : `${performanceWindow.onTimePercent}%`,
        target: `At least ${performance.targets.onTimePercent}%`,
        meetsTarget: performanceWindow.onTimePercent === null ? null : performanceWindow.onTimePercent >= performance.targets.onTimePercent
      },
      {
        label: 'Customer rating',
        value: performanceWindow.averageRating === null ? 'Not recorded' : `${performanceWindow.averageRating.toFixed(1)} / 5`,
        target: `At least ${performance.targets.rating.toFixed(1)} / 5`,
        meetsTarget: performanceWindow.averageRating === null ? null : performanceWindow.averageRating >= performance.targets.rating
      },
      {
        label: 'Vendor-fault complaints',
        value: performanceWindow.complaintsPer100 === null ? 'Not recorded' : `${performanceWindow.complaintsPer100} per 100`,
        target: `Under ${performance.targets.complaintsPer100} per 100`,
        meetsTarget: performanceWindow.complaintsPer100 === null ? null : performanceWindow.complaintsPer100 <= performance.targets.complaintsPer100
      }
  ] : [];

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">OnBar Merchant Network</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">Partner Workspace</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{email}</span>
            <Button variant="outline" onClick={() => void signOut()} className="rounded-xl"><LogOut size={16} className="mr-2" /> Sign out</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        {workspace.length > 1 && (
          <label className="mb-5 block max-w-lg text-xs font-black uppercase tracking-wide text-slate-500">
            Business
            <select value={selectedId} onChange={event => setSelectedId(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-800">
              {workspace.map(item => <option key={item.application.id} value={item.application.id}>{item.application.business_name} · {statusLabels[item.application.status] || item.application.status}</option>)}
            </select>
          </label>
        )}

        {(error || message) && <div role={error ? 'alert' : 'status'} className={`mb-5 flex items-start justify-between gap-3 rounded-xl p-4 text-sm ${error ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
          <span>{error || message}</span>
          <button onClick={() => { setError(''); setMessage(''); }} aria-label="Dismiss message">×</button>
        </div>}

        <nav className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="Merchant workspace sections">
          {sections.filter(item => item.id !== 'performance' || Boolean(selected?.application.vendor_type)).map(item => {
            const Icon = item.icon;
            return <button key={item.id} onClick={() => setSection(item.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wide ${section === item.id ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}><Icon size={16} />{item.label}</button>;
          })}
          <button onClick={() => accessToken && void loadWorkspace(accessToken)} aria-label="Refresh workspace" className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 hover:bg-slate-100"><RefreshCw size={16} /></button>
        </nav>

        {loading && <div className="rounded-2xl bg-white p-12 text-center text-slate-500"><Loader2 className="mx-auto mb-3 animate-spin text-primary" /><p className="text-sm font-semibold">Loading your business workspace...</p></div>}

        {!loading && !overview && (
          <section className="rounded-2xl bg-white p-7 shadow-sm sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><Clock3 /></div>
            <h2 className="mt-4 text-xl font-black text-slate-900">No application is linked to this account</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">The signed-in email must exactly match the email submitted with your OnBar partner application. If you haven’t applied yet, start an application. If you used another address, sign out and use an account verified with that address.</p>
            <Link href="/merchant/onboarding" className="mt-5 inline-flex h-11 items-center rounded-xl bg-primary px-4 text-sm font-black uppercase text-white">Start partner application</Link>
          </section>
        )}

        {!loading && overview && section === 'performance' && (
          <section className="space-y-5">
            {application?.status !== 'approved' ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                Your performance page becomes available after OnBar approves this business.
              </div>
            ) : application.vendor_type === null ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                Performance targets are available for alcohol retailers, alcohol wholesalers, and street food vendors.
              </div>
            ) : performanceLoading && !performance ? (
              <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">
                <Loader2 className="mx-auto mb-3 animate-spin text-primary" />Loading recorded performance…
              </div>
            ) : performanceError ? (
              <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{performanceError}</div>
            ) : performance && performanceWindow ? (
              <>
                <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-slate-950 p-5 text-white sm:p-7">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Merchant performance · recorded results</p>
                    <h2 className="mt-2 text-2xl font-black sm:text-3xl">{performance.vendor.name}</h2>
                    <p className="mt-1 text-sm text-slate-300">{vendorTypeLabels[performance.vendor.type]} · {performance.vendor.town || 'Town not set'}</p>
                    <p className="mt-3 text-xs text-slate-400">{performance.vendor.acceptingOrders ? 'Online for new orders' : 'Offline for new orders'}</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1" aria-label="Performance reporting period">
                    {([7, 30] as const).map(days => (
                      <button key={days} type="button" aria-pressed={performanceDays === days} onClick={() => setPerformanceDays(days)}
                        className={`min-h-11 rounded-lg px-4 text-sm font-bold ${performanceDays === days ? 'bg-white text-slate-950' : 'text-slate-200 hover:bg-white/10'}`}>
                        {days} days
                      </button>
                    ))}
                  </div>
                </header>

                <div className="grid gap-4 sm:grid-cols-2">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-black text-primary">
                        {performanceWindow.grade || '—'}
                      </div>
                      <div>
                        <p className="text-3xl font-black text-slate-900">{performanceWindow.score === null ? '—' : `${performanceWindow.score} / 100`}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {performanceWindow.decisions < performance.targets.minimumDecisions
                            ? `${performanceWindow.decisions} decisions recorded; rank eligibility starts at ${performance.targets.minimumDecisions}.`
                            : performanceWindow.rank
                              ? `Rank ${performanceWindow.rank} of ${performanceWindow.zoneSize} ${performance.vendor.type.replace('_', ' ')} vendors in ${performance.vendor.town}.`
                              : `No comparable rank is available in ${performance.vendor.town}.`}
                        </p>
                      </div>
                    </div>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Compliance documents</p>
                        <p className="mt-2 text-3xl font-black text-slate-900">{performance.complianceScore === null ? 'Not rated' : `${performance.complianceScore}%`}</p>
                        <p className="mt-1 text-sm text-slate-500">Required documents on file and not expired.</p>
                      </div>
                      <ShieldCheck className="mt-1 text-primary" />
                    </div>
                  </article>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {performanceMetrics.map(metric => (
                    <PerformanceMetricCard key={metric.label} {...metric} />
                  ))}
                  <PerformanceMetricCard
                    label="Orders accepted"
                    value={`${performanceWindow.accepted} / ${performanceWindow.decisions}`}
                    target="Respond to each assigned order"
                    meetsTarget={null}
                  />
                  <PerformanceMetricCard
                    label="Delivered"
                    value={String(performanceWindow.delivered)}
                    target="Recorded merchant fulfilment"
                    meetsTarget={null}
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="font-black text-slate-900">What to do this week</h3>
                    {coachingTips.length ? (
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                        {coachingTips.map(tip => <li key={tip} className="rounded-xl bg-amber-50 p-3">{tip}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                        {performanceWindow.decisions
                          ? 'No recorded performance target needs attention in this period.'
                          : 'No decisions are recorded yet. Keep availability and stock current to receive eligible orders.'}
                      </p>
                    )}
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="font-black text-slate-900">How the score works</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {Math.round(performance.targets.weights.response * 100)}% reply speed, {Math.round(performance.targets.weights.acceptance * 100)}% acceptance,
                      {' '}{Math.round(performance.targets.weights.onTime * 100)}% ready-on-time, {Math.round(performance.targets.weights.rating * 100)}% customer ratings,
                      {' '}{Math.round(performance.targets.weights.vendorFaultComplaints * 100)}% complaints formally attributed to the vendor.
                      Missing data is left unscored rather than guessed. Rider delays and customer/platform fault complaints do not lower your vendor score.
                    </p>
                    <p className="mt-3 text-xs leading-5 text-slate-500">{performance.limitations.responseTime} {performance.limitations.timeouts}</p>
                  </article>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No vendor performance data is available yet.</div>
            )}
          </section>
        )}

        {!loading && overview && application && section === 'overview' && (
          <div className="space-y-6">
            <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-primary">{application.merchant_code || businessLabels[application.business_type] || 'Partner application'}</p>
                <h2 className="mt-2 text-2xl font-black text-slate-900">{application.business_name}</h2>
                <p className="mt-1 text-sm text-slate-500">{businessLabels[application.business_type] || application.business_type} · {application.town}, {application.county}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-4 py-2 text-xs font-black uppercase ${statusClass(application.status)}`}>{statusLabels[application.status] || application.status}</span>
                {application.status === 'approved' && <span className={`rounded-full px-4 py-2 text-xs font-black uppercase ${application.accepting_orders && isMerchantOpenAt(application.operating_hours) ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                  {application.accepting_orders && isMerchantOpenAt(application.operating_hours) ? 'Open · accepting new orders' : application.accepting_orders ? 'Closed by schedule' : 'Offline · not accepting'}
                </span>}
              </div>
            </section>
            {application.review_note && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><strong>Latest review update:</strong> {application.review_note}</section>}
            {application.status !== 'approved' && <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="font-black text-slate-900">Application progress</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {application.status === 'submitted' || application.status === 'under_review'
                  ? 'OnBar is reviewing your submitted business details and documents. Operational tools become available only after approval.'
                  : application.status === 'information_requested'
                    ? 'OnBar has requested more information. Review the note above and contact the review team to provide the requested updates.'
                    : 'Operational actions are currently unavailable for this application. Contact OnBar support if you need help.'}
              </p>
            </section>}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Linked products', value: productOptions.length, icon: Box },
                { label: 'Tracked batches', value: overview.batches.length, icon: PackageCheck },
                { label: 'Assigned orders', value: overview.orders.length, icon: Truck },
                { label: 'Open reports', value: overview.incidents.filter(item => !['resolved', 'closed'].includes(item.status)).length, icon: AlertTriangle }
              ].map(card => {
                const Icon = card.icon;
                return <div key={card.label} className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={19} /></div><p className="mt-4 text-2xl font-black text-slate-900">{card.value}</p><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{card.label}</p></div>;
              })}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 font-black text-slate-900"><Clock3 size={17} /> Application history</h3>
                <div className="mt-4 space-y-4">
                  {overview.events.map((item, index) => <div key={`${item.event_type}-${item.created_at}-${index}`} className="flex gap-3 text-sm"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" /><div><p className="font-bold text-slate-800">{statusLabels[item.event_type] || item.event_type.replaceAll('_', ' ')}</p><time className="text-xs text-slate-500">{dateTime(item.created_at)}</time></div></div>)}
                  {!overview.events.length && <p className="text-sm text-slate-500">No status history is available yet.</p>}
                </div>
              </section>
              <section className="rounded-2xl bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 font-black text-slate-900"><FileText size={17} /> Submitted documents</h3>
                <div className="mt-4 space-y-3">
                  {application.documents.map(document => <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3"><div><p className="text-sm font-bold text-slate-800">{documentLabels[document.type] || document.name}</p><p className="text-xs text-slate-500">Uploaded {dateTime(document.uploadedAt)}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${document.expiresAt && document.expiresAt < new Date().toISOString().slice(0, 10) ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>{document.expiresAt ? `Expires ${document.expiresAt}` : 'On file'}</span></div>)}
                  {!application.documents.length && <p className="text-sm text-slate-500">No documents are attached to this application.</p>}
                </div>
              </section>
            </div>
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-500">This workspace shows verified application, inventory traceability, fulfillment records, and the per-item spread between the platform listed price and your approved selling price. It does not manage payouts or settlements.</p>
          </div>
        )}

        {!loading && overview && section === 'alerts' && application && (
          <MerchantAlertsPanel
            accessToken={accessToken}
            applicationId={application.id}
            canOperate={canOperate}
          />
        )}

        {!loading && overview && section === 'riders' && application && (
          <section className="space-y-5">
            <header className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-primary">Your delivery team</p>
              <h2 className="mt-2 text-xl font-black text-slate-900">Connect designated riders</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Invite a rider by their Kenyan mobile number. They must use the same number to complete rider verification, sign in to the Rider Terminal, and accept your invitation before they are connected. When an accepted rider is verified, online, sharing a fresh location, and has capacity, dispatch ranks them ahead for your pickup orders. This does not bypass OnBar rider approval or payment and fulfilment checks.
              </p>
              {application.status === 'approved' && (
                <form onSubmit={addRider} className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <label className="sr-only" htmlFor="merchant-rider-phone">Rider phone number</label>
                  <Input
                    id="merchant-rider-phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    required
                    maxLength={24}
                    value={riderPhone}
                    onChange={event => setRiderPhone(event.target.value)}
                    placeholder="Rider phone, e.g. 0712 345 678"
                    className="h-12 rounded-xl bg-white text-base"
                  />
                  <Button type="submit" disabled={Boolean(riderActionId) || !riderPhone.trim()} className="h-12 shrink-0 rounded-xl px-5 font-black uppercase">
                    {riderActionId === 'new' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserRound className="mr-2 h-4 w-4" />}
                    Invite rider
                  </Button>
                </form>
              )}
            </header>

            {application.status !== 'approved' ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Rider connections become available after this business is approved.</div>
            ) : ridersLoading ? (
              <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin text-primary" />Loading rider connections…</div>
            ) : riderConnections.length ? (
              <div className="space-y-3">
                {riderConnections.map(connection => (
                  <article key={connection.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm">
                    <div className="min-w-0">
                      <p className="font-black text-slate-900">{connection.name || 'Rider invitation'}</p>
                      <p className="mt-1 text-sm text-slate-500">{connection.phone}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {connection.status === 'accepted'
                          ? 'Connected in the rider app'
                          : connection.verificationStatus === 'Verified'
                            ? 'Verified rider · waiting for them to accept'
                            : connection.verificationStatus
                              ? `Rider verification: ${connection.verificationStatus}`
                              : 'Waiting for the rider to apply or sign in with this number'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase ${connection.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                        {connection.status === 'accepted' ? 'Connected' : 'Invitation pending'}
                      </span>
                      <Button type="button" variant="outline" disabled={Boolean(riderActionId)} onClick={() => void removeRider(connection)}
                        className="h-10 rounded-xl border-rose-200 text-xs font-bold text-rose-700 hover:bg-rose-50">
                        {riderActionId === connection.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">
                No riders are connected yet. Invite a rider above to get started.
              </div>
            )}
          </section>
        )}

        {!loading && overview && section === 'orders' && (
          <section className="space-y-4">
            <div><h2 className="text-xl font-black text-slate-900">Assigned orders</h2><p className="mt-1 text-sm text-slate-500">Only orders linked to your traced products are shown.</p></div>
            {!overview.orders.length && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">No traced orders are currently assigned to this business.</div>}
            {overview.orders.map(order => {
              const latest = latestFulfillment(order.fulfillment);
              const nextEvents = fulfillmentNext[latest] || [];
              return <article id={`merchant-order-${order.id}`} key={order.id} className={`rounded-2xl bg-white p-5 shadow-sm sm:p-6 ${deepLinkOrderId === String(order.id) ? 'ring-2 ring-amber-400' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-xs font-black uppercase tracking-wide text-primary">Order #{order.id}</p><p className="mt-1 font-black text-slate-900">{order.customer_name}</p><p className="text-xs text-slate-500">{dateTime(order.created_at)} · customer order status: {order.status}</p></div>
                  <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase ${statusClass(latest || 'pending')}`}>{fulfillmentLabels[latest] || 'Awaiting response'}</span>
                </div>
                <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-[1fr_auto]">
                  <div className="space-y-2">{order.items.map((item, index) => <div key={`${item.product_name}-${index}`} className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><p><strong>{item.merchant_quantity} × {item.product_name}</strong>{item.size ? ` · ${item.size}` : ''}</p><p className="mt-1 text-xs text-slate-500">Listed KSh {Number(item.listed_price).toLocaleString()} · Selling KSh {Number(item.selling_price).toLocaleString()} · <span className={item.spread >= 0 ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>Spread {item.spread >= 0 ? '+' : ''}KSh {Number(item.spread).toLocaleString()} each</span></p></div>)}
                    <p className="mt-3 text-xs text-slate-500">Customer: <a className="font-semibold text-primary underline" href={`tel:${order.customer_phone}`}>{order.customer_phone}</a>{order.customer_email && <> · <a className="font-semibold text-primary underline" href={`mailto:${order.customer_email}`}>Email</a></>}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 md:max-w-sm md:justify-end">
                    {canOperate && nextEvents.map(eventType => <Button key={eventType} disabled={working} variant={eventType === 'rejected' || eventType === 'cancelled' ? 'outline' : 'default'} onClick={() => void apiAction({ operation: 'fulfillment', applicationId: application.id, orderId: order.id, eventType }, `Order ${order.id}: ${fulfillmentLabels[eventType].toLowerCase()} recorded.`)} className="rounded-xl text-xs font-black uppercase">{fulfillmentLabels[eventType]}</Button>)}
                    {!canOperate && <p className="text-xs font-semibold text-slate-500">Fulfillment actions require approved status.</p>}
                  </div>
                </div>
                {order.fulfillment.length > 0 && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{[...order.fulfillment].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()).map(item => <span key={item.id} title={dateTime(item.occurred_at)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600">{fulfillmentLabels[item.event_type] || item.event_type}{typeof item.details?.note === 'string' ? ` · ${item.details.note}` : ''}</span>)}</div>}
              </article>;
            })}
          </section>
        )}

        {!loading && overview && section === 'inventory' && (
          <section className="space-y-5">
            <div><h2 className="text-xl font-black text-slate-900">Inventory traceability</h2><p className="mt-1 text-sm text-slate-500">Record received lots for products already linked to your approved business. Inventory records are append-only.</p></div>
            {canOperate && productOptions.length > 0 && <form onSubmit={submitBatch} className="grid gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-bold text-slate-600 sm:col-span-2 lg:col-span-3">Linked product
                <select required value={batchForm.productId} onChange={event => setBatchForm(current => ({ ...current, productId: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
                  <option value="">Choose a product</option>{productOptions.map(product => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ''}</option>)}
                </select>
              </label>
              <Input required maxLength={120} value={batchForm.lotCode} onChange={event => setBatchForm(current => ({ ...current, lotCode: event.target.value }))} placeholder="Lot / batch code" aria-label="Lot or batch code" />
              <Input type="number" min="1" max="1000000" required value={batchForm.quantity} onChange={event => setBatchForm(current => ({ ...current, quantity: event.target.value }))} placeholder="Quantity received" aria-label="Quantity received" />
              <Input value={batchForm.supplierName} maxLength={160} onChange={event => setBatchForm(current => ({ ...current, supplierName: event.target.value }))} placeholder="Supplier (optional)" aria-label="Supplier name" />
              <Input type="date" value={batchForm.expiryAt} onChange={event => setBatchForm(current => ({ ...current, expiryAt: event.target.value }))} aria-label="Expiry date (optional)" />
              <Input value={batchForm.notes} maxLength={1000} onChange={event => setBatchForm(current => ({ ...current, notes: event.target.value }))} placeholder="Storage notes (optional)" aria-label="Storage notes" />
              <Button disabled={working || !canOperate} type="submit" className="h-11 rounded-xl font-black uppercase"><PackageCheck size={16} className="mr-2" /> Record received stock</Button>
            </form>}
            {!productOptions.length && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No catalog products have been linked to this business yet. Contact OnBar to have an approved product linked before recording a batch.</p>}
            <div className="grid gap-4 lg:grid-cols-2">
              {overview.batches.map(batch => <article key={batch.id} className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-slate-900">{batch.product?.name || `Product #${batch.product_id}`}</p><p className="text-xs text-slate-500">Lot {batch.lot_code}{batch.product?.sku ? ` · SKU ${batch.product.sku}` : ''}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${batch.on_hold ? 'bg-amber-100 text-amber-900' : batch.available_quantity > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{batch.on_hold ? 'On hold' : `${batch.available_quantity} available`}</span></div>
                <p className="mt-3 text-xs text-slate-500">Received {dateTime(batch.received_at)} · Initial quantity {batch.quantity_received}{batch.expiry_at ? ` · Expires ${batch.expiry_at}` : ''}</p>
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">{batch.movements.slice(0, 5).map((movement, index) => <div key={`${movement.created_at}-${index}`} className="flex justify-between gap-3 text-xs text-slate-600"><span>{movement.movement_type.replaceAll('_', ' ')}{movement.note ? ` · ${movement.note}` : ''}</span><span className="shrink-0 font-bold">{movement.quantity_delta > 0 ? '+' : ''}{movement.quantity_delta}</span></div>)}</div>
              </article>)}
            </div>
          </section>
        )}

        {!loading && overview && section === 'incidents' && (
          <section className="space-y-5">
            <div><h2 className="text-xl font-black text-slate-900">Operational reports</h2><p className="mt-1 text-sm text-slate-500">Report a linked product, food safety, delivery, or conduct issue for OnBar review.</p></div>
            {canOperate && <form onSubmit={submitIncident} className="grid gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2">
              <select required value={incidentForm.link} onChange={event => setIncidentForm(current => ({ ...current, link: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm sm:col-span-2">
                <option value="">Link to an order or inventory batch</option>
                {overview.orders.map(order => <option key={`order-${order.id}`} value={`order:${order.id}`}>Order #{order.id}</option>)}
                {overview.batches.map(batch => <option key={`batch-${batch.id}`} value={`batch:${batch.id}`}>Batch {batch.lot_code} · {batch.product?.name || 'Product'}</option>)}
              </select>
              <select value={incidentForm.category} onChange={event => setIncidentForm(current => ({ ...current, category: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                {Object.entries(incidentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <Button disabled={working} type="submit" className="h-11 rounded-xl font-black uppercase"><AlertTriangle size={16} className="mr-2" /> Submit report</Button>
              <textarea required minLength={10} maxLength={5000} rows={4} value={incidentForm.description} onChange={event => setIncidentForm(current => ({ ...current, description: event.target.value }))} placeholder="Describe what happened (at least 10 characters)" className="rounded-xl border border-slate-200 p-3 text-sm sm:col-span-2" />
            </form>}
            {!overview.incidents.length && <p className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">No operational reports for this business.</p>}
            <div className="grid gap-4 lg:grid-cols-2">{overview.incidents.map(incident => <article key={incident.id} className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-primary">{incident.incident_code} · {incidentLabels[incident.category] || incident.category}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{incident.description}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusClass(incident.status)}`}>{incident.status.replaceAll('_', ' ')}</span></div>
              <p className="mt-3 text-xs text-slate-500">Reported {dateTime(incident.created_at)} · Severity {incident.severity}{incident.order_id ? ` · Order #${incident.order_id}` : ''}</p>
              {incident.resolution_note && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><strong>OnBar update:</strong> {incident.resolution_note}</p>}
            </article>)}</div>
          </section>
        )}

        {!loading && overview && section === 'business' && (
          <section className="space-y-5">
            <div><h2 className="text-xl font-black text-slate-900">Business profile</h2><p className="mt-1 text-sm text-slate-500">Application and contact details submitted to OnBar.</p></div>
            <form onSubmit={submitAvailability} className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="flex items-center gap-2 font-black text-slate-900"><Clock3 size={18} /> Order availability & operating hours</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Set your local operating hours in East Africa Time (Nairobi). Paid orders are allocated only to approved, nearby partners with available stock who are online and open at allocation time. Overnight shifts are supported.</p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-black uppercase ${application.accepting_orders ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                  {application.accepting_orders ? 'Accepting orders' : 'Offline'}
                </span>
              </div>
              {!canOperate && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Availability controls unlock after OnBar approves this business.</p>}
              <label className={`mt-5 flex items-start gap-3 rounded-xl border p-4 ${canOperate ? 'cursor-pointer border-slate-200' : 'border-slate-100 opacity-60'}`}>
                <input
                  type="checkbox"
                  checked={acceptingOrdersDraft}
                  disabled={!canOperate || working}
                  onChange={event => setAcceptingOrdersDraft(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-800">I am online and accepting new orders</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Turn this off for a temporary closure, even if today’s schedule says you are open.</span>
                </span>
              </label>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {merchantWeekdays.map(day => {
                  const hours = scheduleDraft[day];
                  return <div key={day} className="grid gap-3 rounded-xl border border-slate-200 p-3">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <input
                        type="checkbox"
                        checked={hours.enabled}
                        disabled={!canOperate || working}
                        onChange={event => setScheduleDraft(current => ({
                          ...current,
                          [day]: { ...current[day], enabled: event.target.checked }
                        }))}
                        className="h-4 w-4 accent-primary"
                      />
                      {weekdayLabels[day]}
                      {!hours.enabled && <span className="ml-auto text-xs font-semibold text-slate-400">Closed</span>}
                    </label>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <label className="text-[10px] font-bold uppercase text-slate-400">Opens
                        <Input
                          type="time"
                          required={hours.enabled}
                          disabled={!canOperate || working || !hours.enabled}
                          value={hours.open}
                          onChange={event => setScheduleDraft(current => ({
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
                          required={hours.enabled}
                          disabled={!canOperate || working || !hours.enabled}
                          value={hours.close}
                          onChange={event => setScheduleDraft(current => ({
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
              {merchantWeekdays.some(day => scheduleDraft[day].enabled && scheduleDraft[day].open === scheduleDraft[day].close) && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">For an open day, opening and closing times must be different.</p>}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-slate-500">Going offline prevents new allocations; orders already assigned to you remain visible and still need fulfillment updates.</p>
                <Button type="submit" disabled={!canOperate || working || merchantWeekdays.some(day => scheduleDraft[day].enabled && scheduleDraft[day].open === scheduleDraft[day].close)} className="h-11 rounded-xl font-black uppercase">
                  {working && <Loader2 size={16} className="mr-2 animate-spin" />} Save availability
                </Button>
              </div>
              {application.availability_updated_at && <p className="mt-3 text-[10px] text-slate-400">Last saved {dateTime(application.availability_updated_at)}</p>}
            </form>
            <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
              <article className="rounded-2xl bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 font-black text-slate-900"><Building2 size={18} /> Business details</h3>
                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">{[
                  ['Business', application.business_name],
                  ['Trading name', application.trading_name || 'Not provided'],
                  ['Business type', businessLabels[application.business_type] || application.business_type],
                  ['Merchant ID', application.merchant_code || 'Assigned after approval'],
                  ['Contact person', `${application.owner_name} · ${application.owner_role}`],
                  ['Email', application.email],
                  ['Phone', application.phone],
                  ['Location', `${application.address}, ${application.town}, ${application.county}, ${application.country}`],
                  ['Category', application.cuisine_or_category || 'Not provided'],
                  ['Collection', application.collection_available ? 'Available' : 'Not listed'],
                  ['Delivery radius', application.delivery_radius_km == null ? 'Not provided' : `${application.delivery_radius_km} km`],
                  ['Capacity', application.preparation_capacity == null ? 'Not provided' : `${application.preparation_capacity} per day`]
                ].map(([label, value]) => <div key={label}><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-800">{value}</dd></div>)}</dl>
                {application.operating_areas.length > 0 && <p className="mt-5 border-t border-slate-100 pt-4 text-sm"><strong>Operating areas:</strong> {application.operating_areas.join(', ')}</p>}
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Goods you offered</h4>
                  {application.offered_goods_pricing.length ? (
                    <ul className="mt-3 space-y-2">
                      {application.offered_goods_pricing.map(good => (
                        <li key={good.product_id} className="flex items-center justify-between gap-3 rounded-xl bg-primary/5 px-3 py-2 text-sm">
                          <span className="font-semibold text-slate-800">{good.product_name}</span>
                          <span className="shrink-0 text-right">
                            <strong className="block font-black text-primary">Sell {good.currency} {Number(good.selling_price).toLocaleString()}</strong>
                            <small className={good.spread >= 0 ? 'text-emerald-700' : 'text-rose-700'}>Listed {good.currency} {Number(good.listed_price).toLocaleString()} · Spread {good.spread >= 0 ? '+' : ''}{good.currency} {Number(good.spread).toLocaleString()}</small>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">{application.offered_goods.length ? application.offered_goods.join(', ') : 'No goods were recorded on this application.'}{application.offered_goods.length ? ' · Proposed prices were not recorded.' : ''}</p>
                  )}
                  <p className="mt-3 text-xs leading-5 text-slate-500">Sell is your proposed partner price. Listed is the current platform catalog price. Spread is the difference per unit; OnBar must approve and configure offers before they appear to customers.</p>
                </div>
              </article>
              <article className="rounded-2xl bg-white p-6 shadow-sm">
                <h3 className="font-black text-slate-900">Operating hours</h3>
                <dl className="mt-4 space-y-3">{merchantWeekdays.map(day => {
                  const hours = scheduleDraft[day];
                  return <div key={day} className="flex justify-between gap-4 text-sm"><dt className="font-semibold capitalize text-slate-600">{weekdayLabels[day]}</dt><dd className="text-right text-slate-800">{hours.enabled ? `${hours.open} – ${hours.close}` : 'Closed'}</dd></div>;
                })}</dl>
                <div className="mt-6 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">Business profile identity changes are managed by OnBar. Contact support to request a correction. Payout details are not managed in this workspace.</div>
                <Link href="/contact" className="mt-4 inline-flex text-sm font-bold text-primary underline">Contact OnBar support</Link>
              </article>
            </div>
          </section>
        )}

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500">
          <span>OnBar Partner Workspace · Verified business access</span>
          <Link href="/" className="font-bold text-primary hover:underline"><CheckCircle2 size={14} className="mr-1 inline" /> Return to OnBar</Link>
        </footer>
      </div>
    </main>
  );
}
