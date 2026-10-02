'use client';

import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';

interface CustomerLocation {
    latitude: number | null;
    longitude: number | null;
}

interface CustomerLocationsMapProps {
    locations: CustomerLocation[];
    loading: boolean;
    error: string | null;
}

export default function CustomerLocationsMap({ locations, loading, error }: CustomerLocationsMapProps) {
    const clusters = new Map<string, { latitude: number; longitude: number; count: number }>();

    for (const location of locations) {
        if (location.latitude === null || location.longitude === null) continue;
        const latitude = Number(location.latitude);
        const longitude = Number(location.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
            || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;

        const roundedLatitude = Number(latitude.toFixed(2));
        const roundedLongitude = Number(longitude.toFixed(2));
        const key = `${roundedLatitude},${roundedLongitude}`;
        const cluster = clusters.get(key);
        if (cluster) cluster.count += 1;
        else clusters.set(key, { latitude: roundedLatitude, longitude: roundedLongitude, count: 1 });
    }

    const demandClusters = Array.from(clusters.values());
    const center: [number, number] = demandClusters.length
        ? [
            demandClusters.reduce((sum, cluster) => sum + cluster.latitude, 0) / demandClusters.length,
            demandClusters.reduce((sum, cluster) => sum + cluster.longitude, 0) / demandClusters.length
        ]
        : [-1.286389, 36.817223];

    return (
        <section className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-foreground">Customer location clusters</h2>
                <p className="text-xs text-slate-500">Approximate, grouped locations from customers who saved a delivery location. No names or contact details are shown.</p>
            </div>
            {loading ? (
                <div className="flex h-72 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">Loading saved locations…</div>
            ) : error ? (
                <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">Customer locations could not be loaded: {error}</div>
            ) : demandClusters.length === 0 ? (
                <div className="flex h-40 items-center justify-center rounded-xl bg-slate-50 text-center text-sm text-slate-500">
                    No saved customer locations are available to map yet.
                </div>
            ) : (
                <div className="h-80 overflow-hidden rounded-xl">
                    <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
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
            )}
            <p className="text-[11px] text-slate-400">Markers are rounded to roughly 1 km and counts are grouped before display.</p>
        </section>
    );
}
