'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Database, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AuthenticityProps {
    productName?: string;
    batchNo?: string;
    origin?: string;
    abv?: string;
}

export default function AuthenticitySentinel({
    productName,
    batchNo,
    origin,
    abv
}: AuthenticityProps) {
    const router = useRouter();
    const [passportCode, setPassportCode] = useState('');
    const [codeError, setCodeError] = useState('');

    const checkPassport = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const submittedCode = passportCode.trim();
        const routeMatch = submittedCode.match(/\/verify\/([^/?#]+)/i);
        const code = routeMatch?.[1] || submittedCode;
        if (!code || code.length < 4 || code.length > 100) {
            setCodeError('Enter the bottle passport code or scan its verification QR code.');
            return;
        }
        setCodeError('');
        router.push(`/verify/${encodeURIComponent(code)}`);
    };

    return (
        <Card className="space-y-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-left shadow-sm sm:rounded-[3rem] sm:p-8 relative overflow-hidden">
            <div className="relative z-10 flex items-start gap-5">
                <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center text-amber-700 shadow-sm shrink-0">
                    <ShieldCheck size={28} />
                </div>
                <div className="space-y-2">
                    <h3 className="text-lg font-black uppercase tracking-tight text-amber-950">Check bottle authenticity</h3>
                    <p className="text-xs font-medium leading-relaxed text-amber-900">
                        Enter the unique passport code printed beside the bottle&apos;s verification QR code. We&apos;ll check it against the Online Bar registry. Product catalog details alone cannot verify a specific bottle.
                    </p>
                </div>
            </div>

            <form onSubmit={checkPassport} className="relative z-10 space-y-2">
                <label htmlFor="bottle-passport-code" className="text-[9px] font-black uppercase tracking-widest text-amber-800">
                    Bottle passport code
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                        id="bottle-passport-code"
                        value={passportCode}
                        onChange={event => {
                            setPassportCode(event.target.value);
                            if (codeError) setCodeError('');
                        }}
                        placeholder="e.g. OB-KE-XXXXXXXX"
                        autoComplete="off"
                        maxLength={200}
                        className="h-12 min-w-0 bg-white font-mono text-sm"
                    />
                    <Button type="submit" className="h-12 shrink-0 bg-amber-700 text-white hover:bg-amber-800">
                        <Search className="mr-2 h-4 w-4" /> Verify code
                    </Button>
                </div>
                {codeError && <p role="alert" className="text-xs font-semibold text-rose-700">{codeError}</p>}
            </form>

            <div className="grid grid-cols-2 gap-3 border-t border-amber-200 pt-5">
                <div className="min-w-0 space-y-1">
                    <p className="text-[8px] font-black uppercase text-amber-700">Catalog product</p>
                    <p className="truncate text-[11px] font-bold text-amber-950">{productName || 'Unavailable'}</p>
                </div>
                <div className="min-w-0 space-y-1">
                    <p className="text-[8px] font-black uppercase text-amber-700">Catalog batch / SKU</p>
                    <p className="truncate text-[11px] font-bold text-amber-950">{batchNo || 'Unavailable'}</p>
                </div>
                <div className="min-w-0 space-y-1">
                    <p className="text-[8px] font-black uppercase text-amber-700">Listed origin</p>
                    <p className="truncate text-[11px] font-bold text-amber-950">{origin || 'Unavailable'}</p>
                </div>
                <div className="min-w-0 space-y-1">
                    <p className="text-[8px] font-black uppercase text-amber-700">Listed ABV</p>
                    <p className="truncate text-[11px] font-bold text-amber-950">{abv || 'Unavailable'}</p>
                </div>
            </div>

            <div className="flex items-center gap-2 border-t border-amber-200 pt-4 text-[9px] font-black uppercase tracking-widest text-amber-800">
                <Database size={13} />
                No bottle-level verification record
            </div>
        </Card>
    );
}
