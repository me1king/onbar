import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { sendTransactionalEmail } from '@/lib/jmsurfMail.server';

export const dynamic = 'force-dynamic';

const statuses = ['queued', 'engraved', 'quality_checked', 'packed', 'dispatched'] as const;
type JobStatus = typeof statuses[number];

async function authorize() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  if (!hasAdminPermission(session, 'can_manage_orders')) {
    return { response: NextResponse.json({ error: 'Order management access is required.' }, { status: 403 }) };
  }
  const database = createServerSupabaseClient();
  if (!database) return { response: NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 }) };
  return { session, database };
}

function isJobStatus(value: string): value is JobStatus {
  return (statuses as readonly string[]).includes(value);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

function asOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

export async function GET(request: Request) {
  const access = await authorize();
  if ('response' in access) return access.response;

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const dueAfter = url.searchParams.get('due_after');
  const dueBefore = url.searchParams.get('due_before');
  if ((status && status !== 'all' && !isJobStatus(status))
    || (dueAfter && !isIsoDate(dueAfter))
    || (dueBefore && !isIsoDate(dueBefore))) {
    return NextResponse.json({ error: 'Choose a valid job status and due-date range.' }, { status: 400 });
  }

  let query = access.database.from('engraving_jobs')
    .select('id,order_item_id,approved_snapshot,snapshot_hash,status,due_date,approved_at,created_at,updated_at,order_items!inner(id,order_id,quantity,unit_price,orders!inner(id,customer_name,customer_email,customer_phone))')
    .order('created_at', { ascending: true })
    .limit(200);
  if (status && status !== 'all') query = query.eq('status', status);
  if (dueAfter) query = query.gte('due_date', dueAfter);
  if (dueBefore) query = query.lte('due_date', dueBefore);

  const { data, error } = await query;
  if (error) {
    console.error('[EngravingProduction] Could not load production jobs:', error.message);
    const migrationMissing = ['42P01', 'PGRST205'].includes(error.code || '');
    return NextResponse.json({
      error: migrationMissing
        ? 'Engraving production is not installed yet. Run supabase/ENGRAVING_PRODUCTION_MIGRATION.sql.'
        : 'Production jobs could not be loaded.'
    }, { status: 503 });
  }

  const jobs = (data || []).map(raw => {
    const row = raw as unknown as Record<string, unknown>;
    const orderItem = asOne(row.order_items as Record<string, unknown> | Record<string, unknown>[] | null);
    const order = asOne(orderItem?.orders as Record<string, unknown> | Record<string, unknown>[] | null);
    return {
      id: row.id,
      orderItemId: row.order_item_id,
      orderId: orderItem?.order_id,
      quantity: orderItem?.quantity,
      unitPrice: orderItem?.unit_price,
      customerName: order?.customer_name || 'Customer',
      customerEmail: order?.customer_email || null,
      customerPhone: order?.customer_phone || null,
      snapshot: row.approved_snapshot,
      snapshotHash: row.snapshot_hash,
      status: row.status,
      dueDate: row.due_date,
      approvedAt: row.approved_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
  return NextResponse.json({ jobs }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await authorize();
  if ('response' in access) return access.response;

  let body: { id?: unknown; status?: unknown; dueDate?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Send a valid production-job update.' }, { status: 400 });
  }

  const id = Number(body.id);
  const hasStatus = body.status !== undefined;
  const hasDueDate = body.dueDate !== undefined;
  if (!Number.isSafeInteger(id) || id < 1 || (!hasStatus && !hasDueDate)
    || (hasStatus && (typeof body.status !== 'string' || !isJobStatus(body.status)))
    || (hasDueDate && body.dueDate !== null
      && (typeof body.dueDate !== 'string' || !isIsoDate(body.dueDate)))) {
    return NextResponse.json({ error: 'The production-job update is invalid.' }, { status: 400 });
  }
  const { data: current, error: loadError } = await access.database.from('engraving_jobs')
    .select('id,status,approved_snapshot,order_item_id')
    .eq('id', id)
    .maybeSingle();
  if (loadError || !current) {
    console.error('[EngravingProduction] Could not find production job:', loadError?.message);
    return NextResponse.json({ error: loadError ? 'Production job could not be loaded.' : 'Production job not found.' }, { status: loadError ? 503 : 404 });
  }

  let nextStatus: JobStatus | undefined;
  if (hasStatus) {
    nextStatus = body.status as JobStatus;
    const currentIndex = statuses.indexOf(current.status as JobStatus);
    if (currentIndex < 0 || statuses[currentIndex + 1] !== nextStatus) {
      return NextResponse.json({ error: 'Move jobs through the next production step in order.' }, { status: 409 });
    }
  }

  const update: Record<string, unknown> = {
    updated_by: access.session.email || access.session.role,
    updated_at: new Date().toISOString(),
    ...(nextStatus ? { status: nextStatus } : {}),
    ...(hasDueDate ? { due_date: body.dueDate } : {})
  };
  let updateQuery = access.database.from('engraving_jobs').update(update).eq('id', id);
  if (nextStatus) updateQuery = updateQuery.eq('status', current.status);
  const { data: updated, error: updateError } = await updateQuery.select('id,status,due_date,updated_at').maybeSingle();
  if (updateError || !updated) {
    console.error('[EngravingProduction] Could not update production job:', updateError?.message);
    return NextResponse.json({ error: updateError ? 'Production job could not be updated.' : 'The job changed during this update. Refresh and retry.' }, { status: updateError ? 503 : 409 });
  }

  let notification: { status: 'not_applicable' | 'sent' | 'failed'; error?: string } = { status: 'not_applicable' };
  if (nextStatus) {
    const { data: itemData, error: orderError } = await access.database.from('order_items')
      .select('orders!inner(customer_email,customer_name,notification_email_opt_in)')
      .eq('id', current.order_item_id)
      .maybeSingle();
    if (orderError) {
      console.error('[EngravingProduction] Status changed, but customer details could not be loaded:', orderError.message);
      notification = { status: 'failed', error: 'Status was updated, but customer notification details could not be loaded.' };
    } else {
      const order = asOne((itemData as unknown as { orders?: Record<string, unknown> | Record<string, unknown>[] | null } | null)?.orders);
      const email = typeof order?.customer_email === 'string' ? order.customer_email : '';
      if (email && order?.notification_email_opt_in === true) {
        const snapshot = current.approved_snapshot as Record<string, unknown>;
        const productName = typeof snapshot.productName === 'string' ? snapshot.productName : 'your engraved item';
        const statusLabel = nextStatus.replaceAll('_', ' ');
        try {
          await sendTransactionalEmail({
            to: email,
            subject: `Production update: ${productName}`,
            text: `Hello ${typeof order.customer_name === 'string' ? order.customer_name : ''}, your ${productName} is now ${statusLabel}.`,
            html: `<p>Hello ${escapeHtml(typeof order.customer_name === 'string' ? order.customer_name : 'there')},</p><p>Your <strong>${escapeHtml(productName)}</strong> is now <strong>${escapeHtml(statusLabel)}</strong>.</p><p>Thank you for your order.</p>`,
            idempotencyKey: `engraving-job:${id}:status:${nextStatus}`
          });
          notification = { status: 'sent' };
        } catch (error) {
          console.error('[EngravingProduction] Status changed, but customer email failed:', error);
          notification = { status: 'failed', error: error instanceof Error ? error.message : 'Customer email failed.' };
        }
      }
    }
  }

  return NextResponse.json({ job: updated, notification });
}
