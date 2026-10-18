import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const statuses = ['Todo', 'InProgress', 'Review', 'Done'] as const;
const priorities = ['Low', 'Medium', 'High', 'Critical'] as const;
const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function authorize() {
  const session = await getAdminSession();
  if (!session || !hasAdminPermission(session, 'can_manage_orders')) {
    return { response: NextResponse.json({ error: 'Operations task access is required.' }, { status: 403 }) };
  }
  const database = getDatabase();
  if (!database) {
    return { response: NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 }) };
  }
  return { session, database };
}

function missingMigration(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.code === 'PGRST205'
    || (error.message || '').toLowerCase().includes('admin_tasks');
}

function migrationResponse() {
  return NextResponse.json({
    error: 'The operations task board is not set up yet. Apply supabase/ADMIN_TASKS_MIGRATION.sql, then reload this page.'
  }, { status: 503 });
}

export async function GET() {
  const authorization = await authorize();
  if ('response' in authorization) return authorization.response;

  const { data, error } = await authorization.database
    .from('admin_tasks')
    .select('id,title,description,status,priority,assigned_to,due_date,created_at,action_label,action_href')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) {
    if (missingMigration(error)) return migrationResponse();
    console.error('[OperationsTasks] Could not load task board:', error);
    return NextResponse.json({ error: 'Could not load operations tasks.' }, { status: 503 });
  }
  return NextResponse.json({ tasks: data || [] }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const authorization = await authorize();
  if ('response' in authorization) return authorization.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid task is required.' }, { status: 400 });
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const priority = typeof body.priority === 'string' ? body.priority : '';
  const assignedTo = typeof body.assigned_to === 'string' && body.assigned_to.trim()
    ? body.assigned_to.trim().slice(0, 160)
    : 'Staff';
  const dueDate = typeof body.due_date === 'string' && body.due_date
    ? body.due_date
    : null;
  if (!title || title.length > 160 || description.length > 2000
    || !priorities.includes(priority as typeof priorities[number])
    || (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) {
    return NextResponse.json({ error: 'Enter a title, description (up to 2,000 characters), valid priority, and optional due date.' }, { status: 400 });
  }

  const { data, error } = await authorization.database
    .from('admin_tasks')
    .insert({
      title,
      description,
      status: 'Todo',
      priority,
      assigned_to: assignedTo,
      due_date: dueDate,
      created_by: authorization.session.email || authorization.session.role
    })
    .select('id,title,description,status,priority,assigned_to,due_date,created_at,action_label,action_href')
    .single();
  if (error) {
    if (missingMigration(error)) return migrationResponse();
    console.error('[OperationsTasks] Could not create task:', error);
    return NextResponse.json({ error: 'Could not create the operations task.' }, { status: 503 });
  }
  return NextResponse.json({ task: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const authorization = await authorize();
  if ('response' in authorization) return authorization.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid task update is required.' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  const status = typeof body.status === 'string' ? body.status : '';
  if (!taskIdPattern.test(id) || !statuses.includes(status as typeof statuses[number])) {
    return NextResponse.json({ error: 'Select a valid task and status.' }, { status: 400 });
  }
  const { data, error } = await authorization.database
    .from('admin_tasks')
    .update({ status })
    .eq('id', id)
    .select('id,title,description,status,priority,assigned_to,due_date,created_at,action_label,action_href')
    .maybeSingle();
  if (error) {
    if (missingMigration(error)) return migrationResponse();
    console.error('[OperationsTasks] Could not update task:', error);
    return NextResponse.json({ error: 'Could not update the task status.' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  return NextResponse.json({ task: data });
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const authorization = await authorize();
  if ('response' in authorization) return authorization.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A task ID is required.' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  if (!taskIdPattern.test(id)) return NextResponse.json({ error: 'Select a valid task.' }, { status: 400 });

  const { data, error } = await authorization.database
    .from('admin_tasks')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    if (missingMigration(error)) return migrationResponse();
    console.error('[OperationsTasks] Could not delete task:', error);
    return NextResponse.json({ error: 'Could not delete the operations task.' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
