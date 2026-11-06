import { redirect } from 'next/navigation';

export default async function LiquorOnboardingRedirect({
  searchParams
}: {
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  const { invite } = await searchParams;
  const token = Array.isArray(invite) ? invite[0] : invite;
  const invitation = token ? `&invite=${encodeURIComponent(token)}` : '';
  redirect(`/merchant/onboarding?flow=liquor${invitation}`);
}
