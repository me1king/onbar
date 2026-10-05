'use client';

import * as React from 'react';
import {
    Zap,
    Loader2,
    Save,
    X,
    TrendingUp,
    Settings2,
    Smartphone,
    Plus,
    Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatPrice } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';
import Image from 'next/image';

interface MobileWidget {
    id: string;
    title: string;
    description: string;
    content_type: 'PRODUCT' | 'TRENDING' | 'ANNOUNCEMENT' | 'ORDER';
    image_url: string;
    product_id: string | null;
    cta_label: string;
    deep_link: string;
    status: string;
    priority: number;
    target_segment: string;
    start_at: string;
    expires_at: string | null;
}

export default function MobileWidgetCommand() {
    const { email } = useAdmin();
    const [widgets, setWidgets] = React.useState<MobileWidget[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [editing, setEditing] = React.useState<Partial<MobileWidget> | null>(null);
    const [products, setProducts] = React.useState<Array<{ id: string, name: string, image_url: string }>>([]);
    const [conversions, setConversions] = React.useState<Record<string, { orders: number; revenue: number }>>({});
    const [conversionError, setConversionError] = React.useState<string | null>(null);
    const [pinMessage, setPinMessage] = React.useState<string | null>(null);
    const [actionError, setActionError] = React.useState<string | null>(null);

    const fetchWidgets = React.useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/admin/mobile-widgets', { cache: 'no-store' });
            const result = await response.json() as {
                widgets?: MobileWidget[];
                products?: Array<{ id: string | number; name: string; image_url: string }>;
                conversions?: Record<string, { orders: number; revenue: number }>;
                conversionError?: string | null;
                error?: string;
            };
            if (!response.ok) throw new Error(result.error || 'Unable to load mobile widget data.');
            setWidgets(result.widgets || []);
            setProducts((result.products || []).map(product => ({ ...product, id: String(product.id) })));
            setConversions(result.conversions || {});
            setConversionError(result.conversionError || null);
        } catch (err) {
            console.error('[MobileWidgetCommand] Unable to load widget data:', err);
            setConversionError(err instanceof Error ? err.message : 'Unable to load widget data.');
            setWidgets([]);
            setConversions({});
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchWidgets();
    }, [fetchWidgets]);

    const requestWidgetPin = () => {
        const nativeWindow = window as Window & { TitanNode?: { requestWidgetPin: () => void } };
        if (!nativeWindow.TitanNode?.requestWidgetPin) {
            setPinMessage('Widget placement can only be requested from the installed Android app. Your phone launcher will ask you to confirm; the app cannot place it silently.');
            return;
        }
        setPinMessage('Accept the Android launcher prompt to add the widget to your home screen.');
        nativeWindow.TitanNode.requestWidgetPin();
    };

    const handleSave = async () => {
        if (!editing) return;
        setLoading(true);
        setActionError(null);
        try {
            const payload = {
                ...editing,
                updated_at: new Date().toISOString()
            };
            const response = await fetch('/api/admin/mobile-widgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Unable to save the widget.');
            await logAuditAction(email, 'MOBILE_WIDGET_SAVE', { title: editing.title });
            setEditing(null);
            await fetchWidgets();
        } catch (err) {
            console.error('[MobileWidgetCommand] Unable to save widget:', err);
            setActionError(err instanceof Error ? err.message : 'Unable to save the widget.');
        } finally { setLoading(false); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this widget configuration?")) return;
        setActionError(null);
        try {
            const response = await fetch(`/api/admin/mobile-widgets?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Unable to delete the widget.');
            await fetchWidgets();
        } catch (err) {
            console.error('[MobileWidgetCommand] Unable to delete widget:', err);
            setActionError(err instanceof Error ? err.message : 'Unable to delete the widget.');
        }
    };

    return (
        <div className="min-h-screen space-y-8 bg-slate-50 p-4 pb-40 text-left selection:bg-primary/20 sm:space-y-10 sm:p-6 lg:p-8">
            <header className="flex flex-col items-start justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:gap-6 sm:pb-8">
                <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                        <Smartphone className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Terminal Experience</span>
                    </div>
                    <h1 className="break-words text-3xl font-black uppercase leading-tight tracking-tighter text-foreground sm:text-4xl sm:leading-none">App Widget Command</h1>
                    <p className="mt-2 max-w-2xl text-sm font-medium text-muted-foreground">Design and publish live content nodes directly to patrons&apos; home screens.</p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
                    <Button onClick={requestWidgetPin} variant="outline" className="h-12 w-full rounded-xl px-5 text-[10px] font-black uppercase tracking-widest sm:w-auto">
                        <Smartphone className="h-4 w-4 mr-2" /> Add to Home Screen
                    </Button>
                    <Button
                        onClick={() => setEditing({
                            title: 'New Widget',
                            content_type: 'PRODUCT',
                            status: 'DRAFT',
                            priority: 10,
                            target_segment: 'ALL',
                            cta_label: 'SHOP NOW',
                            start_at: new Date().toISOString().substring(0, 16)
                        })}
                        className="h-12 w-full rounded-xl bg-primary px-6 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95 sm:w-auto sm:px-8"
                    >
                        <Plus className="h-4 w-4 mr-2" /> Design New Widget
                    </Button>
                </div>
            </header>
            {pinMessage && <p role="status" className="rounded-xl bg-white p-4 text-sm text-slate-600">{pinMessage}</p>}
            {actionError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{actionError}</p>}
            {conversionError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{conversionError}</p>}

            <div className="grid min-w-0 gap-8 lg:grid-cols-12 lg:gap-10">
                <div className="lg:col-span-8 space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-1 sm:px-4">
                        <h2 className="text-lg font-black uppercase tracking-tighter text-foreground sm:text-xl">Active Nodes</h2>
                        <span className="rounded-full border border-slate-100 bg-white px-3 py-1 text-[10px] font-black uppercase text-slate-400">{widgets.length} Configured</span>
                    </div>

                    <div className="grid gap-4">
                        {loading && widgets.length === 0 ? (
                            <div className="p-20 text-center bg-white rounded-[3rem] border border-slate-100 animate-pulse">
                                <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
                            </div>
                        ) : widgets.length === 0 ? (
                            <Card className="p-10 rounded-[2.5rem] border border-slate-100 bg-white text-center text-sm font-semibold text-slate-500">
                                {conversionError ? 'Widget records are unavailable.' : 'No mobile widgets are configured yet.'}
                            </Card>
                        ) : widgets.map((w) => (
                            <Card key={w.id} className={cn(
                                "relative overflow-hidden rounded-2xl border p-4 transition-all hover:shadow-xl group sm:rounded-[2rem] sm:p-6",
                                w.status === 'PUBLISHED' ? "bg-white border-slate-100" : "bg-slate-50 border-dashed border-slate-200 opacity-60"
                            )}>
                                <div className="relative z-10 grid min-w-0 grid-cols-1 gap-4 text-left sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center sm:gap-5">
                                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 sm:h-16 sm:w-16">
                                        {w.image_url ? (
                                            <Image src={w.image_url} alt="" fill className="object-contain p-2" />
                                        ) : (
                                            <Smartphone className="text-slate-300" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <span className="text-[10px] font-black uppercase text-primary tracking-widest">{w.content_type}</span>
                                            <div className="h-1 w-1 rounded-full bg-slate-200" />
                                            <span className="text-[8px] font-black uppercase text-slate-400">Target: {w.target_segment}</span>
                                        </div>
                                        <h3 className="break-words text-lg font-black uppercase tracking-tight text-foreground sm:text-xl">{w.title}</h3>
                                        <p className="break-words text-xs font-medium italic text-slate-500 sm:truncate sm:text-[10px]">&quot;{w.description}&quot;</p>
                                        <p className="pt-2 text-[10px] font-bold uppercase leading-relaxed tracking-wide text-slate-500">
                                            {conversionError ? 'Sales attribution unavailable' : `${conversions[w.id]?.orders || 0} attributed orders · ${formatPrice(conversions[w.id]?.revenue || 0)} paid revenue`}
                                        </p>
                                    </div>
                                    <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-slate-100 pt-3 sm:justify-end sm:border-0 sm:pt-0">
                                        <Button variant="ghost" size="icon" aria-label={`Edit ${w.title}`} onClick={() => setEditing(w)} className="h-10 w-10 rounded-xl hover:bg-slate-50"><Settings2 size={18} /></Button>
                                        <Button variant="ghost" size="icon" aria-label={`Delete ${w.title}`} onClick={() => handleDelete(w.id)} className="h-10 w-10 rounded-xl text-rose-500 hover:bg-rose-50"><Trash2 size={18} /></Button>
                                        <div className={cn(
                                            "rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-widest sm:px-4",
                                            w.status === 'PUBLISHED' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-100 text-slate-400 border-slate-200"
                                        )}>
                                            {w.status}
                                        </div>
                                    </div>
                                </div>
                                <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
                                    Orders are attributed when shoppers open this widget’s link and complete payment. Android requires the user to accept the launcher’s widget prompt.
                                </p>
                            </Card>
                        ))}
                    </div>
                </div>

                <div className="lg:col-span-4">
                    {/* WIDGET PREVIEW (PHONE FRAME) */}
                    <div className="sticky top-10 space-y-8">
                        <div className="relative mx-auto w-[280px] h-[580px] bg-slate-50 rounded-[3rem] border-[8px] border-slate-200 shadow-2xl overflow-hidden p-4">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-200 rounded-b-2xl z-20"></div>

                            {/* App Icon Mockup */}
                            <div className="mt-20 flex flex-wrap gap-6 justify-center opacity-40">
                                {[1,2,3,4,5,6].map(i => <div key={i} className="h-12 w-12 rounded-xl bg-slate-200" />)}
                            </div>

                            {/* THE REAL WIDGET PREVIEW */}
                            <div className="mt-10 animate-in zoom-in-95 duration-500">
                                <Card className="p-4 rounded-[2rem] bg-white border-none shadow-xl space-y-4 text-left relative overflow-hidden">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="h-5 w-5 rounded-lg bg-primary flex items-center justify-center text-white"><Zap size={10} fill="currentColor" /></div>
                                        <span className="text-[10px] font-black uppercase tracking-tight text-slate-400">Online Bar</span>
                                    </div>

                                    <h4 className="text-sm font-black uppercase text-foreground leading-none">{editing?.title || 'Trending Tonight'}</h4>

                                    <div className="aspect-square w-full bg-slate-50 rounded-xl relative overflow-hidden flex items-center justify-center">
                                        {editing?.image_url ? (
                                            <Image src={editing.image_url} alt="" fill className="object-contain p-4" />
                                        ) : (
                                            <TrendingUp className="h-10 w-10 text-slate-200" />
                                        )}
                                    </div>

                                    <div className="space-y-1">
                                        <p className="text-[9px] font-medium text-slate-500 line-clamp-2 italic leading-relaxed">
                                            &quot;{editing?.description || 'Discover what Nairobi is drinking right now.'}&quot;
                                        </p>
                                    </div>

                                    <Button size="sm" className="w-full h-10 rounded-xl bg-primary text-white font-black uppercase text-[8px] tracking-widest shadow-lg shadow-primary/20 pointer-events-none">
                                        {editing?.cta_label || 'EXPLORE'}
                                    </Button>

                                    <div className="absolute -bottom-2 -right-2 h-12 w-12 bg-primary/5 rounded-full blur-xl"></div>
                                </Card>
                            </div>
                        </div>
                        <p className="text-[10px] font-black uppercase text-slate-400 text-center tracking-[0.3em]">Live Node Preview</p>
                    </div>
                </div>
            </div>

            {/* EDITOR SLIDE-OVER */}
            {editing && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-end bg-slate-900/10 backdrop-blur-md animate-in fade-in duration-300">
                    <Card className="h-full w-full max-w-xl bg-white rounded-l-[4rem] border-none shadow-2xl flex flex-col animate-in slide-in-from-right-full duration-500 overflow-hidden text-left">
                        <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20"><Zap size={24} /></div>
                                <div>
                                    <h2 className="text-3xl font-black uppercase tracking-tighter text-foreground leading-none">Widget Studio</h2>
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1">Configure Remote Content Node</p>
                                </div>
                            </div>
                            <button onClick={() => setEditing(null)} className="h-12 w-12 rounded-full hover:bg-white flex items-center justify-center transition-all shadow-sm border border-slate-100"><X size={24} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-10 space-y-10 no-scrollbar">
                            <section className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Widget Title</label>
                                    <Input
                                        value={editing.title}
                                        onChange={e => setEditing({...editing, title: e.target.value})}
                                        className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Engagement Narrative</label>
                                    <Textarea
                                        value={editing.description || ''}
                                        onChange={e => setEditing({...editing, description: e.target.value})}
                                        className="min-h-[100px] rounded-2xl bg-slate-50 border-slate-100 p-6 font-medium italic resize-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Target Product</label>
                                    <select
                                        value={editing.product_id || ''}
                                        onChange={e => setEditing({...editing, product_id: e.target.value})}
                                        className="w-full h-14 rounded-2xl bg-slate-50 border border-slate-100 px-6 font-black text-[10px] uppercase outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                                    >
                                        <option value="">No Product Attached</option>
                                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Content Logic</label>
                                        <select
                                            value={editing.content_type}
                                            onChange={e => setEditing({...editing, content_type: e.target.value as 'PRODUCT' | 'TRENDING' | 'ANNOUNCEMENT' | 'ORDER'})}
                                            className="w-full h-14 rounded-2xl bg-slate-50 border border-slate-100 px-6 font-black text-[10px] uppercase outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                                        >
                                            <option value="PRODUCT">🛍️ Single Product</option>
                                            <option value="TRENDING">🔥 Trending Now</option>
                                            <option value="ANNOUNCEMENT">📣 Announcement</option>
                                            <option value="ORDER">🚚 Order Status</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Target Segment</label>
                                        <select
                                            value={editing.target_segment}
                                            onChange={e => setEditing({...editing, target_segment: e.target.value})}
                                            className="w-full h-14 rounded-2xl bg-slate-50 border border-slate-100 px-6 font-black text-[10px] uppercase outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                                        >
                                            <option value="ALL">Global Audience</option>
                                            <option value="VIP">VIP & Legends Only</option>
                                            <option value="NEW">New Patrons (First 7d)</option>
                                            <option value="DORMANT">Re-engagement Candidates</option>
                                        </select>
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-6">
                                <div className="flex items-center gap-3 border-l-4 border-primary pl-4">
                                    <h3 className="text-xl font-black uppercase tracking-tight">Technical Nodes</h3>
                                </div>
                                <div className="grid gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Asset URL (Remote Image)</label>
                                        <Input
                                            value={editing.image_url || ''}
                                            onChange={e => setEditing({...editing, image_url: e.target.value})}
                                            placeholder="https://..."
                                            className="h-12 rounded-xl bg-slate-50 border-slate-100 text-xs font-mono"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Deep Link Protocol</label>
                                        <Input
                                            value={editing.deep_link || ''}
                                            onChange={e => setEditing({...editing, deep_link: e.target.value})}
                                            placeholder="onbar://..."
                                            className="h-12 rounded-xl bg-slate-50 border-slate-100 text-xs font-mono"
                                        />
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-6 pb-10">
                                <div className="flex items-center gap-3 border-l-4 border-indigo-500 pl-4">
                                    <h3 className="text-xl font-black uppercase tracking-tight text-indigo-600">Scheduling</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Deployment Start</label>
                                        <Input
                                            type="datetime-local"
                                            value={editing.start_at?.substring(0, 16)}
                                            onChange={e => setEditing({...editing, start_at: e.target.value})}
                                            className="h-12 rounded-xl bg-slate-50 border-slate-100"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Deployment Expiry</label>
                                        <Input
                                            type="datetime-local"
                                            value={editing.expires_at?.substring(0, 16) || ''}
                                            onChange={e => setEditing({...editing, expires_at: e.target.value})}
                                            className="h-12 rounded-xl bg-slate-50 border-slate-100"
                                        />
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="p-10 border-t border-slate-100 bg-slate-50/50 flex gap-4">
                            <div className="flex-1 flex items-center gap-4">
                                <label className="text-[10px] font-black uppercase text-slate-400">Node Status</label>
                                <select
                                    value={editing.status}
                                    onChange={e => setEditing({...editing, status: e.target.value})}
                                    className="h-12 rounded-xl bg-white border border-slate-100 px-4 text-[10px] font-black uppercase"
                                >
                                    <option value="DRAFT">DRAFT</option>
                                    <option value="PUBLISHED">PUBLISHED</option>
                                    <option value="SCHEDULED">SCHEDULED</option>
                                    <option value="INACTIVE">INACTIVE</option>
                                </select>
                            </div>
                            <Button
                                onClick={handleSave}
                                disabled={loading}
                                className="flex-[2] h-16 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                            >
                                {loading ? <Loader2 className="animate-spin mr-2" /> : <><Save size={20} className="mr-2" /> Commit to Terminal</>}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
