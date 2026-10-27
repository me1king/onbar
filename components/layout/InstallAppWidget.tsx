'use client';

import * as React from 'react';
import {
    Download,
    X,
    Smartphone
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: Array<string>;
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed',
        platform: string
    }>;
    prompt(): Promise<void>;
}

export default function InstallAppWidget() {
    const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
    const [isVisible, setIsVisible] = React.useState(false);
    const [isInstalled, setIsInstalled] = React.useState(false);

    React.useEffect(() => {
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
            return;
        }

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);

            const dismissed = localStorage.getItem('ob_install_prompt_dismissed');
            if (!dismissed) setIsVisible(true);
        };

        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setIsInstalled(true);
            setIsVisible(false);
        }
        setDeferredPrompt(null);
    };

    const handleDismiss = () => {
        setIsVisible(false);
        localStorage.setItem('ob_install_prompt_dismissed', 'true');
    };

    if (isInstalled || !isVisible) return null;

    return (
        <div className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] right-3 z-[150] flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur sm:bottom-6 sm:right-6">
            <button
                type="button"
                onClick={() => void handleInstall()}
                className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
                <Smartphone size={15} className="text-primary" />
                <Download size={14} />
                Install app
            </button>
            <button
                type="button"
                onClick={handleDismiss}
                aria-label="Hide install app option"
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
                <X size={14} />
            </button>
        </div>
    );
}
