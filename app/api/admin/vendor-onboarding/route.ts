import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const vendorTypes = ['retailer', 'wholesaler', 'street_food', 'rider'] as const;
const stages = ['called', 'phone_approved', 'visit_booked', 'visited_verified', 'test_order', 'live'] as const;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function authorize() {
  const session = await getAdminSession();
  if (!session || !hasAdminPermission(session, 'can_manage_settings')) {
    return { response: NextResponse.json({ error: 'Vendor onboarding management access is required.' }, { status: 403 }) };
  }
  const database = getDatabase();
  if (!database) {
    return { response: NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 }) };
  }
  return {
    session,
    actor: session.email || session.role,
    database
  };
}

function migrationMissing(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.code === 'PGRST202' || error.code === 'PGRST205'
    || /vendor_onboarding/i.test(error.message || '');
}

function migrationResponse() {
  return NextResponse.json({
    error: 'The vendor launch pipeline is not set up yet. Apply supabase/VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql, then reload.'
  }, { status: 503 });
}

function validateLead(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const businessName = typeof row.business_name === 'string' ? row.business_name.trim() : '';
  const ownerName = typeof row.owner_name === 'string' ? row.owner_name.trim() : '';
  const phone = typeof row.phone === 'string' ? row.phone.trim() : '';
  const area = typeof row.area === 'string' ? row.area.trim() : '';
  const vendorType = typeof row.vendor_type === 'string' ? row.vendor_type : '';
  const agent = typeof row.agent === 'string' && row.agent.trim() ? row.agent.trim() : 'Unassigned';
  const whatsapp = typeof row.whatsapp === 'string' ? row.whatsapp.trim() : '';
  const source = typeof row.source === 'string' ? row.source.trim() : '';
  const notes = typeof row.notes === 'string' ? row.notes.trim() : '';
  if (
    !businessName || businessName.length > 160 || !ownerName || ownerName.length > 160
    || phone.length < 5 || phone.length > 40 || !area || area.length > 160
    || !vendorTypes.includes(vendorType as typeof vendorTypes[number])
    || agent.length > 160 || whatsapp.length > 40 || source.length > 160 || notes.length > 2000
  ) return null;
  return {
    business_name: businessName,
    owner_name: ownerName,
    phone,
    whatsapp: whatsapp || null,
    area,
    vendor_type: vendorType,
    agent,
    source: source || null,
    notes: notes || null
  };
}

export async function GET(request: Request) {
  const access = await authorize();
  if ('response' in access) return access.response;

  const query = new URL(request.url).searchParams;
  const leadId = query.get('id');
  if (leadId && !idPattern.test(leadId)) {
    return NextResponse.json({ error: 'A valid lead ID is required.' }, { status: 400 });
  }

  if (leadId) {
    const [{ data: lead, error: leadError }, { data: events, error: eventError }] = await Promise.all([
      access.database.from('vendor_onboarding_leads').select('*').eq('id', leadId).maybeSingle(),
      access.database.from('vendor_onboarding_events').select('id,event_type,actor,details,created_at')
        .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(100)
    ]);
    if (leadError || eventError) {
      const error = leadError || eventError;
      if (error && migrationMissing(error)) return migrationResponse();
      console.error('[VendorOnboarding] Could not load lead detail:', error);
      return NextResponse.json({ error: 'Could not load onboarding lead details.' }, { status: 503 });
    }
    if (!lead) return NextResponse.json({ error: 'Onboarding lead not found.' }, { status: 404 });
    const { data: checklist, error: checklistError } = await access.database.from('vendor_onboarding_checklist')
      .select('id,item_key,label,is_required,is_complete,completed_at,completed_by')
      .eq('lead_id', leadId).order('id');
    if (checklistError) {
      if (migrationMissing(checklistError)) return migrationResponse();
      console.error('[VendorOnboarding] Could not load lead checklist:', checklistError);
      return NextResponse.json({ error: 'Could not load the field visit checklist.' }, { status: 503 });
    }
    return NextResponse.json({ lead, checklist: checklist || [], events: events || [] }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  }

  const { data: leads, error: leadsError } = await access.database.from('vendor_onboarding_leads')
    .select('*').order('created_at', { ascending: false }).limit(500);
  if (leadsError) {
    if (migrationMissing(leadsError)) return migrationResponse();
    console.error('[VendorOnboarding] Could not load lead pipeline:', leadsError);
    return NextResponse.json({ error: 'Could not load the vendor onboarding pipeline.' }, { status: 503 });
  }
  const ids = (leads || []).map(lead => lead.id);
  let checklist: Array<Record<string, unknown>> = [];
  if (ids.length) {
    const { data, error } = await access.database.from('vendor_onboarding_checklist')
      .select('id,lead_id,item_key,label,is_required,is_complete,completed_at,completed_by')
      .in('lead_id', ids).order('id');
    if (error) {
      if (migrationMissing(error)) return migrationResponse();
      console.error('[VendorOnboarding] Could not load pipeline checklists:', error);
      return NextResponse.json({ error: 'Could not load onboarding checklist progress.' }, { status: 503 });
    }
    checklist = data || [];
  }
  return NextResponse.json({
    leads: leads || [],
    checklist,
    vendorTypes,
    stages
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const access = await authorize();
  if ('response' in access) return access.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Provide a valid lead or batch of leads.' }, { status: 400 });
  }
  const rows = Array.isArray(body.leads) ? body.leads : [body];
  if (!rows.length || rows.length > 100) {
    return NextResponse.json({ error: 'Add between 1 and 100 leads at a time.' }, { status: 400 });
  }
  const validatedLeads = rows.map(validateLead);
  if (validatedLeads.some(lead => !lead)) {
    return NextResponse.json({
      error: 'Every lead needs a business name, owner, phone (5–40 characters), area, and supported vendor type.'
    }, { status: 400 });
  }
  const leads = validatedLeads.filter((lead): lead is NonNullable<typeof lead> => lead !== null);

  const { data: created, error } = await access.database.rpc('create_vendor_onboarding_leads', {
    p_leads: leads,
    p_actor: access.actor
  });
  if (error) {
    if (migrationMissing(error)) return migrationResponse();
    console.error('[VendorOnboarding] Could not create leads:', error);
    return NextResponse.json({ error: 'Could not save the leads, checklists, and audit history.' }, { status: 503 });
  }
  return NextResponse.json({ leads: created || [] }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const access = await authorize();
  if ('response' in access) return access.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid onboarding update is required.' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  const action = typeof body.action === 'string' ? body.action : '';
  if (!idPattern.test(id)) return NextResponse.json({ error: 'Select a valid onboarding lead.' }, { status: 400 });

  let result;
  let error;
  if (action === 'advance') {
    if (typeof body.stage !== 'string' || !stages.includes(body.stage as typeof stages[number])) {
      return NextResponse.json({ error: 'Select a valid next stage.' }, { status: 400 });
    }
    ({ data: result, error } = await access.database.rpc('advance_vendor_onboarding_lead', {
      p_lead_id: id,
      p_stage: body.stage,
      p_actor: access.actor
    }));
  } else if (action === 'checklist') {
    if (typeof body.item_key !== 'string' || body.item_key.length > 100 || typeof body.is_complete !== 'boolean') {
      return NextResponse.json({ error: 'Select a valid checklist item and completion state.' }, { status: 400 });
    }
    ({ data: result, error } = await access.database.rpc('set_vendor_onboarding_checklist_item', {
      p_lead_id: id,
      p_item_key: body.item_key,
      p_is_complete: body.is_complete,
      p_actor: access.actor
    }));
  } else if (action === 'checkin') {
    if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number'
      || !Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)
      || body.latitude < -90 || body.latitude > 90 || body.longitude < -180 || body.longitude > 180) {
      return NextResponse.json({ error: 'Field check-in needs valid device coordinates.' }, { status: 400 });
    }
    ({ data: result, error } = await access.database.rpc('record_vendor_onboarding_checkin', {
      p_lead_id: id,
      p_lat: body.latitude,
      p_lng: body.longitude,
      p_actor: access.actor
    }));
  } else if (action === 'schedule_visit') {
    if (typeof body.visit_scheduled_at !== 'string' || !Number.isFinite(Date.parse(body.visit_scheduled_at))) {
      return NextResponse.json({ error: 'Choose a valid visit date and time.' }, { status: 400 });
    }
    ({ data: result, error } = await access.database.rpc('schedule_vendor_onboarding_visit', {
      p_lead_id: id,
      p_visit_scheduled_at: body.visit_scheduled_at,
      p_actor: access.actor
    }));
  } else if (action === 'launch_check') {
    const check = body.check;
    if (!['test_order', 'second_review'].includes(String(check)) || typeof body.passed !== 'boolean') {
      return NextResponse.json({ error: 'Select a valid test-order or second-review result.' }, { status: 400 });
    }
    ({ data: result, error } = await access.database.rpc('set_vendor_onboarding_launch_checks', {
      p_lead_id: id,
      p_check: check,
      p_passed: body.passed,
      p_actor: access.actor
    }));
  } else if (action === 'edit') {
    const agent = typeof body.agent === 'string' ? body.agent.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    if (!agent || agent.length > 160 || notes.length > 2000) {
      return NextResponse.json({ error: 'Agent is required (up to 160 characters); notes may be up to 2,000 characters.' }, { status: 400 });
    }
    ({ data: result, error } = await access.database.rpc('update_vendor_onboarding_lead', {
      p_lead_id: id,
      p_agent: agent,
      p_notes: notes,
      p_actor: access.actor
    }));
  } else {
    return NextResponse.json({ error: 'Unsupported onboarding update.' }, { status: 400 });
  }

  if (error) {
    if (migrationMissing(error)) return migrationResponse();
    const message = error.message || '';
    const stageConflict = /only the next onboarding stage|complete and verify|required before launch|field visit check-in|booked visit|test-order stage|passed test order|second-person review|future visit date|after phone approval|schedule a (?:future )?visit/i.test(message);
    const notFound = /not found/i.test(message);
    if (!stageConflict && !notFound) console.error('[VendorOnboarding] Update failed:', error);
    return NextResponse.json({
      error: stageConflict
        ? message
        : notFound
          ? 'Onboarding lead or checklist item not found.'
          : 'Could not save the onboarding update.'
    }, { status: notFound ? 404 : stageConflict ? 409 : 503 });
  }
  if (!result) return NextResponse.json({ error: 'Onboarding lead not found.' }, { status: 404 });
  return NextResponse.json({ result });
}
