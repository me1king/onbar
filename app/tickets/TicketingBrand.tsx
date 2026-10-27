import Link from 'next/link';
import TicketThemeSync from '@/app/tickets/TicketThemeSync';

export default function TicketingBrand() {
  return (
    <header className="ticket-theme-header w-full border-b border-slate-200">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 pb-3 pt-4 sm:px-6 lg:px-8">
        <Link href="/tickets" aria-label="Apex Market ticketing home" className="ticket-theme-logo inline-flex rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500">
          <svg
            role="img"
            aria-label="Midnight Society KE · Ticketing on Apex Market"
            viewBox="0 0 520 88"
            className="h-auto w-[260px] sm:w-[330px]"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M48 9a29 29 0 1 0 28 44A24 24 0 0 1 48 9Z" fill="#FDBA74" />
            <path d="m79 17 3.5 8.5L91 29l-8.5 3.5L79 41l-3.5-8.5L67 29l8.5-3.5L79 17Z" fill="#FDBA74" />
            <circle cx="94" cy="48" r="2.5" fill="#F97316" />
            <text x="112" y="40" fill="#1F2937" fontFamily="Arial, Helvetica, sans-serif" fontSize="24" fontWeight="700" letterSpacing="1.5">MIDNIGHT SOCIETY KE</text>
            <text x="114" y="65" fill="#C2410C" fontFamily="Arial, Helvetica, sans-serif" fontSize="11" fontWeight="700" letterSpacing="3">TICKETING ON APEX MARKET</text>
          </svg>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-3">
          <TicketThemeSync />
          <div className="text-right text-[10px] leading-5 text-slate-500">
            <p className="font-bold uppercase tracking-[0.16em]">Apex Market ticketing</p>
            <Link href="/" className="font-black tracking-[0.08em] text-orange-700 transition hover:text-orange-800">Built by Online Bar</Link>
            <p className="mt-0.5 text-[8px]">in collaboration with Apex Market</p>
          </div>
        </div>
      </div>
    </header>
  );
}
