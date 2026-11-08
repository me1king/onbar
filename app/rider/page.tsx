import type { Metadata } from 'next';
import { Suspense } from 'react';
import RoleAppEntry from '@/components/onboarding/RoleAppEntry';

export const metadata: Metadata = {
  title: 'Rider Terminal | Online Bar',
  description: 'Open your approved Online Bar rider terminal.',
  manifest: '/rider-manifest.json',
  robots: { index: false, follow: false }
};

export default function RiderEntryPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950" />}>
      <RoleAppEntry role="rider" />
    </Suspense>
  );
}
