export type MarkupRuleType = 'percent' | 'fixed' | 'tiered';

export interface MarkupRule {
  type: MarkupRuleType;
  value: number;
  minMargin: number;
  roundTo: number;
  maxPrice?: number;
}

export interface VendorLocation {
  latitude: number;
  longitude: number;
}

export interface DispatchRider {
  id: string;
  name: string;
  rating: number;
  acceptanceRate: number;
  recentTrips: number;
  distanceKm: number;
  vehicleType?: string;
}

export function computeCustomerPrice(vendorPrice: number, rule: MarkupRule): number {
  const safeVendorPrice = Number.isFinite(vendorPrice) ? Math.max(0, vendorPrice) : 0;
  const safeRuleValue = Number.isFinite(rule.value) ? Math.max(0, rule.value) : 0;
  const safeMinMargin = Number.isFinite(rule.minMargin) ? Math.max(0, rule.minMargin) : 0;
  const safeRoundTo = Number.isFinite(rule.roundTo) && rule.roundTo > 0 ? Math.max(1, rule.roundTo) : 10;

  let calculatedPrice = safeVendorPrice;

  if (rule.type === 'fixed') {
    calculatedPrice = safeVendorPrice + safeRuleValue;
  } else if (rule.type === 'tiered') {
    calculatedPrice = safeVendorPrice + Math.max(safeMinMargin, safeRuleValue);
  } else {
    calculatedPrice = safeVendorPrice * (1 + safeRuleValue / 100);
  }

  const profit = calculatedPrice - safeVendorPrice;
  const enforceFloor = Math.max(profit, safeMinMargin);
  const rounded = Math.ceil((safeVendorPrice + enforceFloor) / safeRoundTo) * safeRoundTo;

  if (rule.maxPrice && rounded > rule.maxPrice) {
    return rule.maxPrice;
  }

  return rounded;
}

export function calculateVendorMargin(vendorPrice: number, customerPrice: number): number {
  return Math.max(0, customerPrice - vendorPrice);
}

export function isVendorVisibleToCustomer(
  vendor: VendorLocation,
  customer: VendorLocation,
  maxDistanceKm: number,
): boolean {
  const deltaLat = (vendor.latitude - customer.latitude) * 111.32;
  const deltaLng = (vendor.longitude - customer.longitude) * 111.32 * Math.cos(customer.latitude * (Math.PI / 180));
  const distanceKm = Math.hypot(deltaLat, deltaLng);
  return distanceKm <= Math.max(0, maxDistanceKm);
}

export function scoreDispatchRider(rider: DispatchRider): number {
  const ratingScore = rider.rating * 12;
  const acceptScore = rider.acceptanceRate * 0.4;
  const recentTripScore = Math.min(rider.recentTrips, 30) * 1.2;
  const distancePenalty = (rider.distanceKm || 0) * 6;
  const vehicleBonus = rider.vehicleType === 'motorbike' ? 12 : rider.vehicleType === 'van' ? 8 : 4;

  const score = 55 + ratingScore + acceptScore + recentTripScore + vehicleBonus - distancePenalty;
  return Math.min(100, Math.max(0, score));
}

export function estimateRiderPayout(basePay: number, distanceKm: number, bonus: number, tip: number): number {
  const distanceAllowance = Math.max(0, distanceKm) * 30;
  return Math.max(0, basePay + distanceAllowance + bonus + tip);
}
