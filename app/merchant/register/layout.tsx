import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Become an Apex Market Partner',
  description: 'Apply to operate as an Apex Market vendor or delivery partner.'
};

export default function MerchantRegistrationRouteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
