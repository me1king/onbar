"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { type User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/context/CartContext";
import { supabase } from "@/lib/supabaseClient";
import { formatPrice, cn } from "@/lib/utils";
import { validateCoupon } from "@/lib/couponService";
import { runPostCheckoutAudit } from "@/lib/achievementService";
import { ArrowLeft, CreditCard, Shield, Truck, Smartphone, Loader2, MapPin, Tag, CheckCircle2, Zap, UserPlus, PartyPopper, Link2, MessageSquare, Heart } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import { useSettings } from "@/lib/useSettings";
import dynamic from "next/dynamic";
import { OB_OS } from "@/lib/onlineBarOS";
import { v4 as uuidv4 } from 'uuid';
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { DeliveryArea, findDeliveryZone, findDeliveryZones, parseDeliveryAreas, parseDeliveryPricing, resolveLegacyDeliveryQuote } from "@/lib/deliveryAreas";
import DeliveryPushPreferences from "@/components/profile/DeliveryPushPreferences";

const LocationPicker = dynamic(() => import("@/components/profile/LocationPicker"), {
    ssr: false,
    loading: () => <div className="fixed inset-0 z-[400] bg-white/70 backdrop-blur-xl flex items-center justify-center"><Loader2 className="h-10 w-10 text-primary animate-spin" /></div>
});

interface CheckoutStatus {
  type: "idle" | "success" | "error" | "processing";
  message: string;
}

interface Coupon {
  code: string;
  discount_percent: number;
  discount_amount?: number;
}

interface PaystackResponse {
  status: string;
  reference: string;
  transaction: string;
  message: string;
  redirecturl?: string;
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: number | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    })
  ]).finally(() => {
    if (timer !== undefined) window.clearTimeout(timer);
  });
}

declare global {
  interface Window {
    fbq?: (action: string, eventName: string, params?: Record<string, unknown>) => void;
    PaystackPop: {
      setup: (options: Record<string, unknown>) => {
        openIframe: () => void;
      };
    };
  }
}


function CheckoutContent() {
  const { cart, clearCart, removeFromCart } = useCart();
  const { settings, loading: storeSettingsLoading } = useSettings();
  const onlinePaymentProvider = settings.payment_config.online_provider;

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [showCustomerErrors, setShowCustomerErrors] = useState(false);
  const customerNameInputRef = useRef<HTMLInputElement>(null);
  const customerPhoneInputRef = useRef<HTMLInputElement>(null);
  const customerEmailInputRef = useRef<HTMLInputElement>(null);
  const deliveryZoneSelectRef = useRef<HTMLSelectElement>(null);
  const [deliveryBuilding, setDeliveryBuilding] = useState("");
  const [deliveryLandmark, setDeliveryLandmark] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [checkoutDraftLoaded, setCheckoutDraftLoaded] = useState(false);
  const [checkoutDraftOwnerId, setCheckoutDraftOwnerId] = useState<string | null>(null);
  const [profileSaveNotice, setProfileSaveNotice] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"M-Pesa" | "COD">("M-Pesa");
  const [freeDeliveryAreas, setFreeDeliveryAreas] = useState<DeliveryArea[]>([]);
  const [selectedDeliveryZoneId, setSelectedDeliveryZoneId] = useState('');
  const [freeDeliveryOver, setFreeDeliveryOver] = useState(3000);
  const [deliveryAreasLoaded, setDeliveryAreasLoaded] = useState(false);
  const [deliveryAreasError, setDeliveryAreasError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [activeCoupon, setActiveCoupon] = useState<Coupon | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const attributionId = params.get('utm_id');
    const attributionSource = params.get('utm_source');
    if (attributionId || attributionSource) {
      sessionStorage.setItem('ob_attribution_id', attributionId || `utm_source:${attributionSource}`);
      if (attributionSource) sessionStorage.setItem('ob_attribution_source', attributionSource);
    }

    const exitCoupon = localStorage.getItem('ob_exit_coupon');
    if (exitCoupon) {
      setCouponCode(exitCoupon);
      localStorage.removeItem('ob_exit_coupon');
    }
  }, []);

  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [pointsPerKsh, setPointsPerKsh] = useState(10);
  const [usePoints, setUsePoints] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [accountProfileLoaded, setAccountProfileLoaded] = useState(false);
  const [profile, setProfile] = useState<{
    latitude?: number;
    longitude?: number;
    address?: string | null;
  } | null>(null);

  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [locationSaveNotice, setLocationSaveNotice] = useState<string | null>(null);
  const [isGift, setIsGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftOccasion, setGiftOccasion] = useState("");
  const [coords, setCoords] = useState<{ lat: number | null, lng: number | null }>({ lat: null, lng: null });
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus>({
    type: "idle",
    message: "",
  });
  const [placedOrderId, setPlacedOrderId] = useState<number | null>(null);
  const [isSystemLockdown, setIsSystemLockdown] = useState(false);
  const [unavailableItem, setUnavailableItem] = useState<{
    productId: number;
    productName: string;
    size: string;
    availableStock: number;
    requestedQuantity: number;
  } | null>(null);

  useEffect(() => {
    try {
      const savedDraft = sessionStorage.getItem('ob_checkout_profile_draft')
        || localStorage.getItem('ob_checkout_profile_draft');
      if (savedDraft) {
        const parsed: unknown = JSON.parse(savedDraft);
        if (typeof parsed === 'object' && parsed !== null) {
          const draft = parsed as Record<string, unknown>;
          const ownerId = typeof draft.userId === 'string' ? draft.userId : null;
          setCheckoutDraftOwnerId(ownerId);
          if (!ownerId) {
            if (typeof draft.customerName === 'string') setCustomerName(draft.customerName);
            if (typeof draft.customerPhone === 'string') setCustomerPhone(draft.customerPhone);
            if (typeof draft.customerEmail === 'string') setCustomerEmail(draft.customerEmail);
            if (typeof draft.deliveryBuilding === 'string') setDeliveryBuilding(draft.deliveryBuilding);
            if (typeof draft.deliveryLandmark === 'string') setDeliveryLandmark(draft.deliveryLandmark);
            if (typeof draft.deliveryInstructions === 'string') setDeliveryInstructions(draft.deliveryInstructions);
            if (typeof draft.deliveryZoneId === 'string') setSelectedDeliveryZoneId(draft.deliveryZoneId);
          }
        }
        sessionStorage.setItem('ob_checkout_profile_draft', savedDraft);
        localStorage.removeItem('ob_checkout_profile_draft');
      }
      const saved = localStorage.getItem('ob_delivery_location');
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (
        typeof parsed === 'object' && parsed !== null &&
        'lat' in parsed && 'lng' in parsed &&
        typeof parsed.lat === 'number' && Number.isFinite(parsed.lat) && parsed.lat >= -90 && parsed.lat <= 90 &&
        typeof parsed.lng === 'number' && Number.isFinite(parsed.lng) && parsed.lng >= -180 && parsed.lng <= 180
      ) {
        setCoords({ lat: parsed.lat, lng: parsed.lng });
      }
    } catch (error) {
      console.warn('Could not restore saved checkout details:', error);
    } finally {
      setCheckoutDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!checkoutDraftLoaded) return;
    try {
      sessionStorage.setItem('ob_checkout_profile_draft', JSON.stringify({
        userId: user?.id || checkoutDraftOwnerId,
        customerName,
        customerPhone,
        customerEmail,
        deliveryBuilding,
        deliveryLandmark,
        deliveryInstructions,
        deliveryZoneId: selectedDeliveryZoneId
      }));
    } catch (error) {
      console.warn('Could not save checkout details on this device:', error);
    }
  }, [
    checkoutDraftLoaded,
    user?.id,
    checkoutDraftOwnerId,
    customerName,
    customerPhone,
    customerEmail,
    deliveryBuilding,
    deliveryLandmark,
    deliveryInstructions,
    selectedDeliveryZoneId
  ]);

  useEffect(() => {
    async function checkLockdown() {
        try {
            const response = await fetch('/api/admin/system-lockdown', { cache: 'no-store' });
            const result = await response.json() as { active?: boolean; error?: string };
            if (!response.ok) throw new Error(result.error || 'System lockdown status could not be checked.');
            if (typeof result.active !== 'boolean') throw new Error('System lockdown status response was invalid.');
            setIsSystemLockdown(result.active);
        } catch (error) {
            console.error('Could not check the system lockdown status:', error);
        }
    }
    void checkLockdown();

    // 🎁 Restores pre-filled gift note from Gifting Hub / Cart session
    try {
      const savedGiftNote = typeof window !== 'undefined'
        ? (sessionStorage.getItem('ob_gift_note') || localStorage.getItem('ob_gift_note'))
        : null;

      const savedRecipient = sessionStorage.getItem('ob_gift_recipient') || localStorage.getItem('ob_gift_recipient') || "";
      const savedOccasion = sessionStorage.getItem('ob_gift_occasion') || localStorage.getItem('ob_gift_occasion') || "";
      if ((savedGiftNote && savedGiftNote.trim().length > 0) || savedRecipient || savedOccasion) {
        setIsGift(true);
        setGiftMessage(savedGiftNote?.trim() || "");
        setGiftRecipient(savedRecipient);
        setGiftOccasion(savedOccasion);
      }
    } catch (err) {
      console.warn("Gift note restore error:", err);
      setCheckoutStatus({ type: "error", message: "Gift details could not be restored. Please re-enter the message before ordering." });
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadFreeDeliveryAreas() {
      if (!supabase) {
        setDeliveryAreasError('Delivery zones could not be checked because the store is not connected.');
        setDeliveryAreasLoaded(true);
        return;
      }
      try {
        const [{ data, error }, { data: pricingData, error: pricingError }] = await withTimeout(
          Promise.all([
            supabase.from('settings').select('value').eq('key', 'free_delivery_areas').maybeSingle(),
            supabase.from('settings').select('value').eq('key', 'delivery_pricing').maybeSingle()
          ]),
          12000,
          'Delivery zone settings timed out. Refresh checkout and try again.'
        );
        if (!active) return;
        if (error || pricingError) {
          console.error('Delivery zone lookup failed:', error || pricingError);
          setDeliveryAreasError('Delivery zones are temporarily unavailable. Please try again before placing your order.');
        } else {
          setFreeDeliveryAreas(parseDeliveryAreas(data?.value ?? []));
          setFreeDeliveryOver(parseDeliveryPricing(pricingData?.value).free_delivery_over);
        }
      } catch (error) {
        if (!active) return;
        console.error('Delivery zone lookup failed:', error);
        setDeliveryAreasError(error instanceof Error
          ? error.message
          : 'Delivery zones are temporarily unavailable. Please try again before placing your order.');
      } finally {
        if (active) setDeliveryAreasLoaded(true);
      }
    }
    loadFreeDeliveryAreas();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!deliveryAreasLoaded || coords.lat == null || coords.lng == null) return;
    const zone = findDeliveryZone(coords.lat, coords.lng, freeDeliveryAreas);
    setSelectedDeliveryZoneId(current => zone?.id
      || (freeDeliveryAreas.some(area => area.id === current) ? current : ''));
  }, [coords.lat, coords.lng, deliveryAreasLoaded, freeDeliveryAreas]);

  const searchParams = useSearchParams();
  const [referralCode, setReferralCode] = useState<string | null>(null);

  // Clear status when switching payment methods
  useEffect(() => {
    setCheckoutStatus({ type: "idle", message: "" });
  }, [paymentMethod]);

  useEffect(() => {
    const urlRef = searchParams?.get('ref');
    const sessionRef = sessionStorage.getItem('ob_referral_code');

    let cookieRef = null;
    if (typeof document !== 'undefined') {
        const match = document.cookie.match(new RegExp('(^| )ob_referral_code=([^;]+)'));
        if (match) cookieRef = match[2];
    }

    setReferralCode(urlRef || sessionRef || cookieRef);
  }, [searchParams]);

  // 0. Load Profile & Loyalty Points
  useEffect(() => {
    async function loadProfile() {
        if (!supabase) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            setCheckoutDraftOwnerId(null);
            setAccountProfileLoaded(true);
            return;
        }

        // Anonymous ID Management
        let anonymousId = localStorage.getItem('ob_anonymous_id');
        if (!anonymousId) {
            anonymousId = `anon-${uuidv4().substring(0, 8)}`;
            localStorage.setItem('ob_anonymous_id', anonymousId);
        }

        // 🚀 [MASTER_OS] Track Checkout Initiation
        await OB_OS.track('CHECKOUT_START', {
            userId: session?.user?.id,
            anonymousId,
            amount: total,
            details: { cart_size: cart.length }
        });

        if (session) {
            setUser(session.user);
            try {
                const [{ data: profileData, error: profileError }, savedDraftValue] = await Promise.all([
                    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
                    Promise.resolve(
                      sessionStorage.getItem('ob_checkout_profile_draft')
                        || localStorage.getItem('ob_checkout_profile_draft')
                    )
                ]);
                if (profileError) throw profileError;
                let savedDraft: Record<string, unknown> = {};
                if (savedDraftValue) {
                    try {
                        const parsed: unknown = JSON.parse(savedDraftValue);
                        if (typeof parsed === 'object' && parsed !== null
                            && (parsed as Record<string, unknown>).userId === session.user.id) {
                            savedDraft = parsed as Record<string, unknown>;
                        }
                    } catch (error) {
                        console.warn('Could not read the saved account checkout details:', error);
                    }
                }
                setCheckoutDraftOwnerId(session.user.id);
                setLoyaltyPoints(profileData?.loyalty_points || 0);
                setProfile(profileData || null);
                setCustomerName(profileData?.full_name || (typeof savedDraft.customerName === 'string' ? savedDraft.customerName : ""));
                setCustomerPhone(profileData?.phone_number || (typeof savedDraft.customerPhone === 'string' ? savedDraft.customerPhone : ""));
                setCustomerEmail(session.user.email || (typeof savedDraft.customerEmail === 'string' ? savedDraft.customerEmail : ""));
                setDeliveryBuilding(typeof savedDraft.deliveryBuilding === 'string'
                    ? savedDraft.deliveryBuilding
                    : profileData?.address || "");
                setDeliveryLandmark(typeof savedDraft.deliveryLandmark === 'string' ? savedDraft.deliveryLandmark : "");
                setDeliveryInstructions(typeof savedDraft.deliveryInstructions === 'string' ? savedDraft.deliveryInstructions : "");
                setSelectedDeliveryZoneId(typeof savedDraft.deliveryZoneId === 'string' ? savedDraft.deliveryZoneId : "");
                let hasDevicePin = false;
                try {
                    const savedPin = localStorage.getItem('ob_delivery_location');
                    if (savedPin) {
                        const parsedPin: unknown = JSON.parse(savedPin);
                        hasDevicePin = typeof parsedPin === 'object' && parsedPin !== null
                            && 'lat' in parsedPin && typeof parsedPin.lat === 'number' && Number.isFinite(parsedPin.lat)
                            && parsedPin.lat >= -90 && parsedPin.lat <= 90
                            && 'lng' in parsedPin && typeof parsedPin.lng === 'number' && Number.isFinite(parsedPin.lng)
                            && parsedPin.lng >= -180 && parsedPin.lng <= 180;
                    }
                } catch (error) {
                    console.warn('Could not check the saved device delivery pin:', error);
                }
                if (!hasDevicePin && profileData?.latitude != null && profileData.longitude != null) {
                    setCoords({ lat: profileData.latitude, lng: profileData.longitude });
                }
            } catch (error) {
                console.error('Could not load the customer profile for checkout:', error);
            } finally {
                setAccountProfileLoaded(true);
            }
            const configResponse = await fetch('/api/loyalty/config', { cache: 'no-store' });
            if (configResponse.ok) {
                const configResult = await configResponse.json();
                const configuredRate = Number(configResult.config?.points?.points_per_ksh);
                if (Number.isSafeInteger(configuredRate) && configuredRate > 0) setPointsPerKsh(configuredRate);
            }
        }

        // Check for restored bonus from profile
        if (typeof window !== 'undefined') {
        }
    }
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!checkoutDraftLoaded || !accountProfileLoaded || !user || !client) return;
    const address = [deliveryBuilding.trim(), deliveryLandmark.trim()].filter(Boolean).join(', ')
      || profile?.address?.trim();
    const updates = {
      fullName: customerName.trim(),
      phoneNumber: customerPhone.trim(),
      ...(address ? { address } : {}),
      ...(coords.lat !== null && coords.lng !== null
        ? { latitude: coords.lat, longitude: coords.lng }
        : {})
    };
    if (!updates.fullName && !updates.phoneNumber && !updates.address
      && coords.lat === null && coords.lng === null) return;

    const timer = window.setTimeout(async () => {
      try {
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session?.access_token) throw new Error('Sign-in session is unavailable.');
        const response = await fetch('/api/profile/checkout-details', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionData.session.access_token}`
          },
          body: JSON.stringify(updates)
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || 'Account profile could not be saved.');
        setProfileSaveNotice(null);
      } catch (error) {
        console.error('Could not save checkout details to the customer profile:', error);
        setProfileSaveNotice('Your details are saved on this device and with your order, but could not be synced to your account profile.');
      }
    }, 800);

    return () => window.clearTimeout(timer);
  }, [
    user,
    checkoutDraftLoaded,
    accountProfileLoaded,
    customerName,
    customerPhone,
    deliveryBuilding,
    deliveryLandmark,
    coords.lat,
    coords.lng,
    profile?.address
  ]);

  const gpsDeliveryZoneMatches = coords.lat != null && coords.lng != null
    ? findDeliveryZones(coords.lat, coords.lng, freeDeliveryAreas)
    : null;
  const gpsDeliveryZone = gpsDeliveryZoneMatches?.length === 1 ? gpsDeliveryZoneMatches[0] : null;
  const legacyDeliveryQuote = !storeSettingsLoading && freeDeliveryAreas.length === 0
    && coords.lat != null && coords.lng != null
      ? resolveLegacyDeliveryQuote(coords.lat, coords.lng, settings.shipping)
      : null;
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const manuallySelectedZone = freeDeliveryAreas.find(area => area.id === selectedDeliveryZoneId) || null;
  const hasGpsPin = coords.lat != null && coords.lng != null;
  const selectedZone = hasGpsPin
    ? freeDeliveryAreas.length > 0 ? gpsDeliveryZone : legacyDeliveryQuote
    : manuallySelectedZone;
  const gpsPinOutsideSelectedZone = hasGpsPin && freeDeliveryAreas.length > 0 && !gpsDeliveryZone;
  const hasConfirmedLocation = Boolean(selectedZone);
  const zoneFee = selectedZone
    ? selectedZone.fee ?? (selectedZone.free_delivery ? 0 : null)
    : null;
  const qualifiesForFreeDelivery = freeDeliveryOver > 0 && subtotal >= freeDeliveryOver;
  const deliveryFee = hasConfirmedLocation && zoneFee !== null && !qualifiesForFreeDelivery ? zoneFee : 0;
  const deliveryFeeReady = hasConfirmedLocation && zoneFee !== null;
  const deliveryLabel = selectedZone?.name || 'Not selected';
  const discount = activeCoupon
    ? Math.min(subtotal, Number(activeCoupon.discount_amount || 0) || (subtotal * activeCoupon.discount_percent) / 100)
    : 0;
  const pointsDiscount = usePoints ? Math.min(subtotal - discount, Math.floor(loyaltyPoints / pointsPerKsh)) : 0;
  const totalSavings = discount + pointsDiscount;
  const originalTotal = subtotal + deliveryFee;
  const total = originalTotal - totalSavings;
  const checkoutNeedsDeliveryLocation = /estate|delivery zone|delivery area|delivery fee|delivery pin|gps pin/i
    .test(checkoutStatus.message);

  const focusDeliveryLocation = () => {
    setUnavailableItem(null);
    setCheckoutStatus({ type: 'idle', message: '' });
    document.getElementById('checkout-delivery-location')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => deliveryZoneSelectRef.current?.focus({ preventScroll: true }), 350);
  };

  // 1. Abandoned Cart Recovery Logic
  useEffect(() => {
    const syncAbandonedCart = async () => {
        if (!supabase || cart.length === 0) return;
        if (!customerName.trim() || !customerPhone.trim()) return;

        const sessionId = localStorage.getItem('ob_session_id');

        try {
            const { error } = await supabase.from('abandoned_carts').upsert({
                customer_name: customerName.trim(),
                customer_phone: customerPhone.trim(),
                customer_email: (user?.email || customerEmail).trim().toLowerCase() || null,
                cart_items: cart,
                total_price: total,
                loyalty_points_redeemed: usePoints ? Math.min(loyaltyPoints, Math.ceil(pointsDiscount * pointsPerKsh)) : 0,
                session_id: sessionId,
                updated_at: new Date().toISOString(),
                recovery_status: 'Waiting'
            }, { onConflict: 'customer_phone' });
            if (error) {
                console.warn("Abandoned cart sync issue:", error);
            }
        } catch (err) {
            console.warn("Abandoned cart sync issue:", err);
        }
    };

    const timer = setTimeout(syncAbandonedCart, 5000); // Sync after 5s of typing
    return () => clearTimeout(timer);
  }, [customerName, customerPhone, customerEmail, user?.email, cart, total, loyaltyPoints, pointsDiscount, pointsPerKsh, usePoints]);

  // 1.5 Realtime "Magic" Checkout Listener
  useEffect(() => {
    if (!supabase || !placedOrderId) return;

    const channel = supabase
        .channel('order-status-magic')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'orders',
                filter: `id=eq.${placedOrderId}`,
            },
            (payload) => {
                const newStatus = payload.new.status;
                if (newStatus === 'Paid') {
                    setCheckoutStatus({
                        type: "success",
                        message: "Payment Received! Your order is now being processed."
                    });
                }
            }
        )
        .subscribe();

    return () => {
        if (supabase) {
            supabase.removeChannel(channel);
        }
    };
  }, [placedOrderId]);

  const clearGiftDraft = () => {
      setIsGift(false);
      setGiftMessage("");
      setGiftRecipient("");
      setGiftOccasion("");
      try {
          for (const key of ['ob_gift_note', 'ob_gift_recipient', 'ob_gift_occasion']) {
              sessionStorage.removeItem(key);
              localStorage.removeItem(key);
          }
      } catch (error) {
          console.warn('Unable to clear saved gift details:', error);
      }
  };

  const handleApplyCoupon = async () => {
      if (!couponCode.trim()) return;
      setIsValidatingCoupon(true);
      const coupon = await validateCoupon(couponCode);
      if (coupon) {
          setActiveCoupon(coupon);
          OB_OS.track('PROMO_CODE_USED', { details: { code: couponCode, status: 'SUCCESS', discount: coupon.discount_percent } });
      } else {
          alert("Invalid or expired coupon code.");
          OB_OS.track('PROMO_CODE_USED', { details: { code: couponCode, status: 'FAILED' } });
      }
      setIsValidatingCoupon(false);
  };

  const handlePlaceOrder = async () => {
    if (isSystemLockdown) {
        setCheckoutStatus({
            type: "error",
            message: "Tactical Pause: Order intake is temporarily suspended for system maintenance. Please try again in a few minutes."
        });
        return;
    }
    if (!supabase) {
      setCheckoutStatus({
        type: "error",
        message: "Database not connected. Unable to save order.",
      });
      return;
    }

    if (!deliveryFeeReady) {
      setCheckoutStatus({
        type: "error",
        message: gpsPinOutsideSelectedZone
          ? gpsDeliveryZoneMatches && gpsDeliveryZoneMatches.length > 1
            ? "Your GPS pin falls inside overlapping delivery zones. The store needs to correct the mapped boundaries before checkout."
            : "Your GPS pin is not inside a mapped delivery zone yet. Please update the pin or contact the store to map this area."
          : "Choose your estate or set a map/GPS pin in a delivery zone before placing the order."
      });
      document.getElementById('checkout-delivery-location')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => deliveryZoneSelectRef.current?.focus({ preventScroll: true }), 350);
      return;
    }

    if (coords.lat === null && !deliveryBuilding.trim()) {
      setCheckoutStatus({
        type: "error",
        message: "Enter your building or house name, or add a GPS pin so the rider can find you."
      });
      document.getElementById('checkout-delivery-building')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!customerName.trim() || !customerPhone.trim()) {
      setShowCustomerErrors(true);
      const firstMissingInput = !customerName.trim() ? customerNameInputRef.current : customerPhoneInputRef.current;
      firstMissingInput?.scrollIntoView({ behavior: "smooth", block: "center" });
      requestAnimationFrame(() => firstMissingInput?.focus({ preventScroll: true }));
      OB_OS.track('FORM_VALIDATION_FAILED', {
        userId: user?.id,
        details: { reason: 'MISSING_REQUIRED_FIELDS', field: !customerName.trim() ? 'customer_name' : 'customer_phone' }
      });
      return;
    }

    if (paymentMethod === "M-Pesa" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      setShowCustomerErrors(true);
      customerEmailInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      requestAnimationFrame(() => customerEmailInputRef.current?.focus({ preventScroll: true }));
      OB_OS.track('FORM_VALIDATION_FAILED', {
        userId: user?.id,
        details: { reason: 'INVALID_EMAIL', field: 'customer_email' }
      });
      return;
    }

    setShowCustomerErrors(false);
    const paystackPublicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY?.trim();
    if (paymentMethod === "M-Pesa" && onlinePaymentProvider === 'paystack' && !paystackPublicKey) {
      setCheckoutStatus({ type: "error", message: "Online payments are not configured. Please choose Cash on Delivery or contact support." });
      return;
    }
    if (storeSettingsLoading) {
      setCheckoutStatus({ type: "error", message: "Payment settings are still loading. Please wait a moment and try again." });
      return;
    }

    setIsPlacingOrder(true);
    setCheckoutStatus({ type: "processing", message: "Submitting your order..." });

    try {
      const client = supabase;
      if (!client) throw new Error('Database connection was lost. Your order was not submitted.');
      const session = usePoints
        ? (await withTimeout(
            client.auth.getSession(),
            5000,
            'Your sign-in check timed out. Turn off points or sign in again, then retry.'
          )).data.session
        : null;
      const sessionId = localStorage.getItem('ob_session_id');
      if (!sessionId) throw new Error('Your checkout session expired. Refresh the page and try again.');
      const orderResponse = await withTimeout(fetch('/api/checkout/orders', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
          },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
              items: cart.map(item => ({
                  productId: item.id,
                  quantity: item.quantity,
                  size: item.size || 'Standard',
                  addonIds: (item.addons || []).map(addon => addon.id),
                  ...(item.engraving ? { engraving: item.engraving } : {})
              })),
              customerName,
              customerPhone,
              customerEmail: customerEmail.trim() || null,
              paymentMethod: paymentMethod === 'M-Pesa'
                ? onlinePaymentProvider === 'payhero' ? 'PayHero' : 'Paystack'
                : 'COD',
              sessionId,
              deliveryZoneId: selectedZone?.id || null,
              coordinates: coords.lat !== null && coords.lng !== null
                  ? { lat: coords.lat, lng: coords.lng }
                  : profile?.latitude != null && profile.longitude != null
                      ? { lat: profile.latitude, lng: profile.longitude }
                      : null,
              deliveryBuilding: deliveryBuilding.trim() || null,
              deliveryLandmark: deliveryLandmark.trim() || null,
              deliveryInstructions: deliveryInstructions.trim() || null,
              couponCode: activeCoupon?.code || null,
              usePoints,
              referralCode,
              attributionId: sessionStorage.getItem('ob_attribution_id'),
              isGift,
              giftMessage: giftMessage.trim() || null,
              giftRecipient: giftRecipient.trim() || null,
              giftOccasion: giftOccasion.trim() || null
          })
      }), 16000, 'The order service did not respond within 15 seconds. Your order may still be processing; check Orders before retrying to avoid a duplicate.');
      const orderResult = await orderResponse.json() as {
          error?: string;
          code?: string;
          stockIssue?: {
            productId: number;
            productName: string;
            size: string;
            availableStock: number;
            requestedQuantity: number;
          };
          orderId?: number;
          reference?: string | null;
          total?: number;
          currency?: string;
          provider?: 'Paystack' | 'PayHero' | 'COD';
          paymentStarted?: boolean;
      };
      if (!orderResponse.ok || !orderResult.orderId || typeof orderResult.total !== 'number') {
          if (orderResult.code === 'STOCK_UNAVAILABLE' && orderResult.stockIssue) {
            setUnavailableItem(orderResult.stockIssue);
          }
          throw new Error(orderResult.error || 'The order could not be created.');
      }
      const orderId = orderResult.orderId;
      const authoritativeTotal = orderResult.total;
      setPlacedOrderId(orderId);

      if (paymentMethod === "M-Pesa") {
        if (!orderResult.reference) throw new Error('The payment reference could not be created. Please try again.');
        if (orderResult.provider === 'PayHero') {
          clearGiftDraft();
          const warning = orderResult.paymentStarted === false ? '&prompt=unknown' : '';
          window.location.href = `/checkout/success?orderId=${orderId}&payment=payhero${warning}`;
          return;
        }
        if (!window.PaystackPop) {
            setCheckoutStatus({ type: "error", message: "Payment system failing to load. Please check your connection." });
            OB_OS.track('PAYMENT_FAIL', { userId: user?.id, orderId, details: { reason: 'PAYMENT_WINDOW_UNAVAILABLE' } });
            setIsPlacingOrder(false);
            return;
        }

        setCheckoutStatus({ type: "processing", message: "Launching secure payment window..." });

        const handler = window.PaystackPop.setup({
            key: paystackPublicKey,
            email: customerEmail.trim(),
            amount: Math.round(authoritativeTotal * 100),
            currency: orderResult.currency || 'KES',
            ref: orderResult.reference,
            callback: async (response: PaystackResponse) => {
                if (response.status === 'success') {
                    try {
                        const verification = await fetch('/api/paystack/verify-order', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reference: response.reference })
                        });
                        const verificationResult = await verification.json() as { error?: string };
                        if (!verification.ok) {
                            throw new Error(verificationResult.error || 'Server-side payment verification failed.');
                        }
                    } catch (error) {
                        console.error("Order payment confirmation error:", error);
                        setCheckoutStatus({
                            type: "error",
                            message: `Payment was received, but server verification is still pending. Contact support with reference ${response.reference}.`
                        });
                        setIsPlacingOrder(false);
                        return;
                    }

                    // FORCE REDIRECT - prevent being stuck in Paystack modal
                    clearGiftDraft();
                    window.location.href = `/checkout/success?orderId=${orderId}`;
                }
            },
            onClose: () => {
                OB_OS.track('PAYMENT_FAIL', { userId: user?.id, orderId, details: { reason: 'PAYMENT_PROMPT_CLOSED' } });
                setIsPlacingOrder(false);
                setCheckoutStatus({
                    type: "error",
                    message: "Payment was not completed. Your order remains pending; you can safely retry checkout."
                });
            }
        });

        handler.openIframe();
      } else {
        finalizeOrder(orderId, authoritativeTotal);
      }
    } catch (error: unknown) {
        const err = error as Error;
        console.error("Checkout Error:", err);
        const message = ['AbortError', 'TimeoutError'].includes(err.name)
          ? 'The order request timed out. Your order may still be processing; check Orders before retrying to avoid a duplicate.'
          : err instanceof TypeError && /fetch/i.test(err.message)
          ? "We could not reach the order service. Check your connection and try again."
          : err.message || "An unexpected error occurred.";
        setCheckoutStatus({ type: "error", message });
        setIsPlacingOrder(false);
    }
  };

  const finalizeOrder = async (orderId?: number, orderTotal = total) => {
    const finalId = orderId || placedOrderId;

    // 🚀 [MASTER_OS] Track Purchase Completion
    OB_OS.track('PURCHASE_COMPLETED', {
        userId: user?.id,
        orderId: finalId || undefined,
        amount: orderTotal,
        details: { cart_size: cart.length }
    });

    // Meta Tracking: Purchase
    if (typeof window !== 'undefined' && window.fbq) {
        window.fbq('track', 'Purchase', {
            value: orderTotal,
            currency: 'KES',
            content_ids: cart.map(item => item.id),
            content_type: 'product'
        });
    }

    // Keep post-order bookkeeping off the redirect-critical path.
    const client = supabase;
    if (user && client) {
        void runPostCheckoutAudit(user.id, orderTotal).catch(err => {
            console.error("Loyalty update error:", err);
        });
    }

    // 2. Clear abandoned record on success
    if (client && customerPhone) {
        void client.from('abandoned_carts').delete().eq('customer_phone', customerPhone)
            .then(({ error }) => {
                if (error) console.error("Abandoned cart cleanup error:", error);
            });
    }

    clearCart();
    clearGiftDraft();
    setCustomerName("");
    setCustomerPhone("");

    // Redirect to success page if we have a placed order ID
    if (finalId) {
        window.location.href = `/checkout/success?orderId=${finalId}`;
    } else {
        setCheckoutStatus({
            type: "success",
            message: paymentMethod === "M-Pesa"
              ? "Order received! Please complete the PIN prompt on your phone."
              : "Order placed successfully! We will contact you shortly to confirm delivery.",
        });
    }
  };

  if (cart.length === 0 && checkoutStatus.type !== "success") {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-4xl font-black uppercase tracking-tighter">Your Cart is Empty</h1>
        <p className="mt-4 text-slate-500 font-medium text-left mx-auto max-w-sm italic">Add some beverages to your bag before checking out.</p>
        <Button className="mt-8 rounded-2xl px-12 h-16 font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-primary/20 transition-all active:scale-95" asChild>
          <Link href="/shop">Browse Menu</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl text-left min-h-screen">
      <Script src="https://js.paystack.co/v1/inline.js" strategy="lazyOnload" />
      <DeliveryPushPreferences />
      {isPickingLocation && (
          <LocationPicker
            initialLat={coords.lat ?? undefined}
            initialLng={coords.lng ?? undefined}
            autoDetect
            deliveryAreas={freeDeliveryAreas}
            onConfirm={async (lat, lng) => {
                setCoords({ lat, lng });
                setCheckoutStatus({ type: 'idle', message: '' });
                try {
                    localStorage.setItem('ob_delivery_location', JSON.stringify({ lat, lng }));
                } catch (error) {
                    console.warn('Could not save delivery pin on this device:', error);
                }
                setLocationSaveNotice(null);
                setIsPickingLocation(false);
                OB_OS.track('UI_INTERACTION', { details: { id: 'checkout.location_locked', lat, lng } });
            }}
            onClose={() => setIsPickingLocation(false)}
          />
      )}
      <div className="mb-16 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-slate-100 pb-10">
        <div>
            <Link href="/cart" className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors flex items-center gap-2 mb-4">
                <ArrowLeft className="h-4 w-4" /> Edit Cart
            </Link>
            <h1 className="text-5xl font-black uppercase tracking-tighter text-foreground">Checkout</h1>
            <p className="mt-2 text-slate-500 font-medium italic">Complete your order to begin dispatch.</p>
        </div>
      </div>

      <div className="grid gap-12 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">

          {/* Customer Info */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><Smartphone className="h-5 w-5" /></div>
                    <h2 className="text-xl font-black uppercase tracking-tighter">Customer Details</h2>
                </div>
                {referralCode && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-full border border-indigo-100 text-indigo-600 animate-bounce">
                        <UserPlus className="h-3 w-3" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Referral Bonus Applied</span>
                    </div>
                )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="checkout-customer-name" className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Full Name *</label>
                  <Input id="checkout-customer-name" data-behavior-id="checkout.customer_name" ref={customerNameInputRef} autoComplete="name" required aria-invalid={showCustomerErrors && !customerName.trim()} aria-describedby={showCustomerErrors && !customerName.trim() ? "checkout-customer-name-error" : undefined} placeholder="Patron Name" className={cn("rounded-2xl bg-slate-50/50 h-14", showCustomerErrors && !customerName.trim() ? "border-rose-400 ring-2 ring-rose-100" : "border-slate-100")} value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={isPlacingOrder} />
                  {showCustomerErrors && !customerName.trim() && <p id="checkout-customer-name-error" role="alert" className="text-xs font-semibold text-rose-600">Enter your full name to continue.</p>}
                </div>
                <div className="space-y-2">
                  <label htmlFor="checkout-customer-phone" className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Phone Number *</label>
                  <Input id="checkout-customer-phone" data-behavior-id="checkout.customer_phone" ref={customerPhoneInputRef} type="tel" autoComplete="tel" inputMode="tel" required aria-invalid={showCustomerErrors && !customerPhone.trim()} aria-describedby={showCustomerErrors && !customerPhone.trim() ? "checkout-customer-phone-error" : undefined} placeholder="07XXXXXXXX" className={cn("rounded-2xl bg-slate-50/50 h-14", showCustomerErrors && !customerPhone.trim() ? "border-rose-400 ring-2 ring-rose-100" : "border-slate-100")} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} disabled={isPlacingOrder} />
                  {showCustomerErrors && !customerPhone.trim() && <p id="checkout-customer-phone-error" role="alert" className="text-xs font-semibold text-rose-600">Enter your phone number to continue.</p>}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="checkout-customer-email" className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Email Address {paymentMethod === "M-Pesa" ? `(Required for ${onlinePaymentProvider === 'payhero' ? 'PayHero' : 'Paystack'})` : "(For PDF Receipt)"}</label>
                  <Input id="checkout-customer-email" data-behavior-id="checkout.customer_email" ref={customerEmailInputRef} type="email" autoComplete="email" required={paymentMethod === "M-Pesa"} aria-invalid={showCustomerErrors && paymentMethod === "M-Pesa" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())} aria-describedby={showCustomerErrors && paymentMethod === "M-Pesa" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim()) ? "checkout-customer-email-error" : undefined} placeholder="you@example.com" className={cn("rounded-2xl bg-slate-50/50 h-14", showCustomerErrors && paymentMethod === "M-Pesa" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim()) ? "border-rose-400 ring-2 ring-rose-100" : "border-slate-100")} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} disabled={isPlacingOrder} />
                  {showCustomerErrors && paymentMethod === "M-Pesa" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim()) && <p id="checkout-customer-email-error" role="alert" className="text-xs font-semibold text-rose-600">Enter a valid email address for {onlinePaymentProvider === 'payhero' ? 'PayHero' : 'Paystack'}.</p>}
                </div>
            </div>
            {user && accountProfileLoaded && (
              <p role="status" className="text-xs font-medium text-slate-500">
                Your name, phone, and delivery address are saved to your account as you update them.
              </p>
            )}
          </section>

          {/* Delivery location and fee calculator */}
          <section id="checkout-delivery-location" className="space-y-4 sm:space-y-6">
            <div className="flex items-center gap-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><Zap className="h-4 w-4 sm:h-5 sm:w-5" /></div>
                <h2 className="text-lg sm:text-xl font-black uppercase tracking-tighter">Delivery location</h2>
            </div>
            <label className="block space-y-2">
                {freeDeliveryAreas.length > 0 ? (
                    <>
                        <span className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Estate / delivery area</span>
                        <select
                            ref={deliveryZoneSelectRef}
                            value={hasGpsPin ? gpsDeliveryZone?.id || '' : selectedDeliveryZoneId}
                            disabled={!deliveryAreasLoaded || isPlacingOrder || hasGpsPin}
                            onChange={event => {
                                const zoneId = event.target.value;
                                setSelectedDeliveryZoneId(zoneId);
                                setCheckoutStatus({ type: 'idle', message: '' });
                            }}
                            className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
                        >
                            <option value="">Choose estate or area…</option>
                            {freeDeliveryAreas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                        </select>
                    </>
                ) : (
                    <span className="block rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                        {legacyDeliveryQuote
                            ? `Using your saved GPS location · ${legacyDeliveryQuote.name}`
                            : storeSettingsLoading
                                ? 'Checking the delivery rate for your saved GPS location…'
                            : coords.lat != null && coords.lng != null
                                ? 'Your saved GPS location could not be matched to a delivery-rate area.'
                                : 'Delivery zones are not configured. Add a saved GPS pin so we can use the configured local delivery rate.'}
                    </span>
                )}
                {gpsDeliveryZone && (
                    <span className="block px-1 text-xs font-medium text-emerald-700">
                        Your confirmed GPS pin matched {gpsDeliveryZone.name}; its delivery fee is applied automatically.
                    </span>
                )}
                {selectedZone && deliveryFeeReady && (
                    <span className="block px-1 text-sm font-bold text-primary">
                        {qualifiesForFreeDelivery
                            ? `Free delivery applied · ${selectedZone.name}`
                            : `${selectedZone.name} delivery · ${zoneFee === 0 ? 'Free' : formatPrice(zoneFee)}`}
                        {coords.lat !== null && coords.lng !== null && ' · GPS pin attached to order'}
                    </span>
                )}
                {freeDeliveryOver > 0 && (
                    <span className="block px-1 text-xs text-slate-500">
                        Free delivery on item subtotals of {formatPrice(freeDeliveryOver)} or more.
                    </span>
                )}
            </label>
            <Card
                onClick={() => setIsPickingLocation(true)}
                className={cn(
                    "p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border-2 transition-all cursor-pointer group relative overflow-hidden",
                    gpsPinOutsideSelectedZone
                        ? "border-amber-200 bg-amber-50/50"
                        : hasConfirmedLocation
                            ? "border-emerald-100 bg-emerald-50/30"
                            : "border-slate-50 bg-slate-50/50 hover:border-primary/20"
                )}
            >
                <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
                    <div className="text-left space-y-2 w-full sm:w-auto">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm transition-all duration-500",
                                hasConfirmedLocation ? "bg-emerald-500 text-white" : "bg-white text-slate-300 group-hover:text-primary"
                            )}>
                                <MapPin className="h-5 w-5 sm:h-6 sm:w-6" />
                            </div>
                            <div>
                                <h3 className="font-black uppercase text-foreground tracking-tight text-xs sm:text-base">
                                    {gpsPinOutsideSelectedZone ? "Confirm GPS Pin in Zone" : hasConfirmedLocation ? "Delivery Area Set" : "Set GPS Pin (Optional)"}
                                </h3>
                                <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    {coords.lat !== null && coords.lng !== null ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : selectedZone?.name || "Use GPS or place a pin on the map"}
                                </p>
                            </div>
                        </div>
                        <p className="text-[9px] sm:text-[10px] font-medium text-slate-500 leading-relaxed max-w-xs">
                            Select your estate to see its fee. Add a GPS pin for more accurate rider directions.
                        </p>
                    </div>
                    <Button
                        type="button"
                        onClick={() => setIsPickingLocation(true)}
                        className={cn(
                            "w-full sm:w-auto h-12 sm:h-14 px-6 sm:px-8 rounded-xl sm:rounded-2xl font-black uppercase text-[9px] sm:text-[10px] tracking-widest transition-all shadow-xl active:scale-95",
                            coords.lat !== null && coords.lng !== null ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-primary text-white hover:bg-primary/90 shadow-primary/20"
                        )}
                    >
                        {coords.lat !== null && coords.lng !== null ? "Update GPS Pin" : "Add GPS Pin"}
                    </Button>
                </div>
                <p role="status" className="relative z-10 text-sm font-semibold">
                    {deliveryAreasError
                        ? deliveryAreasError
                        : !deliveryAreasLoaded || storeSettingsLoading
                        ? 'Checking delivery zone settings…'
                            : !freeDeliveryAreas.length
                                ? legacyDeliveryQuote
                                    ? `${legacyDeliveryQuote.name} · ${legacyDeliveryQuote.label}: ${legacyDeliveryQuote.fee === 0 ? 'free delivery' : `${formatPrice(legacyDeliveryQuote.fee)} delivery fee`}${freeDeliveryOver > 0 ? ` · free over ${formatPrice(freeDeliveryOver)}` : ''}. Your saved GPS pin will be sent with the order.`
                                    : coords.lat != null && coords.lng != null
                                        ? 'Your saved GPS pin is outside the configured delivery-rate coverage. Contact the store to confirm delivery.'
                                        : 'Delivery zones are not configured yet. Add a GPS pin or contact the store.'
                                : gpsPinOutsideSelectedZone
                                    ? gpsDeliveryZoneMatches && gpsDeliveryZoneMatches.length > 1
                                        ? 'This pin is inside overlapping mapped zones. The store needs to correct the boundaries before a GPS price can be confirmed.'
                                        : 'This pin is not inside a mapped delivery zone yet. Update the pin or contact the store to map this area.'
                                    : !selectedZone
                                        ? 'Choose your estate or delivery area to see the exact fee.'
                                        : !deliveryFeeReady
                                            ? 'A fee has not been configured for this area yet.'
                                            : qualifiesForFreeDelivery
                                                ? `Free delivery applied for orders of ${formatPrice(freeDeliveryOver)} or more.`
                                                : `${selectedZone.name}: ${zoneFee === 0 ? 'free delivery' : `${formatPrice(zoneFee)} delivery fee`}${freeDeliveryOver > 0 ? ` · free over ${formatPrice(freeDeliveryOver)}` : ''}.`}
                </p>
                {checkoutStatus.type === 'error' && checkoutNeedsDeliveryLocation && (
                    <p role="alert" className="relative z-10 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                        {checkoutStatus.message}
                    </p>
                )}
                {locationSaveNotice && <p role="status" className="relative z-10 text-xs text-amber-800">{locationSaveNotice}</p>}
                {profileSaveNotice && <p role="status" className="relative z-10 text-xs text-amber-800">{profileSaveNotice}</p>}
                {/* Decoration */}
                <Zap className="absolute -bottom-6 -right-6 h-20 w-20 sm:h-24 sm:w-24 text-slate-100/50 rotate-12" />
            </Card>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <label htmlFor="checkout-delivery-building" className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Building / house name {coords.lat === null ? '*' : '(Optional)'}</label>
                    <Input id="checkout-delivery-building" data-behavior-id="checkout.delivery_building" value={deliveryBuilding} onChange={event => setDeliveryBuilding(event.target.value)} maxLength={120} placeholder="Building, apartment or house name" disabled={isPlacingOrder} className="h-14 rounded-2xl border-slate-100 bg-slate-50/50" />
                </div>
                <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Landmark (Optional)</label>
                    <Input data-behavior-id="checkout.delivery_landmark" value={deliveryLandmark} onChange={event => setDeliveryLandmark(event.target.value)} maxLength={120} placeholder="Nearby landmark" disabled={isPlacingOrder} className="h-14 rounded-2xl border-slate-100 bg-slate-50/50" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Delivery Instructions (Optional)</label>
                    <textarea value={deliveryInstructions} onChange={event => setDeliveryInstructions(event.target.value)} maxLength={500} placeholder="Gate, floor, or handoff instructions" disabled={isPlacingOrder} className="min-h-24 w-full rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-sm outline-none focus:border-primary disabled:opacity-60" />
                </div>
            </div>
          </section>

          {/* 🎁 GIFTING OPTIONS */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><PartyPopper className="h-5 w-5" /></div>
                <h2 className="text-xl font-black uppercase tracking-tighter">Gifting Details</h2>
            </div>
            <Card className={cn(
                "p-8 rounded-[2.5rem] border-2 transition-all cursor-pointer relative overflow-hidden",
                isGift ? "border-primary/20 bg-primary/5" : "border-slate-50 bg-slate-50/50"
            )} onClick={() => {
                const next = !isGift;
                setIsGift(next);
                OB_OS.track('UI_INTERACTION', { details: { id: 'checkout.gifting_toggled', active: next } });
            }}>
                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm transition-all",
                            isGift ? "bg-primary text-white scale-110" : "bg-white text-slate-300"
                        )}>
                            <Heart className="h-6 w-6 fill-current" />
                        </div>
                        <div className="text-left">
                            <h3 className="font-black uppercase text-foreground text-base tracking-tight">This is a Gift</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Add a personal message & gift wrap</p>
                        </div>
                    </div>
                    <div className={cn(
                        "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all",
                        isGift ? "bg-primary border-primary" : "border-slate-100"
                    )}>
                        {isGift && <CheckCircle2 className="h-4 w-4 text-white" />}
                    </div>
                </div>

                {isGift && (
                    <div className="mt-8 space-y-4 animate-in slide-in-from-top-4 duration-500" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center text-[9px] font-black uppercase text-primary tracking-widest px-2">
                            <span>Personal Message Preserved</span>
                            <button
                                type="button"
                                onClick={() => {
                                    clearGiftDraft();
                                }}
                                className="text-slate-400 hover:text-rose-500 underline"
                            >
                                Clear Message
                            </button>
                        </div>
                        <textarea
                            value={giftMessage}
                            onChange={e => {
                                const val = e.target.value;
                                setGiftMessage(val);
                                try {
                                    sessionStorage.setItem('ob_gift_note', val);
                                    localStorage.setItem('ob_gift_note', val);
                                } catch (err) {
                                    console.error('Unable to preserve gift message in browser storage:', err);
                                    setCheckoutStatus({
                                        type: "error",
                                        message: "The message will be included with this order, but could not be saved for a later checkout."
                                    });
                                }
                            }}
                            placeholder="Enter your gift message here... (e.g. Happy Birthday Kelvin!)"
                            maxLength={500}
                            className="w-full h-32 rounded-[1.8rem] border border-primary/20 bg-white p-6 text-sm font-medium italic outline-none focus:ring-4 focus:ring-primary/10 transition-all resize-none shadow-inner"
                        />
                        <p className="text-[9px] font-black uppercase text-primary/80 tracking-widest text-left ml-2 animate-pulse">✓ Premium wrapping & personalized card included</p>
                    </div>
                )}
                <PartyPopper className="absolute -bottom-6 -right-6 h-24 w-24 text-primary/5 rotate-12 -z-0" />
            </Card>
          </section>

          {/* Payment Method */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><CreditCard className="h-5 w-5" /></div>
                <h2 className="text-xl font-black uppercase tracking-tighter">Payment Mode</h2>
            </div>
            <p className="text-sm leading-6 text-slate-500">
                Choose online payment now, or choose Cash on Delivery. For pay-on-delivery
                orders, the verified rider can collect cash, send an M-Pesa prompt, or open
                a secure scan-to-pay checkout after your ID and handover code are confirmed.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button data-behavior-id="checkout.payment_method" onClick={() => {
                    setPaymentMethod("M-Pesa");
                    OB_OS.track('UI_INTERACTION', { userId: user?.id, details: { id: 'checkout.payment_method', method: 'M-Pesa' } });
                  }} className={`p-6 rounded-3xl border-2 text-left transition-all ${paymentMethod === 'M-Pesa' ? 'border-primary bg-white shadow-xl' : 'border-slate-50 bg-slate-50/50 opacity-60 hover:opacity-100'}`}>
                    <p className="font-black uppercase tracking-tight text-foreground text-lg">{onlinePaymentProvider === 'payhero' ? 'PayHero M-Pesa' : 'Paystack'}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{onlinePaymentProvider === 'payhero' ? 'Receive an M-Pesa prompt on your phone' : 'Pay now by card or a Paystack payment method'}</p>
                  </button>

                  <button data-behavior-id="checkout.payment_method" onClick={() => {
                    setPaymentMethod("COD");
                    OB_OS.track('UI_INTERACTION', { userId: user?.id, details: { id: 'checkout.payment_method', method: 'COD' } });
                  }} className={`p-6 rounded-3xl border-2 text-left transition-all ${paymentMethod === 'COD' ? 'border-primary bg-white shadow-xl' : 'border-slate-50 bg-slate-50/50 opacity-60 hover:opacity-100'}`}>
                    <p className="font-black uppercase tracking-tight text-foreground text-lg">Cash on Delivery</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Cash, M-Pesa prompt, or secure scan at handover</p>
                  </button>
            </div>
          </section>

          {checkoutStatus.type === 'success' && (
              <div className="bg-white border-4 border-primary rounded-[3rem] p-12 text-center animate-in zoom-in-95 duration-700 shadow-2xl shadow-primary/20 relative overflow-hidden">
                  <div className="relative z-10">
                      <div className="h-24 w-24 bg-primary text-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl animate-bounce">
                        <PartyPopper className="h-12 w-12" />
                      </div>
                      <h3 className="text-4xl font-black uppercase tracking-tighter text-foreground mb-4">Payment Verified!</h3>
                      <p className="text-slate-500 font-medium mb-10 max-w-sm mx-auto leading-relaxed text-lg">
                          Your order has been confirmed. We&apos;ve sent a professional receipt to your email.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-4 justify-center">
                          <Link href={`/track?id=${placedOrderId}`} className="flex-1">
                            <Button className="w-full rounded-2xl h-16 bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95">Track Dispatch</Button>
                          </Link>
                          <Button
                            variant="outline"
                            className="flex-1 rounded-2xl h-16 border-2 font-black uppercase text-xs tracking-widest text-primary border-primary/10 hover:bg-primary/5 transition-all hover:scale-105 active:scale-95"
                            onClick={() => {
                                const link = `${window.location.origin}/track?id=${placedOrderId}`;
                                const message = `Hello! I just placed an order on Online Bar. Track my order here: ${link}`;
                                window.open(`https://wa.me/${settings.contact.whatsapp}?text=${encodeURIComponent(message)}`, '_blank');
                            }}
                          >
                              <MessageSquare className="h-4 w-4 mr-2" /> Share on WhatsApp
                          </Button>
                      </div>
                      <div className="mt-4 flex justify-center gap-4">
                          <button
                            onClick={() => {
                                const link = `${window.location.origin}/track?id=${placedOrderId}`;
                                navigator.clipboard.writeText(link);
                                alert("Tracking link copied!");
                            }}
                            className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors flex items-center gap-1"
                          >
                             <Link2 className="h-3 w-3" /> Copy Link
                          </button>
                          <Link href="/" className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors">
                              ← Back to Store
                          </Link>
                      </div>
                  </div>
                  {/* Confetti-like background decor */}
                  <div className="absolute top-0 left-10 w-4 h-4 bg-primary rounded-full animate-ping opacity-20"></div>
                  <div className="absolute bottom-10 right-20 w-6 h-6 bg-indigo-500 rounded-full animate-bounce opacity-20"></div>
              </div>
          )}
        </div>

        <div className="space-y-8 lg:sticky lg:top-8">

          {/* Order Summary Card */}
          <Card className="rounded-[3rem] border-none shadow-2xl bg-slate-50 text-foreground p-2">
            <CardHeader className="p-8 border-b border-slate-100">
              <CardTitle className="text-xl font-black uppercase tracking-widest text-primary flex items-center gap-3">
                  <Tag className="h-5 w-5" /> Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-400">
                  <span>Subtotal</span>
                  <span className="text-foreground">{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-500">
                  <span>Delivery ({deliveryLabel})</span>
                  <span className="text-primary">{!hasConfirmedLocation ? 'Choose area' : !deliveryFeeReady ? 'Fee unavailable' : deliveryFee === 0 ? 'FREE' : formatPrice(deliveryFee)}</span>
                </div>
                {activeCoupon && (
                    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-rose-500 bg-rose-50 p-2 rounded-lg">
                        <span>Discount ({activeCoupon.code})</span>
                        <span>-{formatPrice(discount)}</span>
                    </div>
                )}
                {usePoints && (
                    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 p-2 rounded-lg">
                        <span>Bar Points Redemption</span>
                        <span>-{formatPrice(pointsDiscount)}</span>
                    </div>
                )}
                {totalSavings > 0 && (
                    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-primary bg-primary/5 p-3 rounded-xl border border-primary/10 animate-pulse">
                        <span className="flex items-center gap-2"><Zap className="h-3 w-3 fill-current" /> Total Savings</span>
                        <span>{formatPrice(totalSavings)}</span>
                    </div>
                )}
              </div>

              <Separator className="bg-slate-200" />

              <div className="flex justify-between items-end">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Grand Total</span>
                <div className="text-right">
                    {totalSavings > 0 && (
                        <p className="text-xs font-bold text-slate-300 line-through mb-1">{formatPrice(originalTotal)}</p>
                    )}
                    <span className="text-3xl sm:text-4xl font-black uppercase tracking-tighter text-primary animate-in fade-in zoom-in-95 duration-500" key={total}>
                        {formatPrice(total)}
                    </span>
                </div>
              </div>

              {/* Loyalty Redemption */}
              {loyaltyPoints > 0 && !activeCoupon && (
                  <div className="pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-3 px-1">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Club Rewards</p>
                          <span className="text-[8px] font-bold text-slate-300 uppercase italic">{pointsPerKsh} Pts = 1 KSh</span>
                      </div>
                      <button
                        onClick={() => setUsePoints(!usePoints)}
                        className={`w-full flex items-center justify-between p-5 rounded-[1.8rem] border-2 transition-all duration-500 ${usePoints ? 'bg-primary border-primary text-white shadow-xl shadow-primary/20' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}
                      >
                          <div className="flex items-center gap-4 text-left">
                              <div className={cn(
                                  "h-10 w-10 rounded-2xl flex items-center justify-center transition-all",
                                  usePoints ? "bg-primary text-white scale-110" : "bg-slate-50 text-slate-300"
                              )}>
                                  <Zap className="h-5 w-5 fill-current" />
                              </div>
                              <div>
                                  <p className="text-[10px] font-black uppercase tracking-widest leading-none">Redeem {loyaltyPoints.toLocaleString()} Points</p>
                                  <p className={cn("text-[9px] font-bold mt-1.5 uppercase tracking-tighter", usePoints ? "text-primary-foreground/60" : "text-primary")}>
                                      Save up to {formatPrice(Math.floor(loyaltyPoints / pointsPerKsh))} on this order
                                  </p>
                              </div>
                          </div>
                          <div className={cn(
                              "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all",
                              usePoints ? "bg-primary border-primary" : "border-slate-100"
                          )}>
                              {usePoints && <CheckCircle2 className="h-4 w-4 text-white" />}
                          </div>
                      </button>
                  </div>
              )}

              {/* Coupon Box */}
              {!activeCoupon && (
                  <div className="pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-3 px-1">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Coupon Code</p>
                      </div>
                      <div className="flex gap-2">
                          <Input
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                            placeholder="PROMO CODE"
                            className="h-12 rounded-2xl bg-white border-slate-100 text-xs font-black tracking-widest uppercase focus:ring-primary/10"
                          />
                          <Button
                            onClick={handleApplyCoupon}
                            disabled={isValidatingCoupon}
                            variant="outline"
                            className="h-12 rounded-2xl px-6 text-[10px] font-black uppercase border-slate-200 hover:bg-slate-50 active:scale-95 transition-all"
                          >
                            Apply
                          </Button>
                      </div>
                  </div>
              )}

              <Button
                size="lg"
                data-behavior-id="checkout.place_order"
                data-behavior-event="PAYMENT_STARTED"
                className="w-full h-20 bg-primary text-white hover:bg-primary/90 rounded-[1.8rem] font-black uppercase tracking-[0.2em] text-[11px] mt-4 shadow-2xl disabled:bg-slate-200 transition-all active:scale-95"
                onClick={handlePlaceOrder}
                disabled={isPlacingOrder || checkoutStatus.type === 'success'}
              >
                {isPlacingOrder ? (
                    <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Finalizing...
                    </div>
                ) : paymentMethod === 'COD' ? "Confirm COD Order" : "Initiate Payment"}
              </Button>

              {checkoutStatus.type === 'processing' && (
                <p className="bg-primary/5 text-primary p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest mt-4 text-center animate-pulse">
                  ℹ️ {checkoutStatus.message}
                </p>
              )}

              {checkoutStatus.type === 'error' && !checkoutNeedsDeliveryLocation && (
                <div className="space-y-4 mt-8">
                    <Card className="bg-rose-50 text-slate-900 rounded-[3.5rem] border border-rose-200 shadow-xl animate-in zoom-in-95 duration-700 relative overflow-hidden">
                      <div className="p-10 sm:p-12 relative z-10 text-center">
                          <div className="flex justify-center mb-8">
                              <div className="h-16 w-16 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/20">
                                <Shield className="h-8 w-8" />
                              </div>
                          </div>
                          <h3 className="text-2xl font-black uppercase tracking-tighter mb-4">
                            {unavailableItem ? "Item unavailable" : "Checkout needs attention"}
                          </h3>
                          <p className="mb-12 text-sm font-medium text-slate-600 italic leading-relaxed max-w-xs mx-auto">&quot;{checkoutStatus.message}&quot;</p>

                          <div className="flex flex-col gap-4">
                              {unavailableItem ? (
                                <>
                                  <Button
                                    onClick={() => {
                                      removeFromCart(unavailableItem.productId);
                                      setUnavailableItem(null);
                                      setCheckoutStatus({ type: "idle", message: "" });
                                    }}
                                    className="h-18 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all border-none"
                                  >
                                    Remove unavailable item
                                  </Button>
                                  <Button asChild variant="outline" className="h-16 rounded-2xl border-2 border-slate-300 bg-white text-slate-600 font-black uppercase text-[10px] tracking-widest hover:bg-slate-100 hover:text-slate-900 transition-all active:scale-95">
                                    <Link href="/shop">Browse available drinks</Link>
                                  </Button>
                                </>
                              ) : (
                                checkoutNeedsDeliveryLocation ? (
                                  <Button
                                    onClick={focusDeliveryLocation}
                                    className="h-18 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all border-none"
                                  >
                                      Fix delivery location
                                  </Button>
                                ) : (
                                  <Button
                                    onClick={handlePlaceOrder}
                                    className="h-18 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-[0.3em] shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all border-none"
                                  >
                                      Try checkout again
                                  </Button>
                                )
                              )}
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setUnavailableItem(null);
                                  setCheckoutStatus({ type: "idle", message: "" });
                                }}
                                className="h-16 rounded-2xl border-2 border-slate-300 bg-white text-slate-600 font-black uppercase text-[10px] tracking-widest hover:bg-slate-100 hover:text-slate-900 transition-all active:scale-95"
                              >
                                  Continue checkout
                              </Button>
                          </div>
                      </div>
                      <Zap className="absolute -bottom-10 -left-10 h-64 w-64 text-rose-900/5 rotate-12 -z-0" />
                    </Card>
                </div>
              )}

              <div className="space-y-4 pt-8 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-emerald-500" />
                  <span>Secure M-Pesa Integration</span>
                </div>
                <div className="flex items-center gap-3">
                  <Truck className="h-4 w-4 text-primary" />
                  <span>Nairobi Bar Dispatch</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
    return (
        <Suspense fallback={<div className="p-20 text-center uppercase font-black text-slate-400">Loading Checkout...</div>}>
            <ErrorBoundary>
                <CheckoutContent />
            </ErrorBoundary>
        </Suspense>
    );
}
