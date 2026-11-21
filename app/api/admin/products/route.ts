import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { getSupabaseServerKey } from '@/lib/supabaseServerConfig';

export const dynamic = 'force-dynamic';

type ProductPayload = Record<string, unknown>;
type AuthorizedDatabase = { database: SupabaseClient } | { response: NextResponse };
type ProductSalesRow = {
    quantity: number | null;
    products: { id: number; name: string } | Array<{ id: number; name: string }> | null;
};

async function getAuthorizedDatabase(): Promise<AuthorizedDatabase> {
    const cookieStore = await cookies();
    const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
    if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
    if (!['owner', 'admin'].includes(session.role) && session.permissions.can_manage_inventory !== true) {
        return { response: NextResponse.json({ error: 'Inventory management access required.' }, { status: 403 }) };
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = getSupabaseServerKey();
    if (!url || !key) {
        return { response: NextResponse.json({ error: 'Product database access is not configured on the server.' }, { status: 500 }) };
    }

    return {
        database: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    };
}

function isProductPayload(value: unknown): value is ProductPayload {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateEngravingFields(product: ProductPayload) {
    const hasConfiguration = ['engraving_enabled', 'engraving_fee', 'gift_packaging_fee']
        .some(field => Object.prototype.hasOwnProperty.call(product, field));
    if (!hasConfiguration) return null;
    if (product.engraving_enabled !== undefined && typeof product.engraving_enabled !== 'boolean') {
        return 'Engraving availability must be enabled or disabled.';
    }
    for (const field of ['engraving_fee', 'gift_packaging_fee']) {
        if (product[field] !== undefined
            && (typeof product[field] !== 'number' || !Number.isFinite(product[field]) || product[field] < 0)) {
            return 'Engraving and gift-packaging fees must be valid non-negative amounts.';
        }
    }
    return null;
}

export async function GET(request: Request) {
    const access = await getAuthorizedDatabase();
    if ('response' in access) return access.response;

    if (new URL(request.url).searchParams.get('scope') === 'inventory') {
        const url = new URL(request.url);
        const productId = url.searchParams.get('id');
        if (productId !== null && (!/^\d+$/.test(productId) || Number(productId) < 1 || !Number.isSafeInteger(Number(productId)))) {
            return NextResponse.json({ error: 'A valid product ID is required.' }, { status: 400 });
        }
        let query = access.database.from('products')
            .select('*')
            .order('created_at', { ascending: false });
        if (productId !== null) query = query.eq('id', Number(productId));
        const { data: inventory, error } = await query;
        if (error) {
            console.error('[ProductAdmin] Could not load beverage inventory:', error);
            return NextResponse.json({ error: 'Could not load beverage inventory.' }, { status: 503 });
        }
        return NextResponse.json({ products: inventory || [] }, {
            headers: { 'Cache-Control': 'private, no-store, max-age=0' }
        });
    }

    const { data: products, error: productsError } = await access.database
        .from('products')
        .select('*')
        .or('is_souvenir.eq.true,category.ilike.%souvenir%,category.ilike.%flask%,category.ilike.%shot glass%')
        .order('name');
    if (productsError) {
        console.error('[ProductAdmin] Could not load souvenir products:', productsError);
        return NextResponse.json({ error: `Could not load souvenir products: ${productsError.message}` }, { status: 500 });
    }

    const { count: giftOrdersCount, error: giftOrdersError } = await access.database
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('is_gift', true);
    if (giftOrdersError) console.error('[ProductAdmin] Could not count gift orders:', giftOrdersError);

    const salesRows: ProductSalesRow[] = [];
    let salesReportAvailable = true;
    for (let page = 0; ; page += 1) {
        const { data, error } = await access.database
            .from('order_items')
            .select('quantity, products!inner(id, name, category, is_souvenir), orders!inner(status)')
            .eq('orders.status', 'Delivered')
            .or('is_souvenir.eq.true,category.ilike.%souvenir%,category.ilike.%flask%,category.ilike.%shot glass%', { foreignTable: 'products' })
            .range(page * 500, page * 500 + 499);
        if (error) {
            console.error('[ProductAdmin] Could not load delivered souvenir sales:', error);
            salesReportAvailable = false;
            break;
        }
        salesRows.push(...(data || []) as ProductSalesRow[]);
        if ((data || []).length < 500) break;
    }

    let topSeller: { name: string; quantity: number } | null = null;
    if (salesReportAvailable) {
        const quantitiesByProduct = new Map<number, { name: string; quantity: number }>();
        for (const item of salesRows) {
            const product = Array.isArray(item.products) ? item.products[0] : item.products;
            if (!product?.name) continue;
            const prior = quantitiesByProduct.get(product.id);
            quantitiesByProduct.set(product.id, {
                name: product.name,
                quantity: (prior?.quantity || 0) + Number(item.quantity || 0)
            });
        }
        topSeller = [...quantitiesByProduct.values()].sort((a, b) => b.quantity - a.quantity)[0] || null;
    }

    return NextResponse.json({
        products: products || [],
        giftOrdersCount: giftOrdersError ? null : giftOrdersCount ?? 0,
        topSeller,
        salesReportAvailable
    });
}

async function saveProduct(database: SupabaseClient, id: number | null, product: ProductPayload) {
    const payload = { ...product };
    let variantPricesStoredInSpecs = false;
    if (typeof payload.category === 'string' && /\b(souvenir|souvenirs|merchandise)\b/i.test(payload.category)) {
        payload.is_souvenir = true;
    }

    while (true) {
        const result = id === null
            ? await database.from('products').insert(payload).select('id').single()
            : await database.from('products').update(payload).eq('id', id).select('id').single();

        if (!result.error && result.data) {
            return { id: Number(result.data.id), variantPricesStoredInSpecs };
        }

        const message = result.error?.message || 'Product could not be saved.';
        const missingColumn = message.match(/Could not find the '([^']+)' column of 'products'/i)
            || message.match(/column products\.([a-z_]+) does not exist/i);
        if (missingColumn?.[1] && missingColumn[1] in payload) {
            if (['engraving_enabled', 'engraving_fee', 'gift_packaging_fee'].includes(missingColumn[1])) {
                throw new Error('Engraving settings are not installed yet. Run supabase/ENGRAVING_PRODUCTION_MIGRATION.sql, then retry.');
            }
            if (missingColumn[1] === 'variant_prices') {
                const variantPrices = payload.variant_prices;
                if (typeof variantPrices !== 'object' || variantPrices === null || Array.isArray(variantPrices)) {
                    throw new Error('Size prices could not be saved because their value is invalid.');
                }

                let existingSpecs: Record<string, unknown> = {};
                if (id !== null) {
                    const existing = await database.from('products')
                        .select('beverage_specs')
                        .eq('id', id)
                        .maybeSingle();
                    if (existing.error) {
                        console.error('[ProductAdmin] Could not preserve existing beverage specifications while saving size prices:', existing.error);
                        throw new Error('Size prices could not be saved because this database does not expose the product specifications field.');
                    }
                    if (existing.data?.beverage_specs && typeof existing.data.beverage_specs === 'object' && !Array.isArray(existing.data.beverage_specs)) {
                        existingSpecs = existing.data.beverage_specs as Record<string, unknown>;
                    }
                }
                const suppliedSpecs = payload.beverage_specs;
                payload.beverage_specs = {
                    ...existingSpecs,
                    ...(typeof suppliedSpecs === 'object' && suppliedSpecs !== null && !Array.isArray(suppliedSpecs)
                        ? suppliedSpecs as Record<string, unknown>
                        : {}),
                    variant_prices: variantPrices
                };
                delete payload.variant_prices;
                variantPricesStoredInSpecs = true;
                continue;
            }
            if (missingColumn[1] === 'beverage_specs' && variantPricesStoredInSpecs) {
                throw new Error('This database is missing both supported product-size pricing fields. Apply supabase/PRODUCT_VARIANT_PRICING_MIGRATION.sql, then retry.');
            }
            if (missingColumn[1] === 'pairing_suggestions') {
                throw new Error('Food pairings are not connected to this database yet. Run supabase/PRODUCT_PAIRING_SUGGESTIONS_MIGRATION.sql, then save the product again.');
            }
            console.warn(`[ProductAdmin] Ignoring unavailable products column "${missingColumn[1]}" and retrying.`);
            delete payload[missingColumn[1]];
            continue;
        }
        throw new Error(message);
    }
}

async function synchronizeSingleVariantStock(database: SupabaseClient, id: number | null, product: ProductPayload) {
    if (!Object.prototype.hasOwnProperty.call(product, 'stock')
        || Object.prototype.hasOwnProperty.call(product, 'variant_stock')) return;
    if (typeof product.stock !== 'number' || !Number.isSafeInteger(product.stock) || product.stock < 0) {
        throw new Error('Stock must be a whole number of zero or more.');
    }

    let existingSizes: unknown = null;
    let existingVariantStock: unknown = null;
    let existingSizeLabel: unknown = null;
    if (id !== null) {
        const { data, error } = await database.from('products')
            .select('sizes, size_label, variant_stock')
            .eq('id', id)
            .maybeSingle();
        if (error) {
            console.error('[ProductAdmin] Could not load product variants before synchronizing stock:', error);
            throw new Error('Product variants could not be verified before saving stock.');
        }
        if (!data) throw new Error('Product not found.');
        existingSizes = data.sizes;
        existingVariantStock = data.variant_stock;
        existingSizeLabel = data.size_label;
    }

    const sizesValue = product.sizes ?? existingSizes;
    const sizes = Array.isArray(sizesValue)
        ? sizesValue.filter((size): size is string => typeof size === 'string' && size.trim().length > 0)
        : [];
    if (sizes.length > 1) return;

    const sizeLabel = product.size_label ?? existingSizeLabel;
    const size = sizes[0] || (typeof sizeLabel === 'string' && sizeLabel.trim()) || 'Standard';
    const variantStock = product.variant_stock ?? existingVariantStock;
    product.variant_stock = {
        ...(typeof variantStock === 'object' && variantStock !== null && !Array.isArray(variantStock)
            ? variantStock as Record<string, unknown>
            : {}),
        [size]: Number(product.stock)
    };
}

export async function POST(request: Request) {
    const access = await getAuthorizedDatabase();
    if ('response' in access) return access.response;

    let body: { product?: unknown };
    try {
        body = await request.json() as typeof body;
    } catch {
        return NextResponse.json({ error: 'A valid product payload is required.' }, { status: 400 });
    }
    if (!isProductPayload(body.product) || typeof body.product.name !== 'string' || !body.product.name.trim()) {
        return NextResponse.json({ error: 'A product name and valid product payload are required.' }, { status: 400 });
    }
    const engravingValidationError = validateEngravingFields(body.product);
    if (engravingValidationError) return NextResponse.json({ error: engravingValidationError }, { status: 400 });

    try {
        await synchronizeSingleVariantStock(access.database, null, body.product);
        const result = await saveProduct(access.database, null, body.product);
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        console.error('[ProductAdmin] Could not create product:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Product could not be created.' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    const access = await getAuthorizedDatabase();
    if ('response' in access) return access.response;

    let body: { id?: unknown; product?: unknown };
    try {
        body = await request.json() as typeof body;
    } catch {
        return NextResponse.json({ error: 'A valid product payload is required.' }, { status: 400 });
    }
    if (!Number.isSafeInteger(body.id) || Number(body.id) < 1 || !isProductPayload(body.product)) {
        return NextResponse.json({ error: 'A valid product ID and payload are required.' }, { status: 400 });
    }
    const engravingValidationError = validateEngravingFields(body.product);
    if (engravingValidationError) return NextResponse.json({ error: engravingValidationError }, { status: 400 });

    try {
        await synchronizeSingleVariantStock(access.database, Number(body.id), body.product);
        const result = await saveProduct(access.database, Number(body.id), body.product);
        return NextResponse.json(result);
    } catch (error) {
        console.error('[ProductAdmin] Could not update product:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Product could not be updated.' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const access = await getAuthorizedDatabase();
    if ('response' in access) return access.response;

    let body: { id?: unknown };
    try {
        body = await request.json() as typeof body;
    } catch {
        return NextResponse.json({ error: 'A valid product ID is required.' }, { status: 400 });
    }
    if (!Number.isSafeInteger(body.id) || Number(body.id) < 1) {
        return NextResponse.json({ error: 'A valid product ID is required.' }, { status: 400 });
    }

    const { data, error } = await access.database.from('products').delete().eq('id', Number(body.id)).select('id').maybeSingle();
    if (error) {
        if (error.code === '23503') {
            return NextResponse.json({
                error: 'This product is linked to order history or inventory and cannot be deleted. Hide it or mark it unavailable instead.'
            }, { status: 409 });
        }
        console.error('[ProductAdmin] Could not delete product:', error);
        return NextResponse.json({ error: `Product could not be deleted: ${error.message}` }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    return NextResponse.json({ success: true });
}
