import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getMissingMerchantDocumentTypes,
  resolveMerchantDocumentRequirements,
  type MerchantApplicationDocument,
  type MerchantDocumentRequirement
} from '@/lib/merchantApplications';

export const dynamic = 'force-dynamic';

const bucket = 'merchant-application-documents';
const maxFileSize = 5 * 1024 * 1024;
const maxTotalSize = 15 * 1024 * 1024;
const allowedTypes = new Set([
  'business_registration', 'county_license', 'liquor_licence', 'wholesale_licence',
  'online_alcohol_licence', 'government_id', 'selfie_photo', 'shopfront_photo',
  'business_permit', 'supplier_invoice', 'kra_pin', 'medical_cert', 'food_hygiene',
  'tax_document', 'premises_document', 'other_permit'
]);
const labels: Record<string, string> = {
  business_registration: 'Business registration',
  county_license: 'County business licence',
  liquor_licence: 'Alcohol retail licence',
  online_alcohol_licence: 'Nairobi online alcohol licence',
  wholesale_licence: 'Alcohol wholesale licence',
  government_id: 'National ID document',
  selfie_photo: 'Owner selfie for manual identity review',
  shopfront_photo: 'Shopfront photo',
  business_permit: 'Business permit',
  supplier_invoice: 'Supplier invoice',
  kra_pin: 'KRA PIN certificate',
  medical_cert: 'Food handler medical certificate',
  food_hygiene: 'Food hygiene documentation',
  tax_document: 'Tax / business information',
  premises_document: 'Premises documentation',
  other_permit: 'Other applicable permit'
};

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function isUploadToken(value: string | null): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

function extensionFor(type: string) {
  return type === 'application/pdf' ? 'pdf' : type === 'image/jpeg' ? 'jpg' : 'png';
}

async function getUploadContext(token: string) {
  const database = getDatabase();
  if (!database) return { error: 'Merchant document uploads are not configured.', status: 503 as const };
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data: link, error: linkError } = await database.from('merchant_document_upload_links')
    .select('id, application_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (linkError) {
    console.error('[MerchantDocumentUpload] Could not verify secure upload link:', linkError);
    return { error: 'Secure document upload is unavailable. Run supabase/MERCHANT_ONBOARDING_EXPERIENCE_MIGRATION.sql after MERCHANT_OPERATIONS_MIGRATION.sql.', status: 503 as const };
  }
  if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) {
    return { error: 'This document upload link is invalid, expired, or has already been completed.', status: 410 as const };
  }
  const { data: application, error: applicationError } = await database.from('merchant_applications')
    .select('id, business_name, business_type, vendor_type, county, documents, status, documents_due_at, alcohol_onboarding')
    .eq('id', link.application_id)
    .maybeSingle();
  if (applicationError || !application) {
    console.error('[MerchantDocumentUpload] Could not load linked application:', applicationError);
    if (applicationError?.code === '42703' || /documents_due_at/i.test(applicationError?.message || '')) {
      return { error: 'The seven-day upload deadline is not installed. Run supabase/MERCHANT_DOCUMENT_COMPLETION_WINDOW_MIGRATION.sql in Supabase.', status: 503 as const };
    }
    return { error: 'The merchant application for this upload link could not be loaded.', status: 503 as const };
  }
  if (!['submitted', 'under_review', 'information_requested'].includes(application.status)) {
    return { error: 'This application is no longer accepting document uploads.', status: 410 as const };
  }
  if (application.documents_due_at && new Date(application.documents_due_at).getTime() <= Date.now()) {
    return { error: 'The seven-day document completion window has expired. Contact OnBar to request a new secure upload link.', status: 410 as const };
  }
  const { data: configuredRequirements, error: requirementsError } = await database.from('merchant_document_requirements')
    .select('id, business_type, county, document_type, label, is_required, is_active')
    .in('business_type', ['*', application.business_type])
    .in('county', ['*', String(application.county).toLowerCase()]);
  if (requirementsError) {
    console.error('[MerchantDocumentUpload] Could not load compliance checklist:', requirementsError);
    return { error: 'The required document checklist could not be loaded.', status: 503 as const };
  }
  const required = resolveMerchantDocumentRequirements(
    (configuredRequirements || []) as MerchantDocumentRequirement[],
    application.business_type,
    application.county
  ).filter(requirement => requirement.is_required);
  if (application.vendor_type === 'retailer' && !required.some(item => item.document_type === 'liquor_licence')) {
    required.push({ document_type: 'liquor_licence', label: labels.liquor_licence, is_required: true } as MerchantDocumentRequirement);
  }
  if (application.vendor_type === 'wholesaler' && !required.some(item => item.document_type === 'wholesale_licence')) {
    required.push({ document_type: 'wholesale_licence', label: labels.wholesale_licence, is_required: true } as MerchantDocumentRequirement);
  }
  const alcoholProfile = application.alcohol_onboarding as Record<string, unknown> | null;
  const hasAlcoholOnboarding = application.business_type === 'bar'
    && application.vendor_type === 'retailer'
    && Boolean(alcoholProfile && Object.keys(alcoholProfile).length);
  if (hasAlcoholOnboarding) {
    for (const documentType of [
      'government_id',
      'selfie_photo',
      'shopfront_photo',
      'online_alcohol_licence',
      'business_permit',
      'kra_pin',
      'premises_document',
      'supplier_invoice'
    ]) {
      if (!required.some(item => item.document_type === documentType)) {
        required.push({
          document_type: documentType,
          label: labels[documentType] || documentType,
          is_required: true
        } as MerchantDocumentRequirement);
      }
    }
  }
  const documents = Array.isArray(application.documents) ? application.documents as MerchantApplicationDocument[] : [];
  const missingTypes = new Set(getMissingMerchantDocumentTypes(
    required.map(requirement => requirement.document_type),
    documents
  ));
  const missing = required.filter(requirement => missingTypes.has(requirement.document_type));
  return { database, link, application, missing, documents };
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!isUploadToken(token)) return NextResponse.json({ error: 'A valid document upload link is required.' }, { status: 400 });
  const context = await getUploadContext(token);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.missing.length) {
    const { error: completionError } = await context.database.from('merchant_applications')
      .update({ documents_deferred: false, documents_due_at: null })
      .eq('id', context.application.id);
    if (completionError) {
      console.error('[MerchantDocumentUpload] Could not sync completed document status:', completionError);
      return NextResponse.json({ error: 'Document status could not be refreshed. Contact support.' }, { status: 503 });
    }
    const { error: revokeError } = await context.database.from('merchant_document_upload_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', context.link.id);
    if (revokeError) {
      console.error('[MerchantDocumentUpload] Could not revoke completed upload link:', revokeError);
      return NextResponse.json({ error: 'Your documents are complete, but this secure link could not be closed. Contact support.' }, { status: 503 });
    }
    return NextResponse.json({ success: true, complete: true });
  }
  return NextResponse.json({
    businessName: context.application.business_name,
    requirements: context.missing.map(requirement => ({
      type: requirement.document_type,
      label: requirement.label || labels[requirement.document_type] || requirement.document_type,
      requiresExpiry: ['liquor_licence', 'online_alcohol_licence', 'wholesale_licence'].includes(requirement.document_type)
    })),
    expiresAt: context.link.expires_at,
    documentsDueAt: context.application.documents_due_at
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxTotalSize + 128_000) {
    return NextResponse.json({ error: 'Documents exceed the 15 MB total upload limit.' }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'A valid document upload is required.' }, { status: 400 });
  }
  const tokenValue = form.get('token');
  if (typeof tokenValue !== 'string' || !isUploadToken(tokenValue)) {
    return NextResponse.json({ error: 'A valid document upload link is required.' }, { status: 400 });
  }
  const context = await getUploadContext(tokenValue);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.missing.length) {
    const { error: completionError } = await context.database.from('merchant_applications')
      .update({ documents_deferred: false, documents_due_at: null })
      .eq('id', context.application.id);
    if (completionError) {
      console.error('[MerchantDocumentUpload] Could not sync completed document status:', completionError);
      return NextResponse.json({ error: 'Document status could not be refreshed. Contact support.' }, { status: 503 });
    }
    const { error: revokeError } = await context.database.from('merchant_document_upload_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', context.link.id);
    if (revokeError) {
      console.error('[MerchantDocumentUpload] Could not revoke completed upload link:', revokeError);
      return NextResponse.json({ error: 'Your documents are complete, but this secure link could not be closed. Contact support.' }, { status: 503 });
    }
    return NextResponse.json({ success: true, complete: true });
  }

  const missingTypes = new Set(context.missing.map(requirement => requirement.document_type));
  const fileEntries: Array<{ type: string; file: File; expiresAt: string | null }> = [];
  let totalSize = 0;
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('document:') || !(value instanceof File) || value.size === 0) continue;
    const type = key.slice('document:'.length);
    if (!allowedTypes.has(type) || !missingTypes.has(type) || fileEntries.some(entry => entry.type === type)) {
      return NextResponse.json({ error: 'Upload one file only for each currently required document.' }, { status: 400 });
    }
    if (value.size > maxFileSize || !['application/pdf', 'image/jpeg', 'image/png'].includes(value.type)) {
      return NextResponse.json({ error: 'Documents must be PDF, JPG, or PNG files no larger than 5 MB each.' }, { status: 400 });
    }
    if ((type === 'selfie_photo' || type === 'shopfront_photo') && !['image/jpeg', 'image/png'].includes(value.type)) {
      return NextResponse.json({ error: 'Selfie and shopfront photos must be JPEG or PNG images.' }, { status: 400 });
    }
    const signature = new Uint8Array(await value.slice(0, 8).arrayBuffer());
    const validSignature = value.type === 'application/pdf'
      ? signature[0] === 0x25 && signature[1] === 0x50 && signature[2] === 0x44 && signature[3] === 0x46
      : value.type === 'image/png'
        ? signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47
        : signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
    if (!validSignature) return NextResponse.json({ error: 'A document file does not match its declared file format.' }, { status: 400 });
    totalSize += value.size;
    if (totalSize > maxTotalSize) return NextResponse.json({ error: 'Documents exceed the 15 MB total upload limit.' }, { status: 413 });
    const expiresAt = form.get(`expiry:${type}`);
    const expiry = typeof expiresAt === 'string' && expiresAt ? expiresAt : null;
    if (['liquor_licence', 'online_alcohol_licence', 'wholesale_licence'].includes(type)) {
      const expiryDate = expiry ? new Date(`${expiry}T00:00:00.000Z`) : null;
      if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry) || !expiryDate
        || !Number.isFinite(expiryDate.getTime()) || expiryDate.toISOString().slice(0, 10) !== expiry
        || expiry < new Date().toISOString().slice(0, 10)) {
        return NextResponse.json({ error: 'Alcohol licence documents must include a valid current expiry date.' }, { status: 400 });
      }
    }
    fileEntries.push({ type, file: value, expiresAt: expiry });
  }
  if (!fileEntries.length) return NextResponse.json({ error: 'Choose at least one required document to upload.' }, { status: 400 });

  const uploadedPaths: string[] = [];
  let documentsAttached = false;
  try {
    const documents: MerchantApplicationDocument[] = [];
    for (const entry of fileEntries) {
      const documentId = crypto.randomUUID();
      const objectPath = `${context.application.id}/${documentId}.${extensionFor(entry.file.type)}`;
      const { error } = await context.database.storage.from(bucket).upload(objectPath, entry.file, {
        contentType: entry.file.type,
        cacheControl: '0',
        upsert: false
      });
      if (error) throw new Error(`Could not securely store ${entry.type}: ${error.message}`);
      uploadedPaths.push(objectPath);
      documents.push({
        id: documentId,
        type: entry.type,
        name: entry.file.name.replace(/[^\w.\- ()]/g, '_').slice(0, 160),
        contentType: entry.file.type,
        objectPath,
        uploadedAt: new Date().toISOString(),
        expiresAt: entry.expiresAt
      });
    }

    const { error: appendError } = await context.database.rpc('append_merchant_application_documents', {
      p_application_id: context.application.id,
      p_documents: documents
    });
    if (appendError) throw new Error(`Could not attach the documents to the application: ${appendError.message}`);
    documentsAttached = true;

    const remaining = context.missing.filter(requirement =>
      !documents.some(document => document.type === requirement.document_type)
    );
    const { error: deferredError } = await context.database.from('merchant_applications')
      .update({
        documents_deferred: remaining.length > 0,
        documents_due_at: remaining.length > 0 ? context.application.documents_due_at : null
      })
      .eq('id', context.application.id);
    if (deferredError) throw new Error(`Documents were uploaded, but completion status could not be updated: ${deferredError.message}`);
    if (!remaining.length) {
      const { error: revokeError } = await context.database.from('merchant_document_upload_links')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', context.link.id);
      if (revokeError) {
        console.error('[MerchantDocumentUpload] Documents saved, but completed link could not be revoked:', revokeError);
        return NextResponse.json({ error: 'Documents were saved, but the completed upload link could not be closed. Contact support.' }, { status: 503 });
      }
    }
    return NextResponse.json({ success: true, complete: !remaining.length, remainingCount: remaining.length });
  } catch (error) {
    if (uploadedPaths.length && !documentsAttached) {
      const { error: cleanupError } = await context.database.storage.from(bucket).remove(uploadedPaths);
      if (cleanupError) console.error('[MerchantDocumentUpload] Could not clean up uncommitted uploads:', cleanupError);
    }
    console.error('[MerchantDocumentUpload] Could not save documents:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Documents could not be saved.' }, { status: 503 });
  }
}
