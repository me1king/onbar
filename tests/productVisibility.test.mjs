import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadTypeScriptModule(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', compiled)(module, module.exports);
  return module.exports;
}

const { getProductCreateVisibilityDefaults, isStorefrontProductVisible } = loadTypeScriptModule('../lib/productVisibility.ts');
const { isBeverageInventoryProduct } = loadTypeScriptModule('../lib/productDepartment.ts');

test('new products default to a visible storefront listing', () => {
  const defaults = getProductCreateVisibilityDefaults({});

  assert.deepEqual(defaults, { status: 'active', hide_product: false });
  assert.equal(isStorefrontProductVisible({ ...defaults, is_available_now: true }), true);
});

test('explicit draft and hidden states remain unpublished', () => {
  const defaults = getProductCreateVisibilityDefaults({ status: 'draft', hide_product: true });

  assert.deepEqual(defaults, { status: 'draft', hide_product: true });
  assert.equal(isStorefrontProductVisible(defaults), false);
});

test('an in-stock soft drink passes both beverage and storefront filters', () => {
  const product = {
    ...getProductCreateVisibilityDefaults({}),
    category: 'Soft Drinks',
    sub_category: 'Soft Drinks',
    stock: 8,
    is_available_now: true
  };

  assert.equal(isBeverageInventoryProduct(product), true);
  assert.equal(isStorefrontProductVisible(product), true);
  assert.equal(isStorefrontProductVisible({ ...product, stock: 0, is_available_now: false }), false);
});
