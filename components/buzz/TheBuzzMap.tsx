'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Flame, MapPin, Users, ChevronRight, Zap, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

interface BuzzPoint {
    id: string;
    title: string;
    venue_name: string;
    latitude: number;
    longitude: number;
    status: string;
    buzz_level: number;
    interest_count: number;
    category: string;
}

interface DBBuzzPoint {
    id: string;
    title: string;
    status: string;
    start_at: string;
    venue_id: string;
    trend_score: number;
    latitude: number;
    longitude: number;
    buzz_venues: { name: string } | null;
    buzz_categories: { label: string } | null;
}

// 🛡️ Fix for Leaflet default icon issues in Next.js
const fixLeafletIcons = () => {
  const iconDefault = L.Icon.Default.prototype as unknown as { _getIconUrl?: string };
  delete iconDefault._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  });
};

const createBuzzIcon = (status: string, level: number) => {
    const isLive = status === 'LIVE';
    const color = isLive ? '#f43f5e' : '#F5A000'; // Rose for Live, Primary for Upcoming
    const size = 32 + (level / 10);

    return L.divIcon({
        className: 'custom-buzz-icon',
        html: `
            <div style="
                background-color: ${color};
                width: ${size}px;
                height: ${size}px;
                border-radius: 50%;
                border: 4px solid white;
                box-shadow: 0 10px 25px -3px ${isLive ? 'rgba(244, 63, 94, 0.4)' : 'rgba(245, 160, 0, 0.3)'};
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                animation: ${isLive ? 'pulse 2s infinite' : 'none'};
            ">
                <svg xmlns="http://www.w3.org/2000/svg" width="${size/2}" height="${size/2}" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.5 2.5 6.5 1 4-1 14.908-6 14.908c-3.313 0-5-4.037-4.5-5.908.5 2.5 2 4.5 3.5 6.5z"/></svg>
            </div>
            <style>
                @keyframes pulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.7); }
                    70% { transform: scale(1.1); box-shadow: 0 0 0 15px rgba(244, 63, 94, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244, 63, 94, 0); }
                }
            </style>
        `,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
    });
};

export default function TheBuzzMap() {
    const [points, setPoints] = useState<BuzzPoint[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fixLeafletIcons();
        async function fetchPoints() {
            if (!supabase) return;
            try {
                // High-fidelity fetch for Map Discovery
                const { data } = await supabase
                    .from('buzz_posts')
                    .select('id, title, status, start_at, venue_id, trend_score, latitude, longitude, buzz_venues(name), buzz_categories(label)')
                    .in('status', ['LIVE', 'TRENDING', 'STARTING_SOON']);

                if (data) {
                    setPoints((data as unknown as DBBuzzPoint[]).map(p => ({
                        id: p.id,
                        title: p.title,
                        venue_name: p.buzz_venues?.name || 'Premium Venue',
                        latitude: Number(p.latitude),
                        longitude: Number(p.longitude),
                        status: p.status,
                        buzz_level: p.trend_score || 0,
                        interest_count: p.trend_score ? Math.round(p.trend_score * 3.5) : 124,
                        category: p.buzz_categories?.label || 'Vibe'
                    })));
                }
            } catch (err) {
                console.error("Map Link Failure:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchPoints();
    }, []);

    const nairobiCenter: [number, number] = [-1.286389, 36.817223];

    return (
        <div className="w-full h-full relative group">
            <MapContainer
                center={nairobiCenter}
                zoom={13}
                style={{ height: '100%', width: '100%', background: '#f8fafc' }}
                zoomControl={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />

                {points.map((point) => (
                    <Marker
                        key={point.id}
                        position={[point.latitude, point.longitude]}
                        icon={createBuzzIcon(point.status, point.buzz_level)}
                    >
                        <Popup className="buzz-leaflet-popup">
                            <div className="p-6 min-w-[280px] text-left space-y-5">
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                                            point.status === 'LIVE' ? "bg-rose-500 text-white animate-pulse" : "bg-primary text-white"
                                        )}>
                                            {point.status === 'LIVE' ? 'LIVE NOW' : 'UPCOMING'}
                                        </span>
                                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{point.category}</span>
                                    </div>
                                    <h3 className="text-xl font-black uppercase tracking-tighter text-foreground leading-tight italic">{point.title}</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <MapPin size={10} className="text-primary" /> {point.venue_name}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50">
                                    <div className="space-y-1">
                                        <p className="text-[8px] font-black text-slate-300 uppercase">Buzz Level</p>
                                        <p className="text-sm font-black text-primary flex items-center gap-1">
                                            <Flame size={14} className="fill-current" /> {point.buzz_level}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[8px] font-black text-slate-300 uppercase">Interest</p>
                                        <p className="text-sm font-black text-foreground flex items-center gap-1">
                                            <Users size={14} className="text-primary" /> {point.interest_count}+
                                        </p>
                                    </div>
                                </div>

                                <Link href={`/buzz/${point.id}`} className="block">
                                    <button className="w-full h-12 rounded-xl bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest hover:bg-primary transition-all flex items-center justify-center gap-2 group/btn">
                                        Enter Discovery Node <ChevronRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
                                    </button>
                                </Link>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            {/* 📍 CUSTOM MAP UI OVERLAYS */}
            <div className="absolute top-10 left-10 z-[1000] pointer-events-none">
                <div className="bg-white/90 backdrop-blur-xl p-6 rounded-[2.5rem] border border-slate-100 shadow-2xl pointer-events-auto animate-in slide-in-from-left-6 duration-1000">
                    <div className="flex items-center gap-3 mb-4">
                        <Zap size={16} className="text-primary animate-pulse" fill="currentColor" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary leading-none">Map Signal Established</span>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-black text-foreground uppercase tracking-tight">City Discovery Engine</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Nairobi Sector 01</p>
                    </div>
                </div>
            </div>

            {loading && (
                <div className="absolute inset-0 z-[2000] bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin text-primary" size={32} />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 animate-pulse">Syncing Buzz Nodes...</p>
                </div>
            )}
        </div>
    );
}
