'use client';

import * as React from 'react';
import {
    CheckCircle,
    X,
    Zap,
    Info,
    AlertTriangle,
    Bell,
    ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export interface ToastProps {
    id: string;
    title: string;
    message: string;
    icon?: string;
    style?: 'success' | 'error' | 'info' | 'warning' | 'default' | string;
    actionUrl?: string;
    duration?: number;
    onClose: (id: string) => void;
}

const ICON_MAP: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
    CheckCircle,
    Zap,
    Info,
    AlertTriangle,
    Bell,
    Truck: (props: React.SVGProps<SVGSVGElement>) => <Zap {...props} />, // Fallback or mapping
};

export default function ExperienceToast({
    id,
    title,
    message,
    icon,
    style = 'default',
    actionUrl,
    duration = 7,
    onClose
}: ToastProps) {
    const [progress, setProgress] = React.useState(100);
    const [isExiting, setIsExiting] = React.useState(false);
    const closing = React.useRef(false);
    const onCloseRef = React.useRef(onClose);
    const safeDuration = Number.isFinite(duration) ? Math.min(60, Math.max(1, duration)) : 7;

    React.useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    const handleClose = React.useCallback(() => {
        if (closing.current) return;
        closing.current = true;
        setIsExiting(true);
        window.setTimeout(() => onCloseRef.current(id), 500);
    }, [id]);

    React.useEffect(() => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            const elapsed = Date.now() - startedAt;
            setProgress(Math.max(0, 100 - (elapsed / (safeDuration * 1000)) * 100));
        }, 100);
        const closeTimer = window.setTimeout(() => {
            handleClose();
        }, safeDuration * 1000);

        return () => {
            clearInterval(timer);
            window.clearTimeout(closeTimer);
        };
    }, [handleClose, safeDuration]);

    const Icon = (icon && ICON_MAP[icon]) || Bell;

    return (
        <div className={cn(
            "w-full shrink-0 max-w-[400px] bg-white/95 backdrop-blur-xl rounded-2xl sm:rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden transition-all duration-500 pointer-events-auto group",
            isExiting ? "translate-x-full opacity-0" : "translate-x-0 opacity-100 animate-in slide-in-from-right-8",
            style === 'success' ? "ring-2 ring-emerald-500/20" :
            style === 'error' ? "ring-2 ring-rose-500/20" :
            style === 'warning' ? "ring-2 ring-amber-500/20" :
            "ring-2 ring-primary/20"
        )}>
            <div role={style === 'error' || style === 'warning' ? 'alert' : 'status'} aria-live={style === 'error' || style === 'warning' ? 'assertive' : 'polite'} className="p-5 sm:p-6 flex gap-4 relative z-10">
                <div className={cn(
                    "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner",
                    style === 'success' ? "bg-emerald-50 text-emerald-600" :
                    style === 'error' ? "bg-rose-50 text-rose-600" :
                    style === 'warning' ? "bg-amber-50 text-amber-600" :
                    "bg-primary/5 text-primary"
                )}>
                    <Icon size={24} />
                </div>

                <div className="flex-1 min-w-0 text-left">
                    <div className="flex justify-between items-start mb-1">
                        <h4 className="text-sm font-black uppercase tracking-tight text-foreground leading-none pt-1">{title}</h4>
                        <button type="button" onClick={handleClose} aria-label={`Dismiss ${title}`} className="text-slate-300 hover:text-rose-500 transition-colors -mt-1 -mr-1 p-1">
                            <X size={16} />
                        </button>
                    </div>
                    <p className="text-[11px] font-medium text-slate-500 leading-relaxed line-clamp-2 italic">
                        &quot;{message}&quot;
                    </p>

                    {actionUrl && (
                        <Link
                            href={actionUrl}
                            onClick={handleClose}
                            className="inline-flex items-center gap-2 mt-4 text-[9px] font-black uppercase tracking-[0.2em] text-primary hover:underline transition-colors group/link"
                        >
                            Execute Protocol <ChevronRight size={12} className="group-hover/link:translate-x-1 transition-transform" />
                        </Link>
                    )}
                </div>
            </div>

            {/* Progress Bar */}
            <div className="absolute bottom-0 left-0 h-1 bg-slate-50 w-full">
                <div
                    className={cn(
                        "h-full transition-all duration-100 ease-linear",
                        style === 'success' ? "bg-emerald-500" :
                        style === 'error' ? "bg-rose-500" :
                        style === 'warning' ? "bg-amber-500" :
                        "bg-primary"
                    )}
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Background Glow */}
            <div className={cn(
                "absolute -right-10 -bottom-10 h-32 w-32 rounded-full blur-3xl opacity-10",
                style === 'success' ? "bg-emerald-500" :
                style === 'error' ? "bg-rose-500" :
                "bg-primary"
            )} />
        </div>
    );
}
