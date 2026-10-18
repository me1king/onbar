'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Camera as Instagram,
    X,
    Smartphone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Image from 'next/image';

interface StoryPost {
    id: string;
    start_at: string | null;
    title: string | null;
    status: string | null;
    image_url: string | null;
}

export default function StorySchedulerPage() {
    const [stories, setStories] = React.useState<StoryPost[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [isPhonePreviewOpen, setIsPhonePreviewOpen] = React.useState(false);
    const [previewStory, setPreviewStory] = React.useState<StoryPost | null>(null);

    React.useEffect(() => {
        async function fetchStories() {
            if (!supabase) {
                setError('Supabase is not connected. Saved post records are unavailable.');
                setLoading(false);
                return;
            }
            try {
                const { data, error: queryError } = await supabase
                    .from('buzz_posts')
                    .select('*')
                    .order('start_at', { ascending: true })
                    .limit(7);
                if (queryError) throw queryError;
                setStories((data || []).map(post => ({
                    id: String(post.id),
                    start_at: post.start_at || null,
                    title: post.title || null,
                    status: post.status || null,
                    image_url: post.image_url || null
                })));
            } catch (err) {
                console.error("Story fetch error:", err);
                setError(err instanceof Error ? err.message : 'Could not load saved post records.');
            } finally {
                setLoading(false);
            }
        }
        fetchStories();
    }, []);

    const handleOpenPreview = (story: StoryPost) => {
        setPreviewStory(story);
        setIsPhonePreviewOpen(true);
    };

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-background min-h-screen text-left pb-40 selection:bg-primary/20">
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Instagram className="h-5 w-5 text-rose-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-600">Saved Content Records</span>
                        <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                            Instagram: Not connected
                        </span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Story Scheduler</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Saved post records from Supabase. Publishing and delivery are not connected.</p>
                </div>

                <Button
                    onClick={() => stories[0] && handleOpenPreview(stories[0])}
                    disabled={!stories.length}
                    className="rounded-2xl h-12 px-8 bg-rose-500 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-rose-200 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                    <Smartphone className="h-4 w-4" /> Open Phone Preview
                </Button>
            </header>

            {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
            <p className="text-sm text-muted-foreground">Instagram publishing and post-performance telemetry are unavailable until their integrations are connected.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {loading ? (
                    <Card className="p-8 text-sm text-muted-foreground">Loading saved post records…</Card>
                ) : stories.length === 0 && !error ? (
                    <Card className="p-8 text-sm text-muted-foreground">No saved post records found.</Card>
                ) : stories.map(story => (
                    <Card key={story.id} className="p-5 rounded-2xl bg-card border border-border space-y-4">
                        {story.image_url ? (
                            <div className="h-40 w-full rounded-xl relative overflow-hidden bg-secondary">
                                <Image src={story.image_url} alt={story.title || 'Saved post image'} fill unoptimized className="object-cover" />
                            </div>
                        ) : (
                            <div className="h-40 rounded-xl bg-secondary flex items-center justify-center text-sm text-muted-foreground">No saved image</div>
                        )}
                        <div className="space-y-2">
                            <h2 className="font-bold text-foreground">{story.title || 'Title unavailable'}</h2>
                            <p className="text-sm text-muted-foreground">
                                {story.start_at ? new Date(story.start_at).toLocaleString() : 'Date unavailable'}
                            </p>
                            <p className="text-xs text-muted-foreground">Saved status: {story.status || 'Unavailable'}</p>
                        </div>
                        <Button variant="outline" onClick={() => handleOpenPreview(story)} className="w-full">Preview saved content</Button>
                    </Card>
                ))}
            </div>

            {/* Preview only: publishing is not connected. */}
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
                            {previewStory.image_url && <Image src={previewStory.image_url} alt={previewStory.title || 'Saved post image'} fill unoptimized className="object-cover opacity-80" />}

                            <div className="relative z-10 flex justify-between items-center text-white">
                                <span className="text-[9px] font-black uppercase tracking-widest bg-slate-950/80 px-3 py-1 rounded-full backdrop-blur-md">
                                    Account unavailable
                                </span>
                                <span className="text-[9px] font-black uppercase bg-rose-500 text-white px-3 py-1 rounded-full shadow-md">
                                    {previewStory.start_at ? new Date(previewStory.start_at).toLocaleString() : 'Date unavailable'}
                                </span>
                            </div>

                            <div className="relative z-10 p-4 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-slate-800 space-y-1 text-center">
                                <p className="text-xs font-black uppercase tracking-tight">{previewStory.title || 'Title unavailable'}</p>
                                <p className="text-[9px] font-medium text-slate-400 italic">Preview of saved content only</p>
                            </div>
                        </div>

                        <p className="text-center text-xs text-slate-300">Instagram scheduling is not connected.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
