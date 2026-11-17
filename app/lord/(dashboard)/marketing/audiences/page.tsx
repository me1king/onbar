'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Users,
    Plus,
    Search,
    MoreVertical,
    Target,
    Zap,
    ArrowRight,
    Loader2,
    X,
    Filter,
    Activity,
    DollarSign,
    ShoppingCart,
    Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useAdmin } from '@/context/AdminContext';
import Link from 'next/link';

interface Segment {
    id: string;
    name: string;
    rules: Record<string, unknown>;
    estimated_reach: number | null;
    created_at: string;
}

export default function AudiencesPage() {
    useAdmin();
    const [segments, setSegments] = useState<Segment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDefining, setIsDefining] = useState(false);

    // Define State
    const [newSegment, setNewSegment] = useState({
        name: '',
        spend_min: '0',
        orders_min: '0',
        last_order_days: '90',
        reach: null as number | null
    });

    const getReach = useCallback(async (rules: Record<string, unknown>) => {
        const response = await fetch('/api/admin/marketing/audiences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'estimate', rules })
        });
        const result = await response.json() as { reach?: number; error?: string };
        if (!response.ok || typeof result.reach !== 'number') {
            throw new Error(result.error || 'Unable to calculate audience reach.');
        }
        return result.reach;
    }, []);

    const refreshSegments = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/admin/marketing/audiences', { cache: 'no-store' });
            const result = await response.json() as { segments?: Segment[]; error?: string };
            if (!response.ok || !Array.isArray(result.segments)) {
                throw new Error(result.error || 'Unable to load audience segments.');
            }
            setSegments(result.segments);
        } catch (fetchError) {
            console.error('Audience segment fetch failed:', fetchError);
            setSegments([]);
            setError(fetchError instanceof Error ? fetchError.message : 'Unable to load audience segments.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refreshSegments();
    }, [refreshSegments]);

    const calculateReach = async () => {
        setError(null);
        try {
            const reach = await getReach({
                spend_min: newSegment.spend_min,
                orders_min: newSegment.orders_min,
                last_order_days: newSegment.last_order_days
            });
            setNewSegment(prev => ({ ...prev, reach }));
        } catch (reachError) {
            console.error('Audience reach calculation failed:', reachError);
            setError(reachError instanceof Error ? reachError.message : 'Unable to calculate audience reach.');
        }
    };

    const handleCreateSegment = async () => {
        if (!newSegment.name.trim()) {
            setError('Enter a segment name.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/admin/marketing/audiences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                action: 'create',
                name: newSegment.name,
                rules: {
                    spend_min: newSegment.spend_min,
                    orders_min: newSegment.orders_min,
                    last_order_days: newSegment.last_order_days
                }
                })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Unable to save the audience segment.');
            setIsDefining(false);
            setNewSegment({ name: '', spend_min: '0', orders_min: '0', last_order_days: '90', reach: null });
            await refreshSegments();
        } catch (createError) {
            console.error('Audience segment save failed:', createError);
            setError(createError instanceof Error ? createError.message : 'Unable to save the audience segment.');
        } finally {
            setLoading(false);
        }
    };

    const filtered = segments.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleDeleteSegment = async (id: string, name: string) => {
        if (!confirm(`Permanently expunge audience segment "${name}"?`)) return;
        try {
            const response = await fetch('/api/admin/marketing/audiences', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Could not delete the audience segment.');
            setSegments(prev => prev.filter(s => s.id !== id));
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Could not delete the audience segment.');
        }
    };

    return (
        <div className="p-4 sm:p-8 space-y-8 sm:space-y-10 bg-background min-h-screen text-left">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-border pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Audience Intel</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter">Customer Segments</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Manage dynamic targeting rules and audience clusters.</p>
                </div>
                <Button
                    onClick={() => setIsDefining(true)}
                    className="rounded-xl h-12 px-6 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                >
                    <Plus size={16} className="mr-2" /> Define Segment
                </Button>
            </header>

            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}

            {isDefining && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-background/20 p-4 backdrop-blur-md sm:p-6">
                    <Card className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-[2rem] border border-border bg-white p-5 text-left shadow-2xl space-y-6 animate-in zoom-in-95 duration-500 sm:rounded-[3.5rem] sm:p-8 sm:space-y-8">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><Filter size={24} /></div>
                                <div className="text-left">
                                    <h3 className="text-xl font-black uppercase tracking-tighter text-foreground sm:text-2xl">Rule Engine</h3>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dynamic Audience Builder</p>
                                </div>
                            </div>
                            <button onClick={() => setIsDefining(false)} className="text-slate-300 hover:text-rose-500 transition-colors"><X size={24} /></button>
                        </div>

                        <div className="space-y-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Segment Identity</label>
                                <Input
                                    value={newSegment.name}
                                    onChange={e => setNewSegment({...newSegment, name: e.target.value})}
                                    placeholder="e.g. High-Spending Lapsed VIPs"
                                    className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground"
                                />
                            </div>

                            <div className="grid sm:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black uppercase text-muted-foreground flex items-center gap-2 px-1"><DollarSign size={10} /> Minimum Spend (LTV)</label>
                                        <Input type="number" value={newSegment.spend_min} onChange={e => setNewSegment({...newSegment, spend_min: e.target.value})} className="h-12 rounded-xl bg-secondary border-border font-black text-primary" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black uppercase text-muted-foreground flex items-center gap-2 px-1"><ShoppingCart size={10} /> Min Orders</label>
                                        <Input type="number" value={newSegment.orders_min} onChange={e => setNewSegment({...newSegment, orders_min: e.target.value})} className="h-12 rounded-xl bg-secondary border-border font-black text-foreground" />
                                    </div>
                                </div>

                                <div className="flex w-full min-w-0 flex-col justify-center space-y-4 rounded-[2rem] border border-border bg-secondary p-4 text-center sm:rounded-[2.5rem] sm:p-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Estimated Reach</p>
                                        <h4 className="whitespace-nowrap text-3xl font-black text-primary tracking-tighter tabular-nums sm:text-4xl">
                                            {newSegment.reach?.toLocaleString() ?? 'Unavailable'}
                                        </h4>
                                    </div>
                                    <Button
                                        onClick={calculateReach}
                                        variant="outline"
                                        className="h-10 rounded-xl bg-white text-[8px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50"
                                    >
                                        <Activity size={12} className="mr-2" />
                                        Run Reach Scan
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-6 border-t border-border">
                            <Button
                                onClick={handleCreateSegment}
                                disabled={!newSegment.name || loading}
                                className="flex-1 h-16 rounded-[1.5rem] bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                            >
                                {loading ? <Loader2 size={18} className="animate-spin" /> : "Commit Segment"}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by segment name..."
                        className="h-14 rounded-2xl bg-card border-border pl-12 text-sm font-bold shadow-sm"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
                {loading ? (
                    [...Array(3)].map((_, i) => (
                        <Card key={i} className="p-8 rounded-[2.5rem] bg-card border-border animate-pulse h-64"></Card>
                    ))
                ) : filtered.length === 0 ? (
                    <div className="col-span-full py-40 text-center space-y-6 opacity-30">
                        <Target size={64} className="mx-auto" />
                        <p className="text-lg font-black uppercase tracking-tighter">No Segments Defined</p>
                    </div>
                ) : (
                    filtered.map((seg) => (
                        <Card key={seg.id} className="p-8 rounded-[3rem] border border-border bg-card shadow-sm group hover:border-primary/20 transition-all flex flex-col justify-between relative overflow-hidden h-full">
                            <div className="relative z-10 space-y-6 flex flex-col h-full justify-between">
                                <div className="space-y-6">
                                    <div className="flex justify-between items-start">
                                        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                            <Target size={24} />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button onClick={() => handleDeleteSegment(seg.id, seg.name)} variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-all">
                                                <Trash2 size={16} />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                                <MoreVertical size={16} className="text-muted-foreground" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-foreground uppercase tracking-tight">{seg.name}</h3>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Rule-Based Dynamic List</p>
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-border flex justify-between items-center mt-auto">
                                    <div>
                                        <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">Reach</p>
                                        <p className="text-2xl font-black text-primary">{seg.estimated_reach?.toLocaleString() ?? 'Unavailable'}</p>
                                    </div>
                                    <Link href="/lord/marketing/create" className="flex">
                                        <Button size="sm" variant="ghost" className="text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary/5">
                                            Target <ArrowRight size={12} className="ml-2" />
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                            <Zap className="absolute -bottom-10 -right-10 h-32 w-32 text-primary/5 rotate-12 -z-0" />
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
