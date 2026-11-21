import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function getEncryptionKey() {
  const key = Buffer.from(process.env.MERCHANT_PAYOUT_DATA_ENCRYPTION_KEY?.trim() || '', 'base64');
  if (key.length !== 32) {
    throw new Error('Merchant payout storage is not configured. Set MERCHANT_PAYOUT_DATA_ENCRYPTION_KEY to a base64-encoded 32-byte key.');
  }
  return key;
}

export function normalizeMerchantMpesaPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const normalized = digits.startsWith('254')
    ? digits
    : digits.startsWith('0')
      ? `254${digits.slice(1)}`
      : `254${digits}`;
  if (!/^254[17]\d{8}$/.test(normalized)) {
    throw new Error('Enter a valid Kenyan M-Pesa number.');
  }
  return normalized;
}

export function maskMerchantPayoutDestination(account: string) {
  return `****${account.slice(-4)}`;
}

export function encryptMerchantPayoutDestination(account: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(account, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

export function decryptMerchantPayoutDestination(value: string) {
  const payload = Buffer.from(value, 'base64url');
  if (payload.length < 29) throw new Error('Stored merchant payout destination is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  const plaintext = Buffer.concat([
    decipher.update(payload.subarray(28)),
    decipher.final()
  ]).toString('utf8');
  if (!/^254[17]\d{8}$/.test(plaintext)) {
    throw new Error('Stored merchant payout destination is invalid.');
  }
  return plaintext;
}
