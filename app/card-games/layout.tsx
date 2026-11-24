import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Game Night: Do or Drink, Spin the Bottle and Truth or Dare (18+)',
  description: 'Play Do or Drink, Spin the Bottle, Truth or Dare, or date-night prompt cards locally or with friends in a synced online room.',
  robots: { index: false, follow: false }
};

export default function CardGamesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
