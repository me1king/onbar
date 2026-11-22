export interface DepartmentProduct {
  category?: string | null;
  sub_category?: string | null;
  is_bite?: boolean | null;
  is_snack?: boolean | null;
  is_souvenir?: boolean | null;
}

const beverageCategoryPattern = /\b(beverages?|drinks?|alcohol(?:ic)?|liquors?|wines?|beers?|ciders?|ales?|lagers?|stouts?|hard seltzers?|whisk(?:e)?y|vodka|gin|rum|tequila|brandy|cognac|champagne|liqueurs?|spirits?|soft drinks?|energy|water|mineral water|juices?|coffee|tea|mixers?|cocktail mixers?|soda|tonic)\b/i;
const foodCategoryPattern = /\b(food|meal|meals|street|burger|burgers|wings|sides)\b/i;
const snackCategoryPattern = /\b(snack|snacks|munch|munchies|crisps|chocolate|nuts)\b/i;
const merchandiseCategoryPattern = /\b(souvenir|souvenirs|gift|gifts|merchandise|merch|apparel|clothing|extras?|accessor(?:y|ies)|glassware|tumblers?|flasks?|barware|opener|openers)\b/i;

function hasBeverageCategory(product: DepartmentProduct) {
  return beverageCategoryPattern.test(`${product.category || ''} ${product.sub_category || ''}`);
}

export function isBeverageInventoryProduct(product: DepartmentProduct) {
  if (
    product.is_souvenir === true ||
    product.is_bite === true ||
    product.is_snack === true
  ) return false;

  const category = `${product.category || ''} ${product.sub_category || ''}`;
  if (merchandiseCategoryPattern.test(category) || foodCategoryPattern.test(category) || snackCategoryPattern.test(category)) {
    return false;
  }
  return beverageCategoryPattern.test(category);
}

export function isMealProduct(product: DepartmentProduct) {
  if (hasBeverageCategory(product)) return false;
  if (snackCategoryPattern.test(product.category || '')) return false;
  return product.is_bite === true || foodCategoryPattern.test(product.category || '');
}

export function isSnackProduct(product: DepartmentProduct) {
  if (hasBeverageCategory(product)) return false;
  if (foodCategoryPattern.test(product.category || '')) return false;
  return snackCategoryPattern.test(product.category || '')
    || (product.is_snack === true && product.is_bite !== true);
}

export function isKitchenFoodProduct(product: DepartmentProduct) {
  return isMealProduct(product) || isSnackProduct(product);
}
