const unpublishedStatuses = new Set(['draft', 'hidden', 'inactive', 'archived', 'deleted']);

export function isStorefrontProductVisible(product: object): boolean {
  if (
    ('hide_product' in product && product.hide_product === true) ||
    ('is_available_now' in product && product.is_available_now === false)
  ) return false;
  if (!('status' in product) || typeof product.status !== 'string') return true;
  return !unpublishedStatuses.has(product.status.trim().toLowerCase());
}
