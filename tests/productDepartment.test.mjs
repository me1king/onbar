import test from 'node:test';
import assert from 'node:assert/strict';
import { isBeverageInventoryProduct, isKitchenFoodProduct } from '../lib/productDepartment.ts';

test('recognizes common generic alcohol categories for merchant beverage catalogs', () => {
  for (const category of ['Spirits', 'Liquor', 'Liquors', 'Alcoholic Beverages', 'Hard Cider', 'Beer', 'Wine']) {
    assert.equal(isBeverageInventoryProduct({ category }), true, `${category} should be available as a beverage`);
  }
});

test('keeps food and merchandise out of merchant beverage catalogs', () => {
  assert.equal(isBeverageInventoryProduct({ category: 'Snacks', is_snack: true }), false);
  assert.equal(isBeverageInventoryProduct({ category: 'Barware', is_souvenir: true }), false);
  assert.equal(isKitchenFoodProduct({ category: 'Spirits' }), false);
});
