'use client';

import { MessageCircle, Radio, Server, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function WhatsAppCommandCenter() {
    return (
        <div className="p-4 sm:p-8 space-y-8 bg-slate-50 min-h-screen text-left pb-40">
            <header className="flex flex-col gap-3 border-b border-slate-200 pb-8">
                <div className="flex items-center gap-3">
                    <MessageCircle className="h-5 w-5 text-amber-500" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-700">Meta WhatsApp Business Cloud API</span>
                    <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-700 border border-amber-500/20">
                        Connection Unverified
                    </span>
                </div>
                <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">WhatsApp Command</h1>
                <p className="text-muted-foreground text-sm font-medium">
                    Integration status and setup information. Credentials are server-side and are never displayed here.
                </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-200 shadow-md space-y-5">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <ShieldAlert className="h-6 w-6 text-amber-600" />
                        <div>
                            <h2 className="text-lg font-black uppercase tracking-tight text-foreground">Messaging Unavailable</h2>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Configuration has not been verified</p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-600">
                        This dashboard cannot confirm a live WhatsApp connection. The server-side messaging service requires
                        <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">WHATSAPP_TOKEN</code>
                        and
                        <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">WHATSAPP_PHONE_ID</code>.
                        No test messages, replies, or broadcasts can be sent from this screen.
                    </p>
                </Card>

                <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-200 shadow-md space-y-5">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <Radio className="h-6 w-6 text-slate-500" />
                        <div>
                            <h2 className="text-lg font-black uppercase tracking-tight text-foreground">Webhook Endpoint</h2>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Application route; Meta registration not verified</p>
                        </div>
                    </div>
                    <code className="block break-all rounded-xl bg-slate-50 p-4 font-mono text-xs text-slate-700">
                        /api/webhooks/whatsapp
                    </code>
                    <p className="text-sm text-slate-600">
                        The endpoint exists, but this screen cannot confirm that it is registered with Meta or that its
                        server-side verification token is configured.
                    </p>
                </Card>

                <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-200 shadow-md space-y-5 lg:col-span-2">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <Server className="h-6 w-6 text-slate-500" />
                        <div>
                            <h2 className="text-lg font-black uppercase tracking-tight text-foreground">Message History Unavailable</h2>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">No matching message schema is defined in the project migrations</p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-600">
                        This dashboard has no verified message-history source. It does not show sample conversations, invented
                        audience counts, or simulated delivery results.
                    </p>
                </Card>
            </div>
        </div>
    );
}
