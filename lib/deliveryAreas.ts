export interface DeliveryArea {
    id: string;
    name: string;
    free_delivery: boolean;
    fee?: number;
    points: [number, number][];
}

export interface DeliveryPricing {
    free_delivery_over: number;
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
    return areas.find(area => {
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
    }) || null;
}
