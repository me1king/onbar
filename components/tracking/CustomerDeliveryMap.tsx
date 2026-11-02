'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCartoVoyagerTileUrl } from '@/lib/cartoMaps';
import { decodePolyline } from '@/lib/utils/polyline';

export interface DeliveryMapPoint {
  latitude: number;
  longitude: number;
}

function createPointIcon(label: string, color: string) {
  const isRider = label === 'R';
  return L.divIcon({
    className: 'customer-delivery-map-marker',
    html: isRider
      ? `<div style="position:relative;width:38px;height:38px;border:3px solid white;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:white;font:900 11px sans-serif;box-shadow:0 4px 12px #0f172a66"><span class="customer-rider-pulse"></span>R</div>`
      : `<div style="width:34px;height:34px;border:3px solid white;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:white;font:900 11px sans-serif;box-shadow:0 4px 12px #0f172a55">${label}</div>`,
    iconSize: isRider ? [38, 38] : [34, 34],
    iconAnchor: isRider ? [19, 19] : [17, 17]
  });
}

const riderIcon = createPointIcon('R', '#d97706');
const deliveryIcon = createPointIcon('Y', '#2563eb');

function createDirectionIcon(bearing: number) {
  return L.divIcon({
    className: 'customer-delivery-route-arrow',
    html: `<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;transform:rotate(${bearing}deg);color:#b45309;font-size:19px;font-weight:900;text-shadow:0 0 3px white,0 0 5px white">▲</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

function routeBearing(from: [number, number], to: [number, number]) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitude1 = radians(from[0]);
  const latitude2 = radians(to[0]);
  const longitudeDelta = radians(to[1] - from[1]);
  const y = Math.sin(longitudeDelta) * Math.cos(latitude2);
  const x = Math.cos(latitude1) * Math.sin(latitude2)
    - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function FitDeliveryBounds({ points, destinationKey }: { points: DeliveryMapPoint[]; destinationKey: string }) {
  const map = useMap();
  const lastDestinationKey = useRef<string | null>(null);

  useEffect(() => {
    map.invalidateSize();
  }, [map]);

  useEffect(() => {
    if (lastDestinationKey.current === destinationKey) return;
    lastDestinationKey.current = destinationKey;
    if (points.length > 1) {
      map.fitBounds(points.map(point => [point.latitude, point.longitude] as [number, number]), {
        padding: [40, 40],
        maxZoom: 15
      });
    } else if (points[0]) {
      map.setView([points[0].latitude, points[0].longitude], 14);
    }
  }, [destinationKey, map, points]);
  return null;
}

export default function CustomerDeliveryMap({
  rider,
  destination,
  roadRoute
}: {
  rider: DeliveryMapPoint;
  destination: DeliveryMapPoint | null;
  roadRoute?: { encoded_polyline: string } | null;
}) {
  const riderLatitude = rider.latitude;
  const riderLongitude = rider.longitude;
  const destinationLatitude = destination?.latitude;
  const destinationLongitude = destination?.longitude;
  const routePoints = useMemo(
    () => roadRoute?.encoded_polyline ? decodePolyline(roadRoute.encoded_polyline) : [],
    [roadRoute?.encoded_polyline]
  );
  const directionMarkers = useMemo(() => {
    const directionalPoints: [number, number][] = routePoints.length > 1
      ? routePoints
      : destination
        ? [[riderLatitude, riderLongitude], [destination.latitude, destination.longitude]]
        : [];
    if (directionalPoints.length < 2) return [];
    const fractions = directionalPoints.length > 2 ? [0.25, 0.5, 0.75] : [0.5];
    const indexes = [...new Set(fractions.map(fraction =>
      Math.min(directionalPoints.length - 2, Math.floor(fraction * (directionalPoints.length - 1)))
    ))];
    return indexes.map(index => {
      const position = directionalPoints[index];
      return {
        position,
        icon: createDirectionIcon(routeBearing(position, directionalPoints[index + 1]))
      };
    });
  }, [destination, riderLatitude, riderLongitude, routePoints]);
  const points = useMemo(
    () => destinationLatitude !== undefined && destinationLongitude !== undefined
      ? [
          { latitude: riderLatitude, longitude: riderLongitude },
          { latitude: destinationLatitude, longitude: destinationLongitude },
          ...routePoints.map(([latitude, longitude]) => ({ latitude, longitude }))
        ]
      : [{ latitude: riderLatitude, longitude: riderLongitude }],
    [destinationLatitude, destinationLongitude, riderLatitude, riderLongitude, routePoints]
  );
  const destinationKey = destinationLatitude !== undefined && destinationLongitude !== undefined
    ? `${destinationLatitude}:${destinationLongitude}`
    : 'rider-only';
  return (
    <div className="h-72 overflow-hidden rounded-2xl border border-white/10">
      <style jsx global>{`
        .customer-delivery-map-marker {
          transition: transform 1.2s ease-out;
        }
        .customer-rider-pulse {
          position: absolute;
          inset: -6px;
          border: 2px solid rgba(217, 119, 6, 0.75);
          border-radius: 50%;
          animation: customer-rider-pulse 1.8s ease-out infinite;
          pointer-events: none;
        }
        @keyframes customer-rider-pulse {
          0% { transform: scale(0.75); opacity: 0.9; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        .customer-delivery-route-flow {
          animation: customer-delivery-route-flow 1.3s linear infinite;
        }
        @keyframes customer-delivery-route-flow {
          to { stroke-dashoffset: -30; }
        }
      `}</style>
      <MapContainer
        center={[rider.latitude, rider.longitude]}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <FitDeliveryBounds points={points} destinationKey={destinationKey} />
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
            {routePoints.length > 1 ? (
              <>
                <Polyline
                  positions={routePoints}
                  pathOptions={{ color: '#ffffff', weight: 10, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
                />
                <Polyline
                  positions={routePoints}
                  pathOptions={{
                    color: '#f59e0b',
                    weight: 6,
                    opacity: 0.95,
                    lineCap: 'round',
                    lineJoin: 'round',
                    dashArray: '14 16',
                    className: 'customer-delivery-route-flow'
                  }}
                />
                {directionMarkers.map((marker, index) => (
                  <Marker key={`route-direction-${index}`} position={marker.position} icon={marker.icon} />
                ))}
              </>
            ) : (
              <Polyline
                positions={[
                  [rider.latitude, rider.longitude],
                  [destination.latitude, destination.longitude]
                ]}
                pathOptions={{
                  color: '#f59e0b',
                  dashArray: '10 12',
                  weight: 4,
                  className: 'customer-delivery-route-flow'
                }}
              />
            )}
            {routePoints.length < 2 && directionMarkers.map((marker, index) => (
              <Marker key={`direct-route-direction-${index}`} position={marker.position} icon={marker.icon} />
            ))}
          </>
        )}
      </MapContainer>
    </div>
  );
}
