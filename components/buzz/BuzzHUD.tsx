'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Flame } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface BuzzArea {
    zone_name: string;
    post_count: number;
}

export default function BuzzHUD() {
    const [hotspots, setHotspots] = React.useState<BuzzArea[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);

    const fetchBuzz = React.useCallback(async () => {
        if (!supabase) {
            setLoadError('Buzz data is unavailable because Supabase is not configured.');
            setHotspots([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('buzz_posts')
                .select('area_zone')
                .in('status', ['LIVE', 'TRENDING']);
            if (error) throw error;

            const counts = new Map<string, number>();
            for (const post of data || []) {
                const area = post.area_zone?.trim();
                if (area) counts.set(area, (counts.get(area) || 0) + 1);
            }
            setHotspots([...counts.entries()]
                .map(([zone_name, post_count]) => ({ zone_name, post_count }))
                .sort((first, second) => second.post_count - first.post_count)
                .slice(0, 4));
            setLoadError(null);
        } catch (err) {
            console.error('Could not load recorded Buzz posts:', err);
            setHotspots([]);
            setLoadError(err instanceof Error ? err.message : 'Recorded Buzz posts could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchBuzz();
        const interval = setInterval(fetchBuzz, 30000); // 30s pulse
        return () => clearInterval(interval);
    }, [fetchBuzz]);

    return (
        <Card className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-8 text-left">
            <header className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 animate-pulse">
                        <Flame size={20} fill="currentColor" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black uppercase tracking-tighter text-foreground leading-none">Live Buzz Posts</h2>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Recorded by area</p>
                    </div>
                </div>
                <Link href="/buzz">
                    <Button variant="ghost" size="sm" className="h-8 rounded-lg text-[8px] font-black uppercase text-primary hover:bg-primary/5">Explore The Buzz &rarr;</Button>
                </Link>
            </header>

            <div className="space-y-4">
                {loading ? (
                    <p className="text-sm text-slate-500">Loading recorded Buzz posts…</p>
                ) : loadError ? (
                    <p role="alert" className="text-sm text-rose-600">{loadError}</p>
                ) : hotspots.length === 0 ? (
                    <p className="text-sm text-slate-500">No live or trending posts are recorded by area.</p>
                ) : hotspots.map(area => (
                    <div key={area.zone_name} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0">
                        <span className="text-xs font-black uppercase tracking-tight text-foreground">{area.zone_name}</span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            {area.post_count} {area.post_count === 1 ? 'post' : 'posts'}
                        </span>
                    </div>
                ))}
            </div>

            <div className="pt-4 border-t border-slate-50 text-[8px] font-black uppercase text-slate-400">
                <p>Counts reflect saved live and trending posts, not visitor traffic.</p>
            </div>
        </Card>
    );
}
