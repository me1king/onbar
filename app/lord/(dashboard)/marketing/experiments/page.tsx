'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Plus,
    CheckCircle2,
    Target,
    Activity,
    AlertCircle,
    Zap,
    Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';

interface Experiment {
    id: string;
    name: string;
    status: 'Draft' | 'Running' | 'Paused' | 'Ended';
    variant_a: { name: string };
    variant_b: { name: string };
    winning_variant?: 'A' | 'B';
    created_at: string;
}

export default function ExperimentationCenter() {
    useAdmin();
    const [experiments, setExperiments] = React.useState<Experiment[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isAdding, setIsAdding] = React.useState(false);
    const [newExp, setNewExp] = React.useState({ name: '', varA: '', varB: '' });

    const fetchExperiments = React.useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        if (!supabase) {
            setLoadError('Supabase is not connected. Saved experiment records are unavailable.');
            setLoading(false);
            return;
        }
        try {
            const { data, error } = await supabase.from('marketing_experiments').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setExperiments((data || []).map(experiment => ({
                ...experiment,
                variant_a: experiment.variant_a || { name: 'Variant A' },
                variant_b: experiment.variant_b || { name: 'Variant B' }
            })));
        } catch (err) {
            console.error(err);
            setLoadError(err instanceof Error ? err.message : 'Could not load saved experiment records.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchExperiments();
    }, [fetchExperiments]);

    const endExperiment = async (id: string) => {
        if (!supabase) {
            setMessage({ type: 'error', text: 'Supabase is not connected. The record was not updated.' });
            return;
        }
        try {
            const { error } = await supabase.from('marketing_experiments').update({
                status: 'Ended'
            }).eq('id', id);

            if (error) throw error;

            setMessage({ type: 'success', text: 'Experiment record marked ended. No traffic or winner settings were changed.' });
            setTimeout(() => setMessage(null), 5000);
            setExperiments(prev => prev.map(e => e.id === id ? { ...e, status: 'Ended' } : e));
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not update the experiment record.' });
        }
    };

    const startExperiment = () => {
        setIsAdding(true);
    };

    const handleCreateExperiment = async () => {
        if (!newExp.name.trim()) return;
        if (!supabase) {
            setMessage({ type: 'error', text: 'Supabase is not connected. The experiment record was not saved.' });
            return;
        }
        try {
            const { error } = await supabase.from('marketing_experiments').insert([{
                name: newExp.name,
                status: 'Draft',
                variant_a: { name: newExp.varA || 'Variant A' },
                variant_b: { name: newExp.varB || 'Variant B' }
            }]);

            if (error) throw error;

            setMessage({ type: 'success', text: 'Experiment configuration saved. Traffic delivery and measurement are not connected.' });
            setTimeout(() => setMessage(null), 3000);
            setIsAdding(false);
            setNewExp({ name: '', varA: '', varB: '' });
            fetchExperiments();
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not save the experiment record.' });
        }
    };

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-background min-h-screen text-left pb-40">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Activity className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Saved Experiment Records</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Experimentation</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-2">Create and review experiment configuration records. Traffic routing and analytics are not connected.</p>
                </div>
                <Button onClick={startExperiment} className="rounded-xl h-12 px-8 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                    <Plus size={16} className="mr-2" /> New Experiment Record
                </Button>
            </header>

            {message && (
                <div className={cn(
                    "p-6 rounded-[2rem] border-2 flex items-center gap-4 animate-in slide-in-from-top-4",
                    message.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-rose-50 border-rose-100 text-rose-600"
                )}>
                    {message.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                    <p className="text-sm font-black uppercase tracking-widest">{message.text}</p>
                </div>
            )}
            {loadError && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadError}</div>}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Experiment records are stored in Supabase only. No traffic splitting, conversion telemetry, or statistical significance integration is connected; saved statuses and values do not represent live testing.
            </div>

            <div className="bg-card rounded-[2rem] border border-border shadow-sm overflow-hidden min-h-[300px]">
                {loading ? (
                    <div className="p-20 text-center flex flex-col items-center gap-4">
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Loading saved records…</p>
                    </div>
                ) : experiments.length === 0 ? (
                    <div className="p-12 text-center text-sm text-muted-foreground">
                        <Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                        {loadError ? 'Experiment records could not be loaded.' : 'No saved experiment records.'}
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 gap-4 p-4 sm:p-8">
                        {experiments.map(exp => (
                            <Card key={exp.id} className="p-5 sm:p-8 rounded-3xl border border-border bg-card shadow-sm space-y-6">
                                <div className="flex flex-wrap justify-between items-start gap-4">
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <Target size={18} className="text-primary" />
                                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Saved status: {exp.status}</span>
                                        </div>
                                        <h3 className="text-xl font-black uppercase tracking-tight text-foreground">{exp.name}</h3>
                                    </div>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-4">
                                    {([
                                        { label: 'Variant A', variant: exp.variant_a },
                                        { label: 'Variant B', variant: exp.variant_b }
                                    ]).map(({ label, variant }) => (
                                        <div key={label} className="p-5 rounded-2xl border border-border bg-secondary/50 space-y-4">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
                                                <h4 className="mt-1 font-bold text-foreground">{variant.name || 'Name unavailable'}</h4>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <p className="text-[9px] font-bold uppercase text-muted-foreground">CTR</p>
                                                    <p className="font-semibold text-muted-foreground">Unavailable</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-bold uppercase text-muted-foreground">Orders</p>
                                                    <p className="font-semibold text-muted-foreground">Unavailable</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t border-border pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <p className="text-xs text-muted-foreground">CTR and order data are unavailable because telemetry is not connected.</p>
                                    <Button
                                        variant="outline"
                                        onClick={() => endExperiment(exp.id)}
                                        disabled={exp.status === 'Ended'}
                                        className="w-full sm:w-auto"
                                    >
                                        {exp.status === 'Ended' ? 'Record Ended' : 'Mark Record Ended'}
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {isAdding && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-background/20 backdrop-blur-md p-6">
                    <Card className="max-w-md w-full bg-card rounded-[3rem] border border-border shadow-2xl p-10 space-y-8 animate-in zoom-in-95 duration-300">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><Zap size={24} /></div>
                            <h3 className="text-2xl font-black uppercase text-foreground tracking-tighter">New Experiment Record</h3>
                        </div>
                        <div className="space-y-4 text-left">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Experiment Name</label>
                                <Input value={newExp.name} onChange={e => setNewExp({...newExp, name: e.target.value})} className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground" placeholder="e.g. Price Anchor Test" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Variant A</label>
                                    <Input value={newExp.varA} onChange={e => setNewExp({...newExp, varA: e.target.value})} className="h-12 rounded-xl bg-secondary border-border font-bold text-foreground" placeholder="Baseline" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Variant B</label>
                                    <Input value={newExp.varB} onChange={e => setNewExp({...newExp, varB: e.target.value})} className="h-12 rounded-xl bg-secondary border-border font-bold text-foreground" placeholder="Challenger" />
                                </div>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground">Saving this draft does not route traffic or collect experiment metrics.</p>
                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <Button onClick={handleCreateExperiment} disabled={!newExp.name.trim()} className="flex-1 h-14 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 transition-all">Save Draft</Button>
                            <Button onClick={() => setIsAdding(false)} variant="outline" className="flex-1 h-14 rounded-2xl font-black uppercase text-[10px] border-border">Abort</Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
