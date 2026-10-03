function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
}

/**
 * Universal Base64 Encoder (Safe for Unicode and Edge Runtime)
 */
function toBase64(str: string): string {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    let binary = "";
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Universal Base64 Decoder (Safe for Unicode and Edge Runtime)
 */
function fromBase64(str: string): string {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
}

/**
 * Portable signing function using Web Crypto API (Edge Runtime Compatible)
 */
async function signToken(token: string) {
  const sessionSecret = getSessionSecret();
  if (!sessionSecret) {
    throw new Error('Admin session signing is not configured.');
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(sessionSecret);
  const data = encoder.encode(token);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, data);

  // Convert signature to hex string
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Creates a session cookie with role, granular permissions, and optional supplier ID
 */
export async function createSessionCookie(
    role: string = 'owner',
    permissions: Record<string, boolean | string[]> = {},
    supplier_id: string | null = null,
    email = ''
) {
  const token = crypto.randomUUID();
  const payload = JSON.stringify({
    role,
    permissions,
    supplier_id,
    email,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  });

  const base64Payload = toBase64(payload);

  const signature = await signToken(`${token}.${base64Payload}`);
  return `${signature}.${token}.${base64Payload}`;
}

/**
 * Verifies the cookie and returns the role, permissions, and supplier ID if valid
 */
export async function verifySessionCookie(value?: string): Promise<{
    role: string;
    permissions: Record<string, boolean | string[]>;
    supplier_id?: string | null;
    email?: string;
} | null> {
  if (!value || !getSessionSecret()) return null;

  try {
    const parts = value.split('.');
    if (parts.length !== 3) return null;

    const [signature, token, base64Payload] = parts;

    if (!/^[a-f0-9]{64}$/i.test(signature)) {
      return null;
    }

    const sessionSecret = getSessionSecret();
    if (!sessionSecret) return null;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(sessionSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signatureBytes = new Uint8Array(signature.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    const isSignatureValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      new TextEncoder().encode(`${token}.${base64Payload}`)
    );
    if (!isSignatureValid) return null;

    const payload: unknown = JSON.parse(fromBase64(base64Payload));
    if (typeof payload !== 'object' || payload === null) return null;
    const session = payload as {
      role?: unknown;
      permissions?: unknown;
      supplier_id?: unknown;
      email?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof session.role !== 'string'
      || typeof session.permissions !== 'object'
      || session.permissions === null
      || (session.expiresAt !== undefined && (
        typeof session.expiresAt !== 'number' || session.expiresAt <= Date.now()
      ))
    ) return null;

    return {
        role: session.role,
        permissions: session.permissions as Record<string, boolean | string[]>,
        supplier_id: typeof session.supplier_id === 'string' ? session.supplier_id : null,
        email: typeof session.email === 'string' ? session.email : undefined
    };
  } catch (err) {
    console.error("Auth Verification Error:", err);
    return null;
  }
}
