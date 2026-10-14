import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

function normalizePhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, '') || '';
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  return digits;
}

async function getAuthorizedDatabase() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!['admin', 'owner'].includes(session.role.toLowerCase())
    && !hasAdminPermission(session, 'can_manage_inventory')) {
    return { response: NextResponse.json({ error: 'Marketplace review access required.' }, { status: 403 }) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return { response: NextResponse.json({ error: 'Marketplace database access is not configured.' }, { status: 503 }) };
  }

  return {
    database: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }),
    session
  };
}

export async function GET() {
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;

  const { data, error } = await access.database
    .from('mm_merchant_applications')
    .select('id, user_id, business_name, requested_slug, contact_name, contact_email, contact_phone, business_description, status, review_note, reviewed_by_email, submitted_at')
    .in('status', ['submitted', 'under_review', 'information_requested'])
    .order('submitted_at', { ascending: true });

  if (error) {
    console.error('[MarketAdmin] Could not load seller applications:', error);
    return NextResponse.json({ error: 'Could not load Midnight Market applications.' }, { status: 503 });
  }

  const applications = await Promise.all((data || []).map(async (application) => {
    const { data: userResult, error: userError } = await access.database.auth.admin.getUserById(application.user_id);
    if (userError) {
      console.error('[MarketAdmin] Could not verify applicant contact details:', userError);
      return null;
    }
    const user = userResult.user;
    return {
      id: application.id,
      business_name: application.business_name,
      requested_slug: application.requested_slug,
      contact_name: application.contact_name,
      contact_email: application.contact_email,
      contact_phone: application.contact_phone,
      business_description: application.business_description,
      status: application.status,
      review_note: application.review_note,
      reviewed_by_email: application.reviewed_by_email,
      submitted_at: application.submitted_at,
      emailVerified: Boolean(user?.email_confirmed_at
        && user.email?.trim().toLowerCase() === application.contact_email.trim().toLowerCase()),
      phoneVerified: Boolean(user?.phone_confirmed_at
        && normalizePhone(user.phone) === normalizePhone(application.contact_phone))
    };
  }));
  if (applications.some((application) => application === null)) {
    return NextResponse.json({ error: 'Applicant verification status could not be loaded.' }, { status: 503 });
  }

  return NextResponse.json({ applications }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid application review.' }, { status: 400 });
  }

  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : '';
  const action = body.action === 'approve' || body.action === 'reject' || body.action === 'request_information'
    ? body.action
    : '';
  const reviewNote = typeof body.note === 'string' ? body.note.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)
    || !action || reviewNote.length > 1000 || (action !== 'approve' && reviewNote.length < 5)) {
    return NextResponse.json({ error: 'Choose a review action; rejection and information requests need a short note.' }, { status: 400 });
  }

  if (!access.session.email?.trim()) {
    return NextResponse.json({ error: 'Your admin identity is unavailable; sign in again before reviewing.' }, { status: 403 });
  }

  if (action === 'approve') {
    const { data: application, error: applicationError } = await access.database
      .from('mm_merchant_applications')
      .select('user_id, contact_email, contact_phone')
      .eq('id', applicationId)
      .maybeSingle();
    if (applicationError) {
      console.error('[MarketAdmin] Could not load application for verification:', applicationError);
      return NextResponse.json({ error: 'Could not verify the seller application.' }, { status: 503 });
    }
    if (!application) return NextResponse.json({ error: 'This seller application no longer exists.' }, { status: 404 });

    const { data: userResult, error: userError } = await access.database.auth.admin.getUserById(application.user_id);
    if (userError) {
      console.error('[MarketAdmin] Could not verify applicant contact details:', userError);
      return NextResponse.json({ error: 'Could not verify the applicant contact details.' }, { status: 503 });
    }
    const user = userResult.user;
    if (!user?.email_confirmed_at
      || user.email?.trim().toLowerCase() !== application.contact_email.trim().toLowerCase()) {
      return NextResponse.json({ error: 'The seller must verify the application email on their account before approval.' }, { status: 409 });
    }
    if (!user.phone_confirmed_at
      || !user.phone
      || normalizePhone(user.phone) !== normalizePhone(application.contact_phone)) {
      return NextResponse.json({ error: 'The seller must verify the same phone number on their account before approval.' }, { status: 409 });
    }
  }

  const { data, error } = await access.database.rpc('mm_review_merchant_application', {
    p_application_id: applicationId,
    p_action: action,
    p_review_note: reviewNote || null,
    p_reviewer_email: access.session.email.trim().toLowerCase()
  });
  if (error) {
    console.error('[MarketAdmin] Could not review seller application:', error);
    const status = error.message.includes('already been reviewed') || error.message.includes('slug')
      ? 409
      : error.message.includes('not found')
        ? 404
        : 503;
    return NextResponse.json({ error: status === 409
      ? 'The application was already reviewed or its boutique URL is no longer available.'
      : status === 404
        ? 'This seller application no longer exists.'
        : 'Could not complete the application review.' }, { status });
  }

  return NextResponse.json({ review: data }, { headers: { 'Cache-Control': 'no-store' } });
}
