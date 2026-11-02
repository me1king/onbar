export const merchantBusinessTypes = [
  'bar',
  'kitchen',
  'restaurant',
  'food_vendor',
  'supplier',
  'delivery_partner'
] as const;

export type MerchantBusinessType = (typeof merchantBusinessTypes)[number];

export const merchantVendorTypes = ['retailer', 'wholesaler', 'street_food'] as const;
export type MerchantVendorType = (typeof merchantVendorTypes)[number];

export const foodBusinessTypes: MerchantBusinessType[] = [
  'kitchen',
  'restaurant',
  'food_vendor'
];

export const merchantApplicationStatuses = [
  'submitted',
  'under_review',
  'information_requested',
  'approved',
  'rejected',
  'suspended',
  'expired'
] as const;

export type MerchantApplicationStatus = (typeof merchantApplicationStatuses)[number];

export interface MerchantApplicationDocument {
  id: string;
  type: string;
  name: string;
  contentType: string;
  objectPath: string;
  uploadedAt: string;
  expiresAt: string | null;
}

export function getMissingMerchantDocumentTypes(
  requiredTypes: string[],
  documents: Pick<MerchantApplicationDocument, 'type' | 'expiresAt'>[],
  today = new Date().toISOString().slice(0, 10)
): string[] {
  return requiredTypes.filter(type => {
    const document = documents.find(item => item.type === type);
    if (!document) return true;
    if ((type === 'liquor_licence' || type === 'wholesale_licence') && !document.expiresAt) return true;
    return Boolean(document.expiresAt && document.expiresAt < today);
  });
}

export interface MerchantDocumentRequirement {
  id: string;
  business_type: string;
  county: string;
  document_type: string;
  label: string;
  is_required: boolean;
  is_active: boolean;
}

export function isMerchantBusinessType(value: unknown): value is MerchantBusinessType {
  return typeof value === 'string'
    && merchantBusinessTypes.includes(value as MerchantBusinessType);
}

export function isMerchantVendorType(value: unknown): value is MerchantVendorType {
  return typeof value === 'string'
    && merchantVendorTypes.includes(value as MerchantVendorType);
}

export function merchantVendorTypeForBusinessType(
  businessType: MerchantBusinessType
): MerchantVendorType | null {
  if (businessType === 'bar') return 'retailer';
  if (businessType === 'supplier') return 'wholesaler';
  if (foodBusinessTypes.includes(businessType)) return 'street_food';
  return null;
}

export function isMerchantApplicationStatus(value: unknown): value is MerchantApplicationStatus {
  return typeof value === 'string'
    && merchantApplicationStatuses.includes(value as MerchantApplicationStatus);
}

export function isFoodBusinessType(value: MerchantBusinessType): boolean {
  return foodBusinessTypes.includes(value);
}

export function resolveMerchantDocumentRequirements(
  requirements: MerchantDocumentRequirement[],
  businessType: MerchantBusinessType,
  county: string
): MerchantDocumentRequirement[] {
  const normalizedCounty = county.trim().toLowerCase() || '*';
  const applicable = requirements
    .filter(requirement =>
      (requirement.business_type === '*' || requirement.business_type === businessType)
      && (requirement.county === '*' || requirement.county.toLowerCase() === normalizedCounty)
    )
    .sort((left, right) => {
      const score = (requirement: MerchantDocumentRequirement) =>
        (requirement.business_type === businessType ? 2 : 0)
        + (requirement.county.toLowerCase() === normalizedCounty ? 3 : 0);
      return score(right) - score(left);
    });
  const chosen = new Map<string, MerchantDocumentRequirement>();
  for (const requirement of applicable) {
    if (!chosen.has(requirement.document_type)) {
      chosen.set(requirement.document_type, requirement);
    }
  }
  return [...chosen.values()].filter(requirement => requirement.is_active);
}
