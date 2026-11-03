'use client';

import * as React from 'react';
import { MapContainer, Polygon, TileLayer, useMapEvents } from 'react-leaflet';
import { Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { DeliveryArea, parseDeliveryAreas, parseDeliveryPricing } from '@/lib/deliveryAreas';
import 'leaflet/dist/leaflet.css';

function BoundaryClickCapture({ onAddPoint }: { onAddPoint: (point: [number, number]) => void }) {
    useMapEvents({
        click(event) {
            onAddPoint([event.latlng.lat, event.latlng.lng]);
        }
    });
    return null;
}

export default function DeliveryAreaManager() {
    const [areas, setAreas] = React.useState<DeliveryArea[]>([]);
    const [draftPoints, setDraftPoints] = React.useState<[number, number][]>([]);
    const [name, setName] = React.useState('');
    const [fee, setFee] = React.useState('');
    const [freeDeliveryOver, setFreeDeliveryOver] = React.useState('3000');
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [message, setMessage] = React.useState<string | null>(null);

    React.useEffect(() => {
        let active = true;
        async function loadAreas() {
            if (!supabase) {
                setMessage('Supabase is not configured. Delivery areas cannot be loaded.');
                setLoading(false);
                return;
            }
            const [{ data, error }, { data: pricingData, error: pricingError }] = await Promise.all([
                supabase.from('settings').select('value').eq('key', 'free_delivery_areas').maybeSingle(),
                supabase.from('settings').select('value').eq('key', 'delivery_pricing').maybeSingle()
            ]);
            if (!active) return;
            if (error || pricingError) {
                setMessage(`Could not load delivery settings: ${(error || pricingError)?.message}`);
            } else {
                try {
                    setAreas(parseDeliveryAreas(data?.value ?? []));
                    setFreeDeliveryOver(String(parseDeliveryPricing(pricingData?.value).free_delivery_over));
                } catch (parseError) {
                    console.error('Saved delivery area data is invalid:', parseError);
                    setMessage(parseError instanceof Error ? parseError.message : 'Saved delivery areas are invalid.');
                }
            }
            setLoading(false);
        }
        loadAreas();
        return () => { active = false; };
    }, []);

    const persistAreas = async (nextAreas: DeliveryArea[]) => {
        if (!supabase) {
            setMessage('Supabase is not configured. Delivery areas were not saved.');
            return false;
        }
        setSaving(true);
        setMessage(null);
        try {
            const { error } = await supabase.from('settings').upsert({
                key: 'free_delivery_areas',
                value: nextAreas,
                is_published: true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });
            if (error) throw error;
            setAreas(nextAreas);
            setMessage('Delivery zones saved.');
            return true;
        } catch (error) {
            console.error('Delivery area save failed:', error);
            setMessage(error instanceof Error ? `Could not save areas: ${error.message}` : 'Could not save delivery areas.');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const persistPricing = async () => {
        const threshold = Number(freeDeliveryOver);
        if (!Number.isSafeInteger(threshold) || threshold < 0) {
            setMessage('Enter a whole-number free-delivery minimum of zero or more. Use zero to disable it.');
            return;
        }
        if (!supabase) {
            setMessage('Supabase is not configured. Delivery pricing was not saved.');
            return;
        }
        setSaving(true);
        setMessage(null);
        try {
            const { error } = await supabase.from('settings').upsert({
                key: 'delivery_pricing',
                value: { free_delivery_over: threshold },
                is_published: true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });
            if (error) throw error;
            setMessage(threshold > 0
                ? `Free delivery will apply to item subtotals of KSh ${threshold.toLocaleString()} or more.`
                : 'Free-delivery threshold disabled.');
        } catch (error) {
            console.error('Delivery pricing save failed:', error);
            setMessage(error instanceof Error ? `Could not save pricing: ${error.message}` : 'Could not save delivery pricing.');
        } finally {
            setSaving(false);
        }
    };

    const addArea = async () => {
        const numericFee = Number(fee);
        if (!name.trim() || !fee.trim() || (draftPoints.length > 0 && draftPoints.length < 3) || !Number.isSafeInteger(numericFee) || numericFee < 0) {
            setMessage('Enter a zone name and a whole-number fee. Map boundaries are optional, but need at least three points when used.');
            return;
        }
        if (areas.some(area => area.name.trim().toLowerCase() === name.trim().toLowerCase())) {
            setMessage('That estate or delivery area already exists.');
            return;
        }
        const next = [...areas, {
            id: crypto.randomUUID(),
            name: name.trim(),
            free_delivery: Number(fee) === 0,
            fee: numericFee,
            points: draftPoints
        }];
        if (await persistAreas(next)) {
            setName('');
            setFee('');
            setDraftPoints([]);
        }
    };

    const removeArea = (id: string) => {
        void persistAreas(areas.filter(area => area.id !== id));
    };

    const updateAreaFee = async (id: string, value: string) => {
        const numericFee = Number(value);
        if (!Number.isSafeInteger(numericFee) || numericFee < 0) {
            setMessage('Delivery fees must be whole numbers of zero or more.');
            return;
        }
        await persistAreas(areas.map(area => area.id === id
            ? { ...area, fee: numericFee, free_delivery: numericFee === 0 }
            : area));
    };

    const updateAreaName = async (id: string, value: string) => {
        const nextName = value.trim();
        if (!nextName) {
            setMessage('Delivery area names cannot be empty.');
            return;
        }
        if (areas.some(area => area.id !== id && area.name.trim().toLowerCase() === nextName.toLowerCase())) {
            setMessage('That estate or delivery area already exists.');
            return;
        }
        await persistAreas(areas.map(area => area.id === id ? { ...area, name: nextName } : area));
    };

    return (
        <Card className="space-y-5 p-4 sm:p-6">
            <div>
                <h2 className="text-lg font-black uppercase text-foreground">Delivery zones</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Add each estate or delivery area with its fee. Map boundaries are optional; add at least three points to match GPS pins automatically.
                </p>
            </div>
            {message && <p role="status" className="rounded-lg bg-secondary p-3 text-sm text-foreground">{message}</p>}
            <div className="grid gap-3 rounded-2xl border border-border bg-secondary/40 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="block space-y-1 text-sm font-semibold">
                    <span>Free delivery on item subtotal (KSh)</span>
                    <Input
                        type="number"
                        min="0"
                        step="1"
                        value={freeDeliveryOver}
                        onChange={event => setFreeDeliveryOver(event.target.value)}
                        disabled={loading || saving}
                    />
                    <span className="block text-xs font-normal text-muted-foreground">Set 0 to disable the offer. Zone fees are waived when the cart item subtotal reaches this amount.</span>
                </label>
                <Button onClick={persistPricing} disabled={loading || saving} variant="outline">
                    <Save className="mr-2 h-4 w-4" /> Save free-delivery rule
                </Button>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="h-72 overflow-hidden rounded-2xl border border-border sm:h-96">
                    <MapContainer center={[-1.286389, 36.817223]} zoom={11} style={{ height: '100%', width: '100%' }}>
                        <TileLayer
                            attribution='&copy; OpenStreetMap contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <BoundaryClickCapture onAddPoint={point => setDraftPoints(points => [...points, point])} />
                        {areas.filter(area => area.points.length >= 3).map(area => <Polygon key={area.id} positions={area.points} pathOptions={{ color: '#10b981', fillOpacity: 0.15 }} />)}
                        {draftPoints.length > 1 && <Polygon positions={draftPoints} pathOptions={{ color: '#f5a000', fillOpacity: 0.12, dashArray: '6 6' }} />}
                    </MapContainer>
                </div>
                <div className="space-y-4">
                    <label className="block space-y-1 text-sm font-semibold">
                        <span>Zone name</span>
                        <Input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Nairobi CBD" maxLength={80} />
                    </label>
                    <label className="block space-y-1 text-sm font-semibold">
                        <span>Delivery fee (KSh)</span>
                        <Input type="number" min="0" step="1" value={fee} onChange={event => setFee(event.target.value)} />
                    </label>
                    <p className="text-xs text-muted-foreground">{draftPoints.length} boundary points marked {draftPoints.length > 0 ? '(at least 3 required)' : '(optional for estate pricing)'}.</p>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={() => setDraftPoints(points => points.slice(0, -1))} variant="outline" disabled={!draftPoints.length}>
                            <Undo2 className="mr-2 h-4 w-4" /> Undo point
                        </Button>
                        <Button onClick={() => setDraftPoints([])} variant="outline" disabled={!draftPoints.length}>Clear</Button>
                    </div>
                    <Button onClick={addArea} disabled={saving || loading} className="w-full">
                        <Plus className="mr-2 h-4 w-4" /> Add delivery zone
                    </Button>
                    {loading ? <p className="text-xs text-muted-foreground">Loading saved areas…</p> : (
                        <ul className="space-y-2">
                            {areas.map(area => (
                                <li key={area.id} className="grid grid-cols-[minmax(0,1fr)_5rem_auto_auto] items-center gap-2 rounded-xl border border-border p-3">
                                    <Input
                                        aria-label={`Estate or area name for ${area.name}`}
                                        defaultValue={area.name}
                                        onBlur={event => {
                                            if (event.target.value.trim() !== area.name) void updateAreaName(area.id, event.target.value);
                                        }}
                                        className="h-9 min-w-0 px-2 text-xs font-semibold"
                                    />
                                    <Input
                                        aria-label={`Fee for ${area.name}`}
                                        type="number"
                                        min="0"
                                        step="1"
                                        defaultValue={area.fee ?? (area.free_delivery ? 0 : '')}
                                        onBlur={event => {
                                            if (String(event.target.value) !== String(area.fee ?? (area.free_delivery ? 0 : ''))) {
                                                void updateAreaFee(area.id, event.target.value);
                                            }
                                        }}
                                        className="h-9 px-2 text-xs"
                                    />
                                    <span className="text-[10px] font-bold text-muted-foreground">KSh</span>
                                    <Button variant="ghost" size="icon" aria-label={`Remove ${area.name}`} disabled={saving} onClick={() => removeArea(area.id)}>
                                        <Trash2 className="h-4 w-4 text-rose-600" />
                                    </Button>
                                </li>
                            ))}
                            {!areas.length && <li className="text-sm text-muted-foreground">No delivery zones configured.</li>}
                        </ul>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Save className="h-4 w-4" /> Saved zones control the checkout delivery fee.
                    </div>
                </div>
            </div>
        </Card>
    );
}
