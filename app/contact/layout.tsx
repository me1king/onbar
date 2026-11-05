import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '24/7 Customer Care',
  description: 'Online Bar customer care is available 24/7 and replies within 15 minutes. Contact us by WhatsApp, phone, email, or the online support form.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: '24/7 Customer Care | Contact Online Bar',
    description: 'Customer care is online 24/7 and replies within 15 minutes. Contact Online Bar by WhatsApp, phone, email, or our support form.',
    url: '/contact',
    type: 'website',
  },
};

export default function ContactLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
