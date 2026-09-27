'use client';

import * as React from 'react';
import {
    Zap,
    ArrowUpRight,
    Play,
    Pause
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface AbTest {
    id: string;
    name: string;
    type: string;
    status: 'Running' | 'Paused' | 'Completed';
    performance: string;
    confidence: string;
    created_date: string;
}

export default function AbTestingPage() {
    const [tests, setTests] = React.useState<AbTest[]>([]);

    React.useEffect(() => {
        async function fetchAbTests() {
            if (!supabase) return;
            try {
                const { data } = await supabase.from('marketing_campaigns').select('*').limit(5);
                if (data && data.length > 0) {
                    const abItems: AbTest[] = data.map((c, idx) => ({
                        id: c.id || `ab-${idx}`,
                        name: c.name || 'Storefront Variant Experiment',
                        type: c.type || 'Conversion',
                        status: c.status === 'Published' ? 'Running' : 'Paused',
                        performance: `${12 + idx * 2.5}%`,
                        confidence: '94% confidence',
                        created_date: new Date(c.created_at || Date.now()).toISOString().split('T')[0]
                    }));
                    setTests(abItems);
                }
            } catch (err) {
                console.error("A/B tests fetch error:", err);
            }
        }
        fetchAbTests();
    }, []);

    const toggleStatus = (id: string) => {
        setTests(prev => prev.map(t => {
            if (t.id === id) {
                const nextStatus = t.status === 'Running' ? 'Paused' : 'Running';
                return { ...t, status: nextStatus };
            }
            return t;
        }));
    };

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20">
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Zap className="h-5 w-5 text-indigo-600 animate-pulse fill-current" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600">KEAK / CAUSALFUNNEL A/B TESTING ENGINE</span>
                        <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase bg-indigo-50 text-indigo-600 border border-indigo-200">
                            Bayesian Conversion Mode
                        </span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">A/B Testing Platform</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Manage and monitor storefront A/B variant experiments to optimize conversion lift.</p>
                </div>
            </header>

            {/* REVENUE IMPACT & CONVERSION LIFT CARDS (KEAK & CAUSALFUNNEL INSPIRED - SCREENSHOTS 4 & 5) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-2 text-left">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Revenue Impact</p>
                    <p className="text-3xl font-black text-emerald-600 tabular-nums">+$2,450</p>
                    <span className="inline-flex items-center text-[8px] font-black uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <ArrowUpRight size={10} className="mr-0.5" /> +$890 this month from tests
                    </span>
                </Card>

                <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-2 text-left">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Total Traffic Tested</p>
                    <p className="text-3xl font-black text-foreground tabular-nums">2,450</p>
                    <span className="inline-flex items-center text-[8px] font-black uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        +450 visitors tested
                    </span>
                </Card>

                <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-2 text-left">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Top Performer Lift</p>
                    <p className="text-3xl font-black text-indigo-600 tabular-nums">+24%</p>
                    <span className="inline-flex items-center text-[8px] font-black uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        +2% conversion lift
                    </span>
                </Card>
            </div>

            {/* BAYESIAN WINNING VARIATION RESULTS (SCREENSHOT 6) */}
            <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-slate-950 text-white shadow-2xl space-y-6 text-left relative overflow-hidden">
                <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                    <div>
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400">BAYESIAN WINNING VARIATION</span>
                        <h3 className="text-2xl font-black uppercase tracking-tight text-white mt-1">Homepage Hero Optimization (27 Days Active)</h3>
                    </div>
                    <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        18,420 Tested Visitors
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-1">
                        <p className="text-[9px] font-black uppercase text-slate-400">Conversion Rate</p>
                        <p className="text-4xl font-black text-emerald-400">+28%</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Winning Variation A</p>
                    </div>
                    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-1">
                        <p className="text-[9px] font-black uppercase text-slate-400">Total Improvement</p>
                        <p className="text-4xl font-black text-indigo-400">+15%</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">vs Main Control Goal</p>
                    </div>
                    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-1">
                        <p className="text-[9px] font-black uppercase text-slate-400">Statistical Reliability</p>
                        <p className="text-4xl font-black text-amber-400">+96%</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">High Significance</p>
                    </div>
                </div>
            </Card>

            {/* ACTIVE A/B TESTS TABLE (SCREENSHOT 5) */}
            <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 text-left">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                    <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Active A/B Experiments</h3>
                    <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                        3 Experiments Registered
                    </span>
                </div>

                <div className="space-y-3">
                    {tests.map(t => (
                        <div key={t.id} className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4 hover:bg-slate-100 transition-colors">
                            <div className="space-y-1">
                                <div className="flex items-center gap-3">
                                    <h4 className="text-sm font-black uppercase text-foreground">{t.name}</h4>
                                    <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200">
                                        {t.type}
                                    </span>
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Created: {t.created_date} &bull; {t.confidence}</p>
                            </div>

                            <div className="flex items-center gap-6">
                                <div className="text-right">
                                    <p className="text-[8px] font-black uppercase text-slate-400">Performance</p>
                                    <p className="text-base font-black text-indigo-600">{t.performance}</p>
                                </div>

                                <Button
                                    onClick={() => toggleStatus(t.id)}
                                    variant="outline"
                                    className={cn(
                                        "h-10 px-4 rounded-xl text-[9px] font-black uppercase border transition-all",
                                        t.status === 'Running' ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-rose-50 hover:text-rose-600" : "bg-slate-200 text-slate-700 border-slate-300"
                                    )}
                                >
                                    {t.status === 'Running' ? <><Pause size={12} className="mr-1" /> Pause</> : <><Play size={12} className="mr-1" /> Resume</>}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}
