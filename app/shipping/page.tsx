"use strict";
import React from "react";
import { LOCAL_DELIVERY_ESTIMATE } from "@/lib/deliveryEstimate";

export default function ShippingInfoPage() {
  const lastUpdated = "May 2026";

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 text-left">
      <div className="max-w-3xl mx-auto bg-white p-8 sm:p-10 rounded-2xl shadow-sm border border-slate-100">
        
        {/* Header Section */}
        <div className="border-b pb-6 mb-8">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Shipping & Delivery Info</h1>
          <p className="text-sm text-slate-400 mt-2">Last Updated: {lastUpdated}</p>
          <p className="text-slate-600 mt-4 leading-relaxed">
            Eligible local Nairobi deliveries are estimated at <strong>{LOCAL_DELIVERY_ESTIMATE}</strong>, depending on your exact address and availability. This is not a coverage guarantee; confirm your address and current timing at checkout. Upcountry shipping uses separate courier timelines.
          </p>
        </div>

        {/* Delivery Zones Table */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-foreground mb-3">1. Shipping Timelines & Rates</h2>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-slate-700">Delivery Region</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-700">Estimated Timeline</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-700">Fulfillment Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-600">
                <tr>
                  <td className="px-4 py-3 font-medium text-foreground">Nairobi CBD & Environs (if eligible)</td>
                  <td className="px-4 py-3">Estimated {LOCAL_DELIVERY_ESTIMATE}; confirm address and availability</td>
                  <td className="px-4 py-3">Local On-Demand Rider</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-foreground">Nairobi Suburbs (if eligible)</td>
                  <td className="px-4 py-3">Estimated {LOCAL_DELIVERY_ESTIMATE}; confirm address and availability</td>
                  <td className="px-4 py-3">Standard Moto-Courier</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-foreground">Upcountry Kenya</td>
                  <td className="px-4 py-3">24 to 72 Hours max</td>
                  <td className="px-4 py-3">Regional Shuttle / G4S / Wells Fargo</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Essential Processing Alert */}
        <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-xl mb-8">
          <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider mb-2">⚡ Processing Cut-Off Times</h3>
            Online orders are accepted <strong>24/7</strong>. Eligible local Nairobi deliveries have an estimated 10–30 minute window from order placement, subject to address and live delivery availability. Upcountry orders use separate courier services and business-day dispatch schedules; confirm their timing at checkout.
        </div>

        {/* Policy Body Layout */}
        <div className="space-y-8 text-sm text-slate-600 leading-relaxed">
          
          {/* Section 2 */}
          <section>
            <h2 className="text-lg font-bold text-foreground mb-3">2. Upcountry Pick-up Points</h2>
            <p>
              For beverage deliveries outside of Nairobi, packages are securely routed via established regional parcel networks or major towns. courier services. Once dispatch manifests are signed off at the terminals, a digital receipt containing the vehicle plate numbers, courier tracking number, or parcel office desk contact will be pushed out to your phone.
            </p>
            <p className="mt-2">
              Please present your official identification matching your checkout billing sheet when collecting your order at your local town&apos;s parcel office drop-point.
            </p>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-lg font-bold text-foreground mb-3">3. Delivery Address Accuracy</h2>
            <p>
              To ensure zero delivery hiccups, please ensure your checkout parameters are perfectly accurate. Kindly provide precise details in your shipping forms, including specific estate names, court numbers, building names, apartment/house designations, or targeted shop locations. 
            </p>
            <p className="mt-2">
              Our dispatch riders will call the telephone link supplied during payment directly upon approach to your address block. If a rider cannot get through to you after multiple attempts, the package will safely turn back to our storage hub, and a secondary delivery re-routing fee may apply.
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-lg font-bold text-foreground mb-3">4. Delivery Inspection</h2>
            <p>
              While our logistics staff inspects every single item before sealing it inside your package, we highly recommend doing a quick visual check of your package condition right when the courier hands it over to you. As outlined in our returns documentation, all local delivery cycles are absolute, non-refundable final sales unless a handling mismatch error occurred directly at our warehouse.
            </p>
          </section>

        </div>

        {/* Footer Section */}
<div className="border-t mt-10 pt-6 text-center">
  <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
    © {new Date().getFullYear()} Online Bar. All Rights Reserved.
  </p>
</div>
      </div>
    </div>
  );
}
