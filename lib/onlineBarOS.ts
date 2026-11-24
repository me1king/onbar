import { supabase } from './supabaseClient';
import { emitEvent, SystemEventType } from './engines/eventEngine';
import { generateCorrelationId, generateRequestId } from './utils/correlation';
import { v4 as uuidv4 } from 'uuid';
import { isAllowed } from './consentService';
import { isBuiltInAnalyticsEnabled, PROVIDER_UPDATED_EVENT } from './analyticsProvider';

const PRIVATE_ANALYTICS_PATHS = ['/admin', '/lord', '/merchant', '/profile', '/track', '/payment', '/rider', '/supplier', '/api', '/checkout'];
const SESSION_INACTIVITY_MS = 30 * 60 * 1000;

function isAnalyticsPathAllowed() {
    if (typeof window === 'undefined') return false;
    const pathname = window.location.pathname;
    return !PRIVATE_ANALYTICS_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * ONLINE BAR OS: THE MASTER CONTROLLER
 * Unified interface for Identity, Events, Analytics, and Business Logic.
 */

export type OSEventType =
    | SystemEventType
    | 'USER_REGISTERED'
    | 'USER_LOGIN'
    | 'SESSION_START'
    | 'PAGE_VIEW'
    | 'GAME_NIGHT_STARTED'
    | 'GAME_NIGHT_MODE_SELECTED'
    | 'GAME_NIGHT_ROOM_CREATED'
    | 'GAME_NIGHT_ROOM_JOINED'
    | 'GAME_NIGHT_ACTION'
    | 'GAME_NIGHT_ENDED'
    | 'CATEGORY_VIEW'
    | 'PRODUCT_VIEW'
    | 'SEARCH'
    | 'FILTER_USED'
    | 'SORT_USED'
    | 'RECOMMENDATION_VIEWED'
    | 'RECOMMENDATION_CLICKED'
    | 'SCROLL_25'
    | 'SCROLL_50'
    | 'SCROLL_75'
    | 'SCROLL_90'
    | 'SCROLL_100'
    | 'ADD_TO_WISHLIST'
    | 'GALLERY_OPENED'
    | '3D_VIEW_OPENED'
    | '3D_INTERACTION'
    | 'DESCRIPTION_EXPANDED'
    | 'ADD_TO_CART'
    | 'REMOVE_FROM_CART'
    | 'CART_VIEWED'
    | 'CHECKOUT_START'
    | 'PAYMENT_STARTED'
    | 'PURCHASE_COMPLETED'
    | 'REFUND'
    | 'CAMPAIGN_VIEWED'
    | 'CAMPAIGN_CLICKED'
    | 'PROMO_CODE_USED'
    | 'AFFILIATE_CLICK'
    | 'CONSENT_UPDATED'
    | 'EXPERIMENT_REACH'
    | 'EXPERIMENT_CONVERSION'
    | 'ONBOARDING_STARTED'
    | 'ONBOARDING_STEP_COMPLETED'
    | 'ONBOARDING_ABANDONED'
    | 'PREFERENCES_UPDATED'
    | 'UI_INTERACTION'
    | 'SECTION_VISIBLE'
    | 'PAGE_DWELL'
    | 'POINTS_EARNED'
    | 'LEVEL_UP'
    | 'SCROLL_DEPTH'
    | 'SEARCH_SUBMITTED'
    | 'SEARCH_FILTER_APPLIED'
    | 'SEARCH_SORT_CHANGED'
    | 'ZERO_RESULTS'
    | 'HALLOWEEN_SEARCH'
    | 'HALLOWEEN_ZERO_RESULTS'
    | 'HALLOWEEN_FILTER'
    | 'HALLOWEEN_PRODUCT_VIEW'
    | 'HALLOWEEN_ADD_TO_CART'
    | 'HALLOWEEN_TRYON_OPEN'
    | 'HALLOWEEN_FIT_QUIZ_OPEN'
    | 'HALLOWEEN_PHOTO_PREVIEW_OPEN'
    | 'PRODUCT_INTENT'
    | 'PRODUCT_IMAGE_ZOOMED'
    | 'PRODUCT_3D_STARTED'
    | 'PRODUCT_3D_ROTATED'
    | 'TIME_ON_PAGE'
    | 'BUZZ_VIEW'
    | 'BUZZ_OPEN'
    | 'BUZZ_STORY_VIEW'
    | 'BUZZ_STORY_CLICK'
    | 'MAP_SIGNAL_OPEN'
    | 'DIRECTIONS_INIT'
    | 'RSVP_INTERESTED'
    | 'RSVP_GOING'
    | 'HEARTBEAT'
    | 'RAGE_CLICK'
    | 'DEAD_CLICK'
    | 'SCROLL_DEPTH'
    | 'NAV_BACKTRACK'
    | 'MPESA_TIMEOUT'
    | 'PAYMENT_FAIL'
    | 'FORM_STARTED'
    | 'FORM_FIELD_FOCUSED'
    | 'FORM_FIELD_COMPLETED'
    | 'FORM_VALIDATION_FAILED'
    | 'FORM_ABANDONED';

interface OSEventPayload {
    userId?: string;
    anonymousId?: string;
    orderId?: number;
    amount?: number;
    productId?: number;
    campaignId?: string;
    experimentId?: string;
    variantId?: string;
    sessionId?: string;
    dwellTimeSec?: number;
    failureReason?: string;
    details?: Record<string, unknown>;
}

class OnlineBarOS {
    private static instance: OnlineBarOS;
    private correlationId: string | null = null;
    private sessionId: string | null = null;
    private readonly eventQueueStorageKey = 'ob_pending_analytics_events';
    private eventQueue: {
        session_id: string | undefined;
        action_type: OSEventType;
        page_url: string | undefined;
        metadata: Record<string, unknown>;
        timestamp: string;
    }[] = [];
    private isFlushingQueue = false;
    private flushInterval: NodeJS.Timeout | null = null;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private isInitialized: boolean = false;
    private lastInteractionTime: number = Date.now();
    private markSessionInteraction = () => {
        this.lastInteractionTime = Date.now();
    };
    private consecutiveFailures: number = 0;

    private constructor() {}

    public static getInstance(): OnlineBarOS {
        if (!OnlineBarOS.instance) {
            OnlineBarOS.instance = new OnlineBarOS();
        }
        return OnlineBarOS.instance;
    }

    /**
     * Bootstraps the OS on the client side.
     */
    public init() {
        if (typeof window === 'undefined' || this.isInitialized) return;

        try {
            if (isAllowed('analytics') && isBuiltInAnalyticsEnabled()) {
                this.initializeAnalyticsIdentity();
                this.restoreQueuedEvents();
            } else {
                this.eventQueue = [];
                localStorage.removeItem(this.eventQueueStorageKey);
            }

            // High-fidelity Batch Flusher (15s)
            this.flushInterval = setInterval(() => this.flushQueue(), 15000);
            window.addEventListener('pagehide', this.flushQueueOnPageHide);
            window.addEventListener('pointerdown', this.markSessionInteraction, { passive: true });
            window.addEventListener('keydown', this.markSessionInteraction);
            window.addEventListener('scroll', this.markSessionInteraction, { passive: true });
            window.addEventListener('touchstart', this.markSessionInteraction, { passive: true });
            window.addEventListener('ob-consent-updated', this.handleConsentUpdate);
            window.addEventListener(PROVIDER_UPDATED_EVENT, this.handleAnalyticsProviderUpdate);
            document.addEventListener('visibilitychange', this.flushQueueOnHidden);

            // 💓 [HEARTBEAT_NODE] High-fidelity Presence (30s)
            this.heartbeatInterval = setInterval(() => this.pulsePresence(), 30000);

            this.isInitialized = true;
            void this.flushQueue();
            this.track('SESSION_START');
        } catch (e) {
            console.warn("[OB_OS] Boot Failure:", e);
        }
    }

    private async pulsePresence() {
        const pathname = window.location.pathname;
        if (
            !this.sessionId ||
            !supabase ||
            !isAllowed('analytics') ||
            !isBuiltInAnalyticsEnabled() ||
            PRIVATE_ANALYTICS_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
        ) return;

        const now = Date.now();
        const isVisible = document.visibilityState === 'visible';
        const activeMs = isVisible && now - this.lastInteractionTime < 30000 ? 30000 : 0;

        // Use RPC to update presence in one shot
        const { error } = await supabase.rpc('handle_presence_heartbeat', {
            p_session_id: this.sessionId,
            p_page: pathname,
            p_product_id: this.getCurrentProductId(),
            p_active_ms: activeMs,
            p_visible: isVisible,
            p_cart_value: this.getCartValue()
        });
        if (error) console.warn('[OB_OS] Session engagement heartbeat failed:', error.message);

        this.track('HEARTBEAT');
    }

    private getCurrentProductId(): number | null {
        const parts = window.location.pathname.split('/');
        if (parts[1] === 'product' && parts[2]) return parseInt(parts[2]);
        return null;
    }

    private getCartValue(): number {
        try {
            const cartStr = localStorage.getItem('cart');
            if (!cartStr) return 0;
            const cart = JSON.parse(cartStr);
            return cart.reduce((sum: number, item: { price: number, quantity: number }) => sum + (item.price * item.quantity), 0);
        } catch { return 0; }
    }

    private async flushQueue() {
        if (!isAllowed('analytics') || !isBuiltInAnalyticsEnabled()) {
            this.eventQueue = [];
            this.persistQueuedEvents();
            return;
        }
        if (this.eventQueue.length === 0 || !supabase || this.isFlushingQueue) return;

        const batch = [...this.eventQueue];
        this.eventQueue.splice(0, batch.length);
        this.isFlushingQueue = true;
        this.persistQueuedEvents();

        try {
            const { error } = await supabase.rpc('log_event_batch', { p_events: batch });
            if (error) {
                this.consecutiveFailures++;
                this.eventQueue = isAllowed('analytics') && isBuiltInAnalyticsEnabled() ? [...batch, ...this.eventQueue] : [];
                this.persistQueuedEvents();

                if (this.consecutiveFailures >= 5) {
                    console.warn(`[OB_OS] Analytics batch upload is still failing: ${error.message}`);
                    this.consecutiveFailures = 0;
                }
            } else {
                this.consecutiveFailures = 0;
                this.persistQueuedEvents();
            }
        } catch (error) {
            this.eventQueue = isAllowed('analytics') && isBuiltInAnalyticsEnabled() ? [...batch, ...this.eventQueue] : [];
            this.persistQueuedEvents();
            console.warn('[OB_OS] Could not upload queued analytics events:', error);
        } finally {
            this.isFlushingQueue = false;
        }
    }

    private flushQueueOnHidden = () => {
        if (document.visibilityState === 'hidden') void this.flushQueue();
    };

    private flushQueueOnPageHide = () => {
        void this.flushQueue();
    };

    private initializeAnalyticsIdentity() {
        const now = Date.now();
        const storedSessionId = localStorage.getItem('ob_session_active_id');
        const lastActivity = Number(localStorage.getItem('ob_session_last_activity'));
        const isExpired = !Number.isFinite(lastActivity) || lastActivity <= 0 || now - lastActivity > SESSION_INACTIVITY_MS;
        this.sessionId = storedSessionId && !isExpired ? storedSessionId : null;
        if (!this.sessionId) {
            this.sessionId = uuidv4();
            localStorage.setItem('ob_session_active_id', this.sessionId);
        }
        localStorage.setItem('ob_session_last_activity', String(now));

        if (!localStorage.getItem('ob_anonymous_id')) {
            localStorage.setItem('ob_anonymous_id', `anon-${uuidv4().substring(0, 8)}`);
        }
    }

    private touchAnalyticsSession(now: number) {
        const lastActivity = Number(localStorage.getItem('ob_session_last_activity'));
        const isExpired = !this.sessionId ||
            !Number.isFinite(lastActivity) ||
            lastActivity <= 0 ||
            now - lastActivity > SESSION_INACTIVITY_MS;

        if (isExpired) {
            this.sessionId = uuidv4();
            localStorage.setItem('ob_session_active_id', this.sessionId);
            this.correlationId = null;
        }

        localStorage.setItem('ob_session_last_activity', String(now));
        return isExpired;
    }

    private handleConsentUpdate = () => {
        if (!isAllowed('analytics') || !isBuiltInAnalyticsEnabled()) {
            const previousSessionId = this.sessionId;
            if (previousSessionId && supabase) {
                void supabase.from('customer_sessions')
                    .update({
                        analytics_consent: false,
                        analytics_consent_updated_at: new Date().toISOString()
                    })
                    .eq('id', previousSessionId)
                    .then(({ error }) => {
                        if (error) console.warn('[OB_OS] Could not update analytics consent on the session:', error.message);
                    });
            }
            this.eventQueue = [];
            this.persistQueuedEvents();
            this.sessionId = null;
            try {
                localStorage.removeItem('ob_session_active_id');
                localStorage.removeItem('ob_session_last_activity');
                localStorage.removeItem('ob_current_session_attribution');
            } catch (error) {
                console.warn('[OB_OS] Could not clear the analytics session identifier:', error);
            }
            return;
        }
        try {
            this.initializeAnalyticsIdentity();
            this.restoreQueuedEvents();
        } catch (error) {
            console.warn('[OB_OS] Could not initialize consented analytics:', error);
            return;
        }
        this.track('SESSION_START');
        void this.flushQueue();
    };

    private handleAnalyticsProviderUpdate = () => {
        if (!isBuiltInAnalyticsEnabled()) {
            this.eventQueue = [];
            this.persistQueuedEvents();
            this.sessionId = null;
            try {
                localStorage.removeItem('ob_session_active_id');
                localStorage.removeItem('ob_session_last_activity');
                localStorage.removeItem('ob_current_session_attribution');
            } catch (error) {
                console.warn('[OB_OS] Could not clear the analytics session identifier:', error);
            }
            return;
        }
        if (!isAllowed('analytics')) return;
        try {
            this.initializeAnalyticsIdentity();
            this.restoreQueuedEvents();
        } catch (error) {
            console.warn('[OB_OS] Could not initialize app analytics:', error);
            return;
        }
        this.track('SESSION_START');
        void this.flushQueue();
    };

    private restoreQueuedEvents() {
        try {
            const stored = localStorage.getItem(this.eventQueueStorageKey);
            if (!stored) return;
            const parsed: unknown = JSON.parse(stored);
            if (!Array.isArray(parsed)) throw new Error('Stored analytics queue is not an array.');
            this.eventQueue = parsed.filter((event): event is typeof this.eventQueue[number] =>
                typeof event === 'object' &&
                event !== null &&
                typeof event.action_type === 'string' &&
                typeof event.timestamp === 'string' &&
                typeof event.metadata === 'object' &&
                event.metadata !== null
            );
            this.persistQueuedEvents();
        } catch (error) {
            console.warn('[OB_OS] Could not restore pending analytics events:', error);
            localStorage.removeItem(this.eventQueueStorageKey);
        }
    }

    private persistQueuedEvents() {
        try {
            if (this.eventQueue.length === 0) {
                localStorage.removeItem(this.eventQueueStorageKey);
            } else {
                localStorage.setItem(this.eventQueueStorageKey, JSON.stringify(this.eventQueue));
            }
        } catch (error) {
            console.warn('[OB_OS] Could not persist pending analytics events:', error);
        }
    }

    public trackHeatmapClick(details: Record<string, unknown>) {
        if (!isAllowed('analytics') || !isBuiltInAnalyticsEnabled() || !isAnalyticsPathAllowed()) return;
        this.queueBehaviorEvent('UI_INTERACTION', details);
        if (this.eventQueue.length >= 10 && supabase) void this.flushQueue();
    }

    private queueBehaviorEvent(eventType: OSEventType, details: Record<string, unknown>) {
        this.eventQueue.push({
            session_id: this.sessionId || undefined,
            action_type: eventType,
            page_url: typeof window !== 'undefined' ? window.location.pathname : undefined,
            metadata: details,
            timestamp: new Date().toISOString()
        });
        this.persistQueuedEvents();
    }

    public getSessionId(): string | null {
        return this.sessionId;
    }

    public prepareAnalyticsSession(): string | null {
        if (!isAllowed('analytics') || !isBuiltInAnalyticsEnabled()) return null;
        const sessionExpired = this.touchAnalyticsSession(Date.now());
        if (sessionExpired) void this.track('SESSION_START');
        return this.sessionId;
    }

    /**
     * The single entry point for all platform side-effects.
     */
    public async track(eventType: OSEventType, payload: OSEventPayload = {}) {
        if (!supabase) return;
        const isSystemEvent = this.isSystemEvent(eventType);
        const isCheckoutStart = eventType === 'CHECKOUT_START' && typeof window !== 'undefined' && window.location.pathname === '/checkout';
        const shouldRecordAnalytics = isAllowed('analytics') &&
            isBuiltInAnalyticsEnabled() &&
            (isAnalyticsPathAllowed() || isCheckoutStart);
        if (!shouldRecordAnalytics && !isSystemEvent) return;

        try {
            if (shouldRecordAnalytics && eventType !== 'HEARTBEAT' && eventType !== 'SESSION_START') {
                const now = Date.now();
                const sessionExpired = this.touchAnalyticsSession(now);
                this.lastInteractionTime = now;
                if (sessionExpired && eventType !== 'CHECKOUT_START') {
                    void this.track('SESSION_START');
                }
            }
            const corrId = this.correlationId || generateCorrelationId();
            const reqId = generateRequestId();
            const sessId = this.sessionId || undefined;

            // 0. Ensure Session Record Exists (Non-blocking)
            if (sessId && shouldRecordAnalytics) {
                this.ensureSessionRecord(sessId, payload.userId, payload.anonymousId, isCheckoutStart).catch(error => {
                    console.warn('[OB_OS] Could not sync the analytics session:', error);
                });
            }

            // 1. High-Fidelity Batching for Behavioral Noise
            if (['UI_INTERACTION', 'SCROLL_DEPTH', 'RAGE_CLICK', 'DEAD_CLICK', 'SECTION_VISIBLE'].includes(eventType)) {
                this.queueBehaviorEvent(eventType, payload.details || {});
                if (this.eventQueue.length >= 10) this.flushQueue();
                return;
            }

            // 2. Emit System Event (Logic + Automation)
            if (isSystemEvent) {
                await emitEvent(eventType as SystemEventType, payload, { corrId, reqId, sessId });
            }

            if (!shouldRecordAnalytics) return;

            // 2. Log to Behavioral Analytics
            await this.logAnalytics(eventType, { ...payload, sessionId: sessId }, { corrId, reqId });

            // 2.1 Product Intelligence Sync (Pillar 2)
            if (payload.productId) {
                this.syncProductIntel(eventType, payload.productId, payload.amount).catch(() => {});
            }

            // 2.5 Update Taste DNA on Discovery
            if (payload.userId && payload.productId && isAllowed('personalization')) {
                if (eventType === 'PRODUCT_VIEW') {
                    this.evolveTasteDNA(payload.userId, payload.productId, 2).catch(() => {});
                } else if (eventType === 'ADD_TO_CART') {
                    this.evolveTasteDNA(payload.userId, payload.productId, 8).catch(() => {});
                } else if (eventType === 'PURCHASE_COMPLETED') {
                    this.evolveTasteDNA(payload.userId, payload.productId, 25).catch(() => {});
                }
            }

            // 3. Heartbeat/Session Management
            if (eventType === 'HEARTBEAT' && payload.userId) {
                this.refreshSession(payload.userId).catch(() => {});
            }

            // 4. Session Forensics (Non-blocking)
            this.logForensics(eventType, { ...payload, sessionId: sessId }).catch(() => {});

        } catch (err) {
            console.warn(`[OB_OS] Tracking Exception for ${eventType}:`, err);
        }
    }

    private async evolveTasteDNA(userId: string, productId: number, weight: number = 2) {
        if (!supabase) return;
        try {
            // Fetch category
            const { data: prod } = await supabase.from('products').select('category').eq('id', productId).single();
            if (!prod?.category) return;

            const cat = prod.category.toLowerCase();

            // Online Bar OS: Resilient taste weight logic
            const { data: prof, error: fetchErr } = await supabase.from('profiles').select('taste_dna').eq('id', userId).single();

            if (fetchErr) {
                console.warn("[OB_OS] Taste DNA fetch failed (Schema mismatch?):", fetchErr.message);
                return;
            }

            const dna = (prof?.taste_dna as Record<string, number>) || { whiskey: 0, wine: 0, gin: 0, beer: 0, vodka: 0, tequila: 0 };

            if (dna && typeof dna === 'object' && dna[cat] !== undefined) {
                dna[cat] = Math.min(100, (dna[cat] || 0) + weight); // Cap at 100
                await supabase.from('profiles').update({ taste_dna: dna }).eq('id', userId);
            }
        } catch (err) {
            console.warn("[OB_OS] Taste DNA evolution failed (Silent Catch):", err);
        }
    }

    private async syncProductIntel(type: OSEventType, productId: number, amount?: number) {
        if (!supabase) return;

        let metric: string | null = null;
        if (type === 'PRODUCT_VIEW') metric = 'VIEW';
        else if (type === 'ADD_TO_CART') metric = 'CART';
        else if (type === 'CHECKOUT_START') metric = 'CHECKOUT';
        else if (type === 'PURCHASE_COMPLETED') metric = 'SALE';

        if (metric) {
            await supabase.rpc('track_product_interaction', {
                p_id: productId,
                metric_type: metric,
                p_amount: amount || 0
            });
        }
    }

    private async logForensics(type: string, payload: OSEventPayload) {
        if (!supabase || !payload.sessionId) return;

        try {
            await supabase.from('session_forensics').insert([{
                session_id: payload.sessionId,
                action_type: type,
                page_url: typeof window !== 'undefined' ? window.location.pathname : undefined,
                metadata: payload.details || {}
            }]);
        } catch {
            // Silently fail forensics if DB is busy
        }
    }

    private async ensureSessionRecord(sessionId: string, userId?: string, anonymousId?: string, allowCheckoutStart = false) {
        if (
            !supabase ||
            typeof window === 'undefined' ||
            !isAllowed('analytics') ||
            !isBuiltInAnalyticsEnabled() ||
            (!isAnalyticsPathAllowed() && !(allowCheckoutStart && window.location.pathname === '/checkout'))
        ) return;

        // Simple local cache to avoid redundant session inserts per page load
        const key = `ob_sess_sync_${sessionId}`;
        if (sessionStorage.getItem(key)) return;

        try {
            const userAgent = navigator.userAgent;
            const { error } = await supabase.from('customer_sessions').upsert({
                id: sessionId,
                user_id: userId,
                anonymous_id: anonymousId,
                source_channel: document.referrer.includes('google') ? 'Search' : 'Direct',
                entry_page: window.location.pathname,
                current_page: window.location.pathname,
                analytics_consent: true,
                analytics_consent_updated_at: new Date().toISOString(),
                device_info: { ua: userAgent }
            }, { onConflict: 'id', ignoreDuplicates: true });

            if (!error) sessionStorage.setItem(key, 'true');
        } catch (err) {
            console.warn("Session sync failed:", err);
        }
    }

    /**
     * Records or refreshes an active security session for a user.
     */
    public async refreshSession(userId: string) {
        if (!supabase || typeof window === 'undefined') return;

        const userAgent = navigator.userAgent;
        const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);

        try {
            await supabase.from('security_sessions').upsert({
                user_id: userId,
                device_name: isMobile ? 'Mobile Terminal' : 'Desktop Terminal',
                device_type: isMobile ? 'Mobile' : 'Desktop',
                browser: this.getBrowserName(userAgent),
                ip_address: '', // To be captured by server-side middleware
                is_current_session: true,
                last_active_at: new Date().toISOString()
            }, { onConflict: 'user_id, device_name, browser' });
        } catch (err) {
            console.warn("Session refresh failed:", err);
        }
    }

    private getBrowserName(ua: string): string {
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Safari')) return 'Safari';
        if (ua.includes('Edge')) return 'Edge';
        return 'Browser';
    }

    /**
     * Links an anonymous guest session to a real user profile (Identity Stitching).
     */
    public async stitchIdentity(anonymousId: string, userId: string) {
        if (!supabase) return;

        // Update all orphaned events in the background
        await supabase
            .from('analytics_events')
            .update({ user_id: userId })
            .eq('anonymous_id', anonymousId)
            .is('user_id', null);

        // Update consent record
        await supabase
            .from('user_consent')
            .update({ user_id: userId })
            .eq('anonymous_id', anonymousId);
    }

    private isSystemEvent(type: string): boolean {
        return ['ORDER_CREATED', 'ORDER_PAID', 'ORDER_DELIVERED', 'SECURITY_ALERT'].includes(type);
    }

    private async logAnalytics(name: string, payload: OSEventPayload, meta: { corrId: string, reqId: string }) {
        if (!supabase) return;

        // Auto-inject context if browser
        const context = typeof window !== 'undefined' ? {
            url: window.location.pathname,
            title: document.title,
            referrer: window.location.pathname === '/card-games'
                ? document.referrer.split(/[?#]/, 1)[0]
                : document.referrer
        } : {};

        try {
            // 1. Log Event
            const { error } = await supabase.from('analytics_events').insert([{
                event_name: name,
                user_id: payload.userId,
                anonymous_id: payload.anonymousId,
                session_id: payload.sessionId,
                payload: {
                    ...context,
                    ...(payload.details || {})
                },
                campaign_id: payload.campaignId,
                correlation_id: meta.corrId,
                request_id: meta.reqId,
                page_url: typeof window !== 'undefined' ? window.location.pathname : undefined
            }]);

            if (error) {
                console.warn(`[OB_OS] Analytics Log Failure for ${name}:`, error.message);
            } else {
                // Internal Debug Node
                if (process.env.NODE_ENV === 'development') {
                    console.log(`[OB_OS] Event Record established: ${name}`);
                }
            }
        } catch (err) {
            console.error(`[OB_OS] Analytics Exception for ${name}:`, err);
        }

        // 2. Handle Experiment Updates
        if (name === 'EXPERIMENT_REACH' && payload.variantId) {
            try {
                await supabase?.rpc('increment_experiment_reach', { var_id: payload.variantId });
            } catch (err) {
                console.warn("[OB_OS] Experiment Reach Sync Failure:", err);
            }
        }
        if (name === 'EXPERIMENT_CONVERSION' && payload.variantId) {
            try {
                await supabase?.rpc('increment_experiment_conversion', { var_id: payload.variantId });
            } catch (err) {
                console.warn("[OB_OS] Experiment Conversion Sync Failure:", err);
            }
        }

        // 3. Handle Onboarding Funnel (Pillar 12)
        if (name.startsWith('ONBOARDING_')) {
            try {
                await supabase.from('onboarding_funnel_log').insert([{
                    anonymous_id: payload.anonymousId,
                    user_id: payload.userId,
                    step_name: name === 'ONBOARDING_STARTED' ? 'START' : (payload.details?.step || name),
                    metadata: payload.details || {}
                }]);
            } catch (err) {
                console.warn("[OB_OS] Onboarding Log Failure:", err);
            }
        }
    }

    /**
     * Captures high-resolution performance signals.
     */
    public async trackPerformance(type: 'API_LATENCY' | 'RENDER_TIME' | 'ERROR', duration?: number, msg?: string) {
        if (!supabase || !isAllowed('analytics') || !isBuiltInAnalyticsEnabled()) return;

        try {
            await supabase.from('performance_telemetry').insert([{
                session_id: this.sessionId,
                event_type: type,
                duration_ms: duration,
                error_message: msg,
                path: typeof window !== 'undefined' ? window.location.pathname : undefined,
                device_info: typeof window !== 'undefined' ? {
                    ua: navigator.userAgent,
                    w: window.innerWidth,
                    h: window.innerHeight
                } : {}
            }]);
        } catch { /* Silent */ }
    }
}

export const OB_OS = OnlineBarOS.getInstance();
