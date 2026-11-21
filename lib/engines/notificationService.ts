import { supabase } from '../supabaseClient';

/**
 * ONLINE BAR: EXPERIENCE NOTIFICATION ENGINE
 * Advanced, template-driven router for all platform communications.
 */

export type Channel = 'PUSH' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'IN_APP';

interface NotificationPayload {
    userId: string;
    orderId?: number;
    title?: string;
    body?: string;
    templateName?: string;
    actionUrl?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
    attributionId?: string;
}

type UserNotificationInsert = {
    user_id: string;
    title: string;
    message: string;
    icon?: string | null;
    style?: string | null;
    duration: number;
    action_url?: string | null;
};

function isMissingPopupDurationColumn(error: { code?: string; message?: string }) {
    return /duration/i.test(error.message || '')
        && ['42703', 'PGRST204'].includes(error.code || '');
}

async function insertUserNotification(notification: UserNotificationInsert) {
    if (!supabase) return;
    let { error } = await supabase.from('user_notifications').insert(notification);
    if (error && isMissingPopupDurationColumn(error)) {
        console.warn('[NOTIFICATION_SERVICE] Apply supabase/USER_NOTIFICATION_POPUP_DURATION_MIGRATION.sql to persist configured popup durations; using the seven-second default until then.');
        const { user_id, title, message, icon, style, action_url } = notification;
        const legacyNotification = { user_id, title, message, icon, style, action_url };
        ({ error } = await supabase.from('user_notifications').insert(legacyNotification));
    }
    if (error) throw error;
}

/**
 * MASTER MESSAGE OBJECT: For multi-channel orchestration
 */
export interface MasterMessage {
    title: string;
    body: string;
    channels: Channel[];
    audience_id?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
}

/**
 * High-level function to trigger notifications based on system events.
 */
export async function triggerNotificationByEvent(eventType: string, payload: NotificationPayload) {
    if (!supabase) throw new Error('Notification database is not connected.');

    // 1. Fetch Template
    const { data: template, error: templateError } = await supabase
        .from('notification_templates')
        .select('*')
        .eq('event_type', eventType)
        .eq('is_active', true)
        .order('priority', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (templateError) throw templateError;
    if (!template) {
        console.info(`[NOTIFICATION_SERVICE] No active template configured for ${eventType}.`);
        return;
    }

    // 2. Hydrate Variables
    const context = {
        order_id: payload.orderId,
        user_id: payload.userId,
        ...(payload.metadata || {})
    };

    const hydratedTitle = hydrateTemplate(template.title, context);
    const hydratedMessage = hydrateTemplate(template.message, context);

    // 3. Log to Database (Real-time Trigger)
    const { error: logError } = await supabase.from('notifications_log').insert([{
        user_id: payload.userId,
        order_id: payload.orderId,
        template_id: template.id,
        payload: context
    }]);
    if (logError) throw logError;

    // 4. Save to User Inbox
    await insertUserNotification({
        user_id: payload.userId,
        title: hydratedTitle,
        message: hydratedMessage,
        icon: template.icon,
        style: template.style,
        duration: template.duration,
        action_url: template.cta_url ? hydrateTemplate(template.cta_url, context) : null
    });

    // 5. Optionally dispatch to other channels (WhatsApp/Email)
    // if (template.priority === 'CRITICAL' || template.priority === 'HIGH') {
    //     await sendNotification(['WHATSAPP'], { ...payload, title: hydratedTitle, body: hydratedMessage });
    // }
}

/**
 * Core hydration logic for template variables {{variable}}
 */
function hydrateTemplate(text: string, context: Record<string, string | number | undefined>): string {
    return text.replace(/{{(.*?)}}/g, (match, key) => {
        const value = context[key.trim()];
        return value !== undefined ? String(value) : match;
    });
}

/**
 * Legacy support for raw notifications
 */
export async function sendNotification(channels: Channel[], payload: NotificationPayload) {
    const promises = channels.map(channel => {
        switch (channel) {
            case 'IN_APP':
                return handleInApp(payload);
            default:
                console.warn(`⚠️ [NOTIFICATION_SERVICE] Channel ${channel} not fully implemented.`);
                return Promise.resolve();
        }
    });

    await Promise.all(promises);
}

/**
 * High-fidelity message routing for campaigns.
 */
export async function routeMasterMessage(msg: MasterMessage, userId: string) {
    if (!supabase) return;

    // 1. Compliance Scan
    const isClean = await performComplianceScan(msg.body);
    if (!isClean) {
        console.warn(`🛑 [NOTIFICATION_SERVICE] Compliance block triggered for message.`);
        return;
    }

    // 2. Attribution Wrap
    const attributionId = Math.random().toString(36).substring(7);
    const hydratedBody = msg.body + `\n\nEnjoy Responsibly. 18+ only.`;

    // 3. Dispatch to Channels
    await sendNotification(msg.channels, {
        userId,
        title: msg.title,
        body: hydratedBody,
        attributionId,
        metadata: msg.metadata
    });
}

async function performComplianceScan(text: string): Promise<boolean> {
    if (!supabase) return true;
    const { data: rules } = await supabase.from('compliance_rules').select('pattern, severity').eq('severity', 'BLOCK');
    if (!rules) return true;

    const lower = text.toLowerCase();
    return !rules.some(r => lower.includes(r.pattern.toLowerCase()));
}

async function handleInApp(payload: NotificationPayload) {
    if (!supabase) return;
    await insertUserNotification({
        user_id: payload.userId,
        title: payload.title || 'System Alert',
        message: payload.body || '',
        duration: 7,
        action_url: payload.attributionId ? `/shop?utm_id=${payload.attributionId}` : undefined
    });
}
