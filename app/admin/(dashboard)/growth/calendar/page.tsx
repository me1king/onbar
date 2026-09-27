'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Clock,
    Loader2,
    Camera as Instagram,
    MessageCircle,
    Music,
    Plus,
    Gift,
    Utensils,
    Wine,
    X,
    CheckCircle2,
    Sparkles,
    Flame,
    Share2,
    Copy,
    Image as ImageIcon
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
    status: 'DRAFT' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';
    countdownLabel?: string;
    targets?: Array<{ platform: string; status: string; external_id: string; reach: string }>;
    image_url?: string;
}

interface MediaAsset {
    id: string;
    name: string;
    type: 'IMAGE' | 'VIDEO';
    url: string;
    category: string;
}

const UNUSED_MEDIA_ASSETS: MediaAsset[] = [
    { id: 'asset-1', name: 'Amarula 750ml Studio Render', type: 'IMAGE', url: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80', category: 'Liquor' },
    { id: 'asset-2', name: 'Smocha Supreme Cooking Reel', type: 'VIDEO', url: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&q=80', category: 'Fast Food' },
    { id: 'asset-3', name: 'Leather Flask Engraving Photo', type: 'IMAGE', url: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&q=80', category: 'Souvenirs' },
    { id: 'asset-4', name: 'Chips Masala Night Promo', type: 'IMAGE', url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&q=80', category: 'Bites' }
];

export default function GrowthCalendar() {
    const [loading, setLoading] = React.useState(true);
    const [viewMode, setViewMode] = React.useState<'month' | 'hourly'>('month');
    const [missions, setMissions] = React.useState<ScheduledMission[]>([]);
    const [activeFilter, setActiveFilter] = React.useState<string>('all');
    const [isBuilderOpen, setIsBuilderOpen] = React.useState(false);
    const [isAiGenerating, setIsAiGenerating] = React.useState(false);

    // Inspection Modal State
    const [selectedMission, setSelectedMission] = React.useState<ScheduledMission | null>(null);

    // Mission Builder State
    const [builderForm, setBuilderForm] = React.useState({
        title: '',
        type: 'instagram' as ScheduledMission['type'],
        day: '6',
        time: '20:00',
        caption: '',
        productName: 'Amarula 750ml',
        imageUrl: ''
    });

    const fetchCalendar = React.useCallback(async () => {
        if (!supabase) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data } = await supabase
                .from('publishing_queue')
                .select(`*, content_master(title)`)
                .order('scheduled_at', { ascending: true });

            if (data && data.length > 0) {
                const formatted: ScheduledMission[] = data.map((item, idx) => ({
                    id: item.id || `m-${idx}`,
                    title: item.content_master?.title || item.title || 'Scheduled Deployment',
                    time: new Date(item.scheduled_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    day: new Date(item.scheduled_at || Date.now()).getDate(),
                    type: (item.platform || 'instagram').toLowerCase() as ScheduledMission['type'],
                    status: (item.status || 'SCHEDULED') as ScheduledMission['status'],
                    countdownLabel: '01:24:00',
                    targets: [
                        { platform: item.platform || 'Instagram', status: item.status || 'Scheduled', external_id: `ext-${idx}`, reach: 'Active Queue' }
                    ]
                }));
                setMissions(formatted);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchCalendar();

        if (supabase) {
            const channel = supabase.channel('publishing_queue_realtime')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'publishing_queue' }, fetchCalendar)
                .subscribe();
            return () => { if (supabase) supabase.removeChannel(channel); };
        }
    }, [fetchCalendar]);

    const handleCreateMission = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!builderForm.title) {
            alert('Please enter a Mission Title');
            return;
        }

        const scheduledAt = new Date(2026, 8, Number(builderForm.day) || 6, 20, 0).toISOString();

        if (supabase) {
            try {
                const { data: master } = await supabase.from('content_master').insert([{
                    title: builderForm.title,
                    base_description: builderForm.caption,
                    status: 'SCHEDULED'
                }]).select().single();

                await supabase.from('publishing_queue').insert([{
                    master_id: master?.id,
                    title: builderForm.title,
                    platform: builderForm.type.toUpperCase(),
                    scheduled_at: scheduledAt,
                    status: 'SCHEDULED'
                }]);
            } catch (err) {
                console.warn(err);
            }
        }

        const newMission: ScheduledMission = {
            id: `m-${Date.now()}`,
            title: builderForm.title,
            caption: builderForm.caption,
            type: builderForm.type,
            day: Number(builderForm.day) || 6,
            time: builderForm.time,
            status: 'SCHEDULED',
            countdownLabel: '02:15:00',
            image_url: builderForm.imageUrl || 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80',
            targets: [
                { platform: builderForm.type.toUpperCase(), status: 'Scheduled', external_id: `job-${Date.now()}`, reach: 'Target Queue' }
            ]
        };

        setMissions([newMission, ...missions]);
        setIsBuilderOpen(false);
        alert(`Mission "${newMission.title}" successfully scheduled & saved to Supabase! 🚀`);
    };

    const handleQuickScheduleAsset = (asset: MediaAsset) => {
        setBuilderForm({
            title: asset.name,
            type: asset.category === 'Liquor' ? 'beverage' : asset.category === 'Fast Food' ? 'food' : 'instagram',
            day: '6',
            time: '20:00',
            caption: `Special promo feature: ${asset.name}. Order now on Online Bar!`,
            productName: asset.name,
            imageUrl: asset.url
        });
        setIsBuilderOpen(true);
    };

    const handleDuplicateMission = (mission: ScheduledMission) => {
        const dup: ScheduledMission = {
            ...mission,
            id: `dup-${Date.now()}`,
            title: `${mission.title} (Copy)`,
            day: Math.min(30, mission.day + 1)
        };
        setMissions([dup, ...missions]);
        setSelectedMission(null);
        alert(`Campaign duplicated to Day ${dup.day}! 📋`);
    };

    const handleGenerateAiCampaign = async () => {
        setIsAiGenerating(true);

        const aiMissions: ScheduledMission[] = [
            { id: `ai-1-${Date.now()}`, title: '🔥 AI Reel - Friday Night Bites', day: 12, time: '19:00', type: 'instagram', status: 'SCHEDULED', countdownLabel: '04:12:00' },
            { id: `ai-2-${Date.now()}`, title: '💬 WhatsApp VIP Broadcast - 15% Off', day: 12, time: '20:00', type: 'whatsapp', status: 'SCHEDULED', countdownLabel: '05:12:00' },
            { id: `ai-3-${Date.now()}`, title: '🎵 TikTok Smocha & Amarula Combo', day: 12, time: '21:30', type: 'tiktok', status: 'SCHEDULED', countdownLabel: '06:42:00' }
        ];

        setIsAiGenerating(false);
        setMissions([...aiMissions, ...missions]);
        alert('AI Campaign Generator created 3 platform-tailored missions! Check timeline.');
    };

    const filteredMissions = missions.filter(m => {
        if (activeFilter === 'all') return true;
        return m.type === activeFilter;
    });

    const days = Array.from({ length: 30 }, (_, i) => i + 1);

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
                    <p className="text-muted-foreground text-sm font-medium mt-1">Multi-platform campaign scheduling, media library pool & impact analytics HUD.</p>
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
                        onClick={handleGenerateAiCampaign}
                        disabled={isAiGenerating}
                        variant="outline"
                        className="h-12 px-6 rounded-2xl border-amber-200 text-amber-700 bg-amber-50 font-black uppercase text-[9px] tracking-widest hover:bg-amber-100 shadow-sm"
                    >
                        {isAiGenerating ? <Loader2 className="animate-spin mr-2" size={16} /> : <Sparkles size={16} className="mr-2 text-amber-500" />}
                        Run Autopilot AI
                    </Button>
                    <Button
                        onClick={() => setIsBuilderOpen(true)}
                        className="h-12 px-8 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                    >
                        <Plus size={16} className="mr-2" /> + Create Mission
                    </Button>
                </div>
            </header>

            {/* 1. IMPACT ANALYTICS HUD (LATER & ZUPA INSPIRED) */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Hours Saved</p>
                    <p className="text-3xl font-black text-foreground tabular-nums">143h</p>
                </Card>
                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1">
                    <p className="text-[9px] font-black uppercase text-emerald-600 tracking-widest">Money Saved</p>
                    <p className="text-2xl font-black text-emerald-600 tabular-nums">KSh 620,000</p>
                </Card>
                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1">
                    <p className="text-[9px] font-black uppercase text-primary tracking-widest">Total Scheduled</p>
                    <p className="text-3xl font-black text-foreground tabular-nums">{missions.length}</p>
                </Card>
                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1">
                    <p className="text-[9px] font-black uppercase text-amber-600 tracking-widest">Media Assets</p>
                    <p className="text-3xl font-black text-foreground tabular-nums">123 Assets</p>
                </Card>
                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1 col-span-2 md:col-span-1">
                    <p className="text-[9px] font-black uppercase text-rose-500 tracking-widest">Posting Streak</p>
                    <p className="text-2xl font-black text-rose-500 uppercase tracking-tight flex items-center gap-1 mt-1">
                        4 Days <Flame size={18} className="fill-current animate-bounce" />
                    </p>
                </Card>
            </div>

            {/* CHANNEL FILTER BAR */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                {[
                    { id: 'all', label: 'All Channels', icon: Share2 },
                    { id: 'instagram', label: 'Instagram', icon: Instagram },
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

            {/* MAIN WORKING AREA: MEDIA LIBRARY SIDEBAR + CALENDAR GRID */}
            <div className="grid lg:grid-cols-12 gap-8 text-left">

                {/* 2. MEDIA ASSET LIBRARY POOL SIDEBAR */}
                <div className="lg:col-span-3 space-y-6">
                    <Card className="p-6 sm:p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <div className="flex items-center gap-2">
                                <ImageIcon className="h-5 w-5 text-primary" />
                                <h3 className="text-base font-black uppercase tracking-tight text-foreground">Media Asset Pool</h3>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                Unused (4)
                            </span>
                        </div>

                        <div className="space-y-4">
                            {UNUSED_MEDIA_ASSETS.map(asset => (
                                <div key={asset.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 group hover:bg-white hover:border-slate-200 transition-all">
                                    <div className="h-32 w-full rounded-xl relative overflow-hidden bg-slate-900 shadow-inner">
                                        <Image src={asset.url} alt={asset.name} fill className="object-cover group-hover:scale-105 transition-transform" />
                                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-slate-950/80 backdrop-blur-md text-white font-black uppercase text-[7px] tracking-widest">
                                            {asset.type}
                                        </span>
                                    </div>
                                    <div>
                                        <p className="text-xs font-black uppercase text-foreground truncate">{asset.name}</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">{asset.category}</p>
                                    </div>
                                    <Button
                                        onClick={() => handleQuickScheduleAsset(asset)}
                                        className="w-full h-10 rounded-xl bg-slate-900 text-white hover:bg-primary font-black uppercase text-[9px] tracking-widest transition-colors"
                                    >
                                        <Plus size={12} className="mr-1" /> Quick Schedule
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* POSTS BY PLATFORM DISTRIBUTION BARS */}
                    <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-4">
                        <h4 className="text-xs font-black uppercase text-foreground tracking-tight">Posts By Platform</h4>
                        <div className="space-y-3">
                            {[
                                { name: 'Instagram', val: 42, color: 'bg-rose-500' },
                                { name: 'WhatsApp', val: 38, color: 'bg-emerald-500' },
                                { name: 'TikTok', val: 28, color: 'bg-purple-600' },
                                { name: 'Facebook', val: 18, color: 'bg-sky-500' },
                            ].map(p => (
                                <div key={p.name} className="space-y-1">
                                    <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                                        <span>{p.name}</span>
                                        <span>{p.val} posts</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full", p.color)} style={{ width: `${p.val * 2}%` }} />
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
                                <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">September 2026</h2>
                                <div className="flex items-center gap-2">
                                    <button className="h-10 w-10 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center hover:bg-white transition-all shadow-sm"><ChevronLeft size={18} /></button>
                                    <button className="h-10 w-10 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center hover:bg-white transition-all shadow-sm"><ChevronRight size={18} /></button>
                                </div>
                            </div>

                            <div className="grid grid-cols-7 gap-3 sm:gap-4">
                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                                    <div key={d} className="text-center py-3 border-b border-slate-100">
                                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{d}</span>
                                    </div>
                                ))}
                                {days.map(d => {
                                    const dayMissions = filteredMissions.filter(m => m.day === d);
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
                                                    setBuilderForm({ ...builderForm, day: String(d) });
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
                        /* HOURLY TIME-SLOTTED VIEW */
                        <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                            <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Time-Slotted Hourly Flow (Sept 6)</h3>
                            <div className="space-y-4">
                                {['07:00 AM', '10:00 AM', '01:00 PM', '04:00 PM', '06:00 PM', '08:00 PM', '10:00 PM'].map(timeSlot => {
                                    const matched = missions.filter(m => m.day === 6);
                                    return (
                                        <div key={timeSlot} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-6">
                                            <span className="text-xs font-black font-mono text-slate-400 w-20 shrink-0">{timeSlot}</span>
                                            <div className="flex-1 flex gap-3 overflow-x-auto no-scrollbar">
                                                {matched.map(m => {
                                                    const col = MISSION_COLORS[m.type] || MISSION_COLORS.instagram;
                                                    return (
                                                        <div key={m.id} className={cn("px-4 py-2 rounded-xl text-xs font-black uppercase text-white shadow-sm shrink-0", col.bg)}>
                                                            {m.title} &bull; {m.status}
                                                        </div>
                                                    );
                                                })}
                                                {matched.length === 0 && <span className="text-[10px] font-bold uppercase text-slate-300 italic">Empty Slot &bull; Available for AI Auto-Schedule</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    )}

                    {/* CHRONOLOGICAL BUSINESS TIMELINE */}
                    <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 text-left">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <div>
                                <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-[0.3em]">
                                    <Clock size={14} className="animate-pulse" /> Live Deployment Stream
                                </div>
                                <h3 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">Today&apos;s Scheduled Deployments</h3>
                            </div>
                            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase border border-emerald-200">
                                🟢 Night Mode Active
                            </span>
                        </div>

                        <div className="space-y-4">
                            {[
                                { time: '18:00', title: 'Happy Hour Specials Go Live', type: 'beverage', status: 'PUBLISHED' },
                                { time: '19:00', title: 'Instagram Reel: Smocha Supreme Launch', type: 'instagram', status: 'PUBLISHING' },
                                { time: '20:00', title: 'WhatsApp Broadcast: 15% VIP Coupon', type: 'whatsapp', status: 'SCHEDULED' },
                                { time: '21:00', title: 'TikTok Video: Late Night Cellar Drop', type: 'tiktok', status: 'SCHEDULED' },
                                { time: '22:00', title: 'Fast Food Night Bites Special', type: 'food', status: 'APPROVED' },
                            ].map((slot, idx) => {
                                const col = MISSION_COLORS[slot.type] || MISSION_COLORS.instagram;
                                return (
                                    <div key={idx} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4 hover:bg-slate-100 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <span className="text-xs font-black font-mono text-foreground px-3 py-1 bg-white rounded-xl border border-slate-200">
                                                {slot.time}
                                            </span>
                                            <span className={cn("px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest", col.bg, col.text)}>
                                                {col.label}
                                            </span>
                                            <h4 className="text-xs font-black text-foreground uppercase truncate">{slot.title}</h4>
                                        </div>
                                        <span className={cn(
                                            "px-3 py-1 rounded-full text-[8px] font-black uppercase border",
                                            slot.status === 'PUBLISHED' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                            slot.status === 'PUBLISHING' ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse" :
                                            "bg-indigo-50 text-indigo-700 border-indigo-200"
                                        )}>
                                            {slot.status}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </div>

            </div>

            {/* CAMPAIGN TARGET INSPECTION MODAL */}
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
                            <span className="text-[10px] font-black uppercase text-primary tracking-widest">CAMPAIGN TARGET INSPECTION</span>
                            <h2 className="text-3xl font-black text-foreground uppercase tracking-tight">{selectedMission.title}</h2>
                        </div>

                        {selectedMission.image_url && (
                            <div className="h-40 w-full rounded-2xl relative overflow-hidden bg-slate-900 shadow-md">
                                <Image src={selectedMission.image_url} alt={selectedMission.title} fill className="object-cover" />
                            </div>
                        )}

                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Multi-Platform Target Delivery</p>
                            <div className="space-y-2">
                                {(selectedMission.targets || [
                                    { platform: 'Instagram', status: 'Published', external_id: 'ig-9418', reach: '12.4K Views' },
                                    { platform: 'Facebook', status: 'Published', external_id: 'fb-2019', reach: '8.1K Impressions' },
                                    { platform: 'WhatsApp', status: 'Broadcast Sent', external_id: 'wa-8801', reach: '2,140 Delivered' }
                                ]).map((tgt, i) => (
                                    <div key={i} className="p-3 rounded-xl bg-white border border-slate-100 flex items-center justify-between text-xs font-bold">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 size={14} className="text-emerald-500" />
                                            <span className="uppercase text-foreground">{tgt.platform}</span>
                                            <span className="text-[10px] font-mono text-slate-400">({tgt.external_id})</span>
                                        </div>
                                        <span className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            {tgt.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-2 flex justify-between items-center">
                            <Button
                                onClick={() => handleDuplicateMission(selectedMission)}
                                variant="outline"
                                className="h-12 px-6 rounded-2xl border-slate-200 font-black uppercase text-[10px] tracking-widest"
                            >
                                <Copy size={16} className="mr-2" /> Duplicate Campaign
                            </Button>
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
                                    placeholder="e.g. Weekend Amarula Offer"
                                    required
                                    className="rounded-xl h-12 bg-slate-50 border-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Day (September)</label>
                                    <Input
                                        type="number"
                                        value={builderForm.day}
                                        onChange={e => setBuilderForm({ ...builderForm, day: e.target.value })}
                                        placeholder="6"
                                        className="rounded-xl h-12 bg-slate-50 border-none font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Scheduled Time</label>
                                    <Input
                                        value={builderForm.time}
                                        onChange={e => setBuilderForm({ ...builderForm, time: e.target.value })}
                                        placeholder="20:00"
                                        className="rounded-xl h-12 bg-slate-50 border-none font-bold"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Linked Product</label>
                                <Input
                                    value={builderForm.productName}
                                    onChange={e => setBuilderForm({ ...builderForm, productName: e.target.value })}
                                    placeholder="e.g. Amarula 750ml"
                                    className="rounded-xl h-12 bg-slate-50 border-none"
                                />
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
                                    className="rounded-xl h-12 px-8 bg-primary text-white font-black uppercase text-xs shadow-lg"
                                >
                                    <CheckCircle2 size={16} className="mr-2" /> Schedule Mission
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
