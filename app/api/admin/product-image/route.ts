import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const BUCKET = 'onlinebar-assets';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
};

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

export async function POST(request: Request) {
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
    const extension = EXTENSIONS[file.type];
    if (!extension) return NextResponse.json({ error: 'Only JPG, PNG, or WebP images are supported.' }, { status: 400 });
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: 'Image must be greater than 0 bytes and no larger than 8 MB.' }, { status: 400 });
    }

    const path = `products/${crypto.randomUUID()}.${extension}`;
    const { error } = await access.database.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false
    });
    if (error) {
        console.error('[ProductImage] Could not upload product photo:', error);
        const missingBucket = error.message.toLowerCase().includes('bucket not found');
        return NextResponse.json({
            error: missingBucket
                ? `The ${BUCKET} Storage bucket is missing. Run supabase/FINAL_ESTABLISHMENT_SQL.sql in Supabase.`
                : `Product image upload failed: ${error.message}`
        }, { status: 500 });
    }

    return NextResponse.json({
        path,
        image_url: access.database.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    });
}

export async function DELETE(request: Request) {
    const access = await getAuthorizedDatabase();
    if ('response' in access) return access.response;

    let body: { path?: unknown };
    try {
        body = await request.json() as typeof body;
    } catch {
        return NextResponse.json({ error: 'A valid product image path is required.' }, { status: 400 });
    }
    if (typeof body.path !== 'string' || !/^products\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(body.path)) {
        return NextResponse.json({ error: 'A valid product image path is required.' }, { status: 400 });
    }

    const { error } = await access.database.storage.from(BUCKET).remove([body.path]);
    if (error) {
        console.error('[ProductImage] Could not remove unlinked product photo:', error);
        return NextResponse.json({ error: `Could not remove the unlinked product photo: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
