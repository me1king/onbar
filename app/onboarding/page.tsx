'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
    Sparkles,
    CheckCircle2,
    Wine,
    ArrowRight,
    Smartphone,
    User,
    ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import PwaInstallOverlay from '@/components/onboarding/PwaInstallOverlay';

export default function OnboardingPage() {
    const router = useRouter();
    const [step, setStep] = React.useState(1);
    const [fullName, setFullName] = React.useState('');
    const [preference, setPreferences] = React.useState<string[]>([]);
    const [showPwaModal, setShowPwaModal] = React.useState(false);

    const togglePref = (pref: string) => {
        setPreferences(prev =>
            prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]
        );
    };

    const handleCompleteOnboarding = () => {
        router.push('/shop');
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8 text-foreground selection:bg-primary/20">

            <Card className="w-full max-w-xl p-8 sm:p-12 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-2xl space-y-8 text-left relative overflow-hidden">

                {/* HEADER */}
                <div className="space-y-2 border-b border-slate-100 pb-6">
                    <div className="flex items-center gap-3">
                        <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">BAR OS WELCOME TERMINAL</span>
                    </div>
                    <h1 className="text-3xl font-black uppercase tracking-tight text-foreground">Welcome to APEX OS</h1>
                    <p className="text-xs font-medium text-slate-500">Personalize your premium Kenya bar experience in seconds.</p>
                </div>

                {/* STEP 1: NAME */}
                {step === 1 && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase text-slate-400 tracking-widest">What should we call you?</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                                <Input
                                    value={fullName}
                                    onChange={e => setFullName(e.target.value)}
                                    placeholder="Enter your full name..."
                                    className="h-14 pl-12 rounded-2xl bg-slate-50 border-slate-200 text-sm font-bold uppercase tracking-wider"
                                />
                            </div>
                        </div>

                        <Button
                            onClick={() => setStep(2)}
                            disabled={!fullName.trim()}
                            className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20"
                        >
                            Continue <ArrowRight size={16} className="ml-2" />
                        </Button>
                    </div>
                )}

                {/* STEP 2: PREFERENCES */}
                {step === 2 && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase text-slate-400 tracking-widest">Select your favorite drink categories</label>
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                {['Whiskey & Bourbon', 'Fine Wines & Vintage', 'Gins & Craft Spirits', 'Ice Cold Beverages'].map(cat => {
                                    const selected = preference.includes(cat);
                                    return (
                                        <button
                                            key={cat}
                                            onClick={() => togglePref(cat)}
                                            className={`p-4 rounded-2xl text-xs font-black uppercase border text-left transition-all flex justify-between items-center ${
                                                selected ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-slate-50 text-foreground border-slate-200'
                                            }`}
                                        >
                                            <span>{cat}</span>
                                            {selected && <CheckCircle2 size={16} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <Button
                            onClick={() => {
                                setStep(3);
                                setShowPwaModal(true);
                            }}
                            className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20"
                        >
                            Finalize Profile <ArrowRight size={16} className="ml-2" />
                        </Button>
                    </div>
                )}

            </Card>

            {/* PWA INSTALL MODAL OVERLAY */}
            <PwaInstallOverlay
                isOpen={showPwaModal}
                onClose={() => setShowPwaModal(false)}
                onComplete={handleCompleteOnboarding}
            />
        </div>
    );
}
