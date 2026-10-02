'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import ExperienceToast, { ToastProps } from './ExperienceToast';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface NotificationLog {
    id: string;
    template_id: string;
    payload: Record<string, string | number>;
}

export default function ExperienceNotificationHost() {
    const [toasts, setToasts] = React.useState<ToastProps[]>([]);
    const removeToast = React.useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    React.useEffect(() => {
        let isMounted = true;
        let channel: RealtimeChannel | null = null;
        let activeUserId: string | null = null;
        const handledNotifications = new Set<string>();

        function hydrateTemplate(text: string, context: Record<string, string | number | undefined>): string {
            return text.replace(/{{(.*?)}}/g, (match, key) => {
                const value = context[key.trim()];
                return value !== undefined ? String(value) : match;
            });
        }

        async function showNotification(notification: NotificationLog) {
            if (!isMounted || !supabase || handledNotifications.has(notification.id)) return;
            handledNotifications.add(notification.id);

            try {
                const { data: template, error } = await supabase
                    .from('notification_templates')
                    .select('*')
                    .eq('id', notification.template_id)
                    .maybeSingle();
                if (error) throw error;
                if (!template) {
                    console.warn('[ExperienceHost] Notification template is missing or inactive:', notification.template_id);
                    return;
                }

                const payload = notification.payload || {};
                const toast: ToastProps = {
                    id: notification.id,
                    title: hydrateTemplate(template.title, payload),
                    message: hydrateTemplate(template.message, payload),
                    icon: template.icon,
                    style: template.style,
                    actionUrl: template.cta_url ? hydrateTemplate(template.cta_url, payload) : undefined,
                    duration: template.duration,
                    onClose: removeToast
                };
                setToasts(current => [toast, ...current].slice(0, 3));
            } catch (err) {
                console.error('[ExperienceHost] Payload processing failed:', err);
            }
        }

        async function connectToUser(userId: string | null) {
            if (!supabase || !isMounted || activeUserId === userId) return;
            activeUserId = userId;
            if (channel) {
                await supabase.removeChannel(channel);
                channel = null;
            }
            if (!userId) return;

            channel = supabase
                .channel(`experience-alerts-${userId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications_log',
                        filter: `user_id=eq.${userId}`
                    },
                    (change) => {
                        void showNotification(change.new as NotificationLog);
                    }
                )
                .subscribe((status, error) => {
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.error('[ExperienceHost] Realtime subscription failed:', error);
                    }
                });
        }

        if (!supabase) return () => { isMounted = false; };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            void connectToUser(session?.user.id || null);
        });
        supabase.auth.getSession()
            .then(({ data: { session }, error }) => {
                if (error) throw error;
                return connectToUser(session?.user.id || null);
            })
            .catch(err => console.error('[ExperienceHost] Unable to initialize notifications:', err));

        return () => {
            isMounted = false;
            subscription.unsubscribe();
            if (channel && supabase) void supabase.removeChannel(channel);
        };
    }, [removeToast]);

    return (
        <div className="fixed top-6 right-6 lg:top-10 lg:right-10 z-[2000] flex flex-col gap-4 pointer-events-none w-full max-w-[400px]">
            {toasts.map((toast) => (
                <ExperienceToast key={toast.id} {...toast} />
            ))}
        </div>
    );
}
