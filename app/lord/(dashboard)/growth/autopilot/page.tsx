'use client';

import * as React from 'react';
import TacticalEventFeed from '@/components/admin/TacticalEventFeed';
import {
    Bot,
    Plus,
    Trash2,
    Clock,
    Zap,
    Loader2,
    X,
    RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';

interface AutopilotRule {
    id: string;
    slot_day_of_week: number;
    slot_time: string;
    platform: string;
    content_source: string;
    is_active: boolean;
}

interface RulesResponse {
    rules?: AutopilotRule[];
    rule?: AutopilotRule;
    error?: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AutopilotManagement() {
    const { email } = useAdmin();
    const [rules, setRules] = React.useState<AutopilotRule[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [actionError, setActionError] = React.useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [busyRuleId, setBusyRuleId] = React.useState<string | null>(null);
    const [slotDay, setSlotDay] = React.useState('1');
    const [slotTime, setSlotTime] = React.useState('09:00');
    const [platform, setPlatform] = React.useState('INSTAGRAM');
    const [contentSource, setContentSource] = React.useState('TRENDING');

    const fetchRules = React.useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const response = await fetch('/api/admin/autopilot-rules', { cache: 'no-store' });
            const result = await response.json() as RulesResponse;
            if (!response.ok) throw new Error(result.error || 'Autopilot slots could not be loaded.');
            setRules(result.rules || []);
        } catch (err) {
            console.error('Could not load autopilot slots:', err);
            setLoadError(err instanceof Error ? err.message : 'Autopilot slots could not be loaded.');
        }
        finally { setLoading(false); }
    }, []);

    React.useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    const toggleRule = async (id: string, current: boolean) => {
        if (busyRuleId || saving) return;
        setBusyRuleId(id);
        setActionError(null);
        try {
            const response = await fetch('/api/admin/autopilot-rules', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, is_active: !current })
            });
            const result = await response.json() as RulesResponse;
            if (!response.ok) throw new Error(result.error || 'Autopilot slot could not be updated.');
            setRules(prev => prev.map(rule => rule.id === id ? { ...rule, is_active: !current } : rule));
            await logAuditAction(email, 'TOGGLE_AUTOPILOT_RULE', { id, active: !current });
        } catch (err) {
            console.error('Could not update autopilot slot:', err);
            setActionError(err instanceof Error ? err.message : 'Autopilot slot could not be updated.');
        } finally {
            setBusyRuleId(null);
        }
    };

    const deleteRule = async (id: string) => {
        if (busyRuleId || saving || !confirm('Delete this autopilot slot?')) return;
        setBusyRuleId(id);
        setActionError(null);
        try {
            const response = await fetch(`/api/admin/autopilot-rules?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            const result = await response.json() as RulesResponse;
            if (!response.ok) throw new Error(result.error || 'Autopilot slot could not be deleted.');
            setRules(prev => prev.filter(rule => rule.id !== id));
            await logAuditAction(email, 'DELETE_AUTOPILOT_RULE', { id });
        } catch (err) {
            console.error('Could not delete autopilot slot:', err);
            setActionError(err instanceof Error ? err.message : 'Autopilot slot could not be deleted.');
        } finally {
            setBusyRuleId(null);
        }
    };

    const createRule = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setActionError(null);
        try {
            const response = await fetch('/api/admin/autopilot-rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slot_day_of_week: Number(slotDay),
                    slot_time: slotTime,
                    platform,
                    content_source: contentSource
                })
            });
            const result = await response.json() as RulesResponse;
            if (!response.ok) throw new Error(result.error || 'Autopilot slot could not be created.');
            if (!result.rule) throw new Error('The server did not return the saved autopilot slot.');
            setRules(prev => [...prev, result.rule!].sort(
                (a, b) => a.slot_day_of_week - b.slot_day_of_week || a.slot_time.localeCompare(b.slot_time)
            ));
            await logAuditAction(email, 'CREATE_AUTOPILOT_RULE', { id: result.rule.id, platform, contentSource });
            setIsDialogOpen(false);
        } catch (err) {
            console.error('Could not create autopilot slot:', err);
            setActionError(err instanceof Error ? err.message : 'Autopilot slot could not be created.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-w-0 space-y-8 bg-slate-50 p-4 text-left selection:bg-primary/20 sm:space-y-10 sm:p-8 sm:pb-40">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                        <Bot className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Neural Orchestration</span>
                    </div>
                    <h1 className="text-3xl font-black text-foreground uppercase tracking-tighter leading-tight sm:text-4xl">Smart Autopilot</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Define recurring slots for content drafts. Publishing stays manual until a scheduler and social channels are configured.</p>
                </div>
                <Button onClick={() => { setActionError(null); setIsDialogOpen(true); }} className="h-12 w-full shrink-0 rounded-xl bg-primary px-5 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-primary/20 transition-all hover:scale-[1.01] active:scale-95 sm:w-auto sm:px-8">
                    <Plus className="h-4 w-4 mr-2" /> Program New Slot
                </Button>
            </header>

            {actionError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{actionError}</p>}

            <div className="grid min-w-0 gap-6 lg:grid-cols-12 lg:gap-10">
                <div className="lg:col-span-8 space-y-6">
                    <div className="flex items-center justify-between gap-3 px-1 sm:px-4">
                        <h2 className="text-xl font-black uppercase tracking-tighter text-foreground">Rule Registry</h2>
                        <span className="shrink-0 rounded-full border border-slate-100 bg-white px-3 py-1 text-[10px] font-black uppercase text-slate-400">{rules.filter(rule => rule.is_active).length} Slots Active</span>
                    </div>

                    <div className="grid gap-4">
                        {loading ? (
                            <div className="p-20 text-center bg-white rounded-[3rem] border border-slate-100 animate-pulse flex flex-col items-center gap-4">
                                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Synchronizing Neural Slots...</p>
                            </div>
                        ) : loadError ? (
                            <div role="alert" className="space-y-4 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
                                <p>{loadError}</p>
                                <Button type="button" variant="outline" onClick={fetchRules}><RefreshCw className="mr-2 h-4 w-4" /> Retry</Button>
                            </div>
                        ) : rules.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                                No autopilot slots configured yet. Add a slot to create scheduled content drafts.
                            </div>
                        ) : rules.map(rule => (
                            <Card key={rule.id} className={cn(
                                "relative min-w-0 overflow-hidden rounded-2xl border p-4 transition-all hover:shadow-xl sm:rounded-[2rem] sm:p-8",
                                rule.is_active ? "bg-white border-slate-100" : "bg-slate-50 border-dashed border-slate-200 opacity-60 grayscale"
                            )}>
                                <div className="relative z-10 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex min-w-0 items-center gap-3 sm:gap-6">
                                        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 shadow-inner sm:h-20 sm:w-20 sm:rounded-[2rem]">
                                            <span className="text-[9px] font-black uppercase text-slate-400">{DAYS[rule.slot_day_of_week].substring(0, 3)}</span>
                                            <span className="text-lg font-black text-foreground sm:text-xl">{rule.slot_time.substring(0, 5)}</span>
                                        </div>
                                        <div className="min-w-0 space-y-1 text-left">
                                            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                                                <span className="text-[10px] font-black uppercase text-primary tracking-widest">{rule.platform}</span>
                                                <div className="h-1 w-1 rounded-full bg-slate-200" />
                                                <span className="text-[9px] font-black uppercase text-slate-400">{rule.content_source} Strategy</span>
                                            </div>
                                            <h3 className="break-words text-base font-black uppercase tracking-tight text-foreground sm:text-xl">Scheduled Content Draft</h3>
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center justify-end gap-4 sm:gap-6">
                                        <button
                                            onClick={() => toggleRule(rule.id, rule.is_active)}
                                            disabled={busyRuleId === rule.id || saving}
                                            aria-label={`${rule.is_active ? 'Deactivate' : 'Activate'} ${DAYS[rule.slot_day_of_week]} ${rule.slot_time.substring(0, 5)} slot`}
                                            aria-pressed={rule.is_active}
                                            className={cn(
                                                "relative flex h-7 w-12 items-center rounded-full p-1 shadow-inner transition-all disabled:cursor-wait disabled:opacity-50",
                                                rule.is_active ? "bg-emerald-500" : "bg-slate-200"
                                            )}
                                        >
                                            <div className={cn(
                                                "h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                                                rule.is_active ? "translate-x-6" : "translate-x-0"
                                            )} />
                                        </button>
                                        <Button variant="ghost" size="icon" disabled={busyRuleId === rule.id || saving} aria-label="Delete autopilot slot" onClick={() => deleteRule(rule.id)} className="h-10 w-10 rounded-xl text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100"><Trash2 size={18} /></Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-8">
                    <Card className="p-10 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-8 relative overflow-hidden group hover:border-primary/20 transition-all">
                        <div className="relative z-10 space-y-6 text-left">
                            <Zap className="h-10 w-10 text-primary animate-pulse" />
                            <h3 className="text-2xl font-black uppercase tracking-tighter leading-none text-foreground">Autopilot Status</h3>
                            <p className="text-sm font-medium text-slate-500 italic leading-relaxed">
                                &quot;Configured slots are saved as rules. Draft generation requires the scheduler integration; publishing is never automatic from this screen.&quot;
                            </p>
                            <div className="pt-6 border-t border-slate-50 flex justify-between items-center">
                                <span className="text-[9px] font-black uppercase tracking-widest text-primary">Neural Health</span>
                                <span className="text-xs font-black uppercase text-slate-500">Drafts only</span>
                            </div>
                        </div>
                        <Zap className="absolute -bottom-10 -left-10 h-48 w-48 text-primary/5 rotate-12" />
                    </Card>

                    <div className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-6 text-left group">
                        <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-inner group-hover:rotate-6 transition-transform">
                            <Clock size={24} />
                        </div>
                        <h4 className="text-lg font-black uppercase text-foreground leading-none tracking-tighter">Content Pipeline</h4>
                        <div className="space-y-3">
                            {[
                                { label: 'Trending', val: 'High', color: 'emerald' },
                                { label: 'Low Stock', val: 'Low', color: 'rose' },
                                { label: 'Editorial', val: 'Medium', color: 'indigo' },
                            ].map(s => (
                                <div key={s.label} className="flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase text-slate-400">{s.label}</span>
                                    <span className={cn("text-[10px] font-black uppercase", `text-${s.color}-500`)}>{s.val} Priority</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="pt-6">
                <TacticalEventFeed
                    title="Autopilot Neural Stream"
                    subtitle="Live Automated Slot Execution & Pipeline Monitoring"
                />
            </div>

            {isDialogOpen && (
                <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
                    <form onSubmit={createRule} className="max-h-[90dvh] w-full max-w-lg space-y-5 overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-black uppercase tracking-tight text-foreground">Program content slot</h2>
                                <p className="mt-1 text-sm text-slate-500">Creates a recurring schedule for content drafts; it does not publish automatically.</p>
                            </div>
                            <button type="button" onClick={() => setIsDialogOpen(false)} aria-label="Close dialog" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
                        </div>
                        <label className="block space-y-2 text-sm font-semibold text-slate-700">
                            Day of week
                            <select value={slotDay} onChange={event => setSlotDay(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3">
                                {DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
                            </select>
                        </label>
                        <label className="block space-y-2 text-sm font-semibold text-slate-700">
                            Time
                            <input type="time" value={slotTime} onChange={event => setSlotTime(event.target.value)} required className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3" />
                        </label>
                        <label className="block space-y-2 text-sm font-semibold text-slate-700">
                            Draft channel
                            <select value={platform} onChange={event => setPlatform(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3">
                                <option value="INSTAGRAM">Instagram</option>
                                <option value="FACEBOOK">Facebook</option>
                                <option value="TIKTOK">TikTok</option>
                                <option value="WHATSAPP">WhatsApp</option>
                            </select>
                        </label>
                        <label className="block space-y-2 text-sm font-semibold text-slate-700">
                            Content source
                            <select value={contentSource} onChange={event => setContentSource(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3">
                                <option value="TRENDING">Top-rated products</option>
                                <option value="LOW_STOCK">Low-stock products</option>
                                <option value="EDITORIAL">Recently added products</option>
                            </select>
                        </label>
                        {actionError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <Button type="button" variant="outline" disabled={saving} onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={saving} className="bg-primary text-white">
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                {saving ? 'Saving…' : 'Create slot'}
                            </Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
