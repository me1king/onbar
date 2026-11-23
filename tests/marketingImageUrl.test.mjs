import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublicImageUrl } from '../lib/marketingImageUrl.ts';

test('accepts HTTPS and site-relative image URLs', () => {
  assert.deepEqual(normalizePublicImageUrl(' https://images.example.test/campaign.jpg '), {
    valid: true,
    imageUrl: 'https://images.example.test/campaign.jpg'
  });
  assert.deepEqual(normalizePublicImageUrl('/images/campaign.jpg'), {
    valid: true,
    imageUrl: '/images/campaign.jpg'
  });
});

test('keeps an omitted image optional', () => {
  assert.deepEqual(normalizePublicImageUrl(undefined), { valid: true, imageUrl: null });
  assert.deepEqual(normalizePublicImageUrl('  '), { valid: true, imageUrl: null });
});

test('rejects insecure, credentialed, and protocol-relative image URLs', () => {
  for (const value of [
    'http://images.example.test/campaign.jpg',
    'https://user:password@images.example.test/campaign.jpg',
    '//images.example.test/campaign.jpg',
    'javascript:alert(1)'
  ]) {
    assert.equal(normalizePublicImageUrl(value).valid, false, value);
  }
});

test('rejects malformed, oversized, and non-string image values', () => {
  assert.equal(normalizePublicImageUrl({ url: 'https://images.example.test/campaign.jpg' }).valid, false);
  assert.equal(normalizePublicImageUrl(`/${'a'.repeat(2000)}`).valid, false);
  assert.equal(normalizePublicImageUrl('/images/\ncampaign.jpg').valid, false);
});
