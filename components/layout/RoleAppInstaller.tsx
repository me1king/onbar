'use client';

import * as React from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { marketSupabase } from '@/lib/marketSupabaseClient';
import { supabase } from '@/lib/supabaseClient';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type AppRole = 'rider' | 'merchant';

const appConfig: Record<AppRole, { manifest: string; name: string; description: string }> = {
  rider: {
    manifest: '/rider-manifest.json',
    name: 'Rider Terminal',
    description: 'Install the rider terminal for faster missions, GPS, and handovers.'
  },
  merchant: {
    manifest: '/merchant-manifest.json',
    name: 'Merchant Hub',
    description: 'Install the merchant hub to manage stock and incoming orders.'
  }
};

function getRole(pathname: string | null): AppRole | null {
  if (pathname?.startsWith('/rider/')) return 'rider';
  if (pathname === '/merchant/network' || pathname?.startsWith('/merchant/dashboard')) return 'merchant';
  return null;
}

export default function RoleAppInstaller() {
  const pathname = usePathname();
  const role = getRole(pathname);
  const isOnBarMerchant = role === 'merchant' && pathname === '/merchant/network';
  const [promptEvent, setPromptEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = React.useState(false);
  const [ios, setIos] = React.useState(false);
  const [standalone, setStandalone] = React.useState(false);

  React.useEffect(() => {
    if (!role) return;
    const config = appConfig[role];
    let link = document.querySelector<HTMLLinkElement>('link[data-role-manifest]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      link.dataset.roleManifest = 'true';
      document.head.appendChild(link);
    }
    link.href = config.manifest;

    const isIosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIos(isIosDevice);
    setStandalone(isStandalone);

    let active = true;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    async function checkAccess() {
      if (!role) return;
      try {
        const token = role === 'rider'
          ? localStorage.getItem('ob_rider_token')
          : isOnBarMerchant
            ? (await supabase?.auth.getSession())?.data.session?.access_token
            : (await marketSupabase?.auth.getSession())?.data.session?.access_token;
        if (!token) return;
        const query = new URLSearchParams({ role });
        if (isOnBarMerchant) query.set('workspace', 'onbar');
        const response = await fetch(`/api/app-install/access?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        });
        const result = await response.json() as { allowed?: boolean };
        if (!active || result.allowed !== true || localStorage.getItem(`ob_${role}_app_install_dismissed`)) return;
        void navigator.serviceWorker?.register('/sw.js').catch(error => {
          console.error('[RoleAppInstaller] Service worker registration failed:', error);
        });
        setVisible(true);
      } catch (error) {
        console.error('[RoleAppInstaller] Could not verify app access:', error);
      }
    }
    void checkAccess();
    return () => { active = false; window.removeEventListener('beforeinstallprompt', onPrompt); };
  }, [isOnBarMerchant, role]);

  if (!role || standalone || !visible) return null;
  const config = appConfig[role];

  const install = async () => {
    if (promptEvent) {
      await promptEvent.prompt();
      const result = await promptEvent.userChoice;
      if (result.outcome === 'accepted') setVisible(false);
      setPromptEvent(null);
      return;
    }
    if (ios) {
      window.alert(`Install ${config.name}: tap Share in Safari, then choose “Add to Home Screen”.`);
      return;
    }
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-3 right-3 z-[180] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-md">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Smartphone className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase tracking-wide text-slate-900">Your {config.name}</p>
        <p className="truncate text-[10px] text-slate-500">{config.description}</p>
      </div>
      <button type="button" onClick={() => void install()} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-primary px-3 text-[10px] font-black uppercase tracking-wide text-white">
        <Download className="h-3.5 w-3.5" /> Install
      </button>
      <button type="button" aria-label="Dismiss app install prompt" onClick={() => { localStorage.setItem(`ob_${role}_app_install_dismissed`, 'true'); setVisible(false); }} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
