import { NextResponse } from 'next/server';
import { getWebPushPublicKey, isWebPushConfigured } from '@/lib/webPush.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    configured: isWebPushConfigured(),
    publicKey: getWebPushPublicKey()
  }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}
