'use client';

import { useState } from 'react';
import { Printer, X } from 'lucide-react';

type TicketItem = {
  name: string;
  quantity: number;
  detail?: string | null;
  notes?: string | null;
};

export default function MerchantOrderTicket({
  applicationName,
  orderId,
  createdAt,
  status,
  items
}: {
  applicationName: string;
  orderId: number;
  createdAt: string;
  status: string;
  items: TicketItem[];
}) {
  const [open, setOpen] = useState(false);

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-zinc-100 hover:bg-white/5"
      aria-label={`Print order ${orderId} ticket`}
    >
      <Printer size={14} aria-hidden="true" />
      Print ticket
    </button>
    {open && <div className="merchant-order-ticket-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          .merchant-order-ticket-sheet,
          .merchant-order-ticket-sheet * { visibility: visible !important; }
          .merchant-order-ticket-overlay {
            position: fixed !important;
            inset: 0 !important;
            display: block !important;
            padding: 0 !important;
            background: #fff !important;
            color: #111 !important;
          }
          .merchant-order-ticket-sheet {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
          }
          .merchant-order-ticket-actions { display: none !important; }
        }
      `}</style>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`merchant-ticket-title-${orderId}`}
        className="merchant-order-ticket-sheet w-full max-w-lg rounded-2xl bg-white p-6 text-slate-950 shadow-2xl"
      >
        <div className="merchant-order-ticket-actions mb-5 flex justify-end gap-2">
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950">
            <Printer size={16} aria-hidden="true" /> Print
          </button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close print preview" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <header className="border-b-2 border-dashed border-slate-300 pb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">OnBar merchant order</p>
          <h2 id={`merchant-ticket-title-${orderId}`} className="mt-2 text-2xl font-black">{applicationName}</h2>
          <p className="mt-2 text-lg font-bold">Order #{orderId}</p>
          <p className="mt-1 text-sm">{new Date(createdAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} · {status}</p>
        </header>
        <ol className="my-5 space-y-4">
          {items.map((item, index) => <li key={`${item.name}-${index}`} className="border-b border-dashed border-slate-200 pb-3">
            <p className="text-base font-bold">{item.quantity} × {item.name}</p>
            {item.detail && <p className="mt-1 text-sm text-slate-600">{item.detail}</p>}
            {item.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">Notes: {item.notes}</p>}
          </li>)}
        </ol>
        <p className="border-t-2 border-dashed border-slate-300 pt-3 text-xs text-slate-500">Confirm all items before handing the order to the rider or customer.</p>
      </section>
    </div>}
  </>;
}
