import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Online Bar Partner Sign In',
  description: 'Sign in to your Online Bar partner account.'
};

export default function MarketSellerLoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
