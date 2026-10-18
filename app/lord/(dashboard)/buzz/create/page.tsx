'use client';

import { useRouter } from 'next/navigation';
import BuzzStudio from '@/components/admin/buzz/BuzzStudio';

export default function CreateBuzzPage() {
    const router = useRouter();

    return (
        <main className="min-h-screen bg-slate-50">
            <BuzzStudio onClose={() => router.push('/lord/buzz')} onSave={() => router.refresh()} />
        </main>
    );
}
