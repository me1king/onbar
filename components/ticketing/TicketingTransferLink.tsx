'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';

export default function TicketingTransferLink() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    void fetch('/api/admin/ticketing/transfers/access', { cache: 'no-store' })
      .then(async response => {
        if (response.status === 403) return;
        if (!response.ok) throw new Error(`Transfer access check failed (${response.status}).`);
        setVisible(true);
      })
      .catch(cause => console.error('[TicketingTransfers] Could not check transfer access:', cause));
  }, []);

  if (!visible) return null;
  return (
    <Link href="/lord/ticketing/transfers" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-100/5 px-4 text-sm font-bold text-amber-100 transition hover:bg-amber-100/10">
      <Users size={15} /> Transfer review
    </Link>
  );
}
