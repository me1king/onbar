import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const BUCKET = 'onlinebar-assets';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function getAuthorizedDatabase() {
    const store = await cookies();
    const session = await verifySessionCookie(store.get('admin_session')?.value);
    if (!session || (
        !['owner', 'admin'].includes(session.role)
        && session.permissions?.can_manage_marketing !== true
    )) return null;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Food image storage is not configured on the server.');
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
    let database;
    try {
        database = await getAuthorizedDatabase();
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Food image storage is not configured.' }, { status: 500 });
    }
    if (!database) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image file to upload.' }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Only JPG, PNG, or WebP images are supported.' }, { status: 400 });
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'Image must be greater than 0 bytes and no larger than 8 MB.' }, { status: 400 });

    const extensionByType: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
    };
    const path = `bites/${crypto.randomUUID()}.${extensionByType[file.type]}`;
    const { error } = await database.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false
    });
    if (error) {
        console.error('[FoodImage] Could not upload food photo:', error);
        const missingBucket = error.message.toLowerCase().includes('bucket not found');
        return NextResponse.json({
            error: missingBucket
                ? 'The onlinebar-assets Storage bucket is missing. Run supabase/FOOD_ADDONS_MIGRATION.sql in Supabase.'
                : `Photo upload failed: ${error.message}`
        }, { status: 500 });
    }

    return NextResponse.json({
        path,
        image_url: database.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    });
}

export async function DELETE(request: Request) {
    let database;
    try {
        database = await getAuthorizedDatabase();
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Food image storage is not configured.' }, { status: 500 });
    }
    if (!database) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });

    let body: { path?: unknown };
    try {
        body = await request.json() as typeof body;
    } catch {
        return NextResponse.json({ error: 'A valid food image path is required.' }, { status: 400 });
    }
    if (typeof body.path !== 'string' || !/^bites\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(body.path)) {
        return NextResponse.json({ error: 'A valid food image path is required.' }, { status: 400 });
    }

    const { error } = await database.storage.from(BUCKET).remove([body.path]);
    if (error) {
        console.error('[FoodImage] Could not clean up unlinked food photo:', error);
        return NextResponse.json({ error: `Could not remove the unlinked food photo: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
