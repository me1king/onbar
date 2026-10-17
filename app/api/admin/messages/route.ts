import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

async function getAdminDatabase() {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  const canManageMessages = session?.role === 'owner' || session?.role === 'admin'
    || session?.permissions?.can_manage_customer_care === true
    || session?.permissions?.can_manage_communications === true;
  if (!session || !canManageMessages) {
    return { response: NextResponse.json({ error: 'Customer message access required.' }, { status: 403 }) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return { response: NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 }) };
  }

  return {
    client: createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    }),
    session
  };
}

export async function GET() {
  const result = await getAdminDatabase();
  if ('response' in result) return result.response;

  const { data, error } = await result.client
    .from('messages')
    .select('id, user_id, name, email, subject, message, status, admin_response, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[AdminMessages] Could not load customer messages:', error);
    return NextResponse.json({ error: `Could not load customer messages: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ messages: data || [] }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  });
}

export async function PATCH(request: Request) {
  const result = await getAdminDatabase();
  if ('response' in result) return result.response;

  let body: { id?: unknown; action?: unknown; status?: unknown; response?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid message update is required.' }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: 'A valid message ID is required.' }, { status: 400 });
  }

  let update: { status: string; admin_response?: string };
  if (body.action === 'status' && ['New', 'Read', 'Replied'].includes(String(body.status))) {
    update = { status: String(body.status) };
  } else if (body.action === 'reply' && typeof body.response === 'string') {
    const response = body.response.trim();
    if (!response || response.length > 4000) {
      return NextResponse.json({ error: 'The reply must be between 1 and 4,000 characters.' }, { status: 400 });
    }
    update = { status: 'Replied', admin_response: response };
  } else {
    return NextResponse.json({ error: 'The message update is invalid.' }, { status: 400 });
  }

  const { data, error } = await result.client
    .from('messages')
    .update(update)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[AdminMessages] Could not update customer message:', error);
    return NextResponse.json({ error: `Could not update customer message: ${error.message}` }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Customer message not found.' }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session || !['owner', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Admin access is required to delete customer messages.' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 });
  }

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: 'A valid message ID is required.' }, { status: 400 });
  }
  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await client.from('messages').delete().eq('id', id).select('id').maybeSingle();
  if (error) {
    console.error('[AdminMessages] Could not delete customer message:', error);
    return NextResponse.json({ error: `Could not delete customer message: ${error.message}` }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Customer message not found.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
