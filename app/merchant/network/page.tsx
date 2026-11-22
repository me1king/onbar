'use client';

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  BellRing,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  FileText,
  History,
  ImageIcon,
  Loader2,
  LogOut,
  Megaphone,
  MessageSquare,
  PackageCheck,
  Palette,
  Search,
  X,
  RefreshCw,
  ShieldCheck,
  Star,
  Store,
  TrendingUp,
  Truck,
  UtensilsCrossed,
  Users,
  UserRound,
  Volume2,
  VolumeX
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
import { isBeverageInventoryProduct, isKitchenFoodProduct } from '@/lib/productDepartment';
import { supabase } from '@/lib/supabaseClient';
import MerchantAlertsPanel from '@/components/merchant/MerchantAlertsPanel';
import OrderAlertToneSettings from '@/components/alerts/OrderAlertToneSettings';
import { useOrderAlertTone } from '@/hooks/useOrderAlertTone';
import MerchantOrderTicket from '@/components/merchant/MerchantOrderTicket';
import MerchantReviewInbox from '@/components/merchant/MerchantReviewInbox';
import MerchantSupportPanel from '@/components/merchant/MerchantSupportPanel';
import MerchantInventoryCsv, { type StockChange } from '@/components/merchant/MerchantInventoryCsv';
import MerchantWeeklyDigestSettings from '@/components/merchant/MerchantWeeklyDigestSettings';
import GuidedPanelTour, { type GuidedPanelTourStep } from '@/components/onboarding/GuidedPanelTour';

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
  expired: boolean;
  excise_stamp_confirmed: boolean;
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
type FoodOrderItem = {
  id: number;
  product_name: string;
  quantity: number;
  ordered_quantity?: number;
  unit_price: number;
  size: string | null;
  addons: unknown;
};
type FoodOrder = {
  id: number;
  status: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  created_at: string;
  fulfillment: FulfillmentEvent[];
  items: FoodOrderItem[];
};
type MerchantPaymentOrder = {
  id: number;
  status: string;
  created_at: string;
  fulfillment: FulfillmentEvent[];
  items: Array<{
    product_name: string;
    quantity: number;
    merchant_quantity?: number;
    unit_price: number;
    selling_price?: number;
    size: string | null;
  }>;
};
type MerchantSettlementSummary = {
  policy: {
    version: number;
    merchant_share_bps: number;
    minimum_payout_kes: number;
    enabled: boolean;
  } | null;
  destination: {
    id: string;
    method: string;
    masked_account: string;
    verification_status: 'pending' | 'verified' | 'rejected';
    review_note: string | null;
  } | null;
  balances: {
    ledger_total_kes: number;
    available_kes: number;
    pending_kes: number;
    paid_kes: number;
  };
  entries: Array<{
    id: number;
    entry_type: 'sale' | 'adjustment';
    order_id: number | null;
    amount_kes: number;
    description: string;
    created_at: string;
  }>;
  settlements: Array<{
    id: string;
    amount_kes: number;
    status: string;
    provider_reference: string | null;
    mpesa_receipt: string | null;
    failure_message: string | null;
    created_at: string;
    updated_at: string;
  }>;
};
type SellerSalesOrder = {
  id: number;
  customerName: string;
  createdAt: string;
  status: string;
  amount: number;
  cancelled: boolean;
  active: boolean;
  itemCount: number;
  items: Array<{ name: string; quantity: number }>;
  events: FulfillmentEvent[];
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
    offered_goods_pricing: Array<{
      product_id: number;
      product_name: string;
      price: number;
      currency: string;
      category: string | null;
      sub_category: string | null;
      is_bite: boolean;
      is_snack: boolean;
      is_souvenir: boolean;
      listed_price: number;
      selling_price: number;
      spread: number;
      margin_percent: number | null;
      sizes: string[];
      image_url: string | null;
      images: string[];
      variant_prices: Record<string, number>;
      pending_price?: number | null;
      pending_base_price?: number | null;
      pending_variant?: string | null;
    }>;
    documents: PartnerDocument[];
    alcohol_onboarding: {
      nationalIdLast4?: string;
      countyLicenceNumber?: string;
      onlineLicenceNumber?: string;
      mpesaTill?: string;
      mpesaRegisteredName?: string;
      distanceToSchoolMeters?: number;
      schoolReviewRequired?: boolean;
      identityCheck?: string;
      licenceCheck?: string;
      tillNameCheck?: string;
      products?: Array<{ productId: number; size: string; abv: number; exciseStampConfirmed: boolean }>;
      rules?: { minimumAge?: number; maximumBottlesPerOrder?: number; schoolBufferMeters?: number };
    } | null;
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
  catalogNotifications: Array<{
    id: string;
    product_id: number;
    product_name: string;
    category: string | null;
    listed_price: number;
    created_at: string;
    images: string[];
  }>;
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

type Section = 'sales' | 'overview' | 'orders' | 'inventory' | 'performance' | 'incidents' | 'business' | 'alerts' | 'riders' | 'settings'
  | 'food-live' | 'food-menu' | 'food-promotions' | 'food-payments' | 'food-history' | 'food-reviews' | 'food-business' | 'food-staff'
  | 'liquor-live' | 'liquor-catalog' | 'liquor-promotions' | 'liquor-payments' | 'liquor-history' | 'liquor-reviews' | 'liquor-compliance' | 'liquor-hours' | 'support';

function getOutOfStockProducts(application: PartnerApplication['application'], batches: PartnerBatch[]) {
  const today = new Date().toISOString().slice(0, 10);
  const quantities = new Map<number, number>();
  for (const batch of batches) {
    if (!batch.on_hold && !batch.expired && (!batch.expiry_at || batch.expiry_at >= today)) {
      quantities.set(batch.product_id, (quantities.get(batch.product_id) || 0) + Math.max(0, batch.available_quantity));
    }
  }
  return application.offered_goods_pricing
    .filter(product => (quantities.get(product.product_id) || 0) === 0)
    .map(product => ({ productId: product.product_id, productName: product.product_name }));
}

type RiderConnection = {
  id: string;
  phone: string;
  name: string | null;
  verificationStatus: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  createdAt: string;
  acceptedAt: string | null;
};

const MERCHANT_ACCENT_PRESETS = ['#F5A000', '#39D98A', '#4E9BFF', '#A78BFA', '#FF8A4C', '#F05D6C'];

function getContrastForeground(hexColor: string) {
  const channels = hexColor.slice(1).match(/.{2}/g)?.map(channel => parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) return '#FFFFFF';
  const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const darkLuminance = 0.009;
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / (darkLuminance + 0.05);
  return whiteContrast >= darkContrast ? '#FFFFFF' : '#0F172A';
}

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
  expired: 'Compliance expired',
  offer_price_updated: 'Price request submitted',
  offer_price_approved: 'Catalog price request approved',
  offer_price_rejected: 'Catalog price request rejected',
  new_product_available: 'New catalog product available',
  catalog_update_acknowledged: 'Catalog product reviewed'
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
  age_check_failed: 'Failed age / ID check',
  suspected_counterfeit: 'Suspected counterfeit',
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
  { id: 'sales', label: 'Sales overview', icon: TrendingUp },
  { id: 'overview', label: 'Overview', icon: Store },
  { id: 'orders', label: 'Orders', icon: Truck },
  { id: 'inventory', label: 'Inventory', icon: Box },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'riders', label: 'Riders', icon: UserRound },
  { id: 'alerts', label: 'Order alerts', icon: BellRing },
  { id: 'incidents', label: 'Reports', icon: AlertTriangle },
  { id: 'business', label: 'Business profile', icon: Building2 },
  { id: 'settings', label: 'Settings', icon: Palette },
  { id: 'support', label: 'Support', icon: MessageSquare }
];
const foodSections: Array<{ id: Section; label: string; icon: typeof Store }> = [
  { id: 'sales', label: 'Sales overview', icon: TrendingUp },
  { id: 'food-live', label: 'Live', icon: Store },
  { id: 'food-menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'inventory', label: 'Inventory', icon: Box },
  { id: 'food-promotions', label: 'Black November Offers', icon: Megaphone },
  { id: 'food-payments', label: 'Payments', icon: CreditCard },
  { id: 'food-history', label: 'Order history', icon: History },
  { id: 'food-reviews', label: 'Reviews', icon: Star },
  { id: 'food-business', label: 'Business profile', icon: Building2 },
  { id: 'food-staff', label: 'Staff & riders', icon: Users },
  { id: 'settings', label: 'Settings', icon: Palette },
  { id: 'support', label: 'Support', icon: MessageSquare }
];
const liquorSections: Array<{ id: Section; label: string; icon: typeof Store }> = [
  { id: 'sales', label: 'Sales overview', icon: TrendingUp },
  { id: 'liquor-live', label: 'Live orders', icon: Store },
  { id: 'liquor-catalog', label: 'Catalog', icon: Box },
  { id: 'inventory', label: 'Update stock', icon: PackageCheck },
  { id: 'liquor-promotions', label: 'Promotions', icon: Megaphone },
  { id: 'liquor-payments', label: 'Payments', icon: CreditCard },
  { id: 'liquor-history', label: 'History', icon: History },
  { id: 'liquor-reviews', label: 'Reviews', icon: Star },
  { id: 'liquor-compliance', label: 'Compliance', icon: ShieldCheck },
  { id: 'incidents', label: 'Incidents', icon: AlertTriangle },
  { id: 'liquor-hours', label: 'Hours', icon: Clock3 },
  { id: 'riders', label: 'Staff & riders', icon: Users },
  { id: 'business', label: 'Business profile', icon: Building2 },
  { id: 'settings', label: 'Settings', icon: Palette },
  { id: 'support', label: 'Support', icon: MessageSquare }
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

function formatOrderNotes(value: unknown): string | null {
  if (typeof value === 'string') return value.trim().slice(0, 500) || null;
  if (Array.isArray(value)) {
    const notes = value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(', ');
    return notes.slice(0, 500) || null;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${typeof item === 'string' ? item : JSON.stringify(item)}`)
      .join(', ')
      .slice(0, 500) || null;
  }
  return null;
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

function MerchantCatalogUpdateBanner({
  application,
  notifications,
  canOperate,
  working,
  onAction,
  onOpenStock
}: {
  application: PartnerApplication['application'];
  notifications: PartnerApplication['catalogNotifications'];
  canOperate: boolean;
  working: boolean;
  onAction: (body: Record<string, unknown>, successMessage: string) => Promise<boolean>;
  onOpenStock: (productId?: number) => void;
}) {
  if (!notifications.length) return null;
  const acknowledge = async (notificationId: string, productId: number, open: boolean) => {
    const saved = await onAction({
      operation: 'acknowledge_catalog_update',
      applicationId: application.id,
      notificationId
    }, open ? 'Catalog update opened. Set the stock and submit a price proposal for review.' : 'Catalog update dismissed.');
    if (saved && open) onOpenStock(productId);
  };

  return <section aria-label="New catalog product notifications" className="space-y-3 rounded-2xl border border-sky-300/30 bg-sky-400/10 p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="font-black text-sky-100">New products to review</h3>
        <p className="mt-1 text-xs text-sky-100/70">{notifications.length} new catalog item{notifications.length === 1 ? '' : 's'} added by OnBar. Check each photo, then choose whether to carry it and submit a price request.</p>
      </div>
      <span className="rounded-full bg-sky-300 px-2.5 py-1 text-xs font-black text-sky-950">{notifications.length}</span>
    </div>
    <div className="grid gap-2 md:grid-cols-2">
      {notifications.map(notification => <article key={notification.id} className="rounded-xl border border-sky-100/10 bg-black/20 p-4">
        <MerchantProductPhotoGallery productName={notification.product_name} images={notification.images} />
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-bold text-white">{notification.product_name}</p>
            <p className="mt-1 text-xs text-sky-100/70">{notification.category || 'Catalog item'} · listed KSh {Number(notification.listed_price).toLocaleString('en-KE')}</p>
          </div>
          <time className="text-[10px] text-sky-100/60">{dateTime(notification.created_at)}</time>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!canOperate || working}
            onClick={() => void acknowledge(notification.id, notification.product_id, true)}
            className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-zinc-950 disabled:opacity-50">
            Update price & stock
          </button>
          <button type="button" disabled={!canOperate || working}
            onClick={() => void acknowledge(notification.id, notification.product_id, false)}
            className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold text-zinc-200 disabled:opacity-50">
            Dismiss
          </button>
        </div>
      </article>)}
    </div>
  </section>;
}

function MerchantPaymentsPanel({
  application,
  accessToken,
  orders,
  requests,
  canOperate,
  working,
  onRequestStatement
}: {
  application: PartnerApplication['application'];
  accessToken: string;
  orders: MerchantPaymentOrder[];
  requests: PartnerEvent[];
  canOperate: boolean;
  working: boolean;
  onRequestStatement: (orderIds: number[]) => Promise<boolean>;
}) {
  const [settlementSummary, setSettlementSummary] = useState<MerchantSettlementSummary | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(true);
  const [settlementBusy, setSettlementBusy] = useState(false);
  const [settlementError, setSettlementError] = useState('');
  const [settlementMessage, setSettlementMessage] = useState('');
  const [payoutPhone, setPayoutPhone] = useState('');
  const currency = (amount: number) => `KSh ${Number(amount || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
  const loadSettlements = useCallback(async () => {
    if (!accessToken) {
      setSettlementLoading(false);
      setSettlementError('Sign in again to view merchant settlement records.');
      return;
    }
    setSettlementLoading(true);
    setSettlementError('');
    try {
      const response = await fetch(`/api/merchant/settlements?applicationId=${encodeURIComponent(application.id)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const result = await response.json() as { summary?: MerchantSettlementSummary; error?: string };
      if (!response.ok || !result.summary) throw new Error(result.error || 'Merchant settlement records could not be loaded.');
      setSettlementSummary(result.summary);
    } catch (error) {
      setSettlementError(error instanceof Error ? error.message : 'Merchant settlement records could not be loaded.');
    } finally {
      setSettlementLoading(false);
    }
  }, [accessToken, application.id]);

  useEffect(() => {
    void loadSettlements();
  }, [loadSettlements]);

  const submitSettlementAction = async (action: 'submit_destination' | 'request_payout') => {
    setSettlementBusy(true);
    setSettlementError('');
    setSettlementMessage('');
    try {
      const response = await fetch('/api/merchant/settlements', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          applicationId: application.id,
          ...(action === 'submit_destination' ? { phone: payoutPhone } : {})
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The settlement action could not be completed.');
      setSettlementMessage(action === 'submit_destination'
        ? 'Payout number submitted. It must be verified by OnBar Finance before it can be used.'
        : 'Payout request submitted for OnBar Finance review. No transfer has been sent yet.');
      if (action === 'submit_destination') setPayoutPhone('');
      await loadSettlements();
    } catch (error) {
      setSettlementError(error instanceof Error ? error.message : 'The settlement action could not be completed.');
    } finally {
      setSettlementBusy(false);
    }
  };

  const deliveredOrders = orders
    .filter(order => ['delivered', 'completed'].includes(order.status.toLowerCase())
      || latestFulfillment(order.fulfillment) === 'delivered')
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  const orderValue = (order: MerchantPaymentOrder) => order.items.reduce((total, item) => {
    const quantity = Math.max(0, Number(item.merchant_quantity ?? item.quantity) || 0);
    const price = Math.max(0, Number(item.selling_price ?? item.unit_price) || 0);
    return total + quantity * price;
  }, 0);
  const totalRecordedValue = deliveredOrders.reduce((total, order) => total + orderValue(order), 0);
  const latestRequest = requests
    .filter(event => event.event_type === 'payment_statement_requested')
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0];

  const exportCsv = () => {
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = [
      ['Order', 'Delivered at', 'Items', 'Recorded item value KES', 'Order status'],
      ...deliveredOrders.map(order => [
        `#${order.id}`,
        new Date(order.created_at).toISOString(),
        order.items.map(item => `${item.merchant_quantity ?? item.quantity} x ${item.product_name}`).join('; '),
        orderValue(order).toFixed(2),
        order.status
      ])
    ];
    const csv = [
      'OnBar merchant delivered-order statement (not a payout statement)',
      `Merchant,${quote(application.business_name)}`,
      'Amounts use recorded merchant-traced item quantities and order prices; fees, deductions, refunds, and seller share are not included.',
      ...rows.map(row => row.map(quote).join(','))
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `merchant-${application.merchant_code || application.id.slice(0, 8)}-delivered-orders.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-white/10 bg-[#1a1b1e] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-black text-white"><CreditCard size={17} /> Merchant settlement</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">Payables include verified paid-and-delivered order items and finance adjustments. Requests are reviewed before any M-Pesa transfer.</p>
            <p className="mt-2 max-w-3xl text-[11px] leading-5 text-amber-200">Current calculations apply the configured merchant share to traced item value. Fees, taxes, and cash refunds are not separately modeled; returned quantities reduce payables only when recorded in the stock ledger. Finance must confirm these rules before enabling real transfers.</p>
          </div>
          <button type="button" onClick={() => void loadSettlements()} disabled={settlementLoading}
            className="inline-flex min-h-9 items-center rounded-lg border border-white/15 px-3 text-xs font-bold text-zinc-200 disabled:opacity-50">
            <RefreshCw size={13} className={`mr-2 ${settlementLoading ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
        {settlementError && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">{settlementError}</p>}
        {settlementMessage && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs leading-5 text-emerald-200">{settlementMessage}</p>}
        {settlementLoading && !settlementSummary && <p role="status" className="text-sm text-zinc-400">Loading settlement summary…</p>}
        {settlementSummary && <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Available', settlementSummary.balances.available_kes],
              ['Under review / processing', settlementSummary.balances.pending_kes],
              ['Paid', settlementSummary.balances.paid_kes],
              ['Ledger total', settlementSummary.balances.ledger_total_kes]
            ].map(([label, amount]) => <article key={String(label)} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-lg font-black text-white">{currency(Number(amount))}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{label}</p>
            </article>)}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-zinc-300">Settlement terms</p>
                  <p className="mt-1 text-sm text-zinc-100">{settlementSummary.policy?.enabled
                    ? `${(settlementSummary.policy.merchant_share_bps / 100).toFixed(2)}% seller share · KSh ${Number(settlementSummary.policy.minimum_payout_kes).toLocaleString('en-KE')} minimum`
                    : 'Not configured by OnBar Finance'}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${settlementSummary.policy?.enabled ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-200'}`}>
                  {settlementSummary.policy?.enabled ? `Terms v${settlementSummary.policy.version}` : 'Unavailable'}
                </span>
              </div>
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-zinc-300">Payout destination</p>
                    <p className="mt-1 text-sm text-zinc-100">{settlementSummary.destination?.masked_account || 'No M-Pesa number submitted'}</p>
                  </div>
                  {settlementSummary.destination && <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                    settlementSummary.destination.verification_status === 'verified'
                      ? 'bg-emerald-400/10 text-emerald-300'
                      : settlementSummary.destination.verification_status === 'pending'
                        ? 'bg-amber-400/10 text-amber-200'
                        : 'bg-rose-400/10 text-rose-300'
                  }`}>{settlementSummary.destination.verification_status}</span>}
                </div>
                {settlementSummary.destination?.review_note && <p className="mt-2 text-xs text-rose-200">Finance note: {settlementSummary.destination.review_note}</p>}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-white/10 p-4">
              <form onSubmit={event => {
                event.preventDefault();
                void submitSettlementAction('submit_destination');
              }} className="space-y-2">
                <label htmlFor={`payout-phone-${application.id}`} className="text-xs font-black uppercase tracking-wide text-zinc-300">Submit or replace M-Pesa number</label>
                <div className="flex flex-wrap gap-2">
                  <Input id={`payout-phone-${application.id}`} type="tel" inputMode="tel" autoComplete="tel" maxLength={40}
                    value={payoutPhone} onChange={event => setPayoutPhone(event.target.value)} placeholder="07xx xxx xxx or +254…" required
                    className="min-w-[180px] flex-1 border-white/10 bg-black/20 text-white placeholder:text-zinc-500" />
                  <button type="submit" disabled={!canOperate || working || settlementBusy}
                    className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-zinc-950 disabled:opacity-50">
                    {settlementBusy ? 'Saving…' : 'Submit number'}
                  </button>
                </div>
                <p className="text-[11px] leading-5 text-zinc-500">The number is encrypted in storage and shown masked. Replacing it resets verification.</p>
              </form>
              <button type="button" disabled={!canOperate || working || settlementBusy
                || !settlementSummary.policy?.enabled
                || settlementSummary.destination?.verification_status !== 'verified'
                || Number(settlementSummary.balances.available_kes) < Number(settlementSummary.policy?.minimum_payout_kes)}
                onClick={() => void submitSettlementAction('request_payout')}
                className="w-full rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-xs font-black uppercase text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40">
                {settlementBusy ? 'Processing…' : 'Request available payout'}
              </button>
              {!canOperate && <p className="text-xs text-amber-200">Settlement actions are available to approved merchant accounts.</p>}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 p-4">
              <h4 className="text-xs font-black uppercase tracking-wide text-zinc-300">Recent payable ledger entries</h4>
              <div className="mt-3 space-y-2">
                {settlementSummary.entries.slice(0, 8).map(entry => <div key={entry.id} className="flex flex-wrap justify-between gap-2 border-b border-white/5 pb-2 text-xs">
                  <span className="text-zinc-300">{entry.description}</span>
                  <strong className={Number(entry.amount_kes) < 0 ? 'text-rose-300' : 'text-emerald-300'}>{currency(Number(entry.amount_kes))}</strong>
                </div>)}
                {!settlementSummary.entries.length && <p className="text-xs text-zinc-500">No verified payable entries have been posted yet.</p>}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 p-4">
              <h4 className="text-xs font-black uppercase tracking-wide text-zinc-300">Payout request history</h4>
              <div className="mt-3 space-y-2">
                {settlementSummary.settlements.map(settlement => <div key={settlement.id} className="border-b border-white/5 pb-2 text-xs">
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong className="text-zinc-100">{currency(Number(settlement.amount_kes))}</strong>
                    <span className="font-bold uppercase text-amber-200">{settlement.status}</span>
                  </div>
                  <p className="mt-1 text-zinc-500">{dateTime(settlement.created_at)}{settlement.mpesa_receipt ? ` · Receipt ${settlement.mpesa_receipt}` : ''}</p>
                  {settlement.failure_message && <p className="mt-1 text-rose-200">{settlement.failure_message}</p>}
                </div>)}
                {!settlementSummary.settlements.length && <p className="text-xs text-zinc-500">No payout requests have been made.</p>}
              </div>
            </div>
          </div>
        </>}
      </section>
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
        Delivered item values below are an order-record export, not an earnings or payout calculation. The separate settlement ledger above includes only finance-configured shares on verified paid-and-delivered merchant-traced items, plus audited adjustments.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4">
          <p className="text-2xl font-black text-white">{deliveredOrders.length}</p>
          <p className="mt-1 text-xs font-bold uppercase text-zinc-400">Delivered orders in records</p>
        </article>
        <article className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4">
          <p className="text-2xl font-black text-white">KSh {totalRecordedValue.toLocaleString('en-KE', { maximumFractionDigits: 2 })}</p>
          <p className="mt-1 text-xs font-bold uppercase text-zinc-400">Recorded delivered item value · not payout</p>
        </article>
      </div>
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#1a1b1e]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <h3 className="font-black text-white">Delivered orders</h3>
            <p className="mt-1 text-xs text-zinc-400">Only quantities linked to this merchant&apos;s stock trace are included.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={!deliveredOrders.length} onClick={exportCsv} className="inline-flex items-center rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-zinc-200 disabled:opacity-50">
              <Download size={14} className="mr-2" /> Export records
            </button>
            <button
              type="button"
              disabled={!canOperate || working || !deliveredOrders.length}
              onClick={() => void onRequestStatement(deliveredOrders.map(order => order.id))}
              className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-zinc-950 disabled:opacity-50"
            >
              {working ? 'Sending…' : 'Request finance statement'}
            </button>
          </div>
        </div>
        {deliveredOrders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-zinc-400"><tr>
                <th className="px-4 py-3">Order</th><th className="px-4 py-3">Delivered</th><th className="px-4 py-3">Items</th><th className="px-4 py-3 text-right">Recorded item value</th>
              </tr></thead>
              <tbody className="divide-y divide-white/10">
                {deliveredOrders.map(order => <tr key={order.id}>
                  <td className="px-4 py-3 font-bold text-white">#{order.id}</td>
                  <td className="px-4 py-3 text-zinc-300">{dateTime(order.fulfillment.find(event => event.event_type === 'delivered')?.occurred_at || order.created_at)}</td>
                  <td className="px-4 py-3 text-zinc-300">{order.items.map(item => `${item.merchant_quantity ?? item.quantity} × ${item.product_name}`).join(', ')}</td>
                  <td className="px-4 py-3 text-right font-bold text-white">KSh {orderValue(order).toLocaleString('en-KE', { maximumFractionDigits: 2 })}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        ) : <p className="p-6 text-sm text-zinc-400">No delivered order records are available for this business yet.</p>}
      </section>
      <section className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-4">
        <h3 className="font-black text-white">Finance follow-up</h3>
        {latestRequest
          ? <p className="mt-2 text-sm text-zinc-300">Your statement request was recorded for OnBar Finance on {dateTime(latestRequest.created_at)}. This is a request only; it does not create or confirm a payout.</p>
          : <p className="mt-2 text-sm text-zinc-400">A statement request will be recorded in this merchant account and visible in the Admin merchant audit history.</p>}
        <p className="mt-3 text-xs leading-5 text-zinc-500">Payout destination setup, verification, fees, payout schedule, refunds, and settlement amounts require finance configuration and are not enabled here.</p>
      </section>
    </div>
  );
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

function MerchantSalesOverview({
  application,
  isFoodMerchant,
  foodOrders,
  partnerOrders,
  loading,
  error,
  performance,
  performanceLoading,
  performanceError,
  outOfStockProducts,
  onGoToStock,
  onGoToPayments,
  historyOnly = false
}: {
  application: PartnerApplication['application'];
  isFoodMerchant: boolean;
  foodOrders: FoodOrder[];
  partnerOrders: PartnerOrder[];
  loading: boolean;
  error: string;
  performance: MerchantPerformance | null;
  performanceLoading: boolean;
  performanceError: string;
  outOfStockProducts: Array<{ productId: number; productName: string }>;
  onGoToStock: (productId: number) => void;
  onGoToPayments?: () => void;
  historyOnly?: boolean;
}) {
  const [historyFilter, setHistoryFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const currency = (amount: number) => `KSh ${Math.round(amount).toLocaleString('en-KE')}`;
  const records: SellerSalesOrder[] = isFoodMerchant
    ? foodOrders.map(order => {
      const fulfillment = latestFulfillment(order.fulfillment);
      const cancelled = ['cancelled', 'canceled', 'refunded', 'rejected'].includes(order.status.toLowerCase())
        || ['cancelled', 'rejected'].includes(fulfillment);
      return {
        id: order.id,
        customerName: order.customer_name || 'Customer',
        createdAt: order.created_at,
        status: fulfillment || order.status,
        amount: cancelled ? 0 : order.items.reduce((total, item) =>
          total + Math.max(0, Number(item.unit_price) || 0) * Math.max(0, Number(item.quantity) || 0), 0),
        cancelled,
        active: !cancelled && !['delivered', 'complete', 'completed'].includes(fulfillment || order.status.toLowerCase()),
        itemCount: order.items.reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0),
        items: order.items.map(item => ({ name: item.product_name, quantity: Math.max(0, Number(item.quantity) || 0) })),
        events: order.fulfillment
      };
    })
    : partnerOrders.map(order => {
      const fulfillment = latestFulfillment(order.fulfillment);
      const cancelled = ['cancelled', 'canceled', 'refunded', 'rejected'].includes(order.status.toLowerCase())
        || ['cancelled', 'rejected'].includes(fulfillment);
      return {
        id: order.id,
        customerName: order.customer_name || 'Customer',
        createdAt: order.created_at,
        status: fulfillment || order.status,
        amount: cancelled ? 0 : order.items.reduce((total, item) =>
          total + Math.max(0, Number(item.unit_price) || 0)
            * Math.max(0, Number(item.merchant_quantity) || 0), 0),
        cancelled,
        active: !cancelled && !['delivered', 'complete', 'completed'].includes(fulfillment || order.status.toLowerCase()),
        itemCount: order.items.reduce((total, item) => total + Math.max(0, Number(item.merchant_quantity) || 0), 0),
        items: order.items.map(item => ({ name: item.product_name, quantity: Math.max(0, Number(item.merchant_quantity) || 0) })),
        events: order.fulfillment
      };
    });
  const dateKey = (value: string) => {
    const parsedDate = new Date(value);
    if (!Number.isFinite(parsedDate.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(parsedDate);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  const today = dateKey(new Date().toISOString());
  const trendDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(`${today}T00:00:00.000Z`);
    day.setUTCDate(day.getUTCDate() - (6 - index));
    const key = day.toISOString().slice(0, 10);
    return {
      key,
      label: day.toLocaleDateString('en-KE', { weekday: 'short', timeZone: 'Africa/Nairobi' }),
      amount: records.reduce((total, order) =>
        !order.cancelled && dateKey(order.createdAt) === key ? total + order.amount : total, 0)
    };
  });
  const todaySales = records.reduce((total, order) =>
    !order.cancelled && dateKey(order.createdAt) === today ? total + order.amount : total, 0);
  const completedOrdersToday = records.filter(order =>
    !order.cancelled && !order.active && dateKey(order.createdAt) === today).length;
  const averageReplySeconds = performance?.windows[7]?.averageResponseSeconds ?? null;
  const sellerItems = records
    .filter(order => !order.cancelled)
    .flatMap(order => order.items)
    .reduce((totals, item) => {
      totals.set(item.name, (totals.get(item.name) || 0) + item.quantity);
      return totals;
    }, new Map<string, number>());
  const topSellers = [...sellerItems.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5);
  const orderHourTotals = new Map<number, number>();
  for (const order of records) {
    if (order.cancelled) continue;
    const hour = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      hourCycle: 'h23'
    }).format(new Date(order.createdAt)));
    if (Number.isInteger(hour)) orderHourTotals.set(hour, (orderHourTotals.get(hour) || 0) + 1);
  }
  const busiestHours = [...orderHourTotals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3);
  const matchingOrders = [...records]
    .filter(order => historyFilter === 'all'
      || (historyFilter === 'active' && order.active)
      || (historyFilter === 'completed' && !order.active && !order.cancelled)
      || (historyFilter === 'cancelled' && order.cancelled))
    .filter(order => {
      const key = dateKey(order.createdAt);
      const term = historySearch.trim().toLowerCase();
      return (!term || String(order.id).includes(term) || order.customerName.toLowerCase().includes(term))
        && (!historyFrom || key >= historyFrom)
        && (!historyTo || key <= historyTo);
    });
  const visibleOrders = matchingOrders
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 20);
  const maxTrend = Math.max(1, ...trendDays.map(day => day.amount));
  const rating = performance?.windows[7]?.averageRating ?? null;
  const exportHistory = () => {
    const escapeCsv = (value: string | number) => {
      const safe = String(value).replace(/^[=+\-@]/, "'$&");
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const rows = [
      ['Order', 'Customer', 'Date', 'Items', 'Recorded item value', 'Status'],
      ...matchingOrders.map(order => [
        order.id,
        order.customerName,
        order.createdAt,
        order.items.map(item => `${item.quantity} x ${item.name}`).join('; '),
        order.amount.toFixed(2),
        order.status
      ])
    ];
    const csv = rows.map(row => row.map(escapeCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `merchant-orders-${dateKey(new Date().toISOString())}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="space-y-6 text-zinc-100">
    <header>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">{application.trading_name || application.business_name}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white">{historyOnly ? 'Order history' : 'Sales overview'}</h2>
          <p className="mt-1 text-sm text-zinc-400">{historyOnly ? 'Search, filter, and export your recorded customer orders.' : 'Your recorded order activity and item sales.'}</p>
        </div>
        <span className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-300">Merchant terminal</span>
      </div>
    </header>

    {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p>}

    {!historyOnly && <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
        <TrendingUp size={18} className="text-amber-400" />
        <p className="mt-4 text-xl font-black text-white">{loading ? '…' : error ? 'Unavailable' : currency(todaySales)}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Order sales today</p>
      </article>
      <article className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
        <Truck size={18} className="text-sky-300" />
        <p className="mt-4 text-xl font-black text-white">{loading ? '…' : error ? 'Unavailable' : completedOrdersToday}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Orders completed today</p>
      </article>
      <article className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
        <Star size={18} className="text-amber-300" />
        <p className="mt-4 text-xl font-black text-white">{performanceLoading ? '…' : performanceError ? 'Unavailable' : rating === null ? 'Not recorded' : `${rating.toFixed(1)} / 5`}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Average rating</p>
      </article>
      <article className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
        <Clock3 size={18} className="text-violet-300" />
        <p className="mt-4 text-xl font-black text-white">{performanceLoading ? '…' : performanceError ? 'Unavailable' : averageReplySeconds === null ? 'Not recorded' : `${Math.round(averageReplySeconds)} sec`}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Average reply · 7 days</p>
      </article>
    </div>

    {outOfStockProducts.length > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4">
      <p className="text-sm text-rose-100"><strong>{outOfStockProducts.length} catalog item{outOfStockProducts.length === 1 ? '' : 's'} out of stock:</strong> {outOfStockProducts.slice(0, 3).map(product => product.productName).join(', ')}{outOfStockProducts.length > 3 ? ` and ${outOfStockProducts.length - 3} more` : ''}</p>
      <button type="button" onClick={() => onGoToStock(outOfStockProducts[0].productId)} className="shrink-0 rounded-lg bg-rose-200 px-3 py-2 text-xs font-black text-rose-950">Update stock</button>
    </div>}

    <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
      <section className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-white">Sales activity</h3>
            <p className="mt-1 text-xs text-zinc-400">Recorded item values over the last seven days</p>
          </div>
          <span className="text-xs font-bold text-amber-300">{error ? 'Unavailable' : currency(trendDays.reduce((total, day) => total + day.amount, 0))}</span>
        </div>
        <div className="mt-6 grid h-44 grid-cols-7 items-end gap-2 sm:gap-4" role="img" aria-label="Recorded order item sales for the last seven days">
          {trendDays.map(day => <div key={day.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
            <span className="max-w-full truncate text-[9px] text-zinc-400">{day.amount > 0 ? currency(day.amount) : '—'}</span>
            <div className="flex h-28 w-full items-end rounded-t-lg bg-white/[0.03]">
              <div className="w-full rounded-t-lg bg-amber-400" style={{ height: `${day.amount ? Math.max(8, day.amount / maxTrend * 100) : 3}%` }} />
            </div>
            <span className="text-[10px] font-bold text-zinc-400">{day.label}</span>
          </div>)}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5 sm:p-6">
        <h3 className="font-black text-white">Sales & payouts</h3>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Sales are calculated from the item quantities and prices recorded against this business&apos;s orders. They are order values, not verified earnings.</p>
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
          <p className="text-sm font-bold text-amber-200">Merchant payouts are not configured yet</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">A withdrawable balance will appear only after OnBar configures the seller-share rules and connects a verified payout provider.</p>
          {onGoToPayments && (
            <button
              type="button"
              onClick={onGoToPayments}
              className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-zinc-950 hover:bg-amber-300"
            >
              <CreditCard size={14} className="mr-2" />
              View delivered order records
            </button>
          )}
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:col-span-2">
        <article className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
          <h3 className="font-black text-white">Top sellers</h3>
          {topSellers.length ? <ol className="mt-3 space-y-2">{topSellers.map(([name, quantity]) => <li key={name} className="flex justify-between gap-3 text-sm"><span className="truncate text-zinc-300">{name}</span><strong className="shrink-0 text-amber-300">{quantity} sold</strong></li>)}</ol>
            : <p className="mt-3 text-sm text-zinc-400">No recorded item sales yet.</p>}
        </article>
        <article className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
          <h3 className="font-black text-white">Busiest hours</h3>
          {busiestHours.length ? <ol className="mt-3 space-y-2">{busiestHours.map(([hour, count]) => <li key={hour} className="flex justify-between gap-3 text-sm"><span className="text-zinc-300">{String(hour).padStart(2, '0')}:00–{String((hour + 1) % 24).padStart(2, '0')}:00</span><strong className="text-amber-300">{count} order{count === 1 ? '' : 's'}</strong></li>)}</ol>
            : <p className="mt-3 text-sm text-zinc-400">No recorded order times yet.</p>}
        </article>
      </section>
    </div>
    </>}

    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#1a1b1e]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5 sm:px-6">
        <div>
          <h3 className="font-black text-white">{historyOnly ? 'Recorded orders' : 'Order history'}</h3>
          <p className="mt-1 text-xs text-zinc-400">{records.length} recorded orders</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-bold text-zinc-400">Search<Input value={historySearch} onChange={event => setHistorySearch(event.target.value)} placeholder="Order # or customer" className="mt-1 h-9 w-40 border-white/10 bg-[#111214] text-xs text-white" /></label>
          <label className="text-xs font-bold text-zinc-400">From<Input type="date" value={historyFrom} onChange={event => setHistoryFrom(event.target.value)} className="mt-1 h-9 w-36 border-white/10 bg-[#111214] text-xs text-white" /></label>
          <label className="text-xs font-bold text-zinc-400">To<Input type="date" min={historyFrom || undefined} value={historyTo} onChange={event => setHistoryTo(event.target.value)} className="mt-1 h-9 w-36 border-white/10 bg-[#111214] text-xs text-white" /></label>
          <label className="text-xs font-bold text-zinc-400">Status<select value={historyFilter} onChange={event => setHistoryFilter(event.target.value as typeof historyFilter)} className="mt-1 h-9 rounded-lg border border-white/10 bg-[#111214] px-3 text-xs text-white">
            <option value="all">All</option><option value="active">Live</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
          </select></label>
          <button type="button" onClick={exportHistory} disabled={!matchingOrders.length} className="h-9 rounded-lg border border-white/15 px-3 text-xs font-bold text-zinc-200 disabled:opacity-40">Export CSV</button>
        </div>
      </div>
      {loading && <p role="status" className="p-6 text-sm text-zinc-400">Loading recorded orders…</p>}
      {!loading && !error && visibleOrders.length === 0 && <p className="p-8 text-center text-sm text-zinc-400">No recorded orders match this filter.</p>}
      {!loading && !error && visibleOrders.length > 0 && <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wide text-zinc-400">
            <tr><th className="px-5 py-3 font-bold">Order</th><th className="px-5 py-3 font-bold">Customer</th><th className="px-5 py-3 font-bold">Date</th><th className="px-5 py-3 font-bold">Items</th><th className="px-5 py-3 font-bold">Order value</th><th className="px-5 py-3 font-bold">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {visibleOrders.map(order => <Fragment key={order.id}>
              <tr className="text-zinc-200">
              <td className="px-5 py-4 font-bold text-amber-300"><button type="button" aria-expanded={expandedOrderId === order.id} onClick={() => setExpandedOrderId(current => current === order.id ? null : order.id)} className="underline decoration-dotted underline-offset-4">#{order.id}</button></td>
              <td className="px-5 py-4">{order.customerName}</td>
              <td className="px-5 py-4 text-xs text-zinc-400">{dateTime(order.createdAt)}</td>
              <td className="px-5 py-4">{order.itemCount}</td>
              <td className="px-5 py-4 font-bold">{order.cancelled ? '—' : currency(order.amount)}</td>
              <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${order.cancelled ? 'bg-rose-400/10 text-rose-300' : order.active ? 'bg-sky-400/10 text-sky-300' : 'bg-emerald-400/10 text-emerald-300'}`}>{order.status.replaceAll('_', ' ')}</span></td>
              </tr>
              {expandedOrderId === order.id && <tr className="bg-white/[0.03]">
              <td colSpan={6} className="px-5 py-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div><p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Recorded items</p><ul className="mt-2 space-y-1 text-sm text-zinc-200">{order.items.map((item, index) => <li key={`${item.name}-${index}`}>{item.quantity} × {item.name}</li>)}</ul></div>
                  <div><p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Fulfillment timeline</p>
                    {order.events.length ? <ol className="mt-2 space-y-1 text-sm text-zinc-200">{[...order.events].sort((left, right) => new Date(left.occurred_at).getTime() - new Date(right.occurred_at).getTime()).map(event => <li key={event.id}>{event.event_type.replaceAll('_', ' ')} · {dateTime(event.occurred_at)}{typeof event.details?.note === 'string' ? ` · ${event.details.note}` : ''}</li>)}</ol>
                      : <p className="mt-2 text-sm text-zinc-400">No fulfillment events recorded.</p>}
                  </div>
                </div>
              </td>
              </tr>}
            </Fragment>)}
          </tbody>
        </table>
      </div>}
      <p className="border-t border-white/10 px-5 py-3 text-[10px] leading-5 text-zinc-500">Order values use the unit prices and quantities recorded on the order; they do not confirm seller earnings or payouts. Showing up to 20 of {matchingOrders.length} matching orders.</p>
    </section>
  </section>;
}

type MerchantChecklistItem = {
  label: string;
  detail: string;
  complete: boolean;
  target: Section;
};

function MerchantActionChecklist({
  items,
  onNavigate
}: {
  items: MerchantChecklistItem[];
  onNavigate: (section: Section) => void;
}) {
  return <section aria-labelledby="merchant-action-checklist" className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5 text-zinc-100">
    <h2 id="merchant-action-checklist" className="font-black text-white">Business action checklist</h2>
    <p className="mt-1 text-xs text-zinc-400">Live checks from your application, inventory, order, and incident records.</p>
    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
      {items.map(item => <li key={item.label} className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] p-3">
        <div>
          <p className={`text-sm font-bold ${item.complete ? 'text-emerald-300' : 'text-amber-200'}`}>{item.complete ? 'Done · ' : 'Action · '}{item.label}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">{item.detail}</p>
        </div>
        {!item.complete && <button type="button" onClick={() => onNavigate(item.target)} className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-[10px] font-black uppercase text-white">Open</button>}
      </li>)}
    </ul>
  </section>;
}

function MerchantProductPhotoGallery({
  productName,
  images
}: {
  productName: string;
  images: string[];
}) {
  if (!images.length) return null;
  return <div
    role="group"
    aria-label={`${productName} product photos`}
    className={`mb-4 grid gap-2 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
  >
    {images.map((image, index) => <div key={`${image}-${index}`} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-white/5">
      <Image
        src={image}
        alt={`${productName} photo ${index + 1}`}
        fill
        sizes="(max-width: 768px) 90vw, 360px"
        unoptimized
        className="object-contain p-3"
      />
    </div>)}
  </div>;
}

function FoodMerchantTerminal({
  section,
  application,
  overview,
  accessToken,
  canOperate,
  working,
  performance,
  performanceLoading,
  performanceError,
  foodOrders,
  foodOrdersLoading,
  foodOrdersError,
  deepLinkOrderId,
  orderSoundEnabled,
  onToggleOrderSound,
  onAction,
  onFoodFulfillment,
  onSectionChange,
  onOpenStock
}: {
  section: Section;
  application: PartnerApplication['application'];
  overview: PartnerApplication;
  accessToken: string;
  canOperate: boolean;
  working: boolean;
  performance: MerchantPerformance | null;
  performanceLoading: boolean;
  performanceError: string;
  foodOrders: FoodOrder[];
  foodOrdersLoading: boolean;
  foodOrdersError: string;
  deepLinkOrderId: string;
  orderSoundEnabled: boolean;
  onToggleOrderSound: () => Promise<void>;
  onAction: (body: Record<string, unknown>, successMessage: string) => Promise<boolean>;
  onFoodFulfillment: (orderId: number, eventType: string) => Promise<void>;
  onSectionChange: (section: Section) => void;
  onOpenStock: (productId?: number) => void;
}) {
  const [campaignName, setCampaignName] = useState('');
  const [campaignOffer, setCampaignOffer] = useState('');
  const [campaignStart, setCampaignStart] = useState('');
  const [campaignEnd, setCampaignEnd] = useState('');
  const [campaignDiscount, setCampaignDiscount] = useState('');
  const currency = (amount: number) => `KSh ${Number(amount || 0).toLocaleString('en-KE')}`;
  const currentFoodFulfillment = (order: FoodOrder) => latestFulfillment(order.fulfillment);
  const isClosedFoodOrder = (order: FoodOrder) =>
    ['delivered', 'complete', 'completed', 'cancelled', 'canceled', 'refunded'].includes(order.status.toLowerCase())
    || ['delivered', 'rejected', 'cancelled'].includes(currentFoodFulfillment(order));
  const openOrders = foodOrders.filter(order => !isClosedFoodOrder(order));
  const products = application.offered_goods_pricing;
  const foodReviewSection = section === 'food-reviews';

  if (section === 'sales') {
    const outOfStock = getOutOfStockProducts(overview.application, overview.batches);
    const openOrdersCount = foodOrders.filter(order => !isClosedFoodOrder(order)).length;
    const unresolvedIncidents = overview.incidents.filter(item => !['resolved', 'closed'].includes(item.status)).length;
    return <>
    <MerchantActionChecklist
      onNavigate={onSectionChange}
      items={[
        {
          label: 'Business approval',
          detail: application.status === 'approved' ? 'Your merchant account is approved.' : `Application status: ${application.status.replaceAll('_', ' ')}.`,
          complete: application.status === 'approved',
          target: 'food-business'
        },
        {
          label: 'Stock availability',
          detail: outOfStock.length ? `${outOfStock.length} approved item${outOfStock.length === 1 ? '' : 's'} out of stock.` : 'All approved catalog items have available stock.',
          complete: outOfStock.length === 0,
          target: 'food-menu'
        },
        {
          label: 'New catalog updates',
          detail: overview.catalogNotifications.length ? `${overview.catalogNotifications.length} new catalog update${overview.catalogNotifications.length === 1 ? '' : 's'} to review.` : 'No new catalog update notifications.',
          complete: overview.catalogNotifications.length === 0,
          target: 'food-menu'
        },
        {
          label: 'Order queue',
          detail: openOrdersCount ? `${openOrdersCount} assigned order${openOrdersCount === 1 ? '' : 's'} still open.` : 'No assigned orders need action.',
          complete: openOrdersCount === 0,
          target: 'food-live'
        },
        {
          label: 'Open incidents',
          detail: unresolvedIncidents
            ? `${unresolvedIncidents} unresolved incident(s).`
            : 'No unresolved merchant incidents.',
          complete: unresolvedIncidents === 0,
          target: 'food-history'
        }
      ]}
    />
    <MerchantSalesOverview
      application={application}
      isFoodMerchant
      foodOrders={foodOrders}
      partnerOrders={[]}
      loading={foodOrdersLoading}
      error={foodOrdersError}
      performance={performance}
      performanceLoading={performanceLoading}
      performanceError={performanceError}
      outOfStockProducts={getOutOfStockProducts(overview.application, overview.batches)}
      onGoToStock={onOpenStock}
      onGoToPayments={() => onSectionChange('food-payments')}
    />
    </>;
  }

  const submitCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await onAction({
      operation: 'request_food_campaign',
      applicationId: application.id,
      campaignName,
      offerDescription: campaignOffer,
      startDate: campaignStart,
      endDate: campaignEnd,
      discountPercent: campaignDiscount === '' ? null : Number(campaignDiscount)
    }, 'Black November offer request sent to OnBar for review.');
    if (saved) {
      setCampaignName('');
      setCampaignOffer('');
      setCampaignStart('');
      setCampaignEnd('');
      setCampaignDiscount('');
    }
  };

  const foodOrderCard = (order: FoodOrder, allowActions: boolean) => {
    const latest = currentFoodFulfillment(order);
    const nextEvents = fulfillmentNext[latest] || [];
    return <article id={`merchant-order-${order.id}`} key={order.id} className={`rounded-2xl border border-white/10 bg-[#1a1b1e] p-5 ${deepLinkOrderId === String(order.id) ? 'ring-2 ring-amber-400' : ''}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-amber-400">Order #{order.id}</p>
        <h3 className="mt-1 font-bold text-white">{order.customer_name || 'Customer'}</h3>
        <p className="mt-1 text-xs text-zinc-400">{dateTime(order.created_at)} · {order.status}</p>
      </div>
      <span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-[10px] font-black uppercase text-amber-300">
        {fulfillmentLabels[latest] || (order.status === 'Confirmed' ? 'Awaiting response' : order.status)}
      </span>
    </div>
    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
      {order.items.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-200"><strong>{item.quantity} × {item.product_name}</strong>{item.size ? ` · ${item.size}` : ''}</p>
          <p className="mt-1 text-xs text-zinc-400">{currency(item.unit_price)} each</p>
        </div>
      </div>)}
      <p className="text-xs text-zinc-400">Customer {order.customer_phone
        ? <a className="text-amber-300 underline" href={`tel:${order.customer_phone}`}>{order.customer_phone}</a>
        : 'phone number unavailable'}</p>
    </div>
    <div className="mt-3">
      <MerchantOrderTicket
        applicationName={application.trading_name || application.business_name}
        orderId={order.id}
        createdAt={order.created_at}
        status={fulfillmentLabels[latest] || order.status}
        items={order.items.map(item => ({
          name: item.product_name,
          quantity: item.quantity,
          detail: item.size,
          notes: formatOrderNotes(item.addons)
        }))}
      />
    </div>
    {allowActions && canOperate && nextEvents.length > 0 && <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
      {nextEvents.map(eventType => <button key={eventType} type="button" disabled={working} onClick={() => void onFoodFulfillment(order.id, eventType)}
        className={`rounded-xl px-4 py-2.5 text-xs font-black uppercase disabled:opacity-50 ${['rejected', 'cancelled'].includes(eventType) ? 'border border-rose-400/40 text-rose-300' : 'bg-amber-400 text-zinc-950'}`}>
        {fulfillmentLabels[eventType] || eventType.replaceAll('_', ' ')}
      </button>)}
    </div>}
    {order.fulfillment.length > 0 && <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
      {[...order.fulfillment].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()).map(event =>
        <span key={event.id} title={dateTime(event.occurred_at)} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-zinc-300">
          {fulfillmentLabels[event.event_type] || event.event_type.replaceAll('_', ' ')}
        </span>
      )}
    </div>}
  </article>;
  };

  const shell = (title: string, intro: string, children: React.ReactNode) => <section className="space-y-5 text-zinc-100">
    <header>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">{application.trading_name || application.business_name}</p>
      <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{intro}</p>
    </header>
    {children}
  </section>;

  if (section === 'food-live') {
    const awaiting = openOrders.filter(order => !currentFoodFulfillment(order)).length;
    const preparing = foodOrders.filter(order => ['accepted', 'preparing', 'ready'].includes(currentFoodFulfillment(order))).length;
    return shell('Live orders', 'A live view of orders assigned to your approved business. Update each order as your kitchen prepares and hands it off.', <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#1a1b1e] p-3">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Refreshes every 20 seconds · device chime {orderSoundEnabled ? 'on' : 'off'}</p>
        <button type="button" aria-pressed={orderSoundEnabled} onClick={() => void onToggleOrderSound()} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-zinc-100">{orderSoundEnabled ? <Volume2 size={14} className="mr-2 inline" /> : <VolumeX size={14} className="mr-2 inline" />}{orderSoundEnabled ? 'Turn sound off' : 'Enable and test sound'}</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Needs response', awaiting, Clock3],
          ['In progress', preparing, UtensilsCrossed],
          ['Menu items', products.length, Box],
          ['Open reports', overview.incidents.filter(item => !['resolved', 'closed'].includes(item.status)).length, AlertTriangle]
        ].map(([label, value, Icon]) => {
          const MetricIcon = Icon as typeof Store;
          return <div key={String(label)} className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
            <MetricIcon size={18} className="text-amber-400" />
            <p className="mt-4 text-3xl font-black text-white">{value as number}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-zinc-400">{label as string}</p>
          </div>;
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-black text-white">Current queue</h3>
        <button type="button" onClick={() => onSectionChange('food-history')} className="text-xs font-bold text-amber-300 hover:text-amber-200">Order history →</button>
      </div>
      {foodOrdersError && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{foodOrdersError}</p>}
      {foodOrdersLoading && <p role="status" className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4 text-sm text-zinc-400">Loading assigned food orders…</p>}
      {!foodOrdersLoading && openOrders.length ? <div className="grid gap-3 lg:grid-cols-2">{openOrders.map(order => foodOrderCard(order, true))}</div>
        : !foodOrdersLoading && <div className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-8 text-center text-sm text-zinc-400">No open food orders assigned to this business right now.</div>}
      <div className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-4 text-xs leading-5 text-zinc-400">
        Orders shown here are real customer orders containing food products approved for this business. Kitchen status updates are recorded on the order items.
      </div>
    </>);
  }

  if (section === 'food-menu') {
    const batchTotals = new Map<number, number>();
    for (const batch of overview.batches) {
      const current = new Date().toISOString().slice(0, 10);
      if (!batch.on_hold && (!batch.expiry_at || batch.expiry_at >= current)) {
        batchTotals.set(batch.product_id, (batchTotals.get(batch.product_id) || 0) + Math.max(0, batch.available_quantity));
      }
    }
    return shell('Menu', 'Products linked to your approved OnBar menu, with traceable stock and the current proposed price. You can update the proposed price and stock; OnBar reviews price changes before customer display.', <>
      <MerchantCatalogUpdateBanner
        application={application}
        notifications={overview.catalogNotifications}
        canOperate={canOperate}
        working={working}
        onAction={onAction}
        onOpenStock={onOpenStock}
      />
      {products.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {products.map(product => {
          const stock = batchTotals.get(product.product_id) || 0;
          return <article key={product.product_id} className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
            <MerchantProductPhotoGallery productName={product.product_name} images={product.images} />
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-black text-white">{product.product_name}</p><p className="mt-1 text-xs text-zinc-500">Catalog price {currency(product.listed_price)}</p></div>
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${stock > 0 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'}`}>{stock > 0 ? 'In stock' : 'Out of stock'}</span>
            </div>
            <p className="mt-5 text-2xl font-black text-amber-300">{currency(product.listed_price)}</p>
            <p className="mt-1 text-[10px] font-bold uppercase text-zinc-400">Current shared catalog base price</p>
            {product.pending_price != null && <p className="mt-2 rounded-lg bg-amber-400/10 p-2 text-xs font-bold text-amber-200">Your {product.pending_variant ? `${product.pending_variant} ` : ''}price request: {currency(product.pending_price)} · waiting for OnBar review</p>}
            <p className="mt-1 text-xs text-zinc-400">{stock === 0 ? 'Hidden from new merchant allocations while out of stock.' : `Recorded batch availability: ${stock}`}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canOperate || working || stock === 0}
                onClick={() => void onAction({
                  operation: 'set_stock_count',
                  applicationId: application.id,
                  productId: product.product_id,
                  quantity: 0,
                  expectedQuantity: stock,
                  lotCode: '',
                  supplierName: '',
                  expiryAt: null,
                  exciseStampConfirmed: false
                }, `${product.product_name} marked out of stock. Existing reserved orders are not changed.`)}
                className="rounded-xl border border-rose-300 px-4 py-2.5 text-xs font-black uppercase text-rose-700 disabled:opacity-50"
              >
                {stock > 0 ? 'Mark out of stock' : 'Out of stock'}
              </button>
              <button type="button" onClick={() => onOpenStock(product.product_id)} className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black uppercase text-zinc-950">Edit price & stock</button>
            </div>
          </article>;
        })}
      </div> : <div className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-8 text-sm text-zinc-400">No menu products have been linked to this business yet. Contact OnBar to connect approved catalog items.</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
        <div><h3 className="font-bold text-white">Stock and expiry tracking</h3><p className="mt-1 text-xs text-zinc-400">Add received batches, record lot numbers, and review expiry dates.</p></div>
        <button type="button" onClick={() => onOpenStock()} className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black uppercase text-zinc-950">Open inventory</button>
      </div>
      <MerchantInventoryCsv
        items={products.map(product => ({ id: product.product_id, name: product.product_name, currentQuantity: batchTotals.get(product.product_id) || 0 }))}
        alcoholMerchant={false}
        canOperate={canOperate}
        onApply={(change: StockChange) => onAction({
          operation: 'set_stock_count',
          applicationId: application.id,
          productId: change.product_id,
          quantity: change.quantity,
          expectedQuantity: change.expected_quantity,
          lotCode: change.lot_code,
          supplierName: change.supplier_name,
          expiryAt: change.expiry_at,
          exciseStampConfirmed: change.excise_stamp_confirmed
        }, `${change.productName} stock count saved to the merchant inventory ledger.`)}
      />
    </>);
  }

  if (section === 'food-promotions') {
    return shell('Black November Offer Promotions', 'Prepare a food offer request for OnBar review. Submitting this form records a campaign request; it does not activate a customer discount or change checkout prices.', <>
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm leading-6 text-amber-100">
        <strong className="text-amber-300">Review required.</strong> Customer-facing promotion activation and checkout discounting are not currently connected to this merchant workspace. OnBar will review the request before any offer is advertised.
      </div>
      <form onSubmit={submitCampaign} className="grid gap-4 rounded-2xl border border-white/10 bg-[#1a1b1e] p-5 md:grid-cols-2">
        <label className="text-xs font-bold text-zinc-300">Campaign name
          <Input required minLength={3} maxLength={100} value={campaignName} onChange={event => setCampaignName(event.target.value)} placeholder="Black November lunch offer" className="mt-2 border-white/10 bg-[#111214] text-white" />
        </label>
        <label className="text-xs font-bold text-zinc-300">Proposed discount percent (optional)
          <Input type="number" min="1" max="90" step="1" value={campaignDiscount} onChange={event => setCampaignDiscount(event.target.value)} placeholder="e.g. 10" className="mt-2 border-white/10 bg-[#111214] text-white" />
        </label>
        <label className="text-xs font-bold text-zinc-300 md:col-span-2">Offer details
          <textarea required minLength={10} maxLength={1000} value={campaignOffer} onChange={event => setCampaignOffer(event.target.value)} placeholder="Describe eligible menu items, conditions, and any limits." className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-[#111214] p-3 text-sm text-white placeholder:text-zinc-500" />
        </label>
        <label className="text-xs font-bold text-zinc-300">Requested start date
          <Input required type="date" value={campaignStart} onChange={event => setCampaignStart(event.target.value)} className="mt-2 border-white/10 bg-[#111214] text-white" />
        </label>
        <label className="text-xs font-bold text-zinc-300">Requested end date
          <Input required type="date" min={campaignStart || undefined} value={campaignEnd} onChange={event => setCampaignEnd(event.target.value)} className="mt-2 border-white/10 bg-[#111214] text-white" />
        </label>
        <div className="md:col-span-2">
          <button type="submit" disabled={!canOperate || working} className="rounded-xl bg-amber-400 px-5 py-3 text-xs font-black uppercase text-zinc-950 disabled:opacity-50">
            {working ? 'Sending request…' : 'Send offer for review'}
          </button>
          {!canOperate && <p className="mt-2 text-xs text-amber-300">Only approved businesses can submit a campaign request.</p>}
        </div>
      </form>
      <section className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
        <h3 className="font-black text-white">Recent requests</h3>
        <div className="mt-4 space-y-3">
          {overview.events.filter(item => item.event_type === 'food_campaign_requested').map((item, index) => <article key={`${item.created_at}-${index}`} className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0">
            <div>
              <p className="text-sm font-bold text-zinc-100">{typeof item.details?.campaign_name === 'string' ? item.details.campaign_name : 'Food campaign'}</p>
              <p className="mt-1 text-xs text-zinc-400">{typeof item.details?.requested_start_date === 'string' ? item.details.requested_start_date : 'Start date pending'} – {typeof item.details?.requested_end_date === 'string' ? item.details.requested_end_date : 'End date pending'}</p>
            </div>
            <span className="rounded-full bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase text-amber-300">Pending OnBar review · {dateTime(item.created_at)}</span>
          </article>)}
          {!overview.events.some(item => item.event_type === 'food_campaign_requested') && <p className="text-sm text-zinc-400">No campaign requests have been submitted.</p>}
        </div>
      </section>
    </>);
  }

  if (section === 'food-payments') {
    const paymentOrders: MerchantPaymentOrder[] = foodOrders.map(order => ({
      id: order.id,
      status: order.status,
      created_at: order.created_at,
      fulfillment: order.fulfillment,
      items: order.items.map(item => ({
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        size: item.size
      }))
    }));
    return shell('Payments', 'Delivered order records and finance statement requests. Recorded item values are not a payout or balance.', <>
      {foodOrdersError && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{foodOrdersError}</p>}
      {foodOrdersLoading && <p role="status" className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4 text-sm text-zinc-400">Loading delivered order records…</p>}
      <MerchantPaymentsPanel
        application={application}
        accessToken={accessToken}
        orders={paymentOrders}
        requests={overview.events}
        canOperate={canOperate}
        working={working}
        onRequestStatement={orderIds => onAction({
          operation: 'request_payment_statement',
          applicationId: application.id,
          orderIds
        }, 'Statement request recorded for OnBar Finance. It is not a payout request.')}
      />
    </>);
  }

  if (section === 'food-history') {
    return <MerchantSalesOverview
      application={application}
      isFoodMerchant
      foodOrders={foodOrders}
      partnerOrders={[]}
      loading={foodOrdersLoading}
      error={foodOrdersError}
      performance={performance}
      performanceLoading={performanceLoading}
      performanceError={performanceError}
      outOfStockProducts={getOutOfStockProducts(overview.application, overview.batches)}
      onGoToStock={onOpenStock}
      historyOnly
    />;
  }

  if (foodReviewSection) {
    const window = performance?.windows[7];
    return shell('Reviews & customer feedback', 'Review and reply to verified customer feedback linked to your fulfilled orders.', <>
      {performanceLoading && <div className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-6 text-sm text-zinc-400">Loading recorded scorecard…</div>}
      {performanceError && <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-4 text-sm text-rose-200">{performanceError}</div>}
      {!performanceLoading && window && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Average rating', window.averageRating === null ? 'Not recorded' : `${window.averageRating.toFixed(1)} / 5`],
          ['Completed orders', window.delivered],
          ['Recorded complaints', window.vendorComplaints],
          ['Ready on time', window.onTimePercent === null ? 'Not recorded' : `${window.onTimePercent}%`]
        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5"><p className="text-2xl font-black text-white">{value}</p><p className="mt-2 text-xs font-bold uppercase text-zinc-400">{label}</p></div>)}
      </div>}
      {!performanceLoading && !performanceError && !window && <div className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-6 text-sm text-zinc-400">No recorded customer scorecard data is available yet.</div>}
      <div className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-4 text-xs leading-5 text-zinc-400">This is aggregate scorecard data, not a feed of individual customer reviews. No ratings are generated when none have been recorded.</div>
      <MerchantReviewInbox applicationId={application.id} accessToken={accessToken} />
    </>);
  }

  return null;
}

function AlcoholMerchantTerminal({
  section,
  application,
  overview,
  accessToken,
  canOperate,
  working,
  performance,
  performanceLoading,
  performanceError,
  orderSoundEnabled,
  onToggleOrderSound,
  onAction,
  onSectionChange,
  onOpenStock
}: {
  section: Section;
  application: PartnerApplication['application'];
  overview: PartnerApplication;
  accessToken: string;
  canOperate: boolean;
  working: boolean;
  performance: MerchantPerformance | null;
  performanceLoading: boolean;
  performanceError: string;
  orderSoundEnabled: boolean;
  onToggleOrderSound: () => Promise<void>;
  onAction: (body: Record<string, unknown>, successMessage: string) => Promise<boolean>;
  onSectionChange: (section: Section) => void;
  onOpenStock: (productId?: number) => void;
}) {
  const [campaignName, setCampaignName] = useState('');
  const [campaignOffer, setCampaignOffer] = useState('');
  const [campaignStart, setCampaignStart] = useState('');
  const [campaignEnd, setCampaignEnd] = useState('');
  const [campaignDiscount, setCampaignDiscount] = useState('');
  const [minimumAge, setMinimumAge] = useState(String(application.alcohol_onboarding?.rules?.minimumAge ?? 18));
  const [maximumBottles, setMaximumBottles] = useState(String(application.alcohol_onboarding?.rules?.maximumBottlesPerOrder ?? 12));
  const [schoolBuffer, setSchoolBuffer] = useState(String(application.alcohol_onboarding?.rules?.schoolBufferMeters ?? 300));
  const hours = normalizeMerchantOperatingHours(application.operating_hours);
  const alcoholProfile = application.alcohol_onboarding;
  const isLive = application.status === 'approved' && application.accepting_orders;
  useEffect(() => {
    setMinimumAge(String(application.alcohol_onboarding?.rules?.minimumAge ?? 18));
    setMaximumBottles(String(application.alcohol_onboarding?.rules?.maximumBottlesPerOrder ?? 12));
    setSchoolBuffer(String(application.alcohol_onboarding?.rules?.schoolBufferMeters ?? 300));
  }, [application.id, application.alcohol_onboarding?.rules?.minimumAge, application.alcohol_onboarding?.rules?.maximumBottlesPerOrder, application.alcohol_onboarding?.rules?.schoolBufferMeters]);
  const panel = (title: string, intro: string, children: React.ReactNode) => <section className="space-y-5 text-zinc-100">
    <header>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">{application.trading_name || application.business_name}</p>
      <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{intro}</p>
    </header>
    {children}
  </section>;

  if (section === 'sales') {
    const outOfStock = getOutOfStockProducts(overview.application, overview.batches);
    const openOrdersCount = overview.orders.filter(order => !['delivered', 'cancelled', 'rejected'].includes(latestFulfillment(order.fulfillment))).length;
    const unresolvedIncidents = overview.incidents.filter(item => !['resolved', 'closed'].includes(item.status)).length;
    return <>
    <MerchantActionChecklist
      onNavigate={onSectionChange}
      items={[
        {
          label: 'Business approval and licence review',
          detail: application.status === 'approved' ? 'Your application is approved; alcohol licence checks are still subject to manual review.' : `Application status: ${application.status.replaceAll('_', ' ')}.`,
          complete: application.status === 'approved',
          target: 'liquor-compliance'
        },
        {
          label: 'Stock availability',
          detail: outOfStock.length ? `${outOfStock.length} approved item${outOfStock.length === 1 ? '' : 's'} out of stock.` : 'All approved catalog items have available stock.',
          complete: outOfStock.length === 0,
          target: 'liquor-catalog'
        },
        {
          label: 'New catalog updates',
          detail: overview.catalogNotifications.length ? `${overview.catalogNotifications.length} new catalog update${overview.catalogNotifications.length === 1 ? '' : 's'} to review.` : 'No new catalog update notifications.',
          complete: overview.catalogNotifications.length === 0,
          target: 'liquor-catalog'
        },
        {
          label: 'Order queue',
          detail: openOrdersCount ? `${openOrdersCount} assigned order${openOrdersCount === 1 ? '' : 's'} still open.` : 'No assigned orders need action.',
          complete: openOrdersCount === 0,
          target: 'liquor-live'
        },
        {
          label: 'Open incidents',
          detail: unresolvedIncidents ? `${unresolvedIncidents} unresolved incident(s).` : 'No unresolved merchant incidents.',
          complete: unresolvedIncidents === 0,
          target: 'liquor-history'
        }
      ]}
    />
    <MerchantSalesOverview
      application={application}
      isFoodMerchant={false}
      foodOrders={[]}
      partnerOrders={overview.orders}
      loading={false}
      error=""
      performance={performance}
      performanceLoading={performanceLoading}
      performanceError={performanceError}
      outOfStockProducts={getOutOfStockProducts(overview.application, overview.batches)}
      onGoToStock={onOpenStock}
      onGoToPayments={() => onSectionChange('liquor-payments')}
    />
    </>;
  }

  if (section === 'liquor-history') {
    return <MerchantSalesOverview
      application={application}
      isFoodMerchant={false}
      foodOrders={[]}
      partnerOrders={overview.orders}
      loading={false}
      error=""
      performance={performance}
      performanceLoading={performanceLoading}
      performanceError={performanceError}
      outOfStockProducts={getOutOfStockProducts(overview.application, overview.batches)}
      onGoToStock={onOpenStock}
      historyOnly
    />;
  }

  if (section === 'liquor-live') {
    const orders = overview.orders.filter(order => !['delivered', 'cancelled', 'rejected'].includes(latestFulfillment(order.fulfillment)));
    const minimumAge = application.alcohol_onboarding?.rules?.minimumAge ?? 18;
    return panel('Live orders', 'Orders linked to inventory batches assigned to this business. Age and ID must be checked at handoff; the terminal does not have a verified customer-age provider.',
      <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#1a1b1e] p-3">
          <p className="text-xs font-bold text-zinc-300">New-order sound: {orderSoundEnabled ? 'on' : 'off'}</p>
          <button type="button" aria-pressed={orderSoundEnabled} onClick={() => void onToggleOrderSound()} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-zinc-100">{orderSoundEnabled ? <Volume2 size={14} className="mr-2 inline" /> : <VolumeX size={14} className="mr-2 inline" />}{orderSoundEnabled ? 'Turn sound off' : 'Enable and test sound'}</button>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-xl border border-white/10 bg-[#1a1b1e] px-4 py-3"><p className="text-2xl font-black text-white">{orders.length}</p><p className="text-[10px] font-bold uppercase text-zinc-400">Open traced orders</p></div>
          <div className={`rounded-xl px-4 py-3 ${isLive ? 'bg-emerald-400/10 text-emerald-200' : 'bg-amber-400/10 text-amber-200'}`}><p className="font-black">{isLive ? 'Accepting orders' : 'Not accepting orders'}</p><p className="text-xs">{application.status === 'approved' ? 'Availability is linked to your saved hours.' : 'Admin approval is required.'}</p></div>
        </div>
        {orders.length ? <div className="grid gap-3 lg:grid-cols-2">{orders.map(order => {
          const latest = latestFulfillment(order.fulfillment);
          const nextEvents = fulfillmentNext[latest] || [];
          return <article key={order.id} className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-amber-400">Order #{order.id}</p><h3 className="mt-1 font-bold text-white">{order.customer_name || 'Customer'}</h3><p className="mt-1 text-xs text-zinc-400">{dateTime(order.created_at)} · {order.status}</p></div><span className="rounded-full bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase text-amber-200">{fulfillmentLabels[latest] || 'Awaiting response'}</span></div>
            <p className="mt-3 rounded-lg bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">Check a valid photo ID at delivery and confirm the recipient is at least {minimumAge}. Do not leave alcohol unattended, hand it to an unverified third party, or complete the handover if the recipient appears intoxicated.</p>
            <div className="mt-3 space-y-2">{order.items.map((item, index) => <p key={`${item.product_name}-${index}`} className="text-sm text-zinc-200">{item.merchant_quantity} × {item.product_name}{item.size ? ` · ${item.size}` : ''}</p>)}</div>
            <div className="mt-3">
              <MerchantOrderTicket
                applicationName={application.trading_name || application.business_name}
                orderId={order.id}
                createdAt={order.created_at}
                status={fulfillmentLabels[latest] || order.status}
                items={order.items.map(item => ({
                  name: item.product_name,
                  quantity: item.merchant_quantity,
                  detail: item.size
                }))}
              />
            </div>
            {section === 'liquor-live' && canOperate && nextEvents.length > 0 && <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">{nextEvents.map(eventType => <button key={eventType} type="button" disabled={working} onClick={() => void onAction({ operation: 'fulfillment', applicationId: application.id, orderId: order.id, eventType }, `Order #${order.id}: ${fulfillmentLabels[eventType]}.`)} className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase disabled:opacity-50 ${['rejected', 'cancelled'].includes(eventType) ? 'border border-rose-400/40 text-rose-200' : 'bg-amber-400 text-zinc-950'}`}>{fulfillmentLabels[eventType]}</button>)}</div>}
          </article>;
        })}</div> : <div className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-8 text-sm text-zinc-400">No open traced orders for this shop.</div>}
      </>);
  }

  if (section === 'liquor-catalog') {
    return panel('Catalog and stock', 'Approved catalogue items and actual received batch records. Excise-stamp status is an applicant attestation, not an authenticity scan.',
      <>
        <MerchantCatalogUpdateBanner
          application={application}
          notifications={overview.catalogNotifications}
          canOperate={canOperate}
          working={working}
          onAction={onAction}
          onOpenStock={onOpenStock}
        />
        <button
          type="button"
          onClick={() => onOpenStock(getOutOfStockProducts(overview.application, overview.batches)[0]?.productId)}
          className="rounded-xl bg-amber-400 px-4 py-3 text-xs font-black uppercase text-zinc-950 hover:bg-amber-300"
        >
          Update prices & stock
        </button>
        {application.offered_goods_pricing.length ? <div className="grid gap-3 md:grid-cols-2">{application.offered_goods_pricing.map(product => {
          const details = alcoholProfile?.products?.find(item => item.productId === product.product_id);
          const batches = overview.batches.filter(batch => batch.product_id === product.product_id);
          const available = batches.reduce((total, batch) => total + Math.max(0, batch.available_quantity), 0);
          return <article key={product.product_id} className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
            <MerchantProductPhotoGallery productName={product.product_name} images={product.images} />
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-white">{product.product_name}</h3><p className="mt-1 text-xs text-zinc-400">{details?.size || 'Size not recorded'} · {details?.abv === undefined ? 'ABV not recorded' : `${details.abv}% ABV`}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${details?.exciseStampConfirmed ? 'bg-amber-400/10 text-amber-200' : 'bg-rose-400/10 text-rose-200'}`}>{details?.exciseStampConfirmed ? 'Stamp attested' : 'Stamp not confirmed'}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/5 p-3"><p className="text-xl font-black text-white">{available}</p><p className="text-[10px] font-bold uppercase text-zinc-400">Available units in received batches</p><p className={`mt-2 text-xs font-black uppercase ${available > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{available > 0 ? 'In stock · available for new orders' : 'Out of stock · unavailable for new orders'}</p></div><div className="rounded-xl bg-white/5 p-3"><p className="text-xl font-black text-white">KSh {Number(product.listed_price).toLocaleString('en-KE')}</p><p className="text-[10px] font-bold uppercase text-zinc-400">Live catalog base price</p>{product.pending_price != null && <p className="mt-2 text-xs font-bold text-amber-700">Requested {product.pending_variant ? `${product.pending_variant} ` : ''}price: KSh {Number(product.pending_price).toLocaleString('en-KE')} · waiting for OnBar</p>}</div></div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canOperate || working || available === 0}
                onClick={() => void onAction({
                  operation: 'set_stock_count',
                  applicationId: application.id,
                  productId: product.product_id,
                  quantity: 0,
                  expectedQuantity: available,
                  lotCode: '',
                  supplierName: '',
                  expiryAt: null,
                  exciseStampConfirmed: false
                }, `${product.product_name} marked out of stock. Existing reserved orders are not changed.`)}
                className="rounded-lg border border-rose-400/40 px-3 py-2 text-[10px] font-black uppercase text-rose-200 disabled:opacity-50"
              >
                Mark out of stock
              </button>
              <button type="button" onClick={() => onOpenStock(product.product_id)} className="rounded-lg bg-amber-400 px-3 py-2 text-[10px] font-black uppercase text-zinc-950">
                Update quantity / restock
              </button>
            </div>
            {batches.length > 0 && <div className="mt-3 space-y-2">{batches.map(batch => <p key={batch.id} className="rounded-lg bg-white/5 p-2 text-xs text-zinc-300">Lot {batch.lot_code} · {batch.available_quantity} units · {batch.on_hold ? 'ON HOLD' : batch.expiry_at ? `Expires ${batch.expiry_at}` : 'No expiry recorded'}</p>)}</div>}
          </article>;
        })}</div> : <p className="rounded-2xl bg-[#1a1b1e] p-6 text-sm text-zinc-400">No products were approved for this retailer.</p>}
        <MerchantInventoryCsv
          items={application.offered_goods_pricing.map(product => ({
            id: product.product_id,
            name: product.product_name,
            currentQuantity: overview.batches
              .filter(batch => batch.product_id === product.product_id)
              .reduce((total, batch) => total + Math.max(0, batch.available_quantity), 0)
          }))}
          alcoholMerchant
          canOperate={canOperate}
          onApply={(change: StockChange) => onAction({
            operation: 'set_stock_count',
            applicationId: application.id,
            productId: change.product_id,
            quantity: change.quantity,
            expectedQuantity: change.expected_quantity,
            lotCode: change.lot_code,
            supplierName: change.supplier_name,
            expiryAt: change.expiry_at,
            exciseStampConfirmed: change.excise_stamp_confirmed
          }, `${change.productName} stock count saved to the merchant inventory ledger.`)}
        />
      </>);
  }

  if (section === 'liquor-promotions') {
    const submitCampaign = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const saved = await onAction({
        operation: 'request_alcohol_campaign',
        applicationId: application.id,
        campaignName,
        offerDescription: campaignOffer,
        startDate: campaignStart,
        endDate: campaignEnd,
        discountPercent: campaignDiscount ? Number(campaignDiscount) : null
      }, 'Alcohol promotion sent for admin review; it is not live yet.');
      if (saved) {
        setCampaignName('');
        setCampaignOffer('');
        setCampaignStart('');
        setCampaignEnd('');
        setCampaignDiscount('');
      }
    };
    const requests = overview.events.filter(event => event.event_type === 'alcohol_campaign_requested');
    return panel('Promotions', 'Submit an offer for review. Requests are recorded in your application timeline and do not change customer-facing prices or activate automatically.',
      <>
        <form onSubmit={submitCampaign} className="grid gap-3 rounded-2xl border border-white/10 bg-[#1a1b1e] p-5 md:grid-cols-2">
          <Input required minLength={3} maxLength={100} value={campaignName} onChange={event => setCampaignName(event.target.value)} placeholder="Promotion name" className="border-white/10 bg-[#111214] text-white" />
          <Input type="number" min="1" max="90" value={campaignDiscount} onChange={event => setCampaignDiscount(event.target.value)} placeholder="Optional discount percent" className="border-white/10 bg-[#111214] text-white" />
          <textarea required minLength={10} maxLength={1000} value={campaignOffer} onChange={event => setCampaignOffer(event.target.value)} placeholder="Products, terms and limits" className="min-h-24 rounded-xl border border-white/10 bg-[#111214] p-3 text-sm text-white md:col-span-2" />
          <Input required type="date" value={campaignStart} onChange={event => setCampaignStart(event.target.value)} className="border-white/10 bg-[#111214] text-white" />
          <Input required type="date" min={campaignStart || undefined} value={campaignEnd} onChange={event => setCampaignEnd(event.target.value)} className="border-white/10 bg-[#111214] text-white" />
          <button type="submit" disabled={!canOperate || working} className="rounded-xl bg-amber-400 px-4 py-3 text-xs font-black uppercase text-zinc-950 disabled:opacity-50 md:col-span-2">Send promotion for review</button>
        </form>
        <div className="space-y-3">{requests.map((event, index) => <article key={`${event.created_at}-${index}`} className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4"><p className="font-bold text-white">{String(event.details?.campaign_name || 'Promotion request')}</p><p className="mt-1 text-xs text-zinc-400">{String(event.details?.requested_start_date || '—')} to {String(event.details?.requested_end_date || '—')} · pending admin review · {dateTime(event.created_at)}</p></article>)}
          {!requests.length && <p className="text-sm text-zinc-400">No promotion requests recorded.</p>}</div>
      </>);
  }

  if (section === 'liquor-payments') {
    const paymentOrders: MerchantPaymentOrder[] = overview.orders.map(order => ({
      id: order.id,
      status: order.status,
      created_at: order.created_at,
      fulfillment: order.fulfillment,
      items: order.items.map(item => ({
        product_name: item.product_name,
        quantity: item.quantity,
        merchant_quantity: item.merchant_quantity,
        unit_price: item.unit_price,
        selling_price: item.selling_price,
        size: item.size
      }))
    }));
    return panel('Payments and settlement', 'Delivered order records and finance statement requests. Recorded item values are not a payout or balance.',
      <MerchantPaymentsPanel
        application={application}
        accessToken={accessToken}
        orders={paymentOrders}
        requests={overview.events}
        canOperate={canOperate}
        working={working}
        onRequestStatement={orderIds => onAction({
          operation: 'request_payment_statement',
          applicationId: application.id,
          orderIds
        }, 'Statement request recorded for OnBar Finance. It is not a payout request.')}
      />);
  }

  if (section === 'liquor-reviews') {
    const window = performance?.windows[7];
    return panel('Reviews and customer feedback', 'Review and reply to verified customer feedback linked to your fulfilled orders.',
      <>
        {performanceLoading && <p className="rounded-xl bg-[#1a1b1e] p-5 text-sm text-zinc-400">Loading recorded scorecard…</p>}
        {performanceError && <p role="alert" className="rounded-xl bg-rose-400/10 p-4 text-sm text-rose-200">{performanceError}</p>}
        {window && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
          ['Average rating', window.averageRating === null ? 'Not recorded' : `${window.averageRating.toFixed(1)} / 5`],
          ['Completed orders', String(window.delivered)],
          ['Recorded complaints', String(window.vendorComplaints)],
          ['On time', window.onTimePercent === null ? 'Not recorded' : `${window.onTimePercent}%`]
        ].map(([label, value]) => <article key={label} className="rounded-xl border border-white/10 bg-[#1a1b1e] p-5"><p className="text-2xl font-black text-white">{value}</p><p className="mt-2 text-xs font-bold uppercase text-zinc-400">{label}</p></article>)}</div>}
        {!performanceLoading && !performanceError && !window && <p className="rounded-xl bg-[#1a1b1e] p-5 text-sm text-zinc-400">No recorded customer scorecard data is available yet.</p>}
        <MerchantReviewInbox applicationId={application.id} accessToken={accessToken} />
      </>);
  }

  if (section === 'liquor-compliance') {
    const saveRules = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await onAction({
        operation: 'update_alcohol_rules',
        applicationId: application.id,
        minimumAge: Number(minimumAge),
        maximumBottlesPerOrder: Number(maximumBottles),
        schoolBufferMeters: Number(schoolBuffer)
      }, 'Alcohol rules saved and added to the audit timeline.');
    };
    const documentStatus = (document: PartnerDocument) => document.expiresAt && document.expiresAt < new Date().toISOString().slice(0, 10)
      ? `Expired ${document.expiresAt}`
      : document.expiresAt ? `Expires ${document.expiresAt}` : 'No expiry date recorded';
    const flaggedDocs = application.documents.filter(document => document.expiresAt && document.expiresAt <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    return panel('Compliance', 'Review the submitted documents and configure the merchant-side selling rules. These settings do not replace applicable law or legal advice.',
      <>
        {flaggedDocs.length > 0 && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100"><strong>Document expiry alert:</strong> {flaggedDocs.map(document => `${documentLabels[document.type] || document.type} (${documentStatus(document)})`).join('; ')}</div>}
        <div className="grid gap-3 md:grid-cols-2">{application.documents.map(document => <article key={document.id} className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4"><p className="font-bold text-white">{documentLabels[document.type] || document.type}</p><p className="mt-1 text-xs text-zinc-400">{document.name} · {documentStatus(document)}</p></article>)}</div>
        <form onSubmit={saveRules} className="grid gap-3 rounded-2xl border border-white/10 bg-[#1a1b1e] p-5 sm:grid-cols-3">
          <label className="text-xs font-bold text-zinc-300">Minimum age<select value={minimumAge} onChange={event => setMinimumAge(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#111214] px-3 text-sm"><option value="18">18</option><option value="21">21</option></select></label>
          <label className="text-xs font-bold text-zinc-300">Maximum bottles<Input type="number" min="1" max="100" required value={maximumBottles} onChange={event => setMaximumBottles(event.target.value)} className="mt-2 border-white/10 bg-[#111214] text-white" /></label>
          <label className="text-xs font-bold text-zinc-300">School buffer (m)<Input type="number" min="0" max="5000" required value={schoolBuffer} onChange={event => setSchoolBuffer(event.target.value)} className="mt-2 border-white/10 bg-[#111214] text-white" /></label>
          <button type="submit" disabled={!canOperate || working} className="rounded-xl bg-amber-400 px-4 py-3 text-xs font-black uppercase text-zinc-950 disabled:opacity-50 sm:col-span-3">Save compliance rules</button>
        </form>
        <p className="rounded-xl bg-amber-400/5 p-4 text-xs leading-5 text-amber-100">Applicant identity, face match, licence status, till-name match, school distance and excise stamps remain pending manual verification. Expired licences already prevent accepting new orders through the merchant availability checks.</p>
      </>);
  }

  if (section === 'liquor-hours') {
    const operating = Object.entries(hours).map(([day, value]) => ({ day, value })).filter(({ value }) => value.enabled);
    return panel('Trading hours', 'The saved business schedule controls routing and availability. Use the existing business controls to edit exact hours.',
      <>
        <div className="grid gap-2 sm:grid-cols-2">{operating.map(({ day, value }) => <p key={day} className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4 text-sm text-zinc-200"><strong className="capitalize">{day}:</strong> {value.open}–{value.close}</p>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#1a1b1e] p-5"><div><p className="font-black text-white">{application.accepting_orders ? 'Accepting new orders' : 'Paused for new orders'}</p><p className="mt-1 text-xs text-zinc-400">Current application state: {application.status}</p></div><button type="button" disabled={!canOperate || working} onClick={() => void onAction({ operation: 'update_availability', applicationId: application.id, operatingHours: hours, acceptingOrders: !application.accepting_orders }, application.accepting_orders ? 'New order routing paused.' : 'Shop is live and accepting orders during saved hours.')} className="rounded-xl bg-amber-400 px-4 py-3 text-xs font-black uppercase text-zinc-950 disabled:opacity-50">{application.accepting_orders ? 'Pause orders' : application.status === 'approved' ? 'Go live' : 'Awaiting approval'}</button></div>
      </>);
  }

  return null;
}

export default function OnBarPartnerNetworkPage() {
  const [accessToken, setAccessToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspace, setWorkspace] = useState<PartnerApplication[]>([]);
  const [foodOrders, setFoodOrders] = useState<FoodOrder[]>([]);
  const [foodOrdersLoading, setFoodOrdersLoading] = useState(false);
  const [foodOrdersError, setFoodOrdersError] = useState('');
  const [performance, setPerformance] = useState<MerchantPerformance | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState('');
  const [performanceDays, setPerformanceDays] = useState<7 | 30>(7);
  const [selectedId, setSelectedId] = useState('');
  const selected = workspace.find(item => item.application.id === selectedId) || workspace[0] || null;
  const orderTone = useOrderAlertTone(selected ? `merchant-${selected.application.id}` : 'merchant-default');
  const { play: playOrderTone, toggle: toggleOrderTone } = orderTone;
  const [section, setSection] = useState<Section>('sales');
  const [merchantAccentColor, setMerchantAccentColor] = useState(MERCHANT_ACCENT_PRESETS[0]);
  const [appearanceMessage, setAppearanceMessage] = useState('');
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [deepLinkApplicationId, setDeepLinkApplicationId] = useState('');
  const [deepLinkOrderId, setDeepLinkOrderId] = useState('');
  const [inventoryFocusProductId, setInventoryFocusProductId] = useState<number | null>(null);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState('all');
  const [enlargedProductPhoto, setEnlargedProductPhoto] = useState<{ name: string; imageUrl: string } | null>(null);
  const [photoRequestPending, setPhotoRequestPending] = useState<Set<number>>(() => new Set());
  const [unavailableInventoryPhotos, setUnavailableInventoryPhotos] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loginError, setLoginError] = useState('');
  const [batchForm, setBatchForm] = useState({ productId: '', lotCode: '', supplierName: '', quantity: '', expiryAt: '', notes: '', exciseStampConfirmed: false });
  const [stockCountDraft, setStockCountDraft] = useState<Record<number, string>>({});
  const [stockCountBase, setStockCountBase] = useState<Record<number, number>>({});
  const [offerPriceDraft, setOfferPriceDraft] = useState<Record<number, string>>({});
  const [offerVariantDraft, setOfferVariantDraft] = useState<Record<number, string>>({});
  const [stockCountDetails, setStockCountDetails] = useState<Record<number, {
    lotCode: string;
    supplierName: string;
    expiryAt: string;
    exciseStampConfirmed: boolean;
  }>>({});
  const [incidentForm, setIncidentForm] = useState({ link: '', category: 'other', description: '' });
  const [scheduleDraft, setScheduleDraft] = useState<MerchantOperatingHours>(() => normalizeMerchantOperatingHours(null));
  const [acceptingOrdersDraft, setAcceptingOrdersDraft] = useState(false);
  const [riderConnections, setRiderConnections] = useState<RiderConnection[]>([]);
  const [riderPhone, setRiderPhone] = useState('');
  const [ridersLoading, setRidersLoading] = useState(false);
  const [riderActionId, setRiderActionId] = useState('');
  const orderSoundEnabled = orderTone.enabled;
  const [newOrderAlert, setNewOrderAlert] = useState(false);
  const knownOrderIdsRef = useRef(new Map<string, Set<string>>());
  const newOrderAlertTimerRef = useRef<number | null>(null);
  const newOrderAlertStartedAtRef = useRef(0);

  const playOrderChime = useCallback((urgent = false) => {
    playOrderTone(urgent);
  }, [playOrderTone]);
  const toggleOrderSound = useCallback(async () => {
    try {
      await toggleOrderTone();
    } catch (soundError) {
      setError(soundError instanceof Error ? soundError.message : 'Sound alerts could not be enabled.');
    }
  }, [toggleOrderTone]);

  const stopNewOrderAlert = useCallback(() => {
    if (newOrderAlertTimerRef.current !== null) window.clearInterval(newOrderAlertTimerRef.current);
    newOrderAlertTimerRef.current = null;
    newOrderAlertStartedAtRef.current = 0;
    setNewOrderAlert(false);
  }, []);

  useEffect(() => {
    stopNewOrderAlert();
  }, [selected?.application.id, stopNewOrderAlert]);

  const registerOrderSnapshot = useCallback((feed: string, orderIds: string[]) => {
    let knownIds = knownOrderIdsRef.current.get(feed);
    if (!knownIds) {
      knownIds = new Set(orderIds);
      knownOrderIdsRef.current.set(feed, knownIds);
      return;
    }

    const newIds = orderIds.filter(orderId => !knownIds.has(orderId));
    orderIds.forEach(orderId => knownIds.add(orderId));
    if (newIds.length === 0) return;

    setNewOrderAlert(true);
    if (newOrderAlertTimerRef.current !== null) window.clearInterval(newOrderAlertTimerRef.current);
    newOrderAlertStartedAtRef.current = Date.now();
    playOrderChime();
    newOrderAlertTimerRef.current = window.setInterval(() => {
      playOrderChime(Date.now() - newOrderAlertStartedAtRef.current >= 10_000);
    }, 2_500);
  }, [playOrderChime]);

  useEffect(() => () => {
    if (newOrderAlertTimerRef.current !== null) window.clearInterval(newOrderAlertTimerRef.current);
  }, []);

  const canOperate = selected?.application.status === 'approved';
  const isFoodMerchant = Boolean(selected && (
    ['kitchen', 'restaurant', 'food_vendor'].includes(selected.application.business_type)
    || selected.application.vendor_type === 'street_food'
  ));
  const isLiquorMerchant = Boolean(selected
    && selected.application.business_type === 'bar'
    && selected.application.vendor_type === 'retailer');
  const merchantHoursSection = isFoodMerchant ? 'food-business' : 'business';
  const merchantTourSteps = useMemo<GuidedPanelTourStep[]>(() => [
    {
      selector: '[data-tour="merchant-navigation"]',
      title: 'Find your way around',
      description: 'These tabs take you to orders, stock, products, hours, payments, and support. You can reopen this tour any time.'
    },
    {
      selector: '[data-tour="merchant-inventory-tab"]',
      title: 'Keep stock accurate',
      description: 'Update quantities when stock changes. Alcohol stock may require lot, expiry, supplier, and excise-stamp details.'
    },
    ...(isFoodMerchant || isLiquorMerchant ? [{
      selector: '[data-tour="merchant-catalog-tab"]',
      title: 'Manage your product list',
      description: 'Review OnBar catalog products here, add your proposed prices, and watch for OnBar approval before a price takes effect.'
    }] : []),
    {
      selector: '[data-tour="merchant-orders-tab"]',
      title: 'Handle incoming orders',
      description: 'Open this tab to review new orders and update each order as you prepare it for rider pickup or collection.'
    },
    {
      selector: '[data-tour="merchant-hours-form"]',
      title: 'Set your operating hours',
      description: 'Choose which days you trade and enter opening and closing times in Nairobi time. Overnight hours are supported.',
      before: () => setSection(merchantHoursSection)
    },
    {
      selector: '[data-tour="merchant-hours-schedule"]',
      title: 'Set hours for each day',
      description: 'Turn each day on or off, then set its opening and closing times. Leave a day switched off when you are closed.'
    },
    {
      selector: '[data-tour="merchant-availability-toggle"]',
      title: 'Go online or pause orders',
      description: 'Turn this on only when you can accept new orders. You can pause temporarily without changing your weekly schedule.'
    },
    {
      selector: '[data-tour="merchant-hours-save"]',
      title: 'Save your schedule',
      description: 'Your hours and availability are saved only after you press this button. Dispatch uses the saved schedule for new orders.'
    },
    {
      selector: '[data-tour="merchant-support-tab"]',
      title: 'Contact the OnBar team',
      description: 'Open Support to message the admin/founder and follow replies in your merchant workspace.'
    }
  ], [isFoodMerchant, isLiquorMerchant, merchantHoursSection]);

  useEffect(() => {
    if (isFoodMerchant && !foodSections.some(item => item.id === section)) setSection('sales');
    if (!isFoodMerchant && section !== 'inventory' && foodSections.some(item => item.id !== 'sales' && item.id !== 'settings' && item.id === section)) setSection('overview');
    if (isLiquorMerchant && section !== 'inventory' && !liquorSections.some(item => item.id === section)) setSection('sales');
    if (!isLiquorMerchant && section !== 'inventory' && liquorSections.some(item => item.id !== 'sales' && item.id !== 'settings' && item.id === section)) setSection('overview');
  }, [isFoodMerchant, isLiquorMerchant, section]);

  useEffect(() => {
    if (!accessToken || !canOperate || !selected?.application.id) return;
    let active = true;
    const query = new URLSearchParams({ applicationId: selected.application.id });
    void fetch(`/api/merchant/preferences?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store'
    }).then(async response => {
      const result = await response.json() as { accentColor?: string; error?: string };
      if (!response.ok || !result.accentColor) throw new Error(result.error || 'Merchant appearance could not be loaded.');
      if (active) {
        setMerchantAccentColor(result.accentColor);
        setAppearanceMessage('');
      }
    }).catch(loadError => {
      if (active) setAppearanceMessage(loadError instanceof Error ? loadError.message : 'Merchant appearance could not be loaded.');
    });
    return () => { active = false; };
  }, [accessToken, canOperate, selected?.application.id]);

  useEffect(() => {
    setStockCountDraft({});
    setStockCountBase({});
    setOfferPriceDraft({});
    setStockCountDetails({});
  }, [selectedId]);

  const saveMerchantAccent = useCallback(async (color: string) => {
    if (!accessToken || !selected?.application.id || !/^#[\da-f]{6}$/i.test(color)) return;
    setMerchantAccentColor(color.toUpperCase());
    setAppearanceBusy(true);
    setAppearanceMessage('');
    try {
      const response = await fetch('/api/merchant/preferences', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: selected.application.id, accentColor: color }),
        cache: 'no-store'
      });
      const result = await response.json() as { accentColor?: string; error?: string };
      if (!response.ok || !result.accentColor) throw new Error(result.error || 'Merchant appearance could not be saved.');
      setMerchantAccentColor(result.accentColor);
      setAppearanceMessage('Saved');
    } catch (saveError) {
      setAppearanceMessage(saveError instanceof Error ? saveError.message : 'Merchant appearance could not be saved.');
    } finally {
      setAppearanceBusy(false);
    }
  }, [accessToken, selected?.application.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedSection = params.get('section');
    const validSections: Section[] = ['sales', 'overview', 'orders', 'inventory', 'performance', 'incidents', 'business', 'alerts', 'riders', 'settings',
      'food-live', 'food-menu', 'food-promotions', 'food-payments', 'food-history', 'food-reviews', 'food-business', 'food-staff'];
    if (requestedSection && validSections.includes(requestedSection as Section)) setSection(requestedSection as Section);
    setDeepLinkApplicationId(params.get('applicationId') || '');
    setDeepLinkOrderId(params.get('orderId') || '');
  }, []);

  useEffect(() => {
    if (section !== 'inventory' || inventoryFocusProductId === null || loading) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`merchant-stock-card-${inventoryFocusProductId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const quantityInput = document.getElementById(`merchant-stock-count-${inventoryFocusProductId}`);
      if (quantityInput instanceof HTMLInputElement) {
        quantityInput.focus({ preventScroll: true });
        quantityInput.select();
      }
      setInventoryFocusProductId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inventoryFocusProductId, loading, section, selectedId, workspace]);

  useEffect(() => {
    if (!deepLinkApplicationId || !workspace.length) return;
    const linkedWorkspace = workspace.find(item => item.application.id === deepLinkApplicationId);
    if (linkedWorkspace) {
      setSelectedId(deepLinkApplicationId);
      const foodBusiness = ['kitchen', 'restaurant', 'food_vendor'].includes(linkedWorkspace.application.business_type)
        || linkedWorkspace.application.vendor_type === 'street_food';
      setSection(foodBusiness ? 'food-history' : 'orders');
    }
  }, [deepLinkApplicationId, workspace]);

  useEffect(() => {
    const linkedOrderExists = section === 'food-history'
      ? foodOrders.some(order => String(order.id) === deepLinkOrderId)
      : selected?.orders.some(order => String(order.id) === deepLinkOrderId);
    if (!deepLinkOrderId || !['orders', 'food-history'].includes(section) || !linkedOrderExists) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`merchant-order-${deepLinkOrderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [deepLinkOrderId, foodOrders, section, selected?.orders]);

  useEffect(() => {
    if (!selected) return;
    setScheduleDraft(normalizeMerchantOperatingHours(selected.application.operating_hours));
    setAcceptingOrdersDraft(selected.application.accepting_orders);
  }, [selectedId, selected]);

  const loadWorkspace = useCallback(async (token: string, silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await fetch(silent ? '/api/merchant/network?refresh=1' : '/api/merchant/network', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const payload = await response.json() as { applications?: PartnerApplication[]; error?: string };
      if (!response.ok) {
        if (response.status === 403) {
          setWorkspace([]);
          setSelectedId('');
        }
        throw new Error(payload.error || 'Partner workspace could not be loaded.');
      }
      const applications = payload.applications || [];
      registerOrderSnapshot('network', applications.flatMap(item =>
        item.orders.map(order => `${item.application.id}:${order.id}`)
      ));
      setWorkspace(applications);
      setSelectedId(current => applications.some(item => item.application.id === current)
        ? current
        : applications[0]?.application.id || '');
      return applications;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Partner workspace could not be loaded.');
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [registerOrderSnapshot]);

  const loadFoodOrders = useCallback(async (silent = false) => {
    if (!accessToken || !selected?.application.id || selected.application.status !== 'approved') return;
    if (!silent) setFoodOrdersLoading(true);
    setFoodOrdersError('');
    try {
      const query = new URLSearchParams({ applicationId: selected.application.id });
      const response = await fetch(`/api/merchant/food-orders?${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const payload = await response.json() as { orders?: FoodOrder[]; error?: string };
      if (!response.ok || !payload.orders) throw new Error(payload.error || 'Food orders could not be loaded.');
      registerOrderSnapshot(`food:${selected.application.id}`, payload.orders.map(order => String(order.id)));
      setFoodOrders(payload.orders);
    } catch (loadError) {
      setFoodOrdersError(loadError instanceof Error ? loadError.message : 'Food orders could not be loaded.');
    } finally {
      if (!silent) setFoodOrdersLoading(false);
    }
  }, [accessToken, registerOrderSnapshot, selected?.application.id, selected?.application.status]);

  useEffect(() => {
    if (!isFoodMerchant || !canOperate || !['sales', 'food-live', 'food-history', 'food-payments'].includes(section) || !accessToken) {
      setFoodOrders([]);
      setFoodOrdersError('');
      setFoodOrdersLoading(false);
      return;
    }
    void loadFoodOrders();
    if (!['food-live', 'sales'].includes(section)) return;
    const interval = window.setInterval(() => void loadFoodOrders(true), 20_000);
    return () => window.clearInterval(interval);
  }, [accessToken, canOperate, isFoodMerchant, loadFoodOrders, section]);

  useEffect(() => {
    if (!accessToken || !['food-live', 'sales', 'orders', 'liquor-live'].includes(section)) return;
    const interval = window.setInterval(() => void loadWorkspace(accessToken, true), 20_000);
    return () => window.clearInterval(interval);
  }, [accessToken, loadWorkspace, section]);

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
    const shouldLoadPerformance = ['performance', 'food-reviews', 'liquor-reviews'].includes(section)
      || (section === 'sales' && selected?.application.vendor_type !== null);
    if (!shouldLoadPerformance || !accessToken || !applicationId || selected?.application.status !== 'approved') {
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
  }, [accessToken, section, selected?.application.id, selected?.application.status, selected?.application.vendor_type]);

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
    if (section === 'riders' || section === 'food-staff') void loadRiderConnections();
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
      const payload = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(payload.error || 'Your update could not be saved.');
      const refreshedApplications = await loadWorkspace(accessToken);
      if (body.operation === 'set_stock_count') {
        const productId = Number(body.productId);
        const expectedQuantity = Number(body.quantity);
        const refreshedApplication = refreshedApplications?.find(item => item.application.id === body.applicationId);
        if (!refreshedApplication) {
          throw new Error('Stock was accepted by the server, but the latest inventory could not be loaded. Refresh before making another stock change.');
        }
        const actualQuantity = refreshedApplication.batches
          .filter(batch => batch.product_id === productId)
          .reduce((total, batch) => total + batch.available_quantity, 0);
        if (actualQuantity !== expectedQuantity) {
          throw new Error(`Stock update was not confirmed. The latest inventory shows ${actualQuantity} available; refresh and try again.`);
        }
      }
      setMessage(payload.warning ? `${successMessage} ${payload.warning}` : successMessage);
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Your update could not be saved.');
      return false;
    } finally {
      setWorking(false);
    }
  };

  const performMerchantAction = async (body: Record<string, unknown>, successMessage: string) => {
    const saved = await apiAction(body, successMessage);
    if (saved && body.orderId) stopNewOrderAlert();
    if (saved && body.operation === 'set_stock_count') {
      const productId = Number(body.productId);
      setStockCountDraft(current => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
      setStockCountBase(current => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
      setStockCountDetails(current => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
    }
    return saved;
  };

  const requestProductPhoto = async (productId: number) => {
    if (!selected?.application.id) return;
    const saved = await apiAction({
      operation: 'request_product_photo',
      applicationId: selected.application.id,
      productId
    }, 'Photo request recorded for OnBar review. The approved catalog image will be shared across the app.');
    if (saved) {
      setPhotoRequestPending(current => new Set(current).add(productId));
    }
  };

  const openInventoryForProduct = (productId?: number) => {
    setInventoryFocusProductId(productId ?? null);
    setSection('inventory');
  };

  const updateStockCountDraft = (productId: number, currentAvailable: number, quantity: string) => {
    setStockCountBase(current => current[productId] === undefined
      ? { ...current, [productId]: currentAvailable }
      : current);
    setStockCountDraft(current => ({ ...current, [productId]: quantity }));
  };

  const updateFoodOrderFulfillment = async (orderId: number, eventType: string) => {
    if (!selected?.application.id) return;
    const saved = await apiAction({
      operation: 'fulfillment',
      applicationId: selected.application.id,
      orderId,
      eventType
    }, `Order #${orderId}: ${fulfillmentLabels[eventType] || eventType.replaceAll('_', ' ')}.`);
    if (saved) {
      stopNewOrderAlert();
      await loadFoodOrders(true);
    }
  };

  const productOptions = useMemo(() => {
    if (!selected) return [];
    return selected.application.offered_goods_pricing.filter(offer => {
      const product = {
        category: offer.category,
        sub_category: offer.sub_category,
        is_bite: offer.is_bite,
        is_snack: offer.is_snack,
        is_souvenir: offer.is_souvenir
      };
      if (isFoodMerchant) return isKitchenFoodProduct(product);
      if (isLiquorMerchant || selected.application.business_type === 'supplier'
        || selected.application.vendor_type === 'wholesaler') {
        return isBeverageInventoryProduct(product);
      }
      return true;
    }).map(offer => ({
        id: offer.product_id,
        name: offer.product_name,
        sku: null,
        category: offer.category,
        imageUrl: offer.image_url,
        imageUrls: offer.images,
        offer
      }));
  }, [isFoodMerchant, isLiquorMerchant, selected]);
  const inventoryCategoryOptions = useMemo(() => [...new Set(
    productOptions
      .map(product => product.category?.trim())
      .filter((category): category is string => Boolean(category))
  )].sort((a, b) => a.localeCompare(b)), [productOptions]);
  const filteredInventoryProducts = useMemo(() => {
    const query = inventorySearch.trim().toLowerCase();
    return productOptions.filter(product => {
      const currentAvailable = selected?.batches
        .filter(batch => batch.product_id === product.id)
        .reduce((total, batch) => total + batch.available_quantity, 0) ?? 0;
      const matchesSearch = !query
        || product.name.toLowerCase().includes(query)
        || (product.category || '').toLowerCase().includes(query);
      const matchesCategory = inventoryCategory === 'all'
        || (inventoryCategory === 'needs-attention'
          ? currentAvailable <= 5
          : product.category?.trim() === inventoryCategory);
      return matchesSearch && matchesCategory;
    });
  }, [inventoryCategory, inventorySearch, productOptions, selected?.batches]);

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
      notes: batchForm.notes,
      exciseStampConfirmed: batchForm.exciseStampConfirmed
    }, 'Inventory receipt recorded.');
    if (saved) setBatchForm({ productId: '', lotCode: '', supplierName: '', quantity: '', expiryAt: '', notes: '', exciseStampConfirmed: false });
  };

  const setProductStockCount = async (
    product: NonNullable<PartnerBatch['product']>,
    currentAvailable: number,
    quantity: number
  ) => {
    if (!selected) return;
    const details = stockCountDetails[product.id] || {
      lotCode: '',
      supplierName: '',
      expiryAt: '',
      exciseStampConfirmed: false
    };
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1_000_000) {
      setError('Available stock must be a whole number between 0 and 1,000,000.');
      return;
    }
    if (quantity > currentAvailable && !details.lotCode.trim()) {
      setError('Enter the actual lot or batch code for added stock.');
      return;
    }
    const saved = await apiAction({
      operation: 'set_stock_count',
      applicationId: selected.application.id,
      productId: product.id,
      quantity,
      expectedQuantity: currentAvailable,
      lotCode: details.lotCode,
      supplierName: details.supplierName,
      expiryAt: details.expiryAt || null,
      exciseStampConfirmed: details.exciseStampConfirmed
    }, quantity === 0
      ? `${product.name} marked out of stock. Existing reserved orders are unchanged.`
      : `${product.name} stock count saved to the merchant inventory ledger.`);
    if (saved) {
      setStockCountDraft(current => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
      setStockCountBase(current => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
      setStockCountDetails(current => ({
        ...current,
        [product.id]: { lotCode: '', supplierName: '', expiryAt: '', exciseStampConfirmed: false }
      }));
    }
  };

  const submitStockCount = async (
    event: FormEvent<HTMLFormElement>,
    product: NonNullable<PartnerBatch['product']>,
    currentAvailable: number
  ) => {
    event.preventDefault();
    if (stockCountBase[product.id] !== undefined && stockCountBase[product.id] !== currentAvailable) {
      setError(`${product.name} stock changed while you were editing. Reload the current count before saving.`);
      return;
    }
    const quantity = Number(stockCountDraft[product.id] ?? currentAvailable);
    await setProductStockCount(product, currentAvailable, quantity);
  };

  const submitOfferPrice = async (
    event: FormEvent<HTMLFormElement>,
    productId: number,
    currentPrice: number,
    variant: string | null
  ) => {
    event.preventDefault();
    if (!selected) return;
    const price = Number(offerPriceDraft[productId] ?? currentPrice);
    if (!Number.isFinite(price) || price <= 0 || price > 10_000_000
      || Math.round(price * 100) !== price * 100) {
      setError('Enter a selling price between KES 0.01 and KES 10,000,000 with no more than two decimal places.');
      return;
    }
    const saved = await apiAction({
      operation: 'set_offer_price',
      applicationId: selected.application.id,
      productId,
      price,
      expectedPrice: currentPrice,
      variant
    }, 'Price request sent to OnBar. The shared catalog and future order price will change only after admin approval.');
    if (saved) setOfferPriceDraft(current => ({ ...current, [productId]: price.toFixed(2) }));
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
              New to OnBar? <Link href="/auth?mode=signup" className="font-bold text-primary underline">Create a verified OnBar account</Link>, then return here to track your application.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const application = selected?.application;
  const overview = selected;
  const performanceWindow = performance?.windows[performanceDays];
  const closedOrderStatuses = ['delivered', 'complete', 'completed', 'cancelled', 'canceled', 'refunded', 'rejected'];
  const pendingOrderCount = isFoodMerchant
    ? foodOrders.filter(order => !latestFulfillment(order.fulfillment)
      && !closedOrderStatuses.includes(order.status.toLowerCase())).length
    : (selected?.orders || []).filter(order => !latestFulfillment(order.fulfillment)
      && !closedOrderStatuses.includes(order.status.toLowerCase())).length;
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
    <main
      className={`min-h-screen bg-slate-50 text-slate-900 ${isFoodMerchant || isLiquorMerchant ? 'merchant-light-terminal' : ''}`}
      style={{
        '--primary': merchantAccentColor,
        '--primary-foreground': getContrastForeground(merchantAccentColor)
      } as CSSProperties}
    >
      <header className={isFoodMerchant || isLiquorMerchant ? 'border-b border-white/10 bg-[#18191c]' : 'border-b border-slate-200 bg-white'}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <p className={`text-xs font-black uppercase tracking-[0.25em] ${isFoodMerchant || isLiquorMerchant ? 'text-amber-400' : 'text-primary'}`}>{isFoodMerchant ? 'OnBar Food Partner' : isLiquorMerchant ? 'OnBar Liquor Retailer' : 'OnBar Merchant Network'}</p>
            <h1 className={`mt-1 text-2xl font-black sm:text-3xl ${isFoodMerchant || isLiquorMerchant ? 'text-white' : 'text-slate-900'}`}>{isFoodMerchant || isLiquorMerchant ? 'Merchant Terminal' : 'Partner Workspace'}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className={`hidden text-sm sm:inline ${isFoodMerchant ? 'text-zinc-400' : 'text-slate-500'}`}>{email}</span>
            <Button type="button" variant="outline" onClick={() => void signOut()} className="rounded-xl"><LogOut size={16} className="mr-2" /> Sign out</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        {workspace.length > 1 && (
          <label className={`mb-5 block max-w-lg text-xs font-black uppercase tracking-wide ${isFoodMerchant || isLiquorMerchant ? 'text-zinc-400' : 'text-slate-500'}`}>
            Business
            <select value={selectedId} onChange={event => setSelectedId(event.target.value)} className={`mt-2 h-12 w-full rounded-xl border px-3 text-sm font-bold normal-case ${isFoodMerchant || isLiquorMerchant ? 'border-white/10 bg-[#1a1b1e] text-white' : 'border-slate-200 bg-white text-slate-800'}`}>
              {workspace.map(item => <option key={item.application.id} value={item.application.id}>{item.application.business_name} · {statusLabels[item.application.status] || item.application.status}</option>)}
            </select>
          </label>
        )}

        {(error || message) && <div role={error ? 'alert' : 'status'} className={`mb-5 flex items-start justify-between gap-3 rounded-xl p-4 text-sm ${error ? (isFoodMerchant || isLiquorMerchant ? 'border border-rose-400/30 bg-rose-400/10 text-rose-200' : 'bg-rose-50 text-rose-800') : (isFoodMerchant || isLiquorMerchant ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'bg-emerald-50 text-emerald-800')}`}>
          <span>{error || message}</span>
          <button type="button" onClick={() => { setError(''); setMessage(''); }} aria-label="Dismiss message">×</button>
        </div>}

        {newOrderAlert && (
          <div role="alert" aria-live="assertive" className="mb-5 flex animate-pulse flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-rose-500 bg-rose-50 p-4 text-rose-950 shadow-md">
            <p className="font-black">New order received — check your order queue.</p>
            <div className="flex gap-2">
              <Button type="button" onClick={() => {
                setSection(isFoodMerchant ? 'food-live' : isLiquorMerchant ? 'liquor-live' : 'orders');
                stopNewOrderAlert();
              }} className="rounded-lg">View orders</Button>
              <Button type="button" variant="outline" onClick={stopNewOrderAlert} className="rounded-lg">Dismiss</Button>
            </div>
          </div>
        )}

        {overview && <nav data-tour="merchant-navigation" className={`mb-6 flex gap-2 overflow-x-auto pb-1 ${isFoodMerchant || isLiquorMerchant ? 'border-b border-white/10' : ''}`} aria-label="Merchant workspace sections">
          {(isFoodMerchant ? foodSections : isLiquorMerchant ? liquorSections : sections.filter(item => item.id !== 'performance' || Boolean(selected?.application.vendor_type))).map(item => {
            const Icon = item.icon;
            const isOrderTab = ['food-live', 'liquor-live', 'orders'].includes(item.id);
            const catalogUpdateTab = item.id === 'food-menu' || item.id === 'liquor-catalog';
            const catalogUpdateCount = catalogUpdateTab ? overview.catalogNotifications.length : 0;
            const isHoursTab = item.id === 'business' || item.id === 'food-business';
            const tourTarget = item.id === 'inventory' ? 'merchant-inventory-tab'
              : catalogUpdateTab ? 'merchant-catalog-tab'
                : isOrderTab ? 'merchant-orders-tab'
                  : isHoursTab ? 'merchant-hours-tab'
                    : item.id === 'support' ? 'merchant-support-tab' : undefined;
            return <button key={item.id} type="button" data-tour={tourTarget} onClick={() => setSection(item.id)} className={`flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-3 text-xs font-black uppercase tracking-wide ${section === item.id ? (isFoodMerchant || isLiquorMerchant ? 'bg-amber-400 text-zinc-950' : 'bg-primary text-white') : (isFoodMerchant || isLiquorMerchant ? 'text-zinc-400 hover:bg-white/5 hover:text-white' : 'bg-white text-slate-600 hover:bg-slate-100')}`}><Icon size={16} />{item.label}{catalogUpdateCount > 0 && <span aria-label={`${catalogUpdateCount} new products`} className="rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-black text-white">{catalogUpdateCount}</span>}{isOrderTab && pendingOrderCount > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">{pendingOrderCount}</span>}</button>;
          })}
          <button type="button" disabled={loading} onClick={() => accessToken && void loadWorkspace(accessToken)} aria-label="Refresh workspace" className={`ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-50 ${isFoodMerchant || isLiquorMerchant ? 'text-zinc-400 hover:bg-white/5' : 'bg-white text-slate-600 hover:bg-slate-100'}`}><RefreshCw size={16} /></button>
        </nav>}

        {!loading && overview && selected && section === 'settings' && (
          <section className="space-y-5">
            <header><h2 className="text-xl font-black text-slate-900">Terminal settings</h2><p className="mt-1 text-sm text-slate-500">Appearance and new-order sound preferences for {selected.application.business_name}.</p></header>
            <article className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mr-3 min-w-48">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-700"><Palette size={15} /> Workspace color</p>
                <p role="status" className="mt-1 text-xs text-slate-500">{appearanceBusy ? 'Saving…' : appearanceMessage || 'Personalize this merchant workspace.'}</p>
              </div>
              {MERCHANT_ACCENT_PRESETS.map(color => (
                <button key={color} type="button" aria-label={`Choose ${color} workspace color`}
                  aria-pressed={merchantAccentColor === color} onClick={() => void saveMerchantAccent(color)}
                  className={`h-9 w-9 rounded-full border-2 ${merchantAccentColor === color ? 'border-slate-900' : 'border-transparent'}`}
                  style={{ backgroundColor: color }} />
              ))}
              <label aria-label="Choose custom workspace color" className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-slate-100">
                <Palette size={15} className="text-slate-600" />
                <input type="color" value={merchantAccentColor} onChange={event => void saveMerchantAccent(event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </label>
            </article>
            <OrderAlertToneSettings controller={orderTone} />
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Order sound is an optional browser convenience. Keep push, SMS, or voice alerts configured in Order Alerts for background and locked-screen notifications.</p>
          </section>
        )}

        {loading && <div className="rounded-2xl bg-white p-12 text-center text-slate-500"><Loader2 className="mx-auto mb-3 animate-spin text-primary" /><p className="text-sm font-semibold">Loading your business workspace...</p></div>}

        {!loading && !overview && (
          <section className="rounded-2xl bg-white p-7 shadow-sm sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><Clock3 /></div>
            <h2 className="mt-4 text-xl font-black text-slate-900">Merchant terminal access requires approval</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Your merchant terminal and business data are available only after OnBar admins approve the application and link it to this verified account. If you have already been approved, sign in with the account used for the application or contact OnBar support.</p>
          </section>
        )}

        {!loading && overview && application && isFoodMerchant && (
          <FoodMerchantTerminal
            section={section}
            application={application}
            overview={overview}
            accessToken={accessToken}
            canOperate={canOperate}
            working={working}
            performance={performance}
            performanceLoading={performanceLoading}
            performanceError={performanceError}
            foodOrders={foodOrders}
            foodOrdersLoading={foodOrdersLoading}
            foodOrdersError={foodOrdersError}
            deepLinkOrderId={deepLinkOrderId}
            orderSoundEnabled={orderSoundEnabled}
            onToggleOrderSound={toggleOrderSound}
            onAction={performMerchantAction}
            onFoodFulfillment={updateFoodOrderFulfillment}
            onSectionChange={setSection}
            onOpenStock={openInventoryForProduct}
          />
        )}

        {!loading && overview && application && isLiquorMerchant && liquorSections.some(item => item.id === section) && (
          <AlcoholMerchantTerminal
            section={section}
            application={application}
            overview={overview}
            accessToken={accessToken}
            canOperate={canOperate}
            working={working}
            performance={performance}
            performanceLoading={performanceLoading}
            performanceError={performanceError}
            orderSoundEnabled={orderSoundEnabled}
            onToggleOrderSound={toggleOrderSound}
            onAction={performMerchantAction}
            onSectionChange={setSection}
            onOpenStock={openInventoryForProduct}
          />
        )}

        {!loading && selected && section === 'sales' && (
          <MerchantWeeklyDigestSettings
            applicationId={selected.application.id}
            accessToken={accessToken}
          />
        )}

        {!loading && overview && selected && section === 'support' && (
          <MerchantSupportPanel
            applicationId={selected.application.id}
            applicationName={selected.application.trading_name || selected.application.business_name}
            accessToken={accessToken}
          />
        )}

        {!loading && overview && application && !isFoodMerchant && !isLiquorMerchant && section === 'sales' && (
          <MerchantSalesOverview
            application={application}
            isFoodMerchant={false}
            foodOrders={[]}
            partnerOrders={overview.orders}
            loading={false}
            error=""
            performance={performance}
            performanceLoading={performanceLoading}
            performanceError={performanceError}
            outOfStockProducts={getOutOfStockProducts(overview.application, overview.batches)}
            onGoToStock={openInventoryForProduct}
          />
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

                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
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

        {!loading && overview && ['riders', 'food-staff'].includes(section) && application && (
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-bold text-slate-600">New-order sound: {orderSoundEnabled ? 'on' : 'off'}</p>
              <Button type="button" variant={orderSoundEnabled ? 'outline' : 'default'} aria-pressed={orderSoundEnabled} onClick={() => void toggleOrderSound()} className="rounded-lg">
                {orderSoundEnabled ? <Volume2 size={15} className="mr-2" /> : <VolumeX size={15} className="mr-2" />}
                {orderSoundEnabled ? 'Turn sound off' : 'Enable and test sound'}
              </Button>
            </div>
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
                    {canOperate && nextEvents.map(eventType => <Button key={eventType} type="button" disabled={working} variant={eventType === 'rejected' || eventType === 'cancelled' ? 'outline' : 'default'} onClick={() => void apiAction({ operation: 'fulfillment', applicationId: application.id, orderId: order.id, eventType }, `Order ${order.id}: ${fulfillmentLabels[eventType].toLowerCase()} recorded.`)} className="rounded-xl text-xs font-black uppercase">{fulfillmentLabels[eventType]}</Button>)}
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
            {(() => {
              const latestConfirmation = overview.events
                .filter(event => event.event_type === 'stock_confirmed')
                .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0];
              const latestMovementAt = overview.batches
                .flatMap(batch => batch.movements.map(movement => movement.created_at))
                .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
              const confirmationIsCurrent = Boolean(latestConfirmation)
                && (!latestMovementAt || new Date(latestConfirmation.created_at).getTime() >= new Date(latestMovementAt).getTime());
              const nairobiDate = (value: string) => new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Africa/Nairobi',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
              }).format(new Date(value));
              const confirmedToday = confirmationIsCurrent
                && nairobiDate(latestConfirmation!.created_at) === nairobiDate(new Date().toISOString());
              return <article className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${confirmedToday ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <div>
                  <p className={`text-xs font-black uppercase tracking-wide ${confirmedToday ? 'text-emerald-800' : 'text-amber-900'}`}>
                    {confirmedToday ? 'Verified Stock · Today' : latestConfirmation && !confirmationIsCurrent ? 'Stock changed since your last check' : 'Daily stock check'}
                  </p>
                  <p className={`mt-1 text-sm ${confirmedToday ? 'text-emerald-900' : 'text-amber-950'}`}>
                    {confirmedToday
                      ? `Your current catalog stock was confirmed at ${dateTime(latestConfirmation!.created_at)}.`
                      : 'Review your catalog counts, then confirm that they match what is physically on hand.'}
                  </p>
                </div>
                <Button
                  type="button"
                  disabled={!canOperate || working || productOptions.length === 0}
                  onClick={() => selected && void apiAction({
                    operation: 'confirm_stock',
                    applicationId: selected.application.id
                  }, 'Stock confirmed and recorded in your merchant audit history.')}
                  className="rounded-xl font-bold"
                >
                  <CheckCircle2 size={16} className="mr-2" />
                  My stock is correct
                </Button>
              </article>;
            })()}
            <div>
              <h2 className="text-xl font-black text-slate-900">Inventory and stock counts</h2>
              <p className="mt-1 text-sm text-slate-600">Set the units available for new orders. Updates are saved to the same audited stock ledger used by OnBar Admin and dispatch.</p>
            </div>
            {canOperate && productOptions.length > 0 && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
                Available stock excludes held or expired batches and stock already allocated to orders. Lowering a count cannot remove units reserved for a customer. Increasing stock requires the real lot code; alcohol stock also needs an excise-stamp attestation.
              </div>
            )}
            {canOperate && productOptions.length > 0 && (
              <>
              <section className="space-y-3" aria-label="Find stock products">
                <label className="relative block">
                  <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={inventorySearch}
                    onChange={event => setInventorySearch(event.target.value)}
                    placeholder="Search products"
                    aria-label="Search stock products"
                    className="h-12 rounded-xl pl-10"
                  />
                </label>
                <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter stock products">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'needs-attention', label: 'Needs attention' },
                    ...inventoryCategoryOptions.map(category => ({ id: category, label: category }))
                  ].map(filter => (
                    <button
                      key={filter.id}
                      type="button"
                      aria-pressed={inventoryCategory === filter.id}
                      onClick={() => setInventoryCategory(filter.id)}
                      className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition-colors ${
                        inventoryCategory === filter.id
                          ? 'border-amber-400 bg-amber-400 text-slate-950'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-amber-300'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </section>
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredInventoryProducts.map(product => {
                  const availablePhotos = product.imageUrls
                    .filter(image => !unavailableInventoryPhotos.has(`${product.id}:${image}`));
                  const currentAvailable = overview.batches
                    .filter(batch => batch.product_id === product.id)
                    .reduce((total, batch) => total + batch.available_quantity, 0);
                  const targetQuantity = Number(stockCountDraft[product.id] ?? currentAvailable);
                  const stockDraftIsStale = stockCountBase[product.id] !== undefined
                    && stockCountBase[product.id] !== currentAvailable;
                  const isAddingStock = targetQuantity > currentAvailable;
                  const stockStatus = currentAvailable === 0
                    ? { label: 'Out', className: 'bg-rose-100 text-rose-800' }
                    : currentAvailable <= 5
                      ? { label: 'Low', className: 'bg-amber-100 text-amber-900' }
                      : { label: 'OK', className: 'bg-emerald-100 text-emerald-800' };
                  const details = stockCountDetails[product.id] || {
                    lotCode: '',
                    supplierName: '',
                    expiryAt: '',
                    exciseStampConfirmed: false
                  };
                  return (
                    <article
                      key={product.id}
                      id={`merchant-stock-card-${product.id}`}
                      className={`space-y-3 rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5 ${inventoryFocusProductId === product.id ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-200'}`}
                    >
                      <div className="relative flex h-48 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-slate-100 via-slate-50 to-amber-50">
                        <span className={`absolute left-3 top-3 z-10 rounded-full px-3 py-1 text-[10px] font-black uppercase ${stockStatus.className}`}>
                          {stockStatus.label}
                        </span>
                        {availablePhotos.length > 0 ? (
                          <div className={`absolute inset-0 grid ${availablePhotos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-1 p-1`}>
                            {availablePhotos.map((imageUrl, index) => <button
                              key={`${imageUrl}-${index}`}
                              type="button"
                              onClick={() => setEnlargedProductPhoto({ name: `${product.name} · photo ${index + 1}`, imageUrl })}
                              aria-label={`Tap to enlarge ${product.name} photo ${index + 1}`}
                              className="relative min-h-0 overflow-hidden rounded-lg"
                            >
                              <Image
                                src={imageUrl}
                                alt={`${product.name} photo ${index + 1}`}
                                fill
                                sizes="(max-width: 1024px) 45vw, 280px"
                                unoptimized
                                className="object-contain p-3 transition-transform duration-300 hover:scale-105"
                                onError={() => setUnavailableInventoryPhotos(current => new Set(current).add(`${product.id}:${imageUrl}`))}
                              />
                            </button>)}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 px-4 text-center">
                            <ImageIcon size={34} aria-hidden="true" className="text-slate-400" />
                            <p className="text-sm font-bold text-slate-600">No product photo yet</p>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={working || photoRequestPending.has(product.id)}
                              onClick={() => void requestProductPhoto(product.id)}
                              className="h-9 rounded-full border-slate-300 bg-white text-xs font-bold"
                            >
                              {photoRequestPending.has(product.id) ? 'Photo requested' : 'Request a product photo'}
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-black text-slate-900">{product.name}</h3>
                          <p className="mt-1 text-xs text-slate-500">Current available stock: {currentAvailable}{product.category ? ` · ${product.category}` : ''}</p>
                        </div>
                      </div>
                      <form onSubmit={event => void submitStockCount(event, product, currentAvailable)} className="space-y-3">
                      {stockDraftIsStale && (
                        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                          Stock changed after you started editing. Reload the latest count before saving so you do not overwrite a newer update.
                          <button
                            type="button"
                            onClick={() => {
                              setStockCountDraft(current => {
                                const next = { ...current };
                                delete next[product.id];
                                return next;
                              });
                              setStockCountBase(current => {
                                const next = { ...current };
                                delete next[product.id];
                                return next;
                              });
                              setStockCountDetails(current => {
                                const next = { ...current };
                                delete next[product.id];
                                return next;
                              });
                              setError('');
                            }}
                            className="ml-1 font-black underline"
                          >
                            Reload current count
                          </button>
                        </div>
                      )}
                      <label className="block text-xs font-bold text-slate-700">
                        Set available units
                        <div className="mt-1 flex gap-2">
                          <Button type="button" variant="outline" aria-label={`Decrease ${product.name} stock`} disabled={working || targetQuantity <= 0} onClick={() => updateStockCountDraft(product.id, currentAvailable, String(targetQuantity - 1))}>−</Button>
                          <Input
                            id={`merchant-stock-count-${product.id}`}
                            required
                            type="number"
                            min="0"
                            max="1000000"
                            step="1"
                            value={stockCountDraft[product.id] ?? String(currentAvailable)}
                            onChange={event => updateStockCountDraft(product.id, currentAvailable, event.target.value)}
                            className="h-11 rounded-xl"
                            aria-label={`Available units for ${product.name}`}
                          />
                          <Button type="button" variant="outline" aria-label={`Increase ${product.name} stock`} disabled={working || targetQuantity >= 1000000} onClick={() => updateStockCountDraft(product.id, currentAvailable, String(targetQuantity + 1))}>+</Button>
                        </div>
                      </label>
                      {isAddingStock && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            required
                            maxLength={120}
                            value={details.lotCode}
                            onChange={event => setStockCountDetails(current => ({
                              ...current,
                              [product.id]: { ...details, lotCode: event.target.value }
                            }))}
                            placeholder="Actual lot / batch code"
                            aria-label={`Lot code for ${product.name}`}
                            className="rounded-xl"
                          />
                          <Input
                            maxLength={160}
                            value={details.supplierName}
                            onChange={event => setStockCountDetails(current => ({
                              ...current,
                              [product.id]: { ...details, supplierName: event.target.value }
                            }))}
                            placeholder="Supplier (optional)"
                            aria-label={`Supplier for ${product.name}`}
                            className="rounded-xl"
                          />
                          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                            Expiry date (optional)
                            <Input
                              type="date"
                              min={new Date().toISOString().slice(0, 10)}
                              value={details.expiryAt}
                              onChange={event => setStockCountDetails(current => ({
                                ...current,
                                [product.id]: { ...details, expiryAt: event.target.value }
                              }))}
                              className="mt-1 rounded-xl"
                              aria-label={`Expiry date for ${product.name}`}
                            />
                          </label>
                          {isLiquorMerchant && (
                            <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 sm:col-span-2">
                              <input
                                type="checkbox"
                                checked={details.exciseStampConfirmed}
                                onChange={event => setStockCountDetails(current => ({
                                  ...current,
                                  [product.id]: { ...details, exciseStampConfirmed: event.target.checked }
                                }))}
                                className="mt-1 h-4 w-4 shrink-0 accent-amber-500"
                              />
                              I confirm this added alcohol stock carries KRA excise stamps. This is a merchant declaration, not an authenticity scan.
                            </label>
                          )}
                        </div>
                      )}
                      <Button
                        type="submit"
                        disabled={working || stockDraftIsStale || !Number.isSafeInteger(targetQuantity) || targetQuantity === currentAvailable}
                        className="h-10 rounded-xl font-bold"
                      >
                        {working ? <Loader2 size={15} className="mr-2 animate-spin" /> : <PackageCheck size={15} className="mr-2" />}
                        Save stock count
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={working || currentAvailable === 0}
                        onClick={() => void setProductStockCount(product, currentAvailable, 0)}
                        className="h-10 rounded-xl border-rose-200 font-bold text-rose-700 hover:bg-rose-50"
                      >
                        Mark out of stock
                      </Button>
                      </form>
                      {(() => {
                        const selectedVariant = offerVariantDraft[product.id] ?? product.offer.sizes[0] ?? '';
                        const currentPrice = selectedVariant
                          ? Number(product.offer.variant_prices[selectedVariant] ?? product.offer.listed_price)
                          : product.offer.listed_price;
                        return <form onSubmit={event => void submitOfferPrice(
                          event,
                          product.id,
                          currentPrice,
                          selectedVariant || null
                        )} className="space-y-2 border-t border-slate-100 pt-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700" htmlFor={`offer-price-${product.id}`}>Request a catalog price (KES)</label>
                          <p className="mt-1 text-[11px] leading-5 text-slate-500">Current price: KSh {currentPrice.toLocaleString('en-KE')}. OnBar approval changes this shared {selectedVariant ? `${selectedVariant} ` : ''}price for all customers and merchants using it, not just your shop.</p>
                        </div>
                        {product.offer.pending_price != null && <p role="status" className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-900">Pending {product.offer.pending_variant ? `${product.offer.pending_variant} ` : ''}price request: KSh {product.offer.pending_price.toLocaleString('en-KE')}. No order price changes until approval. One request per product can be reviewed at a time.</p>}
                        {product.offer.sizes.length > 0 && <label className="block text-xs font-bold text-slate-700">
                          Product size
                          <select
                            value={selectedVariant}
                            onChange={event => {
                              const variant = event.target.value;
                              setOfferVariantDraft(current => ({ ...current, [product.id]: variant }));
                              setOfferPriceDraft(current => ({
                                ...current,
                                [product.id]: Number(product.offer.variant_prices[variant] ?? product.offer.listed_price).toFixed(2)
                              }));
                            }}
                            className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                            aria-label={`Price request size for ${product.name}`}
                          >
                            {product.offer.sizes.map(size => <option key={size} value={size}>{size}</option>)}
                          </select>
                        </label>}
                        <div className="flex flex-wrap gap-2">
                          <Input
                            id={`offer-price-${product.id}`}
                            required
                            type="number"
                            min="0.01"
                            max="10000000"
                            step="0.01"
                            value={offerPriceDraft[product.id] ?? currentPrice.toFixed(2)}
                            onChange={event => setOfferPriceDraft(current => ({ ...current, [product.id]: event.target.value }))}
                            className="h-10 min-w-0 flex-1 rounded-xl"
                            aria-label={`Proposed selling price in Kenyan shillings for ${product.name}`}
                          />
                          <Button
                            type="submit"
                            variant="outline"
                            disabled={working || product.offer.pending_price != null || Number(offerPriceDraft[product.id] ?? currentPrice) === currentPrice}
                            className="h-10 rounded-xl"
                          >
                            Request review
                          </Button>
                        </div>
                      </form>;
                      })()}
                    </article>
                  );
                })}
              </div>
              {!filteredInventoryProducts.length && (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                  No products match these filters. Try another category or search.
                </p>
              )}
              </>
            )}
            {enlargedProductPhoto && (
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="merchant-product-photo-title"
                onClick={event => {
                  if (event.target === event.currentTarget) setEnlargedProductPhoto(null);
                }}
                onKeyDown={event => {
                  if (event.key === 'Escape') setEnlargedProductPhoto(null);
                }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
              >
                <div className="relative w-full max-w-3xl rounded-2xl bg-white p-3 shadow-2xl sm:p-5">
                  <div className="flex items-center justify-between gap-3 pb-3">
                    <h2 id="merchant-product-photo-title" className="font-black text-slate-900">{enlargedProductPhoto.name}</h2>
                    <button
                      type="button"
                      autoFocus
                      onClick={() => setEnlargedProductPhoto(null)}
                      aria-label="Close enlarged product photo"
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="relative aspect-square max-h-[75vh] overflow-hidden rounded-xl bg-slate-50">
                    <Image
                      src={enlargedProductPhoto.imageUrl}
                      alt={enlargedProductPhoto.name}
                      fill
                      sizes="(max-width: 768px) 95vw, 768px"
                      unoptimized
                      className="object-contain p-4"
                    />
                  </div>
                </div>
              </div>
            )}
            <div>
              <h3 className="text-lg font-black text-slate-900">Receive a new tracked lot</h3>
              <p className="mt-1 text-sm text-slate-500">For a new delivery, record its actual lot code and quantity. Inventory movements are append-only.</p>
            </div>
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
              {isLiquorMerchant && <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 sm:col-span-2"><input type="checkbox" checked={batchForm.exciseStampConfirmed} onChange={event => setBatchForm(current => ({ ...current, exciseStampConfirmed: event.target.checked }))} className="mt-1 h-4 w-4 shrink-0 accent-amber-500" />I confirm this received batch carries KRA excise stamps. This is a merchant declaration, not an authenticity scan.</label>}
              <Button disabled={working || !canOperate} type="submit" className="h-11 rounded-xl font-black uppercase"><PackageCheck size={16} className="mr-2" /> Record received stock</Button>
            </form>}
            {!productOptions.length && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No catalog products have been linked to this business yet. Contact OnBar to have an approved product linked before recording a batch.</p>}
            <div className="grid gap-4 lg:grid-cols-2">
              {overview.batches.map(batch => <article key={batch.id} className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-slate-900">{batch.product?.name || `Product #${batch.product_id}`}</p><p className="text-xs text-slate-500">Lot {batch.lot_code}{batch.product?.sku ? ` · SKU ${batch.product.sku}` : ''}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${batch.on_hold || batch.expired ? 'bg-amber-100 text-amber-900' : batch.available_quantity > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{batch.on_hold ? 'On hold' : batch.expired ? 'Expired' : `${batch.available_quantity} available`}</span></div>
                {isLiquorMerchant && <p className={`mt-2 text-xs font-bold ${batch.excise_stamp_confirmed ? 'text-emerald-700' : 'text-rose-700'}`}>{batch.excise_stamp_confirmed ? 'Excise stamp attested for this batch' : 'Excise stamp has not been recorded for this batch'}</p>}
                <p className="mt-3 text-xs text-slate-500">Received {dateTime(batch.received_at)} · Initial quantity {batch.quantity_received}{batch.expiry_at ? ` · Expires ${batch.expiry_at}` : ''}</p>
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">{batch.movements.slice(0, 5).map((movement, index) => <div key={`${movement.created_at}-${index}`} className="flex justify-between gap-3 text-xs text-slate-600"><span>{movement.movement_type.replaceAll('_', ' ')}{movement.note ? ` · ${movement.note}` : ''}</span><span className="shrink-0 font-bold">{movement.quantity_delta > 0 ? '+' : ''}{movement.quantity_delta}</span></div>)}</div>
              </article>)}
            </div>
          </section>
        )}

        {!loading && overview && section === 'incidents' && (
          <section className="space-y-5">
            <div><h2 className="text-xl font-black text-slate-900">{isLiquorMerchant ? 'Incidents and compliance reports' : 'Operational reports'}</h2><p className="mt-1 text-sm text-slate-500">{isLiquorMerchant ? 'Age-check incidents link to an order. Suspected counterfeit reports must name the affected batch and will place it on hold.' : 'Report a linked product, food safety, delivery, or conduct issue for OnBar review.'}</p></div>
            {canOperate && <form onSubmit={submitIncident} className="grid gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2">
              <select required value={incidentForm.link} onChange={event => setIncidentForm(current => ({ ...current, link: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm sm:col-span-2">
                <option value="">{incidentForm.category === 'suspected_counterfeit' ? 'Choose affected batch' : 'Link to an order or inventory batch'}</option>
                {incidentForm.category !== 'suspected_counterfeit' && overview.orders.map(order => <option key={`order-${order.id}`} value={`order:${order.id}`}>Order #{order.id}</option>)}
                {overview.batches.map(batch => <option key={`batch-${batch.id}`} value={`batch:${batch.id}`}>Batch {batch.lot_code} · {batch.product?.name || 'Product'}</option>)}
              </select>
              <select value={incidentForm.category} onChange={event => setIncidentForm(current => ({ ...current, category: event.target.value, link: '' }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                {Object.entries(incidentLabels).filter(([value]) => isLiquorMerchant || !['age_check_failed', 'suspected_counterfeit'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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

        {!loading && overview && ['business', 'food-business'].includes(section) && (
          <section className="space-y-5">
            <div><h2 className="text-xl font-black text-slate-900">Business profile</h2><p className="mt-1 text-sm text-slate-500">Application and contact details submitted to OnBar.</p></div>
            <form data-tour="merchant-hours-form" onSubmit={submitAvailability} className="rounded-2xl bg-white p-6 shadow-sm">
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
                  data-tour="merchant-availability-toggle"
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
                  return <div key={day} data-tour={day === 'monday' ? 'merchant-hours-schedule' : undefined} className="grid gap-3 rounded-xl border border-slate-200 p-3">
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
                <Button data-tour="merchant-hours-save" type="submit" disabled={!canOperate || working || merchantWeekdays.some(day => scheduleDraft[day].enabled && scheduleDraft[day].open === scheduleDraft[day].close)} className="h-11 rounded-xl font-black uppercase">
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
                            <strong className="block font-black text-primary">Catalog {good.currency} {Number(good.listed_price).toLocaleString()}</strong>
                            {good.pending_price != null && <small className="block font-semibold text-amber-700">Requested {good.currency} {Number(good.pending_price).toLocaleString()} · pending OnBar review</small>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">{application.offered_goods.length ? application.offered_goods.join(', ') : 'No goods were recorded on this application.'}{application.offered_goods.length ? ' · Proposed prices were not recorded.' : ''}</p>
                  )}
                  <p className="mt-3 text-xs leading-5 text-slate-500">Catalog is the current shared customer price. Any requested change stays pending until OnBar approves it. Approval changes the shared product price for all customers and merchants using that product.</p>
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
      {!loading && overview && selected && canOperate && <GuidedPanelTour
        key={selected.application.id}
        tourKey={`merchant:${selected.application.id}`}
        title="Merchant workspace"
        steps={merchantTourSteps}
      />}
    </main>
  );
}
