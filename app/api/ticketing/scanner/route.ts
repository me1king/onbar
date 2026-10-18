import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hashPattern = /^[0-9a-f]{64}$/;
const scanMethods = ['qr', 'manual'] as const;

function createAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function authenticate(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { user: null, response: NextResponse.json({ error: 'Sign in with your assigned gate-staff account.' }, { status: 401 }) };
  const auth = createAuthClient();
  if (!auth) return { user: null, response: NextResponse.json({ error: 'Gate-staff authentication is not configured.' }, { status: 503 }) };
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user || !data.user.email_confirmed_at) {
    return { user: null, response: NextResponse.json({ error: 'Your verified staff session is invalid or expired.' }, { status: 401 }) };
  }
  return { user: data.user, response: null };
}

export async function GET(request: Request) {
  const { user, response } = await authenticate(request);
  if (response) return response;
  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Ticketing storage is not configured.' }, { status: 503 });

  const { data: assignments, error: assignmentError } = await database
    .from('ticketing_staff_assignments')
    .select('event_id,gate_name')
    .eq('user_id', user!.id)
    .eq('role', 'gate_staff')
    .eq('active', true)
    .limit(100);
  if (assignmentError) {
    console.error('[TicketingScanner] Could not load gate assignments:', assignmentError);
    return NextResponse.json({ error: 'Gate assignments could not be loaded. Contact the event administrator.' }, { status: 503 });
  }

  const eventIds = [...new Set((assignments || []).map(assignment => assignment.event_id))];
  const { data: events, error: eventsError } = eventIds.length
    ? await database.from('ticketing_events')
      .select('id,title,venue_name,city,starts_at,ends_at,doors_open_at,status')
      .in('id', eventIds)
      .order('starts_at', { ascending: true })
    : { data: [], error: null };
  if (eventsError) {
    console.error('[TicketingScanner] Could not load assigned events:', eventsError);
    return NextResponse.json({ error: 'Assigned events could not be loaded.' }, { status: 503 });
  }

  const { data: scans, error: scansError } = eventIds.length
    ? await database.from('ticketing_checkins')
      .select('id,event_id,gate_name,device_id,scanner_name,scan_method,result,scanned_at')
      .eq('staff_user_id', user!.id)
      .in('event_id', eventIds)
      .order('scanned_at', { ascending: false })
      .limit(30)
    : { data: [], error: null };
  if (scansError) {
    if (/scanner_name|scan_method|schema cache|ticketing_checkins/i.test(scansError.message)) {
      return NextResponse.json({
        error: 'Apply supabase/TICKETING_SCANNER_HISTORY_MIGRATION.sql to enable scanner history and device identification.'
      }, { status: 503 });
    }
    console.error('[TicketingScanner] Could not load scan history:', scansError);
    return NextResponse.json({ error: 'Recent scan history could not be loaded.' }, { status: 503 });
  }
  const eventNames = new Map((events || []).map(event => [event.id, event.title]));

  return NextResponse.json({
    events: (events || []).map(event => ({
      ...event,
      gate_name: assignments?.find(assignment => assignment.event_id === event.id)?.gate_name || ''
    })),
    history: (scans || []).map(scan => ({
      id: scan.id,
      eventName: eventNames.get(scan.event_id) || 'Assigned event',
      gateName: scan.gate_name,
      deviceId: scan.device_id,
      scannerName: scan.scanner_name,
      method: scan.scan_method,
      result: scan.result,
      scannedAt: scan.scanned_at
    }))
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const { user, response } = await authenticate(request);
  if (response) return response;
  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Ticketing storage is not configured.' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid ticket scan is required.' }, { status: 400 });
  }
  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  const credentialHash = typeof body.credentialHash === 'string' ? body.credentialHash.toLowerCase() : '';
  const deviceId = typeof body.deviceId === 'string' && body.deviceId.trim()
    ? body.deviceId.trim().slice(0, 120)
    : 'unidentified-scanner';
  const scannerName = typeof body.scannerName === 'string' && body.scannerName.trim()
    ? body.scannerName.trim().slice(0, 120)
    : 'Unidentified scanner';
  const scanMethod = typeof body.scanMethod === 'string' && scanMethods.includes(body.scanMethod as typeof scanMethods[number])
    ? body.scanMethod
    : 'qr';
  if (!uuidPattern.test(eventId) || !hashPattern.test(credentialHash)) {
    return NextResponse.json({ error: 'The event or ticket credential is invalid.' }, { status: 400 });
  }

  const { data: assignment, error: assignmentError } = await database
    .from('ticketing_staff_assignments')
    .select('gate_name')
    .eq('event_id', eventId)
    .eq('user_id', user!.id)
    .eq('role', 'gate_staff')
    .eq('active', true)
    .maybeSingle();
  if (assignmentError) {
    console.error('[TicketingScanner] Could not verify event access:', assignmentError);
    return NextResponse.json({ error: 'Event access could not be verified.' }, { status: 503 });
  }
  if (!assignment) return NextResponse.json({ error: 'You are not assigned to scan tickets for this event.' }, { status: 403 });

  const { data, error } = await database.rpc('ticketing_check_in', {
    p_event_id: eventId,
    p_credential_hash: credentialHash,
    p_gate_name: assignment.gate_name || '',
    p_staff_user_id: user!.id,
    p_device_id: deviceId,
    p_scanner_name: scannerName,
    p_scan_method: scanMethod
  });
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'Your gate-staff assignment is no longer active for this event.' }, { status: 403 });
    if (error.code === '22023') return NextResponse.json({ error: 'The scanned ticket credential is invalid.' }, { status: 400 });
    if (/ticketing_check_in|schema cache/i.test(error.message)) {
      return NextResponse.json({ error: 'Apply supabase/TICKETING_SCANNER_HISTORY_MIGRATION.sql before using the scanner.' }, { status: 503 });
    }
    console.error('[TicketingScanner] Check-in failed:', error);
    return NextResponse.json({ error: 'The ticket could not be checked in. Try again when the connection is stable.' }, { status: 503 });
  }
  if (!data || typeof data !== 'object' || typeof data.result !== 'string') {
    console.error('[TicketingScanner] Check-in returned an unexpected response.');
    return NextResponse.json({ error: 'The check-in response could not be verified.' }, { status: 503 });
  }

  const resultMessages: Record<string, { status: string; message: string }> = {
    accepted: { status: 'valid', message: 'Entry approved.' },
    already_used: { status: 'used', message: 'Already checked in.' },
    invalid: { status: 'invalid', message: 'Ticket was not found.' },
    refunded: { status: 'invalid', message: 'Ticket has been refunded.' },
    revoked: { status: 'invalid', message: 'Ticket is no longer valid.' },
    wrong_event: { status: 'invalid', message: 'Ticket is for another event.' },
    unpaid: { status: 'invalid', message: 'Payment is not confirmed.' },
    event_closed: { status: 'invalid', message: 'This event is not open for admission.' },
    rate_limited: { status: 'invalid', message: 'Too many scans. Pause briefly and try again.' }
  };
  const summary = resultMessages[data.result];
  if (!summary) {
    console.error('[TicketingScanner] Check-in returned an unsupported result:', data.result);
    return NextResponse.json({ error: 'The check-in response could not be verified.' }, { status: 503 });
  }

  return NextResponse.json({
    result: data.result,
    ...summary,
    ticketReference: data.ticket_reference || null,
    ticket: data.ticket_reference ? {
      reference: data.ticket_reference,
      type: data.ticket_type || null,
      gate: assignment.gate_name || ''
    } : null
  }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}
