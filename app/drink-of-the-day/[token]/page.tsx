import DrinkOfDayReveal from '@/components/marketing/DrinkOfDayReveal';

export const metadata = {
  title: 'Your Drink of the Day | Online Bar',
  robots: { index: false, follow: false }
};

export default async function DrinkOfTheDayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DrinkOfDayReveal token={token} />;
}
