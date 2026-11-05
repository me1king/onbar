import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Online Bar Partner Workspace',
  description: 'Manage your approved Online Bar partner operations.'
};

export default function MerchantDashboardRouteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
