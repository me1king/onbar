'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Package, TrendingUp, AlertTriangle } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { InventoryFinanceRow } from '@/lib/adminFinanceTypes';

export default function InventoryValuation({ products, error }: { products: InventoryFinanceRow[]; error: string | null }) {
    const [stats, setStats] = React.useState({
        total_value: 0,
        sku_count: 0,
        shrinkage_variance: null as number | null,
        low_stock_skus: 0
    });
    const [averageMargin, setAverageMargin] = React.useState<number | null>(null);
    React.useEffect(() => {
            let totalValue = 0;
            let retailValue = 0;
            let weightedMarginValue = 0;
            let lowStockCount = 0;

            products.forEach(p => {
                const stock = Number(p.stock) || 0;
                const cost = Number(p.cost_price) || 0;
                const price = Number(p.price) || 0;
                totalValue += stock * cost;
                retailValue += stock * price;
                weightedMarginValue += stock * (price - cost);
                if (stock <= 5) lowStockCount++;
            });

            setStats({
                total_value: totalValue,
                sku_count: products.length,
                shrinkage_variance: null,
                low_stock_skus: lowStockCount
            });
            setAverageMargin(retailValue > 0 ? (weightedMarginValue / retailValue) * 100 : null);
    }, [products]);

    return (
        <Card className="min-w-0 p-5 sm:p-8 rounded-[2rem] sm:rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-6 sm:space-y-10 text-left">
            <header className="flex justify-between items-center px-2">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 shadow-sm">
                        <Package size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tighter text-foreground">Shelve Wealth</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Inventory value at saved unit cost</p>
                    </div>
                </div>
            </header>

            <div className="grid sm:grid-cols-2 gap-8">
                <div className="space-y-8">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Stock Value</p>
                        <h3 className="break-words text-2xl font-black tabular-nums text-foreground tracking-tighter sm:text-3xl xl:text-4xl">{error ? 'Unavailable' : formatPrice(stats.total_value)}</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <p className="text-[8px] font-black uppercase text-slate-400">Linked SKUs</p>
                            <p className="text-xl font-black text-foreground">{error ? '—' : stats.sku_count}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[8px] font-black uppercase text-slate-400">Critical Low</p>
                            <p className="text-xl font-black text-rose-500">{error ? '—' : stats.low_stock_skus}</p>
                        </div>
                    </div>
                </div>

                <div className="min-w-0 space-y-4 sm:space-y-6">
                    <div className="p-4 sm:p-6 rounded-[2rem] bg-rose-50 border border-rose-100 flex items-center gap-3">
                        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                            <AlertTriangle className="text-rose-500" size={20} />
                            <div className="min-w-0">
                                <p className="text-[9px] font-black uppercase text-rose-700">Stock Shrinkage</p>
                                <p className="break-words text-sm font-black text-rose-600">{stats.shrinkage_variance === null ? 'Not tracked' : `${formatPrice(stats.shrinkage_variance)} Lost`}</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 rounded-[2rem] bg-emerald-50 border border-emerald-100 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <TrendingUp className="text-emerald-500" size={20} />
                            <div>
                                <p className="text-[9px] font-black uppercase text-emerald-700">Margin Health</p>
                                <p className="text-sm font-black text-emerald-600">{error || averageMargin === null ? 'Unavailable' : `${averageMargin.toFixed(1)}% weighted gross margin`}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
        </Card>
    );
}
