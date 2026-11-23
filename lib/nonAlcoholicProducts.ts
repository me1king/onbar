const ALCOHOL_MARKERS = /\b(alcohol|spirits?|wine|beer|whisk(?:y|e)y|gin|vodka|tequila|rum|brandy|liqueur|champagne|cognac|cider|alcopop)\b/i;
const ALCOHOL_FREE_MARKERS = /\b(water|soda|soft[- ]?drink|juice|mocktail|non[- ]?alcoholic|alcohol[- ]?free|0\.0\s*%?)/i;

export function isClearlyNonAlcoholicProduct(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const product = value as Record<string, unknown>;
  if (typeof product.name !== 'string') return false;

  const description = [product.name, product.category, product.sub_category, product.brand]
    .filter((part): part is string => typeof part === 'string')
    .join(' ');
  const alcoholMarkers = description.replace(/\b(?:non[- ]?alcoholic|alcohol[- ]?free)\b/gi, ' ');
  return !ALCOHOL_MARKERS.test(alcoholMarkers) && ALCOHOL_FREE_MARKERS.test(description);
}
