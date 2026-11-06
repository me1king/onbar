import PremiumOnboarding from '@/components/auth/PremiumOnboarding';

export const metadata = {
  title: 'Sign in | Online Bar',
  description: 'Sign in or create your Online Bar account.',
};

function getSafeReturnPath(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate?.startsWith('/') || candidate.startsWith('//')) return undefined;
  try {
    const target = new URL(candidate, 'https://onlinebar.invalid');
    if (target.origin !== 'https://onlinebar.invalid' || target.pathname !== '/merchant/onboarding') return undefined;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return undefined;
  }
}

export default async function AuthPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string | string[]; next?: string | string[] }>;
}) {
  const params = await searchParams;
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const initialMode = mode === 'signup' ? 'signup' : 'signin';
  const returnTo = getSafeReturnPath(params.next);

  return (
    <main className="min-h-screen bg-white selection:bg-primary/20">
      <PremiumOnboarding initialMode={initialMode} returnTo={returnTo} />
    </main>
  );
}
