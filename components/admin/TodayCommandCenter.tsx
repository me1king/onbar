'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Truck, Wine, DollarSign, Users, Bot, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useRouter } from 'next/navigation';

interface CommandStats {
    revenue: number;
    orders: number;
    users: number;
    riders: number;
    shops: number;
    automation: number | null;
    demand_hotspot: string | null;
}

export default function OperatingBrainHUD() {
    const router = useRouter();
    const [stats, setStats] = React.useState<CommandStats | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);

    React.useEffect(() => {
        async function fetchCommandData() {
            if (!supabase) {
                setLoadError('Supabase is not configured. Dashboard metrics are unavailable.');
                setLoading(false);
                return;
            }
            try {
                const [ordersRes, usersRes, ridersRes, shopsRes, revenueRes] = await Promise.all([
                    supabase.from('orders').select('id', { count: 'exact' }),
                    supabase.from('profiles').select('id', { count: 'exact' }),
                    supabase.from('rider_status').select('id', { count: 'exact' }).eq('status', 'Online'),
                    supabase.from('suppliers').select('id', { count: 'exact' }).eq('is_active', true),
                    supabase.from('financial_ledger').select('amount').eq('entry_type', 'REVENUE')
                ]);
                for (const result of [ordersRes, usersRes, ridersRes, shopsRes, revenueRes]) {
                    if (result.error) throw result.error;
                }

                const [autoRes, buzzRes] = await Promise.all([
                    supabase.from('system_autonomous_state').select('is_autonomous'),
                    supabase.from('buzz_posts').select('area_zone').in('status', ['LIVE', 'TRENDING'])
                ]);
                if (autoRes.error) throw autoRes.error;
                if (buzzRes.error) throw buzzRes.error;

                const autoStates = autoRes.data || [];
                const automation = autoStates.length > 0
                    ? Number(((autoStates.filter(state => state.is_autonomous).length / autoStates.length) * 100).toFixed(1))
                    : null;
                const postsByArea = new Map<string, number>();
                for (const post of buzzRes.data || []) {
                    const area = post.area_zone?.trim();
                    if (area) postsByArea.set(area, (postsByArea.get(area) || 0) + 1);
                }
                const demandHotspot = [...postsByArea.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] || null;

                setStats({
                    revenue: (revenueRes.data || []).reduce((sum, entry) => sum + Number(entry.amount), 0),
                    orders: ordersRes.count ?? 0,
                    users: usersRes.count ?? 0,
                    riders: ridersRes.count ?? 0,
                    shops: shopsRes.count ?? 0,
                    automation,
                    demand_hotspot: demandHotspot
                });
                setLoadError(null);
            } catch (error) {
                console.error('Could not load operating dashboard metrics:', error);
                setStats(null);
                setLoadError(error instanceof Error ? error.message : 'Dashboard metrics could not be loaded.');
            } finally {
                setLoading(false);
            }
        }

        fetchCommandData();

        if (!supabase) return;

        const channelId = `command-hud-sync-${Math.random().toString(36).substring(7)}`;
        const channel = supabase.channel(channelId)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchCommandData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_ledger' }, fetchCommandData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_status' }, fetchCommandData)
            .subscribe();

        return () => {
            if (supabase) {
                supabase.removeChannel(channel);
            }
        };
    }, []);

    const nodes = [
        { label: 'Revenue', val: stats ? (stats.revenue > 999 ? `KSh ${(stats.revenue / 1000).toFixed(1)}K` : `KSh ${stats.revenue.toLocaleString()}`) : '—', icon: DollarSign, color: 'primary', href: '/admin/finance' },
        { label: 'Top Buzz Area', val: stats?.demand_hotspot || 'No recorded posts', icon: Zap, color: 'rose', href: '/admin/buzz' },
        { label: 'Patrons', val: stats?.users ?? '—', icon: Users, color: 'emerald', href: '/admin/customers' },
        { label: 'Runners', val: stats?.riders ?? '—', icon: Truck, color: 'amber', href: '/admin/dispatch' },
        { label: 'Active Suppliers', val: stats?.shops ?? '—', icon: Wine, color: 'rose', href: '/admin/operations/vendors' },
        { label: 'Automation', val: stats?.automation === null || !stats ? '—' : `${stats.automation}%`, icon: Bot, color: 'indigo', href: '/admin/marketing/automation' }
    ];

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3 text-left">
                    <div className="h-3 w-3 rounded-full bg-primary animate-ping flex-shrink-0"></div>
                    <h2 className="text-xl font-black uppercase tracking-tighter text-foreground leading-none truncate">Operating Brain HUD</h2>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Zap size={10} className="text-primary animate-pulse" />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground hidden sm:inline">
                        {loading ? 'Loading records' : loadError ? 'Data unavailable' : 'Connected records'}
                    </span>
                </div>
            </div>

            {loadError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadError}</p>}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 lg:gap-10">
                {nodes.map((node) => (
                    <Card
                        key={node.label}
                        onClick={() => router.push(node.href)}
                        className="aspect-[4/5] rounded-[4rem] bg-white border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all flex flex-col items-center justify-center gap-4 text-center p-4 min-w-0 cursor-pointer"
                    >
                        <div className={cn(
                            "h-12 w-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 shadow-inner flex-shrink-0",
                            node.color === 'primary' ? 'bg-primary/10 text-primary' :
                            node.color === 'indigo' ? 'bg-indigo-50 text-indigo-500' :
                            node.color === 'emerald' ? 'bg-emerald-50 text-emerald-500' :
                            node.color === 'amber' ? 'bg-amber-50 text-amber-500' :
                            'bg-rose-50 text-rose-500'
                        )}>
                            <node.icon size={22} />
                        </div>
                        <div className="space-y-1 min-w-0 w-full px-2 overflow-hidden">
                            <p className="text-[8px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight truncate">{node.label}</p>
                            <h3 className="text-sm lg:text-lg font-black text-foreground tracking-tighter uppercase leading-tight truncate">{node.val}</h3>
                        </div>
                    </Card>
                ))}
            </div>
        </section>
    );
}
