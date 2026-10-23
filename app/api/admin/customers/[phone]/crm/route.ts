import { NextResponse } from 'next/server';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

type CustomerProfile = {
  id: string;
  phone_number: string | null;
  full_name: string | null;
  email: string | null;
  address: string | null;
  birth_date: string | null;
  created_at: string;
};

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return `0${digits.slice(3)}`;
  return digits;
}

function phoneVariants(value: string): string[] {
  const digits = value.replace(/\D/g, '');
  const variants = new Set([value.trim(), digits]);
  if (digits.startsWith('0') && digits.length === 10) {
    variants.add(`254${digits.slice(1)}`);
    variants.add(`+254${digits.slice(1)}`);
  } else if (digits.startsWith('254') && digits.length === 12) {
    variants.add(`0${digits.slice(3)}`);
    variants.add(`+${digits}`);
  }
  return Array.from(variants).filter(Boolean);
}

async function authorize(request?: Request, mutation = false) {
  const session = await getAdminSession();
  if (!session) {
    return { response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  }
  if (!['owner', 'admin'].includes(session.role.toLowerCase())) {
    return { response: NextResponse.json({ error: 'Only senior management can manage customer records.' }, { status: 403 }) };
  }
  if (mutation && (!request || !isSameOriginRequest(request))) {
    return { response: NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 }) };
  }
  const database = createServerSupabaseClient();
  if (!database) {
    return { response: NextResponse.json({ error: 'Customer CRM database access is not configured.' }, { status: 503 }) };
  }
  return { session, database };
}

async function parseBody(request: Request): Promise<Record<string, unknown> | NextResponse> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid CRM request body is required.' }, { status: 400 });
  }
  return NextResponse.json({ error: 'A valid CRM request body is required.' }, { status: 400 });
}

function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

async function resolveProfile(database: NonNullable<ReturnType<typeof createServerSupabaseClient>>, variants: string[], phoneKey: string) {
  const { data, error } = await database
    .from('profiles')
    .select('id,phone_number,full_name,email,address,birth_date,created_at')
    .in('phone_number', variants);
  if (error) throw error;
  const profiles = (data || []) as CustomerProfile[];
  return profiles.find(profile => profile.phone_number && normalizePhone(profile.phone_number) === phoneKey) || null;
}

async function ensureRecord(
  database: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  phoneKey: string,
  profile: CustomerProfile | null
) {
  const { data: existing, error: readError } = await database
    .from('customer_crm_records').select('profile_id').eq('phone_key', phoneKey).maybeSingle();
  if (readError) throw readError;
  if (existing) {
    if (profile && existing.profile_id !== profile.id) {
      const { error } = await database.from('customer_crm_records')
        .update({ profile_id: profile.id }).eq('phone_key', phoneKey);
      if (error) throw error;
    }
    return;
  }
  const { error } = await database.from('customer_crm_records').insert({
    phone_key: phoneKey,
    profile_id: profile?.id || null
  });
  if (error) throw error;
}

async function logAudit(
  database: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  phoneKey: string,
  actorEmail: string,
  action: string,
  details: Record<string, unknown> = {}
) {
  const { error } = await database.from('customer_crm_audit').insert({
    phone_key: phoneKey,
    actor_email: actorEmail,
    action,
    details
  });
  if (error) throw error;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  const access = await authorize();
  if ('response' in access) return access.response;

  try {
    const { phone } = await params;
    const variants = phoneVariants(phone);
    const phoneKey = normalizePhone(phone);
    if (phoneKey.length < 7 || phoneKey.length > 15) {
      return NextResponse.json({ error: 'A valid customer phone number is required.' }, { status: 400 });
    }
    const profile = await resolveProfile(access.database, variants, phoneKey);
    const [recordResult, notesResult, followupsResult, auditResult, ordersResult] = await Promise.all([
      access.database.from('customer_crm_records').select('full_name,email,address,birth_date,tags').eq('phone_key', phoneKey).maybeSingle(),
      access.database.from('customer_crm_notes').select('id,body,author_email,created_at').eq('phone_key', phoneKey).order('created_at', { ascending: false }).limit(100),
      access.database.from('customer_crm_followups').select('id,title,description,due_at,priority,status,created_by,created_at,completed_at').eq('phone_key', phoneKey).order('due_at', { ascending: false }).limit(100),
      access.database.from('customer_crm_audit').select('id,actor_email,action,details,created_at').eq('phone_key', phoneKey).order('created_at', { ascending: false }).limit(100),
      access.database.from('orders').select('id,customer_name,customer_phone,total_price,status,created_at').in('customer_phone', variants).order('created_at', { ascending: false }).limit(100)
    ]);
    const [consentResult, notificationsResult] = profile
      ? await Promise.all([
        access.database.from('user_consent').select('marketing,in_app_marketing,updated_at').eq('user_id', profile.id).maybeSingle(),
        access.database.from('user_notifications').select('id,title,message,is_read,created_at').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50)
      ])
      : [{ data: null, error: null }, { data: [], error: null }];
    const error = recordResult.error || notesResult.error || followupsResult.error || auditResult.error
      || ordersResult.error || consentResult.error || notificationsResult.error;
    if (error) throw error;

    const record = recordResult.data;
    const notes = notesResult.data || [];
    const followups = followupsResult.data || [];
    const audits = auditResult.data || [];
    const notifications = notificationsResult.data || [];
    const orders = (ordersResult.data || []).filter(order => normalizePhone(order.customer_phone || '') === phoneKey);
    const activity = [
      ...notes.map(note => ({ id: `note-${note.id}`, type: 'note', created_at: note.created_at, actor: note.author_email, summary: note.body })),
      ...followups.map(followup => ({ id: `followup-${followup.id}`, type: 'followup', created_at: followup.created_at, actor: followup.created_by, summary: followup.title, details: followup })),
      ...audits.map(entry => ({ id: `audit-${entry.id}`, type: 'update', created_at: entry.created_at, actor: entry.actor_email, summary: entry.action.replaceAll('_', ' '), details: entry.details })),
      ...notifications.map(notification => ({ id: `notification-${notification.id}`, type: 'communication', created_at: notification.created_at, actor: 'Online Bar', summary: notification.title, details: { message: notification.message, is_read: notification.is_read } })),
      ...orders.map(order => ({ id: `order-${order.id}`, type: 'order', created_at: order.created_at, actor: 'Online Bar', summary: `Order #${order.id} · ${order.status || 'Unknown status'}`, details: { amount: order.total_price } }))
    ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()).slice(0, 150);

    return NextResponse.json({
      customer: {
        isRegistered: Boolean(profile),
        profileId: profile?.id || null,
        phone: profile?.phone_number || phone,
        fullName: profile?.full_name ?? record?.full_name ?? orders[0]?.customer_name ?? '',
        email: profile?.email ?? record?.email ?? '',
        address: profile?.address ?? record?.address ?? '',
        birthDate: profile?.birth_date ?? record?.birth_date ?? '',
        createdAt: profile?.created_at || orders[orders.length - 1]?.created_at || null
      },
      tags: record?.tags || [],
      consent: consentResult.data ? {
        marketing: consentResult.data.marketing,
        inAppMarketing: consentResult.data.in_app_marketing,
        updatedAt: consentResult.data.updated_at
      } : null,
      communications: notifications,
      notes,
      followups,
      activity
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('[CustomerCRM] Could not load customer workspace:', error);
    return NextResponse.json({ error: 'Customer CRM data could not be loaded.' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  const access = await authorize(request, true);
  if ('response' in access) return access.response;
  const body = await parseBody(request);
  if (isResponse(body)) return body;

  try {
    const { phone } = await params;
    const phoneKey = normalizePhone(phone);
    if (phoneKey.length < 7 || phoneKey.length > 15) {
      return NextResponse.json({ error: 'A valid customer phone number is required.' }, { status: 400 });
    }
    const profile = await resolveProfile(access.database, phoneVariants(phone), phoneKey);
    await ensureRecord(access.database, phoneKey, profile);
    const actor = access.session.email || 'admin';

    if (body.action === 'note') {
      const note = typeof body.body === 'string' ? body.body.trim() : '';
      if (!note || note.length > 5000) {
        return NextResponse.json({ error: 'Notes must be between 1 and 5,000 characters.' }, { status: 400 });
      }
      const { data, error } = await access.database.from('customer_crm_notes')
        .insert({ phone_key: phoneKey, body: note, author_email: actor })
        .select('id,body,author_email,created_at').single();
      if (error) throw error;
      return NextResponse.json({ note: data }, { status: 201 });
    }

    if (body.action === 'followup') {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      const dueAt = typeof body.dueAt === 'string' ? new Date(body.dueAt) : null;
      const priority = body.priority;
      if (!title || title.length > 200 || description.length > 2000 || !dueAt || !Number.isFinite(dueAt.getTime())
        || !['low', 'normal', 'high'].includes(String(priority))) {
        return NextResponse.json({ error: 'Enter a follow-up title, valid due date, description, and priority.' }, { status: 400 });
      }
      const { data, error } = await access.database.from('customer_crm_followups')
        .insert({
          phone_key: phoneKey,
          title,
          description: description || null,
          due_at: dueAt.toISOString(),
          priority,
          created_by: actor
        })
        .select('id,title,description,due_at,priority,status,created_by,created_at,completed_at').single();
      if (error) throw error;
      await logAudit(access.database, phoneKey, actor, 'followup_created', { title, due_at: dueAt.toISOString(), priority });
      return NextResponse.json({ followup: data }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unsupported CRM action.' }, { status: 400 });
  } catch (error) {
    console.error('[CustomerCRM] Could not save customer activity:', error);
    return NextResponse.json({ error: 'Customer activity could not be saved.' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  const access = await authorize(request, true);
  if ('response' in access) return access.response;
  const body = await parseBody(request);
  if (isResponse(body)) return body;

  try {
    const { phone } = await params;
    const phoneKey = normalizePhone(phone);
    if (phoneKey.length < 7 || phoneKey.length > 15) {
      return NextResponse.json({ error: 'A valid customer phone number is required.' }, { status: 400 });
    }
    const profile = await resolveProfile(access.database, phoneVariants(phone), phoneKey);
    await ensureRecord(access.database, phoneKey, profile);
    const actor = access.session.email || 'admin';

    if (body.action === 'profile') {
      const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const address = typeof body.address === 'string' ? body.address.trim() : '';
      const birthDate = typeof body.birthDate === 'string' ? body.birthDate : '';
      if (fullName.length > 120 || email.length > 254 || address.length > 500
        || (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        || (birthDate !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(new Date(`${birthDate}T00:00:00Z`).getTime())))) {
        return NextResponse.json({ error: 'Enter valid customer details. Names, email, address, or birthday may be too long or invalid.' }, { status: 400 });
      }
      const fields = {
        full_name: fullName || null,
        email: email || null,
        address: address || null,
        birth_date: birthDate || null
      };
      const { error } = profile
        ? await access.database.from('profiles').update(fields).eq('id', profile.id)
        : await access.database.from('customer_crm_records').update(fields).eq('phone_key', phoneKey);
      if (error) throw error;
      await logAudit(access.database, phoneKey, actor, 'profile_updated', { fields: ['full_name', 'email', 'address', 'birth_date'] });
      return NextResponse.json({ saved: true });
    }

    if (body.action === 'tags') {
      if (!Array.isArray(body.tags) || body.tags.length > 25 || body.tags.some(tag => typeof tag !== 'string' || tag.trim().length > 32)) {
        return NextResponse.json({ error: 'Use up to 25 tags, each no longer than 32 characters.' }, { status: 400 });
      }
      const tags = Array.from(new Map(
        body.tags.map(tag => (tag as string).trim()).filter(Boolean).map(tag => [tag.toLowerCase(), tag])
      ).values());
      const { error } = await access.database.from('customer_crm_records')
        .update({ tags, profile_id: profile?.id || null, updated_at: new Date().toISOString() })
        .eq('phone_key', phoneKey);
      if (error) throw error;
      await logAudit(access.database, phoneKey, actor, 'tags_updated', { tags });
      return NextResponse.json({ tags });
    }

    if (body.action === 'complete_followup') {
      const id = Number(body.id);
      if (!Number.isSafeInteger(id) || id < 1) {
        return NextResponse.json({ error: 'A valid follow-up is required.' }, { status: 400 });
      }
      const { data, error } = await access.database.from('customer_crm_followups')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id).eq('phone_key', phoneKey).eq('status', 'open')
        .select('id,title').maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'This follow-up is already complete or no longer exists.' }, { status: 404 });
      await logAudit(access.database, phoneKey, actor, 'followup_completed', { title: data.title });
      return NextResponse.json({ completed: true });
    }

    return NextResponse.json({ error: 'Unsupported CRM update.' }, { status: 400 });
  } catch (error) {
    console.error('[CustomerCRM] Could not update customer workspace:', error);
    return NextResponse.json({ error: 'Customer CRM update could not be saved.' }, { status: 500 });
  }
}
