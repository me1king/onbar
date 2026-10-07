export function getVariantPrice(
  price: number,
  variantPrices: Record<string, number> | null | undefined,
  variant: string
) {
  const variantPrice = variantPrices?.[variant];
  return typeof variantPrice === 'number' && Number.isFinite(variantPrice) && variantPrice >= 0
    ? variantPrice
    : price;
}

export function getStartingPrice(
  price: number,
  variantPrices: Record<string, number> | null | undefined,
  variants: string[] | null | undefined
) {
  const prices = (variants || []).map(variant => getVariantPrice(price, variantPrices, variant));
  return prices.length ? Math.min(...prices) : price;
}
