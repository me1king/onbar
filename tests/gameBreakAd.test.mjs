import test from 'node:test';
import assert from 'node:assert/strict';
import { isClearlyNonAlcoholicProduct } from '../lib/nonAlcoholicProducts.ts';

test('only clearly alcohol-free, catalog-labelled drinks qualify for game ads', () => {
  assert.equal(isClearlyNonAlcoholicProduct({ name: 'Spring Water', category: 'Beverages' }), true);
  assert.equal(isClearlyNonAlcoholicProduct({ name: 'Zero Proof Spritz', category: 'Non-alcoholic' }), true);
  assert.equal(isClearlyNonAlcoholicProduct({ name: 'Ginger Beer', category: 'Beverages' }), false);
  assert.equal(isClearlyNonAlcoholicProduct({ name: 'Sparkling Wine', category: 'Water' }), false);
  assert.equal(isClearlyNonAlcoholicProduct({ name: 'Mystery Drink', category: 'Beverages' }), false);
});
