import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import type { Metadata, Viewport } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: 'Apex Market | Built with Online Bar',
  description: 'Apex Market is the storefront. Its digital experience is built by Online Bar in collaboration with the Apex Market team.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

import PublicLayoutShield from "@/components/layout/PublicLayoutShield";
import JsonLd from "@/components/seo/JsonLd";
import AnalyticsSwitcher from "@/components/layout/AnalyticsSwitcher";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import InstallAppWidget from "@/components/layout/InstallAppWidget";
import ExperienceNotificationHost from "@/components/layout/ExperienceNotificationHost";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import RootStabilityGuard from "@/components/layout/RootStabilityGuard";
import PostHogSessionReplay from "@/components/layout/PostHogSessionReplay";
import { Suspense } from "react";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased bg-white text-foreground selection:bg-primary/20`}>
        <RootStabilityGuard>
            <ErrorBoundary>
                <CartProvider>
                    <WishlistProvider>
                        <PublicLayoutShield>
                            <Suspense fallback={<div className="min-h-screen bg-white" />}>
                                {children}
                            </Suspense>
                        </PublicLayoutShield>

                        <Suspense fallback={null}>
                            <AnalyticsSwitcher />
                        </Suspense>

                        <PostHogSessionReplay appName="Online Bar" />

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
