import 'server-only';

import { createCipheriv, createHash, randomBytes } from 'node:crypto';

type Database = ReturnType<typeof import('@/lib/serverSupabase').createServerSupabaseClient>;

export function encryptTicketingCredential(credential: string) {
  const configured = process.env.TICKETING_TICKET_ENCRYPTION_KEY?.trim();
  if (!configured || configured.length < 32) {
    throw new Error('TICKETING_TICKET_ENCRYPTION_KEY must contain at least 32 characters.');
  }
  const key = createHash('sha256').update(configured).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export async function sendTransferredTicketAccess(database: NonNullable<Database>, ticketReference: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await database.rpc('ticketing_create_transfer_access_link', {
    p_ticket_reference: ticketReference,
    p_email: normalizedEmail,
    p_token_hash: tokenHash
  });
  if (error) throw error;
  const result = data as { created?: boolean; rate_limited?: boolean } | null;
  if (!result?.created) {
    if (result?.rate_limited) throw new Error('Too many ticket access emails were requested. Please try again later.');
    throw new Error('No approved transferred ticket matches those details.');
  }

  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const publicUrl = process.env.TICKETING_PUBLIC_URL?.trim().replace(/\/$/, '');
  if (!from || !/^(?:[^<>]+<[^<>@\s]+@[^<>\s@]+>|[^<>\s@]+@[^<>\s@]+)$/.test(from) || !apiKey || !publicUrl) {
    throw new Error('Ticket transfer email is not configured. Set RESEND_API_KEY, RESEND_FROM_EMAIL and TICKETING_PUBLIC_URL.');
  }
  const claimUrl = `${publicUrl}/tickets/claim?token=${encodeURIComponent(token)}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [normalizedEmail],
      subject: 'Your transferred Midnight Society KE ticket',
      text: `The ticket transfer has been approved. Ticket reference: ${ticketReference}. Open this one-time link within 30 minutes to access your ticket: ${claimUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#211326"><h1>Your ticket transfer is approved</h1><p>Ticket reference: <strong>${ticketReference}</strong></p><p>Use this secure, one-time link within 30 minutes to open your transferred ticket.</p><p><a href="${claimUrl}">Open transferred ticket</a></p></div>`
    }),
    cache: 'no-store'
  });
  if (!response.ok) {
    console.error('[TicketingTransferEmail] Delivery returned HTTP', response.status);
    throw new Error('The transfer is approved, but ticket access email could not be delivered. Request a new access link.');
  }
}
