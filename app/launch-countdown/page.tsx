import type { Metadata } from 'next';
import PublicLaunchScreen from '@/components/ticketing/PublicLaunchScreen';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'We are opening soon | Apex Market',
  description: 'The rest of Apex Market will be available when the launch countdown ends.',
  robots: { index: false, follow: false }
};

export default function LaunchCountdownPage() {
  return <PublicLaunchScreen />;
}
