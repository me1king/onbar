'use client';

import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';

interface CustomerLocation {
    latitude: number | null;
    longitude: number | null;
}

interface CustomerLocationsMapProps {
    locations: CustomerLocation[];
    loading: boolean;
    error: string | null;
}

function FitMapToLocations({ locations }: { locations: Array<[number, number]> }) {
    const map = useMap();

    useEffect(() => {
        if (locations.length === 1) {
            map.setView(locations[0], 11);
            return;
        }

        if (locations.length > 1) {
            map.fitBounds(locations, { padding: [32, 32], maxZoom: 11 });
        }
    }, [locations, map]);

    return null;
}

export default function CustomerLocationsMap({ locations, loading, error }: CustomerLocationsMapProps) {
    const clusters = new Map<string, { latitude: number; longitude: number; count: number }>();
    let validLocationCount = 0;

    for (const location of locations) {
        if (location.latitude === null || location.longitude === null) continue;
        const latitude = Number(location.latitude);
        const longitude = Number(location.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
            || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;

        validLocationCount += 1;
        const roundedLatitude = Number(latitude.toFixed(2));
        const roundedLongitude = Number(longitude.toFixed(2));
        const key = `${roundedLatitude},${roundedLongitude}`;
        const cluster = clusters.get(key);
        if (cluster) cluster.count += 1;
        else clusters.set(key, { latitude: roundedLatitude, longitude: roundedLongitude, count: 1 });
    }

    const demandClusters = Array.from(clusters.values());
    const clusterCoordinates = demandClusters.map(
        (cluster): [number, number] => [cluster.latitude, cluster.longitude]
    );
    const center: [number, number] = demandClusters.length
        ? [
            demandClusters.reduce((sum, cluster) => sum + cluster.latitude, 0) / demandClusters.length,
            demandClusters.reduce((sum, cluster) => sum + cluster.longitude, 0) / demandClusters.length
        ]
        : [-1.286389, 36.817223];

    return (
        <section className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-foreground">Shared customer delivery areas</h2>
                <p className="text-xs text-slate-500">Approximate map areas from customers who chose to save a delivery pin. Customer names and contact details are not shown.</p>
            </div>
            {loading ? (
                <div className="flex h-72 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">Loading saved locations…</div>
            ) : error ? (
                <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
                    Some customer location data could not be loaded: {error}
                </div>
            ) : null}
            {!loading && demandClusters.length > 0 && (
                <>
                    <p className="text-sm font-semibold text-foreground">
                        {validLocationCount} customer{validLocationCount === 1 ? '' : 's'} shared a delivery pin across {demandClusters.length} approximate area{demandClusters.length === 1 ? '' : 's'}.
                    </p>
                    <div className="h-80 overflow-hidden rounded-xl">
                        <MapContainer
                            center={center}
                            zoom={demandClusters.length === 1 ? 11 : 5}
                            style={{ height: '100%', width: '100%' }}
                            scrollWheelZoom={false}
                        >
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            <FitMapToLocations locations={clusterCoordinates} />
                            {demandClusters.map((cluster) => (
                                <CircleMarker
                                    key={`${cluster.latitude},${cluster.longitude}`}
                                    center={[cluster.latitude, cluster.longitude]}
                                    radius={Math.min(24, 8 + Math.log2(cluster.count) * 4)}
                                    pathOptions={{ color: '#c2410c', fillColor: '#f97316', fillOpacity: 0.55, weight: 2 }}
                                >
                                    <Popup>{cluster.count} customer{cluster.count === 1 ? '' : 's'} in this approximate area</Popup>
                                </CircleMarker>
                            ))}
                        </MapContainer>
                    </div>
                </>
            )}
            {!loading && demandClusters.length === 0 && (
                <div className="flex h-40 items-center justify-center rounded-xl bg-slate-50 px-5 text-center text-sm text-slate-500">
                    No customer delivery pins are available yet. Customers can share one by setting and confirming a delivery location at checkout or in their profile.
                </div>
            )}
            <p className="text-[11px] text-slate-400">Pins are grouped into approximate areas (about 1 km); the map does not display customer identities or live location.</p>
        </section>
    );
}
