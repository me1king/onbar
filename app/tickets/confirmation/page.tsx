import type { Metadata } from 'next';
import TicketWallet from '@/app/tickets/TicketWallet';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ticket wallet | Online Bar',
  robots: { index: false, follow: false },
  referrer: 'no-referrer'
};

type PageProps = {
  searchParams: Promise<{ order?: string | string[]; token?: string | string[] }>;
};

export default async function TicketConfirmationPage({ searchParams }: PageProps) {
  const query = await searchParams;
  return (
    <TicketWallet
      orderId={typeof query.order === 'string' ? query.order : ''}
      initialToken={typeof query.token === 'string' ? query.token : ''}
    />
  );
}
