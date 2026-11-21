'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import ExperienceToast, { ToastProps } from './ExperienceToast';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UserNotification {
    id: string;
    user_id: string;
    title: string;
    message: string;
    icon: string | null;
    style: string | null;
    action_url: string | null;
    duration?: number;
    created_at: string;
}

function isUserNotification(value: unknown): value is UserNotification {
    if (typeof value !== 'object' || value === null) return false;
    const notification = value as Record<string, unknown>;
    return typeof notification.id === 'string'
        && typeof notification.user_id === 'string'
        && typeof notification.title === 'string'
        && typeof notification.message === 'string'
        && (notification.icon === null || typeof notification.icon === 'string')
        && (notification.style === null || typeof notification.style === 'string')
        && (notification.action_url === null || typeof notification.action_url === 'string')
        && (notification.duration === undefined || (typeof notification.duration === 'number' && Number.isFinite(notification.duration)))
        && typeof notification.created_at === 'string';
}

function safeActionUrl(value: string | null): string | undefined {
    if (!value || !value.startsWith('/') || value.startsWith('//')) return undefined;
    try {
        const url = new URL(value, window.location.origin);
        return url.origin === window.location.origin
            ? `${url.pathname}${url.search}${url.hash}`
            : undefined;
    } catch {
        return undefined;
    }
}

function isMissingPopupDurationColumn(error: { code?: string; message?: string }) {
    return /duration/i.test(error.message || '')
        && ['42703', 'PGRST204'].includes(error.code || '');
}

export default function ExperienceNotificationHost() {
    const [toasts, setToasts] = React.useState<ToastProps[]>([]);
    const removeToast = React.useCallback((id: string) => {
        setToasts(previous => previous.filter(toast => toast.id !== id));
    }, []);

    React.useEffect(() => {
        const client = supabase;
        if (!client) return;

        let isMounted = true;
        let channel: RealtimeChannel | null = null;
        let activeUserId: string | null = null;
        let connectionGeneration = 0;
        let hasConnected = false;
        let lastSyncedAt = new Date().toISOString();
        const handledNotifications = new Set<string>();

        const showNotification = (userId: string, notification: UserNotification) => {
            if (!isMounted
                || activeUserId !== userId
                || notification.user_id !== userId
                || handledNotifications.has(notification.id)) return;
            handledNotifications.add(notification.id);
            const toast: ToastProps = {
                id: notification.id,
                title: notification.title,
                message: notification.message,
                icon: notification.icon || undefined,
                style: notification.style || 'info',
                actionUrl: safeActionUrl(notification.action_url),
                duration: notification.duration ?? 7,
                onClose: removeToast
            };
            setToasts(current => [...current, toast]);
        };

        const syncRecentNotifications = async (userId: string) => {
            const syncFrom = lastSyncedAt;
            const queryNotifications = (includeDuration: boolean) => client
                .from('user_notifications')
                .select(includeDuration
                    ? 'id,user_id,title,message,icon,style,action_url,duration,created_at'
                    : 'id,user_id,title,message,icon,style,action_url,created_at')
                .eq('user_id', userId)
                .gte('created_at', syncFrom)
                .order('created_at', { ascending: true })
                .limit(100);
            let { data, error } = await queryNotifications(true);
            if (error && isMissingPopupDurationColumn(error)) {
                console.warn('[ExperienceHost] Apply supabase/USER_NOTIFICATION_POPUP_DURATION_MIGRATION.sql to use configured popup durations; using the seven-second default until then.');
                ({ data, error } = await queryNotifications(false));
            }
            if (error) {
                console.error('[ExperienceHost] Could not catch up on popup notifications:', error);
                return;
            }
            if (!isMounted || activeUserId !== userId) return;
            for (const notification of data || []) {
                if (isUserNotification(notification)) showNotification(userId, notification);
            }
            lastSyncedAt = new Date().toISOString();
        };

        const connectToUser = async (userId: string | null) => {
            if (!isMounted || activeUserId === userId) return;
            activeUserId = userId;
            const generation = ++connectionGeneration;
            if (hasConnected) {
                lastSyncedAt = new Date().toISOString();
                setToasts([]);
            }
            hasConnected = true;
            if (channel) {
                const oldChannel = channel;
                channel = null;
                await client.removeChannel(oldChannel);
            }
            if (!isMounted || generation !== connectionGeneration || !userId) return;

            channel = client
                .channel(`experience-alerts-${userId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'user_notifications',
                        filter: `user_id=eq.${userId}`
                    },
                    change => {
                        if (isUserNotification(change.new)) showNotification(userId, change.new);
                    }
                )
                .subscribe((status, error) => {
                    if (status === 'SUBSCRIBED') {
                        void syncRecentNotifications(userId);
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.error('[ExperienceHost] Realtime subscription failed:', error);
                    }
                });
        };

        const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
            const userId = session?.user.id || null;
            window.setTimeout(() => void connectToUser(userId), 0);
        });
        client.auth.getSession()
            .then(({ data: { session }, error }) => {
                if (error) throw error;
                return connectToUser(session?.user.id || null);
            })
            .catch(error => console.error('[ExperienceHost] Unable to initialize notifications:', error));

        return () => {
            isMounted = false;
            connectionGeneration += 1;
            subscription.unsubscribe();
            if (channel) void client.removeChannel(channel);
        };
    }, [removeToast]);

    return (
        <div
            role="region"
            aria-label="Popup notifications"
            className="pointer-events-none fixed inset-x-4 top-4 z-[2000] flex max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-y-auto sm:inset-x-auto sm:right-6 sm:top-6 sm:w-[min(400px,calc(100vw-3rem))] lg:right-10 lg:top-10"
        >
            {toasts.map(toast => <ExperienceToast key={toast.id} {...toast} />)}
        </div>
    );
}
