import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Online Bar | Early Access',
  description: 'Join the Online Bar early-access list and be first to hear when we reach your area.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Online Bar Early Access',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Online Bar' },
  icons: { apple: '/apple-touch-icon.png' }
};

export const viewport = {
  themeColor: '#D91C1C'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
