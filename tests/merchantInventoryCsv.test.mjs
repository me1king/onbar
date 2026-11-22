import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMerchantInventoryCsv } from '../lib/merchantInventoryCsv.ts';

test('parses quoted CSV values, escaped quotes, CRLF rows and a UTF-8 BOM', () => {
  assert.deepEqual(
    parseMerchantInventoryCsv('\uFEFFproduct_id,supplier_name,lot_code\r\n101,"Mama ""Njeri"", Ltd",LOT-1\r\n'),
    [
      ['product_id', 'supplier_name', 'lot_code'],
      ['101', 'Mama "Njeri", Ltd', 'LOT-1']
    ]
  );
});

test('rejects unclosed quoted fields instead of silently shifting stock columns', () => {
  assert.throws(
    () => parseMerchantInventoryCsv('product_id,quantity\n101,"12'),
    /unclosed quoted field/
  );
});
