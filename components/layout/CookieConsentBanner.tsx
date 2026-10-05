'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Settings, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLocalConsent, updateConsent, ConsentPreferences } from '@/lib/consentService';

export default function CookieConsentBanner() {
    const [isVisible, setIsVisible] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [prefs, setPrefs] = useState<ConsentPreferences>(getLocalConsent());

    useEffect(() => {
        const hasConsent = localStorage.getItem('ob_user_consent');
        if (!hasConsent) {
            setIsVisible(true);
        }
    }, []);

    const handleAcceptAll = () => {
        const all = { necessary: true, analytics: true, personalization: true, marketing: true };
        updateConsent(all);
        setIsVisible(false);
    };

    const handleSaveSelection = () => {
        updateConsent(prefs);
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/25 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:items-center sm:p-6 animate-in fade-in duration-300">
            <Card className="max-h-[calc(100dvh-1.5rem-env(safe-area-inset-bottom))] w-full max-w-4xl overflow-y-auto bg-white text-foreground rounded-2xl sm:rounded-[3rem] p-5 sm:p-10 shadow-2xl border border-slate-100 space-y-5 sm:space-y-10 relative">
                <div className="relative z-10 grid md:grid-cols-12 gap-5 sm:gap-10 items-center text-left">

                    <div className="md:col-span-7 space-y-4 sm:space-y-6">
                        <div className="flex items-center gap-3 sm:gap-4">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner shrink-0"><ShieldCheck size={24} /></div>
                            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tighter">Privacy Protocol</h2>
                        </div>
                        <p className="text-sm font-medium text-slate-500 leading-relaxed italic md:pr-4">
                            &quot;We use cookies to secure your session and optimize the Online Bar experience. Your data choice is critical to our system integrity.&quot;
                        </p>
                    </div>

                    <div className="md:col-span-5 flex flex-col gap-3">
                        <Button
                            onClick={handleAcceptAll}
                            className="h-16 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest hover:bg-primary/90 transition-all shadow-xl active:scale-95 shadow-primary/20"
                        >
                            Authorize All
                        </Button>
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                onClick={() => setShowSettings(!showSettings)}
                                className="flex-1 h-12 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50"
                            >
                                <Settings size={14} className="mr-2" /> {showSettings ? 'Close' : 'Select Nodes'}
                            </Button>
                        </div>
                    </div>
                </div>

                {showSettings && (
                    <div className="relative z-10 pt-10 border-t border-slate-100 grid sm:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-4 duration-500 text-left">
                        {[
                            { id: 'analytics' as keyof ConsentPreferences, label: 'Analytics', desc: 'Node performance' },
                            { id: 'personalization' as keyof ConsentPreferences, label: 'Personalization', desc: 'Custom menu' },
                            { id: 'marketing' as keyof ConsentPreferences, label: 'Marketing', desc: 'Promo alerts' }
                        ].map(node => (
                            <button
                                key={node.id}
                                onClick={() => setPrefs({...prefs, [node.id]: !prefs[node.id]})}
                                className={cn(
                                    "p-6 rounded-[2rem] border-2 transition-all text-left space-y-1 group",
                                    prefs[node.id] ? "bg-primary/5 border-primary/20" : "bg-slate-50 border-slate-100 hover:bg-white hover:border-slate-200"
                                )}
                            >
                                <div className="flex justify-between items-center mb-4">
                                    <span className={cn(
                                        "text-[9px] font-black uppercase tracking-widest",
                                        prefs[node.id] ? "text-primary" : "text-slate-400"
                                    )}>{node.label}</span>
                                    <div className={cn(
                                        "h-2 w-2 rounded-full",
                                        prefs[node.id] ? "bg-primary animate-pulse" : "bg-slate-200"
                                    )} />
                                </div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{node.desc}</p>
                            </button>
                        ))}
                        <div className="sm:col-span-3 pt-4">
                            <Button
                                onClick={handleSaveSelection}
                                className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20"
                            >
                                Confirm Selection
                            </Button>
                        </div>
                    </div>
                )}

                <Info className="absolute -bottom-10 -right-10 h-48 w-48 text-slate-50 rotate-12 -z-0" />
            </Card>
        </div>
    );
}
