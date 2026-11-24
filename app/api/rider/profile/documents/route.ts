import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bucket = 'rider-verifications';
const maxFileSize = 10 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && serviceKey
    ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

function validDate(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
  return value >= today ? value : null;
}

async function fileMatchesType(file: File) {
  if (!allowedTypes.has(file.type) || file.size <= 0 || file.size > maxFileSize) return false;
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (file.type === 'application/pdf') {
    return String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
  }
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
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Rider document uploads are not configured on the server.' }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Submit a valid document update.' }, { status: 400 });
  }

  const licenseDocument = form.get('licenseDocument');
  const insuranceDocument = form.get('insuranceDocument');
  const licenseFile = licenseDocument instanceof File ? licenseDocument : null;
  const insuranceFile = insuranceDocument instanceof File ? insuranceDocument : null;
  const hasLicense = Boolean(licenseFile);
  const hasInsurance = Boolean(insuranceFile);
  if (!hasLicense && !hasInsurance) {
    return NextResponse.json({ error: 'Choose a new licence or insurance file to upload.' }, { status: 400 });
  }
  const licenseExpiryDate = hasLicense ? validDate(form.get('licenseExpiryDate')) : null;
  const insuranceExpiryDate = hasInsurance ? validDate(form.get('insuranceExpiryDate')) : null;
  if (hasLicense && !licenseExpiryDate) {
    return NextResponse.json({ error: 'Enter a valid future licence expiry date.' }, { status: 400 });
  }
  if (hasInsurance && !insuranceExpiryDate) {
    return NextResponse.json({ error: 'Enter a valid future insurance expiry date.' }, { status: 400 });
  }

  const fileChecks = await Promise.all([
    licenseFile ? fileMatchesType(licenseFile) : Promise.resolve(true),
    insuranceFile ? fileMatchesType(insuranceFile) : Promise.resolve(true)
  ]);
  if (fileChecks.some(valid => !valid)) {
    return NextResponse.json({
      error: 'Each document must be a valid JPG, PNG, or PDF no larger than 10 MB.'
    }, { status: 400 });
  }

  const { data: rider, error: riderError } = await database.from('rider_status')
    .select('verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (riderError) {
    console.error('[RiderDocuments] Could not verify rider account:', riderError);
    return NextResponse.json({ error: 'Rider account could not be verified.' }, { status: 503 });
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only approved riders can submit replacement documents.' }, { status: 403 });
  }

  const { data: current, error: currentError } = await database.from('rider_profile_details')
    .select('license_document_path,insurance_document_path')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (currentError) {
    console.error('[RiderDocuments] Could not load current rider document records:', currentError);
    return NextResponse.json({
      error: /rider_profile_details|schema cache/i.test(currentError.message)
        ? 'Rider document renewal is not installed. Apply supabase/RIDER_DISPATCH_SAFETY_MIGRATION.sql.'
        : 'Current rider document records could not be loaded.'
    }, { status: 503 });
  }

  const uploadedPaths: string[] = [];
  const updates: Record<string, unknown> = {
    rider_phone: session.phone,
    updated_at: new Date().toISOString()
  };
  const upload = async (file: File, type: 'license' | 'insurance') => {
    const path = `riders/${randomUUID()}-${type}.${extensionFor(file.type)}`;
    const { error } = await database.storage.from(bucket).upload(path, file, {
      contentType: file.type,
      upsert: false
    });
    if (error) throw error;
    uploadedPaths.push(path);
    if (type === 'license') {
      updates.license_document_path = path;
      updates.license_document_submitted_at = new Date().toISOString();
      updates.license_document_verified_at = null;
      updates.license_document_verified_by = null;
      updates.license_expiry_date = licenseExpiryDate;
    } else {
      updates.insurance_document_path = path;
      updates.insurance_document_submitted_at = new Date().toISOString();
      updates.insurance_document_verified_at = null;
      updates.insurance_document_verified_by = null;
      updates.insurance_expiry_date = insuranceExpiryDate;
    }
  };

  try {
    if (licenseFile) await upload(licenseFile, 'license');
    if (insuranceFile) await upload(insuranceFile, 'insurance');
  } catch (uploadError) {
    console.error('[RiderDocuments] Could not upload replacement document:', uploadError);
    if (uploadedPaths.length) {
      const { error: cleanupError } = await database.storage.from(bucket).remove(uploadedPaths);
      if (cleanupError) console.error('[RiderDocuments] Could not clean up incomplete document upload:', cleanupError);
    }
    return NextResponse.json({ error: 'A replacement document could not be uploaded. Try again.' }, { status: 503 });
  }

  const { error: saveError } = await database.from('rider_profile_details')
    .upsert(updates, { onConflict: 'rider_phone' });
  if (saveError) {
    console.error('[RiderDocuments] Could not save replacement document record:', saveError);
    const { error: cleanupError } = await database.storage.from(bucket).remove(uploadedPaths);
    if (cleanupError) console.error('[RiderDocuments] Could not clean up unsaved document upload:', cleanupError);
    return NextResponse.json({ error: 'The uploaded document record could not be saved.' }, { status: 503 });
  }

  const oldPaths = [
    hasLicense ? current?.license_document_path : null,
    hasInsurance ? current?.insurance_document_path : null
  ].filter((path): path is string => typeof path === 'string' && path.startsWith('riders/'));
  if (oldPaths.length) {
    const { error: cleanupError } = await database.storage.from(bucket).remove(oldPaths);
    if (cleanupError) console.error('[RiderDocuments] Replacement was saved but the old file could not be removed:', cleanupError);
  }

  const changedFields = [
    ...(hasLicense ? ['license_document_submitted', 'license_expiry_date'] : []),
    ...(hasInsurance ? ['insurance_document_submitted', 'insurance_expiry_date'] : [])
  ];
  const { error: auditError } = await database.from('rider_profile_audit_events').insert({
    rider_phone: session.phone,
    actor_type: 'rider',
    actor: session.phone,
    changed_fields: changedFields
  });
  if (auditError) {
    console.error('[RiderDocuments] Documents saved but the audit event could not be recorded:', auditError);
    return NextResponse.json({
      saved: true,
      warning: 'Documents were submitted, but the audit entry could not be recorded.'
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ saved: true }, { headers: { 'Cache-Control': 'no-store' } });
}
