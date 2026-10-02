'use client';

import * as React from 'react';
import {
    Search,
    RefreshCcw,
    ChevronLeft,
    ShieldCheck,
    Monitor,
    Smartphone,
    Database,
    ChevronRight,
    Loader2,
    Calendar,
    Clock,
    ShoppingCart,
    ShoppingBag,
    Users,
    Flame
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// Components
import ForensicTimeline from '@/components/admin/behavior/ForensicTimeline';

interface SessionNode {
    id: string;
    entry_page: string;
    source_channel: string;
    total_active_time_sec: number;
    pages_viewed: number;
    created_at: string;
    status: string;
    device_info: {
        ua?: string;
        res?: string;
    };
}

interface ForensicEvent {
    id: number;
    action_type: string;
    page_url: string;
    metadata: Record<string, unknown>;
    timestamp: string;
}

export default function SessionLibraryPage() {
    const router = useRouter();
    const [loading, setLoading] = React.useState(true);
    const [sessions, setSessions] = React.useState<SessionNode[]>([]);
    const [selectedSession, setSelectedSession] = React.useState<SessionNode | null>(null);
    const [forensics, setForensics] = React.useState<ForensicEvent[]>([]);
    const [loadingForensics, setLoadingForensics] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);
    const [forensicsError, setForensicsError] = React.useState<string | null>(null);
    const [hud, setHud] = React.useState({
        activeSessions: 0,
        cartsCreated: 0,
        ordersCompleted: 0,
        bouncedVisitors: 0
    });

    const fetchSessions = React.useCallback(async () => {
        if (!supabase) {
            setError('Supabase is not configured. Session data is unavailable.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const activeSince = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const [sessionsRes, eventsRes, cartsRes, ordersRes, bouncedRes, activeRes] = await Promise.all([
                supabase.from('customer_sessions').select('*').order('last_seen_at', { ascending: false }).limit(50),
                supabase.from('analytics_events').select('id, event_name, session_id, page_url, payload, created_at').not('session_id', 'is', null).order('created_at', { ascending: false }).limit(1000),
                supabase.from('analytics_events').select('id', { count: 'exact', head: true }).eq('event_name', 'ADD_TO_CART'),
                supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'Delivered'),
                supabase.from('customer_sessions').select('id', { count: 'exact', head: true }).eq('session_status', 'ABANDONED'),
                supabase.from('customer_sessions').select('id', { count: 'exact', head: true }).gte('last_seen_at', activeSince)
            ]);

            const queryError = sessionsRes.error || eventsRes.error || cartsRes.error || ordersRes.error || bouncedRes.error || activeRes.error;
            if (queryError) throw queryError;

            setHud({
                activeSessions: activeRes.count || 0,
                cartsCreated: cartsRes.count || 0,
                ordersCompleted: ordersRes.count || 0,
                bouncedVisitors: bouncedRes.count || 0
            });

            const eventsBySession = new Map<string, typeof eventsRes.data>();
            for (const event of eventsRes.data || []) {
                if (!event.session_id) continue;
                const sessionEvents = eventsBySession.get(event.session_id) || [];
                sessionEvents.push(event);
                eventsBySession.set(event.session_id, sessionEvents);
            }

            const mapped: SessionNode[] = (sessionsRes.data || []).map(session => {
                const sessionEvents = eventsBySession.get(session.id) || [];
                const firstEvent = sessionEvents.at(-1);
                return {
                    id: session.id,
                    entry_page: session.entry_page || firstEvent?.page_url || 'Unknown entry page',
                    source_channel: session.source_channel || 'Unknown source',
                    total_active_time_sec: session.total_active_time_sec || 0,
                    pages_viewed: new Set(sessionEvents.map(event => event.page_url).filter(Boolean)).size,
                    created_at: session.created_at,
                    status: session.session_status || 'Unknown',
                    device_info: session.device_info || {}
                };
            });
            setSessions(mapped);
            setSelectedSession(mapped[0] || null);
            if (mapped[0]) {
                await fetchForensics(mapped[0]);
            } else {
                setForensics([]);
                setForensicsError(null);
            }
        } catch (err) {
            console.error('Session data fetch error:', err);
            setError(err instanceof Error ? err.message : 'Unable to load session data.');
            setSessions([]);
            setSelectedSession(null);
            setForensics([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchForensics = async (session: SessionNode) => {
        if (!supabase) {
            setForensicsError('Supabase is not configured. Session activity is unavailable.');
            return;
        }
        setLoadingForensics(true);
        setForensicsError(null);
        try {
            const { data, error: fetchError } = await supabase
                .from('analytics_events')
                .select('id, event_name, page_url, payload, created_at')
                .eq('session_id', session.id)
                .order('created_at', { ascending: true });

            if (fetchError) throw fetchError;
            setForensics((data || []).map(event => ({
                id: event.id,
                action_type: event.event_name,
                page_url: event.page_url || 'Unknown page',
                metadata: event.payload || {},
                timestamp: event.created_at
            })));
        } catch (err) {
            console.error('Session activity fetch error:', err);
            setForensics([]);
            setForensicsError(err instanceof Error ? err.message : 'Unable to load session activity.');
        } finally {
            setLoadingForensics(false);
        }
    };

    React.useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    const filtered = sessions.filter(s =>
        s.id.toLowerCase().includes(search.toLowerCase()) ||
        s.entry_page?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20">

            {/* SESSION HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-10">
                <div className="flex items-center gap-6">
                    <button onClick={() => router.back()} className="h-12 w-12 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-300 hover:text-primary transition-all shadow-sm">
                        <ChevronLeft size={24} />
                    </button>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <ShieldCheck className="h-4 w-4 text-indigo-600" />
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600 italic text-left">BAR OS FORENSIC CONTROL ROOM</span>
                        </div>
                        <h1 className="text-4xl lg:text-5xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                            Session <span className="text-indigo-600">Forensics.</span>
                        </h1>
                    </div>
                </div>
                <div className="flex gap-4">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search by ID or Patron..."
                            className="h-14 w-80 pl-12 rounded-2xl bg-white border-slate-100 text-[10px] font-black uppercase tracking-widest shadow-sm"
                        />
                    </div>
                    <Button onClick={fetchSessions} variant="outline" className="rounded-xl h-14 w-14 p-0 border-slate-200 bg-white font-black uppercase hover:bg-slate-50 transition-all">
                        <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
                    </Button>
                </div>
            </header>

            {error && (
                <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                    {error}
                </div>
            )}

            {/* 1. TOP LIVE SESSION HUD CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm space-y-2">
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-indigo-600" />
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Active Sessions</p>
                    </div>
                    <p className="text-3xl font-black text-foreground">{hud.activeSessions.toLocaleString()}</p>
                    <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Live Grid</span>
                </Card>

                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm space-y-2">
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4 text-amber-500" />
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Carts Created</p>
                    </div>
                    <p className="text-3xl font-black text-foreground">{hud.cartsCreated.toLocaleString()}</p>
                    <span className="text-[8px] font-black uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">Active Intent</span>
                </Card>

                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm space-y-2">
                    <div className="flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4 text-emerald-600" />
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Orders Completed</p>
                    </div>
                    <p className="text-3xl font-black text-foreground">{hud.ordersCompleted.toLocaleString()}</p>
                    <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Conversions</span>
                </Card>

                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm space-y-2">
                    <div className="flex items-center gap-2">
                        <Flame className="h-4 w-4 text-rose-500" />
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Abandoned Sessions</p>
                    </div>
                    <p className="text-3xl font-black text-foreground">{hud.bouncedVisitors.toLocaleString()}</p>
                    <span className="text-[8px] font-black uppercase text-rose-500 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">Drop-off Node</span>
                </Card>
            </div>

            <div className="grid xl:grid-cols-12 gap-10">

                {/* LEFT: SESSION TABLE & LIST */}
                <div className="xl:col-span-5 space-y-8">
                     <div className="flex items-center justify-between px-4">
                        <h2 className="text-2xl font-black uppercase tracking-tighter italic">First-Party Journeys</h2>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{filtered.length} Indexed Nodes</span>
                    </div>

                    <div className="grid gap-4 max-h-[800px] overflow-y-auto no-scrollbar pr-2">
                        {loading && sessions.length === 0 ? (
                            <div className="py-40 text-center opacity-30 flex flex-col items-center gap-6">
                                <Loader2 size={40} className="animate-spin text-indigo-600" />
                                <p className="text-[10px] font-black uppercase tracking-widest">Decrypting Journey Metadata...</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-medium text-slate-500">
                                {search ? 'No sessions match this search.' : 'No recorded sessions yet.'}
                            </div>
                        ) : filtered.map(session => {
                            const isMobile = session.device_info?.ua?.toLowerCase().includes('mobile');
                            const isActive = selectedSession?.id === session.id;
                            return (
                                <Card
                                    key={session.id}
                                    onClick={() => {
                                        setSelectedSession(session);
                                        fetchForensics(session);
                                    }}
                                    className={cn(
                                        "p-6 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm hover:shadow-xl transition-all group cursor-pointer overflow-hidden relative",
                                        isActive && "ring-2 ring-indigo-500/20 border-indigo-500/40 bg-indigo-50/10 shadow-indigo-100/50"
                                    )}
                                >
                                    <div className="flex justify-between items-center relative z-10">
                                        <div className="flex items-center gap-5 min-w-0">
                                            <div className={cn(
                                                "h-14 w-14 rounded-[1.5rem] border flex items-center justify-center shrink-0 transition-all",
                                                isActive ? "bg-indigo-600 text-white border-indigo-500 shadow-xl shadow-indigo-200" : "bg-slate-50 border-slate-100 text-slate-300 group-hover:text-indigo-500"
                                            )}>
                                                {isMobile ? <Smartphone size={24} /> : <Monitor size={24} />}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className="text-[9px] font-black uppercase text-indigo-600 tracking-widest italic">{session.source_channel || 'Direct'}</span>
                                                    <div className="h-1 w-1 rounded-full bg-slate-200" />
                                                    <span className="text-[8px] font-bold text-slate-400 uppercase">{session.id}</span>
                                                </div>
                                                <h3 className="text-sm font-black text-foreground uppercase tracking-tight truncate italic">Session {session.id}</h3>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <div className="flex items-center gap-1 text-[9px] font-black uppercase text-slate-400">
                                                        <Clock size={10} /> {session.total_active_time_sec}s Active
                                                    </div>
                                                    <div className="h-1 w-1 rounded-full bg-slate-200" />
                                                    <span className={cn(
                                                        "text-[8px] font-black uppercase px-2 py-0.5 rounded-full border",
                                                        session.status === 'PURCHASED' || session.status === 'Delivered' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                                        session.status === 'ABANDONED' ? "bg-rose-50 text-rose-500 border-rose-100" :
                                                        "bg-indigo-50 text-indigo-600 border-indigo-100"
                                                    )}>
                                                        {session.status}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className={cn("transition-all", isActive ? "text-indigo-500 translate-x-1" : "text-slate-200 group-hover:text-indigo-500")} />
                                    </div>
                                    {isActive && <ShieldCheck className="absolute -bottom-4 -right-4 h-24 w-24 text-indigo-500/5 rotate-12" />}
                                </Card>
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT: INTERACTION TIMELINE & FORENSIC VIEW */}
                <div className="xl:col-span-7 space-y-8">
                    {selectedSession ? (
                        <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                            <div className="flex items-center justify-between px-4">
                                <div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600">Forensic View &bull; {selectedSession.id}</span>
                                    <h2 className="text-2xl font-black uppercase tracking-tighter italic">
                                        Session {selectedSession.id} ({selectedSession.status})
                                    </h2>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="px-4 py-2 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center gap-3">
                                        <Calendar size={14} className="text-slate-300" />
                                        <span className="text-[10px] font-black text-foreground uppercase tracking-widest">{new Date(selectedSession.created_at).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="relative">
                                {loadingForensics ? (
                                    <div className="py-40 flex flex-col items-center gap-6">
                                        <Loader2 size={40} className="animate-spin text-indigo-600" />
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Synchronizing Forensic Nodes...</p>
                                    </div>
                                ) : forensicsError ? (
                                    <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                                        {forensicsError}
                                    </div>
                                ) : (
                                    <ForensicTimeline events={forensics} />
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-[700px] bg-white rounded-[4rem] border border-slate-100 border-dashed flex flex-col items-center justify-center text-center p-20 gap-8 opacity-40 group hover:opacity-100 transition-opacity">
                            <Database size={64} className="text-slate-200 group-hover:text-indigo-500 transition-colors" />
                            <div className="space-y-3">
                                <h3 className="text-xl font-black uppercase tracking-tighter text-slate-400 italic">Forensic Terminal Idle</h3>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 max-w-[300px] mx-auto">Select a behavioral node from the grid to initialize the high-fidelity timeline.</p>
                            </div>
                        </div>
                    )}
                </div>

            </div>

        </div>
    );
}
