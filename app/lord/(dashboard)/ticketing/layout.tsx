import TicketThemeBoundary from '@/components/ticketing/TicketThemeBoundary';
import type { ReactNode } from 'react';

export default function LordTicketingLayout({ children }: { children: ReactNode }) {
  return <TicketThemeBoundary>{children}</TicketThemeBoundary>;
}
