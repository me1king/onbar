'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
    Flame,
    MapPin,
    Clock,
    ChevronLeft,
    Navigation,
    Loader2,
    Zap,
    CheckCircle2,
    Globe,
    Phone,
    Info,
    Camera
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { normalizeImage } from '@/lib/utils';
import Image from 'next/image';
import { OB_OS } from '@/lib/onlineBarOS';
import BuzzStoryCard, { BuzzStory } from '@/components/buzz/BuzzStoryCard';

interface VenueDetail {
    id: string;
    name: string;
    description: string;
    category: string;
    address: string;
    latitude: number;
    longitude: number;
    opening_hours: Record<string, string>;
    amenities: string[];
    price_band: string;
    hero_image_url: string;
    gallery_urls: string[];
    rating: number;
    is_verified: boolean;
}

interface DBExperience {
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

export default function VenueProfilePage() {
    const { id } = useParams();
    const router = useRouter();
    const [venue, setVenue] = React.useState<VenueDetail | null>(null);
    const [experiences, setExperiences] = React.useState<BuzzStory[]>([]);
    const [loading, setLoading] = React.useState(true);

    const fetchVenueDetail = React.useCallback(async () => {
        if (!supabase || !id) return;
        setLoading(true);
        try {
            // 1. Fetch Venue Node
            const { data: vData } = await supabase.from('buzz_venues').select('*').eq('id', id).single();
            if (vData) {
                setVenue(vData as unknown as VenueDetail);

                // 2. Fetch Active Experiences for this venue
                const { data: expData } = await supabase
                    .from('buzz_posts')
                    .select('*, category:buzz_categories(label), media:buzz_media(*)')
                    .eq('venue_id', id)
                    .in('status', ['LIVE', 'TRENDING']);

                if (expData) {
                    setExperiences((expData as unknown as DBExperience[]).map(e => ({
                        id: e.id,
                        title: e.title,
                        description: e.description || '',
                        area_zone: e.area_zone || 'Nairobi',
                        category: e.category?.label || 'General',
                        status: e.status,
                        trend_score: e.trend_score,
                        latitude: Number(e.latitude),
                        longitude: Number(e.longitude),
                        starts_at: e.start_at,
                        media: e.media?.map((m) => ({ type: m.media_type as 'IMAGE' | 'VIDEO', url: m.url })) || [],
                        distance: '1.2 km'
                    })));
                }

                // Track Profile Interaction
                OB_OS.track('UI_INTERACTION', { details: { id: 'venue.profile_view', venueId: id, name: vData.name } });
            }
        } catch (err) {
            console.error("Venue Node unreachable.", err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    React.useEffect(() => {
        fetchVenueDetail();
    }, [fetchVenueDetail]);

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300">Synchronizing Venue Frequency...</p>
        </div>
    );

    if (!venue) return <div className="min-h-screen flex items-center justify-center font-black uppercase tracking-widest text-slate-300">Mission Expired: Venue Not Found.</div>;

    return (
        <div className="min-h-screen bg-white text-left selection:bg-primary/20 animate-in fade-in duration-1000">

            {/* 📽️ CINEMATIC HERO */}
            <section className="relative h-[60vh] w-full overflow-hidden">
                <Image
                    src={normalizeImage(venue.hero_image_url)}
                    alt={venue.name}
                    fill
                    className="object-cover transition-transform duration-[5s] hover:scale-110"
                    priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-black/60" />

                <button
                    onClick={() => router.back()}
                    className="absolute top-10 left-10 h-14 w-14 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-white hover:text-foreground transition-all z-50 shadow-2xl"
                >
                    <ChevronLeft size={28} />
                </button>

                <div className="absolute bottom-10 left-10 right-10 z-20 space-y-6">
                    <div className="flex flex-wrap items-center gap-4">
                        {venue.is_verified && (
                            <span className="px-4 py-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl">
                                <CheckCircle2 size={12} className="inline mr-2 fill-current mb-0.5" /> Verified Venue
                            </span>
                        )}
                        <span className="px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white border border-white/20 text-[10px] font-black uppercase tracking-widest">
                            {venue.category} • {venue.price_band}
                        </span>
                    </div>
                    <h1 className="text-5xl lg:text-8xl font-black text-foreground uppercase tracking-tighter leading-none italic max-w-4xl drop-shadow-2xl">
                        {venue.name}
                    </h1>
                </div>
            </section>

            <main className="max-w-7xl mx-auto px-10 py-20">
                <div className="grid lg:grid-cols-12 gap-20">

                    {/* LEFT: VENUE STORY & BUZZ */}
                    <div className="lg:col-span-7 space-y-20">

                        <div className="space-y-8">
                            <h2 className="text-sm font-black uppercase tracking-[0.4em] text-primary flex items-center gap-3">
                                <Info size={16} /> Venue Narrative
                            </h2>
                            <p className="text-2xl font-black text-foreground uppercase tracking-tight leading-snug italic">&quot;{venue.description}&quot;</p>
                        </div>

                        {/* 🔥 LIVE DISCOVERY NODE */}
                        {experiences.length > 0 && (
                            <section className="space-y-12">
                                <div className="flex justify-between items-end border-b border-slate-100 pb-8">
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-[0.4em] text-rose-500 mb-2 flex items-center gap-2">
                                            <Flame size={16} fill="currentColor" /> Live Now
                                        </h3>
                                        <h2 className="text-4xl font-black uppercase tracking-tighter text-foreground">Current Buzz</h2>
                                    </div>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-10">
                                    {experiences.map(story => (
                                        <BuzzStoryCard key={story.id} story={story} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* 🖼️ GALLERY NODE */}
                        <section className="space-y-12">
                            <h3 className="text-sm font-black uppercase tracking-[0.4em] text-primary flex items-center gap-3">
                                <Camera size={16} /> Visual Archive
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {venue.gallery_urls.map((url, i) => (
                                    <div key={i} className="aspect-square rounded-[2rem] bg-slate-100 overflow-hidden border border-slate-200 shadow-inner group relative">
                                        <Image src={normalizeImage(url)} alt="" fill className="object-cover transition-transform duration-700 group-hover:scale-110" />
                                        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* RIGHT: TACTICAL INFO HUD */}
                    <div className="lg:col-span-5 space-y-12">

                        {/* ACTION HUB */}
                        <Card className="p-12 rounded-[4rem] bg-slate-900 text-white border-none shadow-2xl space-y-10 relative overflow-hidden">
                            <div className="relative z-10 space-y-10 text-left">
                                <div className="flex items-center gap-4">
                                    <div className="h-14 w-14 rounded-[1.5rem] bg-primary/20 flex items-center justify-center text-primary shadow-sm border border-primary/20"><Navigation size={28} /></div>
                                    <h3 className="text-2xl font-black uppercase text-foreground tracking-tight leading-none italic">Tactical <br /> Directions</h3>
                                </div>

                                <div className="space-y-6">
                                    <div className="flex items-start gap-5">
                                        <MapPin className="h-5 w-5 text-primary shrink-0 mt-1" />
                                        <p className="text-sm font-black uppercase tracking-tight text-slate-300 leading-relaxed">{venue.address}</p>
                                    </div>
                                    <div className="flex items-start gap-5">
                                        <Phone className="h-5 w-5 text-primary shrink-0 mt-1" />
                                        <p className="text-sm font-black uppercase tracking-tight text-slate-300 leading-none">Signal: +254 7XX XXX XXX</p>
                                    </div>
                                </div>

                                <div className="grid gap-4">
                                    <Button
                                        onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`)}
                                        className="h-20 rounded-[2rem] bg-white text-slate-900 font-black uppercase text-xs tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl"
                                    >
                                        <Navigation size={18} className="mr-3" /> Initialize Navigation
                                    </Button>
                                    <Button variant="outline" className="h-20 rounded-[2rem] border-white/10 bg-white/5 text-white font-black uppercase text-xs tracking-widest hover:bg-white/10">
                                        <Globe size={18} className="mr-3" /> Venue Website
                                    </Button>
                                </div>
                            </div>
                            <Navigation className="absolute -bottom-10 -left-10 h-64 w-64 text-white/5 rotate-12 -z-0" />
                        </Card>

                        {/* STATUS MODULE */}
                        <Card className="p-12 rounded-[4rem] bg-slate-50 border border-slate-100 shadow-inner space-y-10 text-left">
                            <div className="flex justify-between items-start">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <Clock className="h-5 w-5 text-primary" />
                                        <h3 className="text-xl font-black uppercase tracking-tighter">Operational Node</h3>
                                    </div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Live Status Protocol</p>
                                </div>
                                <div className="text-right">
                                    <span className="px-4 py-1.5 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-black uppercase tracking-widest shadow-sm">Open</span>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {Object.entries(venue.opening_hours || {}).map(([day, hours]) => (
                                    <div key={day} className="flex justify-between items-center text-xs font-black uppercase tracking-widest">
                                        <span className="text-slate-400">{day}</span>
                                        <span className="text-foreground">{hours}</span>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* AMENITIES RADAR */}
                        <Card className="p-12 rounded-[4rem] bg-white border border-slate-100 shadow-sm space-y-10 text-left">
                             <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <Zap className="h-5 w-5 text-primary" />
                                    <h3 className="text-xl font-black uppercase tracking-tighter">Facility Features</h3>
                                </div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Terminal Amenities</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {(venue.amenities || []).map(amenity => (
                                    <div key={amenity} className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-50 group hover:border-primary/20 hover:bg-white transition-all">
                                        <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_#F5A000]" />
                                        <span className="text-[10px] font-black uppercase text-foreground">{amenity}</span>
                                    </div>
                                ))}
                            </div>
                        </Card>

                    </div>
                </div>
            </main>
        </div>
    );
}
