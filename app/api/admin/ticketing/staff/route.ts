import { NextResponse } from 'next/server';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorize() {
  const session = await getAdminSession();
  if (!session) return { session: null, response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  if (!['owner', 'admin'].includes(session.role.toLowerCase())) {
    return { session: null, response: NextResponse.json({ error: 'Only platform admins can manage gate assignments.' }, { status: 403 }) };
  }
  return { session, response: null };
}

async function findAuthUser(database: NonNullable<ReturnType<typeof createServerSupabaseClient>>, email: string) {
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await database.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find(candidate => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  throw new Error('Too many auth users to safely resolve the gate staff account. Contact support.');
}

async function getAssignedUserEmails(
  database: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  userIds: string[]
) {
  const emails = new Map<string, string>();
  const remaining = new Set(userIds);
  for (let page = 1; page <= 100 && remaining.size > 0; page++) {
    const { data, error } = await database.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      if (remaining.delete(user.id)) emails.set(user.id, user.email || 'Email unavailable');
    }
    if (data.users.length < 1000) break;
  }
  return emails;
}

export async function GET() {
  const { response } = await authorize();
  if (response) return response;
  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Ticketing storage is not configured.' }, { status: 503 });

  const [eventsResult, assignmentsResult] = await Promise.all([
    database.from('ticketing_events').select('id,title,status,starts_at,ends_at').order('starts_at', { ascending: true }).limit(200),
    database.from('ticketing_staff_assignments')
      .select('id,event_id,user_id,role,gate_name,active,created_at')
      .eq('role', 'gate_staff')
      .order('created_at', { ascending: false })
      .limit(500)
  ]);
  const queryError = eventsResult.error || assignmentsResult.error;
  if (queryError) {
    console.error('[TicketingStaff] Could not load events or gate assignments:', queryError);
    return NextResponse.json({ error: 'Gate assignments could not be loaded. Confirm the Ticketing core migration is installed.' }, { status: 503 });
  }

  try {
    const assignments = assignmentsResult.data || [];
    const userEmails = await getAssignedUserEmails(database, [...new Set(assignments.map(item => item.user_id))]);
    return NextResponse.json({
      events: eventsResult.data || [],
      assignments: assignments.map(item => ({
        ...item,
        email: userEmails.get(item.user_id) || 'Auth user not found'
      }))
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('[TicketingStaff] Could not resolve assigned staff accounts:', error);
    return NextResponse.json({ error: 'Gate assignment accounts could not be resolved.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const { response } = await authorize();
  if (response) return response;
  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Ticketing storage is not configured.' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid gate-assignment request is required.' }, { status: 400 });
  }

  if (body.action === 'revoke') {
    const assignmentId = typeof body.assignmentId === 'string' ? body.assignmentId : '';
    if (!uuidPattern.test(assignmentId)) return NextResponse.json({ error: 'Select a valid gate assignment.' }, { status: 400 });
    const { data, error } = await database.from('ticketing_staff_assignments')
      .update({ active: false })
      .eq('id', assignmentId)
      .eq('role', 'gate_staff')
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[TicketingStaff] Could not revoke gate assignment:', error);
      return NextResponse.json({ error: 'The gate assignment could not be revoked.' }, { status: 503 });
    }
    if (!data) return NextResponse.json({ error: 'The gate assignment was not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (body.action !== 'assign') return NextResponse.json({ error: 'Choose whether to assign or revoke gate access.' }, { status: 400 });
  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const gateName = typeof body.gateName === 'string' ? body.gateName.trim() : '';
  if (!uuidPattern.test(eventId) || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || gateName.length > 120) {
    return NextResponse.json({ error: 'Enter a valid event, staff account email, and gate name (up to 120 characters).' }, { status: 400 });
  }

  try {
    const [eventResult, user] = await Promise.all([
      database.from('ticketing_events').select('id').eq('id', eventId).maybeSingle(),
      findAuthUser(database, email)
    ]);
    if (eventResult.error) throw eventResult.error;
    if (!eventResult.data) return NextResponse.json({ error: 'The selected event was not found.' }, { status: 404 });
    if (!user) return NextResponse.json({ error: 'Create the staff member’s verified Supabase sign-in account before assigning gate access.' }, { status: 404 });
    if (!user.email_confirmed_at) {
      return NextResponse.json({ error: 'The staff member must verify their Supabase sign-in email before gate access is assigned.' }, { status: 409 });
    }

    const { data, error } = await database.from('ticketing_staff_assignments')
      .upsert({
        event_id: eventId,
        user_id: user.id,
        role: 'gate_staff',
        gate_name: gateName,
        active: true
      }, { onConflict: 'event_id,user_id,role' })
      .select('id,event_id,user_id,role,gate_name,active,created_at')
      .single();
    if (error) throw error;
    return NextResponse.json({ assignment: { ...data, email: user.email } }, { status: 201 });
  } catch (error) {
    console.error('[TicketingStaff] Could not assign gate access:', error);
    return NextResponse.json({ error: 'Gate access could not be assigned. Confirm the Ticketing core migration and staff account are available.' }, { status: 503 });
  }
}
