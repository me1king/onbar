'use client';

import dynamic from 'next/dynamic';

const CustomerLiveLocationMap = dynamic(() => import('./CustomerLiveLocationMap'), {
  ssr: false,
  loading: () => <div className="flex h-[360px] items-center justify-center rounded-xl bg-slate-100 text-xs font-black uppercase tracking-widest text-slate-400 sm:h-[440px]">Loading customer map...</div>
});

export default function CustomerLiveLocationMapPanel() {
  return <CustomerLiveLocationMap />;
}
