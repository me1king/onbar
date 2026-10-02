'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import {
    TrendingUp,
    BarChart3,
    Activity,
    AlertCircle
} from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';

interface WidgetProps {
    widget: {
        id: string;
        title: string;
        type: string;
        data_source: string;
        config: Record<string, unknown>;
    };
}

export default function IntelWidget({ widget }: WidgetProps) {
    const [data, setData] = React.useState<number | null>(null);

    React.useEffect(() => {
        async function fetchWidgetData() {
            if (!supabase) return;
            try {
                if (widget.data_source === 'TOTAL_REVENUE') {
                    const { data: rev, error } = await supabase.from('product_intelligence').select('total_revenue');
                    if (error) throw error;
                    const total = rev?.reduce((s, r) => s + Number(r.total_revenue), 0) || 0;
                    setData(total);
                } else if (widget.data_source === 'UNITS_SOLD') {
                    const { data: units, error } = await supabase.from('product_intelligence').select('units_sold');
                    if (error) throw error;
                    const total = units?.reduce((s, r) => s + r.units_sold, 0) || 0;
                    setData(total);
                } else {
                    setData(null);
                }
            } catch (err) {
                console.error(err);
                setData(null);
            }
        }
        fetchWidgetData();
    }, [widget]);

    if (widget.type === 'KPI') {
        return (
            <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm flex flex-col justify-between group hover:shadow-xl transition-all h-full text-left">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary shadow-inner">
                        <TrendingUp size={16} />
                    </div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none">{widget.title}</p>
                </div>
                <div className="mt-4">
                    <h3 className="text-3xl font-black text-foreground tracking-tighter uppercase leading-none">
                        {data === null ? 'Unavailable' : widget.data_source.includes('REVENUE') ? formatPrice(data) : data.toLocaleString()}
                    </h3>
                    <p className="text-slate-400 font-black text-[10px] mt-2">
                        {data === null ? 'Metric unavailable' : 'Current total'}
                    </p>
                </div>
            </Card>
        );
    }

    if (widget.type.startsWith('CHART')) {
        return (
            <Card className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-6 h-full text-left">
                <div className="flex justify-between items-start px-2">
                    <div className="space-y-1">
                        <h3 className="text-xl font-black uppercase tracking-tight text-foreground">{widget.title}</h3>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest italic">Chart data unavailable</p>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300"><BarChart3 size={20} /></div>
                </div>
                <div className="h-48 w-full bg-slate-50 rounded-2xl flex flex-col items-center justify-center gap-3 border border-slate-100">
                    <Activity size={32} className="text-slate-200 animate-pulse" />
                    <p className="text-[9px] font-black uppercase text-slate-300 tracking-widest">Awaiting Metric Stream...</p>
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-10 border-2 border-dashed border-slate-100 rounded-[3rem] text-center opacity-20 h-full flex flex-col items-center justify-center">
            <AlertCircle className="mx-auto mb-4" />
            <p className="text-[10px] font-black uppercase tracking-widest">Unsupported Node</p>
        </Card>
    );
}
