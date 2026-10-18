'use client';

import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { getCartoVoyagerTileUrl } from '@/lib/cartoMaps';
import type { WaitlistDemandArea } from '@/lib/waitlistDemand';

function FitDemandAreas({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [32, 32], maxZoom: 12 });
    else if (points.length === 1) map.setView(points[0], 11);
  }, [map, points]);
  return null;
}

function demandColor(area: WaitlistDemandArea, maxSignups: number) {
  if (area.referralTurnover > 0) return '#059669';
  if (area.serviceableSignups > 0) return '#f59e0b';
  if (area.signups >= maxSignups * 0.6) return '#e11d48';
  return '#2563eb';
}

function DemandCurve({ areas }: { areas: WaitlistDemandArea[] }) {
  const ranked = areas.slice(0, 12);
  if (!ranked.length) return null;
  const width = 720;
  const height = 190;
  const pad = { top: 16, right: 20, bottom: 30, left: 34 };
  const maxValue = Math.max(1, ...ranked.map(area => area.signups));
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const points = ranked.map((area, index) => ({
    x: pad.left + (ranked.length === 1 ? innerWidth / 2 : index * innerWidth / (ranked.length - 1)),
    y: pad.top + innerHeight - area.signups / maxValue * innerHeight,
    area
  }));
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-900">Signup demand curve</h3>
          <p className="mt-1 text-[10px] text-slate-500">Ranked neighbourhoods · each point shows signup volume</p>
        </div>
        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-rose-700">Top {ranked.length} demand areas</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Waitlist signup demand curve by area" className="h-48 min-w-[600px] w-full">
          {[0, 0.5, 1].map(ratio => {
            const y = pad.top + innerHeight * ratio;
            return <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" /><text x={pad.left - 8} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10">{Math.round(maxValue * (1 - ratio))}</text></g>;
          })}
          <path d={path} fill="none" stroke="#e11d48" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => (
            <g key={point.area.id}>
              <circle cx={point.x} cy={point.y} r="6" fill={demandColor(point.area, maxValue)} stroke="white" strokeWidth="2" />
              <text x={point.x} y={height - 8} textAnchor="middle" fill="#475569" fontSize="9">{index + 1}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-500">
        {ranked.slice(0, 6).map((area, index) => <span key={area.id}>{index + 1}. {area.area || area.city || area.county}</span>)}
      </div>
    </div>
  );
}

export default function WaitlistDemandMap({ areas }: { areas: WaitlistDemandArea[] }) {
  const mapped = areas.filter((area): area is WaitlistDemandArea & { latitude: number; longitude: number } =>
    area.latitude !== null && area.longitude !== null
  );
  const unmapped = areas.filter(area => area.latitude === null || area.longitude === null);
  const locations: Array<[number, number]> = mapped.map(area => [area.latitude, area.longitude]);
  const center: [number, number] = locations[0] || [-1.2864, 36.8172];
  const maxSignups = Math.max(1, ...areas.map(area => area.signups));
  const totalSignups = areas.reduce((total, area) => total + area.signups, 0);
  const referralSignups = areas.reduce((total, area) => total + area.referralSignups, 0);
  const turnover = areas.reduce((total, area) => total + area.referralTurnover, 0);
  const points = areas.reduce((total, area) => total + area.pointsCredited, 0);
  const sortedAreas = [...areas].sort((left, right) => right.signups - left.signups || left.area.localeCompare(right.area));

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-6" aria-label="Waitlist demand map">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Geographic demand intelligence</p>
          <h2 className="mt-1 text-xl font-black uppercase tracking-tight text-slate-950">Waitlist demand map</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Area-level signup density with service coverage and referral sales context. Pins use approximate neighbourhood or city centres from signup areas; no exact member coordinates are exposed.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[9px] font-bold uppercase tracking-wide">
          <span className="rounded-full bg-blue-100 px-2.5 py-1.5 text-blue-800">● Signups</span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1.5 text-amber-800">● In service area</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1.5 text-emerald-800">● Referral turnover</span>
          <span className="rounded-full bg-rose-100 px-2.5 py-1.5 text-rose-800">● High demand</span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Mapped areas', value: mapped.length },
          { label: 'Area signups', value: totalSignups },
          { label: 'Referred signups', value: referralSignups },
          { label: 'Referral turnover', value: turnover, isMoney: true }
        ].map(metric => (
          <div key={metric.label} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{metric.label}</p>
            <p className="mt-1 text-lg font-black text-slate-950">{'isMoney' in metric && metric.isMoney ? `KES ${metric.value.toLocaleString('en-KE', { maximumFractionDigits: 0 })}` : metric.value.toLocaleString('en-KE')}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="min-h-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {mapped.length ? (
            <MapContainer center={center} zoom={6} style={{ height: 420, width: '100%' }} scrollWheelZoom={false}>
              <FitDemandAreas points={locations} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url={getCartoVoyagerTileUrl()}
              />
              {mapped.map(area => {
                const color = demandColor(area, maxSignups);
                const search = [area.area, area.city, area.county, area.country].filter(Boolean).join(', ');
                return (
                  <CircleMarker
                    key={area.id}
                    center={[area.latitude, area.longitude]}
                    radius={Math.min(30, 7 + Math.sqrt(area.signups) * 2)}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.65, weight: 2 }}
                  >
                    <Popup>
                      <div className="min-w-52 space-y-1.5 text-sm">
                        <p className="font-black">{area.area || area.city || area.county}</p>
                        <p className="text-xs text-slate-600">{[area.city, area.county, area.country].filter(Boolean).join(' · ')}</p>
                        <p><b>{area.signups.toLocaleString('en-KE')}</b> waitlist signups</p>
                        <p><b>{area.serviceableSignups.toLocaleString('en-KE')}</b> marked in service area</p>
                        <p><b>{area.referralSignups.toLocaleString('en-KE')}</b> referred members</p>
                        <p><b>KES {area.referralTurnover.toLocaleString('en-KE')}</b> referred delivered sales</p>
                        <p><b>{area.pointsCredited.toLocaleString('en-KE')}</b> referral points credited</p>
                        <p className="text-[10px] font-semibold text-slate-500">{area.precision === 'neighborhood' ? 'Approximate neighbourhood centre' : 'Approximate city/county centre'}</p>
                        <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(search)}`} target="_blank" rel="noopener noreferrer" className="inline-block pt-1 font-bold text-blue-700 underline">Open area map</a>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          ) : (
            <div className="flex h-[420px] items-center justify-center p-6 text-center text-sm text-slate-500">No locations can be pinned yet. Add a city or area to member signups to build the demand map.</div>
          )}
        </div>

        <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-slate-200 bg-white">
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-900">All reported areas</h3>
            <p className="mt-1 text-[10px] text-slate-500">{areas.length} geographic areas · sorted by signups</p>
          </div>
          <ol className="divide-y divide-slate-100">
            {sortedAreas.map((area, index) => (
              <li key={area.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-black text-slate-600">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-slate-900">{area.area || area.city || area.county || 'Area not specified'}</p>
                  <p className="truncate text-[10px] text-slate-500">{[area.city, area.county, area.country].filter(Boolean).join(' · ') || 'Location details unavailable'}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(2, area.signups / maxSignups * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-[9px] text-slate-500">{area.signups} signups · {area.serviceableSignups} in coverage · {area.referralSignups} referrals</p>
                  <p className="text-[9px] text-slate-500">{`KES ${area.referralTurnover.toLocaleString('en-KE')} referred sales · ${area.pointsCredited} points`}</p>
                  {area.precision === 'unmapped' && (
                    <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent([area.area, area.city, area.county, area.country].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[9px] font-bold text-blue-700 underline">Find approximate map location</a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <DemandCurve areas={sortedAreas} />
      <p className="text-[10px] leading-4 text-slate-500">
        Showing {mapped.length} mapped areas and {unmapped.length} areas without a reliable built-in map match. {points.toLocaleString('en-KE')} referral points credited across mapped and unmapped areas. Bubble size shows signup count; turnover only includes delivered/completed member orders.
      </p>
    </section>
  );
}
