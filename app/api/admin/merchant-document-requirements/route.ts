import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { isMerchantBusinessType } from '@/lib/merchantApplications';

export const dynamic = 'force-dynamic';

const documentTypes = [
  'business_registration',
  'county_license',
  'food_hygiene',
  'tax_document',
  'premises_document',
  'other_permit'
] as const;

async function getAuthorizedDatabase() {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!['owner', 'admin'].includes(session.role) && session.permissions.can_manage_settings !== true) {
    return { response: NextResponse.json({ error: 'Document requirement configuration access is required.' }, { status: 403 }) };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return { response: NextResponse.json({ error: 'Merchant operations database access is not configured.' }, { status: 503 }) };
  return {
    database: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }),
    actor: session.email || (session.role === 'owner' ? 'Owner' : 'Admin')
  };
}

function isDocumentType(value: unknown): value is (typeof documentTypes)[number] {
  return typeof value === 'string' && documentTypes.includes(value as (typeof documentTypes)[number]);
}

export async function GET() {
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;
  const { data, error } = await access.database.from('merchant_document_requirements')
    .select('id, business_type, county, document_type, label, is_required, is_active, created_at')
    .order('county').order('business_type').order('document_type');
  if (error) {
    console.error('[MerchantRequirements] Could not load configuration:', error);
    return NextResponse.json({ error: 'Document requirement configuration could not be loaded.' }, { status: 503 });
  }
  return NextResponse.json({ requirements: data || [] }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function POST(request: Request) {
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;
  let body: { businessType?: unknown; county?: unknown; documentType?: unknown; label?: unknown; required?: unknown; active?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid document requirement is required.' }, { status: 400 });
  }
  const businessType = body.businessType === '*' ? '*' : body.businessType;
  const county = typeof body.county === 'string' ? body.county.trim().slice(0, 100).toLowerCase() || '*' : '';
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 120) : '';
  if (
    !(businessType === '*' || isMerchantBusinessType(businessType))
    || !county
    || !isDocumentType(body.documentType)
    || label.length < 2
    || typeof body.required !== 'boolean'
    || typeof body.active !== 'boolean'
  ) {
    return NextResponse.json({ error: 'Provide a supported business type, county or *, document, label, and boolean requirement settings.' }, { status: 400 });
  }
  const { data, error } = await access.database.from('merchant_document_requirements').insert({
    business_type: businessType,
    county,
    document_type: body.documentType,
    label,
    is_required: body.required,
    is_active: body.active
  }).select('id, business_type, county, document_type, label, is_required, is_active').single();
  if (error) {
    console.error('[MerchantRequirements] Could not add configuration:', error);
    return NextResponse.json({ error: error.code === '23505' ? 'A rule already exists for this business type, county, and document.' : 'Document requirement could not be saved.' }, { status: error.code === '23505' ? 409 : 500 });
  }
  const { error: auditError } = await access.database.from('merchant_document_requirement_events').insert({
    requirement_id: data.id,
    event_type: 'created',
    actor: access.actor,
    details: { requirement_id: data.id, business_type: data.business_type, county: data.county, document_type: data.document_type }
  });
  if (auditError) {
    console.error('[MerchantRequirements] Saved rule but failed to write configuration audit:', auditError);
    const { error: cleanupError } = await access.database.from('merchant_document_requirements').delete().eq('id', data.id);
    if (cleanupError) console.error('[MerchantRequirements] Could not roll back unaudited rule:', cleanupError);
    return NextResponse.json({ error: 'The rule could not be safely audited and was not retained.' }, { status: 500 });
  }
  return NextResponse.json({ requirement: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;
  let body: { id?: unknown; label?: unknown; required?: unknown; active?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid document requirement update is required.' }, { status: 400 });
  }
  if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)
    || (body.label !== undefined && (typeof body.label !== 'string' || body.label.trim().length < 2 || body.label.length > 120))
    || (body.required !== undefined && typeof body.required !== 'boolean')
    || (body.active !== undefined && typeof body.active !== 'boolean')
    || (body.label === undefined && body.required === undefined && body.active === undefined)) {
    return NextResponse.json({ error: 'Provide a valid rule ID and at least one configuration field.' }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (typeof body.label === 'string') update.label = body.label.trim();
  if (typeof body.required === 'boolean') update.is_required = body.required;
  if (typeof body.active === 'boolean') update.is_active = body.active;
  const { data, error } = await access.database.from('merchant_document_requirements')
    .update(update).eq('id', body.id)
    .select('id, business_type, county, document_type, label, is_required, is_active')
    .maybeSingle();
  if (error) {
    console.error('[MerchantRequirements] Could not update configuration:', error);
    return NextResponse.json({ error: 'Document requirement could not be updated.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Document requirement not found.' }, { status: 404 });
  const { error: auditError } = await access.database.from('merchant_document_requirement_events').insert({
    requirement_id: data.id,
    event_type: 'updated',
    actor: access.actor,
    details: { business_type: data.business_type, county: data.county, document_type: data.document_type, label: data.label, is_required: data.is_required, is_active: data.is_active }
  });
  if (auditError) {
    console.error('[MerchantRequirements] Updated rule but failed to write configuration audit:', auditError);
    return NextResponse.json({ error: 'The rule changed, but its audit event could not be recorded. Contact an administrator.' }, { status: 500 });
  }
  return NextResponse.json({ requirement: data });
}
