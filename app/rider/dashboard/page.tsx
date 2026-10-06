'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { supabase } from '@/lib/supabaseClient';
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
    Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import EarningsCenter from '@/components/rider/EarningsCenter';
import PerformanceHub from '@/components/rider/PerformanceHub';
import { authenticateBiometrics } from '@/lib/biometricService';

const GoogleMap = dynamic(() => import('@/components/admin/dispatch/LiveDispatchMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-slate-50 flex items-center justify-center animate-pulse rounded-[3rem] border border-slate-100"><Loader2 className="h-10 w-10 text-primary animate-spin" /></div>
});

interface Mission {
    id: number;
    customer_name: string;
    customer_phone: string;
    status: string;
    total_price: number;
    payment_method: string;
    note: string;
    created_at: string;
    latitude?: number;
    longitude?: number;
}

function RiderDashboardContent() {
    const searchParams = useSearchParams();
    const phoneParam = searchParams?.get('phone');

    const [phone, setPhone] = useState('');
    const [pin, setPin] = useState('');
    const [sessionToken, setSessionToken] = useState('');
    const [gpsMessage, setGpsMessage] = useState<string | null>(null);
    const [isIdentified, setIsIdentified] = useState(false);
    const [loading, setLoading] = useState(false);
    const [missions, setMissions] = useState<Mission[]>([]);
    const [authError, setAuthError] = useState<string | null>(null);

    // Online Bar Pro States
    const [isOnline, setIsOnline] = useState(false);
    const [rider, setRider] = useState<Record<string, unknown> | null>(null);
    const [wallet, setWallet] = useState({ balance: 0, total_earned: 0 });
    const [stats, setStats] = useState({ tier: 'Bronze', rating: 5.0, acceptance: 100, maintenance: 'Healthy' });
    const [activeMission, setActiveMission] = useState<Mission | null>(null);

    const verifyAndFetch = useCallback(async (riderPhone: string, riderPin: string, savedToken?: string) => {
        if (!supabase) return;
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
                rider?: { id: number; name: string; phone: string; status: string; verificationStatus: string };
                error?: string;
            };
            if (!sessionResponse.ok || !sessionData.rider) {
                throw new Error(sessionData.error || 'Rider sign-in failed.');
            }
            const activeToken = savedToken || sessionData.token;
            if (!activeToken) throw new Error('The server did not issue a rider session.');
            const canonicalPhone = sessionData.rider.phone;

            const { data: riderData, error: authErr } = await supabase
                .from('rider_status')
                .select('id, rider_name, rider_phone, status, verification_status, current_tier, rating, acceptance_rate, battery_level')
                .eq('rider_phone', canonicalPhone)
                .maybeSingle();

            if (authErr || !riderData) {
                throw new Error(authErr?.message || 'Rider profile could not be loaded.');
            }

            // Fetch Real Stats & Wallet
            setStats({
                tier: riderData.current_tier || 'Bronze',
                rating: riderData.rating || 5.0,
                acceptance: riderData.acceptance_rate || 100,
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
            const dispatched = currentMissions.find(m => ['Dispatched', 'Picked Up', 'Out for Delivery'].includes(m.status));
            if (dispatched) setActiveMission(dispatched);

            localStorage.setItem('ob_rider_phone', canonicalPhone);
            localStorage.setItem('ob_rider_token', activeToken);
            localStorage.removeItem('ob_rider_pin');
            setPhone(canonicalPhone);
            setSessionToken(activeToken);
            setRider(riderData);
            setMissions(currentMissions);
            setIsIdentified(true);
            setIsOnline(riderData.status === 'Idle' || riderData.status === 'Delivering');
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : 'Rider sign-in failed.');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleAdvanceMission = useCallback(async (orderId: number) => {
        if (!sessionToken) return;
        setLoading(true);
        try {
            const response = await fetch('/api/rider/delivery-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
                body: JSON.stringify({
                    orderId,
                    nextStatus: activeMission?.id === orderId
                        ? activeMission.status === 'Dispatched'
                            ? 'Picked Up'
                            : activeMission.status === 'Picked Up'
                                ? 'Out for Delivery'
                                : 'Delivered'
                        : undefined
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
                alert(result.warning || 'Mission accomplished. The order and rider commission are saved.');
            } else {
                setActiveMission(prev => prev?.id === orderId ? { ...prev, status: result.status! } : prev);
            }
            if (result.warning) setAuthError(result.warning);
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : 'Delivery status could not be updated.');
        } finally {
            setLoading(false);
        }
    }, [activeMission, sessionToken]);

    useEffect(() => {
        const savedPhone = localStorage.getItem('ob_rider_phone');
        const savedToken = localStorage.getItem('ob_rider_token');
        if (savedPhone && savedToken) {
            setPhone(savedPhone);
            setSessionToken(savedToken);
            verifyAndFetch(savedPhone, '', savedToken);
        } else if (phoneParam) {
            setPhone(phoneParam);
        }
    }, [phoneParam, verifyAndFetch]);

    useEffect(() => {
        if (!isOnline || !sessionToken) return;
        if (!navigator.geolocation) {
            setGpsMessage('This device does not support GPS; pickup distance will be unavailable.');
            return;
        }

        let lastSentAt = 0;
        let active = true;
        const watchId = navigator.geolocation.watchPosition(async position => {
            if (!active || Date.now() - lastSentAt < 30_000) return;
            lastSentAt = Date.now();
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
    }, [isOnline, sessionToken]);

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

    return (
        <div className="min-h-screen bg-slate-50 text-left selection:bg-primary/20 flex flex-col">
            <div className="h-[55dvh] relative">
                <GoogleMap riders={rider ? [{
                    id: (rider as { id: string }).id || 'anon',
                    rider_name: (rider as { rider_name: string }).rider_name || 'Runner',
                    status: (rider as { status: string }).status || 'Idle',
                    battery_level: (rider as { battery_level: number }).battery_level || 100
                }] : []} />

                <div className="absolute top-6 left-6 right-6 z-[1000] flex justify-between items-start">
                    <Card className="p-4 rounded-3xl bg-white/90 backdrop-blur shadow-2xl border border-slate-100 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center text-white font-black text-sm shadow-xl">
                            {phone.slice(-2)}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <Star className="h-3 w-3 text-amber-500 fill-current" />
                                <span className="text-xs font-black text-foreground">{stats.rating}</span>
                            </div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{stats.tier} Operator</p>
                        </div>
                    </Card>

                    <button onClick={handleLogout} className="h-14 w-14 rounded-2xl bg-white/90 backdrop-blur shadow-2xl flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all active:scale-95 border border-slate-100">
                        <LogOut className="h-6 w-6" />
                    </button>
                </div>

                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000]">
                    <Button
                        onClick={handleToggleOnline}
                        className={cn(
                            "h-20 px-12 rounded-full font-black uppercase tracking-[0.3em] text-xs shadow-[0_0_50px_rgba(245,160,0,0.2)] transition-all active:scale-90",
                            isOnline ? "bg-white text-rose-500 border-4 border-rose-50" : "bg-primary text-white border-4 border-white animate-pulse"
                        )}
                    >
                        {isOnline ? "Go Offline" : "Go Online"}
                    </Button>
                    {isOnline && (
                        <p className="mt-3 max-w-[18rem] rounded-xl bg-white/95 px-3 py-2 text-center text-xs font-semibold text-slate-700 shadow" role="status">
                            {gpsMessage || 'Waiting for a fresh GPS fix to rank pickup distance…'}
                        </p>
                    )}
                </div>
            </div>

            <div className="flex-1 bg-white rounded-t-[3.5rem] -mt-10 relative z-[1001] shadow-[0_-20px_50px_rgba(0,0,0,0.3)] p-8 sm:p-12 overflow-y-auto no-scrollbar">
                <div className="w-16 h-1.5 bg-slate-100 rounded-full mx-auto mb-10 cursor-grab active:cursor-grabbing" />

                {activeMission ? (
                    <div className="space-y-10 animate-in slide-in-from-bottom-12 duration-1000 ease-in-out text-left">
                        <div className="flex justify-between items-start">
                            <div className="space-y-2">
                                <p className="text-[10px] font-black text-primary uppercase tracking-[0.5em] flex items-center gap-3">
                                    <span className="relative flex h-3 w-3">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                                    </span>
                                    Tactical Mission
                                </p>
                                <h2 className="text-4xl font-black uppercase tracking-tighter text-foreground leading-[0.9]">Deliver to <br/><span className="text-primary">{activeMission.customer_name}</span></h2>
                            </div>
                            <div className="h-20 w-20 rounded-[2.5rem] bg-slate-50 flex flex-col items-center justify-center text-foreground border-2 border-slate-100 shadow-inner">
                                <p className="text-[8px] font-black uppercase text-slate-400">UNIT</p>
                                <p className="text-2xl font-black tabular-nums">{activeMission.id}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Button
                                onClick={() => window.open(`tel:${activeMission.customer_phone}`, '_self')}
                                className="group h-20 rounded-3xl bg-slate-50 hover:bg-slate-100 text-foreground border border-slate-100 shadow-sm transition-all"
                            >
                                <MessageCircle className="h-5 w-5 mr-2" /> Chat
                            </Button>
                            <Button
                                onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${activeMission.latitude},${activeMission.longitude}`, '_blank')}
                                className="group h-20 rounded-3xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 shadow-sm transition-all"
                            >
                                <Navigation className="h-5 w-5 mr-2" /> Guide
                            </Button>
                        </div>

                        <div className="pt-8 border-t border-slate-50 space-y-6">
                            <Button
                                onClick={() => handleAdvanceMission(activeMission.id)}
                                disabled={loading}
                                className="w-full h-24 rounded-[2.5rem] bg-primary hover:bg-primary/90 text-white font-black uppercase text-sm tracking-[0.5em] shadow-[0_20px_40px_-10px_rgba(255,107,0,0.3)] active:scale-95 transition-all relative overflow-hidden"
                            >
                                {loading ? 'Updating...' : activeMission.status === 'Dispatched'
                                    ? 'Confirm Pickup'
                                    : activeMission.status === 'Picked Up'
                                        ? 'Start Delivery'
                                        : 'Secure Handover'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-16">
                        <div className="text-center space-y-8 py-12 relative overflow-hidden group">
                            <div className="relative z-10 space-y-6">
                                <div className="h-24 w-24 rounded-[2.5rem] bg-slate-50 flex items-center justify-center mx-auto shadow-inner group-hover:scale-105 transition-transform duration-500">
                                    <Search className={cn("h-10 w-10 text-slate-200 transition-all", isOnline && "animate-pulse text-primary")} />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-3xl font-black uppercase tracking-tighter text-foreground leading-none">
                                        {isOnline ? "Scanning Grid" : "Link Terminated"}
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest px-10 leading-relaxed">
                                        {isOnline
                                            ? "High demand detected in Central Hub. Maintain tactical position."
                                            : "Establish secure link to enter the mission queue."
                                        }
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-100 to-transparent" />

                        <PerformanceHub
                            tier={stats.tier}
                            rating={stats.rating}
                            acceptance={stats.acceptance}
                            maintenanceStatus={stats.maintenance}
                        />
                        <EarningsCenter
                            balance={wallet.balance}
                            totalEarned={wallet.total_earned}
                            orders={missions}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

export default function RiderDashboard() {
    return (
        <Suspense fallback={<div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4"><Loader2 className="h-10 w-10 text-primary animate-spin" /><p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Establishing Secure Uplink...</p></div>}>
            <RiderDashboardContent />
        </Suspense>
    );
}
