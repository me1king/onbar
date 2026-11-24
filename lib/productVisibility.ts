const unpublishedStatuses = new Set(['draft', 'hidden', 'inactive', 'archived', 'deleted']);

export function getStorefrontProductVisibilityReasons(product: object): string[] {
  const reasons: string[] = [];

  if ('hide_product' in product && product.hide_product === true) {
    reasons.push('"Hide from storefront" is enabled.');
  }
  if ('is_available_now' in product && product.is_available_now === false) {
    reasons.push('The product is marked unavailable.');
  }
  if ('status' in product && typeof product.status === 'string') {
    const status = product.status.trim();
    if (unpublishedStatuses.has(status.toLowerCase())) {
      reasons.push(`Product status is "${status}".`);
    }
  }

  return reasons;
}

export function isStorefrontProductVisible(product: object): boolean {
  return getStorefrontProductVisibilityReasons(product).length === 0;
}
