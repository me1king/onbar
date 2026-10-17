export const SPIRIT_PRODUCT_CATEGORIES = [
  'Gin',
  'Whisky',
  'Whiskey',
  'Vodka',
  'Rum',
  'Tequila',
  'Brandy',
  'Cognac',
  'Liqueur',
  'Spirits'
] as const;

export function isSpiritProductCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return SPIRIT_PRODUCT_CATEGORIES.some(
    spiritCategory => spiritCategory.toLowerCase() === category.trim().toLowerCase()
  );
}

export function spiritCategoryPostgrestFilter(): string {
  return SPIRIT_PRODUCT_CATEGORIES
    .map(category => `category.ilike.${category}`)
    .join(',');
}
