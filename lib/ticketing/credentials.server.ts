import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function getEncryptionKey() {
  const key = Buffer.from(process.env.TICKETING_CREDENTIAL_ENCRYPTION_KEY?.trim() || '', 'base64');
  if (key.length !== 32) {
    throw new Error('TICKETING_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return key;
}

export function assertTicketCredentialEncryptionKey() {
  getEncryptionKey();
}

export function hashTicketAccessToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createTicketCredentials(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    throw new Error('Ticket credential quantity is outside the supported range.');
  }

  const key = getEncryptionKey();
  return Array.from({ length: quantity }, () => {
    const credential = randomBytes(32).toString('base64url');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()]);
    const encrypted = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');

    return {
      credential,
      credential_hash: createHash('sha256').update(credential).digest('hex'),
      credential_ciphertext: encrypted
    };
  });
}

export function decryptTicketCredential(encrypted: string) {
  const payload = Buffer.from(encrypted, 'base64url');
  if (payload.length < 29) throw new Error('Stored ticket credential is invalid.');

  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
