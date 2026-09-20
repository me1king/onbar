import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: 'Online Bar | Premium Drinks',
  description: 'Premium spirits and snacks delivered instantly across Kenya.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

import PublicLayoutShield from "@/components/layout/PublicLayoutShield";
import JsonLd from "@/components/seo/JsonLd";
import AnalyticsTracker from "@/components/layout/AnalyticsTracker";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import InstallAppWidget from "@/components/layout/InstallAppWidget";
import ExperienceNotificationHost from "@/components/layout/ExperienceNotificationHost";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import RootStabilityGuard from "@/components/layout/RootStabilityGuard";
import { DEFAULT_SETTINGS } from "@/lib/useSettings";
import { Suspense } from "react";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased bg-white text-foreground`}>
        <RootStabilityGuard>
            <ErrorBoundary>
                <CartProvider>
                <WishlistProvider>
                    <PublicLayoutShield initialSettings={DEFAULT_SETTINGS}>
                        <Suspense fallback={<div className="min-h-screen bg-slate-50 animate-pulse" />}>
                            {children}
                        </Suspense>
                    </PublicLayoutShield>

                    <Suspense fallback={null}>
                        <AnalyticsTracker />
                    </Suspense>

                    <Suspense fallback={null}>
                        <InstallAppWidget />
                        <ExperienceNotificationHost />
                        <MobileBottomNav />
                    </Suspense>
                </WishlistProvider>
                </CartProvider>
            </ErrorBoundary>
        </RootStabilityGuard>

        <JsonLd />
      </body>
    </html>
  );
}
