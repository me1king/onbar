import Image from 'next/image';
import Link from 'next/link';
import TicketThemeSync from '@/app/tickets/TicketThemeSync';

export default function TicketingBrand() {
  return (
    <header className="ticket-theme-header w-full border-b border-slate-200">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 pb-3 pt-4 sm:px-6 lg:px-8">
        <Link href="/tickets" aria-label="Apex Market ticketing home" className="ticket-theme-logo inline-flex rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500">
          <Image
            src="/midnight-society-logo.svg"
            alt="Midnight Society KE · Ticketing on Apex Market"
            width={520}
            height={88}
            priority
            className="w-[260px] sm:w-[330px]"
          />
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-3">
          <TicketThemeSync />
          <div className="text-right text-[10px] leading-5 text-slate-500">
            <p className="font-bold uppercase tracking-[0.16em]">Apex Market ticketing</p>
            <Link href="/" className="ticket-theme-accent font-black tracking-[0.08em] transition hover:opacity-75">Built by Online Bar</Link>
            <p className="mt-0.5 text-[8px]">in collaboration with Apex Market</p>
          </div>
        </div>
      </div>
    </header>
  );
}
