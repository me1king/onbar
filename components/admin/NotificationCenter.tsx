'use client';

import * as React from 'react';
import { Bell, X, ShieldAlert, Package, Truck, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface Notification {
    id: string;
    type: 'critical' | 'warning' | 'info' | 'success';
    label: string;
    meta: string;
    time: string;
    url: string;
    isRead: boolean;
}

export default function NotificationCenter({
    isOpen,
    setIsOpen,
    pendingSubmissions = 0,
    pendingMarketSubmissions = 0,
    onMerchantUnreadCountChange
}: {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    pendingSubmissions?: number;
    pendingMarketSubmissions?: number;
    onMerchantUnreadCountChange?: (count: number) => void;
}) {
    const [notifications, setNotifications] = React.useState<Notification[]>([]);
    const [merchantNotifications, setMerchantNotifications] = React.useState<Notification[]>([]);
    const [feedError, setFeedError] = React.useState('');

    const fetchNotifications = React.useCallback(async () => {
        try {
            const [auditResponse, merchantResponse] = await Promise.all([
                fetch('/api/admin/audit-logs', { cache: 'no-store' }).catch(error => {
                    console.error('Audit notification request failed:', error);
                    return null;
                }),
                fetch('/api/admin/merchant-support?notifications=true', { cache: 'no-store' }).catch(error => {
                    console.error('Merchant notification request failed:', error);
                    return null;
                })
            ]);
            const errors: string[] = [];
            let auditNotifications: Notification[] = [];
            let nextMerchantNotifications: Notification[] = [];

            if (auditResponse?.ok) {
                const result = await auditResponse.json() as {
                logs?: Array<{ id: string; action: string; staff_email: string | null; created_at: string }>;
                };
                auditNotifications = (result.logs || []).slice(0, 10).map(log => ({
                    id: String(log.id),
                    type: log.action.includes('CRITICAL') ? 'critical' : log.action.includes('UPDATE') ? 'info' : 'info',
                    label: log.action.replace(/_/g, ' '),
                    meta: log.staff_email || 'System Action',
                    time: new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    url: '/lord/audit',
                    isRead: true
                }));
            } else if (auditResponse) {
                errors.push('Audit activity is not available to this admin role.');
            }
            if (merchantResponse?.ok) {
                const result = await merchantResponse.json() as {
                    notifications?: Array<{ id: string; label: string; meta: string; created_at: string; url: string }>;
                };
                nextMerchantNotifications = (result.notifications || []).map(notification => ({
                    id: notification.id,
                    type: 'warning',
                    label: notification.label,
                    meta: notification.meta,
                    time: new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    url: notification.url,
                    isRead: false
                }));
            } else {
                errors.push('Merchant message notifications could not be loaded.');
            }
            setNotifications(auditNotifications);
            setMerchantNotifications(nextMerchantNotifications);
            setFeedError(errors.join(' '));
        } catch (err) {
            console.error('Admin notification feed failed:', err);
            setFeedError('Notifications could not be refreshed.');
        }
    }, []);

    React.useEffect(() => {
        void fetchNotifications();
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') void fetchNotifications();
        }, 15_000);
        return () => window.clearInterval(timer);
    }, [fetchNotifications]);

    React.useEffect(() => {
        if (isOpen) void fetchNotifications();
    }, [isOpen, fetchNotifications]);

    React.useEffect(() => {
        onMerchantUnreadCountChange?.(merchantNotifications.length);
    }, [merchantNotifications.length, onMerchantUnreadCountChange]);

    const markAllRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    };

    const liveNotifications: Notification[] = [
        ...(pendingSubmissions > 0 ? [{
            id: 'merchant-submissions',
            type: 'warning' as const,
            label: `${pendingSubmissions} OnBar partner application${pendingSubmissions === 1 ? '' : 's'} awaiting review`,
            meta: 'Review business details, documents, and offered prices.',
            time: 'Now',
            url: '/lord/merchants',
            isRead: false
        }] : []),
        ...(pendingMarketSubmissions > 0 ? [{
            id: 'market-seller-submissions',
            type: 'warning' as const,
            label: `${pendingMarketSubmissions} Market seller application${pendingMarketSubmissions === 1 ? '' : 's'} awaiting review`,
            meta: 'Review boutique requests, verify seller contacts, and approve or request information.',
            time: 'Now',
            url: '/lord/market',
            isRead: false
        }] : [])
    ];
    const visibleNotifications = [...liveNotifications, ...merchantNotifications, ...notifications];
    const unreadCount = visibleNotifications.filter(n => !n.isRead).length;

    if (!isOpen) return null;

    return (
        <>
            {/* Overlay */}
            <div className="fixed inset-0 z-[110] bg-background/20 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsOpen(false)} />

            {/* Panel */}
            <aside className="fixed inset-y-0 right-0 z-[120] w-[400px] bg-card border-l border-border shadow-2xl animate-in slide-in-from-right-4 duration-500 overflow-hidden flex flex-col">
                <header className="p-8 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                            <Bell className="h-6 w-6" />
                        </div>
                        <div className="text-left">
                            <h2 className="text-xl font-black uppercase tracking-tighter text-foreground leading-none">Intelligence Alerts</h2>
                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-1">{unreadCount} New Signals</p>
                        </div>
                    </div>
                    <button onClick={markAllRead} className="text-[8px] font-black uppercase text-primary hover:underline">Mark all read</button>
                    <button onClick={() => setIsOpen(false)} className="h-10 w-10 rounded-xl hover:bg-secondary flex items-center justify-center text-muted transition-colors">
                        <X className="h-6 w-6" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar">
                    {feedError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">{feedError}</p>}
                    {visibleNotifications.length === 0 ? (
                        <div className="py-20 text-center opacity-30">
                            <CheckCircle2 className="h-10 w-10 mx-auto mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Shift clear, Master.</p>
                        </div>
                    ) : (
                        visibleNotifications.map((n) => (
                            <Link key={n.id} href={n.url} onClick={() => setIsOpen(false)}>
                                <div className={cn(
                                    "p-6 rounded-[2rem] border transition-all flex gap-4 group relative",
                                    n.isRead ? "bg-slate-50/50 border-border opacity-60" : "bg-white border-primary/20 shadow-xl"
                                )}>
                                    <div className={cn(
                                        "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                                        n.type === 'critical' ? "bg-rose-50 text-rose-500" :
                                        n.type === 'warning' ? "bg-amber-50 text-amber-500" :
                                        n.type === 'success' ? "bg-emerald-50 text-emerald-500" :
                                        "bg-indigo-50 text-indigo-500"
                                    )}>
                                        {n.type === 'critical' ? <ShieldAlert size={20} /> :
                                         n.type === 'warning' ? <Package size={20} /> :
                                         n.type === 'success' ? <CheckCircle2 size={20} /> :
                                         <Truck size={20} />}
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <div className="flex justify-between items-start mb-1">
                                            <p className="text-[11px] font-black uppercase text-foreground leading-none truncate pr-4">{n.label}</p>
                                            <span className="text-[8px] font-bold text-muted-foreground uppercase whitespace-nowrap">{n.time}</span>
                                        </div>
                                        <p className="text-[10px] font-medium text-slate-500 italic leading-relaxed line-clamp-2">{n.meta}</p>
                                        <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[8px] font-black uppercase text-primary">Engage Protocol</span>
                                            <ChevronRight className="h-3 w-3 text-primary" />
                                        </div>
                                    </div>
                                    {!n.isRead && (
                                        <div className="absolute top-4 right-4 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                    )}
                                </div>
                            </Link>
                        ))
                    )}
                </div>

                <div className="p-8 border-t border-border bg-slate-50/50">
                    <Button variant="outline" className="w-full h-12 rounded-xl border-border font-black uppercase text-[10px] tracking-widest hover:bg-white">
                        Clear All History
                    </Button>
                </div>
            </aside>
        </>
    );
}
