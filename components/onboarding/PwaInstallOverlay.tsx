'use client';

import * as React from 'react';
import { Smartphone, Check, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaInstallOverlay({
    isOpen,
    onClose,
    onComplete
}: {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
}) {
    const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
    const [isIos, setIsIos] = React.useState(false);
    const [isStandalone, setIsStandalone] = React.useState(false);
    const [showIosGuide, setShowIosGuide] = React.useState(false);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        const ua = window.navigator.userAgent;
        setIsIos(/iphone|ipad|ipod/i.test(ua));

        const standalone = window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as unknown as { standalone?: boolean }).standalone === true;
        setIsStandalone(standalone);

        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }, []);

    if (!isOpen || isStandalone) return null;

    const handleInstallClick = async () => {
        if (deferredPrompt) {
            await deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            if (choice.outcome === 'accepted') {
                onClose();
                onComplete();
            }
            setDeferredPrompt(null);
        } else if (isIos) {
            setShowIosGuide(true);
        } else {
            onClose();
            onComplete();
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative w-full max-w-md p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-2xl space-y-6 text-center text-foreground animate-in zoom-in-95 duration-300">

                {/* Close X Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-foreground transition-all"
                >
                    <X size={18} />
                </button>

                {/* Progress bar */}
                <div className="space-y-2">
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-indigo-600 rounded-full w-full" />
                    </div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">100% Onboarding Complete</span>
                </div>

                {/* App Icon */}
                <div className="h-20 w-20 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 p-3 shadow-xl flex items-center justify-center text-primary">
                    <Smartphone size={36} className="text-primary animate-bounce" />
                </div>

                {/* Badge & Title */}
                <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">✦ YOUR NATIVE APP IS READY</span>
                    <h2 className="text-3xl font-black uppercase tracking-tight text-foreground">You&apos;re All Set!</h2>
                    <p className="text-xs font-medium text-slate-500 max-w-xs mx-auto">
                        Install Online Bar on your device home screen for quick access and a full-screen experience.
                    </p>
                </div>

                {/* Benefit Pills */}
                <div className="space-y-2.5 text-left">
                    {[
                        { title: 'Faster Access', desc: 'Launch directly from your mobile home screen' },
                        { title: 'Full-Screen Mode', desc: 'Use without browser address bar clutter' },
                        { title: 'Offline Cellar Cache', desc: 'Browse catalog even with spotty connectivity' }
                    ].map((b, i) => (
                        <div key={i} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                            <div className="h-7 w-7 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                                <Check size={14} className="stroke-[3]" />
                            </div>
                            <div>
                                <p className="text-xs font-black uppercase text-foreground leading-none">{b.title}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{b.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* iOS Instructions Dropdown */}
                {showIosGuide && (
                    <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-medium space-y-1 text-left animate-in fade-in duration-300">
                        <p className="font-black uppercase text-[10px]">On iPhone / iPad:</p>
                        <p>1. Tap the <strong className="font-black">Share</strong> button in Safari.</p>
                        <p>2. Scroll down and select <strong className="font-black">Add to Home Screen</strong>.</p>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-3 pt-2">
                    <Button
                        onClick={handleInstallClick}
                        className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/25 hover:scale-105 transition-all"
                    >
                        Install Native App <ArrowRight size={16} className="ml-2" />
                    </Button>
                    <button
                        onClick={() => {
                            onClose();
                            onComplete();
                        }}
                        className="w-full text-xs font-bold text-slate-400 hover:text-foreground transition-colors py-2 uppercase tracking-wider"
                    >
                        Continue in browser
                    </button>
                </div>

            </div>
        </div>
    );
}
