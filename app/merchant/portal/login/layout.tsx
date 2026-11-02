import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Apex Market Partner Sign In',
  description: 'Sign in to your Apex Market partner account.'
};

export default function MarketSellerLoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
