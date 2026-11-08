import type { Metadata } from 'next';
import { Suspense } from 'react';
import RoleAppEntry from '@/components/onboarding/RoleAppEntry';

export const metadata: Metadata = {
  title: 'Vendor Workspace | Online Bar',
  description: 'Open your approved Online Bar vendor workspace.',
  manifest: '/merchant-manifest.json',
  robots: { index: false, follow: false }
};

export default function VendorEntryPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950" />}>
      <RoleAppEntry role="merchant" />
    </Suspense>
  );
}
