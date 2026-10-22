import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { InvalidImageUploadError, normalizeImageToAvif } from '@/lib/imageStorage.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUCKET = 'onlinebar-assets';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

type AuthorizedDatabase = { database: SupabaseClient } | { response: NextResponse };

async function getAuthorizedDatabase(): Promise<AuthorizedDatabase> {
    const cookieStore = await cookies();
    const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
    if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
    if (!['owner', 'admin'].includes(session.role) && session.permissions.can_manage_inventory !== true) {
        return { response: NextResponse.json({ error: 'Inventory management access required.' }, { status: 403 }) };
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        return { response: NextResponse.json({ error: 'Product image storage is not configured on the server.' }, { status: 500 }) };
    }

    return {
        database: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    };
}

async function uploadProductImage(request: Request) {
    const access = await getAuthorizedDatabase();
    if ('response' in access) return access.response;

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return NextResponse.json({ error: 'Choose an image file to upload.' }, { status: 400 });
    }

    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image file to upload.' }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Choose a JPEG, PNG, WebP, or AVIF image.' }, { status: 400 });
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
        console.error('[ProductImage] Could not convert product photo to AVIF:', error);
        return NextResponse.json({ error: 'The product image could not be converted to AVIF.' }, { status: 500 });
    }

    const path = `products/${crypto.randomUUID()}.avif`;
    const { error } = await access.database.storage.from(BUCKET).upload(path, imageBytes, {
        contentType: 'image/avif',
        upsert: false
    });
    if (error) {
        console.error('[ProductImage] Could not upload product photo:', error);
        const missingBucket = error.message.toLowerCase().includes('bucket not found');
        return NextResponse.json({
            error: missingBucket
                ? `The ${BUCKET} Storage bucket is missing. Run supabase/FINAL_ESTABLISHMENT_SQL.sql in Supabase.`
                : 'Product image storage is temporarily unavailable. Please try again.'
        }, { status: 503 });
    }

    return NextResponse.json({
        path,
        image_url: access.database.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    });
}

export async function POST(request: Request) {
    try {
        return await uploadProductImage(request);
    } catch (error) {
        console.error('[ProductImage] Unexpected product image upload failure:', error);
        return NextResponse.json({ error: 'Product image upload could not be completed. Please try again.' }, { status: 500 });
    }
}

async function deleteProductImage(request: Request) {
    const access = await getAuthorizedDatabase();
    if ('response' in access) return access.response;

    let body: { path?: unknown };
    try {
        body = await request.json() as typeof body;
    } catch {
        return NextResponse.json({ error: 'A valid product image path is required.' }, { status: 400 });
    }
    if (typeof body.path !== 'string' || !/^products\/[0-9a-f-]+\.(jpg|jpeg|png|webp|avif)$/i.test(body.path)) {
        return NextResponse.json({ error: 'A valid product image path is required.' }, { status: 400 });
    }

    const { error } = await access.database.storage.from(BUCKET).remove([body.path]);
    if (error) {
        console.error('[ProductImage] Could not remove unlinked product photo:', error);
        return NextResponse.json({ error: `Could not remove the unlinked product photo: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
    try {
        return await deleteProductImage(request);
    } catch (error) {
        console.error('[ProductImage] Unexpected product image cleanup failure:', error);
        return NextResponse.json({ error: 'The unlinked product image could not be removed. Please try again.' }, { status: 500 });
    }
}
