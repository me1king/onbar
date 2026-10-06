'use client';

import { useEffect, useState } from 'react';
import { Bell, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';

export default function MarketingPreferences() {
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        async function loadPreference() {
            if (!supabase) {
                if (active) {
                    setMessage('Notification preferences are unavailable because the database is not configured.');
                    setLoading(false);
                }
                return;
            }
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError) throw userError;
            if (!user) {
                if (active) {
                    setMessage('Sign in to manage promotional notification preferences.');
                    setLoading(false);
                }
                return;
            }
            const { data, error } = await supabase
                .from('user_consent')
                .select('in_app_marketing')
                .eq('user_id', user.id)
                .maybeSingle();
            if (error) throw error;
            if (active) {
                setEnabled(data?.in_app_marketing === true);
                setLoading(false);
            }
        }
        void loadPreference().catch(error => {
            console.error('[MarketingPreferences] Could not load consent:', error);
            if (active) {
                setMessage('Could not load your notification preference. Please refresh and try again.');
                setLoading(false);
            }
        });
        return () => { active = false; };
    }, []);

    const savePreference = async (nextValue: boolean) => {
        if (!supabase) return;
        setSaving(true);
        setMessage(null);
        try {
            const { error } = await supabase.rpc('save_customer_marketing_preferences', {
                p_in_app_marketing: nextValue,
                p_source: 'profile'
            });
            if (error) throw error;
            setEnabled(nextValue);
            setMessage(nextValue
                ? 'Promotional in-app notifications are enabled.'
                : 'Promotional in-app notifications are turned off.');
        } catch (error) {
            console.error('[MarketingPreferences] Could not save consent:', error);
            setMessage(error instanceof Error ? error.message : 'Could not save your notification preference.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Bell size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-black uppercase tracking-tight text-foreground">Marketing preferences</h2>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">
                        Choose whether Onbar may send promotional offers to your in-app notification inbox. Order and account updates are not affected.
                    </p>
                    <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <input
                            type="checkbox"
                            checked={enabled}
                            disabled={loading || saving || Boolean(message?.startsWith('Sign in'))}
                            onChange={event => void savePreference(event.target.checked)}
                            className="h-5 w-5 accent-primary"
                        />
                        <span className="flex-1 text-sm font-bold text-slate-700">Allow promotional in-app notifications</span>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <ShieldCheck className="h-4 w-4 text-slate-400" />}
                    </label>
                    {loading && <p className="mt-3 text-xs font-semibold text-slate-400">Loading preference…</p>}
                    {message && <p aria-live="polite" className="mt-3 text-xs font-semibold text-slate-500">{message}</p>}
                </div>
            </div>
        </Card>
    );
}
