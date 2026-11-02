import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Apex Market Partner Workspace',
  description: 'Manage your approved Apex Market partner operations.'
};

export default function MerchantDashboardRouteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
