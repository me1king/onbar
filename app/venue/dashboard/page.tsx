'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Flame,
    TrendingUp,
    Users,
    MousePointer2,
    Plus,
    Loader2,
    Settings,
    ChevronRight,
    Navigation,
    Camera,
    Video,
    BarChart3,
    ArrowUpRight,
    ShieldCheck,
    Zap,
    Globe
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import Link from 'next/link';

interface Venue {
    id: string;
    name: string;
    category: string;
    hero_image_url: string;
    rating: number;
    is_verified: boolean;
}

interface BuzzPost {
    id: string;
    title: string;
    status: string;
    trend_score: number;
    impressions: number;
    start_at: string;
}

interface DBVenueManager {
    venue: {
        id: string;
        name: string;
        category: string;
        hero_image_url: string;
        rating: number;
        is_verified: boolean;
    } | null;
}

export default function VenuePortalDashboard() {
    const [venue, setVenue] = React.useState<Venue | null>(null);
    const [posts, setPosts] = React.useState<BuzzPost[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [updateText, setUpdateText] = React.useState('');

    const fetchVenueData = React.useCallback(async () => {
        if (!supabase) return;
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            // 1. Get Venue via Manager link
            const { data: managerData } = await supabase
                .from('venue_managers')
                .select('venue:buzz_venues(*)')
                .eq('user_id', session.user.id)
                .single();

            const dbManager = managerData as unknown as DBVenueManager;

            if (dbManager?.venue) {
                setVenue(dbManager.venue as unknown as Venue);

                // 2. Get active Buzz
                const { data: postsData } = await supabase
                    .from('buzz_posts')
                    .select('*')
                    .eq('venue_id', dbManager.venue.id)
                    .order('created_at', { ascending: false });

                if (postsData) {
                    setPosts(postsData.map(p => ({
                        id: p.id,
                        title: p.title,
                        status: p.status,
                        trend_score: p.trend_score,
                        start_at: p.start_at,
                        impressions: p.trend_score ? p.trend_score * 45 : 1250
                    })));
                }
            }
        } catch {
            console.error("Venue Node Desync.");
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchVenueData();
    }, [fetchVenueData]);

    const handlePostUpdate = async () => {
        if (!updateText.trim() || !venue || !supabase) return;
        try {
            const { error } = await supabase.from('buzz_updates').insert([{
                venue_id: venue.id,
                buzz_id: posts[0]?.id, // Link to latest post
                message: updateText
            }]);
            if (error) throw error;
            setUpdateText('');
            alert("Live Signal Dispatched! 🛰️");
        } catch {
            alert("Uplink failed.");
        }
    };

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300">Synchronizing Venue Terminal...</p>
        </div>
    );

    if (!venue) return (
        <div className="min-h-screen flex flex-col items-center justify-center p-10 text-center gap-6">
            <ShieldCheck size={64} className="text-slate-100" />
            <h2 className="text-2xl font-black uppercase tracking-tighter">No Venue Node Detected</h2>
            <p className="text-slate-500 max-w-xs italic">You are not currently registered as a manager for any Nairobi hotspots.</p>
            <Button className="h-14 px-10 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl">Apply for Access</Button>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 text-left selection:bg-primary/20 pb-40">

            {/* VENUE HUD HEADER */}
            <div className="bg-white border-b border-slate-200">
                <header className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-6">
                        <div className="h-16 w-16 rounded-[1.5rem] bg-slate-100 overflow-hidden border border-slate-200 shadow-inner relative">
                            <Image src={venue.hero_image_url || ''} alt="" fill className="object-cover" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase rounded border border-emerald-100">Verified Venue</span>
                                <h1 className="text-2xl font-black text-foreground uppercase tracking-tight italic">{venue.name}</h1>
                            </div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{venue.category} • Nairobi Sector 01</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" className="h-12 w-12 rounded-xl p-0 border-slate-200"><Settings size={18} /></Button>
                        <Button className="h-12 px-8 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20">
                            <Plus size={16} className="mr-2" /> New Buzz
                        </Button>
                    </div>
                </header>
            </div>

            <main className="max-w-7xl mx-auto p-6 sm:p-10 space-y-12">

                {/* CORE ANALYTICS RADAR */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {[
                        { label: 'Organic Reach', val: '12,482', icon: Globe, color: 'indigo' },
                        { label: 'Engagement', val: '8.4%', icon: MousePointer2, color: 'primary' },
                        { label: 'Map Signals', val: '431', icon: Navigation, color: 'emerald' },
                        { label: 'Buzz Score', val: posts[0]?.trend_score || 0, icon: Flame, color: 'rose' },
                    ].map(stat => (
                        <Card key={stat.label} className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm group hover:shadow-xl transition-all">
                            <div className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center mb-6 shadow-inner transition-transform group-hover:scale-110",
                                stat.color === 'primary' ? "bg-primary/10 text-primary" :
                                stat.color === 'indigo' ? "bg-indigo-50 text-indigo-500" :
                                stat.color === 'emerald' ? "bg-emerald-50 text-emerald-500" :
                                "bg-rose-50 text-rose-500"
                            )}>
                                <stat.icon size={20} />
                            </div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                            <h3 className="text-2xl font-black text-foreground uppercase tracking-tight tabular-nums">{stat.val}</h3>
                        </Card>
                    ))}
                </div>

                <div className="grid lg:grid-cols-12 gap-10">

                    {/* LEFT: ACTIVE BUZZ & FEED */}
                    <div className="lg:col-span-8 space-y-10">

                        {/* LIVE SIGNAL COMPOSER */}
                        <Card className="p-8 rounded-[3.5rem] bg-white border border-primary/10 shadow-2xl space-y-8 overflow-hidden relative">
                            <div className="relative z-10 space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 animate-pulse"><Flame size={20} fill="currentColor" /></div>
                                    <div>
                                        <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Post Live Update</h3>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Doors Open? Special Set? Signal the City.</p>
                                    </div>
                                </div>
                                <textarea
                                    value={updateText}
                                    onChange={e => setUpdateText(e.target.value)}
                                    placeholder="What's happening right now? (e.g. 'Main set starting in 10 mins!')"
                                    className="w-full h-32 rounded-[2rem] bg-slate-50 border border-slate-100 p-6 text-sm font-medium italic outline-none focus:ring-4 focus:ring-primary/5 transition-all resize-none"
                                />
                                <div className="flex justify-between items-center">
                                    <div className="flex gap-2">
                                        <Button variant="ghost" className="h-10 rounded-xl px-4 bg-slate-50 text-slate-400 text-[9px] font-black uppercase"><Camera size={14} className="mr-2" /> Add Photo</Button>
                                        <Button variant="ghost" className="h-10 rounded-xl px-4 bg-slate-50 text-slate-400 text-[9px] font-black uppercase"><Video size={14} className="mr-2" /> Add Clip</Button>
                                    </div>
                                    <Button
                                        onClick={handlePostUpdate}
                                        disabled={!updateText.trim()}
                                        className="h-12 px-10 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-[9px] shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                                    >
                                        Dispatch Signal
                                    </Button>
                                </div>
                            </div>
                            <Zap className="absolute -bottom-6 -right-6 h-32 w-32 text-primary/5 rotate-12" />
                        </Card>

                        {/* BUZZ MANAGEMENT */}
                        <section className="space-y-6">
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground px-6 italic">Active Discovery Nodes</h2>
                            <div className="grid gap-6">
                                {posts.map(post => (
                                    <Card key={post.id} className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm flex items-center justify-between group hover:border-primary/20 transition-all">
                                        <div className="flex items-center gap-8 flex-1 min-w-0">
                                            <div className="h-16 w-16 rounded-[1.5rem] bg-slate-50 flex items-center justify-center text-primary shadow-inner border border-slate-100 group-hover:scale-110 transition-transform">
                                                <Flame size={28} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                                                        post.status === 'LIVE' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-100"
                                                    )}>{post.status}</span>
                                                    <span className="text-[9px] font-black text-primary uppercase">Score: {post.trend_score}</span>
                                                </div>
                                                <h3 className="text-xl font-black text-foreground uppercase tracking-tight truncate italic">{post.title}</h3>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 tracking-widest">Started: {new Date(post.start_at).toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-10 pr-4">
                                            <div className="text-right">
                                                <p className="text-xl font-black text-foreground tracking-tighter tabular-nums">{post.impressions.toLocaleString()}</p>
                                                <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Reach</p>
                                            </div>
                                            <Link href={`/admin/buzz/${post.id}`}>
                                                <Button size="icon" variant="ghost" className="h-12 w-12 rounded-xl text-slate-200 hover:text-primary transition-all"><BarChart3 size={24} /></Button>
                                            </Link>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* RIGHT: PROMOTION & BOOST */}
                    <div className="lg:col-span-4 space-y-10">

                        <Card className="p-10 rounded-[4rem] bg-slate-900 text-white border-none shadow-2xl space-y-10 relative overflow-hidden">
                            <div className="relative z-10 space-y-8 text-left">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <TrendingUp className="h-5 w-5 text-primary" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Revenue Expansion</span>
                                    </div>
                                    <h3 className="text-3xl font-black uppercase tracking-tighter italic leading-none">Boost Your <br /> Visibility.</h3>
                                </div>

                                <div className="space-y-4">
                                    {[
                                        { id: 'spotlight', label: 'Buzz Spotlight', desc: 'Top of Discover Feed', price: 2500 },
                                        { id: 'area', label: 'Area Surge', desc: 'Target local radius', price: 5000 },
                                        { id: 'trending', label: 'Trending Inject', desc: 'Guaranteed Live status', price: 8000 },
                                    ].map(boost => (
                                        <button key={boost.id} className="w-full p-6 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left flex items-center justify-between group/boost">
                                            <div>
                                                <p className="text-[11px] font-black uppercase text-foreground">{boost.label}</p>
                                                <p className="text-[9px] text-slate-400 uppercase mt-1">{boost.desc}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-primary">Ksh {boost.price.toLocaleString()}</p>
                                                <ChevronRight size={14} className="ml-auto mt-1 opacity-0 group-hover/boost:opacity-100 transition-all" />
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                <Button className="w-full h-16 rounded-[1.8rem] bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all">
                                    Initialize Campaign
                                </Button>
                            </div>
                            <TrendingUp className="absolute -bottom-10 -left-10 h-64 w-64 text-white/5 rotate-12 -z-0" />
                        </Card>

                        {/* RECENT JOURNEYS (Patron Insights) */}
                        <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-8 text-left">
                            <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.4em]">Sector Radar</h3>
                            <div className="space-y-6">
                                <div className="flex items-start gap-4">
                                    <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0"><ArrowUpRight size={16} /></div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-foreground">Traffic Spike</p>
                                        <p className="text-[9px] text-slate-400 uppercase mt-1 leading-relaxed">34% increase in &quot;Cocktail Bar&quot; searches around your area.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-4">
                                    <div className="h-8 w-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-500 shrink-0"><Users size={16} /></div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-foreground">Patron Interest</p>
                                        <p className="text-[9px] text-slate-400 uppercase mt-1 leading-relaxed">89 patrons saved your &quot;Live Jazz&quot; experience tonight.</p>
                                    </div>
                                </div>
                            </div>
                        </Card>

                    </div>
                </div>
            </main>
        </div>
    );
}
