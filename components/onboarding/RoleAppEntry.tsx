'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Download, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type AppRole = 'merchant' | 'rider';

const appDetails: Record<AppRole, {
  manifest: string;
  appName: string;
  heading: string;
  description: string;
  dashboard: string;
}> = {
  merchant: {
    manifest: '/merchant-manifest.json',
    appName: 'OnBar Vendor app',
    heading: 'Your Vendor Workspace is ready',
    description: 'Install the small OnBar app for quick access to your approved business dashboard.',
    dashboard: '/merchant/network'
  },
  rider: {
    manifest: '/rider-manifest.json',
    appName: 'OnBar Rider app',
    heading: 'Your Rider Terminal is ready',
    description: 'Install the small OnBar app for quick access to your rider dashboard and delivery missions.',
    dashboard: '/rider/dashboard'
  }
};

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function RoleAppEntry({ role }: { role: AppRole }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const details = appDetails[role];
  const [promptEvent, setPromptEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = React.useState(false);
  const [showInstallInstructions, setShowInstallInstructions] = React.useState(false);
  const [error, setError] = React.useState('');
  const [installing, setInstalling] = React.useState(false);

  const dashboardUrl = React.useMemo(() => {
    const query = searchParams.toString();
    return query ? `${details.dashboard}?${query}` : details.dashboard;
  }, [details.dashboard, searchParams]);

  React.useEffect(() => {
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink) manifestLink.href = details.manifest;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    if (isStandalone()) {
      router.replace(dashboardUrl);
      return;
    }

    void navigator.serviceWorker?.register('/sw.js').catch(registerError => {
      console.error('[RoleAppEntry] Service worker registration failed:', registerError);
    });

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onInstallPrompt);
  }, [dashboardUrl, details.manifest, router]);

  const continueToDashboard = () => router.replace(dashboardUrl);

  const installApp = async () => {
    if (!promptEvent) {
      setShowInstallInstructions(true);
      return;
    }

    setInstalling(true);
    setError('');
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setPromptEvent(null);
      if (choice.outcome === 'accepted') continueToDashboard();
    } catch (installError) {
      console.error('[RoleAppEntry] App installation prompt failed:', installError);
      setError('The app could not be installed right now. You can still continue in your browser.');
    } finally {
      setInstalling(false);
    }
  };

  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-slate-950 px-4 py-8 text-slate-900">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-entry-heading"
        className="w-full max-w-md space-y-6 rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <Smartphone className="h-8 w-8" />
        </div>
        <div className="space-y-2 text-center">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Online Bar · {role === 'merchant' ? 'Vendor' : 'Rider'}</p>
          <h1 id="role-entry-heading" className="text-2xl font-black tracking-tight">{details.heading}</h1>
          <p className="text-sm leading-6 text-slate-600">{details.description}</p>
          <p className="text-xs leading-5 text-slate-500">
            Install is optional. Your account is checked before any business or delivery information is shown.
          </p>
        </div>

        {showInstallInstructions && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <p className="font-bold">Install {details.appName}</p>
            {ios
              ? <p>In Safari, tap Share, then choose “Add to Home Screen”. When that is done, open the app icon to go to your dashboard.</p>
              : <p>Open your browser menu and choose “Install app” or “Add to Home Screen”. You can continue to your dashboard now if installation is unavailable.</p>}
          </div>
        )}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

        <div className="space-y-3">
          <Button
            type="button"
            onClick={() => void installApp()}
            disabled={installing}
            className="h-12 w-full rounded-xl bg-amber-500 font-black text-slate-950 hover:bg-amber-400"
          >
            <Download className="mr-2 h-4 w-4" />
            {installing ? 'Opening install prompt…' : `Install ${details.appName}`}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={continueToDashboard}
            className="h-12 w-full rounded-xl border-slate-300 font-bold text-slate-800"
          >
            Continue to dashboard <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>
    </main>
  );
}
