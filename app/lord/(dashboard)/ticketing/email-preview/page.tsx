import TicketEmailPreviewPage from '@/components/ticketing/TicketEmailPreviewPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ticket email preview | Online Bar',
  robots: { index: false, follow: false }
};

export default async function LordTicketEmailPreview({
  searchParams
}: {
  searchParams: Promise<{ theme?: string | string[] }>;
}) {
  const query = await searchParams;
  return (
    <TicketEmailPreviewPage
      basePath="/lord/ticketing"
      requestedTheme={typeof query.theme === 'string' ? query.theme : undefined}
    />
  );
}
