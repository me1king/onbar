import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Party Games for Game Night (18+)',
  description: 'Play Truth or Dare, Do or Drink, Hot Seat, Spin the Bottle Live, and original group games. Passing and alcohol-free play are welcome.',
  alternates: { canonical: '/games' }
};

export default function GameNightLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
