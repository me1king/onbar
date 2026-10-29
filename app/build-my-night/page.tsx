import Link from 'next/link';
import BuildMyNightWidget from '@/components/widgets/concierge/BuildMyNightWidget';

export default function BuildMyNightPage() {
  return (
    <main>
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-7">
        <Link href="/shop" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          Back to shop
        </Link>
      </div>
      <BuildMyNightWidget />
    </main>
  );
}
