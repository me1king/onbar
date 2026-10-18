import TicketThemeSync from '@/app/tickets/TicketThemeSync';
import type { ReactNode } from 'react';

export default function TicketThemeBoundary({ children }: { children: ReactNode }) {
  return (
    <div className="ticket-admin-theme min-h-screen">
      <TicketThemeSync />
      {children}
    </div>
  );
}
