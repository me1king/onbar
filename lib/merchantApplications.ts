export const merchantBusinessTypes = [
  'bar',
  'kitchen',
  'restaurant',
  'food_vendor',
  'supplier',
  'delivery_partner'
] as const;

export type MerchantBusinessType = (typeof merchantBusinessTypes)[number];

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
