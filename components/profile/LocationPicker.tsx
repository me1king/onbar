'use client';

import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, CheckCircle2, Loader2, X } from 'lucide-react';
import { getCartoVoyagerTileUrl } from '@/lib/cartoMaps';

// 🛡️ Fix for Leaflet default icon issues in Next.js
const fixLeafletIcons = () => {
  // @ts-expect-error - Leaflet internal property not in types
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  });
};

interface LocationPickerProps {
    initialLat?: number;
    initialLng?: number;
    autoDetect?: boolean;
    onConfirm: (lat: number, lng: number) => void;
    onClose: () => void;
}

function MapEvents({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) {
    useMapEvents({
        click(e) {
            onLocationSelect(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

function ChangeView({ center }: { center: [number, number] }) {
    const map = useMap();
    map.setView(center, map.getZoom());
    return null;
}

export default function LocationPicker({ initialLat, initialLng, autoDetect = false, onConfirm, onClose }: LocationPickerProps) {
    const [pos, setPos] = useState<[number, number]>(
        initialLat != null && initialLng != null ? [initialLat, initialLng] : [-1.286389, 36.817223]
    );
    const [detecting, setDetecting] = useState(false);
    const [locationMessage, setLocationMessage] = useState<string | null>(null);

    useEffect(() => {
        fixLeafletIcons();
        if (initialLat != null && initialLng != null) return;
        try {
            const saved = localStorage.getItem('ob_delivery_location');
            if (saved) {
                const parsed = JSON.parse(saved) as { lat?: number; lng?: number };
                if (
                    typeof parsed.lat === 'number' && Number.isFinite(parsed.lat) && parsed.lat >= -90 && parsed.lat <= 90 &&
                    typeof parsed.lng === 'number' && Number.isFinite(parsed.lng) && parsed.lng >= -180 && parsed.lng <= 180
                ) {
                    setPos([parsed.lat, parsed.lng]);
                }
            }
        } catch (error) {
            console.warn('Could not restore saved delivery pin:', error);
        }
    }, [initialLat, initialLng]);

    const handleDetectLocation = () => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
        }

        try {
            if (localStorage.getItem('ob_location_permission_denied') === 'true') {
                setLocationMessage('Location access was previously declined. You can still place the pin manually on the map or update location access in your browser settings.');
                return;
            }
        } catch (error) {
            console.warn('Could not read saved location permission choice:', error);
        }

        setDetecting(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setPos([latitude, longitude]);
                try {
                    localStorage.setItem('ob_delivery_location', JSON.stringify({ lat: latitude, lng: longitude }));
                } catch (error) {
                    console.warn('Could not save delivery pin on this device:', error);
                }
                setLocationMessage('Location found. It is used to check free-delivery coverage and attach a delivery pin to this order.');
                setDetecting(false);
            },
            (error) => {
                console.error(error);
                if (error.code === error.PERMISSION_DENIED) {
                    try {
                        localStorage.setItem('ob_location_permission_denied', 'true');
                    } catch (storageError) {
                        console.warn('Could not save location permission choice:', storageError);
                    }
                    setLocationMessage('Location access was declined. You can place the pin manually or update access in your browser settings.');
                } else {
                    setLocationMessage('Your current location could not be detected. You can place the pin manually on the map.');
                }
                setDetecting(false);
            }
        );
    };

    useEffect(() => {
        if (autoDetect && initialLat == null && initialLng == null) {
            handleDetectLocation();
        }
        // The picker should request location once when opened from the delivery-pin button.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoDetect]);

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-white/70 backdrop-blur-xl p-0 sm:p-10 animate-in fade-in duration-300">
            <div className="max-w-5xl w-full h-[100dvh] sm:h-[80vh] bg-white rounded-none sm:rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col sm:flex-row relative border-none animate-in zoom-in-95 duration-500">

                {/* 🗺️ THE MAP */}
                <div className="min-h-[38dvh] flex-1 relative bg-slate-100 sm:min-h-0">
                    <MapContainer
                        center={pos}
                        zoom={15}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl={false}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                            url={getCartoVoyagerTileUrl()}
                        />
                        <Marker position={pos} />
                        <MapEvents onLocationSelect={(lat, lng) => setPos([lat, lng])} />
                        <ChangeView center={pos} />
                    </MapContainer>

                    {/* Map Overlays */}
                    <div className="absolute top-8 left-8 z-[1000] flex flex-col gap-4">
                        <Button
                            onClick={handleDetectLocation}
                            disabled={detecting}
                            aria-label="Use my current location"
                            className="h-14 w-14 rounded-2xl bg-white text-foreground shadow-2xl hover:bg-slate-50 border-none transition-all active:scale-95"
                        >
                            {detecting ? <Loader2 className="h-6 w-6 animate-spin" /> : <Navigation className="h-6 w-6" />}
                        </Button>
                    </div>

                    <button
                        onClick={onClose}
                        className="absolute top-8 right-8 z-[1000] h-12 w-12 rounded-full bg-white/90 backdrop-blur shadow-xl flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all border border-slate-100"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* 📋 CONTROL PANEL */}
                <div className="max-h-[62dvh] w-full overflow-y-auto bg-white p-4 sm:max-h-none sm:w-[350px] sm:p-10 flex flex-col justify-between border-t sm:border-t-0 sm:border-l border-slate-100 text-left">
                    <div className="space-y-4 sm:space-y-8">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><MapPin className="h-4 w-4 sm:h-5 sm:w-5" /></div>
                                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tighter text-foreground leading-none">Drop Point</h2>
                            </div>
                            <p className="text-slate-600 text-xs leading-relaxed mt-2">
                                We only request device location when you tap the button. If you confirm a pin, it is saved to your profile for delivery planning and shown to authorized store admins only as an approximate grouped area. You can also place the pin manually.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-1 gap-4 pt-4 sm:pt-6 border-t border-slate-50">
                            <div className="space-y-1">
                                <p className="text-[7px] sm:text-[8px] font-black uppercase text-slate-400 tracking-[0.2em]">Latitude</p>
                                <p className="text-xs sm:text-sm font-mono font-bold text-foreground">{pos[0].toFixed(6)}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[7px] sm:text-[8px] font-black uppercase text-slate-400 tracking-[0.2em]">Longitude</p>
                                <p className="text-xs sm:text-sm font-mono font-bold text-foreground">{pos[1].toFixed(6)}</p>
                            </div>
                        </div>

                        <div className="p-4 sm:p-5 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-3 sm:gap-4">
                            <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500 shrink-0 mt-0.5" />
                            <p className="text-[8px] sm:text-[10px] font-medium text-emerald-700 leading-relaxed italic">
                                Confirming saves this delivery pin to your account. Authorized admins see only its approximate area on the customer map, not your identity or live location.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2 sm:space-y-3 pt-6 sm:pt-10">
                        {locationMessage && <p role="status" className="rounded-xl bg-secondary p-3 text-xs text-foreground">{locationMessage}</p>}
                        <Button
                            onClick={() => onConfirm(pos[0], pos[1])}
                            className="w-full h-14 sm:h-16 rounded-xl sm:rounded-2xl bg-primary text-white font-black uppercase text-[10px] sm:text-xs tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                        >
                            Confirm Location
                        </Button>
                        <Button
                            onClick={onClose}
                            variant="ghost"
                            className="w-full h-10 sm:h-12 rounded-lg sm:rounded-xl text-slate-400 font-black uppercase text-[8px] sm:text-[10px] tracking-widest"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
