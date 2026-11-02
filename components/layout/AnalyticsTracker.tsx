'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { OB_OS, OSEventType } from '@/lib/onlineBarOS';
import { supabase } from '@/lib/supabaseClient';
import { v4 as uuidv4 } from 'uuid';
import { isAllowed } from '@/lib/consentService';

const PRIVATE_ANALYTICS_PATHS = ['/admin', '/lord', '/merchant', '/profile', '/track', '/payment', '/rider', '/supplier', '/api', '/checkout'];

function isTrackablePath(pathname: string | null) {
    return Boolean(pathname) && !PRIVATE_ANALYTICS_PATHS.some(path =>
        pathname === path || pathname?.startsWith(`${path}/`)
    );
}

function safeSearchTerm(value: string | null) {
    const term = value?.trim().slice(0, 100) || '';
    if (!term || /[^\s@]+@[^\s@]+\.[^\s@]{2,}/i.test(term) || /(?:\+?254|0)(?:[\s()-]*\d){9}/.test(term)) return '';
    return term;
}

export default function AnalyticsTracker() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const startTimeRef = useRef<number>(0);
    const scrollMilestonesRef = useRef<Set<number>>(new Set());
    const activeTimeRef = useRef<number>(0);
    const lastInteractionRef = useRef<number>(0);
    const clickHistoryRef = useRef<{ t: number, x: number, y: number }[]>([]);

    useEffect(() => {
        startTimeRef.current = Date.now();
        lastInteractionRef.current = Date.now();
    }, []);

    // 0. Emergency Auth Sync Node
    useEffect(() => {
        if (!supabase) return;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session && isAllowed('analytics') && isTrackablePath(pathname)) {
                const activeSessId = OB_OS.getSessionId();
                const anonId = localStorage.getItem('ob_anonymous_id');

                // 1. Link Session Immediately
                if (activeSessId && supabase) {
                    await supabase.from('customer_sessions').update({
                        user_id: session.user.id,
                        updated_at: new Date().toISOString()
                    }).eq('id', activeSessId);
                }

                // 2. Identity Stitching
                if (anonId) {
                    await OB_OS.stitchIdentity(anonId, session.user.id);
                }

                // 3. Track Event
                OB_OS.track('USER_LOGIN', { userId: session.user.id });
            }
        });

        return () => subscription.unsubscribe();
    }, [pathname]);

    // 1. High-Fidelity Behavioral Orchestration
    useEffect(() => {
        const start = Date.now();
        startTimeRef.current = start;
        scrollMilestonesRef.current = new Set();
        activeTimeRef.current = 0;
        lastInteractionRef.current = Date.now();

        // ⚡ [PERFORMANCE_NODE] Non-blocking initial track
        const handleTracking = async () => {
            try {
                await trackPage();
            } catch (err: unknown) {
                console.warn("[Analytics] Deferred sequence failed", err);
            }
        };

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            (window as Window & { requestIdleCallback: (callback: () => void) => void }).requestIdleCallback(() => {
                handleTracking().catch(err => console.warn("[Analytics] Deferred sequence failed", err));
            });
        } else {
            setTimeout(() => {
                handleTracking().catch(err => console.warn("[Analytics] Deferred sequence failed", err));
            }, 1000);
        }

        async function trackPage() {
            if (!supabase || !isAllowed('analytics') || !isTrackablePath(pathname)) return;

            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!isAllowed('analytics') || !isTrackablePath(pathname)) return;

                // 🛡️ [IDENTITY_NODE] Instant Identity Generation
                let anonId = null;
                if (typeof window !== 'undefined') {
                    try {
                        anonId = localStorage.getItem('ob_anonymous_id');
                        if (!anonId) {
                            anonId = `anon-${uuidv4().substring(0, 8)}`;
                            localStorage.setItem('ob_anonymous_id', anonId);
                        }
                    } catch { /* Silent */ }
                }

                const activeSessId = OB_OS.getSessionId();

                // 🚀 [WIDGET_INTEL] Capture Mobile Widget Attribution
                const docReferrer = typeof document !== 'undefined' ? document.referrer : '';
                const source = searchParams?.get('utm_source') ||
                               (docReferrer.includes('instagram.com') ? 'Instagram' :
                                docReferrer.includes('google.com') ? 'Google' : 'Direct');

                const campaign = searchParams?.get('utm_campaign') || 'Direct';
                const utmId = searchParams?.get('utm_id') || undefined;
                const utmContent = searchParams?.get('utm_content') || undefined;

                if (typeof sessionStorage !== 'undefined') {
                    try {
                        sessionStorage.setItem('ob_attribution_source', source);
                        sessionStorage.setItem('ob_attribution_campaign', campaign);
                        if (utmId) sessionStorage.setItem('ob_attribution_id', utmId);
                        if (utmContent) sessionStorage.setItem('ob_content_variant', utmContent);
                        if (source === 'mobile_widget') sessionStorage.setItem('ob_widget_engagement', 'true');
                    } catch { /* Ignore quota errors */ }
                }

                const commonProps = {
                    userId: session?.user?.id,
                    anonymousId: anonId || undefined,
                    sessionId: activeSessId || undefined
                };

                // 0. Ensure Session Record Exists (Internal Sync)
                if (activeSessId) {
                    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
                    const screenRes = typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '0x0';
                    const lang = typeof navigator !== 'undefined' ? navigator.language : 'en';

                    await supabase.from('customer_sessions').upsert({
                        id: activeSessId,
                        user_id: session?.user?.id,
                        anonymous_id: anonId,
                        entry_page: pathname,
                        current_page: pathname,
                        analytics_consent: true,
                        analytics_consent_updated_at: new Date().toISOString(),
                        source_channel: source,
                        campaign_id: campaign,
                        attribution_id: utmId,
                        content_variant: utmContent,
                        device_info: {
                            ua: ua,
                            res: screenRes,
                            lang: lang
                        }
                    }, { onConflict: 'id' });

                    if (!isAllowed('analytics') || !isTrackablePath(pathname)) {
                        const { error } = await supabase.from('customer_sessions')
                            .update({
                                analytics_consent: false,
                                analytics_consent_updated_at: new Date().toISOString()
                            })
                            .eq('id', activeSessId);
                        if (error) console.warn('[Analytics] Could not apply revoked consent to the session:', error.message);
                        return;
                    }
                }

                // 1. Basic Page View
                await OB_OS.track('PAGE_VIEW', {
                    ...commonProps,
                    details: {
                        url: pathname,
                        title: typeof document !== 'undefined' ? document.title : ''
                    }
                });

                // Standardized Discovery Events
                if (pathname?.startsWith('/shop/category/')) {
                    const category = pathname.split('/').pop();
                    await OB_OS.track('CATEGORY_VIEW', { ...commonProps, details: { category } });
                } else if (pathname?.startsWith('/shop/') && pathname.split('/').length === 3) {
                    const productId = pathname.split('/').pop();
                    if (productId && !isNaN(Number(productId))) {
                        await OB_OS.track('PRODUCT_VIEW', { ...commonProps, productId: Number(productId) });
                    }
                }

                const query = safeSearchTerm(searchParams?.get('q') || null);
                if (query) {
                    await OB_OS.track('SEARCH', {
                        ...commonProps,
                        details: { query, analytics_consent: true }
                    });
                }
            } catch (err: unknown) {
                console.warn("[Analytics] Tracking sequence interrupted:", err);
            }
        }

        const handleConsentUpdate = () => {
            if (!isAllowed('analytics') || !isTrackablePath(pathname)) return;
            startTimeRef.current = Date.now();
            scrollMilestonesRef.current = new Set();
            activeTimeRef.current = 0;
            lastInteractionRef.current = Date.now();
            void handleTracking();
        };
        window.addEventListener('ob-consent-updated', handleConsentUpdate);

        return () => {
            window.removeEventListener('ob-consent-updated', handleConsentUpdate);
            const dwellTime = Date.now() - startTimeRef.current;
            if (isAllowed('analytics') && dwellTime > 1000) {
                OB_OS.track('TIME_ON_PAGE', {
                    details: {
                        url: pathname,
                        dwell_time_ms: dwellTime,
                        active_time_ms: activeTimeRef.current,
                        max_scroll: Math.max(0, ...Array.from(scrollMilestonesRef.current))
                    }
                });
            }
        };
    }, [pathname, searchParams]);

    // 2. Click Intelligence & Friction Radar
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleClick = (e: MouseEvent) => {
            if (!isAllowed('analytics') || !isTrackablePath(pathname)) return;
            const target = e.target as HTMLElement;
            const now = Date.now();

            // 🛡️ [INTERACTION_HANDSHAKE] Capture Analytics IDs
            const interactive = target.closest('button, a, input, select, [role="button"], [data-analytics-id]');
            const elementId = target.getAttribute('data-analytics-id') || target.id || target.getAttribute('data-behavior-id');
            const elementText = target.innerText?.substring(0, 30).trim();

            if (interactive) {
                const layoutWidth = window.innerWidth;
                const pageHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight);
                const pageY = window.scrollY + e.clientY;
                let coordinateSpace: 'page' | 'fixed' | 'sticky' = 'page';
                let ancestor: Element | null = interactive;
                while (ancestor && ancestor !== document.body) {
                    const position = window.getComputedStyle(ancestor).position;
                    if (position === 'fixed' || position === 'sticky') {
                        coordinateSpace = position;
                        break;
                    }
                    ancestor = ancestor.parentElement;
                }
                const coordinateY = coordinateSpace === 'page' ? pageY : e.clientY;
                const coordinateHeight = coordinateSpace === 'page' ? pageHeight : window.innerHeight;
                OB_OS.trackHeatmapClick({
                    type: target.tagName,
                    analyticsId: elementId,
                    text: elementText,
                    x: e.clientX,
                    y: e.clientY,
                    page_x: window.scrollX + e.clientX,
                    page_y: pageY,
                    x_percent: Math.max(0, Math.min(100, (e.clientX / layoutWidth) * 100)),
                    y_percent: Math.max(0, Math.min(100, (coordinateY / coordinateHeight) * 100)),
                    viewport_width: layoutWidth,
                    viewport_inner_width: window.innerWidth,
                    viewport_height: window.innerHeight,
                    page_height: pageHeight,
                    scroll_x: window.scrollX,
                    scroll_y: window.scrollY,
                    coordinate_space: coordinateSpace
                });

                // Commerce events are tracked by the cart action itself to avoid click-level duplicates.
                if (elementId?.includes('checkout')) OB_OS.track('CHECKOUT_START');
            } else {
                OB_OS.track('DEAD_CLICK', { details: { x: e.clientX, y: e.clientY } });
            }

            // 3. Rage Click Detection (3 clicks within 1s on same spot)
            const recentClicks = clickHistoryRef.current.filter(c => now - c.t < 1000);
            const isNear = (c: { x: number, y: number }) => Math.abs(c.x - e.clientX) < 10 && Math.abs(c.y - e.clientY) < 10;

            if (recentClicks.length >= 2 && recentClicks.every(isNear)) {
                OB_OS.track('RAGE_CLICK', {
                    details: {
                        element_id: elementId,
                        element_text: elementText,
                        click_count: recentClicks.length + 1
                    }
                });
            }

            clickHistoryRef.current.push({ t: now, x: e.clientX, y: e.clientY });
            if (clickHistoryRef.current.length > 20) clickHistoryRef.current.shift();
        };

        const handleFocus = (e: FocusEvent) => {
            if (!isAllowed('analytics') || !isTrackablePath(pathname)) return;
            const target = e.target as HTMLElement;
            const behaviorId = target.getAttribute('data-behavior-id');
            if (behaviorId && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
                OB_OS.track('FORM_FIELD_FOCUSED', { details: { id: behaviorId } });
            }
        };

        window.addEventListener('click', handleClick);
        window.addEventListener('focusin', handleFocus);
        return () => {
            window.removeEventListener('click', handleClick);
            window.removeEventListener('focusin', handleFocus);
        };
    }, [pathname]);

    // 3. Active Engagement Timer
    useEffect(() => {
        let lastLoggedTime = Date.now();

        const updateActiveTime = () => {
            if (document.visibilityState === 'visible') {
                const now = Date.now();
                const diff = now - lastInteractionRef.current;
                // If last interaction was within 30s, count it as active time
                if (diff < 30000) {
                    activeTimeRef.current += (now - lastLoggedTime);
                }
                lastLoggedTime = now;
            }
        };

        const interval = setInterval(updateActiveTime, 10000); // Reduce frequency to 10s
        const handleInteraction = () => { lastInteractionRef.current = Date.now(); };

        window.addEventListener('mousemove', handleInteraction);
        window.addEventListener('keydown', handleInteraction);
        window.addEventListener('scroll', handleInteraction);
        window.addEventListener('click', handleInteraction);

        return () => {
            clearInterval(interval);
            window.removeEventListener('mousemove', handleInteraction);
            window.removeEventListener('keydown', handleInteraction);
            window.removeEventListener('scroll', handleInteraction);
            window.removeEventListener('click', handleInteraction);
        };
    }, []);

    // 3. Scroll Depth Logic
    useEffect(() => {
        if (typeof window === 'undefined') return;

        let ticking = false;

        const handleScroll = () => {
            if (!isAllowed('analytics')) return;
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const h = document.documentElement,
                          b = document.body,
                          st = 'scrollTop',
                          sh = 'scrollHeight';
                    const percent = Math.round((h[st]||b[st]) / ((h[sh]||b[sh]) - h.clientHeight) * 100);

                    [25, 50, 75, 90].forEach(milestone => {
                        if (percent >= milestone && !scrollMilestonesRef.current.has(milestone)) {
                            scrollMilestonesRef.current.add(milestone);
                            const eventName = `SCROLL_${milestone}` as OSEventType;
                            OB_OS.track(eventName, {
                                details: { path: pathname }
                            });
                        }
                    });
                    ticking = false;
                });
                ticking = true;
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [pathname]);

    // 4. Section Visibility (Heatmap) Logic
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (!isAllowed('analytics')) return;
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const sectionId = entry.target.id || entry.target.getAttribute('data-section');
                        if (sectionId) {
                            OB_OS.track('SECTION_VISIBLE', {
                                details: { section_id: sectionId, path: pathname }
                            });
                        }
                    }
                });
            },
            { threshold: 0.5 }
        );

        const sections = document.querySelectorAll('section[id], [data-section]');
        sections.forEach(s => observer.observe(s));

        return () => observer.disconnect();
    }, [pathname]);

    return null;
}
