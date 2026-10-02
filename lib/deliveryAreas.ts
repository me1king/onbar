export interface DeliveryArea {
    id: string;
    name: string;
    free_delivery: boolean;
    points: [number, number][];
}

export function parseDeliveryAreas(value: unknown): DeliveryArea[] {
    if (!Array.isArray(value)) throw new Error('Saved free-delivery areas must be a list.');
    if (value.some(area =>
        typeof area !== 'object' || area === null ||
        typeof area.id !== 'string' || !area.id.trim() ||
        typeof area.name !== 'string' || !area.name.trim() ||
        typeof area.free_delivery !== 'boolean' ||
        !Array.isArray(area.points) || area.points.length < 3 ||
        area.points.some((point: unknown) =>
            !Array.isArray(point) || point.length !== 2 ||
            typeof point[0] !== 'number' || !Number.isFinite(point[0]) || point[0] < -90 || point[0] > 90 ||
            typeof point[1] !== 'number' || !Number.isFinite(point[1]) || point[1] < -180 || point[1] > 180
        )
    )) {
        throw new Error('Saved free-delivery areas contain invalid names or map boundaries.');
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
