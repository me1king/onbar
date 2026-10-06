'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wine, Sparkles, Edit3, Check, Loader2 } from 'lucide-react';
import {
    PolarGrid,
    PolarAngleAxis,
    Radar,
    RadarChart,
    ResponsiveContainer
} from 'recharts';
import { supabase } from '@/lib/supabaseClient';

interface TasteDNAProps {
    dna: Record<string, number>;
    userId?: string;
    onUpdate?: (newDna: Record<string, number>) => void;
}

export default function TasteDNA({ dna, userId, onUpdate }: TasteDNAProps) {
    const [isEditing, setIsEditing] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [formData, setFormData] = React.useState({
        whiskey: dna.whiskey || 50,
        wine: dna.wine || 50,
        gin: dna.gin || 50,
        beer: dna.beer || 50,
        vodka: dna.vodka || 50,
        tequila: dna.tequila || 50,
    });

    React.useEffect(() => {
        setFormData({
            whiskey: dna.whiskey || 50,
            wine: dna.wine || 50,
            gin: dna.gin || 50,
            beer: dna.beer || 50,
            vodka: dna.vodka || 50,
            tequila: dna.tequila || 50,
        });
    }, [dna]);

    const data = React.useMemo(() => [
        { subject: 'Whiskey', A: formData.whiskey, fullMark: 100 },
        { subject: 'Wine', A: formData.wine, fullMark: 100 },
        { subject: 'Gin', A: formData.gin, fullMark: 100 },
        { subject: 'Beer', A: formData.beer, fullMark: 100 },
        { subject: 'Vodka', A: formData.vodka, fullMark: 100 },
        { subject: 'Tequila', A: formData.tequila, fullMark: 100 },
    ], [formData]);

    const dominantTrait = React.useMemo(() => {
        return [...data].sort((a,b) => b.A - a.A)[0];
    }, [data]);

    const handleSave = async () => {
        if (!supabase || !userId) {
            setIsEditing(false);
            if (onUpdate) onUpdate(formData);
            return;
        }

        setSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ taste_dna: formData })
                .eq('id', userId);

            if (error) throw error;
            if (onUpdate) onUpdate(formData);
            setIsEditing(false);
            alert("Taste DNA synchronized successfully!");
        } catch (err: unknown) {
            alert(`Sync failed: ${(err as Error).message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-10 relative overflow-hidden group text-left">
            <div className="relative z-10 space-y-8">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner transition-transform group-hover:scale-110 duration-500">
                            <Wine size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tighter text-foreground leading-none">Taste DNA</h3>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Behavioral Flavor Profile</p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditing(!isEditing)}
                        className="h-10 px-4 rounded-xl border-slate-200 text-foreground font-black uppercase text-[9px] tracking-widest hover:bg-slate-50"
                    >
                        <Edit3 size={14} className="mr-1.5" /> {isEditing ? 'Cancel' : 'Edit DNA'}
                    </Button>
                </div>

                {isEditing ? (
                    <div className="space-y-6 bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 animate-in fade-in zoom-in-95 duration-300">
                        <p className="text-[10px] font-black uppercase text-primary tracking-widest">Adjust Your Flavor Preferences (0 - 100)</p>
                        <div className="grid sm:grid-cols-2 gap-6">
                            {Object.entries(formData).map(([key, val]) => (
                                <div key={key} className="space-y-2">
                                    <div className="flex justify-between items-center text-xs font-black uppercase text-foreground">
                                        <span>{key}</span>
                                        <span className="text-primary">{val}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={val}
                                        onChange={e => setFormData(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                                        className="w-full accent-primary cursor-pointer"
                                    />
                                </div>
                            ))}
                        </div>
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20"
                        >
                            {saving ? <Loader2 className="animate-spin h-4 w-4" /> : <><Check size={16} className="mr-2" /> Save Taste DNA</>}
                        </Button>
                    </div>
                ) : (
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                                <PolarGrid stroke="#f1f5f9" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 900 }} />
                                <Radar
                                    name="Taste"
                                    dataKey="A"
                                    stroke="#F5A000"
                                    fill="#F5A000"
                                    fillOpacity={0.6}
                                    animationDuration={1500}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                    <div className="flex items-center gap-3">
                        <Sparkles size={16} className="text-primary animate-pulse" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Discovery Intelligence</p>
                    </div>
                    <p className="text-xs font-bold text-slate-600 leading-relaxed italic">
                        &quot;Your affinity for <span className="text-primary uppercase">{dominantTrait.subject}</span> has reached {dominantTrait.A}%. Our cellar master recommends exploring our new vintage reserves.&quot;
                    </p>
                </div>
            </div>
            {/* Subtle background glow */}
            <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-primary/5 rounded-full blur-[80px] -z-0"></div>
        </Card>
    );
}
