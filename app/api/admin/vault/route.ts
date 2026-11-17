import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const BUCKET = 'admin-vault';
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const FILE_TYPES = new Set(['Invoice', 'Receipt', 'Report', 'Contract']);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/octet-stream'
]);

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function getAuthorizedAccess() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!hasAdminPermission(session, 'can_view_sensitive_data')) {
    return { response: NextResponse.json({ error: 'Sensitive-data permission is required to access the document vault.' }, { status: 403 }) };
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return { response: NextResponse.json({ error: 'Vault server access is not configured. Set the Supabase service-role key on the server.' }, { status: 503 }) };
  }

  return { database, session };
}

function getFileMetadata(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const type = typeof body.type === 'string' ? body.type : '';
  const contentType = typeof body.contentType === 'string' ? body.contentType.toLowerCase() : '';
  const sizeBytes = Number(body.sizeBytes);
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase();

  if (
    !name || name.length > 180 ||
    !FILE_TYPES.has(type) ||
    !ALLOWED_EXTENSIONS.has(extension) ||
    !ALLOWED_CONTENT_TYPES.has(contentType) ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 1 || sizeBytes > MAX_FILE_SIZE
  ) return null;

  const safeName = name.normalize('NFKC').replace(/[^A-Za-z0-9._-]/g, '_').slice(-180);
  if (!safeName || safeName === '.' || safeName === '..') return null;

  return { name, type, contentType, sizeBytes, safeName };
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const access = await getAuthorizedAccess();
  if ('response' in access) return access.response;

  const documentId = new URL(request.url).searchParams.get('download');
  if (documentId) {
    const { data: document, error: documentError } = await access.database
      .from('admin_vault')
      .select('name, storage_path')
      .eq('id', documentId)
      .maybeSingle();
    if (documentError) {
      console.error('[DocumentVault] Could not load the requested document:', documentError);
      return NextResponse.json({ error: 'Could not load this document. Confirm the vault migration is installed.' }, { status: 503 });
    }
    if (!document?.storage_path) return NextResponse.json({ error: 'Document was not found in the vault.' }, { status: 404 });

    const { data, error } = await access.database.storage
      .from(BUCKET)
      .createSignedUrl(document.storage_path, 60, { download: document.name });
    if (error || !data?.signedUrl) {
      console.error('[DocumentVault] Could not create a download link:', error);
      return NextResponse.json({ error: 'Could not prepare a secure download. Check the private vault storage bucket.' }, { status: 503 });
    }
    return NextResponse.json({ url: data.signedUrl }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  }

  const { data, error } = await access.database
    .from('admin_vault')
    .select('id, name, type, size, size_bytes, created_at, authorized_by, storage_path')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) {
    console.error('[DocumentVault] Could not load documents:', error);
    return NextResponse.json({ error: 'Could not load vault data. Apply ADMIN_VAULT_MIGRATION.sql and verify server Supabase credentials.' }, { status: 503 });
  }

  const documents = (data || []).map(document => {
    const sizeBytes = Number(document.size_bytes) || 0;
    return {
      ...document,
      id: String(document.id),
      size: document.size || formatSize(sizeBytes)
    };
  });
  const totalSizeBytes = documents.reduce((sum, document) => sum + (Number(document.size_bytes) || 0), 0);

  return NextResponse.json({
    documents,
    metrics: { total_files: documents.length, total_size_mb: totalSizeBytes / 1024 / 1024 }
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  const access = await getAuthorizedAccess();
  if ('response' in access) return access.response;
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: 'Send valid vault document details.' }, { status: 400 });

  const metadata = getFileMetadata(body);
  if (!metadata) {
    return NextResponse.json({ error: 'Use a supported document format under 25 MB.' }, { status: 400 });
  }

  if (body.action === 'create-upload') {
    const storagePath = `docs/${randomUUID()}-${metadata.safeName}`;
    const { data, error } = await access.database.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });
    if (error || !data?.token) {
      console.error('[DocumentVault] Could not create a secure upload link:', error);
      return NextResponse.json({ error: 'Could not prepare a secure upload. Confirm the private vault storage bucket is installed.' }, { status: 503 });
    }
    return NextResponse.json({ path: storagePath, token: data.token }, { status: 201 });
  }

  if (body.action !== 'complete-upload' || typeof body.path !== 'string') {
    return NextResponse.json({ error: 'Unsupported vault operation.' }, { status: 400 });
  }
  const storagePath = body.path;
  const expectedPath = new RegExp(`^docs/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-${metadata.safeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  if (!expectedPath.test(storagePath)) return NextResponse.json({ error: 'Upload path is invalid or expired.' }, { status: 400 });

  const { data: fileInfo, error: infoError } = await access.database.storage.from(BUCKET).info(storagePath);
  if (infoError || !fileInfo) {
    console.error('[DocumentVault] Uploaded object could not be verified:', infoError);
    const { error: cleanupError } = await access.database.storage.from(BUCKET).remove([storagePath]);
    if (cleanupError) console.error('[DocumentVault] Could not remove an unverified upload:', cleanupError);
    return NextResponse.json({ error: 'Uploaded document could not be verified in private storage.' }, { status: 400 });
  }
  const storedSize = Number(fileInfo.metadata?.size);
  if ((Number.isFinite(storedSize) && storedSize > 0 && storedSize !== metadata.sizeBytes) || metadata.sizeBytes > MAX_FILE_SIZE) {
    const { error: cleanupError } = await access.database.storage.from(BUCKET).remove([storagePath]);
    if (cleanupError) console.error('[DocumentVault] Could not remove an upload with invalid size:', cleanupError);
    return NextResponse.json({ error: 'Uploaded document size does not match the selected file.' }, { status: 400 });
  }

  const { data: document, error: insertError } = await access.database
    .from('admin_vault')
    .insert({
      name: metadata.name,
      type: metadata.type,
      size: formatSize(metadata.sizeBytes),
      size_bytes: metadata.sizeBytes,
      content_type: metadata.contentType,
      authorized_by: access.session.role,
      storage_path: storagePath
    })
    .select('id, name, type, size, size_bytes, created_at, authorized_by, storage_path')
    .single();

  if (insertError) {
    console.error('[DocumentVault] Could not record uploaded document:', insertError);
    const { error: cleanupError } = await access.database.storage.from(BUCKET).remove([storagePath]);
    if (cleanupError) console.error('[DocumentVault] Could not remove an unrecorded upload:', cleanupError);
    return NextResponse.json({ error: 'Upload completed, but the vault record could not be saved.' }, { status: 500 });
  }

  return NextResponse.json({ document }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  const access = await getAuthorizedAccess();
  if ('response' in access) return access.response;
  const body = await readJsonObject(request);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'A document ID is required.' }, { status: 400 });

  const { data: document, error: lookupError } = await access.database
    .from('admin_vault')
    .select('id, storage_path')
    .eq('id', id)
    .maybeSingle();
  if (lookupError) {
    console.error('[DocumentVault] Could not load document for deletion:', lookupError);
    return NextResponse.json({ error: 'Could not load the document for deletion.' }, { status: 503 });
  }
  if (!document) return NextResponse.json({ error: 'Document was not found in the vault.' }, { status: 404 });

  if (document.storage_path) {
    const { error: storageError } = await access.database.storage.from(BUCKET).remove([document.storage_path]);
    if (storageError) {
      console.error('[DocumentVault] Could not remove document from private storage:', storageError);
      return NextResponse.json({ error: 'Could not delete the stored document; the vault record was kept.' }, { status: 503 });
    }
  }

  const { error: deleteError } = await access.database.from('admin_vault').delete().eq('id', id);
  if (deleteError) {
    console.error('[DocumentVault] Could not delete vault record:', deleteError);
    return NextResponse.json({ error: 'The stored file was removed, but its vault record could not be deleted.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
