import Image from 'next/image';
import Link from 'next/link';

export default function TicketingBrand() {
  return (
    <header className="w-full bg-[#0d0a12]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 pb-1 pt-5 sm:px-6 lg:px-8">
        <Link href="/tickets" aria-label="Midnight Society KE ticketing home" className="inline-flex rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">
          <Image
            src="/midnight-society-logo.svg"
            alt="Midnight Society KE · Halloween Nights"
            width={330}
            height={66}
            priority
            className="w-[260px] sm:w-[330px]"
          />
        </Link>
        <div className="text-right text-[10px] leading-5 text-slate-400">
          <p className="font-bold uppercase tracking-[0.16em]">Official ticketing by</p>
          <Link href="/" className="font-black tracking-[0.2em] text-orange-200 transition hover:text-white">ONLINE BAR</Link>
        </div>
      </div>
    </header>
  );
}
