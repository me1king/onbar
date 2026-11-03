import { approximateArea } from '@/lib/locationCatalog';

export interface DeliveryArea {
    id: string;
    name: string;
    free_delivery: boolean;
    fee?: number;
    color?: string;
    points: [number, number][];
}

export interface DeliveryPricing {
    free_delivery_over: number;
}

export interface LegacyShippingPricing {
    nairobi_cbd_label?: unknown;
    nairobi_cbd?: unknown;
    nairobi_outskirts_label?: unknown;
    nairobi_outskirts?: unknown;
    upcountry_label?: unknown;
    upcountry?: unknown;
}

export interface LegacyDeliveryQuote {
    id: string;
    name: string;
    label: string;
    fee: number;
    free_delivery: boolean;
    points: [number, number][];
}

export const DELIVERY_AREA_COLORS = [
    '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777',
    '#dc2626', '#65a30d', '#7c3aed', '#c2410c', '#0f766e', '#be185d',
    '#1d4ed8', '#15803d', '#6d28d9', '#b45309', '#0e7490', '#a21caf',
    '#b91c1c', '#4d7c0f', '#5b21b6', '#9a3412', '#115e59', '#9d174d',
    '#4338ca', '#047857', '#a16207', '#c026d3', '#0369a1', '#4f46e5'
] as const;

export function getDeliveryAreaColor(index: number, savedColor?: string): string {
    return savedColor && /^#[0-9a-f]{6}$/i.test(savedColor)
        ? savedColor
        : DELIVERY_AREA_COLORS[index % DELIVERY_AREA_COLORS.length];
}

export function resolveLegacyDeliveryQuote(
    latitude: number,
    longitude: number,
    value: unknown
): LegacyDeliveryQuote | null {
    const area = approximateArea(latitude, longitude);
    if (!area) return null;

    const saved = typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as LegacyShippingPricing
        : {};
    const tier = area.county === 'Nairobi'
        ? area.area.toLowerCase() === 'cbd' ? 'nairobi_cbd' : 'nairobi_outskirts'
        : 'upcountry';
    const defaults = {
        nairobi_cbd: { label: 'Local delivery', fee: 0 },
        nairobi_outskirts: { label: 'Extended delivery', fee: 300 },
        upcountry: { label: 'Outside local zones', fee: 500 }
    } as const;
    const defaultTier = defaults[tier];
    const rawFee = saved[tier];
    const fee = rawFee === undefined || rawFee === null || rawFee === ''
        ? defaultTier.fee
        : Number(rawFee);
    if (!Number.isSafeInteger(fee) || fee < 0) return null;
    const rawLabel = saved[`${tier}_label` as keyof LegacyShippingPricing];
    const label = typeof rawLabel === 'string' && rawLabel.trim()
        ? rawLabel.trim()
        : defaultTier.label;

    return {
        id: `legacy_${tier}`,
        name: area.area,
        label,
        fee,
        free_delivery: fee === 0,
        points: []
    };
}

export function parseDeliveryPricing(value: unknown): DeliveryPricing {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { free_delivery_over: 3000 };
    }
    const threshold = (value as Record<string, unknown>).free_delivery_over;
    if (threshold === undefined) return { free_delivery_over: 3000 };
    if (typeof threshold !== 'number' || !Number.isSafeInteger(threshold) || threshold < 0) {
        throw new Error('Free-delivery minimum must be a whole number of zero or more.');
    }
    return { free_delivery_over: threshold };
}

export function parseDeliveryAreas(value: unknown): DeliveryArea[] {
    if (!Array.isArray(value)) throw new Error('Saved delivery zones must be a list.');
    if (value.some(area =>
        typeof area !== 'object' || area === null ||
        typeof area.id !== 'string' || !area.id.trim() ||
        typeof area.name !== 'string' || !area.name.trim() ||
        typeof area.free_delivery !== 'boolean' ||
        (area.color !== undefined && (typeof area.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(area.color))) ||
        (area.fee !== undefined && (typeof area.fee !== 'number' || !Number.isSafeInteger(area.fee) || area.fee < 0)) ||
        !Array.isArray(area.points) || (area.points.length > 0 && area.points.length < 3) ||
        area.points.some((point: unknown) =>
            !Array.isArray(point) || point.length !== 2 ||
            typeof point[0] !== 'number' || !Number.isFinite(point[0]) || point[0] < -90 || point[0] > 90 ||
            typeof point[1] !== 'number' || !Number.isFinite(point[1]) || point[1] < -180 || point[1] > 180
        )
    )) {
        throw new Error('Saved delivery zones contain invalid names, fees, or map boundaries.');
    }
    return value as DeliveryArea[];
}

export function findDeliveryArea(
    latitude: number,
    longitude: number,
    areas: DeliveryArea[]
): DeliveryArea | null {
    return areas.find(area => {
        if (!area.free_delivery || area.points.length < 3) return false;

        let inside = false;
        for (let i = 0, j = area.points.length - 1; i < area.points.length; j = i++) {
            const [latI, lngI] = area.points[i];
            const [latJ, lngJ] = area.points[j];
            const crosses = (latI > latitude) !== (latJ > latitude)
                && longitude < ((lngJ - lngI) * (latitude - latI)) / (latJ - latI) + lngI;
            if (crosses) inside = !inside;
        }
        return inside;
    }) || null;
}

export function findDeliveryZone(
    latitude: number,
    longitude: number,
    areas: DeliveryArea[]
): DeliveryArea | null {
    const matches = findDeliveryZones(latitude, longitude, areas);
    return matches.length === 1 ? matches[0] : null;
}

export function findDeliveryZones(
    latitude: number,
    longitude: number,
    areas: DeliveryArea[]
): DeliveryArea[] {
    return areas.filter(area => {
        if (area.points.length < 3) return false;
        let inside = false;
        for (let i = 0, j = area.points.length - 1; i < area.points.length; j = i++) {
            const [latI, lngI] = area.points[i];
            const [latJ, lngJ] = area.points[j];
            const crosses = (latI > latitude) !== (latJ > latitude)
                && longitude < ((lngJ - lngI) * (latitude - latI)) / (latJ - latI) + lngI;
            if (crosses) inside = !inside;
        }
        return inside;
    });
}
