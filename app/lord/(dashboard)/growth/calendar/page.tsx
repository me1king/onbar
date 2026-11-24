'use client';

import * as React from 'react';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Camera as Instagram,
    MessageCircle,
    Music,
    Plus,
    Gift,
    Utensils,
    Wine,
    X,
    Share2,
    CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface ScheduledMission {
    id: string;
    title: string;
    caption?: string;
    time: string;
    day: number;
    type: 'instagram' | 'facebook' | 'whatsapp' | 'tiktok' | 'beverage' | 'food' | 'souvenir';
    status: 'DRAFT' | 'APPROVED' | 'SCHEDULED' | 'QUEUED' | 'PENDING_REVIEW' | 'PUBLISHING' | 'RETRYING' | 'PUBLISHED' | 'SUCCESS' | 'FAILED';
    scheduledAt: string;
    image_url?: string;
}

const MISSION_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    instagram: { bg: "bg-rose-50 border-rose-200", text: "text-rose-700", dot: "bg-rose-500", label: "Instagram" },
    facebook: { bg: "bg-indigo-50 border-indigo-200", text: "text-indigo-700", dot: "bg-indigo-500", label: "Facebook" },
    whatsapp: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500", label: "WhatsApp" },
    tiktok: { bg: "bg-slate-100 border-slate-300", text: "text-slate-900", dot: "bg-slate-900", label: "TikTok" },
    beverage: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", dot: "bg-amber-500", label: "Beverage" },
    food: { bg: "bg-orange-50 border-orange-200", text: "text-orange-700", dot: "bg-orange-500", label: "Food" },
    souvenir: { bg: "bg-purple-50 border-purple-200", text: "text-purple-700", dot: "bg-purple-500", label: "Souvenir" }
};

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error
        && typeof error.message === 'string') {
        return error.message;
    }
    return fallback;
}

export default function GrowthCalendar() {
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [notice, setNotice] = React.useState<string | null>(null);
    const [viewMode, setViewMode] = React.useState<'month' | 'hourly'>('month');
    const [calendarDate, setCalendarDate] = React.useState(() => new Date());
    const [missions, setMissions] = React.useState<ScheduledMission[]>([]);
    const [activeFilter, setActiveFilter] = React.useState<string>('all');
    const [isBuilderOpen, setIsBuilderOpen] = React.useState(false);

    // Inspection Modal State
    const [selectedMission, setSelectedMission] = React.useState<ScheduledMission | null>(null);

    // Mission Builder State
    const [builderForm, setBuilderForm] = React.useState({
        title: '',
        type: 'instagram' as ScheduledMission['type'],
        day: String(new Date().getDate()),
        time: new Date().toTimeString().slice(0, 5),
        caption: ''
    });

    const fetchCalendar = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/admin/growth-calendar', { cache: 'no-store' });
            const payload = await response.json() as { missions?: unknown; error?: string };
            if (!response.ok) throw new Error(payload.error || 'Unable to load the publishing queue.');
            if (!Array.isArray(payload.missions)) throw new Error('The publishing queue returned an invalid response.');
            const formatted: ScheduledMission[] = payload.missions.map((item: {
                id: string;
                title: string;
                scheduledAt: string;
                type: string;
                status: string;
                caption?: string | null;
                image_url?: string | null;
            }) => {
                const scheduledAt = new Date(item.scheduledAt);
                return {
                    id: item.id,
                    title: item.title,
                    time: scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    day: scheduledAt.getDate(),
                    scheduledAt: scheduledAt.toISOString(),
                    type: item.type as ScheduledMission['type'],
                    status: item.status as ScheduledMission['status'],
                    caption: item.caption || undefined,
                    image_url: item.image_url || undefined
                };
            });
            setMissions(formatted);
        } catch (err) {
            console.error('Publishing queue fetch error:', err);
            setError(getErrorMessage(err, 'Unable to load the publishing queue.'));
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        void fetchCalendar();
        const interval = window.setInterval(() => void fetchCalendar(), 30_000);
        return () => window.clearInterval(interval);
    }, [fetchCalendar]);

    const handleCreateMission = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!builderForm.title.trim()) {
            setError('Enter a title before scheduling.');
            return;
        }

        const day = Number(builderForm.day);
        const [hours, minutes] = builderForm.time.split(':').map(Number);
        const scheduledDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day, hours, minutes);
        if (!Number.isInteger(day) || day < 1 || day > new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate()
            || !Number.isInteger(hours) || hours < 0 || hours > 23
            || !Number.isInteger(minutes) || minutes < 0 || minutes > 59
            || Number.isNaN(scheduledDate.getTime())) {
            setError('Select a valid date and time.');
            return;
        }

        setError(null);
        setNotice(null);
        setSaving(true);
        try {
            const response = await fetch('/api/admin/growth-calendar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: builderForm.title.trim(),
                    platform: builderForm.type,
                    scheduledAt: scheduledDate.toISOString(),
                    caption: builderForm.caption.trim()
                })
            });
            const payload = await response.json() as { error?: string };
            if (!response.ok) throw new Error(payload.error || 'Unable to save the schedule.');

            await fetchCalendar();
            setIsBuilderOpen(false);
            setNotice('Schedule saved to the internal queue. It will not publish until platform integrations are configured.');
        } catch (err) {
            console.error('Publishing queue save error:', err);
            setError(getErrorMessage(err, 'Unable to save the schedule.'));
        } finally {
            setSaving(false);
        }
    };

    const filteredMissions = missions.filter(m => {
        if (activeFilter === 'all') return true;
        return m.type === activeFilter;
    });

    const days = Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate() }, (_, i) => i + 1);
    const calendarCells: (number | null)[] = [
        ...Array((new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay() + 6) % 7).fill(null),
        ...days
    ];
    const visibleMissions = filteredMissions.filter(mission => {
        const date = new Date(mission.scheduledAt);
        return date.getFullYear() === calendarDate.getFullYear() && date.getMonth() === calendarDate.getMonth();
    });
    const platformRecords = [
        { name: 'Instagram', type: 'instagram', color: 'bg-rose-500' },
        { name: 'WhatsApp', type: 'whatsapp', color: 'bg-emerald-500' },
        { name: 'TikTok', type: 'tiktok', color: 'bg-purple-600' },
        { name: 'Facebook', type: 'facebook', color: 'bg-sky-500' }
    ].map(platform => ({
        ...platform,
        count: missions.filter(mission => mission.type === platform.type).length
    }));
    const maxPlatformRecords = Math.max(1, ...platformRecords.map(platform => platform.count));

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left selection:bg-primary/20 pb-40">
            {/* HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <CalendarIcon className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">BAR OS MISSION CONTROL 3.0</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Content Studio & Calendar</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Review records saved to the internal publishing queue. Queue status does not confirm external delivery.</p>
                </div>
                <div className="flex gap-4 items-center flex-wrap">
                    <div className="flex p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
                        <button
                            onClick={() => setViewMode('month')}
                            className={cn("px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all", viewMode === 'month' ? "bg-primary text-white" : "text-slate-500 hover:text-foreground")}
                        >
                            Month Grid
                        </button>
                        <button
                            onClick={() => setViewMode('hourly')}
                            className={cn("px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all", viewMode === 'hourly' ? "bg-primary text-white" : "text-slate-500 hover:text-foreground")}
                        >
                            Hourly Flow
                        </button>
                    </div>

                    <Button
                        onClick={() => {
                            setBuilderForm(form => ({ ...form, day: String(calendarDate.getDate()) }));
                            setIsBuilderOpen(true);
                        }}
                        className="h-12 px-8 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                    >
                        <Plus size={16} className="mr-2" /> + Create Mission
                    </Button>
                </div>
            </header>

            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</p>}
            {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{notice}</p>}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Queue Records</p>
                    <p className="text-3xl font-black text-foreground tabular-nums">{missions.length.toLocaleString()}</p>
                </Card>
                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1">
                    <p className="text-[9px] font-black uppercase text-indigo-600 tracking-widest">Scheduled</p>
                    <p className="text-3xl font-black text-indigo-600 tabular-nums">{missions.filter(mission => ['SCHEDULED', 'QUEUED', 'PUBLISHING', 'RETRYING'].includes(mission.status)).length.toLocaleString()}</p>
                </Card>
                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1">
                    <p className="text-[9px] font-black uppercase text-emerald-600 tracking-widest">Published Records</p>
                    <p className="text-3xl font-black text-emerald-600 tabular-nums">{missions.filter(mission => mission.status === 'PUBLISHED' || mission.status === 'SUCCESS').length.toLocaleString()}</p>
                </Card>
                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1">
                    <p className="text-[9px] font-black uppercase text-rose-600 tracking-widest">Failed Records</p>
                    <p className="text-3xl font-black text-rose-600 tabular-nums">{missions.filter(mission => mission.status === 'FAILED').length.toLocaleString()}</p>
                </Card>
                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1 col-span-2 md:col-span-1">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Queue Source</p>
                    <p className="text-xl font-black text-slate-600 uppercase tracking-tight flex items-center gap-1 mt-1">
                        Protected API
                    </p>
                </Card>
            </div>

            {/* CHANNEL FILTER BAR */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                {[
                    { id: 'all', label: 'All Channels', icon: Share2 },
                    { id: 'instagram', label: 'Instagram', icon: Instagram },
                    { id: 'facebook', label: 'Facebook', icon: Share2 },
                    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
                    { id: 'tiktok', label: 'TikTok', icon: Music },
                    { id: 'beverage', label: 'Beverage Launch', icon: Wine },
                    { id: 'food', label: 'Fast Food', icon: Utensils },
                    { id: 'souvenir', label: 'Souvenir Drop', icon: Gift },
                ].map(ch => (
                    <button
                        key={ch.id}
                        onClick={() => setActiveFilter(ch.id)}
                        className={cn(
                            "px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2 border shadow-sm",
                            activeFilter === ch.id
                                ? "bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-105"
                                : "bg-white text-slate-500 border-slate-200/80 hover:bg-slate-100"
                        )}
                    >
                        <ch.icon size={14} />
                        {ch.label}
                    </button>
                ))}
            </div>

            {/* SCHEDULED QUEUE AND CALENDAR */}
            <div className="grid lg:grid-cols-12 gap-8 text-left">
                <div className="lg:col-span-3 space-y-6">
                    <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-4">
                        <h4 className="text-xs font-black uppercase text-foreground tracking-tight">Queue Records by Platform</h4>
                        <div className="space-y-3">
                            {platformRecords.map(p => (
                                <div key={p.name} className="space-y-1">
                                    <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                                        <span>{p.name}</span>
                                        <span>{p.count} records</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full", p.color)} style={{ width: `${(p.count / maxPlatformRecords) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                {/* 3. CALENDAR GRID / HOURLY FLOW */}
                <div className="lg:col-span-9 space-y-8">
                    {loading && missions.length === 0 ? (
                        <div className="h-[600px] flex flex-col items-center justify-center gap-4 bg-white rounded-[3rem] border border-slate-100 shadow-sm animate-pulse">
                            <Loader2 className="h-10 w-10 text-primary animate-spin" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Synchronizing Mission Control...</p>
                        </div>
                    ) : viewMode === 'month' ? (
                        <div className="bg-white rounded-[3.5rem] border border-slate-200/80 p-8 sm:p-10 shadow-md space-y-8">
                            <div className="flex justify-between items-center px-4">
                                <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">
                                    {calendarDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                </h2>
                                <div className="flex items-center gap-2">
                                            <button
                                                aria-label="Previous month"
                                                onClick={() => setCalendarDate(date => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
                                                className="h-10 w-10 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center hover:bg-white transition-all shadow-sm"
                                            ><ChevronLeft size={18} /></button>
                                            <button
                                                aria-label="Next month"
                                                onClick={() => setCalendarDate(date => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
                                                className="h-10 w-10 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center hover:bg-white transition-all shadow-sm"
                                            ><ChevronRight size={18} /></button>
                                </div>
                            </div>

                            <div className="grid grid-cols-7 gap-3 sm:gap-4">
                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                                    <div key={d} className="text-center py-3 border-b border-slate-100">
                                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{d}</span>
                                    </div>
                                ))}
                                {calendarCells.map((d, index) => {
                                    if (d === null) return <div key={`empty-${index}`} aria-hidden="true" />;
                                    const dayMissions = visibleMissions.filter(m => m.day === d);
                                    return (
                                        <div key={d} className={cn(
                                            "min-h-[120px] p-3 rounded-2xl border transition-all flex flex-col gap-2 relative group",
                                            dayMissions.length > 0 ? "bg-white border-slate-200/80 shadow-sm" : "bg-slate-50/50 border-transparent hover:border-slate-200/60"
                                        )}>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-slate-400">{d}</span>
                                                {/* Color-coded platform dots */}
                                                {dayMissions.length > 0 && (
                                                    <div className="flex gap-1">
                                                        {dayMissions.map((m, idx) => (
                                                            <span key={idx} className={cn("h-2 w-2 rounded-full", (MISSION_COLORS[m.type] || MISSION_COLORS.instagram).dot)} />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-1.5 overflow-y-auto max-h-[85px] no-scrollbar">
                                                {dayMissions.map(m => {
                                                    const col = MISSION_COLORS[m.type] || MISSION_COLORS.instagram;
                                                    return (
                                                        <div
                                                            key={m.id}
                                                            onClick={() => setSelectedMission(m)}
                                                            className={cn(
                                                                "px-2 py-1.5 rounded-lg text-[7px] font-black uppercase truncate border cursor-pointer hover:scale-105 transition-transform shadow-sm flex items-center justify-between gap-1",
                                                                col.bg, col.text
                                                            )}
                                                        >
                                                            <span className="truncate">{m.title}</span>
                                                            <span className="text-[6px] font-mono opacity-80 shrink-0">{m.status}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setBuilderForm(form => ({ ...form, day: String(d) }));
                                                    setIsBuilderOpen(true);
                                                }}
                                                className="absolute bottom-2 right-2 h-6 w-6 rounded-lg bg-slate-100 text-slate-400 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center hover:bg-primary hover:text-white"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                            <h3 className="text-xl font-black uppercase tracking-tight text-foreground">
                                {calendarDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} queue
                            </h3>
                            {visibleMissions.length === 0 ? (
                                <p className="py-8 text-center text-sm font-bold text-slate-500">No scheduled records for this month.</p>
                            ) : visibleMissions
                                .slice()
                                .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
                                .map(mission => (
                                    <button
                                        key={mission.id}
                                        onClick={() => setSelectedMission(mission)}
                                        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left hover:bg-slate-100"
                                    >
                                        <span className="min-w-0 truncate text-xs font-black uppercase text-foreground">{mission.title}</span>
                                        <span className="shrink-0 text-xs font-bold text-slate-500">
                                            {new Date(mission.scheduledAt).toLocaleString()}
                                        </span>
                                        <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[8px] font-black uppercase text-slate-600">
                                            {mission.status}
                                        </span>
                                    </button>
                                ))}
                        </Card>
                    )}

                </div>

            </div>

            {/* QUEUE RECORD DETAILS */}
            {selectedMission && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] p-8 sm:p-10 max-w-lg w-full space-y-6 shadow-2xl relative border border-slate-100 text-left">
                        <button
                            onClick={() => setSelectedMission(null)}
                            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-slate-100 text-slate-500 hover:text-foreground flex items-center justify-center transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-primary tracking-widest">Internal queue record</span>
                            <h2 className="text-3xl font-black text-foreground uppercase tracking-tight">{selectedMission.title}</h2>
                        </div>

                        {selectedMission.image_url && (
                            <div className="h-40 w-full rounded-2xl relative overflow-hidden bg-slate-900 shadow-md">
                                <Image src={selectedMission.image_url} alt={selectedMission.title} fill className="object-cover" />
                            </div>
                        )}

                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 text-xs">
                            <p><strong>Platform:</strong> {selectedMission.type}</p>
                            <p><strong>Status:</strong> {selectedMission.status}</p>
                            <p><strong>Scheduled:</strong> {new Date(selectedMission.scheduledAt).toLocaleString()}</p>
                            <p className="break-words"><strong>Caption:</strong> {selectedMission.caption || 'No caption recorded.'}</p>
                            <p className="font-bold text-slate-500">Queue status does not confirm delivery to the platform.</p>
                        </div>

                        <div className="pt-2 flex justify-end items-center">
                            <Button
                                onClick={() => setSelectedMission(null)}
                                className="h-12 px-8 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest"
                            >
                                Close Inspection
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP-BY-STEP MISSION BUILDER MODAL */}
            {isBuilderOpen && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] p-8 sm:p-10 max-w-lg w-full space-y-6 shadow-2xl relative border border-slate-100 text-left max-h-[90vh] overflow-y-auto no-scrollbar">
                        <button
                            onClick={() => setIsBuilderOpen(false)}
                            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-slate-100 text-slate-500 hover:text-foreground flex items-center justify-center transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-primary tracking-widest">MISSION BUILDER</span>
                            <h2 className="text-3xl font-black text-foreground uppercase tracking-tight">Schedule New Mission</h2>
                        </div>

                        <form onSubmit={handleCreateMission} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Mission Type</label>
                                <select
                                    value={builderForm.type}
                                    onChange={e => setBuilderForm({ ...builderForm, type: e.target.value as ScheduledMission['type'] })}
                                    className="w-full rounded-xl h-12 bg-slate-50 border-none px-3 text-xs font-bold"
                                >
                                    <option value="instagram">Instagram Reel / Post</option>
                                    <option value="facebook">Facebook Post / Event</option>
                                    <option value="whatsapp">WhatsApp Broadcast</option>
                                    <option value="tiktok">TikTok Video</option>
                                    <option value="beverage">Beverage Launch</option>
                                    <option value="food">Fast Food Special</option>
                                    <option value="souvenir">Souvenir Drop</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Mission Title</label>
                                <Input
                                    value={builderForm.title}
                                    onChange={e => setBuilderForm({ ...builderForm, title: e.target.value })}
                                    placeholder="Enter a schedule title"
                                    required
                                    className="rounded-xl h-12 bg-slate-50 border-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">
                                        Day ({calendarDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })})
                                    </label>
                                    <Input
                                        type="number"
                                        min="1"
                                        max={days.length}
                                        value={builderForm.day}
                                        onChange={e => setBuilderForm({ ...builderForm, day: e.target.value })}
                                        required
                                        className="rounded-xl h-12 bg-slate-50 border-none font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Scheduled Time</label>
                                    <Input
                                        type="time"
                                        value={builderForm.time}
                                        onChange={e => setBuilderForm({ ...builderForm, time: e.target.value })}
                                        required
                                        className="rounded-xl h-12 bg-slate-50 border-none font-bold"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Caption / Message</label>
                                <Textarea
                                    value={builderForm.caption}
                                    onChange={e => setBuilderForm({ ...builderForm, caption: e.target.value })}
                                    placeholder="Enter campaign message or social post caption..."
                                    className="rounded-xl bg-slate-50 border-none text-xs"
                                    rows={3}
                                />
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <Button
                                    type="button"
                                    onClick={() => setIsBuilderOpen(false)}
                                    variant="ghost"
                                    className="rounded-xl h-12 px-6 font-bold text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={saving}
                                    className="rounded-xl h-12 px-8 bg-primary text-white font-black uppercase text-xs shadow-lg"
                                >
                                    <CheckCircle2 size={16} className="mr-2" /> {saving ? 'Saving…' : 'Schedule Mission'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
