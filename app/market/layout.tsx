import type { Metadata } from 'next';
import './market.css';

export const metadata: Metadata = {
  title: 'Online Bar Market',
  description: 'Discover products, services and delivery from Online Bar Nairobi.',
};

export default function MarketLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="mm-shell">{children}</div>;
}
