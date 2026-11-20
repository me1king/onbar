import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { InvalidImageUploadError, normalizeImageToAvif } from '@/lib/imageStorage.server';

export const dynamic = 'force-dynamic';

const BUCKET = 'onlinebar-assets';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

function getStoredBiteImagePath(imageUrl: string | null, projectUrl: string) {
    const publicBucketUrl = `${projectUrl.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/`;
    if (!imageUrl?.startsWith(publicBucketUrl)) return null;
    const path = imageUrl.slice(publicBucketUrl.length).split(/[?#]/, 1)[0];
    return /^bites\/[0-9a-f-]+\.avif$/i.test(path) ? path : null;
}

async function getAuthorizedDatabase() {
    const store = await cookies();
    const session = await verifySessionCookie(store.get('admin_session')?.value);
    if (!session || (
        !['owner', 'admin'].includes(session.role)
        && session.permissions?.can_manage_inventory !== true
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
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!projectUrl) return NextResponse.json({ error: 'Food image storage is not configured on the server.' }, { status: 500 });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image file to upload.' }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Choose a JPEG, PNG, WebP, or AVIF image.' }, { status: 400 });
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'Image must be greater than 0 bytes and no larger than 8 MB.' }, { status: 400 });

    const productIdValue = form.get('product_id');
    let productId: number | null = null;
    let previousImageUrl: string | null = null;
    if (productIdValue !== null) {
        productId = Number(productIdValue);
        if (!Number.isSafeInteger(productId) || productId < 1) {
            return NextResponse.json({ error: 'A valid food product ID is required.' }, { status: 400 });
        }

        const { data: currentProduct, error: productError } = await database
            .from('products')
            .select('id, image_url')
            .eq('id', productId)
            .maybeSingle();
        if (productError) {
            console.error('[FoodImage] Could not load the food product:', productError);
            return NextResponse.json({ error: 'The food product could not be loaded.' }, { status: 500 });
        }
        if (!currentProduct) return NextResponse.json({ error: 'Food product not found.' }, { status: 404 });
        previousImageUrl = typeof currentProduct.image_url === 'string' ? currentProduct.image_url : null;
    }

    let imageBytes: Buffer;
    try {
        imageBytes = await normalizeImageToAvif(Buffer.from(await file.arrayBuffer()), file.type);
    } catch (error) {
        if (error instanceof InvalidImageUploadError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error('[FoodImage] Could not convert food photo to AVIF:', error);
        return NextResponse.json({ error: 'The food image could not be converted to AVIF.' }, { status: 500 });
    }

    const path = `bites/${crypto.randomUUID()}.avif`;
    const { error } = await database.storage.from(BUCKET).upload(path, imageBytes, {
        contentType: 'image/avif',
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

    const imageUrl = database.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    let product: Record<string, unknown> | null = null;
    if (productId !== null) {
        const { data: updatedProduct, error: updateError } = await database
            .from('products')
            .update({ image_url: imageUrl })
            .eq('id', productId)
            .select('*')
            .maybeSingle();
        if (updateError || !updatedProduct) {
            const { error: cleanupError } = await database.storage.from(BUCKET).remove([path]);
            if (cleanupError) console.error('[FoodImage] Could not clean up an unlinked food photo:', cleanupError);
            if (updateError) {
                console.error('[FoodImage] Could not save the food product photo:', updateError);
            }
            return NextResponse.json({
                error: updateError ? 'The food photo uploaded but could not be attached to the product.' : 'Food product not found.'
            }, { status: updateError ? 500 : 404 });
        }
        product = updatedProduct;

        const previousPath = getStoredBiteImagePath(previousImageUrl, projectUrl);
        if (previousPath && previousPath !== path) {
            const { error: cleanupError } = await database.storage.from(BUCKET).remove([previousPath]);
            if (cleanupError) console.error('[FoodImage] Could not remove the replaced food photo:', cleanupError);
        }
    }

    return NextResponse.json({ path, image_url: imageUrl, ...(product ? { product } : {}) });
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
    if (typeof body.path !== 'string' || !/^bites\/[0-9a-f-]+\.(jpg|jpeg|png|webp|avif)$/i.test(body.path)) {
        return NextResponse.json({ error: 'A valid food image path is required.' }, { status: 400 });
    }

    const { error } = await database.storage.from(BUCKET).remove([body.path]);
    if (error) {
        console.error('[FoodImage] Could not clean up unlinked food photo:', error);
        return NextResponse.json({ error: `Could not remove the unlinked food photo: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
