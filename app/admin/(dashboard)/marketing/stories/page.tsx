'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Camera as Instagram,
    X,
    Smartphone,
    Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface StoryPost {
    id: string;
    day: string;
    time: string;
    title: string;
    status: 'POSTED' | 'SCHEDULED';
    image_url: string;
}

export default function StorySchedulerPage() {
    const [stories, setStories] = React.useState<StoryPost[]>([]);
    const [isPhonePreviewOpen, setIsPhonePreviewOpen] = React.useState(false);
    const [previewStory, setPreviewStory] = React.useState<StoryPost | null>(null);

    React.useEffect(() => {
        async function fetchStories() {
            if (!supabase) return;
            try {
                const { data } = await supabase.from('buzz_posts').select('*').limit(7);
                if (data && data.length > 0) {
                    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                    const storyItems: StoryPost[] = data.map((b, idx) => ({
                        id: b.id || `st-${idx}`,
                        day: days[idx % 7],
                        time: new Date(b.start_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        title: b.title || 'Instagram Story Stream',
                        status: b.status === 'LIVE' ? 'POSTED' : 'SCHEDULED',
                        image_url: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80'
                    }));
                    setStories(storyItems);
                }
            } catch (err) {
                console.error("Story fetch error:", err);
            }
        }
        fetchStories();
    }, []);

    const handleOpenPreview = (story: StoryPost) => {
        setPreviewStory(story);
        setIsPhonePreviewOpen(true);
    };

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20">
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Instagram className="h-5 w-5 text-rose-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-600">POSTIZ INSTAGRAM STORY SCHEDULER</span>
                        <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase bg-emerald-50 text-emerald-600 border border-emerald-200">
                            Auto-Post: Enabled
                        </span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Story Scheduler</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Multi-photo story grid planner with live mobile phone preview overlays.</p>
                </div>

                <Button
                    onClick={() => {
                        setPreviewStory(stories[1]);
                        setIsPhonePreviewOpen(true);
                    }}
                    className="rounded-2xl h-12 px-8 bg-rose-500 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-rose-200 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                    <Smartphone className="h-4 w-4" /> Open Phone Preview
                </Button>
            </header>

            {/* MULTI-PHOTO STORY GRID VIEW (POSTIZ INSPIRED - SCREENSHOT 7) */}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                    const matched = stories.filter(s => s.day === day);
                    return (
                        <Card key={day} className="p-4 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md flex flex-col justify-between text-left space-y-4 min-h-[340px]">
                            <div className="border-b border-slate-100 pb-2">
                                <h3 className="text-base font-black uppercase text-foreground">{day}</h3>
                            </div>

                            <div className="space-y-3 flex-1">
                                {matched.map(s => (
                                    <div
                                        key={s.id}
                                        onClick={() => handleOpenPreview(s)}
                                        className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 group cursor-pointer hover:bg-white hover:shadow-lg transition-all"
                                    >
                                        <div className="h-24 w-full rounded-xl relative overflow-hidden bg-slate-900 shadow-inner">
                                            <Image src={s.image_url} alt={s.title} fill className="object-cover group-hover:scale-105 transition-transform" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-[10px] font-black uppercase text-foreground truncate">{s.time}</p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase truncate">{s.title}</p>
                                        </div>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-wider block text-center border",
                                            s.status === 'POSTED' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                                        )}>
                                            {s.status}
                                        </span>
                                    </div>
                                ))}

                                {matched.length === 0 && (
                                    <div className="py-12 text-center text-slate-300 space-y-1 border-2 border-dashed border-slate-100 rounded-2xl">
                                        <X size={20} className="mx-auto" />
                                        <p className="text-[8px] font-black uppercase">No Schedule</p>
                                    </div>
                                )}
                            </div>
                        </Card>
                    );
                })}
            </div>

            {/* MOBILE STORY PREVIEW PHONE MODAL (POSTIZ INSPIRED - SCREENSHOT 8) */}
            {isPhonePreviewOpen && previewStory && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="relative bg-slate-950 text-white rounded-[3.5rem] p-6 max-w-sm w-full shadow-2xl border-4 border-slate-800 space-y-6 text-left">
                        <button
                            onClick={() => setIsPhonePreviewOpen(false)}
                            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                        >
                            <X size={16} />
                        </button>

                        <div className="flex items-center gap-2 pt-2">
                            <Smartphone className="h-4 w-4 text-rose-500" />
                            <span className="text-[9px] font-black uppercase text-rose-400 tracking-widest">MOBILE STORY PREVIEW</span>
                        </div>

                        {/* Phone Screen Frame */}
                        <div className="h-[400px] w-full rounded-[2.5rem] relative overflow-hidden bg-slate-900 shadow-inner border border-slate-800 flex flex-col justify-between p-6">
                            <Image src={previewStory.image_url} alt={previewStory.title} fill className="object-cover opacity-80" />

                            <div className="relative z-10 flex justify-between items-center text-white">
                                <span className="text-[9px] font-black uppercase tracking-widest bg-slate-950/80 px-3 py-1 rounded-full backdrop-blur-md">
                                    @onlinebar.ke
                                </span>
                                <span className="text-[9px] font-black uppercase bg-rose-500 text-white px-3 py-1 rounded-full shadow-md">
                                    {previewStory.time}
                                </span>
                            </div>

                            <div className="relative z-10 p-4 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-slate-800 space-y-1 text-center">
                                <p className="text-xs font-black uppercase tracking-tight">{previewStory.title}</p>
                                <p className="text-[9px] font-medium text-slate-400 italic">&quot;3 MORE DAYS &bull; 20% OFF SELECT VINTAGES&quot;</p>
                            </div>
                        </div>

                        <div className="pt-2 flex justify-between gap-3">
                            <Button
                                onClick={() => {
                                    alert(`Story "${previewStory.title}" scheduled for Instagram Story Auto-Post! 🚀`);
                                    setIsPhonePreviewOpen(false);
                                }}
                                className="w-full h-12 rounded-2xl bg-rose-500 text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-rose-500/20"
                            >
                                <Send size={14} className="mr-2" /> Schedule Story
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
