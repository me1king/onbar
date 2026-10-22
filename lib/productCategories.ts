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

export const ADMIN_PRODUCT_CATEGORY_OPTIONS = [
  { id: 'wine', label: 'Wine (Vintages)' },
  { id: 'spirits', label: 'Spirits (Premium Spirits)' },
  { id: 'beer', label: 'Beer (Chilled Beers)' },
  { id: 'snacks', label: 'Snacks (Late Night Snacks)' },
  { id: 'mixers', label: 'Mixers' },
  { id: 'extras', label: 'Extras' },
  { id: 'gin', label: 'Gin' },
  { id: 'whisky', label: 'Whisky' },
  { id: 'whiskey', label: 'Whiskey' },
  { id: 'vodka', label: 'Vodka' },
  { id: 'rum', label: 'Rum' },
  { id: 'tequila', label: 'Tequila' },
  { id: 'brandy', label: 'Brandy' },
  { id: 'cognac', label: 'Cognac' },
  { id: 'liqueur', label: 'Liqueur' },
  { id: 'champagne', label: 'Champagne' }
] as const;

export function getAdminProductCategoryOptions(
  configuredCategories: Array<{ id: string; label: string }>
) {
  const options = new Map<string, { id: string; label: string }>();
  for (const category of ADMIN_PRODUCT_CATEGORY_OPTIONS) {
    options.set(category.id, { ...category });
  }
  for (const category of configuredCategories) {
    const id = category.id.trim();
    if (!id) continue;
    const normalizedId = id.toLowerCase();
    if (!options.has(normalizedId)) {
      options.set(normalizedId, { id, label: category.label.trim() || id });
    }
  }
  return [...options.values()];
}

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
