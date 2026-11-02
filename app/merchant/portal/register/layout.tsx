import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Apex Market Partner Account',
  description: 'Create an account to access the Apex Market partner application.'
};

export default function MarketSellerRegistrationLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
