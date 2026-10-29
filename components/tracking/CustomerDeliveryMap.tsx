'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCartoVoyagerTileUrl } from '@/lib/cartoMaps';

export interface DeliveryMapPoint {
  latitude: number;
  longitude: number;
}

function createPointIcon(label: string, color: string) {
  return L.divIcon({
    className: 'customer-delivery-map-marker',
    html: `<div style="width:34px;height:34px;border:3px solid white;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:white;font:900 11px sans-serif;box-shadow:0 4px 12px #0f172a55">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

const riderIcon = createPointIcon('R', '#d97706');
const deliveryIcon = createPointIcon('Y', '#2563eb');

function FitDeliveryBounds({ points }: { points: DeliveryMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (points.length > 1) {
      map.fitBounds(points.map(point => [point.latitude, point.longitude] as [number, number]), {
        padding: [40, 40],
        maxZoom: 15
      });
    } else if (points[0]) {
      map.setView([points[0].latitude, points[0].longitude], 14);
    }
  }, [map, points]);
  return null;
}

export default function CustomerDeliveryMap({
  rider,
  destination
}: {
  rider: DeliveryMapPoint;
  destination: DeliveryMapPoint | null;
}) {
  const riderLatitude = rider.latitude;
  const riderLongitude = rider.longitude;
  const destinationLatitude = destination?.latitude;
  const destinationLongitude = destination?.longitude;
  const points = useMemo(
    () => destinationLatitude !== undefined && destinationLongitude !== undefined
      ? [
          { latitude: riderLatitude, longitude: riderLongitude },
          { latitude: destinationLatitude, longitude: destinationLongitude }
        ]
      : [{ latitude: riderLatitude, longitude: riderLongitude }],
    [destinationLatitude, destinationLongitude, riderLatitude, riderLongitude]
  );
  return (
    <div className="h-72 overflow-hidden rounded-2xl border border-white/10">
      <MapContainer
        center={[rider.latitude, rider.longitude]}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <FitDeliveryBounds points={points} />
        <TileLayer
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url={getCartoVoyagerTileUrl()}
        />
        <Marker position={[rider.latitude, rider.longitude]} icon={riderIcon}>
          <Popup>Rider&apos;s last reported location</Popup>
        </Marker>
        {destination && (
          <>
            <Marker position={[destination.latitude, destination.longitude]} icon={deliveryIcon}>
              <Popup>Your delivery address</Popup>
            </Marker>
            <Polyline
              positions={[
                [rider.latitude, rider.longitude],
                [destination.latitude, destination.longitude]
              ]}
              pathOptions={{ color: '#f59e0b', dashArray: '7 8', weight: 3 }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}
