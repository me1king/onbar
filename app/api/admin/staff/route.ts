import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

const permissionFields = [
  'can_view_revenue',
  'can_manage_inventory',
  'can_manage_orders',
  'can_execute_payouts',
  'can_view_audit_logs',
  'can_manage_settings',
  'can_manage_staff',
  'can_view_sensitive_data',
  'can_manage_communications',
  'can_manage_marketing',
  'can_manage_kitchen'
] as const;

const allowedRoles = new Set(['STAFF', 'SUPER_ADMIN', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN', 'RIDER_MANAGER', 'VIEWER']);
type StaffPayload = Record<string, unknown>;

async function authorize() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!hasAdminPermission(session, 'can_manage_staff')) {
    return { response: NextResponse.json({ error: 'Staff management permission required.' }, { status: 403 }) };
  }
  const database = createServerSupabaseClient();
  if (!database) return { response: NextResponse.json({ error: 'Server-side staff database access is not configured.' }, { status: 503 }) };
  return { session, database };
}

export async function GET() {
  const access = await authorize();
  if ('response' in access) return access.response;
  const { data, error } = await access.database
    .from('staff')
    .select('id, email, role, status, last_activity_at, completed_tasks, overdue_tasks, sla_rating, can_view_revenue, can_manage_inventory, can_manage_orders, can_execute_payouts, can_view_audit_logs, can_manage_settings, can_manage_staff, can_view_sensitive_data, can_manage_communications, can_manage_marketing, can_manage_kitchen, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[AdminStaff] Could not load staff:', error);
    return NextResponse.json({ error: error.code === '42P01' || error.code === 'PGRST205'
      ? 'Staff database schema is missing. Run supabase/FINAL_ESTABLISHMENT_SQL.sql, supabase/AUTH_SECURITY_MIGRATION.sql, and supabase/ADMIN_DASHBOARD_RECOVERY_MIGRATION.sql.'
      : `Could not load team records: ${error.message}` }, { status: 500 });
  }
  const staff = (data || []).map(member => {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(String(member.role).toUpperCase())) return member;
    return {
      ...member,
      ...Object.fromEntries(permissionFields.map(permission => [permission, true]))
    };
  });
  return NextResponse.json({ staff }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  const access = await authorize();
  if ('response' in access) return access.response;
  let body: StaffPayload;
  try {
    body = await request.json() as StaffPayload;
  } catch {
    return NextResponse.json({ error: 'A valid staff member is required.' }, { status: 400 });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = typeof body.role === 'string' ? body.role : '';
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !allowedRoles.has(role) || (pin && !/^\d{4}$/.test(pin))) {
    return NextResponse.json({ error: 'Enter a valid email, role, and optional four-digit PIN.' }, { status: 400 });
  }
  const { data: profile, error: profileError } = await access.database
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (profileError) {
    console.error('[AdminStaff] Could not resolve staff account:', profileError);
    return NextResponse.json({ error: `Could not find the account: ${profileError.message}` }, { status: 500 });
  }
  if (!profile) return NextResponse.json({ error: 'This person must create a customer account before staff access can be granted.' }, { status: 404 });

  const permissions: Record<string, boolean> = {};
  for (const field of permissionFields) {
    if (body[field] !== undefined && typeof body[field] !== 'boolean') {
      return NextResponse.json({ error: `Invalid staff permission: ${field}.` }, { status: 400 });
    }
    permissions[field] = body[field] === true;
  }
  const { error } = await access.database.from('staff').insert({
    id: profile.id,
    email,
    role,
    pin: pin || null,
    ...permissions
  });
  if (error) {
    console.error('[AdminStaff] Could not add staff member:', error);
    return NextResponse.json({ error: error.code === '23505' ? 'This account already has staff access.' : `Could not authorize staff: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const access = await authorize();
  if ('response' in access) return access.response;
  let body: StaffPayload;
  try {
    body = await request.json() as StaffPayload;
  } catch {
    return NextResponse.json({ error: 'A valid permission update is required.' }, { status: 400 });
  }
  if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)
      || typeof body.field !== 'string' || !(permissionFields as readonly string[]).includes(body.field)
      || typeof body.value !== 'boolean') {
    return NextResponse.json({ error: 'A valid staff ID and permission update are required.' }, { status: 400 });
  }
  const { data: member, error: memberError } = await access.database
    .from('staff')
    .select('role')
    .eq('id', body.id)
    .maybeSingle();
  if (memberError) {
    console.error('[AdminStaff] Could not check staff role before permission update:', memberError);
    return NextResponse.json({ error: `Could not verify staff role: ${memberError.message}` }, { status: 500 });
  }
  if (!member) return NextResponse.json({ error: 'Staff member was not found.' }, { status: 404 });
  if (['ADMIN', 'SUPER_ADMIN'].includes(String(member.role).toUpperCase())) {
    return NextResponse.json({ error: 'Permissions are assigned by the admin role and cannot be changed individually.' }, { status: 409 });
  }
  const { error } = await access.database.from('staff').update({ [body.field]: body.value }).eq('id', body.id);
  if (error) {
    console.error('[AdminStaff] Could not update staff permission:', error);
    return NextResponse.json({ error: `Could not update permission: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const access = await authorize();
  if ('response' in access) return access.response;
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'A valid staff ID is required.' }, { status: 400 });
  const { error } = await access.database.from('staff').delete().eq('id', id);
  if (error) {
    console.error('[AdminStaff] Could not revoke staff access:', error);
    return NextResponse.json({ error: `Could not revoke staff access: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
