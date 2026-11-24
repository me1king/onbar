import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bucket = 'merchant-application-documents';
const maxFileSize = 5 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);

function getClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) return null;
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  return {
    auth: createClient(url, publicKey, options),
    database: createClient(url, serviceKey, options)
  };
}

function validFutureDate(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
  return value >= parts ? value : null;
}

async function fileMatchesType(file: File) {
  if (!allowedTypes.has(file.type) || file.size <= 0 || file.size > maxFileSize) return false;
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (file.type === 'application/pdf') return String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
  if (file.type === 'image/png') {
    return bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function extensionFor(type: string) {
  return type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg';
}

export async function POST(request: Request) {
  const clients = getClients();
  if (!clients) return NextResponse.json({ error: 'Merchant document renewal is not configured on the server.' }, { status: 503 });
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'Sign in to your merchant account to submit documents.' }, { status: 401 });

  const { data: authData, error: authError } = await clients.auth.auth.getUser(token);
  const user = authData.user;
  const email = user?.email && (user.email_confirmed_at || user.confirmed_at)
    ? user.email.trim().toLowerCase()
    : null;
  if (authError || !user || (!email && !user.phone_confirmed_at)) {
    return NextResponse.json({ error: 'Sign in with a verified merchant account.' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Submit a valid merchant document renewal.' }, { status: 400 });
  }
  const applicationId = form.get('applicationId');
  const documentType = form.get('documentType');
  const expiryDate = validFutureDate(form.get('expiresAt'));
  const uploaded = form.get('document');
  const file = uploaded instanceof File ? uploaded : null;
  if (typeof applicationId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)
    || typeof documentType !== 'string' || !documentType.trim()
    || !expiryDate || !file) {
    return NextResponse.json({ error: 'Choose a business, document type, valid future expiry date, and file.' }, { status: 400 });
  }
  if (!await fileMatchesType(file)) {
    return NextResponse.json({ error: 'Upload a valid JPG, PNG, or PDF no larger than 5 MB.' }, { status: 400 });
  }

  let applicationQuery = clients.database.from('merchant_applications')
    .select('id,status,email,account_user_id,documents')
    .eq('id', applicationId)
    .eq('account_user_id', user.id);
  let { data: application, error: applicationError } = await applicationQuery.maybeSingle();
  if (!application && email) {
    const byEmail = await clients.database.from('merchant_applications')
      .select('id,status,email,account_user_id,documents')
      .eq('id', applicationId)
      .eq('email', email)
      .maybeSingle();
    application = byEmail.data;
    applicationError = byEmail.error;
  }
  if (applicationError) {
    console.error('[MerchantDocumentRenewal] Could not verify business ownership:', applicationError);
    return NextResponse.json({ error: 'Your business access could not be verified.' }, { status: 503 });
  }
  if (!application) return NextResponse.json({ error: 'That business is not linked to your verified account.' }, { status: 404 });
  if (application.status !== 'approved') {
    return NextResponse.json({ error: 'Only approved businesses can submit document renewals here.' }, { status: 403 });
  }

  const currentDocuments = Array.isArray(application.documents)
    ? application.documents as Array<Record<string, unknown>>
    : [];
  const currentDocument = currentDocuments.find(document =>
    document.type === documentType && typeof document.expiresAt === 'string'
  );
  if (!currentDocument) {
    return NextResponse.json({ error: 'That document type is not on this business record with an expiry date.' }, { status: 400 });
  }

  const objectPath = `${applicationId}/${randomUUID()}-${documentType}.${extensionFor(file.type)}`;
  const { error: uploadError } = await clients.database.storage.from(bucket).upload(objectPath, file, {
    contentType: file.type,
    upsert: false
  });
  if (uploadError) {
    console.error('[MerchantDocumentRenewal] Could not upload replacement document:', uploadError);
    return NextResponse.json({ error: 'The replacement document could not be uploaded.' }, { status: 503 });
  }

  const replacement = {
    id: randomUUID(),
    type: documentType,
    name: file.name.slice(0, 160),
    contentType: file.type,
    objectPath,
    uploadedAt: new Date().toISOString(),
    expiresAt: expiryDate
  };
  const { error: saveError } = await clients.database.rpc('append_merchant_application_documents', {
    p_application_id: applicationId,
    p_documents: [replacement]
  });
  if (saveError) {
    console.error('[MerchantDocumentRenewal] Upload succeeded but the document record could not be saved:', saveError);
    const { error: cleanupError } = await clients.database.storage.from(bucket).remove([objectPath]);
    if (cleanupError) console.error('[MerchantDocumentRenewal] Could not clean up the unsaved upload:', cleanupError);
    return NextResponse.json({
      error: /append_merchant_application_documents|schema cache/i.test(saveError.message)
        ? 'Document renewal is not installed. Apply the merchant onboarding experience migration.'
        : 'The replacement document record could not be saved.'
    }, { status: 503 });
  }

  return NextResponse.json({
    submitted: true,
    message: 'The replacement was submitted. Business availability remains subject to current licence checks.'
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
