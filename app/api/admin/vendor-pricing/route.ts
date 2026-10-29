import { NextResponse } from 'next/server';
import {
  computeCustomerPrice,
  calculateVendorMargin,
  isVendorVisibleToCustomer,
  scoreDispatchRider,
  estimateRiderPayout,
  type MarkupRule,
} from '@/lib/marketPricing';

export async function GET() {
  const rule: MarkupRule = {
    type: 'percent',
    value: 12,
    minMargin: 40,
    roundTo: 10,
    maxPrice: 850,
  };

  const vendorPrice = 300;
  const customerPrice = computeCustomerPrice(vendorPrice, rule);
  const margin = calculateVendorMargin(vendorPrice, customerPrice);

  const riderQueue = [
    { id: 'R-101', name: 'Sam', rating: 4.9, acceptanceRate: 97, recentTrips: 18, distanceKm: 1.6, vehicleType: 'motorbike' },
    { id: 'R-205', name: 'Mumo', rating: 4.7, acceptanceRate: 92, recentTrips: 15, distanceKm: 2.8, vehicleType: 'motorbike' },
    { id: 'R-312', name: 'Kiboi', rating: 4.4, acceptanceRate: 88, recentTrips: 10, distanceKm: 4.1, vehicleType: 'van' },
  ].map((rider) => ({
    ...rider,
    dispatchScore: scoreDispatchRider(rider),
    payoutEstimate: estimateRiderPayout(600, rider.distanceKm, 120, 80),
  }));

  const vendorVisible = isVendorVisibleToCustomer(
    { latitude: -1.2913, longitude: 36.8223 },
    { latitude: -1.2727, longitude: 36.8073 },
    4,
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    rule,
    vendorPrice,
    customerPrice,
    vendorProfit: margin,
    marginPercent: Number(((margin / Math.max(vendorPrice, 1)) * 100).toFixed(2)),
    visibility: {
      nearCustomer: vendorVisible,
      maxDistanceKm: 4,
      reason: vendorVisible ? 'Within reach of the delivery zone' : 'Outside eligible delivery radius',
    },
    riders: riderQueue.sort((left, right) => right.dispatchScore - left.dispatchScore),
  });
}
