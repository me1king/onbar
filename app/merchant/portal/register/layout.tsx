import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Online Bar Partner Account',
  description: 'Create an account to access the Online Bar partner application.'
};

export default function MarketSellerRegistrationLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
