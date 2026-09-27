'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import {
    Flame,
    MapPin,
    Clock,
    Users,
    ChevronLeft,
    Navigation,
    Loader2,
    Zap,
    Heart,
    CheckCircle2,
    Camera
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, normalizeImage } from '@/lib/utils';
import Image from 'next/image';
import { OB_OS } from '@/lib/onlineBarOS';

interface BuzzDetail {
    id: string;
    title: string;
    description: string;
    start_at: string;
    end_at: string;
    status: string;
    trend_score: number;
    latitude: number;
    longitude: number;
    venue: {
        id: string;
        name: string;
        address: string;
        category: string;
        hero_image_url: string;
    };
    category: {
        label: string;
    };
    media: Array<{ media_type: string, url: string }>;
    updates: Array<{ id: string, message: string, media_url: string | null, created_at: string }>;
    interest_count: number;
}

interface DBBuzzPostDetail {
    id: string;
    title: string;
    description: string;
    start_at: string;
    end_at: string;
    status: string;
    trend_score: number;
    latitude: number;
    longitude: number;
    venue: {
        id: string;
        name: string;
        address: string;
        category: string;
        hero_image_url: string;
    } | null;
    category: {
        label: string;
    } | null;
    media: Array<{ media_type: string, url: string }> | null;
    updates: Array<{ id: string, message: string, media_url: string | null, created_at: string }> | null;
}

export default function BuzzDetailPage() {
    const params = useParams();
    const slug = params?.slug as string;
    const router = useRouter();
    const [buzz, setBuzz] = React.useState<BuzzDetail | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [isInterested, setIsInterested] = React.useState(false);

    const fetchBuzzDetail = React.useCallback(async () => {
        if (!supabase || !slug) return;
        setLoading(true);
        try {
            // High-fidelity fetch for Experience Detail
            const { data: bData } = await supabase
                .from('buzz_posts')
                .select('*, venue:buzz_venues(*), category:buzz_categories(label), media:buzz_media(*), updates:buzz_updates(*)')
                .eq('id', slug) // Assuming ID for now for simplicity, or slug if implemented
                .single();

            if (bData) {
                const dbBuzz = bData as unknown as DBBuzzPostDetail;
                setBuzz({
                    id: dbBuzz.id,
                    title: dbBuzz.title,
                    description: dbBuzz.description,
                    start_at: dbBuzz.start_at,
                    end_at: dbBuzz.end_at,
                    status: dbBuzz.status,
                    trend_score: dbBuzz.trend_score,
                    latitude: dbBuzz.latitude,
                    longitude: dbBuzz.longitude,
                    venue: dbBuzz.venue || { id: '', name: 'Premium Venue', address: '', category: '', hero_image_url: '' },
                    category: dbBuzz.category || { label: 'General' },
                    media: dbBuzz.media || [],
                    updates: dbBuzz.updates || [],
                    interest_count: dbBuzz.trend_score ? Math.round(dbBuzz.trend_score * 3.5) : 120
                });

                // Track the Discovery
                OB_OS.track('BUZZ_OPEN', {
                    details: { buzzId: dbBuzz.id, title: dbBuzz.title, venue: dbBuzz.venue?.name }
                });
            }
        } catch (err) {
            console.error("Discovery Node offline.", err);
        } finally {
            setLoading(false);
        }
    }, [slug]);

    React.useEffect(() => {
        fetchBuzzDetail();
    }, [fetchBuzzDetail]);

    const handleRSVP = async () => {
        setIsInterested(!isInterested);
        OB_OS.track('RSVP_INTERESTED', {
            details: { buzzId: buzz?.id, status: !isInterested }
        });
    };

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300">Decrypting Vibe Frequency...</p>
        </div>
    );

    if (!buzz) return <div className="min-h-screen flex items-center justify-center font-black uppercase tracking-widest text-slate-300">Mission Expired: Node Not Found.</div>;

    return (
        <div className="min-h-screen bg-white text-left selection:bg-primary/20 animate-in fade-in duration-1000">
            {/* 📽️ CINEMATIC HERO SECTION */}
            <section className="relative h-[70vh] w-full overflow-hidden">
                <Image
                    src={normalizeImage(buzz.media[0]?.url)}
                    alt={buzz.title}
                    fill
                    className="object-cover transition-transform duration-[5s] hover:scale-110"
                    priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-black/40" />

                <button
                    onClick={() => router.back()}
                    className="absolute top-10 left-10 h-14 w-14 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-white hover:text-foreground transition-all z-50 shadow-2xl"
                >
                    <ChevronLeft size={28} />
                </button>

                <div className="absolute bottom-10 left-10 right-10 z-20 space-y-6">
                    <div className="flex flex-wrap items-center gap-4">
                        <span className="px-4 py-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl animate-pulse">
                            <Flame size={12} className="inline mr-2 fill-current mb-0.5" /> Live Buzz
                        </span>
                        <span className="px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white border border-white/20 text-[10px] font-black uppercase tracking-widest">
                            {buzz.category?.label}
                        </span>
                    </div>
                    <h1 className="text-5xl lg:text-7xl font-black text-foreground uppercase tracking-tighter leading-none italic max-w-4xl drop-shadow-2xl">
                        {buzz.title}
                    </h1>
                </div>
            </section>

            <main className="max-w-7xl mx-auto px-10 py-20">
                <div className="grid lg:grid-cols-12 gap-20">

                    {/* LEFT: MISSION DETAILS */}
                    <div className="lg:col-span-7 space-y-16">
                        <div className="space-y-8">
                            <h2 className="text-sm font-black uppercase tracking-[0.4em] text-primary flex items-center gap-3">
                                <Clock size={16} /> Discovery Narrative
                            </h2>
                            <p className="text-2xl font-black text-foreground uppercase tracking-tight leading-snug italic">&quot;{buzz.description}&quot;</p>
                        </div>

                        {/* 📸 LIVE STORIES NODE */}
                        <section className="space-y-8">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Live Updates</h3>
                                <span className="text-[10px] font-black text-primary uppercase animate-pulse">Updated 2m ago</span>
                            </div>
                            <div className="grid gap-6">
                                {buzz.updates.length > 0 ? buzz.updates.map((update) => (
                                    <Card key={update.id} className="p-8 rounded-[3rem] bg-slate-50 border border-slate-100 space-y-6 group hover:bg-white transition-all shadow-sm hover:shadow-xl">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Zap size={20} fill="currentColor" /></div>
                                                <p className="text-xs font-black uppercase tracking-widest text-foreground">Venue Broadcast</p>
                                            </div>
                                            <span className="text-[9px] font-black text-slate-300">{new Date(update.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <p className="text-sm font-medium text-slate-600 leading-relaxed italic">{update.message}</p>
                                        {update.media_url && (
                                            <div className="relative h-64 w-full rounded-2xl overflow-hidden border border-slate-100 shadow-inner">
                                                <Image src={normalizeImage(update.media_url)} alt="" fill className="object-cover" />
                                            </div>
                                        )}
                                    </Card>
                                )) : (
                                    <div className="p-12 rounded-[3rem] border-2 border-dashed border-slate-100 text-center opacity-30">
                                        <Camera size={40} className="mx-auto mb-4" />
                                        <p className="text-[10px] font-black uppercase tracking-widest">Awaiting live updates from venue</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    {/* RIGHT: TACTICAL HUD */}
                    <div className="lg:col-span-5 space-y-12">

                        {/* VENUE CARD */}
                        <Card className="p-10 rounded-[4rem] bg-slate-900 text-white border-none shadow-2xl space-y-10 relative overflow-hidden group">
                            <div className="absolute inset-0">
                                <Image src={normalizeImage(buzz.venue?.hero_image_url)} alt="" fill className="object-cover opacity-20 transition-transform duration-[3s] group-hover:scale-110" />
                                <div className="absolute inset-0 bg-slate-900/60" />
                            </div>

                            <div className="relative z-10 space-y-8">
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">{buzz.venue?.category}</p>
                                    <h3 className="text-3xl font-black uppercase tracking-tighter italic">{buzz.venue?.name}</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <MapPin size={12} className="text-primary" /> {buzz.venue?.address}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <Button
                                        onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${buzz.latitude},${buzz.longitude}`)}
                                        className="h-16 rounded-2xl bg-white text-slate-900 font-black uppercase text-[10px] tracking-widest hover:scale-105 active:scale-95 transition-all"
                                    >
                                        <Navigation size={16} className="mr-2" /> Navigate
                                    </Button>
                                    <Link href={`/venue/${buzz.venue?.id}`} className="block">
                                        <Button variant="outline" className="w-full h-16 rounded-2xl border-white/10 bg-white/5 text-white font-black uppercase text-[10px] tracking-widest hover:bg-white/10">
                                            Profile Node
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </Card>

                        {/* ENGAGEMENT MODULE */}
                        <Card className="p-10 rounded-[3.5rem] bg-slate-50 border border-slate-100 shadow-sm space-y-10 text-left">
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><Users size={20} /></div>
                                    <h3 className="text-xl font-black uppercase tracking-tighter">Who&apos;s Interested?</h3>
                                </div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Real-time Patron Radar</p>
                            </div>

                            <div className="flex items-center gap-8">
                                <div>
                                    <p className="text-5xl font-black text-foreground tracking-tighter leading-none">{buzz.interest_count}+</p>
                                    <p className="text-[10px] font-bold text-primary uppercase mt-2 tracking-widest">Patrons Synchronized</p>
                                </div>
                                <div className="h-12 w-px bg-slate-200" />
                                <div className="flex -space-x-4">
                                    {[1,2,3,4].map(i => (
                                        <div key={i} className="h-12 w-12 rounded-full border-4 border-white bg-slate-200 overflow-hidden shadow-xl animate-in fade-in zoom-in" style={{ animationDelay: `${i*100}ms` }}>
                                            <div className="h-full w-full bg-gradient-to-br from-slate-100 to-slate-300 flex items-center justify-center"><Users size={16} className="text-slate-400" /></div>
                                        </div>
                                    ))}
                                    <div className="h-12 w-12 rounded-full border-4 border-white bg-primary text-white flex items-center justify-center text-[10px] font-black shadow-xl">+{buzz.interest_count - 4}</div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <Button
                                    onClick={handleRSVP}
                                    className={cn(
                                        "w-full h-20 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-2xl transition-all active:scale-95",
                                        isInterested ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-100" : "bg-primary text-white hover:bg-primary/90 shadow-primary/20"
                                    )}
                                >
                                    {isInterested ? <><CheckCircle2 size={18} className="mr-3" /> Mission Locked</> : <><Heart size={18} className="mr-3" /> I&apos;m Interested</>}
                                </Button>
                            </div>
                        </Card>

                    </div>
                </div>
            </main>
        </div>
    );
}
