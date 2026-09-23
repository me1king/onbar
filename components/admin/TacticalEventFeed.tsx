'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Activity,
    Wine,
    Flame,
    Truck,
    Bot,
    Radio,
    ChevronRight,
    Pause,
    Play,
    Zap,
    Share2
} from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import Link from 'next/link';

export interface TacticalEvent {
    id: string;
    timestamp: string;
    channel: 'CELLAR' | 'GROWTH' | 'DISPATCH' | 'KITCHEN' | 'AI' | 'SYSTEM';
    title: string;
    detail: string;
    badge?: string;
    amount?: number;
    url?: string;
}

const INITIAL_EVENTS: TacticalEvent[] = [
    {
        id: 'evt-101',
        timestamp: new Date(Date.now() - 1000 * 30).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        channel: 'DISPATCH',
        title: 'Jameson 1L Order Delivered',
        detail: 'Stock synced to Cellar Hub & Rider Runner-4 released',
        badge: 'CONFIRMED',
        amount: 4500,
        url: '/admin/orders'
    },
    {
        id: 'evt-102',
        timestamp: new Date(Date.now() - 1000 * 90).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        channel: 'GROWTH',
        title: 'Instagram Story & Reel Scheduled',
        detail: 'AI Protocol approved • Auto-publishing at 21:00',
        badge: 'AI APPROVED',
        url: '/admin/growth/content'
    },
    {
        id: 'evt-103',
        timestamp: new Date(Date.now() - 1000 * 180).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        channel: 'CELLAR',
        title: 'Glenfiddich 15yo Inventory Restocked',
        detail: '+24 bottles ingested into VVIP Vault Node',
        badge: 'CELLAR SYNC',
        url: '/admin/upload'
    },
    {
        id: 'evt-104',
        timestamp: new Date(Date.now() - 1000 * 300).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        channel: 'AI',
        title: 'WhatsApp Conversational Sales Lead',
        detail: 'AI Assistant quoted 2x Hennessy VS & created order draft',
        badge: 'LEAD CAPTURED',
        url: '/admin/communications/command'
    },
    {
        id: 'evt-105',
        timestamp: new Date(Date.now() - 1000 * 420).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        channel: 'KITCHEN',
        title: 'Gourmet Burger Platter Fired',
        detail: 'Kitchen Station 2 accepted order #892',
        badge: 'KITCHEN HOT',
        url: '/admin/kitchen'
    }
];

export default function TacticalEventFeed({
    title = 'Tactical Event Feed',
    subtitle = 'Real-time Cross-Module Operating Stream',
    compact = false
}: {
    title?: string;
    subtitle?: string;
    compact?: boolean;
}) {
    const [events, setEvents] = React.useState<TacticalEvent[]>(INITIAL_EVENTS);
    const [selectedChannel, setSelectedChannel] = React.useState<string>('ALL');
    const [isLive, setIsLive] = React.useState(true);
    const [lastBeatTime, setLastBeatTime] = React.useState<string>('NOW');

    // Real-time Supabase Listeners + Simulated Pulse
    React.useEffect(() => {
        let intervalId: NodeJS.Timeout;

        if (isLive) {
            // Simulated heartbeat generator every 14 seconds to ensure the feed constantly feels alive
            intervalId = setInterval(() => {
                const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                setLastBeatTime(nowStr);

                const sampleTypes = [
                    {
                        channel: 'DISPATCH' as const,
                        title: 'Live Runner Dispatched',
                        detail: 'Route optimized for Westlands Sector • ETA 18 mins',
                        badge: 'TACTICAL DISPATCH',
                        url: '/admin/dispatch'
                    },
                    {
                        channel: 'GROWTH' as const,
                        title: 'WhatsApp Lead Replied',
                        detail: 'Automated Bot sent Drink Menu link to Patron +2547***',
                        badge: 'BOT ENGAGED',
                        url: '/admin/growth/accounts'
                    },
                    {
                        channel: 'CELLAR' as const,
                        title: 'Inventory Health Check',
                        detail: 'Cellar Hub verified stock levels across 42 active SKUs',
                        badge: 'NODE HEALTHY',
                        url: '/admin/upload'
                    },
                    {
                        channel: 'AI' as const,
                        title: 'AI Caption Engine Executed',
                        detail: 'Generated 3 promotional variants for Weekend Drop',
                        badge: 'AI GEN',
                        url: '/admin/growth/content'
                    }
                ];

                const picked = sampleTypes[Math.floor(Math.random() * sampleTypes.length)];
                const newEvt: TacticalEvent = {
                    id: `pulse-${Date.now()}`,
                    timestamp: nowStr,
                    ...picked
                };

                setEvents(prev => [newEvt, ...prev].slice(0, 15));
            }, 12000);
        }

        if (!supabase) return () => clearInterval(intervalId);

        const channel = supabase.channel('tactical-event-stream');

        channel
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload: { new: { id: number; customer_name: string; total_price: number } }) => {
                const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const newEvt: TacticalEvent = {
                    id: `order-${payload.new.id}`,
                    timestamp: nowStr,
                    channel: 'DISPATCH',
                    title: `New Order #${payload.new.id} Ingested`,
                    detail: `Patron: ${payload.new.customer_name || 'Anonymous'} • Syncing Dispatch Queue`,
                    badge: 'LIVE ORDER',
                    amount: payload.new.total_price,
                    url: '/admin/orders'
                };
                setEvents(prev => [newEvt, ...prev].slice(0, 15));
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_posts' }, (payload: { new: { id: string; platform: string; caption: string } }) => {
                const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const newEvt: TacticalEvent = {
                    id: `post-${payload.new.id}`,
                    timestamp: nowStr,
                    channel: 'GROWTH',
                    title: `Social Post Scheduled on ${payload.new.platform}`,
                    detail: payload.new.caption ? `"${payload.new.caption.substring(0, 45)}..."` : 'Growth Node scheduled',
                    badge: 'POST QUEUED',
                    url: '/admin/growth/calendar'
                };
                setEvents(prev => [newEvt, ...prev].slice(0, 15));
            })
            .subscribe();

        return () => {
            clearInterval(intervalId);
            if (supabase) supabase.removeChannel(channel);
        };
    }, [isLive]);

    const channelColors: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
        CELLAR: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', iconBg: 'bg-amber-500/20 text-amber-400' },
        GROWTH: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400', iconBg: 'bg-rose-500/20 text-rose-400' },
        DISPATCH: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', iconBg: 'bg-emerald-500/20 text-emerald-400' },
        KITCHEN: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', iconBg: 'bg-orange-500/20 text-orange-400' },
        AI: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', iconBg: 'bg-cyan-500/20 text-cyan-400' },
        SYSTEM: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400', iconBg: 'bg-indigo-500/20 text-indigo-400' },
    };

    const channelIcons: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
        CELLAR: Wine,
        GROWTH: Share2,
        DISPATCH: Truck,
        KITCHEN: Flame,
        AI: Bot,
        SYSTEM: Zap
    };

    const filteredEvents = selectedChannel === 'ALL'
        ? events
        : events.filter(e => e.channel === selectedChannel);

    return (
        <div className={cn(
            "rounded-[2.5rem] bg-slate-950 border border-slate-800 p-6 lg:p-8 shadow-2xl relative overflow-hidden text-left font-mono text-slate-100",
            compact && "p-4 rounded-[2rem]"
        )}>
            {/* Ambient Background Grid Glow */}
            <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-20 pointer-events-none" />
            <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                            <Radio className="h-5 w-5 animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm lg:text-base font-black uppercase tracking-widest text-slate-100">{title}</h3>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                                    LIVE PROTOCOL
                                </span>
                            </div>
                            <p className="text-[10px] font-medium text-slate-400 mt-0.5">{subtitle}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Channel Filter Pills */}
                        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
                            {['ALL', 'CELLAR', 'GROWTH', 'DISPATCH', 'KITCHEN', 'AI'].map(ch => (
                                <button
                                    key={ch}
                                    onClick={() => setSelectedChannel(ch)}
                                    className={cn(
                                        "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                                        selectedChannel === ch
                                            ? "bg-primary text-white shadow-md"
                                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                                    )}
                                >
                                    {ch}
                                </button>
                            ))}
                        </div>

                        {/* Stream Toggle */}
                        <button
                            onClick={() => setIsLive(!isLive)}
                            className={cn(
                                "h-8 px-3 rounded-xl border text-[9px] font-black uppercase flex items-center gap-1.5 transition-all",
                                isLive ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-slate-900 border-slate-800 text-slate-500"
                            )}
                            title={isLive ? "Pause Event Stream" : "Resume Event Stream"}
                        >
                            {isLive ? <Pause size={12} /> : <Play size={12} />}
                            <span>{isLive ? 'STREAM ON' : 'PAUSED'}</span>
                        </button>
                    </div>
                </div>

                {/* Event Feed List */}
                <div className="space-y-3 max-h-[380px] overflow-y-auto no-scrollbar pr-1">
                    {filteredEvents.length === 0 ? (
                        <div className="py-12 text-center text-slate-500 space-y-2">
                            <Activity className="h-8 w-8 mx-auto opacity-30 animate-pulse" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Awaiting tactical telemetry for channel [{selectedChannel}]...</p>
                        </div>
                    ) : (
                        filteredEvents.map((evt) => {
                            const config = channelColors[evt.channel] || channelColors.SYSTEM;
                            const IconComp = channelIcons[evt.channel] || Zap;

                            return (
                                <div
                                    key={evt.id}
                                    className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group animate-in slide-in-from-bottom-2 duration-300"
                                >
                                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                                        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border", config.iconBg, config.border)}>
                                            <IconComp size={18} />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[10px] font-bold text-slate-400 tracking-tight">{evt.timestamp}</span>
                                                <span className={cn("px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border", config.bg, config.text, config.border)}>
                                                    {evt.badge || evt.channel}
                                                </span>
                                                <h4 className="text-xs font-black text-slate-100 uppercase tracking-tight truncate">{evt.title}</h4>
                                            </div>
                                            <p className="text-[11px] font-medium text-slate-400 mt-1 truncate">{evt.detail}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                                        {evt.amount && (
                                            <span className="text-xs font-black text-emerald-400 font-mono">
                                                {formatPrice(evt.amount)}
                                            </span>
                                        )}

                                        {evt.url && (
                                            <Link href={evt.url}>
                                                <button className="h-7 px-2.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-primary hover:text-white text-[9px] font-black uppercase flex items-center gap-1 transition-all group/btn">
                                                    <span>View</span>
                                                    <ChevronRight size={12} className="group-hover/btn:translate-x-0.5 transition-transform" />
                                                </button>
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Telemetry */}
                <div className="pt-3 border-t border-slate-800/60 flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                    <span className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Heartbeat Active ({lastBeatTime})
                    </span>
                    <span>BAR OS Telemetry Stream v2.4</span>
                </div>
            </div>
        </div>
    );
}
