import type { Metadata } from 'next';
import PublicLaunchScreen from '@/components/ticketing/PublicLaunchScreen';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'We are opening soon | Online Bar',
  description: 'More from Online Bar will be available when the launch countdown ends.',
  robots: { index: false, follow: false }
};

export default function LaunchCountdownPage() {
  return <PublicLaunchScreen />;
}
