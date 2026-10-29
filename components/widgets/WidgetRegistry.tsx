'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabaseClient';
import { Loader2, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorBoundary from '../layout/ErrorBoundary';

/**
 * ONLINE BAR OS: MASTER WIDGET REGISTRY
 * Dynamically orchestrates UI nodes based on Admin orchestration.
 */

// 1. Dynamic Node Imports (High Performance)
const HeroWidget = dynamic(() => import('@/components/home/hero/NeuralHero'), { loading: () => <div className="h-[60dvh] bg-slate-50 animate-pulse" /> });
const TrendingWidget = dynamic(() => import('@/components/home/ProductList'), { loading: () => <div className="h-96 bg-slate-50 animate-pulse" /> });
const BuzzWidget = dynamic(() => import('@/components/buzz/BuzzHUD'), { loading: () => <div className="h-64 bg-slate-50 animate-pulse" /> });
const ConciergeWidget = dynamic(() => import('@/components/widgets/concierge/BuildMyNightWidget'), { loading: () => <div className="h-96 bg-slate-50 animate-pulse" /> });
const PersonalizedWidget = dynamic(() => import('@/components/home/PersonalizedFeed'), { loading: () => <div className="h-96 bg-slate-50 animate-pulse" /> });
const PerfectServeWidget = dynamic(() => import('@/components/product/PerfectServeWidget'), { loading: () => <div className="h-64 bg-slate-50 animate-pulse" /> });
const MobileWidgetStats = dynamic(() => import('@/components/admin/experience/MobileWidgetStats'), { loading: () => <div className="h-64 bg-slate-50 animate-pulse" /> });
const SommelierWidget = dynamic(() => import('@/components/widgets/SommelierWidget'), { loading: () => <div className="h-96 bg-slate-50 animate-pulse" /> });

interface WidgetNode {
    id: string;
    widget_key: string;
    rank: number;
    config: Record<string, unknown>;
}

const DEFAULT_HOME_WIDGETS: WidgetNode[] = [
    { id: 'default-home-hero', widget_key: 'HERO_WIDGET', rank: 1, config: {} },
    { id: 'default-home-catalog', widget_key: 'TRENDING_WIDGET', rank: 2, config: {} },
    { id: 'default-home-personalized', widget_key: 'PERSONALIZED_WIDGET', rank: 3, config: {} },
];
const DEFAULT_HOME_EXTENSION_WIDGETS = [DEFAULT_HOME_WIDGETS[2]];
const EMPTY_WIDGETS: WidgetNode[] = [];

export default function WidgetRegistry({
    pageRoute = '/',
    coreWidgetsRendered = false,
}: {
    pageRoute?: string;
    coreWidgetsRendered?: boolean;
}) {
    const defaultWidgets = pageRoute !== '/'
        ? EMPTY_WIDGETS
        : coreWidgetsRendered ? DEFAULT_HOME_EXTENSION_WIDGETS : DEFAULT_HOME_WIDGETS;
    const [widgets, setWidgets] = React.useState<WidgetNode[]>(
        defaultWidgets
    );
    const [loading, setLoading] = React.useState(pageRoute !== '/');

    React.useEffect(() => {
        async function fetchRegistry() {
            if (!supabase) {
                setWidgets(defaultWidgets);
                setLoading(false);
                return;
            }
            try {
                const { data, error } = await supabase
                    .from('system_widgets')
                    .select('*')
                    .eq('page_route', pageRoute)
                    .order('rank', { ascending: true });

                if (error) throw error;
                const activeWidgets = (data || []).filter(widget => widget.status === 'ACTIVE') as WidgetNode[];
                const configuredWidgets = pageRoute === '/' && coreWidgetsRendered
                    ? activeWidgets.filter(widget => widget.widget_key !== 'HERO_WIDGET' && widget.widget_key !== 'TRENDING_WIDGET')
                    : activeWidgets;
                if (pageRoute !== '/') {
                    setWidgets(configuredWidgets);
                } else if (configuredWidgets.length === 0) {
                    setWidgets(defaultWidgets);
                } else {
                    const homepageWidgets = [...configuredWidgets];
                    if (coreWidgetsRendered) {
                        setWidgets(homepageWidgets);
                        return;
                    }
                    if (!homepageWidgets.some(widget => widget.widget_key === 'HERO_WIDGET')) {
                        homepageWidgets.unshift(DEFAULT_HOME_WIDGETS[0]);
                    }
                    if (!homepageWidgets.some(widget => widget.widget_key === 'TRENDING_WIDGET')) {
                        homepageWidgets.push(DEFAULT_HOME_WIDGETS[1]);
                    }
                    setWidgets(homepageWidgets);
                }
            } catch (err) {
                console.error('Could not load the widget registry:', err);
                setWidgets(defaultWidgets);
            } finally {
                setLoading(false);
            }
        }
        fetchRegistry();
    }, [pageRoute, coreWidgetsRendered, defaultWidgets]);

    if (loading && widgets.length === 0) return (
        <div className="py-40 flex flex-col items-center gap-6">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300">Synchronizing Interface Nodes...</p>
        </div>
    );

    return (
        <div className="space-y-0">
            {widgets.map((widget, idx) => (
                <WidgetIntersectionNode key={widget.id} widget={widget} isFirst={idx === 0} />
            ))}
        </div>
    );
}

function WidgetIntersectionNode({ widget, isFirst }: { widget: WidgetNode, isFirst?: boolean }) {
    const [isVisible, setIsVisible] = React.useState(isFirst);
    const nodeRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '200px' } // Load 200px before reaching viewport
        );

        if (nodeRef.current) observer.observe(nodeRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={nodeRef} className={cn(
            "animate-in fade-in slide-in-from-bottom-8 duration-1000",
            !isFirst && "mt-24 sm:mt-32"
        )}>
            {isVisible ? (
                <ErrorBoundary>
                    {renderWidget(widget.widget_key, widget.config)}
                </ErrorBoundary>
            ) : <div className="h-96 bg-slate-50/50 rounded-[3rem]" />}
        </div>
    );
}

function renderWidget(key: string, _config: Record<string, unknown>) { // eslint-disable-line @typescript-eslint/no-unused-vars
    switch (key) {
        case 'HERO_WIDGET':
            return <HeroWidget />;
        case 'TRENDING_WIDGET':
            return <section id="catalog-section" className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-20"><TrendingWidget /></section>;
        case 'CITY_PULSE_WIDGET':
            return <section id="city-pulse" className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-20"><BuzzWidget /></section>;
        case 'CONCIERGE_WIDGET':
            return <ConciergeWidget />;
        case 'PERSONALIZED_WIDGET':
            return <PersonalizedWidget />;
        case 'PERFECT_SERVE_WIDGET':
            return <section className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-20"><PerfectServeWidget /></section>;
        case 'MOBILE_WIDGET_STATS':
            return <MobileWidgetStats />;
        case 'SOMMELIER_WIDGET':
            return <SommelierWidget />;
        default:
            return (
                <div className="p-10 border-2 border-dashed border-slate-100 rounded-[3rem] text-center opacity-20">
                    <ShieldAlert className="mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Node {key} Offline</p>
                </div>
            );
    }
}
