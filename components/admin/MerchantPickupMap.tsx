'use client';

import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCartoVoyagerTileUrl } from '@/lib/cartoMaps';

type Props = {
  position: [number, number] | null;
  onSelect: (latitude: number, longitude: number) => void;
};

const merchantPin = L.divIcon({
  className: '',
  html: '<div style="width:28px;height:28px;border:3px solid white;border-radius:50% 50% 50% 0;background:#e11d48;transform:rotate(-45deg);box-shadow:0 2px 8px #0006"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

function MapClick({ onSelect }: Pick<Props, 'onSelect'>) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng);
    }
  });
  return null;
}

function KeepPinInView({ position }: Pick<Props, 'position'>) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, Math.max(map.getZoom(), 15));
  }, [map, position]);
  return null;
}

export default function MerchantPickupMap({ position, onSelect }: Props) {
  const center: [number, number] = position || [-0.5, 37.5];

  return (
    <div className="relative z-0 h-[320px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-[390px]">
      <MapContainer
        center={center}
        zoom={position ? 15 : 6}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={getCartoVoyagerTileUrl()}
        />
        {position && (
          <Marker
            position={position}
            icon={merchantPin}
            draggable
            eventHandlers={{
              dragend(event) {
                const marker = event.target as L.Marker;
                const point = marker.getLatLng();
                onSelect(point.lat, point.lng);
              }
            }}
          />
        )}
        <MapClick onSelect={onSelect} />
        <KeepPinInView position={position} />
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[500] rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow">
        {position ? 'Drag the pin or tap the exact shop entrance on the map to adjust it.' : 'Search for the shop first, then tap its exact entrance to place a pin.'}
      </div>
    </div>
  );
}
