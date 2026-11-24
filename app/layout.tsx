import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import type { Metadata, Viewport } from "next";
import { LOCAL_DELIVERY_ESTIMATE } from "@/lib/deliveryEstimate";
import "@/app/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL('https://www.onlinebar.co.ke'),
  title: {
    default: 'Alcohol Delivery in Nairobi | Beer, Wine & Spirits | Online Bar',
    template: '%s | Online Bar',
  },
  description: `Online ordering is open 24/7. Eligible local Nairobi delivery is estimated at ${LOCAL_DELIVERY_ESTIMATE}, subject to address and availability. Confirm coverage at checkout. 18+.`,
  openGraph: {
    type: 'website',
    siteName: 'Online Bar',
    title: 'Alcohol Delivery in Nairobi | Online Bar',
    description: `Online ordering is open 24/7. Eligible local Nairobi delivery is estimated at ${LOCAL_DELIVERY_ESTIMATE}, subject to address and availability. Confirm coverage and timing at checkout.`,
    locale: 'en_KE',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } },
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
import RootClientWidgets from "@/components/layout/RootClientWidgets";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import RootStabilityGuard from "@/components/layout/RootStabilityGuard";
import PostHogSessionReplay from "@/components/layout/PostHogSessionReplay";
import { Suspense } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";

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
                        <PublicLayoutShield>{children}</PublicLayoutShield>

                        <Suspense fallback={null}>
                            <AnalyticsSwitcher />
                        </Suspense>

                        <PostHogSessionReplay appName="Online Bar" />

                        <RootClientWidgets />
                    </WishlistProvider>
                </CartProvider>
            </ErrorBoundary>
        </RootStabilityGuard>

        <JsonLd />
        <SpeedInsights />
      </body>
    </html>
  );
}
