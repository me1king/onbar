'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import InstallAppWidget from './InstallAppWidget';
import RoleAppInstaller from './RoleAppInstaller';
import ExperienceNotificationHost from './ExperienceNotificationHost';
import MobileBottomNav from './MobileBottomNav';

export default function RootClientWidgets() {
  const pathname = usePathname();
  const isRider = pathname?.startsWith('/rider/') === true;
  if (isRider) return null;

  return (
    <>
      <Suspense fallback={null}>
        <RoleAppInstaller />
        <InstallAppWidget />
        <ExperienceNotificationHost />
        <MobileBottomNav />
      </Suspense>
    </>
  );
}
