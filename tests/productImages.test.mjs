import test from 'node:test';
import assert from 'node:assert/strict';
import { getProductImageUrls } from '../lib/productImages.ts';

test('returns the primary and gallery photos once, in display order', () => {
  assert.deepEqual(
    getProductImageUrls(' https://img.test/front.jpg ', [
      'https://img.test/front.jpg',
      'https://img.test/back.jpg',
      '',
      null
    ]),
    ['https://img.test/front.jpg', 'https://img.test/back.jpg']
  );
});

test('uses gallery images when the primary image is missing', () => {
  assert.deepEqual(getProductImageUrls(null, ['https://img.test/one.jpg']), ['https://img.test/one.jpg']);
  assert.deepEqual(getProductImageUrls(null, null), []);
});

test('includes legacy image_gallery photos when finding product images', () => {
  assert.deepEqual(
    getProductImageUrls(null, [], ['https://img.test/legacy.jpg']),
    ['https://img.test/legacy.jpg']
  );
});

test('supports object and JSON-encoded gallery entries', () => {
  assert.deepEqual(
    getProductImageUrls(
      { url: 'https://img.test/front.jpg' },
      [{ src: 'https://img.test/back.jpg' }, '["https://img.test/side.jpg"]']
    ),
    [
      'https://img.test/front.jpg',
      'https://img.test/back.jpg',
      'https://img.test/side.jpg'
    ]
  );
});
