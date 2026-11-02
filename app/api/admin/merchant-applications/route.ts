import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { getPublicBaseUrl } from '@/lib/utils';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';
import {
  isMerchantApplicationStatus,
  resolveMerchantDocumentRequirements,
  type MerchantDocumentRequirement,
  type MerchantApplicationDocument
} from '@/lib/merchantApplications';

export const dynamic = 'force-dynamic';

const DOCUMENT_BUCKET = 'merchant-application-documents';
const applicationListFields = [
  'id',
  'onboarding_lead_id',
  'merchant_code',
  'business_name',
  'trading_name',
  'business_type',
  'email',
  'phone',
  'owner_name',
  'owner_role',
  'address',
  'country',
  'county',
  'town',
  'operating_areas',
  'status',
  'documents_deferred',
  'submitted_at',
  'reviewed_at',
  'reviewed_by'
].join(',');

async function getAuthorizedDatabase() {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!['owner', 'admin'].includes(session.role) && session.permissions.can_manage_settings !== true) {
    return { response: NextResponse.json({ error: 'Merchant verification access required.' }, { status: 403 }) };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return { response: NextResponse.json({ error: 'Merchant operations database access is not configured.' }, { status: 503 }) };
  }
  return {
    database: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }),
    actor: session.email || (session.role === 'owner' ? 'Owner' : 'Admin')
  };
}

function isUuid(value: string | null): value is string {
  return value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

export async function GET(request: Request) {
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;
  const query = new URL(request.url).searchParams;
  const applicationId = query.get('id');
  const documentId = query.get('document');

  if (query.get('compliance') === '1') {
    const { data: rows, error } = await access.database.from('merchant_applications')
      .select('id, merchant_code, business_name, business_type, county, town, status, documents')
      .eq('status', 'approved')
      .order('business_name')
      .limit(2000);
    if (error) {
      console.error('[MerchantAdmin] Could not load compliance expiries:', error);
      return NextResponse.json({ error: 'Merchant compliance expiry data could not be loaded.' }, { status: 500 });
    }
    const { data: requirementRows, error: requirementError } = await access.database
      .from('merchant_document_requirements')
      .select('id, business_type, county, document_type, label, is_required, is_active')
      .eq('is_active', true)
      .eq('is_required', true);
    if (requirementError) {
      console.error('[MerchantAdmin] Could not load compliance requirements:', requirementError);
      return NextResponse.json({ error: 'Required compliance checklist could not be loaded.' }, { status: 503 });
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const limit = new Date(today);
    limit.setUTCDate(limit.getUTCDate() + 30);
    const documents = (rows || []).flatMap((row) => {
      const entries = Array.isArray(row.documents) ? row.documents as MerchantApplicationDocument[] : [];
      const requiredTypes = new Set(resolveMerchantDocumentRequirements(
        (requirementRows || []) as MerchantDocumentRequirement[],
        row.business_type,
        row.county
      ).filter(requirement => requirement.is_required).map(requirement => requirement.document_type));
      return entries.flatMap(document => {
        if (!document.expiresAt || !requiredTypes.has(document.type)) return [];
        const expiry = new Date(`${document.expiresAt}T00:00:00.000Z`);
        if (!Number.isFinite(expiry.getTime()) || expiry > limit) return [];
        return [{
          applicationId: row.id,
          merchantCode: row.merchant_code,
          businessName: row.business_name,
          businessType: row.business_type,
          county: row.county,
          town: row.town,
          documentId: document.id,
          documentType: document.type,
          documentName: document.name,
          expiresAt: document.expiresAt,
          expired: expiry < today
        }];
      });
    }).sort((left, right) => left.expiresAt.localeCompare(right.expiresAt));
    const applicationIds = [...new Set(documents.map(document => document.applicationId))];
    if (applicationIds.length) {
      const events = applicationIds.map(id => ({
        application_id: id,
        event_type: 'compliance_expiry_list_viewed',
        actor: access.actor,
        details: { window_days: 30 }
      }));
      const { error: auditError } = await access.database.from('merchant_application_events').insert(events);
      if (auditError) {
        console.error('[MerchantAdmin] Could not audit compliance expiry access:', auditError);
        return NextResponse.json({ error: 'Compliance expiry access could not be audited.' }, { status: 503 });
      }
    }
    return NextResponse.json({ documents }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  }

  if (applicationId && !isUuid(applicationId)) {
    return NextResponse.json({ error: 'A valid application ID is required.' }, { status: 400 });
  }

  if (applicationId && documentId) {
    const { data: application, error } = await access.database
      .from('merchant_applications')
      .select('id, documents')
      .eq('id', applicationId)
      .maybeSingle();
    if (error) {
      console.error('[MerchantAdmin] Could not load application document metadata:', error);
      return NextResponse.json({ error: 'Could not load the requested application document.' }, { status: 500 });
    }
    if (!application) return NextResponse.json({ error: 'Merchant application not found.' }, { status: 404 });

    const documents = Array.isArray(application.documents)
      ? application.documents as MerchantApplicationDocument[]
      : [];
    const document = documents.find(candidate => candidate.id === documentId);
    if (!document || !document.objectPath.startsWith(`${applicationId}/`)) {
      return NextResponse.json({ error: 'Application document not found.' }, { status: 404 });
    }
    const { data: signedUrl, error: signedUrlError } = await access.database.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(document.objectPath, 5 * 60);
    if (signedUrlError) {
      console.error('[MerchantAdmin] Could not sign application document URL:', signedUrlError);
      return NextResponse.json({ error: 'Could not securely open this document.' }, { status: 500 });
    }
    const { error: eventError } = await access.database.from('merchant_application_events').insert({
      application_id: applicationId,
      event_type: 'document_accessed',
      actor: access.actor,
      details: { document_id: document.id, document_type: document.type }
    });
    if (eventError) {
      console.error('[MerchantAdmin] Could not record document access:', eventError);
      return NextResponse.json({ error: 'Document access could not be audited.' }, { status: 500 });
    }
    return NextResponse.json({ url: signedUrl.signedUrl }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  }

  if (applicationId) {
    const [{ data: application, error: applicationError }, { data: events, error: eventsError }] = await Promise.all([
      access.database.from('merchant_applications').select('*').eq('id', applicationId).maybeSingle(),
      access.database.from('merchant_application_events')
        .select('id, event_type, actor, details, created_at')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(100)
    ]);
    if (applicationError || eventsError) {
      console.error('[MerchantAdmin] Could not load application detail:', applicationError || eventsError);
      return NextResponse.json({ error: 'Could not load merchant application history.' }, { status: 500 });
    }
    if (!application) return NextResponse.json({ error: 'Merchant application not found.' }, { status: 404 });
    const { data: journeyEvents, error: journeyError } = application.onboarding_lead_id
      ? await access.database.from('vendor_onboarding_events')
        .select('id, event_type, actor, details, created_at')
        .eq('lead_id', application.onboarding_lead_id)
        .order('created_at', { ascending: false })
        .limit(200)
      : { data: [], error: null };
    if (journeyError) {
      console.error('[MerchantAdmin] Could not load onboarding progress:', journeyError);
      return NextResponse.json({ error: 'Could not load vendor onboarding progress.' }, { status: 500 });
    }
    const { data: accessEvent, error: accessEventError } = await access.database.from('merchant_application_events').insert({
      application_id: applicationId,
      event_type: 'application_viewed',
      actor: access.actor,
      details: {}
    }).select('id, event_type, actor, details, created_at').single();
    if (accessEventError) {
      console.error('[MerchantAdmin] Could not audit application access:', accessEventError);
      return NextResponse.json({ error: 'Application access could not be audited.' }, { status: 503 });
    }
    const { data: configuredRequirements, error: requirementsError } = await access.database.from('merchant_document_requirements')
      .select('id, business_type, county, document_type, label, is_required, is_active')
      .in('business_type', ['*', application.business_type])
      .in('county', ['*', String(application.county).toLowerCase()]);
    if (requirementsError) {
      console.error('[MerchantAdmin] Could not load application document requirements:', requirementsError);
      return NextResponse.json({ error: 'Current compliance requirements could not be checked.' }, { status: 503 });
    }
    const requiredDocuments = resolveMerchantDocumentRequirements(
      (configuredRequirements || []) as MerchantDocumentRequirement[],
      application.business_type,
      application.county
    ).filter(requirement => requirement.is_required).map(requirement => requirement.document_type);
    if (application.vendor_type === 'retailer' && !requiredDocuments.includes('liquor_licence')) {
      requiredDocuments.push('liquor_licence');
    }
    if (application.vendor_type === 'wholesaler' && !requiredDocuments.includes('wholesale_licence')) {
      requiredDocuments.push('wholesale_licence');
    }
    const combinedEvents = [
      ...(events || []),
      ...(journeyEvents || []).map(event => ({
        ...event,
        details: { ...(event.details || {}), source: 'vendor_onboarding' }
      })),
      accessEvent
    ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    return NextResponse.json({ application: { ...application, requiredDocuments }, events: combinedEvents }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  }

  const status = query.get('status');
  if (status && !isMerchantApplicationStatus(status)) {
    return NextResponse.json({ error: 'Unsupported application status filter.' }, { status: 400 });
  }
  let applicationsQuery = access.database.from('merchant_applications')
    .select(applicationListFields)
    .order('created_at', { ascending: false })
    .limit(300);
  if (status) applicationsQuery = applicationsQuery.eq('status', status);
  const { data, error } = await applicationsQuery;
  if (error) {
    console.error('[MerchantAdmin] Could not load applications:', error);
    const migrationMissing = error.code === '42P01' || /merchant_applications/i.test(error.message);
    return NextResponse.json({
      error: migrationMissing
        ? 'Merchant operations schema is not installed. Run supabase/MERCHANT_OPERATIONS_MIGRATION.sql in Supabase.'
        : 'Could not load merchant applications.'
    }, { status: 503 });
  }
  return NextResponse.json({ applications: data || [] }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function PATCH(request: Request) {
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;
  let body: { id?: unknown; status?: unknown; note?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid review decision is required.' }, { status: 400 });
  }
  if (
    typeof body.id !== 'string'
    || !isUuid(body.id)
    || !isMerchantApplicationStatus(body.status)
    || body.status === 'submitted'
    || (body.note !== undefined && typeof body.note !== 'string')
  ) {
    return NextResponse.json({ error: 'A valid application ID and review status are required.' }, { status: 400 });
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  if (['information_requested', 'rejected', 'suspended', 'expired'].includes(body.status) && note.length < 5) {
    return NextResponse.json({ error: 'Add a review note of at least 5 characters for this decision.' }, { status: 400 });
  }

  const { data, error } = await access.database.rpc('review_merchant_application', {
    p_application_id: body.id,
    p_status: body.status,
    p_review_note: note || null,
    p_actor: access.actor
  });
  if (error) {
    console.error('[MerchantAdmin] Review decision failed:', error);
    const isNotFound = /not found/i.test(error.message);
    const invalidTransition = /transition is not permitted/i.test(error.message);
    const complianceError = /required compliance documents/i.test(error.message);
    return NextResponse.json({ error: isNotFound
      ? 'Merchant application not found.'
      : invalidTransition
        ? 'That status transition is not permitted. Refresh and review the current application status.'
        : complianceError
          ? error.message
        : 'The review decision could not be saved. Confirm the merchant operations migration is installed.'
    }, { status: isNotFound ? 404 : invalidTransition || complianceError ? 409 : 503 });
  }
  return NextResponse.json({ application: data });
}

export async function POST(request: Request) {
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;

  let body: { action?: unknown; id?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid document request is required.' }, { status: 400 });
  }
  if (body.action !== 'create_document_upload_link' || typeof body.id !== 'string' || !isUuid(body.id)) {
    return NextResponse.json({ error: 'Choose a valid application to request documents for.' }, { status: 400 });
  }

  const { data: application, error: applicationError } = await access.database.from('merchant_applications')
    .select('id, business_name, email, status')
    .eq('id', body.id)
    .maybeSingle();
  if (applicationError) {
    console.error('[MerchantAdmin] Could not load application for document request:', applicationError);
    return NextResponse.json({ error: 'Merchant application could not be loaded.' }, { status: 503 });
  }
  if (!application) return NextResponse.json({ error: 'Merchant application not found.' }, { status: 404 });
  if (!['submitted', 'under_review', 'information_requested'].includes(application.status)) {
    return NextResponse.json({ error: 'Document upload links are only available for applications under review.' }, { status: 409 });
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error: revokeError } = await access.database.from('merchant_document_upload_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('application_id', application.id)
    .is('revoked_at', null);
  if (revokeError) {
    console.error('[MerchantAdmin] Could not rotate prior document upload links:', revokeError);
    return NextResponse.json({ error: 'A secure document upload link could not be created.' }, { status: 503 });
  }
  const { error: linkError } = await access.database.from('merchant_document_upload_links').insert({
    application_id: application.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_by: access.actor
  });
  if (linkError) {
    console.error('[MerchantAdmin] Could not save document upload link:', linkError);
    return NextResponse.json({ error: 'A secure document upload link could not be saved.' }, { status: 503 });
  }
  const { error: eventError } = await access.database.from('merchant_application_events').insert({
    application_id: application.id,
    event_type: 'document_upload_link_issued',
    actor: access.actor,
    details: { expires_at: expiresAt }
  });
  if (eventError) {
    console.error('[MerchantAdmin] Could not audit document upload link issuance:', eventError);
    const { error: revokeError } = await access.database.from('merchant_document_upload_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', tokenHash);
    if (revokeError) console.error('[MerchantAdmin] Could not revoke unaudited document upload link:', revokeError);
    return NextResponse.json({ error: 'The upload link could not be safely audited and was not retained.' }, { status: 503 });
  }
  const uploadUrl = `${getPublicBaseUrl()}/merchant/documents?token=${encodeURIComponent(token)}`;
  const emailConfig = getTransactionalEmailConfig();
  let emailSent = false;
  let emailWarning: string | undefined;
  if (!application.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email)) {
    emailWarning = 'The secure link is ready, but this application has no valid email address.';
  } else if (!emailConfig.configured) {
    emailWarning = 'The secure link is ready, but email alerts are not configured. Copy the link and send it to the merchant.';
  } else {
    try {
      await sendTransactionalEmail({
        from: emailConfig.from,
        to: application.email,
        subject: `Documents needed to complete ${application.business_name}'s OnBar application`,
        text: `Please securely upload the remaining documents for ${application.business_name} using this link. It expires in 30 days: ${uploadUrl}`,
        html: `<p>Please securely upload the remaining documents for <strong>${escapeHtml(application.business_name)}</strong> using the link below. It expires in 30 days.</p><p><a href="${escapeHtml(uploadUrl)}">Upload documents securely</a></p>`,
        idempotencyKey: `merchant-document-upload-${application.id}-${tokenHash.slice(0, 16)}`
      });
      emailSent = true;
    } catch (emailError) {
      console.error('[MerchantAdmin] Secure upload link saved, but email failed:', emailError);
      emailWarning = 'The secure link is ready, but the email could not be sent. Copy the link and send it to the merchant.';
    }
  }

  return NextResponse.json({ url: uploadUrl, expiresAt, emailSent, emailWarning }, { status: 201 });
}
