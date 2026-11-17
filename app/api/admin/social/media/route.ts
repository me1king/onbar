import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { InvalidImageUploadError, normalizeImageToAvif } from '@/lib/imageStorage.server';

export const dynamic = 'force-dynamic';

const BUCKET = 'onlinebar-assets';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

async function getAuthorizedAccess() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!hasAdminPermission(session, 'can_manage_marketing')) {
    return { response: NextResponse.json({ error: 'Marketing permission is required.' }, { status: 403 }) };
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return { response: NextResponse.json({ error: 'Social image storage is not configured on the server.' }, { status: 503 }) };
  }
  return { database };
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  const access = await getAuthorizedAccess();
  if ('response' in access) return access.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Choose a supported image to upload.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image file to upload.' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Choose a JPEG, PNG, WebP, or AVIF image.' }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image must be greater than 0 bytes and no larger than 8 MB.' }, { status: 400 });
  }

  let imageBytes: Buffer;
  try {
    imageBytes = await normalizeImageToAvif(Buffer.from(await file.arrayBuffer()), file.type);
  } catch (error) {
    if (error instanceof InvalidImageUploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[SocialMedia] Could not process image:', error);
    return NextResponse.json({ error: 'The image could not be prepared for Instagram.' }, { status: 500 });
  }

  const path = `social-campaigns/${randomUUID()}.avif`;
  const { error } = await access.database.storage.from(BUCKET).upload(path, imageBytes, {
    contentType: 'image/avif',
    upsert: false
  });
  if (error) {
    console.error('[SocialMedia] Could not upload image:', error);
    const missingBucket = error.message.toLowerCase().includes('bucket not found');
    return NextResponse.json({
      error: missingBucket
        ? 'The onlinebar-assets storage bucket is missing. Run supabase/FOOD_ADDONS_MIGRATION.sql in Supabase.'
        : 'Could not upload the social image.'
    }, { status: 503 });
  }

  return NextResponse.json({
    path,
    imageUrl: access.database.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  const access = await getAuthorizedAccess();
  if ('response' in access) return access.response;

  let body: { path?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid social image path is required.' }, { status: 400 });
  }
  if (typeof body.path !== 'string' || !/^social-campaigns\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.avif$/i.test(body.path)) {
    return NextResponse.json({ error: 'A valid social image path is required.' }, { status: 400 });
  }

  const { error } = await access.database.storage.from(BUCKET).remove([body.path]);
  if (error) {
    console.error('[SocialMedia] Could not remove social image:', error);
    return NextResponse.json({ error: 'Could not remove the social image from storage.' }, { status: 503 });
  }
  return NextResponse.json({ success: true });
}
