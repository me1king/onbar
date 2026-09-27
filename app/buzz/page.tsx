'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Flame,
    TrendingUp,
    Zap,
    Wine,
    ChevronRight,
    MapPin,
    Smartphone,
    Clock,
    Loader2,
    ArrowRight,
    Sparkles,
    CheckCircle2,
    X,
    Sun,
    ShoppingBag,
    Radio,
    Check
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, normalizeImage } from '@/lib/utils';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import PulseDetailModal from '@/components/buzz/PulseDetailModal';
import BuildMyNightWidget from '@/components/widgets/concierge/BuildMyNightWidget';
import BuzzStoryCard, { BuzzStory } from '@/components/buzz/BuzzStoryCard';
import { useCart } from '@/context/CartContext';
import Image from 'next/image';

const LiveBuzzMap = dynamic(() => import('@/components/buzz/TheBuzzMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-slate-100 animate-pulse rounded-[3.5rem]" />
});

interface BuzzArea {
    id: string;
    zone_name: string;
    buzz_score: number;
    buzz_status: 'BUZZING' | 'BUSY' | 'ACTIVE' | 'QUIET';
    active_visitors: number;
    active_orders: number;
    confidence?: number;
}

interface DBBuzzPost {
    id: string;
    title: string;
    description: string | null;
    area_zone: string | null;
    category: { label: string } | null;
    status: string;
    trend_score: number;
    latitude: number;
    longitude: number;
    start_at: string;
    media: Array<{ media_type: string, url: string }> | null;
}

const VENUE_STORIES_BUBBLES = [
    { name: 'K1 Clubhouse', avatar: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&q=80', status: 'LIVE', liveTag: 'DJ JOE' },
    { name: 'The Alchemist', avatar: 'https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?auto=format&fit=crop&q=80', status: 'LIVE', liveTag: 'BOILER ROOM' },
    { name: 'Quiver Lounge', avatar: 'https://images.unsplash.com/photo-1571266028243-e4733b0f0bb1?auto=format&fit=crop&q=80', status: 'HOT', liveTag: 'SUNDAY SCHOOL' },
    { name: 'Brew Bistro', avatar: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&q=80', status: 'LIVE', liveTag: 'BEER FEST' },
    { name: 'Online Bar HQ', avatar: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&q=80', status: 'STATION', liveTag: 'EXPRESS NODE' },
];

export default function TheBuzzDiscovery() {
    const [hotspots, setHotspots] = React.useState<BuzzArea[]>([]);
    const [stories, setStories] = React.useState<BuzzStory[]>([]);
    const [selectedArea, setSelectedArea] = React.useState<BuzzArea | null>(null);
    const [isDetailOpen, setIsDetailOpen] = React.useState(false);
    const [filter, setFilter] = React.useState<'trending' | 'near-me' | 'tonight'>('trending');
    const [loading, setLoading] = React.useState(true);
    const [nightPlannerOpen, setNightPlannerOpen] = React.useState(false);
    const [addedCartId, setAddedCartId] = React.useState<string | number | null>(null);

    // Live Happy Hour Countdown Timer (Seconds)
    const [countdownSeconds, setCountdownSeconds] = React.useState(512);

    const { addToCart } = useCart();

    React.useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('planner') === 'true') {
                setNightPlannerOpen(true);
            }
        }
    }, []);

    // Live Happy Hour Countdown Effect
    React.useEffect(() => {
        const timer = setInterval(() => {
            setCountdownSeconds(prev => (prev > 0 ? prev - 1 : 1800));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const formatCountdown = (totalSeconds: number) => {
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const fetchBuzzData = React.useCallback(async () => {
        if (!supabase) return;
        setLoading(true);
        try {
            const [hotspotsRes, storiesRes] = await Promise.all([
                supabase.from('buzz_metrics').select('*').order('buzz_score', { ascending: false }),
                supabase.from('buzz_posts').select('*, category:buzz_categories(label), media:buzz_media(*)').in('status', ['LIVE', 'TRENDING', 'STARTING_SOON']).order('trend_score', { ascending: false })
            ]);

            if (hotspotsRes.data) {
                const data = (hotspotsRes.data as Array<{ zone_name: string, buzz_score: number, buzz_status: string, active_visitors: number, active_orders: number }>).map((h, i) => {
                    // BAR OS Dynamic Hotspot Formula: Score = (Orders * 5) + (Visitors * 0.2) + Base
                    const computedScore = Math.min(99, Math.max(65, (h.active_orders * 5) + Math.round((h.active_visitors || 100) * 0.15)));
                    return {
                        id: String(i),
                        zone_name: h.zone_name,
                        buzz_score: computedScore,
                        buzz_status: computedScore > 88 ? 'BUZZING' : computedScore > 75 ? 'BUSY' : 'ACTIVE',
                        active_visitors: h.active_visitors,
                        active_orders: h.active_orders,
                        confidence: 94
                    };
                });
                setHotspots(data as BuzzArea[]);
                if (data.length > 0) setSelectedArea(data[0] as BuzzArea);
            }

            if (storiesRes.data) {
                setStories((storiesRes.data as unknown as DBBuzzPost[]).map((s) => ({
                    id: s.id,
                    title: s.title,
                    description: s.description || '',
                    area_zone: s.area_zone || 'Nairobi',
                    category: s.category?.label || 'General',
                    status: s.status,
                    trend_score: s.trend_score,
                    latitude: Number(s.latitude),
                    longitude: Number(s.longitude),
                    starts_at: s.start_at,
                    media: s.media?.map((m) => ({ type: m.media_type as 'IMAGE' | 'VIDEO', url: m.url })) || [],
                    distance: '1.2 km'
                })));
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    React.useEffect(() => {
        fetchBuzzData();
    }, [fetchBuzzData]);

    const handleQuickAdd = (id: string | number, name: string, price: number, image: string, category: string) => {
        addToCart({
            id: Number(id) || Date.now(),
            name,
            price,
            base_price: price,
            image: normalizeImage(image),
            quantity: 1,
            category
        });
        setAddedCartId(id);
        setTimeout(() => setAddedCartId(null), 2000);
    };

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300">Synchronizing City Signal...</p>
        </div>
    );

    return (
        <div
            className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 text-left selection:bg-primary/20 pb-40 animate-in fade-in duration-1000 relative overflow-hidden"
            style={{
                background: 'radial-gradient(circle at top right, rgba(248, 164, 0, 0.12), transparent 45%), radial-gradient(circle at bottom left, rgba(30, 58, 138, 0.1), transparent 45%), #FFFFFF'
            }}
        >
            <div className="max-w-7xl mx-auto space-y-16 relative z-10">

                {/* 🏙️ BREATHING HERO & LIVE CITY METRICS */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-10 border-b border-slate-100 pb-12 relative overflow-hidden">
                    {/* Equalizer Sound Waves Background Animation */}
                    <div className="absolute top-0 right-1/3 opacity-10 flex items-end gap-1 h-32 pointer-events-none">
                        {[40, 80, 50, 95, 30, 70, 100, 60, 85, 45, 90, 35].map((h, i) => (
                            <div key={i} className="w-2 bg-primary rounded-t-full animate-pulse" style={{ height: `${h}%`, animationDuration: `${0.6 + (i % 5) * 0.2}s` }} />
                        ))}
                    </div>

                    <div className="space-y-4 max-w-xl">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><Sparkles size={20} fill="currentColor" /></div>
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Nairobi Intelligence Node</span>
                        </div>
                        <h1 className="text-5xl lg:text-7xl font-black text-foreground uppercase tracking-tighter leading-[0.85] italic">
                            The <br /> <span className="text-primary italic">City Buzz.</span>
                        </h1>
                        <p className="text-slate-500 text-lg font-medium italic leading-relaxed">
                            &quot;Nairobi is alive. Verified hotspots, live DJ events, hot street bites, and instant drink dispatch.&quot;
                        </p>
                    </div>

                    {/* LIVE METRICS HUD & WEATHER INTEGRATION */}
                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                        {/* Weather Widget */}
                        <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-[2.5rem] flex items-center gap-4 shrink-0 shadow-sm">
                            <div className="h-12 w-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md">
                                <Sun size={24} className="animate-spin-slow" />
                            </div>
                            <div>
                                <p className="text-2xl font-black text-amber-950 leading-none">22°C</p>
                                <p className="text-[9px] font-black uppercase text-amber-800 tracking-wider mt-1">Clear &bull; Perfect Rooftop Weather</p>
                            </div>
                        </div>

                        {/* Live City Stats */}
                        <div className="bg-white/90 backdrop-blur-md p-6 rounded-[2.5rem] border border-slate-200/80 flex items-center gap-6 shadow-md shrink-0">
                            <div className="space-y-1">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Live Browsing</p>
                                <p className="text-2xl font-black text-foreground tabular-nums leading-none">128</p>
                            </div>
                            <div className="h-8 w-px bg-slate-200" />
                            <div className="space-y-1">
                                <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Active Orders</p>
                                <p className="text-2xl font-black text-emerald-600 tabular-nums leading-none">42</p>
                            </div>
                        </div>

                        <Button
                            onClick={() => setNightPlannerOpen(true)}
                            className="h-20 px-8 rounded-[2.5rem] bg-primary text-white font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all shrink-0"
                        >
                            <Zap className="h-4 w-4 mr-2 fill-current" /> Build My Night
                        </Button>
                    </div>
                </header>

                {/* 📱 INSTAGRAM-STYLE LIVE VENUE STORIES */}
                <section className="space-y-4 text-left">
                    <div className="flex items-center gap-2 px-2">
                        <Radio size={16} className="text-rose-500 animate-pulse" />
                        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-foreground">Live Venue Stories</h3>
                    </div>
                    <div className="flex gap-6 overflow-x-auto no-scrollbar py-2">
                        {VENUE_STORIES_BUBBLES.map((v, i) => (
                            <div key={i} className="flex flex-col items-center gap-2 shrink-0 group cursor-pointer">
                                <div className="p-1 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 shadow-md group-hover:scale-110 transition-transform">
                                    <div className="h-16 w-16 rounded-full border-2 border-white relative overflow-hidden bg-slate-900">
                                        <Image src={v.avatar} alt={v.name} fill className="object-cover" />
                                    </div>
                                </div>
                                <div className="text-center space-y-0.5">
                                    <p className="text-[10px] font-black uppercase text-foreground truncate max-w-[80px]">{v.name}</p>
                                    <span className="text-[8px] font-extrabold uppercase tracking-widest text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                                        {v.liveTag}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ⏱️ LIVE COUNTDOWN & FAST FOOD CROSS-SELL BANNER */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Happy Hour Live Countdown Card */}
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-amber-200/80 shadow-md flex flex-col justify-between text-left relative overflow-hidden group">
                        <div className="space-y-3 relative z-10">
                            <div className="flex justify-between items-center">
                                <span className="px-3 py-1 rounded-full bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest shadow-md">
                                    🍻 HAPPY HOUR SPECIAL
                                </span>
                                <Clock size={16} className="text-amber-500 animate-pulse" />
                            </div>
                            <h3 className="text-2xl font-black text-foreground uppercase tracking-tight leading-none">2 for 1 Amarula</h3>
                            <p className="text-xs text-slate-500 font-medium italic">Buy one Amarula 750ml, get second bottle at 50% off.</p>
                        </div>
                        <div className="pt-6 relative z-10 flex items-center justify-between border-t border-amber-100">
                            <div>
                                <p className="text-[9px] font-black uppercase text-slate-400">Ends In</p>
                                <p className="text-3xl font-black text-primary font-mono tabular-nums tracking-wider">{formatCountdown(countdownSeconds)}</p>
                            </div>
                            <Button
                                onClick={() => handleQuickAdd(1001, 'Amarula 750ml (2 for 1 Offer)', 2600, 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80', 'Liquor')}
                                className="h-12 px-6 rounded-2xl bg-amber-500 text-white font-black uppercase text-[10px] tracking-widest hover:bg-amber-600 shadow-md"
                            >
                                {addedCartId === 1001 ? <Check size={16} /> : <><ShoppingBag size={14} className="mr-1" /> Claim Offer</>}
                            </Button>
                        </div>
                    </Card>

                    {/* Fast Food Cross-Sell: Smocha Supreme */}
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md flex flex-col justify-between text-left relative overflow-hidden group">
                        <div className="space-y-3 relative z-10">
                            <div className="flex justify-between items-center">
                                <span className="px-3 py-1 rounded-full bg-rose-500 text-white text-[9px] font-black uppercase tracking-widest shadow-md">
                                    🌭 HOT STREET BITE
                                </span>
                                <span className="text-[9px] font-black uppercase text-emerald-600">12 min prep</span>
                            </div>
                            <h3 className="text-2xl font-black text-foreground uppercase tracking-tight leading-none">Smocha Supreme</h3>
                            <p className="text-xs text-slate-500 font-medium italic">Sausage wrapped in chapati with house pili pili & kachumbari.</p>
                        </div>
                        <div className="pt-6 relative z-10 flex items-center justify-between border-t border-slate-100">
                            <div>
                                <p className="text-[9px] font-black uppercase text-slate-400">Price</p>
                                <p className="text-3xl font-black text-primary tracking-tight">KSh 180</p>
                            </div>
                            <Button
                                onClick={() => handleQuickAdd(101, 'Smocha Supreme', 180, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&q=80', 'Street Bites')}
                                className="h-12 px-6 rounded-2xl bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest hover:bg-primary transition-colors"
                            >
                                {addedCartId === 101 ? <Check size={16} /> : <><ShoppingBag size={14} className="mr-1" /> Quick Order</>}
                            </Button>
                        </div>
                    </Card>

                    {/* Fast Food Cross-Sell: Loaded Masala Fries */}
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md flex flex-col justify-between text-left relative overflow-hidden group">
                        <div className="space-y-3 relative z-10">
                            <div className="flex justify-between items-center">
                                <span className="px-3 py-1 rounded-full bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest shadow-md">
                                    🍟 NIGHT BITE
                                </span>
                                <span className="text-[9px] font-black uppercase text-emerald-600">9 min prep</span>
                            </div>
                            <h3 className="text-2xl font-black text-foreground uppercase tracking-tight leading-none">Chips Masala</h3>
                            <p className="text-xs text-slate-500 font-medium italic">Crispy fries tossed in spicy garlic tomato masala.</p>
                        </div>
                        <div className="pt-6 relative z-10 flex items-center justify-between border-t border-slate-100">
                            <div>
                                <p className="text-[9px] font-black uppercase text-slate-400">Price</p>
                                <p className="text-3xl font-black text-primary tracking-tight">KSh 250</p>
                            </div>
                            <Button
                                onClick={() => handleQuickAdd(102, 'Chips Masala', 250, 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&q=80', 'Hot Right Now')}
                                className="h-12 px-6 rounded-2xl bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest hover:bg-primary transition-colors"
                            >
                                {addedCartId === 102 ? <Check size={16} /> : <><ShoppingBag size={14} className="mr-1" /> Quick Order</>}
                            </Button>
                        </div>
                    </Card>
                </div>

                {/* 🔍 TACTICAL FILTERS */}
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                    {[
                        { id: 'trending', label: 'Trending Now', icon: Flame },
                        { id: 'near-me', label: 'Happening Near Me', icon: MapPin },
                        { id: 'tonight', label: 'Tonight\'s Selections', icon: Clock }
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id as 'trending' | 'near-me' | 'tonight')}
                            className={cn(
                                "flex items-center gap-3 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border-2 shadow-sm",
                                filter === f.id ? "bg-primary border-primary text-white shadow-xl shadow-primary/20 scale-105" : "bg-white text-slate-400 border-slate-100 hover:border-primary/20 hover:text-primary"
                            )}
                        >
                            <f.icon size={16} className={cn(filter === f.id ? "text-white" : "text-primary")} />
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* 🎞️ CINEMATIC DISCOVERY FEED */}
                <section className="space-y-12">
                    {stories.filter(s => s.status === 'LIVE').length > 0 && (
                        <div className="space-y-8">
                            <div className="flex items-center gap-3 px-4">
                                <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                                <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground">Live Now</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
                                {stories.filter(s => s.status === 'LIVE').map(story => (
                                    <BuzzStoryCard key={story.id} story={story} />
                                ))}
                            </div>
                        </div>
                    )}

                    {stories.filter(s => s.status === 'STARTING_SOON').length > 0 && (
                        <div className="space-y-8">
                            <div className="flex items-center gap-3 px-4">
                                <div className="h-2 w-2 rounded-full bg-amber-500" />
                                <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground">Starting Soon</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
                                {stories.filter(s => s.status === 'STARTING_SOON').map(story => (
                                    <BuzzStoryCard key={story.id} story={story} />
                                ))}
                            </div>
                        </div>
                    )}

                    {stories.filter(s => s.status === 'TRENDING').length > 0 && (
                        <div className="space-y-8">
                            <div className="flex items-center gap-3 px-4">
                                <div className="h-2 w-2 rounded-full bg-indigo-500" />
                                <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground">Trending Tonight</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
                                {stories.filter(s => s.status === 'TRENDING').map(story => (
                                    <BuzzStoryCard key={story.id} story={story} />
                                ))}
                            </div>
                        </div>
                    )}

                    {stories.length === 0 && (
                        <div className="py-40 text-center opacity-20 border-2 border-dashed border-slate-100 rounded-[4rem]">
                            <Flame size={64} className="mx-auto mb-6" />
                            <p className="text-xl font-black uppercase tracking-widest">Awaiting the next Buzz...</p>
                        </div>
                    )}
                </section>

                <div className="grid lg:grid-cols-12 gap-12 pt-10 text-left">

                    {/* 🗺️ THE PULSE MAP (LIGHT THEME) */}
                    <div className="lg:col-span-8 space-y-10">
                        <Card className="h-[700px] rounded-[4.5rem] bg-white border-8 border-slate-50 shadow-2xl relative overflow-hidden group">
                            <LiveBuzzMap />

                            <div className="absolute top-10 left-10 right-10 z-10 flex justify-between items-start pointer-events-none">
                                <div className="p-8 rounded-[3rem] bg-white/90 backdrop-blur-xl border border-slate-100 shadow-2xl pointer-events-auto animate-in slide-in-from-top-6 duration-1000">
                                    <h3 className="text-xs font-black uppercase tracking-[0.4em] text-primary mb-6 flex items-center gap-3">
                                        <div className="h-2 w-2 rounded-full bg-primary animate-ping" /> Live City Pulse
                                    </h3>
                                    <div className="space-y-4">
                                        {hotspots.slice(0, 3).map(area => (
                                            <div key={area.zone_name} className="flex items-center gap-6">
                                                <div className={cn(
                                                    "h-2 w-2 rounded-full",
                                                    area.buzz_status === 'BUZZING' ? "bg-rose-500 animate-pulse" : "bg-primary"
                                                )} />
                                                <span className="text-[11px] font-black uppercase text-foreground tracking-tight">{area.zone_name}</span>
                                                <div className="h-1 w-24 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary" style={{ width: `${area.buzz_score}%` }} />
                                                </div>
                                                <span className="text-[10px] font-black text-slate-400 ml-auto">{area.buzz_score}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-white text-foreground border border-slate-100 px-8 py-4 rounded-full text-[10px] font-black uppercase tracking-[0.3em] shadow-lg pointer-events-auto">
                                    Grid Node: Nairobi Central
                                </div>
                            </div>

                            {/* Privacy Shield Disclaimer */}
                            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 w-full max-w-md px-6">
                                <div className="bg-white/95 backdrop-blur-md p-5 rounded-3xl border border-slate-100 text-center shadow-2xl">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                                        🛡️ Privacy Safe: Locations are aggregated. <br /> Individual patron telemetry is never exposed to the grid.
                                    </p>
                                </div>
                            </div>
                        </Card>

                        <div className="grid sm:grid-cols-2 gap-8">
                             <Card className="p-12 rounded-[3.5rem] bg-slate-50 border border-slate-100 shadow-inner space-y-6 text-left group hover:border-primary/20 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center text-primary shadow-sm border border-slate-100 group-hover:scale-110 transition-transform"><Smartphone size={28} /></div>
                                    <h3 className="text-2xl font-black uppercase text-foreground tracking-tight leading-none">Sector <br /> Momentum</h3>
                                </div>
                                <p className="text-sm text-slate-500 font-medium italic leading-relaxed">
                                    &quot;Aggregated mobile density detected in Westlands Sector. Monitoring mission volume for peak tonight.&quot;
                                </p>
                             </Card>
                             <Card className="p-12 rounded-[3.5rem] bg-indigo-50/30 border border-indigo-100/50 shadow-sm space-y-8 text-left group hover:border-indigo-200 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100 group-hover:scale-110 transition-transform"><TrendingUp size={28} /></div>
                                    <h3 className="text-2xl font-black uppercase text-foreground tracking-tight leading-none">Discovery <br /> Metrics</h3>
                                </div>
                                <div className="space-y-4">
                                    {[
                                        { label: 'Map Signal Strength', val: 94 },
                                        { label: 'Event Verification', val: 82 },
                                        { label: 'System Confidence', val: 97 },
                                    ].map(cat => (
                                        <div key={cat.label} className="space-y-2">
                                            <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400">
                                                <span>{cat.label}</span>
                                                <span className="text-indigo-600">{cat.val}%</span>
                                            </div>
                                            <div className="h-1 w-full bg-white/50 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${cat.val}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                             </Card>
                        </div>
                    </div>

                    {/* 📊 SECTOR INTELLIGENCE SIDEBAR */}
                    <div className="lg:col-span-4 space-y-10">
                        <section className="space-y-8">
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground px-6">Operational Sectors</h2>
                            <div className="space-y-5">
                                {hotspots.map(area => (
                                    <Card
                                        key={area.zone_name}
                                        onClick={() => setSelectedArea(area)}
                                        className={cn(
                                            "p-10 rounded-[3.5rem] border-2 cursor-pointer transition-all relative overflow-hidden group",
                                            selectedArea?.zone_name === area.zone_name ? "bg-white border-primary shadow-2xl scale-[1.02]" : "bg-slate-50 border-transparent hover:border-slate-200"
                                        )}
                                    >
                                        <div className="relative z-10 flex justify-between items-center">
                                            <div className="space-y-2">
                                                <h4 className="text-2xl font-black uppercase tracking-tighter text-foreground">{area.zone_name}</h4>
                                                <div className="flex items-center gap-2">
                                                     <p className={cn(
                                                        "text-[10px] font-black uppercase tracking-widest",
                                                        area.buzz_status === 'BUZZING' ? "text-rose-500" : "text-slate-400"
                                                    )}>{area.buzz_status}</p>
                                                    <div className="h-1 w-1 rounded-full bg-slate-200" />
                                                    <p className="text-[10px] font-black text-primary uppercase">92% CONFIDENT</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-4xl font-black text-foreground tracking-tighter tabular-nums leading-none">{area.buzz_score}</p>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">BUZZ_SCORE™</p>
                                            </div>
                                        </div>
                                        <div className="mt-8 h-2 w-full bg-slate-200/50 rounded-full overflow-hidden border border-white/50 p-0.5">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all duration-[2s] ease-out shadow-lg",
                                                    area.buzz_status === 'BUZZING' ? "bg-rose-500 shadow-rose-200" : "bg-primary shadow-primary/20"
                                                )}
                                                style={{ width: `${area.buzz_score}%` }}
                                            />
                                        </div>
                                        {selectedArea?.zone_name === area.zone_name && (
                                            <Zap className="absolute -bottom-6 -right-6 h-32 w-32 text-primary/5 rotate-12" />
                                        )}
                                    </Card>
                                ))}
                            </div>
                        </section>

                        {/* SECTOR DEEP-DIVE (LIGHT VERSION) */}
                        {selectedArea && (
                            <Card className="p-12 rounded-[4rem] bg-white border border-primary/10 shadow-2xl space-y-10 relative overflow-hidden animate-in zoom-in-95 duration-700">
                                <div className="relative z-10 space-y-10 text-left">
                                    <div className="flex items-center gap-5">
                                        <div className="h-16 w-16 rounded-[1.8rem] bg-primary/10 flex items-center justify-center text-primary shadow-inner border border-primary/20"><MapPin size={32} /></div>
                                        <div>
                                            <h3 className="text-3xl font-black uppercase tracking-tighter">{selectedArea.zone_name} Insights</h3>
                                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1">Sector Intelligence Hub</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-8">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Active Patrons</p>
                                            <p className="text-4xl font-black text-foreground tracking-tighter">{selectedArea.active_visitors}+</p>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Dispatch Node</p>
                                            <p className="text-4xl font-black text-foreground tracking-tighter">Ready</p>
                                        </div>
                                    </div>

                                    <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 space-y-6 text-left relative overflow-hidden">
                                        <p className="text-[11px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                                            <CheckCircle2 size={14} /> Neural Match Result
                                        </p>
                                        <Link href={`/shop?category=${selectedArea.zone_name}`} className="flex items-center gap-5 text-left group/prod relative z-10">
                                            <div className="h-16 w-16 rounded-2xl bg-white flex items-center justify-center text-slate-900 group-hover/prod:scale-110 transition-transform shadow-lg border border-slate-100"><Wine size={32} /></div>
                                            <div className="min-w-0 flex-1 text-left">
                                                <p className="text-sm font-black uppercase truncate group-hover/prod:text-primary transition-colors">Premium Cellar Selection</p>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Trending in {selectedArea.zone_name}</p>
                                            </div>
                                            <ArrowRight size={20} className="text-primary group-hover/prod:translate-x-2 transition-transform" />
                                        </Link>
                                        <Zap className="absolute -bottom-4 -right-4 h-24 w-24 text-primary/5 rotate-12" />
                                    </div>

                                    <Button
                                        onClick={() => setIsDetailOpen(true)}
                                        className="w-full h-20 rounded-[2rem] bg-primary text-white font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95"
                                    >
                                        Explore Sector Feed <ChevronRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>

            </div>

            {isDetailOpen && selectedArea && (
                <PulseDetailModal
                    areaName={selectedArea.zone_name}
                    onClose={() => setIsDetailOpen(false)}
                />
            )}

            {nightPlannerOpen && (
                <div className="fixed inset-0 z-[2000] bg-white flex flex-col animate-in slide-in-from-bottom duration-700 overflow-y-auto no-scrollbar">
                    <header className="p-8 flex justify-end">
                        <button
                            onClick={() => setNightPlannerOpen(false)}
                            className="h-14 w-14 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-primary transition-all active:scale-90"
                        >
                            <X size={24} />
                        </button>
                    </header>
                    <div className="flex-1">
                        <BuildMyNightWidget />
                    </div>
                </div>
            )}
        </div>
    );
}
