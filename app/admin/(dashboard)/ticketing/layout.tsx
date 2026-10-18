import TicketThemeBoundary from '@/components/ticketing/TicketThemeBoundary';
import type { ReactNode } from 'react';

export default function AdminTicketingLayout({ children }: { children: ReactNode }) {
  return <TicketThemeBoundary>{children}</TicketThemeBoundary>;
}
