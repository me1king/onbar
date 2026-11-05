'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import QRCode from 'qrcode';
import Image from 'next/image';
import {
    Truck,
    LogOut,
    PhoneCall,
    Loader2,
    Star,
    Navigation,
    Fingerprint,
    MessageCircle,
    Zap,
    Search,
    Bell,
    Check,
    Clock3,
    MapPin,
    Store,
    Palette,
    AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import EarningsCenter from '@/components/rider/EarningsCenter';
import PerformanceHub from '@/components/rider/PerformanceHub';
import { authenticateBiometrics } from '@/lib/biometricService';
import MerchantConnectionsPanel from '@/components/rider/MerchantConnectionsPanel';

const RiderDeliveryMap = dynamic(() => import('@/components/tracking/CustomerDeliveryMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-slate-50 flex items-center justify-center animate-pulse rounded-[3rem] border border-slate-100"><Loader2 className="h-10 w-10 text-primary animate-spin" /></div>
});

interface Mission {
    id: number;
    customer_name: string;
    customer_phone: string;
    customer_email?: string | null;
    status: string;
    total_price: number;
    payment_method: string;
    payment_verified_at?: string | null;
    note: string;
    created_at: string;
    latitude?: number;
    longitude?: number;
    delivery_address?: string | null;
    delivery_area?: string | null;
    delivery_landmark?: string | null;
    rider_offer_status?: 'pending' | 'accepted' | 'declined' | 'expired' | null;
    rider_offer_expires_at?: string | null;
    rider_pickup_arrived_at?: string | null;
    rider_handover_verified_at?: string | null;
    items?: Array<{ id: number; name: string; quantity: number }>;
    merchants?: Array<{
        id: string;
        name: string;
        phone: string | null;
        items: Array<{ name: string; quantity: number }>;
    }>;
}

const RIDER_ACCENT_DEFAULT = '#39D98A';
const RIDER_ACCENT_PRESETS = ['#39D98A', '#21C8A8', '#4E9BFF', '#A78BFA', '#FF8A4C', '#F05D6C'];

function isCashOrder(method: string) {
    return ['cash', 'cash on delivery', 'cod'].includes(method.trim().toLowerCase());
}

function formatKsh(value: number) {
    return `KSh ${Number(value || 0).toLocaleString('en-KE')}`;
}

function riderAuthHeaders(token: string, json = false): HeadersInit {
    return {
        Authorization: 'Bearer ' + token,
        ...(json ? { 'Content-Type': 'application/json' } : {})
    };
}

function decodeVapidKey(value: string): ArrayBuffer {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
    return bytes.buffer;
}

function RiderDashboardContent() {
    const searchParams = useSearchParams();
    const phoneParam = searchParams?.get('phone');
    const supportOrderId = searchParams?.get('supportOrderId');

    const [phone, setPhone] = useState('');
    const [pin, setPin] = useState('');
    const [sessionToken, setSessionToken] = useState('');
    const [gpsMessage, setGpsMessage] = useState<string | null>(null);
    const [riderPosition, setRiderPosition] = useState<{ latitude: number; longitude: number } | null>(null);
    const [isIdentified, setIsIdentified] = useState(false);
    const [supportPreview, setSupportPreview] = useState(Boolean(supportOrderId));
    const [supportPreviewError, setSupportPreviewError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [missions, setMissions] = useState<Mission[]>([]);
    const [authError, setAuthError] = useState<string | null>(null);
    const [pushEnabled, setPushEnabled] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);
    const [pushMessage, setPushMessage] = useState<string | null>(null);
    const [customerIdVerified, setCustomerIdVerified] = useState(false);
    const [checkedItemIds, setCheckedItemIds] = useState<number[]>([]);
    const [handoverCode, setHandoverCode] = useState('');
    const [handoverBusy, setHandoverBusy] = useState(false);
    const [handoverMessage, setHandoverMessage] = useState<string | null>(null);
    const [paymentBusy, setPaymentBusy] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'pending' | 'paid'>('unpaid');
    const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
    const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
    const [paymentQr, setPaymentQr] = useState<string | null>(null);
    const paymentQrUrl = useRef('');
    const [accentColor, setAccentColor] = useState(RIDER_ACCENT_DEFAULT);
    const [accentSaveMessage, setAccentSaveMessage] = useState<string | null>(null);
    const [offerSeconds, setOfferSeconds] = useState(0);
    const [arrivalMessage, setArrivalMessage] = useState<string | null>(null);
    const [arrivalBusy, setArrivalBusy] = useState(false);
    const [issueType, setIssueType] = useState('');
    const [issueDetails, setIssueDetails] = useState('');
    const [issueMessage, setIssueMessage] = useState<string | null>(null);
    const seenOffers = useRef<Set<number>>(new Set());
    const offerTimerRunning = useRef(false);

    // Online Bar Pro States
    const [isOnline, setIsOnline] = useState(false);
    const [rider, setRider] = useState<Record<string, unknown> | null>(null);
    const [wallet, setWallet] = useState({ balance: 0, total_earned: 0 });
    const [stats, setStats] = useState({ tier: 'Bronze', rating: 5.0, acceptance: 100, maintenance: 'Healthy' });
    const [activeMission, setActiveMission] = useState<Mission | null>(null);
    const hasActiveMission = activeMission !== null;

    const verifyAndFetch = useCallback(async (riderPhone: string, riderPin: string, savedToken?: string) => {
        setLoading(true);
        setAuthError(null);
        try {
            const sessionResponse = await fetch(savedToken ? '/api/rider/session' : '/api/rider/session', {
                method: savedToken ? 'GET' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(savedToken ? { Authorization: `Bearer ${savedToken}` } : {})
                },
                ...(savedToken ? {} : { body: JSON.stringify({ phone: riderPhone, pin: riderPin.trim() }) }),
                cache: 'no-store'
            });
            const sessionData = await sessionResponse.json() as {
                token?: string;
                rider?: {
                    id: number;
                    name: string;
                    phone: string;
                    status: string;
                    verificationStatus: string;
                    currentTier?: string;
                    rating?: number;
                    acceptanceRate?: number;
                };
                error?: string;
            };
            if (!sessionResponse.ok || !sessionData.rider) {
                throw new Error(sessionData.error || 'Rider sign-in failed.');
            }
            const activeToken = savedToken || sessionData.token;
            if (!activeToken) throw new Error('The server did not issue a rider session.');
            const canonicalPhone = sessionData.rider.phone;

            // Fetch Real Stats & Wallet
            setStats({
                tier: sessionData.rider.currentTier || 'Bronze',
                rating: sessionData.rider.rating || 5.0,
                acceptance: sessionData.rider.acceptanceRate || 100,
                maintenance: 'Healthy'
            });

            const missionsResponse = await fetch('/api/rider/missions', {
                headers: { Authorization: `Bearer ${activeToken}` },
                cache: 'no-store'
            });
            const missionData = await missionsResponse.json() as {
                missions?: Mission[];
                wallet?: { balance: number; total_earned: number };
                error?: string;
            };
            if (!missionsResponse.ok) throw new Error(missionData.error || 'Rider missions could not be loaded.');
            if (missionData.wallet) setWallet(missionData.wallet);

            // AUTO-SELECT ACTIVE MISSION
            const currentMissions = missionData.missions || [];
            for (const mission of currentMissions) {
                if (mission.rider_offer_status === 'pending') seenOffers.current.add(mission.id);
            }
            const dispatched = currentMissions.find(m =>
                ['Dispatched', 'Picked Up', 'Out for Delivery'].includes(m.status)
                && m.rider_offer_status !== 'declined'
                && m.rider_offer_status !== 'expired'
            );
            if (dispatched) setActiveMission(dispatched);

            localStorage.setItem('ob_rider_phone', canonicalPhone);
            localStorage.setItem('ob_rider_token', activeToken);
            localStorage.removeItem('ob_rider_pin');
            setPhone(canonicalPhone);
            setSessionToken(activeToken);
            setRider(sessionData.rider);
            setMissions(currentMissions);
            setIsIdentified(true);
            setIsOnline(sessionData.rider.status === 'Idle' || sessionData.rider.status === 'Delivering');
            const savedAccent = localStorage.getItem(`ob_rider_accent_${canonicalPhone}`);
            if (savedAccent && /^#[0-9A-Fa-f]{6}$/.test(savedAccent)) setAccentColor(savedAccent);
            void fetch('/api/rider/preferences', {
                headers: riderAuthHeaders(activeToken),
                cache: 'no-store'
            }).then(async response => {
                const result = await response.json() as { accentColor?: string; error?: string };
                if (!response.ok || !result.accentColor) throw new Error(result.error || 'Rider appearance could not be loaded.');
                setAccentColor(result.accentColor);
                localStorage.setItem(`ob_rider_accent_${canonicalPhone}`, result.accentColor);
            }).catch(error => {
                console.error('[RiderDashboard] Rider theme could not be loaded:', error);
                setAccentSaveMessage(error instanceof Error ? error.message : 'Rider theme could not be loaded.');
            });
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : 'Rider sign-in failed.');
        } finally {
            setLoading(false);
        }
    }, []);

    const respondToOffer = useCallback(async (orderId: number, responseValue: 'accepted' | 'declined', timedOut = false) => {
        if (!sessionToken) return;
        setAuthError(null);
        setLoading(true);
        try {
            const response = await fetch('/api/rider/offers/respond', {
                method: 'POST',
                headers: riderAuthHeaders(sessionToken, true),
                body: JSON.stringify({ orderId, response: responseValue }),
                cache: 'no-store'
            });
            const result = await response.json() as { response?: string; status?: string; error?: string };
            if (!response.ok || !result.response) throw new Error(result.error || 'Offer response could not be saved.');
            if (result.response === 'accepted') {
                setActiveMission(current => current?.id === orderId
                    ? { ...current, rider_offer_status: 'accepted' }
                    : current);
                setMissions(current => current.map(mission => mission.id === orderId
                    ? { ...mission, rider_offer_status: 'accepted' }
                    : mission));
                setPushMessage(`Order #${orderId} accepted. Head to the merchant pickup.`);
                return;
            }
            setActiveMission(current => current?.id === orderId ? null : current);
            setMissions(current => current.map(mission => mission.id === orderId
                ? { ...mission, rider_offer_status: result.response as Mission['rider_offer_status'], status: result.status || mission.status }
                : mission));
            setPushMessage(result.response === 'expired' || timedOut
                ? `Offer #${orderId} expired and was returned to dispatch.`
                : `Offer #${orderId} declined and returned to dispatch.`);
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : 'Offer response could not be saved.');
        } finally {
            setLoading(false);
        }
    }, [sessionToken]);

    const saveAccentColor = useCallback(async (color: string) => {
        setAccentColor(color);
        setAccentSaveMessage(null);
        localStorage.setItem(`ob_rider_accent_${phone}`, color);
        if (!sessionToken) return;
        try {
            const response = await fetch('/api/rider/preferences', {
                method: 'PATCH',
                headers: riderAuthHeaders(sessionToken, true),
                body: JSON.stringify({ accentColor: color }),
                cache: 'no-store'
            });
            const result = await response.json() as { accentColor?: string; error?: string };
            if (!response.ok || !result.accentColor) throw new Error(result.error || 'Rider theme could not be saved.');
            setAccentColor(result.accentColor);
            localStorage.setItem(`ob_rider_accent_${phone}`, result.accentColor);
            setAccentSaveMessage('Theme saved to rider profile.');
        } catch (error) {
            setAccentSaveMessage(error instanceof Error ? error.message : 'Theme could not be saved to rider profile.');
        }
    }, [phone, sessionToken]);

    const markPickupArrival = useCallback(async (orderId: number) => {
        if (!sessionToken) return;
        setLoading(true);
        setAuthError(null);
        try {
            const response = await fetch('/api/rider/pickup-arrived', {
                method: 'POST',
                headers: riderAuthHeaders(sessionToken, true),
                body: JSON.stringify({ orderId }),
                cache: 'no-store'
            });
            const result = await response.json() as { arrivedAt?: string; warning?: string; error?: string };
            if (!response.ok || !result.arrivedAt) throw new Error(result.error || 'Pickup arrival could not be recorded.');
            setActiveMission(current => current?.id === orderId
                ? { ...current, rider_pickup_arrived_at: result.arrivedAt }
                : current);
            setMissions(current => current.map(mission => mission.id === orderId
                ? { ...mission, rider_pickup_arrived_at: result.arrivedAt }
                : mission));
            setPushMessage(result.warning || 'Merchant arrival saved. Check each item before pickup.');
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : 'Pickup arrival could not be recorded.');
        } finally {
            setLoading(false);
        }
    }, [sessionToken]);

    const notifyCustomerArriving = useCallback(async (orderId: number) => {
        if (!sessionToken) return;
        setArrivalBusy(true);
        setArrivalMessage(null);
        try {
            const response = await fetch('/api/rider/arriving', {
                method: 'POST',
                headers: riderAuthHeaders(sessionToken, true),
                body: JSON.stringify({ orderId }),
                cache: 'no-store'
            });
            const result = await response.json() as { sent?: boolean; alreadySent?: boolean; error?: string };
            if (!response.ok || !result.sent) throw new Error(result.error || 'Customer arrival message could not be sent.');
            setArrivalMessage(result.alreadySent
                ? 'The customer already has an active handover code on WhatsApp.'
                : 'Arrival and a fresh four-digit handover code were sent to the customer’s WhatsApp.');
        } catch (error) {
            setArrivalMessage(error instanceof Error ? error.message : 'Customer arrival message could not be sent.');
        } finally {
            setArrivalBusy(false);
        }
    }, [sessionToken]);

    const verifyHandoverCode = useCallback(async (orderId: number) => {
        if (!sessionToken || !/^\d{4}$/.test(handoverCode)) return;
        setHandoverBusy(true);
        setHandoverMessage(null);
        try {
            const response = await fetch('/api/rider/handover', {
                method: 'POST',
                headers: riderAuthHeaders(sessionToken, true),
                body: JSON.stringify({ orderId, code: handoverCode }),
                cache: 'no-store'
            });
            const result = await response.json() as { verified?: boolean; error?: string };
            if (!response.ok || !result.verified) throw new Error(result.error || 'The handover code could not be verified.');
            const verifiedAt = new Date().toISOString();
            setActiveMission(current => current?.id === orderId
                ? { ...current, rider_handover_verified_at: verifiedAt }
                : current);
            setMissions(current => current.map(mission => mission.id === orderId
                ? { ...mission, rider_handover_verified_at: verifiedAt }
                : mission));
            setHandoverCode('');
            setHandoverMessage('Code verified. Confirm ID and record the customer’s payment before completion.');
        } catch (error) {
            setHandoverMessage(error instanceof Error ? error.message : 'The handover code could not be verified.');
        } finally {
            setHandoverBusy(false);
        }
    }, [handoverCode, sessionToken]);

    const collectDeliveryPayment = useCallback(async (orderId: number, method: 'cash' | 'mpesa' | 'qr') => {
        if (!sessionToken || !customerIdVerified) return;
        setPaymentBusy(true);
        setPaymentMessage(null);
        try {
            const response = await fetch('/api/rider/delivery-payment', {
                method: 'POST',
                headers: riderAuthHeaders(sessionToken, true),
                body: JSON.stringify({ orderId, method, customerIdVerified }),
                cache: 'no-store'
            });
            const result = await response.json() as {
                status?: 'unpaid' | 'pending' | 'paid';
                paymentMethod?: string | null;
                checkoutUrl?: string | null;
                warning?: string | null;
                error?: string;
            };
            if (!response.ok || !result.status) throw new Error(result.error || 'Payment could not be started.');
            setPaymentStatus(result.status);
            setPaymentMethod(result.paymentMethod || method);
            if (result.checkoutUrl) {
                paymentQrUrl.current = result.checkoutUrl;
                setPaymentQr(await QRCode.toDataURL(result.checkoutUrl, { width: 240, margin: 1 }));
            }
            const message = result.status === 'paid'
                ? `Payment confirmed${result.paymentMethod ? ` (${result.paymentMethod})` : ''}.`
                : method === 'mpesa'
                    ? 'M-Pesa prompt sent. Wait for the provider-verified payment confirmation.'
                    : 'Secure payment QR is ready. Ask the customer to scan it and complete checkout.';
            setPaymentMessage([message, result.warning].filter(Boolean).join(' '));
        } catch (error) {
            setPaymentMessage(error instanceof Error ? error.message : 'Payment could not be started.');
        } finally {
            setPaymentBusy(false);
        }
    }, [customerIdVerified, sessionToken]);

    const reportDeliveryIssue = useCallback(async (orderId: number) => {
        if (!sessionToken || !issueType) return;
        setLoading(true);
        setIssueMessage(null);
        try {
            const response = await fetch('/api/rider/delivery-issue', {
                method: 'POST',
                headers: riderAuthHeaders(sessionToken, true),
                body: JSON.stringify({ orderId, issue: issueType, details: issueDetails }),
                cache: 'no-store'
            });
            const result = await response.json() as { recorded?: boolean; error?: string };
            if (!response.ok || !result.recorded) throw new Error(result.error || 'Delivery issue could not be recorded.');
            setIssueMessage(['no_valid_id', 'underage_customer', 'intoxicated_customer', 'customer_refused'].includes(issueType)
                ? 'Safety issue recorded. Do not hand over; dispatch review is required.'
                : 'Issue recorded for dispatch review.');
            setIssueType('');
            setIssueDetails('');
        } catch (error) {
            setIssueMessage(error instanceof Error ? error.message : 'Delivery issue could not be recorded.');
        } finally {
            setLoading(false);
        }
    }, [issueDetails, issueType, sessionToken]);

    useEffect(() => {
        setCustomerIdVerified(false);
        setHandoverCode('');
        setHandoverMessage(null);
        setArrivalMessage(null);
    }, [activeMission?.id]);

    useEffect(() => {
        const orderId = activeMission?.id;
        const handoverVerified = Boolean(activeMission?.rider_handover_verified_at);
        if (!orderId || activeMission?.status !== 'Out for Delivery' || !handoverVerified || !sessionToken) {
            if (!handoverVerified) {
                setPaymentStatus('unpaid');
                setPaymentMethod(null);
                setPaymentMessage(null);
                setPaymentQr(null);
                paymentQrUrl.current = '';
            }
            return;
        }

        let active = true;
        const refreshPayment = async () => {
            try {
                const response = await fetch(`/api/rider/delivery-payment?orderId=${orderId}`, {
                    headers: riderAuthHeaders(sessionToken),
                    cache: 'no-store'
                });
                const result = await response.json() as {
                    status?: 'unpaid' | 'pending' | 'paid';
                    paymentMethod?: string | null;
                    checkoutUrl?: string | null;
                    message?: string | null;
                    error?: string;
                };
                if (!response.ok || !result.status) throw new Error(result.error || 'Payment status could not be refreshed.');
                if (!active) return;
                setPaymentStatus(result.status);
                setPaymentMethod(result.paymentMethod || null);
                if (result.checkoutUrl && paymentQrUrl.current !== result.checkoutUrl) {
                    paymentQrUrl.current = result.checkoutUrl;
                    setPaymentQr(await QRCode.toDataURL(result.checkoutUrl, { width: 240, margin: 1 }));
                }
                if (result.status === 'paid') {
                    setPaymentMessage('Payment confirmed by the payment provider or recorded cash collection.');
                } else if (result.message) {
                    setPaymentMessage(result.message);
                }
            } catch (error) {
                if (active) setPaymentMessage(error instanceof Error ? error.message : 'Payment status could not be refreshed.');
            }
        };
        void refreshPayment();
        const timer = window.setInterval(() => { void refreshPayment(); }, 4000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [activeMission?.id, activeMission?.rider_handover_verified_at, activeMission?.status, sessionToken]);

    useEffect(() => {
        if (!isIdentified || !sessionToken || !('serviceWorker' in navigator)) return;
        let active = true;
        void navigator.serviceWorker.getRegistration('/sw.js')
            .then(registration => registration?.pushManager.getSubscription())
            .then(async subscription => {
                if (!active || !subscription) return;
                const response = await fetch('/api/rider/alerts', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${sessionToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ operation: 'subscribe', subscription: subscription.toJSON() }),
                    cache: 'no-store'
                });
                const result = await response.json() as { error?: string };
                if (!response.ok) throw new Error(result.error || 'This device could not be registered for rider alerts.');
                if (active) setPushEnabled(true);
            })
            .catch(error => {
                if (active) {
                    setPushMessage(error instanceof Error ? error.message : 'This device’s push subscription could not be refreshed.');
                    console.error('[RiderDashboard] Could not refresh push subscription:', error);
                }
            });
        return () => { active = false; };
    }, [isIdentified, sessionToken]);

    useEffect(() => {
        if (!isIdentified || !sessionToken) return;
        let active = true;
        const timer = window.setInterval(async () => {
            try {
                const response = await fetch('/api/rider/missions', {
                    headers: { Authorization: `Bearer ${sessionToken}` },
                    cache: 'no-store'
                });
                const result = await response.json() as {
                    missions?: Mission[];
                    wallet?: { balance: number; total_earned: number };
                    error?: string;
                };
                if (!response.ok) throw new Error(result.error || 'Rider missions could not be refreshed.');
                if (!active) return;
                const refreshedMissions = result.missions || [];
                const newOffers = refreshedMissions.filter(mission =>
                    mission.rider_offer_status === 'pending' && !seenOffers.current.has(mission.id)
                );
                for (const mission of refreshedMissions) {
                    if (mission.rider_offer_status === 'pending') seenOffers.current.add(mission.id);
                }
                if (newOffers.length > 0) {
                    if ('vibrate' in navigator) navigator.vibrate([300, 120, 300, 120, 600]);
                    setPushMessage(`New delivery offer${newOffers.length > 1 ? 's' : ''}: ${newOffers.map(item => `#${item.id}`).join(', ')}`);
                    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                        new Notification('New delivery offer', {
                            body: `Order #${newOffers[0].id} is waiting for your response.`,
                            icon: '/favicon.svg',
                            tag: `rider-offer-${newOffers[0].id}`
                        });
                    }
                }
                setMissions(refreshedMissions);
                if (result.wallet) setWallet(result.wallet);
                setActiveMission(current => {
                    const activeStatuses = ['Dispatched', 'Picked Up', 'Out for Delivery'];
                    const currentMission = current && refreshedMissions.find(mission =>
                        mission.id === current.id
                        && activeStatuses.includes(mission.status)
                        && mission.rider_offer_status !== 'declined'
                        && mission.rider_offer_status !== 'expired');
                    return currentMission
                        || refreshedMissions.find(mission => activeStatuses.includes(mission.status)
                            && mission.rider_offer_status !== 'declined'
                            && mission.rider_offer_status !== 'expired')
                        || null;
                });
            } catch (error) {
                if (active) console.error('[RiderDashboard] Mission refresh failed:', error);
            }
        }, 10_000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [isIdentified, sessionToken]);

    useEffect(() => {
        const mission = activeMission;
        if (!mission || mission.rider_offer_status !== 'pending' || !mission.rider_offer_expires_at) {
            setOfferSeconds(0);
            return;
        }
        const updateRemaining = () => {
            const remaining = Math.max(0, Math.ceil((new Date(mission.rider_offer_expires_at!).getTime() - Date.now()) / 1000));
            setOfferSeconds(remaining);
            if (remaining === 0 && !offerTimerRunning.current) {
                offerTimerRunning.current = true;
                void respondToOffer(mission.id, 'declined', true).finally(() => {
                    offerTimerRunning.current = false;
                });
            }
        };
        updateRemaining();
        const timer = window.setInterval(updateRemaining, 1000);
        return () => window.clearInterval(timer);
    }, [activeMission, respondToOffer]);

    useEffect(() => {
        const orderId = Number(searchParams?.get('orderId'));
        if (!Number.isSafeInteger(orderId) || orderId <= 0) return;
        const mission = missions.find(item => item.id === orderId
            && ['Dispatched', 'Picked Up', 'Out for Delivery'].includes(item.status));
        if (mission) setActiveMission(mission);
    }, [missions, searchParams]);

    const enableMissionAlerts = async () => {
        if (!sessionToken || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
            setPushMessage('This browser does not support push mission alerts. SMS fallback still depends on server setup.');
            return;
        }
        setPushBusy(true);
        setPushMessage(null);
        try {
            if (Notification.permission === 'denied') {
                throw new Error('Notifications are blocked in browser settings. Allow them there, then try again.');
            }
            const permission = Notification.permission === 'granted'
                ? 'granted'
                : await Notification.requestPermission();
            if (permission !== 'granted') throw new Error('Notification permission was not granted.');

            const configResponse = await fetch('/api/rider/alerts', {
                headers: { Authorization: `Bearer ${sessionToken}` },
                cache: 'no-store'
            });
            const config = await configResponse.json() as { configured?: boolean; publicKey?: string | null; error?: string };
            if (!configResponse.ok || !config.configured || !config.publicKey) {
                throw new Error(config.error || 'Push mission alerts are not configured on the server.');
            }

            const registration = await navigator.serviceWorker.register('/sw.js');
            const subscription = await registration.pushManager.getSubscription()
                || await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: decodeVapidKey(config.publicKey)
                });
            const response = await fetch('/api/rider/alerts', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${sessionToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ operation: 'subscribe', subscription: subscription.toJSON() }),
                cache: 'no-store'
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'This device could not be registered for rider alerts.');
            setPushEnabled(true);
            setPushMessage('Mission push alerts are enabled on this device. SMS reminders are sent by the server worker.');
        } catch (error) {
            setPushMessage(error instanceof Error ? error.message : 'Mission push alerts could not be enabled.');
        } finally {
            setPushBusy(false);
        }
    };

    const handleAdvanceMission = useCallback(async (orderId: number) => {
        if (!sessionToken) return;
        const mission = activeMission;
        const nextStatus = activeMission?.id === orderId
            ? activeMission.status === 'Dispatched'
                ? 'Picked Up'
                : activeMission.status === 'Picked Up'
                    ? 'Out for Delivery'
                    : 'Delivered'
            : '';
        if (nextStatus === 'Picked Up'
            && (mission?.items?.length || 0) > 0
            && mission?.items?.some(item => !checkedItemIds.includes(item.id))) {
            setAuthError('Check every item in the order before confirming pickup.');
            return;
        }
        if (nextStatus === 'Picked Up' && !mission?.rider_pickup_arrived_at) {
            setAuthError('Record your arrival at the merchant before confirming pickup.');
            return;
        }
        if (nextStatus === 'Delivered' && (!customerIdVerified || !mission?.rider_handover_verified_at)) {
            setAuthError('Check the customer’s ID and verify their four-digit handover code before completion.');
            return;
        }
        if (nextStatus === 'Delivered' && paymentStatus !== 'paid') {
            setAuthError('Record a confirmed payment before completing delivery.');
            return;
        }
        setLoading(true);
        try {
            const response = await fetch('/api/rider/delivery-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
                body: JSON.stringify({
                    orderId,
                    nextStatus,
                    customerIdVerified: nextStatus === 'Delivered' && customerIdVerified,
                    checkedItemIds: nextStatus === 'Picked Up' ? checkedItemIds : []
                }),
                cache: 'no-store'
            });
            const result = await response.json() as {
                status?: string;
                error?: string;
                warning?: string;
                wallet?: { balance: number; total_earned: number };
            };
            if (!response.ok || !result.status) throw new Error(result.error || 'Delivery status could not be updated.');

            setMissions(prev => prev.map(m => m.id === orderId ? { ...m, status: result.status! } : m));
            if (result.wallet) setWallet(result.wallet);
            if (result.status === 'Delivered') {
                setActiveMission(null);
                setCustomerIdVerified(false);
                setHandoverCode('');
                setHandoverMessage(null);
                setPaymentStatus('unpaid');
                setPaymentMethod(null);
                setPaymentMessage(null);
                setPaymentQr(null);
                paymentQrUrl.current = '';
                setCheckedItemIds([]);
                alert(result.warning || 'Mission complete. Payment, delivery, customer notification, and rider earnings have been recorded.');
            } else {
                setActiveMission(prev => prev?.id === orderId ? { ...prev, status: result.status! } : prev);
            }
            setArrivalMessage(null);
            if (result.warning) setAuthError(result.warning);
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : 'Delivery status could not be updated.');
        } finally {
            setLoading(false);
        }
    }, [activeMission, checkedItemIds, customerIdVerified, paymentStatus, sessionToken]);

    useEffect(() => {
        if (!supportOrderId) {
            setSupportPreview(false);
            const savedPhone = localStorage.getItem('ob_rider_phone');
            const savedToken = localStorage.getItem('ob_rider_token');
            if (savedPhone && savedToken) {
                setPhone(savedPhone);
                setSessionToken(savedToken);
                verifyAndFetch(savedPhone, '', savedToken);
            } else if (phoneParam) {
                setPhone(phoneParam);
            }
            return;
        }

        setSupportPreview(true);
        setIsIdentified(false);
        setSupportPreviewError(null);
        let active = true;
        const loadPreview = async () => {
            const response = await fetch(`/api/admin/support-view?orderId=${encodeURIComponent(supportOrderId)}`, {
                cache: 'no-store'
            });
            const result = await response.json() as {
                order?: {
                    id: number;
                    status: string;
                    customer_name: string;
                    customer_phone: string;
                    customer_email: string | null;
                    total_price: number | string;
                    payment_method: string;
                    payment_verified_at: string | null;
                    created_at: string;
                    note: string | null;
                    latitude: number | null;
                    longitude: number | null;
                    delivery_address?: string | null;
                    delivery_area?: string | null;
                    delivery_landmark?: string | null;
                    rider_pickup_arrived_at?: string | null;
                    rider_handover_verified_at?: string | null;
                    items: Array<{ id: number; name: string; quantity: number }>;
                    merchants: Array<{ id: string; name: string; phone: string | null; items: Array<{ name: string; quantity: number }> }>;
                    rider: {
                        rider_name: string;
                        rider_phone: string;
                        status: string;
                        verification_status: string;
                        last_known_lat: number | null;
                        last_known_lng: number | null;
                        location_updated_at: string | null;
                    } | null;
                };
                error?: string;
            };
            if (!response.ok || !result.order) throw new Error(result.error || 'The rider order view could not be loaded.');
            if (!active) return;
            const order = result.order;
            const mission: Mission = {
                id: order.id,
                status: order.status,
                customer_name: order.customer_name,
                customer_phone: order.customer_phone,
                customer_email: order.customer_email,
                total_price: Number(order.total_price) || 0,
                payment_method: order.payment_method,
                payment_verified_at: order.payment_verified_at,
                note: order.note || '',
                created_at: order.created_at,
                latitude: order.latitude ?? undefined,
                longitude: order.longitude ?? undefined,
                delivery_address: order.delivery_address,
                delivery_area: order.delivery_area,
                delivery_landmark: order.delivery_landmark,
                rider_pickup_arrived_at: order.rider_pickup_arrived_at,
                rider_handover_verified_at: order.rider_handover_verified_at,
                items: order.items,
                merchants: order.merchants
            };
            setPhone(order.rider?.rider_phone || '');
            setRider(order.rider ? {
                name: order.rider.rider_name,
                phone: order.rider.rider_phone,
                status: order.rider.status,
                verificationStatus: order.rider.verification_status
            } : null);
            const locationUpdatedAt = order.rider?.location_updated_at
                ? new Date(order.rider.location_updated_at).getTime()
                : 0;
            const locationIsFresh = locationUpdatedAt > 0
                && Date.now() >= locationUpdatedAt
                && Date.now() - locationUpdatedAt <= 2 * 60 * 1000;
            setRiderPosition(
                locationIsFresh
                && order.rider?.last_known_lat !== null && order.rider?.last_known_lat !== undefined
                && order.rider?.last_known_lng !== null && order.rider?.last_known_lng !== undefined
                    ? { latitude: order.rider.last_known_lat, longitude: order.rider.last_known_lng }
                    : null
            );
            setMissions(order.rider ? [mission] : []);
            setActiveMission(order.rider ? mission : null);
            setIsOnline(false);
            setSessionToken('');
            setIsIdentified(true);
        };
        void loadPreview().catch(error => {
            if (active) {
                setSupportPreviewError(error instanceof Error ? error.message : 'The rider order view could not be loaded.');
                setIsIdentified(false);
            }
        });
        const timer = window.setInterval(() => {
            void loadPreview().catch(error => {
                if (active) setSupportPreviewError(error instanceof Error ? error.message : 'The rider order view could not be refreshed.');
            });
        }, 15_000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [phoneParam, supportOrderId, verifyAndFetch]);

    useEffect(() => {
        if (!isOnline || !sessionToken) {
            if (!supportPreview) setRiderPosition(null);
            return;
        }
        if (!navigator.geolocation) {
            setGpsMessage('This device does not support GPS; pickup distance will be unavailable.');
            return;
        }

        let lastSentAt = 0;
        let active = true;
        const watchId = navigator.geolocation.watchPosition(async position => {
            if (!active || Date.now() - lastSentAt < (hasActiveMission ? 10_000 : 30_000)) return;
            lastSentAt = Date.now();
            setRiderPosition({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            });
            try {
                const response = await fetch('/api/rider/sync-location', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    })
                });
                const result = await response.json() as { error?: string };
                if (!response.ok) throw new Error(result.error || 'GPS could not be synced.');
                if (active) setGpsMessage(`Pickup location updated ${new Date().toLocaleTimeString()}.`);
            } catch (error) {
                if (active) setGpsMessage(error instanceof Error ? error.message : 'GPS could not be synced.');
            }
        }, error => {
            if (active) {
                setGpsMessage(error.code === error.PERMISSION_DENIED
                    ? 'Location permission is blocked. Enable location access to receive distance-ranked assignments.'
                    : 'GPS is unavailable right now. Keep the app open and retry location access.');
            }
        }, {
            enableHighAccuracy: true,
            maximumAge: 10_000,
            timeout: 20_000
        });

        return () => {
            active = false;
            navigator.geolocation.clearWatch(watchId);
        };
    }, [hasActiveMission, isOnline, sessionToken, supportPreview]);

    const handleBioAuth = async () => {
        try {
            const cred = await authenticateBiometrics();
            if (cred && phone && pin) {
                verifyAndFetch(phone, pin);
            }
        } catch {
        }
    };

    const handleToggleOnline = async () => {
        if (!sessionToken || !phone) return;
        setLoading(true);

        try {
            const response = await fetch('/api/rider/status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionToken}`
                },
                body: JSON.stringify({ online: !isOnline })
            });
            const result = await response.json() as { status?: string; error?: string };
            if (!response.ok || !result.status) throw new Error(result.error || 'Rider status could not be saved.');
            setIsOnline(result.status !== 'Offline');
            setRider(current => current ? { ...current, status: result.status } : current);
            localStorage.setItem('ob_rider_status', result.status);
            setGpsMessage(result.status === 'Offline' ? null : 'Online. Waiting for a fresh GPS fix…');
        } catch (err) {
            setAuthError(err instanceof Error ? err.message : 'Failed to update rider status.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('ob_rider_phone');
        localStorage.removeItem('ob_rider_pin');
        localStorage.removeItem('ob_rider_token');
        setIsIdentified(false);
        setIsOnline(false);
        setSessionToken('');
        setMissions([]);
        setPhone('');
        setPin('');
    };

    if (!isIdentified && supportPreview) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#080c0b] p-6 text-white">
                <Card className="max-w-lg space-y-3 rounded-2xl border-white/10 bg-[#101614] p-8 text-center text-white">
                    <Truck className="mx-auto h-8 w-8 text-emerald-400" />
                    <h1 className="text-xl font-black">Rider screen support preview</h1>
                    <p className="text-sm text-white/60">{supportPreviewError || 'Loading the rider view for this order…'}</p>
                </Card>
            </div>
        );
    }

    if (!isIdentified) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 selection:bg-primary/20">
                <Card className="max-w-md w-full p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-2xl space-y-10">
                    <div className="text-center space-y-4 text-left">
                        <div className="h-20 w-20 rounded-[2rem] bg-primary/10 flex items-center justify-center text-primary mx-auto shadow-sm">
                            <Truck className="h-10 w-10" />
                        </div>
                        <h1 className="text-3xl font-black uppercase tracking-tighter text-foreground">Rider Command</h1>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identify to Begin Missions</p>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-4">
                            <div className="relative">
                                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="07XXXXXXXX" className="h-16 rounded-2xl bg-slate-50 border-slate-100 text-foreground pl-14 text-sm font-black" />
                                <PhoneCall className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                            </div>
                            <div className="relative">
                                <Input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="PIN" maxLength={4} className="h-16 rounded-2xl bg-slate-50 border-slate-100 text-foreground pl-14 text-sm font-black" />
                                <Zap className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                            </div>
                        </div>

                        {authError && <p className="text-[9px] font-black uppercase text-rose-500 text-center">{authError}</p>}

                        <div className="grid grid-cols-2 gap-3">
                            <Button onClick={() => verifyAndFetch(phone, pin)} disabled={loading} className="h-16 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-all">
                                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Initialize"}
                            </Button>
                            <Button onClick={handleBioAuth} variant="outline" className="h-16 rounded-2xl border-slate-100 text-slate-400 hover:text-primary active:scale-95 transition-all">
                                <Fingerprint className="h-6 w-6" />
                            </Button>
                        </div>

                        <div className="pt-4 text-center border-t border-slate-100">
                            <Link href="/rider/onboarding" className="text-[10px] font-black text-slate-400 hover:text-primary transition-colors uppercase tracking-widest">Apply for Duty &rarr;</Link>
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    const isOffer = activeMission?.rider_offer_status === 'pending';
    const isAssignedMission = !!activeMission && !isOffer;
    const statusSteps = ['Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered'];
    const currentStep = activeMission ? statusSteps.indexOf(activeMission.status) : -1;
    const merchantGroups = activeMission?.merchants || [];
    const deliveryDestination = isAssignedMission
        && typeof activeMission?.latitude === 'number' && Number.isFinite(activeMission.latitude)
        && typeof activeMission.longitude === 'number' && Number.isFinite(activeMission.longitude)
        ? { latitude: activeMission.latitude, longitude: activeMission.longitude }
        : null;
    const accentStyle = { color: accentColor, borderColor: `${accentColor}66` };
    const riderName = typeof rider?.name === 'string' ? rider.name : 'Rider';

    return (
        <main className="min-h-screen bg-[#080c0b] text-white selection:bg-emerald-400/30">
            {supportPreview && (
                <div className="border-b border-amber-300/30 bg-amber-300/10 px-4 py-3 text-center text-xs font-bold text-amber-100">
                    Admin support preview · read-only · order #{activeMission?.id ?? supportOrderId}
                </div>
            )}
            <div inert={supportPreview}>
            <header className="sticky top-0 z-30 border-b border-white/10 bg-[#080c0b]/95 px-4 py-3 backdrop-blur sm:px-7">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 font-black" style={{ color: accentColor }}>
                            <Truck className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-xs font-black uppercase tracking-[0.2em]">Rider terminal</p>
                            <p className="truncate text-xs text-white/50">{riderName} · {phone}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="hidden items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider sm:flex">
                            <span className={`h-2 w-2 rounded-full ${isOnline ? 'animate-pulse bg-emerald-400' : 'bg-white/30'}`} />
                            {isOnline ? 'Online' : 'Offline'}
                        </span>
                        {!supportPreview && <Button onClick={handleToggleOnline} disabled={loading} className="h-10 rounded-lg px-4 text-xs font-black uppercase" style={{ backgroundColor: isOnline ? '#202725' : accentColor, color: isOnline ? 'white' : '#08100c' }}>
                            {isOnline ? 'Go offline' : 'Go online'}
                        </Button>}
                        {!supportPreview && <button aria-label="Log out" onClick={handleLogout} className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white/60 hover:text-rose-300">
                            <LogOut className="h-4 w-4" />
                        </button>}
                    </div>
                </div>
                {gpsMessage && <p role="status" className="mx-auto mt-2 max-w-7xl text-[11px] text-white/50">{gpsMessage}</p>}
            </header>

            <div className="mx-auto grid max-w-7xl gap-5 p-4 sm:p-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.85fr)]">
                <section className="space-y-5">
                    <div className="relative h-[288px] overflow-hidden rounded-2xl border border-white/10 bg-[#101614] sm:h-[340px]">
                        {riderPosition ? (
                            <RiderDeliveryMap rider={riderPosition} destination={deliveryDestination} />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-white/55">
                                <Navigation className="h-6 w-6" style={{ color: accentColor }} />
                                <p className="text-xs font-bold">Waiting for live GPS</p>
                                <p className="max-w-xs text-[10px]">Go online and allow location access to show your position.</p>
                            </div>
                        )}
                        <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-white/10 bg-[#080c0b]/90 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/70">
                            <MapPin className="mr-1 inline h-3 w-3" /> Live mission map
                        </div>
                    </div>

                    <section className="rounded-2xl border bg-[#101614] p-4 sm:p-6" style={{ borderColor: `${accentColor}66` }}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: accentColor }}>
                                    {isOffer ? 'New delivery offer' : isAssignedMission ? 'Active delivery' : 'Dispatch status'}
                                </p>
                                <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                                    {isOffer ? `Order #${activeMission.id}` : isAssignedMission ? `Order #${activeMission.id}` : isOnline ? 'Ready for offers' : 'You are offline'}
                                </h1>
                                <p className="mt-1 text-sm text-white/55">
                                    {isOffer
                                        ? `Offer expires in ${offerSeconds}s`
                                        : isAssignedMission
                                            ? `${activeMission.customer_name} · ${activeMission.delivery_address || activeMission.delivery_area || 'Delivery location'}`
                                            : isOnline ? 'Keep the app open and alerts enabled.' : 'Go online to receive delivery offers.'}
                                </p>
                            </div>
                            {activeMission && (
                                <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold" style={accentStyle}>
                                    {activeMission.payment_method || 'Payment pending'} · {formatKsh(activeMission.total_price)}
                                </span>
                            )}
                        </div>

                        {isOffer && activeMission && (
                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                <Button onClick={() => void respondToOffer(activeMission.id, 'accepted')} disabled={loading || offerSeconds <= 0} className="h-14 rounded-xl text-sm font-black uppercase tracking-widest" style={{ backgroundColor: accentColor, color: '#08100c' }}>
                                    <Check className="mr-2 h-4 w-4" /> Accept offer
                                </Button>
                                <Button onClick={() => void respondToOffer(activeMission.id, 'declined')} disabled={loading} variant="outline" className="h-14 rounded-xl border-white/15 bg-white/5 text-sm font-black uppercase tracking-widest text-white hover:bg-rose-500/10 hover:text-rose-300">
                                    Decline
                                </Button>
                            </div>
                        )}

                        {isAssignedMission && activeMission && (
                            <>
                                <ol aria-label="Delivery progress" className="mt-6 grid grid-cols-4 gap-2">
                                    {['Merchant', 'Pickup', 'On route', 'Handover'].map((step, index) => (
                                        <li key={step} className="min-w-0">
                                            <div className="mb-2 h-1.5 rounded-full bg-white/10">
                                                <div className="h-full rounded-full transition-all" style={{ width: currentStep >= index ? '100%' : '0%', backgroundColor: accentColor }} />
                                            </div>
                                            <p className={`truncate text-[9px] font-bold uppercase tracking-wide ${currentStep >= index ? 'text-white' : 'text-white/35'}`}>{step}</p>
                                        </li>
                                    ))}
                                </ol>
                                <div className="mt-6 flex flex-wrap gap-2">
                                    {activeMission.customer_phone && (
                                        <a href={`tel:${activeMission.customer_phone}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-bold text-white/80 hover:bg-white/5">
                                            <PhoneCall className="h-4 w-4" /> Call customer
                                        </a>
                                    )}
                                    {activeMission.latitude && activeMission.longitude && (
                                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${activeMission.latitude},${activeMission.longitude}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-bold text-white/80 hover:bg-white/5">
                                            <Navigation className="h-4 w-4" /> Navigate
                                        </a>
                                    )}
                                    {activeMission.status === 'Dispatched' && !activeMission.rider_pickup_arrived_at && (
                                        <Button onClick={() => void markPickupArrival(activeMission.id)} disabled={loading} variant="outline" className="h-10 border-white/10 bg-white/5 text-xs font-bold text-white hover:bg-white/10">
                                            <MapPin className="mr-2 h-4 w-4" /> I&apos;ve arrived
                                        </Button>
                                    )}
                                </div>
                                {merchantGroups.length > 0 ? (
                                    <div className="mt-6 space-y-3">
                                        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/60"><Store className="h-4 w-4" /> Merchant pickups</h2>
                                        {merchantGroups.map(merchant => (
                                            <article key={merchant.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="font-bold">{merchant.name}</p>
                                                    <div className="flex gap-2">
                                                        {merchant.phone && <a aria-label={`Call ${merchant.name}`} href={`tel:${merchant.phone}`} className="rounded-md border border-white/10 p-2 text-white/65 hover:text-white"><PhoneCall className="h-4 w-4" /></a>}
                                                        {merchant.phone && <a aria-label={`WhatsApp ${merchant.name}`} href={`https://wa.me/${merchant.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="rounded-md border border-white/10 p-2 text-white/65 hover:text-white"><MessageCircle className="h-4 w-4" /></a>}
                                                    </div>
                                                </div>
                                                <ul className="mt-3 space-y-1 text-xs text-white/60">
                                                    {merchant.items.map((item, index) => <li key={`${item.name}-${index}`}>{item.quantity} × {item.name}</li>)}
                                                </ul>
                                            </article>
                                        ))}
                                    </div>
                                ) : <p className="mt-5 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200/80">Merchant pickup details are unavailable for this order. Check the order items with dispatch before leaving.</p>}

                                {activeMission.items && activeMission.items.length > 0 && activeMission.status === 'Dispatched' && (
                                    <div className="mt-6 rounded-xl border border-white/10 p-4">
                                        <h2 className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-white/60">Pickup checklist</h2>
                                        <div className="space-y-3">
                                            {activeMission.items.map(item => (
                                                <label key={item.id} className="flex cursor-pointer items-center gap-3 text-sm text-white/85">
                                                    <input type="checkbox" checked={checkedItemIds.includes(item.id)} onChange={event => setCheckedItemIds(current => event.target.checked ? [...new Set([...current, item.id])] : current.filter(id => id !== item.id))} className="h-4 w-4 rounded accent-emerald-400" />
                                                    <span>{item.quantity} × {item.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeMission.status === 'Out for Delivery' && (
                                    <div className="mt-6 space-y-4 rounded-xl border border-amber-300/25 bg-amber-300/5 p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-bold">Customer handover</p>
                                                <p className="mt-1 text-xs text-white/50">Notify the customer, verify their one-time code, then record payment.</p>
                                            </div>
                                            <Button type="button" onClick={() => void notifyCustomerArriving(activeMission.id)} disabled={arrivalBusy} variant="outline" className="h-10 border-white/15 bg-white/5 text-xs font-bold text-white hover:bg-white/10">
                                                {arrivalBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />} I&apos;m outside
                                            </Button>
                                        </div>
                                        {arrivalMessage && <p role="status" className="text-xs text-white/65">{arrivalMessage}</p>}
                                        {handoverMessage && <p role="status" className="text-xs text-white/65">{handoverMessage}</p>}
                                        {!activeMission.rider_handover_verified_at ? (
                                            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                                                <Input value={handoverCode} onChange={event => setHandoverCode(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" maxLength={4} placeholder="Customer’s 4-digit code" aria-label="Customer's four-digit handover code" className="h-12 border-white/10 bg-black/30 text-center text-lg font-black tracking-[0.4em] text-white placeholder:text-white/25" />
                                                <Button type="button" onClick={() => void verifyHandoverCode(activeMission.id)} disabled={handoverBusy || !/^\d{4}$/.test(handoverCode)} variant="outline" className="h-12 border-white/15 bg-white/5 text-xs font-black uppercase tracking-wide text-white">
                                                    {handoverBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Confirm code
                                                </Button>
                                            </div>
                                        ) : (
                                            <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs font-bold text-emerald-200">One-time customer code verified.</p>
                                        )}
                                        {activeMission.rider_handover_verified_at && (
                                            <>
                                                <label className="flex items-start gap-3 text-sm text-white/85">
                                                    <input type="checkbox" checked={customerIdVerified} onChange={event => setCustomerIdVerified(event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-300" />
                                                    I checked the customer&apos;s valid photo ID in person.
                                                </label>
                                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <p className="text-xs font-black uppercase tracking-wider text-white/80">Payment</p>
                                                        <p className="text-sm font-black" style={{ color: accentColor }}>{formatKsh(activeMission.total_price)}</p>
                                                    </div>
                                                    <p role="status" className={`mt-2 text-xs ${paymentStatus === 'paid' ? 'text-emerald-200' : 'text-white/55'}`}>
                                                        {paymentStatus === 'paid'
                                                            ? `Paid${paymentMethod ? ` · ${paymentMethod}` : ''}`
                                                            : paymentStatus === 'pending'
                                                                ? 'Waiting for verified payment confirmation…'
                                                                : isCashOrder(activeMission.payment_method)
                                                                    ? 'Choose how the customer will pay at the door.'
                                                                    : 'Waiting for confirmation of the online checkout.'}
                                                    </p>
                                                    {paymentMessage && <p className="mt-2 text-xs text-white/55">{paymentMessage}</p>}
                                                    {paymentStatus === 'unpaid' && isCashOrder(activeMission.payment_method) && (
                                                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                                            <Button type="button" onClick={() => void collectDeliveryPayment(activeMission.id, 'mpesa')} disabled={!customerIdVerified || paymentBusy} className="h-11 rounded-lg text-[10px] font-black uppercase" style={{ backgroundColor: accentColor, color: '#08100c' }}>
                                                                {paymentBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Zap className="mr-1 h-4 w-4" />} M-Pesa prompt
                                                            </Button>
                                                            <Button type="button" onClick={() => void collectDeliveryPayment(activeMission.id, 'qr')} disabled={!customerIdVerified || paymentBusy || !activeMission.customer_email} variant="outline" className="h-11 rounded-lg border-white/15 bg-white/5 text-[10px] font-black uppercase text-white">
                                                                <MessageCircle className="mr-1 h-4 w-4" /> Scan to pay
                                                            </Button>
                                                            <Button type="button" onClick={() => void collectDeliveryPayment(activeMission.id, 'cash')} disabled={!customerIdVerified || paymentBusy} variant="outline" className="h-11 rounded-lg border-white/15 bg-white/5 text-[10px] font-black uppercase text-white">
                                                                <Check className="mr-1 h-4 w-4" /> Cash collected
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {!activeMission.customer_email && isCashOrder(activeMission.payment_method) && paymentStatus === 'unpaid' && (
                                                        <p className="mt-2 text-[10px] text-amber-200/75">Scan-to-pay needs a checkout email. M-Pesa prompt and cash are available.</p>
                                                    )}
                                                    {paymentQr && paymentStatus === 'pending' && paymentMethod === 'qr' && (
                                                        <div className="mt-4 flex flex-col items-center gap-2 rounded-lg bg-white p-3">
                                                            <Image src={paymentQr} alt="Scan to securely pay for this order" width={240} height={240} unoptimized />
                                                            <p className="text-center text-xs font-bold text-slate-900">Customer scans and completes the secure checkout.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {activeMission.status !== 'Out for Delivery' && (
                                    <Button onClick={() => void handleAdvanceMission(activeMission.id)} disabled={loading || (activeMission.status === 'Dispatched' && (!activeMission.rider_pickup_arrived_at || !activeMission.items?.length || activeMission.items.some(item => !checkedItemIds.includes(item.id))))} className="mt-6 h-14 w-full rounded-xl text-sm font-black uppercase tracking-widest" style={{ backgroundColor: accentColor, color: '#08100c' }}>
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                        {activeMission.status === 'Dispatched' ? 'Confirm items & pickup' : 'Start delivery'}
                                    </Button>
                                )}
                                {activeMission.status === 'Out for Delivery' && (
                                    <Button onClick={() => void handleAdvanceMission(activeMission.id)} disabled={loading || !customerIdVerified || !activeMission.rider_handover_verified_at || paymentStatus !== 'paid'} className="mt-4 h-14 w-full rounded-xl text-sm font-black uppercase tracking-widest" style={{ backgroundColor: accentColor, color: '#08100c' }}>
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Complete secure handover
                                    </Button>
                                )}
                            </>
                        )}

                        {!activeMission && (
                            <div className="mt-7 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
                                <Search className={`h-5 w-5 ${isOnline ? 'animate-pulse' : ''}`} style={{ color: accentColor }} />
                                <p className="text-sm text-white/60">{isOnline ? 'Standing by for the next dispatch offer.' : 'Go online when you are ready to receive offers.'}</p>
                            </div>
                        )}

                        {(authError || issueMessage) && (
                            <p role="alert" className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{authError || issueMessage}</p>
                        )}
                        {pushMessage && <p role="status" className="mt-3 text-xs text-white/50">{pushMessage}</p>}
                    </section>

                    {isAssignedMission && activeMission && (
                        <details className="rounded-2xl border border-white/10 bg-[#101614] p-4">
                            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/70">
                                <AlertTriangle className="h-4 w-4 text-amber-300" /> Report a delivery issue
                            </summary>
                            <div className="mt-4 space-y-3">
                                <select value={issueType} onChange={event => setIssueType(event.target.value)} className="h-11 w-full rounded-lg border border-white/10 bg-[#080c0b] px-3 text-sm text-white">
                                    <option value="">Choose an issue</option>
                                    <option value="merchant_unavailable">Merchant unavailable</option>
                                    <option value="item_unavailable">Item missing or unavailable</option>
                                    <option value="customer_unavailable">Customer unavailable</option>
                                    <option value="no_valid_id">No valid ID / age verification failed</option>
                                    <option value="underage_customer">Customer may be underage</option>
                                    <option value="intoxicated_customer">Customer appears intoxicated</option>
                                    <option value="customer_refused">Customer refused handover</option>
                                    <option value="other">Other delivery issue</option>
                                </select>
                                <Input value={issueDetails} onChange={event => setIssueDetails(event.target.value)} maxLength={500} placeholder="Optional details for dispatch" className="border-white/10 bg-black/20 text-white placeholder:text-white/30" />
                                <Button type="button" onClick={() => void reportDeliveryIssue(activeMission.id)} disabled={!issueType || loading} variant="outline" className="w-full border-white/10 bg-white/5 text-xs font-bold text-white hover:bg-white/10">Save issue to delivery record</Button>
                                {issueMessage && <p role="status" className="text-xs text-white/60">{issueMessage}</p>}
                            </div>
                        </details>
                    )}
                </section>

                <aside className="space-y-5">
                    {sessionToken && <MerchantConnectionsPanel sessionToken={sessionToken} accentColor={accentColor} />}
                    <section className="rounded-2xl border border-white/10 bg-[#101614] p-5">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Rider profile</h2>
                            <span className="flex items-center gap-1 text-xs font-bold text-amber-300"><Star className="h-3.5 w-3.5 fill-current" /> {stats.rating}</span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-black/20 p-3"><p className="text-[9px] uppercase tracking-widest text-white/40">Tier</p><p className="mt-1 font-bold">{stats.tier}</p></div>
                            <div className="rounded-xl bg-black/20 p-3"><p className="text-[9px] uppercase tracking-widest text-white/40">Wallet</p><p className="mt-1 font-bold">{formatKsh(wallet.balance)}</p></div>
                        </div>
                        <PerformanceHub tier={stats.tier} rating={stats.rating} acceptance={stats.acceptance} maintenanceStatus={stats.maintenance} />
                        <div className="mt-5 border-t border-white/10 pt-4">
                            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/65"><Palette className="h-4 w-4" /> Terminal color</div>
                            <div className="flex flex-wrap items-center gap-2">
                                {RIDER_ACCENT_PRESETS.map(color => (
                                    <button key={color} type="button" aria-label={`Choose ${color} accent`} aria-pressed={accentColor === color} onClick={() => void saveAccentColor(color)} className={`h-8 w-8 rounded-full border-2 ${accentColor === color ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: color }} />
                                ))}
                                <label aria-label="Choose custom accent color" className="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10">
                                    <Palette className="h-4 w-4 text-white/70" />
                                    <input type="color" value={accentColor} onChange={event => void saveAccentColor(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                                </label>
                            </div>
                            {accentSaveMessage && <p role="status" className="mt-2 text-[11px] text-white/50">{accentSaveMessage}</p>}
                        </div>
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-[#101614] p-5">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/70"><Bell className="h-4 w-4" /> Offer alerts</h2>
                            {pushEnabled && <span className="text-[10px] font-bold uppercase" style={{ color: accentColor }}>Enabled</span>}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-white/45">Push notification, vibration, and foreground alert for new assignments.</p>
                        {pushMessage && <p role="status" className="mt-2 text-[11px] text-white/55">{pushMessage}</p>}
                        {!pushEnabled && <Button type="button" onClick={() => void enableMissionAlerts()} disabled={pushBusy} className="mt-4 h-10 w-full rounded-lg text-xs font-black uppercase" style={{ backgroundColor: accentColor, color: '#08100c' }}>
                            {pushBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />} Enable push alerts
                        </Button>}
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-[#101614] p-5">
                        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/70"><Clock3 className="h-4 w-4" /> Recent missions</h2>
                        <div className="mt-4 space-y-2">
                            {missions.slice(0, 5).map(mission => (
                                <div key={mission.id} className="flex items-center justify-between gap-3 rounded-lg bg-black/20 px-3 py-2.5">
                                    <div className="min-w-0"><p className="truncate text-xs font-bold">Order #{mission.id}</p><p className="truncate text-[10px] text-white/40">{mission.customer_name}</p></div>
                                    <span className="shrink-0 text-[10px] font-bold" style={{ color: mission.status === 'Delivered' ? accentColor : 'rgba(255,255,255,.55)' }}>{mission.status}</span>
                                </div>
                            ))}
                            {missions.length === 0 && <p className="text-xs text-white/40">Completed and assigned orders will show here.</p>}
                        </div>
                    </section>

                    <EarningsCenter balance={wallet.balance} totalEarned={wallet.total_earned} orders={missions} />
                    <Link href="/rider/onboarding" className="block rounded-xl border border-white/10 px-4 py-3 text-center text-xs font-bold text-white/45 hover:text-white">Rider account and onboarding</Link>
                </aside>
            </div>
            </div>
        </main>
    );
}

export default function RiderDashboard() {
    return (
        <Suspense fallback={<div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4"><Loader2 className="h-10 w-10 text-primary animate-spin" /><p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Establishing Secure Uplink...</p></div>}>
            <RiderDashboardContent />
        </Suspense>
    );
}
