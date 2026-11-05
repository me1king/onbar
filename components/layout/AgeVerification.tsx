'use client';

import { useEffect, useState } from 'react';

const AGE_VERIFICATION_KEY = 'onlinebar_age_verified';

export default function AgeVerification() {
    const [verified, setVerified] = useState(false);
    const [underage, setUnderage] = useState(false);
    const [storageError, setStorageError] = useState('');

    useEffect(() => {
        try {
            setVerified(window.localStorage.getItem(AGE_VERIFICATION_KEY) === 'true');
        } catch (error) {
            console.error('[AgeVerification] Could not read age verification state:', error);
            setStorageError('Please enable browser storage to confirm your age and continue.');
        }
    }, []);

    const confirmAge = () => {
        try {
            window.localStorage.setItem(AGE_VERIFICATION_KEY, 'true');
            setVerified(true);
            setStorageError('');
        } catch (error) {
            console.error('[AgeVerification] Could not save age verification state:', error);
            setStorageError('We could not save your confirmation. Please enable browser storage and try again.');
        }
    };

    if (verified) return null;

    return (
        <div className="fixed inset-0 z-[100] flex overflow-y-auto bg-white/90 px-4 py-4 backdrop-blur-sm sm:items-center sm:py-8">
            <section
                aria-labelledby="age-verification-title"
                aria-modal="true"
                className="my-auto w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl sm:p-10"
                role="dialog"
            >
                <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-700">Online Bar · 18+</p>
                <h1 id="age-verification-title" className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                    Before you come in
                </h1>
                <p className="mt-4 leading-7 text-slate-600">
                    Online Bar sells alcoholic drinks. Please confirm that you are at least 18 years old to continue.
                </p>

                {underage ? (
                    <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800" role="alert">
                        You must be 18 or older to use Online Bar. You cannot continue.
                    </p>
                ) : (
                    <div className="mt-7 grid gap-3 sm:grid-cols-2">
                        <button
                            className="min-h-12 rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 transition-colors hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                            onClick={confirmAge}
                            type="button"
                        >
                            I am 18 or older
                        </button>
                        <button
                            className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
                            onClick={() => setUnderage(true)}
                            type="button"
                        >
                            I am under 18
                        </button>
                    </div>
                )}

                {storageError && <p className="mt-4 text-sm text-rose-700" role="alert">{storageError}</p>}
                <p className="mt-6 text-xs leading-5 text-slate-500">
                    Product and delivery information remains available on this page. Age confirmation is required to dismiss this notice.
                </p>
            </section>
        </div>
    );
}
