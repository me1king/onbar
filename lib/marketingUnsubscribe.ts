import { createHmac, timingSafeEqual } from 'node:crypto';

function signingKey() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!key) throw new Error('Server-side marketing signing is not configured.');
    return key;
}

export function createMarketingUnsubscribeToken(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const encodedEmail = Buffer.from(normalizedEmail, 'utf8').toString('base64url');
    const signature = createHmac('sha256', signingKey()).update(normalizedEmail).digest('hex');
    return `${encodedEmail}.${signature}`;
}

export function verifyMarketingUnsubscribeToken(token: string) {
    const [encodedEmail, suppliedSignature, ...rest] = token.split('.');
    if (!encodedEmail || !suppliedSignature || rest.length > 0) return null;

    let email: string;
    try {
        email = Buffer.from(encodedEmail, 'base64url').toString('utf8').trim().toLowerCase();
    } catch {
        return null;
    }
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

    const expectedSignature = createHmac('sha256', signingKey()).update(email).digest();
    let signature: Buffer;
    try {
        signature = Buffer.from(suppliedSignature, 'hex');
    } catch {
        return null;
    }
    if (signature.length !== expectedSignature.length || !timingSafeEqual(signature, expectedSignature)) return null;
    return email;
}
