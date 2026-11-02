import type { Metadata } from 'next';
import './market.css';

export const metadata: Metadata = {
  title: 'Apex Market',
  description: 'Discover products and services from verified Apex Market partners.',
};

export default function MarketLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="mm-shell">{children}</div>;
}
