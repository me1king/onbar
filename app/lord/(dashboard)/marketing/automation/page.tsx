'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Rocket,
    Plus,
    Zap,
    MessageCircle,
    Mail,
    Loader2,
    CheckCircle2,
    ShieldAlert,
    Activity,
    Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';

interface AutomationRule {
    id: string;
    name: string;
    trigger: string;
    action: string;
    channel: 'WhatsApp' | 'Email' | 'System';
    is_active: boolean;
    last_run_at: string | null;
}

export default function MarketingAutopilot() {
    const { email } = useAdmin();
    const [rules, setRules] = React.useState<AutomationRule[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [isAdding, setIsAdding] = React.useState(false);
    const [message, setMessage] = React.useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [newRule, setNewRule] = React.useState<{
        name: string;
        trigger: string;
        channel: 'WhatsApp' | 'Email' | 'System';
        action: string;
    }>({
        name: '',
        trigger: 'On Signup',
        channel: 'Email',
        action: 'Send Welcome Coupon'
    });

    const fetchRules = React.useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        if (!supabase) {
            setLoadError('Supabase is not connected. Saved automation rules are unavailable.');
            setLoading(false);
            return;
        }
        try {
            const { data, error } = await supabase.from('marketing_automations').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setRules(data || []);
        } catch (err) {
            console.error(err);
            setLoadError(err instanceof Error ? err.message : 'Could not load saved automation rules.');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleDeleteRule = async (id: string, name: string) => {
        if (!supabase || !confirm(`Permanently expunge automation protocol "${name}"?`)) return;
        try {
            const { error } = await supabase.from('marketing_automations').delete().eq('id', id);
            if (error) throw error;
            setRules(prev => prev.filter(r => r.id !== id));
            await logAuditAction(email, 'DELETE_AUTOMATION', { id, name });
            setMessage({ type: 'success', text: `Node "${name}" successfully expelled.` });
            setTimeout(() => setMessage(null), 3000);
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: "Expulsion Protocol Failed." });
        }
    };

    React.useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    const toggleRule = async (id: string, current: boolean) => {
        if (!supabase) return;
        try {
            const { error } = await supabase.from('marketing_automations').update({ is_active: !current }).eq('id', id);
            if (!error) {
                setRules(prev => prev.map(r => r.id === id ? { ...r, is_active: !current } : r));
                await logAuditAction(email, 'TOGGLE_AUTOMATION', { id, state: !current });
            }
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not update saved rule.' });
        }
    };

    const handleCreateRule = async () => {
        if (!supabase || !newRule.name.trim()) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('marketing_automations').insert([{
                ...newRule,
                is_active: true
            }]);
            if (error) throw error;
            setIsAdding(false);
            setNewRule({ name: '', trigger: 'On Signup', channel: 'Email', action: 'Send Welcome Coupon' });
            fetchRules();
            setMessage({ type: 'success', text: "Rule saved. Delivery is not connected." });
            setTimeout(() => setMessage(null), 3000);
        } catch (err: unknown) {
            const error = err as Error;
            setMessage({ type: 'error', text: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-background min-h-screen text-left pb-40">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Rocket className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Configuration Only</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Journey Builder</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Manage saved automation rule records. Delivery and event-trigger execution are not connected.</p>
                </div>
                <Button onClick={() => setIsAdding(true)} className="rounded-xl h-12 px-8 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                    <Plus size={16} className="mr-2" /> New Automation
                </Button>
            </header>

            {message && (
                <div className={cn(
                    "p-6 rounded-[2rem] border-2 flex items-center gap-4 animate-in slide-in-from-top-4",
                    message.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-rose-50 border-rose-100 text-rose-600"
                )}>
                    {message.type === 'success' ? <CheckCircle2 size={24} /> : <ShieldAlert size={24} />}
                    <p className="text-sm font-black uppercase tracking-widest">{message.text}</p>
                </div>
            )}
            {loadError && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadError}</div>}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Active flags and run counts are values saved in Supabase. No email, WhatsApp, or other delivery integration is connected, so these rules do not currently execute.
            </div>

            <div className="grid lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 space-y-6">
                    <div className="flex items-center justify-between px-4">
                        <h2 className="text-xl font-black uppercase tracking-tighter text-foreground">Saved Automation Rules</h2>
                        <span className="text-[10px] font-black uppercase text-muted-foreground bg-card px-3 py-1 rounded-full border border-border">{rules.length} Rules</span>
                    </div>

                    <div className="grid gap-4">
                        {loading ? (
                            <div className="p-20 text-center flex flex-col items-center gap-4 bg-white rounded-[3rem] border border-slate-100">
                                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                                <p className="text-[10px] font-black uppercase text-slate-300">Syncing Journey Nodes...</p>
                            </div>
                        ) : rules.length === 0 ? (
                            <Card className="p-8 text-sm text-muted-foreground">{loadError ? 'Rules could not be loaded.' : 'No saved automation rules.'}</Card>
                        ) : rules.map(rule => (
                            <Card key={rule.id} className={cn(
                                "p-8 rounded-[3rem] border transition-all hover:shadow-xl relative overflow-hidden group",
                                rule.is_active ? "bg-white border-slate-100" : "bg-slate-50/50 border-dashed border-slate-200 opacity-60"
                            )}>
                                <div className="flex flex-col sm:flex-row justify-between items-center gap-8 relative z-10">
                                    <div className="flex items-center gap-6 flex-1 text-left">
                                        <div className={cn(
                                            "h-14 w-14 rounded-2xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-110",
                                            rule.channel === 'WhatsApp' ? "bg-emerald-50 text-emerald-500" :
                                            rule.channel === 'Email' ? "bg-indigo-50 text-indigo-500" :
                                            "bg-primary/5 text-primary"
                                        )}>
                                            {rule.channel === 'WhatsApp' ? <MessageCircle size={24} /> :
                                             rule.channel === 'Email' ? <Mail size={24} /> : <Zap size={24} />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-primary">{rule.trigger}</span>
                                                <div className="h-1 w-1 rounded-full bg-slate-200" />
                                                <span className="text-[8px] font-black uppercase text-slate-400">{rule.channel}</span>
                                            </div>
                                            <h3 className="text-xl font-black uppercase tracking-tight text-foreground">{rule.name}</h3>
                                            <p className="text-[10px] font-medium text-muted-foreground mt-1">{rule.action}</p>
                                            <p className="text-[9px] font-bold text-muted-foreground mt-1">Saved active flag: {rule.is_active ? 'On' : 'Off'} (execution unavailable)</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-6">
                                        <div className="text-right">
                                            <p className="text-[8px] font-black uppercase text-slate-400 mb-1">Run Telemetry</p>
                                            <p className="text-sm font-semibold text-muted-foreground">Unavailable</p>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <button
                                                onClick={() => toggleRule(rule.id, rule.is_active)}
                                                aria-label={`Toggle saved active flag for ${rule.name}; delivery is not connected`}
                                                title="Changes the saved flag only; it does not start or stop message delivery"
                                                className={cn(
                                                    "w-12 h-6 rounded-full transition-all relative p-1 flex items-center shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                                    rule.is_active ? "bg-emerald-500" : "bg-slate-200"
                                                )}
                                            >
                                                <div className={cn(
                                                    "h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                                                    rule.is_active ? "translate-x-6" : "translate-x-0"
                                                )} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteRule(rule.id, rule.name)}
                                                className="text-[8px] font-black uppercase text-rose-400 hover:text-rose-600 transition-colors"
                                            >
                                                Delete Rule
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-8">
                    <Card className="p-8 rounded-[3rem] bg-card border border-border shadow-sm text-left">
                        <div className="space-y-5">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700"><Activity size={20} /></div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Automation Performance</h3>
                            </div>
                            <p className="font-semibold text-foreground">Unavailable</p>
                            <p className="text-sm text-muted-foreground">Revenue, retention, conversions, and delivery telemetry are not connected. No performance totals are available.</p>
                        </div>
                    </Card>

                </div>
            </div>

            {/* MODAL: NEW RULE */}
            {isAdding && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-background/20 backdrop-blur-md p-6">
                    <Card className="max-w-xl w-full bg-white rounded-[3.5rem] border border-border shadow-2xl p-10 space-y-10 animate-in zoom-in-95 duration-500 text-left">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4 text-left">
                                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><Plus size={24} /></div>
                                <div className="text-left">
                                    <h3 className="text-2xl font-black uppercase tracking-tighter text-foreground">New Automation Rule</h3>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Save configuration only</p>
                                </div>
                            </div>
                            <button onClick={() => setIsAdding(false)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={24} /></button>
                        </div>

                        <div className="space-y-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Mission Name</label>
                                <Input
                                    value={newRule.name}
                                    onChange={e => setNewRule({...newRule, name: e.target.value})}
                                    className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground"
                                    placeholder="e.g. Lapsed VIP Recovery"
                                />
                            </div>

                            <div className="grid sm:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Event Trigger</label>
                                    <select
                                        value={newRule.trigger}
                                        onChange={e => setNewRule({...newRule, trigger: e.target.value})}
                                        className="w-full h-14 rounded-2xl bg-secondary border border-border px-4 text-[10px] font-black uppercase text-foreground outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option>On Signup</option>
                                        <option>After Purchase</option>
                                        <option>On Stock Alert</option>
                                        <option>30 Days Inactive</option>
                                        <option>3 Days Post-Delivery</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Configured Channel (not connected)</label>
                                    <div className="flex gap-2">
                                        {(['Email', 'WhatsApp', 'System'] as const).map(c => (
                                            <button
                                                key={c}
                                                onClick={() => setNewRule({...newRule, channel: c})}
                                                className={cn(
                                                    "flex-1 h-12 rounded-xl text-[8px] font-black uppercase border-2 transition-all",
                                                    newRule.channel === c ? "border-primary bg-primary/5 text-primary shadow-sm" : "border-slate-100 text-slate-400 hover:bg-slate-50"
                                                )}
                                            >
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Configured Action (not dispatched)</label>
                                <Input
                                    value={newRule.action}
                                    onChange={e => setNewRule({...newRule, action: e.target.value})}
                                    className="h-14 rounded-2xl bg-secondary border-border font-medium text-foreground"
                                    placeholder="e.g. Send 10% discount code..."
                                />
                            </div>
                        </div>

                        <div className="pt-6 border-t border-border flex gap-4">
                            <Button
                                onClick={handleCreateRule}
                                disabled={!newRule.name || loading}
                                className="flex-1 h-16 rounded-[1.5rem] bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                            >
                                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save Rule"}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
