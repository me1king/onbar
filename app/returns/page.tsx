"use strict";
import React from "react";
import Link from "next/link";

export default function ReturnsAndExchangesPage() {
  const lastUpdated = "August 2026";

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 text-left">
      <div className="max-w-3xl mx-auto bg-white p-8 sm:p-10 rounded-2xl shadow-sm border border-slate-100">
        
        {/* Header Section */}
        <div className="border-b pb-6 mb-8">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Order changes, returns & refunds</h1>
          <p className="text-sm text-slate-400 mt-2">Last Updated: {lastUpdated}</p>
          <p className="text-slate-600 mt-4 leading-relaxed font-medium">
            If there is a problem with an order or payment, contact our support team with your order number as soon as possible. We will check the order and explain the available next steps.
          </p>
        </div>

        <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-6 text-left">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">Need help with an order?</h2>
          <p className="text-sm leading-relaxed text-slate-600">
            Send a support request with your order number, the issue, and the best way to reach you. A request is not a cancellation or refund confirmation; wait for the team to confirm the order status and any resolution.
          </p>
          <Link href="/contact" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Contact support
          </Link>
        </div>

        {/* Policy Body Layout */}
        <div className="space-y-8 text-sm text-slate-600 leading-relaxed text-left">
          
          {/* Section 1 */}
          <section>
            <h2 className="text-lg font-bold text-foreground mb-3 uppercase tracking-tight">1. Before placing an order</h2>
            <p className="font-medium text-slate-500">
              Review product details, quantities, delivery location, and the order total before payment. Checkout requires an 18+ self-confirmation; it is not identity or age verification.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-lg font-bold text-foreground mb-3 uppercase tracking-tight">2. Report an order or payment problem</h2>
            <p className="mb-3 font-medium text-slate-500">
              Contact support promptly about an incorrect, missing, or damaged item, a delivery issue, or a payment that appears to have failed or been duplicated. Include your order number, a short description, and any relevant payment reference. Do not send passwords or full card details.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground mb-3 uppercase tracking-tight">3. Review and resolution</h2>
            <p className="font-medium text-slate-500">
              Support will review the order and confirm the outcome for your case. A refund or exchange is not automatic. If a refund is approved, support will confirm the method and timing; payment-provider processing can take additional time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground mb-3 uppercase tracking-tight">4. Request cancellation</h2>
            <p className="font-medium text-slate-500">
              Contact support immediately if you need to cancel. A cancellation may not be possible after the order has been prepared or handed to a rider. Do not assume it is cancelled until support confirms.
            </p>
          </section>

        </div>

        {/* Footer Section */}
        <div className="border-t mt-10 pt-6 text-center">
          <p className="text-xs font-black text-slate-400 tracking-wider uppercase">
            © {new Date().getFullYear()} Online Bar™. All Rights Reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
