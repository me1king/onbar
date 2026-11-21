import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Party Games for Game Night (18+)',
  description: 'Play original group party games with optional, responsible drinking. Alcohol-free play and passing are always welcome.',
  alternates: { canonical: '/games' }
};

export default function GameNightLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
