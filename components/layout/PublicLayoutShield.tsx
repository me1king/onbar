'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect, Suspense, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSettings, type StoreSettings } from '@/lib/useSettings';
import { Loader2 } from 'lucide-react';
import CustomerAnnouncementHost from './CustomerAnnouncementHost';
import LocationOnboarding from './LocationOnboarding';

// Lazy Load Non-Critical Components
const LiveTicker = dynamic(() => import('./LiveTicker'), { ssr: false });
const AbandonedCartBar = dynamic(() => import('./AbandonedCartBar'), { ssr: false });
const SupportBubble = dynamic(() => import('./SupportBubble'), { ssr: false });
const ExitIntentPopup = dynamic(() => import('./ExitIntentPopup'), { ssr: false });
const SignInTrigger = dynamic(() => import('./SignInTrigger'), { ssr: false });
const CompareBar = dynamic(() => import('../product/CompareBar'), { ssr: false });
const AIConcierge = dynamic(() => import('../home/AIConcierge'), { ssr: false });
const ThemeSynchronizer = dynamic(() => import('./ThemeSynchronizer'), { ssr: false });
const AgeVerification = dynamic(() => import('./AgeVerification'), { ssr: false });
const LevelUpCelebration = dynamic(() => import('../engagement/LevelUpCelebration'), { ssr: false });
const CookieConsentBanner = dynamic(() => import('./CookieConsentBanner'), { ssr: false });

function ReferralTracker() {
    const searchParams = useSearchParams();

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const ref = searchParams?.get('ref');
        if (ref && supabase) {
            sessionStorage.setItem('ob_referral_code', ref);
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 30);
            document.cookie = `ob_referral_code=${ref}; path=/; expires=${expiry.toUTCString()}; SameSite=Lax`;

            const tracked = sessionStorage.getItem(`tracked_${ref}`);
            if (!tracked) {
                (async () => {
                    try {
                        await supabase.rpc('increment_referral_clicks', { code_input: ref });
                        sessionStorage.setItem(`tracked_${ref}`, 'true');
                    } catch { /* Ignore RPC errors in tracking */ }
                })();
            }
        }
    }, [searchParams]);

    return null;
}

export default function PublicLayoutShield({ children, initialSettings }: { children: React.ReactNode, initialSettings?: StoreSettings }) {
    return (
        <ShieldContent initialSettings={initialSettings}>
            <Suspense fallback={null}>
                <ReferralTracker />
            </Suspense>
            {children}
        </ShieldContent>
    );
}

function ShieldContent({ children, initialSettings }: { children: React.ReactNode, initialSettings?: StoreSettings }) {
    const pathname = usePathname();
    const { settings: hookSettings } = useSettings();
    const settings = initialSettings || hookSettings;
    const [mounted, setMounted] = useState(false);
    const [newsletterVisible, setNewsletterVisible] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        const cachedPrimary = window.sessionStorage.getItem('onlinebar_theme_primary');
        const configuredPrimary = cachedPrimary || settings.theme_config.primary;
        const primary = /^#[\da-f]{6}$/i.test(configuredPrimary)
            ? configuredPrimary
            : '#D91C1C';
        document.documentElement.style.setProperty('--primary', primary);
        document.documentElement.style.setProperty('--ring', primary);
        if (cachedPrimary) window.sessionStorage.removeItem('onlinebar_theme_primary');
    }, [mounted, pathname, settings.theme_config.primary]);

    useEffect(() => {
        if (!mounted) return;
        const newsletter = document.getElementById('footer-newsletter');
        if (!newsletter || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(
            ([entry]) => setNewsletterVisible(entry.isIntersecting),
            { threshold: 0.05 }
        );
        observer.observe(newsletter);
        return () => observer.disconnect();
    }, [mounted, pathname]);

    // 0. Dynamic Favicon
    useEffect(() => {
        if (mounted && typeof document !== 'undefined' && settings?.branding?.favicon_url) {
            const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = settings.branding.favicon_url;
            if (!link.parentNode) {
                document.getElementsByTagName('head')[0].appendChild(link);
            }
        }
    }, [settings, mounted]);

    // 2. Live Visitor Heartbeat & Demand Prediction
    useEffect(() => {
        if (!mounted || !supabase || pathname?.startsWith('/admin')) return;

        let sessionId = localStorage.getItem('ob_session_id');
        if (!sessionId) {
            sessionId = `session_${Math.random().toString(36).substring(2, 15)}`;
            localStorage.setItem('ob_session_id', sessionId);
        }

        const sendHeartbeat = async () => {
            if (!supabase) return;

            const { data: { session } } = await supabase.auth.getSession();
            const cartData = localStorage.getItem('cart');
            let cartValue = 0;
            if (cartData) {
                try {
                    const parsed = JSON.parse(cartData);
                    cartValue = parsed.reduce((sum: number, item: { price: number; quantity: number }) => sum + (item.price * item.quantity), 0);
                } catch { }
            }

            await supabase.from('active_visitors').upsert({
                session_id: sessionId,
                customer_name: session?.user?.email?.split('@')[0] || null,
                current_page: pathname,
                last_active_at: new Date().toISOString(),
                cart_value: cartValue,
                latitude: null,
                longitude: null,
                status: pathname === '/checkout' ? 'Checkout' : cartValue > 0 ? 'Browsing' : 'Idle'
            }, { onConflict: 'session_id' });
        };

        sendHeartbeat();
        // Consolidated into AnalyticsTracker for performance
        // const interval = setInterval(sendHeartbeat, 60000);
        // return () => clearInterval(interval);
    }, [pathname, mounted]);

    const isAdmin = pathname?.startsWith('/admin');
    const suppressFloatingLaunchers = newsletterVisible || pathname?.startsWith('/profile') === true;

    if (isAdmin) {
        return <main className="flex-grow">{children}</main>;
    }

    if (!mounted) {
        return (
            <main className="flex-grow min-h-[100dvh] bg-white flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
                <div className="space-y-4">
                    <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto opacity-20" />
                    <p className="text-[8px] font-black uppercase text-slate-300 tracking-[0.4em]">Node Protocol Secure</p>
                </div>
            </main>
        );
    }

    return (
        <>
            <CustomerAnnouncementHost />
            <LocationOnboarding suppressLauncher={suppressFloatingLaunchers} />
            <CookieConsentBanner />
            <LevelUpCelebration />
            <AgeVerification />
            <ThemeSynchronizer />
            <LiveTicker />
            <AbandonedCartBar />
            <Suspense fallback={<div className="h-20 bg-white border-b border-slate-50" />}>
                <Header initialSettings={settings} />
            </Suspense>
            <main className="flex-grow">{children}</main>
            <Footer initialSettings={settings} />
            <ExitIntentPopup />
            <CompareBar />
            <SupportBubble suppressLauncher={suppressFloatingLaunchers} />
            <AIConcierge suppressLauncher={suppressFloatingLaunchers} />
            <SignInTrigger />
        </>
    );
}
