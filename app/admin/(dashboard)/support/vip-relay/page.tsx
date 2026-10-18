'use client';

import {
    Video,
    ShieldCheck,
    ArrowLeft,
    Users,
    Bot,
    Sparkles,
    MessageSquare,
    PhoneCall
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

export default function VIPVideoRelay() {
    return (
        <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <Link href="/lord/support" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors mb-4">
                        <ArrowLeft size={14} /> Back to Command
                    </Link>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_10px_#5b5bff]"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-700">Integration not configured</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Video Support Relay</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Video support is unavailable until a verified video provider is connected.</p>
                </div>
            </header>

            <div className="grid lg:grid-cols-12 gap-10">
                {/* Live Stream Area */}
                <div className="lg:col-span-8 space-y-8">
                    <Card className="aspect-video rounded-[3.5rem] bg-white border border-slate-100 shadow-2xl relative overflow-hidden flex items-center justify-center group">
                        <div className="text-center space-y-6 relative z-10 animate-in zoom-in-95 duration-700">
                            <div className="h-24 w-24 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 mx-auto shadow-inner relative group-hover:scale-105 transition-transform">
                                <Video size={48} />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Video Session Unavailable</h3>
                                <p className="text-xs font-black uppercase text-slate-400 tracking-widest">No active customer session is connected.</p>
                            </div>
                            <Button disabled className="h-16 px-12 rounded-2xl bg-slate-200 text-slate-600 font-black uppercase text-xs tracking-widest">
                                Video provider unavailable
                            </Button>
                        </div>

                        <div className="absolute top-8 right-8 flex gap-3">
                            <div className="px-4 py-2 rounded-xl bg-slate-50 backdrop-blur-md border border-slate-100 flex items-center gap-2 shadow-sm">
                                <Users size={12} className="text-indigo-500" />
                                <span className="text-[10px] font-black uppercase text-foreground">No customer selected</span>
                            </div>
                        </div>

                        <Sparkles className="absolute -bottom-10 -left-10 h-64 w-64 text-indigo-500/5 rotate-12 -z-0" />
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-6 text-left group hover:border-indigo-100 transition-all">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 shadow-sm group-hover:scale-110 transition-transform"><Bot size={20} /></div>
                                <h3 className="text-lg font-black uppercase text-foreground">Video Analysis</h3>
                            </div>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed italic">
                                No video-analysis provider is connected; customer video is not being processed.
                            </p>
                        </Card>

                        <Card className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-6 text-left group hover:border-emerald-100 transition-all">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500 shadow-sm group-hover:scale-110 transition-transform"><ShieldCheck size={20} /></div>
                                <h3 className="text-lg font-black uppercase text-foreground">Transport Security</h3>
                            </div>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed italic">
                                Video transport security has not been verified because no video service is configured.
                            </p>
                        </Card>
                    </div>
                </div>

                {/* Control Panel Sidebar */}
                <div className="lg:col-span-4 space-y-8 text-left">
                    <Card className="p-10 rounded-[3rem] bg-white border border-slate-100 shadow-xl relative overflow-hidden group">
                        <div className="relative z-10 space-y-8">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500">Relay Controls</h3>
                            <div className="space-y-4">
                                <Button disabled className="w-full h-14 rounded-2xl bg-slate-50 border border-slate-100 text-foreground font-black uppercase text-[10px] flex items-center gap-3">
                                    <MessageSquare size={16} className="text-indigo-500" /> Open Side Chat
                                </Button>
                                <Button disabled className="w-full h-14 rounded-2xl bg-slate-50 border border-slate-100 text-foreground font-black uppercase text-[10px] flex items-center gap-3">
                                    <ShieldCheck size={16} className="text-emerald-500" /> Verify Patron Identity
                                </Button>
                                <Button disabled className="w-full h-14 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 font-black uppercase text-[10px] flex items-center gap-3 shadow-sm">
                                    <PhoneCall size={16} /> Terminate Link
                                </Button>
                            </div>
                        </div>
                    </Card>

                    <div className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-6 text-left">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><Sparkles size={20} /></div>
                        <h4 className="text-lg font-black uppercase text-foreground leading-none">VIP Video Support Unavailable</h4>
                        <p className="text-[10px] text-muted-foreground font-medium leading-relaxed italic">
                            No customer session, eligibility status, or video-support provider is connected to this page.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
