'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export default function CountdownTimer({ targetDate }: { targetDate: string }) {
    const [timeLeft, setTimeLeft] = useState<{ days: string, hours: string, mins: string, secs: string } | null>(null);
    const [status, setStatus] = useState<'loading' | 'active' | 'ended' | 'unavailable'>('loading');

    useEffect(() => {
        if (!targetDate || !Number.isFinite(new Date(targetDate).getTime())) {
            setTimeLeft(null);
            setStatus('unavailable');
            return;
        }

        const calculateTime = () => {
            const difference = new Date(targetDate).getTime() - Date.now();
            if (difference > 0) {
                const totalSeconds = Math.floor(difference / 1000);
                const days = Math.floor(totalSeconds / 86_400);
                const hours = Math.floor((totalSeconds % 86_400) / 3_600);
                const mins = Math.floor((totalSeconds % 3_600) / 60);
                const secs = totalSeconds % 60;

                setTimeLeft({
                    days: days.toString().padStart(2, '0'),
                    hours: hours.toString().padStart(2, '0'),
                    mins: mins.toString().padStart(2, '0'),
                    secs: secs.toString().padStart(2, '0')
                });
                setStatus('active');
            } else {
                setTimeLeft(null);
                setStatus('ended');
            }
        };

        const timer = setInterval(calculateTime, 1000);
        calculateTime();

        return () => clearInterval(timer);
    }, [targetDate]);

    if (status === 'loading') return null;

    return (
        <div className="inline-flex items-center gap-4 px-6 py-3 bg-primary text-white rounded-2xl shadow-xl shadow-primary/20 animate-in slide-in-from-top-4 duration-700">
            <div className="flex items-center gap-2 pr-4 border-r border-white/20">
                <Clock className={`h-4 w-4 ${status === 'active' ? 'animate-pulse' : ''}`} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                    {status === 'active' ? 'Sale ends in' : status === 'ended' ? 'Sale ended' : 'Sale end time unavailable'}
                </span>
            </div>
            {timeLeft && (
                <div className="flex gap-4 font-mono font-black text-lg tracking-tighter">
                    {[
                        { value: timeLeft.days, label: 'Days' },
                        { value: timeLeft.hours, label: 'Hrs' },
                        { value: timeLeft.mins, label: 'Min' },
                        { value: timeLeft.secs, label: 'Sec' }
                    ].map((part, index) => (
                        <div key={part.label} className="flex items-center gap-4">
                            {index > 0 && <span className="opacity-40">:</span>}
                            <div className="flex flex-col items-center">
                                <span>{part.value}</span>
                                <span className="-mt-1 text-[7px] uppercase tracking-widest opacity-60">{part.label}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
