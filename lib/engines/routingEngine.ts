import { supabase } from '../supabaseClient';

/**
 * ROUTING ENGINE
 * Orchestrates communication with professional routing providers (Google Routes API).
 */

export interface GeoPoint {
    latitude: number;
    longitude: number;
}

export interface ComputedRoute {
    provider: 'osrm' | 'google' | 'mapbox';
    distanceMeters: number;
    distanceKm: number;
    durationSeconds: number;
    durationMinutes: number;
    encodedPolyline: string;
    trafficAware: boolean;
    confidence: number;
    alternatives: {
        distanceMeters: number;
        durationSeconds: number;
        encodedPolyline: string;
    }[];
    calculatedAt: string;
}

export interface RoadDistanceMatrix {
    distancesMeters: Array<Array<number | null>>;
    durationsSeconds: Array<Array<number | null>>;
}

interface OsrmRouteResponse {
    code?: string;
    message?: string;
    routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: string;
    }>;
}

interface OsrmTableResponse {
    code?: string;
    message?: string;
    distances?: Array<Array<number | null>>;
    durations?: Array<Array<number | null>>;
}

class RoutingEngine {
    private static instance: RoutingEngine;
    private apiKey: string | undefined;
    private osrmBaseUrl: string | undefined;

    private constructor() {
        this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
        this.osrmBaseUrl = process.env.OSRM_BASE_URL?.trim().replace(/\/+$/, '');
    }

    public static getInstance(): RoutingEngine {
        if (!RoutingEngine.instance) {
            RoutingEngine.instance = new RoutingEngine();
        }
        return RoutingEngine.instance;
    }

    public hasOsrmProvider(): boolean {
        return Boolean(this.osrmBaseUrl);
    }

    /**
     * Computes the fastest motorcycle route between two points.
     */
    public async computeFastestRoute(origin: GeoPoint, destination: GeoPoint): Promise<ComputedRoute> {
        this.validatePoint(origin);
        this.validatePoint(destination);

        if (this.osrmBaseUrl) {
            return this.computeOsrmRoute(origin, destination);
        }
        if (!this.apiKey) {
            throw new Error('ROUTING: Set OSRM_BASE_URL to an OSRM service to enable road routing.');
        }

        try {
            const response = await fetch(
                "https://routes.googleapis.com/directions/v2:computeRoutes",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Goog-Api-Key": this.apiKey,
                        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex"
                    },
                    body: JSON.stringify({
                        origin: {
                            location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } }
                        },
                        destination: {
                            location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } }
                        },
                        travelMode: "TWO_WHEELER",
                        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
                        computeAlternativeRoutes: true,
                        units: "METRIC"
                    })
                }
            );

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`PROVIDER_FAILURE: ${error}`);
            }

            const data = await response.json();
            if (!data.routes || data.routes.length === 0) {
                throw new Error("NO_ROUTE_FOUND: No viable road path identified.");
            }

            return this.normalizeRoute(data.routes[0]);

        } catch (err) {
            console.error("❌ [ROUTING_ENGINE] Route calculation failed:", err);
            throw err;
        }
    }

    public async computeRoadDistanceMatrix(
        sources: GeoPoint[],
        destinations: GeoPoint[]
    ): Promise<RoadDistanceMatrix> {
        if (!this.osrmBaseUrl) {
            throw new Error('ROUTING: Set OSRM_BASE_URL to an OSRM service to enable road-distance ranking.');
        }
        if (sources.length === 0 || destinations.length === 0 || sources.length > 50 || destinations.length > 50) {
            throw new Error('ROUTING: A distance matrix must contain 1–50 origins and 1–50 destinations.');
        }
        [...sources, ...destinations].forEach(point => this.validatePoint(point));

        const coordinates = [...sources, ...destinations]
            .map(point => `${point.longitude},${point.latitude}`)
            .join(';');
        const sourceIndexes = sources.map((_, index) => index).join(';');
        const destinationIndexes = destinations.map((_, index) => index + sources.length).join(';');
        const url = new URL(`${this.osrmBaseUrl}/table/v1/driving/${coordinates}`);
        url.searchParams.set('sources', sourceIndexes);
        url.searchParams.set('destinations', destinationIndexes);
        url.searchParams.set('annotations', 'distance,duration');

        const result = await this.fetchOsrm<OsrmTableResponse>(url);
        if (result.code !== 'Ok' || !result.distances || !result.durations
            || result.distances.length !== sources.length || result.durations.length !== sources.length) {
            throw new Error(`ROUTING: OSRM could not calculate the requested road-distance matrix${result.message ? `: ${result.message}` : '.'}`);
        }
        return {
            distancesMeters: result.distances,
            durationsSeconds: result.durations
        };
    }

    private async computeOsrmRoute(origin: GeoPoint, destination: GeoPoint): Promise<ComputedRoute> {
        const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
        const url = new URL(`${this.osrmBaseUrl}/route/v1/driving/${coordinates}`);
        url.searchParams.set('overview', 'full');
        url.searchParams.set('geometries', 'polyline');
        url.searchParams.set('steps', 'false');
        url.searchParams.set('alternatives', 'true');

        const result = await this.fetchOsrm<OsrmRouteResponse>(url);
        const route = result.routes?.[0];
        if (result.code !== 'Ok' || !route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
            throw new Error(`ROUTING: OSRM could not find a road route${result.message ? `: ${result.message}` : '.'}`);
        }

        return {
            provider: 'osrm',
            distanceMeters: route.distance!,
            distanceKm: route.distance! / 1000,
            durationSeconds: route.duration!,
            durationMinutes: route.duration! / 60,
            encodedPolyline: route.geometry || '',
            trafficAware: false,
            confidence: 75,
            alternatives: (result.routes || []).slice(1).map(alternative => ({
                distanceMeters: alternative.distance || 0,
                durationSeconds: alternative.duration || 0,
                encodedPolyline: alternative.geometry || ''
            })),
            calculatedAt: new Date().toISOString()
        };
    }

    private async fetchOsrm<T>(url: URL): Promise<T> {
        let response: Response;
        try {
            response = await fetch(url, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(10_000),
                cache: 'no-store'
            });
        } catch (error) {
            throw new Error(`ROUTING: OSRM service is unreachable${error instanceof Error ? `: ${error.message}` : '.'}`);
        }
        if (!response.ok) {
            throw new Error(`ROUTING: OSRM returned HTTP ${response.status}.`);
        }
        return response.json() as Promise<T>;
    }

    private validatePoint(point: GeoPoint) {
        if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
            || point.latitude < -90 || point.latitude > 90
            || point.longitude < -180 || point.longitude > 180) {
            throw new Error('ROUTING: Coordinates are outside the valid latitude/longitude range.');
        }
    }

    private normalizeRoute(googleRoute: { distanceMeters: number, duration: string, polyline: { encodedPolyline: string } }): ComputedRoute {
        const distanceMeters = googleRoute.distanceMeters ?? 0;
        const durationSeconds = parseInt(String(googleRoute.duration ?? "0s").replace("s", ""));

        return {
            provider: 'google',
            distanceMeters,
            distanceKm: distanceMeters / 1000,
            durationSeconds,
            durationMinutes: durationSeconds / 60,
            encodedPolyline: googleRoute.polyline?.encodedPolyline ?? "",
            trafficAware: true,
            confidence: 90, // Baseline for TRAFFIC_AWARE_OPTIMAL
            alternatives: [],
            calculatedAt: new Date().toISOString()
        };
    }

    /**
     * Persists a calculated route to the database for performance tracking.
     */
    public async logRoute(orderId: number, riderPhone: string | null, route: ComputedRoute) {
        if (!supabase) return;

        await supabase.from('delivery_routes').insert([{
            order_id: orderId,
            rider_phone: riderPhone,
            distance_meters: route.distanceMeters,
            duration_seconds: route.durationSeconds,
            encoded_polyline: route.encodedPolyline,
            route_confidence: route.confidence,
            planned_at: route.calculatedAt
        }]);
    }
}

export const routingEngine = RoutingEngine.getInstance();
