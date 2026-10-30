import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { buildTicketOrderEmailPreview } from '@/lib/ticketing/email.server';
import { isTicketThemeId } from '@/lib/ticketing/theme';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  }
  if (!['owner', 'admin'].includes(session.role.toLowerCase())) {
    return NextResponse.json({ error: 'Ticket email previews are restricted to platform admins.' }, { status: 403 });
  }

  const orderId = request.nextUrl.searchParams.get('order') || '';
  if (!uuidPattern.test(orderId)) {
    return NextResponse.json({ error: 'Choose a valid ticket order.' }, { status: 400 });
  }
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Ticketing storage is not configured.' }, { status: 503 });
  }

  try {
    const preview = await buildTicketOrderEmailPreview(database, orderId);
    return NextResponse.json({
      ...preview,
      themeLabel: isTicketThemeId(preview.theme) ? preview.theme : null,
      reconstructed: true
    }, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (error) {
    console.error('[TicketingSales] Could not build the buyer email preview:', error);
    return NextResponse.json({
      error: error instanceof Error && error.message.includes('Only paid ticket orders')
        ? error.message
        : 'The ticket email preview could not be built. Verify the order is paid and has active tickets.'
    }, { status: 503, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  }
}
