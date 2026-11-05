'use client';

import * as React from 'react';
import { CircleMarker, MapContainer, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { MapPin, Pencil, Plus, Save, Trash2, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { DELIVERY_AREA_COLORS, DeliveryArea, getDeliveryAreaColor, parseDeliveryAreas, parseDeliveryPricing } from '@/lib/deliveryAreas';
import 'leaflet/dist/leaflet.css';

function BoundaryClickCapture({ onAddPoint }: { onAddPoint: (point: [number, number]) => void }) {
    useMapEvents({
        click(event) {
            onAddPoint([event.latlng.lat, event.latlng.lng]);
        }
    });
    return null;
}

function makeRadiusBoundary(center: [number, number], radiusMeters: number): [number, number][] {
    const [latitude, longitude] = center;
    const latitudeOffset = radiusMeters / 111_320;
    const longitudeOffset = radiusMeters / (111_320 * Math.max(Math.cos(latitude * Math.PI / 180), 0.01));
    return Array.from({ length: 32 }, (_, index) => {
        const angle = (index / 32) * 2 * Math.PI;
        return [
            latitude + latitudeOffset * Math.sin(angle),
            longitude + longitudeOffset * Math.cos(angle)
        ];
    });
}

function FocusDeliveryArea({ area }: { area: DeliveryArea | null }) {
    const map = useMap();

    React.useEffect(() => {
        if (area && area.points.length >= 3) map.fitBounds(area.points, { padding: [48, 48], maxZoom: 15 });
    }, [area, map]);

    return null;
}

export default function DeliveryAreaManager() {
    const [areas, setAreas] = React.useState<DeliveryArea[]>([]);
    const [draftPoints, setDraftPoints] = React.useState<[number, number][]>([]);
    const [name, setName] = React.useState('');
    const [fee, setFee] = React.useState('');
    const [zoneColor, setZoneColor] = React.useState<string>(DELIVERY_AREA_COLORS[0]);
    const [editingAreaId, setEditingAreaId] = React.useState<string | null>(null);
    const [focusedAreaId, setFocusedAreaId] = React.useState<string | null>(null);
    const [drawingBoundary, setDrawingBoundary] = React.useState(false);
    const [quickBoundaryMode, setQuickBoundaryMode] = React.useState(false);
    const [quickBoundaryRadius, setQuickBoundaryRadius] = React.useState('1000');
    const [freeDeliveryOver, setFreeDeliveryOver] = React.useState('3000');
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [message, setMessage] = React.useState<string | null>(null);
    const unmappedAreas = areas.filter(area => area.points.length < 3);

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

    const saveArea = async () => {
        const numericFee = Number(fee);
        if (!name.trim() || !fee.trim() || draftPoints.length < 3 || !Number.isSafeInteger(numericFee) || numericFee < 0) {
            setMessage('Enter a zone name, a whole-number fee, and draw a map boundary using at least three points.');
            return;
        }
        if (areas.some(area => area.id !== editingAreaId && area.name.trim().toLowerCase() === name.trim().toLowerCase())) {
            setMessage('That estate or delivery area already exists.');
            return;
        }
        const area: DeliveryArea = {
            id: editingAreaId || crypto.randomUUID(),
            name: name.trim(),
            free_delivery: numericFee === 0,
            fee: numericFee,
            color: zoneColor,
            points: draftPoints
        };
        const next = editingAreaId
            ? areas.map(existing => existing.id === editingAreaId ? area : existing)
            : [...areas, area];
        if (await persistAreas(next)) {
            setFocusedAreaId(area.id);
            setName('');
            setFee('');
            setZoneColor(DELIVERY_AREA_COLORS[next.length % DELIVERY_AREA_COLORS.length]);
            setDraftPoints([]);
            setEditingAreaId(null);
            setDrawingBoundary(false);
            setQuickBoundaryMode(false);
        }
    };

    const editArea = (area: DeliveryArea) => {
        setEditingAreaId(area.id);
        setFocusedAreaId(area.id);
        setName(area.name);
        setFee(String(area.fee ?? (area.free_delivery ? 0 : '')));
        setZoneColor(getDeliveryAreaColor(areas.indexOf(area), area.color));
        setDraftPoints(area.points);
        setDrawingBoundary(false);
        setQuickBoundaryMode(false);
        setMessage(`Editing ${area.name}. Draw a new boundary or save its current boundary and fee.`);
    };

    const cancelAreaEdit = () => {
        setEditingAreaId(null);
        setFocusedAreaId(null);
        setName('');
        setFee('');
        setZoneColor(DELIVERY_AREA_COLORS[areas.length % DELIVERY_AREA_COLORS.length]);
        setDraftPoints([]);
        setDrawingBoundary(false);
        setQuickBoundaryMode(false);
        setMessage(null);
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
        <Card id="estate-delivery-pricing" className="space-y-6 p-4 sm:p-6 lg:p-8 scroll-mt-24">
            <div>
                <h2 className="text-lg font-black uppercase text-foreground">Delivery zones</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Set the area name and fee, then choose a quick radius and click its center on the map once, or draw an exact boundary. GPS pins are charged by the mapped zone they fall inside.
                </p>
            </div>
            {message && <p role="status" className="rounded-lg bg-secondary p-3 text-sm text-foreground">{message}</p>}
            {!loading && unmappedAreas.length > 0 && (
                <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-950">
                    Map boundaries are still needed for {unmappedAreas.map(area => area.name).join(', ')}. GPS checkout will not apply a guessed fee for pins outside a mapped zone.
                </p>
            )}
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
            <section className="space-y-4" aria-label="Delivery zone map editor">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-black uppercase text-foreground">Set delivery coverage</h3>
                        <p className="text-xs text-muted-foreground">For a fast setup, enter the zone name and fee, choose a radius, select “Quick radius zone”, then click the center once on the map. Use “Draw boundary” when you need an exact outline.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        {areas.map((area, index) => (
                            <span key={area.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-semibold">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getDeliveryAreaColor(index, area.color) }} />
                                {area.name}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(360px,0.8fr)]">
                <div className="h-[55vh] min-h-[440px] overflow-hidden rounded-2xl border border-border sm:h-[68vh] sm:min-h-[620px] xl:h-[76vh] xl:min-h-[700px]">
                    <MapContainer center={[-1.286389, 36.817223]} zoom={11} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
                        <FocusDeliveryArea area={areas.find(area => area.id === focusedAreaId) || null} />
                        <TileLayer
                            attribution='&copy; OpenStreetMap contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        {(drawingBoundary || quickBoundaryMode) && (
                            <BoundaryClickCapture onAddPoint={point => {
                                if (quickBoundaryMode) {
                                    const radius = Number(quickBoundaryRadius);
                                    setDraftPoints(makeRadiusBoundary(point, radius));
                                    setQuickBoundaryMode(false);
                                    setDrawingBoundary(false);
                                    setMessage(`Approximate ${radius >= 1000 ? `${radius / 1000} km` : `${radius} m`} zone boundary created. Adjust the boundary or save it.`);
                                    return;
                                }
                                setDraftPoints(points => [...points, point]);
                            }} />
                        )}
                        {areas.filter(area => area.points.length >= 3 && area.id !== editingAreaId).map(area => {
                            const index = areas.findIndex(item => item.id === area.id);
                            const color = getDeliveryAreaColor(index, area.color);
                            return (
                                <Polygon key={area.id} positions={area.points} pathOptions={{ color, fillColor: color, fillOpacity: 0.12, weight: 3 }}>
                                    <Tooltip sticky>{area.name} · KSh {(area.fee ?? 0).toLocaleString()}</Tooltip>
                                </Polygon>
                            );
                        })}
                        {draftPoints.length > 1 && <Polygon positions={draftPoints} pathOptions={{ color: zoneColor, fillColor: zoneColor, fillOpacity: 0.2, dashArray: '7 6', weight: 4 }} />}
                        {draftPoints.map((point, index) => (
                            <CircleMarker key={`${point[0]}-${point[1]}-${index}`} center={point} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: zoneColor, fillOpacity: 1 }} />
                        ))}
                    </MapContainer>
                </div>
                <div className="grid content-start gap-4 rounded-2xl border border-border bg-secondary/30 p-4 sm:p-5">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                    <label className="block space-y-1 text-sm font-semibold">
                        <span>{editingAreaId ? 'Edit estate / zone name' : 'Estate / zone name'}</span>
                        <Input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Westlands" maxLength={80} disabled={loading || saving} />
                    </label>
                    <label className="block space-y-1 text-sm font-semibold">
                        <span>Delivery fee (KSh)</span>
                        <Input type="number" min="0" step="1" value={fee} onChange={event => setFee(event.target.value)} placeholder="e.g. 250" disabled={loading || saving} />
                    </label>
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-semibold">Zone color · {DELIVERY_AREA_COLORS.length} colors</p>
                        <div className="grid grid-cols-6 gap-2" role="group" aria-label="Choose a delivery zone color">
                            {DELIVERY_AREA_COLORS.map((color, index) => (
                                <button
                                    key={color}
                                    type="button"
                                    aria-label={`Zone color ${index + 1}`}
                                    aria-pressed={zoneColor === color}
                                    title={`Color ${index + 1}`}
                                    onClick={() => setZoneColor(color)}
                                    disabled={loading || saving}
                                    className={`h-8 w-8 rounded-full border-2 transition hover:scale-110 disabled:opacity-50 ${zoneColor === color ? 'border-foreground ring-2 ring-primary ring-offset-2' : 'border-white shadow'}`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={() => {
                            if (!drawingBoundary && editingAreaId) setDraftPoints([]);
                            setQuickBoundaryMode(false);
                            setDrawingBoundary(value => !value);
                        }} variant={drawingBoundary ? 'default' : 'outline'} disabled={loading || saving}>
                            <MapPin className="mr-2 h-4 w-4" /> {drawingBoundary ? 'Stop drawing' : 'Draw boundary'}
                        </Button>
                        <label className="flex items-center gap-2 text-xs font-semibold">
                            Radius
                            <select
                                aria-label="Quick delivery zone radius"
                                value={quickBoundaryRadius}
                                onChange={event => setQuickBoundaryRadius(event.target.value)}
                                disabled={loading || saving || quickBoundaryMode}
                                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                            >
                                <option value="500">500 m</option>
                                <option value="1000">1 km</option>
                                <option value="2000">2 km</option>
                                <option value="3000">3 km</option>
                            </select>
                        </label>
                        <Button onClick={() => {
                            if (!quickBoundaryMode && editingAreaId) setDraftPoints([]);
                            setDrawingBoundary(false);
                            setQuickBoundaryMode(value => !value);
                            setMessage(quickBoundaryMode ? null : 'Click the map once to place the center of this approximate radius zone.');
                        }} variant={quickBoundaryMode ? 'default' : 'outline'} disabled={loading || saving}>
                            <MapPin className="mr-2 h-4 w-4" /> {quickBoundaryMode ? 'Cancel quick zone' : 'Quick radius zone'}
                        </Button>
                        <Button onClick={() => setDraftPoints(points => points.slice(0, -1))} variant="outline" disabled={!draftPoints.length || saving}>
                            <Undo2 className="mr-2 h-4 w-4" /> Undo point
                        </Button>
                        <Button onClick={() => setDraftPoints([])} variant="outline" disabled={!draftPoints.length || saving}>Clear points</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {quickBoundaryMode
                            ? 'Click the map once to create the approximate radius boundary.'
                            : `${draftPoints.length} boundary points ${drawingBoundary ? 'marked; click the map to add more' : 'ready'} ${draftPoints.length > 0 && draftPoints.length < 3 ? '· add at least 3 to save' : ''}`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={saveArea} disabled={saving || loading} className="min-w-48">
                            {editingAreaId ? <><Save className="mr-2 h-4 w-4" /> Save zone changes</> : <><Plus className="mr-2 h-4 w-4" /> Add delivery zone</>}
                        </Button>
                        {editingAreaId && <Button onClick={cancelAreaEdit} disabled={saving} variant="outline"><X className="mr-2 h-4 w-4" /> Cancel edit</Button>}
                    </div>
                </div>
                </div>
            </section>
            <section className="space-y-3">
                <div>
                    <h3 className="text-sm font-black uppercase text-foreground">Configured fees</h3>
                    <p className="text-xs text-muted-foreground">Changes save when you leave a name or fee field. Use Edit boundary to change the GPS coverage on the map.</p>
                </div>
                {loading ? <p className="text-xs text-muted-foreground">Loading saved areas…</p> : (
                    <ul className="grid gap-3 md:grid-cols-2">
                            {areas.map(area => (
                                <li key={area.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_7rem_auto] items-end gap-3 rounded-xl border border-border bg-background p-3">
                                <span className="mb-1 h-5 w-5 rounded-full border border-black/10" style={{ backgroundColor: getDeliveryAreaColor(areas.indexOf(area), area.color) }} aria-label={`${area.name} zone color`} />
                                <label className="min-w-0 space-y-1 text-xs font-semibold">
                                        <span className="block truncate text-muted-foreground">Zone name · {area.points.length >= 3 ? 'Mapped' : 'Needs map boundary'}</span>
                                    <Input
                                        aria-label={`Estate or area name for ${area.name}`}
                                        defaultValue={area.name}
                                        onBlur={event => {
                                            if (event.target.value.trim() !== area.name) void updateAreaName(area.id, event.target.value);
                                        }}
                                        className="h-10 min-w-0 w-full px-3 text-sm font-semibold"
                                    />
                                    </label>
                                    <label className="space-y-1 text-xs font-semibold">
                                        <span className="block text-muted-foreground">Fee · KSh</span>
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
                                        className="h-10 px-3 text-sm"
                                    />
                                    </label>
                                    <div className="flex items-center gap-1">
                                        <Button variant="outline" size="icon" aria-label={`Edit map boundary for ${area.name}`} title="Edit map boundary" disabled={saving} onClick={() => editArea(area)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" aria-label={`Remove ${area.name}`} title={`Remove ${area.name}`} disabled={saving} onClick={() => removeArea(area.id)}>
                                            <Trash2 className="h-4 w-4 text-rose-600" />
                                        </Button>
                                    </div>
                                </li>
                            ))}
                            {!areas.length && <li className="text-sm text-muted-foreground">No delivery zones configured.</li>}
                    </ul>
                )}
            </section>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Save className="h-4 w-4" /> Saved zone fees apply at checkout and are recalculated securely when an order is submitted.
            </div>
        </Card>
    );
}
