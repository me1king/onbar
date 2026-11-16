import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Date-night Card Game for Adults (18+)',
  description: 'A two-player date-night card game with flirty, intimate prompts, clear consent, and an always-available pass.',
  robots: { index: false, follow: false }
};

export default function CardGamesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
