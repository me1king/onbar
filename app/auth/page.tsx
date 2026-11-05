import PremiumOnboarding from '@/components/auth/PremiumOnboarding';

export const metadata = {
  title: 'Identity Establishment | Online Bar',
  description: 'Premium onboarding for Nairobi\'s elite drinks grid.',
};

export default async function AuthPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialMode = params.mode === 'signin' ? 'signin' : 'signup';

  return (
    <main className="min-h-screen bg-white selection:bg-primary/20">
      <PremiumOnboarding initialMode={initialMode} />
    </main>
  );
}
