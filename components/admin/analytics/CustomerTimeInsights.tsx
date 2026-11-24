'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { cn, formatPrice } from '@/lib/utils';
import { merchantWeekdays, normalizeMerchantOperatingHours } from '@/lib/merchantAvailability';

type MetricKey = 'visitors' | 'orders' | 'revenue';

interface TimeMetric {
    visitors: number;
    orders: number;
    revenue: number;
}

interface PeakHoursResponse {
    days: number;
    timezone: string;
    hours: Array<TimeMetric & { hour: number }>;
    heatmap: Array<TimeMetric & { weekday: number; hour: number }>;
    weekdays: Array<TimeMetric & { weekday: number; sampleDays: number }>;
    funnel: Array<{ label: string; sessions: number; percentage: number | null }>;
    trafficSources: Array<{ source: string; sessions: number }>;
    shops: Array<{
        id: string;
        name: string;
        acceptingOrders: boolean;
        openNow: boolean;
        operatingHours: unknown;
    }>;
    error?: string;
}

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekdayNumbers = [7, 1, 2, 3, 4, 5, 6];
const metrics: Array<{ id: MetricKey; label: string }> = [
    { id: 'visitors', label: 'Visitors' },
    { id: 'orders', label: 'Orders' },
    { id: 'revenue', label: 'Revenue' }
];

function formatHour(hour: number) {
    return `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`;
}

function metricValue(value: TimeMetric, metric: MetricKey) {
    return value[metric];
}

function formatMetric(value: number, metric: MetricKey) {
    return metric === 'revenue' ? formatPrice(value) : Math.round(value).toLocaleString();
}

export default function CustomerTimeInsights() {
    const [data, setData] = React.useState<PeakHoursResponse | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [days, setDays] = React.useState(90);
    const [metric, setMetric] = React.useState<MetricKey>('visitors');

    React.useEffect(() => {
        let active = true;
        setLoading(true);
        setError(null);

        fetch(`/api/admin/analytics/peak-hours?days=${days}`, { cache: 'no-store' })
            .then(async response => {
                const result = await response.json() as PeakHoursResponse;
                if (!response.ok) throw new Error(result.error || 'Could not load customer time analytics.');
                if (active) setData(result);
            })
            .catch(cause => {
                if (!active) return;
                console.error('[PeakHours] Could not load customer time analytics:', cause);
                setData(null);
                setError(cause instanceof Error ? cause.message : 'Could not load customer time analytics.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => { active = false; };
    }, [days]);

    const hours = data?.hours || [];
    const weekdays = data?.weekdays || [];
    const maxHeatValue = Math.max(0, ...(data?.heatmap || []).map(cell => metricValue(cell, metric)));
    const maxHourValue = Math.max(0, ...hours.map(hour => metricValue(hour, metric)));
    const byWeekdayHour = new Map((data?.heatmap || []).map(cell => [`${cell.weekday}:${cell.hour}`, cell]));
    const busiestHour = hours.reduce<(typeof hours)[number] | null>(
        (peak, hour) => metricValue(hour, metric) > (peak ? metricValue(peak, metric) : 0) ? hour : peak,
        null
    );
    const busiestWeekday = weekdays.reduce<(typeof weekdays)[number] | null>(
        (peak, day) => metricValue(day, metric) > (peak ? metricValue(peak, metric) : 0) ? day : peak,
        null
    );
    const daytimeHours = hours.filter(hour => hour.hour >= 6 && hour.hour <= 23);
    const quietestHour = maxHourValue > 0
        ? daytimeHours.reduce<(typeof hours)[number] | null>(
            (quiet, hour) => !quiet || metricValue(hour, metric) < metricValue(quiet, metric) ? hour : quiet,
            null
        )
        : null;
    const maxSourceSessions = Math.max(1, ...(data?.trafficSources || []).map(source => source.sessions));

    return (
        <div className="space-y-6 text-left">
            <Card className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:rounded-[2.5rem] sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-2" aria-label="Choose activity metric">
                        {metrics.map(option => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => setMetric(option.id)}
                                aria-pressed={metric === option.id}
                                className={cn(
                                    'rounded-full border px-4 py-2 text-xs font-bold transition-colors',
                                    metric === option.id ? 'border-primary bg-primary text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        {[30, 90].map(period => (
                            <button
                                key={period}
                                type="button"
                                onClick={() => setDays(period)}
                                aria-pressed={days === period}
                                className={cn(
                                    'rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest',
                                    days === period ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                )}
                            >
                                {period} days
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <h2 className="text-xl font-black text-slate-900">Customer activity by day and hour</h2>
                    <span>Last {data?.days || days} complete days · {data?.timezone || 'Africa/Nairobi'} time · recorded data only</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                    Visitor counts are distinct analytics-consented sessions in each day/hour bucket, not unique people across the full period.
                    Order demand excludes cancelled and failed orders; revenue includes only orders marked paid or delivered.
                </p>

                {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</p>}
                {loading && <p role="status" className="text-sm font-bold text-slate-500">Loading customer activity…</p>}
                {!loading && data && (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <InsightCard
                                label="Busiest hour"
                                value={busiestHour && metricValue(busiestHour, metric) > 0
                                    ? `${formatHour(busiestHour.hour)}–${formatHour((busiestHour.hour + 1) % 24)}`
                                    : 'No activity recorded'}
                                detail={busiestHour && metricValue(busiestHour, metric) > 0
                                    ? `${formatMetric(metricValue(busiestHour, metric), metric)} avg per day`
                                    : 'No matching data in this period'}
                            />
                            <InsightCard
                                label="Busiest weekday"
                                value={busiestWeekday && metricValue(busiestWeekday, metric) > 0
                                    ? weekdayNames[weekdayNumbers.indexOf(busiestWeekday.weekday)]
                                    : 'No activity recorded'}
                                detail={busiestWeekday && metricValue(busiestWeekday, metric) > 0
                                    ? `${formatMetric(metricValue(busiestWeekday, metric), metric)} avg per ${weekdayNames[weekdayNumbers.indexOf(busiestWeekday.weekday)]}`
                                    : 'No matching data in this period'}
                            />
                            <InsightCard
                                label="Quietest daytime hour"
                                value={quietestHour ? `${formatHour(quietestHour.hour)}–${formatHour((quietestHour.hour + 1) % 24)}` : 'Not enough data'}
                                detail={quietestHour ? `${formatMetric(metricValue(quietestHour, metric), metric)} avg per day · 6am–11pm` : 'No activity recorded in daytime hours'}
                            />
                            <InsightCard
                                label="Best time to send email"
                                value="Not measured"
                                detail="Email engagement timestamps are not included here."
                            />
                        </div>

                        <section aria-label={`${metrics.find(option => option.id === metric)?.label} heatmap`}>
                            <h3 className="text-sm font-bold text-slate-800">
                                When customers show up ({metrics.find(option => option.id === metric)?.label.toLowerCase()})
                            </h3>
                            <p className="mb-3 mt-1 text-xs text-slate-500">Darker cells mean a higher daily average for that weekday and hour. Hover or focus a cell for its value.</p>
                            <div className="overflow-x-auto pb-2">
                                <div className="grid min-w-[760px] grid-cols-[48px_repeat(24,minmax(18px,1fr))] gap-1">
                                    <span aria-hidden="true" />
                                    {hours.map(hour => (
                                        <span key={hour.hour} className="h-5 text-center text-[9px] text-slate-500">
                                            {hour.hour % 3 === 0 ? formatHour(hour.hour) : ''}
                                        </span>
                                    ))}
                                    {weekdayNames.map((day, index) => (
                                        <React.Fragment key={day}>
                                            <span className="self-center text-xs text-slate-600">{day.slice(0, 3)}</span>
                                            {hours.map(hour => {
                                                const cell = byWeekdayHour.get(`${weekdayNumbers[index]}:${hour.hour}`);
                                                const value = cell ? metricValue(cell, metric) : 0;
                                                const intensity = maxHeatValue > 0 && value > 0 ? 0.12 + (value / maxHeatValue) * 0.88 : 0.06;
                                                return (
                                                    <span
                                                        key={`${day}-${hour.hour}`}
                                                        title={`${day} ${formatHour(hour.hour)}: ${formatMetric(value, metric)} avg per day`}
                                                        aria-label={`${day} ${formatHour(hour.hour)}: ${formatMetric(value, metric)} average per day`}
                                                        tabIndex={0}
                                                        role="img"
                                                        className="h-5 rounded-[3px] bg-primary outline-offset-2 focus:outline focus:outline-2 focus:outline-primary"
                                                        style={{ opacity: intensity }}
                                                    />
                                                );
                                            })}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <div className="grid gap-4 xl:grid-cols-3">
                            <section className="rounded-2xl border border-slate-200 p-4">
                                <h3 className="mb-4 text-sm font-bold text-slate-800">Average by hour of day</h3>
                                <div className="flex h-28 min-w-[300px] items-end gap-1">
                                    {hours.map(hour => {
                                        const value = metricValue(hour, metric);
                                        const height = maxHourValue > 0 ? Math.max(value > 0 ? 3 : 0, value / maxHourValue * 100) : 0;
                                        return (
                                            <div
                                                key={hour.hour}
                                                title={`${formatHour(hour.hour)}: ${formatMetric(value, metric)} average per day`}
                                                className="flex h-full min-w-0 flex-1 items-end"
                                            >
                                                <div
                                                    className="w-full rounded-t-sm bg-primary"
                                                    style={{ height: `${height}%`, opacity: busiestHour?.hour === hour.hour ? 1 : 0.5 }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-2 flex justify-between text-[9px] text-slate-500">
                                    {[0, 6, 12, 18].map(hour => <span key={hour}>{formatHour(hour)}</span>)}
                                    <span>11pm</span>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-slate-200 p-4">
                                <h3 className="mb-4 text-sm font-bold text-slate-800">Where visitors drop off</h3>
                                {data.funnel.length === 0 ? (
                                    <p className="text-xs text-slate-500">Funnel data is not available.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {data.funnel.map(step => (
                                            <div key={step.label} className="space-y-1">
                                                <div className="flex justify-between gap-2 text-xs">
                                                    <span className="text-slate-600">{step.label}</span>
                                                    <span className="shrink-0 font-bold text-slate-800">
                                                        {step.sessions.toLocaleString()} · {step.percentage === null ? '—' : `${step.percentage}%`}
                                                    </span>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, step.percentage || 0))}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <p className="mt-4 text-[10px] leading-relaxed text-slate-500">
                                    Distinct consented sessions at each step; paid/delivered buyers are matched by session. Percentages use storefront visits as the base. Missing events can make a later step appear larger.
                                </p>
                            </section>

                            <section className="rounded-2xl border border-slate-200 p-4">
                                <h3 className="mb-4 text-sm font-bold text-slate-800">Where visitors come from</h3>
                                {data.trafficSources.length === 0 ? (
                                    <p className="text-xs text-slate-500">No consented traffic-source data is available.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {data.trafficSources.map(source => (
                                            <div key={source.source} className="flex items-center gap-2 text-xs">
                                                <span className="w-24 shrink-0 truncate text-slate-600">{source.source}</span>
                                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                                                    <div className="h-full rounded-full bg-primary" style={{ width: `${source.sessions / maxSourceSessions * 100}%` }} />
                                                </div>
                                                <span className="w-10 text-right font-bold text-slate-800">{source.sessions.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <p className="mt-4 text-[10px] leading-relaxed text-slate-500">Source labels come from consented sessions. Older “Direct” labels are marked unattributed because their original referrer was not stored.</p>
                            </section>
                        </div>
                    </>
                )}
            </Card>

            <Card className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:rounded-[2.5rem] sm:p-8">
                <div className="border-b border-slate-200 pb-4">
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">Approved merchants</span>
                    <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Scheduled Shop Hours</h2>
                    <p className="mt-2 text-sm text-slate-500">Merchant-configured weekly hours and whether each shop is accepting orders now. This is the schedule, not a sensor-confirmed opening.</p>
                </div>
                {!loading && !error && data?.shops.length === 0 && (
                    <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No approved merchants have been recorded yet.</p>
                )}
                {data?.shops.map(shop => {
                    const schedule = normalizeMerchantOperatingHours(shop.operatingHours);
                    const hasSchedule = merchantWeekdays.some(day => schedule[day].enabled);
                    const availability = !shop.acceptingOrders
                        ? 'Not accepting orders'
                        : shop.openNow
                            ? 'Within scheduled hours · accepting orders'
                            : hasSchedule
                                ? 'Outside scheduled hours'
                                : 'Business hours not set';
                    return (
                        <article key={shop.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <h3 className="font-black text-slate-900">{shop.name}</h3>
                                <span className={cn(
                                    'rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest',
                                    shop.acceptingOrders && shop.openNow ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                )}>
                                    {availability}
                                </span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                                {merchantWeekdays.map(day => {
                                    const scheduleDay = schedule[day];
                                    return (
                                        <div key={day} className="rounded-lg bg-slate-50 px-3 py-2">
                                            <p className="text-[9px] font-black uppercase text-slate-400">{day.slice(0, 3)}</p>
                                            <p className="mt-1 text-xs font-bold text-slate-700">
                                                {scheduleDay.enabled ? `${scheduleDay.open}–${scheduleDay.close}` : 'Closed'}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </article>
                    );
                })}
            </Card>
        </div>
    );
}

function InsightCard({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
    );
}
